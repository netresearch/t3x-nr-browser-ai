<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

$autoloadFile = getenv('NR_BROWSER_AI_AUTOLOAD') ?: __DIR__ . '/../.Build/vendor/autoload.php';
if (!is_file($autoloadFile)) {
    throw new RuntimeException(sprintf('Composer autoloader not found at %s', $autoloadFile));
}

require_once $autoloadFile;

return dirname($autoloadFile);
