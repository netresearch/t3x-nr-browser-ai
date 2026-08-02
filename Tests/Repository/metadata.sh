#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# A lock file is never published for a reusable extension, but the documented
# `composer ci:test:php:*` commands create one locally. The invariants that matter
# are that it stays ignored and untracked; both are asserted at the end of this
# script, so a local, ignored lock file is not treated as a failure here.

php -r '
$composerFile = $argv[1];
if (!is_file($composerFile)) {
    throw new RuntimeException("composer.json is missing");
}

$composer = json_decode((string) file_get_contents($composerFile), true, 512, JSON_THROW_ON_ERROR);
$expectedCoreConstraint = "^12.4 || ^13.4 || ^14.3";
$expectedTypo3Packages = [
    "typo3/cms-core",
    "typo3/cms-extbase",
    "typo3/cms-fluid",
    "typo3/cms-frontend",
];

if (($composer["name"] ?? null) !== "netresearch/nr-browser-ai") {
    throw new RuntimeException("Unexpected Composer package name");
}
if (($composer["extra"]["typo3/cms"]["extension-key"] ?? null) !== "nr_browser_ai") {
    throw new RuntimeException("Unexpected TYPO3 extension key");
}
if (($composer["require"]["php"] ?? null) !== "^8.2") {
    throw new RuntimeException("Unexpected Composer PHP constraint");
}
if (array_key_exists("platform", $composer["config"] ?? [])) {
    throw new RuntimeException("Reusable extensions must not pin a Composer platform");
}
if (array_key_exists("phpunit/phpunit", $composer["require-dev"] ?? [])) {
    throw new RuntimeException("PHPUnit must be resolved through the TYPO3 testing framework");
}
if (($composer["require-dev"]["netresearch/typo3-ci-workflows"] ?? null) !== "^1.3") {
    throw new RuntimeException("Unexpected Netresearch CI tooling constraint");
}
if (($composer["require-dev"]["typo3/testing-framework"] ?? null) !== "^8.2 || ^9.0") {
    throw new RuntimeException("Unexpected TYPO3 testing framework constraint");
}
if (($composer["extra"]["captainhook"]["config"] ?? null) !== "Build/captainhook.json") {
    throw new RuntimeException("Unexpected CaptainHook configuration path");
}
foreach ($expectedTypo3Packages as $packageName) {
    if (($composer["require"][$packageName] ?? null) !== $expectedCoreConstraint) {
        throw new RuntimeException(sprintf("Unexpected constraint for %s", $packageName));
    }
}
if (!str_contains($composer["description"] ?? "", "Netresearch")) {
    throw new RuntimeException("Composer description must mention Netresearch");
}
if (($composer["authors"][0]["email"] ?? null) !== "typo3@netresearch.de") {
    throw new RuntimeException("Unexpected Composer author email");
}
' "${repository_root}/composer.json"

