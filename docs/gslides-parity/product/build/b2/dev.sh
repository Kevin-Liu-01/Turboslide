#!/bin/zsh
cd /Users/kevinliu/repos/Turboslide/apps/studio
export TURBOSLIDE_STORE=tmp
export TURBOSLIDE_REALTIME=memory
export TURBOSLIDE_LOCAL_OPEN=1
export TURBOSLIDE_SESSION_SECRET=b2-product-round-session-secret-0123456789abcdef
export TURBOSLIDE_DOWNLOAD_SECRET=b2-product-round-download-secret-0123456789abcdef
exec ../../node_modules/.bin/vite dev --port 4412 --strictPort -c vite.no-watch.config.ts "$@"
