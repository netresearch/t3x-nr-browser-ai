<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

$vendorDirectory = getenv('NR_BROWSER_AI_VENDOR') ?: __DIR__ . '/../.Build/vendor';
$createConfig = require $vendorDirectory . '/netresearch/typo3-ci-workflows/config/php-cs-fixer/config.php';

return $createConfig(<<<'EOF'
    This file is part of the package netresearch/nr-browser-ai.

    For the full copyright and license information, please read the
    LICENSE file that was distributed with this source code.
    EOF, __DIR__ . '/..');
