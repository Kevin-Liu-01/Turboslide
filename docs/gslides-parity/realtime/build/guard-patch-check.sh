#!/bin/bash
# The readings of docs/gslides-parity/realtime/build/guard.patch (scripts/hosting/README.md "The
# guard patch"), run by lane R6 and by the ship step before the apply:
#
#   bash docs/gslides-parity/realtime/build/guard-patch-check.sh [<path to gt-follow.sh as it reads today>]
#
# 1. The patch applies to a copy of the guard (`patch -p0 --dry-run`, then the apply) and the
#    result parses (`bash -n`). The default source is ~/.config/turboslide/gt-follow.sh; nothing
#    here writes to that folder.
# 2. The four helpers the patch adds run in a shell against a fake `vercel` on PATH (it answers
#    `env ls --json` from a file and logs nothing else) and a fake worktree: `tree_expects` with
#    no file, redis, blob and a malformed file; `env_names` and `has_env_name` with the name
#    present, absent, an empty list and a failing CLI; `spec_rows_for` with the matrix id absent,
#    present with REDIS_URL on preview, absent on preview, the production origin, and the CLI
#    failing. Each reading prints its exit code and the note; the script exits 1 on any miss.
# The functions are sourced from the patched copy up to its `case "${1:-}"` line, with WT, LOG,
# GUARD, DIR and SCOPE pointed at the temp folder so nothing of the real guard is touched.
set -u
SRC=${1:-$HOME/.config/turboslide/gt-follow.sh}
HERE=$(cd "$(dirname "$0")" && pwd)
PATCH=$HERE/guard.patch
T=$(mktemp -d "${TMPDIR:-/tmp}/guard-patch-check.XXXXXX")
trap 'rm -rf "$T"' EXIT
fails=0
ok() { echo "pass  $1"; }
miss() { echo "FAIL  $1"; fails=$((fails + 1)); }
expect() { # $1 label, $2 got, $3 want
  if [ "$2" = "$3" ]; then ok "$1 ($3)"; else miss "$1: got '$2', want '$3'"; fi
}

# 1. the apply
mkdir -p "$T/apply" && cp "$SRC" "$T/apply/gt-follow.sh"
if (cd "$T/apply" && patch -p0 --dry-run < "$PATCH" > "$T/dry.txt" 2>&1); then ok "patch -p0 --dry-run against $SRC"; else miss "patch -p0 --dry-run: $(tr '\n' ' ' < "$T/dry.txt" | cut -c1-200)"; fi
if (cd "$T/apply" && patch -p0 < "$PATCH" > "$T/apply.txt" 2>&1); then ok "patch -p0 applied"; else miss "patch -p0: $(tr '\n' ' ' < "$T/apply.txt" | cut -c1-200)"; fi
if bash -n "$T/apply/gt-follow.sh"; then ok "bash -n on the patched copy"; else miss "bash -n on the patched copy"; fi
for word in REALTIME_ROWS env_names has_env_name tree_expects spec_rows_for SPEC_ROWS_FOR; do
  if grep -q "$word" "$T/apply/gt-follow.sh"; then ok "the patched copy defines $word"; else miss "the patched copy lacks $word"; fi
done

# 2. the helpers, sourced from the patched copy up to the dispatch
line=$(grep -n '^case "\${1:-}" in' "$T/apply/gt-follow.sh" | head -1 | cut -d: -f1)
[ -n "$line" ] || { miss "no dispatch line to source up to"; echo "readings: $fails failed"; exit 1; }
head -n $((line - 1)) "$T/apply/gt-follow.sh" | grep -v '^WT=\|^DIR=\|^mkdir -p "\$GUARD"\|^export PATH=' > "$T/functions.sh"
mkdir -p "$T/wt/scripts/hosting" "$T/wt/docs/gslides-parity/focus" "$T/bin" "$T/guard"
WT=$T/wt DIR=$T LOG=$T/log.txt GUARD=$T/guard SCOPE=fake-scope
# shellcheck disable=SC1090
source "$T/functions.sh"
WT=$T/wt; DIR=$T; LOG=$T/log.txt; GUARD=$T/guard; SCOPE=fake-scope; PROD=https://www.turboslide.com
# the fake vercel: `env ls <environment> --json` prints $T/envs-<environment>.json, else exit 1;
# the file absent means the CLI fails (exit 7)
cat > "$T/bin/vercel" <<EOF
#!/bin/sh
if [ "\$1" = env ] && [ "\$2" = ls ]; then f="$T/envs-\$3.json"; [ -f "\$f" ] || exit 7; cat "\$f"; exit 0; fi
exit 1
EOF
chmod +x "$T/bin/vercel"
export PATH="$T/bin:$PATH"
envs() { # $1 environment, $2... names
  local e=$1; shift
  node -e 'const names=process.argv.slice(1);console.log(JSON.stringify({envs:names.map(k=>({key:k,type:"sensitive",target:["x"]}))}));' "$@" > "$T/envs-$e.json"
}

