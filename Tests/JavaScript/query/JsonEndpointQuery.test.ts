// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: Netresearch DTT GmbH
import {describe, expect, it} from 'vitest';

import {JsonEndpointQuery} from '../../../Resources/Private/TypeScript/query/JsonEndpointQuery';

interface Call {
    url: string;
    init: RequestInit | undefined;
}

function respond(body: string, status = 200): {fetch: (url: string, init?: RequestInit) => Promise<Response>; calls: Call[]} {
    const calls: Call[] = [];

    return {
        calls,
        fetch: (url, init) => {
            calls.push({url, init});

            return Promise.resolve(new Response(body, {status}));
        },
    };
}

const ENDPOINT = 'https://air-quality-api.example.com/v1/air-quality';

describe('JsonEndpointQuery', () => {
    it.each([
        'http://air.example.com/x',
        'https://user:secret@air.example.com/x',
        'https://air.example.com:8443/x',
        'https://air.example.com/x?key=1',
        'https://air.example.com/x#frag',
        'javascript:alert(1)',
        'not a url',
        '',
    ])('refuses the address %j', address => {
        expect(new JsonEndpointQuery(address).isUsable()).toBe(false);
    });

    it('sends the form values as query parameters and nothing else', async () => {
        const answer = respond('{"hourly":{"time":["t1","t2"],"pm10":[1,2]},"hourly_units":{"pm10":"µg/m³"}}');
        const query = new JsonEndpointQuery(ENDPOINT, answer.fetch);

        const outcome = await query.run({latitude: 52.5, hourly: ['pm10', 'pm2_5'], past_days: 0, detailed: true});

        const sent = new URL(answer.calls[0]?.url ?? '');
        expect(sent.origin + sent.pathname).toBe(ENDPOINT);
        expect(Object.fromEntries(sent.searchParams)).toEqual({
            latitude: '52.5',
            hourly: 'pm10,pm2_5',
            past_days: '0',
            detailed: 'true',
        });
        expect(answer.calls[0]?.init).toMatchObject({
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            redirect: 'error',
        });
        expect(outcome.ok).toBe(true);
    });

    it('lays an object of arrays out as a table with its units', async () => {
        const answer = respond('{"hourly":{"time":["t1","t2"],"pm10":[1,null]},"hourly_units":{"pm10":"µg/m³"}}');

        const outcome = await new JsonEndpointQuery(ENDPOINT, answer.fetch).run({});

        expect(outcome.blocks).toEqual([
            {key: 'hourly', times: ['t1', 't2'], columns: [{name: 'pm10', unit: 'µg/m³', values: [1, null]}]},
        ]);
        expect(outcome.summary).toContain('hourly: time, pm10 in µg/m³');
        expect(outcome.summary).toContain('t1, 1');
        expect(outcome.summary).toContain('t2, —');
    });

    it('shows top-level scalars as one row', async () => {
        const answer = respond('{"elevation":34,"name":"Leipzig","nested":{"a":1}}');

        const outcome = await new JsonEndpointQuery(ENDPOINT, answer.fetch).run({});

        expect(outcome.blocks).toEqual([
            {
                key: 'result',
                times: [''],
                columns: [
                    {name: 'elevation', unit: '', values: [34]},
                    {name: 'name', unit: '', values: ['Leipzig']},
                ],
            },
        ]);
    });

    it('reports an answer without anything tabular as a success with no blocks', async () => {
        const outcome = await new JsonEndpointQuery(ENDPOINT, respond('[1,2,3]').fetch).run({});

        expect(outcome.ok).toBe(true);
        expect(outcome.blocks).toEqual([]);
    });

    it('never puts markup from the answer anywhere but into cell values', async () => {
        const answer = respond('{"<img src=x onerror=alert(1)>":"<script>1</script>"}');

        const outcome = await new JsonEndpointQuery(ENDPOINT, answer.fetch).run({});

        expect(outcome.blocks[0]?.columns[0]).toEqual({
            name: '<img src=x onerror=alert(1)>',
            unit: '',
            values: ['<script>1</script>'],
        });
    });

    it.each([
        [429, 'rate-limited'],
        [500, 'failed'],
    ] as const)('maps status %d to %s', async (status, failure) => {
        const outcome = await new JsonEndpointQuery(ENDPOINT, respond('{}', status).fetch).run({});

        expect(outcome).toMatchObject({ok: false, failure});
    });

    it('rejects an answer that is not JSON', async () => {
        const outcome = await new JsonEndpointQuery(ENDPOINT, respond('<html>').fetch).run({});

        expect(outcome).toMatchObject({ok: false, failure: 'failed'});
    });

    it('rejects an oversized answer without parsing it', async () => {
        const outcome = await new JsonEndpointQuery(ENDPOINT, respond(`"${'x'.repeat(600 * 1024)}"`).fetch).run({});

        expect(outcome).toMatchObject({ok: false, failure: 'failed'});
    });

    it('does not request anything through an unusable address', async () => {
        const answer = respond('{}');

        const outcome = await new JsonEndpointQuery('http://insecure.example.com', answer.fetch).run({});

        expect(outcome.ok).toBe(false);
        expect(answer.calls).toEqual([]);
    });
});
