<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Service;

use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;

final class FallbackContentRenderer
{
    public function render(
        string $mode,
        int $selectedContentUid,
        int $currentContentUid,
        ?ContentObjectRenderer $contentObjectRenderer = null,
    ): string {
        if (
            $mode !== 'contentElement'
            || $selectedContentUid <= 0
            || $currentContentUid <= 0
            || $selectedContentUid === $currentContentUid
            || $contentObjectRenderer === null
        ) {
            return '';
        }

        return $contentObjectRenderer->cObjGetSingle(
            'CONTENT',
            [
                'table' => 'tt_content',
                'select.' => [
                    'uidInList' => (string) $selectedContentUid,
                ],
            ],
        );
    }
}
