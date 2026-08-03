import {BrowserLanguageModelAdapter} from './ai/BrowserLanguageModelAdapter';
import {DomPageContextProvider} from './context/DomPageContextProvider';
import type {PageContextProvider} from './context/PageContextProvider';
import type {LanguageModelAdapter} from './types';
import {ChatController, showPermanentFallback} from './ui/ChatController';
import type {UiLabels, UiState} from './ui/ChatController';

const SUPPORTED_LANGUAGES = new Set(['de', 'en', 'es', 'fr', 'ja']);

type AdapterFactory = (root: HTMLElement) => LanguageModelAdapter;
type ProviderFactory = (root: HTMLElement) => PageContextProvider;

export function bootstrapAssistants(
    sourceDocument: Document = document,
    adapterFactory: AdapterFactory = () => new BrowserLanguageModelAdapter(),
    providerFactory: ProviderFactory = () => new DomPageContextProvider(sourceDocument),
): ChatController[] {
    const controllers: ChatController[] = [];

    for (const root of sourceDocument.querySelectorAll<HTMLElement>('[data-nr-browser-ai-root]')) {
        try {
            const options = configuration(root, sourceDocument);
            const controller = new ChatController(
                root,
                adapterFactory(root),
                providerFactory(root),
                options,
            );
            controllers.push(controller);
            void controller.start();
        } catch {
            showPermanentFallback(root);
        }
    }

    return controllers;
}

export function installAssistantLifecycle(
    sourceDocument: Document = document,
    adapterFactory: AdapterFactory = () => new BrowserLanguageModelAdapter(),
    providerFactory: ProviderFactory = () => new DomPageContextProvider(sourceDocument),
): () => void {
    let controllers = bootstrapAssistants(sourceDocument, adapterFactory, providerFactory);
    const WindowAbortController = sourceDocument.defaultView?.AbortController ?? AbortController;
    const lifecycleEvents = new WindowAbortController();

    const destroyControllers = (): void => {
        controllers.forEach(controller => controller.destroy());
        controllers = [];
    };

    sourceDocument.defaultView?.addEventListener('pagehide', event => {
        destroyControllers();
        if (!isPersistedPageTransition(event)) {
            lifecycleEvents.abort();
        }
    }, {signal: lifecycleEvents.signal});
    sourceDocument.defaultView?.addEventListener('pageshow', event => {
        if (isPersistedPageTransition(event)) {
            destroyControllers();
            controllers = bootstrapAssistants(sourceDocument, adapterFactory, providerFactory);
        }
    }, {signal: lifecycleEvents.signal});

    return (): void => {
        lifecycleEvents.abort();
        destroyControllers();
    };
}

function isPersistedPageTransition(event: Event): boolean {
    return 'persisted' in event && event.persisted === true;
}

function configuration(root: HTMLElement, sourceDocument: Document) {
    const contextSelector = root.dataset.contextSelector?.trim() ?? '';
    const systemPrompt = root.dataset.systemPrompt?.trim() ?? '';
    const supplementalInstruction = root.dataset.supplementalInstruction?.trim() ?? '';
    const notFoundMarker = root.dataset.notFoundMarker?.trim() ?? '';
    const contextUsageLimit = Number(root.dataset.contextUsageLimit);

    if (contextSelector.length === 0) {
        throw new Error('Missing context selector.');
    }
    try {
        sourceDocument.querySelector(contextSelector);
    } catch {
        throw new Error('Invalid context selector.');
    }
    if (!Number.isFinite(contextUsageLimit) || contextUsageLimit <= 0 || contextUsageLimit > 1) {
        throw new Error('Invalid context usage limit.');
    }
    if (systemPrompt.length === 0) {
        throw new Error('Missing system prompt.');
    }

    const pageLanguage = normalizeLanguage(sourceDocument.documentElement.lang);
    const outputLanguage = pageLanguage ?? 'en';
    const inputLanguages = outputLanguage === 'en' ? ['en'] : ['en', outputLanguage];

    return {
        contextSelector,
        contextUsageLimit,
        systemPrompt,
        supplementalInstruction,
        notFoundMarker,
        inputLanguages,
        outputLanguages: [outputLanguage],
        labels: labels(root),
    };
}

const UI_STATES: readonly UiState[] = [
    'checking',
    'downloadable',
    'downloading',
    'ready',
    'streaming',
    'reset-required',
    'error-retryable',
    'unavailable',
];

function labels(root: HTMLElement): UiLabels {
    const result: Partial<UiLabels> = {newTab: requiredLabel(root, 'labelNewTab')};
    for (const state of UI_STATES) {
        const datasetKey = `label${state.split('-').map(part => part[0]?.toUpperCase() + part.slice(1)).join('')}`;
        result[state] = requiredLabel(root, datasetKey);
    }
    return result as UiLabels;
}

function requiredLabel(root: HTMLElement, key: string): string {
    const label = root.dataset[key]?.trim() ?? '';
    if (label.length === 0) {
        throw new Error(`Missing UI label: ${key}`);
    }
    return label;
}

function normalizeLanguage(languageTag: string): string | undefined {
    const primary = languageTag.trim().toLowerCase().split(/[-_]/u)[0];
    return primary !== undefined && SUPPORTED_LANGUAGES.has(primary) ? primary : undefined;
}

if (document.querySelector('[data-nr-browser-ai-root]') !== null) {
    installAssistantLifecycle();
}
