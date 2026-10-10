# Dropdowns, the integrator

The integrator of the dropdown round (key IntegratorDD) wrote this file on 2026-10-08 from 19:54 to
21:50 PDT in `/Users/kevinliu/repos/Turboslide-dropdown` on `dropdowns/round`. Read first:
`docs/DROPDOWNS.md`, the bodies of the round's nine commits and `~/.config/turboslide/gt-follow.sh`
(the production guard, read and never edited; none of its `.env` files was opened). Nothing was
pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not
read. Loads are one minute load averages, 49 to 125 through this pass from other sessions' jobs
(never stopped), so no timing below is a verdict; counts, boxes and attributes do not move with load.

Sections 1 to 7 are the first pass, on `931f69d8`. Section 8 is the second pass, after fix round 1
(`51ca68df` to `8b5988b1`), written on 2026-10-09 from 10:49 to 11:40 PDT. Section 9 is the third
pass, after fix round 2 (`fb6ddc18`), written on 2026-10-09 from 13:58 to 14:55 PDT. Section 10 is
the fourth pass, after fix round 3 (`e260e96c`), written on 2026-10-09 from 16:43 to 18:15 PDT; its
verdict replaces the earlier ones. Section 11 records DD-fix#9 (`5142310c`), written on 2026-10-10
from 04:40 to 05:15 PDT after the keyboard verifier's final pass 3 found F1 (severity 2); it gives
no verdict, and the ship waits for the next pass.

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

## 7. Verdict of the first pass

Replaced by section 8.6. The head to ship was the commit that adds this file, on `origin/main`
`71c3556d`. Ready: every row
that passes on `main` passes on the branch (the smoke's 39 rows, the walk's 131 rows row for row,
the nine spec rows, and the five enforce rows that pass on `main`), the unit tests of the six
packages pass, and nothing functional regressed; the eight dropdown rows passed together with zero
retries on the build with production's settings.

## 8. The second pass, after fix round 1

The integrator wrote this section on 2026-10-09 from 10:49 to 11:40 PDT. Nothing was pushed or
deployed, no Vercel, Cloudflare, GitHub or Google setting changed, production was not read, and none
of the guard's `.env` files was opened. Loads are one minute load averages, 58 to 98 through this
pass, so no timing below is a verdict.

### 8.1 The state at the start

- `dropdowns/round` stood at `8b5988b1`: the first pass's head `931f69d8` and the six commits of fix
  round 1, written from the keyboard and assistive technology verifier's pass 1 on `931f69d8`
  (findings 1 to 6) and from item 2 of section 6. The branch holds 23 commits over `origin/main`, each
  authored and committed by `kevin@generaltranslation.com`.

  | Commit | What |
  | --- | --- |
  | `51ca68df` DD-fix#1 | A trigger disabled while it holds the focus keeps it (`aria-disabled`, no `disabled` attribute until the focus leaves); Tab with the list open keeps a focus the choice moved; Share's expiry choice gives the focus to the person's role field; a modal card gives a focus dropped to the body to the control at its place; `outsideOpenModal` keeps every key and clipboard event from outside an open modal dialog off the stage and the key table |
  | `0e375a3a` DD-fix#2 | Forced colours: the active option and the lit menu row take `Highlight` and `HighlightText`; a focused or open trigger draws a 2 px outline 1 px outside its border |
  | `8ed44447` DD-fix#3 | The listbox is named by its field (`aria-label`); an option's description is its description; a section with a heading is a named group, rows with none are the listbox's own; a placeholder's words are hidden from the tree |
  | `c48190c6` DD-fix#4 | A scroll the page makes leaves an open list on its trigger; after a wheel outside the list, a scroll that moves the trigger closes it |
  | `b16c9911` DD-fix#5 | `chrome.select.agent-set` waits for the revision to move, then reads it again 2 s later |
  | `8b5988b1` DD-fix#6 | `docs/DROPDOWNS.md` 3.2, 3.3, 3.5, 3.6 and 3.7 state the rules above |

- `origin/main` stood at `71c3556d`, fetched at 10:49 and 11:32 PDT. It did not move, so the branch
  was not rebased and `main`'s readings of sections 4 and 5 stand; this pass compares against the
  first pass's ledgers of `main` (`base-walk.json`, `base-specs.json`, `base-smoke.txt` in its scratch
  folder) row for row.
- No git, build or e2e lock was held and port 4790 was free. The two untracked pictures of section 1
  were still at the checkout's root and were left in place.

### 8.2 The fix round read in the code

- `outsideOpenModal` (`packages/viewer/src/Selection.tsx`) matches `[role="dialog"][aria-modal="true"]`
  outside `[hidden]`, `[inert]` and `[aria-hidden="true"]`. Every element that carries
  `aria-modal="true"` in `apps/studio/src` and `packages`: the chrome's `Dialog` card (only when
  modal), `Palette` (returns null while closed), `HelpCard` (its scrim takes `aria-hidden` while it
  closes), `PresentShortcuts`, and the docs' `SearchWindow` and `DocsShell` (outside the editor). None
  stays in the document while closed without one of those, so the stage's keys are held back only
  while a modal dialog is open.
- `useEditorKeys` handles Escape before the new check, so Escape from the body still closes the
  dialog. The modal card has `tabIndex={-1}`, so a press on the card's text focuses the card and the
  new focusout rule of `Dialog.tsx` does not move the focus.
- `packages/agent/src/window/controls.ts` line 65 reads `aria-disabled="true"` as disabled, so a
  trigger that keeps the focus during its write still refuses `set()`.

### 8.3 The gates

The branch's readings are of `8b5988b1`.

| Gate | Branch (`8b5988b1`) | First pass (`c20d80a0`) | `main` (`71c3556d`) |
| --- | --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 in 2 s (current by its build info); `tsc -b --force`: exit 0 in 468 s (load 58 to 61) | exit 0 in 199 s | not run |
| Unit, `vitest run --testTimeout=120000` | 332 files, 3,266 passed, 1 skipped, 2 todo, 0 failed, 411 s (load 63 to 87): chrome 112 files 1,072 passed, viewer 57 and 552, lint 17 and 142, theme 9 and 161, agent 13 and 274, studio 124 and 1,065 | 331 files, 3,251 passed | not run |
| Brand lint, `main.ts --enforce` | exit 0 (load 63): 572 scripts, 121 stylesheets, 6 HTML and SVG files, 26 mood pictures; 0 open, 22 accepted, 0 stale | the same | not run |
| Competitor guard and the native select lint; `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs`, `evidence-policy.test.mjs` | 2 files, 15 passed; 4 files, 59 passed. `what-works.mjs --check`: current | 6 files, 74 passed | not run |
| Prettier | the 115 text files the branch changes against `origin/main`: clean | 108 files: clean | not run |
| `git grep -n "<select" -- '*.tsx'`; `.selectOption(` calls | nothing; only the lint test's fixture strings | the same | not run |
| `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` | exit 0 in 40 s (load 85 to 80) | exit 0 in 64 s | exit 0 in 94 s |
| `scripts/check-client-bundle.mjs` | exit 1 on the same three lines as `main`. `EditorRoot` 519,107 B (600,000), `vendor` 516,305, `Slideshow` 490,708. Preloads: `/decks` 695,239 B in 12 chunks (600,000), `/signin` 519,760, `/deck/gt-brand` 531,064, `/edit/gt-brand` 1,042,213 (2,000,000), `/docs` 616,379 (450,000) | `/decks` 694,099, `/edit/gt-brand` 1,042,176, `EditorRoot` 519,070 | `/decks` 686,908 in 11 chunks, `/edit/gt-brand` 1,042,098, `EditorRoot` 519,419 |

