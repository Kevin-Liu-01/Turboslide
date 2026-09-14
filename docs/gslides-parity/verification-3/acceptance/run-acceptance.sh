#!/bin/sh
# The verifier's rerun of every builder's acceptance vitest group (MILESTONES-3 per builder), one
# after another so no two suites share the machine; each log's first line records the load average.
cd /Users/kevinliu/repos/Turboslide || exit 1
OUT=docs/gslides-parity/verification-3/acceptance
run() { key=$1; p=$2; shift 2; n=$(echo $p | tr '/' '-'); echo "== $p $* == load $(uptime | sed 's/.*averages: //') $(date -u +%FT%TZ)" > $OUT/$key-$n.log; (cd $p && ../../node_modules/.bin/vitest run "$@" >> ../../$OUT/$key-$n.log 2>&1; echo "exit $?" >> ../../$OUT/$key-$n.log); }
run b1 packages/schema
run b1 packages/lint
run b1 packages/fonts
run b1 apps/cli
run b1 packages/mcp
run b1 packages/agent
run b2 packages/realtime
run b2 packages/store
run b2 packages/viewer
run b3 packages/identity
run b3 packages/agent src/http
run b3 apps/studio src/server/auth
run b4 packages/headless
run b4 packages/render __tests__/html-escape
run b4 apps/studio src/server/root.test.ts src/server/ratelimit.test.ts src/server/log.test.ts
run b5 packages/effects
run b5 packages/materials
run b5 packages/render
run b5 packages/export
run b5 packages/chrome __tests__/format-sections __tests__/materials-sections __tests__/format-options-round-two
run b6 packages/chrome
run b6 packages/viewer
run int apps/studio
echo done > $OUT/done.flag
