/**
 * Single source of the form assistant root markup for the browser unit tests
 * and the end-to-end suite. Both drive the real bundle against this markup, so
 * it has to mirror Resources/Private/Templates/FormAssistant/Show.html.
 *
 * FormTemplateContract.test.ts compares the hooks, label attributes and
 * configuration attributes below against the Fluid template in both directions
 * and fails when either side drifts.
 */

/** Attributes the bundle queries to find its elements. */
export const ELEMENT_HOOKS = [
    'data-nr-browser-ai-form-root',
    'data-nr-browser-ai-form-assistant',
    'data-nr-browser-ai-form-status',
    'data-nr-browser-ai-form-setup',
    'data-nr-browser-ai-form-progress',
    'data-nr-browser-ai-form-request',
    'data-nr-browser-ai-form-submit',
    'data-nr-browser-ai-form-announcement',
    'data-nr-browser-ai-form-result',
] as const;

/**
 * Hooks the Fluid template renders but the bundle never queries unless the
 * editor turned the disclosure on. Their absence is not an error.
 */
export const SERVER_RENDERED_HOOKS = [
    'data-nr-browser-ai-form-fields',
    'data-nr-browser-ai-form-configuration',
    'data-nr-browser-ai-form-schema-display',
    'data-nr-browser-ai-form-call',
] as const;

/** Configuration attributes the bundle reads when bootstrapping an instance. */
export const CONFIGURATION_ATTRIBUTES = [
    'data-form-identifier',
    'data-form-schema',
    'data-tool-name',
    'data-tool-description',
    'data-action',
    'data-system-prompt',
    'data-supplemental-instruction',
] as const;

export const LABEL_ATTRIBUTES = [
    'data-label-checking',
    'data-label-downloadable',
    'data-label-downloading',
    'data-label-ready',
    'data-label-deriving',
    'data-label-querying',
    'data-label-filled',
    'data-label-rejected',
    'data-label-unresolved-place',
    'data-label-query-failed',
    'data-label-rate-limited',
    'data-label-error-retryable',
    'data-label-unavailable',
    'data-label-result-caption',
    'data-label-result-place',
    'data-label-result-time',
] as const;

export const ENGLISH_LABELS: Readonly<Record<(typeof LABEL_ATTRIBUTES)[number], string>> = {
    'data-label-checking': 'Checking browser AI availability…',
    'data-label-downloadable': 'Browser AI needs to be set up before use.',
    'data-label-downloading': 'Setting up browser AI…',
    'data-label-ready': 'Describe what you want and the form will be filled with it.',
    'data-label-deriving': 'Deriving the parameters…',
    'data-label-querying': 'Running the query…',
    'data-label-filled': 'Form filled and query answered. Adjust anything and run it again.',
    'data-label-rejected': 'The derived parameters did not fit the form, so nothing was changed. '
        + 'Try describing it differently.',
    'data-label-unresolved-place': 'That place could not be found. '
        + 'Try a larger nearby place or add the country.',
    'data-label-query-failed': 'The data source could not be reached. '
        + 'The form keeps its values, so you can run it again.',
    'data-label-rate-limited': 'The data source is refusing further requests for now. '
        + 'Wait a moment and run it again.',
    'data-label-unavailable': 'Browser AI is unavailable in this browser. '
        + 'The form can still be filled in and run by hand.',
    'data-label-error-retryable': 'Browser AI could not be reached. You can retry.',
    'data-label-result-caption': 'Query result',
    'data-label-result-place': 'Place',
    'data-label-result-time': 'Time',
};

export const DEMONSTRATION_SCHEMA = {
    type: 'object',
    properties: {
        place: {type: 'string', description: 'The place.'},
        forecastDays: {type: 'number', description: 'Days ahead.', minimum: 0, maximum: 16},
        dailyVariables: {
            type: 'array',
            description: 'Per-day variables.',
            items: {type: 'string', enum: ['temperature_2m_max', 'precipitation_sum']},
        },
    },
    required: ['place'],
    additionalProperties: false,
} as const;

