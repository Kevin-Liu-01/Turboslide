#!/bin/zsh
# The dev server phase of the verifier's chain, rerun on its own (the first chain started its dev
# server with a relative log path after a cd, so the server never came up for the audit and the
# tooltip audit; the lint and the quick walk ran against a server started by hand). Waits for the
# lock, starts this lane's dev server on 4357 (tmp store, memory tier, fake secrets), runs the round
# five rows of the parity audit and the tooltip audit on the new routes, stops the server, releases
# the lock.
set -u
cd /Users/kevinliu/repos/Turboslide || exit 9
V=docs/gslides-parity/verification-5
L=/Users/kevinliu/repos/Turboslide/$V/logs
PORT=4357
DEV_URL=http://localhost:$PORT
STAMP() { date '+%H:%M:%S'; }
T=$L/dev-phase-timeline.log
until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "lock taken $(STAMP) load $(sysctl -n vm.loadavg)" > $T
pkill -f "vite dev --port $PORT" 2>/dev/null; sleep 2
(cd apps/studio && TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off \
  TURBOSLIDE_SESSION_SECRET=verifier-fake-session-secret-000000000000000000 \
  TURBOSLIDE_DOWNLOAD_SECRET=verifier-fake-download-secret-00000000000000 \
  ../../node_modules/.bin/vite dev --port $PORT --strictPort > $L/dev-4357-phase2.log 2>&1 &)
for i in $(seq 1 90); do curl -sf -o /dev/null $DEV_URL/new && break; sleep 2; done
curl -sf -o /dev/null $DEV_URL/edit/gt-brand; sleep 5
echo "dev 4357 up $(STAMP)" >> $T
node scripts/gslides-parity-audit.mjs --base $DEV_URL --phases tails,roundFive --skip-tooltip-audit --report \
  --out $V/parity-audit-round-five-dev-4357.json > $L/parity-round-five-dev.log 2>&1
echo "EXIT_AUDIT_R5_DEV $? $(STAMP)" >> $T
node scripts/tooltip-audit.mjs --base $DEV_URL --url $DEV_URL/decks/templates --url $DEV_URL/help/training --url $DEV_URL/help/updates --url $DEV_URL/home --report > $L/tooltip-new-routes-dev.log 2>&1
echo "EXIT_TOOLTIP_DEV $? $(STAMP)" >> $T
pkill -f "vite dev --port $PORT"; sleep 2
echo "dev 4357 stopped $(STAMP)" >> $T
rmdir .turboslide/e2e.lock
echo "lock released $(STAMP)" >> $T
echo "DEV_PHASE_DONE $(STAMP)" >> $T
