#!/bin/zsh
# Runs a command while holding the checkout's e2e lock (AGENTS.md: one Playwright run at a time).
cd /Users/kevinliu/repos/Turboslide
waited=0
until mkdir .turboslide/e2e.lock 2>/dev/null; do sleep 5; waited=$((waited+5)); done
echo "lock taken after ${waited}s at $(date +%H:%M:%S)"
trap 'rmdir /Users/kevinliu/repos/Turboslide/.turboslide/e2e.lock 2>/dev/null; echo "lock released at $(date +%H:%M:%S)"' EXIT INT TERM
"$@"
