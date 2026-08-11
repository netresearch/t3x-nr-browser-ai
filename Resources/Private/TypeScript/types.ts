export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface ModelOptions {
    systemPrompt: string;
    inputLanguages: string[];
    outputLanguages: string[];
}

export interface ModelMessage {
    role: 'user' | 'assistant';
    content: string;
}

export type ModelPrompt = string | ModelMessage[];

export interface ModelSession {
    readonly contextUsage: number;
    readonly contextWindow: number;
    measureContextUsage(input: ModelPrompt): Promise<number>;
    append(input: ModelPrompt): Promise<void>;
    promptStreaming(input: string, options?: {signal?: AbortSignal}): ReadableStream<string>;

    /**
     * The complete reply rather than a stream. `responseConstraint` is what
     * turns the model into a producer of structured output: it is handed a JSON
     * Schema and answers with JSON that fits it. Used by the form assistant,
     * where a partial answer would be worthless — arguments are applied whole
     * or not at all.
     */
    prompt(
        input: string,
        options?: {responseConstraint?: unknown; signal?: AbortSignal},
    ): Promise<string>;
    destroy(): void;
}

export interface LanguageModelAdapter {
    availability(options: ModelOptions): Promise<Availability>;
    create(options: ModelOptions & {
        onDownloadProgress(value: number): void;
    }): Promise<ModelSession>;
}
