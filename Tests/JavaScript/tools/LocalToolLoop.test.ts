import type {Mock} from 'vitest';
import {describe, expect, it, vi} from 'vitest';

import type {FormSchema} from '../../../Resources/Private/TypeScript/form/FormSchema';
import type {ToolDefinition} from '../../../Resources/Private/TypeScript/tools/FormTool';
import type {ConstrainedSession} from '../../../Resources/Private/TypeScript/tools/LocalToolLoop';
import {datedRequest} from '../../../Resources/Private/TypeScript/tools/LocalToolLoop';
import {LocalToolLoop, LocalToolLoopError} from '../../../Resources/Private/TypeScript/tools/LocalToolLoop';

const schema: FormSchema = {type: 'object', properties: {place: {type: 'string'}}};

function tool(): ToolDefinition {
    return {
        name: 't',
        description: 'd',
        inputSchema: schema,
        execute: vi.fn(async (input: unknown) => `Result for ${JSON.stringify(input)}`),
    };
}

/**
 * Answers the derivation call with the given payload, then the phrasing call.
 *
 * The parameters are typed rather than inferred: an untyped `vi.fn` produces a
 * mock signature that does not satisfy `ConstrainedSession`, which the test
 * runner does not care about and `tsc` rightly does.
 */
function session(derivation: string, prose = 'It will be warm.'): {
    prompt: Mock<ConstrainedSession['prompt']>;
} {
    let call = 0;

    return {
        prompt: vi.fn(async (
            _input: string,
            _options?: {responseConstraint?: unknown; signal?: AbortSignal},
        ) => {
            call++;

            return call === 1 ? derivation : prose;
        }),
    };
}

const options = {language: 'German'};

