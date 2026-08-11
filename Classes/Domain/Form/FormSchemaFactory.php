<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Domain\Form;

use function array_is_list;
use function array_keys;
use function in_array;
use function is_array;
use function is_bool;
use function is_numeric;
use function is_scalar;
use function is_string;
use function trim;

/**
 * Turns an EXT:form definition into the JSON Schema that constrains the model's
 * structured output.
 *
 * The form definition is used as the source because it already carries the
 * semantics a model needs and a hand-written schema would have to repeat: the
 * option values of a select, the bounds of a number, whether an entry is
 * mandatory, and a sentence per element saying what it means. Keeping one
 * source also keeps the schema from describing a form that no longer exists.
 *
 * A multi-value element becomes one array property whose items carry the
 * options as an enum, not one boolean property per option. That is what makes a
 * form with forty selectable variables affordable for an on-device model.
 */
final class FormSchemaFactory
{
    /**
     * Elements that hold other elements. They carry no value of their own and
     * are descended into.
     */
    private const CONTAINER_TYPES = [
        'Page',
        'Fieldset',
        'GridRow',
        'SummaryPage',
    ];

    /**
     * Elements that render but hold nothing the model should supply. Listing
     * them explicitly keeps them out of the unsupported report, which is
     * reserved for element types nobody has mapped yet.
     */
    private const VALUELESS_TYPES = [
        'StaticText',
        'ContentElement',
        'Html',
        'Hidden',
        'Honeypot',
        'ImageUpload',
        'FileUpload',
    ];

    private const SINGLE_CHOICE_TYPES = [
        'SingleSelect',
        'RadioButton',
        'CountrySelect',
    ];

    private const MULTIPLE_CHOICE_TYPES = [
        'MultiSelect',
        'MultiCheckbox',
    ];

    /**
     * @param array<string, mixed> $definition a form definition as loaded from YAML
     */
    public function create(array $definition): FormSchema
    {
        $properties  = [];
        $required    = [];
        $unsupported = [];

        foreach ($this->inputElements($definition, $unsupported) as $element) {
            $identifier = $element['identifier'];
            $property   = $this->property($element);
            if ($property === null) {
                $unsupported[] = $identifier;
                continue;
            }

            $properties[$identifier] = $property;
            if ($this->isRequired($element['definition'])) {
                $required[] = $identifier;
            }
        }

        if ($properties === []) {
            return new FormSchema([], $unsupported);
        }

        $schema = [
            'type'                 => 'object',
            'properties'           => $properties,
            'additionalProperties' => false,
        ];
        if ($required !== []) {
            $schema['required'] = $required;
        }

        return new FormSchema($schema, $unsupported);
    }

    /**
     * @param array<mixed> $renderable
     * @param list<string> $unsupported
     *
     * @return list<array{identifier: string, type: string, definition: array<mixed>}>
     */
    private function inputElements(array $renderable, array &$unsupported): array
    {
        $children = $renderable['renderables'] ?? null;
        if (!is_array($children)) {
            return [];
        }

        $elements = [];
        foreach ($children as $child) {
            if (!is_array($child)) {
                continue;
            }

            $type       = is_string($child['type'] ?? null) ? $child['type'] : '';
            $identifier = is_string($child['identifier'] ?? null) ? $child['identifier'] : '';

            if (in_array($type, self::CONTAINER_TYPES, true)) {
                foreach ($this->inputElements($child, $unsupported) as $nested) {
                    $elements[] = $nested;
                }

                continue;
            }

            if ($identifier === '') {
                continue;
            }

            if (in_array($type, self::VALUELESS_TYPES, true)) {
                continue;
            }

            $elements[] = ['identifier' => $identifier, 'type' => $type, 'definition' => $child];
        }

        return $elements;
    }

    /**
     * @param array{identifier: string, type: string, definition: array<mixed>} $element
     *
     * @return array<string, mixed>|null null when the element type has no mapping
     */
    private function property(array $element): ?array
    {
        $property = $this->typeProperty($element['type'], $element['definition']);
        if ($property === null) {
            return null;
        }

        $title = $this->text($element['definition']['label'] ?? null);
        if ($title !== '') {
            $property['title'] = $title;
        }

        $properties  = $element['definition']['properties'] ?? null;
        $description = is_array($properties)
            ? $this->text($properties['elementDescription'] ?? null)
            : '';
        if ($description !== '') {
            $property['description'] = $description;
        }

        // A YAML default arrives as a string even for a number element, and a
        // number property declaring default: "7" is a schema that contradicts
        // itself. The default is stated in the property's own type or not at
        // all.
        $default = $this->defaultValue($element['definition']['defaultValue'] ?? null, $property['type'] ?? null);
        if ($default !== null) {
            $property['default'] = $default;
        }

        return $property + $this->constraints($element['definition']);
    }

