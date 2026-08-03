import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {
    assistantSection,
    CONFIGURATION_ATTRIBUTES,
    ELEMENT_HOOKS,
    ENGLISH_LABELS,
    LABEL_ATTRIBUTES,
    SERVER_RENDERED_HOOKS,
} from '../Fixtures/AssistantMarkup';
import {ChatController} from '../../Resources/Private/TypeScript/ui/ChatController';
import type {PageContextProvider} from '../../Resources/Private/TypeScript/context/PageContextProvider';
import type {LanguageModelAdapter} from '../../Resources/Private/TypeScript/types';

// Vitest runs from the repository root, matching how the E2E suite resolves assets.
const template = readFileSync(
    resolve(process.cwd(), 'Resources/Private/Templates/Assistant/Show.html'),
    'utf8',
);
const demoPage = readFileSync(resolve(process.cwd(), 'demo/index.html'), 'utf8');

function attributesIn(source: string, pattern: RegExp): string[] {
    return [...new Set([...source.matchAll(pattern)].map(match => match[0]))].sort();
}

const HOOK_PATTERN = /data-nr-browser-ai-[a-z-]+/gu;
const LABEL_PATTERN = /data-label-[a-z-]+/gu;
const CONFIGURATION_PATTERN = /data-(?:context-selector|context-usage-limit|system-prompt|supplemental-instruction)/gu;

describe('assistant template contract', () => {
    it('exposes exactly the element hooks the shared fixture provides', () => {
        expect(attributesIn(template, HOOK_PATTERN))
            .toEqual([...ELEMENT_HOOKS, ...SERVER_RENDERED_HOOKS].sort());
    });

    it('exposes exactly the label attributes the shared fixture provides', () => {
        expect(attributesIn(template, LABEL_PATTERN)).toEqual(Object.values(LABEL_ATTRIBUTES).sort());
    });

    it('exposes exactly the configuration attributes the shared fixture provides', () => {
        expect(attributesIn(template, CONFIGURATION_PATTERN)).toEqual([...CONFIGURATION_ATTRIBUTES].sort());
    });

    it('keeps the streaming log outside a live region and announces through the dedicated element', () => {
        expect(template).toMatch(
            /data-nr-browser-ai-announcement[^>]*aria-live="polite"[^>]*aria-atomic="true"/u,
        );
        expect(/data-nr-browser-ai-log[^>]*aria-live/u.test(template)).toBe(false);
        expect([...template.matchAll(/aria-live=/gu)]).toHaveLength(1);
    });

    it('is reproduced faithfully by the published demo page', () => {
        // The demo runs the real bundle, so a demo that drifts from the template
        // would advertise a component the extension no longer renders.
        expect(attributesIn(demoPage, HOOK_PATTERN)).toEqual(attributesIn(template, HOOK_PATTERN));
        expect(attributesIn(demoPage, LABEL_PATTERN)).toEqual(attributesIn(template, LABEL_PATTERN));
        expect(attributesIn(demoPage, CONFIGURATION_PATTERN))
            .toEqual(attributesIn(template, CONFIGURATION_PATTERN));
    });

    it('satisfies every element the controller requires', () => {
        document.body.innerHTML = `<main>${assistantSection({labels: ENGLISH_LABELS})}</main>`;
        const root = document.querySelector<HTMLElement>('[data-nr-browser-ai-root]');
        expect(root).not.toBeNull();

        const adapter: LanguageModelAdapter = {
            availability: async () => 'unavailable',
            create: async () => {
                throw new Error('not expected');
            },
        };
        const provider: PageContextProvider = {
            getContext: async () => ({title: '', language: '', sections: [], wasTruncated: false}),
            fitToBudget: async context => structuredClone(context),
        };

        // Throws "Required assistant element is missing" when a hook is absent.
        expect(() => new ChatController(root!, adapter, provider, {
            contextSelector: 'main',
            contextUsageLimit: 0.8,
            systemPrompt: 'Answer only from the supplied page.',
            supplementalInstruction: '',
            inputLanguages: ['en'],
            outputLanguages: ['en'],
            labels: ENGLISH_LABELS,
        })).not.toThrow();
    });
});
