#!/usr/bin/env bash

#
# TYPO3 extension test runner for netresearch/nr-browser-ai.
# Runs PHP suites in the official TYPO3 core-testing containers.
#

set -euo pipefail

SUITE=""
PHP_VERSION="8.4"
TYPO3_VERSION="14.3"
DBMS="sqlite"
DBMS_VERSION=""
DRY_RUN=1
UPDATE_IMAGES=0
EXTRA_ARGS=()

usage() {
    cat <<'EOF'
Usage: Build/Scripts/runTests.sh -s <suite> [options] [-- <arguments>]

Suites:
  unit, functional, lint, phpstan, cgl, cgl:fix, rector, rector:fix,
  typecheck, javascript, assets, e2e, ci, clean

Options:
  -p <8.2|8.3|8.4|8.5>  PHP version (default: 8.4)
  -t <12.4|13.4|14.3>    TYPO3 version (default: 14.3)
  -d <sqlite|mariadb|mysql|postgres>
                           Functional-test database (default: sqlite)
  -i <version>             Database image version
  -n                      Dry-run for cgl/rector (default)
  -u                      Pull the selected container image first
  -h                      Show this help
EOF
}

while (($#)); do
    case "$1" in
        -s)
            SUITE="${2:-}"
            shift 2
            ;;
        -p)
            PHP_VERSION="${2:-}"
            shift 2
            ;;
        -t)
            TYPO3_VERSION="${2:-}"
            shift 2
            ;;
        -d)
            DBMS="${2:-}"
            shift 2
            ;;
        -i)
            DBMS_VERSION="${2:-}"
            shift 2
            ;;
        -n)
            DRY_RUN=1
            shift
            ;;
        -u)
            UPDATE_IMAGES=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            EXTRA_ARGS=("$@")
            break
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ -z "${SUITE}" ]]; then
    echo "Missing required -s <suite>." >&2
    usage >&2
    exit 1
fi

case "${PHP_VERSION}" in
    8.2|8.3|8.4|8.5) ;;
    *) echo "Unsupported PHP version: ${PHP_VERSION}" >&2; exit 1 ;;
esac

case "${TYPO3_VERSION}" in
    12.4|13.4|14.3) ;;
    *) echo "Unsupported TYPO3 version: ${TYPO3_VERSION}" >&2; exit 1 ;;
esac

if [[ "${TYPO3_VERSION}" == "12.4" && "${PHP_VERSION}" == "8.5" ]]; then
    echo "TYPO3 12.4 is not supported with PHP 8.5." >&2
    exit 1
fi

case "${DBMS}" in
    sqlite) ;;
    mariadb) DBMS_VERSION="${DBMS_VERSION:-10.11}" ;;
    mysql) DBMS_VERSION="${DBMS_VERSION:-8.4}" ;;
    postgres) DBMS_VERSION="${DBMS_VERSION:-16}" ;;
    *) echo "Unsupported database: ${DBMS}" >&2; exit 1 ;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PHP_IMAGE="ghcr.io/typo3/core-testing-php${PHP_VERSION//./}:latest"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
RUNTIME_KEY="php${PHP_VERSION//./}-typo3${TYPO3_VERSION//./}"
RUNTIME_DIR="${ROOT_DIR}/.Build/runtime/${RUNTIME_KEY}"
RUNTIME_COMPOSER="${RUNTIME_DIR}/composer.json"
RUNTIME_VENDOR="${RUNTIME_DIR}/vendor"
RUNTIME_BIN="${RUNTIME_DIR}/bin"
RUNTIME_READY=0
NETWORK="nr-browser-ai-$RANDOM-$$"
DB_CONTAINER=""

if command -v docker >/dev/null 2>&1; then
    CONTAINER_BIN="docker"
elif command -v podman >/dev/null 2>&1; then
    CONTAINER_BIN="podman"
else
    echo "This script requires Docker or Podman." >&2
    exit 1
fi

CONTAINER_ARGS=(--rm --init -v "${ROOT_DIR}:${ROOT_DIR}")
CONTAINER_WORKDIR="${ROOT_DIR}"
if [[ "$(uname -s)" != "Darwin" ]]; then
    CONTAINER_ARGS+=(--user "$(id -u):$(id -g)")
fi

