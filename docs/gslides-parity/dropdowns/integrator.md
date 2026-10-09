# Dropdowns, the integrator

The integrator of the dropdown round (key IntegratorDD) wrote this file on 2026-10-08 from 19:54 to
21:50 PDT in `/Users/kevinliu/repos/Turboslide-dropdown` on `dropdowns/round`. Read first:
`docs/DROPDOWNS.md`, the bodies of the round's nine commits and `~/.config/turboslide/gt-follow.sh`
(the production guard, read and never edited; none of its `.env` files was opened). Nothing was
pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not
read. Loads are one minute load averages, 49 to 125 through this pass from other sessions' jobs
(never stopped), so no timing below is a verdict; counts, boxes and attributes do not move with load.

## 1. The state at the start

- `dropdowns/round` stood at `e564bf79`: nine commits over `0d3920a3` (DD-spec, DD-C#1, DD-C#2,
  DD-S1#1 to #3, DD-S2#1 to #3). The checkout held two untracked pictures at its root,
  `diag-grant.png` and `diag-grant-open.png`, a lane's diagnostics; they were left in place and
  never committed. No git, build or e2e lock was held.
- `origin/main` stood at `71c3556d`, 17 commits over `0d3920a3`: the favicon pair `e521bcf2` and
  `c77ada1a`, and the 15 commits of the security hotfixes H1 to H4 (`8be64284` to `71c3556d`). It did
  not move again while this pass ran (fetched at 19:54, 20:13, 20:22 and 21:41).
- The lanes left: the lint's allow list (DD-C#2), the tokens.css select rule that
  `packages/theme/src/scale.test.ts` pinned (DD-C#2), the typography composite's Align and Columns,
  which `set()` could no longer clear (DD-S2#3), the stale names of the removed files, the notes of
  lanes S1 and S2, and the release entry.

## 2. The integrator's commits

| Commit (rebased) | Before the rebase | What |
| --- | --- | --- |
| `9aa0b202` | `c8862630` | The native select lint enforces on the whole tree: `NATIVE_SELECT_ALLOWED`, `isAllowedNativeSelect` and `staleNativeSelectAllowances` leave, the tree case is `expect(scanNativeSelects(ROOT)).toEqual([])`, and the server render case of `select.test.tsx` parses the HTML for a select element instead of searching the text for `<select`. The scan read 0 findings before the change, so no allowance was in use |
| `95064542` | `5f66d377` | The `.pt-select, .ts-dialog select` rule of `packages/chrome/src/tokens.css` and its three state rules leave (47 lines); `scale.test.ts` asserts the corner on `Select.css`'s `.ts-dropdown-trigger` |
| `af20a137` | `c8dedb14` | `inspector/typography.tsx` draws an optional short field as `SelectControl` (the dropdown with its None row) and a required one as `SegControl`. Every typography field is optional, so Align and Columns are dropdowns, and `set('t: Align', '')` clicks None and writes the object without the field. One new case in `inspector-sections.test.tsx` (fails without the change). This follows the rule S2 gave every other optional field of four or fewer values (DROPDOWNS.md 4.1, question 4) |
| `be11355b` | `f0ae441e` | `packages/chrome/PORTED_FROM.json` loses the record of the removed `src/inspector/select.css` and records the tokens.css edit; `scripts/tooltip-audit.mjs` loses `.ts-native-mirror` |
| `023661c9` | `80b91a28` | `build/S1.md` and `build/S2.md`, written from the lanes' commit bodies |
| `c20d80a0` | `7217bcef` | The entry "2026-10-08, the dropdown round" at the head of `docs/updates.md` |
| `6853afb7` | (after the rebase) | `chrome.select.every-site` reads `/dev/auth` only where the server opens it (section 5) |
| this file | | `integrator.md` |

## 3. The rebase and the conflicts

`git -c rerere.enabled=false rebase origin/main` under `.turboslide/git.lock`, with the head before
it kept as the local branch `dropdowns/round-prerebase` (`7217bcef`). It stopped nowhere. Five files
changed on both sides, and git merged each:

| File | `main`'s change | The round's change |
| --- | --- | --- |
| `packages/chrome/src/dialogs/Share.tsx` | `accessViewOfRecord`: `claimable` only for `via === 'admin'` (H3, DATA-V3) | the five selects as `Select`, `grantWhoOf` for the person row |
| `packages/chrome/src/__tests__/share-dialog.test.tsx` | the claim cases for admin, open and no `via` | the dropdown cases and the person row's payload |
| `apps/studio/src/editor/EditorRoot.tsx` | `claimable` only for `payload.via === 'admin'` | the `SelectSlot.Provider` around the stage editor |
| `apps/studio/src/routes/decks.index.tsx` | `gtBrandDeckId` removed, the server names the copy (H3, DATA-V1) | the sort and the admin's filter as `Select` |
| `apps/studio/e2e/charts.spec.ts` | `DRAFT_ID` with 26 base32 characters | the legend through `chooseOption` |

Checks: the lines the round adds and removes, `git diff 0d3920a3 dropdowns/round-prerebase` against
`git diff origin/main dropdowns/round`, are equal line for line for the whole branch and for each of
the five files; `main`'s lines are in the head (`options.via === 'admin'`, `payload.via ===
'admin'`, no `gtBrandDeckId`, the 26 character `DRAFT_ID`). The native select scan of the rebased
tree reads 0 findings, so none of `main`'s 17 commits brought a select or a `selectOption` call.
Every commit of the branch is authored and committed by `kevin@generaltranslation.com`.

The lane commits on the rebased branch: DD-spec `694c7360` is `6f3ed0aa`, DD-C#1 `0e0a5752` is
`607fefa6`, DD-C#2 `a5ad73bb` is `87e2d8f6`, DD-S1#1 `09bbfe43` is `b3e04906`, DD-S1#2 `ffec8360`
is `d31955a5`, DD-S1#3 `9786ac89` is `51e6e215`, DD-S2#1 `4da5a7a2` is `b0dff129`, DD-S2#2
`43303f1f` is `ebedf0eb`, DD-S2#3 `e564bf79` is `860b32c4`.

## 4. The gates

The branch's readings are of `c20d80a0`, the rebased head before `6853afb7` (which changes a row's
driver and the matrix only, neither in the build) and before this file. `main`'s readings are of a
scratch worktree of `origin/main` at `71c3556d`
(`scratchpad/dd-int-base`, `pnpm install --frozen-lockfile --offline`, removed at 21:42).

| Gate | Branch | `main` |
| --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 in 199 s (load 51); again after `6853afb7`, exit 0 in 52 s (load 73) | not run |
| Unit, `vitest run --testTimeout=120000` of chrome, viewer, `@turboslide/lint`, `@turboslide/theme`, `@turboslide/agent` and studio | 331 files, 3,251 passed, 1 skipped, 2 todo, 0 failed, 11 min (load 49 to 80): chrome 112 files 1,060 passed, viewer 56 and 549, lint 17 and 142, theme 9 and 161, agent 13 and 274, studio 124 and 1,065 | not run |
| Brand lint, `main.ts --enforce` | exit 0: 572 scripts, 121 stylesheets, 6 HTML and SVG files and 26 mood pictures read; 0 open, 22 accepted, 0 stale | not run |
| Competitor guard; the native select lint | 9 passed; 6 passed. With `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs` and `evidence-policy.test.mjs`: 6 files, 74 passed. `what-works.mjs --check`: current | not run |
| Prettier | the 108 text files the round changes against `origin/main`: clean; `6853afb7`'s two files: clean | not run |
| `git grep -n "<select" -- '*.tsx'`; `git grep -nE "\.selectOptions?\("` outside `docs/` | nothing; only the lint test's own fixture strings | not run |
| `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` | exit 0 in 64 s (load 53 to 56) | exit 0 in 94 s (load 58 to 59) |
| `scripts/check-client-bundle.mjs apps/studio/.output --server apps/studio/.output/server --base http://localhost:4790 --client apps/studio/.output/public` | exit 1 on the same three lines as `main`. Largest chunk `EditorRoot` 519,070 B (600,000), `vendor` 516,305, `Slideshow` 490,378. Preloads: `/decks` 694,099 B in 12 chunks (600,000), `/signin` 519,760, `/deck/gt-brand` 531,064, `/edit/gt-brand` 1,042,176 (2,000,000), `/docs` 616,379 (450,000) | exit 1: the `.output/client` form line, `/decks` over and `/docs` over. Largest chunk `EditorRoot` 519,419 B, `vendor` 515,804, `Slideshow` 491,746. Preloads: `/decks` 686,908 B in 11 chunks, `/signin` 519,259, `/deck/gt-brand` 530,637, `/edit/gt-brand` 1,042,098, `/docs` 615,878 |

The bundle: `/decks` gains 7,191 B and one chunk (the dropdown with `place()`, DROPDOWNS.md 3.14),
over a ceiling `main` is already over; the other routes move by 78 to 501 B; no route crosses a
ceiling it held on `main`.

## 5. The rows on the node-server builds

Both builds were served on port 4790 from the checkout's root with production's settings:
`TURBOSLIDE_ROOT` the checkout, `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/int-overlay`,
`TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-int.sqlite`, `TURBOSLIDE_MAIL=capture`,
the fake Google pair, session and download secrets of 48 characters made once per build into a
mode 600 file and never printed, `TURBOSLIDE_LOCAL_OPEN` and `TURBOSLIDE_AUTH_RATE_LIMIT` unset, and
`TURBOSLIDE_BUILD_COMMIT` the commit (the stamp the guard's deploy sets). The overlay and the
identity database were removed at each start. The guard's commands were run as it runs them,
without its token wrapper, which carries production's bearer: the smoke `node
scripts/hosted-smoke.mjs --base <origin> --token-env TURBOSLIDE_TOKEN`, the walk `core-gate.mjs
--only probe --areas decks,text,fonts,versions`, the specs `--only specs --rows` of its nine rows,
each with `--parked docs/gslides-parity/focus/ship-4300058d.json` (its newest ship list). The
three realtime rows were not run: the guard joins them only on a deployment whose environment
selects the `do` tier.

| Run | Branch (`c20d80a0`) | `main` (`71c3556d`) |
| --- | --- | --- |
| The smoke | 39 of 41 (load 74 to 77). Red: "json asset attachment" (the node server serves the seed deck's asset as a static file without the deck route's headers) and "deck.info snapshots" (the Blob store's row; no bearer). `/home` passed, "build commit" served `c20d80a0` | 39 of 41 (load 61 to 65), the same two rows red; "build commit" served `71c3556d` |
| The walk, decks, text, fonts and versions | 128 passed, 1 failed, 2 not driven, 0 no step, 976 s (load 75 to 106). Failed: `versions.show-changes-marks`, parked by the ship list. Not driven: `text.clipboard.paste-without-formatting` (manual) and `fonts.table.takes-family` (a standing row of the guard). The guard reads it green | 128 passed, 1 failed, 2 not driven, 0 no step, 654 s (load 55 to 67). The 131 rows' results equal the branch's row for row |
| The nine spec rows | 9 passed, 350 s (load 60 to 104) | 9 passed, 290 s (load 52 to 55) |
| The eight dropdown rows (`core/chrome.spec.ts`) | run 1: 6 passed, 2 failed (below); the two read again: 2 passed; run 2 of all eight: 8 passed, zero retries, 362 s (load 58 to 78) | the rows' driver is not on `main`; the matrix records them broken there (Kevin's screenshot) |
| `apps/studio/e2e/enforce.spec.ts` | `authz.new-deck-id` and `authz.stranger-refused` passed; `authz.signed-in-creator` red on "the captured code" (null), so the four serial rows after it did not run. Read again with the identity tables made before the start: the same. The four by `--grep`: `authz.link-grants`, `authz.ticket-role` and `authz.anonymous-creator` passed, `authz.no-record` red on the same captured code | fresh database: 2 passed, `authz.signed-in-creator` red, 4 not run; again with the tables made first: the same; the four by `--grep`: 3 passed, `authz.no-record` red |

The reds, each read again:

- `chrome.select.every-site`, run 1: red on one surface alone, "/dev/auth: locator.waitFor: Timeout
  60000ms exceeded". The auth gallery answers 404 unless `TURBOSLIDE_LOCAL_OPEN=1`
  (`dev.auth.tsx` `galleryOpen`), as on production; every other surface passed. `6853afb7` makes the
  row record "/dev/auth: closed on this server (404), not read" and go on; it then passed twice. On
  those runs the row read the typography Align and Columns dropdowns of `af20a137` among Format
  options' fields.
- `chrome.select.agent-set`, run 1: "formatOptions.table.border.weight: one write", revision 16 to
  16, with the trigger reading 2. The trace does not show the write answered before the test ended,
  a few seconds after the `set()`. It passed on the reread (16 to 17) and in run 2 of all eight (16 to 17).
  Not reproduced; recorded as open below.
- `enforce.spec.ts`: identical on both builds, so not this round's. On a node-server build the boot
  logs "[Better Auth]: Database schema mismatch, Missing tables user, session, account, verification,
  deviceCode" on a fresh identity database, and a magic link request answers `{"status":true}` with
  no row in `ts_mail` and no server log line, also after the tables were made beforehand from the
  checkout's own modules (`migrateAuthDb` and `migrateBetterAuth`, the boot's two steps). Production
  runs its accounts on D1 (`TURBOSLIDE_ACCOUNTS=d1`), which this local run does not reach.
- A first branch server also carried a `TURBOSLIDE_TOKEN` of its own: the smoke read 40 of 42 (the
  same two rows red) and the walk read `fonts.agent.font-list` and `fonts.field.own-face` red on
  HTTP 401, because the walk's toolkit sends no bearer to localhost. That server was not production's
  list, so it was restarted without the variable and every row above was read on the second one; the
  first readings are superseded.

## 6. Open

1. `enforce.spec.ts` on a node-server build with an SQLite identity database: no captured sign in
   mail, so `authz.signed-in-creator` and `authz.no-record` are red on `main` and on this branch
   alike (section 5). For the hardening round's owners.
2. `chrome.select.agent-set` red once in run 1 (no write after `set()` on the table's border
   weight), then green twice. If it is read red again, the trace of run 1 is the place to start.
3. `/decks` preloads 694,099 B against a 600,000 B ceiling (686,908 B on `main`); `/docs` 616,379
   against 450,000 (615,878 on `main`).
4. `apps/cli` `banner.test.ts`: the CLI carries 2026.1001.3 while `docs/updates.md` now gives
   2026.1008.3 (2026.1008.2 on `main`, red there for the same reason). Not changed here.
5. From the lanes (`build/S1.md`, `build/S2.md`), older than this round: `share.spec.ts` opens a
   context with no base address and `roles.spec.ts` looks for the link rows outside More; the
   Insert > Chart placement of `charts.spec.ts` (y 129 for 180); two `window-api.spec.ts` tests on a
   tmp store; the inspector's scroll anchoring after a shader change can close a list opened in that
   moment (`Select.tsx`).
6. The typography composite draws its Font field (`family`) as a stepper through the font ids, as
   before this round; seen while changing Align and Columns, not changed.

## 7. Verdict

The head to ship is the commit that adds this file, on `origin/main` `71c3556d`. Ready: every row
that passes on `main` passes on the branch (the smoke's 39 rows, the walk's 131 rows row for row,
the nine spec rows, and the five enforce rows that pass on `main`), the unit tests of the six
packages pass, and nothing functional regressed; the eight dropdown rows passed together with zero
retries on the build with production's settings.
