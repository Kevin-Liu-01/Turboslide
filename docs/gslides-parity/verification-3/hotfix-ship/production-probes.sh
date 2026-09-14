#!/bin/sh
# The hotfix ship step's production probes (VERIFICATION-3 section 17.4), in order, each into
# docs/gslides-parity/verification-3/hotfix-ship/production-*.txt. The bearer is read in code by
# verification-2/ship/run-with-token.mjs and never printed; production is not a protected
# deployment, so no OIDC header is needed.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/hotfix-ship
BASE=https://turboslide.vercel.app
TOKEN=docs/gslides-parity/verification-2/ship/run-with-token.mjs
echo "probes: start $(date -u +%FT%TZ)" > $OUT/production-probes.txt

node scripts/probes/new-write-probe.mjs --base $BASE > $OUT/production-new-write-probe.txt 2>&1
echo "new-write-probe exit $? $(date -u +%FT%TZ)" >> $OUT/production-probes.txt

node scripts/hosted-smoke.mjs --base $BASE > $OUT/production-smoke.txt 2>&1
echo "hosted-smoke exit $? $(date -u +%FT%TZ)" >> $OUT/production-probes.txt

node $TOKEN $BASE -- node scripts/hosted-smoke.mjs --base $BASE --token-env TURBOSLIDE_TOKEN --export-batch --slides 6 > $OUT/production-smoke-token.txt 2>&1
echo "hosted-smoke with the bearer and --export-batch --slides 6 exit $? $(date -u +%FT%TZ)" >> $OUT/production-probes.txt

node $TOKEN $BASE -- node docs/gslides-parity/verification-3/hotfix/share-sequence-probe.mjs --base $BASE --out $OUT/production-share-sequence.json > $OUT/production-share-sequence.txt 2>&1
echo "share-sequence-probe exit $? $(date -u +%FT%TZ)" >> $OUT/production-probes.txt

node $TOKEN $BASE -- node docs/gslides-parity/verification-3/hotfix/publish-410-probe.mjs $BASE > $OUT/production-publish-410.txt 2>&1
echo "publish-410-probe exit $? $(date -u +%FT%TZ)" >> $OUT/production-probes.txt

echo "probes: done $(date -u +%FT%TZ)" >> $OUT/production-probes.txt
