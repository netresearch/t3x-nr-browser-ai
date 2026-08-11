import {readFormSchema} from '../form/FormSchemaSource';
import {FormFiller} from '../form/FormFiller';
import type {FormSchema, FormValues} from '../form/FormSchema';
import type {ActionOutcome, FormAction} from '../query/FormAction';
import {OpenMeteoQuery} from '../query/OpenMeteoQuery';
import {ResultRenderer} from '../result/ResultRenderer';
import {FormTool} from '../tools/FormTool';
import type {ToolObserver} from '../tools/FormTool';
import {LocalToolLoop, LocalToolLoopError} from '../tools/LocalToolLoop';
import {bindModelContext} from '../tools/ModelContextBinding';
import type {LanguageModelAdapter, ModelSession} from '../types';

type Status =
    | 'checking'
    | 'downloadable'
    | 'downloading'
    | 'ready'
    | 'deriving'
    | 'querying'
    | 'filled'
    | 'rejected'
    | 'unresolvedPlace'
    | 'queryFailed'
    | 'rateLimited'
    | 'errorRetryable'
    | 'unavailable';

const LABEL_KEYS: Record<Status, string> = {
    checking: 'labelChecking',
    downloadable: 'labelDownloadable',
    downloading: 'labelDownloading',
    ready: 'labelReady',
    deriving: 'labelDeriving',
    querying: 'labelQuerying',
    filled: 'labelFilled',
    rejected: 'labelRejected',
    unresolvedPlace: 'labelUnresolvedPlace',
    queryFailed: 'labelQueryFailed',
    rateLimited: 'labelRateLimited',
    errorRetryable: 'labelErrorRetryable',
    unavailable: 'labelUnavailable',
};

export type ActionFactory = (action: string, language: string) => FormAction | undefined;

const defaultActionFactory: ActionFactory = (action, language) => (
    action === 'openMeteo' ? new OpenMeteoQuery(language) : undefined
);

/**
 * Wires one form assistant plugin.
 *
 * The order of the two things it sets up matters. The tool is offered to the
 * browser's model context first and unconditionally, because an agent may be
 * driving this page in a browser that has no on-device model of its own. Only
 * then does the plugin look for a model to run the page's own request row, and
 * a browser without one simply keeps the plain form.
 */
export class FormAssistantController implements ToolObserver {
    private readonly lifetime = new AbortController();
    private readonly renderer: ResultRenderer;
    private readonly filler: FormFiller;
    private readonly tool: FormTool;
    private readonly schema: FormSchema;
    private session?: ModelSession;
    private running = false;

    private constructor(
        private readonly root: HTMLElement,
        private readonly form: HTMLFormElement,
        schema: FormSchema,
        action: FormAction,
        private readonly adapter: LanguageModelAdapter,
    ) {
        this.schema = schema;
        this.filler = new FormFiller(form);
        this.renderer = new ResultRenderer(this.element('result'), {
            caption: this.label('labelResultCaption'),
            place: this.label('labelResultPlace'),
            time: this.label('labelResultTime'),
        });
        this.tool = new FormTool(
            root.dataset['toolName'] ?? '',
            root.dataset['toolDescription'] ?? '',
            schema,
            this.filler,
            action,
            this,
        );
    }

    /**
     * @return undefined when this root carries no usable schema or no known
     *         action, in which case the plugin stays a plain form
     */
    public static create(
        root: HTMLElement,
        adapter: LanguageModelAdapter,
        actionFactory: ActionFactory = defaultActionFactory,
    ): FormAssistantController | undefined {
        const form = root.querySelector('form');
        const schema = readFormSchema(root.dataset['formSchema'] ?? '');
        const action = actionFactory(root.dataset['action'] ?? '', pageLanguage());
        if (form === null || schema === undefined || action === undefined) {
            return undefined;
        }
        if ((root.dataset['toolName'] ?? '') === '') {
            return undefined;
        }

        const controller = new FormAssistantController(root, form, schema, action, adapter);
        controller.start();

        return controller;
    }

    public destroy(): void {
        this.lifetime.abort();
        this.session?.destroy();
        this.session = undefined;
    }

    public onCall(input: unknown): void {
        const display = this.root.querySelector<HTMLElement>('[data-nr-browser-ai-form-call]');
        if (display !== null) {
            display.textContent = JSON.stringify(input, null, 2);
        }
    }

    public onRejected(reason: string): void {
        this.setStatus('rejected', reason);
    }

    public onFilled(_values: FormValues): void {
        this.setStatus('querying');
    }

    public onOutcome(outcome: ActionOutcome): void {
        if (outcome.ok) {
            this.renderer.render(outcome);
            this.setStatus('filled');

            return;
        }

        this.renderer.clear();
        if (outcome.failure === 'unresolved-place') {
            this.setStatus('unresolvedPlace', outcome.summary);
        } else if (outcome.failure === 'rate-limited') {
            this.setStatus('rateLimited', outcome.summary);
        } else {
            this.setStatus('queryFailed', outcome.summary);
        }
    }

