# Completeness critic of docs/NEXT.md

Written 2026-10-01 at 21:08 PDT (2026-10-02 04:08Z) by the completeness critic of the next program workflow, in the worktree `/Users/kevinliu/repos/Turboslide-next` on `next/program` at `94e8a5c3`. The load average was 42.61, 36.54 and 33.23 at 21:08 PDT (`uptime`). No number in this note is a timing.

Read in full: `docs/NEXT.md` (772 lines), the nine audit notes, `brand-judge-1.md`, `brand-judge-2.md`, `brand-judge-3.md`, the risks and marks sections of `brand-b.md`, `docs/FOCUS.md` 252 to 277, `R:docs/REALTIME.md` 1 to 54, `R:docs/CLOUDFLARE.md` 1 to 29, 405 to 620, and `R:docs/gslides-parity/realtime/build/integrator.md` 149 to 200. `R:` is `/Users/kevinliu/repos/Turboslide-realtime` at `89a80bd9`. Every tree path NEXT.md cites with a line was checked for existence and length by a script over NEXT.md (`cites.py` in the session scratchpad), and about 120 cited lines were read by hand. Nothing was edited outside this file, no server was started, nothing was deployed.

## 1. Verdict

Revise. The three largest items:

1. The auth proof cannot be read on production. Twelve of the fifteen `accounts.*` rows of NEXT 4.3.3 name the driver `e2e/accounts.spec.ts`, which `scripts/probes/core-matrix.mjs` 238 to 245 defines as a local spec driver that "never" runs on a deployment, and whose absent rows are listed apart and "never counted as passed" (`core-matrix.mjs` 64 to 66, 708 to 711). Under the defaults of questions 12 (no mail sender) and 14 (passkeys off), `accounts.email-code`, `accounts.mail-branded` and `accounts.passkey` cannot pass anywhere hosted, and `accounts.limiter-test-switch` is local by its own text. NEXT 1.2 item 8, 1.3 and 4.3.1 still define "auth works perfectly" as fifteen rows green on production. Only `accounts.legal-pages` (`core/share.spec.ts`) and the manual `accounts.google-under-10s` can be read there.
2. The ship mechanics break `docs/FOCUS.md` 6.2, which is the rule written to answer "why do your deploys keep regressing?". Rows enter the matrix on the round's day 0 (NEXT 4.0) in features `core-matrix.mjs` 268 to 286 makes unparkable (`chrome`, `decks`, `share`, `versions`, `present`, `export`, `cost`), so every lane push before a round's last ships with known red unparkable rows. Several lanes carry many mechanisms in one push (B3b ten items, P5 six cuts, P2 four fixes), against rule 2's "one branch, one mechanism" (`docs/FOCUS.md` 273). The hotfixes' proof rows do not exist when the hotfixes ship, and the guard's walk that is said to read them covers other areas.
3. Two of Kevin's phrases have targets with no measurable input. "Super cheap" leaves out the model and translation spend the feature rounds add, the media bytes of video and recordings, and the program's own pipeline cost at its push count; question 17's default contradicts the $20 floor. "Super performant online" has budgets read from one wired machine in the US against `iad1`, with no phone or throttled profile, no reading from another region, no real user data, and no budget for the page a buyer opens (`/deck/<id>`, `/s/<token>`).

## 2. Gaps

### 2.1 Auth

- No production row for the CLI device flow. `turboslide login` and `/device` are "Absent" on production (audit-auth 26); Round 3 has no row for them on `www.turboslide.com` once D1 exists.
- No abuse limit on production. `turboslide-gt` has no firewall configuration (`GET /v1/security/firewall/config/active` answered 404 at 01:51:50Z, audit-cost 17), so the WAF rule R8 (`/api/auth/` 10 per 60 s, audit-auth 92) does not run there. Round 2 drops R11 from the preview (NEXT 4.2.3) and no lane applies R8 to production. Sign in attempts spend the Worker's 100,000 requests a day and D1's 100,000 rows written a day (`R:docs/CLOUDFLARE.md` 21), and the realtime spec notes that a stranger can spend the Worker's cap (`R:docs/CLOUDFLARE.md` 26).
- The Google button breaks Google's guideline when R4 ships (audit-auth 53; audit-brand-surfaces 49) and stays broken on production until Round 3 lane A2. NEXT does not hand the finding to the realtime round before its flip.
- Delete account names `POST /api/auth/delete-user` (NEXT 4.3.2 item 3) and does not say what happens to the person's decks, avatars under `/api/avatar/u/` and the alias rows.

