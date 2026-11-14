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

namespace Netresearch\NrBrowserAi\Tests\Unit\Domain\Form;

use Netresearch\NrBrowserAi\Domain\Form\DataSourceEndpoint;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class DataSourceEndpointTest extends TestCase
{
    private const HOSTS = 'api.example.com, Air.Example.com';

    #[Test]
    public function aListedHttpsHostPassesAndIsNormalised(): void
    {
        self::assertSame(
            'https://air.example.com/v1/air-quality',
            DataSourceEndpoint::validate(' https://AIR.example.com/v1/air-quality ', self::HOSTS),
        );
        self::assertSame('https://api.example.com/', DataSourceEndpoint::validate('https://api.example.com', self::HOSTS));
    }

    #[Test]
    #[DataProvider('refusedProvider')]
    public function everythingElseIsRefused(mixed $candidate, string $hosts): void
    {
        self::assertSame('', DataSourceEndpoint::validate($candidate, $hosts));
    }

    /**
     * @return iterable<string, array{mixed, string}>
     */
    public static function refusedProvider(): iterable
    {
        yield 'empty host list disables the data source' => ['https://api.example.com/x', ''];
        yield 'host not listed' => ['https://evil.example.org/x', self::HOSTS];
        yield 'subdomain of a listed host' => ['https://x.api.example.com/x', self::HOSTS];
        yield 'listed host as a suffix of another' => ['https://notapi.example.com/x', self::HOSTS];
        yield 'http' => ['http://api.example.com/x', self::HOSTS];
        yield 'protocol relative' => ['//api.example.com/x', self::HOSTS];
        yield 'credentials' => ['https://user:pw@api.example.com/x', self::HOSTS];
        yield 'user only' => ['https://user@api.example.com/x', self::HOSTS];
        yield 'userinfo trick' => ['https://api.example.com@evil.example.org/x', self::HOSTS];
        yield 'port' => ['https://api.example.com:8443/x', self::HOSTS];
        yield 'query string' => ['https://api.example.com/x?a=1', self::HOSTS];
        yield 'empty query string' => ['https://api.example.com/x?', self::HOSTS];
        yield 'fragment' => ['https://api.example.com/x#a', self::HOSTS];
        yield 'parent segment' => ['https://api.example.com/a/../x', self::HOSTS];
        yield 'percent encoding' => ['https://api.example.com/a%2e%2e/x', self::HOSTS];
        yield 'space in path' => ['https://api.example.com/a b', self::HOSTS];
        yield 'backslash' => ['https://api.example.com\\@evil.example.org/', self::HOSTS];
        yield 'ip literal' => ['https://127.0.0.1/x', '127.0.0.1'];
        yield 'single label host' => ['https://localhost/x', 'localhost'];
        yield 'over long' => ['https://api.example.com/a/' . str_repeat('b', 600), self::HOSTS];
        yield 'not a string' => [['https://api.example.com/'], self::HOSTS];
        yield 'null' => [null, self::HOSTS];
        yield 'javascript scheme' => ['javascript://api.example.com/%0aalert(1)', self::HOSTS];
    }

    #[Test]
    public function theHostListIgnoresMalformedEntries(): void
    {
        self::assertSame(
            ['api.example.com', 'air.example.com'],
            DataSourceEndpoint::hosts('api.example.com, *.example.org, Air.Example.com,, localhost, https://x.example.com'),
        );
    }
}
