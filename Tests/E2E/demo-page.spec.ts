// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: Netresearch DTT GmbH
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
      for (const width of [320, 1280]) {
        test(`published demo page ${route} has no accessibility violations in ${colorScheme} mode at ${width}px`,
            async ({page}) => {
                await page.setViewportSize({width, height: 900});
                await page.emulateMedia({colorScheme});
                await page.goto(route);

                const results = await new AxeBuilder({page})
                    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'])
                    .analyze();

                expect(results.violations).toEqual([]);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
            });
      }
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

for (const route of ['/', '/de/']) {
    test(`mobile page ${route} preserves its appearance preference and closes the menu with Escape`, async ({page}) => {
        await page.setViewportSize({width: 320, height: 900});
        await page.goto(route);
        const menu = page.locator('.menu-toggle');
        await expect(page.locator('.language-switch')).toBeVisible();
        await expect(page.locator('#site-navigation')).toBeHidden();
        await menu.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        await page.locator('[data-theme-control]').selectOption('dark');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await menu.click();
        await page.keyboard.press('Escape');
        await expect(page.locator('#site-navigation')).toBeHidden();
        await expect(menu).toBeFocused();
    });
}


test.describe('navigation without JavaScript', () => {
    test.use({javaScriptEnabled: false});
    for (const route of ['/', '/de/']) {
        test(`all navigation links remain available on ${route} at 320px`, async ({page}) => {
            await page.setViewportSize({width: 320, height: 900});
            await page.goto(route);
            await expect(page.locator('#site-navigation')).toBeVisible();
            await expect(page.locator('#site-navigation a').first()).toBeVisible();
            await expect(page.locator('.language-switch')).toBeVisible();
            await expect(page.locator('.menu-toggle')).toBeHidden();
            await expect(page.locator('.theme-control')).toBeHidden();
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
        });
    }
});
