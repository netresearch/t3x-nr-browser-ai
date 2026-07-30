<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\Utility\ExtensionUtility;

defined('TYPO3') or exit;

$pluginSignature = ExtensionUtility::registerPlugin(
    'NrBrowserAi',
    'Assistant',
    'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:plugin.assistant.title',
    'content-plugin',
    'plugins',
    'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:plugin.assistant.description',
);

$GLOBALS['TCA']['tt_content']['types'][$pluginSignature]['showitem'] = '
    --palette--;;general,
    pi_flexform,
    --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:access,
        --palette--;;visibility,
        --palette--;;access
';
$flexFormDataStructure = 'FILE:EXT:nr_browser_ai/Configuration/FlexForms/Assistant.xml';

if (GeneralUtility::makeInstance(Typo3Version::class)->getMajorVersion() >= 14) {
    $GLOBALS['TCA']['tt_content']['types'][$pluginSignature]['columnsOverrides']['pi_flexform']['config']['ds']
        = $flexFormDataStructure;
} else {
    ExtensionManagementUtility::addPiFlexFormValue('*', $flexFormDataStructure, $pluginSignature);
}
