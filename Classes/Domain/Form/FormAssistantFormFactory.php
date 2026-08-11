<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Domain\Form;

use function is_string;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Form\Domain\Factory\FormFactoryInterface;
use TYPO3\CMS\Form\Domain\Model\FormDefinition;

/**
 * Renders a form this extension ships, from the same array the schema is
 * generated from.
 *
 * EXT:form's rendering view helper takes either a persistence identifier or a
 * factory class. The factory route is taken here because a persistence
 * identifier pointing into an extension has to be allow-listed first, through a
 * mechanism that TYPO3 14.2 deprecated and replaced — so the persistence route
 * would need one registration for 12.4 and 13.4 and a different one for 14.3.
 * The factory needs none, and it guarantees what matters more: the controls in
 * the page and the schema handed to the model come from one file.
 */
final readonly class FormAssistantFormFactory implements FormFactoryInterface
{
    public function __construct(
        private FormDefinitionLoader $formDefinitionLoader,
        private FormFactoryInterface $arrayFormFactory,
    ) {}

    /**
     * @param array<mixed> $configuration expects the shipped form's identifier under formIdentifier
     */
    public function build(
        array $configuration,
        ?string $prototypeName = null,
        ?ServerRequestInterface $request = null,
    ): FormDefinition {
        $formIdentifier = is_string($configuration['formIdentifier'] ?? null)
            ? $configuration['formIdentifier']
            : '';
        $definition = $this->formDefinitionLoader->load($formIdentifier);

        return $this->arrayFormFactory->build($definition, $prototypeName, $request);
    }
}
