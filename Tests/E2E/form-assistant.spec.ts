import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {resolve} from 'node:path';

import {formAssistantDocument} from '../Fixtures/FormAssistantMarkup';

const assistantScript = resolve(process.cwd(), 'Resources/Public/JavaScript/Assistant.js');
const assistantStyles = resolve(process.cwd(), 'Resources/Public/Css/Assistant.css');

const GEOCODING = {
    results: [{
        name: 'Leipzig',
        country: 'Germany',
        latitude: 51.34,
        longitude: 12.37,
        timezone: 'Europe/Berlin',
    }],
};

const FORECAST = {
    daily: {
        time: ['2026-08-11', '2026-08-12'],
        temperature_2m_max: [26.4, 24.1],
        precipitation_sum: [0, 3.2],
    },
    daily_units: {temperature_2m_max: '°C', precipitation_sum: 'mm'},
};

/**
 * The whole chain in a real browser: a sentence, structured output constrained
 * by the form's schema, a tool call, the visible controls changing, and a
 * result built from what the source returned.
 *
 * Both ends are stubbed — the model because no headless runner has one, the
 * data source because a suite that depends on a third party is a suite that
 * fails for reasons of its own.
 */
test('the whole chain runs and leaves the derivation on screen', async ({page}) => {
    await page.setContent(formAssistantDocument());
    await installLanguageModel(page, 'available');
    await installDataSource(page);
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-form-root]');
    await expect(root).toHaveAttribute('data-state', 'ready');

    await root.locator('[data-nr-browser-ai-form-request]').fill('Wie warm wird es in Leipzig?');
    await root.locator('[data-nr-browser-ai-form-submit]').click();

    await expect(root).toHaveAttribute('data-state', 'filled');
    await expect(root.locator('input[name$="[place]"]')).toHaveValue('Leipzig');
    await expect(root.locator('input[name$="[forecastDays]"]')).toHaveValue('2');
    await expect(root.locator('input[value="temperature_2m_max"]')).toBeChecked();

    const result = root.locator('[data-nr-browser-ai-form-result]');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Leipzig, Germany');
    await expect(result.locator('tbody tr')).toHaveCount(2);
    await expect(result.locator('thead th').nth(1)).toHaveText('temperature_2m_max (°C)');

    await expect(root.locator('[data-nr-browser-ai-form-call]')).toContainText('"place": "Leipzig"');
});

test('the form is operable by keyboard and free of accessibility violations', async ({page}) => {
    await page.setContent(formAssistantDocument());
    await installLanguageModel(page, 'available');
    await installDataSource(page);
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-form-root]');
    await expect(root).toHaveAttribute('data-state', 'ready');
    await expect(root.locator(':disabled')).toHaveCount(0);

    await page.keyboard.press('Tab');
    await expect(root.locator('[data-nr-browser-ai-form-request]')).toBeFocused();
    await page.keyboard.type('Wie warm wird es in Leipzig?');
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('data-state', 'filled');

    const results = await new AxeBuilder({page}).include('[data-nr-browser-ai-form-root]').analyze();
    expect(results.violations).toEqual([]);
});

/**
 * The form is the plugin's content rather than an enhancement, so a browser
 * without a model keeps it usable and running it must not need the model.
 */
test('the form still works where no model is available', async ({page}) => {
    await page.setContent(formAssistantDocument());
    await installLanguageModel(page, 'unavailable');
    await installDataSource(page);
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-form-root]');
    await expect(root).toHaveAttribute('data-state', 'unavailable');
    await expect(root.locator('.nr-browser-ai-form__request')).toBeHidden();
    await expect(root.locator('form')).toBeVisible();

    await root.locator('input[name$="[place]"]').fill('Leipzig');
    await root.locator('input[value="temperature_2m_max"]').check();
    await root.locator('form button[type=submit]').click();

    await expect(root.locator('[data-nr-browser-ai-form-result]')).toContainText('Leipzig, Germany');

    const results = await new AxeBuilder({page}).include('[data-nr-browser-ai-form-root]').analyze();
    expect(results.violations).toEqual([]);
});

test('a place the source does not know is named as such', async ({page}) => {
    await page.setContent(formAssistantDocument());
    await installLanguageModel(page, 'available');
    await installDataSource(page, {geocoding: {}});
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-form-root]');
    await root.locator('[data-nr-browser-ai-form-request]').fill('Wetter in Atlantis');
    await root.locator('[data-nr-browser-ai-form-submit]').click();

    await expect(root).toHaveAttribute('data-state', 'unresolvedPlace');
    await expect(root.locator('[data-nr-browser-ai-form-result]')).toBeHidden();
});

/**
 * The same tool the page's own session calls has to be reachable by an agent,
 * with the identical schema.
 */
test('the tool is offered to the browser model context', async ({page}) => {
    await page.setContent(formAssistantDocument());
    await installModelContext(page);
    await installLanguageModel(page, 'available');
    await installDataSource(page);
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const registered = await page.evaluate(() => (globalThis as unknown as {
        registeredTool?: {name: string; description: string; inputSchema: {properties: Record<string, unknown>}};
    }).registeredTool);

    expect(registered?.name).toBe('nr_browser_ai_weatherQuery');
    expect(Object.keys(registered?.inputSchema.properties ?? {})).toContain('place');

    const answer = await page.evaluate(async () => (await (globalThis as unknown as {
        callRegisteredTool(input: unknown): Promise<string>;
    }).callRegisteredTool({place: 'Leipzig', forecastDays: 2})));

    expect(answer).toContain('Leipzig, Germany');
    await expect(page.locator('input[name$="[place]"]')).toHaveValue('Leipzig');
});

async function installLanguageModel(page: Page, availability: 'available' | 'unavailable'): Promise<void> {
    await page.evaluate(selected => {
        Object.defineProperty(globalThis, 'LanguageModel', {
            configurable: true,
            value: {
                availability: async () => selected,
                create: async () => ({
                    contextUsage: 0,
                    contextWindow: 10_000,
                    measureContextUsage: async () => 10,
                    append: async () => undefined,
                    promptStreaming: () => new ReadableStream(),
                    // Stands in for a constrained model: the arguments it
                    // returns are the ones the schema allows.
                    prompt: async () => JSON.stringify({
                        place: 'Leipzig',
                        forecastDays: 2,
                        dailyVariables: ['temperature_2m_max', 'precipitation_sum'],
                    }),
                    destroy: () => undefined,
                }),
            },
        });
    }, availability);
}

async function installDataSource(
    page: Page,
    payloads: {geocoding?: unknown; forecast?: unknown} = {},
): Promise<void> {
    await page.evaluate(([geocoding, forecast]) => {
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: async (input: string) => new Response(
                JSON.stringify(input.includes('geocoding') ? geocoding : forecast),
                {status: 200, headers: {'content-type': 'application/json'}},
            ),
        });
    }, [payloads.geocoding ?? GEOCODING, payloads.forecast ?? FORECAST]);
}

async function installModelContext(page: Page): Promise<void> {
    await page.evaluate(() => {
        Object.defineProperty(document, 'modelContext', {
            configurable: true,
            value: {
                registerTool: (tool: {
                    name: string;
                    description: string;
                    inputSchema: unknown;
                    execute(input: unknown): Promise<string>;
                }) => {
                    const scope = globalThis as unknown as Record<string, unknown>;
                    scope['registeredTool'] = {
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    };
                    scope['callRegisteredTool'] = (input: unknown) => tool.execute(input);
                },
            },
        });
    });
}