php -r '
$configuration = json_decode((string) file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
foreach (["pre-commit", "commit-msg", "pre-push"] as $hook) {
    if (($configuration[$hook]["enabled"] ?? null) !== true
        || !is_array($configuration[$hook]["actions"] ?? null)
        || $configuration[$hook]["actions"] === []
    ) {
        throw new RuntimeException(sprintf("CaptainHook %s actions are missing", $hook));
    }
}
' "${repository_root}/Build/captainhook.json"

php -r '
$packageFile = $argv[1];
if (!is_file($packageFile)) {
    throw new RuntimeException("package.json is missing");
}

$package = json_decode((string) file_get_contents($packageFile), true, 512, JSON_THROW_ON_ERROR);
$expectedScripts = [
    "build" => "esbuild Resources/Private/TypeScript/Assistant.ts --bundle --format=esm --target=chrome148 --outfile=Resources/Public/JavaScript/Assistant.js",
    "build:css" => "cp Resources/Private/Styles/Assistant.css Resources/Public/Css/Assistant.css",
    "test:js" => "vitest run",
    "test:js:coverage" => "vitest run --coverage",
    "test:e2e" => "playwright test -c Tests/E2E/playwright.config.ts",
    "ci" => "npm run build && npm run build:css && npm run test:js",
    "typecheck" => "tsc --noEmit",
];
$expectedDevDependencies = [
    "@axe-core/playwright",
    "@fontsource/open-sans",
    "@fontsource/raleway",
    "@playwright/test",
    "@types/dom-chromium-ai",
    "@types/node",
    "@vitest/coverage-v8",
    "esbuild",
    "jsdom",
    "typescript",
    "vitest",
];

foreach ($expectedScripts as $name => $command) {
    if (($package["scripts"][$name] ?? null) !== $command) {
        throw new RuntimeException(sprintf("Unexpected npm script %s", $name));
    }
}
foreach ($expectedDevDependencies as $name) {
    $constraint = $package["devDependencies"][$name] ?? null;
    if (!is_string($constraint) || $constraint === "") {
        throw new RuntimeException(sprintf("Missing npm dev dependency %s", $name));
    }
}

$actualDevDependencies = array_keys($package["devDependencies"] ?? []);
sort($actualDevDependencies);
sort($expectedDevDependencies);
if ($actualDevDependencies !== $expectedDevDependencies) {
    throw new RuntimeException("Unexpected npm dev dependency set");
}

$vitestConstraint = $package["devDependencies"]["vitest"];
$coverageConstraint = $package["devDependencies"]["@vitest/coverage-v8"];
if ($vitestConstraint !== $coverageConstraint || preg_match("/^\^4\./", $vitestConstraint) !== 1) {
    throw new RuntimeException("Vitest and its coverage provider must use the same major 4 constraint");
}

if (preg_match("/^\^([0-9]+)\./", $package["devDependencies"]["typescript"], $typescriptMatch) !== 1
    || (int) $typescriptMatch[1] < 7
) {
    throw new RuntimeException("TypeScript 7 or newer is required");
}

$nodeConstraint = $package["engines"]["node"] ?? null;
if (!is_string($nodeConstraint)
    || preg_match("/^(?:\^|>=)[0-9]+\.[0-9]+\.[0-9]+(?: \|\| (?:\^|>=)[0-9]+\.[0-9]+\.[0-9]+)*$/", $nodeConstraint) !== 1
) {
    throw new RuntimeException("Invalid Node.js engine constraint");
}

$packageLockFile = $argv[2];
if (!is_file($packageLockFile)) {
    throw new RuntimeException("package-lock.json is missing");
}
$packageLock = json_decode((string) file_get_contents($packageLockFile), true, 512, JSON_THROW_ON_ERROR);
if (($packageLock["packages"][""]["devDependencies"] ?? null) !== $package["devDependencies"]) {
    throw new RuntimeException("package-lock.json root dependencies are stale");
}
if (($packageLock["packages"]["node_modules/jsdom"]["engines"]["node"] ?? null) !== $nodeConstraint) {
    throw new RuntimeException("Node.js engine constraint must match the installed jsdom requirement");
}
if (($packageLock["packages"]["node_modules/vitest"]["version"] ?? null)
    !== ($packageLock["packages"]["node_modules/@vitest/coverage-v8"]["version"] ?? null)
) {
    throw new RuntimeException("Locked Vitest and coverage-provider versions must match");
}
' "${repository_root}/package.json" "${repository_root}/package-lock.json"

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

if ! git -C "${repository_root}" check-ignore --quiet composer.lock; then
    echo "composer.lock must be ignored for this reusable extension" >&2
    exit 1
fi

if git -C "${repository_root}" ls-files --error-unmatch composer.lock >/dev/null 2>&1; then
    echo "composer.lock must not be tracked for this reusable extension" >&2
    exit 1
fi

# The content-element mapping lives in the site set and is imported from the
# static include, not the other way round. See the header of the set's
# setup.typoscript for why that direction is the one that works.
grep -q '^tt_content\.nrbrowserai_assistant = COA$' \
    "${repository_root}/Configuration/Sets/NrBrowserAi/setup.typoscript"
grep -q 'EXTBASEPLUGIN' "${repository_root}/Configuration/Sets/NrBrowserAi/setup.typoscript"
grep -q "^@import 'EXT:nr_browser_ai/Configuration/Sets/NrBrowserAi/setup.typoscript'$" \
    "${repository_root}/Configuration/TypoScript/setup.typoscript"
if grep -q 'nrbrowserai_assistant\\|Configuration/TypoScript/setup.typoscript' \
    "${repository_root}/Tests/Functional/Fixtures/Frontend/setup.typoscript"; then
    echo "Frontend fixture must use the production content-element mapping from the functional test setup" >&2
    exit 1
fi

echo "Repository metadata is valid."
