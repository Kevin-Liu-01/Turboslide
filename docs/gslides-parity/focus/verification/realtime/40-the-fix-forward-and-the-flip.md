# Realtime round, the fix forward and the flip (2026-10-04)

The closeout of the realtime round, on the worktree `/Users/kevinliu/repos/Turboslide-realtime` (branch `realtime/closeout` from `origin/main` at `eba01af4`, with the production table's commit `5f9222d0` cherry-picked onto it). It records what reached `main` and production after the stop of the production table above: the join fix on the blob tier (`b1737654`), the flip of production to the do tier (`ce2e5411`) and the fix forward of the link grant (`eba01af4`). Times are UTC on 2026-10-04. The readings are the guard's (`~/.config/turboslide/gt-follow.log` and its folders under `~/.config/turboslide/guard/`) and the orchestrator's. Each ledger cited here is copied under `focus/verification/realtime-ship-production/` with the name given in FF.11. This closeout drove no row. It read the two Workers' `/health` once each.

## FF.1 Verdict

Production serves `eba01af4` on the do tier since 18:41:49Z. The production Worker `turboslide-realtime` answered `/health` at 18:46:59Z with `ok` true, `commit` `eba01af4ee94714d72d0adb81a229f27fb393402`, `realtime` on, `appOrigin` `https://www.turboslide.com` and `callbacks` ok. The preview Worker answered the same commit at 18:48:27Z with the guard's last preview as its `appOrigin`.

- The stop of the production table was `collab.presence.join-within-2s` on the blob tier. Its cause is the blob tier's pulse tick, which is older than the round (FF.2). The join fix `b1737654` read 2 of 5 on production's blob tier. After the flip `ce2e5411` the same row read 5 of 5 on production's do tier.
- The guard's production realtime rows read 1 of 3 at `ce2e5411` and 2 of 2 on the once rerun of the two red rows. They read 3 of 3 at `eba01af4`.
- `realtime.join.chip-within-1s` read 2 of 5 in the orchestrator's readings at `ce2e5411`. Each red was B landing in viewing mode by an editor link minted seconds before. The fix forward `eba01af4` carries the link's grant across the exchange's redirect in a sealed cookie (FF.7).
- The orchestrator's readings after `eba01af4` had not started by 20:14Z, because the load stayed over 24 (FF.8).
- What stays open is in FF.9.

## FF.2 The join defect on the blob tier

The cause, from the commit message of `b1737654`. On the blob tier the joiner's first roster row travelled from instance to instance through the shared presence record. The tab's first presence POST set the row on whichever instance the platform sent it to. The instance that held the first tab's stream read the row only at its next pulse tick. That tick came 2 s after the joiner's stream woke the instance, or up to 10 s later when the instance's one tab was alone and quiet. The accounts path was not the cause. The production table's comparison readings (PT.5) put the delay between B's hello and A's roster, and on the previews of R2 and R3 the row crossed its bound more often than on `deac61a1` and R1.

The fix. The stream route builds the joiner's roster entry from the identity, role and roster it already holds for hello and hands it to the shared roster as a join row (`presence-store.ts` `join`). The row is published at once to the tabs that stream on that instance. One case stays open on the blob tier. When the joiner's stream and its first POST both land on instances other than the first tab's, that instance learns of the joiner at its next quiet tick, up to 10 s. The commit names a faster quiet tick or the do tier's socket as the two ways to close it.

The commit's own readings, on the preview `turboslide-o3pffyqpx` (production's variables, the same tree), the row alone at loads 4.3 to 10.6: 16 of the 18 joins measured were within the 3,500 ms bound. j8 read B at 10,397 ms, which is the open case above. j5 read C at 3,725 ms after C's first stream open answered 500 (a Vercel Blob get 403 on a just written file). Before the fix the commit records `7d5f961c` red 5 of 10 on a preview of production's variables and production at `5ce68a72` red 4 of 5.

## FF.3 The readings at `b1737654`

The guard deployed `b1737654` at 15:54:19Z: smoke 42/42; walk 127 2 2 0 in 713 s (the standing `decks.file.open-list-search` and `fonts.table.takes-family`); specs 9 0 0 0 in 306 s, with the realtime rows skipped because the tree expected the blob tier; check 1053 s; load 10.01; production smoke 42/42. Google sign in is back on production since this push; it was there before from R4's deploy at 10:16:44Z to the rollback at 12:11:54Z. The orchestrator read the Sign in click on production reaching Google's account picker with `redirect_uri` `https://www.turboslide.com/api/auth/callback/google`.

