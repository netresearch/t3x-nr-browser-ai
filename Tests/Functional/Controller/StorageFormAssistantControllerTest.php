<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 * SPDX-FileCopyrightText: Netresearch DTT GmbH
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Functional\Controller;

use DOMDocument;
use DOMElement;
use DOMXPath;
use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\Yaml\Yaml;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\TestingFramework\Core\Functional\Framework\Frontend\InternalRequest;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

use function json_decode;
use function sprintf;
use function str_contains;

/**
 * The plugin renders a form an editor created in the TYPO3 form editor, not
 * only the one the extension ships. Where that form lives depends on the major:
 * TYPO3 14 keeps forms in the database table form_definition, TYPO3 12.4 and
 * 13.4 in file mounts or extension paths. The test puts the same definition
 * where the running major looks for it, so every supported major exercises the
 * same assertions through its own persistence manager.
 */
final class StorageFormAssistantControllerTest extends FunctionalTestCase
{
    private const PAGE = '/storage-form';

    private const FORM_QUERY = '//form';

    private const FORM_FILE = 'EXT:nr_browser_ai/Tests/Functional/Fixtures/Forms/tripPlanner.form.yaml';

    private const PLAIN_FORM_FILE = 'EXT:nr_browser_ai/Tests/Functional/Fixtures/Forms/plainForm.form.yaml';

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

