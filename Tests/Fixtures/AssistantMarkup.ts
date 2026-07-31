import type {UiLabels} from '../../Resources/Private/TypeScript/ui/ChatController';

/**
 * Single source of the assistant root markup for the browser unit tests and the
 * end-to-end suite. Both suites drive the real bundle against this markup, so it
 * has to mirror Resources/Private/Templates/Assistant/Show.html.
 *
 * TemplateContract.test.ts compares the hooks and label attributes below against
 * the Fluid template in both directions and fails when either side drifts.
 */

/** Attributes the bundle queries to find its elements. */
export const ELEMENT_HOOKS = [
    'data-nr-browser-ai-root',
    'data-nr-browser-ai-fallback',
    'data-nr-browser-ai-assistant',
    'data-nr-browser-ai-status',
    'data-nr-browser-ai-setup',
    'data-nr-browser-ai-progress',
    'data-nr-browser-ai-log',
    'data-nr-browser-ai-announcement',
    'data-nr-browser-ai-form',
    'data-nr-browser-ai-question',
    'data-nr-browser-ai-submit',
    'data-nr-browser-ai-abort',
    'data-nr-browser-ai-reset',
    'data-nr-browser-ai-retry',
] as const;

/** Configuration attributes the bundle reads when bootstrapping an instance. */
export const CONFIGURATION_ATTRIBUTES = [
    'data-context-selector',
    'data-context-usage-limit',
    'data-system-prompt',
    'data-supplemental-instruction',
] as const;

/**
 * Label attributes, one per UI state plus the new-tab hint. Typed against
 * UiLabels so a new UI state cannot be added without a label here.
 */
export const LABEL_ATTRIBUTES: Readonly<Record<keyof UiLabels, string>> = {
    checking: 'data-label-checking',
    downloadable: 'data-label-downloadable',
    downloading: 'data-label-downloading',
    ready: 'data-label-ready',
    streaming: 'data-label-streaming',
    'reset-required': 'data-label-reset-required',
    'error-retryable': 'data-label-error-retryable',
    unavailable: 'data-label-unavailable',
    newTab: 'data-label-new-tab',
};

export const ENGLISH_LABELS: UiLabels = {
    checking: 'Checking browser AI availability…',
    downloadable: 'Browser AI needs to be set up before use.',
    downloading: 'Setting up browser AI…',
    ready: 'Browser AI is ready.',
    streaming: 'Generating an answer…',
    'reset-required': 'The model context is full. Reset the conversation to continue.',
    'error-retryable': 'Browser AI could not be reached. You can retry.',
    unavailable: 'Browser AI is unavailable in this browser.',
    newTab: 'Opens in a new tab.',
};

const PLACEHOLDER_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'"
    + " viewBox='0 0 1 1'%3E%3Cpath fill='%232F99A4' d='M0 0h1v1H0z'/%3E%3C/svg%3E";

export interface AssistantConfiguration {
    contextSelector: string;
    contextUsageLimit: string;
    systemPrompt: string;
    supplementalInstruction: string;
}

export interface AssistantMarkupOptions {
    id?: string;
    labels?: UiLabels;
    fallback?: string;
    regionLabel?: string;
    title?: string;
    /** Omitted by unit tests that construct a ChatController directly. */
    configuration?: Partial<AssistantConfiguration>;
}

/** Renders the assistant section exactly as the Fluid template emits it. */
export function assistantSection(options: AssistantMarkupOptions = {}): string {
    const id = options.id ?? 'assistant';
    const labels = options.labels ?? ENGLISH_LABELS;
    const regionLabel = options.regionLabel ?? 'Browser AI assistant';
    const title = options.title ?? 'Browser AI assistant';

    const labelAttributes = (Object.keys(LABEL_ATTRIBUTES) as (keyof UiLabels)[])
        .map(state => ` ${LABEL_ATTRIBUTES[state]}="${escapeAttribute(labels[state])}"`)
        .join('');
    const configurationAttributes = options.configuration === undefined
        ? ''
        : Object.entries({
            'data-context-selector': options.configuration.contextSelector,
            'data-context-usage-limit': options.configuration.contextUsageLimit,
            'data-system-prompt': options.configuration.systemPrompt,
            'data-supplemental-instruction': options.configuration.supplementalInstruction,
        })
            .filter((entry): entry is [string, string] => entry[1] !== undefined)
            .map(([attribute, value]) => ` ${attribute}="${escapeAttribute(value)}"`)
            .join('');

    return `<section id="${id}" class="nr-browser-ai" aria-label="${escapeAttribute(regionLabel)}"`
        + ` data-nr-browser-ai-root${configurationAttributes}${labelAttributes}>
 <div data-nr-browser-ai-fallback>${options.fallback ?? ''}</div>
 <div data-nr-browser-ai-assistant hidden>
  <header class="nr-browser-ai__header"><a class="nr-browser-ai__brand-link" href="https://www.netresearch.de/" aria-label="Netresearch DTT GmbH"><img class="nr-browser-ai__symbol" alt="" width="48" height="48" src="${PLACEHOLDER_ICON}"></a><h2 id="${id}-title" class="nr-browser-ai__title">${title}</h2></header>
  <p id="${id}-status" class="nr-browser-ai__status" data-nr-browser-ai-status role="status" aria-atomic="true" tabindex="-1"></p>
  <button class="nr-browser-ai__button nr-browser-ai__button--primary" type="button" data-nr-browser-ai-setup>Set up browser AI</button>
  <progress class="nr-browser-ai__progress" data-nr-browser-ai-progress max="1" value="0" aria-label="Browser AI model download"></progress>
  <div class="nr-browser-ai__log" data-nr-browser-ai-log></div>
  <p class="nr-browser-ai__visually-hidden" data-nr-browser-ai-announcement aria-live="polite" aria-atomic="true"></p>
  <form class="nr-browser-ai__form" data-nr-browser-ai-form><label class="nr-browser-ai__label" for="${id}-question">Your question</label><div class="nr-browser-ai__input-row"><input class="nr-browser-ai__input" id="${id}-question" type="text" data-nr-browser-ai-question autocomplete="off" required aria-describedby="${id}-status"><button class="nr-browser-ai__button nr-browser-ai__button--primary" type="submit" data-nr-browser-ai-submit>Ask</button></div></form>
  <div class="nr-browser-ai__actions"><button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-abort>Stop response</button><button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-reset>Reset conversation</button><button class="nr-browser-ai__button nr-browser-ai__button--secondary" type="button" data-nr-browser-ai-retry>Retry</button></div>
  <footer class="nr-browser-ai__footer"><a href="https://www.netresearch.de/">Netresearch DTT GmbH</a></footer>
 </div>
</section>`;
}

/** Wraps the assistant section in a page whose main area provides page context. */
export function assistantDocument(options: AssistantMarkupOptions = {}): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Assistant fixture</title></head><body>
<main><article><h1>Current page</h1><p>Grounded page content.</p></article>
${assistantSection(options)}</main></body></html>`;
}

function escapeAttribute(value: string): string {
    return value
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;');
}
