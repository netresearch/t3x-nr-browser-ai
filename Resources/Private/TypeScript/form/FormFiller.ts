import type {FormSchema, FormValue, FormValues} from './FormSchema';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Writes values into the controls EXT:form rendered, and reads them back.
 *
 * Controls are found by the element identifier their name ends with, not by a
 * name derived on the server. EXT:form builds that name from the form
 * identifier and the surrounding plugin namespace, and both the prefix and the
 * exact shape have differed between TYPO3 versions; the trailing identifier has
 * not. Tests/Functional/Controller/FormAssistantControllerTest asserts that
 * every schema property can indeed be found this way in the rendered markup.
 *
 * Values are written, never submitted. What the visitor sees on screen after a
 * tool call is exactly what was sent, which is the only reason the derivation
 * from a sentence is inspectable at all.
 */
export class FormFiller {
    public constructor(private readonly form: HTMLFormElement) {}

    /**
     * @return the identifiers that had no control to write into
     */
    public fill(schema: FormSchema, values: FormValues): string[] {
        const missing: string[] = [];

        for (const [name, value] of Object.entries(values)) {
            const property = schema.properties[name];
            const controls = this.controlsFor(name);
            if (property === undefined || controls.length === 0) {
                missing.push(name);
                continue;
            }

            if (property.type === 'array') {
                this.setGroup(controls, Array.isArray(value) ? value : []);
            } else if (property.type === 'boolean') {
                this.setBoolean(controls, value === true);
            } else {
                this.setSingle(controls, String(value));
            }
        }

        return missing;
    }

    public read(schema: FormSchema): FormValues {
        const values: FormValues = {};

        for (const [name, property] of Object.entries(schema.properties)) {
            const controls = this.controlsFor(name);
            if (controls.length === 0) {
                continue;
            }

            const value = this.readValue(property.type, controls);
            if (value !== undefined) {
                values[name] = value;
            }
        }

        return values;
    }

    private readValue(type: string, controls: Control[]): FormValue | undefined {
        if (type === 'array') {
            return this.readGroup(controls);
        }
        if (type === 'boolean') {
            return controls.some(control => isCheckbox(control) && control.checked);
        }

        const first = controls[0];
        if (first === undefined) {
            return undefined;
        }
        if (isSelect(first)) {
            return first.value;
        }
        if (type === 'number') {
            const value = Number(first.value);
            return Number.isFinite(value) ? value : undefined;
        }

        return first.value;
    }

    private readGroup(controls: Control[]): string[] {
        const values: string[] = [];
        for (const control of controls) {
            if (isCheckbox(control) && control.checked) {
                values.push(control.value);
            } else if (isSelect(control)) {
                for (const option of Array.from(control.selectedOptions)) {
                    values.push(option.value);
                }
            }
        }

        return values;
    }

    private setGroup(controls: Control[], values: FormValue[]): void {
        const wanted = new Set(values.map(value => String(value)));
        for (const control of controls) {
            if (isCheckbox(control)) {
                control.checked = wanted.has(control.value);
                notify(control);
            } else if (isSelect(control)) {
                for (const option of Array.from(control.options)) {
                    option.selected = wanted.has(option.value);
                }
                notify(control);
            }
        }
    }

    private setBoolean(controls: Control[], checked: boolean): void {
        for (const control of controls) {
            if (isCheckbox(control)) {
                control.checked = checked;
                notify(control);
            }
        }
    }

    private setSingle(controls: Control[], value: string): void {
        const control = controls[0];
        if (control === undefined) {
            return;
        }
        if (isSelect(control) && !Array.from(control.options).some(option => option.value === value)) {
            return;
        }
        control.value = value;
        notify(control);
    }

    private controlsFor(identifier: string): Control[] {
        const controls: Control[] = [];
        for (const element of Array.from(this.form.elements)) {
            if (!isControl(element) || element.type === 'hidden') {
                continue;
            }
            if (identifierOf(element.name) === identifier) {
                controls.push(element);
            }
        }

        return controls;
    }
}

/**
 * `tx_form_formframework[weatherQuery][hourlyVariables][]` names the element
 * `hourlyVariables`. The trailing pair of empty brackets marks a multi-value
 * control and belongs to no identifier.
 */
export function identifierOf(name: string): string | undefined {
    const trimmed = name.endsWith('[]') ? name.slice(0, -2) : name;
    const end = trimmed.lastIndexOf(']');
    if (end < 0) {
        return undefined;
    }
    const start = trimmed.lastIndexOf('[', end);
    if (start < 0) {
        return undefined;
    }
    const identifier = trimmed.slice(start + 1, end);

    return identifier.length > 0 ? identifier : undefined;
}

function isControl(element: Element): element is Control {
    return element instanceof HTMLInputElement
        || element instanceof HTMLSelectElement
        || element instanceof HTMLTextAreaElement;
}

function isCheckbox(control: Control): control is HTMLInputElement {
    return control instanceof HTMLInputElement && control.type === 'checkbox';
}

function isSelect(control: Control): control is HTMLSelectElement {
    return control instanceof HTMLSelectElement;
}

/**
 * A value set from script fires no event of its own, and the form's own
 * scripts — EXT:form's, a theme's — listen for these. Announcing the change
 * keeps a filled control indistinguishable from one a visitor operated.
 */
function notify(control: Control): void {
    control.dispatchEvent(new Event('input', {bubbles: true}));
    control.dispatchEvent(new Event('change', {bubbles: true}));
}
