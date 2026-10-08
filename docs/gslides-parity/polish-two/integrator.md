# Polish two, the integrator

Polish two's integrator wrote this file in two passes in `/Users/kevinliu/repos/Turboslide-polish2`
on `polish2/round`. Pass 2, the regroup after fix round 1 (2026-10-07 23:35 to 2026-10-08 01:40
PDT), comes first. Pass 1, the first integration (2026-10-07 17:12 to 19:30 PDT), follows as it
was written. Its commit hashes are the ones from before the regroups, and section 4 maps each one
to its commit on the branch now. Read first: `docs/POLISH-2.md`, the four lane notes (`f.md`,
`n.md`, `a.md`, `d.md`), `requests.md` (the section "Integrator" and its subsection "The regroup
after fix round 1") and VERIFICATION.md "Polish two, pass 1 (2026-10-07)". Nothing was pushed or
deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read.
Loads are one minute load averages, 93 to 207 in this pass from other sessions' jobs (never
stopped), so no timing here is a verdict. Bytes, counts, boxes and colours do not move with load.

## 1. The state at the start

- `polish2/round` stood at `355437b2`: pass 1's commits, the verifier's pass 1 (`4c12978a`) and fix
  round 1's five commits (`4abb9c56` and `987d47d4` from the integrator, `60986f12` and
  `a2f9765f` from lane D, `355437b2` from the integrator), 37 commits over `f2d48868`. The checkout
  was clean, and no git, build or e2e lock was held.
