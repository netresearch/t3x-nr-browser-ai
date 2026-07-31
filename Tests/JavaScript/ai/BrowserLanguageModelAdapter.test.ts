import {describe, expect, it, vi} from 'vitest';

import {BrowserLanguageModelAdapter} from '../../../Resources/Private/TypeScript/ai/BrowserLanguageModelAdapter';
import type {Availability, ModelOptions, ModelSession} from '../../../Resources/Private/TypeScript/types';

const modelOptions: ModelOptions = {
    systemPrompt: 'Answer only from the supplied source.',
    inputLanguages: ['de', 'en'],
    outputLanguages: ['de'],
};

const fakeSession: ModelSession = {
    contextUsage: 0,
    contextWindow: 4096,
    measureContextUsage: vi.fn(async () => 0),
    append: vi.fn(async () => undefined),
    promptStreaming: vi.fn(() => new ReadableStream<string>()),
    destroy: vi.fn(),
};

describe('BrowserLanguageModelAdapter', () => {
    it('maps a missing LanguageModel global to unavailable', async () => {
        const adapter = new BrowserLanguageModelAdapter({});

        await expect(adapter.availability(modelOptions)).resolves.toBe('unavailable');
    });

    it.each<Availability>(['unavailable', 'downloadable', 'downloading', 'available'])(
        'maps the browser availability value %s without starting model creation',
        async availability => {
            const create = vi.fn();
            const browserApi = {
                availability: vi.fn(async () => availability),
                create,
            };
            const adapter = new BrowserLanguageModelAdapter({LanguageModel: browserApi});

            await expect(adapter.availability(modelOptions)).resolves.toBe(availability);
            expect(browserApi.availability).toHaveBeenCalledWith({
                expectedInputs: [{type: 'text', languages: ['de', 'en']}],
                expectedOutputs: [{type: 'text', languages: ['de']}],
            });
            expect(create).not.toHaveBeenCalled();
        },
    );

    it('maps an unknown browser availability value to unavailable', async () => {
        const adapter = new BrowserLanguageModelAdapter({
            LanguageModel: {
                availability: vi.fn(async () => 'ready'),
                create: vi.fn(),
            },
        });

        await expect(adapter.availability(modelOptions)).resolves.toBe('unavailable');
    });

    it('passes matching capabilities and the system prompt when creating a model', async () => {
        const create = vi.fn(async () => fakeSession);
        const adapter = new BrowserLanguageModelAdapter({
            LanguageModel: {
                availability: vi.fn(),
                create,
            },
        });

        const session = await adapter.create({...modelOptions, onDownloadProgress: vi.fn()});

        expect(session).toBe(fakeSession);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            expectedInputs: [{type: 'text', languages: ['de', 'en']}],
            expectedOutputs: [{type: 'text', languages: ['de']}],
            initialPrompts: [{role: 'system', content: modelOptions.systemPrompt}],
        }));
    });

    it('forwards finite download progress clamped to zero through one', async () => {
        const progress: number[] = [];
        const adapter = new BrowserLanguageModelAdapter({
            LanguageModel: {
                availability: vi.fn(),
                create: vi.fn(async options => {
                    const listeners: Array<(event: {loaded: number}) => void> = [];
                    options.monitor({
                        addEventListener: (
                            _type: 'downloadprogress',
                            listener: (event: {loaded: number}) => void,
                        ) => listeners.push(listener),
                    });
                    for (const loaded of [-0.5, 0.25, Number.NaN, Number.POSITIVE_INFINITY, 2]) {
                        for (const listener of listeners) {
                            listener({loaded});
                        }
                    }
                    return fakeSession;
                }),
            },
        });

        await adapter.create({...modelOptions, onDownloadProgress: value => progress.push(value)});

        expect(progress).toEqual([0, 0.25, 1]);
    });

    it('rejects creation when the browser API is unavailable', async () => {
        const adapter = new BrowserLanguageModelAdapter({});

        await expect(adapter.create({...modelOptions, onDownloadProgress: vi.fn()}))
            .rejects.toThrow('LanguageModel API is unavailable');
    });
});
