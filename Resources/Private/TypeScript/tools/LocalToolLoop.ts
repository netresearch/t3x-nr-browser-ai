import type {FormSchema} from '../form/FormSchema';
import type {ToolDefinition} from './FormTool';

export interface ConstrainedSession {
    prompt(input: string, options?: {responseConstraint?: unknown; signal?: AbortSignal}): Promise<string>;
}

export type LocalToolLoopErrorCode = 'empty-request' | 'unusable-output';

export class LocalToolLoopError extends Error {
    public constructor(public readonly code: LocalToolLoopErrorCode, message: string) {
        super(message);
        this.name = 'LocalToolLoopError';
    }
}

export interface LocalToolLoopResult {
    /** One entry per query the request implied — the texts an agent would receive. */
    results: string[];
    /** The model's wording of those results, empty when it could not produce one. */
    prose: string;
}

export interface LocalToolLoopOptions {
    /** Named so the model answers in the language the page is written in. */
    language: string;
    /** Upper bound on the queries one request may trigger. */
    maximumQueries?: number;
    /**
     * The clock the derivation is anchored to. Injected so a test can pin it;
     * production passes nothing and gets the device clock.
     */
    now?(): Date;
    onQuery?(index: number, total: number): void;
    /**
     * Asked before the phrasing call. The loop sees result texts, not
     * outcomes, so whether a run produced anything worth phrasing is the
     * caller's judgement — and phrasing a failure would both waste a model
     * turn and talk over the message that says what went wrong.
     */
    shouldPhrase?(): boolean;
    onPhrasing?(): void;
}

/**
 * How much of the results is offered to the phrasing call.
 *
 * A forecast over sixteen days with several variables runs to thousands of
 * characters, and the schema the model was already constrained to is itself
 * large. The cap keeps the phrasing call from crowding out the derivation; the
 * tables on the page carry the full result either way, so what is cut is
 * redundancy rather than information.
 */
const PROSE_INPUT_LIMIT = 2_400;

/** More than this and a single request is no longer a question but a report. */
const DEFAULT_MAXIMUM_QUERIES = 4;

/**
 * The path taken when no agent is driving the page.
 *
 * Three steps. The model is constrained by a schema built around the tool's own
 * input schema and answers with one or more sets of arguments; each set goes
 * through the tool, which fills the form and runs it; then the model is asked,
 * unconstrained, what those results mean for the question that was asked.
 *
 * Several queries per request is what makes a comparison possible — two places,
 * one sentence, one answer. The form ends up showing the last set of arguments,
 * which is why every call is listed in the disclosure and every result gets its
 * own section on the page.
 *
 * The phrasing call lives here rather than inside the tool on purpose. An agent
 * reaching the tool through the browser's model context receives the same
 * result text and phrases it in its own voice; pushing a wording into
 * `execute()` would force this page's phrasing onto a caller that has its own.
 *
 * A failed phrasing call is not a failed run. The tables are already on the
 * page and the numbers are the answer; the prose is what makes them read like
 * one.
 */
/**
 * Anchor the request to a day.
 *
 * Without this the model has no idea when "now" is, so "the weekend", "tomorrow"
 * or "next week" are unresolvable by construction — it can only guess a
 * plausible number of days. The date is stated before the request rather than
 * offered as a callable tool: a tool has to be *chosen*, and a small on-device
 * model skips it, while the day is needed by every request that mentions time.
 *
 * The weekday is named explicitly. "The weekend" is two days away on a Thursday
 * and today on a Saturday, and a model asked to derive that from an ISO date
 * alone has to do calendar arithmetic it is bad at.
 *
 * The clock is the device's, and so is the date boundary: both are formatted in
 * LOCAL time, not UTC. Someone asking about "the weekend" at 01:00 on a Saturday
 * in Berlin is in Saturday; UTC still says Friday, and the answer would be a day
 * out for the first hours of every day east of Greenwich. `en-CA` is used purely
 * because it formats as YYYY-MM-DD.
 *
 * A machine with a wrong date derives a wrong window and nothing detects it; the
 * derived parameters stay visible in the last-call disclosure, which is where
 * such a mistake becomes apparent.
 */
export function datedRequest(request: string, now?: () => Date): string {
    const today = (now ?? (() => new Date()))();
    const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'long'}).format(today);
    const iso = new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(today);

    return `Today is ${weekday}, ${iso}.\n\n${request}`;
}

