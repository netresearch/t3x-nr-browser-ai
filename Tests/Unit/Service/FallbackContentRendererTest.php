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
use RuntimeException;
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
    public function distinctContentElementIsRenderedThroughTypo3RecordSelection(): void
    {
        $contentObjectRenderer = $this->createMock(ContentObjectRenderer::class);
        $contentObjectRenderer
            ->expects(self::once())
            ->method('cObjGetSingle')
            ->with(
                'RECORDS',
                self::callback(static function (array $configuration): bool {
                    return ($configuration['tables'] ?? null) === 'tt_content'
                        && ($configuration['source'] ?? null) === '12'
                        && !isset($configuration['dontCheckPid'])
                        && count($configuration) === 2;
                }),
            )
            ->willReturn('<p>TYPO3-rendered fallback</p>');

        $subject = new FallbackContentRenderer();

        self::assertSame(
            '<p>TYPO3-rendered fallback</p>',
            $subject->render('contentElement', 12, 99, $contentObjectRenderer),
        );
    }

    #[Test]
    public function indirectCycleStopsBeforeRenderingAnAlreadyActiveContentElement(): void
    {
        $subject               = new FallbackContentRenderer();
        $renderCalls           = 0;
        $contentObjectRenderer = $this->createMock(ContentObjectRenderer::class);
        $contentObjectRenderer
            ->expects(self::once())
            ->method('cObjGetSingle')
            ->willReturnCallback(function () use ($subject, &$renderCalls, $contentObjectRenderer): string {
                ++$renderCalls;
                if ($renderCalls === 1) {
                    return $subject->render('contentElement', 99, 12, $contentObjectRenderer);
                }

                return 'cycle leaked';
            });

        self::assertSame('', $subject->render('contentElement', 12, 99, $contentObjectRenderer));
        self::assertSame(1, $renderCalls);
    }

    #[Test]
    public function renderStackIsClearedAfterRenderingThrows(): void
    {
        $subject         = new FallbackContentRenderer();
        $failingRenderer = $this->createMock(ContentObjectRenderer::class);
        $failingRenderer
            ->expects(self::once())
            ->method('cObjGetSingle')
            ->willThrowException(new RuntimeException('render failed'));

        try {
            $subject->render('contentElement', 12, 99, $failingRenderer);
            self::fail('Expected rendering to throw.');
        } catch (RuntimeException $exception) {
            self::assertSame('render failed', $exception->getMessage());
        }

        $recoveryRenderer = $this->createMock(ContentObjectRenderer::class);
        $recoveryRenderer
            ->expects(self::once())
            ->method('cObjGetSingle')
            ->willReturn('recovered');

        self::assertSame(
            'recovered',
            $subject->render('contentElement', 12, 99, $recoveryRenderer),
        );
    }
}
