#!/bin/bash
# The readings of docs/gslides-parity/cloudflare/build/guard.patch (scripts/hosting/README.md "The
# guard patch"), run by lane R6 and by the ship step before the apply:
#
#   bash docs/gslides-parity/cloudflare/build/guard-patch-check.sh [<path to gt-follow.sh as it reads today>]
#
# 1. The patch applies to a copy of the guard (`patch -p0 --dry-run`, then the apply) and the
#    result parses (`bash -n`). The default source is ~/.config/turboslide/gt-follow.sh; nothing
#    here writes to that folder.
# 2. The helpers the patch adds run in this shell against fakes on PATH (`vercel` answers `env ls
#    --json` from a file; `pnpm` logs its argv and the account id it was given; `curl` prints a
#    /health body from a file per host) and a fake worktree with a real git repository: `tree_expects`
#    with no file, do, redis, blob, memory and a malformed file; `env_names` and `has_env_name`
#    with the name present, absent, an empty list and a failing CLI; `spec_rows_for` with the
#    matrix id absent, the tree expecting blob, do with the host on preview, do with the host
#    absent, the production origin and the CLI failing; `cf_env` and `cf_host` with and without
#    cloudflare.env (nothing exported); `worker_touched` over four commits; `worker_deploy` for
#    the preview and production (the --env and --var pairs, the account id, wrangler absent, a
#    failing deploy); `worker_health` (a match, a commit mismatch, an origin mismatch, unreachable);
#    `worker_rollback` (the previous sha's deploy and the worktree put back, and no previous sha).
#    Each reading prints its exit code and the note; the script exits 1 on any miss.
# The functions are sourced from the patched copy up to its `case "${1:-}"` line, with WT, LOG,
# GUARD, DIR and SCOPE pointed at the temp folder so nothing of the real guard is touched, and
# `sleep` shadowed by a function so the health retries take no time.
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
contains() { # $1 label, $2 haystack, $3 needle
  case $2 in *"$3"*) ok "$1 (contains '$3')" ;; *) miss "$1: '$2' lacks '$3'" ;; esac
}

# 1. the apply
mkdir -p "$T/apply" && cp "$SRC" "$T/apply/gt-follow.sh"
if (cd "$T/apply" && patch -p0 --dry-run < "$PATCH" > "$T/dry.txt" 2>&1); then ok "patch -p0 --dry-run against $SRC"; else miss "patch -p0 --dry-run: $(tr '\n' ' ' < "$T/dry.txt" | cut -c1-200)"; fi
if (cd "$T/apply" && patch -p0 < "$PATCH" > "$T/apply.txt" 2>&1); then ok "patch -p0 applied"; else miss "patch -p0: $(tr '\n' ' ' < "$T/apply.txt" | cut -c1-200)"; fi
if bash -n "$T/apply/gt-follow.sh"; then ok "bash -n on the patched copy"; else miss "bash -n on the patched copy"; fi
for word in REALTIME_ROWS WORKER_DIR WORKER_PATHS_RE ROOM_HOST_VARIABLE CF_ENV env_names has_env_name tree_expects spec_rows_for cf_env cf_host worker_touched worker_deploy worker_health worker_rollback SPEC_ROWS_FOR WORKER_PASS; do
  if grep -q "$word" "$T/apply/gt-follow.sh"; then ok "the patched copy defines $word"; else miss "the patched copy lacks $word"; fi
done
if grep -q 'wrangler' "$SRC"; then miss "the source already names wrangler (the patch expects a guard without the Worker step)"; else ok "the source names no wrangler (the patch is against the version without the Worker step)"; fi

