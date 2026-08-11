import {validateArguments} from '../form/ArgumentValidator';
import type {FormFiller} from '../form/FormFiller';
import type {FormSchema, FormValues} from '../form/FormSchema';
import type {ActionOutcome, FormAction} from '../query/FormAction';

export interface ToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: FormSchema;
    execute(input: unknown, signal?: AbortSignal): Promise<string>;
}

/**
 * Reported as the call proceeds, so the page can show what is happening while
 * it happens rather than only its outcome.
 */
export interface ToolObserver {
    onCall(input: unknown): void;
    onRejected(reason: string): void;
    onFilled(values: FormValues): void;
    onOutcome(outcome: ActionOutcome): void;
}

/**
 * One tool: fill the form with the derived parameters, run it, return the
 * result.
 *
 * The whole chain sits in one call because the caller — the page's own session
 * or an agent through the browser's model context — should get an answer, not
 * a filled form it then has to know to submit. The values are still written
 * into the visible controls first, so what was derived stays inspectable and
 * correctable afterwards.
 *
 * The form is read back after filling. A model sets only what the request
 * mentioned; everything else has to come from the form's own current state,
 * which is also what makes a second run after a manual correction behave the
 * way the visitor expects.
 */
export class FormTool implements ToolDefinition {
    public constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly inputSchema: FormSchema,
        private readonly filler: FormFiller,
        private readonly action: FormAction,
        private readonly observer: ToolObserver,
    ) {}

    public async execute(input: unknown, signal?: AbortSignal): Promise<string> {
        this.observer.onCall(input);

        const validation = validateArguments(this.inputSchema, input);
        if (!validation.accepted) {
            this.observer.onRejected(validation.reason);

            return `The arguments were not applied: ${validation.reason}`;
        }

        this.filler.fill(this.inputSchema, validation.values);
        const values = this.filler.read(this.inputSchema);
        this.observer.onFilled(values);

        const outcome = await this.action.run(values, signal);
        this.observer.onOutcome(outcome);

        return outcome.summary;
    }

    /** Run the form as it currently stands, without a model in the loop. */
    public async rerun(signal?: AbortSignal): Promise<ActionOutcome> {
        const values = this.filler.read(this.inputSchema);
        this.observer.onFilled(values);

        const outcome = await this.action.run(values, signal);
        this.observer.onOutcome(outcome);

        return outcome;
    }
}
