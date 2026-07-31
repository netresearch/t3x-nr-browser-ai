#!/usr/bin/env bash

set -euo pipefail

installer=.ddev/commands/web/_install-typo3
test -x "$installer"

test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT
mock_bin="$test_root/bin"
call_log="$test_root/destructive-calls"
mkdir "$mock_bin"

for command in sudo find mkdir mysql mariadb composer; do
    command_file="$mock_bin/$command"
    # The mock expands these variables when it is executed, not while generated.
    # shellcheck disable=SC2016
    printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$0 $*" >> "$CALL_LOG"\n' > "$command_file"
    chmod +x "$command_file"
done

export CALL_LOG="$call_log"

if PATH="$mock_bin:/usr/bin:/bin" "$installer" invalid >"$test_root/invalid.out" 2>&1; then
    printf 'FAIL: invalid version was accepted\n' >&2
    exit 1
fi
test ! -e "$call_log"
grep -q 'Unsupported version label: invalid' "$test_root/invalid.out"

if PATH="$mock_bin:/usr/bin:/bin" "$installer" \
    v12 '^12.4' "$test_root/unsafe" /tmp/extension vendor/package https://example.test \
    >"$test_root/unsafe.out" 2>&1; then
    printf 'FAIL: unsafe caller-controlled arguments were accepted\n' >&2
    exit 1
fi
test ! -e "$call_log"
grep -q 'Usage:' "$test_root/unsafe.out"

printf 'DDEV installer allowlist verified.\n'