        $this->importCSVDataSet(__DIR__ . '/../Fixtures/Frontend/StorageFormContent.csv');
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
                    'EXT:nr_browser_ai/Tests/Functional/Fixtures/Frontend/storageForm.typoscript',
                ],
            ],
        );
    }

    #[Test]
    public function aFormFromTheStorageIsRenderedWithTheSchemaDerivedFromIt(): void
    {
        $this->placePlugin(30, $this->storedFormReference());

        $root = $this->pluginRoot(self::PAGE);

        $schema = json_decode($root->getAttribute('data-form-schema'), true);
        self::assertIsArray($schema);
        $properties = $schema['properties'] ?? null;
        self::assertIsArray($properties);
        self::assertSame(['place', 'text-1', 'radio-1', 'checkbox-1'], array_keys($properties));
        self::assertSame(['text-1'], $schema['required'] ?? null);
        self::assertSame(
            'City or region the trip goes to.',
            $properties['text-1']['description'] ?? null,
        );
        self::assertSame(['train', 'plane'], $properties['radio-1']['enum'] ?? null);
    }

    #[Test]
    public function everyPropertyOfAStoredFormHasAControlNamedAfterIt(): void
    {
        $this->placePlugin(30, $this->storedFormReference());

        $xpath = new DOMXPath($this->render(self::PAGE));
        $names = [];
        foreach ($xpath->query('//input | //select | //textarea') ?: [] as $control) {
            if ($control instanceof DOMElement) {
                $names[] = $control->getAttribute('name');
            }
        }

        foreach (['text-1', 'radio-1', 'checkbox-1'] as $identifier) {
            $found = false;
            foreach ($names as $name) {
                $found = $found || str_contains($name, '[' . $identifier . ']');
            }

            self::assertTrue($found, sprintf('No rendered control carries the identifier "%s".', $identifier));
        }
    }

    /**
     * EXT:form renders one page of a multi-step form at a time, so the second
     * page's field is neither a parameter nor a control in the document.
     */
    #[Test]
    public function onlyTheFirstPageOfAMultiStepFormIsOfferedAsParameters(): void
    {
        $this->placePlugin(30, $this->storedFormReference());

        $document = $this->render(self::PAGE);
        $schema   = $this->pluginRoot(self::PAGE)->getAttribute('data-form-schema');

        self::assertStringNotContainsString('text-2', $schema);
        self::assertSame(
            0,
            (new DOMXPath($document))->query('//input[contains(@name, "[text-2]")]')?->length ?? 0,
        );
    }

    #[Test]
    public function theToolNameIsMadeSafeFromTheEditorGeneratedIdentifier(): void
    {
        $this->placePlugin(30, $this->storedFormReference());

        self::assertSame(
            'nr_browser_ai_trip_planner_1',
            $this->pluginRoot(self::PAGE)->getAttribute('data-tool-name'),
        );
    }

    #[Test]
    public function theDefinitionNamesTheDataSourceAndTheToolDescription(): void
    {
        $this->placePlugin(30, $this->storedFormReference());

        $root = $this->pluginRoot(self::PAGE);

        self::assertSame('openMeteo', $root->getAttribute('data-action'));
        self::assertSame('Plans a trip from the definition.', $root->getAttribute('data-tool-description'));
    }

    #[Test]
    public function thePluginSettingsOverrideTheDefinition(): void
    {
        $this->placePlugin(30, $this->storedFormReference(), [
            'settings.toolDescription' => 'Plugin wording.',
            'settings.dataSource'      => 'openMeteo',
        ]);

        $root = $this->pluginRoot(self::PAGE);

        self::assertSame('Plugin wording.', $root->getAttribute('data-tool-description'));
    }

    /**
     * The built-in data source reads the element named "place". A form without
     * one would fail on every call, so it must not be offered as a tool.
     */
    #[Test]
    public function theOpenMeteoDataSourceIsOnlyOfferedForAFormWithAPlaceElement(): void
    {
        $this->placePlugin(30, $this->storedFormReference(withAction: false), [
            'settings.dataSource' => 'openMeteo',
        ]);

        self::assertSame('', $this->pluginRoot(self::PAGE)->getAttribute('data-action'));
    }

    #[Test]
    public function aFormWithoutAnyDataSourceOffersNoActionButStillRenders(): void
    {
        $this->placePlugin(30, $this->storedFormReference(withAction: false));

        $document = $this->render(self::PAGE);
        $root     = $this->pluginRoot(self::PAGE);

        self::assertSame('', $root->getAttribute('data-action'));
        self::assertGreaterThan(0, (new DOMXPath($document))->query(self::FORM_QUERY)?->length ?? 0);
        self::assertStringContainsString(
            'Fills in the form "Plain form"',
            $root->getAttribute('data-tool-description'),
        );
    }

    #[Test]
    public function aMissingFormRendersNoFormAndNoSchema(): void
    {
        $this->placePlugin(30, '987654');

        $document = $this->render(self::PAGE);

        self::assertSame(0, (new DOMXPath($document))->query(self::FORM_QUERY)?->length ?? 0);
        self::assertSame('', $this->pluginRoot(self::PAGE)->getAttribute('data-form-schema'));
        self::assertSame('', $this->pluginRoot(self::PAGE)->getAttribute('data-tool-name'));
    }

    #[Test]
    public function aMalformedReferenceIsRefusedBeforeItReachesTheStorage(): void
    {
        foreach (['../../../etc/passwd', '1:/../secret.form.yaml', 'EXT:../x/y.form.yaml', '1:/a.txt'] as $reference) {
            $this->placePlugin(30, $reference);

            $document = $this->render(self::PAGE);

            self::assertSame(0, (new DOMXPath($document))->query(self::FORM_QUERY)?->length ?? 0, $reference);
        }
    }

    #[Test]
    public function theBundledFormStaysTheDefaultWhenNoStoredFormIsChosen(): void
    {
        $this->placePlugin(30, '');

        self::assertSame(
            'nr_browser_ai_weatherQuery',
            $this->pluginRoot(self::PAGE)->getAttribute('data-tool-name'),
        );
    }

    /**
     * Stores the test form where this major keeps forms and returns the
     * identifier a plugin record refers to it by.
     */
    private function storedFormReference(bool $withAction = true): string
    {
        $file = $withAction ? self::FORM_FILE : self::PLAIN_FORM_FILE;
        if (GeneralUtility::makeInstance(Typo3Version::class)->getMajorVersion() < 14) {
            return $file;
        }

        $definition = Yaml::parseFile(GeneralUtility::getFileAbsFileName($file));
        self::assertIsArray($definition);

        $connection = GeneralUtility::makeInstance(ConnectionPool::class)->getConnectionForTable('form_definition');
        $connection->delete('form_definition', ['uid' => 7]);

        $identifier = $definition['identifier'];
        $label      = $definition['label'];
        unset($definition['identifier']);
        $connection->insert('form_definition', [
            'uid'           => 7,
            'pid'           => 0,
            'label'         => $label,
            'identifier'    => $identifier,
            'configuration' => $definition,
        ]);

        return '7';
    }

    /**
     * @param array<string, string> $settings
     */
    private function placePlugin(int $uid, string $persistenceIdentifier, array $settings = []): void
    {
        $settings = ['settings.persistenceIdentifier' => $persistenceIdentifier] + $settings;
        $fields   = '';
        foreach ($settings as $name => $value) {
            $fields .= sprintf(
                '<field index="%s"><value index="vDEF">%s</value></field>',
                $name,
                htmlspecialchars($value, ENT_XML1 | ENT_QUOTES),
            );
        }

        $flexForm = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>'
            . '<T3FlexForms><data><sheet index="sDEF"><language index="lDEF">' . $fields
            . '</language></sheet></data></T3FlexForms>';

        $connection = GeneralUtility::makeInstance(ConnectionPool::class)->getConnectionForTable('tt_content');
        $connection->update('tt_content', ['pi_flexform' => $flexForm], ['uid' => $uid]);
    }

    private function pluginRoot(string $path): DOMElement
    {
        $root = (new DOMXPath($this->render($path)))->query('//*[@data-nr-browser-ai-form-root]')?->item(0);
        self::assertInstanceOf(DOMElement::class, $root);

        return $root;
    }

    private function render(string $path): DOMDocument
    {
        $response = $this->executeFrontendSubRequest(new InternalRequest('https://website.local' . $path));
        $body     = (string) $response->getBody();
        self::assertSame(200, $response->getStatusCode(), $body);

        $document                      = new DOMDocument();
        $document->strictErrorChecking = false;

        $previous = libxml_use_internal_errors(true);
        $document->loadHTML($body);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return $document;
    }
}
