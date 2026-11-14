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

namespace Netresearch\NrBrowserAi\Domain\Form;

use Exception;
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Core\SystemEnvironmentBuilder;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\Configuration\ConfigurationManagerInterface as ExtbaseConfigurationManagerInterface;
use TYPO3\CMS\Form\Domain\DTO\SearchCriteria;
use TYPO3\CMS\Form\Mvc\Configuration\ConfigurationManagerInterface as ExtFormConfigurationManagerInterface;
use TYPO3\CMS\Form\Mvc\Persistence\FormPersistenceManagerInterface;

use function is_array;
use function is_bool;
use function is_object;
use function is_string;
use function trim;

/**
 * Lists the forms an editor may pick for the plugin.
 *
 * It asks the persistence manager, which is also what the core form plugin's
 * selector does, so the list shows exactly the forms the backend user can
 * reach through the configured storages. `listForms()` has a different
 * signature and a different return type in each supported major (12.4: no
 * arguments, 13.4: form settings, 14.3: form settings and a search criteria
 * object, answering objects), so the call is assembled per major and the answer
 * normalised here.
 */
final readonly class FormCatalog
{
    public function __construct(
        private FormPersistenceManagerInterface $persistenceManager,
        private Typo3Version $typo3Version,
    ) {}

    /**
     * @return list<array{persistenceIdentifier: string, name: string}>
     */
    public function forms(): array
    {
        try {
            $listed = PersistenceManagerCall::invoke($this->persistenceManager, 'listForms', $this->arguments());
        } catch (Exception) {
            return [];
        }

        if (!is_array($listed)) {
            return [];
        }

        $forms = [];
        foreach ($listed as $form) {
            $entry = $this->entry($form);
            if ($entry !== null) {
                $forms[] = $entry;
            }
        }

        return $forms;
    }

    /**
     * @return list<mixed>
     */
    private function arguments(): array
    {
        $major = $this->typo3Version->getMajorVersion();
        if ($major < 13) {
            return [];
        }

        // Same procedure as the core selector: the extbase configuration
        // manager needs a request even though this runs in the backend.
        $request = $GLOBALS['TYPO3_REQUEST'] ?? null;
        if (!$request instanceof ServerRequestInterface) {
            $request = (new ServerRequest())->withAttribute('applicationType', SystemEnvironmentBuilder::REQUESTTYPE_BE);
        }

        $extbase = GeneralUtility::makeInstance(ExtbaseConfigurationManagerInterface::class);
        $extbase->setRequest($request);

        $typoScriptSettings = $extbase->getConfiguration(
            ExtbaseConfigurationManagerInterface::CONFIGURATION_TYPE_SETTINGS,
            'form',
        );
        $formSettings = GeneralUtility::makeInstance(ExtFormConfigurationManagerInterface::class)
            ->getYamlConfiguration($typoScriptSettings, false);

        return $major >= 14 ? [$formSettings, new SearchCriteria()] : [$formSettings];
    }

    /**
     * @return array{persistenceIdentifier: string, name: string}|null null for
     *                                                                 entries
     *                                                                 that
     *                                                                 cannot be
     *                                                                 used
     */
    private function entry(mixed $form): ?array
    {
        if (is_object($form)) {
            $identifier = $form->persistenceIdentifier ?? null;
            $name       = $form->name ?? null;
            $invalid    = $form->invalid ?? false;
        } elseif (is_array($form)) {
            $identifier = $form['persistenceIdentifier'] ?? null;
            $name       = $form['name'] ?? null;
            $invalid    = $form['invalid'] ?? false;
        } else {
            return null;
        }

        if (!is_string($identifier) || !StorageFormLoader::isPersistenceIdentifier($identifier)) {
            return null;
        }

        if (is_bool($invalid) && $invalid) {
            return null;
        }

        return [
            'persistenceIdentifier' => $identifier,
            'name'                  => is_string($name) && trim($name) !== '' ? trim($name) : $identifier,
        ];
    }
}
