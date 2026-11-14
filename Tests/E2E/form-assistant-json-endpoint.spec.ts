// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: Netresearch DTT GmbH
import {expect, test} from '@playwright/test';
import {resolve} from 'node:path';

import {formAssistantDocument} from '../Fixtures/FormAssistantMarkup';

const assistantScript = resolve(process.cwd(), 'Resources/Public/JavaScript/Assistant.js');
const assistantStyles = resolve(process.cwd(), 'Resources/Public/Css/Assistant.css');

const ENDPOINT = 'https://data.example.com/v1/forecast';

/**
 * The JSON endpoint data source in a real browser: the form's values reach the
 * configured URL as query parameters named after the form elements, and the
 * answer is laid out as a table. The model and the endpoint are stubbed; no
 * headless runner has a model and a suite should not depend on a third party.
 */
test('a form with a JSON endpoint data source runs against that endpoint', async ({page}) => {
    await page.setContent(formAssistantDocument({action: 'jsonEndpoint', endpoint: ENDPOINT}));
    await page.evaluate(() => {
        Object.defineProperty(globalThis, 'LanguageModel', {
            configurable: true,
            value: {
                availability: async () => 'available',
                create: async () => ({
                    contextUsage: 0,
                    contextWindow: 10_000,
                    measureContextUsage: async () => 10,
                    append: async () => undefined,
                    promptStreaming: () => new ReadableStream(),
                    prompt: async (_input: string, settings?: {responseConstraint?: unknown}) => (
                        settings?.responseConstraint === undefined
                            ? 'It stays dry on Saturday.'
                            : JSON.stringify({
                                queries: [{place: 'Leipzig', forecastDays: 2, dailyVariables: ['temperature_2m_max']}],
                            })
                    ),
                    destroy: () => undefined,
                }),
            },
        });

        const requests: Array<{url: string; init: RequestInit | undefined}> = [];
        (globalThis as unknown as {requests: typeof requests}).requests = requests;
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: async (url: string, init?: RequestInit) => {
                requests.push({url, init});

                return new Response(
                    JSON.stringify({
                        daily: {time: ['2026-08-11', '2026-08-12'], temperature_2m_max: [26.4, 24.1]},
                        daily_units: {temperature_2m_max: '°C'},
                    }),
                    {status: 200, headers: {'content-type': 'application/json'}},
                );
            },
        });
    });
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-form-root]');
    await expect(root).toHaveAttribute('data-state', 'ready');
    await root.locator('[data-nr-browser-ai-form-request]').fill('How warm is it in Leipzig?');
    await root.locator('[data-nr-browser-ai-form-submit]').click();

    await expect(root).toHaveAttribute('data-state', 'filled');

    const requests = await page.evaluate(
        () => (globalThis as unknown as {requests: Array<{url: string; init: {credentials?: string}}>}).requests,
    );
    expect(requests).toHaveLength(1);
    const sent = new URL(requests[0]?.url ?? '');
    expect(sent.origin + sent.pathname).toBe(ENDPOINT);
    expect(sent.searchParams.get('place')).toBe('Leipzig');
    expect(sent.searchParams.get('forecastDays')).toBe('2');
    expect(sent.searchParams.get('dailyVariables')).toBe('temperature_2m_max');
    expect(requests[0]?.init.credentials).toBe('omit');

    const result = root.locator('[data-nr-browser-ai-form-result]');
    await expect(result).toBeVisible();
    await expect(result.locator('tbody tr')).toHaveCount(2);
    await expect(result.locator('thead th').nth(1)).toHaveText('temperature_2m_max (°C)');
});

/** A destination nobody approved never becomes a tool or a request. */
test('an unusable endpoint leaves a plain form that sends nothing', async ({page}) => {
    await page.setContent(formAssistantDocument({action: 'jsonEndpoint', endpoint: 'http://insecure.example.com/x'}));
    await page.addStyleTag({path: assistantStyles});
    await page.addScriptTag({path: assistantScript, type: 'module'});

    const root = page.locator('[data-nr-browser-ai-form-root]');
    await expect(root.locator('form')).toBeVisible();
    await expect(root).not.toHaveAttribute('data-state', /.*/u);
});
