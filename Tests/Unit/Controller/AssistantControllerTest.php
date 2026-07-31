<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Unit\Controller;

use Netresearch\NrBrowserAi\Controller\AssistantController;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class AssistantControllerTest extends TestCase
{
    #[Test]
    public function controllerCanBeConstructedWithoutArguments(): void
    {
        self::assertInstanceOf(AssistantController::class, new AssistantController());
    }
}
