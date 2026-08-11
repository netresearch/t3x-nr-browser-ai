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

defined('TYPO3') || exit;

$isTypo3V14OrNewer = GeneralUtility::makeInstance(Typo3Version::class)->getMajorVersion() >= 14;

$registerPlugin = static function (
    string $pluginName,
    string $languageKey,
    string $flexFormFile,
) use ($isTypo3V14OrNewer): void {
    $languageFile    = 'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:';
    $pluginSignature = ExtensionUtility::registerPlugin(
        'NrBrowserAi',
        $pluginName,
        $languageFile . 'plugin.' . $languageKey . '.title',
        'content-plugin',
        'plugins',
        $languageFile . 'plugin.' . $languageKey . '.description',
    );

    $GLOBALS['TCA']['tt_content']['types'][$pluginSignature]['showitem'] = '
        --palette--;;general,
        pi_flexform,
        --div--;LLL:EXT:core/Resources/Private/Language/Form/locallang_tabs.xlf:access,
            --palette--;;visibility,
            --palette--;;access
    ';

    $flexFormDataStructure = 'FILE:EXT:nr_browser_ai/Configuration/FlexForms/' . $flexFormFile;
    if ($isTypo3V14OrNewer) {
        $GLOBALS['TCA']['tt_content']['types'][$pluginSignature]['columnsOverrides']['pi_flexform']['config']['ds']
            = $flexFormDataStructure;
    } else {
        ExtensionManagementUtility::addPiFlexFormValue('*', $flexFormDataStructure, $pluginSignature);
    }
};

$registerPlugin('Assistant', 'assistant', 'Assistant.xml');
$registerPlugin('FormAssistant', 'formAssistant', 'FormAssistant.xml');
