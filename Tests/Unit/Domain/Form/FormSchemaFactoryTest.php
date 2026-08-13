<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Unit\Domain\Form;

use function count;
use function dirname;
use function file_get_contents;
use function is_array;

use Netresearch\NrBrowserAi\Domain\Form\FormSchemaFactory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

final class FormSchemaFactoryTest extends TestCase
{
    private const SHIPPED_FORM = 'Resources/Private/Forms/weatherQuery.form.yaml';

    /**
     * @param array<string, mixed> $element
     * @param array<string, mixed> $expected
     */
    #[Test]
    #[DataProvider('elementProvider')]
    public function elementBecomesTheExpectedProperty(array $element, array $expected): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([$element]));

        self::assertSame([], $schema->unsupportedElements);
        self::assertSame($expected, $schema->schema['properties']['field'] ?? null);
    }

    /**
     * @return iterable<string, array{array<string, mixed>, array<string, mixed>}>
     */
    public static function elementProvider(): iterable
    {
        yield 'text' => [
            ['type' => 'Text', 'identifier' => 'field', 'label' => 'A field'],
            ['type' => 'string', 'title' => 'A field'],
        ];

        yield 'text with description' => [
            [
                'type'       => 'Text',
                'identifier' => 'field',
                'label'      => 'A field',
                'properties' => ['elementDescription' => 'What it means'],
            ],
            ['type' => 'string', 'title' => 'A field', 'description' => 'What it means'],
        ];

        yield 'number with range' => [
            [
                'type'       => 'Number',
                'identifier' => 'field',
                'validators' => [
                    ['identifier' => 'NumberRange', 'options' => ['minimum' => 0, 'maximum' => 16]],
                ],
            ],
            ['type' => 'number', 'minimum' => 0, 'maximum' => 16],
        ];

        yield 'checkbox' => [
            ['type' => 'Checkbox', 'identifier' => 'field'],
            ['type' => 'boolean'],
        ];

        yield 'date' => [
            ['type' => 'Date', 'identifier' => 'field'],
            ['type' => 'string', 'format' => 'date'],
        ];

        yield 'single select becomes an enum of the option keys' => [
            [
                'type'       => 'SingleSelect',
                'identifier' => 'field',
                'properties' => ['options' => ['celsius' => 'Celsius', 'fahrenheit' => 'Fahrenheit']],
            ],
            ['type' => 'string', 'enum' => ['celsius', 'fahrenheit']],
        ];

        yield 'multi checkbox becomes one array property, not one property per option' => [
            [
                'type'       => 'MultiCheckbox',
                'identifier' => 'field',
                'properties' => ['options' => ['rain' => 'Rain', 'snowfall' => 'Snowfall']],
            ],
            ['type' => 'array', 'items' => ['type' => 'string', 'enum' => ['rain', 'snowfall']]],
        ];

        yield 'default value is carried over' => [
            ['type' => 'Text', 'identifier' => 'field', 'defaultValue' => 'Leipzig'],
            ['type' => 'string', 'default' => 'Leipzig'],
        ];

        yield 'string length becomes length bounds' => [
            [
                'type'       => 'Text',
                'identifier' => 'field',
                'validators' => [
                    ['identifier' => 'StringLength', 'options' => ['minimum' => 2, 'maximum' => 40]],
                ],
            ],
            ['type' => 'string', 'minLength' => 2, 'maxLength' => 40],
        ];

        yield 'a delimited php pattern is unwrapped' => [
            [
                'type'       => 'Text',
                'identifier' => 'field',
                'validators' => [
                    ['identifier' => 'RegularExpression', 'options' => ['regularExpression' => '/^[a-z]+$/u']],
                ],
            ],
            ['type' => 'string', 'pattern' => '^[a-z]+$'],
        ];
    }

    /**
     * A YAML default is a string even for a number element. A number property
     * declaring default: "7" is a schema that contradicts itself, and a model
     * asked to honour it has to guess which half to believe.
     */
    #[Test]
    public function aDefaultIsStatedInThePropertysOwnType(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            ['type' => 'Number', 'identifier' => 'days', 'defaultValue' => '7'],
            ['type' => 'Checkbox', 'identifier' => 'detailed', 'defaultValue' => '1'],
            ['type' => 'Text', 'identifier' => 'place', 'defaultValue' => 'Leipzig'],
        ]));
        $properties = $schema->schema['properties'];

        self::assertIsArray($properties);
        self::assertSame(7, $properties['days']['default'] ?? null);
        self::assertTrue($properties['detailed']['default'] ?? null);
        self::assertSame('Leipzig', $properties['place']['default'] ?? null);
    }

    #[Test]
    public function anEmptyDefaultIsNoDefault(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            ['type' => 'Text', 'identifier' => 'place', 'defaultValue' => ''],
        ]));
        $properties = $schema->schema['properties'];

        self::assertIsArray($properties);
        self::assertArrayNotHasKey('default', $properties['place']);
    }

    #[Test]
    public function theShippedNumberDefaultsAreNumbers(): void
    {
        $schema     = (new FormSchemaFactory())->create($this->shippedForm());
        $properties = $schema->schema['properties'];

        self::assertIsArray($properties);
        self::assertIsInt($properties['forecastDays']['default'] ?? null);
        self::assertIsInt($properties['pastDays']['default'] ?? null);
        self::assertIsArray($properties['hourlyVariables']['default'] ?? null);
    }

    #[Test]
    public function notEmptyMakesThePropertyRequired(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            ['type' => 'Text', 'identifier' => 'place', 'validators' => [['identifier' => 'NotEmpty']]],
            ['type' => 'Text', 'identifier' => 'optional'],
        ]));

        self::assertSame(['place'], $schema->schema['required'] ?? null);
    }

    #[Test]
    public function nestedContainersAreDescendedInto(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            [
                'type'        => 'Fieldset',
                'identifier'  => 'group',
                'renderables' => [
                    ['type' => 'Text', 'identifier' => 'inner'],
                ],
            ],
        ]));

        self::assertSame(['inner'], $schema->propertyNames());
    }

    #[Test]
    public function elementsWithoutAValueAreNeitherDescribedNorReported(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            ['type' => 'StaticText', 'identifier' => 'explanation'],
            ['type' => 'Text', 'identifier' => 'field'],
        ]));

        self::assertSame(['field'], $schema->propertyNames());
        self::assertSame([], $schema->unsupportedElements);
    }

    /**
     * An element type nobody has mapped is a parameter the model can never set.
     * Reporting it is what keeps that a visible defect instead of a silent gap.
     */
    #[Test]
    public function anUnmappedElementTypeIsReported(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            ['type' => 'SomeFutureElement', 'identifier' => 'mystery'],
        ]));

        self::assertSame(['mystery'], $schema->unsupportedElements);
        self::assertTrue($schema->isEmpty());
    }

    #[Test]
    public function aChoiceElementWithoutOptionsIsReportedRatherThanDescribedAsAFreeString(): void
    {
        $schema = (new FormSchemaFactory())->create($this->form([
            ['type' => 'SingleSelect', 'identifier' => 'empty'],
        ]));

        self::assertSame(['empty'], $schema->unsupportedElements);
    }

    #[Test]
    public function theShippedFormIsDescribedCompletely(): void
    {
        $schema = (new FormSchemaFactory())->create($this->shippedForm());

        self::assertSame([], $schema->unsupportedElements);
        self::assertSame(
            [
                'place',
                'forecastDays',
                'pastDays',
                'hourlyVariables',
                'dailyVariables',
                'currentVariables',
                'weatherModel',
                'temperatureUnit',
                'windSpeedUnit',
                'precipitationUnit',
                'timezone',
                'cellSelection',
            ],
            $schema->propertyNames(),
        );
        self::assertSame(['place'], $schema->schema['required'] ?? null);
    }

    /**
     * The reason the full parameter surface is affordable at all: the hourly
     * variables are one property carrying an enum, not one property each.
     */
    #[Test]
    public function theFortyHourlyVariablesAreOneArrayProperty(): void
    {
        $schema = (new FormSchemaFactory())->create($this->shippedForm());
        $hourly = $schema->schema['properties']['hourlyVariables'] ?? [];

        self::assertIsArray($hourly);
        self::assertSame('array', $hourly['type'] ?? null);
        self::assertIsArray($hourly['items'] ?? null);
        self::assertIsArray($hourly['items']['enum'] ?? null);
        self::assertGreaterThanOrEqual(40, count($hourly['items']['enum']));
    }

    /**
     * The description is the only thing telling the model what an element means,
     * so an element without one is a parameter it can only guess at.
     */
    #[Test]
    public function everyShippedPropertyCarriesADescription(): void
    {
        $schema     = (new FormSchemaFactory())->create($this->shippedForm());
        $properties = $schema->schema['properties'] ?? [];

        self::assertIsArray($properties);
        foreach ($properties as $name => $property) {
            self::assertIsArray($property);
            self::assertArrayHasKey('description', $property, (string) $name . ' has no description');
        }
    }

    /**
     * @param list<array<string, mixed>> $elements
     *
     * @return array<string, mixed>
     */
    /**
     * The model reads the YAML, the human reads the XLF — they must say the same
     * thing.
     *
     * FormSchemaFactory takes elementDescription straight from the YAML into the
     * JSON Schema, while the rendered form resolves the same key through the
     * translation files by trans-unit id. Editing only the YAML therefore
     * instructs the model and leaves the field hint the tester reads unchanged.
     * That happened once already, on the very property whose wording the fix was
     * about: the schema asked for at least three forecast days while the hint
     * under the field still offered 0 as an ordinary value.
     */
    #[Test]
    public function everyShippedDescriptionMatchesItsTranslationSource(): void
    {
        $elements = $this->shippedForm()['renderables'][0]['renderables'] ?? [];
        self::assertNotSame([], $elements);

        // Both files: a translation whose source still quotes the old English
        // is a translation nobody updated, and its target is what the German
        // tester reads.
        foreach (['Forms.xlf', 'de.Forms.xlf'] as $file) {
            $xlf = simplexml_load_file(__DIR__ . '/../../../../Resources/Private/Language/' . $file);
            self::assertNotFalse($xlf, $file);

            $sources = [];
            foreach ($xlf->file->body->{'trans-unit'} as $unit) {
                $sources[(string) $unit['id']] = (string) $unit->source;
            }

            foreach ($elements as $element) {
                $description = $element['properties']['elementDescription'] ?? null;
                if (!is_string($description) || $description === '') {
                    continue;
                }

                $id = sprintf('weatherQuery.element.%s.properties.elementDescription', $element['identifier']);
                self::assertArrayHasKey($id, $sources, sprintf('%s has no trans-unit in %s', $element['identifier'], $file));
                self::assertSame(
                    $description,
                    $sources[$id],
                    sprintf('The YAML description and the %s source for %s have drifted apart.', $file, $element['identifier']),
                );
            }
        }
    }

    private function form(array $elements): array
    {
        return [
            'type'        => 'Form',
            'identifier'  => 'test',
            'renderables' => [
                ['type' => 'Page', 'identifier' => 'page', 'renderables' => $elements],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function shippedForm(): array
    {
        $path     = dirname(__DIR__, 4) . '/' . self::SHIPPED_FORM;
        $contents = file_get_contents($path);
        self::assertIsString($contents, self::SHIPPED_FORM . ' is unreadable');

        $parsed = Yaml::parse($contents);
        self::assertTrue(is_array($parsed), self::SHIPPED_FORM . ' is not a mapping');

        return $parsed;
    }
}
