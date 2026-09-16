#!/bin/zsh
# The verifier's lock chain of round five pass 1 (2026-09-15). Waits for .turboslide/e2e.lock, then
# runs, one browser job at a time: the round five rows of the parity audit, the tooltip audit and
# the chrome lint on the three new routes and the quick editor walk against this lane's dev server
# on 4357 (tmp store, memory tier, fake secrets); the full check chain (scripts/check.mjs, 1 to 37,
# continued after every failing step so every step runs); the Chromium bound checkout items (the
# five family deck rendered, built and exported in Perfect mode); then the preview deployment: the
# fresh write probe, the sync stress probe, the editor walk with screenshots, resize.spec.ts, the
# perf run with the deployment profile (--write, its scratch deck removed afterwards), the preview
# walk (S1 to S7, Kevin's three reports, the motion walk in two browsers, the panel cells), the
# layout shift audit and the parity audit. Every log lands under verification-5/logs/. The lock is
# released at the end; every server this chain starts is stopped by it.
set -u
cd /Users/kevinliu/repos/Turboslide || exit 9
S=/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad
V=docs/gslides-parity/verification-5
L=$V/logs
mkdir -p $L $V/preview-walk-shots $V/walk-preview-shots
PREVIEW=https://turboslide-ho9rltx7u-kl01s-projects.vercel.app
PORT=4357
DEV_URL=http://localhost:$PORT
STAMP() { date '+%H:%M:%S'; }
T=$L/chain-timeline.log

# the tokens ride in the environment only (never printed): the Trusted Sources token from the
# integrator's vercel env pull, the agent bearer from the hosts file
set -a; . $S/.env.oidc; set +a
export TURBOSLIDE_TOKEN="$(node -e "const h=require(require('os').homedir()+'/.config/turboslide/hosts.json'); const v=Object.values(h.hosts??h)[0]; process.stdout.write(String((typeof v==='string')?v:(v.token??v.bearer??'')))")"

until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "lock taken $(STAMP) load $(sysctl -n vm.loadavg)" > $T

# ---- 1. this lane's dev server on 4357
(cd apps/studio && TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_RATE_LIMIT=off \
  TURBOSLIDE_SESSION_SECRET=verifier-fake-session-secret-000000000000000000 \
  TURBOSLIDE_DOWNLOAD_SECRET=verifier-fake-download-secret-00000000000000 \
  ../../node_modules/.bin/vite dev --port $PORT --strictPort > $L/dev-4357.log 2>&1 &)
for i in $(seq 1 60); do curl -sf -o /dev/null $DEV_URL/new && break; sleep 2; done
echo "dev 4357 up $(STAMP)" >> $T
node scripts/gslides-parity-audit.mjs --base $DEV_URL --phases tails,roundFive --skip-tooltip-audit --report \
  --out $V/parity-audit-round-five-dev-4357.json > $L/parity-round-five-dev.log 2>&1
echo "EXIT_AUDIT_R5_DEV $? $(STAMP)" >> $T
node scripts/tooltip-audit.mjs --base $DEV_URL --url $DEV_URL/decks/templates --url $DEV_URL/help/training --url $DEV_URL/help/updates --url $DEV_URL/home --report > $L/tooltip-new-routes-dev.log 2>&1
echo "EXIT_TOOLTIP_DEV $? $(STAMP)" >> $T
for r in decks/templates help/training help/updates; do
  node apps/cli/bin/turboslide.mjs lint --chrome --url $DEV_URL/$r --widths 1440,1280,390 --themes light,dark --states '' >> $L/lint-chrome-new-routes-dev.log 2>&1
  echo "EXIT_LINT_CHROME_$r $? $(STAMP)" >> $T
done
node scripts/probes/editor-walk-probe.mjs --base $DEV_URL --quick --json $V/walk-dev-4357-quick.json > $L/walk-dev-4357-quick.log 2>&1
echo "EXIT_WALK_DEV $? $(STAMP)" >> $T
pkill -f "vite dev --port $PORT" ; sleep 2
echo "dev 4357 stopped $(STAMP)" >> $T

