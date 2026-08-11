import type {FormSchema, FormValue, FormValues, SchemaProperty} from './FormSchema';

export type ValidationResult =
    | {accepted: true; values: FormValues}
    | {accepted: false; reason: string};

/**
 * Checks a tool call's arguments against the schema before anything is written
 * into the page.
 *
 * `responseConstraint` narrows what the on-device model may emit, and a WebMCP
 * caller is expected to honour the published schema — but neither is a
 * guarantee, and both are outside this extension's control. Model output and
 * caller input are untrusted data by house rule, so the same rule applies here:
 * an argument is used only after it has been shown to fit.
 *
 * The check is deliberately strict about enums. A value outside the option set
 * would reach the data source as an invalid parameter and come back as an
 * opaque error, which is a worse failure than saying plainly that the argument
 * did not fit.
 */
export function validateArguments(schema: FormSchema, input: unknown): ValidationResult {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return {accepted: false, reason: 'The arguments are not an object.'};
    }

    const provided = input as Record<string, unknown>;
    const values: FormValues = {};

    for (const [name, raw] of Object.entries(provided)) {
        if (raw === undefined || raw === null) {
            continue;
        }
        const property = schema.properties[name];
        if (property === undefined) {
            return {accepted: false, reason: `The form has no field named "${name}".`};
        }
        const value = coerce(property, raw);
        if (value === undefined) {
            return {accepted: false, reason: `The value for "${name}" does not fit that field.`};
        }
        values[name] = value;
    }

    for (const name of schema.required ?? []) {
        const value = values[name];
        if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
            return {accepted: false, reason: `"${name}" is required and was not supplied.`};
        }
    }

    return {accepted: true, values};
}

function coerce(property: SchemaProperty, raw: unknown): FormValue | undefined {
    switch (property.type) {
        case 'string':
            return coerceString(property.enum, raw);
        case 'number':
            return coerceNumber(property.minimum, property.maximum, raw);
        case 'boolean':
            return coerceBoolean(raw);
        case 'array':
            return coerceArray(property.items.enum, raw);
    }
}

function coerceString(allowed: string[] | undefined, raw: unknown): string | undefined {
    if (typeof raw !== 'string') {
        return undefined;
    }
    if (allowed !== undefined && !allowed.includes(raw)) {
        return undefined;
    }

    return raw;
}

/**
 * A model that has been told a bound often still emits a value outside it, so
 * a number is clamped rather than rejected: the request was understood, only
 * its magnitude was not available.
 */
function coerceNumber(minimum: number | undefined, maximum: number | undefined, raw: unknown): number | undefined {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(value)) {
        return undefined;
    }

    let clamped = value;
    if (minimum !== undefined) {
        clamped = Math.max(clamped, minimum);
    }
    if (maximum !== undefined) {
        clamped = Math.min(clamped, maximum);
    }

    return clamped;
}

function coerceBoolean(raw: unknown): boolean | undefined {
    if (typeof raw === 'boolean') {
        return raw;
    }
    if (raw === 'true' || raw === '1') {
        return true;
    }
    if (raw === 'false' || raw === '0') {
        return false;
    }

    return undefined;
}

/**
 * A single value where a list is expected is accepted as a list of one. That
 * is the mistake models make most often here, it is unambiguous, and rejecting
 * the whole call over it would waste a turn.
 */
function coerceArray(allowed: string[] | undefined, raw: unknown): string[] | undefined {
    const entries = Array.isArray(raw) ? raw : [raw];
    const values: string[] = [];
    for (const entry of entries) {
        const value = coerceString(allowed, entry);
        if (value === undefined) {
            return undefined;
        }
        if (!values.includes(value)) {
            values.push(value);
        }
    }

    return values;
}