The orchestrator then read the join row five times on production, which served the blob tier (`scripts/hosting/production.json` `blob` and the forced `TURBOSLIDE_REALTIME=blob` row): `core-gate.mjs --base https://www.turboslide.com --only specs --rows collab.presence.join-within-2s --tier blob`. The bound is 3,500 ms from B's navigation. The load was not recorded for these five runs.

| Run | Start     | Length | Result | B's chip          | Ledger                         |
| --- | --------- | ------ | ------ | ----------------- | ------------------------------ |
| 1   | 15:55:15Z | 92 s   | passed | not in the ledger | `join-blob-b1737654-run1.json` |
| 2   | 15:56:47Z | 91 s   | failed | 10,401 ms         | `join-blob-b1737654-run2.json` |
| 3   | 15:58:18Z | 85 s   | failed | 7,919 ms          | `join-blob-b1737654-run3.json` |
| 4   | 15:59:43Z | 111 s  | failed | 9,422 ms          | `join-blob-b1737654-run4.json` |
| 5   | 16:01:34Z | 55 s   | passed | not in the ledger | `join-blob-b1737654-run5.json` |

Each red failed the step "B's chip within 2 s of the join". The row read 2 of 5 on the blob tier with the fix on production.

The flip's gate (CLOUDFLARE.md 5.5 item 1) was the local two process do run at `b1737654`. Two node servers of the node-server build ran on `http://localhost:4561` and `http://localhost:4562` over one tmp store, with the Worker under `wrangler dev` on 8761 and a local D1, `TURBOSLIDE_AUTHORIZE=enforce` and `TURBOSLIDE_ACCOUNTS=d1`. `core-gate.mjs --only realtime --tier do` started at 16:10:58Z and took 335 s at a load of 20.50 at the start and 16.87 at the end: 16 rows, 16 passed, 0 failed, 0 not driven, retries zero (`local-do-b1737654.json`).

## FF.4 The flip `ce2e5411`

From the commit message. `node scripts/hosting/realtime-env.mjs flip --tier do --environments production` removed the forced blob row from turboslide-gt's production environment and wrote `scripts/hosting/production.json` to `do`. `TURBOSLIDE_ROOM_HOST`, `TURBOSLIDE_ROOM_SECRET` and `TURBOSLIDE_ROOM_BEARER` were present on production. The preview environment keeps its forced row, because the object cannot call a protected preview back without the automation bypass (CLOUDFLARE.md 5.5 item 2; Kevin's K6 in docs/NEXT.md). The guard's item 8, patched in on 2026-10-04, therefore skips the realtime rows on the preview. It reads them against production after the promote, reruns a red run once and promotes the previous deployment back on a red twice.

The guard's lines for `ce2e5411`:

| Time      | Line                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16:18:53Z | main moved to `ce2e5411` (last `b1737654`); deploying a preview                                                                                                                                                                                                                                                                                                   |
| 16:20:36Z | the preview `turboslide-1u2b5cmjx` deployed                                                                                                                                                                                                                                                                                                                       |
| 16:20:43Z | the preview Worker deployed: `/health ok true commit ce2e541129f702debc64344c2e4710a83de2213c realtime on appOrigin https://turboslide-1u2b5cmjx-general-translation.vercel.app`                                                                                                                                                                                  |
| 16:32:58Z | realtime rows skipped on the preview: the forced `TURBOSLIDE_REALTIME` row stands on the preview environment                                                                                                                                                                                                                                                      |
| 16:37:58Z | `TURBOSLIDE_ROOM_HOST is among the production environment names and the tree expects the do tier; deploying ce2e541129f702debc64344c2e4710a83de2213c to production`                                                                                                                                                                                               |
| 16:38:04Z | `deployed Worker turboslide-realtime.kk23907751.workers.dev for ce2e541129f702debc64344c2e4710a83de2213c (/health ok true commit ce2e541129f702debc64344c2e4710a83de2213c realtime on appOrigin https://www.turboslide.com)`                                                                                                                                      |
| 16:44:15Z | `deployed ce2e541129f702debc64344c2e4710a83de2213c (exit 0)`; promoted as `turboslide-nh1qq8m3k` after a green check: smoke 42/42; walk 127 2 2 0 in 696 s; specs 9 0 0 0 in 299 s; check 1034 s; load 21.07; production smoke 42/42; production realtime 1 2 0 0 in 138 s; rerun of `realtime.title.two-typers`, `realtime.join.chip-within-1s`: 2 0 0 0 in 78 s |

