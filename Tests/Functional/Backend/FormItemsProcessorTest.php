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

namespace Netresearch\NrBrowserAi\Tests\Functional\Backend;

use Netresearch\NrBrowserAi\Backend\FormItemsProcessor;
use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\Yaml\Yaml;
use TYPO3\CMS\Backend\Form\FormDataCompiler;
use TYPO3\CMS\Backend\Form\FormDataGroup\TcaDatabaseRecord;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

use function array_column;

/**
 * The form selector of the plugin record, as the backend fills it. Where an
 * editor-created form lives depends on the major: TYPO3 14 keeps it in the
 * database, 12.4 and 13.4 in file mounts or extension paths; the test puts the
 * same form where the running major looks.
 */
final class FormItemsProcessorTest extends FunctionalTestCase
{
    protected array $coreExtensionsToLoad = [
        'backend',
        'extbase',
        'fluid',
        'form',
        'frontend',
    ];

    protected array $testExtensionsToLoad = [
        'netresearch/nr-browser-ai',
    ];

    protected array $pathsToLinkInTestInstance = [
        'typo3conf/ext/nr_browser_ai/Tests/Functional/Fixtures/BackendSites' => 'typo3conf/sites',
    ];

    #[Test]
    public function theSelectorOffersTheStoredFormBesideTheBundledOne(): void
    {
        $expectedValue = $this->storeForm();
        // The storages list only what the signed-in user may read.
        $this->importCSVDataSet(__DIR__ . '/../Fixtures/Backend/be_users.csv');
        $this->setUpBackendUser(1);

        $processor = $this->get(FormItemsProcessor::class);
        self::assertInstanceOf(FormItemsProcessor::class, $processor);

        $parameters = ['items' => [['label' => 'Bundled', 'value' => '']]];
        $processor->populate($parameters);

        $items = $parameters['items'];
        self::assertSame('', $items[0]['value'], 'The bundled-form entry must stay first.');
        self::assertContains($expectedValue, array_column($items, 'value'));
        self::assertStringContainsString('Trip planner', (string) array_column($items, 'label', 'value')[$expectedValue]);
    }

    /**
     * The select is declared in the FlexForm, and only FormEngine resolves its
     * itemsProcFunc, so this compiles the plugin record the way the backend
     * does and reads the finished data structure.
     */
    #[Test]
    public function theFlexFormSelectIsFilledByTheProcessorWhenTheRecordIsEdited(): void
    {
        $expectedValue = $this->storeForm();
        $this->importCSVDataSet(__DIR__ . '/../Fixtures/Frontend/StorageFormContent.csv');
        $this->importCSVDataSet(__DIR__ . '/../Fixtures/Backend/be_users.csv');
        $backendUser     = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);

        $input = [
            'tableName'  => 'tt_content',
            'vanillaUid' => 30,
            'command'    => 'edit',
        ];
        $major   = GeneralUtility::makeInstance(Typo3Version::class)->getMajorVersion();
        $request = (new ServerRequest())->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_BE);
        if ($major >= 13) {
            $input['request'] = $request;
            $result           = GeneralUtility::makeInstance(FormDataCompiler::class)
                ->compile($input, GeneralUtility::makeInstance(TcaDatabaseRecord::class));
        } else {
            // 12.4 providers read the request from the global.
            $GLOBALS['TYPO3_REQUEST'] = $request;
            $result                   = GeneralUtility::makeInstance(FormDataCompiler::class, GeneralUtility::makeInstance(TcaDatabaseRecord::class))
                ->compile($input);
        }

        $structure = $result['processedTca']['columns']['pi_flexform']['config']['ds'] ?? null;
        self::assertIsArray($structure);
        $items = $structure['sheets']['sDEF']['ROOT']['el']['settings.persistenceIdentifier']['config']['items'] ?? null;
        self::assertIsArray($items, 'The plugin FlexForm has no persistenceIdentifier select.');
        self::assertContains($expectedValue, array_column($items, 'value'));
    }

    private function storeForm(): string
    {
        $file = 'EXT:nr_browser_ai/Tests/Functional/Fixtures/Forms/tripPlanner.form.yaml';

        if (GeneralUtility::makeInstance(Typo3Version::class)->getMajorVersion() < 14) {
            // File based storages are allowed through the form module's settings.
            ExtensionManagementUtility::addTypoScriptSetup(
                'module.tx_form.settings.yamlConfigurations.1700 = '
                . 'EXT:nr_browser_ai/Tests/Functional/Fixtures/Forms/FormSetup.yaml',
            );

            return $file;
        }

        $definition = Yaml::parseFile(GeneralUtility::getFileAbsFileName($file));
        self::assertIsArray($definition);
        $identifier = $definition['identifier'];
        $label      = $definition['label'];
        unset($definition['identifier']);

        GeneralUtility::makeInstance(ConnectionPool::class)
            ->getConnectionForTable('form_definition')
            ->insert('form_definition', [
                'uid'           => 7,
                'pid'           => 0,
                'label'         => $label,
                'identifier'    => $identifier,
                'configuration' => $definition,
            ]);

        return '7';
    }
}
