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

namespace Netresearch\NrBrowserAi\Backend;

use Netresearch\NrBrowserAi\Domain\Form\FormCatalog;

use function is_array;
use function sprintf;

/**
 * Fills the form selector of the form assistant plugin with the forms created
 * in the TYPO3 form editor.
 *
 * Referenced from the FlexForm as itemsProcFunc, which every supported major
 * still honours for a select field.
 */
final readonly class FormItemsProcessor
{
    public function __construct(private FormCatalog $formCatalog) {}

    /**
     * @param array<string, mixed> $parameters FormEngine's select item parameters
     */
    public function populate(array &$parameters): void
    {
        $items = is_array($parameters['items'] ?? null) ? $parameters['items'] : [];

        foreach ($this->formCatalog->forms() as $form) {
            $items[] = [
                'label' => sprintf('%s (%s)', $form['name'], $form['persistenceIdentifier']),
                'value' => $form['persistenceIdentifier'],
            ];
        }

        $parameters['items'] = $items;
    }
}
