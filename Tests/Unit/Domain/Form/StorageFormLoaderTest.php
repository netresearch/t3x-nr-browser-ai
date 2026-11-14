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

use Netresearch\NrBrowserAi\Domain\Form\StorageFormLoader;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class StorageFormLoaderTest extends TestCase
{
    #[Test]
    #[DataProvider('acceptedProvider')]
    public function aWellFormedPersistenceIdentifierIsAccepted(string $identifier): void
    {
        self::assertTrue(StorageFormLoader::isPersistenceIdentifier($identifier));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function acceptedProvider(): iterable
    {
        yield 'database uid' => ['12'];
        yield 'file mount' => ['1:/form_definitions/contact-1.form.yaml'];
        yield 'file mount subfolder' => ['2:/forms/de/contact.form.yaml'];
        yield 'file mount with a space' => ['1:/Contact Forms/contact.form.yaml'];
        yield 'file mount with non-ASCII letters' => ['1:/Formulare/Kontaktformular für Kunden.form.yaml'];
        yield 'extension path' => ['EXT:site_package/Resources/Private/Forms/contact.form.yaml'];
    }

    #[Test]
    #[DataProvider('refusedProvider')]
    public function anythingElseIsRefusedBeforeItReachesTheStorage(string $identifier): void
    {
        self::assertFalse(StorageFormLoader::isPersistenceIdentifier($identifier));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function refusedProvider(): iterable
    {
        yield 'empty' => [''];
        yield 'not a form file' => ['1:/form_definitions/contact.yaml'];
        yield 'other extension' => ['1:/form_definitions/contact.form.yml'];
        yield 'parent segment in file mount' => ['1:/form_definitions/../secret.form.yaml'];
        yield 'parent segment in extension path' => ['EXT:site_package/../other/x.form.yaml'];
        yield 'absolute path' => ['/etc/passwd'];
        yield 'relative path' => ['../../etc/passwd'];
        yield 'new record placeholder' => ['NEW123abc'];
        yield 'negative uid' => ['-1'];
        yield 'uid with suffix' => ['12abc'];
        yield 'trailing newline' => ["12\n"];
        yield 'backslash' => ['1:/forms\\..\\x.form.yaml'];
        yield 'control character' => ["1:/forms/a\tb.form.yaml"];
        yield 'url' => ['https://example.com/x.form.yaml'];
        yield 'null byte' => ["1:/forms/a.form.yaml\0.txt"];
    }
}
