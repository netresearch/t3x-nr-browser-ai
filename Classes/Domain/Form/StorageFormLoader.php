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

use Psr\Http\Message\ServerRequestInterface;
use Throwable;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\Configuration\ConfigurationManagerInterface as ExtbaseConfigurationManagerInterface;
use TYPO3\CMS\Form\Mvc\Configuration\ConfigurationManagerInterface as ExtFormConfigurationManagerInterface;
use TYPO3\CMS\Form\Mvc\Persistence\FormPersistenceManagerInterface;

use function is_array;
use function is_string;
use function preg_match;
use function str_contains;

/**
 * Loads a form definition that an editor created in the TYPO3 form editor.
 *
 * The call goes through EXT:form's persistence manager, the way the core form
 * plugin and its `formvh:render` view helper do it, so the form comes out of
 * whatever storage the installation uses (database, file mounts, extension
 * paths) with the same event listeners and TypoScript overrides applied. The
 * result is the very array the rendering factory is then given, which is what
 * keeps the controls on the page and the schema handed to the model describing
 * one form.
 *
 * The three supported majors disagree about the signature of `load()`: 12.4
 * takes the identifier, 13.4 adds the form settings and the TypoScript settings,
 * 14.3 takes the TypoScript settings and the request instead. The arguments are
 * assembled per major and passed through PersistenceManagerCall so that static
 * analysis against one installed major does not reject the other two.
 */
final readonly class StorageFormLoader
{
    /**
     * What a persistence identifier may look like: a database uid (14.x), a
     * file mount path ("1:/form_definitions/contact.form.yaml", where folder
     * names may contain spaces and non-ASCII letters, as FAL allows) or an
     * extension path. The shape is checked here before the value reaches the manager, so
     * that a record cannot name a parent directory or another kind of path.
     * It is not an access check: like the core form plugin, the frontend loads
     * any form the identifier names, whatever the editor who saved it may read
     * in the backend.
     */
    private const IDENTIFIER_PATTERN = '/^(?:\d{1,10}|\d{1,6}:\/[^\x00-\x1f\x7f\\\\?#]{1,200}\.form\.yaml|EXT:[a-z0-9_]{1,64}\/[A-Za-z0-9_\-.\/]{1,200}\.form\.yaml)$/Du';

    public function __construct(
        private FormPersistenceManagerInterface $persistenceManager,
        private Typo3Version $typo3Version,
    ) {}

    public static function isPersistenceIdentifier(string $value): bool
    {
        return preg_match(self::IDENTIFIER_PATTERN, $value) === 1 && !str_contains($value, '..');
    }

    /**
     * @return array<string, mixed> the definition, or an empty array when the
     *                              identifier is malformed, the form does not
     *                              exist or its definition is unusable
     */
    public function load(string $persistenceIdentifier, ServerRequestInterface $request): array
    {
        if (!self::isPersistenceIdentifier($persistenceIdentifier)) {
            return [];
        }

        try {
            $definition = PersistenceManagerCall::invoke(
                $this->persistenceManager,
                'load',
                $this->arguments($persistenceIdentifier, $request),
            );
        } catch (Throwable) {
            return [];
        }

        if (!is_array($definition) || !$this->isUsable($definition)) {
            return [];
        }

        $normalised = [];
        foreach ($definition as $key => $value) {
            if (is_string($key)) {
                $normalised[$key] = $value;
            }
        }

        // The view helper records where the form came from, and finishers and
        // the form runtime read it back.
        $normalised['persistenceIdentifier'] = $persistenceIdentifier;

        return $normalised;
    }

    /**
     * The manager answers a failed load with an array marked invalid rather than
     * an exception, and a stored definition can lack what rendering needs.
     *
     * @param array<mixed> $definition
     */
    private function isUsable(array $definition): bool
    {
        return ($definition['invalid'] ?? false) !== true
            && is_string($definition['identifier'] ?? null)
            && ($definition['type'] ?? null) === 'Form'
            && is_array($definition['renderables'] ?? null);
    }

    /**
     * @return list<mixed>
     */
    private function arguments(string $persistenceIdentifier, ServerRequestInterface $request): array
    {
        $major = $this->typo3Version->getMajorVersion();
        if ($major < 13) {
            return [$persistenceIdentifier];
        }

        $extbase = GeneralUtility::makeInstance(ExtbaseConfigurationManagerInterface::class);
        $extbase->setRequest($request);

        $typoScriptSettings = $extbase->getConfiguration(
            ExtbaseConfigurationManagerInterface::CONFIGURATION_TYPE_SETTINGS,
            'form',
        );

        if ($major >= 14) {
            return [$persistenceIdentifier, $typoScriptSettings, $request];
        }

        $formSettings = GeneralUtility::makeInstance(ExtFormConfigurationManagerInterface::class)
            ->getYamlConfiguration($typoScriptSettings, true);

        return [$persistenceIdentifier, $formSettings, $typoScriptSettings];
    }
}
