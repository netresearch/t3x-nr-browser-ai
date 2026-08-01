import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

/**
 * Exercises the published demo page as GitHub Pages serves it: real bundle, real
 * relative assets, real module loading.
 */

test('published demo page falls back cleanly when the browser has no model', async ({page}) => {
    await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'LanguageModel', {
            configurable: true,
            value: {availability: async () => 'unavailable'},
        });
    });

    await page.goto('/');

    const root = page.locator('[data-nr-browser-ai-root]');
    await expect(root).toHaveAttribute('data-state', 'unavailable');
    await expect(root.locator('[data-nr-browser-ai-fallback]')).toBeVisible();
    await expect(root.locator('[data-nr-browser-ai-assistant]')).toBeHidden();
    await expect(page.getByRole('heading', {name: 'Your browser cannot run the assistant'}))
        .toBeVisible();
});

test('published demo page activates the assistant when a model is available', async ({page}) => {
    await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'LanguageModel', {
            configurable: true,
            value: {availability: async () => 'downloadable'},
        });
    });

    await page.goto('/');

    const root = page.locator('[data-nr-browser-ai-root]');
    await expect(root).toHaveAttribute('data-state', 'downloadable');
    await expect(root.locator('[data-nr-browser-ai-assistant]')).toBeVisible();
    await expect(root.locator('[data-nr-browser-ai-setup]')).toBeVisible();
    // Controls stay focusable rather than disabled.
    await expect(root.locator(':disabled')).toHaveCount(0);
});

test('published demo page requests nothing from a third party', async ({page}) => {
    const external: string[] = [];
    page.on('request', request => {
        if (!request.url().startsWith('http://127.0.0.1:4173/')) {
            external.push(request.url());
        }
    });

    await page.goto('/', {waitUntil: 'networkidle'});
    await page.evaluate(() => document.fonts.ready);

    expect(external).toEqual([]);
    const loadedFonts = await page.evaluate(
        () => [...document.fonts].filter(face => face.status === 'loaded').length,
    );
    expect(loadedFonts).toBeGreaterThanOrEqual(4);
});

test('published demo page has no accessibility violations', async ({page}) => {
    await page.goto('/');

    const results = await new AxeBuilder({page})
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

    expect(results.violations).toEqual([]);
});
