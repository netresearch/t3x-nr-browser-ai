#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

php -r '
$composerFile = $argv[1];
if (!is_file($composerFile)) {
    throw new RuntimeException("composer.json is missing");
}

$composer = json_decode((string) file_get_contents($composerFile), true, 512, JSON_THROW_ON_ERROR);
$expectedCoreConstraint = "^12.4 || ^13.4 || ^14.3";

if (($composer["name"] ?? null) !== "netresearch/nr-browser-ai") {
    throw new RuntimeException("Unexpected Composer package name");
}
if (($composer["extra"]["typo3/cms"]["extension-key"] ?? null) !== "nr_browser_ai") {
    throw new RuntimeException("Unexpected TYPO3 extension key");
}
if (($composer["require"]["typo3/cms-core"] ?? null) !== $expectedCoreConstraint) {
    throw new RuntimeException("Unexpected TYPO3 core constraint");
}
if (!str_contains($composer["description"] ?? "", "Netresearch")) {
    throw new RuntimeException("Composer description must mention Netresearch");
}
' "${repository_root}/composer.json"

php -r '
$emConfFile = $argv[1];
if (!is_file($emConfFile)) {
    throw new RuntimeException("ext_emconf.php is missing");
}

$_EXTKEY = "nr_browser_ai";
$EM_CONF = [];
require $emConfFile;
$configuration = $EM_CONF[$_EXTKEY] ?? null;

if (!is_array($configuration)) {
    throw new RuntimeException("TYPO3 extension metadata is missing");
}
if (($configuration["author_company"] ?? null) !== "Netresearch DTT GmbH") {
    throw new RuntimeException("Unexpected author company");
}
if (($configuration["constraints"]["depends"]["typo3"] ?? null) !== "12.4.0-14.3.99") {
    throw new RuntimeException("Unexpected TYPO3 version range");
}
if (!str_contains($configuration["description"] ?? "", "Netresearch")) {
    throw new RuntimeException("Extension description must mention Netresearch");
}
' "${repository_root}/ext_emconf.php"

echo "Repository metadata is valid."
