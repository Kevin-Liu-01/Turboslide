# The design round: the integrator

## Finishing step

Written by the design round's integrator on the finishing step from 09:44 to 10:15 PDT on 2026-10-06 in `/Users/kevinliu/repos/Turboslide-design` on `design/round`. Read first: `docs/DESIGN.md`, this file's two sections below and "Design round, pass 2" in `docs/gslides-parity/focus/VERIFICATION.md`. The rebase ran in a scratch worktree of the session's scratchpad (`finish/wt`, detached) with `-c rerere.enabled=false`, so the shared `rr-cache` neither resolved nor recorded anything. Port 4670 served one node-server build of the rebased head for the readings of section 6; 4680 was not used. Nothing was pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read or written. Times are PDT and loads are one minute load averages (44 to 55 during this step); a timing read at a load over 24 is not a verdict. No picture was taken.

### 1. The state at the start

- `design/round` stood at `f6f66dd3` (the verifier's pass 2): 46 commits over origin/main's `f2b0b7a0`, among them the seam merge `b6ff2fc9` (origin/main at `f2b0b7a0`), so 45 commits that are not merges. The checkout was clean, no git lock was held and no lane process was running.
- origin/main stood at `0a79db8e` ("Ship the people band (V4#20) again"), one commit past the seam. It brings back the band that `14bd67d1` took off, as it was at `0d75ab90`, the commit the round was cut from.
- `design/round-before-finish` was made at `f6f66dd3` at 09:49 under the git lock and keeps the history before this step.

### 2. The rebase

`git rebase origin/main` replays the 45 commits on `0a79db8e` in their order and leaves out the seam merge; each resolution the seam made is made again at the commit that first meets the same lines. The commits before the seam (DR-spec to DR-verify1) were written over `0d75ab90`, which had the people band, so the band's return meets no conflict in them, and the commits after the seam touch none of the band's lines.

| File | Commits that conflicted | Resolution |
| --- | --- | --- |
| `docs/gslides-parity/focus/core-matrix.json` | 15: DR-D1#2, DR-D1#3, DR-D2#1 to #3, DR-D4#4, DR-D4#7 (part), the three D5 fix commits before their notes, DR-D3#1 to #4 and DR-D4#1b | Merged row by row by id (`scratchpad/finish/matrix-merge.mjs`): the rows the commit enters, restates and retires over its parent are applied to the rebased file, each row's text byte for byte from its side. No row changed on both sides in any commit. The same script over `0d75ab90`, `f2b0b7a0` and `189d6655` gives the seam's 1,206 rows, equal by value |
| `README.md` | 18 | Ours outside the "What works today" block, and the block rendered by `docs/readme/what-works.mjs` from the merged matrix. DR-D3#1 also takes its own line "the same 194 actions" (`theme.list`) |
| `scripts/probes/core-matrix.test.mjs` | DR-D1#1 | main's `LANDING_FOLLOWUP` order beside the round's `isDesignRow` filter, as the seam; the file equals the seam's |
| `packages/fonts/src/inter.css` | DR-D1#3 | the round's subset header and generated rules with main's two comment edits; the file equals the seam's |
| `apps/studio/e2e/core/home/page.ts` | DR-D4#4 | the menus h2 read from `MENUS_ROUND.h2`, as the seam |
| `docs/gslides-parity/focus/VERIFICATION.md` | DR-verify1 | main's three production tables, then the round's pass 1 |

After the rebase `what-works.mjs --check` read README.md stale at DR-D5#2b and DR-D1#4 (made by D5): git merged the block's text without a conflict while the matrix merge changed its counts. Both commits were made again with the block rendered (`git commit -C`, which keeps the message, author and date), and the 15 commits after them were picked again with no conflict. The head's tree did not change (`b2e844e8` and `2e1019c2` hold the same tree), and README.md is current at each of the 27 commits that touch README.md or the matrix. The branch moved twice under the git lock, each time after reading the checkout clean and the branch at the expected commit: `git read-tree -m -u` then `git update-ref` at 09:57 (to `b2e844e8`), and `git update-ref` alone at 10:02 (to `2e1019c2`, the same tree).

### 3. Checks of the rebase

- At the last commit before the seam's place (`5951c499`, DR-verify1), the tree equals `git merge-tree` of the seam `b6ff2fc9` with `0a79db8e` in every file but six: the three files the merge leaves in conflict (`README.md`, `apps/studio/e2e/core/home.spec.ts`, `live/index.ts`) as resolved here, `live/bands.ts`, `VERIFICATION.md` and `core-matrix.json`, whose 1,208 rows equal by value the seam's rows merged with `0a79db8e`'s; only their order differs.
- At the head `2e1019c2`, the same six files differ from the merge of `f6f66dd3` with `0a79db8e` (the trial merge of section 7 below), and nothing else: README.md is current; `home.spec.ts` lists `people` then `design`; `live/index.ts` keeps the round's registry in `live/bands.ts`, where the people band's two entries stand (the band module and its markup, `../bands/people.generated`); `VERIFICATION.md` keeps main's "Round 1 follow-up, the production table (2026-10-06)", the 143 lines of `f2b0b7a0` that the seam left out; `core-matrix.json`'s 1,234 rows equal by value.
- Against the old head `f6f66dd3`, the new head adds `0a79db8e`'s 38 files (`HomePeople.tsx` with DR-D4#4's attribute change kept, `live/people.ts`, `people-timing.ts`, the band's block of `motion.css`, `home.tsx`, the home and decks specs, `LANDING.md`, the landing notes and pictures), the two lines of `bands.ts`, the follow-up's production table and the matrix's two `home.people` rows. No file of the round's changes is lost.
- Each of the 45 commits keeps its message, author and author date, and its committer is kevin@generaltranslation.com; 23 keep their old patch id and 22 differ by the resolutions above. main's follow-up and sweep stand: the competitor scan reads 0 mentions (section 5).

The commits, old and new, in order: DR-spec `53c6c9f2` `39c0a9d4`; DR-D1#1 `6fc14f09` `3f5807bf`; DR-D1#2 `ccbe70f0` `19d0a36b`; DR-D1#3 `af1139c5` `2feb9761`; D1 notes `a2e4ede6` `6973fa9f`; DR-D2#1 `7b67283e` `ad310a97`; DR-D2#2 `4ba6688c` `caf5e13e`; DR-D2#3 `1b664daa` `064ed3cc`; the integrator (D2) `78780874` `3276b8ef` and `5f94be30` `e0b6e9b1`; DR-D2 fix `f2210e03` `a30c379a` and `b9686651` `4e178207`; DR-D5#3 `1b5ae8cc` `7cf0caf1`; DR-D5#2a `a78751ce` `67b7f0eb`; DR-D5#1a `081503d0` `5cd472e8`; D5 notes `be6e5f61` `fdcf8d66`; the integrator (D5) `3fe484c8` `ca7a1261` and `39d4799c` `8d520b16`; DR-D4#1 `7d2b3181` `452f91c3`; DR-D4#2 `b034f5f9` `cb77daf7`; DR-D4#3 `612d0946` `44cf71f1`; DR-D4#4 `a4ab2464` `a01beef9`; DR-D4#7 (part) `ab429737` `00b919ea`; the integrator (D4) `6da1f58d` `3c055ee3` and `4b46b826` `c1ad1bca`; the integrator's first note `74d497eb` `d15329e0`; DR-verify1 `189d6655` `5951c499`; the seam `b6ff2fc9`, left out; D5 fix `a9b9515a` `56b9e94b`, `48639f83` `b2be71de`, `75a10c07` `ca651125`, `769863e0` `247aca82`; D3 fix `96ffbcbd` `8f4583d4`, `ab3218bf` `96a97fdb`, `506a2680` `94afb71d`, `64d05da9` `cf2e8112`, `ff45eace` `b9aa15c2`, `0a5b192e` `8e2833eb`, `c893c616` `328c90ff`, `c851570a` `f571d1a0`, `b89d4bc4` `bc58fcd9`; D4 fix `d386a0cf` `e3f3cc32`, `5df84734` `e6cf185f`, `3a2c216e` `607e9f35`; the integrator's second note `78806ee2` `8bee2382`; DR-verify2 `f6f66dd3` `2e1019c2`.

### 4. D3's pushes on `d3/stage`

None waits there. The four pushes `a640deb0`, `868ae672`, `3f86484b` and `2d95465d` are on `design/round` as their ports (now `8f4583d4` DR-D3#1, `94afb71d` DR-D3#2, `cf2e8112` DR-D3#3 and `b9aa15c2` DR-D3#4), and `d3/stage`'s last commit `41bd5748` is `d3.md`'s "The staging record". The staging lane's 45 pictures (1,980,758 B) stay on `d3/stage`, as D3 chose for the round folder's 25 MB line.

### 5. The quick gates on the head

| Gate | Reading | Load |
| --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0, 288 s (on `b2e844e8`, the head's tree) | 46 to 49 |
| The competitor guard | `scanCompetitorMentions` over the tree: 0 mentions in 0 files; `competitor.test.ts` passed | 47 |
| The brand lint (`main.ts --enforce`) | exit 0: 0 open, 19 accepted, 0 stale; reported by the round's rules: 3 findings in 3 files, all `css/z-index` (DR-D1#5 has not landed) | 47 |
| `core-matrix.test.mjs`, `docs/readme` (`what-works.test.mjs`, `evidence-policy.test.mjs`, `docs-index.test.mjs`) and `competitor.test.ts` | 5 files, 66 tests passed | 44 |
| `what-works.mjs --check`, `build-colors.ts --check`, `build-home-assets.ts --check` | README.md current; tokens current; 66 outputs match, 43 files the page names, each in `assets.json` and on disk | 50 |
| The unit tests of the packages with a conflict (`vitest run scripts/probes scripts/home packages/fonts packages/lint apps/studio`) | 151 files: 1,202 passed, 1 failed, 1 skipped. Failed: `apps/studio/src/server/agent-actions.test.ts` "answers deck.info with the reader's counts..." timed out at 5 s; the file alone, twice: 7 of 7 passed (loads 46 and 45). The rebase changes no file under `apps/studio/src/server` | 46 to 55 |

### 6. Rows on the node-server build (port 4670)

The build (`NITRO_PRESET=node-server vite build -c vite.deploy.config.ts` under `.turboslide/build.lock`): exit 0, 86 s, load 50. One run, 10:05 to 10:09, `core-gate --only specs --rows` with 11 rows of the landing, its budgets and the people band, `TURBOSLIDE_OVERLAY_DIR` given: 8 passed, 1 failed, 2 not driven, retries zero (load 50 to 54).

- Passed: `home.page.order` (the people band between agents and present at 1440 and 390 in both appearances, one h1), `home.page.markup-final`, `home.page.bands-after-load`, `home.budget.bytes-first`, `home.budget.live-module`, `home.budget.shared` (one font request, `InterVariable-latin` 113,752 B), `home.radius.ladder` and `home.pictures.all-load`.
- Failed: `home.budget.bytes-page`. The page's own script after a full scroll reads 374,047 B decoded and 121,977 B gzip against 360,000 B and 120,000 B, at 1440 x1 and x2. Pass 2 read 356,209 B and 116,900 B without the band, so the band costs 17,838 B decoded and 5,077 B gzip. The pictures read 152,147 B at x1 and 194,639 B at x2, inside 200 KB.
- Not driven: `home.people.loop` and `home.people.type`. Their functional checks passed and their timings were not read at load 53.8 (a cycle of 13,998 ms; the words on the other screen 121 ms after the last key).

### 7. Blockers and what remains

1. `home.budget.bytes-page` (feature `decks`, unparkable) is red on the head with the people band in. The line is Kevin's (DR-V2.8 item 1): the band alone takes the script to 374,047 B decoded and 121,977 B gzip, past both the 360,000 B and 120,000 B lines and past the 370,000 B decoded of the raised line that pass 2 named; DR-D4#6 adds about 1,200 B gzip more. Either the lines rise or a band's chunk is cut.
2. The people band is on the branch with the round's tokens (`--pt-ink`, `--pt-paper`, `--pt-edge`, `--pt-select`) and Inter, and with its own corners: the two screens, the chip and the Following plate are square, where a figure frame takes 8 px (pass 1 finding 14, DR-D4#6, D4). `home.radius.ladder` passes because its figure frames rung does not name `.ts-people-screen`; DR-D4#6 adds it with the 8 px frame and the Share dialog of DESIGN.md 8.9.
3. Pass 2's open findings 1 and 3 to 9 (D5, D4, D2, D3), then DR-D1#5 last.

### 8. Notes

- The commit ids in the two sections below are the ones before this rebase; section 3 gives each new id. The seam merge `b6ff2fc9` is not on the rebased branch.
- The server on 4670 stopped at 10:09 and the build lock was released. The logs are under `.turboslide/finish/` and `.turboslide/finish-gate-1/` of the worktree (ignored by git); the scripts are under `scratchpad/finish/`.

## After the fix round of pass 1

Written by the design round's integrator from 08:20 to 09:05 PDT on 2026-10-06 in `/Users/kevinliu/repos/Turboslide-design` on `design/round`, which stood at `1b8ba95e` (DR-D4 fix: DR-D4#5) with 81 commits over `0d75ab90` (44 on the first parent) when it began. Read first: the verifier's pass 1 (`docs/gslides-parity/focus/VERIFICATION.md`, "Design round, pass 1") and the fix round sections of `d2.md`, `d3.md`, `d4.md` and `d5.md`. Port 4670 served the node-server output of the head with the round's environment (a tmp store in a new overlay, `.turboslide/integrator2-overlay`, the memory tier, secrets made per start and never printed); 4680 was not used. A scratch worktree in the session's scratchpad (`integrator2/wt`, detached, its own `pnpm install --offline`) held the reorder and the group typechecks. Nothing was pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read or written. Times are PDT and loads are one minute load averages; a timing read at a load over 24 is not a verdict. No picture was taken: the round folder's tracked pictures hold 24,965,217 B of their 25,000,000 B line.

### 1. The state at the start

- The fix round's commits sat in the order they landed: D2's two fixes over the verifier's note, then the seam `0c28197c` (made by D4's lane, origin/main at `f2b0b7a0`), DR-D4#1b, D5's four, D3's nine and D4's two. No lane process was running, the checkout was clean and no git lock was held.
- origin/main reads `0a79db8e` ("Ship the people band (V4#20) again", 05:53), one commit past the seam's `f2b0b7a0`. It is not on `design/round` (section 7, blocker 2).

### 2. The reorder

The fix commits went into their lanes' groups in the lane order of the first pass (D1, D2, D5, D3, D4). A group that needs the seam stays after it, so D5's and D4's fix commits form groups of their own after the seam, and D2's two fixes, which need no file of the seam, join D2's group before it.

- Every step ran in the scratch worktree with `-c rerere.enabled=false`, so the shared `rr-cache` neither resolved nor recorded anything.
- Before the seam: from `5f94be30` (D1 and D2 unchanged), cherry-picks of D2's two fixes, then D5's six commits, D4's seven, the first pass's note and the verifier's note. 17 picks, no conflict. The new pre-seam head `189d6655` has the tree of `7f7c626c` (`9ba9fee2`).
- The seam: made again with `git commit-tree` from `0c28197c`'s tree, its message and its author, on the parents `189d6655` and `f2b0b7a0`, so no merge ran twice: `b6ff2fc9`. Its message still says it merged at `7f7c626c`; `189d6655` holds the same tree.
- After the seam: D5's four commits, D3's nine, then D4's three. DR-D4#1b moves from right after the seam to the head of D4's group. 16 picks, no conflict.
- Checks before the branch moved: the new head's tree equals the old head's (`533e1c1a`); each of the 33 moved commits has the old commit's patch id, message and author.
- The move: `git update-ref` under the git lock, after reading the branch at `1b8ba95e` and the checkout clean. The old order is kept as the local branch `design/round-prereorder2` (`1b8ba95e`); `design/round-prereorder` (`d9dc1f0e`) still keeps the order before the first pass's reorder.

### 3. The groups

| Group | Commits (was) | Head | `tsc -b` at the head (scratch worktree, routes generated) | Rows the group's fix commits entered or restated |
| --- | --- | --- | --- | --- |
| D1 | `53c6c9f2` DR-spec, `6fc14f09` DR-D1#1, `ccbe70f0` DR-D1#2, `af1139c5` DR-D1#3, `a2e4ede6` D1 notes (unchanged) | `a2e4ede6` | exit 0, 82 s, load 40 to 47 | none |
| D2 | `7b67283e`, `4ba6688c`, `1b664daa`, `78780874`, `5f94be30` (unchanged); `f2210e03` (`bb38a436`) DR-D2 fix 1; `b9686651` (`7f7c626c`) DR-D2 fix 2 | `b9686651` | exit 0, 32 s, load 46 to 51 | restated `chrome.colors.pairs-at-floor`, `chrome.split.one-box`, `chrome.cluster.gaps-heights` |
| D5 | `1b5ae8cc` (`c03a2649`) DR-D5#3, `a78751ce` (`55649d34`) DR-D5#2a, `081503d0` (`edc6199b`) DR-D5#1a, `be6e5f61` (`af6d8c9e`) D5 notes, `3fe484c8` (`14e6748c`) and `39d4799c` (`f14dea7d`) the integrator | `39d4799c` | exit 0, 17 s, load 51 to 47 | none |
| D4 | `7d2b3181` (`0854dfb3`) DR-D4#1, `b034f5f9` (`3f2619e7`) DR-D4#2, `612d0946` (`db5f890f`) DR-D4#3, `a4ab2464` (`bfd1f20c`) DR-D4#4, `ab429737` (`96360a07`) DR-D4#7 part, `6da1f58d` (`8486df4f`) and `4b46b826` (`3e3654b8`) the integrator | `4b46b826` | exit 0, 30 s, load 47 to 45 | none |
| Notes, docs only | `74d497eb` (`d863c179`) the first pass's note, `189d6655` (`9928cbba`) the verifier's pass 1 | `189d6655` | exit 0, no source change | none |
| The seam | `b6ff2fc9` (`0c28197c`), origin/main at `f2b0b7a0` | `b6ff2fc9` | exit 0, 70 s, load 45 to 48 | main's rows as the seam's message gives them |
| D5 fix | `a9b9515a` (`37ce503b`) DR-D5#1b and #3b, `48639f83` (`3634acd7`) DR-D5#2b, `75a10c07` (`a5c00b55`) DR-D1#4 made by D5, `769863e0` (`10afed49`) D5's fix notes | `769863e0` | exit 0, 41 s, load 48 to 44 | entered `decks.pages.radius`, `.numerals`, `.default-glyphs`, `.scrollbar`, `.pictures-load`, `accounts.signin.one-dialog`, `export.fonts.upstream-names` |
| D3 | `96ffbcbd` (`d6fb0a24`) DR-D3#1, `ab3218bf` (`a11f46ce`) its driver, `506a2680` (`2c041b25`) DR-D3#2, `64d05da9` (`02097359`) DR-D3#3, `ff45eace` (`c4b7922d`) DR-D3#4, `0a5b192e` (`27a4a677`), `c893c616` (`0037e9f6`), `c851570a` (`57cb4c2f`), `b89d4bc4` (`a79a4eac`) D3's notes | `b89d4bc4`; the reader of DESIGN.md 7.9 is `ab3218bf` | exit 0, 45 s at `b89d4bc4` (load 51 to 42); exit 0, 54 s at `ab3218bf` (load 44 to 51) | entered the 16 `themes.*` rows; restated `fonts.display-features.inter-only`, `slides.layout.plate-four-columns`, `brand.panel.opens`, `brand.background.enter-keeps-open`, `themes.picker.lists-library`; retired `brand.reset.default-kit` |
| D4 fix | `d386a0cf` (`7afda007`) DR-D4#1b, `5df84734` (`10002e21`) DR-D4#7, `3a2c216e` (`1b8ba95e`) DR-D4#5 | `3a2c216e` | exit 0, 26 s, load 42 to 47 | entered `home.present.figure`, `home.export.dialog`, `home.patterns.stills`, `home.kits.themes`; restated `home.export.pdf-appearance`, `decks.home.pictures-three-widths`, `home.page.order` |

DR-D3#1 also writes the `parks` arrays of 146 other rows on several lines where they were on one; each of those rows reads the same values before and after (compared as JSON), so the change is layout only.

At the D3 group's head, which no longer holds DR-D4#1b, the home component tests (`vitest run apps/studio/src/components/home`, the folder of DR-D4#1b's `copy.test.ts`) read 17 files, 100 tests passed (load 46).

### 4. Dependencies between the groups

- `home.export.pdf-appearance` (main's row) presses the navigation's Light and Dark pair at the seam, D5 fix and D3 heads, and DR-D4#1 replaced that pair with one theme button in the D4 group before the seam. The row's driver reads the theme button from DR-D4#1b (`d386a0cf`) on, where it passed on the head (section 6). It is a driver change; the page works at every head.
- `decks.pages.pictures-load` passes at the D5 fix head, where the build has no theme library and the row skips its theme name clause, and fails from DR-D3#1 (`96ffbcbd`) on, where `theme.list` answers and no template card draws its theme's name (section 7, blocker 1). The reader ship of DESIGN.md 7.9 (`ab3218bf`) is the first tree that reads it red.
- DR-D4#5 needs DR-D3#1, which the order keeps. The first pass's note on `decks.pages.access-plates` (red at D5's head before D4's group) still holds for the groups before the seam.

### 5. The gates on the head

| Gate | Reading | Load |
| --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 at every group head (section 3) | 40 to 51 |
| `pnpm test` (`vitest run` at the root), 08:33 to 08:35 | 534 files: 5,510 passed, 2 failed, 6 skipped, 2 todo. Failed: `packages/import` `import.test.ts` reads 93 slides from the read only Prototemplate checkout where it pins 95 (as every pass read); `apps/cli` `banner.test.ts` reads the CLI's 2026.1001.3 where `docs/updates.md` names 2026.1006.1, which is origin/main's state at `f2b0b7a0` and `0a79db8e` too (both keep `apps/cli/package.json` at 2026.1001.3). Neither file is this round's | 45 to 48 |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `evidence-policy.test.mjs`, the no Google guard `competitor.test.ts` | 4 files, 62 passed | 35 |
| The brand lint (`main.ts --enforce`) | exit 0: 0 open, 19 accepted, 0 stale; reported by the round's rules: 3 findings in 3 files, all `css/z-index` (the first pass read 20 in 6 files: D5's fixes cleared `css/chrome-alternates` and `css/numerals`) | 53 |
| `what-works.mjs --check`, `build-colors.ts --check`, `build-home-assets.ts --check`, `packages/agent` `generate --check` | README.md current; tokens current; 66 outputs match, 43 files the page names, each in `assets.json` and on disk; every committed contract current | 54 |
| The node-server build (`NITRO_PRESET=node-server vite build -c vite.deploy.config.ts` in `apps/studio`) | exit 0, 25 s at 08:26 | 36 to 41 |

### 6. Rows on the node-server build (port 4670)

| Run | Rows | Result | Load |
| --- | --- | --- | --- |
| 1, 08:27 to 08:41, `core-gate --only specs --rows` | the 32 spec rows the fix round entered or restated, with the seven `home.budget.*` rows, `home.page.bands-after-load`, `home.kits.restyle`, `home.pictures.all-load`, `home.radius.ladder`, `decks.pages.access-plates` and `decks.home.product-pictures` (45 rows) | 40 passed, 3 failed, 2 not driven, retries zero. Not driven: `home.budget.frame` and `home.budget.main-thread` ("not read: load 32.4"). Failed: `themes.migration.gt-unchanged` and `accounts.signin.one-dialog` for this run's environment (run 3), and `decks.pages.pictures-load` for the head (run 3) | 45 to 29 |
| 2, 08:41 to 08:47, `core-gate --only probe --areas chrome` | the walk's 35 chrome rows | 35 of 35 passed, retries zero. `chrome.split.one-box` and `chrome.cluster.gaps-heights` read 6 px, as DR-D2 fix 2 restated them (the first pass and the verifier read both red) | 29 to 40 |
| 3, 08:47 to 08:48, the three red rows again, the server started with the fake Google client pair of `apps/studio/playwright.config.ts` and core-gate given `TURBOSLIDE_OVERLAY_DIR` so it places the GT deck's twins | `themes.migration.gt-unchanged`, `decks.pages.pictures-load`, `accounts.signin.one-dialog` | 2 passed, 1 failed, retries zero. `themes.migration.gt-unchanged`: theme general-translation, the wordmark, "01 / 95", 2 rails, both rules, 4 crosses, the GT mark with "cv11", "ss01", the panel names General Translation. `accounts.signin.one-dialog`: on /home, /decks and the editor in both appearances an 8 px window, the body 195 over 195, "Continue with Google" 6 px with its mark, Cancel and Continue 6 px. `decks.pages.pictures-load` failed: "light /decks/templates: a template card names no theme" and the same in dark; every picture on the three pages decoded and answered 200. core-gate: "rows of an unparkable feature blocking the ship: decks.pages.pictures-load" | 43 to 35 |
| 4, 08:51 to 08:56, `core-gate --only probe --areas brand,fonts` with `TURBOSLIDE_OVERLAY_DIR` | the walk's 29 brand and fonts rows, among them D3's three restated rows | 26 passed, 0 failed, 3 not driven, retries zero. Passed: `brand.panel.opens`, `brand.background.enter-keeps-open`, `fonts.display-features.inter-only`. Not driven, "not on this build" as D3 and main read them: `brand.logo.use-on-every-slide`, `brand.objects.kit-colours-first`, `fonts.table.takes-family`. core-gate: no row of an unparkable feature blocks the ship | 32 to 46 |

The landing's budgets (DESIGN.md 8.16), read in run 1:

| Measure | Reading | Line |
| --- | --- | --- |
| Document | 95,429 B decoded, 16,141 to 16,165 B brotli | 100,000 B (4,571 B of room); 20 KB brotli |
| Page CSS | 17,157 B brotli | 20 KB brotli |
| Route chunk | 64,492 B decoded, 15,114 B brotli | 70 KB, 22 KB |
| Live core with its imports | 55,310 B decoded, 19,683 B gzip | 64 KB, 20,480 B gzip (797 B of room) |
| Largest band chunk | menus, 47,762 B decoded, 15,948 B gzip | 56 KB, 16 KB gzip |
| Page's own script after a full scroll | 356,209 B decoded, 116,900 B gzip | 360,000 B (3,791 B of room), 120,000 B gzip (3,100 B of room) |
| Pictures after a full scroll | 25 files, 152,147 B at x1 and 194,639 B at x2; 0 before load | 200 KB |
| Font | one request, `InterVariable-latin` 113,752 B | reported against 120 KB |
| Shared script | entry 1,210,065 B; all shared 1,371,151 B | reported |
| CLS, LCP | CLS 0 at 1440 and 390 with every band filled; the h1, 172 to 196 ms cold (load 32, not a verdict) | 0; 400 ms |

Other readings of run 1: `home.kits.themes` 9 tiles and Swiss on 41 slides and back in each appearance at 1440 and 390; `home.present.figure` the presenter view at 1022 px (356 px at 390) in an 8 px frame; `home.export.dialog` the Download dialog with the readout's done glyph; `home.patterns.stills` 17 cards in 2 rows at 1440 and 1 row at 390, CLS 0; `home.page.order` one h1 and the bands in DESIGN.md 8's order.

### 7. Blockers and what remains

1. `decks.pages.pictures-load` (feature `decks`, unparkable) fails on the head: DESIGN.md 9 asks each template card on `/decks/templates` to name its theme, D5 left the clause for after DR-D3#1 (`d5.md`, "Not done"), and DR-D3#1 is now on the branch. Owner D5: `TemplateCard` in `apps/studio/src/server/templates.ts` gains the theme's name (`themeName(document.deck.theme)` from `@turboslide/theme/themes`), and the card in `decks.templates.tsx` draws it in `.ts-gallery-theme` beside the slide count, with its rule in `decks.templates.css`. The commit lands after DR-D3#1, and the reader ship needs it.
2. origin/main's `0a79db8e` (the people band again) is not on `design/round`. A trial `git merge-tree --write-tree` of the head with it reads three conflicted files: `README.md`, `apps/studio/e2e/core/home.spec.ts` and `apps/studio/src/components/home/live/index.ts` (the band registry the first seam moved to `live/bands.ts`). This is a second seam, the orchestrator's (DESIGN.md 10.0). D4's estimate puts the band at about 4,500 B gzip of the page's own script, which reads 116,900 B against 120,000 B today, so the line question below decides whether the band can join.
3. DR-D1#5 (the round's six lint rules to enforce) has not landed and is the round's last push; DESIGN.md 10.0 places it after every other lane's last push. The lint reports 3 findings, all `css/z-index`: the three inline z-index lines accepted for DR-D1#5 in the first pass.

### 8. Pass 1 findings after the fix round

| # | State on the head |
| --- | --- |
| 1 Themes | Done: the 16 `themes.*` rows passed; `/new` and Blank are Simple, nine themes, Reset to the theme |
| 2 Google Slides words | Done through the seam; the no Google guard's test passes |
| 3 The landing's 8.7 to 8.12 | DR-D4#5 and the rest of DR-D4#7 done and read; DR-D4#6 (agents as Version history, the two people band) not done |
| 4 General Translation's cuts | Done: `/decks`, the trash and the book view without the alternates; the PowerPoint file names the upstream Inter families |
| 5 The Theme panel's square controls | Done: 6 px (`themes.picker.lists-library`) |
| 6 The editor's Sign in scroll | Done: body 195 over 195 everywhere |
| 7 The search card's key chips | Done: `chrome.colors.pairs-at-floor` passed |
| 8 The split button's walk rows | Done: 35 of 35 chrome walk rows |
| 9 to 14 | Not in the fix round: the hero frame's title still sets `line-height: 1` on 14 px text with `overflow: hidden` (9); the hero frame's dark Slideshow (10); proportional figures in Version history's row time and the shortcuts dialog's chips (11); "Copy link", "Reset to theme", "Add to theme", "Recent presentations", "Empty trash", "Delete forever", "Use a passkey" and the editor's "Sign in" still in sentence case in `menus/strings.ts` (12, with D5's request 7); Tailor's glyph (13); the two people band's frames (14, DR-D4#6) |

### 9. For Kevin

1. The landing's own script reads 116,900 B gzip against its 120,000 B line with every band of DR-D4#5 and #7 in. The people band (about 4,500 B, on main since 05:53) and DR-D4#6 (about 1,200 B, D4's estimate) do not fit under it together: either the line rises to 124,000 B gzip and 370,000 B decoded, or a band's chunk is cut first.

