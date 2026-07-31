import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import {resolve} from 'node:path';

import {assistantDocument} from '../Fixtures/AssistantMarkup';

const assistantScript = resolve(process.cwd(), 'Resources/Public/JavaScript/Assistant.js');
const assistantStyles = resolve(process.cwd(), 'Resources/Public/Css/Assistant.css');

test('accessible assistant supports its complete keyboard lifecycle', async ({page}) => {
    await page.setContent(fixture());
    await installLanguageModel(page, 'downloadable');
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-root]');
    const question = root.locator('[data-nr-browser-ai-question]');
    const submit = root.locator('[data-nr-browser-ai-submit]');
    const status = root.locator('[data-nr-browser-ai-status]');
    await expect(root).toHaveAttribute('data-state', 'downloadable');
    await expect(root.locator(':disabled')).toHaveCount(0);
    await expect(root.locator('[data-nr-browser-ai-log]')).not.toHaveAttribute('aria-live');

    await page.keyboard.press('Tab');
    await expect(root.locator('.nr-browser-ai__brand-link')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root.locator('[data-nr-browser-ai-setup]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(question).toBeFocused();

    await question.fill('Bitte abbrechen');
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'streaming');
    await expect(status).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root.locator('[data-nr-browser-ai-abort]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(question).toBeFocused();

    await question.fill('Kontext ausschöpfen');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'reset-required');
    await expect(status).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root.locator('[data-nr-browser-ai-reset]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(question).toBeFocused();

    await question.fill('Erfolgreich abschließen');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(question).toBeFocused();
    await expect(root.locator('[data-nr-browser-ai-announcement]'))
        .toHaveText('Antwort mit https://example.org/quelle');

    const results = await new AxeBuilder({page}).include('[data-nr-browser-ai-root]').analyze();
    expect(results.violations).toEqual([]);
});

test('accessible assistant keeps the unavailable fallback named and violation-free', async ({page}) => {
    await page.setContent(fixture('<p>Alternative information</p>'));
    await installLanguageModel(page, 'unavailable');
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-root]');
    await expect(root).toHaveAttribute('data-state', 'unavailable');
    await expect(root).toHaveAttribute('aria-label', 'Browser AI assistant');
    await expect(root.locator('[data-nr-browser-ai-fallback]')).toBeVisible();
    await expect(root.locator('[data-nr-browser-ai-assistant]')).toBeHidden();
    const results = await new AxeBuilder({page}).include('[data-nr-browser-ai-root]').analyze();
    expect(results.violations).toEqual([]);
});

async function installLanguageModel(page: import('@playwright/test').Page, availability: 'downloadable' | 'unavailable') {
    await page.evaluate(selectedAvailability => {
        let promptCount = 0;
        const session = {
            contextUsage: 0,
            contextWindow: 10_000,
            measureContextUsage: async () => 10,
            append: async () => undefined,
            promptStreaming: (_question: string, options?: {signal?: AbortSignal}) => {
                promptCount++;
                if (promptCount === 2) {
                    throw new DOMException('Full', 'QuotaExceededError');
                }
                if (promptCount >= 3) {
                    return new ReadableStream({
                        start(controller) {
                            controller.enqueue('Antwort mit https://example.org/quelle');
                            controller.close();
                        },
                    });
                }
                return new ReadableStream({
                    start(controller) {
                        options?.signal?.addEventListener('abort', () => {
                            controller.error(new DOMException('Stopped', 'AbortError'));
                        }, {once: true});
                    },
                });
            },
            destroy: () => undefined,
        };
        Object.defineProperty(globalThis, 'LanguageModel', {
            configurable: true,
            value: {
                availability: async () => selectedAvailability,
                create: async (options: {monitor?(monitor: {addEventListener(type: string, listener: (event: {loaded: number}) => void): void}): void}) => {
                    options.monitor?.({
                        addEventListener: (_type, listener) => listener({loaded: 1}),
                    });
                    return session;
                },
            },
        });
    }, availability);
}

function fixture(fallback = ''): string {
    return assistantDocument({
        id: 'nr-browser-ai-42',
        fallback,
        configuration: {
            contextSelector: 'main',
            contextUsageLimit: '0.8',
            systemPrompt: 'Answer only from the page.',
            supplementalInstruction: '',
        },
    });
}