### 2.2 Cost

- The ledger of NEXT 4.2.4 holds Vercel and Cloudflare lines only. The assist router's spend, General Translation's API for F5 and F11 (price "not read", audit-features 173) and F7's drafts have no monthly line and no daily cap.
- F6a (video upload, a 20 MB mp4 in `images.video.upload`) and F8 (recordings) have no `cost.*` row. Playback is served from the public Blob store at $0.05 a GB (audit-cost 44). F8's estimate uses R2 prices (audit-features 153), while NEXT 4.5 keeps stage 2a, the store on R2, outside the program.
- The pipeline's own cost is not summed. "$15 to $20 of pipeline usage" (NEXT 4.2.4) is the pace of 2026-09-26 to 09-30 with one build per push (audit-cost 143). Question 17's default keeps two builds per push. The program's pushes (nine hotfixes, about ten in Round 1, five in Round 2, five in Round 3, two per feature round) and one narrowed hosted preview per round, priced only as "a few dollars a run", are not added up. A gate day cost $5 to $13 (audit-cost 59).
- Cost audit condition 5 (hosted `do` gates on a second Cloudflare account or on Workers Paid, audit-cost 154) is not adopted; NEXT 6.2 risk 4 records the risk and keeps the Free account (question 20).

### 2.3 Performance online

- Every budget in NEXT 4.2.1 is read from one Apple Silicon machine on a wired link through `sfo1` to `iad1` (audit-performance 8, 80). No row reads a phone viewport with CPU or network throttling, a browser in Europe, or field data from sellers.
- The buyer's pages have no budget. The view link `/deck/<id>`, the share link `/s/<token>` and `/embed/<id>` are what a prospect opens; the performance audit measured `/home`, `/decks`, `/edit`, `/present` and the PDF only (audit-performance 211).
- After the flip the editor boot gains a WebSocket upgrade and identity reads that cross from `iad1` to D1 (audit-performance 193 to 195). The audit asks for the session facts cache's hit rate as a gate row (audit-performance 195); NEXT has no such row and its "today" column is the `blob` tier's.
- The perf gate needs a load average under 20 (NEXT 4.0, 6.1 rule 4) on a machine that read 14 to 279 on 2026-10-01 (audit-performance 9) and 42.61 at the time of this note. `perf` is made unparkable and no other runner is named, so Round 2 can stall on the machine's load.
- A `measure: true` row "holds nothing" in the matrix verdict (`core-matrix.mjs` 716 to 719). The budget hold NEXT 4.0 describes has to be enforced by `scripts/perf-budget.mjs` or the gate, and no lane is given that change.

### 2.4 Fully featured and exceeding Google Slides

- Google Slides import is in the market audit's missing list ("PPTX and Google Slides import on the hosted editor", audit-market 187) and in no round.
- F6a turns on `packages/chrome/src/menus/model.ts` 1461 to 1462, and line 1461 is `insert.audio`. No audio row exists in F6.
- Screen reader support (audit-features 97; audit-clutter 21), comment mentions ("Mentions list only yourself", audit-features 171), print handouts (audit-features 91) and the phone comparison (audit-features 98) are in no round and in no question.
- Five of the market audit's seven "exceed" items (the parity gate, the fidelity report, an agent run as one Versions entry, the speed page, the no metered AI policy; audit-market 204 to 210) sit outside the twenty, unsized, with question 23's default "no market item outside the twenty is built". They are a wish list in NEXT 4.4.1 with no seller's job and no tree path.
- F9 to F14 have rows and sizes and no lanes, owned files or gates (NEXT 4.4.12). F5, F7 and F8 have no lane table. F12's row `share.room.page` carries no bound.

### 2.5 The brand from the deck

