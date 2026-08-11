<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Functional\Controller;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Netresearch\NrBrowserAi\Controller\FormAssistantController;
use PHPUnit\Framework\Attributes\Test;

use function sprintf;
use function str_contains;

use TYPO3\TestingFramework\Core\Functional\Framework\Frontend\InternalRequest;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * What this pins down is the one thing unit tests cannot: that the controls
 * EXT:form actually renders can be found again from the schema the model is
 * given. The two are derived from one file, but they travel through different
 * code, and a mismatch between them would leave the tool writing into nothing.
 */
final class FormAssistantControllerTest extends FunctionalTestCase
{
    private const URL = 'https://website.local/form-assistant';

    protected array $coreExtensionsToLoad = [
        'extbase',
        'fluid',
        'form',
        'frontend',
    ];

    protected array $testExtensionsToLoad = [
        'netresearch/nr-browser-ai',
    ];

    protected array $pathsToLinkInTestInstance = [
        'typo3conf/ext/nr_browser_ai/Tests/Functional/Fixtures/Sites' => 'typo3conf/sites',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->importCSVDataSet(__DIR__ . '/../Fixtures/Frontend/FormContent.csv');
        $this->setUpFrontendRootPage(
            1,
            [
                'constants' => [
                    'EXT:nr_browser_ai/Configuration/TypoScript/constants.typoscript',
                ],
                'setup' => [
                    'EXT:form/Configuration/TypoScript/setup.typoscript',
                    'EXT:nr_browser_ai/Configuration/TypoScript/setup.typoscript',
                    'EXT:nr_browser_ai/Tests/Functional/Fixtures/Frontend/setup.typoscript',
                ],
            ],
        );
    }

    #[Test]
    public function pluginIsConfiguredAsContentElement(): void
    {
        $plugins = $GLOBALS['TYPO3_CONF_VARS']['EXTCONF']['extbase']['extensions']['NrBrowserAi']['plugins'] ?? null;
        self::assertIsArray($plugins);
        $configuration = $plugins['FormAssistant'] ?? null;
        self::assertIsArray($configuration);
        self::assertArrayHasKey(FormAssistantController::class, $configuration['controllers'] ?? []);

        $contentElementTypes = $GLOBALS['TCA']['tt_content']['types'] ?? null;
        self::assertIsArray($contentElementTypes);
        self::assertArrayHasKey('nrbrowserai_formassistant', $contentElementTypes);
    }

    #[Test]
    public function theFormIsRendered(): void
    {
        $document = $this->render();
        $xpath    = new DOMXPath($document);

        self::assertGreaterThan(
            0,
            $xpath->query('//form')?->length ?? 0,
            'The plugin rendered no form at all.',
        );
    }

    /**
     * The schema is transported as an attribute rather than a script element so
     * that Fluid's escaping applies to it like to every other setting.
     */
    #[Test]
    public function theSchemaIsDeliveredWithTheForm(): void
    {
        $root = $this->pluginRoot();

        $schema = $root->getAttribute('data-form-schema');
        self::assertStringContainsString('"hourlyVariables"', $schema);
        self::assertStringContainsString('"additionalProperties":false', $schema);
        self::assertSame('nr_browser_ai_weatherQuery', $root->getAttribute('data-tool-name'));
        self::assertSame('openMeteo', $root->getAttribute('data-action'));
        self::assertStringContainsString('weather forecast', $root->getAttribute('data-tool-description'));
    }

    /**
     * Every schema property has to be findable among the rendered controls by
     * its identifier, because that is the rule the client filler resolves them
     * by. Deriving the rendered name on the server instead would mean repeating
     * EXT:form's own naming, which differs by version and by plugin namespace.
     */
    #[Test]
    public function everySchemaPropertyHasAControlNamedAfterIt(): void
    {
        $document = $this->render();
        $xpath    = new DOMXPath($document);

        $names = [];
        foreach ($xpath->query('//input | //select | //textarea') ?: [] as $control) {
            if ($control instanceof DOMElement) {
                $names[] = $control->getAttribute('name');
            }
        }

        foreach ($this->schemaProperties() as $property) {
            $found = false;
            foreach ($names as $name) {
                if (str_contains($name, '[' . $property . ']')) {
                    $found = true;
                    break;
                }
            }
            self::assertTrue($found, sprintf('No rendered control carries the identifier "%s".', $property));
        }
    }

    #[Test]
    public function aMultiValueElementRendersOneControlPerOption(): void
    {
        $document = $this->render();
        $xpath    = new DOMXPath($document);

        $boxes = $xpath->query('//input[contains(@name, "[hourlyVariables]")]');
        self::assertGreaterThanOrEqual(40, $boxes?->length ?? 0);
    }

    /**
     * After a run the answer belongs next to the question rather than below
     * seventy controls, so the form ships inside a disclosure. It starts open —
     * a browser without a model never runs anything and must not be handed a
     * closed form — and the bundle collapses it once there is an answer.
     */
    #[Test]
    public function theFormShipsInsideADisclosureThatStartsOpen(): void
    {
        $xpath = new DOMXPath($this->render());

        $fields = $xpath->query('//details[@data-nr-browser-ai-form-fields]')?->item(0);
        self::assertInstanceOf(DOMElement::class, $fields);
        self::assertTrue($fields->hasAttribute('open'));
        self::assertGreaterThan(0, $xpath->query('.//summary', $fields)?->length ?? 0);
        self::assertGreaterThan(0, $xpath->query('.//form', $fields)?->length ?? 0);
    }

    #[Test]
    public function theProseRegionIsDeliveredEmpty(): void
    {
        $xpath = new DOMXPath($this->render());
        $prose = $xpath->query('//*[@data-nr-browser-ai-form-prose]')?->item(0);

        self::assertInstanceOf(DOMElement::class, $prose);
        self::assertSame('', trim($prose->textContent));
    }

    #[Test]
    public function theDisclosureNamesTheToolAndTheSchema(): void
    {
        $document = $this->render();
        $xpath    = new DOMXPath($document);

        self::assertGreaterThan(0, $xpath->query('//*[@data-nr-browser-ai-form-configuration]')?->length ?? 0);
        self::assertGreaterThan(0, $xpath->query('//*[@data-nr-browser-ai-form-schema-display]')?->length ?? 0);
    }

    /**
     * @return list<string>
     */
    private function schemaProperties(): array
    {
        $schema = json_decode($this->pluginRoot()->getAttribute('data-form-schema'), true);
        self::assertIsArray($schema);
        $properties = $schema['properties'] ?? null;
        self::assertIsArray($properties);

        $names = [];
        foreach (array_keys($properties) as $name) {
            self::assertIsString($name);
            $names[] = $name;
        }

        return $names;
    }

    private function pluginRoot(): DOMElement
    {
        $xpath = new DOMXPath($this->render());
        $root  = $xpath->query('//*[@data-nr-browser-ai-form-root]')?->item(0);
        self::assertInstanceOf(DOMElement::class, $root);

        return $root;
    }

    private function render(): DOMDocument
    {
        $response = $this->executeFrontendSubRequest(new InternalRequest(self::URL));
        $body     = (string) $response->getBody();
        self::assertSame(200, $response->getStatusCode(), $body);

        $document                      = new DOMDocument();
        $document->strictErrorChecking = false;
        $previous                      = libxml_use_internal_errors(true);
        $document->loadHTML($body);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return $document;
    }
}