cleanup() {
    if [[ -n "${DB_CONTAINER}" ]]; then
        "${CONTAINER_BIN}" rm --force "${DB_CONTAINER}" >/dev/null 2>&1 || true
    fi
    "${CONTAINER_BIN}" network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

wait_for_database() {
    local host="$1"
    local port="$2"

    "${CONTAINER_BIN}" run --rm --network "${NETWORK}" alpine:3.23 sh -c \
        "attempt=0; until nc -z '${host}' '${port}'; do attempt=\$((attempt + 1)); [ \$attempt -le 60 ] || exit 1; sleep 1; done"
}
if [[ ! -t 0 || ! -t 1 ]]; then
    CONTAINER_ARGS+=(--interactive=false)
fi

run_container() {
    "${CONTAINER_BIN}" run "${CONTAINER_ARGS[@]}" -w "${CONTAINER_WORKDIR}" \
        -e COMPOSER_ROOT_VERSION=0.1.x-dev \
        -e XDEBUG_MODE=off \
        "${PHP_IMAGE}" "$@"
}

ensure_runtime() {
    if [[ "${RUNTIME_READY}" -eq 1 ]]; then
        return
    fi

    local expected_fingerprint current_fingerprint=""
    expected_fingerprint="$({ sha256sum "${ROOT_DIR}/composer.json" "${ROOT_DIR}/Build/Runtime/composer.json"; printf '%s\n' "${PHP_VERSION}" "${TYPO3_VERSION}"; } | sha256sum | cut -d' ' -f1)"
    if [[ -f "${RUNTIME_DIR}/fingerprint" ]]; then
        current_fingerprint="$(<"${RUNTIME_DIR}/fingerprint")"
    fi

    if [[ "${expected_fingerprint}" != "${current_fingerprint}" || ! -f "${RUNTIME_VENDOR}/autoload.php" ]]; then
        rm -rf "${RUNTIME_DIR}"
        mkdir -p "${RUNTIME_DIR}" "${ROOT_DIR}/.Build/runtime/composer-cache"
        cp "${ROOT_DIR}/Build/Runtime/composer.json" "${RUNTIME_COMPOSER}"
        sed -i "s#__PROJECT_ROOT__#${ROOT_DIR}#" "${RUNTIME_COMPOSER}"

        local composer_environment=(env "COMPOSER_CACHE_DIR=${ROOT_DIR}/.Build/runtime/composer-cache")
        local composer_command=(composer --working-dir "${RUNTIME_DIR}")
        if [[ "${TYPO3_VERSION}" == "12.4" ]]; then
            run_container "${composer_environment[@]}" "${composer_command[@]}" config --no-plugins audit.block-insecure false
        fi
        run_container "${composer_environment[@]}" "${composer_command[@]}" require --no-update \
            "typo3/cms-core:^${TYPO3_VERSION}" \
            "typo3/cms-extbase:^${TYPO3_VERSION}" \
            "typo3/cms-fluid:^${TYPO3_VERSION}" \
            "typo3/cms-frontend:^${TYPO3_VERSION}"
        if [[ "${TYPO3_VERSION}" != "12.4" ]]; then
            run_container "${composer_environment[@]}" "${composer_command[@]}" require --dev --no-update \
                'netresearch/typo3-ci-workflows:^1.3'
        fi
        run_container "${composer_environment[@]}" "${composer_command[@]}" update \
            --with-all-dependencies --no-interaction --no-progress
        if [[ "${TYPO3_VERSION}" == "12.4" ]]; then
            if ! run_container "${composer_environment[@]}" "${composer_command[@]}" audit --locked; then
                echo "TYPO3 12.4 is EOL; known advisories are reported but do not block compatibility tests." >&2
            fi
        else
            run_container "${composer_environment[@]}" "${composer_command[@]}" audit --locked
        fi
        printf '%s\n' "${expected_fingerprint}" > "${RUNTIME_DIR}/fingerprint"
    fi

    RUNTIME_READY=1
}

run_php() {
    ensure_runtime
    run_container env \
        "NR_BROWSER_AI_AUTOLOAD=${RUNTIME_VENDOR}/autoload.php" \
        "NR_BROWSER_AI_VENDOR=${RUNTIME_VENDOR}" \
        "$@"
}

run_unit() {
    run_php php "${RUNTIME_BIN}/phpunit" --configuration Build/UnitTests.xml "${EXTRA_ARGS[@]}"
}

run_functional() {
    ensure_runtime
    mkdir -p "${ROOT_DIR}/.Build/Web/typo3temp/var/tests/functional-sqlite-dbs"
    local database_args=()
    local runtime_args=("${CONTAINER_ARGS[@]}")

    if [[ "${DBMS}" == "sqlite" ]]; then
        runtime_args+=(--tmpfs "${ROOT_DIR}/.Build/Web/typo3temp/var/tests/functional-sqlite-dbs:rw,noexec,nosuid")
        database_args=(-e typo3DatabaseDriver=pdo_sqlite)
    else
        "${CONTAINER_BIN}" network create "${NETWORK}" >/dev/null
        DB_CONTAINER="nr-browser-ai-${DBMS}-$RANDOM-$$"
        runtime_args+=(--network "${NETWORK}")

        case "${DBMS}" in
            mariadb)
                "${CONTAINER_BIN}" run --rm --detach --name "${DB_CONTAINER}" --network "${NETWORK}" \
                    --tmpfs /var/lib/mysql:rw,noexec,nosuid \
                    -e MARIADB_ROOT_PASSWORD=funcp -e MARIADB_DATABASE=func_test \
                    "mariadb:${DBMS_VERSION}" >/dev/null
                wait_for_database "${DB_CONTAINER}" 3306
                database_args=(-e typo3DatabaseDriver=mysqli -e typo3DatabaseName=func_test -e typo3DatabaseUsername=root -e typo3DatabasePassword=funcp -e "typo3DatabaseHost=${DB_CONTAINER}" -e typo3DatabasePort=3306)
                ;;
            mysql)
                "${CONTAINER_BIN}" run --rm --detach --name "${DB_CONTAINER}" --network "${NETWORK}" \
                    --tmpfs /var/lib/mysql:rw,noexec,nosuid \
                    -e MYSQL_ROOT_PASSWORD=funcp -e MYSQL_DATABASE=func_test \
                    "mysql:${DBMS_VERSION}" >/dev/null
                wait_for_database "${DB_CONTAINER}" 3306
                database_args=(-e typo3DatabaseDriver=mysqli -e typo3DatabaseName=func_test -e typo3DatabaseUsername=root -e typo3DatabasePassword=funcp -e "typo3DatabaseHost=${DB_CONTAINER}" -e typo3DatabasePort=3306)
                ;;
            postgres)
                "${CONTAINER_BIN}" run --rm --detach --name "${DB_CONTAINER}" --network "${NETWORK}" \
                    --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid \
                    -e POSTGRES_USER=funcu -e POSTGRES_PASSWORD=funcp -e POSTGRES_DB=func_test \
                    "postgres:${DBMS_VERSION}-alpine" >/dev/null
                wait_for_database "${DB_CONTAINER}" 5432
                database_args=(-e typo3DatabaseDriver=pdo_pgsql -e typo3DatabaseName=func_test -e typo3DatabaseUsername=funcu -e typo3DatabasePassword=funcp -e "typo3DatabaseHost=${DB_CONTAINER}" -e typo3DatabasePort=5432)
                ;;
        esac
    fi

    "${CONTAINER_BIN}" run "${runtime_args[@]}" -w "${CONTAINER_WORKDIR}" \
        -e COMPOSER_ROOT_VERSION=0.1.x-dev \
        -e XDEBUG_MODE=off \
        -e "NR_BROWSER_AI_AUTOLOAD=${RUNTIME_VENDOR}/autoload.php" \
        -e "NR_BROWSER_AI_VENDOR=${RUNTIME_VENDOR}" \
        "${database_args[@]}" \
        "${PHP_IMAGE}" php "${RUNTIME_BIN}/phpunit" \
        --configuration Build/FunctionalTests.xml "${EXTRA_ARGS[@]}"
}

