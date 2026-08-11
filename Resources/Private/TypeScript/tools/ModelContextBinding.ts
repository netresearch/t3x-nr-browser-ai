import type {ToolDefinition} from './FormTool';

interface RegistrationOptions {
    signal?: AbortSignal;
}

interface ModelContext {
    registerTool(
        tool: {
            name: string;
            description: string;
            inputSchema: unknown;
            execute(input: unknown): Promise<string>;
            annotations?: {readOnlyHint?: boolean; untrustedContentHint?: boolean};
        },
        options?: RegistrationOptions,
    ): unknown;
}

interface ModelContextHost {
    modelContext?: unknown;
}

/**
 * Offers the tool to an agent running in the browser.
 *
 * Two hosts are tried. The API moved from `navigator` to `document` because
 * tools belong to a page rather than to a browsing session, and Chrome 150
 * deprecated the older placement while still shipping it; supporting both is
 * what keeps the tool reachable across the versions that have the feature at
 * all. Where neither exists, only this registration is skipped — the page's own
 * session calls the very same tool.
 *
 * The tool is annotated as neither read-only nor free of untrusted content: it
 * changes what the page shows, and the data source's answer is not this page's
 * text.
 */
export function bindModelContext(
    tool: ToolDefinition,
    signal: AbortSignal,
    hosts: ReadonlyArray<ModelContextHost | undefined> = [
        typeof document === 'undefined' ? undefined : document as unknown as ModelContextHost,
        typeof navigator === 'undefined' ? undefined : navigator as unknown as ModelContextHost,
    ],
): boolean {
    for (const host of hosts) {
        const context = asModelContext(host?.modelContext);
        if (context === undefined) {
            continue;
        }

        try {
            context.registerTool(
                {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    execute: (input: unknown) => tool.execute(input),
                    annotations: {readOnlyHint: false, untrustedContentHint: true},
                },
                {signal},
            );

            return true;
        } catch {
            // A host that rejects the registration is treated as absent: the
            // page keeps working through its own session either way.
        }
    }

    return false;
}

function asModelContext(candidate: unknown): ModelContext | undefined {
    if (typeof candidate !== 'object' || candidate === null) {
        return undefined;
    }
    const registerTool = (candidate as {registerTool?: unknown}).registerTool;

    return typeof registerTool === 'function' ? candidate as ModelContext : undefined;
}