export interface FormAssistantMarkupOptions {
    id?: string;
    schema?: unknown;
    toolName?: string;
    action?: string;
}

const FIELD_PREFIX = 'tx_form_formframework[weatherQuery]';

/** Renders the plugin section the way the Fluid template emits it. */
export function formAssistantSection(options: FormAssistantMarkupOptions = {}): string {
    const id = options.id ?? 'form-assistant';
    const schema = options.schema === undefined ? DEMONSTRATION_SCHEMA : options.schema;
    const serialized = typeof schema === 'string' ? schema : JSON.stringify(schema);

    const labels = LABEL_ATTRIBUTES
        .map(attribute => ` ${attribute}="${escapeAttribute(ENGLISH_LABELS[attribute])}"`)
        .join('');

    const boxes = ['temperature_2m_max', 'precipitation_sum']
        .map(value => `<label><input type="checkbox" name="${FIELD_PREFIX}[dailyVariables][]"`
            + ` value="${value}"> ${value}</label>`)
        .join('');

    return `<section id="${id}" class="nr-browser-ai-form" aria-label="Form assistant"
 data-nr-browser-ai-form-root
 data-form-identifier="weatherQuery"
 data-form-schema="${escapeAttribute(serialized)}"
 data-tool-name="${escapeAttribute(options.toolName ?? 'nr_browser_ai_weatherQuery')}"
 data-tool-description="Query a weather forecast for a place."
 data-action="${escapeAttribute(options.action ?? 'openMeteo')}"
 data-system-prompt="Derive the form parameters from the request."
 data-supplemental-instruction=""${labels}>
 <div class="nr-browser-ai-form__assistant" data-nr-browser-ai-form-assistant hidden>
  <p id="${id}-status" class="nr-browser-ai-form__status" data-nr-browser-ai-form-status role="status" aria-atomic="true" tabindex="-1"></p>
  <button class="nr-browser-ai-form__button" type="button" data-nr-browser-ai-form-setup>Set up browser AI</button>
  <progress class="nr-browser-ai-form__progress" data-nr-browser-ai-form-progress max="1" value="0"></progress>
  <div class="nr-browser-ai-form__request"><label class="nr-browser-ai-form__label" for="${id}-request">What do you want to know?</label><div class="nr-browser-ai-form__input-row"><input class="nr-browser-ai-form__input" id="${id}-request" type="text" data-nr-browser-ai-form-request autocomplete="off" aria-describedby="${id}-status"><button class="nr-browser-ai-form__button" type="button" data-nr-browser-ai-form-submit>Fill and run</button></div></div>
  <p class="nr-browser-ai-form__visually-hidden" data-nr-browser-ai-form-announcement aria-live="polite" aria-atomic="true"></p>
 </div>
 <div class="nr-browser-ai-form__form" data-nr-browser-ai-form-fields>
  <form>
   <input type="hidden" name="${FIELD_PREFIX}[__state]" value="x">
   <label for="${id}-place">Place</label><input id="${id}-place" type="text" name="${FIELD_PREFIX}[place]">
   <label for="${id}-days">Forecast days</label><input id="${id}-days" type="number" name="${FIELD_PREFIX}[forecastDays]" value="7">
   <fieldset><legend>Daily variables</legend>${boxes}</fieldset>
   <button type="submit">Run query</button>
  </form>
 </div>
 <div class="nr-browser-ai-form__result" data-nr-browser-ai-form-result hidden></div>
 <details class="nr-browser-ai-form__configuration" data-nr-browser-ai-form-configuration>
  <summary>What this form exposes to an assistant</summary>
  <dl><dt>Input schema</dt><dd><pre data-nr-browser-ai-form-schema-display></pre></dd><dt>Last tool call</dt><dd><pre data-nr-browser-ai-form-call>No call yet.</pre></dd></dl>
 </details>
</section>`;
}

export function formAssistantDocument(options: FormAssistantMarkupOptions = {}): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Form assistant fixture</title></head><body>
<main>${formAssistantSection(options)}</main></body></html>`;
}

function escapeAttribute(value: string): string {
    return value
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;');
}