The fix round adds 1,140 B to `/decks` and 37 B to `/edit/gt-brand`; against `main`, `/decks` gains
8,331 B and one chunk over a ceiling `main` is already over, and no route crosses a ceiling it held
on `main`.

### 8.4 The rows on the node-server build

The build of `8b5988b1` was served on port 4790 from the checkout's root with section 5's settings:
`TURBOSLIDE_ROOT` the checkout, `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/int-overlay`,
`TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-int.sqlite`,
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_BUILD_COMMIT` the full sha of `8b5988b1` (also at build time,
as the guard's deploy sets it), the fake Google pair, session and download secrets of 48 characters made once into
a mode 600 file and never printed, and `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and
`TURBOSLIDE_TOKEN` unset. The overlay and the identity database were removed at the start. The
guard's commands ran as it runs them, without its token wrapper, with `--parked
docs/gslides-parity/focus/ship-4300058d.json` (its newest ship list), one after another.

| Run | Branch (`8b5988b1`) | `main` (`71c3556d`, section 5) |
| --- | --- | --- |
| The smoke | 39 of 41 (load 71). Red: "json asset attachment" and "deck.info snapshots", the two rows red on `main` for the reasons of section 5. `/home` passed (3/3 marks); "build commit" served `8b5988b1` | 39 of 41, the same two rows red |
| The walk, decks, text, fonts and versions | 128 passed, 1 failed, 2 not driven, 0 no step, 657 s (load 69 to 76). The verdict's failures hold only `fonts.table.takes-family`, a standing row of the guard, so the guard reads it green; `versions.show-changes-marks` is parked by the ship list | 128, 1, 2, 0 in 654 s. The 131 rows' results equal the branch's row for row (0 differences) |
| The nine spec rows | 9 passed, zero retries, 258 s (load 76) | 9 passed |
| The eight dropdown rows | 8 passed, zero retries, 261 s (load 75 to 81) | the rows' driver is not on `main` |
| Rows of DROPDOWNS.md 7.3 that the fix round's dialog, Share and key changes reach: `chrome.layers.menu-over-dialog`, `share.dialog.new-deck-restricted-viewer`, `share.role-change.keeps-link`, `share.dialog.restricted-and-more`, `text.link.slide-target`, `export.print.download-pdf-follows-preview`, `brand.panel.words-match-sheet`, `themes.picker.lists-library`, `chrome.radius.controls` | 9 passed, zero retries, 263 s (load 88 to 98) | not read; none was red on the branch |

What the dropdown rows read:

- `chrome.select.every-site`: no `select` element on any surface; the contract held on /decks,
  /print, the Share dialog in both access modes, Download with More options, Insert link, More fonts,
  Publish to the web, Special characters, the Comments panel, the Theme panel, Format options of the
  line, table, chart and text box (with the typography Align and Columns), and the link popover;
  "/dev/auth: closed on this server (404), not read".
- `chrome.select.keyboard`: "Share choice by Enter: focused true, disabled attribute false, focused
  after the write true; after Tab inside true, after a blur inside true, after Tab, Shift+Tab,
  Delete, x inside true; behind the dialog: revision 16 to 16, selected dd-table to dd-table, table 1"
  (DD-fix#1); "Share Escape writes 0".
- `chrome.select.pointer`: the list 446 px wide under a 446 px trigger at the same left edge; one
  write on choosing, none on the open trigger or the sentence.
- `chrome.select.over-dialog`: the list on the popover layer in both appearances, each row first at
  its centre; the Download Fonts list whole.
- `chrome.select.placement`: Line end's list above its trigger, 288 px tall; "after a scroll of 40 px
  the page made" the list stayed open on its trigger (DD-fix#4).
- `chrome.select.phone`: at 390 the list 284 px wide under a 284 px trigger, no horizontal scroll,
  no `select` element, in both appearances.
- `chrome.select.look`: the trigger 32 px, radius 6 px, Inter with tabular figures; in forced colours
  the active option reads Highlight `rgba(5, 0, 73, 0.8)` with HighlightText `rgb(255, 255, 255)`,
  the chosen row's check 16 px, the ring solid 2 px with a 1 px offset, open and closed (DD-fix#2).
- `chrome.select.agent-set`: one write each way for General access; `set('dialog.share.mode',
  'public')` threw a `RangeError` naming the field and the value; the table's Border weight
  "revision 16 to 17" (DD-fix#5).

No dropdown row and no row the guard counts was red, so none was read again: the smoke's two red rows
and the parked walk row are the readings `main` gives. The server was stopped at 11:32 PDT and port
4790 is free.

### 8.5 Open after the second pass

1. Section 6 item 1 (`enforce.spec.ts` on an SQLite identity database) stands. It was not read
   again: the fix round changes no server or identity file.
2. Section 6 item 2 is closed in the driver. DD-fix#5 found that the driver's `settled()`
   (`apps/studio/e2e/core/lib.ts`) reads the realtime channel's pending count, which is 0 on the
   memory tier, so it returned before the table's write, which took about 3 s at a load of 60. The
   row read "revision 16 to 17" here. The slow table write at load is left as it is and recorded here.
3. The bundle: `/decks` 695,239 B against 600,000 (686,908 on `main`); `/docs` 616,379 against
   450,000 (the same on the first pass, 615,878 on `main`).
4. Section 6 item 4 (the CLI banner) stands; `apps/cli` is not among the six packages read here.
5. Section 6 item 5: the last case, a list opened during the inspector's scroll anchoring that
   closed by itself, is the case DD-fix#4 fixes. The other cases stand.
6. Section 6 item 6 (the typography Font stepper) stands.

### 8.6 Verdict

Replaced by section 9.6. Ready. The head to ship was the commit that adds this section (`97b2ecfb`),
on `origin/main` `71c3556d`; it
changes this file alone, which is not in the build, so the readings of `8b5988b1` hold for it. Every
row that passes on `main` passes on the branch (the smoke's 39 rows, the walk's 131 rows row for
row, the nine spec rows), the eight dropdown rows and nine rows of DROPDOWNS.md 7.3 passed with zero
retries on the build with production's settings, the unit tests of the six packages pass with 15
more than the first pass, and the brand lint, the competitor guard, the native select lint and
prettier are clean.

## 9. The third pass, after fix round 2

The integrator wrote this section on 2026-10-09 from 13:58 to 14:55 PDT. Nothing was pushed or
deployed, no Vercel, Cloudflare, GitHub or Google setting changed, production was not read, and none
of the guard's `.env` files was opened. Loads are one minute load averages, 23 to 180 through this
pass, so no timing below is a verdict.

### 9.1 The state at the start

- `dropdowns/round` stood at `fb6ddc18`: the second pass's head `97b2ecfb` and DD-fix#7, fix round
  2, written from the keyboard and assistive technology verifier's final pass 1 on `97b2ecfb` (its
  findings 1, 2 and 4). The visual verifier's final pass 1 on `97b2ecfb` read ready with five
  severity 1 findings. The branch holds 25 commits over `origin/main`, each authored and committed by
  `kevin@generaltranslation.com`.

  | Commit | What |
  | --- | --- |
  | `fb6ddc18` DD-fix#7 | While a modal dialog is open, no chord of the key table runs and the stage takes no key, from the body or from a control inside the card (`modalDialogOpen`, `packages/viewer/src/Selection.tsx`); outside a field, a Cmd or Ctrl chord the deck binds is prevented. A modal `Dialog` also gives back a dropped focus after each change of its own tree (a `MutationObserver`), because Firefox sends no `focusout` when the focused element leaves the document. A person's role field keeps the role as its value while the expiry field is open. `chrome.select.keyboard` gains the steps on the Share dialog's Done |

- `origin/main` stood at `71c3556d`. The first fetch at 13:58 failed on this machine's network
  ("Could not resolve host: github.com"); the retry and `git ls-remote` at 13:58, 14:14 and 14:33
  and the fetch at 14:46 read `71c3556d`. It did not move, so the branch was not rebased and
  `main`'s readings of sections 4 and 5 stand; this pass compares against the first pass's ledgers
  of `main` row for row.
- The checkout held four untracked files: the two pictures of section 1 and the two verifiers'
  notes in this folder, `verify-final-1-a11y.md` and `verify-final-1-visual.md`. They were left in
  place and not committed. No git, build or e2e lock was held, port 4790 was free, and no dev
  server ran from the checkout.

### 9.2 Fix round 2 read in the code

- `modalDialogOpen()` reads the query `outsideOpenModal` reads, so the list of section 8.2 stands:
  the keys are held back only while a modal dialog is open. The home page's show
  (`apps/studio/src/components/home/live/show-mount.ts`) also sets `aria-modal`, outside the editor.
- In `useEditorKeys` the Escape branch runs before the new check, so Escape still closes a dialog,
  and the indent chords stay prevented. Inside a field the check returns without `preventDefault`,
  so Cmd+A in the Find and replace field, which the walk's `text.find-replace.shortcut` presses,
  keeps the browser's select all.
- The print page takes `DialogCheck` alone from `Dialog.tsx`, so the new observer does not run there.
- The realtime rows' `openRoster` (`apps/studio/e2e/core/realtime.spec.ts`) presses Shift+Tab with
  no dialog open, where `key.roster` is unchanged.

### 9.3 The gates

The branch's readings are of `fb6ddc18`.

| Gate | Branch (`fb6ddc18`) | Second pass (`8b5988b1`) | `main` (`71c3556d`) |
| --- | --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 in 0 s (current by its build info, load 54); `tsc -b --force`: exit 0 in 132 s (load 55 to 167) | exit 0 in 2 s; `--force` exit 0 in 468 s | not run |
| Unit, `vitest run --testTimeout=120000` | 332 files, 3,272 passed, 1 skipped, 2 todo, 0 failed, 219 s (load 55 to 127): chrome 112 files 1,076 passed, viewer 57 and 554, lint 17 and 142, theme 9 and 161, agent 13 and 274, studio 124 and 1,065 | 332 files, 3,266 passed | not run |
| Brand lint, `main.ts --enforce` | exit 0 (load 56): 572 scripts, 121 stylesheets, 6 HTML and SVG files, 26 mood pictures; 0 open, 22 accepted, 0 stale | the same | not run |
| Competitor guard and the native select lint; `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs`, `evidence-policy.test.mjs` | 2 files, 15 passed (load 61); 4 files, 59 passed (load 74). `what-works.mjs --check`: current | the same | not run |
| Prettier | the 115 text files the branch changes against `origin/main`, and this file: clean | 115 files: clean | not run |
| `git grep -n "<select" -- '*.tsx'`; `.selectOption(` calls | nothing; only the lint test's fixture strings | the same | not run |
| `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` | exit 0 in 33 s (load 151 to 180) | exit 0 in 40 s | exit 0 in 94 s |
| `scripts/check-client-bundle.mjs` | exit 1 on the same three lines as `main`. `EditorRoot` 519,118 B (600,000), `vendor` 516,305, `Slideshow` 490,874. Preloads: `/decks` 695,391 B in 12 chunks (600,000), `/signin` 519,760, `/deck/gt-brand` 531,064, `/edit/gt-brand` 1,042,224 (2,000,000), `/docs` 616,379 (450,000) | `/decks` 695,239, `/edit/gt-brand` 1,042,213, `EditorRoot` 519,107, `Slideshow` 490,708 | `/decks` 686,908 in 11 chunks, `/edit/gt-brand` 1,042,098, `EditorRoot` 519,419 |

Fix round 2 adds 152 B to `/decks`, 11 B to `/edit/gt-brand` and 166 B to `Slideshow`; against
`main`, `/decks` gains 8,483 B and one chunk over a ceiling `main` is already over, and no route
crosses a ceiling it held on `main`.

### 9.4 The rows on the node-server build

The build of `fb6ddc18` was served on port 4790 with section 8.4's settings: `TURBOSLIDE_ROOT` the
checkout, `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/int-overlay`,
`TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-int.sqlite`,
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_BUILD_COMMIT` the full sha of `fb6ddc18` at build and at run
time, a fake Google pair, session and download secrets of 48 characters made once into a mode 600
file and never printed, and `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and
`TURBOSLIDE_TOKEN` unset. The overlay and the identity database were removed at the start. The
guard's commands ran as it runs them, without its token wrapper, with `--parked
docs/gslides-parity/focus/ship-4300058d.json` (its newest ship list by commit time; the guard's
script is unchanged since 2026-10-08 00:55), one after another.

| Run | Branch (`fb6ddc18`) | `main` (`71c3556d`, section 5) |
| --- | --- | --- |
| The smoke | 39 of 41 (load 151 to 149). Red: "json asset attachment" and "deck.info snapshots", the two rows red on `main` for the reasons of section 5. `/home` passed (3/3 marks); "build commit" served `fb6ddc18` | 39 of 41, the same two rows red |
| The walk, decks, text, fonts and versions | 128 passed, 1 failed, 2 not driven, 0 no step, 628 s (load 75 to 24). The verdict's failures hold only `fonts.table.takes-family`, a standing row of the guard, so the guard reads it green; `versions.show-changes-marks` is parked by the ship list | 128, 1, 2, 0 in 654 s. The 131 rows' results equal the branch's row for row (0 differences) |
| The nine spec rows | 9 passed, zero retries, 303 s (load 24 to 40) | 9 passed |
| The eight dropdown rows | 8 passed, zero retries, 286 s (load 40 to 38) | the rows' driver is not on `main` |
| The nine rows of DROPDOWNS.md 7.3 read in section 8.4 | 8 passed, 1 failed, 504 s (load 36 to 61): `export.print.download-pdf-follows-preview`, read again below | not read |
| The walk areas help and chrome: Help, Keyboard shortcuts, the menus' search and the chrome surfaces, through the key and dialog paths fix round 2 changes | 42 passed, 0 failed, 0 not driven, zero retries, 375 s (load 61 to 63) | not read; none was red |
| The three realtime rows, on this server's memory tier and one origin (the guard reads them on production after the promote) | 3 passed, zero retries, 67 s (load 52 to 48) | not read |

What the dropdown rows read:

- `chrome.select.every-site`: no `select` element on any surface of section 8.4's list, with the
  typography Align and Columns among Format options' fields; "/dev/auth: closed on this server
  (404), not read".
- `chrome.select.keyboard`: "Share choice by Enter: focused true, disabled attribute false, focused
  after the write true; after Tab inside true, after a blur inside true, after Tab, Shift+Tab,
  Delete, x inside true; on Done after Cmd+D, Cmd+A, Cmd+Z, Cmd+/: Share true, Keyboard shortcuts
  false, focus dialog.share.done; Shift+Tab to dialog.share.more, inside true, Collaborators list
  false; behind the dialog: revision 16 to 16, selected dd-table to dd-table, table 1" (DD-fix#7);
  "Share Escape writes 0".
- `chrome.select.pointer`: the list 446 px wide under a 446 px trigger at the same left edge; one
  write on choosing, none on the open trigger or the sentence.
- `chrome.select.over-dialog`: the list on the popover layer in both appearances, each row first at
  its centre; the Download Fonts list whole.
- `chrome.select.placement`: Line end's list above its trigger, 288 px tall; after a scroll of 40 px
  the page made, the list stayed open on its trigger; the Link list of 17 rows 288 px tall.
- `chrome.select.phone`: at 390 the list 284 px wide under a 284 px trigger, no horizontal scroll,
  no `select` element, in both appearances.
- `chrome.select.look`: the trigger 32 px, radius 6 px, Inter with tabular figures, in both
  appearances at 1440 and 390.
- `chrome.select.agent-set`: one write each way for General access; `set('dialog.share.mode',
  'public')` threw a `RangeError` naming the field and the value; the table's Border weight
  "revision 16 to 17".

The red, read again:

- `export.print.download-pdf-follows-preview`, in the run of the nine: "page.waitForEvent: Timeout
  45000ms exceeded while waiting for event download" at the first PDF. The server's log shows the
  export of four slides still running when the row ended: a one slide render just before it took
  19.3 s, and after the row's teardown removed its scratch deck the export failed on "no deck.json".
  Read again narrowed: run 1 passed in 48 s (load 62 to 80); run 2 red on the bound alone, the notes
  layout's file arrived in 30,965 ms against 30,000 (load 80 to 56). Fix round 2 changes no file the
  print page or the export runs, and the row passed on `8b5988b1` (section 8.4). A timing bound
  missed at a load over 24 with nothing lost: a flake of the loaded machine. It is not a guard row.

The server was stopped at 14:46 PDT and port 4790 is free.

### 9.5 Open after the third pass

1. Section 8.5 items 1, 3, 4 and 6 stand, and the other cases of section 6 item 5.
2. From the keyboard and assistive technology verifier's final pass 1, severity 1 and older than
   the round: the typography Align and Columns fields are named with the block's id.
3. From the visual verifier's final pass 1, five findings of severity 1: a trigger as wide as its
   chosen label moves its neighbours (F1); a list left open by a scroll the page makes, or by a
   touch drag from its trigger, stays open after its trigger leaves the window (F2); in Format
   options the dropdowns' borders (`--pt-field`) are darker than the text fields' beside them
   (`--pt-hair`) (F3); the asset picker's role filter is squeezed (F4); generated fields show "None"
   and "none" together (F5).
4. The two verifiers' notes are untracked in this folder, and DD-fix#7's commit body names
   `verify-final-1-a11y.md`. They are the verifiers' to commit.
5. Fix round 2 changes what a modal dialog's own field passes: before it, a Cmd+Shift or Ctrl+Alt
   chord from a field inside a modal dialog ran the key table (the Find and replace chord among
   them); now no chord of the key table runs while a modal dialog is open. The help and chrome walk
   areas passed with the change.

### 9.6 Verdict

Replaced by section 10.6. Ready. The head to ship was the commit that adds this section (`736080b5`),
on `origin/main` `71c3556d`; it
changes this file alone, which is not in the build, so the readings of `fb6ddc18` hold for it. Every
row that passes on `main` passes on the branch (the smoke's 39 rows, the walk's 131 rows row for
row, the nine spec rows); the eight dropdown rows passed with zero retries, and with them on the
build with production's settings 8 of the 9 rows of DROPDOWNS.md 7.3 (the ninth a timing flake read
again), the 42 rows of the help and chrome walk areas and the three realtime rows; the unit tests of
the six packages pass with 6 more than the second pass; and the brand lint, the competitor guard,
the native select lint and prettier are clean.

## 10. The fourth pass, after fix round 3

The integrator wrote this section on 2026-10-09 from 16:43 to 18:15 PDT. Nothing was pushed or
deployed, no Vercel, Cloudflare, GitHub or Google setting changed, production was not read, and none
of the guard's `.env` files was opened. Loads are one minute load averages, 67 to 163 through this
pass, so no timing below is a verdict.

### 10.1 The state at the start

- `dropdowns/round` stood at `e260e96c`: the third pass's head `736080b5` and DD-fix#8, fix round 3,
  written from the keyboard and assistive technology verifier's final pass 2 on `736080b5` (its F1,
  severity 2, a regression of DD-fix#7). The visual verifier's final pass 2 on `736080b5` read ready
  with seven severity 1 findings. The branch holds 27 commits over `origin/main`, each authored and
  committed by `kevin@generaltranslation.com`.

  | Commit | What |
  | --- | --- |
  | `e260e96c` DD-fix#8 | A modal `Dialog` checks for a dropped focus in a task of its own (one `setTimeout` 0, at most one pending, cleared on unmount), after the focus move has ended, never between the old control's `focusout` and the new control's focus; the place of the control the card focuses as it opens is read when the check starts listening. Ten new unit cases in `dialog.test.tsx` and `share-dialog.test.tsx` with the helper `browser-move.ts`; `chrome.select.keyboard` gains the expiry field, Add people by email and Image by URL steps and waits for /print's hydration mark; DROPDOWNS.md 3.5 states the rule |

- `origin/main` stood at `71c3556d`. The first fetch at 16:44 failed on this machine's network
  ("Recv failure: Operation timed out", then "Could not resolve host: github.com"); the retry at
  16:44 and `git ls-remote` at 16:44, 16:59, 17:36 and 18:06 read `71c3556d`. It did not move, so the
  branch was not rebased and `main`'s readings of sections 4 and 5 stand; this pass compares against
  the first pass's ledgers of `main` row for row.
- The checkout held six untracked files: the two pictures of section 1 and the verifiers' notes in
  this folder, `verify-final-1-a11y.md`, `verify-final-1-visual.md`, `verify-final-2-a11y.md` and
  `verify-final-2-visual.md`. They were left in place and not committed. No git, build or e2e lock
  was held, port 4790 was free, and no server ran from the checkout.

### 10.2 Fix round 3 read in the code

- The product change is `packages/chrome/src/Dialog.tsx` alone; the other files are tests, the row's
  driver, `core-matrix.json` and DROPDOWNS.md.
- `restore()` moves the focus only when the card is in the document and the active element is the
  body or none, so a move that ended on any control, inside the card or outside it (a list on the
  popover layer, a menu), is left where it is. A key pressed during the one task in which the body
  holds a dropped focus reaches no stage key and no chord of the key table, by `modalDialogOpen`
  (DD-fix#7).
- The print page takes `DialogCheck` alone from `Dialog.tsx`, as in section 9.2, so the change does
  not run there.

### 10.3 The gates

The branch's readings are of `e260e96c`.

| Gate | Branch (`e260e96c`) | Third pass (`fb6ddc18`) | `main` (`71c3556d`) |
| --- | --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 in 34 s (load 74 to 76) | exit 0 in 0 s; `--force` exit 0 in 132 s | not run |
| Unit, `vitest run --testTimeout=120000` | 332 files, 3,282 passed, 1 skipped, 2 todo, 0 failed (load 76 to 160): chrome 112 files 1,086 passed in 87 s, viewer 57 and 554 in 24 s, lint 17 and 142 in 29 s, theme 9 and 161 in 19 s, agent 13 and 274 in 106 s, studio 124 and 1,065 in 1,398 s (its import phase 1,336 s, run beside the build at loads up to 160) | 332 files, 3,272 passed | not run |
| Brand lint, `main.ts --enforce` | exit 0 (load 78): 572 scripts, 121 stylesheets, 6 HTML and SVG files, 26 mood pictures; 0 open, 22 accepted, 0 stale | the same | not run |
| Competitor guard and the native select lint; `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs`, `evidence-policy.test.mjs` | 2 files, 15 passed (load 85); 4 files, 59 passed (load 87). `what-works.mjs --check`: current | the same | not run |
| Prettier | the 116 text files the branch changes against `origin/main`, and this file again after its edit: clean | 115 files: clean | not run |
| `git grep -n "<select" -- '*.tsx'`; `.selectOption(` calls | nothing; only the lint test's fixture strings | the same | not run |
| `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` | exit 0 in 388 s (load 86 to 160) | exit 0 in 33 s | exit 0 in 94 s |
| `scripts/check-client-bundle.mjs` | exit 1 on the same three lines as `main`. `EditorRoot` 519,118 B (600,000), `vendor` 516,305, `Slideshow` 490,874. Preloads: `/decks` 695,556 B in 12 chunks (600,000), `/signin` 519,760, `/deck/gt-brand` 531,064, `/edit/gt-brand` 1,042,224 (2,000,000), `/docs` 616,379 (450,000) | `/decks` 695,391, `/edit/gt-brand` 1,042,224, `EditorRoot` 519,118, `Slideshow` 490,874 | `/decks` 686,908 in 11 chunks, `/edit/gt-brand` 1,042,098, `EditorRoot` 519,419 |

Fix round 3 adds 165 B to `/decks` and nothing to the other routes; against `main`, `/decks` gains
8,648 B and one chunk over a ceiling `main` is already over, and no route crosses a ceiling it held
on `main`.

### 10.4 The rows on the node-server build

The build of `e260e96c` was served on port 4790 with section 8.4's settings: `TURBOSLIDE_ROOT` the
checkout, `TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/int-overlay`,
`TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-int.sqlite`,
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_BUILD_COMMIT` the full sha of `e260e96c` at build and at run
time, a fake Google pair, session and download secrets of 48 characters made once into a mode 600
file and never printed, and `TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_AUTH_RATE_LIMIT` and
`TURBOSLIDE_TOKEN` unset. The overlay and the identity database were removed at the start. The
guard's commands ran as it runs them, without its token wrapper, with `--parked
docs/gslides-parity/focus/ship-4300058d.json` (its newest ship list by commit time; the guard's
script is unchanged since 2026-10-08 00:55), one after another.

| Run | Branch (`e260e96c`) | `main` (`71c3556d`, section 5) |
| --- | --- | --- |
| The smoke | 39 of 41 (load 157 to 151). Red: "json asset attachment" and "deck.info snapshots", the two rows red on `main` for the reasons of section 5. `/home` passed (3/3 marks); "build commit" served `e260e96c`. Each row's verdict equals `main`'s and the third pass's | 39 of 41, the same two rows red |
| The walk, decks, text, fonts and versions | 128 passed, 1 failed, 2 not driven, 0 no step, 955 s (load 138 to 70). The verdict's failures hold only `fonts.table.takes-family`, a standing row of the guard, so the guard reads it green; `versions.show-changes-marks` is parked by the ship list | 128, 1, 2, 0 in 654 s. The 131 rows' results equal the branch's row for row (0 differences; 0 against the third pass) |
| The nine spec rows | 7 passed, 2 failed, 789 s (load 70 to 131): `export.download.pdf-direct` and `export.download.pptx-direct`, read again below; both passed in each of two narrowed readings | 9 passed |
| The eight dropdown rows | 8 passed, zero retries, 638 s (load 131 to 78) | the rows' driver is not on `main` |
| The nine rows of DROPDOWNS.md 7.3 read in section 8.4 | 8 passed, 1 failed, 548 s (load 78 to 118): `export.print.download-pdf-follows-preview`, read again below; it passed in each of two narrowed readings | not read |
| The Image by URL rows, the dialog fix round 3 changes: `images.insert.by-url`, `images.byurl.preview-contained`, `svg.import.url` | 3 passed, zero retries, 95 s (load 118 to 126) | not read |
| The walk areas help and chrome | 42 passed, 0 failed, 0 not driven, zero retries, 402 s (load 126 to 67); row for row equal to the third pass | not read |
| The three realtime rows, on this server's memory tier and one origin (the guard reads them on production after the promote) | 2 passed, 1 failed, 172 s (load 67 to 162): `realtime.caret.within-300ms`, read again below; it passed in each of two narrowed readings | not read |

What the dropdown rows read:

- `chrome.select.every-site`: no `select` element on any surface of section 8.4's list, with the
  typography Align and Columns among Format options' fields; "/dev/auth: closed on this server
  (404), not read".
- `chrome.select.keyboard`: the steps of section 9.4, "behind the dialog: revision 17 to 17,
  selected dd-table to dd-table, table 1", and fix round 3's steps: "Shift+Tab from the expiry field
  to dialog.share.grant.dd-keys-guest@example.test.role; a click into Add people by email from the
  expiry field: focus dialog.share.emails, value "pat@example.test"; Tab from the typed Image by URL
  address to dialog.imageByUrl.cancel". The /print step passed after the hydration wait.
- `chrome.select.pointer`: the list 446 px wide under a 446 px trigger at the same left edge; one
  write on choosing, none on the open trigger or the sentence.
- `chrome.select.over-dialog`: the list on the popover layer in both appearances, each row first at
  its centre; the Download Fonts list whole.
- `chrome.select.placement`: Line end's list above its trigger, 288 px tall; after a scroll of 40 px
  the page made, the list stayed open on its trigger; the Link list of 17 rows 288 px tall; the
  Share list at 900 under its trigger.
- `chrome.select.phone`: at 390 the list 284 px wide under a 284 px trigger, no horizontal scroll,
  no `select` element, in both appearances.
- `chrome.select.look`: the trigger 32 px, radius 6 px, Inter with tabular figures, in both
  appearances at 1440 and 390.
- `chrome.select.agent-set`: one write each way for General access; `set('dialog.share.mode',
  'public')` threw a `RangeError` naming the field and the value; the table's Border weight
  "revision 17 to 18".

The reds, each read again narrowed twice on the same server (`core-gate.mjs --only specs --rows`):

| Row | The run's reading | Narrowed reading 1 | Narrowed reading 2 |
| --- | --- | --- | --- |
| `export.download.pdf-direct` (guard) | the file arrived in 46,311 ms against 30,000, no dialog shown, the snackbar read the saved name with Details | passed, the file in 20,338 ms (load 149 to 89) | passed, the file in 19,914 ms (load 71 to 85) |
| `export.download.pptx-direct` (guard) | no download within 60 s on the deck with no table; the server wrote the six slide file (60.4 KiB) after the row ended | passed (load 149 to 89) | passed (load 71 to 85) |
| `export.print.download-pdf-follows-preview` | no download within 45 s at the first PDF, as in section 9.4 | passed in 34 s (load 89 to 76) | passed in 21 s (load 85 to 84) |
| `realtime.caret.within-300ms` | keystroke 8 moved the caret in 309 ms against 300; the others 104 to 257 ms | passed, 92 to 187 ms (load 76 to 71) | passed, 83 to 101 ms (load 84 to 75) |

The server's log shows why the export rows waited: one worker runs the renders and the exports in
turn, a render took 10 to 39 s at these loads, and the exports waited behind them. Each red is a
timing bound missed at a load over 24 with nothing lost, and each passed both narrowed readings: a
flake of the loaded machine. Fix round 3 changes no file the export worker or the realtime channel
runs, the print page does not run the changed check (section 10.2), and the PowerPoint row's red came
at its first download, which opens no dialog; the two guard spec rows passed on `main` and on every
earlier pass.

The server was stopped at 18:07 PDT (it did not exit on SIGTERM once its port had closed, so it was
killed) and port 4790 is free.

### 10.5 Open after the fourth pass

1. Section 9.5 items 1 and 5 stand: section 8.5 items 1, 3, 4 and 6, the other cases of section 6
   item 5, and fix round 2's rule that no chord of the key table runs while a modal dialog is open.
2. From the keyboard and assistive technology verifier's final pass 2, both severity 1 and older
   than the round, left by DD-fix#8 on purpose: the typography Align and Columns fields are named
   with the block's id (its F2; the window API's `set()` reaches them by that label), and Cmd+Z on a
   focused Format options dropdown right after a choice undoes nothing (its F3; DROPDOWNS.md C10
   makes a focused trigger a field for the key table).
3. From the visual verifier's final pass 2, seven findings of severity 1: F1 to F5 of section 9.5
   item 3, unchanged, and two on the link popover: its slide field's corner differs from the field
   and buttons in its row (F6), and the popover runs past the window's right edge, 12 px further
   than on production (F7).
4. The four verifiers' notes are untracked in this folder, and DD-fix#8's commit body names
   `verify-final-2-a11y.md`. They are the verifiers' to commit.
5. Under a load of 70 to 160 the export worker's queue made three export rows miss their bounds
   once (section 10.4). The guard reads its spec rows on a Vercel preview.

### 10.6 Verdict

Ready. The head to ship is the commit that adds this section, on `origin/main` `71c3556d`; it
changes this file alone, which is not in the build, so the readings of `e260e96c` hold for it. Every
row that passes on `main` passes on the branch: the smoke's 39 rows and the walk's 131 rows row for
row, and the nine spec rows, two of them after a timing miss at a load over 100 and two green
narrowed readings each. The eight dropdown rows passed with zero retries, with fix round 3's steps;
with them on the build with production's settings, the nine rows of DROPDOWNS.md 7.3, the three
Image by URL rows, the 42 rows of the help and chrome walk areas and the three realtime rows passed
(two after one timing miss each, read again twice). The unit tests of the six packages pass with 10
more than the third pass, and the brand lint, the competitor guard, the native select lint and
prettier are clean.

## 11. DD-fix#9, after the keyboard verifier's final pass 3

DD-fix#9 wrote this section on 2026-10-10 from 04:40 to 05:15 PDT; the fix and its readings ran
from 2026-10-09 23:45 to 2026-10-10 05:06 PDT in this checkout on `dropdowns/round`. Nothing was
pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, production was not
read, and no token, cookie or secret was printed into this file. Loads are one minute load
averages, 74 to 520 through the round from other sessions' jobs (never stopped), so no timing below
is a verdict.

### 11.1 The finding

The keyboard and assistive technology verifier's final pass 3 on `2fdb7a65`
(`verify-final-3-a11y.md`, untracked in this folder), F1, severity 2, blocked the ship. A Share
control that disabled itself for its write sent the focus to a control far from it, in Chromium and
Firefox: a Permissions box toggled with Space wrote `share.settings` once and the focus went to
`dialog.share.done`, so the next Space pressed Done and closed the dialog; Rotate on a link row by
Enter landed on Done; Approve on an access request by Enter landed on `dialog.share.gear`, below the
body's visible edge, with no ring in view; Send by Space landed on `dialog.share.publish`; Publish in
Publish to the web by Enter landed on the Link tab. Two causes: Share's plain buttons and check boxes
took the `disabled` attribute while they held the focus (16 controls had `disabled={busy}`), and the
card's `restore()` (`Dialog.tsx`) focused `focusableIn(el)[Math.min(place, list.length - 1)]`, an
index read before the write applied to the shorter list the write left, with `preventScroll`.

### 11.2 The change

The product change, its tests and DROPDOWNS.md 3.5 are commit `5142310c` (DD-fix#9), on `2fdb7a65`;
this section is a second commit that changes this file alone.

| File | What |
| --- | --- |
| `packages/chrome/src/FocusHold.tsx` (new) | The one helper: `useFocusHold(disabled)` gives a control the `disabled` attribute only while it does not hold the focus and `aria-disabled="true"` whenever it is disabled; `HoldButton` is a `button` under it whose click (a press, Enter or Space) runs nothing while it is disabled |
| `Select.tsx` | The trigger's own copy of the rule (`focused` state) is replaced by `useFocusHold`; the behaviour is the same |
| `Dialog.tsx` | `DialogCheck` takes the hold and ignores a toggle while disabled (the box is controlled, so React puts it back); the action buttons are `HoldButton`s. The restore rule is rewritten: the card keeps the control that holds the focus with every control before and after it in document order (enabled or not), read again at each change while that control is in the card; a dropped focus goes to the same control while it is in the card and takes the focus, else the nearest control after it that does (for a row that left, the next row's first control or the next section's), else the nearest before it, else the card; never Close, never a button of the actions row for a control of the body, never by index; the landing is scrolled into view with `block: 'nearest'`. A drop from a change of the card outside a focus move (a row that left after its write) is restored in the observer's own microtask, so no task sees the focus on the body; inside a move (a focusout that names its related target, until the next focusin) the check keeps its own task (DD-fix#8) |
| `dialogs/Share.tsx` | Claim, Copy link, a link row's Copy link, Rotate and Revoke, Send, the legacy and unminted rows' Copy link, Switch to a link, Stop sharing, Decline and Approve are `HoldButton`s; the Permissions boxes hold through `DialogCheck`, the three dropdowns through `Select`. The link rows are keyed by their place (`general`, `view`, `present`, `edit`) instead of the link's id, so Rotate, which replaces the link with one of a new id, keeps its button, and a row's first Copy link keeps its button as the row is minted. `copy()` no longer sends the focus to Done (`focusDone`, from VERIFICATION.md pass 1 F8, removed) |
| `dialogs/Publish.tsx` | Publish and Stop publishing are one `HoldButton` whose words, class, control id and action follow the state, so the focus stays on it through the write and after it |
| `dialogs/Profile.tsx`, `Tailor.tsx`, `ImportSlides.tsx`, `Background.tsx`, `AvatarBuilder.tsx`, `NamePrompt.tsx` | The same pattern (a button disabled by the run its own press starts): Sign out everywhere else, a session's Sign out, a key's Revoke, Delete account, Tailor's logo find, Import slides' deck rows and file button, Background's Place, the avatar upload and the name plate's Continue are `HoldButton`s. Prettier reflowed one unrelated `img` in `ImportSlides.tsx`, which was not prettier-clean on `main` |
| `tokens.css` | A solid button held with `aria-disabled` draws the disabled ground, as `:disabled` does |
| `docs/DROPDOWNS.md` 3.5 | States the hold, the keyed rows, the one Publish button and the landing rule |

Left as they were: the Download dialog's type buttons (`disabled={running}`; the run starts from OK,
so they never hold the focus when it starts) and every surface outside `dialogs/` with
`disabled={busy}` (the inspector, panels, the auth plate), which are not modal cards.

### 11.3 The unit tests

- `__tests__/browser-move.ts`: `focusFixup()` makes jsdom drop the focus from a control that takes
  the `disabled` attribute, as a browser does (jsdom keeps it); `focusDuring(ms)` reads the active
  element every 25 ms.
- `dialog.test.tsx`, eight new cases and one changed: a `HoldButton` keeps the focus through its
  write and ignores a second press, and takes the attribute once the focus leaves; a `DialogCheck`
  Space twice writes once and keeps the focus; a dropped focus goes back to the same control, not to
  the old index (which pointed at Done); a row that left gives the focus to the nearest control
  after it that takes it, past a disabled one; that restore happens in the same task as the render;
  the last body control leaving gives the focus to the one before it and then to the card, never to
  Done or Close; the landing is scrolled into view with `{ block: 'nearest', inline: 'nearest' }`;
  the one body field of a dialog leaving gives the focus to the card, not to Cancel. The DD-fix#8
  case "a drop from the autoFocus field" now reads the control after it in the body.
- `share-dialog.test.tsx`, five new cases on the real dialogs with each write held 1.5 s and the
  focus read every 25 ms (none may read Done, Close or the body): Space twice on each of two
  Permissions boxes writes once each, the dialog stays open on the box; Enter on Rotate keeps the
  focus on the same button while its link is replaced; Approve moves the focus to the next request's
  first control, then to Add people by email, each scrolled into view; Send keeps the focus through
  the invitation and after its field empties; Publish keeps the focus on its button, which then
  reads Stop publishing. The two Remove access cases now name their landing, More.
- On the product files of `2fdb7a65`, 11 of the new cases fail: the Permissions box's readings are
  `dialog.share.done` 18 times, Rotate's `dialog.share.done`, Send's `dialog.share.gear`, Publish's
  `dialog.publish.tab.link`, Approve's `dialog.share.notify` during the write. The same-task case
  fails with the observer of the task-only check.

### 11.4 The gates

| Gate | Reading |
| --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 in 556 s on the final files (load 248 to 121); exit 0 in 156 s before the same-task restore (load 148 to 114) |
| Unit, chrome, `vitest run --testTimeout=120000` | 112 files, 1,097 passed, 2 failed, 2 todo, 79 s (load 76 to 86). The two failures are `editor-shell-render.test.tsx` waits of 1 s for a dialog loaded on first open (Details, Keyboard shortcuts); the file's lazy dialog cases fail the same way on the product files of `2fdb7a65`: read in turn, base 3 failed then 21 of 21, branch 2 failed and 2 failed (load 74 to 250), and earlier base 4 failed twice (load 170 to 520). Measured with a 30 s wait, the Details dialog appeared 4.0 to 6.1 s after the click on base and 3.2 to 4.9 s on the branch |
| Unit, viewer, the same | 57 files, 554 passed, 111 s (load 449 to 325) |
| `dialog.test.tsx`, `share-dialog.test.tsx` and `select.test.tsx` alone | 27, 38 and 34 passed (99), on the final files (load 91); `2fdb7a65` had 19 and 33 cases in the first two |
| Prettier on the changed files | clean |

### 11.5 The hand drive on 4796

A vite dev server (`vite.no-watch.config.ts`) on port 4796 with `TURBOSLIDE_ROOT` the checkout,
`TURBOSLIDE_STORE=tmp`, `TURBOSLIDE_OVERLAY_DIR=.turboslide/fix9-overlay`,
`TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth-fix9.sqlite`,
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_LOCAL_OPEN=1`, a fake Google pair and session and download
secrets of 48 characters in a mode 600 file. The drive (`scratchpad/fix9/drive/drive.mjs`, Playwright
core 1.62.1, Chromium and Firefox at 1440 by 900) makes a deck from `/new`, opens Share and, with the
keyboard: Space twice within 120 ms on Editors can change permissions and share, then Space once more,
the same on Viewers and commenters can download, print and copy; Send by Space; General access to
Anyone with the link, then Rotate on its row by Enter; Publish to the web, Publish by Enter and Enter
again; then two other browsers ask for access through the link and the owner approves each by
Enter. The focus is read every 20 ms for 2.5 s after each press (3.5 s with the writes held), and a
reading of Done, Close or the body fails the step. With `hold`, every Share and publish write is held
1.5 s by a route.

| Run | Result |
| --- | --- |
| Chromium | 17 of 17 (load 174 to 212) |
| Firefox | 17 of 17 (load 185 to 204) |
| Chromium, writes held 1.5 s | run 1, signed in: 16 of 17 (load 217 to 279); run 2, anonymous browsers: 17 of 18 (load 99 to 124); run 3, anonymous, the deck revision read at each step: 24 of 24 (load 75 to 93). A fourth run stopped when the editor's reload before Approve did not come up within 600 s (load 300); its steps before that passed. The red step of runs 1 and 2 is the deck revision, below |
| Firefox, writes held 1.5 s | 18 of 18 (load 120 to 141) |

What each run read:

- Permissions boxes: the box keeps the focus with `aria-disabled="true"` and no `disabled`
  attribute during its write; the dialog stays open on the box; with the writes held the second
  Space lands inside the write and writes nothing (one `share.settings`, the box toggled once). On
  the unheld runs the local write ended inside the 120 ms, so the second Space was a toggle of its
  own (two writes, the box back where it was), still on the box. The next Space toggles it again with
  one write.
- Send: the focus stays on `dialog.share.send` through `share.invite` and after the field empties.
- Rotate: the focus stays on the row's Rotate, whose control id moves from the old link's id to
  the new one's (`share.rotateLink`), in view with its ring.
- Publish: the focus stays on the button, which reads Stop publishing (`deck.publish`); the next
  Enter unpublishes (`deck.unpublish`) and the focus stays on it, reading Publish.
- Approve: from the first of two requests the focus lands on the second request's Notify box;
  from the last, on Add people by email; each in view with its ring, no reading of the body. Before
  the same-task restore, one Chromium run read the body for one 20 ms sample between the row
  leaving and the landing.
- Every run read no Done, Close or body, and no page error. Chromium held runs 1 and 2 read the
  deck revision 1 after the deck's first write and 2 at the end; run 2 read 2 already at its first
  reading, after Space on the first box, with every focus reading on the box. Run 3, with a 3 s wait
  after the deck's first write, read 1 at every step to the end. The unheld and Firefox runs read
  the revision unchanged.

### 11.6 The rows on 4796

| Run | Reading |
| --- | --- |
| The eight dropdown rows (`core/chrome.spec.ts --grep chrome.select.`) | 8 passed, zero retries, 684 s (load 221 to 163) |
| `apps/studio/e2e/core/share.spec.ts`, whole | 53 tests: 39 passed, 10 failed, 4 not run, 1.6 h (load 160 to 520). The dev server's process ended at about 03:10 under the session's two hour limit on background commands, so the last rows (`realtime.departed-guest.name-stable` onward) read a closed port |
| The 14 red or unrun rows, narrowed, on a restarted server | 9 passed: `share.dialog.open`, `share.role-change.keeps-link`, `people.chip-tooltip-trust` and the six `accounts.*` rows; 5 red, read below (27.5 min, load 134 to 150) |

The five, each read narrowed on a server with the product files of `2fdb7a65` and on the branch:

| Row | Branch | Base (`2fdb7a65`) |
| --- | --- | --- |
| `share.copy-present-link` | red once on the cold server: the copy wrote the Present link in 21 s and the second browser's first open of `/s/<token>?present=1` took 113 s past the 90 s bound; green after the show route was compiled (load 74 to 114) | green |
| `assist.viewer.disabled` | red three times: on the view link page the title row has no `title.assist`, so no panel and no sentence | red, the same |
| `share.name-prompt.empty-field` | red twice, green once | red: Ctrl+M opens no name prompt after the deck's own helper closed it, and the row's skip path clicks `dialog.share.close` with no Share dialog open until its 150 s bound |
| `collab.presence.join-within-2s` | red four times: B's chip in 35.8, 4.4, 3.9 and 17.0 s against 3.5 s (load 95 to 500) | green once (load 105 to 145), then red twice: 4.7 and 16.4 s (load 93 to 305) |
| `realtime.departed-guest.name-stable` | red four times (once on the closed port): reloads read the names in 4.3 to 14.0 s against 3 s | green once, then red twice: 4.7 to 12.0 s |


The two timing rows miss their bounds on both builds at these loads, and their mechanism (the
presence channel, the editor's reload) does not run the changed files. `assist.viewer.disabled` and
`share.name-prompt.empty-field` read the same on both builds and do not open a changed dialog
control. No row's reading differs between the builds in a way the change can produce.

The server was stopped at 05:00 PDT and port 4796 is free; the overlay
`apps/studio/.turboslide/fix9-overlay` and the Playwright output folders of the runs were removed.

### 11.7 Open after DD-fix#9

1. The keyboard verifier's F2 to F4 of final pass 3 (severity 1, older than the round) stand: the
   typography Align and Columns names, Cmd+Z on a Format options dropdown, and the cell border
   fields after a click into a cell.
2. A checked Permissions box draws its focus ring as a 1 px ink outline on a box filled the same
   colour (final pass 3, notes), so a checked, focused box still shows no ring; outside this fix.
3. Outside `dialogs/`, controls with `disabled={busy}` (the inspector's sections, the panels, the
   auth plate, Format options) still take the attribute while they hold the focus. They are not
   modal cards, so the card's restore does not reach them; `HoldButton` and `useFocusHold` are the
   way to give them the same rule.
4. Held Chromium runs 1 and 2 read the deck revision 1 to 2 with no focus reading of the body, Done
   or Close, run 2 already at its first reading; run 3, with a 3 s wait after the deck's first
   write, read 1 at every step. Not explained; the readings point at a late write of the new deck
   rather than a key reaching it, but no run read which write it was.
5. `editor-shell-render.test.tsx`'s lazy dialog cases wait 1 s and fail at loads over about 75 on
   both builds. `assist.viewer.disabled` and `share.name-prompt.empty-field` are red on this dev
   server on both builds.
6. The verifiers' notes stay untracked in this folder, as in section 10.5 item 4.
