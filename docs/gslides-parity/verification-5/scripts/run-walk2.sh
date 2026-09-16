#!/bin/zsh
# The second run of the preview walk (the first run's misses that were the script's own
# assumptions, fixed: the presenter console as a second page of the same context, the theme
# colour slot names, a settle between writes, the roster wait, the objects key, the title run,
# the nested menu rows). Waits for the lock; every deck it creates is removed by the walk.
set -u
cd /Users/kevinliu/repos/Turboslide || exit 9
S=/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad
V=docs/gslides-parity/verification-5
L=/Users/kevinliu/repos/Turboslide/$V/logs
PREVIEW=https://turboslide-ho9rltx7u-kl01s-projects.vercel.app
STAMP() { date '+%H:%M:%S'; }
T=$L/walk2-timeline.log
set -a; . $S/.env.oidc; set +a
export TURBOSLIDE_TOKEN="$(node -e "const h=require(require('os').homedir()+'/.config/turboslide/hosts.json'); const v=Object.values(h.hosts??h)[0]; process.stdout.write(String((typeof v==='string')?v:(v.token??v.bearer??'')))")"
until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "lock taken $(STAMP) load $(sysctl -n vm.loadavg)" > $T
node $V/scripts/preview-walk.mjs --base $PREVIEW --json $V/preview-walk-2.json --shots $V/preview-walk-shots-2 > $L/preview-walk-2.log 2>&1
echo "EXIT_PREVIEW_WALK_2 $? $(STAMP)" >> $T
node $V/scripts/remove-scratch-decks.mjs --base $PREVIEW --prefix v5- > $L/remove-leftovers-2.log 2>&1
# resize.spec.ts again: the first run's setup failed while the seed deck was missing (16:05)
PLAYWRIGHT_BASE_URL=$PREVIEW node_modules/.bin/playwright test --config .turboslide/hotfix4-preview.playwright.config.ts apps/studio/e2e/resize.spec.ts --reporter=list > $L/resize-spec-preview-2.log 2>&1
echo "EXIT_RESIZE_PREVIEW_2 $? $(STAMP)" >> $T
node $V/scripts/remove-scratch-decks.mjs --base $PREVIEW --prefix e2e-resize- > $L/remove-resize-decks-2.log 2>&1
rmdir .turboslide/e2e.lock
echo "lock released $(STAMP)" >> $T
echo "WALK2_DONE $(STAMP)" >> $T