The guard's `/health` line carries no `callbacks` field, because the guard does not read it. This closeout's own read at 18:46:59Z answered `callbacks` ok at `eba01af4` (FF.1).

## FF.5 The production realtime rows the guard read

The guard runs `realtime.title.two-typers`, `realtime.caret.within-300ms` and `realtime.join.chip-within-1s` against `https://www.turboslide.com` after the promote. The ledgers carry no load. The guard writes one load per check: 21.07 for `ce2e5411` and 47.88 for `eba01af4`.

| Commit and run             | Start     | Length | Row                            | Result | Reading                                                                                                                                                                                 |
| -------------------------- | --------- | ------ | ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ce2e5411`, the run        | 16:40:40Z | 137 s  | `realtime.caret.within-300ms`  | passed | B's caret in A 161 ms after B's first keystroke; moved 195 to 206 ms after keystrokes 2 to 10                                                                                           |
|                            |           |        | `realtime.title.two-typers`    | failed | at the driver's `joinB` step: B's editor read `data-edit-mode` "viewing" for 10 s after B opened the editor link                                                                        |
|                            |           |        | `realtime.join.chip-within-1s` | failed | the same step and the same reading                                                                                                                                                      |
| `ce2e5411`, the once rerun | 16:42:57Z | 78 s   | `realtime.title.two-typers`    | passed | both words in both browsers 11, 12 and 128 ms after the later Escape in rounds 1 to 3; each browser showed the other's words 161 to 347 ms after their keystrokes                       |
|                            |           |        | `realtime.join.chip-within-1s` | passed | B's chip in A 278, 449 and 538 ms and A's chip in B 167, 448 and 434 ms after B's editor was ready; both requests answered by one instance (`7b5699ed`); tier do; the object's colo IAD |
| `eba01af4`, the run        | 18:37:39Z | 250 s  | `realtime.caret.within-300ms`  | passed | B's caret in A 124 ms after B's first keystroke; moved 166 to 267 ms after keystrokes 2 to 10                                                                                           |
|                            |           |        | `realtime.title.two-typers`    | passed | both words in both browsers 96, 25 and 40 ms after the later Escape; each browser showed the other's words 226 to 356 ms after their keystrokes                                         |
|                            |           |        | `realtime.join.chip-within-1s` | passed | B's chip in A 934, 462 and 463 ms and A's chip in B 934, 461 and 462 ms after B's editor was ready; two instances (`50cd8516` and `bc4b7de7`); tier do; the object's colo IAD           |

The two reds at `ce2e5411` were the link landing defect of FF.7. The guard's rule reads a row red twice before it rolls back, and the rerun was green, so production stayed on `ce2e5411`.

## FF.6 The five readings at `ce2e5411`

The orchestrator read `collab.presence.join-within-2s` and `realtime.join.chip-within-1s` five times on production after the flip: `core-gate.mjs --base https://www.turboslide.com --only specs --rows collab.presence.join-within-2s,realtime.join.chip-within-1s`. The run named no tier, so the ledgers' `tier` field reads null; production served the do tier. The load is the one minute average at each start (`join-do-ce2e5411-summary.txt`).

| Run | Start     | Load at the start | Length | `collab.presence.join-within-2s` | `realtime.join.chip-within-1s` | Ledger                       |
| --- | --------- | ----------------- | ------ | -------------------------------- | ------------------------------ | ---------------------------- |
| 1   | 17:16:36Z | 20.80             | 123 s  | passed                           | passed                         | `join-do-ce2e5411-run1.json` |
| 2   | 17:18:39Z | 16.00             | 132 s  | passed                           | passed                         | `join-do-ce2e5411-run2.json` |
| 3   | 17:20:51Z | 17.87             | 96 s   | passed                           | failed                         | `join-do-ce2e5411-run3.json` |
| 4   | 17:22:27Z | 11.41             | 117 s  | passed                           | failed                         | `join-do-ce2e5411-run4.json` |
| 5   | 17:24:24Z | 11.10             | 118 s  | passed                           | failed                         | `join-do-ce2e5411-run5.json` |

