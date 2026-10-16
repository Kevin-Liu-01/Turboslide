# Lane O, operations: wave 3c build notes

Running notes (a restart continues from here). Worktree `/Users/kevinliu/repos/Turboslide-harden5`,
branch `harden/wave3c` from `origin/main` `8c9465b6`. Ports: studio 4868, Worker 8868. Dev server
script: `scratchpad/o3c/dev.sh` (the task's settings, `-c vite.no-watch.config.ts`, test secrets
minted per start). Edit scripts for the shared Worker files, applied under the git lock at commit
time: `scratchpad/o3c/apply-o3-index.py` (index.ts) and `apply-o4-control.py` (control.ts).

## Restart of 2026-10-15 17:30Z

The Mac rebooted after the first run (2026-10-12); `scratchpad/o3c/` is gone (dev.sh, the two
apply scripts, `client-errors.o2c.ts`). The tree keeps every file of the lane, none committed.
Rebuilt in `scratchpad/o3c/`. `origin/main` is `0ee4e86c` (19 GF commits, none in the lane's
files); waves 3a and 3b and K1#4b are on their branches, not on `origin/main`. RT restarted at
17:28Z with RT#13 and RT#18 not started, so O#3 and O#4 (index.ts, control.ts) wait.

## Restart of 2026-10-16 00:28Z

The second run stopped at about 23:30Z (Kevin's chat message restarted the agents). It left
`scratchpad/o3c/` whole and nothing committed. Its last readings: `tsc -b` 20:54Z to 21:42Z
(load 519 to 612), no error in the O#2 files, four in O#3 and O#4 files (`@turboslide/report/alert`
unresolved in `watch.ts` and `test/alert.test.ts` until `apply-o3-packages.py` runs, and a
self-referencing `typeof fetch` in `flags.test.ts`, now `typeof globalThis.fetch`). The shared
`scratchpad/tsc.lock` was made 23:30Z by wave 3b's integrator (`hr3b-int2/tsc-head.sh`, its push 2
ended 23:30Z) and no process held it at 00:31Z. Someone cleared it and the restarted integrator
took it again at 00:36:57Z (its push 3, `cf8678aa`); this lane, reading the old check, removed the
live lock at about 00:43Z and made it again within seconds (the `mkdir` succeeded, so no one else
took it in the gap). The integrator's trap removes it when its tsc ends. Lesson kept: check the
lock's time again right before touching it, and never remove a lock; wait.
RT has committed nothing (RT#10 and RT#11 in the tree), so O#3 and O#4 still wait on RT#13 and
RT#18 in `git log`.

## Restart of 2026-10-16 02:16Z

The third run committed HR-O#2a `514bd6872`, HR-O#2b `e3cb2bfa8` and HR-O#2c `544583d6b`
(01:28Z to 01:33Z, messages from `scratchpad/o3c/msg-o2*.txt`) and stopped before it noted them.
`scratchpad/o3c/` is whole. RT has still committed nothing (RT#13 and RT#18 in the tree), so O#3
and O#4 wait. To keep the tree RT commits from clean (its `tsc -b` and Worker suite read lane O's
`watch.ts` and `alert.test.ts` without their package link, and `switches.test.ts` before O#4's
control.ts rule), the three Worker files are parked in `.turboslide/o3c-park/{src,test}/` (ignored)
since 02:20Z and are moved back under the git lock at O#3's and O#4's commits.

## Finish run of 2026-10-16 02:23Z

Kevin's order of 2026-10-16: build and commit, no test runs, no servers, no waiting. HR-O#3 and
HR-O#4 no longer wait on RT#13 and RT#18 in `git log`: `index.ts`, `test/health.test.ts` and
`control.ts` hold RT's uncommitted hunks in the tree, so each commit stages HEAD's version of the
file with lane O's hunks alone (`git update-index --cacheinfo` of a HEAD copy the apply scripts
edited in `scratchpad/o3c/head/`) and applies the same hunks to the tree, where RT's hunks stay for
RT's own commits. O#3 and O#4 therefore land before RT#13 and RT#18 in history (section 4.13's
order for `index.ts` and `control.ts` was RT#13, RT#18, O#3, O#4); the hunks touch no line of
RT's. The parked Worker files are back in the tree and committed.

- HR-O#3 `3f4a0eba6`. Compile checks over the tree: `tsc -p packages/report` exit 0;
  `tsc -p apps/studio --noEmit` exit 0 (02:32Z to 02:34Z, load about 130);
  `tsc -p apps/realtime-worker --noEmit` exit 0 (02:36Z to 02:41Z, load 295).
- HR-O#4 `1f596eed6`. `tsc -p apps/realtime-worker --noEmit` exit 0 (02:47Z to 02:51Z, load 150 to 265) with the control.ts rule and `test/switches.test.ts`; the studio's check above covers
  `flags.ts`. `db-statements.json` needs no entry: the switches go through the bearer route
  `/control/flags`, whose SQL is the Worker's own, not `/db`.
