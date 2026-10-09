# Dropdowns, the integrator

The integrator of the dropdown round (key IntegratorDD) wrote this file on 2026-10-08 from 19:54 to
21:50 PDT in `/Users/kevinliu/repos/Turboslide-dropdown` on `dropdowns/round`. Read first:
`docs/DROPDOWNS.md`, the bodies of the round's nine commits and `~/.config/turboslide/gt-follow.sh`
(the production guard, read and never edited; none of its `.env` files was opened). Nothing was
pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not
read. Loads are one minute load averages, 49 to 125 through this pass from other sessions' jobs
(never stopped), so no timing below is a verdict; counts, boxes and attributes do not move with load.

Sections 1 to 7 are the first pass, on `931f69d8`. Section 8 is the second pass, after fix round 1
(`51ca68df` to `8b5988b1`), written on 2026-10-09 from 10:49 to 11:40 PDT; its verdict replaces the
first one.

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

Ready. The head to ship is the commit that adds this section, on `origin/main` `71c3556d`; it
changes this file alone, which is not in the build, so the readings of `8b5988b1` hold for it. Every
row that passes on `main` passes on the branch (the smoke's 39 rows, the walk's 131 rows row for
row, the nine spec rows), the eight dropdown rows and nine rows of DROPDOWNS.md 7.3 passed with zero
retries on the build with production's settings, the unit tests of the six packages pass with 15
more than the first pass, and the brand lint, the competitor guard, the native select lint and
prettier are clean.
