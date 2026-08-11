/**
 * The subset of JSON Schema this extension generates and understands.
 *
 * It is deliberately narrow. The schema is produced by
 * Classes/Domain/Form/FormSchemaFactory from an EXT:form definition, so the
 * shapes that can occur are exactly the ones that factory emits — and keeping
 * the reader that narrow means an unexpected shape is rejected rather than
 * half-understood.
 */

export interface StringProperty {
    type: 'string';
    title?: string;
    description?: string;
    default?: string;
    format?: string;
    enum?: string[];
    pattern?: string;
    minLength?: number;
    maxLength?: number;
}

export interface NumberProperty {
    type: 'number';
    title?: string;
    description?: string;
    default?: number | string;
    minimum?: number;
    maximum?: number;
}

export interface BooleanProperty {
    type: 'boolean';
    title?: string;
    description?: string;
    default?: boolean | string;
}

export interface ArrayProperty {
    type: 'array';
    title?: string;
    description?: string;
    default?: string[];
    items: {type: 'string'; enum?: string[]};
}

export type SchemaProperty = StringProperty | NumberProperty | BooleanProperty | ArrayProperty;

export interface FormSchema {
    type: 'object';
    properties: Record<string, SchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
}

export type FormValue = string | number | boolean | string[];

export type FormValues = Record<string, FormValue>;