export class LocalToolLoop {
    public constructor(
        private readonly session: ConstrainedSession,
        private readonly tool: ToolDefinition,
    ) {}

    public async run(
        request: string,
        signal?: AbortSignal,
        options?: LocalToolLoopOptions,
    ): Promise<LocalToolLoopResult> {
        const trimmed = request.trim();
        if (trimmed.length === 0) {
            throw new LocalToolLoopError('empty-request', 'Enter a request.');
        }

        const maximum = options?.maximumQueries ?? DEFAULT_MAXIMUM_QUERIES;
        const output = await this.session.prompt(datedRequest(trimmed, options?.now), {
            responseConstraint: batchSchema(this.tool.inputSchema, maximum),
            signal,
        });

        const queries = this.readQueries(output, maximum);
        const results: string[] = [];
        for (const [index, query] of queries.entries()) {
            options?.onQuery?.(index, queries.length);
            results.push(await this.tool.execute(query, signal));
        }

        if (options === undefined) {
            return {results, prose: ''};
        }

        return {results, prose: await this.phrase(trimmed, results, options, signal)};
    }

    /**
     * The constraint asks for a list, but a model that answers with a bare
     * argument object has still understood the request — that shape is accepted
     * as a list of one rather than thrown away.
     *
     * @return at least one entry
     */
    private readQueries(output: string, maximum: number): unknown[] {
        let parsed: unknown;
        try {
            parsed = JSON.parse(output);
        } catch {
            throw new LocalToolLoopError(
                'unusable-output',
                'The model did not return arguments that could be read.',
            );
        }

        if (typeof parsed !== 'object' || parsed === null) {
            throw new LocalToolLoopError('unusable-output', 'The model returned no arguments.');
        }

        const queries = (parsed as {queries?: unknown}).queries;
        if (Array.isArray(queries)) {
            const usable = queries.filter(entry => typeof entry === 'object' && entry !== null);
            if (usable.length === 0) {
                throw new LocalToolLoopError('unusable-output', 'The model returned no arguments.');
            }

            return usable.slice(0, maximum);
        }

        return [parsed];
    }

    private async phrase(
        request: string,
        results: string[],
        options: LocalToolLoopOptions,
        signal?: AbortSignal,
    ): Promise<string> {
        if (options.shouldPhrase?.() === false) {
            return '';
        }

        options.onPhrasing?.();

        try {
            const answer = await this.session.prompt(
                phrasingPrompt(request, results, options.language),
                {signal},
            );

            return answer.trim();
        } catch {
            // The run stands. The tables are rendered and the numbers are the
            // answer; only the sentence about them is missing.
            return '';
        }
    }
}

/**
 * The tool's own schema, wrapped in a list.
 *
 * The wrapper is an object rather than a bare array because the Prompt API's
 * response constraint is stated per response, and an object root leaves room
 * for the model to be told what the list means through the property name.
 */
function batchSchema(inputSchema: FormSchema, maximum: number): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            queries: {
                type: 'array',
                minItems: 1,
                maxItems: maximum,
                description: 'One entry per query the request needs. A comparison between two '
                    + 'places is two entries that differ only in the place.',
                items: inputSchema,
            },
        },
        required: ['queries'],
        additionalProperties: false,
    };
}

/**
 * The instruction is explicit about the two ways this call can go wrong: a
 * model that invents a number the query never returned, and one that restates
 * the whole table in words. Both are worse than no prose at all.
 */
function phrasingPrompt(request: string, results: string[], language: string): string {
    const budget = Math.max(400, Math.floor(PROSE_INPUT_LIMIT / results.length));
    const data = results
        .map(result => (
            result.length > budget
                ? `${result.slice(0, budget)}\n(truncated; the full result is shown on the page)`
                : result
        ))
        .join('\n\n');

    return [
        // `language` is the PAGE language. Naming it alone told the model to
        // answer an English page's German request in English, which is what a
        // tester saw. The request's own language wins; the page is the tiebreak.
        `Answer this request in the language it is written in — if that is unclear,`,
        `in ${language} — in at most four sentences: "${request}"`,
        '',
        'Use only the query results below. Name the values that answer the request and',
        'nothing else — do not list every row, and never state a number the results do',
        'not contain. When there is more than one result, compare them. If the results',
        'do not answer the request, say so plainly.',
        '',
        '<query-results>',
        data,
        '</query-results>',
    ].join('\n');
}
