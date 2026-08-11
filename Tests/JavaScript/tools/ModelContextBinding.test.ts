import {describe, expect, it, vi} from 'vitest';

import type {FormSchema} from '../../../Resources/Private/TypeScript/form/FormSchema';
import type {ToolDefinition} from '../../../Resources/Private/TypeScript/tools/FormTool';
import {bindModelContext} from '../../../Resources/Private/TypeScript/tools/ModelContextBinding';

const schema: FormSchema = {type: 'object', properties: {place: {type: 'string'}}};

const tool: ToolDefinition = {
    name: 'nr_browser_ai_weatherQuery',
    description: 'Query a weather forecast.',
    inputSchema: schema,
    execute: vi.fn(async () => 'done'),
};

function host(registerTool: unknown): {modelContext: unknown} {
    return {modelContext: {registerTool}};
}

describe('bindModelContext', () => {
    it('registers the tool with the first host that has a model context', () => {
        const preferred = vi.fn();
        const fallback = vi.fn();

        const bound = bindModelContext(tool, new AbortController().signal, [
            host(preferred),
            host(fallback),
        ]);

        expect(bound).toBe(true);
        expect(preferred).toHaveBeenCalledTimes(1);
        expect(fallback).not.toHaveBeenCalled();
    });

    /**
     * The API moved from navigator to document, and browsers exist that only
     * have the older placement.
     */
    it('falls back to the second host', () => {
        const fallback = vi.fn();

        const bound = bindModelContext(tool, new AbortController().signal, [
            {modelContext: undefined},
            host(fallback),
        ]);

        expect(bound).toBe(true);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('publishes the name, description and schema unchanged', () => {
        const registerTool = vi.fn();

        bindModelContext(tool, new AbortController().signal, [host(registerTool)]);

        expect(registerTool).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'nr_browser_ai_weatherQuery',
                description: 'Query a weather forecast.',
                inputSchema: schema,
            }),
            expect.anything(),
        );
    });

    it('hands over the signal that ends the registration', () => {
        const registerTool = vi.fn();
        const lifetime = new AbortController();

        bindModelContext(tool, lifetime.signal, [host(registerTool)]);

        expect(registerTool.mock.calls[0]?.[1]).toEqual({signal: lifetime.signal});
    });

    /**
     * The page changes and the answer is not this page's text, so a caller that
     * reasons about tool annotations is told both.
     */
    it('declares the call as changing the page and its result as foreign', () => {
        const registerTool = vi.fn();

        bindModelContext(tool, new AbortController().signal, [host(registerTool)]);

        expect(registerTool.mock.calls[0]?.[0]).toMatchObject({
            annotations: {readOnlyHint: false, untrustedContentHint: true},
        });
    });

    it('passes the call through to the tool', async () => {
        const registerTool = vi.fn();
        bindModelContext(tool, new AbortController().signal, [host(registerTool)]);

        const registered = registerTool.mock.calls[0]?.[0] as {execute(input: unknown): Promise<string>};
        await expect(registered.execute({place: 'Leipzig'})).resolves.toBe('done');
        expect(tool.execute).toHaveBeenCalledWith({place: 'Leipzig'});
    });

    it('reports no registration when no host has a model context', () => {
        expect(bindModelContext(tool, new AbortController().signal, [
            undefined,
            {modelContext: undefined},
            {modelContext: {}},
            {modelContext: 'not an object'},
        ])).toBe(false);
    });

    /** A host that refuses is no worse than one that is absent. */
    it('survives a host that throws', () => {
        const working = vi.fn();

        const bound = bindModelContext(tool, new AbortController().signal, [
            host(() => {
                throw new Error('refused');
            }),
            host(working),
        ]);

        expect(bound).toBe(true);
        expect(working).toHaveBeenCalledTimes(1);
    });
});
