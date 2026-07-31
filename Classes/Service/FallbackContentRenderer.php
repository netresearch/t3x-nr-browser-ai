<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Service;

use function array_pop;
use function in_array;

use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;

final class FallbackContentRenderer
{
    /** @var list<int> */
    private array $renderStack = [];

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
            || !$contentObjectRenderer instanceof ContentObjectRenderer
        ) {
            return '';
        }

        if (in_array($selectedContentUid, $this->renderStack, true)) {
            return '';
        }

        $addedCurrentContent = !in_array($currentContentUid, $this->renderStack, true);
        if ($addedCurrentContent) {
            $this->renderStack[] = $currentContentUid;
        }

        $this->renderStack[] = $selectedContentUid;

        try {
            return $contentObjectRenderer->cObjGetSingle(
                'RECORDS',
                [
                    'tables' => 'tt_content',
                    'source' => (string) $selectedContentUid,
                ],
            );
        } finally {
            array_pop($this->renderStack);
            if ($addedCurrentContent) {
                array_pop($this->renderStack);
            }
        }
    }
}
