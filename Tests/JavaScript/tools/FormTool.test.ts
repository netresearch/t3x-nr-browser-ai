import {beforeEach, describe, expect, it, vi} from 'vitest';

import {FormFiller} from '../../../Resources/Private/TypeScript/form/FormFiller';
import type {FormSchema} from '../../../Resources/Private/TypeScript/form/FormSchema';
import type {ActionOutcome, FormAction} from '../../../Resources/Private/TypeScript/query/FormAction';
import {FormTool} from '../../../Resources/Private/TypeScript/tools/FormTool';
import type {ToolObserver} from '../../../Resources/Private/TypeScript/tools/FormTool';

const PREFIX = 'tx_form_formframework[weatherQuery]';

const schema: FormSchema = {
    type: 'object',
    properties: {
        place: {type: 'string'},
        forecastDays: {type: 'number', minimum: 0, maximum: 16},
    },
    required: ['place'],
};

const outcome: ActionOutcome = {ok: true, summary: 'Sunny.', blocks: []};

function fixture(run: FormAction['run'] = vi.fn(async () => outcome)): {
    tool: FormTool;
    observer: ToolObserver;
    run: FormAction['run'];
} {
    document.body.innerHTML = `
        <form>
            <input type="text" name="${PREFIX}[place]">
            <input type="number" name="${PREFIX}[forecastDays]" value="7">
        </form>
    `;
    const form = document.querySelector('form');
    if (form === null) {
        throw new Error('fixture has no form');
    }

    const observer: ToolObserver = {
        onCall: vi.fn(),
        onRejected: vi.fn(),
        onFilled: vi.fn(),
        onOutcome: vi.fn(),
    };

    return {
        tool: new FormTool('t', 'd', schema, new FormFiller(form), {run}, observer),
        observer,
        run,
    };
}

describe('FormTool', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('fills the form, runs it and returns the result', async () => {
        const {tool, observer, run} = fixture();

        const result = await tool.execute({place: 'Leipzig'});

        expect(result).toBe('Sunny.');
        expect(observer.onOutcome).toHaveBeenCalledWith(outcome);
        expect(run).toHaveBeenCalledWith({place: 'Leipzig', forecastDays: 7}, undefined);
    });

    /**
     * The values reaching the query must include the ones the caller never
     * mentioned, because the form's own state is where they live.
     */
    it('passes on the values the caller left alone', async () => {
        const {tool, run} = fixture();

        await tool.execute({place: 'Leipzig'});

        expect(run).toHaveBeenCalledWith(expect.objectContaining({forecastDays: 7}), undefined);
    });

    it('writes the derived values into the visible controls', async () => {
        const {tool} = fixture();

        await tool.execute({place: 'Leipzig', forecastDays: 3});

        const place = document.querySelector<HTMLInputElement>(`input[name="${PREFIX}[place]"]`);
        expect(place?.value).toBe('Leipzig');
    });

    it('changes nothing when the arguments do not fit', async () => {
        const {tool, observer, run} = fixture();

        const result = await tool.execute({forecastDays: 3});

        expect(result).toContain('not applied');
        expect(observer.onRejected).toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
        const days = document.querySelector<HTMLInputElement>(`input[name="${PREFIX}[forecastDays]"]`);
        expect(days?.value).toBe('7');
    });

    it('reports the call before anything is applied', async () => {
        const {tool, observer} = fixture();

        await tool.execute({place: 'Leipzig'});

        expect(observer.onCall).toHaveBeenCalledWith({place: 'Leipzig'});
    });

    it('returns the failure of a query rather than throwing it', async () => {
        const failed: ActionOutcome = {
            ok: false,
            failure: 'rate-limited',
            summary: 'Refused for now.',
            blocks: [],
        };
        const {tool, observer} = fixture(vi.fn(async () => failed));

        await expect(tool.execute({place: 'Leipzig'})).resolves.toBe('Refused for now.');
        expect(observer.onOutcome).toHaveBeenCalledWith(failed);
    });

    it('runs the form as it stands without a model', async () => {
        const {tool, run} = fixture();
        const place = document.querySelector<HTMLInputElement>(`input[name="${PREFIX}[place]"]`);
        if (place !== null) {
            place.value = 'Dresden';
        }

        await tool.rerun();

        expect(run).toHaveBeenCalledWith({place: 'Dresden', forecastDays: 7}, undefined);
    });
});
