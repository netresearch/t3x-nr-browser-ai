import {describe, expect, it, vi} from 'vitest';

import type {FormSchema} from '../../../Resources/Private/TypeScript/form/FormSchema';
import type {ToolDefinition} from '../../../Resources/Private/TypeScript/tools/FormTool';
import {LocalToolLoop, LocalToolLoopError} from '../../../Resources/Private/TypeScript/tools/LocalToolLoop';

const schema: FormSchema = {type: 'object', properties: {place: {type: 'string'}}};

function tool(): ToolDefinition {
    return {
        name: 't',
        description: 'd',
        inputSchema: schema,
        execute: vi.fn(async () => 'Sunny.'),
    };
}

describe('LocalToolLoop', () => {
    /** The one thing that makes structured output structured. */
    it('constrains the model to the tool schema and executes what comes back', async () => {
        const prompt = vi.fn(async () => '{"place":"Leipzig"}');
        const target = tool();

        const result = await new LocalToolLoop({prompt}, target).run('weather in Leipzig');

        expect(prompt).toHaveBeenCalledWith(
            'weather in Leipzig',
            expect.objectContaining({responseConstraint: schema}),
        );
        expect(target.execute).toHaveBeenCalledWith({place: 'Leipzig'}, undefined);
        expect(result).toBe('Sunny.');
    });

    it('refuses an empty request without asking the model', async () => {
        const prompt = vi.fn(async () => '{}');

        await expect(new LocalToolLoop({prompt}, tool()).run('   '))
            .rejects.toThrow(LocalToolLoopError);
        expect(prompt).not.toHaveBeenCalled();
    });

    it('reports output that is not readable as arguments', async () => {
        const prompt = vi.fn(async () => 'I think it will be nice.');

        await expect(new LocalToolLoop({prompt}, tool()).run('weather'))
            .rejects.toMatchObject({code: 'unusable-output'});
    });

    it('carries the abort signal through to both steps', async () => {
        const prompt = vi.fn(async () => '{"place":"Leipzig"}');
        const target = tool();
        const lifetime = new AbortController();

        await new LocalToolLoop({prompt}, target).run('weather', lifetime.signal);

        expect(prompt).toHaveBeenCalledWith('weather', expect.objectContaining({signal: lifetime.signal}));
        expect(target.execute).toHaveBeenCalledWith({place: 'Leipzig'}, lifetime.signal);
    });

    /**
     * Checking the arguments is the tool's job, not the loop's: a call from an
     * agent has to pass through exactly the same check.
     */
    it('does not judge the arguments itself', async () => {
        const prompt = vi.fn(async () => '{"unknown":1}');
        const target = tool();

        await new LocalToolLoop({prompt}, target).run('weather');

        expect(target.execute).toHaveBeenCalledWith({unknown: 1}, undefined);
    });
});
