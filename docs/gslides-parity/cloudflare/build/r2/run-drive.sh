#!/bin/zsh
# Runs R2's drive against the two process run under the worktree's e2e lock (AGENTS.md). Usage:
# run-drive.sh <args of drive.mjs...>. `status` is read only in zsh, so the exit code lives in `rc`.
set -u
ROOT=/Users/kevinliu/repos/Turboslide-realtime
cd "$ROOT" || exit 1
until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "lock taken $(date +%H:%M:%S) load $(uptime | sed 's/.*load averages: //')"
node docs/gslides-parity/realtime/build/r2/drive.mjs "$@"
rc=$?
rmdir .turboslide/e2e.lock
echo "lock released $(date +%H:%M:%S) exit $rc load $(uptime | sed 's/.*load averages: //')"
exit $rc
