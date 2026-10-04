#!/bin/zsh
# The scratch rebased tree's dev server on 4510 (finding 1's reading). Secrets are minted per start and
# reach the child's environment alone; nothing prints them.
cd /private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/r1fix-int/rebased/apps/studio || exit 1
export TURBOSLIDE_STORE=tmp
export TURBOSLIDE_OVERLAY_DIR=.turboslide/rebased-overlay
export TURBOSLIDE_REALTIME=memory
export TURBOSLIDE_LOCAL_OPEN=1
export TURBOSLIDE_AUTH_DB=.turboslide/auth-rebased.sqlite
export TURBOSLIDE_MAIL=capture
export TURBOSLIDE_AUTH_RATE_LIMIT=off
export TURBOSLIDE_SESSION_SECRET=$(openssl rand -hex 24)
export TURBOSLIDE_DOWNLOAD_SECRET=$(openssl rand -hex 24)
exec node_modules/.bin/vite dev --port 4510 --strictPort
