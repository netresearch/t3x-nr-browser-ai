#!/usr/bin/env bash

set -euo pipefail

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

assert_file() {
    test -f "$1" || fail "missing file: $1"
}

assert_executable() {
    test -x "$1" || fail "not executable: $1"
}

assert_contains() {
    local file=$1
    local pattern=$2
    rg -q --fixed-strings -- "$pattern" "$file" \
        || fail "$file does not contain: $pattern"
}

assert_not_contains() {
    local file=$1
    local pattern=$2
    if rg -q --fixed-strings -- "$pattern" "$file"; then
        fail "$file unexpectedly contains: $pattern"
    fi
}

config=.ddev/config.yaml
compose=.ddev/docker-compose.web.yaml
landing=.ddev/web-build/index.html

assert_file "$config"
assert_file .ddev/.gitignore
assert_file "$compose"
assert_file .ddev/web-build/Dockerfile
assert_file "$landing"

assert_contains "$config" 'name: nr-browser-ai'
assert_contains "$config" 'no_project_mount: true'
assert_contains "$config" 'webserver_type: apache-fpm'
for version in v12 v13 v14; do
    assert_contains "$config" "- ${version}.nr-browser-ai"
    assert_contains "$compose" "- ${version}-data:/var/www/html/${version}"
    assert_contains "$compose" "name: \"\${DDEV_SITENAME}-${version}-data\""

    vhost=".ddev/apache/${version}.conf"
    command=".ddev/commands/web/install-${version}"
    assert_file "$vhost"
    assert_file "$command"
    assert_executable "$command"
    assert_contains "$vhost" "DocumentRoot /var/www/html/${version}/public"
    assert_contains "$vhost" "ServerAlias ${version}.\${DDEV_SITENAME}.ddev.site"
    assert_contains "$command" "VERSION=${version}"
    assert_contains "$command" "INSTALL_DIR=\"/var/www/html/\$VERSION\""
    assert_contains "$command" 'EXTENSION_PATH="/var/www/nr_browser_ai"'
    assert_contains "$command" 'PACKAGE_NAME="netresearch/nr-browser-ai"'
    assert_contains "$command" "SITE_URL=\"https://\${VERSION}.nr-browser-ai.ddev.site\""
    assert_contains "$command" '/mnt/ddev_config/commands/web/_install-typo3'
done

assert_contains "$compose" 'source: ../'
assert_contains "$compose" 'target: /var/www/nr_browser_ai'
assert_contains "$compose" 'EXTENSION_KEY=nr_browser_ai'
assert_contains "$compose" 'PACKAGE_NAME=netresearch/nr-browser-ai'
assert_contains "$compose" 'TYPO3_SETUP_ADMIN_USERNAME=admin'
assert_contains "$compose" 'TYPO3_SETUP_ADMIN_PASSWORD=Joh316!!'
assert_contains "$compose" 'TYPO3_CONTEXT=Development'

installer=.ddev/commands/web/_install-typo3
assert_file "$installer"
assert_executable "$installer"
assert_contains "$installer" 'TYPO3_SETUP_ADMIN_USERNAME'
assert_contains "$installer" 'TYPO3_SETUP_ADMIN_PASSWORD'
# The dollar-prefixed values below are literal installer contracts.
# shellcheck disable=SC2016
assert_contains "$installer" 'composer config --working-dir="$INSTALL_DIR" repositories.nr_browser_ai path "$EXTENSION_PATH"'
assert_contains "$installer" 'vendor/bin/typo3 cache:flush'
assert_contains "$installer" 'data-nr-browser-ai-root'

assert_contains .ddev/commands/web/install-v12 "TYPO3_VERSION='^12.4'"
assert_contains "$installer" 'audit.block-insecure false'
assert_contains "$installer" 'platform.php 8.2.0'
# The dollar-prefixed value below is a literal installer contract.
# shellcheck disable=SC2016
assert_contains "$installer" '--admin-user-password="$TYPO3_SETUP_ADMIN_PASSWORD"'
assert_contains "$installer" '--server-type=apache'
assert_contains "$installer" 'SECURITY WARNING'
assert_contains .ddev/commands/web/install-v13 "TYPO3_VERSION='^13.4'"
assert_contains .ddev/commands/web/install-v14 "TYPO3_VERSION='^14.3'"
assert_contains "$installer" "typo3/minimal:\${TYPO3_VERSION}"
assert_contains "$installer" "typo3/cms-install:\${TYPO3_VERSION}"

for command_name in install-all setup; do
    command=".ddev/commands/web/${command_name}"
    assert_file "$command"
    assert_executable "$command"
done
assert_contains .ddev/commands/web/install-all 'ddev install-v12'
assert_contains .ddev/commands/web/install-all 'ddev install-v13'
assert_contains .ddev/commands/web/install-all 'ddev install-v14'

assert_contains "$landing" '#2F99A4'
assert_contains "$landing" '#FF4D00'
assert_contains "$landing" '#585961'
assert_contains "$landing" "'Raleway'"
assert_contains "$landing" "'Open Sans'"
assert_contains "$landing" 'https://www.netresearch.de/'
assert_contains "$landing" 'Netresearch DTT GmbH'
assert_contains "$landing" 'admin'
assert_contains "$landing" 'Joh316!!'
assert_contains "$landing" ':focus-visible'
assert_not_contains "$landing" 'fonts.googleapis.com'
assert_not_contains "$landing" 'docs.nr-browser-ai.ddev.site'
test "$(rg -o '<svg(?:[ >])' "$landing" | wc -l)" -eq 1 \
    || fail "landing page must contain the official symbol-only SVG exactly once"

for version in v12 v13 v14; do
    assert_contains "$landing" "https://${version}.nr-browser-ai.ddev.site/"
    assert_contains "$landing" "https://${version}.nr-browser-ai.ddev.site/typo3/"
done

unexpected_urls=$(
    rg -o 'https://[a-z0-9.-]+\.ddev\.site/?' .ddev \
        | sed 's#^[^:]*:##' \
        | sort -u \
        | rg -v '^https://(v12\.|v13\.|v14\.)?nr-browser-ai\.ddev\.site/?$' \
        || true
)
test -z "$unexpected_urls" \
    || fail "unexpected DDEV URL(s): ${unexpected_urls}"

printf 'DDEV repository contract verified.\n'
