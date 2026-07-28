<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

use TYPO3\CMS\Extbase\Utility\ExtensionUtility;

defined('TYPO3') or exit;

$pluginSignature = ExtensionUtility::registerPlugin(
    'NrBrowserAi',
    'Assistant',
    'Browser AI assistant',
    'content-plugin',
    'plugins',
    'On-device assistant using the current page as its source',
);

$GLOBALS['TCA']['tt_content']['types'][$pluginSignature]['showitem'] = '
    --palette--;;general,
    pi_flexform,
    --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:access,
        --palette--;;visibility,
        --palette--;;access
';
$GLOBALS['TCA']['tt_content']['types'][$pluginSignature]['columnsOverrides']['pi_flexform']['config']['ds']
    = 'FILE:EXT:nr_browser_ai/Configuration/FlexForms/Assistant.xml';