`collab.presence.join-within-2s` read 5 of 5 on the do tier, against 2 of 5 on the blob tier at `b1737654`. `realtime.join.chip-within-1s` read 2 of 5. Each red failed at B's join: B's toolbar stayed View only (`data-edit-mode` "viewing") 10 s after B opened the editor link the run had just minted.

## FF.7 The fix forward `eba01af4`

The cause, from the commit message. B's `/edit` document in the failure trace carried role "viewer", via "open", over an access record with general access restricted and no links. The instance that served the landing decided on a record from before the mint: its 60 s record cache, or a Blob read behind the write. It could not see B's grant either, because the exchange wrote the grant on its own instance's principal record and on a deck index the next instance had not read. The do tier keeps the role the ticket was minted with, so the stale answer stuck. The commit also names the same step red on `7d5f961c`'s blob table before it.

The change. The 303 of a good exchange at `/s/<token>` sets the link grant cookie `__Host-ts_lg` (`ts_lg` on plain http off localhost). The cookie is sealed with the session secret under its own version `g1`, bound to the principal id, valid for 120 s and holds at most 8 grants. `authorize.ts` and `room.ts` union its grants with the record's and the index's, so the page, the ticket, the stream and the ops routes admit the visitor. `access.ts` `settleHeldLinks` re-reads a deck record that does not list a cookie grant's link past the cache, up to three times 250 ms apart. `decide()` still admits a grant only through a link the record lists, so a revoked link admits nobody.

The checks the commit names: `session.test.ts` and `access-record.test.ts` cases; apps/studio vitest 98 files, 773 tests; `tsc -b` exit 0. The local two process do run on the tree started at 17:35:18Z: 16 of 16, retries zero, 416 s, load 16.81 at the start and 17.52 at the end (`local-do-eba01af4-tree.json`; its `commit` field reads `ce2e5411`, the HEAD under the change before it was committed).

The guard's passage:

| Time                 | Line                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17:44:28Z            | main moved to `eba01af4` (last `ce2e5411`)                                                                                                                                                                                                                                                                                                          |
| 17:46:22Z            | the preview `turboslide-a6rbku4iu` deployed; its Worker at 17:46:31Z with `/health` answering `eba01af4`                                                                                                                                                                                                                                            |
| 18:04:20Z            | `held eba01af4ee94714d72d0adb81a229f27fb393402: walk: fonts.catalog.geist failed`; smoke 42/42; walk 127 2 2 0 in 704 s; specs 9 0 0 0 in 328 s; check 1069 s; load 22.63                                                                                                                                                                           |
| 18:05:21Z, 18:10:08Z | the orchestrator's two narrowed readings of the fonts and versions areas on that preview: 25 rows, 23 passed, 1 failed (the parked `versions.show-changes-marks`), 1 not driven (`fonts.table.takes-family`), in 226 s and 221 s; `fonts.catalog.geist` passed in both, at loads 15.68 and 19.09 (`held-eba01af4-narrowed-run1.json`, `-run2.json`) |
| 18:14:12Z            | `retry requested for eba01af4ee94714d72d0adb81a229f27fb393402: the hold and the attempts are cleared`                                                                                                                                                                                                                                               |
| 18:16:05Z            | the preview `turboslide-idv48vzj2` deployed; its Worker at 18:16:11Z with `/health` answering `eba01af4`                                                                                                                                                                                                                                            |
| 18:34:34Z            | `deployed Worker turboslide-realtime.kk23907751.workers.dev for eba01af4ee94714d72d0adb81a229f27fb393402 (/health ok true commit eba01af4ee94714d72d0adb81a229f27fb393402 realtime on appOrigin https://www.turboslide.com)`                                                                                                                        |
| 18:41:49Z            | `deployed eba01af4ee94714d72d0adb81a229f27fb393402 (exit 0)`; promoted as `turboslide-3s7affbel` after a green check: smoke 42/42; walk 127 2 2 0 in 713 s; specs 9 0 0 0 in 334 s; check 1087 s; load 47.88; production smoke 42/42; production realtime 3 0 0 0 in 251 s                                                                          |

The narrowed readings also listed `decks.file.open-list-search` as failed in their results. It is the guard's standing row and the gate does not count it.

## FF.8 The readings after `eba01af4`