# 2. the helpers, sourced from the patched copy up to the dispatch
line=$(grep -n '^case "\${1:-}" in' "$T/apply/gt-follow.sh" | head -1 | cut -d: -f1)
[ -n "$line" ] || { miss "no dispatch line to source up to"; echo "readings: $fails failed"; exit 1; }
head -n $((line - 1)) "$T/apply/gt-follow.sh" | grep -v '^WT=\|^DIR=\|^mkdir -p "\$GUARD"\|^export PATH=' > "$T/functions.sh"
mkdir -p "$T/wt/scripts/hosting" "$T/wt/docs/gslides-parity/focus" "$T/wt/apps/realtime-worker" "$T/bin" "$T/guard"
WT=$T/wt DIR=$T LOG=$T/log.txt GUARD=$T/guard SCOPE=fake-scope
# shellcheck disable=SC1090
source "$T/functions.sh"
WT=$T/wt; DIR=$T; LOG=$T/log.txt; GUARD=$T/guard; SCOPE=fake-scope; PROD=https://www.turboslide.com; CF_ENV=$T/cloudflare.env
sleep() { :; }
# the fakes: `vercel env ls <environment> --json` prints $T/envs-<environment>.json, else exit 7;
# `pnpm` logs its argv and CLOUDFLARE_ACCOUNT_ID, prints a deploy line and exits with $T/pnpm-exit
# (0 by default); `curl` prints $T/health-<host>.json for https://<host>/health, else exits 7
cat > "$T/bin/vercel" <<EOF
#!/bin/sh
if [ "\$1" = env ] && [ "\$2" = ls ]; then f="$T/envs-\$3.json"; [ -f "\$f" ] || exit 7; cat "\$f"; exit 0; fi
exit 1
EOF
cat > "$T/bin/pnpm" <<EOF
#!/bin/sh
printf '%s\n' "pnpm-argv: \$*" >> "$T/pnpm.log"
printf '%s\n' "pnpm-account: \${CLOUDFLARE_ACCOUNT_ID:-none}" >> "$T/pnpm.log"
printf '%s\n' "pnpm-oidc: \${VERCEL_OIDC_TOKEN:-none}" >> "$T/pnpm.log"
echo "Deployed turboslide-realtime triggers (0.5 sec)"
echo "Current Version ID: 00000000-0000-0000-0000-000000000000"
exit \$(cat "$T/pnpm-exit" 2>/dev/null || echo 0)
EOF
cat > "$T/bin/curl" <<EOF
#!/bin/sh
for a in "\$@"; do case \$a in https://*) u=\$a ;; esac; done
h=\${u#https://}; h=\${h%%/*}
f="$T/health-\$h.json"; [ -f "\$f" ] || { echo "curl: (7) Failed to connect" >&2; exit 7; }
cat "\$f"
EOF
chmod +x "$T/bin/vercel" "$T/bin/pnpm" "$T/bin/curl"
export PATH="$T/bin:$PATH"
export VERCEL_OIDC_TOKEN=should-not-reach-the-child
envs() { # $1 environment, $2... names
  local e=$1; shift
  node -e 'const names=process.argv.slice(1);console.log(JSON.stringify({envs:names.map(k=>({key:k,type:"sensitive",target:["x"]}))}));' "$@" > "$T/envs-$e.json"
}
health() { # $1 host, $2 commit, $3 appOrigin
  printf '{"ok":true,"protocol":1,"commit":"%s","realtime":"on","appOrigin":"%s"}\n' "$2" "$3" > "$T/health-$1.json"
}

# tree_expects
expect "tree_expects with no file" "$(tree_expects)" blob
for want in do redis blob; do
  printf '{"realtime":"%s"}\n' "$want" > "$T/wt/scripts/hosting/production.json"
  expect "tree_expects with $want" "$(tree_expects)" "$want"
done
printf '{"realtime":"memory"}\n' > "$T/wt/scripts/hosting/production.json"
expect "tree_expects with memory reads blob" "$(tree_expects)" blob
printf 'not json\n' > "$T/wt/scripts/hosting/production.json"
expect "tree_expects with a malformed file" "$(tree_expects)" blob

# env_names and has_env_name
envs preview TURBOSLIDE_TOKEN TURBOSLIDE_ROOM_HOST BLOB_READ_WRITE_TOKEN
expect "env_names lists the keys" "$(env_names preview | tr '\n' ' ')" "TURBOSLIDE_TOKEN TURBOSLIDE_ROOM_HOST BLOB_READ_WRITE_TOKEN "
has_env_name preview TURBOSLIDE_ROOM_HOST; expect "has_env_name present" "$?" 0
has_env_name preview TURBOSLIDE_ACCOUNTS; expect "has_env_name absent" "$?" 1
envs production
has_env_name production TURBOSLIDE_ROOM_HOST; expect "has_env_name on an empty list reads unreadable" "$?" 2
rm -f "$T/envs-production.json"
has_env_name production TURBOSLIDE_ROOM_HOST; expect "has_env_name when the CLI fails" "$?" 2
env_names production > /dev/null; expect "env_names when the CLI fails" "$?" 2

# spec_rows_for
MATRIX=$T/wt/docs/gslides-parity/focus/core-matrix.json
printf '{"rows":[{"id":"decks.list.read"}]}\n' > "$MATRIX"
printf '{"realtime":"do"}\n' > "$T/wt/scripts/hosting/production.json"
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for without the matrix id: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for without the matrix id: note" "$ROWS_NOTE" "realtime rows skipped: not in the tree's matrix"
printf '{"rows":[{"id":"realtime.title.two-typers"},{"id":"realtime.caret.within-300ms"},{"id":"realtime.join.chip-within-1s"}]}\n' > "$MATRIX"
printf '{"realtime":"blob"}\n' > "$T/wt/scripts/hosting/production.json"
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for when the tree expects blob: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for when the tree expects blob: note" "$ROWS_NOTE" "realtime rows skipped: the tree expects the blob tier (scripts/hosting/production.json)"
printf '{"realtime":"do"}\n' > "$T/wt/scripts/hosting/production.json"
envs preview TURBOSLIDE_TOKEN TURBOSLIDE_ROOM_HOST
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for with do and the host on preview: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS,$REALTIME_ROWS"
expect "spec_rows_for with do and the host on preview: note" "$ROWS_NOTE" "realtime rows joined: the tree expects do and TURBOSLIDE_ROOM_HOST is among the preview environment names"
envs preview TURBOSLIDE_TOKEN
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for with do and no host on preview: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for with do and no host on preview: note" "$ROWS_NOTE" "realtime rows skipped: TURBOSLIDE_ROOM_HOST absent from the preview environment names"
envs production TURBOSLIDE_TOKEN TURBOSLIDE_ROOM_HOST
spec_rows_for "$PROD"
expect "spec_rows_for on production reads the production environment: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS,$REALTIME_ROWS"
expect "spec_rows_for on production: note" "$ROWS_NOTE" "realtime rows joined: the tree expects do and TURBOSLIDE_ROOM_HOST is among the production environment names"
rm -f "$T/envs-preview.json"
spec_rows_for https://turboslide-abc-general-translation.vercel.app
expect "spec_rows_for when the CLI fails: rows" "$SPEC_ROWS_FOR" "$SPEC_ROWS"
expect "spec_rows_for when the CLI fails: note" "$ROWS_NOTE" "realtime rows skipped: the preview environment names could not be read (vercel env ls)"
spec_rows_for "$PROD"; noteAfter=$ROWS_NOTE
expect "ROWS_NOTE reaches the caller (no subshell)" "${noteAfter:+set}" set

# cf_env and cf_host
expect "cf_host production without cloudflare.env" "$(cf_host production)" turboslide-realtime.kk23907751.workers.dev
expect "cf_host preview without cloudflare.env" "$(cf_host preview)" turboslide-realtime-preview.kk23907751.workers.dev
printf '# the account facts\nCLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef\nCLOUDFLARE_WORKERS_SUBDOMAIN=sub\nTURBOSLIDE_ROOM_HOST=turboslide-realtime.sub.workers.dev\nTURBOSLIDE_ROOM_HOST_PREVIEW="turboslide-realtime-preview.sub.workers.dev"\n' > "$T/cloudflare.env"
cf_env
expect "cf_env reads the account id" "$CF_ACCOUNT_ID" 0123456789abcdef0123456789abcdef
expect "cf_host production from the file" "$(cf_host production)" turboslide-realtime.sub.workers.dev
expect "cf_host preview from the file (quotes stripped)" "$(cf_host preview)" turboslide-realtime-preview.sub.workers.dev
expect "cf_env exports nothing" "$(env | grep -c '^CLOUDFLARE_ACCOUNT_ID=\|^TURBOSLIDE_ROOM_HOST')" 0

# worker_touched over a real repository
( cd "$T/wt" && git init -q && git config user.email r6@example.invalid && git config user.name r6 \
  && echo a > docs/a.md && git add -A && git commit -q -m A \
  && mkdir -p apps/realtime-worker/src && echo b > apps/realtime-worker/src/x.ts && git add -A && git commit -q -m B \
  && mkdir -p packages/realtime/src && echo c > packages/realtime/src/frames.ts && git add -A && git commit -q -m C \
  && echo d > packages/realtime/src/redis.ts && git add -A && git commit -q -m D ) 2>>"$T/log.txt"
A=$(git -C "$T/wt" rev-parse HEAD~3); B=$(git -C "$T/wt" rev-parse HEAD~2); C=$(git -C "$T/wt" rev-parse HEAD~1); D=$(git -C "$T/wt" rev-parse HEAD)
worker_touched "$A" "$B"; expect "worker_touched: apps/realtime-worker/** changed" "$?" 0
worker_touched "$B" "$C"; expect "worker_touched: packages/realtime/src/frames.ts changed" "$?" 0
worker_touched "$C" "$D"; expect "worker_touched: redis.ts alone is not the Worker's" "$?" 1
worker_touched "" "$D"; expect "worker_touched: an empty base reads as touched" "$?" 0
worker_touched 0000000000000000000000000000000000000000 "$D"; expect "worker_touched: an unknown base reads as touched" "$?" 0

# worker_deploy
worker_deploy preview "$D" https://turboslide-abc.vercel.app "$T/guard/wd1.out"; code=$?
expect "worker_deploy without wrangler installed" "$code" 2
contains "worker_deploy without wrangler: the note" "$WORKER_NOTE" "wrangler is not installed in $T/wt/apps/realtime-worker"
mkdir -p "$T/wt/apps/realtime-worker/node_modules/.bin" && printf '#!/bin/sh\nexit 0\n' > "$T/wt/apps/realtime-worker/node_modules/.bin/wrangler" && chmod +x "$T/wt/apps/realtime-worker/node_modules/.bin/wrangler"
worker_deploy preview "$D" https://turboslide-abc.vercel.app "$T/guard/wd2.out"; expect "worker_deploy preview" "$?" 0
contains "worker_deploy preview: the argv" "$(cat "$T/pnpm.log")" "pnpm-argv: exec wrangler deploy --env preview --var TURBOSLIDE_BUILD_COMMIT:$D --var TURBOSLIDE_APP_ORIGIN:https://turboslide-abc.vercel.app"
contains "worker_deploy: the account id reaches the child" "$(cat "$T/pnpm.log")" "pnpm-account: 0123456789abcdef0123456789abcdef"
contains "worker_deploy: the OIDC token does not" "$(cat "$T/pnpm.log")" "pnpm-oidc: none"
contains "worker_deploy preview: the note" "$WORKER_NOTE" "Current Version ID"
rm -f "$T/pnpm.log"
worker_deploy production "$D" "" "$T/guard/wd3.out"; expect "worker_deploy production" "$?" 0
contains "worker_deploy production: --env empty and no app origin" "$(cat "$T/pnpm.log")" "pnpm-argv: exec wrangler deploy --env  --var TURBOSLIDE_BUILD_COMMIT:$D"
case $(cat "$T/pnpm.log") in *TURBOSLIDE_APP_ORIGIN*) miss "worker_deploy production passed an app origin" ;; *) ok "worker_deploy production passes no app origin" ;; esac
echo 3 > "$T/pnpm-exit"
worker_deploy production "$D" "" "$T/guard/wd4.out"; expect "worker_deploy when wrangler fails" "$?" 2
contains "worker_deploy when wrangler fails: the note" "$WORKER_NOTE" "exit 3"
rm -f "$T/pnpm-exit"

