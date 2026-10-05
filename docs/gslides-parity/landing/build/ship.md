# The landing's ship onto Round 1

Written by the landing's ship integrator from 23:47 PDT on 2026-10-04 to 01:20 PDT on 2026-10-05. The rebase and the gates ran in two scratch worktrees of this repository in the session scratchpad: `ship-now/lwt` on `landing/ship`, and `ship-now/twt`, a sparse checkout without `docs/gslides-parity/` for the type checks of each push. The worktree `/Users/kevinliu/repos/Turboslide-landing` stayed on `landing/redesign` at `8d61e2c6` with its untracked files as found. Nothing was pushed or deployed. No Vercel, Cloudflare, GitHub or Google setting was read or changed. Another agent shipped `round1/ship` to `main` through the guard while this ran. `origin/main` read `4180d58b` (Round 1's H2 fix) at the start and `1c8ae0e7` (B1#3) at the end, and both are ancestors of `round1/ship`. Times are PDT. Loads are one minute load averages; other sessions' jobs held them between 51 and 141.

Read first: `docs/LANDING.md` sections 2, 4, 6 and 7; this folder's `integrator.md` "Landing, ship order"; `docs/NEXT.md` 4.1 and 5.3 at `round1/ship`; Round 1's commits B2a#15, B1#2, B1#3, B3a#7, B3a#8, B5a#19, B5b#20 and B6a#1.

## 1. The rebase

`landing/ship` was made from `landing/redesign` (`8d61e2c6`, 177 commits since `cc06189b`) and rebased onto `round1/ship` at `a3ca96da`. `origin/main` had not moved past Round 1's commits, so `round1/ship` stayed the base.

- **What was replayed.** The 116 commits from `dc7ce0da` (the landing's research and specification) to `8d61e2c6`. The other 61 commits of `landing/redesign` since `cc06189b` are earlier copies of commits on `round1/ship`: the realtime round's 31 commits, the merge `f3e9cd86`, the hotfixes H2 to H10 and Round 1's B6a#1 to B3b#14. Each has a commit of the same subject on `round1/ship`. H3 is the exception in name only: it landed in the realtime round as `f2e648f1` ("R4 fix: H3, ..."). The merge carries no change of its own. So `git rebase --onto a3ca96da 2108dad4` replayed the 116, and Round 1's final copies stand for the 61.
- **The paths.** The landing changes 936 paths from its base `2108dad4`. Round 1 changes 1,757 paths from the same base. 46 paths are in both. After the rebase, before the integration commits of section 2, every path only the landing changed equals `landing/redesign`'s, and every path only Round 1 changed equals `round1/ship`'s. The one exception is `docs/POLISH.md`: Round 1's B6c#21 moved it to `docs/archive/rounds/POLISH.md`, and the rebase applied the landing's five changed lines (section 3's rule for `/home`) to the moved file.
- **The 46 shared paths.** Twenty-two take the landing's version whole: the home components, the route and its stylesheet, `scripts/build-home-assets.ts`, `apps/studio/e2e/home-page.spec.ts` and the B2a files the landing removes. Twelve are B2a's `/home` pictures of 2026-09-29, deleted on both sides. Twelve merged the landing's hunks onto Round 1's version:
  - `README.md`: the generated "What works today" block (below).
  - `docs/README.md`: the landing's row for `LANDING.md` in Round 1's index.
  - `docs/brand.md`: the landing's sections 8 and 11 on Round 1's credits table.
  - `docs/gslides-parity/focus/core-matrix.json` and `apps/studio/e2e/core/decks.spec.ts`: the home rows (below).
  - `packages/lint/src/brand/config.ts`: the `/home` code surface `.ts-home-panel` in place of B2a's `.ts-product-cmd`.
  - `scripts/check.mjs`: the landing's `INNER_HTML_ALLOW` lines.
  - `scripts/probes/core-matrix.mjs` and `core-matrix.test.mjs`: the count line takes both sides' terms.
  - `HomeFooter.tsx` and `HomeNav.tsx`: the landing's code with B6c#21's citation path in their doc comments.
  - `facts-data.ts`: generated; it carries Round 1's `facts.json` hash and 33 check steps, which `build-home-assets.ts --check` reads as current.

### 1.1 Every conflict and its resolution

The rebase stopped three times. The rebuild of the push groups (section 3) stopped twice more. Commits are named by their hash on `landing/redesign`.

| Commit | Path | Kind | Resolution |
| --- | --- | --- | --- |
| `84b57aed` L1#1 (L4's hunk) | `apps/studio/e2e/home-page.spec.ts` | both changed | the landing's version; Round 1's side differed from the base by B6c#21's citation alone |
| `9c1cf352` L1#1 | `apps/studio/src/components/home/{HomeAgents,HomeCanvas,HomeExport,HomeHero,HomePresent,HomeSection}.tsx`, `copy.ts`, `copy.test.ts`, `apps/studio/src/routes/home.tsx`, `home.css`, `scripts/build-home-assets.ts` | both changed | the landing's version; Round 1's sides carried B6c#21's citations, B2a#15 and the B2a#15 seam |
| `9c1cf352` L1#1 | `HomeLicence.tsx`, `HomeMenus.tsx`, `Shot.tsx`, `shots.json`, `shots.ts`, `shots.test.ts`, `diagrams/{Agents,Canvas,Export,Present}.tsx` | Round 1 changed, the landing deleted | deleted; the landing replaces B2a's `/home` |
| `9c1cf352` L1#1 | `apps/studio/e2e/core/decks.spec.ts` | 3 hunks, all in `decks.home.*` tests | the landing's tests; Round 1's side differed by B6c#21's citation alone; every other test reads as on `round1/ship` |
| `9c1cf352` L1#1 | `docs/gslides-parity/focus/core-matrix.json` | 6 hunks, the notes of the restated `decks.home.*` rows | the landing's notes; the seam `a1fe44bb` rewrites their `docs/POLISH.md` citations |
| `de19044e` L4#7 seam | `README.md` | the "What works today" block | Round 1's side, then the block written again by `node docs/readme/what-works.mjs` |
| `244dc4fb` V1#8 fix | `docs/LANDING.md` | the section 7 table: the commit's question 22 row against the seam `4c0c3d89`'s citation in question 23 | the commit's table, then B6c's citation run and Prettier again; the file equals the commit's apart from the citation and the table's padding |
| `189b5c92` V1#8 fix | `docs/LANDING.md` | the section 7 table: the commit's answers | the same way |

A home path that merged with no conflict was compared with `landing/redesign` after the rebase (above). The B2a#15 seam's eight pictures under `apps/studio/public/home` came through with no conflict, because no landing commit names them. The seam `a21c7358` removes them.

## 2. The integration commits

Five commits, each in the push group whose files it serves, each keyed as the landing's seams are.

| Commit | Group | What |
| --- | --- | --- |
| `a1fe44bb` V1#8 seam | landing 1 | The nine citations of `docs/POLISH.md` the rebase brought back follow B6c#21's archive path: the six restated `decks.home.*` notes in `core-matrix.json` and three in `LANDING.md`. B6c's own tool wrote them (`move-records.mjs --set rounds,status --skip docs/brand.md --write`), then Prettier. The polish round's test in `core-matrix.test.mjs` counts its 136 rows again. |
| `a21c7358` V1#8 seam | landing 1 | The B2a#15 seam's eight `/home` pictures (1,543,385 B) leave `apps/studio/public/home`. `build-home-assets.ts --check` refused them ("not in assets.json"). |
| `b67a006f` V2#11 seam | landing 2 | `menus.generated.ts` names the sha256 of Round 1's `menus/model.ts` and `keys.ts`. The menus, rows, sentences, shortcuts and markup are byte for byte the same. |
| `24a03012` V2#14 seam | landing 2 | V4#18's hunk of `core-matrix.test.mjs` (the second pass's rows wherever a lane placed them) at the push that first needs it. The landing's test read red from V2#11 to V3#17 on `landing/redesign` too (`integrator.md` "Landing second pass, merge" 1). V4#18's commit then carries the same hunk with no change. |
| `4c0c3d89` V1#8 seam | landing 4 | Two later citations of `docs/POLISH.md` in `LANDING.md` (4.1's paragraph and question 23) follow the archive path. |

Round 1's work the landing's pages follow, read on the merged tree:

- The mark and lockup come from `@turboslide/chrome/TurboslideMark` and `packages/theme/brand/mark.svg` (B1#2). Neither changed after the landing's base, and the pictures of section 5 show the speed monogram in the navigation, the frame's title row, every live slide's chip, the close slide and the footer.
- The miniature's menus are derived from Round 1's menu model (B3a#7, B3a#8).
- `copy.test.ts` reads Round 1's extended forbidden list through `forbiddenWordsIn`.
- The brand lint in enforce mode (B5a#19, B5b#20) and the chrome lint's one rail check read the landing's files (section 5).
- The evidence policy (B6, `docs/NEXT.md` 5.3) is section 4.

## 3. The push groups

Each group ships at its last commit. `docs_only` is false for every group. The rows are each group's diff of `core-matrix.json` against the group before it.

| Group | Ships at | Commits | Rows entered | Rows restated or retired |
| --- | --- | --- | --- | --- |
| landing 1 | `a21c7358` | 43: the first pass's 27 (L1#0 to L4#7 with their seams, `e8538646` to `0ffd13b6`), V0 and its fix, V1#8's 7, V4#9's 5, the seams `a1fe44bb` and `a21c7358` | 42 `home.*` rows | 9 `decks.home.*` rows restated |
| landing 2 | `24a03012` | 16: V2#10, V2#11's 3 and its fix, V2#12's 3, V3#13's 3, V2#14's 2 and its seam, the seams `b67a006f` and `24a03012` | 7: `home.menus.bar`, `home.menus.rows`, `home.kits.restyle`, `home.kits.color`, `home.agents.chips`, `home.versions.scrub`, `home.versions.restore` | 12 restated; `home.tailor.theme` and `home.agents.run` retired for their replacements |
| landing 3 | `186f108c` | 7: V1#15's 2, V3#16, V3#17's 3, the V3 seam | `home.export.loupe`, `home.hero.run` | `home.present.show`, `focus`, `print`, `home.export.figure` restated |
| landing 4 | this note's commit | 40: V4#18's 3, V4#19's 3, the 32 seams and fixes of `integrator.md` "Landing, ship order" 2.1, the seam `4c0c3d89`, this note | `home.interludes.glyphs`, `home.motion.loops`, `home.motion.offscreen`, `home.patterns.pair` | `decks.home.load-budget`, `home.budget.bytes-first`, `home.budget.bytes-page` changed (the lines of LANDING.md 7, questions 21 to 23) |
| people | the last commit of `landing/ship` | 16: V4#20's group of `integrator.md` 2.2, rebuilt on this note's commit in the same order | `home.people.loop`, `home.people.type` | none |

- The first pass's 27 commits ride in landing 1. Their seven pushes never shipped, and V1#8 replaces their page in the same group, so the guard never deploys the first pass's page alone.
- V1#8 and V4#9 ship together because `tsc -b` exits 2 on V1#8 alone (`integrator.md` "Landing, ship order").
- The people band waits until the six presence rows of `LANDING.md` 2.10 read green on production: `collab.presence-chips`, `collab.presence.join-within-2s`, `realtime.join.chip-within-1s`, `realtime.caret.within-300ms`, `realtime.selection.outline-within-300ms` and `realtime.follow.for-everyone` (question 13).
- Landing 4's code tree is `4c0c3d89`'s. This note's commit adds this file alone, so the readings of `4c0c3d89` in section 5 stand for it. The people group's code tree is `7c5582dd`'s in the same way.

## 4. The evidence pruning

The rule applied is `docs/NEXT.md` 5.3 rule 2 and `docs/readme/evidence-policy.test.mjs`: each tracked picture under 200,000 B and the round's folder under 25 MB. It is read on every picture, PDF, PowerPoint, video and font file under `docs/gslides-parity/landing/` in every commit of `a3ca96da..landing/ship`.

- **Named pictures stay.** A picture stays when its file name appears in one of the landing's 22 notes at the head (every Markdown file under `docs/gslides-parity/landing/` and `docs/LANDING.md`). One more stays because a kept prototype page loads it: `direction-b/img/export-page-dark.png`, which `direction-b/index.html` shows. 313 paths stay and 265 leave.
- **Each kept picture keeps its path and format.** A PNG became a palette PNG (sharp, quality 80, effort 10) and a JPEG a mozjpeg JPEG at quality 70, each kept only when smaller. A picture still at 130,000 B or more was stepped down in scale by 0.85 until under it: 55 of 316 blobs, 9 of them to 0.44, among them the full page captures of directions B and C. A WebP copy would change each file's name. The notes name 157 of the kept PNG files, and `core-matrix.json`, `live/mark.ts`, `live/people.ts` and `home.css` name some of them as well. The palette PNG is the form `docs/NEXT.md` 5.3 rule 2 names beside WebP. The three woff2 fonts and two webm clips are under 200,000 B and stay as they were.
- **The rewrite.** `git filter-branch --index-filter` over `a3ca96da..landing/ship` (121 commits) removed the 265 paths and put in the re-encoded blobs. Nothing else changed: the head's tree differs from the tree before the filter in 265 deleted and 308 changed pictures under `docs/gslides-parity/landing/`. Round 1's commits were not rewritten. `landing/redesign` keeps every original.

| | `landing/redesign` | `landing/ship` |
| --- | --- | --- |
| files under `docs/gslides-parity/landing/` | 730, 90,752,921 B | 465, 23,259,857 B |
| pictures and other binaries | 578, 86,289,490 B | 313, 18,796,426 B |
| the largest binary | 399,061 B | 127,926 B (`current/pictures/prod-390-light-full.jpg`) |
| binaries of 200,000 B or more | 158 | 0 |

The check, by `git rev-list --objects` and `git cat-file --batch-check`:

- `a3ca96da..landing/ship`: 315 binary blobs under `docs/`, the largest 127,926 B. The landing folder is at its largest at the head: 23,259,857 B in all before this note, which adds about 21 KB, with 18,796,426 B of binaries.
- `origin/main..landing/ship` with `origin/main` at `1c8ae0e7` (Round 1's 41 commits not yet on `main` included): 767 binary blobs under `docs/`, the largest 193,174 B (Round 1's `round1/build/b4/pictures/b4fix-canvas-speed-ascii-canvas-dark.jpg`). None is 200,000 B or more.
- Text blobs of 200,000 B or more that the landing writes: `core-matrix.json` (574,767 B; 536,549 B on `round1/ship`), `docs/LANDING.md` (269,371 B), `docs/archive/rounds/POLISH.md` (229,314 B; 227,648 B on `round1/ship`), and in this folder `motion/raw/linear-slow.json` (358,447 B), `build/landing-v2-local-memory.json` (335,062 B), `motion/raw/stripe-slow.json` (220,607 B) and `motion/raw/stripe.json` (201,717 B). The policy and its test bound pictures, so these stay. The three `motion/raw` files are raw traces, which 5.3 rule 3 puts under `.turboslide/`; a later prune can move them.

## 5. The gates

| Gate | Reading |
| --- | --- |
| `tsc -b` at every push group's head | Exit 0 at each, after a frozen offline install (exit 0) and the route tree generated, in `ship-now/twt`: landing 1 `a21c7358` (1,105 s with the first install, load 87 to 90), landing 2 `24a03012` (80 s, 88 to 78), landing 3 `186f108c` (151 s, 78 to 85), landing 4 `4c0c3d89` (195 s, 85 to 62), people `7c5582dd` (146 s, 62). Also exit 0 on the rebased head before the integration commits (402 s, 67 to 76). |
| `pnpm test` at `7c5582dd` | 504 files: 503 passed, 1 failed. 5,278 tests: 5,268 passed, 1 failed, 7 skipped, 2 todo. 261 s at load 66 to 75. |
| the one failure | `packages/agent/src/generate/contracts.test.ts` "are deterministic" timed out at vitest's 5,000 ms. Alone with `--testTimeout=60000` the file passed 4 of 4 (load 73). Alone at the default it read 5,371 ms (load 77). On `round1/ship`'s tree (`a3ca96da`) alone at the default it read 5,733 ms (load 75.5). The landing changes no file the test reads, so the red stands on Round 1's tree under this load. |
| `core-matrix.test.mjs` (vitest) | 37 of 37 at each group's head |
| `node docs/readme/what-works.mjs --check` | current at each group's head |
| `node scripts/build-home-assets.ts --check` | exit 0 at each group's head: 29, 31, 33, 34 and 34 outputs match their sources; 14, 14, 16, 17 and 17 served files; 10 slide instances |
| the brand lint, `node packages/lint/src/brand/main.ts --enforce` | exit 0 at each group's head: 0 open findings, 22 accepted (Round 1's acceptances, the 22 findings `integrator.md` read on `landing/redesign`, none under `/home`), 0 stale acceptances; at the head 506 scripts, 120 stylesheets and 28 mood pictures read. No finding under `/home`. |
| the chrome lint of `/home` (B5's one rail check) | `node apps/cli/bin/turboslide.mjs lint --chrome --url http://localhost:4571/home --widths 1440,1280,390 --themes light,dark --states ''` on the node-server build: 6 audits, 0 with findings (load 71 to 73) |
| the evidence policy | `vitest run docs/readme` at the head: 3 files, 18 tests passed (`evidence-policy`, `docs-index`, `what-works`); the range checks of section 4 |
| the node-server build | `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy` at `7c5582dd`: exit 0 (69 s, load 74 to 67) |
| `/home` on that build | Served on 4571 with check step 31's environment (a tmp store, the memory tier, the chain's fake secrets), then stopped. `/home` answered 200 with a document of 95,386 B. Shot at 1440 by 900 and 390 by 844 in both appearances: the 14 bands in order (hero, numbers, menus, canvas, tailor, kits, agents, people, present, export, patterns, features, close, footer), all 10 instrument boxes filled, 0 console errors, no sideways scroll, the page 13,053 px tall at 1440 and 13,334 at 390. No B2a capture is requested and no B2a diagram is drawn. The navigation shows the lockup, Documentation, the appearance group, Pause Motion, Sign In and New Presentation. |
| Prettier on each group's changed files | clean at landing 4 and people. Landing 1 to 3 carry the landing's unformatted files (4, 9 and 7 of their changed files) until the V3#17 seam `604b6b8c` in landing 4 formats them, as on `landing/redesign`. |

The pictures were looked at in the session scratchpad (`ship-now/landing-prep/shots/`): the first screen and the whole page in slices at both widths and both appearances, and the canvas, kits, patterns and export bands scrolled into view. In the whole page shots the lighthouse print and the pattern stills read blank. Scrolled into view, both draw.

## 6. What stands

- **For the shipper.** Push the groups in order, each through the guard: landing 1 `a21c7358`, landing 2 `24a03012`, landing 3 `186f108c`, landing 4 this note's commit, then the people group only when its six presence rows read green on production.
- **For Kevin.** The export band's Perfect picture is the exporter's recorded output of slide 7. It draws the GT monogram in the slide's corner chip, while the page's live slides draw the Turboslide mark there. The recording and its files are the landing's, unchanged by this ship.
- **Standing from the landing's verifier.** The live core reads 11 to 66 B under its 20 KB gzip line. N4 to N8 stand, with `home.present.show`'s Escape bound of 417 ms among them (`integrator.md` "Landing, ship order" 8).
- **The notes' hashes.** The landing's notes cite `landing/redesign`'s hashes. The map below gives each commit of landings 1 to 4 on `landing/ship`; the people group's sixteen commits follow this note in the same order.

The map, `landing/redesign` then `landing/ship`, in history order:

```
dc7ce0da e8538646  bcaf7430 09d7dbc1  84b57aed 26d07dd9  9c1cf352 ae945b27  20877a44 1ff713e2  bfc4e1e7 ba556b07
3fe86e7f 9251185e  19bd4c39 7eaf629a  4a889eca fab7f9a7  0c5ee848 bf359bb5  2ff3fd5c 11028434  bec706df a025f51e
a256a531 1b5297b5  3f5b5b06 502e9767  927866a9 8c1ac061  12096a26 8eaf73e2  6e267226 62e3e343  be9eada2 3b492c9c
cf589360 b54d3f36  f5409ce5 85a61620  c77e0e15 8a377163  8c39316f 9bf40a94  ea49161e 0a2e25d6  de19044e e9cb4dd3
9db5ca82 ddda11b0  42ead2b2 82f614cf  07e2811b 0ffd13b6  e3708837 31dd2923  dbe5405a a1eccba0  172b3bda 120688d5
bc3d1242 01661f3d  c0c5ddc0 5c701ceb  54b07b88 31e8e3be  1f406d25 70ad6083  a7672dca 37702633  11df4c10 5422f32e
5ee64cf2 aafc59d2  8ec0ad23 39073827  c48f8198 a13fa443  79001704 b1f1edf4  89e28076 000ee9cc  a6042ce6 5f517d3a
e05c78f4 37f6f569  1beea439 c223043b  dce46267 3b9724bc  5d4293dc 305a9fa6  fb712451 5ab23819  56acc6a2 cc9755c3
1804d0b8 c6401cc5  02b67cb7 b1972f44  5ae47130 9d129d72  af334525 25e22f88  eea3c570 b7bc6736  6e6004f3 749599eb
d154d8b8 057596a9  a8dfb2fc c47556cd  47cc9e39 24f617dd  56897de0 689e04ec  178ea588 1c60610c  3c431b3e 7ab11284
11e20a4d 7bb377ca  89f9e459 186f108c  ac44ef60 d38a4e0d  35012ebe a20af46a  70fe3545 6bd6ac49  d8662fca 04960d52
64546416 c191499a  133b81f6 bd6fd514  f2d513e9 5a45556d  62b9fb5b 8098380e  b289f6dd 359f4000  ebb03484 2432528b
656fc7ff a0392740  2047922d 1bea1f3f  50b60a26 604b6b8c  084d619e c9794022  370d9da9 754de327  1077f0e4 fa74760a
15c17bc5 4425a15c  de135861 38218cd2  a8aa72ee 1d561cad  cf068042 94182b94  d17254dc 8ef06328  63d72fbc b4332095
9e6a82a4 e7ded9f9  4c1ca9e1 ea172fd3  0eed1a5c 97409637  4774c650 e00f7086  9c892eef 8d5aed9a  3d1feb51 f0686046
290f8c92 6cfc5ded  eef7528c 37527fd2  14631355 bb3a719e  700c2b5b 5745b2cc  cf98583e 3dae5892  25e74f62 eba348e7
52500369 4607d524  93c44574 42b47cba  d2fb0dd5 ea6834bf  44e735e5 19f67d68
```
