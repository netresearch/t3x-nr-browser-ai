import {beforeEach, describe, expect, it, vi} from 'vitest';

import {bootstrapAssistants} from '../../../Resources/Private/TypeScript/Assistant';
import {ChatController} from '../../../Resources/Private/TypeScript/ui/ChatController';
import {PageContextError} from '../../../Resources/Private/TypeScript/context/DomPageContextProvider';
import type {PageContextProvider} from '../../../Resources/Private/TypeScript/context/PageContextProvider';
import type {
    Availability,
    LanguageModelAdapter,
    ModelPrompt,
    ModelSession,
} from '../../../Resources/Private/TypeScript/types';

const context = {
    title: 'Browser AI',
    language: 'de-DE',
    sections: [{heading: 'Inhalt', text: 'Antwortgrundlage'}],
    wasTruncated: false,
};

function markup(id = 'assistant'): HTMLElement {
    document.body.insertAdjacentHTML('beforeend', `
        <section id="${id}" data-nr-browser-ai-root data-state="checking">
            <div data-nr-browser-ai-fallback>Fallback</div>
            <div data-nr-browser-ai-assistant hidden>
                <p data-nr-browser-ai-status role="status"></p>
                <button type="button" data-nr-browser-ai-setup>Set up</button>
                <progress data-nr-browser-ai-progress max="1" value="0"></progress>
                <div data-nr-browser-ai-log></div>
                <form data-nr-browser-ai-form>
                    <label>Question <input data-nr-browser-ai-question></label>
                    <button type="submit" data-nr-browser-ai-submit>Ask</button>
                </form>
                <button type="button" data-nr-browser-ai-abort>Stop</button>
                <button type="button" data-nr-browser-ai-reset>Reset</button>
                <button type="button" data-nr-browser-ai-retry>Retry</button>
            </div>
        </section>`);
    return document.querySelector(`#${id}`) as HTMLElement;
}

function streamOf(...chunks: string[]): ReadableStream<string> {
    return new ReadableStream({
        start(controller) {
            chunks.forEach(chunk => controller.enqueue(chunk));
            controller.close();
        },
    });
}

function fixture(availability: Availability = 'available', stream = streamOf('Safe ', '<img onerror=alert(1)>')) {
    const browserDestroy = vi.fn();
    const browserSession: ModelSession = {
        contextUsage: 10,
        contextWindow: 1_000,
        measureContextUsage: vi.fn(async (_input: ModelPrompt) => 20),
        append: vi.fn(async (_input: ModelPrompt) => undefined),
        promptStreaming: vi.fn(() => stream),
        destroy: browserDestroy,
    };
    const create = vi.fn<LanguageModelAdapter['create']>(async () => browserSession);
    const availabilitySpy = vi.fn(async () => availability);
    const adapter: LanguageModelAdapter = {availability: availabilitySpy, create};
    const provider: PageContextProvider = {
        getContext: vi.fn(async () => structuredClone(context)),
        fitToBudget: vi.fn(async value => structuredClone(value)),
    };

    return {adapter, provider, create, availabilitySpy, browserDestroy, browserSession};
}

function controller(root: HTMLElement, fakes: ReturnType<typeof fixture>): ChatController {
    return new ChatController(root, fakes.adapter, fakes.provider, {
        contextSelector: 'main',
        contextUsageLimit: 0.8,
        systemPrompt: 'Answer only from the supplied page.',
        supplementalInstruction: 'Antworte kurz.',
        inputLanguages: ['en', 'de'],
        outputLanguages: ['de'],
    });
}

