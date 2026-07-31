import {LanguageModelSession, LanguageModelSessionError} from '../ai/LanguageModelSession';
import {PageContextError} from '../context/DomPageContextProvider';
import type {PageContext, PageContextProvider} from '../context/PageContextProvider';
import {SafeResponseRenderer} from '../rendering/SafeResponseRenderer';
import type {Availability, LanguageModelAdapter, ModelOptions} from '../types';

export type UiState =
    | 'checking'
    | 'downloadable'
    | 'downloading'
    | 'ready'
    | 'streaming'
    | 'reset-required'
    | 'error-retryable'
    | 'unavailable';

export interface ChatControllerOptions extends ModelOptions {
    contextSelector: string;
    contextUsageLimit: number;
    supplementalInstruction: string;
}

interface Elements {
    assistant: HTMLElement;
    fallback: HTMLElement;
    status: HTMLElement;
    setup: HTMLButtonElement;
    progress: HTMLProgressElement;
    log: HTMLElement;
    form: HTMLFormElement;
    question: HTMLInputElement;
    submit: HTMLButtonElement;
    abort: HTMLButtonElement;
    reset: HTMLButtonElement;
    retry: HTMLButtonElement;
}

const statusMessages: Record<UiState, string> = {
    checking: 'Checking browser AI availability…',
    downloadable: 'Browser AI needs to be set up before use.',
    downloading: 'Setting up browser AI…',
    ready: 'Browser AI is ready.',
    streaming: 'Generating an answer…',
    'reset-required': 'The model context is full. Reset the conversation to continue.',
    'error-retryable': 'Browser AI could not be reached. You can retry.',
    unavailable: 'Browser AI is unavailable in this browser.',
};

export class ChatController {
    private readonly elements: Elements;
    private state: UiState = 'checking';
    private context?: PageContext;
    private session?: LanguageModelSession;
    private abortController?: AbortController;
    private destroyed = false;
    private operation = 0;

    public constructor(
        private readonly root: HTMLElement,
        private readonly adapter: LanguageModelAdapter,
        private readonly contextProvider: PageContextProvider,
        private readonly options: ChatControllerOptions,
    ) {
        this.elements = collectElements(root);
        this.bindEvents();
        this.setState('checking');
    }

    public async start(): Promise<void> {
        if (this.destroyed) {
            return;
        }
        const operation = ++this.operation;
        this.setState('checking');
        const [availabilityResult, contextResult] = await Promise.allSettled([
            this.adapter.availability(this.options),
            this.contextProvider.getContext(this.options.contextSelector),
        ]);
        if (!this.isCurrent(operation)) {
            return;
        }
        if (
            contextResult.status === 'rejected'
            && contextResult.reason instanceof PageContextError
        ) {
            this.setState('unavailable');
            return;
        }
        if (availabilityResult.status === 'fulfilled' && availabilityResult.value === 'unavailable') {
            this.setState('unavailable');
            return;
        }
        if (availabilityResult.status === 'rejected') {
            this.setState('error-retryable');
            return;
        }
        if (contextResult.status === 'rejected') {
            this.setState(contextResult.reason instanceof PageContextError ? 'unavailable' : 'error-retryable');
            return;
        }
        this.context = contextResult.value;
        this.applyAvailability(availabilityResult.value);
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.operation++;
        this.abortController?.abort();
        this.abortController = undefined;
        this.session?.destroy();
        this.session = undefined;
    }

    private bindEvents(): void {
        this.elements.setup.addEventListener('click', () => {
            if (this.state === 'downloadable') {
                void this.initializeFromActivation('downloading');
            }
        });
        this.elements.form.addEventListener('submit', event => {
            event.preventDefault();
            if (this.state === 'ready') {
                this.submitFromActivation();
            }
        });
        this.elements.abort.addEventListener('click', () => {
            if (this.state === 'streaming') {
                this.abortController?.abort();
            }
        });
        this.elements.retry.addEventListener('click', () => {
            if (this.state === 'error-retryable') {
                void this.start();
            }
        });
        this.elements.reset.addEventListener('click', () => {
            if (this.state !== 'reset-required') {
                return;
            }
            this.abortController?.abort();
            this.session?.destroy();
            this.session = undefined;
            this.elements.log.replaceChildren();
            void this.initializeFromActivation('downloading');
        });
    }

    private applyAvailability(availability: Availability): void {
        switch (availability) {
            case 'available':
                this.setState('ready');
                break;
            case 'downloadable':
            case 'downloading':
                // Passive checks cannot observe download progress reliably and must
                // never create a model. Continue from an explicit setup activation.
                this.setState('downloadable');
                break;
            case 'unavailable':
                this.setState('unavailable');
                break;
        }
    }

    private createAndInitialize(): Promise<void> {
        const context = this.context;
        if (context === undefined) {
            return Promise.reject(new Error('Page context is not ready.'));
        }

        const dialogue = new LanguageModelSession(this.adapter, this.contextProvider, {
            ...this.options,
            onDownloadProgress: value => {
                if (this.state === 'downloading') {
                    this.elements.progress.value = value;
                }
            },
        });
        this.session = dialogue;
        // initialize() reaches adapter.create() synchronously before its first await.
        return dialogue.initialize(context).then(() => undefined);
    }

    private async initializeFromActivation(activeState: UiState): Promise<void> {
        if (this.destroyed || this.session !== undefined) {
            return;
        }
        const operation = ++this.operation;
        this.setState(activeState);
        try {
            const initialization = this.createAndInitialize();
            await initialization;
            if (this.isCurrent(operation)) {
                this.setState('ready');
            }
        } catch (error: unknown) {
            if (this.isCurrent(operation)) {
                this.releaseSession();
                this.handleError(error);
            }
        }
    }

