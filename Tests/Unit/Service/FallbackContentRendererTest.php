<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Unit\Service;

use Netresearch\NrBrowserAi\Service\FallbackContentRenderer;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;

final class FallbackContentRendererTest extends TestCase
{
    #[Test]
    public function noneModeReturnsEmptyWithoutRendering(): void
    {
        $contentObjectRenderer = $this->createMock(ContentObjectRenderer::class);
        $contentObjectRenderer->expects(self::never())->method('cObjGetSingle');

        $subject = new FallbackContentRenderer();

        self::assertSame('', $subject->render('none', 12, 99));
        self::assertSame('', $subject->render('none', 12, 99, $contentObjectRenderer));
    }

    #[Test]
    public function selfReferenceReturnsEmptyWithoutRendering(): void
    {
        $contentObjectRenderer = $this->createMock(ContentObjectRenderer::class);
        $contentObjectRenderer->expects(self::never())->method('cObjGetSingle');

        $subject = new FallbackContentRenderer();

        self::assertSame('', $subject->render('contentElement', 99, 99));
        self::assertSame('', $subject->render('contentElement', 99, 99, $contentObjectRenderer));
    }

    #[Test]
    public function invalidIdentifiersAndModesReturnEmptyWithoutRendering(): void
    {
        $contentObjectRenderer = $this->createMock(ContentObjectRenderer::class);
        $contentObjectRenderer->expects(self::never())->method('cObjGetSingle');

        $subject = new FallbackContentRenderer();

        self::assertSame('', $subject->render('contentElement', 0, 99, $contentObjectRenderer));
        self::assertSame('', $subject->render('contentElement', 12, 0, $contentObjectRenderer));
        self::assertSame('', $subject->render('unknown', 12, 99, $contentObjectRenderer));
    }

    #[Test]
    public function distinctContentElementIsRenderedThroughTypo3ContentSelection(): void
    {
        $contentObjectRenderer = $this->createMock(ContentObjectRenderer::class);
        $contentObjectRenderer
            ->expects(self::once())
            ->method('cObjGetSingle')
            ->with(
                'CONTENT',
                self::callback(static function (array $configuration): bool {
                    return ($configuration['table'] ?? null) === 'tt_content'
                        && ($configuration['select.']['uidInList'] ?? null) === '12'
                        && count($configuration['select.'] ?? []) === 1;
                }),
            )
            ->willReturn('<p>TYPO3-rendered fallback</p>');

        $subject = new FallbackContentRenderer();

        self::assertSame(
            '<p>TYPO3-rendered fallback</p>',
            $subject->render('contentElement', 12, 99, $contentObjectRenderer),
        );
    }
}
