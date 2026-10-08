# Polish two, lane F: the face and the realtime row

Lane F of `docs/POLISH-2.md` (section 2 and 7.1), in `/Users/kevinliu/repos/Turboslide-polish2` on
`polish2/round`. Each push below names its items, its files, its checks with their readings and the
one minute load beside each timing, its pictures and its deviations. A timing read at a load over 24
is not a verdict; bytes, counts, widths and colours do not move with load.

## P2-F#1, day 0

Commit `5d939cf5`. Items 1 to 5 of `docs/POLISH-2.md` 6.1, in `scripts/probes/core-matrix.test.mjs`
alone: `POLISH2_NOTE`, `POLISH2_RETIRED` (empty) and `isPolish2Row`; the count term; the landing
term and the landing block's three filters exclude the round's rows; the realtime block's last five
local rows read `localRows().filter((row) => !isPolish2Row(row))`, and so does the ship test's
`run.local` (the same last-five read, which would also fail once lane A appends its local rows); a
block "polish two" that reads every round row's note, id, driver, feature, local state and place.

| Check                                                                                                           | Reading                                                                                                                                                         | Load       |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `vitest run scripts/probes/core-matrix.test.mjs`                                                                | 40 of 40                                                                                                                                                        | 209        |
| The same file on a scratch copy of the matrix with the 27 rows of 6.2 to 6.5 and the eleven restated notes of 6.6 | 40 of 40; the file before the push fails 4 tests on that copy (the product round's count, the realtime block's two last-five reads, the landing order)         | 209        |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs`; `what-works.mjs --check`                  | 52 of 52; README.md is current                                                                                                                                  | 162 to 196 |
| `tsc -b`                                                                                                        | 29 min 41 s; two TS6307 errors for files other lanes created during the run (`e2e/core/auth-plate.ts`, `e2e/core/home/header.ts`), none for this push          | 162 to 196 |
| The brand lint, enforce                                                                                         | one open finding, `css/no-eyebrow` in lane A's uncommitted `packages/chrome/src/auth/auth.css`; the competitor guard passed                                    | 189        |
| The whole vitest suite (`vitest run --dir packages/lint` did not narrow the root's projects, so it ran `pnpm test`'s set) | not a verdict: jsdom tests of `packages/chrome` and `apps/studio` timed out at 5 to 9 s each; the run was stopped. Every later unit run names its files by path | 180 to 214 |

No node-server build: the push changes one test file that no build reads.

## P2-F#2, the object id in the two realtime rows

Items of `docs/POLISH-2.md` 2.6. `apps/studio/e2e/core/realtime.spec.ts`: `roomOf(page)` reads the
tab's room frame (`describe().state.sync.room`, polled until the frame arrived); on the do tier
`realtime.join.chip-within-1s` reads A's object and B's in each of the three rounds, asserts each
matches `/^[0-9a-f]{8}$/` and that B's equals A's, and `setup.do.two-instances` asserts the same of
`hello.a.object` and `hello.b.object`. The colos (`sync.status` and the room frames) are in the
`measure` annotation and in no assertion; the header comment says why. The tier of the join row is
read from the page (`sync.tier`), since `sync.status` answers no tier without a bearer. No Worker,
client or contract change. `docs/gslides-parity/focus/core-matrix.json`: the two rows take the
interactions of 6.6 and their notes gain "; restated in polish two, P2-F#2".

The rows ran on the do tier with two origins, as `docs/CLOUDFLARE.md` 5.4 item 2 describes:
`wrangler dev` of `apps/realtime-worker` on 8741 (local D1 and object state under the scratch folder,
the control migrations applied with `--local`, test secrets passed as `--var`), and two vite dev
servers of this tree on 4741 and 4731 (`-c vite.no-watch.config.ts`, one tmp overlay
`.turboslide/f-overlay`, `TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8741`,
`TURBOSLIDE_ROOM_INSECURE=1`), with `core-gate.mjs --only specs --rows
realtime.join.chip-within-1s,setup.do.two-instances --tier do --second-base http://127.0.0.1:4731`.

