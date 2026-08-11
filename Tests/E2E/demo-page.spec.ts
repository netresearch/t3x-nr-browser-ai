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

// Both languages and both colour schemes. A light-only audit of one page says
// nothing about the other three combinations: a dark palette is a separate set
// of colour pairs, and the German page is a separate render. The same audit run
// across the sibling Netresearch sites found 243 contrast failures that their
// markup-level gates had passed.
for (const route of ['/', '/de/']) {
    for (const colorScheme of ['light', 'dark'] as const) {
        test(`published demo page ${route} has no accessibility violations in ${colorScheme} mode`,
            async ({page}) => {
                await page.emulateMedia({colorScheme});
                await page.goto(route);

                const results = await new AxeBuilder({page})
                    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
                    .analyze();

                expect(results.violations).toEqual([]);
            });
    }
}

// An axe run on a page whose stylesheet 404ed finds no contrast failures at all
// and passes for the wrong reason, so a silent asset error has to fail on its
// own. The third-party test above watches what the page reaches for; this one
// watches whether it got it.
for (const route of ['/', '/de/']) {
    test(`published demo page ${route} serves every asset it requests`, async ({page}) => {
        const broken: string[] = [];
        page.on('response', response => {
            if (response.status() >= 400) {
                broken.push(`${response.status()} ${response.url()}`);
            }
        });

        await page.goto(route, {waitUntil: 'networkidle'});

        expect(broken).toEqual([]);
    });
}
