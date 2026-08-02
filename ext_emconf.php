<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

$EM_CONF['nr_browser_ai'] = [
    'title' => 'Netresearch Browser AI',
    'description' => 'On-device AI assistant for TYPO3 that answers questions about the current page, powered by Chrome built-in AI - by Netresearch',
    'category' => 'plugin',
    'author' => 'Netresearch DTT GmbH',
    'author_email' => 'typo3@netresearch.de',
    'author_company' => 'Netresearch DTT GmbH',
    'state' => 'beta',
    'version' => '0.3.0',
    'constraints' => [
        'depends' => [
            'php' => '8.2.0-8.5.99',
            'typo3' => '12.4.0-14.3.99',
        ],
        'conflicts' => [],
        'suggests' => [],
    ],
];