    private start(): void {
        bindModelContext(this.tool, this.lifetime.signal);

        this.form.addEventListener('submit', event => {
            event.preventDefault();
            void this.rerun();
        }, {signal: this.lifetime.signal});

        this.element('setup').addEventListener('click', () => {
            void this.prepareModel();
        }, {signal: this.lifetime.signal});

        this.element('submit').addEventListener('click', () => {
            void this.derive();
        }, {signal: this.lifetime.signal});

        this.requestField().addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.derive();
            }
        }, {signal: this.lifetime.signal});

        void this.checkAvailability();
    }

    private async checkAvailability(): Promise<void> {
        this.reveal();
        this.setStatus('checking');

        const availability = await this.adapter.availability(this.modelOptions());
        if (availability === 'unavailable') {
            this.setStatus('unavailable');
            this.showRequestRow(false);
            this.showSetup(false);

            return;
        }
        if (availability === 'available') {
            this.setStatus('ready');
            this.showRequestRow(true);
            this.showSetup(false);

            return;
        }

        this.setStatus('downloadable');
        this.showRequestRow(false);
        this.showSetup(true);
    }

    /**
     * Creating a session downloads the model on first use, which the browser
     * only permits from a user gesture. That is why it happens here and on the
     * first request, never during page load.
     */
    private async prepareModel(): Promise<ModelSession | undefined> {
        if (this.session !== undefined) {
            return this.session;
        }

        const progress = this.root.querySelector<HTMLProgressElement>('[data-nr-browser-ai-form-progress]');
        this.setStatus('downloading');
        try {
            this.session = await this.adapter.create({
                ...this.modelOptions(),
                onDownloadProgress: value => {
                    if (progress !== null) {
                        progress.value = value;
                    }
                },
            });
        } catch {
            this.setStatus('errorRetryable');

            return undefined;
        }

        this.setStatus('ready');
        this.showSetup(false);
        this.showRequestRow(true);

        return this.session;
    }

    private async derive(): Promise<void> {
        if (this.running) {
            return;
        }
        const request = this.requestField().value;
        if (request.trim().length === 0) {
            return;
        }

        const session = await this.prepareModel();
        if (session === undefined) {
            return;
        }

        this.running = true;
        this.setStatus('deriving');
        try {
            await new LocalToolLoop(session, this.tool).run(request, this.lifetime.signal);
        } catch (error: unknown) {
            this.setStatus(
                error instanceof LocalToolLoopError ? 'rejected' : 'errorRetryable',
                error instanceof Error ? error.message : undefined,
            );
        } finally {
            this.running = false;
        }
    }

    /** Runs the form as it stands, after a manual correction or without a model. */
    private async rerun(): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;
        try {
            await this.tool.rerun(this.lifetime.signal);
        } finally {
            this.running = false;
        }
    }

    private modelOptions(): {systemPrompt: string; inputLanguages: string[]; outputLanguages: string[]} {
        const language = pageLanguage();
        const instruction = (this.root.dataset['supplementalInstruction'] ?? '').trim();
        const systemPrompt = [this.root.dataset['systemPrompt'] ?? '', instruction]
            .map(part => part.trim())
            .filter(part => part.length > 0)
            .join('\n\n');

        return {
            systemPrompt,
            inputLanguages: language === 'en' ? ['en'] : ['en', language],
            outputLanguages: ['en'],
        };
    }

    private reveal(): void {
        this.element('assistant').hidden = false;
    }

    private showRequestRow(visible: boolean): void {
        const row = this.root.querySelector<HTMLElement>('.nr-browser-ai-form__request');
        if (row !== null) {
            row.hidden = !visible;
        }
    }

    private showSetup(visible: boolean): void {
        this.element('setup').hidden = !visible;
        const progress = this.root.querySelector<HTMLElement>('[data-nr-browser-ai-form-progress]');
        if (progress !== null) {
            progress.hidden = !visible;
        }
    }

    private setStatus(status: Status, detail?: string): void {
        const element = this.element('status');
        const label = this.label(LABEL_KEYS[status]);
        element.textContent = detail === undefined || detail === '' ? label : `${label} (${detail})`;

        const announcement = this.root.querySelector<HTMLElement>('[data-nr-browser-ai-form-announcement]');
        if (announcement !== null && (status === 'filled' || status === 'rejected')) {
            announcement.textContent = element.textContent;
        }
    }

    private requestField(): HTMLInputElement {
        const field = this.root.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (field === null) {
            throw new Error('The plugin markup has no request field.');
        }

        return field;
    }

    private element(name: string): HTMLElement {
        const element = this.root.querySelector<HTMLElement>(`[data-nr-browser-ai-form-${name}]`);
        if (element === null) {
            throw new Error(`The plugin markup has no ${name} element.`);
        }

        return element;
    }

    private label(key: string): string {
        return this.root.dataset[key] ?? '';
    }
}

function pageLanguage(): string {
    const tag = document.documentElement.lang.trim().toLowerCase().split(/[-_]/u)[0];

    return tag === undefined || tag === '' ? 'en' : tag;
}
