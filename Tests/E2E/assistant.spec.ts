import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import {resolve} from 'node:path';

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
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Assistant fixture</title></head><body>
<main><article><h1>Current page</h1><p>Grounded page content.</p></article>
<section id="nr-browser-ai-42" class="nr-browser-ai" aria-label="Browser AI assistant"
 data-nr-browser-ai-root data-context-selector="main" data-context-usage-limit="0.8"
 data-system-prompt="Answer only from the page." data-supplemental-instruction=""
 data-label-checking="Checking browser AI availability…"
 data-label-downloadable="Browser AI needs to be set up before use."
 data-label-downloading="Setting up browser AI…" data-label-ready="Browser AI is ready."
 data-label-streaming="Generating an answer…"
 data-label-reset-required="The model context is full. Reset the conversation to continue."
 data-label-error-retryable="Browser AI could not be reached. You can retry."
 data-label-unavailable="Browser AI is unavailable in this browser."
 data-label-new-tab="Opens in a new tab.">
 <div data-nr-browser-ai-fallback>${fallback}</div>
 <div data-nr-browser-ai-assistant hidden>
  <header class="nr-browser-ai__header"><a class="nr-browser-ai__brand-link" href="https://www.netresearch.de/" aria-label="Netresearch DTT GmbH"><img class="nr-browser-ai__symbol" alt="" width="48" height="48" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Cpath fill='%232F99A4' d='M0 0h1v1H0z'/%3E%3C/svg%3E"></a><h2 id="nr-browser-ai-42-title" class="nr-browser-ai__title">Browser AI assistant</h2></header>
  <p id="nr-browser-ai-42-status" class="nr-browser-ai__status" data-nr-browser-ai-status role="status" aria-atomic="true" tabindex="-1"></p>
  <button class="nr-browser-ai__button nr-browser-ai__button--primary" type="button" data-nr-browser-ai-setup>Set up browser AI</button>
  <progress class="nr-browser-ai__progress" data-nr-browser-ai-progress max="1" value="0" aria-label="Browser AI model download"></progress>
  <div class="nr-browser-ai__log" data-nr-browser-ai-log></div>
  <p class="nr-browser-ai__visually-hidden" data-nr-browser-ai-announcement aria-live="polite" aria-atomic="true"></p>
  <form class="nr-browser-ai__form" data-nr-browser-ai-form><label class="nr-browser-ai__label" for="nr-browser-ai-42-question">Your question</label><div class="nr-browser-ai__input-row"><input class="nr-browser-ai__input" id="nr-browser-ai-42-question" data-nr-browser-ai-question autocomplete="off" required aria-describedby="nr-browser-ai-42-status"><button class="nr-browser-ai__button nr-browser-ai__button--primary" type="submit" data-nr-browser-ai-submit>Ask</button></div></form>
  <div class="nr-browser-ai__actions"><button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-abort>Stop response</button><button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-reset>Reset conversation</button><button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-retry>Retry</button></div>
  <footer class="nr-browser-ai__footer"><a href="https://www.netresearch.de/">Netresearch DTT GmbH</a></footer>
 </div>
</section></main></body></html>`;
}
