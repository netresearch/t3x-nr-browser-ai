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

namespace Netresearch\NrBrowserAi\Configuration;

use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\TypoScript\FrontendTypoScript;

use function is_array;
use function is_float;
use function is_int;
use function is_string;
use function trim;

/**
 * Reads the settings that belong to the administrator from TypoScript only.
 *
 * Extbase merges a plugin's FlexForm values over its TypoScript settings, so
 * `$this->settings` answers with whatever an editor stored in the plugin
 * record, including a key the FlexForm does not declare when the record was
 * written around the backend (import, API, direct database access). The
 * system prompt, the context usage limit and the data source host list are
 * administrator decisions; they are therefore read from the frontend
 * TypoScript setup, which an editor cannot write, and never from the merged
 * settings.
 */
final class AdministratorSettings
{
    /**
     * @param string $plugin TypoScript plugin key, for example tx_nrbrowserai_formassistant
     *
     * @return string|null the value, or null when TypoScript offers none (the
     *                     page came from the cache without a setup, or no such
     *                     setting exists)
     */
    public static function string(?ServerRequestInterface $request, string $plugin, string $key): ?string
    {
        $typoScript = $request?->getAttribute('frontend.typoscript');
        if (!$typoScript instanceof FrontendTypoScript || !$typoScript->hasSetup()) {
            return null;
        }

        $setup   = $typoScript->getSetupArray();
        $plugins = $setup['plugin.'] ?? null;
        $current = is_array($plugins) ? ($plugins[$plugin . '.'] ?? null) : null;
        $values  = is_array($current) ? ($current['settings.'] ?? null) : null;
        $value   = is_array($values) ? ($values[$key] ?? null) : null;

        if (is_string($value)) {
            return trim($value);
        }

        return is_int($value) || is_float($value) ? (string) $value : null;
    }
}
