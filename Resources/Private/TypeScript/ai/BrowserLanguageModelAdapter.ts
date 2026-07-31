import type {
    Availability,
    LanguageModelAdapter,
    ModelOptions,
    ModelSession,
} from '../types';

interface TextCapability {
    type: 'text';
    languages: string[];
}

interface BrowserCapabilityOptions {
    expectedInputs: TextCapability[];
    expectedOutputs: TextCapability[];
}

interface DownloadProgressEvent {
    loaded: number;
}

interface BrowserCreateMonitor {
    addEventListener(
        type: 'downloadprogress',
        listener: (event: DownloadProgressEvent) => void,
    ): void;
}

interface BrowserCreateOptions extends BrowserCapabilityOptions {
    initialPrompts: [{role: 'system'; content: string}];
    monitor(monitor: BrowserCreateMonitor): void;
}

interface BrowserLanguageModelGlobal {
    availability(options: BrowserCapabilityOptions): Promise<unknown>;
    create(options: BrowserCreateOptions): Promise<ModelSession>;
}

interface BrowserEnvironment {
    LanguageModel?: Partial<BrowserLanguageModelGlobal>;
}

const availabilityValues: ReadonlySet<Availability> = new Set([
    'available',
    'downloadable',
    'downloading',
    'unavailable',
]);

export class BrowserLanguageModelAdapter implements LanguageModelAdapter {
    public constructor(
        private readonly browser: BrowserEnvironment = globalThis as unknown as BrowserEnvironment,
    ) {}

    public async availability(options: ModelOptions): Promise<Availability> {
        const availability = this.browser.LanguageModel?.availability;
        if (typeof availability !== 'function') {
            return 'unavailable';
        }

        const value: unknown = await availability.call(
            this.browser.LanguageModel,
            this.capabilityOptions(options),
        );

        return typeof value === 'string' && availabilityValues.has(value as Availability)
            ? value as Availability
            : 'unavailable';
    }

    public async create(
        options: ModelOptions & {onDownloadProgress(value: number): void},
    ): Promise<ModelSession> {
        const create = this.browser.LanguageModel?.create;
        if (typeof create !== 'function') {
            throw new Error('LanguageModel API is unavailable');
        }

        return create.call(this.browser.LanguageModel, {
            ...this.capabilityOptions(options),
            initialPrompts: [{role: 'system', content: options.systemPrompt}],
            monitor: monitor => {
                monitor.addEventListener('downloadprogress', event => {
                    if (Number.isFinite(event.loaded)) {
                        options.onDownloadProgress(Math.min(1, Math.max(0, event.loaded)));
                    }
                });
            },
        });
    }

    private capabilityOptions(options: ModelOptions): BrowserCapabilityOptions {
        return {
            expectedInputs: [{type: 'text', languages: [...options.inputLanguages]}],
            expectedOutputs: [{type: 'text', languages: [...options.outputLanguages]}],
        };
    }
}
