<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Domain\Form;

use function array_keys;
use function is_array;
use function is_string;
use function json_encode;

use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;
use const JSON_UNESCAPED_UNICODE;

/**
 * A form's JSON Schema, together with the input elements it could not describe.
 *
 * The second list exists so that an unmapped element type is visible instead of
 * silently absent: a property missing from the schema is a parameter the model
 * can never set, and that is a defect worth failing a test over rather than a
 * detail to discover in the browser.
 */
final readonly class FormSchema
{
    /**
     * @param array<string, mixed> $schema
     * @param list<string>         $unsupportedElements element identifiers, in document order
     */
    public function __construct(
        public array $schema,
        public array $unsupportedElements = [],
    ) {}

    /**
     * @return list<string>
     */
    public function propertyNames(): array
    {
        $properties = $this->schema['properties'] ?? [];
        if (!is_array($properties)) {
            return [];
        }

        $names = [];
        foreach (array_keys($properties) as $name) {
            if (is_string($name)) {
                $names[] = $name;
            }
        }

        return $names;
    }

    public function isEmpty(): bool
    {
        return $this->propertyNames() === [];
    }

    public function toJson(): string
    {
        return json_encode(
            $this->schema,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
    }
}
