/**
 * Types for the demo renderer.
 *
 * render.mjs is plain JavaScript — it runs in the Pages workflow, not in the
 * bundled extension. Tests/JavaScript/TemplateContract.test.ts imports
 * assistantMarkup from it to compare the demo's markup against the Fluid
 * template, so the one exported function it needs is declared here rather than
 * turning on allowJs for the whole project.
 */

/** The content file for one language, as loaded from demo/content/<lang>.json. */
export interface DemoContent {
    assistant: {
        ariaLabel: string;
        systemPrompt: string;
        supplemental: string;
        title: string;
        questionLabel: string;
        ask: string;
        setup: string;
        stop: string;
        reset: string;
        retry: string;
        progressLabel: string;
        labels: Record<string, string>;
        configuration: Record<string, string>;
        fallback: Record<string, string>;
        notFound: Record<string, string>;
    };
}

/** The assistant widget markup the demo page renders. */
export function assistantMarkup(content: DemoContent): string;

/** Renders both language pages and the project manifest into public/. */
export function render(): Promise<Record<string, unknown>>;
