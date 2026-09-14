#!/bin/sh
# The verifier's local phase after the check chain (MILESTONES-3 "Verifier" items 3, 4, 5 and 7):
# waits for the chain's done flag, reruns every builder's acceptance vitest group one after another
# (acceptance/run-acceptance.sh), then starts the verifier's own dev server on 4336 (the file store
# and the environment scripts/check.mjs gives its runner, plus an obviously fake session secret) in
# shadow mode for the two browser walk, the name and prompt probe, the round two canvas walk and
# the strict tooltip audit, stops it, starts it again in enforce mode for the enforce walk and the
# enforce rows of security.spec.ts and share.spec.ts under .turboslide/e2e.lock, and stops it.
cd /Users/kevinliu/repos/Turboslide || exit 1
V=docs/gslides-parity/verification-3
LOG=$V/check/local-driver.log
say() { echo "driver: $1 $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $LOG; }
say "waiting for the chain"
while [ ! -f $V/check/chain-done.flag ]; do sleep 15; done
say "chain done; acceptance"
sh $V/acceptance/run-acceptance.sh
say "acceptance done; step 5 alone"
node scripts/check.mjs --only 5 > $V/check/check-only-5-quiet.log 2>&1; echo "exit $?" >> $V/check/check-only-5-quiet.log
start_server() {
  mode=$1
  (cd apps/studio && TURBOSLIDE_EXPORT_BATCH=3 TURBOSLIDE_REALTIME=memory TURBOSLIDE_AUTH_DB=.turboslide/auth-verifier.sqlite TURBOSLIDE_MAIL=capture TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off TURBOSLIDE_AUTHORIZE=$mode TURBOSLIDE_SESSION_SECRET=verifier-fake-session-secret-0123456789abcdef TURBOSLIDE_DOWNLOAD_SECRET=verifier-fake-download-secret-0123456789 nohup ../../node_modules/.bin/vite dev --port 4336 --strictPort > ../../$V/check/dev-4336-$mode.log 2>&1 & echo $! > ../../.turboslide/v3p2/dev-4336.pid)
  for i in $(seq 1 120); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4336/new 2>/dev/null)
    [ "$code" = "200" ] && break
    sleep 1
  done
  say "server 4336 ($mode) answered $code after $i s"
}
stop_server() {
  kill $(cat .turboslide/v3p2/dev-4336.pid) 2>/dev/null; sleep 2
  lsof -nP -iTCP:4336 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null; sleep 1
  say "server 4336 stopped"
}
start_server shadow
node $V/walk/two-browser-walk.mjs --base http://localhost:4336 --out $V/walk --tag local > $V/walk/two-browser-walk-local.log 2>&1; echo "exit $?" >> $V/walk/two-browser-walk-local.log
say "local walk done"
node $V/walk/name-and-prompt-probe.mjs --base http://localhost:4336 --out $V/walk/name-and-prompt-probe.json > $V/walk/name-and-prompt-probe.log 2>&1; echo "exit $?" >> $V/walk/name-and-prompt-probe.log
say "name and prompt probe done"
node docs/gslides-parity/verification-2/canvas-walk.mjs --base http://localhost:4336 --out $V/walk/canvas-walk > $V/walk/canvas-walk.log 2>&1; echo "exit $?" >> $V/walk/canvas-walk.log
say "canvas walk done"
node scripts/tooltip-audit.mjs --base http://localhost:4336 --strict > $V/audit/tooltip-audit-strict.log 2>&1; echo "exit $?" >> $V/audit/tooltip-audit-strict.log
say "tooltip audit done"
stop_server
start_server enforce
node $V/walk/two-browser-walk.mjs --base http://localhost:4336 --out $V/walk --tag local-enforce > $V/walk/two-browser-walk-local-enforce.log 2>&1; echo "exit $?" >> $V/walk/two-browser-walk-local-enforce.log
say "enforce walk done"
while ! mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
PLAYWRIGHT_BASE_URL=http://localhost:4336 TURBOSLIDE_AUTHORIZE=enforce node_modules/.bin/playwright test apps/studio/e2e/security.spec.ts apps/studio/e2e/share.spec.ts > $V/acceptance/e2e-enforce-security-share.log 2>&1; echo "exit $?" >> $V/acceptance/e2e-enforce-security-share.log
rmdir .turboslide/e2e.lock
say "enforce specs done"
stop_server
echo done > $V/check/local-done.flag
say "done"
