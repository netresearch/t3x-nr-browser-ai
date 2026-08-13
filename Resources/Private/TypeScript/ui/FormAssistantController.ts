import {readFormSchema} from '../form/FormSchemaSource';
import {FormFiller} from '../form/FormFiller';
import {correctCheckboxGroupRoles} from '../form/GroupRoles';
import type {FormSchema, FormValues} from '../form/FormSchema';
import type {ActionOutcome, FormAction} from '../query/FormAction';
import {OpenMeteoQuery} from '../query/OpenMeteoQuery';
import {SafeResponseRenderer} from '../rendering/SafeResponseRenderer';
import {ResultRenderer} from '../result/ResultRenderer';
import {FormTool} from '../tools/FormTool';
import type {ToolObserver} from '../tools/FormTool';
import {LocalToolLoop, LocalToolLoopError} from '../tools/LocalToolLoop';
import {bindModelContext} from '../tools/ModelContextBinding';
import {languageInstruction} from '../ai/LanguageModelSession';
import type {LanguageModelAdapter, ModelSession} from '../types';

type Status =
    | 'checking'
    | 'downloadable'
    | 'downloading'
    | 'ready'
    | 'deriving'
    | 'querying'
    | 'phrasing'
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
    phrasing: 'labelPhrasing',
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
    private readonly prose: SafeResponseRenderer;
    private readonly filler: FormFiller;
    private readonly tool: FormTool;
    private readonly schema: FormSchema;
    private session?: ModelSession;
    private running = false;
    /**
     * Whether the last query of a run succeeded. A run ends in the status its
     * outcome earned: settling on 'filled' regardless would paper over a
     * refused query with the wording of a successful one.
     */
    private lastOutcomeOk = false;

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
        this.prose = new SafeResponseRenderer(this.element('prose'), this.label('labelNewTab'));
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
        this.prose.clear();
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
        this.lastOutcomeOk = outcome.ok;

        if (outcome.ok) {
            this.renderer.add(outcome);
            this.setStatus('filled');

            return;
        }

        if (outcome.failure === 'unresolved-place') {
            this.setStatus('unresolvedPlace', outcome.summary);
        } else if (outcome.failure === 'rate-limited') {
            this.setStatus('rateLimited', outcome.summary);
        } else {
            this.setStatus('queryFailed', outcome.summary);
        }
    }

    private start(): void {
        correctCheckboxGroupRoles(this.form);
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
        const request = this.requestField().value;
        if (this.running || request.trim().length === 0) {
            return;
        }

        // Claimed before the first await. Preparing the model is asynchronous,
        // and a second click during it would otherwise pass the guard and start
        // a second derivation against the same form.
        this.running = true;
        try {
            const session = await this.prepareModel();
            if (session === undefined) {
                return;
            }

            this.setStatus('deriving');
            this.renderer.begin();
            this.prose.clear();
            this.lastOutcomeOk = false;

            const outcome = await new LocalToolLoop(session, this.tool).run(
                request,
                this.lifetime.signal,
                {
                    language: languageName(pageLanguage()),
                    onQuery: () => this.setStatus('querying'),
                    shouldPhrase: () => this.lastOutcomeOk,
                    onPhrasing: () => this.setStatus('phrasing'),
                },
            );

            if (!this.lastOutcomeOk) {
                return;
            }

            this.collapseForm();
            this.setStatus('filled');

            // After the status, not before: setStatus() announces its own
            // wording, and the answer has to be the last thing said.
            if (outcome.prose !== '') {
                this.prose.appendChunk(outcome.prose);
                this.announce(outcome.prose);
            }
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
            this.renderer.begin();
            this.prose.clear();
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
            // The answer-language rule is the page assistant's; the form
            // assistant had none at all, so a German request was answered in
            // English whatever the page said.
            systemPrompt: [systemPrompt, languageInstruction([language])]
                .filter(part => part.length > 0)
                .join('\n\n'),
            inputLanguages: language === 'en' ? ['en'] : ['en', language],
            // Was hardcoded to English, which declared English output to Chrome
            // on every page. The page assistant has always passed the page
            // language through here (Assistant.ts).
            outputLanguages: [language],
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
        // Mirrors the page assistant: the state is on the root as an attribute
        // so styling and the end-to-end suite can both see it without reading
        // the wording of a localised message.
        this.root.dataset['state'] = status;

        const element = this.element('status');
        const label = this.label(LABEL_KEYS[status]);
        element.textContent = detail === undefined || detail === '' ? label : `${label} (${detail})`;

        const announcement = this.root.querySelector<HTMLElement>('[data-nr-browser-ai-form-announcement]');
        if (announcement !== null && (status === 'filled' || status === 'rejected')) {
            announcement.textContent = element.textContent;
        }
    }

    /**
     * After a run the answer belongs next to the question, not below seventy
     * controls. The form stays in the document and one keystroke away, so the
     * derived parameters remain inspectable and correctable — collapsing hides
     * them, it does not take them back.
     */
    private collapseForm(): void {
        const fields = this.root.querySelector<HTMLDetailsElement>('[data-nr-browser-ai-form-fields]');
        if (fields instanceof HTMLDetailsElement) {
            fields.open = false;
        }
    }

    /**
     * The prose is the answer, so it is what assistive technology should hear
     * once a run settles — not the status line that merely says a run settled.
     */
    private announce(text: string): void {
        const announcement = this.root.querySelector<HTMLElement>('[data-nr-browser-ai-form-announcement]');
        if (announcement !== null) {
            announcement.textContent = text;
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

/**
 * The geocoding endpoint accepts a fixed set of languages, so an unrecognised
 * page language falls back to English rather than being passed on untested.
 * The set is the one Chrome's Prompt API declares for output, which is also
 * what the page assistant already limits itself to.
 */
const SUPPORTED_LANGUAGES = new Set(['de', 'en', 'es', 'fr', 'ja']);

/**
 * The phrasing call is instructed in English but has to answer in the page's
 * language, and a two-letter tag is not an instruction a model acts on
 * reliably. The set is the one Chrome's Prompt API declares for output.
 */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
    de: 'German',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    ja: 'Japanese',
};

function languageName(tag: string): string {
    return LANGUAGE_NAMES[tag] ?? 'English';
}

function pageLanguage(): string {
    const tag = document.documentElement.lang.trim().toLowerCase().split(/[-_]/u)[0] ?? '';

    return SUPPORTED_LANGUAGES.has(tag) ? tag : 'en';
}