# worker_health
health turboslide-realtime-preview.sub.workers.dev "$D" https://turboslide-abc.vercel.app
worker_health turboslide-realtime-preview.sub.workers.dev "$D" https://turboslide-abc.vercel.app; expect "worker_health: a match" "$?" 0
contains "worker_health: the reading" "$WORKER_HEALTH" "/health ok true commit $D realtime on appOrigin https://turboslide-abc.vercel.app"
worker_health turboslide-realtime-preview.sub.workers.dev "$C" https://turboslide-abc.vercel.app; expect "worker_health: a commit mismatch" "$?" 1
worker_health turboslide-realtime-preview.sub.workers.dev "$D" https://other.vercel.app; expect "worker_health: an origin mismatch" "$?" 1
worker_health turboslide-realtime-preview.sub.workers.dev "$D" ""; expect "worker_health: no origin asked, the commit matches" "$?" 0
worker_health nothing.sub.workers.dev "$D" ""; expect "worker_health: unreachable" "$?" 2
contains "worker_health: unreachable reading" "$WORKER_HEALTH" "unreachable"

# worker_rollback
health turboslide-realtime.sub.workers.dev "$C" https://www.turboslide.com
rm -f "$T/pnpm.log"
sentence=$(worker_rollback "$C" "$D")
contains "worker_rollback: the sentence" "$sentence" "rolled the Worker back to $C (/health ok true commit $C"
contains "worker_rollback: the previous sha's deploy" "$(cat "$T/pnpm.log")" "pnpm-argv: exec wrangler deploy --env  --var TURBOSLIDE_BUILD_COMMIT:$C"
expect "worker_rollback: the worktree is back at the current sha" "$(git -C "$T/wt" rev-parse HEAD)" "$D"
contains "worker_rollback with no previous sha" "$(worker_rollback "" "$D")" "no previous sha in gt-follow.last"
case $(cat "$T/log.txt" 2>/dev/null) in *should-not-reach-the-child*|*0123456789abcdef*) miss "a value reached the log" ;; *) ok "nothing of a value in the log" ;; esac

echo "readings: $fails failed"
[ "$fails" -eq 0 ]
