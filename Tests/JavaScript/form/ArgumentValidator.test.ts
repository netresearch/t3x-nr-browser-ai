import {describe, expect, it} from 'vitest';

import {validateArguments} from '../../../Resources/Private/TypeScript/form/ArgumentValidator';
import type {FormSchema} from '../../../Resources/Private/TypeScript/form/FormSchema';

const schema: FormSchema = {
    type: 'object',
    properties: {
        place: {type: 'string'},
        forecastDays: {type: 'number', minimum: 0, maximum: 16},
        detailed: {type: 'boolean'},
        unit: {type: 'string', enum: ['celsius', 'fahrenheit']},
        hourlyVariables: {type: 'array', items: {type: 'string', enum: ['rain', 'snowfall']}},
    },
    required: ['place'],
};

describe('validateArguments', () => {
    it('accepts arguments that fit', () => {
        const result = validateArguments(schema, {
            place: 'Leipzig',
            forecastDays: 3,
            detailed: true,
            unit: 'celsius',
            hourlyVariables: ['rain'],
        });

        expect(result).toEqual({
            accepted: true,
            values: {
                place: 'Leipzig',
                forecastDays: 3,
                detailed: true,
                unit: 'celsius',
                hourlyVariables: ['rain'],
            },
        });
    });

    /**
     * The point of the check: an enum value outside the option set would reach
     * the data source as an invalid parameter and come back as an opaque error.
     */
    it('rejects a value outside an enum', () => {
        const result = validateArguments(schema, {place: 'Leipzig', unit: 'kelvin'});

        expect(result.accepted).toBe(false);
    });

    it('rejects an entry outside an array enum', () => {
        const result = validateArguments(schema, {place: 'Leipzig', hourlyVariables: ['rain', 'lava']});

        expect(result.accepted).toBe(false);
    });

    it('rejects a field the form does not have', () => {
        const result = validateArguments(schema, {place: 'Leipzig', mystery: 1});

        expect(result.accepted).toBe(false);
    });

    it('rejects a missing required field', () => {
        expect(validateArguments(schema, {forecastDays: 3}).accepted).toBe(false);
    });

    it('rejects a required field that is only whitespace', () => {
        expect(validateArguments(schema, {place: '  '}).accepted).toBe(false);
    });

    it('rejects arguments that are not an object', () => {
        expect(validateArguments(schema, ['Leipzig']).accepted).toBe(false);
        expect(validateArguments(schema, 'Leipzig').accepted).toBe(false);
        expect(validateArguments(schema, null).accepted).toBe(false);
    });

    /**
     * A bound the model overshot still expresses an understood request, so the
     * number is brought into range rather than the call being thrown away.
     */
    it('clamps a number to its bounds instead of rejecting it', () => {
        const result = validateArguments(schema, {place: 'Leipzig', forecastDays: 40});

        expect(result).toEqual({accepted: true, values: {place: 'Leipzig', forecastDays: 16}});
    });

    it('reads a numeric string as a number', () => {
        const result = validateArguments(schema, {place: 'Leipzig', forecastDays: '5'});

        expect(result).toEqual({accepted: true, values: {place: 'Leipzig', forecastDays: 5}});
    });

    it('rejects a number that is not one', () => {
        expect(validateArguments(schema, {place: 'Leipzig', forecastDays: 'many'}).accepted).toBe(false);
    });

    /** The most common shape mistake, and an unambiguous one. */
    it('accepts a single value where a list is expected', () => {
        const result = validateArguments(schema, {place: 'Leipzig', hourlyVariables: 'rain'});

        expect(result).toEqual({accepted: true, values: {place: 'Leipzig', hourlyVariables: ['rain']}});
    });

    it('drops a repeated entry from a list', () => {
        const result = validateArguments(schema, {place: 'Leipzig', hourlyVariables: ['rain', 'rain']});

        expect(result).toEqual({accepted: true, values: {place: 'Leipzig', hourlyVariables: ['rain']}});
    });

    it('ignores a field that was explicitly left empty', () => {
        const result = validateArguments(schema, {place: 'Leipzig', forecastDays: null});

        expect(result).toEqual({accepted: true, values: {place: 'Leipzig'}});
    });

    it('reads the string forms of a boolean', () => {
        expect(validateArguments(schema, {place: 'L', detailed: 'true'}))
            .toEqual({accepted: true, values: {place: 'L', detailed: true}});
        expect(validateArguments(schema, {place: 'L', detailed: '0'}))
            .toEqual({accepted: true, values: {place: 'L', detailed: false}});
        expect(validateArguments(schema, {place: 'L', detailed: 'perhaps'}).accepted).toBe(false);
    });
});
