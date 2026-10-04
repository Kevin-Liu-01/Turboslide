#!/bin/zsh
# The integrator fixer's dev server on 4510 (Round 1 fix round). Secrets are minted per start and
# reach the child's environment alone; nothing prints them.
cd /Users/kevinliu/repos/Turboslide-next/apps/studio || exit 1
export TURBOSLIDE_STORE=tmp
export TURBOSLIDE_OVERLAY_DIR=.turboslide/integrator-fix-overlay
export TURBOSLIDE_REALTIME=memory
export TURBOSLIDE_LOCAL_OPEN=1
export TURBOSLIDE_AUTH_DB=.turboslide/auth-integrator-fix.sqlite
export TURBOSLIDE_MAIL=capture
export TURBOSLIDE_AUTH_RATE_LIMIT=off
export TURBOSLIDE_SESSION_SECRET=$(openssl rand -hex 24)
export TURBOSLIDE_DOWNLOAD_SECRET=$(openssl rand -hex 24)
exec node_modules/.bin/vite dev --port 4510 --strictPort
