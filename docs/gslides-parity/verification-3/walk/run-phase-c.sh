#!/bin/sh
# The verifier's third local phase: waits for run-local-walks.sh, starts the shadow server on 4336
# again for the probes written during the pass (the S2 typing probe, the name and prompt probe, the
# Insert > Comment probe) and a second canvas walk, stops it, then runs the parity audit against the
# preview with the row and round three phases alone.
cd /Users/kevinliu/repos/Turboslide || exit 1
V=docs/gslides-parity/verification-3
LOG=$V/check/local-driver.log
say() { echo "phase c: $1 $(date -u +%FT%TZ) load $(uptime | sed 's/.*averages: //')" >> $LOG; }
while [ ! -f $V/check/local-done.flag ]; do sleep 10; done
say "start"
(cd apps/studio && TURBOSLIDE_EXPORT_BATCH=3 TURBOSLIDE_REALTIME=memory TURBOSLIDE_AUTH_DB=.turboslide/auth-verifier.sqlite TURBOSLIDE_MAIL=capture TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off TURBOSLIDE_AUTHORIZE=shadow TURBOSLIDE_SESSION_SECRET=verifier-fake-session-secret-0123456789abcdef TURBOSLIDE_DOWNLOAD_SECRET=verifier-fake-download-secret-0123456789 nohup ../../node_modules/.bin/vite dev --port 4336 --strictPort > ../../$V/check/dev-4336-shadow-c.log 2>&1 & echo $! > ../../.turboslide/v3p2/dev-4336.pid)
for i in $(seq 1 120); do code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4336/new 2>/dev/null); [ "$code" = "200" ] && break; sleep 1; done
say "server 4336 (shadow) answered $code after $i s"
node $V/walk/s2-typing-probe.mjs --base http://localhost:4336 --out $V/walk/s2-typing-probe.json > $V/walk/s2-typing-probe.log 2>&1; echo "exit $?" >> $V/walk/s2-typing-probe.log
say "s2 probe done"
node $V/walk/name-and-prompt-probe.mjs --base http://localhost:4336 --out $V/walk/name-and-prompt-probe.json > $V/walk/name-and-prompt-probe.log 2>&1; echo "exit $?" >> $V/walk/name-and-prompt-probe.log
say "name and prompt probe done"
node $V/walk/insert-comment-probe.mjs --base http://localhost:4336 --out $V/walk/insert-comment-probe.json > $V/walk/insert-comment-probe.log 2>&1; echo "exit $?" >> $V/walk/insert-comment-probe.log
say "insert comment probe done"
node docs/gslides-parity/verification-2/canvas-walk.mjs --base http://localhost:4336 --out $V/walk/canvas-walk-run2 > $V/walk/canvas-walk-run2.log 2>&1; echo "exit $?" >> $V/walk/canvas-walk-run2.log
say "canvas walk run 2 done"
kill $(cat .turboslide/v3p2/dev-4336.pid) 2>/dev/null; sleep 2; lsof -nP -iTCP:4336 -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null
say "server 4336 stopped"
. .turboslide/v3p2/env.sh
node scripts/gslides-parity-audit.mjs --base $PREVIEW --phases rows,roundThree --out $V/audit/parity-audit-preview.json > $V/audit/parity-audit-preview.log 2>&1; echo "exit $?" >> $V/audit/parity-audit-preview.log
say "preview audit done"
echo done > $V/check/phase-c-done.flag