### 10. Notes

- The server on 4670 was stopped and `.turboslide/build.lock` released at 08:49, and again at 08:56 after run 4. The scratch worktree was removed after the last typecheck and test.
- The commit ids in the first pass's record below are the ones before this reorder; the table of section 3 gives each new id beside the old one. Lane notes and commit messages written before 08:33 name the old ids as well.
- The run logs are under `.turboslide/integrator2-gate-1` to `-4` of the worktree (ignored by git); the scripts are under `scratchpad/integrator2/`.

## The first pass, before the verifier's pass 1

Written by the design round's integrator from 03:15 to 04:45 PDT on 2026-10-06 in `/Users/kevinliu/repos/Turboslide-design` on `design/round`, which stood at `59724eb2` (DR-D4#7, part) with 17 commits over `0d75ab90` when it began. Read first: `docs/DESIGN.md` (every section), the lane notes `d1.md`, `d2.md`, `d4.md` and `d5.md`, D3's note on its staging branch (`41bd5748:docs/gslides-parity/design-round/d3.md`) and `requests.md`. Port 4670 served the node-server output with the round's environment (a tmp store, the memory tier, secrets made per start and never printed); 4680 was not used. A scratch worktree in the session's scratchpad (`integrator/wt`, detached) held the reorders and the group typechecks. Nothing was pushed or deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read or written. Times are PDT and loads are one minute load averages; a timing read at a load over 24 is not a verdict.

