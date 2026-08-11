import {describe, expect, it, vi} from 'vitest';

import {OpenMeteoQuery} from '../../../Resources/Private/TypeScript/query/OpenMeteoQuery';

const PLACE = {
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

function jsonResponse(payload: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    } as unknown as Response;
}

function fetchStub(...responses: Response[]): {
    calls: string[];
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
} {
    const calls: string[] = [];
    const queue = [...responses];

    return {
        calls,
        fetch: async (input: string) => {
            calls.push(input);
            const next = queue.shift();
            if (next === undefined) {
                throw new Error(`unexpected request to ${input}`);
            }

            return next;
        },
    };
}

const values = {
    place: 'Leipzig',
    forecastDays: 2,
    dailyVariables: ['temperature_2m_max', 'precipitation_sum'],
    temperatureUnit: 'celsius',
    timezone: 'auto',
};

describe('OpenMeteoQuery', () => {
    it('resolves the place and asks for the selected variables', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse(FORECAST));

        const outcome = await new OpenMeteoQuery('de', stub.fetch).run(values);

        expect(outcome.ok).toBe(true);
        expect(stub.calls[0]).toContain('geocoding-api.open-meteo.com');
        expect(stub.calls[0]).toContain('name=Leipzig');
        expect(stub.calls[0]).toContain('language=de');

        const forecast = new URL(stub.calls[1] ?? '');
        expect(forecast.searchParams.get('latitude')).toBe('51.34');
        expect(forecast.searchParams.get('daily')).toBe('temperature_2m_max,precipitation_sum');
        expect(forecast.searchParams.get('temperature_unit')).toBe('celsius');
        expect(forecast.searchParams.get('forecast_days')).toBe('2');
    });

    it('turns the answer into one block with a column per variable', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse(FORECAST));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run(values);

        expect(outcome.blocks).toHaveLength(1);
        expect(outcome.blocks[0]?.times).toEqual(['2026-08-11', '2026-08-12']);
        expect(outcome.blocks[0]?.columns).toEqual([
            {name: 'temperature_2m_max', unit: '°C', values: [26.4, 24.1]},
            {name: 'precipitation_sum', unit: 'mm', values: [0, 3.2]},
        ]);
    });

    /** The caller is a model, so the summary names units once and then numbers. */
    it('summarises the result as text the caller can read', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse(FORECAST));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run(values);

        expect(outcome.summary).toContain('Leipzig, Germany');
        expect(outcome.summary).toContain('temperature_2m_max in °C');
        expect(outcome.summary).toContain('2026-08-12, 24.1, 3.2');
    });

    it('says so when the place is not found, without asking for a forecast', async () => {
        const stub = fetchStub(jsonResponse({}));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run(values);

        expect(outcome).toMatchObject({ok: false, failure: 'unresolved-place'});
        expect(outcome.summary).toContain('Leipzig');
        expect(stub.calls).toHaveLength(1);
    });

    it('does not look anything up without a place', async () => {
        const stub = fetchStub();

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run({place: '  '});

        expect(outcome).toMatchObject({ok: false, failure: 'unresolved-place'});
        expect(stub.calls).toHaveLength(0);
    });

    /** A refused request is a different situation from an unreachable source. */
    it('reports rate limiting as such', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse({}, 429));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run(values);

        expect(outcome).toMatchObject({ok: false, failure: 'rate-limited'});
    });

    it('reports any other failure as a failed query', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse({}, 500));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run(values);

        expect(outcome).toMatchObject({ok: false, failure: 'failed'});
    });

    it('reports an unreachable source rather than throwing', async () => {
        const outcome = await new OpenMeteoQuery('en', vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        })).run(values);

        expect(outcome).toMatchObject({ok: false, failure: 'failed'});
    });

    it('leaves out a block that was not asked for', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse(FORECAST));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run({
            ...values,
            hourlyVariables: [],
        });

        expect(new URL(stub.calls[1] ?? '').searchParams.get('hourly')).toBeNull();
        expect(outcome.blocks.map(block => block.key)).toEqual(['daily']);
    });

    it('renders a missing measurement as a gap rather than a zero', async () => {
        const stub = fetchStub(jsonResponse(PLACE), jsonResponse({
            daily: {time: ['2026-08-11'], temperature_2m_max: [null]},
            daily_units: {},
        }));

        const outcome = await new OpenMeteoQuery('en', stub.fetch).run({
            ...values,
            dailyVariables: ['temperature_2m_max'],
        });

        expect(outcome.blocks[0]?.columns[0]?.values).toEqual([null]);
        expect(outcome.summary).toContain('—');
    });
});
