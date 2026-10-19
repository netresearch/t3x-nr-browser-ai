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

use Rector\Config\RectorConfig;
use Rector\Php55\Rector\String_\StringClassNameToClassConstantRector;

$vendorDirectory = getenv('NR_BROWSER_AI_VENDOR') ?: __DIR__ . '/../.Build/vendor';
$configure       = require $vendorDirectory . '/netresearch/typo3-ci-workflows/config/rector/rector.php';

return static function (RectorConfig $rectorConfig) use ($configure): void {
    $configure($rectorConfig, __DIR__ . '/..', [
        'tests' => true,
        'php'   => '8.2',
        'typo3' => 12,
    ]);

    $rectorConfig->skip([
        // The test names StandaloneView as a string and checks class_exists()
        // at runtime, because TYPO3 14 removed the class; it falls back to it
        // only where ViewFactoryData is missing. Rector rewrites the string
        // to a ::class constant only when the class is installed, so without
        // this skip the TYPO3 13.4 cells report a change the 14.3 cells do
        // not, and the code would name a class TYPO3 14 does not have.
        StringClassNameToClassConstantRector::class => [
            __DIR__ . '/../Tests/Functional/Controller/AssistantControllerTest.php',
        ],
    ]);
};