async function flush(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe('ChatController capability and setup states', () => {
    it('shows the retained fallback for an unavailable API without creating a model', async () => {
        const root = markup();
        const fakes = fixture('unavailable');

        await controller(root, fakes).start();

        expect(root.dataset.state).toBe('unavailable');
        expect(root.querySelector('[data-nr-browser-ai-fallback]')).not.toBeNull();
        expect((root.querySelector('[data-nr-browser-ai-fallback]') as HTMLElement).hidden).toBe(false);
        expect(fakes.create).not.toHaveBeenCalled();
    });

    it.each(['downloadable', 'downloading'] as const)('requires a setup activation for %s availability and reports progress', async availability => {
        const root = markup();
        const fakes = fixture(availability);
        const progress = root.querySelector('[data-nr-browser-ai-progress]') as HTMLProgressElement;
        let finishDownload!: () => void;
        fakes.create.mockImplementation(options => new Promise(resolve => {
            expect(progress.value).toBe(0);
            options.onDownloadProgress(0.4);
            finishDownload = () => resolve(fakes.browserSession);
        }));
        const subject = controller(root, fakes);
        await subject.start();

        expect(root.dataset.state).toBe('downloadable');
        expect(fakes.create).not.toHaveBeenCalled();

        (root.querySelector('[data-nr-browser-ai-setup]') as HTMLButtonElement).click();
        expect(fakes.create).toHaveBeenCalledTimes(1);
        expect(root.dataset.state).toBe('downloading');
        expect(progress.value).toBe(0.4);
        finishDownload();
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
        expect(progress.value).toBe(1);
    });

    it('becomes ready for available capability without passively creating a model', async () => {
        const root = markup();
        const fakes = fixture('available');

        await controller(root, fakes).start();

        expect(root.dataset.state).toBe('ready');
        expect(fakes.create).not.toHaveBeenCalled();
        expect((root.querySelector('[data-nr-browser-ai-fallback]') as HTMLElement).hidden).toBe(true);
    });

    it('retries a transient capability error from error-retryable through checking', async () => {
        const root = markup();
        const fakes = fixture('available');
        fakes.availabilitySpy.mockRejectedValueOnce(new Error('temporary')).mockResolvedValue('available');
        const subject = controller(root, fakes);
        await subject.start();
        expect(root.dataset.state).toBe('error-retryable');

        (root.querySelector('[data-nr-browser-ai-retry]') as HTMLButtonElement).click();
        expect(root.dataset.state).toBe('checking');
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
    });

    it('treats a permanently missing context root as unavailable', async () => {
        const root = markup();
        const fakes = fixture('available');
        fakes.provider.getContext = vi.fn(async () => {
            throw new PageContextError('context-root-missing', 'Missing');
        });

        await controller(root, fakes).start();

        expect(root.dataset.state).toBe('unavailable');
        expect((root.querySelector('[data-nr-browser-ai-fallback]') as HTMLElement).hidden).toBe(false);
    });

    it('keeps an unavailable capability authoritative when context extraction also fails', async () => {
        const root = markup();
        const fakes = fixture('unavailable');
        fakes.provider.getContext = vi.fn(async () => { throw new Error('Context failed too'); });

        await controller(root, fakes).start();

        expect(root.dataset.state).toBe('unavailable');
    });

    it('gives a permanent page-context failure precedence over a simultaneous capability rejection', async () => {
        const root = markup();
        const fakes = fixture('available');
        fakes.availabilitySpy.mockRejectedValue(new Error('Capability check failed'));
        fakes.provider.getContext = vi.fn(async () => {
            throw new PageContextError('context-root-missing', 'Missing');
        });

        await controller(root, fakes).start();

        expect(root.dataset.state).toBe('unavailable');
        expect((root.querySelector('[data-nr-browser-ai-fallback]') as HTMLElement).hidden).toBe(false);
    });
});

describe('ChatController dialogue lifecycle', () => {
    it('creates synchronously inside the first submit activation, streams safely and prevents double submit', async () => {
        const root = markup();
        const fakes = fixture();
        const subject = controller(root, fakes);
        await subject.start();
        const input = root.querySelector('[data-nr-browser-ai-question]') as HTMLInputElement;
        const form = root.querySelector('[data-nr-browser-ai-form]') as HTMLFormElement;
        input.value = '<b>Question</b>';

        form.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true}));
        expect(fakes.create).toHaveBeenCalledTimes(1);
        form.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true}));
        expect(fakes.create).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
        expect(root.querySelector('[data-role="user"]')?.textContent).toBe('<b>Question</b>');
        expect(root.querySelector('b')).toBeNull();
        expect(root.querySelector('[data-role="assistant"]')?.textContent).toBe('Safe <img onerror=alert(1)>');
        expect(root.querySelector('img')).toBeNull();
    });

    it('aborts an active response and returns to ready', async () => {
        const stream = new ReadableStream<string>({
            start(controller) {
                // Keep the stream pending until the AbortSignal cancels the reader.
                void controller;
            },
        });
        const root = markup();
        const fakes = fixture('available', stream);
        fakes.browserSession.promptStreaming = vi.fn((_question, options) => new ReadableStream({
            start(streamController) {
                options?.signal?.addEventListener('abort', () => streamController.error(new DOMException('Stopped', 'AbortError')));
            },
        }));
        const subject = controller(root, fakes);
        await subject.start();
        (root.querySelector('[data-nr-browser-ai-question]') as HTMLInputElement).value = 'Question';
        (root.querySelector('[data-nr-browser-ai-form]') as HTMLFormElement).requestSubmit();
        await vi.waitFor(() => expect(root.dataset.state).toBe('streaming'));

        (root.querySelector('[data-nr-browser-ai-abort]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
    });

    it.each(['QuotaExceededError', 'context-limit'] as const)('moves %s failures to reset-required', async kind => {
        const root = markup();
        const fakes = fixture('available');
        if (kind === 'QuotaExceededError') {
            fakes.browserSession.promptStreaming = vi.fn(() => { throw new DOMException('Full', 'QuotaExceededError'); });
        } else {
            Object.defineProperty(fakes.browserSession, 'contextUsage', {value: 900});
        }
        const subject = controller(root, fakes);
        await subject.start();
        (root.querySelector('[data-nr-browser-ai-question]') as HTMLInputElement).value = 'Question';
        (root.querySelector('[data-nr-browser-ai-form]') as HTMLFormElement).requestSubmit();

        await vi.waitFor(() => expect(root.dataset.state).toBe('reset-required'));
    });

    it('destroys the previous model before synchronously creating its replacement on reset', async () => {
        const root = markup();
        const fakes = fixture('downloadable');
        const order: string[] = [];
        let createCount = 0;
        fakes.create.mockImplementation(async () => {
            order.push('create');
            createCount++;
            if (createCount === 2) {
                Object.defineProperty(fakes.browserSession, 'contextUsage', {value: 10, configurable: true});
            }
            return fakes.browserSession;
        });
        fakes.browserDestroy.mockImplementation(() => { order.push('destroy'); });
        const subject = controller(root, fakes);
        await subject.start();
        (root.querySelector('[data-nr-browser-ai-setup]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
        Object.defineProperty(fakes.browserSession, 'contextUsage', {value: 900, configurable: true});
        (root.querySelector('[data-nr-browser-ai-question]') as HTMLInputElement).value = 'Fill context';
        (root.querySelector('[data-nr-browser-ai-form]') as HTMLFormElement).requestSubmit();
        await vi.waitFor(() => expect(root.dataset.state).toBe('reset-required'));

        (root.querySelector('[data-nr-browser-ai-reset]') as HTMLButtonElement).click();
        expect(order).toEqual(['create', 'destroy', 'create']);
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
    });

    it('discards a transiently failed initialization and creates a fresh session on the next activated submit', async () => {
        const root = markup();
        const fakes = fixture('available');
        fakes.create.mockRejectedValueOnce(new Error('Temporary create failure'));
        const subject = controller(root, fakes);
        await subject.start();
        const input = root.querySelector('[data-nr-browser-ai-question]') as HTMLInputElement;
        const form = root.querySelector('[data-nr-browser-ai-form]') as HTMLFormElement;
        input.value = 'First';
        form.requestSubmit();
        expect(fakes.create).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(root.dataset.state).toBe('error-retryable'));

        (root.querySelector('[data-nr-browser-ai-retry]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
        input.value = 'Second';
        form.requestSubmit();

        expect(fakes.create).toHaveBeenCalledTimes(2);
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));
    });

    it('destroys the model and aborts pending work on page cleanup', async () => {
        const root = markup();
        const fakes = fixture('downloadable');
        const subject = controller(root, fakes);
        await subject.start();
        (root.querySelector('[data-nr-browser-ai-setup]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(root.dataset.state).toBe('ready'));

        subject.destroy();

        expect(fakes.browserDestroy).toHaveBeenCalledTimes(1);
    });
});

describe('Assistant bootstrap', () => {
    it('isolates invalid configuration and derives supported languages for every valid instance', async () => {
        const invalid = markup('invalid');
        invalid.dataset.contextSelector = '[';
        invalid.dataset.contextUsageLimit = '2';
        invalid.dataset.systemPrompt = '   ';
        const valid = markup('valid');
        valid.dataset.contextSelector = 'main';
        valid.dataset.contextUsageLimit = '0.75';
        valid.dataset.systemPrompt = 'Answer in the page language.';
        valid.dataset.supplementalInstruction = 'Kurz.';
        document.documentElement.lang = 'de-DE';
        const fakes = fixture('available');

        const controllers = bootstrapAssistants(document, () => fakes.adapter, () => fakes.provider);
        await flush();

        expect(controllers).toHaveLength(1);
        expect(invalid.dataset.state).toBe('unavailable');
        expect(valid.dataset.state).toBe('ready');
        expect(fakes.availabilitySpy).toHaveBeenCalledWith(expect.objectContaining({
            inputLanguages: ['en', 'de'],
            outputLanguages: ['de'],
        }));
    });

    it('uses English for unsupported or blank page language and destroys all instances on pagehide', async () => {
        const first = markup('first');
        const second = markup('second');
        for (const root of [first, second]) {
            root.dataset.contextSelector = 'main';
            root.dataset.contextUsageLimit = '0.8';
            root.dataset.systemPrompt = 'Answer only from this page.';
        }
        document.documentElement.lang = 'nl-NL';
        const instances = [fixture('downloadable'), fixture('downloadable')];
        let index = 0;

        bootstrapAssistants(document, () => instances[index].adapter, () => instances[index++].provider);
        await flush();
        (first.querySelector('[data-nr-browser-ai-setup]') as HTMLButtonElement).click();
        (second.querySelector('[data-nr-browser-ai-setup]') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(second.dataset.state).toBe('ready'));
        expect(instances[0].availabilitySpy).toHaveBeenCalledWith(expect.objectContaining({inputLanguages: ['en'], outputLanguages: ['en']}));

        window.dispatchEvent(new PageTransitionEvent('pagehide'));
        expect(instances[0].browserDestroy).toHaveBeenCalledTimes(1);
        expect(instances[1].browserDestroy).toHaveBeenCalledTimes(1);
    });
});