run_cgl() {
    local fixer_args=(fix --config Build/.php-cs-fixer.dist.php --diff --verbose --cache-file "${RUNTIME_DIR}/.php-cs-fixer.cache")
    if [[ "${DRY_RUN}" -eq 1 ]]; then
        fixer_args+=(--dry-run)
    fi
    run_php "${RUNTIME_BIN}/php-cs-fixer" "${fixer_args[@]}" "${EXTRA_ARGS[@]}"
}

run_rector() {
    local rector_args=(process --config Build/rector.php)
    if [[ "${DRY_RUN}" -eq 1 ]]; then
        rector_args+=(--dry-run)
    fi
    run_php "${RUNTIME_BIN}/rector" "${rector_args[@]}" "${EXTRA_ARGS[@]}"
}

if [[ "${UPDATE_IMAGES}" -eq 1 ]]; then
    "${CONTAINER_BIN}" pull "${PHP_IMAGE}"
    case "${DBMS}" in
        mariadb) "${CONTAINER_BIN}" pull "mariadb:${DBMS_VERSION}" ;;
        mysql) "${CONTAINER_BIN}" pull "mysql:${DBMS_VERSION}" ;;
        postgres) "${CONTAINER_BIN}" pull "postgres:${DBMS_VERSION}-alpine" ;;
    esac
