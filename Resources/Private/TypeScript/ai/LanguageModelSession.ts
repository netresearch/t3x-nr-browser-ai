import type {
    PageContext,
    PageContextProvider,
} from '../context/PageContextProvider';
import type {
    LanguageModelAdapter,
    ModelMessage,
    ModelOptions,
    ModelSession,
} from '../types';

const DEFAULT_CONTEXT_USAGE_LIMIT = 0.8;

export type LanguageModelSessionErrorCode =
    | 'aborted'
    | 'context-limit-reached'
    | 'destroyed'
    | 'invalid-prompt'
    | 'not-initialized'
    | 'not-supported'
    | 'quota-exceeded'
    | 'response-in-progress';

export class LanguageModelSessionError extends Error {
    public constructor(
        public readonly code: LanguageModelSessionErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'LanguageModelSessionError';
    }
}

export interface LanguageModelSessionOptions extends ModelOptions {
    supplementalInstruction?: string;
    contextUsageLimit?: number;
    onDownloadProgress?(value: number): void;
}

export interface LanguageModelSessionInitialization {
    wasTruncated: boolean;
}

export class LanguageModelSession {
    private readonly contextUsageLimit: number;
    private readonly modelOptions: ModelOptions;
    private readonly onDownloadProgress: (value: number) => void;
    private initialization?: Promise<LanguageModelSessionInitialization>;
    private session?: ModelSession;
    private destroyed = false;
    private responseInProgress = false;

    public constructor(
        private readonly adapter: LanguageModelAdapter,
        private readonly contextProvider: PageContextProvider,
        options: LanguageModelSessionOptions,
    ) {
        const contextUsageLimit = options.contextUsageLimit ?? DEFAULT_CONTEXT_USAGE_LIMIT;
        if (!Number.isFinite(contextUsageLimit) || contextUsageLimit <= 0 || contextUsageLimit > 1) {
            throw new RangeError('contextUsageLimit must be greater than zero and at most one.');
        }

        this.contextUsageLimit = contextUsageLimit;
        this.modelOptions = {
            systemPrompt: combineInstructions(
                options.systemPrompt,
                options.supplementalInstruction ?? '',
            ),
            inputLanguages: [...options.inputLanguages],
            outputLanguages: [...options.outputLanguages],
        };
        this.onDownloadProgress = options.onDownloadProgress ?? (() => undefined);
    }

    public initialize(context: Readonly<PageContext>): Promise<LanguageModelSessionInitialization> {
        if (this.destroyed) {
            return Promise.reject(sessionError('destroyed'));
        }

        this.initialization ??= this.initializeOnce(copyContext(context));
        return this.initialization;
    }

    public async ask(
        question: string,
        onChunk: (chunk: string) => void,
        signal?: AbortSignal,
    ): Promise<void> {
        if (this.destroyed) {
            throw sessionError('destroyed');
        }
        const session = this.session;
        if (session === undefined) {
            throw sessionError('not-initialized');
        }
        if (question.trim().length === 0) {
            throw sessionError('invalid-prompt');
        }
        if (this.responseInProgress) {
            throw sessionError('response-in-progress');
        }
        this.responseInProgress = true;

        let reader: ReadableStreamDefaultReader<string> | undefined;
        let streamConsumed = false;
        try {
            const contextUsage = session.contextUsage;
            const contextWindow = session.contextWindow;
            if (contextLimitReached(contextUsage, contextWindow, this.contextUsageLimit)) {
                throw sessionError('context-limit-reached');
            }
            if (signal?.aborted === true) {
                throw sessionError('aborted', signal.reason);
            }

            const stream = session.promptStreaming(question, {signal});
            reader = stream.getReader();
            while (true) {
                const result = await reader.read();
                if (result.done) {
                    streamConsumed = true;
                    return;
                }
                onChunk(result.value);
            }
        } catch (error: unknown) {
            throw translateBrowserError(error);
        } finally {
            if (reader !== undefined && !streamConsumed) {
                try {
                    await reader.cancel();
                } catch {
                    // Preserve the original streaming or consumer error.
                }
            }
            try {
                reader?.releaseLock();
            } catch {
                // Stream cleanup must not replace the operation's outcome.
            }
            this.responseInProgress = false;
        }
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.releaseSession();
    }