| Run                                     | `realtime.join.chip-within-1s`                                                                                                                                                                                                                                                                                                                                   | `setup.do.two-instances`                                                                                                                                                                                                                                                                       | Load                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1, cold servers (`.turboslide/f-gate-f2`) | failed in setup: A's editor was not up within `waitEditor`'s 90 s                                                                                                                                                                                                                                                                                                | failed: the 300 s test budget ran out before any reading                                                                                                                                                                                                                                       | 150 to 330               |
| 2, both editors warmed first (`f-gate-f2b`) | every clause read green: B's chip in A 257, 200 and 177 ms and A's in B 257, 199 and 176 ms after B's editor was ready; instances `938d453f` and `51963ee7`; tier do; the object in A's room frame `1322759e` and in B's `1322759e` in all three rounds; colos recorded, not compared: SJC on every read. Recorded failed: the 300 s budget ran out in the `finally` teardown (File > Move to trash, Delete forever, the 404) and the `afterEach` | every clause read green: instances `938d453f` and `51963ee7`; the object `3ad89944` in both room frames; every word in both 1,133 ms after the later last keystroke; revisions 14 and 14 at the live 14; `sync.seq` 33 and 33, `sync.covered` 33 and 33; colos SJC recorded. Recorded failed for the same teardown timeout | 138 to 229 over 1,070 s |

A timing at a load over 24 is not a verdict, so neither run is one. The object clause, the change of
this push, is not a timing: run 2 read one object id across both origins in every round of the join
row and in the setup row, and no assertion read a colo. On the local memory tier with one origin the
code drives the join row's chip clause and records "no object on this tier", and skips
`setup.do.two-instances` with its one origin reason; that reading is in P2-F#4's section.