### 1. The state at the start

- The lanes' pushes sat in the order they landed: DR-spec, DR-D1#1 to #3 and D1's notes, then DR-D4#1, DR-D5#3, DR-D2#1, DR-D2#2, DR-D4#2, DR-D5#2a, DR-D4#3, DR-D2#3, DR-D5#1a, DR-D4#4, D5's notes and DR-D4#7 (part). No lane process was running. The working tree held one stale copy of `core-matrix.json` written at 02:56 (the same 1,194 rows in another order, read row by row against HEAD); it was put back to HEAD's text.
- There is no "DR-seam: merge origin/main" commit. `git ls-remote` read origin/main at `bfba1963` (R1F-D integrator), 29 commits past `0d75ab90` and touching 278 files, 17 of which this round also changes. `followup/round` stands 7 commits further at `95808c36` (R1F-E's landing fixes and the R1F integrator's FOCUS.md). DESIGN.md 10.0 gives the seam to the orchestrator, once; the integrator did not make it.
- D3's four pushes are not on `design/round`: they are `a640deb0`, `868ae672`, `3f86484b` and `2d95465d` on the local branch `d3/stage`, over a local merge of `followup/round` at `4e127c13`, with patches in `scratchpad/d3/ports/`.

### 2. The requests and their answers

| Request | From, to | Answer | Commit |
| --- | --- | --- | --- |
| `place.ts`: `size` before `shift` when `fit` is set | D2 1, D1 or the integrator | Done. A new test puts a 600 px plate under an anchor at 40 in a 360 px window at top 70 with max-height 282; the old order read top 8, over the anchor | `78780874` |
| `ExportMenu.tsx`: `usePlate` and `.pt-float` if the menu is mounted again | D2 2, D1 or the integrator | No change: D2 read the menu mounted nowhere, and its sheet already reads the scale. Whoever mounts it takes `usePlate(card, { layer: 'popover', anchor: button })` | none |
| The link popover over a slide on `.pt-float` | D2 3, the integrator | Done for the popover and for the link chip in a session (`InlineText.tsx`) and on the overlay (`Overlay.tsx`): 6 px, the `--pt-edge` frame, the ring, the stage's local order; the field and select on the field boundary; field, select and buttons at the 4 px chip corner | `78780874` |
| The toolbar's `view.copyLink` reads "Copy Link" | D3 3, D2 | Done in `Toolbar.tsx`; its accepted `gt-ui/cta-title-case` finding leaves the lint config in the same commit. The Share dialog's own "Copy link" is `strings.ts` and changes with DR-D3#4 | `78780874` |
| `Slideshow.tsx`: `layer={useLayer}` on the shortcuts card and the show's slide list, `useLayer(root, { layer: 'show' })` | D5 1, the integrator | Done, with two findings of the integrator's own: a full screen element enters the top layer above every surface already in it, so `Layer.ts` shows the open surfaces again in the scale's order on `fullscreenchange` (read in Chromium: `elementFromPoint` over a manual popover's bar answered the page after `document.documentElement.requestFullscreen()` until the popover was shown again); and in the top layer the show's `inset: 0` resolved against the window, which put the phone's toolbar about 500 px under the slide, so the show is fixed on its stage's box before it enters the layer and follows it | `14e6748c`, `f14dea7d` |
| `NUMERALS_OWNERS` with the standalone deck's copy | D5 2, D1 | Done in `config.ts`, `css.ts`, `source.ts`, with a test | `14e6748c` |
| `"./dialogs/SignIn"` in the chrome's exports | D5 3, D1 or the integrator | Done; the one Sign in dialog itself is DR-D5#2b, after the seam | `14e6748c` |
| The shortcuts card's headings in sentence case with their acceptance | D5 4, the integrator (optional) | Done: 12 px titanium as the editor's Keyboard shortcuts dialog draws its group headings; the accepted `css/no-eyebrow` finding leaves in the same commit. The picker titles (`Pickers.css`), the other accepted eyebrow, went the same way in D2's push | `14e6748c`, `78780874` |
| The lockup word's alternates | D5 5, D2 | Answered in DR-D2#3. `packages/theme/src/brand.test.ts` still expected the alternates and failed in the whole suite; it now reads no feature list | `5f94be30` |
| The profile's session list on `.pt-scroll` | D5 6, D2 | Answered in DR-D2#3; `accounts.css` drops its two lines in DR-D5#2b | none |
| Title Case on the trash's buttons, the title row's Sign In and "Use a Passkey" | D5 7, D3 | Waits: `menus/strings.ts` is on the seam list, and D3's staged DR-D3#4 does not carry these words. For D3's port | none |
| `ThemeButton` without the editor's icon table | D4, D2 | Done: the button draws ToolButton's markup itself and imports no icon. The home route's chunk now imports `ThemeButton`, `useMountEffect` and `theme` only; the 51,136 B icon table no longer loads on `/home` | `8486df4f` |
| A `resolveDependencies` filter for the landing's live chunks | D4, the integrator | Not done. With the icon table gone, the live core's preload list names 12 small files the route has already loaded (about 400 B decoded in the core); the core reads 19,739 B gzip, 741 B under its line. A Vite option for every route is more risk than those bytes | none |
| The inline z-index lines of `live/paint.ts` and `live/theme.ts` | D4, D1 | Accepted as local order inside a slide's stacking context, with `MaterialMount.tsx`'s copy of a material block's z-index, owner "the integrator" (the run test allows a lane key of Round 1 or the integrator). They report until DR-D1#5 and are accepted after it | `8486df4f`, `3e3654b8` |
| `home-page.spec.ts`: the theme button and the round's words | D4 (two requests), the integrator | Done: the h1 lines, the lead, the menus and close h2s from `design-copy.ts`, and the navigation's `view.theme` button in place of the Light and Dark pair. 12 of 12 passed on 4670 | `8486df4f` |
| `decks.home.seller-lead` reads the new h1 | D4, D5 | Done in `decks.spec.ts` (two locked lines) and restated in the matrix; passed on 4670 | `8486df4f` |
| The renderer's CSS in every page's head without comments | D4, the integrator | Done through `packages/render/src/block-css-page.ts` (`block-css.ts` is on the seam list): 18,656 B where the head inlined 29,311 B; `/home`'s document reads 88,581 B, where DR-D4#7 read 99,304 B | `8486df4f` |
| View > Live pointers' glyph | D4, D2 | Waits: `menus/model.ts` is on the seam list | none |
| The page's own script line | D4, Kevin | Section 8 | none |
| `live/paint.ts` on the one contrast function | D1, D4 | Waits for DR-D3#1: the landing's copy is pinned equal to `theme-css.ts`'s, which DR-D3#1 moves onto `@turboslide/theme/contrast` | none |
| The build printed the local agent token | D1, the integrator | The file was deleted before the integrator's build, which minted a new one. The build prints a new token once by design (SPEC-3 7.7); it went to the build log in the scratchpad and was never shown | none |
| Prototemplate's Firefox scrollbar gate | D1, the integrator | For the ship note: Prototemplate `DESIGN.md` 165 to 169 and `deck/parts/head.html` 188 to 198 gate on `not selector(::-webkit-scrollbar)`, which no engine answers; they are Prototemplate's to change | none |
| The GT word draws the GT mark in every theme | D3 1, the integrator or D2 | Waits for DR-D3#1 (`themeFactsOf`) and the seam (`slide.ts` and `Editor.tsx` are on its list) | none |
| Import Theme | D3 2, the integrator | Waits for D3's port | none |
| The theme literal of `Sidebar.tsx` and `source/apply.ts` | D3 3, D2 | Waits for DR-D3#1 | none |
| The page deck's id | D3 4, D4 | Waits for DR-D3#2 | none |
| `deck.create` without `from` on the studio's window path | D3 5, the integrator | Waits for DR-D3#2 | none |

