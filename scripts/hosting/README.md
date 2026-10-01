# The hosting setup of the realtime round

The scripts and files under `scripts/hosting/` set up production for the realtime round (`docs/REALTIME.md` sections 3.7, 3.8 and 4.5): the variables the redis tier and Google sign in need on the General Translation team's Vercel project `turboslide-gt`, in the order that never breaks a deployment, and the production guard's reading of them. Nothing here installs a Marketplace product, creates a resource, changes DNS or touches a Google console: those are Kevin's steps (REALTIME.md 4.5; `docs/hosting.md` section 11's account boundary), and every command below names them when they are missing. The runbook a reader follows is `docs/hosting.md` section 9.2 to 9.4; this page is the reference of the tools.

## `realtime-env.mjs`

`node scripts/hosting/realtime-env.mjs <subcommand> [options]`, from a repository root linked to `turboslide-gt` (`.vercel/project.json` names the project; `/Users/kevinliu/repos/Turboslide-vector` is the guard's). It sets variables with `vercel env add <NAME> <environment> --sensitive --yes --scope general-translation` and the value on stdin, reads values from 600 files under `~/.config/turboslide/`, and prints names and environments only: no value reaches the command line, the output or a log, and the Vercel CLI's own output is scrubbed of every value it was given before a line of it is shown.

| Subcommand | REALTIME.md     | Reads                                                                                    | Sets                                                                                                                                                                        |
| ---------- | --------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`   |                 | `vercel env ls` per environment; the three files' modes and keys; the expectation        | nothing                                                                                                                                                                     |
| `redis`    | 4.5 step 1      | requires `REDIS_URL` on production and preview (Kevin's Upstash install)                 | nothing; reports the `UPSTASH_REDIS_REST_*` pair                                                                                                                            |
| `database` | 4.5 step 2      | requires `DATABASE_URL` (Kevin's Neon install); `better-auth.env`                        | mints `BETTER_AUTH_SECRET_PRODUCTION` and `BETTER_AUTH_SECRET_PREVIEW` into `better-auth.env` with `openssl rand -hex 32` when absent; `BETTER_AUTH_SECRET` per environment |
| `google`   | 4.5 step 4      | `google-oauth.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); requires `DATABASE_URL` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURBOSLIDE_ADMIN_EMAILS` per environment                                                                                       |
| `mail`     | 4.5 step 5      | `mail.env` (`RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`); absent means nothing to do        | both on each environment; removes the forced `TURBOSLIDE_MAIL` on production so the pair selects `resend`; `TURBOSLIDE_MAIL=capture` on preview                             |
| `flip`     | 4.5 step 7, 3.7 | requires `REDIS_URL`                                                                     | removes `TURBOSLIDE_REALTIME` on production and preview so `REDIS_URL` selects `redis` (default 7.9); writes `production.json` to `redis`                                   |
| `rollback` | 3.8             |                                                                                          | `TURBOSLIDE_REALTIME=blob` on production and preview (`--force`); writes `production.json` to `blob`                                                                        |

Options: `--dry-run` prints what the command would read, mint, set and remove and never runs `vercel` (the realtime round ran the dry run alone; the first real run is Kevin's step 7); `--environments production,preview` narrows (both by default); `--force` replaces a variable that is already present (otherwise a present variable is skipped by name; rotation is `docs/security.md` section 9's runbook); `--admin-emails <a,b>` overrides the `TURBOSLIDE_ADMIN_EMAILS` value (the default is `kevin@generaltranslation.com`, REALTIME.md 4.5 step 4; `google-oauth.env` may carry it as a key); `--scope`, `--project`, `--cwd` and `--config-dir` move the defaults (`general-translation`, `turboslide-gt`, the current directory, `~/.config/turboslide`). Exit 0 when done or nothing to do, 1 when a precondition is absent (the output names the Kevin step), 2 on usage or a refusal.

The rules the script holds:

- The linked project of `--cwd` must be `--project` (`turboslide-gt`); a real run from another root refuses before any read, a dry run says so and goes on. `turboslide.vercel.app` (the personal project) gets nothing by default 7.6.
- A file is read only when its mode lets nobody else read it (600 or stricter); a looser mode is refused with the `chmod 600` to run. The files and their keys: `google-oauth.env` (`GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`, optionally `TURBOSLIDE_ADMIN_EMAILS=`; Kevin writes it, `design-google-login.md` section 8 line 6), `mail.env` (`RESEND_API_KEY=`, `TURBOSLIDE_MAIL_FROM=`; Kevin writes it if he wants the email method), `better-auth.env` (`BETTER_AUTH_SECRET_PRODUCTION=`, `BETTER_AUTH_SECRET_PREVIEW=`; the script mints them). One value per environment, as `docs/security.md` section 12 asks.
- The value travels as the child's stdin and nowhere else; `VERCEL_OIDC_TOKEN` is removed from the child's environment, as the guard does.
- `redis` and `database` set nothing Kevin's install does not provide; they read `vercel env ls <environment> --json` (the `key` of every row; the JSON carries no value for a sensitive or encrypted row) and stop with exit 1 and the step's sentence when the variable is absent.

`realtime-env.test.mjs` drives the parsers, the plan of every subcommand, the dry run (no `vercel` call), a real run against a fake `vercel` on `PATH` (the value's bytes arrive on stdin and never in `argv`; no value in the output), the private mode rule and the linked project refusal; `node_modules/.bin/vitest run --project scripts scripts/hosting` runs it.

## `production.json`

The tree's expectation of production's realtime tier: `{ "realtime": "blob" | "redis" }`. The guard reads it from the checked out sha before its production deploy (below); `flip` writes `redis` and `rollback` writes `blob`, and the file is committed with the push that changes the environment, so a tree always says which tier production selects after that push. A missing or unreadable file reads as `blob`, the tier a deployment without `REDIS_URL` selects on its own (`packages/realtime/src/select.ts` 80 to 87), so every sha before this round behaves as today.

## The guard patch

`docs/gslides-parity/realtime/build/guard.patch` is a unified diff against `~/.config/turboslide/gt-follow.sh` as it read on 2026-10-01 10:49 PDT (23,938 bytes, the version with the docs-only rule; `sha256` prefix `a3b6f5d305773fe7`). It is applied by the ship step, never by a lane, after R5's push is deployed (the three row ids exist in the matrix from then on) and before R1's push (the first one that makes the redis tier reachable on a preview):

```sh
cd ~/.config/turboslide
cp gt-follow.sh gt-follow.sh.before-realtime
patch -p0 --dry-run < /Users/kevinliu/repos/Turboslide-realtime/docs/gslides-parity/realtime/build/guard.patch
patch -p0 < /Users/kevinliu/repos/Turboslide-realtime/docs/gslides-parity/realtime/build/guard.patch
bash -n gt-follow.sh
[ -d gt-follow.lock ] && echo "a pass is in flight; wait" || { pkill -f gt-follow.sh; (nohup ~/.config/turboslide/gt-follow.sh > /dev/null 2>&1 &); }
tail -1 gt-follow.log
```

The dry run says whether the hunks still fit a guard edited after that date; a rejected hunk means the guard is re-read and the patch rewritten, never forced. The `README.md` beside the guard gains the section the patch's header names (the same text as below), by hand, after the apply.

What the patch changes, in the guard's own words:

1. `REALTIME_ROWS=realtime.title.two-typers,realtime.caret.within-300ms,realtime.join.chip-within-1s` beside `SPEC_ROWS`, and a start line that names them.
2. `env_names <environment>` (the `key` of every row of `vercel env ls <environment> --json --scope general-translation` from the worktree, never a value), `has_env_name <environment> <NAME>` (0 present, 1 absent, 2 unreadable), `tree_expects` (the `realtime` word of the checked out sha's `scripts/hosting/production.json`, `blob` when absent) and `spec_rows_for <origin>`: the spec rows for a check are `SPEC_ROWS`, plus `REALTIME_ROWS` only when the tree's matrix carries the first id and the deployment's environment names (`preview` for a preview deployment, `production` for a `--check` of production) carry `REDIS_URL`; otherwise the rows are skipped and the log says why (`realtime rows skipped: REDIS_URL absent from the preview environment names`, `not in the tree's matrix`, or `the preview environment names could not be read`).
3. `check()` runs the spec step over `spec_rows_for`'s rows and logs the note; the timing rerun narrows to the red ids as today, so a realtime row red once on a reason that reads as timing is rerun once narrowed and red twice holds.
4. `pass()` step 4, before the production deploy: when `tree_expects` is `redis` and `REDIS_URL` is absent from the production environment names, the sha is held with the reason (`the tree expects the redis tier (scripts/hosting/production.json) and REDIS_URL is absent from the production environment names; nothing deployed to production`); the environment names unreadable is an error (retried on the next poll, held after three). `--retry <sha>` clears the hold once Kevin's install lands.

The patch adds no new command to the loop's dependencies: `vercel`, `node` and `grep` are what it already calls. Its tests are `bash docs/gslides-parity/realtime/build/guard-patch-check.sh [<path to the guard>]`, whose readings are recorded in `build/r6.md`: `patch -p0 --dry-run` and the apply on a copy, `bash -n` on the result, and the four helpers sourced from the patched copy and run against a fake `vercel` on `PATH` and a fake worktree (the expectation file absent, `redis`, `blob` and malformed; the matrix id absent and present; `REDIS_URL` present, absent, an empty list and a failing CLI; the production origin), each reading by its exit code and its note. The ship step runs it once more against the guard as it reads on the day before the apply. The text the guard's own `README.md` gains after the apply is `build/guard-readme-section.md`.