- `git fetch` read `origin/main` at `925f12f6`, two commits past `f2d48868`: `6776ef43` (the design
  round's release note and production table, docs only) and `925f12f6` (a hotfix: the roster opened
  by a person alone draws "Nobody else has it open", which answers P2-F-2). `design/round` was still
  `f2d48868`. While this pass ran, other sessions pushed three more commits to `main`: `9c0f96a8`
  (two people typing into one title keep both words), `a23a2132` (its verifier's note) and
  `a3f646d8` (the landing's show covers the window at every width). `a3f646d8` carries the whole
  design round, and the branch now sits on it (section 3).
- No request was filed after verifier pass 1. Its seven findings and where each one went are in
  `requests.md` and in section 2.

## 2. What each fix answers, and the integrator's two additions

| Commit (now) | Was | Group | What it answers |
| --- | --- | --- | --- |
| `269ca06c` P2-int fix | `4abb9c56` | F | Verifier finding 2 (severity 2): an empty table's guides draw in the deck's `--hair`, so the column seams show on a dark deck under the light chrome. It sits in the first push, so no push's walk parks `tables` |
| `da011ea0` P2-int fix | `987d47d4` | N | Finding 5: `home.budget.lcp` judges its times on the preview and records them on a local server |
| `6325e756` P2-integrator (N) | new | N | The design round's open finding of severity 1 ("Polish two updates the row", `docs/updates.md`): the hosted smoke's `/home` mark is polish two's hero lead, "Turboslide is a slides editor in the browser. No account is needed." |
| `c5026c2f` P2-D fix | `60986f12` | D | Findings 1 (severity 2) and 3: the docs never scroll sideways, and short inline code never breaks after a flag's hyphens |
| `922ce75b` P2-D fix | `a2f9765f` | D | Finding 4: Help > Help's Documentation link draws in the chrome's ink with an underline |
| `fc0de84f` P2-int fix | `355437b2` | D | Finding 6: the schema, zod and the menu model leave the shared chunk (SPEC-4 3.12). It follows the vendor group of `beb8ffd0` |
| `6f83e8f2` P2-integrator (D) | new | D | Seen on this pass's pictures: the docs' table of contents cut `slide.setBackgroundPicture` (13 px) and `slide.setBackgroundMaterial` (19 px) at its edge on `/docs/reference/slide` at 1440 and 1280. `.ts-docs-toc a` takes the article's `overflow-wrap: break-word` |

Finding 7 (lane A, severity 1: `/home`'s Sign In draws 0.4 to 0.9 s after navigation, since the
prerendered page reads the methods after hydration, as on the design round's tree) has no change
and stays open (section 8).

## 3. The rebases and the reorder

Three runs of `git -c rerere.enabled=false rebase -i` in two scratch worktrees
(`scratchpad/p2reg/wt` and `wt2`). Each todo was written by `GIT_SEQUENCE_EDITOR`
(`seq-editor.mjs`) from an order file, and each pick was followed by an `exec` of
`after-pick.sh`, which checks that the matrix parses with unique ids, that the commit's files hold
no conflict marker, and that README.md's block is current. It never had to regenerate the block.
Before each move of the branch the git lock was held and no tracked file the move changes was
dirty; each move was `git read-tree -m -u` with `git update-ref`. The old heads are kept as
`polish2/round-preregroup` (`355437b2`), `polish2/round-preregroup2` (`2f2e5bfd`) and
`polish2/round-preregroup3` (`9cef742a`).

| Run | Base | Order | Stops | Result |
| --- | --- | --- | --- | --- |
| 1 | `--onto origin/main f2d48868`, `origin/main` then `925f12f6` | the 37 commits as F, N, A, D, with the fix round's commits in their groups | one: `docs/gslides-parity/focus/VERIFICATION.md` at the verifier's pass 1 (`4c12978a`), where `main` and the pick each appended a section at the end. Resolved by keeping `main`'s "Design round, the production table" and then polish two's "Polish two, pass 1", whose 97 lines are unchanged | `5ad2eb99`. Git merged `packages/chrome/src/menus/strings.ts` and `title-row-round1.test.tsx` (`925f12f6` and P2-A#4 changed different lines); each carries this branch's change line for line. The matrix took no conflict, and the head's matrix equals `355437b2`'s byte for byte |
| 2 | `origin/main`, by then `a23a2132` | run 1's order with the smoke commit (made at the head as `2f2e5bfd`) after the LCP fix | none | `00efdd12`. The 14 files that differ from `2f2e5bfd` are `main`'s two new commits, each blob equal to `a23a2132`'s; none is a file of this branch |
| 3 | `origin/main`, by then `a3f646d8` | run 2's order with the table of contents commit (`9cef742a`) at the end | none | `6f83e8f2`. The 2 files that differ from `9cef742a` (`apps/studio/src/components/home/agents.css` and `apps/studio/e2e/core/home/present.ts`) are `a3f646d8`'s, each blob equal to its; this branch changes neither |

Checks of every move: every commit keeps its message, author, author email and author date, and
its `git patch-id --stable` equals the one before the move (39 of 39 in run 3, 38 of 38 in run 2;
in run 1, 36 of 37, where the verifier's commit differs only in the context lines of its
VERIFICATION.md section). Each group's matrix diff is the same in every run (section 4). Commit
messages are kept as written, so a hash inside an older message names the commit as it was then.

## 4. The groups

| Group | Commits in order (pass 1's or fix round 1's hash) | Head | Rows (matrix diff over the previous head) |
| --- | --- | --- | --- |
| F | `5c920f3e` P2-spec (`8ce30713`), `c9a0ac17` P2-F#1 (`5d939cf5`), `46a6c17f` P2-F#2 (`58577c92`), `c8964278` P2-F#3 (`a55a05af`), `7a6b42aa` P2-F#4a (`60859684`), `01ff6cdf` P2-integrator (F) (`516fb670`), `269ca06c` P2-int fix (`4abb9c56`) | `269ca06c` | 1,239 rows; restated `tables.cells.empty-grid-guides`, `realtime.join.chip-within-1s`, `setup.do.two-instances` |
| N | `0c302c2f` P2-N#1 (`4a0dc20c`), `4c61f12b` P2-N#2 (`dcb16fb4`), `12f176c6` P2-N#3 (`f824b10e`), `05c237dd` its notes (`b6c287d9`), `e084840f` P2-integrator (N) (`695f995a`), `da011ea0` P2-int fix (`987d47d4`), `6325e756` P2-integrator (N) (new) | `6325e756` | 1,243; entered `home.nav.no-pause`, `home.nav.fits-320`, `home.nav.theme-first-paint`, `home.hero.side-fits-headline`; restated `home.hero.type`, `home.motion.reduced`, `home.motion.pause`, `home.nav.icons` |
| A | `ddd1da9f` P2-A#1 (`ad0b5156`), `ef5e935b` P2-A#2 (`5c56e920`), `a18a81eb` P2-A#3 (`35a4b056`), `b7df8a51` P2-A#4 (`98ed5ac7`), `8d846441` P2-A#5 (`8f7eea4a`), `6d2c7035` P2-A#4 fix (`29e96d20`), then the integrator's `099d7c8e` (`bc582877`), `0346abbe` (`a3f46276`) and `1e25f5e0` (`0b146c36`) | `1e25f5e0` | 1,255; entered the twelve `accounts.*` rows of 6.4; restated `decks.access.sign-in-link`, `accounts.google-error-sentence`, `accounts.signin.one-dialog`, `accounts.sign-in-fits` |
| D | `da2c3051` P2-D#1 (`938ae469`), `2e7f3844` P2-D#2 (`48ab7deb`), `7891e7ec` P2-D#3 (`c9d9b69d`), `ae565cf1` P2-D#4 (`ed859400`), `88e064e8` P2-D#5 (`ce83ca5f`), `bad33274` P2-D#6 (`6298fad7`), `c5026c2f` P2-D fix (`60986f12`), `922ce75b` P2-D fix (`a2f9765f`), the integrator's `beb8ffd0` (`f3b49f8a`) and `779b1e34` (`eef92a5e`), `fc0de84f` P2-int fix (`355437b2`), `1d5f227b` P2-F#4b (`97dcaa40`), `2f86bcac` its notes (`aec2d38a`), `c3b5ec44` pass 1's notes (`9fefefc1`), `66944a4d` P2-verify1 (`4c12978a`), `6f83e8f2` P2-integrator (D) (new), then this note | this note's commit | 1,266; entered the eight `help.docs.*` rows and the three `chrome.font.*` rows; restated `help.documentation-link` |

P2-F#4b stays in D's push for the reason of pass 1: its rows read `/signin` and `/docs`. No group
is docs only. No group touches the Worker's paths; `main`'s word fix, which does, is in the base.

## 5. The gates

The build of record is `NITRO_PRESET=node-server vite build -c vite.deploy.config.ts` of
`6f83e8f2` in `apps/studio` under `.turboslide/build.lock` (exit 0, 148 s, 01:11 to 01:14, load 106
to 119), served on 4730 (`TURBOSLIDE_MAIL=capture`) and 4740 (`TURBOSLIDE_MAIL=off`) with the
round's environment: a tmp store in a new overlay per start, the memory tier,
`TURBOSLIDE_LOCAL_OPEN=1`, a sqlite identity database each, the auth rate limit off, the fake Google
pair, secrets made per start and never printed. The build before it, of `9cef742a` (exit 0, 202 s, 00:27 to 00:31, load 127 to 151), differs
from it by `a3f646d8`'s two files alone (the landing's show rule in `agents.css` and its row's
driver); the rows of section 6 that ran on it name it.

| Gate | Reading | Load |
| --- | --- | --- |
| `tsc -b` at each group head (scratch worktree `p2reg/wt`, a clean checkout, `pnpm install --offline --frozen-lockfile` where the lockfile changes, routes by `tsr generate`) | F `269ca06c` exit 0 (649 s); N `6325e756` exit 0 (188 s); A `1e25f5e0` exit 0 (312 s); D `6f83e8f2` exit 0 (411 s). The same four on the run 2 heads (`9e2b5132`, `f8d98cee`, `b737dbcd`, `00efdd12`) exit 0 too. This note changes docs alone | 98 to 207 |
| `vitest run --testTimeout=60000` (the whole workspace, on `9cef742a`, 00:35 to 00:52) | 547 files: 5,706 passed, 4 failed, 6 skipped, 2 todo. The standing pair: `packages/import` reads 93 slides in the read only Prototemplate deck where it pins 95, and `apps/cli` `banner.test.ts` reads the CLI's 2026.1001.3 where `docs/updates.md`'s newest entry ("2026-10-08, the design round") now gives 2026.1008.1 (section 8). Two load timeouts passed alone: `packages/schema` `transform.test.ts` (its own 30 s budget for 10,000 random pairs; 32 of 32) and `packages/chrome` `editor-shell-render.test.tsx` (File > Details; 21 of 21). On `6f83e8f2` the files that read `a3f646d8`'s stylesheet passed: `-home-css.test.ts` with `src/components/home` (18 files, 108 tests) and the brand lint's `css.test.ts` (15) | 98 to 135 |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `evidence-policy.test.mjs`, `docs-index.test.mjs`, `competitor.test.ts` | on `6f83e8f2`: the first four and the competitor guard, 4 files, 61 passed (the matrix test reads 1,266 rows); the evidence policy with this note's pictures staged, 6 passed | 109 |
| `node docs/readme/what-works.mjs --check` | README.md is current | 109 |
| The brand lint, `main.ts --enforce` (the competitor guard and `css/chrome-alternates` in it) | exit 0: 568 scripts, 121 stylesheets, 6 HTML and SVG files and 26 mood pictures read; 0 open, 22 accepted, 0 stale | 109 |
| `build-home-assets.ts --check`, `build-colors.ts --check`, `pnpm generate:contracts` then `git status` | 67 outputs match their sources; tokens current; no diff | 109 to 117 |
| `build-brand.ts --check` | exit 0 on `6f83e8f2` (01:16). On `5ad2eb99` it failed twice in a row at 23:50 and 23:51 (load 160) on the card's pixel compare, then passed three times on the same tree (one run in a script of the scratchpad that called the same check, then two of the command at 23:56 and 23:57). Two renders in write mode at 23:52 equal the committed card byte for byte. The compare is exact, so a render under that load can differ; no card was committed | 152 to 166 |
| `check-client-bundle.mjs .output --server .output/server --base http://localhost:4740 --client .output/public` | exit 1, the form check step 31 runs. Under their lines: the largest chunk (`EditorRoot-*.js`, 519,336 B of 600,000; the shared `vendor-*.js` is 515,678 B), `/signin` 519,133 B (600,000), `/deck/gt-brand` 530,397 B (1,000,000), `/edit/gt-brand` 1,041,889 B (2,000,000). Over: `/decks` 686,860 B (600,000) and `/docs` 615,752 B (450,000; the shared chunk alone is over that line). `/home`, `/decks` and `/edit/gt-brand` preload no docs module. `apps/studio/.output/client` is absent, as the form names the non deploy output. Pass 1 read 1,221,252 B for the shared chunk and five routes over | 108 |
| `node scripts/hosted-smoke.mjs http://localhost:4740 --deck gt-brand` | 38 of 40. `/home` passed ("3/3 marks"). The two others are a local server's: "json asset attachment" (the node-server serves the seed deck's asset as a static file without the deck route's asset headers) and "build commit" (a local build has no `instance.commit` stamp) | 108 |

## 6. Rows on the node-server builds (4730, with 4740 for mail off)

| Run | Build | Rows | Result | Load |
| --- | --- | --- | --- | --- |
| 1, `--only specs`, 00:33 to 00:50 | `9cef742a` | the round's 38 spec rows with the seven `home.budget.*` rows and the re-runs `home.hero.font-swap`, `home.hero.stage`, `decks.home.seller-lead` (`setup.do.two-instances` listed apart: one origin) | 35 passed, 0 failed, 3 not driven, retries zero. Not driven: `home.budget.frame` and `home.budget.main-thread` ("not read: load 106.1"), `home.motion.pause` ("not read: load 107.3 (the functional checks passed)") | 92 to 145 |
| 2, `--only accounts` with `TURBOSLIDE_MAIL_OFF_BASE` on 4740, 00:50 to 00:54 | `9cef742a` | the nine local rows of 6.4 and 6.6 | 9 passed | 93 to 119 |
| 3, `--only probe --areas help`, 00:54 to 00:55 | `9cef742a` | the help area, `help.documentation-link` among it | 7 passed | 112 to 119 |
| 4, `--only specs`, 00:55 to 01:04 | `9cef742a` | the regression set: `present.slideshow.button`, `.cmd-enter`, `present.keys.arrow-right`, `present.escape`, `present.presenter-view.arrow`, `export.pdf.file`, `export.pptx.perfect`, `export.pptx.editable`, `images.export.pdf-with-picture`, `tables.export.pdf`, `charts.export.pptx-native`, `lines.connector.export-pptx`, `share.dialog.open`, `share.copy-view-link`, `share.view-link-lands-viewer`, `share.edit-link-lands-editor`, `decks.home.new-presentation`, `decks.home.your-presentations`, `decks.card.present`, and the four rows the diet ran (`decks.new.skeleton-one-frame`, `surface.skeleton.matches-editor`, `realtime.reload.loses-nothing`, `realtime.reconnect.loses-nothing`) | 22 passed, 1 failed: `export.pdf.file` waited 30 s for the download ("Timeout 30000ms exceeded while waiting for event download"), while `tables.export.pdf` and `images.export.pdf-with-picture` downloaded their PDFs in the same run | 111 to 123 |
| 5, `--only probe --areas tables,decks`, 01:04 to 01:10 | `9cef742a` | the walk's tables and decks areas | 63 passed, 1 not driven (`tables.bar.row-column-buttons`, "not on this build", as in every pass), 0 console errors. `tables.light-appearance-guides` and `tables.cells.empty-grid-guides` passed | 114 to 124 |
| 6, `--only specs`, 01:14 to 01:19 | `6f83e8f2` | the landing's rows again on the build of record: `home.present.show` (`a3f646d8`'s row), the round's eleven `home.*` rows, `decks.home.seller-lead` and the seven `home.budget.*` rows | 16 passed, 3 not driven (`home.budget.frame`, `home.budget.main-thread` "not read: load 107.9", `home.motion.pause` "not read: load 108 (the functional checks passed)"), retries zero | 98 to 116 |
| 7, `--only specs`, 01:19 to 01:21 | `6f83e8f2` | `export.pdf.file` read once more, with `export.pptx.perfect` and `tables.export.pdf` | 3 passed (`export.pdf.file` 19.9 s) | 93 to 98 |

Readings of record. `chrome.font.official-inter`: one font file on `/home`, `/decks`, `/new`,
`/signin` and `/docs`, `InterVariable-latin` 113,752 B (sha256 `eed1304968c9...`), one loaded Inter
face; `6969` 248.05 px and 232.63 px with `ss01`, `aaaa` 224.61 and 244.92 with `cv11`.
`chrome.font.no-stylistic-sets`: 0 elements with an alternate outside a slide on eight pages at 1440
and 390 in both appearances. `chrome.font.tabular-figures`: 0 numbers in proportional figures.
`home.budget.bytes-first` (run 6): the document 99,784 B decoded and 16,806 to 16,855 B brotli, the
route chunk 40,768 B and `home-shared` 28,125 B decoded, the page CSS 18,611 B brotli.
`home.budget.live-module`: 55,631 B decoded and 19,760 B gzip. `home.budget.shared`: the shared
chunk 515,678 B (reported against 600,000; pass 1 read 1,221,252 B), one font request of 113,752
B. `home.budget.lcp` (recorded, not judged on a local server): 140, 140 and 272 ms cold on the h1.
`home.present.show`: the show at 1440 by 900 from y 20 with its bar to y 880. `help.docs.page`: the
article 592 px at 1440 and 318 px at 390, the corners 6, 8 and 4 px where the ladder names them.
`help.docs.search`: "theme", 12 hits, Themes and brand kits first, one index request.
`help.docs.twin`: 35 pages. `help.docs.reference`: "194 actions: 181 on the command line, 170 as
MCP tools, 173 as HTTP endpoints and 178 in the page." `realtime.join.chip-within-1s`: 37 to 114
ms on the memory tier with one origin ("no object on this tier"; not a verdict at load 135).
`accounts.device-flow`: `turboslide login` printed `/device` and an 8 character code, the key
granted and in the account's list. `accounts.email-hidden-without-mail`: `dialog.signIn.google`
alone. `accounts.plate.cancel-comes-home`: from `/signin` and from the editor, Cancel at Google
lands on `/signin?next=...&error=access_denied` with "The sign in was cancelled at Google."
`accounts.mail-branded`: the subject "Sign in to Turboslide", the wordmark heading the body. A probe
of the 35 docs pages listed in `/llms.txt` at 1440 and 1280 on the build of `9cef742a`: no link of
the table of contents or the sidebar runs past its box (two did on the build of `00efdd12`).

Not driven on these builds: `setup.do.two-instances` and the do tier clause of
`realtime.join.chip-within-1s` need `wrangler dev` and two origins (P2-F#2's run 2 read one object
id across both origins in every round, `f.md`). A Google sign in that completes is Kevin's
(`accounts.google-roundtrip`).

## 7. Pictures

72 pictures under `integrator/`, at 1440 by 900 or 390 by 844 in light and dark, taken on 4740
(mail off, production's mode), each looked at on a contact sheet of its surface against
POLISH-2.md. The `home-top` four are from the build of record; the others are from the build of
`9cef742a`, whose only difference is the landing's show rule, which none of them draws. They
take the place of pass 1's 58 files of the same names (taken on the capture server; in the
history at `c3b5ec44`): 26 changed (the auth surfaces now in the mail off mode, `docs-cli` with
`--deck <dir>` on one line, `docs-reference`, `home-top`, `decks-bar-1440-light` and
`access-390-dark`) and 32 are the same bytes. They add 14: `docs-advanced` and `docs-slide` (finding 1 and `6f83e8f2`: no page wider
than the window at 390, and the table of contents wraps the two long names at 1440),
`editor-help` (finding 4: Documentation in the chrome's ink, underlined),
`table-guides-dark-deck-light-chrome-1440.jpg` and `table-guides-light-deck-dark-chrome-1440.jpg`
(finding 2: the two column seams and the row rules on each; the seam reads 1.79 to 1 on the dark
deck and 1.51 to 1 on the light one). The capture server's `signin`, `editor-signin` and `device`
at both widths and in both appearances (Google, "or", the email field and Continue) were looked at
and stay in the session's scratchpad (`p2reg/shots-capture/`). The round's tracked pictures hold
24,280,549 B of their 25,000,000 B line, the largest 116,096 B.

What the pictures show: `home-top`, the bar with Documentation, the theme button, one hairline,
Sign In and New Presentation and no motion toggle, the lead in two lines beside the h1's two;
`home-foot`, Pause Motion ending the footer; `decks-bar`, Sign In a link; `signin` and
`signin-cancelled`, the page host with the Blue Marble from 1024 px and none at 390, Google alone
with mail off, "The sign in was cancelled at Google." with Try Again; `device`, "Connect the
command line", sign in first; `access`, one sentence and Sign In; `editor-signin`, the window with
the lede at the 24 px inset, Continue with Google, the foot sentence and no Cancel; `docs`,
`docs-cli`, `docs-reference`, `docs-slide` and `docs-advanced`, the frame, the three sidebar
groups, Copy Page and the table of contents at 1440, short inline code on one line (`--deck
<dir>`); `docs-search`, "theme" with 12 results and Themes and brand kits first; `docs-copy`, the
menu's five rows; `docs-menu`, the sheet at 390; `docs-miss`, Not found with three pages by name;
`editor-help`, the Help dialog with Documentation.

## 8. Open, for the ship and for Kevin

1. A verifier's pass 2 has not read this tree: the fix round's commits, `6325e756`, `6f83e8f2`, and
   `main`'s three commits under the round's work (the word fix touches the editor's controller and
   the realtime client and core).
2. The release stamp: `apps/cli/package.json` reads 2026.1001.3, and `docs/updates.md` now names
   2026.1008.1 (the design round's entry), so `banner.test.ts` is red at every group head. The
   design round's notes give the stamp to the next push that changes code, which is F's push; the
   landing's recorded terminal run prints the version too. The integrator left both to the ship
   step, which writes polish two's own entry and so a newer version (2026.1008.2 if it lands on
   2026-10-08).
3. `home.motion.pause` (feature `decks`, unparkable), `home.budget.frame` and
   `home.budget.main-thread` were not read at any load of this pass (106 to 108); their functional
   checks passed. The guard reads them on the preview.
4. Check step 31 stays red on two lines: `/decks` 686,860 B against 600,000 (its own chunks: the
   menu model and the icon set beside the page) and `/docs` 615,752 B against 450,000 (the shared
   chunk alone is 515,678 B). No line was raised.
5. `setup.do.two-instances` was not driven on the do tier here (section 6).
6. Finding 7 (lane A, severity 1): `/home`'s Sign In draws after hydration, unchanged from the
   design round.
7. `build-brand.ts --check` can fail on the card's exact pixel compare at a high load (section 5).
8. The standing pair of the unit suite (the Prototemplate deck's 93 slides, the CLI's version
   line, item 2).
9. Question 18 of POLISH-2.md stands: `/home`'s page deck rests in the General Translation theme, so
   its slide headings draw `cv11` and `ss01` inside the slides.

## 9. Notes

- The servers on 4730 and 4740 are stopped and the build lock released when this note is
  committed, and the scratch worktrees `p2reg/wt` and `p2reg/wt2` are removed. The run logs are
  under `.turboslide/regroup3/` and `regroup4/` of the checkout (ignored by git); the scripts, logs
  and sheets are under the session's scratchpad (`p2reg/`).
- Two earlier runs of the gates were stopped: one on the build of `5ad2eb99` when `main` moved, one
  on the build of `00efdd12` when `6f83e8f2` was made. The first stop left that run's
  `.turboslide/e2e.lock` behind, which held the next run for 16 minutes until this pass removed its
  own lock. The readings above are from the builds of `9cef742a` and `6f83e8f2` only.

## Pass 1, the first integration (2026-10-07)

Written by polish two's integrator from 17:12 to 19:30 PDT on 2026-10-07 in
`/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round`. Read first: `docs/POLISH-2.md`, the
four lane notes (`f.md`, `n.md`, `a.md`, `d.md`) and `requests.md`, whose section "Integrator"
answers every request. Ports 4730 (captured mail) and 4740 (`TURBOSLIDE_MAIL=off`) served the
node-server builds of this file with the round's environment (a tmp store in a new overlay per
start, the memory tier, `TURBOSLIDE_LOCAL_OPEN=1`, a sqlite identity database, the auth rate limit
off, the fake Google pair, secrets made per start and never printed). Two scratch worktrees of the
session's scratchpad held the reorder and the group typechecks (`p2int/wt` with its own `pnpm
install --offline --frozen-lockfile`, `p2int/wt2` for the third reorder). Nothing was pushed or
deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read.
Times are PDT; loads are one minute load averages, 82 to 582 from other sessions' jobs (never
stopped), so no timing here is a verdict. Bytes, counts, boxes and colours do not move with load.

### Pass 1, 1. The state at the start

- `polish2/round` stood at `12c03471` (P2-F#4b notes): 23 commits over `f2d48868`, the design
  round's whole tree. The checkout was clean, no git, build or e2e lock was held, and no lane
  process was running.
- `git fetch origin` read origin/main at `147b945f` (DR-D5 fix notes), an ancestor of `f2d48868`,
  and `design/round` at `f2d48868`. Neither carries a commit this branch lacks, so no rebase onto a
  newer base ran.

### Pass 1, 2. The requests and the integrator's commits

Every request has its answer in `requests.md`, section "Integrator". The changes, each a commit of
its own in the push of the lane it serves:

| Commit (in the final order) | Request | What changed |
| --- | --- | --- |
| `516fb670` P2-integrator (F) | P2-F-1 | `packages/lint/src/brand/run.ts` hands the generated HTML and SVG under `ALTERNATES_ROOTS` to `lintAlternatesText`; the summary counts them (`texts`) |
| `695f995a` P2-integrator (N) | P2-N-1, P2-N-3 | `<HomeNav />` with no props; `e2e/home-page.spec.ts` reads "Dark or light" and the drawn half disc |
| `bc582877` P2-integrator (A) | A-R2, A-R3, A-R4 | the CSRF filter lets a POST to exactly `/api/auth/device/code` and `/api/auth/device/token` through; `server/auth/device-grant.ts` turns the granted session into an API key named `turboslide login` (the code's scopes, never `admin`) and deletes the session; `roles.spec.ts` reads the access page's link; `accounts.device-flow` approves the CLI's own code too |
| `a3f46276` P2-integrator (A) | none (a gate) | `menus.generated.ts` records `menus/model.ts`'s hash after P2-A#4, so `build-home-assets.ts --check` is current |
| `0b146c36` P2-integrator (A) | none (a row) | the editor's sign in window reads the held `?error=` state on every render and spends it once mounted (`peekHeldSignInError`); `accounts.google-error-sentence` was red on the node-server build (section 6) |
| `f3b49f8a` P2-integrator (D) | P2-D-1, A-R1, P2-D-2, P2-N-2, A-R5 | `robots.txt` names the sitemap; the vendor group leaves out React DOM's server renderers; a `home-shared` group keeps the nine modules `/home`'s route shares with its live bands in one chunk |
| `eef92a5e` P2-integrator (D) | none (a gate) | the social card as chromium-1217 renders it today (section 5) |

P2-F-2 (the roster plate at 390 lists nobody for a person alone) is recorded and not changed:
`RosterMenu` draws the own row from `presence.self` alone while the own chip reads `meOf`; it is
older than the round and outside its files (section 9).

#### Pass 1, 2.1 The shared chunk and /home's document (A-R1, P2-D-2, P2-N-2)

Attribution from hidden source maps (`TURBOSLIDE_CLIENT_SOURCEMAP=1`) of two node-server builds:
the design round's head in `p2int/wt` and this tree.

| Build | Shared chunk | React DOM in it | `/home` document | `/home` preloads |
| --- | --- | --- | --- | --- |
| `f2d48868` (the design round) | `index-*.js` 1,210,171 B | 207,805 B (the client) | 99,756 B | 4 |
| this tree before the fix | `vendor-*.js` 1,430,037 B | 412,759 B (the client and `server.edge`) | 100,588 B | 12 |
| this tree with no vendor group (a trial) | `index-*.js` 229,785 B, 51 chunks preloaded | | 106,482 B | 51 |
| this tree with the fix | `vendor-*.js` 1,221,252 B | 207,805 B | 99,784 B | 6 |

With the docs' lazy chunks in the graph Rolldown honours the vendor group (on the design round's
tree it did not, and the chunk was named `index`), and the group's test matched
`node_modules/react-dom/` whole, so fumadocs-core's on demand `import("react-dom/server.edge")`
(its page tree serializer) went into the chunk every route preloads. The test now leaves out the
server renderers; the renderer is a lazy chunk of 207,680 B that no route preloads. The same
chunking split `/home`'s shared modules (copy with the facts, assets, deck.generated,
design-copy, sprite.generated, people-timing, chrome.generated) into seven chunks; the
`home-shared` group keeps them in one. The schema (521 KB), zod (99 KB) and the menu model (67 KB)
were in the design round's shared chunk already; fumadocs and the docs' text are in no shared
chunk.

The largest chunk line of `check-client-bundle.mjs` stays asserted (the decision P2-D-2 asked
for): it reads the shared chunk at 1,221,252 B over 600,000 B, the class of the route ceilings that
have read over since before the design round. The diet of SPEC-4 3.12 (the schema and zod out of
the root graph) is the fix and is not this round's.

### Pass 1, 3. The reorder

One push per lane in the order F, N, A, D. Three runs of `git -c rerere.enabled=false rebase -i
f2d48868` in a scratch worktree, the todo written by `GIT_SEQUENCE_EDITOR`
(`scratchpad/p2int/seq-editor.mjs`) from an order file, each pick followed by an `exec` of
`after-pick.sh` (the matrix parses with unique ids, no conflict marker in the commit's files,
README.md's block current, regenerated and amended if not; it never had to be). The second and
third runs placed the integrator's later commits in A's and D's groups.

The stops were resolved by `resolve.mjs`, no file edited by hand:

| File | Picks | Resolution |
| --- | --- | --- |
| `docs/gslides-parity/focus/core-matrix.json` | P2-N#1, N#2, A#2, A#3, A#4, D#1, F#4b | the pick's own rows (added, changed, removed by id, against its old parent) applied to HEAD's matrix, each row's text from its side; no row changed on both sides |
| `docs/gslides-parity/polish-two/requests.md` | P2-N#1, A#2, A#3, A#4, D#6 | by `## ` section: the sections the pick added or changed, from its side; a section its old parent had and HEAD lacked arrives with its own lane's commit |
| `README.md` | none stopped | git merged the text; the block was current at every pick |

Checks before each move of the branch: the new head's tree equals the old head's but for the
matrix's row order (1,266 rows, the same by value; the round's 27 rows in push order: N's, A's,
D's, then F's three face rows); every commit keeps its message, author and author date and its
`git patch-id --stable` outside the three files above (inside them too after the second and third
runs); every commit's row delta (added, changed, removed) equals the original's. The moves ran
under the git lock with `git read-tree -m -u` and `git update-ref`, the checkout clean; the old
orders are kept as `polish2/round-prereorder` (`9aff28d5`), `-prereorder2` (`d29780d9`) and
`-prereorder3` (`4df41226`).

### Pass 1, 4. The groups

| Group | Commits, old (new) | Head | Rows from its matrix diff |
| --- | --- | --- | --- |
| F | `8ce30713` P2-spec, `5d939cf5` P2-F#1 (unchanged); `65af8378` (`58577c92`) P2-F#2, `c63d3fc6` (`a55a05af`) P2-F#3, `7a9dd41a` (`60859684`) P2-F#4a, `37b23624` (`516fb670`) the integrator | `516fb670` | restated `realtime.join.chip-within-1s`, `setup.do.two-instances` |
| N | `3f8ff6e2` (`4a0dc20c`) P2-N#1, `f92b81bc` (`dcb16fb4`) P2-N#2, `4bf8cc37` (`f824b10e`) P2-N#3, `0d97190e` (`b6c287d9`) notes, `9d0faa01` (`695f995a`) the integrator | `695f995a` | entered `home.nav.no-pause`, `home.nav.fits-320`, `home.nav.theme-first-paint`, `home.hero.side-fits-headline`; restated `home.motion.pause`, `home.nav.icons`, `home.motion.reduced`, `home.hero.type` |
| A | `c39fc745` (`ad0b5156`) P2-A#1, `6bb60368` (`5c56e920`) P2-A#2, `01a382e4` (`35a4b056`) P2-A#3, `d2aca415` (`98ed5ac7`) P2-A#4, `59a6a2fb` (`8f7eea4a`) P2-A#5, `2e8ee830` (`29e96d20`) A#4 fix, `95a18500` (`bc582877`), `b2ffa64d` (`a3f46276`), `4df41226` (`0b146c36`) the integrator | `0b146c36` | entered the twelve `accounts.*` rows of 6.4; restated `accounts.signin.one-dialog`, `accounts.sign-in-fits`, `accounts.google-error-sentence`, `decks.access.sign-in-link` |
| D | `e9145288` (`938ae469`) P2-D#1, `ce2d9edd` (`48ab7deb`) P2-D#2, `51719156` (`c9d9b69d`) P2-D#3, `3dc0dd3d` (`ed859400`) P2-D#4, `8f49c8d4` (`ce83ca5f`) P2-D#5, `4f04bb0e` (`6298fad7`) P2-D#6, `9aff28d5` (`f3b49f8a`) and `d29780d9` (`eef92a5e`) the integrator, `f86e342d` (`97dcaa40`) P2-F#4b, `12c03471` (`aec2d38a`) its notes, then this note | this note's commit | entered the eight `help.docs.*` rows and the three `chrome.font.*` rows; restated `help.documentation-link` |

P2-F#4b sits in D's push because its rows read `/signin` and `/docs` (POLISH-2.md 7.0), so F's
push carries P2-F#4a's drivers inert (a row of `font-p2.ts` registers only when its id is in the
matrix). No group is docs only, and no group touches the Worker's paths.

