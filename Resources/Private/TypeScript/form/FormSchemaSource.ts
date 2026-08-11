import type {ArrayProperty, FormSchema, SchemaProperty} from './FormSchema';

const SUPPORTED_TYPES = new Set(['string', 'number', 'boolean', 'array']);

/**
 * Reads the schema the server put on the plugin root.
 *
 * The value is parsed and checked rather than trusted. It arrives through the
 * DOM, and a schema that is merely assumed to be well formed would surface as
 * an exception in the middle of a tool call — after the model has already
 * spent its turn on it.
 */
export function readFormSchema(serialized: string): FormSchema | undefined {
    if (serialized.trim().length === 0) {
        return undefined;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(serialized);
    } catch {
        return undefined;
    }

    if (!isRecord(parsed) || parsed['type'] !== 'object' || !isRecord(parsed['properties'])) {
        return undefined;
    }

    const properties: Record<string, SchemaProperty> = {};
    for (const [name, property] of Object.entries(parsed['properties'])) {
        const checked = readProperty(property);
        if (checked === undefined) {
            return undefined;
        }
        properties[name] = checked;
    }
    if (Object.keys(properties).length === 0) {
        return undefined;
    }

    const required = parsed['required'];

    return {
        type: 'object',
        properties,
        required: isStringArray(required) ? required : [],
        additionalProperties: parsed['additionalProperties'] === true,
    };
}

function readProperty(property: unknown): SchemaProperty | undefined {
    if (!isRecord(property) || typeof property['type'] !== 'string') {
        return undefined;
    }
    if (!SUPPORTED_TYPES.has(property['type'])) {
        return undefined;
    }
    if (property['type'] === 'array' && !isStringItems(property['items'])) {
        return undefined;
    }

    return property as unknown as SchemaProperty;
}

function isStringItems(items: unknown): items is ArrayProperty['items'] {
    return isRecord(items) && items['type'] === 'string';
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