fi

case "${SUITE}" in
    unit) run_unit ;;
    functional) run_functional ;;
    lint)
        run_php sh -c 'find Classes Configuration Tests -type f -name "*.php" -print0 | xargs -0 -n1 php -l >/dev/null'
        ;;
    phpstan)
        if [[ "${TYPO3_VERSION}" == "12.4" ]]; then
            echo "PHPStan tooling is unavailable for the TYPO3 12.4 compatibility target." >&2
            exit 1
        fi
        ensure_runtime
        # The shared config resolves its bootstrap stubs against
        # %currentWorkingDirectory%/.Build/vendor, but this runner keeps the vendor tree
        # in the per-version runtime directory. Materialise a rewritten copy so the
        # config never depends on a Composer install at the repository root.
        shared_config="${RUNTIME_VENDOR}/netresearch/typo3-ci-workflows/config/phpstan/phpstan.neon"
        sed -e "s#%currentWorkingDirectory%/.Build/vendor#${RUNTIME_VENDOR}#g" \
            -e "s#%currentWorkingDirectory%#${ROOT_DIR}#g" \
            "${shared_config}" > "${RUNTIME_DIR}/phpstan-shared.neon"
        sed -e "s#%currentWorkingDirectory%/.Build/vendor/netresearch/typo3-ci-workflows/config/phpstan/phpstan.neon#${RUNTIME_DIR}/phpstan-shared.neon#" \
            -e "s#%currentWorkingDirectory%#${ROOT_DIR}#g" \
            Build/phpstan.neon > "${RUNTIME_DIR}/phpstan.neon"
        # PHPStan boots the Composer autoloader of its working directory. From the
        # repository root that is .Build/vendor, which would be loaded in addition to
        # the runtime vendor tree and abort on a duplicate TYPO3 class-alias loader.
        # Analyse from the runtime directory; the generated config uses absolute paths.
        CONTAINER_WORKDIR="${RUNTIME_DIR}"
        run_php "${RUNTIME_BIN}/phpstan" analyze \
            --configuration "${RUNTIME_DIR}/phpstan.neon" --memory-limit=-1 "${EXTRA_ARGS[@]}"
        ;;
    cgl) run_cgl ;;
    cgl:fix)
        DRY_RUN=0
        run_cgl
        ;;
    rector) run_rector ;;
    rector:fix)
        DRY_RUN=0
        run_rector
        ;;
    typecheck) npm run typecheck ;;
    javascript) npm run test:js ;;
    assets)
        npm run build
        npm run build:css
        git diff --exit-code -- Resources/Public
        ;;
    e2e)
        "${CONTAINER_BIN}" run "${CONTAINER_ARGS[@]}" -w "${CONTAINER_WORKDIR}" \
            -e CI="${CI:-}" \
            -e TYPO3_BASE_URL="${TYPO3_BASE_URL:-https://v14.nr-browser-ai.ddev.site/}" \
            "${PLAYWRIGHT_IMAGE}" bash -lc 'npm ci && npm run test:e2e'
        ;;
    ci)
        "$0" -p "${PHP_VERSION}" -t "${TYPO3_VERSION}" -s lint
        if [[ "${TYPO3_VERSION}" != "12.4" ]]; then
            "$0" -p "${PHP_VERSION}" -t "${TYPO3_VERSION}" -s cgl
            "$0" -p "${PHP_VERSION}" -t "${TYPO3_VERSION}" -s phpstan
            "$0" -p "${PHP_VERSION}" -t "${TYPO3_VERSION}" -s rector
        fi
        "$0" -p "${PHP_VERSION}" -t "${TYPO3_VERSION}" -s unit
        "$0" -p "${PHP_VERSION}" -t "${TYPO3_VERSION}" -s functional
        npm ci
        npm run typecheck
        npm run test:js:coverage
        "$0" -s assets
        ;;
    clean)
        rm -rf .Build/.phpunit.cache .Build/runtime .Build/var coverage playwright-report test-results
        ;;
    *)
        echo "Unknown suite: ${SUITE}" >&2
        usage >&2
        exit 1
        ;;
esac