Not read. The orchestrator's five runs of `collab.presence.join-within-2s`, `realtime.join.chip-within-1s` and `realtime.share-link.every-instance` against production each wait for a one minute load under 24 before they start. This closeout waited for the fifth run's line from 18:44Z to 20:14:23Z with a background loop polled every 60 s. At 20:14:23Z no run had started and no ledger or summary line existed. The one minute load in this closeout's polls read 45.93 to 180.87 over the wait (`uptime`). Runs 1 to 5 are not read. The production readings of `eba01af4` are therefore the guard's three rows of FF.5.

## FF.9 What is still open

- The blob tier's reload loss (P4-1, pass 4) does not apply while production serves the do tier. It returns with any rollback to the blob tier, together with the open join case of FF.2.
- The orchestrator's five readings after `eba01af4` (FF.8) are not read, so `realtime.share-link.every-instance` has no reading on production's do tier and `realtime.join.chip-within-1s` has the guard's one reading there.
- The preview has no automation bypass (Kevin's K6). The do tier's rows are read on the local two process run and on production after the promote. A red there costs one promote back.
- The production table of record on the do tier, `core-gate.mjs --base https://www.turboslide.com --only realtime --tier do`, was not run after the flip. The 13 realtime rows outside the guard's three were read on production only on the blob tier (PT.5). On the do tier they were read on the local two process runs: pass 4 (16 of 16), `b1737654` and the `eba01af4` tree (16 of 16 each).
- Kevin's standing row `sync.title.concurrent-both-kept` was last read on production at `7d5f961c` on the blob tier (green). It was not read on production's do tier.
- `accounts.google-roundtrip` is Kevin's hand row. It was not driven.
- The dashboard's daily counters (`setup.free-plan.caps`, `cost.do.duration`, `cost.worker.requests`) were not read, because the pipeline's OAuth scopes do not include Cloudflare analytics (PT.6).
- The guard's standing walk rows stay red or not driven: `decks.file.open-list-search` and `fonts.table.takes-family`. `fonts.catalog.geist` read red once on `eba01af4`'s first preview and green in the two narrowed readings and in the walk of the guard's second check.

## FF.10 The rollback

From CLOUDFLARE.md 3.8 and `scripts/hosting/realtime-env.mjs`, fastest first:

1. `node scripts/hosting/realtime-env.mjs do-flag off`: posts `/control/flags { realtime: 'off' }` to the Worker with no deploy. The Worker refuses upgrades with 4503 within 30 s, every awake object flushes its tail through the checkpoint route, and the tabs fall to the blob channel. `do-flag on` hands back.
2. `node scripts/hosting/realtime-env.mjs drain`, then `node scripts/hosting/realtime-env.mjs rollback`: the drain posts `/rooms/:id/flush` for every deck in `rt_open`; the rollback sets `TURBOSLIDE_REALTIME=blob` on production and preview and writes `scripts/hosting/production.json` to `blob`. The commit of that file is the push the guard deploys. The Worker stays deployed.
3. The guard's own rollback on a red twice promotes the previous production deployment back and redeploys the previous sha's Worker. Since `ce2e5411` the previous deployment also serves the do tier. The last production deployment built with the forced blob row is `turboslide-a3ijd927a` (`b1737654`).

## FF.11 The ledgers

Under `docs/gslides-parity/focus/verification/realtime-ship-production/`, each checked for token, cookie and bearer values before the copy:

- `guard-lines-fix-forward.txt`: the guard's log lines from 15:32:47Z to 18:41:49Z.
- `guard-realtime-production-ce2e5411.json`, `guard-realtime-production-ce2e5411-rerun.json`, `guard-realtime-production-eba01af4.json`, each with its Playwright report as `-specs.json`.
- `join-blob-b1737654-run1.json` to `-run5.json`.
- `local-do-b1737654.json`, `local-do-eba01af4-tree.json`.
- `join-do-ce2e5411-run1.json` to `-run5.json` and `join-do-ce2e5411-summary.txt`.
- `held-eba01af4-narrowed-run1.json`, `-run2.json` and `held-eba01af4-narrowed-summary.txt`.
  - No ledger of the readings after `eba01af4` exists (FF.8).

## FF.12 For Kevin

1. Production serves `eba01af4` on the do tier with Google sign in, Follow for every editor, the account menu's Sign out and the D1 accounts. The join chip came in within 2 s in five readings of five after the flip.
2. The preview stays on the blob tier until the automation bypass exists (K6). Until then every do tier reading on a deployment is a production reading after a promote.
3. The round trip with your Google account is your hand row (`accounts.google-roundtrip`).