    private function defaultValue(mixed $default, mixed $type): mixed
    {
        if ($default === null || $default === '') {
            return null;
        }

        if ($type === 'number') {
            return $this->number($default);
        }

        if ($type === 'boolean') {
            if (is_bool($default)) {
                return $default;
            }

            return is_scalar($default) && in_array((string) $default, ['1', 'true', 'on'], true);
        }

        if ($type === 'array') {
            return is_array($default) && array_is_list($default) ? $default : null;
        }

        return is_scalar($default) ? (string) $default : null;
    }

    /**
     * @param array<mixed> $definition
     *
     * @return array<string, mixed>|null
     */
    private function typeProperty(string $type, array $definition): ?array
    {
        if (in_array($type, self::SINGLE_CHOICE_TYPES, true)) {
            $options = $this->optionValues($definition);

            return $options === [] ? null : ['type' => 'string', 'enum' => $options];
        }

        if (in_array($type, self::MULTIPLE_CHOICE_TYPES, true)) {
            $options = $this->optionValues($definition);

            return $options === []
                ? null
                : ['type' => 'array', 'items' => ['type' => 'string', 'enum' => $options]];
        }

        return match ($type) {
            'Text', 'Textarea', 'Email', 'Telephone', 'Url', 'Password' => ['type' => 'string'],
            'Number'                                                    => ['type' => 'number'],
            'Checkbox'                                                  => ['type' => 'boolean'],
            'Date', 'DatePicker'                                        => ['type' => 'string', 'format' => 'date'],
            default                                                     => null,
        };
    }

    /**
     * @param array<mixed> $definition
     *
     * @return list<string>
     */
    private function optionValues(array $definition): array
    {
        $properties = $definition['properties'] ?? null;
        if (!is_array($properties)) {
            return [];
        }

        $options = $properties['options'] ?? null;
        if (!is_array($options) || $options === []) {
            return [];
        }

        $values = [];
        foreach (array_keys($options) as $value) {
            if (is_string($value) && $value !== '') {
                $values[] = $value;
            } elseif (is_int($value)) {
                $values[] = (string) $value;
            }
        }

        return $values;
    }

    /**
     * Only the validators with a JSON Schema counterpart are mapped. A
     * validator without one still runs in the browser and on the server; the
     * schema simply does not repeat it.
     *
     * @param array<mixed> $definition
     *
     * @return array<string, mixed>
     */
    private function constraints(array $definition): array
    {
        $constraints = [];
        foreach ($this->validators($definition) as $validator) {
            $options = is_array($validator['options'] ?? null) ? $validator['options'] : [];
            $mapped  = match ($validator['identifier']) {
                'NumberRange' => [
                    'minimum' => $this->number($options['minimum'] ?? null),
                    'maximum' => $this->number($options['maximum'] ?? null),
                ],
                'StringLength' => [
                    'minLength' => $this->integer($options['minimum'] ?? null),
                    'maxLength' => $this->integer($options['maximum'] ?? null),
                ],
                'RegularExpression' => [
                    'pattern' => $this->pattern($options['regularExpression'] ?? null),
                ],
                default => [],
            };

            foreach ($mapped as $keyword => $value) {
                if ($value !== null) {
                    $constraints[$keyword] = $value;
                }
            }
        }

        return $constraints;
    }

    /**
     * @param array<mixed> $definition
     */
    private function isRequired(array $definition): bool
    {
        foreach ($this->validators($definition) as $validator) {
            if ($validator['identifier'] === 'NotEmpty') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<mixed> $definition
     *
     * @return list<array{identifier: string, options?: mixed}>
     */
    private function validators(array $definition): array
    {
        $validators = $definition['validators'] ?? null;
        if (!is_array($validators)) {
            return [];
        }

        $result = [];
        foreach ($validators as $validator) {
            if (!is_array($validator)) {
                continue;
            }

            if (!is_string($validator['identifier'] ?? null)) {
                continue;
            }

            $result[] = ['identifier' => $validator['identifier'], 'options' => $validator['options'] ?? null];
        }

        return $result;
    }

    private function text(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    private function number(mixed $value): float|int|null
    {
        if (is_bool($value) || !is_numeric($value)) {
            return null;
        }

        return $value + 0;
    }

    private function integer(mixed $value): ?int
    {
        $number = $this->number($value);

        return $number === null ? null : (int) $number;
    }

    /**
     * A PHP delimited pattern is not a JSON Schema pattern: the delimiters and
     * modifiers have no meaning there and would be matched literally by a
     * consumer, so an unwrappable value is dropped rather than passed on wrong.
     */
    private function pattern(mixed $value): ?string
    {
        if (!is_string($value) || $value === '') {
            return null;
        }

        $delimiter = $value[0];
        $end       = strrpos($value, $delimiter);
        if ($end === false || $end === 0) {
            return null;
        }

        $pattern = substr($value, 1, $end - 1);

        return $pattern === '' ? null : $pattern;
    }
}