- The chosen mark has never been drawn. B's monogram was built from Inter weight 800 outlines widened (brand-b 26 to 29); NEXT 4.1.2 regenerates it from rectangles on C's page grammar with A's lockup. No direction rendered that combination and no judge scored it, so Kevin sees it first after lane B1 builds it. Judges 2 and 3 chose B for the product name read on the first screen (brand-judge-2 172; brand-judge-3 113), which question 2's default (no outlined wordmark) removes.
- Mood picture licences. Slide 64's credit names the University of Glasgow Library and states no licence, and `P:deck/shots/OPENERS.md` is stale on the licensing count (audit-brand-source 322 to 323). Round 1 imports the 95 slides into the public MIT repository and puts mood pictures on the Sign in plate, the card, Not found and the empty `/decks` state with no licence check row.
- The GitHub social preview is Kevin's manual upload (brand-b risk 10; `docs/brand.md` 431 to 435) and is missing from K1 to K6.
- Ranks 13 (the `/home` capture with the selection ring), 15 (the comma tail title and "licence"), 26 (README), 27 (CLI version 0.0.0), 28 (`docs/brand.md`) and 30 (the titanium and plate tokens) of audit-brand-surfaces have no row; rank 30 has no question either (audit-brand-surfaces 55, 117).
- How the re-imported 95 slide deck and the rebuilt templates reach production's store, and whether that write touches the deck `gt-brand` or another deployment wide record, is not said.

### 2.6 The clutter

- The side panels (Format options, Brand kit, Comments, Version history, Assist, Check slides, Diagram) and the right click menus were never opened by the clutter audit (audit-clutter 150 to 152). No round audits them.
- The 107 leaf rows disabled with nothing selected, the 25 default rows Google lacks and the More overflow of the shape and table tails at 1440 px (audit-clutter 24, 25, 28, 30) are in no round.
- The production Blob store keeps 143 to 148 decks, 120 of them `untitled-*` scratch decks (audit-performance 91; audit-clutter 87). NEXT 5.4 item 4 sweeps "the gates' scratch decks ... by id" through Round 2's retention job, and no list of those ids, no owner and no row exists.

### 2.7 The privacy defect behind H2

- `/decks` shows restricted titles to strangers today (audit-auth 56; audit-brand-surfaces 26). H2 waits for the realtime round's production table (NEXT 3, 6.1 rule 3), and that round's flip waits on Kevin's Google client and the preview bypass (NEXT 6.2 risk 1).
- H2's file list leaves the `deck.list` action open. It is a server side window action (`apps/studio/src/server/agent-actions.ts` 53; `apps/studio/src/editor/controller.tsx` 3525), `authorize.ts` 527 returns no access check for it, and the dispatcher lists the whole store (`apps/studio/src/server/actions.ts` 916 to 919). The row `decks.list.own-and-shared` reads the page alone.

### 2.8 Parts with no rows, lanes, gates or size

- The version log round (NEXT 4.5) has a trigger and a dollar figure and no rows, lanes, gates or size.
- Section 5 (lane B6) defines no row, while NEXT 1.3 cites "the repository check rows of section 5".
- The sizes of Rounds 1 to 3 carry no source: "the declutter and the lint add about one" (4.1.7), "fixes 1, 2, 3, 4 and 6 are about a day of lane work each" (4.2.7), "3 pipeline days" (4.3.5). Judge 3's two to three days was for direction B, which "has the least surface work: no picture pipeline" (brand-judge-3 24, 113); the program builds C's grammar with mood pictures.

### 2.9 Existing rows the cuts break

Lane B3a's cuts (NEXT 4.1.3 item 22) remove or move controls that existing matrix rows drive, read from `docs/gslides-parity/focus/core-matrix.json` by control id: `insert.logo` in 12 `logos.*` rows, `tools.assist` in `assist.entry.title-row` and `assist.panel.first-line-and-cards`, `slide.editTheme` in `brand.panel.opens`, `file.download.zip` in `export.zip.bundle` (works today, feature `export`, unparkable), `file.download.html` in `export.html.web-page` (`export`), `view.playShaders` in three `shaders`/`view` rows. NEXT names none of them and B3a owns no driver.

## 3. Contradictions

