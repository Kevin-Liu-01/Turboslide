#!/bin/sh
# Verifier day 0 (round five): chain 1 of the production baseline. Holds .turboslide/e2e.lock for
# the two browser runs and releases it at the end whatever their exit codes.
cd /Users/kevinliu/repos/Turboslide || exit 2
V=docs/gslides-parity/verification-5
LOG=$V/run-baseline-chain-1-2026-09-15.log
until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "lock taken $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "started $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$V/perf-budget-production-2026-09-15.log"
node scripts/perf-budget.mjs --base https://turboslide.vercel.app --profile deployment --runs 3 --report --json "$V/perf-budget-production-2026-09-15.json" >> "$V/perf-budget-production-2026-09-15.log" 2>&1
echo "exit=$? finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$V/perf-budget-production-2026-09-15.log"
echo "perf-budget done $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "started $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$V/layout-shift-production-2026-09-15.log"
node scripts/layout-shift-audit.mjs --base https://turboslide.vercel.app --out "$V/layout-shift-production-2026-09-15.json" --report >> "$V/layout-shift-production-2026-09-15.log" 2>&1
echo "exit=$? finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$V/layout-shift-production-2026-09-15.log"
echo "layout-shift done $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
rmdir .turboslide/e2e.lock
echo "lock released $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
