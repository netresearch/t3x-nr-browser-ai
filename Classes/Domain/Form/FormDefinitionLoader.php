<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Domain\Form;

use function is_array;
use function is_string;
use function preg_match;
use function sprintf;

use TYPO3\CMS\Core\Configuration\Loader\YamlFileLoader;
use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * Reads a form definition this extension ships.
 *
 * The definition is read from the file rather than through EXT:form's
 * persistence manager. Extension paths have to be added to
 * persistenceManager.allowedExtensionPaths before that manager will load them,
 * and the two mechanisms for registering that setting differ across the
 * supported TYPO3 majors: TYPO3 14.2 deprecated the TypoScript route in favour
 * of a directory convention that 12.4 and 13.4 do not know. Reading the file
 * keeps one code path for all three, and the form is rendered from the same
 * array by FormAssistantFormFactory, so the schema and the rendered controls
 * cannot describe different forms.
 */
final readonly class FormDefinitionLoader
{
    private const FORM_DIRECTORY = 'EXT:nr_browser_ai/Resources/Private/Forms/';

    private const FILE_EXTENSION = '.form.yaml';

    /**
     * Identifiers name a shipped file, so they are restricted to what a file
     * name may contain here rather than trusted from the caller.
     */
    private const IDENTIFIER_PATTERN = '/^[a-zA-Z][a-zA-Z0-9]{0,63}$/D';

    public function __construct(private YamlFileLoader $yamlFileLoader) {}

    /**
     * @return array<string, mixed> the definition, or an empty array when the
     *                              identifier names no shipped form
     */
    public function load(string $formIdentifier): array
    {
        if (preg_match(self::IDENTIFIER_PATTERN, $formIdentifier) !== 1) {
            return [];
        }

        $absolutePath = GeneralUtility::getFileAbsFileName(
            sprintf('%s%s%s', self::FORM_DIRECTORY, $formIdentifier, self::FILE_EXTENSION),
        );
        if ($absolutePath === '' || !is_file($absolutePath)) {
            return [];
        }

        $definition = $this->yamlFileLoader->load($absolutePath);

        return $this->isFormDefinition($definition) ? $definition : [];
    }

    /**
     * @param array<mixed> $definition
     *
     * @phpstan-assert-if-true array<string, mixed> $definition
     */
    private function isFormDefinition(array $definition): bool
    {
        return is_string($definition['identifier'] ?? null)
            && ($definition['type'] ?? null) === 'Form'
            && is_array($definition['renderables'] ?? null);
    }
}
