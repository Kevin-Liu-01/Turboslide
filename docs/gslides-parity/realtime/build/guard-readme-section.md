## 2026-10-0X: the realtime rows and the REDIS_URL check

(The section `~/.config/turboslide/README.md` gains after the ship step applies
`docs/gslides-parity/realtime/build/guard.patch`; the ship step writes the date and pastes it at
the end of that file. `scripts/hosting/README.md` "The guard patch" in the repository is the
reference.)

The realtime round (docs/REALTIME.md 5.4 item 3 in the repository) adds two readings to the loop:

- The spec rows of the check gain the three two browser rows `realtime.title.two-typers`,
  `realtime.caret.within-300ms` and `realtime.join.chip-within-1s` (`REALTIME_ROWS`), only when
  the checked out tree's matrix carries them and the deployment's environment names carry
  `REDIS_URL`: `preview` for the preview deployment the check runs against, `production` for a
  `--check https://www.turboslide.com`. The names are read through
  `vercel env ls <environment> --json --scope general-translation` from the worktree (the `key`
  of every row; the JSON carries no value for a sensitive or an encrypted row, so nothing here can
  print one). Otherwise the rows are skipped and the log says why: `realtime rows skipped:
REDIS_URL absent from the preview environment names`, `not in the tree's matrix`, or `the preview
environment names could not be read (vercel env ls)`. The note also rides the numbers line of the
  `promoted` and `held` lines. A realtime row red on a reason that reads as timing is rerun once
  narrowed like any spec row; red twice holds.
- Before the production deploy of a green sha, the loop reads the tree's expectation of the tier,
  `scripts/hosting/production.json` (`realtime: redis | blob`; absent reads as `blob`). A tree that
  expects `redis` is held while `REDIS_URL` is absent from the production environment names, with
  the line `held <sha>: the tree expects the redis tier (scripts/hosting/production.json) and
REDIS_URL is absent from the production environment names; nothing deployed to production`; the
  names unreadable is an error (retried on the next poll, held after three). `gt-follow.sh --retry
<sha>` clears the hold once the Upstash install has landed. The file is written by
  `node scripts/hosting/realtime-env.mjs flip` (`redis`) and `rollback` (`blob`) in the repository
  and committed with the push that changes the environment.

The version before the patch is `gt-follow.sh.before-realtime`. The start line of the loop names
the realtime rows beside the spec rows.