    private submitFromActivation(): void {
        const question = this.elements.question.value.trim();
        if (question.length === 0 || this.destroyed) {
            return;
        }

        this.elements.question.value = '';
        this.appendMessage('user', question);
        this.setState('streaming');
        const operation = ++this.operation;
        this.abortController = new AbortController();

        // Creating/initializing here preserves the submit event's user activation.
        const createsSession = this.session === undefined;
        const initialization = createsSession ? this.createAndInitialize() : Promise.resolve();
        void this.askAfterInitialization(initialization, question, operation, createsSession);
    }

    private async askAfterInitialization(
        initialization: Promise<void>,
        question: string,
        operation: number,
        createsSession: boolean,
    ): Promise<void> {
        try {
            await initialization;
            if (!this.isCurrent(operation)) {
                return;
            }
            const output = this.appendMessage('assistant', '');
            const renderer = new SafeResponseRenderer(output);
            const signal = this.abortController?.signal;
            await this.session?.ask(
                question,
                chunk => renderer.appendChunk(chunk),
                signal,
            );
            if (this.isCurrent(operation)) {
                this.setState('ready');
            }
        } catch (error: unknown) {
            if (this.isCurrent(operation)) {
                if (createsSession) {
                    this.session?.destroy();
                    this.session = undefined;
                }
                this.handleError(error);
            }
        } finally {
            if (this.isCurrent(operation)) {
                this.abortController = undefined;
            }
        }
    }

    private appendMessage(role: 'user' | 'assistant', content: string): HTMLElement {
        const message = this.root.ownerDocument.createElement('div');
        message.dataset.role = role;
        if (content.length > 0) {
            message.textContent = content;
        }
        this.elements.log.append(message);
        return message;
    }

    private handleError(error: unknown): void {
        if (error instanceof LanguageModelSessionError) {
            switch (error.code) {
                case 'aborted':
                    this.setState('ready');
                    return;
                case 'context-limit-reached':
                case 'quota-exceeded':
                    this.setState('reset-required');
                    return;
                case 'not-supported':
                    this.setState('unavailable');
                    return;
            }
        }
        this.setState('error-retryable');
    }

    private releaseSession(): void {
        this.session?.destroy();
        this.session = undefined;
    }

    private setState(state: UiState): void {
        this.state = state;
        this.root.dataset.state = state;
        this.elements.status.textContent = statusMessages[state];
        if (state === 'downloading') {
            this.elements.progress.value = 0;
        } else if (state === 'ready') {
            this.elements.progress.value = 1;
        }

        const unavailable = state === 'unavailable';
        this.elements.fallback.hidden = !unavailable;
        this.elements.assistant.hidden = unavailable;
        this.elements.setup.hidden = state !== 'downloadable';
        this.elements.progress.hidden = state !== 'downloading';
        this.elements.form.hidden = !['ready', 'streaming'].includes(state);
        this.elements.abort.hidden = state !== 'streaming';
        this.elements.reset.hidden = state !== 'reset-required';
        this.elements.retry.hidden = state !== 'error-retryable';

        const busy = state !== 'ready';
        this.elements.question.disabled = busy;
        this.elements.submit.disabled = busy;
        this.elements.setup.disabled = state !== 'downloadable';
        this.elements.abort.disabled = state !== 'streaming';
        this.elements.reset.disabled = state !== 'reset-required';
        this.elements.retry.disabled = state !== 'error-retryable';
    }

    private isCurrent(operation: number): boolean {
        return !this.destroyed && operation === this.operation;
    }
}

export function showPermanentFallback(root: HTMLElement): void {
    root.dataset.state = 'unavailable';
    const fallback = root.querySelector<HTMLElement>('[data-nr-browser-ai-fallback]');
    const assistant = root.querySelector<HTMLElement>('[data-nr-browser-ai-assistant]');
    if (fallback !== null) {
        fallback.hidden = false;
    }
    if (assistant !== null) {
        assistant.hidden = true;
    }
}

function collectElements(root: HTMLElement): Elements {
    return {
        assistant: required(root, '[data-nr-browser-ai-assistant]', HTMLElement),
        fallback: required(root, '[data-nr-browser-ai-fallback]', HTMLElement),
        status: required(root, '[data-nr-browser-ai-status]', HTMLElement),
        setup: required(root, '[data-nr-browser-ai-setup]', HTMLButtonElement),
        progress: required(root, '[data-nr-browser-ai-progress]', HTMLProgressElement),
        log: required(root, '[data-nr-browser-ai-log]', HTMLElement),
        form: required(root, '[data-nr-browser-ai-form]', HTMLFormElement),
        question: required(root, '[data-nr-browser-ai-question]', HTMLInputElement),
        submit: required(root, '[data-nr-browser-ai-submit]', HTMLButtonElement),
        abort: required(root, '[data-nr-browser-ai-abort]', HTMLButtonElement),
        reset: required(root, '[data-nr-browser-ai-reset]', HTMLButtonElement),
        retry: required(root, '[data-nr-browser-ai-retry]', HTMLButtonElement),
    };
}

function required<T extends Element>(
    root: HTMLElement,
    selector: string,
    constructor: {new (...args: never[]): T},
): T {
    const element = root.querySelector(selector);
    if (!(element instanceof constructor)) {
        throw new Error(`Required assistant element is missing: ${selector}`);
    }
    return element;
}
