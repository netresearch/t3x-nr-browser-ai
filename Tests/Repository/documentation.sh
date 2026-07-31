#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readme="${root_dir}/README.md"

assert_contains() {
    local needle="$1"
    local file="${2:-${readme}}"

    if ! grep -Fq -- "${needle}" "${file}"; then
        printf 'Missing required documentation text %q in %s\n' "${needle}" "${file}" >&2
        exit 1
    fi
}

assert_not_contains() {
    local needle="$1"
    local file="${2:-${readme}}"

    if grep -Fq -- "${needle}" "${file}"; then
        printf 'Misleading documentation text %q found in %s\n' "${needle}" "${file}" >&2
        exit 1
    fi
}

first_line="$(sed -n '1p' "${readme}")"
last_line="$(awk 'NF {line=$0} END {print line}' "${readme}")"

[[ "${first_line}" == '<p align="center">' ]] || {
    printf 'README must start with the Netresearch branded header.\n' >&2
    exit 1
}
[[ "${last_line}" == *'Netresearch DTT GmbH'* ]] || {
    printf 'README must end with the Netresearch footer.\n' >&2
    exit 1
}

assert_contains 'composer require netresearch/nr-browser-ai'
assert_contains 'vendor/bin/typo3 extension:setup'
assert_contains 'TYPO3 12.4, 13.4 and 14.3'
assert_contains 'Chrome 148 or newer'
assert_contains '22 GB'
assert_contains 'fallback content element or no output'
assert_contains 'No question, page content or answer is sent to an application service'
assert_contains 'GPL-2.0-or-later'
assert_contains 'Creative Commons Attribution 4.0'
assert_contains '[Netresearch DTT GmbH](https://www.netresearch.de/)'
assert_contains 'codecov.io/gh/netresearch/t3x-nr-browser-ai'
assert_contains 'PHPStan-level%2010'
assert_contains 'PHP-8.2%2B'
assert_contains 'default 80% context-usage target'
assert_not_contains 'uses at most 80% of the browser model context'

assert_contains 'chrome://on-device-internals' "${root_dir}/Documentation/User/BrowserSetup.rst"
assert_contains 'Content-Security-Policy' "${root_dir}/Documentation/Security/Privacy.rst"
assert_contains 'CC BY 4.0' "${root_dir}/Documentation/Index.rst"
assert_contains '[n] A Netresearch extension' "${root_dir}/Documentation/Index.rst"
assert_contains '/Images/netresearch-underline.svg' "${root_dir}/Documentation/Index.rst"
assert_contains '<rect width="200" height="4" rx="2" fill="#2F99A4"/>' \
    "${root_dir}/Documentation/Images/netresearch-underline.svg"

printf 'Documentation assertions passed.\n'
