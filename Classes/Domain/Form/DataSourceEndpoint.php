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

namespace Netresearch\NrBrowserAi\Domain\Form;

use function array_map;
use function explode;
use function in_array;
use function is_string;
use function parse_url;
use function preg_match;
use function str_contains;
use function strlen;
use function strtolower;
use function trim;

/**
 * Decides whether a data source URL may reach the browser.
 *
 * The visitor's browser sends the form's parameters to this URL, so the choice
 * of destination is a privacy decision. An editor names the URL; the
 * administrator names the hosts it may point to. The list is empty by default,
 * which keeps the data source off until somebody has accepted the recipient.
 *
 * Only plain HTTPS to a listed host name passes: no credentials, no query
 * string or fragment (the browser appends the parameters), no explicit port, no
 * IP literal, no characters a path does not need.
 */
final class DataSourceEndpoint
{
    private const MAXIMUM_LENGTH = 500;

    private const HOST_PATTERN = '/^(?![0-9.]+$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/D';

    private const PATH_PATTERN = '/^\/[A-Za-z0-9._~\-\/]*$/D';

    /**
     * @return string the normalised URL, or an empty string when it is not allowed
     */
    public static function validate(mixed $candidate, string $allowedHosts): string
    {
        if (!is_string($candidate)) {
            return '';
        }

        $url = trim($candidate);
        if ($url === '' || strlen($url) > self::MAXIMUM_LENGTH) {
            return '';
        }

        $parts = parse_url($url);
        if ($parts === false) {
            return '';
        }

        $host   = strtolower($parts['host'] ?? '');
        $path   = $parts['path'] ?? '/';
        $scheme = $parts['scheme'] ?? '';
        if ($scheme !== 'https' || preg_match(self::HOST_PATTERN, $host) !== 1) {
            return '';
        }

        foreach (['user', 'pass', 'port', 'query', 'fragment'] as $forbidden) {
            if (isset($parts[$forbidden])) {
                return '';
            }
        }

        if (str_contains($url, '?') || str_contains($url, '#') || preg_match(self::PATH_PATTERN, $path) !== 1) {
            return '';
        }

        if (str_contains($path, '..') || !in_array($host, self::hosts($allowedHosts), true)) {
            return '';
        }

        return 'https://' . $host . $path;
    }

    /**
     * @return list<string>
     */
    public static function hosts(string $list): array
    {
        $hosts = [];
        foreach (array_map(trim(...), explode(',', strtolower($list))) as $host) {
            if (preg_match(self::HOST_PATTERN, $host) === 1) {
                $hosts[] = $host;
            }
        }

        return $hosts;
    }
}