1. Auth rows and their driver: NEXT 1.2 item 8, 4.3.1 and 4.3.5 ("the `accounts.*` rows that read a deployment") against `core-matrix.mjs` 238 to 245 (`e2e/accounts.spec.ts` never runs on a deployment).
2. "Fifteen `accounts.*` rows green on production" against the defaults of questions 12 and 14 and the local text of `accounts.limiter-test-switch`.
3. H3 says the 5 s revocation bound of `accounts.sign-out-clean` waits for Round 3; the row in 4.3.3 bounds it at 30 s; audit-auth 67 sets 5 s.
4. Hotfix proof rows. H3's row needs A1's cookie cache; H6's row `brand.template.blank-no-gt-mark` needs "no rails, crosses or counter", which is B4 item 25; H9's row is in feature `perf`, which `core-matrix.mjs` 558 refuses until Round 2 adds it to `CORE_FEATURES`; rows are written on their round's day 0 (NEXT 4.0), after the hotfixes ship; H10's `logos.refresh.cron-runs` is defined nowhere in NEXT. NEXT 3.3 says each hotfix row is read again on production "by the guard's walk", and the guard's walk runs the areas `decks,text,fonts,versions` and nine spec rows (audit-cost 72; `gt-follow.log` 03:55:38Z "specs 9 0 0 0").
5. Day 0 rows in unparkable features against one lane per push. Round 1 writes 23 rows in `chrome`, `decks`, `share`, `versions` and `present` whose `today` is broken, flaky or not driven (NEXT 4.1.5); `parkedFeaturesOf` puts a red unparkable row without `parks` on its blocking list (`core-matrix.mjs` 727 to 729), and `docs/FOCUS.md` 265 asks every core row of every unparked feature to pass before a ship. NEXT does not say whether a lane's rows enter at its own push.
6. `docs/FOCUS.md` 273 (one mechanism per ship) against lanes B3b (items 12 to 21), B2 (items 8 to 11), P5 (six cuts), P2 (fixes 2, 5, 8, 9), A1 (items 1 to 4) and A2 (items 5 to 7), each one push.
7. `docs/FOCUS.md` 266 (a row that fails and then passes with no code change between is flaky and fails the ship) against the perf rule "re-read at low load before it does" (NEXT 4.0; 6.1 rule 4).
8. NEXT 1.3 "exceed" cites audit-market 202 to 210 for seven features; that passage lists a different seven, five of which NEXT defers by default.
9. NEXT 1.3 cites "the repository check rows of section 5"; section 5 defines none.
10. NEXT 1.3 says each of 30 brand divergences is "closed by a row or a lint rule"; six ranks have neither (2.5 above).
11. NEXT 4.1.3 item 22 calls `bar.table`, `panel.brand.logo.find` and `toolbar.group.text` "dead parked entries". `packages/chrome/src/parked-controls.ts` 19 says "`bar.table` hides every `bar.table.<command>` button", `core-matrix.mjs` 396 to 399 names `bar.table` a templated family, and `ship-4300058d.json` `parkedRows` parks the three through `tables.bar.row-column-buttons`, `logos.kit.find-a-logo` and `arrange.group.tail-text-controls`. The set is emitted by `--emit-parked` from the ship list.
12. Lane P5 removes the deck pulse on the `do` tier (NEXT 4.2.3). `R:docs/CLOUDFLARE.md` 7.1 places "`putPulse` skipped on the `do` tier" in stage 2a, which NEXT 4.5 keeps outside the program. `turboslide.vercel.app` keeps the forced `blob` tier over the same store (`R:docs/CLOUDFLARE.md` 610), and audit-cost 121 says a `blob` reader stops seeing commits once the pulse is skipped.
13. NEXT 1.2 item 2 says K1 to K3 save about $24 a month; K3 is $0 once K2 is set (audit-cost 126), so the sum is about $21.75.
14. NEXT 4.1.3 item 26 says the chain's standing reds at steps 5, 8, 11, 12, 14, 15 and 24 turn green with the import; the source it cites also records "the speed mark slides 13 to 18 percent off their grammar render" (`R:docs/gslides-parity/realtime/build/integrator.md` 190, section 7 item 7).
15. NEXT 1.2 item 3 ("$20 a month or less in all") against question 17's default (two builds per push) and the unpriced per round previews.
16. Lines that do not hold the cited text: `docs/PRODUCT.md` 309 for page setup (NEXT 4.4.2) is the Paste without formatting row, and the page setup row is line 304; `apps/studio/src/server/headers.ts` 405 to 408 on `4e385b62` for H1 is the comment, and the callback pattern is line 413; `scripts/chunk-attribution.mjs` (NEXT 4.2.2 fix 6, lane P3) does not exist in the tree (`git ls-files`), it is named only in a comment at `apps/studio/vite.deploy.config.ts` 233, and the tool that was run is the scratchpad's `int/chunk-attribution.mjs` (`docs/gslides-parity/focus/build/integrator.md` 633).

## 4. Work that duplicates the realtime round

