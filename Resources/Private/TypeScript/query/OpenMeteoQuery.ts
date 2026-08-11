import type {FormValues} from '../form/FormSchema';
import type {ActionOutcome, FormAction, ResolvedPlace, ResultBlock, ResultColumn} from './FormAction';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Rows beyond this are rendered but left out of the caller's summary. */
const SUMMARY_ROW_LIMIT = 24;

const BLOCKS: ReadonlyArray<readonly [string, string]> = [
    ['current', 'currentVariables'],
    ['daily', 'dailyVariables'],
    ['hourly', 'hourlyVariables'],
];

const SCALAR_PARAMETERS: ReadonlyArray<readonly [string, string]> = [
    ['models', 'weatherModel'],
    ['temperature_unit', 'temperatureUnit'],
    ['wind_speed_unit', 'windSpeedUnit'],
    ['precipitation_unit', 'precipitationUnit'],
    ['timezone', 'timezone'],
    ['cell_selection', 'cellSelection'],
    ['past_days', 'pastDays'],
    ['forecast_days', 'forecastDays'],
];

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The only module that knows the data source.
 *
 * It resolves the place name to coordinates, asks for the forecast and turns
 * the answer into blocks the renderer can lay out and a summary the caller can
 * read. Everything above it works in terms of form values, so exchanging the
 * source means exchanging this file.
 */
export class OpenMeteoQuery implements FormAction {
    public constructor(
        private readonly language: string,
        private readonly fetchResource: Fetch = (input, init) => fetch(input, init),
    ) {}

    public async run(values: FormValues, signal?: AbortSignal): Promise<ActionOutcome> {
        const place = String(values['place'] ?? '').trim();
        if (place.length === 0) {
            return failure('unresolved-place', 'No place was given, so nothing could be looked up.');
        }

        let resolved: ResolvedPlace | undefined;
        try {
            resolved = await this.resolvePlace(place, signal);
        } catch (error: unknown) {
            return this.transportFailure(error);
        }
        if (resolved === undefined) {
            return failure(
                'unresolved-place',
                `No place named "${place}" was found. Try a larger nearby place, or add the country.`,
            );
        }

        let payload: Record<string, unknown>;
        try {
            payload = await this.requestForecast(resolved, values, signal);
        } catch (error: unknown) {
            return this.transportFailure(error);
        }

        const blocks = this.blocksFrom(payload, values);

        return {
            ok: true,
            summary: this.summarize(resolved, blocks),
            place: resolved,
            blocks,
        };
    }

    private async resolvePlace(place: string, signal?: AbortSignal): Promise<ResolvedPlace | undefined> {
        const url = new URL(GEOCODING_URL);
        url.searchParams.set('name', place);
        url.searchParams.set('count', '1');
        url.searchParams.set('format', 'json');
        url.searchParams.set('language', this.language);

        const payload = await this.requestJson(url, signal);
        const results = payload['results'];
        if (!Array.isArray(results) || results.length === 0) {
            return undefined;
        }
        const first = results[0] as Record<string, unknown>;
        const latitude = Number(first['latitude']);
        const longitude = Number(first['longitude']);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return undefined;
        }

