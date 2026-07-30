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
if (($composer["require-dev"]["phpunit/phpunit"] ?? null) !== "^10.5 || ^11.5 || ^12.5 || ^13.2") {
    throw new RuntimeException("Unexpected PHPUnit constraint");
}
if (isset($composer["require-dev"]["netresearch/typo3-ci-workflows"])) {
    throw new RuntimeException("The CI tooling meta-package is incompatible with TYPO3 12.4");
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
    "@axe-core/playwright" => "^4.12.1",
    "@playwright/test" => "^1.62.0",
    "@types/dom-chromium-ai" => "^0.0.17",
    "@vitest/coverage-v8" => "^4.1.10",
    "esbuild" => "^0.28.1",
    "jsdom" => "^30.0.1",
    "typescript" => "^7.0.2",
    "vitest" => "^4.1.10",
];

foreach ($expectedScripts as $name => $command) {
    if (($package["scripts"][$name] ?? null) !== $command) {
        throw new RuntimeException(sprintf("Unexpected npm script %s", $name));
    }
}
foreach ($expectedDevDependencies as $name => $constraint) {
    if (($package["devDependencies"][$name] ?? null) !== $constraint) {
        throw new RuntimeException(sprintf("Unexpected npm dev dependency %s", $name));
    }
}
if (($package["engines"]["node"] ?? null) !== "^22.22.2 || ^24.15.0 || >=26.0.0") {
    throw new RuntimeException("Unexpected Node.js engine constraint");
}
' "${repository_root}/package.json"

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

echo "Repository metadata is valid."