Found by the integrator's gates and fixed in the push they belong to:

- `apps/studio/src/routes/-home-css.test.ts` failed on the lanes' head (`59724eb2`): 14 selectors of the landing's sheets named classes other pages draw (`.ts-fo` and its parts, the editor's Format options; `.ts-present-keys`, the show's shortcuts table; `.ts-glyph`, the editor's icon picker). After `/home` a client navigation keeps the landing's sheets, so the editor's panel and the show's table took the landing's grid and inline-flex. Each now names the landing's root `.ts-product` (`8486df4f`).
- `apps/studio/src/styles.css` (no lane's file) carried three alternates and four literal `tabular-nums`; it now reads Inter's defaults and `var(--pt-numerals)` (`14e6748c`).
- `home.scroll.regions` failed on the build with every bar right: the build's minifier writes `rgba(255, 255, 255, 0.44)` as `#ffffff70`, and the driver compared the token's text. It now compares the two as colours (`3e3654b8`).

### 3. The pushes

One push per lane in the order D1, D2, D5, D3, D4, each with the integrator's answers to the requests on its files. The reorder ran `git rebase -i 0d75ab90` in the scratch worktree, the todo written by a `GIT_SEQUENCE_EDITOR` script from the list of commits in the new order. The steps that stopped were resolved by script: `core-matrix.json` by moving the picked commit's own rows (added, changed and removed by id, each row's text kept byte for byte, since the file is prettier-ignored and carries the lanes' layout), `README.md` regenerated by `docs/readme/what-works.mjs`, and `requests.md` by lane section. The new head's tree equalled the old head's (`git rev-parse <head>^{tree}`) before `git update-ref` moved `design/round` under the git lock; the order before is kept as the local branch `design/round-prereorder` (`d9dc1f0e`). A second reorder, the same way, placed the three fixes the gates found after the first one in their pushes (tree `dcfd9abe` equal before and after). Each commit's diff of the matrix and README is its own rows and its README line.

| Push | Commits | Head | Typecheck of the head (`tsc -b` in the scratch worktree, routes generated) | Rows entered (restated) |
| --- | --- | --- | --- | --- |
| D1 | `53c6c9f2` DR-spec, `6fc14f09` DR-D1#1, `ccbe70f0` DR-D1#2, `af1139c5` DR-D1#3, `a2e4ede6` D1 notes | `a2e4ede6` | exit 0, 57 s and 60 s, load 156 and 66 | `chrome.colors.pairs-at-floor`, `chrome.font.one-subset`, `chrome.font.on-demand` (`fonts.inter.italic-release`) |
| D2 | `7b67283e` DR-D2#1, `4ba6688c` DR-D2#2, `1b664daa` DR-D2#3, `78780874` and `5f94be30` the integrator | `5f94be30` | exit 0, 118 s at load 74 at `78780874`; 4 s at `5f94be30` (one test file more) | the five `chrome.layers.*`, the four `chrome.radius.*`, `chrome.plates.separation`, `versions.field.corner` (retires `versions.field.square`), `chrome.scroll.default-everywhere`, `chrome.scroll.stage-track`, `chrome.numerals.tabular`, `chrome.type.default-glyphs`, `chrome.appearance.system-until-picked` (`chrome.buttons.one-rule`) |
| D5 | `c03a2649` DR-D5#3, `55649d34` DR-D5#2a, `edc6199b` DR-D5#1a, `af6d8c9e` D5 notes, `14e6748c` and `f14dea7d` the integrator | `f14dea7d` | exit 0, 26 s, load 46 to 61 | `present.presenter.surfaces`, `view.deck.surfaces`, `decks.pages.access-plates` |
| D3 | none on `design/round` | | | |
| D4 | `0854dfb3` DR-D4#1, `3f2619e7` DR-D4#2, `db5f890f` DR-D4#3, `bfd1f20c` DR-D4#4, `96360a07` DR-D4#7 (part), `8486df4f` and `3e3654b8` the integrator | `3e3654b8` | exit 0, 43 s, load 61 to 70 | `home.nav.icons`, `home.type.default-glyphs`, `home.radius.ladder`, `home.scroll.regions`, `home.pictures.all-load`, `home.hero.frame-chrome`, `home.hero.terminal-never-empty`, `home.hero.steps`, `home.menus.icons`, `home.canvas.panel`, `home.tailor.dialog`, `home.diagrams.flows` (`home.motion.pause`, `home.hero.type`, `home.hero.stage`, `home.budget.bytes-first`, `decks.home.seller-lead`, `home.numbers.row`, `home.features.table`, `home.menus.bar`, `home.canvas.log`, `home.tailor.filmstrip`, `home.kits.restyle`) |
| The integrator's note | this file and the pictures under `integrator/` | the commit after `3e3654b8` | docs only | |

D3's commits wait on `d3/stage` for the seam (section 6). D3's own trial took its four patches onto `d4ae7431` with origin/main merged and no rejected hunk. Of D3's 140 files, the commits after that trial change three: `README.md` and `core-matrix.json`, which D3's port regenerates and enters by id, and `apps/studio/src/components/home/copy.test.ts`, whose D3 hunks still apply to the head (`git apply --check` of the four patches on that file).

Dependencies between the pushes, read from the lanes' notes and the integrator's runs:

- Every push lands on main only through the seam: `design/round` forks at `0d75ab90`, and origin/main moved 29 commits since.
- `decks.pages.access-plates` (D5) reads the refused page's and Not found's buttons at 6 px through `page-frame.css`, which DR-D4#1 changed. At D5's head, before D4's push, it reads the old corner. The two pushes go in one deploy, or the row is read after D4's.
- `home.radius.ladder` (D4) reads the shared tooltip at 6 px, which D2's push draws; D2 goes first, as ordered.
- DESIGN.md 7.9 and question 31: the tree through DR-D3#1 ships before the tree that holds DR-D3#2, and DR-D4#5 needs DR-D3#1.

### 4. The gates on the head

| Gate | Reading | Load |
| --- | --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 on the head in the design worktree (04:20) and on each group head (section 3). The first pass at the D2 head printed one TS6053 for a file the previous checkout lacked and exited 0; the rerun read no message | 40 to 160 |
| `pnpm test` (`vitest run` at the root), 04:22 to 04:25 | 514 files: 5,386 passed, 2 failed, 6 skipped, 2 todo. `apps/studio/src/server/agent-actions.test.ts` timed out at 5 s; alone with a 120 s bound, 7 of 7 passed. `packages/import` `import.test.ts` reads 93 slides from the read only Prototemplate checkout where it expects 95, as D1 read on 2026-10-05; not this round's. The first run at 03:50 also read `brand.test.ts` and `run.test.ts` red, fixed in `5f94be30` and `3e3654b8` | 49 to 68 |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `evidence-policy.test.mjs` | 53 passed, the last with this note's 16 pictures staged (each under 200,000 B, 1,732,373 B in all) | 40 |
| `node docs/readme/what-works.mjs --check` | README.md is current | |
| The brand lint (`main.ts`, enforce) | 0 open, 19 accepted, 0 stale (22 accepted before: three acceptances left with their fixes). Reported by the six rules of the round, never failing until DR-D1#5: 20 findings in 6 files, where the head read 27 in 7: `decks.css` 6 and `BookView.css` 9 (DR-D5#1b, #3b), `accounts.css` 1 (DR-D5#2b), and the three z-index lines accepted for DR-D1#5 | 150 |
| `build-colors.ts --check`, `build-home-assets.ts --check` | current; 38 outputs match, 18 files the page names, each in `assets.json` and on disk | 148 |
| The node-server build | 40 s at 03:41 (load 340); 25 s at 04:28 after the show's stage box (load 48) | |
| `check-client-bundle.mjs --base` on 4670 | exit 1 on the tree's standing readings: `/decks` 1,331,477 B (ceiling 600,000), `/deck/gt-brand` 1,223,437 B (1,000,000), `/edit/gt-brand` 1,728,293 B under 2,000,000; the shared entry chunk 1,208,204 B, reported. DR-D1#1 read 1,310,277, 1,202,101 and 1,186,868 before any of the round's script: the entry grew 21,336 B through the round | 270 |

### 5. Rows on the node-server build (port 4670)

| Run | Rows | Result | Load |
| --- | --- | --- | --- |
| 1, 03:42 to 03:55 | the 47 spec rows the round entered or restated, the seven `home.budget.*` rows and `home.page.bands-after-load` | 49 passed, 1 failed, 3 not driven, retries zero. Failed: `home.scroll.regions`, the driver's text compare of the thumb token (section 2). Not driven: `home.motion.pause` (its functional checks passed: C1 at its end 23.4 ms after the press, 0 frame callbacks paused at the top, middle and bottom; the timing not read at load 58), `home.budget.frame` and `home.budget.main-thread` (not read at load 58) | 244 to 61 |
| 2, 03:55 to 04:05 | the whole `core/chrome.spec.ts` and `core/present.spec.ts` | 73 of 73 passed, retries zero; `chrome.layers.follows-anchor`: the Theme panel's font picker at 333 under its anchor at 331.4, 213 under 211.4 after a 120 px scroll, in the `popover` layer | 68 to 65 |
| 3, 04:05 to 04:14 | the walk areas `share`, `chrome` and `polish-text` | 58 of 61 passed, retries zero. Failed: `chrome.split.one-box` and `chrome.cluster.gaps-heights` (the walk's drivers expect the 8 px Slideshow and a square Share; read: "box 133x32 radius 6px", "corners share 6px, split 6px"; DR-D2#2b restates both after the seam, section 6), and `versions.show-changes-marks` (`today` not driven, a row of an earlier round; "marks with Show changes on 0", the reading D2 had on 4662) | 65 to 161 |
| `home-page.spec.ts`, 04:14 | the whole file | 12 of 12 passed | 161 |
| 4, 04:21 to 04:23 | `home.scroll.regions`, `home.radius.ladder`, `home.canvas.panel`, `home.type.default-glyphs` after the driver fix | 4 of 4 passed, retries zero | 50 to 69 |
| 5, 04:29 to 04:31, the rebuild | the whole `core/present.spec.ts` | 35 of 35 passed, retries zero; `present.presenter.surfaces`: the show's slide list in the `popover` layer and the shortcuts card in the `dialog` layer, each first at its centre, in both appearances (D5 read "layer none" before the hook was handed in) | 46 to 42 |

The landing's budgets (DESIGN.md 8.16), read in run 1 on the build:

| Measure | Reading | Line |
| --- | --- | --- |
| Document | 88,581 B decoded, 15,179 B brotli | 100,000 B; 20 KB brotli |
| Page CSS | 17,139 B brotli | 20 KB brotli (question 32) |
| Route chunk | 61,848 B decoded, 15,471 B brotli | 70 KB, 22 KB |
| Live core with its imports | 55,381 B decoded, 19,739 B gzip | 64 KB, 20,480 B gzip |
| Largest band chunk | menus, 47,762 B decoded, 15,943 B gzip | 56 KB, 16 KB gzip |
| Page's own script after a full scroll | 357,645 B decoded, 119,899 B gzip | 360,000 B, 120,000 B gzip |
| Pictures after a full scroll | 57,133 B at x1 and at x2, 0 before load | 200 KB |
| Font | one request, `InterVariable-latin` 113,752 B | reported against 120 KB |
| Shared script | entry 1,208,204 B; all shared 1,369,377 B | reported |
| CLS, LCP | CLS 0 at 1440 and 390; the h1, 188 to 228 ms cold (not read, load 62 to 64) | 0; 400 ms |

### 6. What waits for the seam

The merge of origin/main into `design/round` (DESIGN.md 10.0) is the orchestrator's, and every push lands on main through it. Each part below touches a file of the seam list or needs DR-D3#1, and each lane prepared its part:

- D1: DR-D1#4, the PowerPoint family names (`packages/export/src/pptx/*`); DR-D1#5, the six rules to enforce, after every other lane's last push.
- D2: DR-D2#2b, the restatement of `chrome.split.one-box` and `chrome.cluster.gaps-heights` in `scripts/probes/core-walk/areas/chrome.mjs` and `toolkit.mjs`. Both read red on the walk today (section 5), and both are rows of the unparkable `chrome` feature, so D2's push holds the ship until they are restated. Also the Tailor row's `pencil` and View > Live pointers' glyph (`menus/model.ts`), and the theme literal of `Sidebar.tsx` and `source/apply.ts` after DR-D3#1.
- D3: the port of DR-D3#1 to #4 from `d3/stage`, with D3's requests 1, 2, 4 and 5 and D5's request 7.
- D4: DR-D4#1b (the navigation's motion words and the footer's sentence that names another company's slides app, both in `copy.ts`); DR-D4#5 (themes and kits, after DR-D3#1); DR-D4#6 (agents and two people, after the people band: origin/main reverted the band in `14bd67d1`); the rest of DR-D4#7 (the captured presenter view, the Download dialog, the pattern stills: the document now has 11,419 B of room, the page's own script 101 B, section 8); `live/paint.ts` on the one contrast function after DR-D3#1.
- D5: DR-D5#1b (`decks.css`, the five page rows, each template's theme name), DR-D5#2b (the one Sign in dialog; the chrome's export line is in), DR-D5#3b (`BookView.css`).

### 7. Pictures

Under `docs/gslides-parity/design-round/integrator/`, each a contact sheet of whole viewports at 1440 by 900 or 390 by 844 in Chromium with its scrollbars shown, taken on 4670 and opened and looked at:

- `editor-{1440,390}-{light,dark}.jpg`: the name prompt bar 4 px under the title row with the presence tooltip beside it, each plate with its own corner, frame and ring (Kevin's first screenshot; at 390 the bar sits under the toolbar row); Slideshow and Share at one 6 px corner; the link popover (Cmd K) as a 6 px plate with 4 px controls; the slide's context menu; Share with "Link copied" over the dialog's scrim. At 390 the link popover is wider than the window (its `min-width` is 420 px, from before the round), a finding for the editor's next round.
- `show-{1440,390}-{light,dark}.jpg`: the show with its slide list over the toolbar, the Keyboard shortcuts card (8 px window, "Presenting" in sentence case), and the presenter view. At 390 the toolbar and the list sit under the slide in the stage's box (taken after `f14dea7d`).
- `pages-{1440,390}-{light,dark}.jpg`: `/decks`, the templates gallery, the trash, `/deck/gt-brand`, the refused page, You need access and Not found. The trash's buttons and the gallery's Blank sentence keep main's words until DR-D5#1b, D5's request 7 and DR-D3#3.
- `home-{1440,390}-{light,dark}.jpg`: the first screen and the menus, canvas, Tailor, agents, Present, export and features bands; the canvas band's Format options readout keeps its grid with its selectors under `.ts-product`.

### 8. For Kevin

1. The landing's own script reads 119,899 B gzip against its 120,000 B line. DESIGN.md 8.10 to 8.12's remaining parts (the captured presenter view, the Download dialog, the 17 pattern stills) need about 2,000 B gzip more (D4's estimate). Either the line rises to 124,000 B or a band's chunk is cut first.

### 9. Notes

- The server on 4670 was stopped and `.turboslide/build.lock` released at 04:47. The scratch worktree was removed after the last typecheck; `design/round-prereorder` (`d9dc1f0e`) keeps the order before the first reorder.
- The `.turboslide/token` of this checkout is a new one (section 2).
- The pictures' driver is `scratchpad/integrator/shoot.mjs`; the gate runs are under `.turboslide/integrator-gate-1` to `-5` of the worktree (ignored by git).
