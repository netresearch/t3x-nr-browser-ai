import {beforeEach, describe, expect, it, vi} from 'vitest';

import {formAssistantSection} from '../../Fixtures/FormAssistantMarkup';
import type {ActionOutcome, FormAction} from '../../../Resources/Private/TypeScript/query/FormAction';
import type {Availability, LanguageModelAdapter, ModelSession} from '../../../Resources/Private/TypeScript/types';
import {FormAssistantController} from '../../../Resources/Private/TypeScript/ui/FormAssistantController';

const OUTCOME: ActionOutcome = {
    ok: true,
    summary: 'Sunny.',
    place: {name: 'Leipzig', country: 'Germany', latitude: 51.3, longitude: 12.4, timezone: 'Europe/Berlin'},
    blocks: [{
        key: 'daily',
        times: ['2026-08-11'],
        columns: [{name: 'temperature_2m_max', unit: '°C', values: [26.4]}],
    }],
};

interface Fixture {
    root: HTMLElement;
    adapter: LanguageModelAdapter;
    prompt: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    run: FormAction['run'];
    controller?: FormAssistantController;
}

function fixture(options: {
    availability?: Availability;
    modelOutput?: string;
    prose?: string;
    outcome?: ActionOutcome;
    markup?: Parameters<typeof formAssistantSection>[0];
} = {}): Fixture {
    document.body.innerHTML = formAssistantSection(options.markup);
    const root = document.querySelector<HTMLElement>('[data-nr-browser-ai-form-root]');
    if (root === null) {
        throw new Error('fixture has no plugin root');
    }

    let call = 0;
    const prompt = vi.fn(async () => {
        call++;
        if (call === 1) {
            return options.modelOutput ?? '{"queries":[{"place":"Leipzig","forecastDays":3}]}';
        }

        return options.prose ?? 'Es bleibt trocken und warm.';
    });
    const session = {
        contextUsage: 0,
        contextWindow: 1_000,
        measureContextUsage: vi.fn(async () => 0),
        append: vi.fn(async () => undefined),
        promptStreaming: vi.fn(() => new ReadableStream<string>()),
        prompt,
        destroy: vi.fn(),
    } satisfies ModelSession;
    const create = vi.fn(async () => session);
    const adapter: LanguageModelAdapter = {
        availability: vi.fn(async (): Promise<Availability> => options.availability ?? 'available'),
        create,
    };
    const run = vi.fn(async () => options.outcome ?? OUTCOME);

    return {root, adapter, prompt, create, run};
}

function start(fixed: Fixture): FormAssistantController | undefined {
    // Mirrors the production factory in the one respect that matters here: an
    // action it does not know yields nothing.
    const controller = FormAssistantController.create(
        fixed.root,
        fixed.adapter,
        action => (action === 'openMeteo' ? {run: fixed.run} : undefined),
    );
    fixed.controller = controller;

    return controller;
}

/**
 * Lets the availability check and any pending promise settle. The chain is
 * deliberately generous: a run is two model calls with the tool between them,
 * so counting ticks exactly would make the tests fragile against a refactor
 * that only moves an await.
 */
async function settle(): Promise<void> {
    for (let tick = 0; tick < 20; tick++) {
        await Promise.resolve();
    }
}

function element(name: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(`[data-nr-browser-ai-form-${name}]`);
    if (found === null) {
        throw new Error(`fixture has no ${name}`);
    }

    return found;
}

