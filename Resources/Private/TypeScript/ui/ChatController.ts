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
    labels: UiLabels;
}

export type UiLabels = Record<UiState, string> & {newTab: string};

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

export class ChatController {
    private readonly elements: Elements;
    private state: UiState = 'checking';
    private context?: PageContext;
    private session?: LanguageModelSession;
    private abortController?: AbortController;
    private readonly eventListeners: AbortController;
    private destroyed = false;
    private operation = 0;

    public constructor(
        private readonly root: HTMLElement,
        private readonly adapter: LanguageModelAdapter,
        private readonly contextProvider: PageContextProvider,
        private readonly options: ChatControllerOptions,
    ) {
        const WindowAbortController = root.ownerDocument.defaultView?.AbortController ?? AbortController;
        this.eventListeners = new WindowAbortController();
        this.elements = collectElements(root);
        this.elements.log.replaceChildren();
        this.elements.question.value = '';
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
        this.eventListeners.abort();
        this.releaseSession();
    }

    private bindEvents(): void {
        const listenerOptions = {signal: this.eventListeners.signal};
        this.elements.setup.addEventListener('click', () => {
            if (this.state === 'downloadable') {
                void this.initializeFromActivation('downloading');
            }
        }, listenerOptions);
        this.elements.form.addEventListener('submit', event => {
            event.preventDefault();
            if (this.state === 'ready') {
                this.submitFromActivation();
            }
        }, listenerOptions);
        this.elements.abort.addEventListener('click', () => {
            if (this.state === 'streaming') {
                this.abortController?.abort();
            }
        }, listenerOptions);
        this.elements.retry.addEventListener('click', () => {
            if (this.state === 'error-retryable') {
                void this.start();
                this.focusStatus();
            }
        }, listenerOptions);
        this.elements.reset.addEventListener('click', () => {
            if (this.state !== 'reset-required') {
                return;
            }
            this.abortController?.abort();
            this.session?.destroy();
            this.session = undefined;
            this.elements.log.replaceChildren();
            void this.initializeFromActivation('downloading');
        }, listenerOptions);
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
        this.focusStatus();
        try {
            const initialization = this.createAndInitialize();
            await initialization;
            if (this.isCurrent(operation)) {
                this.setState('ready');
                this.focusQuestion();
            }
        } catch (error: unknown) {
            if (this.isCurrent(operation)) {
                this.releaseSession();
                this.handleInitializationError(error);
                this.focusForOutcome();
            }
        }
    }

    private submitFromActivation(): void {
        const question = this.elements.question.value.trim();
        if (question.length === 0 || this.destroyed) {
            this.focusQuestion();
            return;
        }

        this.elements.question.value = '';
        this.appendMessage('user', question);
        this.setState('streaming');
        this.focusStatus();
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
        } catch (error: unknown) {
            if (this.isCurrent(operation)) {
                if (createsSession) {
                    this.releaseSession();
                }
                this.abortController = undefined;
                this.handleInitializationError(error);
            }
            return;
        }
        if (!this.isCurrent(operation)) {
            return;
        }
        try {
            const output = this.appendMessage('assistant', '');
            const renderer = new SafeResponseRenderer(output, this.options.labels.newTab);
            const signal = this.abortController?.signal;
            await this.session?.ask(
                question,
                chunk => renderer.appendChunk(chunk),
                signal,
            );
            if (this.isCurrent(operation)) {
                this.setState('ready');
                this.focusQuestion();
            }
        } catch (error: unknown) {
            if (this.isCurrent(operation)) {
                this.handleDialogueError(error);
                this.focusForOutcome();
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

    private handleInitializationError(error: unknown): void {
        if (error instanceof LanguageModelSessionError) {
            switch (error.code) {
                case 'aborted':
                    this.setState('ready');
                    return;
                case 'context-limit-reached':
                case 'not-supported':
                    this.setState('unavailable');
                    return;
            }
        }
        this.setState('error-retryable');
    }

    private handleDialogueError(error: unknown): void {
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
        if (state === 'unavailable') {
            this.releaseSession();
        }
        this.state = state;
        this.root.dataset.state = state;
        this.elements.status.textContent = this.options.labels[state];
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
        this.elements.question.readOnly = busy;
        this.elements.question.setAttribute('aria-readonly', String(busy));
        this.elements.submit.setAttribute('aria-disabled', String(busy));
        this.elements.setup.setAttribute('aria-disabled', String(state !== 'downloadable'));
        this.elements.abort.setAttribute('aria-disabled', String(state !== 'streaming'));
        this.elements.reset.setAttribute('aria-disabled', String(state !== 'reset-required'));
        this.elements.retry.setAttribute('aria-disabled', String(state !== 'error-retryable'));
    }

    private focusForOutcome(): void {
        if (this.state === 'ready') {
            this.focusQuestion();
        } else {
            this.focusStatus();
        }
    }

    private focusQuestion(): void {
        this.elements.question.focus({preventScroll: true});
    }

    private focusStatus(): void {
        this.elements.status.focus({preventScroll: true});
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
