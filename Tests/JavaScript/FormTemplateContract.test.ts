import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {
    CONFIGURATION_ATTRIBUTES,
    ELEMENT_HOOKS,
    LABEL_ATTRIBUTES,
    SERVER_RENDERED_HOOKS,
} from '../Fixtures/FormAssistantMarkup';

const template = readFileSync(
    resolve(process.cwd(), 'Resources/Private/Templates/FormAssistant/Show.html'),
    'utf8',
);

function attributesIn(source: string, pattern: RegExp): string[] {
    return [...new Set([...source.matchAll(pattern)].map(match => match[0]))].sort();
}

const HOOK_PATTERN = /data-nr-browser-ai-form-[a-z-]+/gu;
const LABEL_PATTERN = /data-label-[a-z-]+/gu;
const CONFIGURATION_PATTERN = /data-(?:form-identifier|form-schema|tool-name|tool-description|action|system-prompt|supplemental-instruction)(?![a-z-])/gu;

/**
 * The fixture is what the unit and end-to-end suites drive the bundle against.
 * If it and the template drift apart, both suites keep passing against markup
 * nobody ships — which is the failure this file exists to prevent.
 */
describe('form assistant template contract', () => {
    it('exposes exactly the element hooks the shared fixture provides', () => {
        expect(attributesIn(template, HOOK_PATTERN))
            .toEqual([...ELEMENT_HOOKS, ...SERVER_RENDERED_HOOKS].sort());
    });

    it('exposes exactly the label attributes the shared fixture provides', () => {
        expect(attributesIn(template, LABEL_PATTERN)).toEqual([...LABEL_ATTRIBUTES].sort());
    });

    it('exposes exactly the configuration attributes the shared fixture provides', () => {
        expect(attributesIn(template, CONFIGURATION_PATTERN)).toEqual([...CONFIGURATION_ATTRIBUTES].sort());
    });

    /**
     * The form is the plugin's content, not an enhancement, so it must not sit
     * inside the block that stays hidden until a model reports itself usable.
     */
    it('keeps the form outside the block that hides without a model', () => {
        const assistantBlock = /data-nr-browser-ai-form-assistant hidden>([\s\S]*?)<\/div>/u.exec(template);

        expect(assistantBlock?.[1] ?? '').not.toContain('formvh:render');
        expect(template).toContain('data-nr-browser-ai-form-fields');
    });

    it('announces a finished call through the dedicated live region', () => {
        expect(template).toMatch(
            /data-nr-browser-ai-form-announcement[^>]*aria-live="polite"[^>]*aria-atomic="true"/u,
        );
    });

    it('escapes every value it transports', () => {
        for (const attribute of ['formSchema', 'toolName', 'toolDescription', 'action', 'systemPrompt']) {
            expect(template).toContain(`{${attribute} -> f:format.htmlspecialchars()}`);
        }
    });
});