Other checks: `tsc -b` exit 0 in 14 min 18 s (load 145 to 500, the tree with this push and P2-F#3's
files); `prettier --check` clean; inside the commit's lock, after the matrix edit,
`core-matrix.test.mjs`, `what-works.test.mjs` and `docs-index.test.mjs` 52 of 52 and README.md
current (the block names neither row's words). No surface changed, so no picture. Commit
`65af8378`.

## P2-F#3, the alternates leave the marks, the wordmark and the card; the rule widens

Items of `docs/POLISH-2.md` 2.2 and 2.3 and C2, C3.

- `packages/identity/src/marks-render.ts` 353: the initials' `style="font-feature-settings:'cv11','ss01'"`
  leaves; `renderMarkSvg` draws Inter's defaults. The editor's chips (`IdentityChip`, the
  `.ts-chip-initials` rule of `presence.css`) never set a feature, and initials are capital
  letters, which neither cv11 (the single storey a) nor ss01 (the open figures) changes, so no
  pixel of a chip moves.
- `scripts/build-brand.ts` 597 (the lockup's word) and 655 (the card's body rule) leave the
  declaration; the comment at 520 and the wordmark's generated comment say Inter's default glyphs.
  `node scripts/build-brand.ts` rewrote four files: `packages/theme/brand/wordmark.svg`,
  `og-template.html`, `apps/studio/public/og/turboslide.png` (173,321 B to 156,855 B, 762 colours,
  rendered by Chrome for Testing 147.0.7727.15, chromium-1217, on ANGLE Metal) and
  `apps/studio/public/brand-manifest.json` (their bytes and sha256); every other output was byte
  identical.
- `css/chrome-alternates` keeps its id and widens (`packages/lint/src/brand/`): `hasAlternates`
  reads `ss01` to `ss20`, `cv01` to `cv99`, `salt`, `swsh` and `aalt` in a feature value;
  `font-variant-alternates` other than `normal` (and the `font-variant` shorthand's alternate
  functions) fails; `var(--display-features)` fails in a rule unless every selector of the list has a
  `.ts-sheet` compound (`isSlideScoped`); in scripts the rule reads JSX `fontFeatureSettings`,
  `fontVariantAlternates` and `fontVariant`, and every style string declaration by declaration
  (`alternatesInStyleText`, the selector read from the string's own block); `ALTERNATES_ROOTS`
  (`packages/identity/src/`, `scripts/build-brand.ts`, `packages/theme/brand/`) joins `LINT_ROOTS`,
  and a file there is read by this rule alone (`isAlternatesOnly`); `lintAlternatesText` reads an
  HTML or SVG file as text. `ALTERNATES_OWNERS` is unchanged. `css.test.ts` and `source.test.ts` pin
  2.3's cases: `ss02` in a chrome rule, `cv05` in an inline style, `font-variant-alternates:
  stylistic(x)`, `var(--display-features)` under `.ts-sheet` (passes) and outside it (fails, in CSS
  and in a style string), the theme's sheet (passes), the old `marks-render.ts` attribute and the
  old card rule (fail), the committed `wordmark.svg` and `og-template.html` (clean), and a hex
  colour and an em dash under an alternates root (no other rule reads them).
- `docs/brand.md`: section 4 (the lockup) drops the declaration; the face's subsection of section 10
  states the rule. Deviation: `docs/POLISH-2.md` names section 3, which is the mark's sizes in this
  file; the lockup is section 4 and the face is the subsection "The face (2026-10-05)" of section 10.
  The proof paragraph lands with P2-F#4.

| Check                                                                                          | Reading                                                                                                                                                                                                                                                                                          | Load       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `vitest run packages/lint/src/brand/` (the competitor guard included)                          | 57 of 57                                                                                                                                                                                                                                                                                         | 209        |
| The brand lint, enforce, `--rules css/chrome-alternates`, on `HEAD` before the push (`--ref`)  | 3 open findings: `marks-render.ts` 353, `build-brand.ts` 597 and 655                                                                                                                                                                                                                             | 189        |
| The same on the working tree after the push                                                    | 0 findings, 564 scripts and 121 stylesheets read                                                                                                                                                                                                                                                 | 189        |
| The brand lint, enforce, every rule, working tree                                              | one open finding, `css/no-eyebrow` in lane A's uncommitted `packages/chrome/src/auth/auth.css` 303; none of this push                                                                                                                                                                            | 189        |
| `node scripts/build-brand.ts --check`                                                          | exit 0: the mark's paths match; 32 files match the manifest, the rebuild and the facts; the card compared by pixels on chromium-1217                                                                                                                                                             | about 450  |
| `vitest run packages/identity/ packages/chrome/src/__tests__/mark-agreement.test.ts`           | 91 of 96; the five red are timeouts (5 s and the 1,000 marks test's 30 s) at load 145 to 158. With longer budgets: `names` and `labels` pass (34 of 35 in the tree at `--testTimeout=300000`), `marks-render.test.ts` 10 of 10 on a scratch copy whose 1,000 marks budget is 900 s, `mark-agreement.test.ts` 2 of 2 | 145 to 487 |
| `tsc -b`                                                                                       | exit 0 in 14 min 18 s                                                                                                                                                                                                                                                                            | 145 to 500 |
| `prettier --check` on the push's files                                                         | clean                                                                                                                                                                                                                                                                                            |            |
| The node-server build under `build.lock` (the working tree at `65af8378` with every lane's uncommitted files), served on 4750, `check-client-bundle.mjs apps/studio/dist --base http://localhost:4750 --client apps/studio/.output/public` | the build exit 0 in 375 s; `/og/turboslide.png` serves 156,855 B; the bundle check exit 1 for reasons outside this push: `apps/studio/dist/client` absent (the form names the non deploy output), a `vendor-*.js` chunk of 1,524,170 B and preloads of 1,577,115 B on `/decks`, 1,538,826 B on `/deck/gt-brand` and 2,045,184 B on `/edit/gt-brand`, over 600,000, 1,000,000 and 2,000,000 B; the build's prerender list names `/docs` pages, so lane D's uncommitted routes are in it. This push removes one attribute string from one client module (`marks-render.ts`) | 137 to 179 |

Rows: none (unit tests, `docs/POLISH-2.md` 7.1).

Pictures, each opened and looked at:

- `f/og-card-before.png` and `f/og-card-after.png`, the card at 1200 by 630; `f/og-card-sentence-before.png`
  and `f/og-card-sentence-after.png`, its sentence, address and credit at 2x: before, "a" in "is a",
  "Image" and "domain" is the single storey form; after, Inter's default two storey a. The lockup's
  word is the same in both.
- `f/chips-initials-1440-light.png` and `f/chips-initials-1440-dark.png`: the own presence chip of the
  editor from `/new` on 4741, zoomed 4x at device scale 2; the initial (L, P) draws in Inter 500 with
  the computed `font-feature-settings: normal` and no `style` attribute.
- `f/editor-390-light-roster-open.jpg` and `f/editor-390-dark-roster-open.jpg`: under 480 px the
  presence slot folds into More and draws no chip; More, Collaborators opened. Observed, not this
  lane's: the roster plate draws as an empty outlined pill about 240 CSS px wide under the title row, with no row for a person alone. Reported to the integrator as an observation.

## P2-F#4a, the proof of the release and the drivers of the three face rows

`docs/POLISH-2.md` 2.4, 2.5 and 6.2. P2-F#4 lands after P2-A#4 and P2-D#2, whose pages its rows
read. At this commit neither had landed (the branch held P2-A#1), so the push is split: this part
carries everything that reads no page of theirs, and P2-F#4b enters the three rows in
`core-matrix.json` once both have landed. A row of `font-p2.ts` registers only when its id is in the
matrix (the shape of `chrome-surfaces.ts`), so the drivers are inert until P2-F#4b.

- `packages/fonts/src/woff2-names.ts`: `fvarAxes(tables)` (fvar is never transformed in woff2),
  `gposFeatures(tables)`, and `woff2Facts` returns `positioning` and `axes` beside the GSUB tags.
- `packages/fonts/src/inter-release.test.ts` (new): the fourteen `InterVariable*.woff2` files (seven
  upright, seven italic) each read "Version 4.001;git-9221beed3", family "Inter Variable", the
  subfamily of its style, the axes opsz 14 to 32 (default 14) and wght 100 to 900 (default 400),
  and the bytes and sha256 of its record (`INTER`, `INTER_ITALIC`, `fonts.json` `web`); the whole
  upright is 352,240 B with sha256 `693b77d4...a8e3`; the Latin upright subset carries the 42
  features of 2.1 across GSUB and GPOS (`kern`, `mark`, `mkmk` and `cpsp` are GPOS features), the
  whole upright adds cv14, and the italic files carry the same set less cv11 (cv14 again in the
  whole italic).
- `apps/studio/e2e/core/font-p2.ts` (new) with its import and coverage spread in `chrome.spec.ts`:
  `chrome.font.official-inter`, `chrome.font.no-stylistic-sets` and `chrome.font.tabular-figures`
  as 6.2 states them.
- `docs/brand.md` section 10, the face: the proof paragraph.

Deviations in the drivers, each recorded in the row's annotation:

1. `chrome.font.official-inter` counts font files, not responses: on a vite dev server `/new` and
   `/signin` draw the head's preload link again after hydration and the dev server's no-cache turns
   that into a 304 revalidation of the same file with no body. The row asserts one font file, one
   full answer of the Latin upright with the record's bytes and sha256, and lists every response.
   A 304 of a second file would still fail it.
2. "A slide" is `.ts-sheet` and also `.pt-slide`, `.ts-thumb` and `.pt-preview-frame` (the editor's
   stage, filmstrip and previews draw a deck's theme, which may be General Translation's), as
   `chrome.type.default-glyphs` of `chrome-surfaces.ts` reads it. A code surface is `code`, `pre`,
   `kbd`, `samp` and `.ts-home-panel` (`CODE_SURFACES`), and any element in a monospace face.
3. `chrome.font.tabular-figures` reads every rendered element (one with a client rect); its docs
   pages are the links of `/docs`'s sidebar.

| Check                                                                                                         | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Load       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `vitest run packages/fonts/src/inter-release.test.ts inter.test.ts catalog.test.ts`                          | 26 of 26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 135        |
| `tsc -b`                                                                                                     | exit 0; `apps/studio/tsconfig.json` up to date after a build that read `font-p2.ts` and `chrome.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                       | 113        |
| `pnpm test` (`vitest run --testTimeout=60000`, every project)                                                 | 5,682 passed, 7 failed, 6 skipped in 9 min 59 s; none of the 7 reads this lane's files: lane N's uncommitted `theme-button.test.tsx` (4), `import.test.ts` (the Prototemplate deck now holds 93 slides against 95), `banner.test.ts` (the CLI reads 2026.1001.3 against `docs/updates.md`'s 2026.1006.1) and `mcp.test.ts` `deck_import_slides` (its own 30 s budget at load 113 to 140) | 113 to 140 |
| `pnpm exec turboslide fonts build --check`                                                                    | 0 stale files, version 4.001+build.3 (39 min, most of it making `.turboslide/venv`)                                                                                                                                                                                                                                                                                                                                                                                                             | 135 to 300 |
| The three rows before they enter the matrix: a scratch copy of `font-p2.ts` with the matrix gate off, run by Playwright against lane F's memory tier dev server on 4741, which serves the working tree with lanes A's and D's uncommitted `/signin`, `/device` and `/docs` | all three passed. `chrome.font.official-inter`: on `/home`, `/decks`, `/new`, `/signin` and `/docs` one font file, `InterVariable-latin.woff2`, 200 with 113,752 B and sha256 `eed1304968c9...` (the record's), plus a 304 of the same file on `/new` and `/signin`; one loaded Inter face (normal, 100 to 900, the Latin range); 6969 248.05 px and 232.63 with ss01 (4 x 1,270 and 4 x 1,191 units: 248.05 and 232.62), aaaa 224.61 and 244.92 with cv11 (224.61 and 244.92), tnum 1111 and 0000 259.38 each. `chrome.font.no-stylistic-sets`: 0 elements with an alternate on all eight pages at 1440 and 390 in both appearances; 4 initials read on `/new`, each `normal` with no style. `chrome.font.tabular-figures`: 0 proportional numbers in both appearances on `/home` (45 and 51 read), `/decks`, `/new`, `/signin`, `/device` and the 19 docs pages of the sidebar (80 on `/docs/reference`) | 120 to 300 |
| The memory tier reading of P2-F#2's rows (one origin, `core-gate --only specs`)                               | `realtime.join.chip-within-1s` passed: chips 938 and 933, 59 and 56, 477 and 475 ms; instance `0aeecdc7` on both reads (one origin, recorded); tier memory, "no object on this tier"; colos unnamed and absent, recorded. `setup.do.two-instances` skipped with "one origin: the row needs A and B on two app instances"                                                                                                                                                                                  | 144 to 158 |

Pictures, each opened and looked at: `f/specimen-1440-light.png`, `f/specimen-1440-dark.png`,
`f/specimen-390-light.png` and `f/specimen-390-dark.png`, the specimen spans on `/home` of 4741
drawn visible (100 px at 1440, 44 px at 390), each with and without its feature and its measured
width: the open 6 and 9 with ss01, the single storey a with cv11, and 1111 and 0000 equal under tnum.

## P2-F#4b, the three face rows enter the matrix

After P2-A#4 (`d2aca415`) and P2-D#2 (`ce2d9edd`) landed. `docs/gslides-parity/focus/core-matrix.json`
gains `chrome.font.official-inter`, `chrome.font.no-stylistic-sets` and
`chrome.font.tabular-figures` at the end of `rows`, as `docs/POLISH-2.md` 6.2 writes them (`today`
works, broken with severity 2, and not driven; their evidence and notes). `font-p2.ts` takes the
specimen again when a dev server's optimizer reload interrupts it: the first run after a server
restart read `document.body` null on `/home` 3 s in, and the second passed.

Readings on lane F's memory tier dev server on 4741, restarted at `d2aca415` (the tree held two
uncommitted files of lane A's mail push, which no row reads), through the scratch copy of the
drivers with the matrix gate off (the same code; the rows register only once they are committed):

| Row                             | Reading                                                                                                                                                                                                                                                                                                                                                         | Load      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `chrome.font.official-inter`    | passed, 18 s: on `/home`, `/decks`, `/new`, `/signin` and `/docs` one font file, `InterVariable-latin.woff2`, one 200 of 113,752 B with the record's sha256 (`eed1304968c9...`), a 304 of the same file on some pages; one loaded Inter face; 6969 248.05 px and 232.63 with ss01, aaaa 224.61 and 244.92 with cv11, 1111 and 0000 259.38 under tnum, on every page | 88 to 99  |
| `chrome.font.no-stylistic-sets` | passed, 371 s: 0 elements with an alternate outside a slide on `/home`, `/decks`, `/decks/templates`, `/new`, `/signin`, `/device`, `/docs` and `/docs/agents` at 1440 and 390 in both appearances; the 4 initials read on `/new` compute `normal` and carry no style                                                                                             | 99 to 120 |
| `chrome.font.tabular-figures`   | passed, 95 s: 0 proportional numbers alone in both appearances; numbers read per appearance: `/home` 54, `/new` 1, the 19 docs pages of the sidebar 105 (80 on `/docs/reference`, 4 on `/docs`), none on `/decks`, `/signin` and `/device`                                                                                                                                       | 99 to 120 |

The run of record through the gate with the committed rows is below, after the commit.
