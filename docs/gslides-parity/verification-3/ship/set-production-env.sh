#!/bin/sh
# The production environment of the degraded tiers (docs/gslides-parity/SPEC-3.md 11.4;
# docs/hosting.md section 11; docs/security.md section 12; MILESTONES-3 "Ship step" item 4), set
# through the vercel CLI on the linked project `turboslide` before the production deploy. Two
# secrets are generated here with `openssl rand` and piped straight into `vercel env add`, so no
# value is ever printed or written to disk; the other variables are plain switches. Every variable
# is added with --force so a rerun replaces the value. No Marketplace product is installed and
# nothing paid is created: REDIS_URL, DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY,
# TURBOSLIDE_MAIL_FROM, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and TURBOSLIDE_BLOB_PRIVATE_TOKEN
# are Kevin's (docs/hosting.md section 11, VERIFICATION-3 section 12).
#
#   sh docs/gslides-parity/verification-3/ship/set-production-env.sh [public store host]
#
# The optional argument is the public Blob store's host for the CSP's img-src
# (TURBOSLIDE_PUBLIC_STORE_HOST), read from a twin's redirect on the current production deploy.
set -eu
cd /Users/kevinliu/repos/Turboslide
add() {
  # $1 name, $2 value (a switch); prints the name and the CLI's answer, never the value
  printf '%s' "$2" | vercel env add "$1" production --force --yes --non-interactive 2>&1 | grep -v '^Vercel CLI' | sed "s/^/$1: /"
}
add_secret() {
  # $1 name, $2 bytes of randomness; the hex value goes from openssl to the CLI's stdin
  openssl rand -hex "$2" | tr -d '\n' | vercel env add "$1" production --sensitive --force --yes --non-interactive 2>&1 | grep -v '^Vercel CLI' | sed "s/^/$1 (sensitive, $2 random bytes as hex): /"
}
# R3: shadow mode for the week; a denial is logged and allowed (SPEC-3 11.5, security.md section 2)
add TURBOSLIDE_AUTHORIZE shadow
# the realtime tier the deployment runs without REDIS_URL (hosting.md section 9); named, not inferred
add TURBOSLIDE_REALTIME blob
# no database and no Redis on production this round: captured mail would need one of them
# (mailer.ts: the database table when there is a database, else a file the function cannot keep),
# and with sign in off nothing sends; `off` drops a mail with one log line (hosting.md section 11)
add TURBOSLIDE_MAIL off
# the identity cookie's seal, 32 characters or more (hosting.md section 11: `openssl rand -hex 32`)
add_secret TURBOSLIDE_SESSION_SECRET 32
# required on every hosted environment, 16 bytes or more (security.md section 12)
add_secret TURBOSLIDE_DOWNLOAD_SECRET 32
if [ "${1:-}" != "" ]; then
  # the public store's host for the report only CSP's img-src (security.md section 8)
  add TURBOSLIDE_PUBLIC_STORE_HOST "$1"
fi
echo "--- production environment names after the change ---"
vercel env ls production 2>&1 | grep -v '^Vercel CLI' | grep -v 'Retrieving' | sed -n 1,20p
