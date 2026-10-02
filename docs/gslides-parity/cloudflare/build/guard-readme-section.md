## 2026-10-0X: the realtime Worker, the do tier's rows and the TURBOSLIDE_ROOM_HOST check

(The section `~/.config/turboslide/README.md` gains after the ship step applies
`docs/gslides-parity/cloudflare/build/guard.patch`; the ship step writes the date and pastes it at
the end of that file. `scripts/hosting/README.md` "The guard patch" in the repository is the
reference; `docs/CLOUDFLARE.md` 5.6 is the design.)

The Cloudflare phase of the realtime round moves the realtime channel to one Cloudflare Worker,
`turboslide-realtime` on `turboslide-realtime.kk23907751.workers.dev`, with a second Worker
`turboslide-realtime-preview` for the gate's previews, and adds four readings to the loop:

- After the Vercel preview deploy, the preview Worker follows the push when the checked out tree's
  `scripts/hosting/production.json` expects the `do` tier, or when the push changed the Worker's
  files (`apps/realtime-worker/**`, `packages/realtime/src/room-core.ts` or `frames.ts`; an empty
  or unknown base reads as changed). The deploy is `pnpm exec wrangler deploy --env preview --var
TURBOSLIDE_BUILD_COMMIT:<sha> --var TURBOSLIDE_APP_ORIGIN:<the preview url>` from the worktree's
  `apps/realtime-worker`, with `CLOUDFLARE_ACCOUNT_ID` from `cloudflare.env` (the account id and
  the two hosts; none a secret) in the child's environment and the keyring credential of
  `wrangler login`; then `GET https://<preview host>/health` must answer `ok`, the sha and that
  URL (three tries 10 s apart) before any row runs. The log line is `deployed preview Worker <host>
for <sha> (/health ok true commit <sha> realtime on appOrigin <url>)`. A failed deploy or a
  `/health` that does not answer the sha is an error (retried on the next poll, held after three).
  A docs-only push leaves the Worker alone. wrangler absent from the worktree's `node_modules` is
  an error whose note names `pnpm install --frozen-lockfile` in the worktree.
- The spec rows of the check gain the three two browser rows `realtime.title.two-typers`,
  `realtime.caret.within-300ms` and `realtime.join.chip-within-1s` (`REALTIME_ROWS`), only when the
  tree's matrix carries them, the tree expects `do` and the deployment's environment names carry
  `TURBOSLIDE_ROOM_HOST`: `preview` for the preview deployment the check runs against, `production`
  for a `--check https://www.turboslide.com`. The names are read through `vercel env ls
<environment> --json --scope general-translation` from the worktree (the `key` of every row; the
  JSON carries no value for a sensitive or an encrypted row, so nothing here can print one).
  Otherwise the rows are skipped and the log says why: `realtime rows skipped: not in the tree's
matrix`, `the tree expects the blob tier (scripts/hosting/production.json)`, `TURBOSLIDE_ROOM_HOST
absent from the preview environment names`, or `the preview environment names could not be read
(vercel env ls)`. The note also rides the numbers line of the `promoted` and `held` lines. A
  realtime row red on a reason that reads as timing is rerun once narrowed like any spec row; red
  twice holds. On a preview behind Vercel Authentication these rows need the preview Worker's
  `VERCEL_AUTOMATION_BYPASS_SECRET` (Kevin's project setting, `docs/CLOUDFLARE.md` section 6 step
  15), because the object reads the seed route and posts its checkpoints to the preview; without
  it they read red and hold the sha, and `docs/CLOUDFLARE.md` 5.5 item 2 says where they are read
  instead.
- Before the production deploy of a green sha, the loop reads the tree's expectation of the tier.
  A tree that expects `do` is held while `TURBOSLIDE_ROOM_HOST` is absent from the production
  environment names, with the line `held <sha>: the tree expects the do tier
(scripts/hosting/production.json) and TURBOSLIDE_ROOM_HOST is absent from the production
environment names; nothing deployed to production`; the names unreadable is an error. Then, on a
  pass that deployed the preview Worker, the production Worker deploys first (`pnpm exec wrangler
deploy --env "" --var TURBOSLIDE_BUILD_COMMIT:<sha>`; its app origin is fixed in `wrangler.jsonc`)
  and `GET https://turboslide-realtime.kk23907751.workers.dev/health` must answer the sha, else the
  previous sha's Worker is redeployed from a checkout of `gt-follow.last` and the pass errors; then
  the Vercel production deploy runs as today. The log lines are `deployed Worker <host> for <sha>
(/health ...)` and, on the way back, `rolled the Worker back to <previous sha> (/health ...)`.
- On a red production smoke, beside the promote of the previous deployment back, the previous
  sha's Worker is redeployed the same way and the `held` line carries both sentences. The order
  Worker then app never strands a tab (`docs/CLOUDFLARE.md` 5.6 item 5): a newer Worker verifies an
  older app's tickets.

The expectation file is written by `node scripts/hosting/realtime-env.mjs flip --tier do` (`do`)
and `rollback` (`blob`) in the repository and committed with the push that changes the
environment. The version before the patch is `gt-follow.sh.before-cloudflare`. The start line of
the loop names the realtime rows, the Worker folder and the paths that deploy it.