- `accounts.google-under-10s` repeats R4's manual `accounts.google-roundtrip` (`R:docs/REALTIME.md` 51): the same hand sign in on `www.turboslide.com`, the badge in a second browser and the scratch deck removed by id. NEXT adds only the 10 s bound.
- `accounts.badge-second-browser-2s` overlaps `people.verified-badge`, which R4 read on D1 (audit-auth 32, 65).
- `cost.do.idle-no-poll` overlaps `cost.editor-idle.calls` restated per tier by R5 (`R:docs/REALTIME.md` 43) and R5's `cost.do.requests`, `cost.do.duration`, `cost.do.rows-written`, `cost.worker.requests` (the realtime matrix, 1,073 rows at `89a80bd9`).
- K6 is the realtime round's own step 15 (`R:docs/CLOUDFLARE.md` 551); listing it is correct, and its gain is the realtime round's first.

## 5. Rules checked

`docs/FOCUS.md` 6.2: the parked list rule, the hand walk (rule 3) and the narrowed rerun of production reds (rule 4) are kept (NEXT 6.1 rule 6). Rule 2 and the acceptance bullet at 265 are broken as in items 5 and 6 of section 3. Rule 5 (a row red once is read again narrowed within the hour) is not restated in NEXT 6.1. The run ledger's flaky clause is broken by the perf re-read (item 7).

`R:docs/REALTIME.md` 1.1 (line 19): rule 1 (the whole matrix local, the hosted run narrowed, the production table once after the alias moves) is kept by NEXT 4.0; `perf.*` and `setup.*` are additions to the narrowed list. Rule 2 (one preview per round) is kept. Rule 3 (docs only pushes run the smoke) is kept for B6 and correctly withheld from section 5.2 item 4, which rewrites 722 files. With one preview per round built from the merged tree, the `perf` and `cost` readings cannot be tied to a single lane's push; NEXT does not say how a lane's regression is found before the round's last push.

## 6. Unverified

- "A few dollars a run" for a narrowed hosted preview (NEXT 4.2.4; audit-cost 143): no narrowed run was priced.
- The CDN threshold date "around 2026-10-08" (NEXT 4.2.4, 6.2 risk 9): an inference from `invoiceItems.edgeRequest.threshold` (audit-cost 55, 158).
- F7's ceiling of $0.01 a draft rests on router prices of 2026-09-29 that were not fetched again (audit-features 141, 173); F5's translation price was not read.
- Whether a Durable Object WebSocket message writes a Workers Logs event (audit-cost 106), which the P5 sampling cut depends on.
- The Google Slides column of NEXT 4.2.1 was read in the bot run at load 41 to 55 (audit-performance 64), the Turboslide column in the person rerun at load 19 to 29 (audit-performance 17).
- The name check of "Turboslide" against other speed marks (brand-judge-3 130; brand-b risk 1) has not run; NEXT puts it on B1's day 0.
- "The nine pushes are about half a pipeline day" (NEXT 3.3): a pipeline day is not defined in hours; nine checks of 1,012 to 1,152 s are about 2.5 to 3 hours of guard time.

## 7. Facts that moved after NEXT was written

- Production serves `4e385b62`: the guard promoted `turboslide-rfka9dzob-general-translation.vercel.app` at 03:55:38Z after "smoke 42/42; walk 127 1 2 0 ... specs 9 0 0 0 ... check 1045s; load 22.08" (`~/.config/turboslide/gt-follow.log`, read at 04:01Z). NEXT 2.3 and 2.4 say the promotion was not yet logged.
- `R:` is still at `89a80bd9`, 29 commits over `origin/main` (`git rev-list --count origin/main..HEAD` at 04:00Z).

## 8. What is sound

The citations NEXT takes from the audits match the audit lines in every case checked (audit-auth, audit-cost, audit-performance, audit-features, audit-market, audit-clutter, audit-brand-surfaces, audit-brand-source, audit-repo, the three judges). The menu model, strings, store, auth, editor and controller lines of sections 3 and 4 hold the cited code at `94e8a5c3`. The judges' totals (A 102, B 105, C 105) add up. Each of F1 to F8 carries the seller's job and the tree's path through audit-features 145 to 164. The `.vercelignore` and `.dockerignore` lines of 5.3 rule 9 hold.

## 9. Not read

- `brand-a.md` and `brand-c.md` beyond their headings, and `brand-b.md` beyond its marks, risks and open questions.
- The audits' evidence files (JSON, pictures, scripts); only the folder sizes were read (`du`: 27 MB, 239 pictures, 33 over 200 KB).
- `docs/FOCUS.md` outside 240 to 290, `docs/PRODUCT.md` outside the cited rows and 640 to 645, `R:docs/CLOUDFLARE.md` 30 to 404.
- Production, Vercel, Cloudflare, GitHub and Google: no request was made. No URL was fetched.