        return {
            name: String(first['name'] ?? place),
            country: String(first['country'] ?? ''),
            latitude,
            longitude,
            timezone: String(first['timezone'] ?? ''),
        };
    }

    private async requestForecast(
        place: ResolvedPlace,
        values: FormValues,
        signal?: AbortSignal,
    ): Promise<Record<string, unknown>> {
        const url = new URL(FORECAST_URL);
        url.searchParams.set('latitude', String(place.latitude));
        url.searchParams.set('longitude', String(place.longitude));

        for (const [parameter, field] of BLOCKS) {
            const selected = values[field];
            if (Array.isArray(selected) && selected.length > 0) {
                url.searchParams.set(parameter, selected.join(','));
            }
        }
        for (const [parameter, field] of SCALAR_PARAMETERS) {
            const value = values[field];
            if (value !== undefined && value !== '' && !Array.isArray(value)) {
                url.searchParams.set(parameter, String(value));
            }
        }

        return this.requestJson(url, signal);
    }

    private async requestJson(url: URL, signal?: AbortSignal): Promise<Record<string, unknown>> {
        const response = await this.fetchResource(url.toString(), {signal});
        if (response.status === 429) {
            throw new RateLimited();
        }
        if (!response.ok) {
            throw new Error(`The data source answered with status ${response.status}.`);
        }

        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null) {
            throw new Error('The data source answered with something other than an object.');
        }

        return payload as Record<string, unknown>;
    }

    private transportFailure(error: unknown): ActionOutcome {
        if (error instanceof RateLimited) {
            return failure('rate-limited', 'The data source is refusing further requests for the moment.');
        }
        if (error instanceof Error && error.name === 'AbortError') {
            return failure('failed', 'The query was stopped.');
        }
        const reason = error instanceof Error ? error.message : 'The data source could not be reached.';

        return failure('failed', reason);
    }

    private blocksFrom(payload: Record<string, unknown>, values: FormValues): ResultBlock[] {
        const blocks: ResultBlock[] = [];

        for (const [key, field] of BLOCKS) {
            const requested = values[field];
            if (!Array.isArray(requested) || requested.length === 0) {
                continue;
            }
            const data = payload[key];
            const units = payload[`${key}_units`];
            if (typeof data !== 'object' || data === null) {
                continue;
            }

            const block = this.block(key, requested, data as Record<string, unknown>, asRecord(units));
            if (block.columns.length > 0) {
                blocks.push(block);
            }
        }

        return blocks;
    }

    private block(
        key: string,
        requested: string[],
        data: Record<string, unknown>,
        units: Record<string, unknown>,
    ): ResultBlock {
        const time = data['time'];
        const times = Array.isArray(time) ? time.map(entry => String(entry)) : [String(time ?? '')];

        const columns: ResultColumn[] = [];
        for (const name of requested) {
            const values = data[name];
            if (values === undefined) {
                continue;
            }
            columns.push({
                name,
                unit: String(units[name] ?? ''),
                values: Array.isArray(values) ? values.map(readCell) : [readCell(values)],
            });
        }

        return {key, times, columns};
    }

    /**
     * The caller is a model with a small context, so the summary states the
     * place once and then one line per point in time, with units named in the
     * header rather than repeated on every value.
     */
    private summarize(place: ResolvedPlace, blocks: ResultBlock[]): string {
        const where = place.country === '' ? place.name : `${place.name}, ${place.country}`;
        const lines = [
            `Weather for ${where} (${place.latitude.toFixed(2)}, ${place.longitude.toFixed(2)}, ${place.timezone}).`,
        ];

        for (const block of blocks) {
            const header = block.columns
                .map(column => (column.unit === '' ? column.name : `${column.name} in ${column.unit}`))
                .join(', ');
            lines.push('', `${block.key}: time, ${header}`);

            const rows = Math.min(block.times.length, SUMMARY_ROW_LIMIT);
            for (let row = 0; row < rows; row++) {
                const cells = block.columns.map(column => formatCell(column.values[row]));
                lines.push([block.times[row] ?? '', ...cells].join(', '));
            }
            if (block.times.length > rows) {
                lines.push(`(${block.times.length - rows} further rows are shown on the page.)`);
            }
        }

        return lines.join('\n');
    }
}

class RateLimited extends Error {
    public constructor() {
        super('The data source is rate limiting.');
        this.name = 'RateLimited';
    }
}

function failure(reason: ActionOutcome['failure'], summary: string): ActionOutcome {
    return {ok: false, failure: reason, summary, blocks: []};
}

function readCell(value: unknown): string | number | null {
    if (typeof value === 'number' || typeof value === 'string') {
        return value;
    }

    return null;
}

function formatCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
        return '—';
    }

    return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}
