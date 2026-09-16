#!/bin/sh
# Verifier day 0 (round five): chain 2 of the production baseline, the parity audit against
# production. Waits for .turboslide/e2e.lock (chain 1 holds it), releases it at the end.
cd /Users/kevinliu/repos/Turboslide || exit 2
V=docs/gslides-parity/verification-5
LOG=$V/run-baseline-chain-2-2026-09-15.log
echo "waiting for the lock $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; done
echo "lock taken $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "started $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$V/parity-audit-production-2026-09-15.log"
node scripts/gslides-parity-audit.mjs --base https://turboslide.vercel.app --out "$V/parity-audit-production-2026-09-15.json" --report >> "$V/parity-audit-production-2026-09-15.log" 2>&1
echo "exit=$? finished $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$V/parity-audit-production-2026-09-15.log"
echo "parity audit done $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
rmdir .turboslide/e2e.lock
echo "lock released $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