describe('LocalToolLoop', () => {
    /**
     * The date boundary is the user's, not Greenwich's. At 01:00 on a Saturday
     * in Berlin the weekend has begun; UTC still says Friday, and a UTC-formatted
     * anchor would be a day out for the first hours of every day east of
     * Greenwich — exactly the window in which "the weekend" is asked about.
     */
    it('names the local day, not the UTC one', () => {
        // 22:30 UTC on the 14th is already the 15th in any zone at UTC+2.
        const instant = new Date('2026-08-14T22:30:00Z');
        const anchored = datedRequest('x', () => instant);

        const localDay = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(instant);
        const localWeekday = new Intl.DateTimeFormat('en-US', {weekday: 'long'}).format(instant);

        expect(anchored).toContain(`Today is ${localWeekday}, ${localDay}.`);
        // Guards the implementation, not the formatter: a UTC build would say
        // 2026-08-14 wherever the runner sits ahead of UTC.
        if (instant.toISOString().slice(0, 10) !== localDay) {
            expect(anchored).not.toContain(instant.toISOString().slice(0, 10));
        }
    });

    /**
     * Without a date, "the weekend" is unresolvable by construction — the model
     * can only guess a number of days. The weekday is stated too: the weekend is
     * two days out on a Thursday and today on a Saturday, and deriving that from
     * an ISO date alone is calendar arithmetic a small model is bad at.
     */
    it('anchors the request to a day the model can reason about', async () => {
        const fake = session('{"queries":[{"place":"Leipzig"}]}');

        await new LocalToolLoop(fake, tool()).run(
            'Will the weekend in Leipzig be any good for a barbecue?',
            undefined,
            {...options, now: () => new Date('2026-08-13T09:00:00Z')},
        );

        const sent = fake.prompt.mock.calls[0]?.[0] as string;
        expect(sent).toContain('Today is Thursday, 2026-08-13.');
        // The request itself survives, after the anchor.
        expect(sent).toContain('Will the weekend in Leipzig be any good for a barbecue?');
        expect(sent.indexOf('Today is')).toBeLessThan(sent.indexOf('Will the weekend'));
    });

    /** The one thing that makes structured output structured. */
    it('constrains the model to a list of the tool schema', async () => {
        const fake = session('{"queries":[{"place":"Leipzig"}]}');
        const target = tool();

        await new LocalToolLoop(fake, target).run('weather in Leipzig', undefined, options);

        const constraint = fake.prompt.mock.calls[0]?.[1]?.responseConstraint as {
            properties: {queries: {items: unknown; maxItems: number}};
        };
        expect(constraint.properties.queries.items).toBe(schema);
        expect(constraint.properties.queries.maxItems).toBe(4);
        expect(target.execute).toHaveBeenCalledWith({place: 'Leipzig'}, undefined);
    });

    /**
     * A comparison is two queries from one sentence. Without this the request
     * can only be answered about whichever place the model picked.
     */
    it('runs every query the request implied, in order', async () => {
        const fake = session('{"queries":[{"place":"Tokyo"},{"place":"Leipzig"}]}');
        const target = tool();

        const outcome = await new LocalToolLoop(fake, target).run('compare both', undefined, options);

        expect(target.execute).toHaveBeenNthCalledWith(1, {place: 'Tokyo'}, undefined);
        expect(target.execute).toHaveBeenNthCalledWith(2, {place: 'Leipzig'}, undefined);
        expect(outcome.results).toHaveLength(2);
    });

    it('reports each query as it starts', async () => {
        const fake = session('{"queries":[{"place":"Tokyo"},{"place":"Leipzig"}]}');
        const onQuery = vi.fn();

        await new LocalToolLoop(fake, tool()).run('compare', undefined, {...options, onQuery});

        expect(onQuery).toHaveBeenNthCalledWith(1, 0, 2);
        expect(onQuery).toHaveBeenNthCalledWith(2, 1, 2);
    });

    it('never runs more queries than it allows itself', async () => {
        const many = JSON.stringify({queries: Array.from({length: 9}, (_, index) => ({place: `P${index}`}))});
        const target = tool();

        const outcome = await new LocalToolLoop(session(many), target).run('many', undefined, {
            ...options,
            maximumQueries: 2,
        });

        expect(outcome.results).toHaveLength(2);
        expect(target.execute).toHaveBeenCalledTimes(2);
    });

    /** A model that answers with a bare argument object still understood it. */
    it('accepts a single argument object where a list was asked for', async () => {
        const target = tool();

        const outcome = await new LocalToolLoop(session('{"place":"Leipzig"}'), target).run(
            'weather',
            undefined,
            options,
        );

        expect(target.execute).toHaveBeenCalledWith({place: 'Leipzig'}, undefined);
        expect(outcome.results).toHaveLength(1);
    });

    it('asks the model to phrase the result, unconstrained and in the page language', async () => {
        const fake = session('{"queries":[{"place":"Leipzig"}]}', 'Es bleibt trocken.');

        const outcome = await new LocalToolLoop(fake, tool()).run('weather', undefined, options);

        const [input, settings] = fake.prompt.mock.calls[1] ?? [];
        expect(input).toContain('German');
        expect(input).toContain('Result for {"place":"Leipzig"}');
        expect(settings?.responseConstraint).toBeUndefined();
        expect(outcome.prose).toBe('Es bleibt trocken.');
    });

    /**
     * The tables are already on the page when phrasing runs. Losing the
     * sentence about them must not lose the answer.
     */
    it('keeps the results when the phrasing call fails', async () => {
        let call = 0;
        const fake: ConstrainedSession = {
            prompt: vi.fn(async () => {
                call++;
                if (call === 2) {
                    throw new DOMException('Full', 'QuotaExceededError');
                }

                return '{"queries":[{"place":"Leipzig"}]}';
            }),
        };

        const outcome = await new LocalToolLoop(fake, tool()).run('weather', undefined, options);

        expect(outcome.results).toHaveLength(1);
        expect(outcome.prose).toBe('');
    });

    it('does not phrase at all when no options are given', async () => {
        const fake = session('{"queries":[{"place":"Leipzig"}]}');

        const outcome = await new LocalToolLoop(fake, tool()).run('weather');

        expect(fake.prompt).toHaveBeenCalledTimes(1);
        expect(outcome.prose).toBe('');
    });

    it('refuses an empty request without asking the model', async () => {
        const fake = session('{"queries":[]}');

        await expect(new LocalToolLoop(fake, tool()).run('   ', undefined, options))
            .rejects.toThrow(LocalToolLoopError);
        expect(fake.prompt).not.toHaveBeenCalled();
    });

    it.each([
        ['output that is not JSON', 'I think it will be nice.'],
        ['an empty list', '{"queries":[]}'],
        ['a list of non-objects', '{"queries":["Leipzig"]}'],
        ['a JSON scalar', '"Leipzig"'],
    ])('reports %s as unusable', async (_name, output) => {
        await expect(new LocalToolLoop(session(output), tool()).run('weather', undefined, options))
            .rejects.toMatchObject({code: 'unusable-output'});
    });

    it('carries the abort signal through every step', async () => {
        const fake = session('{"queries":[{"place":"Leipzig"}]}');
        const target = tool();
        const lifetime = new AbortController();

        await new LocalToolLoop(fake, target).run('weather', lifetime.signal, options);

        expect(target.execute).toHaveBeenCalledWith({place: 'Leipzig'}, lifetime.signal);
        expect(fake.prompt.mock.calls[1]?.[1]).toEqual({signal: lifetime.signal});
    });

    /**
     * Checking the arguments is the tool's job, not the loop's: a call from an
     * agent has to pass through exactly the same check.
     */
    it('does not judge the arguments itself', async () => {
        const target = tool();

        await new LocalToolLoop(session('{"queries":[{"unknown":1}]}'), target).run(
            'weather',
            undefined,
            options,
        );

        expect(target.execute).toHaveBeenCalledWith({unknown: 1}, undefined);
    });
});