describe('FormAssistantController', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * The form assistant used to declare English output on every page and
     * carried no answer-language rule at all, so a German request on a German
     * page came back in English. Nothing pinned either, which is why it shipped.
     */
    it('declares the page language and asks for the question language', async () => {
        document.documentElement.lang = 'de';
        const fixed = fixture();
        start(fixed);
        await settle();

        const options = vi.mocked(fixed.adapter.availability).mock.calls[0]?.[0];
        expect(options?.outputLanguages).toEqual(['de']);
        expect(options?.inputLanguages).toEqual(['en', 'de']);
        expect(options?.systemPrompt).toContain('Answer in the language the question is written in');
        expect(options?.systemPrompt).toContain('answer in German');
        document.documentElement.lang = '';
    });

    it('reveals the request row when a model is ready', async () => {
        const fixed = fixture();
        start(fixed);
        await settle();

        expect(element('assistant').hidden).toBe(false);
        expect(element('status').textContent).toContain('Describe what you want');
    });

    it('derives the parameters, fills the form and renders the result', async () => {
        const fixed = fixture();
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather in Leipzig for three days';
        }
        element('submit').click();
        await settle();

        expect(fixed.prompt).toHaveBeenNthCalledWith(
            1,
            'weather in Leipzig for three days',
            expect.objectContaining({responseConstraint: expect.objectContaining({type: 'object'})}),
        );
        expect(document.querySelector<HTMLInputElement>('input[name$="[place]"]')?.value).toBe('Leipzig');
        expect(fixed.run).toHaveBeenCalledWith(
            expect.objectContaining({place: 'Leipzig', forecastDays: 3}),
            expect.anything(),
        );
        expect(element('result').hidden).toBe(false);
        expect(element('result').textContent).toContain('Leipzig, Germany');
        expect(element('status').textContent).toContain('Answered');
    });

    /**
     * The answer in words, next to the question that asked for it. The tables
     * carry the numbers; this is what makes them read like an answer.
     */
    it('renders the prose answer under the request', async () => {
        const fixed = fixture({prose: 'Am Samstag bleibt es trocken bei 34 Grad.'});
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'Taugt das Wochenende zum Grillen?';
        }
        element('submit').click();
        await settle();

        expect(element('prose').textContent).toContain('Am Samstag bleibt es trocken');
        expect(document.querySelector('[data-nr-browser-ai-form-announcement]')?.textContent)
            .toContain('Am Samstag bleibt es trocken');
    });

    /** The prose comes from the model, so it is built, never parsed as markup. */
    it('never turns the prose into markup', async () => {
        const fixed = fixture({prose: '<img src=x onerror=alert(1)> nice weather'});
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(element('prose').querySelectorAll('img')).toHaveLength(0);
        expect(element('prose').textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('collapses the form once the answer is there, without removing it', async () => {
        const fixed = fixture();
        start(fixed);
        await settle();

        const fields = document.querySelector<HTMLDetailsElement>('[data-nr-browser-ai-form-fields]');
        expect(fields?.open).toBe(true);

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(fields?.open).toBe(false);
        expect(document.querySelector('input[name$="[place]"]')).not.toBeNull();
    });

    it('leaves the form open when the query failed', async () => {
        const fixed = fixture({outcome: {ok: false, failure: 'failed', summary: 'No.', blocks: []}});
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(document.querySelector<HTMLDetailsElement>('[data-nr-browser-ai-form-fields]')?.open)
            .toBe(true);
        expect(element('prose').textContent).toBe('');
    });

    /** Two places, one sentence, one answer. */
    it('runs every query a comparison needs and shows both results', async () => {
        const fixed = fixture({
            modelOutput: '{"queries":[{"place":"Tokyo"},{"place":"Leipzig"}]}',
        });
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'Vergleiche Tokio und Leipzig';
        }
        element('submit').click();
        await settle();

        expect(fixed.run).toHaveBeenCalledTimes(2);
        expect(element('result').querySelectorAll('[data-nr-browser-ai-form-result-place]'))
            .toHaveLength(2);
    });

    it('discards the previous answer when a new request is made', async () => {
        const fixed = fixture({prose: 'First answer.'});
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();
        expect(element('prose').textContent).toContain('First answer');

        document.querySelector('form')?.dispatchEvent(
            new Event('submit', {bubbles: true, cancelable: true}),
        );
        await settle();

        expect(element('prose').textContent).toBe('');
    });

    /** The point of the disclosure: the derivation stays inspectable. */
    it('shows the arguments of the last call', async () => {
        const fixed = fixture();
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(element('call').textContent).toContain('"place": "Leipzig"');
    });

    it('says nothing was changed when the derived parameters do not fit', async () => {
        const fixed = fixture({modelOutput: '{"queries":[{"unknown":1}]}'});
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(element('status').textContent).toContain('did not fit');
        expect(fixed.run).not.toHaveBeenCalled();
    });

    it('names the reason a query failed', async () => {
        const fixed = fixture({
            outcome: {ok: false, failure: 'rate-limited', summary: 'Refused.', blocks: []},
        });
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(element('status').textContent).toContain('refusing further requests');
        expect(element('result').hidden).toBe(true);
    });

    /**
     * The form is the plugin's content, so a browser without a model keeps a
     * fully usable form and is told why the request row is not there.
     */
    it('keeps the form usable when no model is available', async () => {
        const fixed = fixture({availability: 'unavailable'});
        start(fixed);
        await settle();

        expect(element('status').textContent).toContain('unavailable');
        expect(document.querySelector<HTMLElement>('.nr-browser-ai-form__request')?.hidden).toBe(true);
        expect(document.querySelector('form')).not.toBeNull();
    });

    it('offers the setup step when the model still has to be downloaded', async () => {
        const fixed = fixture({availability: 'downloadable'});
        start(fixed);
        await settle();

        expect(element('setup').hidden).toBe(false);
        expect(fixed.create).not.toHaveBeenCalled();

        element('setup').click();
        await settle();

        expect(fixed.create).toHaveBeenCalledTimes(1);
        expect(element('setup').hidden).toBe(true);
    });

    /** Running the form by hand must not need a model at all. */
    it('runs the form on its own submit without asking the model', async () => {
        const fixed = fixture({availability: 'unavailable'});
        start(fixed);
        await settle();

        const place = document.querySelector<HTMLInputElement>('input[name$="[place]"]');
        if (place !== null) {
            place.value = 'Dresden';
        }
        document.querySelector('form')?.dispatchEvent(
            new Event('submit', {bubbles: true, cancelable: true}),
        );
        await settle();

        expect(fixed.prompt).not.toHaveBeenCalled();
        expect(fixed.run).toHaveBeenCalledWith(expect.objectContaining({place: 'Dresden'}), expect.anything());
    });

    /**
     * Preparing the model is asynchronous, so a second click during it used to
     * pass the guard and start a second derivation against the same form.
     */
    it('starts one derivation however fast the button is clicked twice', async () => {
        const fixed = fixture({availability: 'downloadable'});
        start(fixed);
        await settle();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        element('submit').click();
        await settle();

        const derivations = fixed.prompt.mock.calls
            .filter(call => call[1]?.responseConstraint !== undefined);
        expect(derivations).toHaveLength(1);
        expect(fixed.create).toHaveBeenCalledTimes(1);
    });

    it('does nothing on an empty request', async () => {
        const fixed = fixture();
        start(fixed);
        await settle();

        element('submit').click();
        await settle();

        expect(fixed.prompt).not.toHaveBeenCalled();
    });

    it.each([
        ['no schema', {schema: ''}],
        ['a schema that cannot be read', {schema: '{'}],
        ['an unknown action', {action: 'somethingElse'}],
        ['no tool name', {toolName: ''}],
    ])('stays a plain form with %s', async (_name, markup) => {
        const fixed = fixture({markup});

        expect(start(fixed)).toBeUndefined();
        await settle();

        expect(element('assistant').hidden).toBe(true);
        expect(document.querySelector('form')).not.toBeNull();
    });

    it('stops listening once destroyed', async () => {
        const fixed = fixture();
        const controller = start(fixed);
        await settle();
        controller?.destroy();

        const request = document.querySelector<HTMLInputElement>('[data-nr-browser-ai-form-request]');
        if (request !== null) {
            request.value = 'weather';
        }
        element('submit').click();
        await settle();

        expect(fixed.prompt).not.toHaveBeenCalled();
    });
});
