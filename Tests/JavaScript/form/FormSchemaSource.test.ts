import {describe, expect, it} from 'vitest';

import {readFormSchema} from '../../../Resources/Private/TypeScript/form/FormSchemaSource';

const VALID = JSON.stringify({
    type: 'object',
    properties: {
        place: {type: 'string', description: 'Where'},
        hourlyVariables: {type: 'array', items: {type: 'string', enum: ['rain']}},
    },
    required: ['place'],
    additionalProperties: false,
});

describe('readFormSchema', () => {
    it('reads a schema the server generated', () => {
        const schema = readFormSchema(VALID);

        expect(schema?.properties['place']).toEqual({type: 'string', description: 'Where'});
        expect(schema?.required).toEqual(['place']);
    });

    /**
     * The parsed schema is what goes back out, as the model's response
     * constraint and as the tool's published input schema, so the server's
     * closed-object flag has to survive the round trip.
     */
    it('preserves whether the object is closed', () => {
        expect(readFormSchema(VALID)?.additionalProperties).toBe(false);
        expect(readFormSchema(JSON.stringify({
            type: 'object',
            properties: {place: {type: 'string'}},
            additionalProperties: true,
        }))?.additionalProperties).toBe(true);
    });

    it.each([
        ['an empty attribute', ''],
        ['whitespace', '   '],
        ['broken JSON', '{'],
        ['a JSON array', '[]'],
        ['an object of the wrong type', '{"type":"array","properties":{}}'],
        ['a schema without properties', '{"type":"object"}'],
        ['a schema with no properties at all', '{"type":"object","properties":{}}'],
        ['a property of an unsupported type', '{"type":"object","properties":{"a":{"type":"null"}}}'],
        ['an array property without item type', '{"type":"object","properties":{"a":{"type":"array"}}}'],
    ])('rejects %s', (_name, serialized) => {
        expect(readFormSchema(serialized)).toBeUndefined();
    });

    /**
     * A single malformed property invalidates the whole schema rather than
     * being dropped: a silently shrunken schema would leave the model unable to
     * set a field, with nothing anywhere saying why.
     */
    it('rejects the whole schema when one property is malformed', () => {
        const schema = readFormSchema(JSON.stringify({
            type: 'object',
            properties: {good: {type: 'string'}, bad: {type: 'object'}},
        }));

        expect(schema).toBeUndefined();
    });
});