    private async initializeOnce(
        context: PageContext,
    ): Promise<LanguageModelSessionInitialization> {
        let createdSession: ModelSession | undefined;
        try {
            createdSession = await this.adapter.create({
                ...this.modelOptions,
                onDownloadProgress: this.onDownloadProgress,
            });
            const activeSession = createdSession;
            if (this.destroyed) {
                throw sessionError('destroyed');
            }

            const budget = remainingContextBudget(
                activeSession,
                this.contextUsageLimit,
            );
            let selectedContext = context;
            let sourceMessage = createSourceMessage(selectedContext);
            const measuredUsage = await activeSession.measureContextUsage(sourceMessage);

            if (!fitsBudget(measuredUsage, budget)) {
                selectedContext = await this.contextProvider.fitToBudget(
                    context,
                    candidate => activeSession.measureContextUsage(
                        createSourceMessage(candidate),
                    ),
                    budget,
                );
                sourceMessage = createSourceMessage(selectedContext);
                const reducedUsage = await activeSession.measureContextUsage(sourceMessage);
                if (!fitsBudget(reducedUsage, budget)) {
                    throw sessionError('context-limit-reached');
                }
            }

            if (this.destroyed) {
                throw sessionError('destroyed');
            }
            await activeSession.append(sourceMessage);
            if (this.destroyed) {
                throw sessionError('destroyed');
            }

            this.session = activeSession;
            createdSession = undefined;
            return {wasTruncated: selectedContext.wasTruncated};
        } catch (error: unknown) {
            createdSession?.destroy();
            throw translateBrowserError(error);
        }
    }

    private releaseSession(): void {
        const session = this.session;
        this.session = undefined;
        session?.destroy();
    }
}

function combineInstructions(systemPrompt: string, supplementalInstruction: string): string {
    const administratorInstruction = systemPrompt.trim();
    const editorInstruction = supplementalInstruction.trim();
    if (editorInstruction.length === 0) {
        return administratorInstruction;
    }
    return `${administratorInstruction}\n\nAdditional editor instruction:\n${editorInstruction}`;
}

function remainingContextBudget(session: ModelSession, usageLimit: number): number {
    const maximumUsage = session.contextWindow * usageLimit;
    const budget = maximumUsage - session.contextUsage;
    return Number.isFinite(budget) ? Math.max(0, budget) : 0;
}

function contextLimitReached(
    contextUsage: number,
    contextWindow: number,
    usageLimit: number,
): boolean {
    if (
        !Number.isFinite(contextUsage)
        || !Number.isFinite(contextWindow)
        || contextWindow <= 0
    ) {
        return true;
    }
    return contextUsage / contextWindow >= usageLimit;
}

function fitsBudget(usage: number, budget: number): boolean {
    return Number.isFinite(usage) && usage >= 0 && usage <= budget;
}

function createSourceMessage(context: Readonly<PageContext>): ModelMessage[] {
    return [{role: 'user', content: serializeSourceDocument(context)}];
}

function serializeSourceDocument(context: Readonly<PageContext>): string {
    const opening = `<source-document title="${escapeAttribute(context.title)}" language="${escapeAttribute(context.language)}">`;
    const body = context.sections.map(section => {
        const heading = escapeMarkup(normalizeInline(section.heading));
        const text = neutralizeMarkdownStructure(escapeMarkup(normalizeNewlines(section.text)));
        return `## ${heading}\n${text}`;
    }).join('\n\n');
    return body.length > 0
        ? `${opening}\n${body}\n</source-document>`
        : `${opening}\n</source-document>`;
}

function escapeAttribute(value: string): string {
    return normalizeInline(value)
        .replace(/&/gu, '&amp;')
        .replace(/"/gu, '&quot;')
        .replace(/'/gu, '&#39;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;');
}

function escapeMarkup(value: string): string {
    return value
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;');
}

function neutralizeMarkdownStructure(value: string): string {
    return value.replace(/^(\s*)(#{1,6})(?=\s)/gmu, '$1\\$2');
}

function normalizeInline(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
}

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n?/gu, '\n').trim();
}

function copyContext(context: Readonly<PageContext>): PageContext {
    return {
        title: context.title,
        language: context.language,
        sections: context.sections.map(section => ({...section})),
        wasTruncated: context.wasTruncated,
    };
}

function translateBrowserError(error: unknown): unknown {
    if (error instanceof LanguageModelSessionError) {
        return error;
    }
    if (isNamedError(error)) {
        if (error.name === 'AbortError') {
            return sessionError('aborted', error);
        }
        if (error.name === 'NotSupportedError') {
            return sessionError('not-supported', error);
        }
        if (error.name === 'QuotaExceededError') {
            return sessionError('quota-exceeded', error);
        }
    }
    return error;
}

function isNamedError(error: unknown): error is {name: string} {
    return typeof error === 'object'
        && error !== null
        && 'name' in error
        && typeof error.name === 'string';
}

function sessionError(code: LanguageModelSessionErrorCode, cause?: unknown): LanguageModelSessionError {
    const messages: Record<LanguageModelSessionErrorCode, string> = {
        aborted: 'The response generation was aborted.',
        'context-limit-reached': 'The model context limit has been reached. Reset the dialogue.',
        destroyed: 'The model session has been destroyed.',
        'invalid-prompt': 'Enter a non-empty question.',
        'not-initialized': 'Initialize the model session before asking a question.',
        'not-supported': 'The requested language model operation is not supported.',
        'quota-exceeded': 'The browser language model quota has been exceeded.',
        'response-in-progress': 'Wait for the active response to finish before asking again.',
    };
    return new LanguageModelSessionError(code, messages[code], cause === undefined ? undefined : {cause});
}