- Lane O's wave 3c pushes are all committed: O#2a `514bd6872`, O#2b `e3cb2bfa8`, O#2c `544583d6b`,
  O#3 `3f4a0eba6`, O#4 `1f596eed6`. Ship notes: O#2c's migration `0006_reports.sql` runs on preview
  and production before its deploy; O#3's mail needs `alert.env` put on both Workers with
  `realtime-env.mjs worker-secrets` (the key is in place per the orchestrator).
- Not run in this pass: the lane's vitest suites (Worker `alert.test.ts`, `switches.test.ts`,
  `health-check.test.ts`, `flags.test.ts`, `packages/report`). They are the integrator's.

## Plan and state

- HR-O#2a the reporter: `packages/report` (scrubber, line shape), `/api/x/errors`
  (`server/client-errors.ts`). Built, tests green, readings taken; `isCodeName` added after the
  O#2c reading (a one word title). Commit waits on the shared tsc lock (held by the wave 3a and
  3b integrators' per head sweeps, about 70 min a head at load 300 to 800). Commit messages in
  `scratchpad/o3c/msg-o2a.txt`, `msg-o2b.txt`, `msg-o2c.txt` (`TSC_LINE` to fill).
- HR-O#2b the browser: `apps/studio/src/report-errors.ts`, `router.tsx` (`defaultOnCatch`,
  `installErrorReporter`). Built, unit test green, browser reading taken. Merges cleanly with
  wave 3b's PC#2 change of `router.tsx` (`git merge-file`, 0 conflicts).
