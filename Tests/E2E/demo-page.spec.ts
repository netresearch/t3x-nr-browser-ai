// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: Netresearch DTT GmbH
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function chooseTheme(page: Page, preference: string) {
    const picker = page.locator('[data-nr-theme-picker]');
    if (!await picker.evaluate((element: HTMLDetailsElement) => element.open)) {
        await picker.locator('summary').click();
    }
    await picker.locator(`input[value="${preference}"]`).check();
}

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

for (const route of ['/', '/de/']) {
    for (const adaptation of ['200% text', 'WCAG text spacing']) {
        test(`text adaptation: ${route} preserves content with ${adaptation} at 320px`, async ({page}) => {
            await page.setViewportSize({width: 320, height: 900});
            await page.goto(route, {waitUntil: 'networkidle'});
            await page.evaluate(() => document.fonts.ready);
            if (adaptation === '200% text') {
                await page.evaluate(() => {
                    // Snapshot every size first: px-based labels and native controls
                    // must enlarge too, without multiplying inherited sizes twice.
                    const sizes = [...document.querySelectorAll<HTMLElement>('body, body *')]
                        .map((element) => [element, Number.parseFloat(getComputedStyle(element).fontSize)] as const);
                    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
                });
            } else {
                await page.addStyleTag({content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}'});
            }
            await page.locator('[data-nr-theme-trigger]').click();
            await expect(page.locator('[data-nr-theme-option]').first()).toBeVisible();
            const state = await page.evaluate(() => ({
                width: document.documentElement.scrollWidth,
                clipped: [...document.querySelectorAll<HTMLElement>('.capability-card dt, .capability-card dd')]
                    .filter((element) => {
                        const bounds = element.getBoundingClientRect();
                        const card = element.closest('.capability-card')!.getBoundingClientRect();
                        return bounds.left < card.left - 1 || bounds.right > card.right + 1
                            || element.scrollWidth > element.clientWidth + 1;
                    }).map((element) => element.textContent?.trim()),
            }));
            expect(state.clipped).toEqual([]);
            expect(state.width).toBe(320);
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

for (const route of ['/', '/de/']) {
    test(`mobile page ${route} preserves theme choices, System and native disclosure focus`, async ({page}) => {
        await page.setViewportSize({width: 320, height: 900});
        await page.emulateMedia({colorScheme: 'light'});
        await page.goto(route);
        const picker = page.locator('[data-nr-theme-picker]');
        const menu = page.locator('[data-nr-mobile-menu]');
        await expect(page.locator('.nr-shell-locales')).toBeVisible();
        await expect(menu).not.toHaveAttribute('open');
        await chooseTheme(page, 'dark');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('html')).toHaveClass(/dark/);
        await page.reload();
        await expect(picker.locator('input[value="dark"]')).toBeChecked();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.evaluate(() => localStorage.setItem('nrllm-theme', 'dark'));
        await chooseTheme(page, 'system');
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await page.emulateMedia({colorScheme: 'dark'});
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.locator('[data-nr-theme-trigger]').click();
        await page.keyboard.press('Escape');
        await expect(picker).not.toHaveAttribute('open');
        await expect(page.locator('[data-nr-theme-trigger]')).toBeFocused();
        await menu.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(menu).toHaveAttribute('open', '');
        await page.keyboard.press('Escape');
        await expect(menu).not.toHaveAttribute('open');
        await expect(menu.locator('summary')).toBeFocused();
        const local = page.locator('[data-nr-page-menu]');
        await local.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(local.locator('a').first()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(local).not.toHaveAttribute('open');
        await expect(local.locator('summary')).toBeFocused();
    });
}

test.describe('navigation without JavaScript', () => {
    test.use({javaScriptEnabled: false});
    for (const route of ['/', '/de/']) {
        test(`native navigation remains available on ${route} at 320px`, async ({page}) => {
            await page.setViewportSize({width: 320, height: 900});
            await page.goto(route);
            const skip = page.locator('.skip-link');
            await skip.focus();
            expect(await skip.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return element.contains(document.elementFromPoint(rect.left + 8, rect.top + 8));
            })).toBe(true);
            const localMenu = page.locator('[data-nr-page-menu]');
            await localMenu.locator('summary').click();
            await expect(localMenu.locator('a').first()).toBeVisible();
            await expect(page.locator('.nr-shell-locales')).toBeVisible();
            await expect(page.locator('[data-nr-theme-picker]')).toBeHidden();
            const menu = page.locator('[data-nr-mobile-menu]');
            await menu.locator('summary').click();
            await expect(menu.locator('nav a').first()).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
        });
    }
});