### Pass 1, 5. The gates

| Gate | Reading | Load |
| --- | --- | --- |
| `tsc -b` at each group head (scratch worktree, routes generated by `tsr generate`) | F `516fb670` exit 0 (376 s); N `695f995a` exit 0 (145 s); A `0b146c36` exit 0 (134 s; `a3f46276` also exit 0, 339 s); D `aec2d38a` exit 0 (388 s) after `pnpm install --offline --frozen-lockfile` (the docs' dependencies); the notes commit on it changes docs alone | 96 to 129 |
| `tsc -b` in the checkout | exit 0 (18:03 to 18:04) on the tree before `0b146c36`, whose three files the A and D head runs read | 101 to 115 |
| `pnpm test` (`vitest run --testTimeout=60000`, 19:01 to 19:08) | 546 files: 5,691 passed, 2 failed, 6 skipped, 2 todo. The two are the standing pair of every pass: `packages/import` reads 93 slides in the read only Prototemplate deck where it pins 95, and `apps/cli` `banner.test.ts` reads the CLI's 2026.1001.3 against `docs/updates.md`'s 2026.1006.1 | 100 to 127 |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `evidence-policy.test.mjs`, `docs-index.test.mjs`, `competitor.test.ts` | 5 files, 67 passed | 107 |
| `node docs/readme/what-works.mjs --check` | README.md is current | 107 |
| The brand lint, `main.ts --enforce` (the competitor guard and the widened `css/chrome-alternates` in it) | exit 0: 565 scripts, 121 stylesheets, 6 HTML and SVG files and 26 mood pictures read; 0 open, 22 accepted, 0 stale | 107 |
| `build-home-assets.ts --check` | 67 outputs current after `a3f46276` (before it: `menus.generated.ts` stale by its source hash from P2-A#4 on; the menus band draws no row that changed) | 127 |
| `build-brand.ts --check` | exit 0 after `eef92a5e`. Before it the card's pixel compare failed: P2-F#3's card differs from today's chromium-1217 render in 16,421 pixels inside the dithered picture; two renders of the head and one of P2-F#3's own tree agree with each other | 95 to 124 |
| `build-colors.ts --check`; `pnpm generate:contracts` then `git diff` | current; no diff (the docs' reference pages included) | 124 to 136 |
| `check-client-bundle.mjs --base` on the build of record | `/home`, `/decks`, `/edit/gt-brand` preload no docs module; `/home` 6 chunks; `/edit/gt-brand` 1,742,326 B under 2,000,000; over their lines, each on the shared chunk: the largest chunk 1,221,252 B, `/decks` 1,325,595, `/deck/gt-brand` 1,235,965, `/signin` 1,224,707, `/docs` 1,320,872 B; `apps/studio/dist/client` absent (the form names the non deploy output) | 93 |

### Pass 1, 6. Rows on the node-server builds (port 4730, 4740 with mail off)

Build 1: `NITRO_PRESET=node-server vite build -c vite.deploy.config.ts` of `9aff28d5`'s tree, 2 min
(17:58 to 18:00, load 84 to 107). Build 2 (the build of record): the tree of `4df41226`, 18:58 to
18:59. Both read `/home` at 99,784 B.

| Run | Rows | Result | Load |
| --- | --- | --- | --- |
| 1, build 1, `core-gate --only specs`, 18:03 to 18:30 | the 38 spec rows the round entered or restated, with the seven `home.budget.*` rows and the re-runs `home.hero.font-swap`, `home.hero.stage`, `decks.home.seller-lead` | 35 passed, 3 not driven, 0 failed, retries zero. Not driven: `home.budget.frame` and `home.budget.main-thread` ("not read: load 91.8"), `home.motion.pause` ("not read: load 96 (the functional checks passed)") | 82 to 582 |
| 2, build 1, `--only accounts` with `TURBOSLIDE_MAIL_OFF_BASE`, 18:49 to 18:56 | the eight local rows of 6.4 and 6.6 | 7 passed, 1 failed: `accounts.google-error-sentence` opened the window on `methods.google-email` (fixed in `0b146c36`) | 87 to 172 |
| 3, build 2, `--only accounts --rows accounts.google-error-sentence`, 19:00 | the failed row | passed | 95 |
| 4, build 2, `--only specs`, 19:01 to 19:05 | the sign in rows the fix touches and the byte rows: `accounts.signin.one-dialog`, `.sign-in-fits`, `.sign-in-everywhere`, `.dialog-in-brand`, `.google-button-guideline`, `.plate.signin-page`, `.provider-error-sentence`, `decks.access.sign-in-link`, the five byte and LCP budget rows, `home.motion.pause` | 13 passed, `home.motion.pause` not driven ("not read: load 126.2 (the functional checks passed)") | 93 to 126 |
| 5, build 2, `--only accounts`, 19:05 to 19:09 | the eight local rows | 8 passed | 108 to 126 |
| 6, build 2, `--only accounts --rows accounts.email-hidden-without-mail`, mail off on 4740 | the mail off read | passed (`dialog.signIn.google` alone) | 93 |
| 7, build 2, `--only probe --areas help` | `help.documentation-link` and the help area | 7 of 7 passed | 93 to 113 |

Readings of record: `chrome.font.official-inter` one font file, `InterVariable-latin.woff2`, the
record's bytes and sha256 on `/home`, `/decks`, `/new`, `/signin` and `/docs`;
`chrome.font.no-stylistic-sets` no alternate outside a slide on eight pages at 1440 and 390 in both
appearances; `home.budget.bytes-first` the document 99,784 B decoded and 16,827 B brotli, the route
chunk 40,771 B and `home-shared` 28,125 B decoded, the page CSS 18,607 B brotli;
`home.budget.live-module` 55,631 B decoded and 19,750 B gzip; `home.budget.shared` the shared
chunk 1,221,252 B reported against 600,000 and one font request of 113,752 B;
`help.docs.reference` "194 actions: 181 on the command line, 170 as MCP tools, 173 as HTTP
endpoints and 178 in the page."; `help.docs.twin` 35 pages; `help.docs.search` "theme": 12 hits,
Themes and brand kits first, one index request; `accounts.device-flow` `turboslide login` printed
`/device` and a code, the key granted and in the account's list, the CLI's own code approved,
`turboslide login` exit 0 and `account me` with the stored key `agent:tok_...`, a denied code read
`access_denied`, mail off drew `device.google` alone.

Not driven on these builds: `setup.do.two-instances` and the do tier clause of
`realtime.join.chip-within-1s` need the do tier and two origins (`wrangler dev` of the Worker);
P2-F#2's run 2 read one object id across both origins in every round (`f.md`), and the memory tier
reading here passed the chip clause with "no object on this tier".

### Pass 1, 7. Pictures

58 pictures under `integrator/`, each at 1440 by 900 or 390 by 844 in light and dark, taken on
build 1 (build 2 changes no drawn surface: the window's held error state, one hash string and the
social card), every one looked at on a contact sheet of its surface against POLISH-2.md: `home-top` (the bar with no pause control, the hero's
side spanning the headline), `home-foot` (Pause Motion closing the footer), `decks-bar` (Sign In a
link), `signin` and `signin-cancelled` (the page host, the Blue Marble from 1024 px, none at 390),
`device` (Connect the command line, sign in first), `access` (one sentence and Sign In),
`editor-signin` (the window: no Cancel, no footer, the 24 px inset; More, Sign in at 390), `docs`,
`docs-cli`, `docs-reference`, `docs-search` ("theme"), `docs-copy` (the Copy Page menu),
`docs-menu` (the sheet at 390) and `docs-miss` (the three closest pages). 3,516 KB in all, the
largest 121,070 B; the round folder holds 21.4 MB.

### Pass 1, 8. Dependencies between the pushes

- F's push carries P2-F#4a's drivers and no face row; the rows enter with P2-F#4b at the end of D's
  push, after `/signin` (A) and `/docs` (D) exist.
- `help.docs.links` reads red on its robots clause from P2-D#6 to `f3b49f8a`, both in D's push.
- `accounts.google-error-sentence` reads red on a build from P2-A#4 to `0b146c36`, both in A's push;
  `build-home-assets.ts --check` reads the menus file stale over the same span, `a3f46276` closes it.
- `build-brand.ts --check` reads the card's pixels different on today's renderer at the F, N and A
  heads (P2-F#3's card); `eef92a5e` in D's push makes it current. CI compares no card pixels.
- The vendor group takes effect only once the docs' plugin is in the graph (D's push), so at the F,
  N and A heads the shared chunk is the design round's `index-*.js` and `/home`'s document is near
  its 99,756 B (lane N read -42 B for its own three pushes); from D's push on `f3b49f8a` holds the
  document at 99,784 B. No head but the last was built.

### Pass 1, 9. Open, for the ship and for Kevin

1. `home.motion.pause` (feature `decks`, unparkable) is not driven at every load of this session
   (96 and 126): its functional checks passed and its timing clause waits for a load of 20 or less.
   `home.budget.frame` and `home.budget.main-thread` are measured rows not read for the same reason.
   The guard reads them on the preview.
2. Check step 31 stays red as it has since before the design round: the shared chunk over 600,000 B
   and `/decks`, `/deck/gt-brand`, `/signin` and `/docs` over their ceilings on it. No line was
   raised.
3. `setup.do.two-instances` was not driven on the do tier here (section 6).
4. The roster plate under 480 px for a person alone (P2-F-2): `RosterMenu` lists `presence.self`
   only; a follow up reads `meOf` for the own row or hides Collaborators when it would list nobody.
5. Seen on the pictures, not a row: a docs paragraph breaks the inline code `--deck <dir>` after its
   two hyphens at 1440 (`docs-cli-1440-*.jpg`); inline code that should not wrap needs
   `white-space: nowrap` in `docs.css` (lane D's file).
6. The standing pair of the unit suite (the Prototemplate deck's 93 slides, the CLI's version line).

### Pass 1, 10. Notes

- The servers on 4730 and 4740 and the scratch worktrees are stopped and removed when this note is
  committed; the run logs are under `.turboslide/int-gate-*` of the checkout (ignored by git) and
  the scripts, sheets and logs under `scratchpad/p2int/`.
- The round's unit test for the face (`inter-release.test.ts`) and the font build check ran in lane
  F's pushes; `pnpm test` above includes the former. `turboslide fonts build --check` was not run
  again: no font file, subset or record changed after P2-F#4a.