# ---- 2. the preview deployment (first: the rows the round adds, A7)
node scripts/hosted-smoke.mjs --base $PREVIEW --token-env TURBOSLIDE_TOKEN --sync-probe --template-copy > $L/smoke-preview2-full.log 2>&1
echo "EXIT_SMOKE_FULL_PREVIEW $? $(STAMP)" >> $T
node scripts/probes/new-write-probe.mjs --base $PREVIEW > $L/new-write-probe-preview.log 2>&1
echo "EXIT_NEW_WRITE_PREVIEW $? $(STAMP)" >> $T
node scripts/probes/sync-stress-probe.mjs --base $PREVIEW --json $V/sync-stress-preview.json > $L/sync-stress-preview.log 2>&1
echo "EXIT_SYNC_STRESS_PREVIEW $? $(STAMP)" >> $T
node scripts/perf-budget.mjs --base $PREVIEW --profile deployment --runs 3 --write --json $V/perf-budget-preview.json > $L/perf-budget-preview.log 2>&1
echo "EXIT_PERF_PREVIEW $? $(STAMP)" >> $T
node $V/scripts/remove-scratch-decks.mjs --base $PREVIEW --perf-json $V/perf-budget-preview.json > $L/remove-perf-deck.log 2>&1
node $V/scripts/preview-walk.mjs --base $PREVIEW --json $V/preview-walk.json --shots $V/preview-walk-shots > $L/preview-walk.log 2>&1
echo "EXIT_PREVIEW_WALK $? $(STAMP)" >> $T
PLAYWRIGHT_BASE_URL=$PREVIEW node_modules/.bin/playwright test --config .turboslide/hotfix4-preview.playwright.config.ts apps/studio/e2e/resize.spec.ts --reporter=list > $L/resize-spec-preview.log 2>&1
echo "EXIT_RESIZE_PREVIEW $? $(STAMP)" >> $T
node $V/scripts/remove-scratch-decks.mjs --base $PREVIEW --prefix e2e-resize- > $L/remove-resize-decks.log 2>&1
node scripts/probes/editor-walk-probe.mjs --base $PREVIEW --json $V/walk-preview.json --shots $V/walk-preview-shots > $L/walk-preview.log 2>&1
echo "EXIT_WALK_PREVIEW $? $(STAMP)" >> $T
node scripts/layout-shift-audit.mjs --base $PREVIEW --out $V/layout-shift-preview.json --report > $L/layout-shift-preview.log 2>&1
echo "EXIT_LAYOUT_SHIFT_PREVIEW $? $(STAMP)" >> $T
node scripts/gslides-parity-audit.mjs --base $PREVIEW --out $V/parity-audit-preview.json --report > $L/parity-audit-preview.log 2>&1
echo "EXIT_PARITY_PREVIEW $? $(STAMP)" >> $T
node $V/scripts/remove-scratch-decks.mjs --base $PREVIEW --prefix v5- --prefix e2e-resize- > $L/remove-leftovers.log 2>&1

# ---- 3. the full check chain, continued after every failing step
step=1
while [ $step -le 37 ]; do
  node scripts/check.mjs --from $step > $L/check-from-$step.log 2>&1
  code=$?
  echo "check --from $step exit $code $(STAMP)" >> $T
  [ $code -eq 0 ] && break
  failed=$(grep -oE "^check +[0-9]+/37: FAIL" $L/check-from-$step.log | tail -1 | grep -oE "[0-9]+/37" | cut -d/ -f1)
  if [ -z "$failed" ]; then echo "check --from $step failed without a step number; stopping the chain segment" >> $T; break; fi
  step=$((failed + 1))
done
pkill -f "vite dev --port 4321" 2>/dev/null; pkill -f "vite preview --port 4344" 2>/dev/null

# ---- 4. the five family deck in Chromium (render, the standalone build, the Perfect export)
FD=$S/v5/fonts-deck
node apps/cli/bin/turboslide.mjs render all --deck $FD/five-families --theme light --scale 1 --out $FD/render --json > $FD/render.json 2> $L/fonts-render.err
echo "EXIT_FONTS_RENDER $? $(STAMP)" >> $T
node apps/cli/bin/turboslide.mjs build --deck $FD/five-families --out $FD/five-families.html --budget 16 > $L/fonts-build.log 2>&1
echo "EXIT_FONTS_BUILD $? $(STAMP)" >> $T
node apps/cli/bin/turboslide.mjs export pptx all --mode flatten --theme light --deck $FD/five-families --out $FD/flatten --json > $FD/flatten.json 2> $L/fonts-flatten.err
echo "EXIT_FONTS_FLATTEN $? $(STAMP)" >> $T

rmdir .turboslide/e2e.lock
echo "lock released $(STAMP)" >> $T
echo "CHAIN_DONE $(STAMP)" >> $T
