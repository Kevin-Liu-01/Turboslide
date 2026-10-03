#!/bin/zsh
# The readings correction 5 still needs (round1/build/b4.md, section "Resumed"), not driven by B4:
# the load stayed over 24 from 22:32Z to 00:38Z. Run from the worktree root after
# `H=.turboslide/round1/b4/b4b-typed zsh .turboslide/round1/b4/b4b-typed/install.sh`, at a one
# minute load under 24. Each step's pass: exit 0.
set -u
T=node_modules/.bin/turboslide
D=decks/templates/gt-brand
O=.turboslide/b4-typed
SPEED=speed-monogram,speed-lockup,speed-plate,speed-double-cut,speed-livery,speed-dithered,speed-ascii
rm -rf $O && mkdir -p $O
# the seven slides in both themes, rendered without page errors
$T render 17-23 --theme light,dark --scale 1 --out $O/render --json --deck $D; echo "render exit $?"
# each within 0.5 percent of a fresh Prototemplate shoot of the unedited source slide (step 12's test)
node scripts/compare-to-shoot.mjs --deck $D --render $O/render --shoot /Users/kevinliu/repos/Prototemplate/deck --slides 17,18,19,20,21,22,23 --max-mismatch 0.005 --report $O/compare.json --diff-dir $O/compare-diff; echo "compare exit $?"
# each within 0.5 percent after its canvas conversion (step 24's test, the template's 14 pairs)
node scripts/canvas-fidelity.mjs --deck $D --slides $SPEED --max-mismatch 0.005 --report $O/canvas.json --out $O/canvas; echo "canvas exit $?"
# no severity 3 finding with both layers
$T lint 17-23 --layers both --json --deck $D > $O/lint.json; echo "lint exit $?"
