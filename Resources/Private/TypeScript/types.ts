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
    destroy(): void;
}

export interface LanguageModelAdapter {
    availability(options: ModelOptions): Promise<Availability>;
    create(options: ModelOptions & {
        onDownloadProgress(value: number): void;
    }): Promise<ModelSession>;
}