- HR-O#2c the counts: `server/reports.ts`, migration `0006_reports.sql` (0005 is HR-SA#3's
  `0005_limits.sql` in wave 3a), `db-statements.json`, the recorder's case, the count in
  `client-errors.ts` (applied in the tree; the O#2a versions of `client-errors.ts` and its test
  are `scratchpad/o3c/client-errors.o2a.ts` and `client-errors.test.o2a.ts`, swapped in under the
  git lock for the O#2a commit) and in `x.csp.$.ts`. Built, readings taken.
- HR-O#3 health and the alert: `packages/report/src/alert.ts`, `apps/realtime-worker/src/watch.ts`
  (`alertsHealth`; no write when a row is unchanged), `server/health-check.ts`,
  `routes/api/health.ts`, `realtime-env.mjs` worker-secrets, `test/alert.test.ts`. The shared
  hunks are scripts applied under the git lock at commit time: `scratchpad/o3c/apply-o3-index.py`
  (index.ts: import, `HealthBody.alerts`, `health()`, `scheduled`; `test/health.test.ts`'s
  expected body) and `apply-o3-packages.py` (the Worker's dependency, tsconfig reference, lock
  entry, `./alert` export, the `node_modules` link; after O#2c commits). Waits on RT#13 and
  RT#18 in git log (RT has their index.ts hunks in the tree, uncommitted, at 12:22 local).
- HR-O#4 the kill switches: `flags.ts` (`workerFlagStore`), the control.ts value rule
  (`scratchpad/o3c/apply-o4-control.py`), `test/switches.test.ts` (new). Waits on O#3. The two
  process reading over a local D1 is taken.

## Reproductions on origin/main (8c9465b6)

- RELIABILITY-14: `git grep` over `apps/studio/src`, `packages/chrome/src`, `packages/viewer/src`
  finds no `window` error or `unhandledrejection` listener (one `img` load listener in
  ImportSlides.tsx); `apps/studio/src/routes/api/` has no `x.errors` route; no `onCatch` in the
  studio; `server/health.ts` answers a marker and the Node version, no store or database read.
- RELIABILITY-15: `bindFlags(` has no caller outside tests, so every hosted instance reads its own
  `flags.json`.

## Readings

| Reading                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                        | Load       |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/report` tests (scrub, line)                                                                                            | 17 of 17                                                                                                                                                                                                                                                                                                                      | 337        |
| `client-errors.test.ts` (O#2a route)                                                                                             | 5 of 5: 204 and one scrubbed line with the build and no address; 413 by declared length and by bytes; 400; the 31st line of one address 429, another address 204; past 300 a minute one in ten logged with `sampled: 10`                                                                                                      | 471        |
| `POST /api/x/errors` on 4868                                                                                                     | a line with deck text, an address and a bearer: 204, logged as `"message":"TypeError: cannot draw \"…\" for <address> Bearer <token>"`, route `/deck/$`, the stack's query gone; 5 KB 413; `hello` 400; `sec-fetch-site: cross-site` 403 (the CSRF filter); one address: 27 more 204 then 429 (30 a minute, bad bodies count) | 584 to 612 |
| `report-errors.test.ts` (O#2b handler)                                                                                           | 5 of 5                                                                                                                                                                                                                                                                                                                        | 387        |
| Browser on 4868 (Playwright, chromium): an uncaught error, an unhandled rejection, the same error again, then `/edit/Not_A_Slug` | three posts: `error` scrubbed (`"…"`, `<address>`), `rejection` (`<id>`), no repeat; `route` with route `/edit/$deckId` and `Error: deckId must be a slug`; 204                                                                                                                                                               | 494 to 577 |
| Brand lint enforce                                                                                                               | 0 open findings; exit 1 on the stale acceptance of `ImportSlides.tsx` (as on origin/main)                                                                                                                                                                                                                                     | 500        |
| `core-matrix`, `what-works`, `docs-index` tests; `what-works --check`; competitor guard                                          | 53 of 53, current, 9 of 9 with a 300 s test timeout (the 5 s default timed out at load 500)                                                                                                                                                                                                                                   | 490 to 540 |
| `realtime-env.test.mjs` with the alert secrets tests                                                                             | 49 of 49                                                                                                                                                                                                                                                                                                                      | 518        |

Readings after the restart (2026-10-15):

| Reading                                                                                                                                                                                                    | Result                                                                                                                                                                                                                                             | Load |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| The lane's unit tests (`packages/report`, `client-errors`, `report-errors`, `reports`, `health-check`, `flags`)                                                                                            | 8 files, 55 of 55                                                                                                                                                                                                                                  | 239  |
| Brand lint enforce                                                                                                                                                                                         | 0 open findings; exit 1 on the stale acceptance of `ImportSlides.tsx`, as on `origin/main`                                                                                                                                                         | 191  |
| Competitor guard, `core-matrix`, `what-works`, `docs-index` tests; `what-works --check`                                                                                                                    | 62 of 62; current                                                                                                                                                                                                                                  | 227  |
| Worker `test/reports.test.ts` (O#2c over the test D1 with 0006 applied)                                                                                                                                    | 2 of 2                                                                                                                                                                                                                                             | 837  |
| `wrangler d1 migrations apply turboslide-accounts --local`                                                                                                                                                 | 0001 to 0004 and 0006 apply in order                                                                                                                                                                                                               | 230  |
| `GET /api/health` on 4868 (O#3)                                                                                                                                                                            | public `{"ok":true,"commit":null}` 200, `no-store`; with the room bearer the checks (store `gt-brand` 9 ms, accounts `sqlite` 3 ms, backup and drill null); a wrong bearer reads the public answer                                                 | 434  |
| `POST /api/x/errors` on 4868                                                                                                                                                                               | 204; logged `"route":"/deck/$","message":"TypeError: cannot draw \"…\" for <address>"`, the stack's query gone                                                                                                                                     | 434  |
| O#2c on 4868 (route count applied): `ts_reports` before the first report, then three error lines and one CSP report                                                                                        | before: no table; after: four rows of count 1 (`csp /deck/$ script-src-elem evil.example`, two `error /deck/$` keys, `rejection /decks Error: lost`); no address, query or deck title in a row except the one below                                | 191  |
| The same reading found `"Board"` kept in a key: a capitalized one word title matched the code name rule                                                                                                    | `isCodeName` in scrub.ts now keeps one character or a code shape (lowercase, `_` or `$` start; `.`, `-`, `_`, `$` or a digit inside; an inner capital); `"Board"` goes, `"DeckRoom"` and `'length'` stay; scrub tests and the route tests 31 of 31 | 191  |
| `client-errors`, `reports`, `record-statements` tests with the count                                                                                                                                       | 19 of 19 with a 300 s test timeout (3 record-statements cases time out at the 5 s default at load 304)                                                                                                                                             | 332  |
| O#4, two node processes over one local D1 (wrangler dev on 8868, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8868`): the reader reads `readOnly`, the writer runs `setFlag('readOnly', false)`, the reader reads again | first read `true` (no row), the row `off`, the reader read `false` 3,873 ms after the write                                                                                                                                                        | 230  |

## The row HR-0 enters for HR-O#2b

`chrome.error.reported` (feature `chrome`, driver `core/chrome.spec.ts`, today `broken`, severity 2,
note starting "Hardening (docs/hardening/HARDENING.md 8), HR-O#2b"). HR-0 is not on `origin/main`,
so no row enters in wave 3c (1.3 item 9); the push is pinned by `report-errors.test.ts`. The body
read on the lane's server (the Playwright reading above), for HR-0 to enter:

```ts
test('chrome.error.reported', async ({ page }) => {
  // a route whose loader refuses: the router's catch posts one scrubbed line
  const posted = page.waitForRequest(
    (request) => request.url().endsWith('/api/x/errors') && request.method() === 'POST',
  );
  await page.goto('/edit/Not_A_Slug');
  const line = JSON.parse((await posted).postData() ?? '{}') as Record<string, unknown>;
  expect(line).toMatchObject({ kind: 'route', route: '/edit/$deckId' });
  expect(String(line['message'])).toContain('must be a slug');
  // an uncaught error with deck text and an address reaches the route scrubbed
  const second = page.waitForRequest((request) => request.url().endsWith('/api/x/errors'));
  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError('cannot draw "Q3 plan" for someone@example.test');
    }, 0);
  });
  const scrubbed = JSON.parse((await second).postData() ?? '{}') as Record<string, unknown>;
  expect(scrubbed['message']).toBe('TypeError: cannot draw "…" for <address>');
});
```
