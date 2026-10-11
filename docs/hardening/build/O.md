# Lane O, operations: wave 2 build notes

The lane's wave 2 pushes of `docs/hardening/HARDENING.md` (4.8, 5): HR-O#1a (#47) and HR-O#1b
(#48), RELIABILITY-13 (no backup of the deck store and no restore drill), CRIT-M7 (one cron
credential, a bounded and resumable job, a monthly drill) and the export rule of CRIT-M5. The
worktree is `/Users/kevinliu/repos/Turboslide-harden` on `harden/wave2`, made from `origin/main`
`f7e97039`, shared with the other wave 2 lanes. Kevin's steps these pushes waited on are done:
`turboslide-backup` is connected to Production as `TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN`, and
he approved the backups and the weekly accounts export (kept in `~/.config/turboslide/backups` on
the encrypted disk, the newest eight, never uploaded).

## The commits

| Push    | Commit      | What                                                                                                                                                                                                                                                                                                                                                            | Ships                                                                            |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| HR-O#1a | `cc96c8357` | `server/cron.ts` (the one cron credential; the logo refresh asks it), `packages/store/src/copy.ts` (the copy moved out of `scripts/blob-copy.mjs`, with a deadline, `replaceDiffering` and two adapters), `server/backup.ts` and `GET /api/cron/backup` (the nightly copy into `backup/<yyyy-mm-dd>/`), the cron `*/10 3-5 * * *`, `docs/hosting.md` section 14 | now                                                                              |
| HR-O#1b | `fb83742e1` | `runRestoreDrill` in `server/backup.ts` and `GET /api/cron/restore-drill` (`0 6 1 * *`), `scripts/restore-drill.mjs`, `scripts/hosting/d1-export.mjs` and its test, `docs/hardening/build/guard-d1-export.patch`, `docs/hosting.md` section 15                                                                                                                  | now; the guard patch is applied after the push is on production (requests below) |

## What each push does

