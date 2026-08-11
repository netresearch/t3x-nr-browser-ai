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

/**
 * The path taken when no agent is driving the page.
 *
 * One model call, constrained by the tool's own input schema, produces the
 * arguments; the tool then does the rest. There is deliberately no second call
 * asking the model to phrase an answer: the result is a table the visitor can
 * read, the numbers are the answer, and a summarising turn would spend an
 * on-device model's context on restating them.
 *
 * An agent calling through the browser's model context skips this entirely and
 * receives the same tool's return value, which it can phrase however it likes.
 */
export class LocalToolLoop {
    public constructor(
        private readonly session: ConstrainedSession,
        private readonly tool: ToolDefinition,
    ) {}

    public async run(request: string, signal?: AbortSignal): Promise<string> {
        const trimmed = request.trim();
        if (trimmed.length === 0) {
            throw new LocalToolLoopError('empty-request', 'Enter a request.');
        }

        const output = await this.session.prompt(trimmed, {
            responseConstraint: this.tool.inputSchema,
            signal,
        });

        let parsed: unknown;
        try {
            parsed = JSON.parse(output);
        } catch {
            throw new LocalToolLoopError(
                'unusable-output',
                'The model did not return arguments that could be read.',
            );
        }

        return this.tool.execute(parsed, signal);
    }
}
