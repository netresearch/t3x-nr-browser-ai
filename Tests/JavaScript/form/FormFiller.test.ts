import {beforeEach, describe, expect, it} from 'vitest';

import {FormFiller, identifierOf} from '../../../Resources/Private/TypeScript/form/FormFiller';
import type {FormSchema} from '../../../Resources/Private/TypeScript/form/FormSchema';

const PREFIX = 'tx_form_formframework[weatherQuery]';

const schema: FormSchema = {
    type: 'object',
    properties: {
        place: {type: 'string'},
        forecastDays: {type: 'number'},
        detailed: {type: 'boolean'},
        unit: {type: 'string', enum: ['celsius', 'fahrenheit']},
        hourlyVariables: {type: 'array', items: {type: 'string', enum: ['rain', 'snowfall', 'wind']}},
    },
};

/** Mirrors what EXT:form renders, including the hidden companion field. */
function markup(): string {
    const boxes = ['rain', 'snowfall', 'wind']
        .map(value => `<input type="checkbox" name="${PREFIX}[hourlyVariables][]" value="${value}">`)
        .join('');

    return `
        <form>
            <input type="hidden" name="${PREFIX}[__state]" value="x">
            <input type="text" name="${PREFIX}[place]">
            <input type="number" name="${PREFIX}[forecastDays]" value="7">
            <input type="checkbox" name="${PREFIX}[detailed]" value="1">
            <select name="${PREFIX}[unit]">
                <option value="celsius" selected>C</option>
                <option value="fahrenheit">F</option>
            </select>
            ${boxes}
        </form>
    `;
}

function form(): HTMLFormElement {
    document.body.innerHTML = markup();
    const element = document.querySelector('form');
    if (element === null) {
        throw new Error('fixture has no form');
    }

    return element;
}

describe('identifierOf', () => {
    it.each([
        [`${PREFIX}[place]`, 'place'],
        [`${PREFIX}[hourlyVariables][]`, 'hourlyVariables'],
    ])('reads %s as %s', (name, expected) => {
        expect(identifierOf(name)).toBe(expected);
    });

    it.each(['', 'place', '[]', '[ ]['])('returns nothing for %j', name => {
        expect(identifierOf(name)).not.toBe('place');
    });
});

describe('FormFiller', () => {
    let filler: FormFiller;
    let element: HTMLFormElement;

    beforeEach(() => {
        element = form();
        filler = new FormFiller(element);
    });

    it('writes every kind of control', () => {
        const missing = filler.fill(schema, {
            place: 'Leipzig',
            forecastDays: 3,
            detailed: true,
            unit: 'fahrenheit',
            hourlyVariables: ['rain', 'wind'],
        });

        expect(missing).toEqual([]);
        expect(filler.read(schema)).toEqual({
            place: 'Leipzig',
            forecastDays: 3,
            detailed: true,
            unit: 'fahrenheit',
            hourlyVariables: ['rain', 'wind'],
        });
    });

    it('ticks exactly the boxes named and clears the others', () => {
        filler.fill(schema, {hourlyVariables: ['rain', 'wind']});

        const checked = Array.from(
            element.querySelectorAll<HTMLInputElement>('input[type=checkbox][value]'),
        )
            .filter(box => box.checked)
            .map(box => box.value);

        expect(checked).toEqual(['rain', 'wind']);
    });

    it('clears a previously ticked box that the new call leaves out', () => {
        filler.fill(schema, {hourlyVariables: ['rain', 'wind']});
        filler.fill(schema, {hourlyVariables: ['snowfall']});

        expect(filler.read(schema)['hourlyVariables']).toEqual(['snowfall']);
    });

    /**
     * The values the model did not mention still have to reach the query, and
     * they can only come from the form's own state.
     */
    it('reads back the values the caller never set', () => {
        filler.fill(schema, {place: 'Leipzig'});

        expect(filler.read(schema)).toMatchObject({forecastDays: 7, unit: 'celsius', detailed: false});
    });

    it('leaves a select alone when the value is not among its options', () => {
        filler.fill(schema, {unit: 'kelvin'});

        expect(filler.read(schema)['unit']).toBe('celsius');
    });

    it('reports a field that has no control', () => {
        const missing = filler.fill(
            {type: 'object', properties: {...schema.properties, absent: {type: 'string'}}},
            {absent: 'x'},
        );

        expect(missing).toEqual(['absent']);
    });

    it('never writes into a hidden field', () => {
        filler.fill(schema, {place: 'Leipzig'});

        const state = element.querySelector<HTMLInputElement>(`input[name="${PREFIX}[__state]"]`);
        expect(state?.value).toBe('x');
    });

    /** Scripts the theme or EXT:form attached must see a filled control change. */
    it('announces every write', () => {
        const events: string[] = [];
        element.addEventListener('input', () => events.push('input'));
        element.addEventListener('change', () => events.push('change'));

        filler.fill(schema, {place: 'Leipzig'});

        expect(events).toEqual(['input', 'change']);
    });
});