HR-O#1a. Every night from 03:00 to 05:59 UTC a Vercel cron calls `GET /api/cron/backup` every ten
minutes with `CRON_SECRET`. One call copies for at most 240 s from the deployment's own client
(the public store before K1's cutover, both stores during its dual read window, the private store
after) into the private store `turboslide-backup`: per deck `deck.json` first, then `access.json`,
`slides/`, `versions/`, `snapshots/` and `comments/`; then `users/` and `links/`. The cursor
`backup/<day>/cursor.json` is written after every deck, `done.json` once the day is whole, a
failed object is tried once more at once, 30 dated folders are kept and the newest complete one
whatever its age. The store to store copy is one module, `packages/store/src/copy.ts`, which
`scripts/blob-copy.mjs` now imports (Node's type stripping), and the script resolves `@vercel/blob`
from `packages/store/package.json` (CLEANUP-10's import).

HR-O#1b. On the first of every month at 06:00 UTC `GET /api/cron/restore-drill` restores one deck,
chosen by the date, from the newest complete night into a scratch id in a folder of the function
instance, reads it through the store as an instance reads a deck it has not mirrored, checks five
things against the backup (the manifest's bytes, the snapshot it names present and byte equal, the
document validates, the document is that snapshot), removes the folder and writes
`backup/drills/<yyyy-mm>.json`. `scripts/restore-drill.mjs` runs the same by hand. The weekly
accounts export is `scripts/hosting/d1-export.mjs`, which the guard runs between passes through
`guard-d1-export.patch`: `wrangler d1 export turboslide-accounts --remote` with `--table` for the
eight tables of the spec and none of the seven it forbids, into
`~/.config/turboslide/backups/accounts-<yyyy-mm-dd>.sql` (file 600, folder 700), the newest eight
kept, once a week, a failed run retried after six hours.

## Readings

Every timing below is a record, read at the one minute load beside it; the verdicts are status
codes, counts and bytes. The local server ran from `apps/studio` on port 4861 with
`TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/O-overlay`, `TURBOSLIDE_REALTIME=memory`,
`TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-O.sqlite`,
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, test values of the session and
download secrets and of `CRON_SECRET`, and `TURBOSLIDE_BACKUP_DIR=.turboslide/O-backup-rehearsal`.
Neither push is a security push, so gate 6 does not apply.

| Reading                                                                                                                                                                                                                                                                                                                                                  | Result                                                                                                                                                                                                                                                                                      | Load            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `packages/store/src/copy.test.ts` (the deadline, `replaceDiffering`, the adapters) and `scripts/blob-copy.test.mjs` over the moved module                                                                                                                                                                                                                | 3 of 3 and 12 of 12                                                                                                                                                                                                                                                                         | 85              |
| `apps/studio/src/server/backup.test.ts`: a night cut into calls by an 8 ms budget on a store whose puts move the clock resumes from the cursor and ends with every kept document byte equal and nothing else copied; a deck committed between two calls is copied again with the snapshot its manifest names; the prune; the client by either token name | 5 of 5                                                                                                                                                                                                                                                                                      | 73 to 88        |
| `apps/studio/src/server/cron-backup.test.ts` with `logos.test.ts`                                                                                                                                                                                                                                                                                        | 47 of 47: no secret, a wrong one and one of equal length 401; no secret on the project 401; 503 names the variables and no token; the night with the secret 200 `done`, then `was-done`                                                                                                     | 350             |
| `GET /api/cron/backup` on 4861                                                                                                                                                                                                                                                                                                                           | no bearer 401, a wrong one 401, an equal length wrong one 401, the secret 503 "the backup reads the Blob store, and this deployment runs the tmp store"; a POST falls through to the app shell (200 HTML), as every GET-only route does                                                     | 205 to 285      |
| `tsc -b packages/store apps/studio` after O#1a                                                                                                                                                                                                                                                                                                           | exit 0 (64 s incremental); the first run, 1,048 s, found one type error in a phase comparison, fixed before the commit                                                                                                                                                                      | 220 to 360      |
| `packages/store` suite after O#1a                                                                                                                                                                                                                                                                                                                        | 23 files, 289 passed, 1 skipped                                                                                                                                                                                                                                                             | 186 to 197      |
| `apps/studio` suite after O#1a                                                                                                                                                                                                                                                                                                                           | 1,193 of 1,209; the 16 red rerun with a 60 s timeout: 15 pass (the 5 s timeouts of the load), and `blob-admission.test.ts`'s resend case stays red on RT's uncommitted edits of that test, `room.ts` and `room-core.ts`; no file of lane O is on its path                                   | 270; 128 to 142 |
| `vercel blob get-store` of `turboslide-backup` (names and settings only)                                                                                                                                                                                                                                                                                 | Access: Private, region `iad1`, 0 objects, connected to `turboslide-gt`                                                                                                                                                                                                                     |                 |
| `apps/studio/src/server/restore-drill.test.ts` with `backup.test.ts`                                                                                                                                                                                                                                                                                     | 11 of 11: the drill restores, reads, passes the five checks, removes its folder and writes the record; `keep` and `record: false`; a backup without the snapshot fails with `snapshotPresent`; no complete night fails with its sentence; the route 401, 503, 500 with the reason, then 200 | 147             |
| The rehearsal on the repository's `decks/gt-brand` (folder stores, Node's type stripping): two commits, one night of `runBackup`                                                                                                                                                                                                                         | `done` in one call, 1 deck, 99 objects, 1,466,708 bytes, 1,748 ms                                                                                                                                                                                                                           | 141             |
| `TURBOSLIDE_BACKUP_DIR=<that folder> node scripts/restore-drill.mjs`                                                                                                                                                                                                                                                                                     | `gt-brand` restored as `drill-20261011-a7cbdd9d`, 98 objects, revision 27, snapshot `9947e59aba475222c851ff4b23ebb531`, the five checks true, 3,512 ms, exit 0; exit 2 without a store and on `--day 2026-1-1`                                                                              | 131             |
| `GET /api/cron/restore-drill` on 4861 over that night                                                                                                                                                                                                                                                                                                    | no bearer 401; the secret 200, `ok: true`, the five checks true, 2.3 s, `backup/drills/2026-10.json` written; no `turboslide-drill-*` folder left in the temp folder                                                                                                                        | 110 to 118      |
| `scripts/hosting/d1-export.test.mjs` over a fake wrangler                                                                                                                                                                                                                                                                                                | 6 of 6: the command line and the eight tables, none of the seven forbidden; mode 600 in a folder of 700; a week between exports; the newest eight kept; a failure prints no token, leaves no file and waits; a dry run runs nothing                                                         | 82              |
| The patched guard step in a sandbox: the function from the patched copy of `gt-follow.sh` over a checkout copy whose wrangler is a fake                                                                                                                                                                                                                  | the first call wrote `accounts-2026-10-11.sql` (600, folder 700) and logged one line; the fake saw the eight tables, the account id in its environment and `apps/realtime-worker`; the second call ran nothing and logged nothing                                                           | 118             |
| `patch -p1 --dry-run` of `guard-d1-export.patch` on a copy of `gt-follow.sh` (sha256 `eb8b5c6b2444f0f8...` on 2026-10-11), and `bash -n` of the patched copy                                                                                                                                                                                             | applies cleanly; syntax ok                                                                                                                                                                                                                                                                  |                 |
| `fdesetup status` (question 30)                                                                                                                                                                                                                                                                                                                          | FileVault is On                                                                                                                                                                                                                                                                             |                 |
| `tsc -b packages/store apps/studio` after O#1b                                                                                                                                                                                                                                                                                                           | exit 0, 165 s                                                                                                                                                                                                                                                                               | 104 to 82       |
| `scripts/hosting/d1-export.test.mjs` with `scripts/blob-copy.test.mjs` after O#1b                                                                                                                                                                                                                                                                        | 18 of 18                                                                                                                                                                                                                                                                                    | 82              |
| `apps/studio` suite after O#1b                                                                                                                                                                                                                                                                                                                           | 1,210 of 1,218; the 8 red are 5 s timeouts of the load in five files (`agent-comments`, `agent-gate`, `authorize`, `comment-stand-ins`, `version-stand-ins`), 48 of 48 when rerun with a 120 s timeout                                                                                      | 199; 119 to 191 |
| Brand lint enforce, competitor guard, `core-matrix`, `what-works` and `docs-index` tests, `what-works --check`, Prettier on every file of both pushes                                                                                                                                                                                                    | 0 open findings (the lint exits 1 on one stale acceptance of `packages/chrome/src/dialogs/ImportSlides.tsx` in `packages/lint/src/brand/config.ts`, files neither push touches); 62 of 62; README current; formatted                                                                        | 98              |

## Where the pushes leave the spec

- `links/` is in the backup beside the spec's list: the link hash index, 477 objects and 36 KB on
  2026-09-20 (`docs/HOSTING-MOVE.md` 1.3), without which a restored deck's share links would not
  open. The `.turboslide/` copies under `users/` are left out, as under `decks/`.
- The drill restores into a folder of the function instance and never into the live documents
  store, so a drill that fails half way leaves nothing behind on production. The comparison reads
  the scratch deck through `openBlobStore`, the read every instance makes.
- The pin "the first drill's reading on the preview" cannot be taken: the backup store is
  connected to Production alone, so the preview has no backup and its routes answer 503. The
  reading in `docs/hosting.md` 15 is the checkout's rehearsal; the store's first night is the
  first 03:00 UTC after HR-O#1a deploys, and its first drill is 2026-11-01 06:00 UTC unless Kevin
  runs `scripts/restore-drill.mjs` by hand before.
- The backup store sits in `iad1`, the region of the documents stores; question 4's default named
  another region. A region outage takes both; R2 is the later answer the spec names.
- `docs/hosting.md` sections 14 and 15 are new sections at the end of the file, ahead of K1#6
  (#25, held for Kevin's production cutover), which edits section 10; the two do not overlap.

## Requests

- **To the orchestrator (question 5).** Apply `docs/hardening/build/guard-d1-export.patch` to
  `~/.config/turboslide/gt-follow.sh` after HR-O#1b is on production, so the guard checkout holds
  `scripts/hosting/d1-export.mjs`: `patch -p1 --dry-run -d ~/.config/turboslide <
docs/hardening/build/guard-d1-export.patch`, then the same without `--dry-run`, then restart the
  loop between passes (the lock absent). The patch was made against the file's state on
  2026-10-11 (sha256 prefix `eb8b5c6b2444f0f8`); it adds the function `accounts_export`, one block
  in the loop and a usage paragraph, and touches no other step. The first export runs on the first
  idle poll after the restart and logs `accounts export: wrote accounts-<day>.sql (...)`.
- **To the orchestrator, after HR-O#1a's first night (2026-10-12).** Read the function log for
  `turboslide backup:` between 03:00 and 06:00 UTC, or the counts with `vercel blob get-store
store_SVvM4JXypZvINPtb --scope general-translation`: a 500 there names the failing object, and
  a 503 means the token is not in the production environment.
- **To O (HR-O#3) and the orchestrator.** The alert should read `backup/<day>/done.json` (absent at
  06:00 UTC, or `failedCount` above 0) and `backup/drills/<yyyy-mm>.json` (`ok: false`, with
  `reason`); until O#3 both are lines at error in the function's log.
- **To Kevin, through the orchestrator.** Two gaps this round leaves on purpose: the twins are not
  in the backup (a deck restored after `deck.remove` comes back without its pictures; a content
  addressed `backup/twins/` copied once per digest would close it for about 0.5 GB), and there is
  no command that writes a restored deck back into the documents store (`--keep` gives the folder).
- **To RT.** `apps/studio/src/server/blob-admission.test.ts`'s case "answers a resent op id from the
  record above its base that names it" is red in the shared tree on your uncommitted edits
  (read 2026-10-11 18:31 UTC).
- **To the ship step.** `cc96c8357` sits on HR-RT#1 (`2b72f85c7`) and `fb83742e1` on HR-RC#10
  (`f3e0461bc`) in `harden/wave2`. Their files are disjoint from every RT and RC push, and each
  applies cleanly onto `origin/main` `f7e97039` in order (`git merge-tree` with the commit's parent
  as the base, read 2026-10-11 19:00 UTC), so they can ship by themselves at #47 and #48 or
  earlier. HR-O#1a adds a cron; production's logo cron (`updatedAt` 2026-10-11T06:00:27Z on
  `/api/logo/search`) shows the project reads `apps/studio/vercel.json`'s crons.