# tree_expects
expect "tree_expects with no file" "$(tree_expects)" blob
printf '{"realtime":"redis"}\n' > "$T/wt/scripts/hosting/production.json"
expect "tree_expects with redis" "$(tree_expects)" redis
printf '{"realtime":"blob"}\n' > "$T/wt/scripts/hosting/production.json"
expect "tree_expects with blob" "$(tree_expects)" blob
printf 'not json\n' > "$T/wt/scripts/hosting/production.json"
expect "tree_expects with a malformed file" "$(tree_expects)" blob

# env_names and has_env_name
envs preview TURBOSLIDE_TOKEN REDIS_URL BLOB_READ_WRITE_TOKEN
expect "env_names lists the keys" "$(env_names preview | tr '\n' ' ')" "TURBOSLIDE_TOKEN REDIS_URL BLOB_READ_WRITE_TOKEN "
has_env_name preview REDIS_URL; expect "has_env_name present" "$?" 0
has_env_name preview DATABASE_URL; expect "has_env_name absent" "$?" 1
envs production
has_env_name production REDIS_URL; expect "has_env_name on an empty list reads unreadable" "$?" 2
rm -f "$T/envs-production.json"
has_env_name production REDIS_URL; expect "has_env_name when the CLI fails" "$?" 2
env_names production > /dev/null; expect "env_names when the CLI fails" "$?" 2
grep -q 'rediss://\|REDIS_URL=' "$T/log.txt" 2>/dev/null && miss "a value reached the log" || ok "nothing of a value in the log"

# spec_rows_for
MATRIX=$T/wt/docs/gslides-parity/focus/core-matrix.json
printf '{"rows":[{"id":"decks.list.read"}]}\n' > "$MATRIX"
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for without the matrix id: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for without the matrix id: note" "$ROWS_NOTE" "realtime rows skipped: not in the tree's matrix"
printf '{"rows":[{"id":"realtime.title.two-typers"},{"id":"realtime.caret.within-300ms"},{"id":"realtime.join.chip-within-1s"}]}\n' > "$MATRIX"
envs preview TURBOSLIDE_TOKEN REDIS_URL
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for with REDIS_URL on preview: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS,$REALTIME_ROWS"
expect "spec_rows_for with REDIS_URL on preview: note" "$ROWS_NOTE" "realtime rows joined: REDIS_URL is among the preview environment names"
envs preview TURBOSLIDE_TOKEN
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for without REDIS_URL on preview: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for without REDIS_URL on preview: note" "$ROWS_NOTE" "realtime rows skipped: REDIS_URL absent from the preview environment names"
envs production TURBOSLIDE_TOKEN REDIS_URL
spec_rows_for "$PROD"
expect "spec_rows_for on production reads the production environment: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS,$REALTIME_ROWS"
expect "spec_rows_for on production: note" "$ROWS_NOTE" "realtime rows joined: REDIS_URL is among the production environment names"
rm -f "$T/envs-preview.json"
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for when the CLI fails: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for when the CLI fails: note" "$ROWS_NOTE" "realtime rows skipped: the preview environment names could not be read (vercel env ls)"
# the caller's shape: the note survives because the function is called directly
spec_rows_for "$PROD"; noteAfter=$ROWS_NOTE
expect "ROWS_NOTE reaches the caller (no subshell)" "${noteAfter:+set}" set

echo "readings: $fails failed"
[ "$fails" -eq 0 ]
