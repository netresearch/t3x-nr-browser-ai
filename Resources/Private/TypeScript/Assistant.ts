import {BrowserLanguageModelAdapter} from './ai/BrowserLanguageModelAdapter';
import {DomPageContextProvider} from './context/DomPageContextProvider';
import type {PageContextProvider} from './context/PageContextProvider';
import type {LanguageModelAdapter} from './types';
import {ChatController, showPermanentFallback} from './ui/ChatController';

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

    sourceDocument.defaultView?.addEventListener('pagehide', () => {
        controllers.forEach(controller => controller.destroy());
    }, {once: true});

    return controllers;
}

function configuration(root: HTMLElement, sourceDocument: Document) {
    const contextSelector = root.dataset.contextSelector?.trim() ?? '';
    const systemPrompt = root.dataset.systemPrompt?.trim() ?? '';
    const supplementalInstruction = root.dataset.supplementalInstruction?.trim() ?? '';
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
        inputLanguages,
        outputLanguages: [outputLanguage],
    };
}

function normalizeLanguage(languageTag: string): string | undefined {
    const primary = languageTag.trim().toLowerCase().split(/[-_]/u)[0];
    return primary !== undefined && SUPPORTED_LANGUAGES.has(primary) ? primary : undefined;
}

bootstrapAssistants();
