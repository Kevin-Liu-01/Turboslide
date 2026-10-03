# The Round 1 integrator

The integrator of Round 1 (docs/NEXT.md 4.1, the quick win hotfixes of 3.2 and the round's 21
pushes of 4.1.6), in the worktree `/Users/kevinliu/repos/Turboslide-next` on `next/round1`. Ports
4510 and 4520. The branch was cut from `realtime/round` at `e8b20fec` with `origin/main`
(`cc06189b`) merged in as `f3e9cd86`. The first attempt left 49 commits past that merge, the
second added nine (this note's two commits among them).

Two attempts wrote this note. The first ran from about 2026-10-03 03:20Z to 05:35Z: it answered the
lanes' requests, made the 15 integrator commits of section 2, ran the chain's steps 1 to 12, 19,
28 to 30 and 33, deployed the round's one preview and read the hosted smoke on it. It ended when
the app was quit, with no note written. The second attempt started at 05:47Z from the first's
commits and its scratch logs, restored the seed deck the chain's step 7 had imported in place,
and ran everything else in this note.

Nothing was pushed. The one deployment of the round is the preview of section 5.

## Round 1

### 1. Requests answered

Every request a lane wrote to the integrator, or left for whoever closes the round, by its note's
number. "Made" names the integrator's commit; "Recorded" names a request no Round 1 file closes,
with its owner or round in section 6.

#### HA (ha.md)

| Request | Answer |
| --- | --- |
| 1, /decks/trash lists every trashed deck | Made in `df4f8ede` (H2 seam): `listTrashedDecks` reads the action's scope and keeps the trashed decks the viewer owns (`deck-scope.ts` `ownedTrash`, 3 tests); an anonymous visitor lists its own principal's trashed decks |
| 2, `.ts-sign-in-method.is-later`, `.ts-sign-in-note` and `passkeysNotice` | Recorded for Round 3 A2 and A5 (the files are the realtime round's and A2's restyle) |
| 3, the README ledger | Answered by B1#2 (the ledger moved to the end of the page) |
| 4, `account.decks` misses aliases and email grants | Recorded for Round 3 A1 |
| 5, Sign out on an unsaved draft keeps the anonymous cookie | Recorded for Round 3 A1a |
| 6, `.ts-recent-lead` unused | Answered by B2b#16 |
| 7, the matrix total | Answered by B3a#7 (`NEXT_ROWS`) |

#### HB (hb.md)

| Request | Answer |
| --- | --- |
| 1, B4a extends H6's record | Taken by B4 and landed in `33b3aa98` (B4a#5) |
| 2, the walk's /new deck starts with no logo | Read in the whole matrix run (section 4.2) |
| 3, `export.remove.copies-gone` on a deployment and the Blob cache's 60 s | Read on the preview (section 4.4) |
| 4, Reset on a Blank deck draws the GT mark again | Recorded for the features round F4 (the brand at work): Reset removes the record, and the deployment's default kit is named "General Translation"; no Round 1 item names Reset |
| 5, `blankDeckDocument` draws the GT mark | Recorded for the store package's owner: the CLI's fallback for a decks folder without the blank template; no Round 1 item names it |
| 6, 7, the download token and `builds/` outside `isPublicPath` | Recorded for Round 2 (storage and cost) |
| 8, warm the dev server before a spec run | Followed: every local run of this note is on the node-server build, which has no dependency optimizer |
| 9, the H2 to H4 lane's shared files | Answered by HA's commits |

#### B1 (b1.md)

| Request | Answer |
| --- | --- |
| 1, `AppBarBrand.tsx` at 24 px | Made in `3274a686` (B1#2 seam) |
| 3, the print bar's mark | Made in `3274a686` (`size={24}`, `print.css` at 24 px) |
| 4, `brand-chrome.test.tsx` | Confirmed as `TurboslideMark.tsx`'s own test |
| 5, `outline-wordmark.py` removed | Confirmed |
| 6, the selection block of `brand.test.ts` | Answered by B3b#10 (`c08ee017`); the block passes (37 of 37 in `brand.test.ts` at HEAD) |
| 7, the `TitleRow.css` comment | Made in `3274a686` |
| 8, `facts.json` 32 against 33 | Answered by B6c#21 (`f20cf8ac`); check step 29 green |
| 11, the ledger into `docs/` | Recorded for the round after Round 1 (B6's request 10) |
| 12, the og-screen twins | Recorded: they stay while `brand-files.test.ts` and `TWIN_PATHS` name them |
| 13, slide 13's reference thumbnails | Recorded for Kevin (`docs/brand.md` section 8) |

#### B2 (b2.md)

| Request | Answer |
| --- | --- |
| Move the grammar classes into `brand.css` | Not taken: they work in `components/home/grammar.css`, and B1's `brand.css` tests allow one media block; recorded as a later tidy |
| 8, the /home capture and the `canvas` kind | Made in `5b2af959` (B2a#15 seam) |
| `AppBarBrand.tsx` at 24 px | Made in `3274a686` |
| 11, `/decks/trash`'s layout | Recorded for the owner of `decks.trash.tsx` in a later round; its listing is scoped in `df4f8ede` |
| 12, `decks.card.thumbnail-or-plate` | Made in `df4f8ede`: the second context carries the file's cookies and Recent record |
| Files outside 4.1.6 | Confirmed: each is a test or a style of B2's surfaces |
| 10, the page sign in dialog on the auth plate | Recorded for Round 3 A2 |

#### B3a (b3a.md)

| Request | Answer |
| --- | --- |
| 1, `hosted-smoke.mjs` | Confirmed: B3a moved the build row's marks in each push; the /decks row follows H2 in `f6829d70` |
| 2, the tmp store banner | Made in `21d484bb` (B3a#8 seam) |
| 3, "You" and "Guest <label>" | "You" on the own chip's tooltip for a visitor with no typed name made in `21d484bb`, with the clause in `chrome.words.no-process-words`; "Guest <label>" and the roster's own row not taken (deviation 3) |
| 4 and 15, the shader noun | The show's Options row "Play animated patterns" made in `21d484bb`; the section head is B3b#13's; the block's name, chip and alt text not taken (deviation 4) |
| 6, `finder.ts` | Made in `5bd0d5a9` (B3a#7 seam) |
| 7, `skills/turboslide-studio/references/assist.md` | Made in `5bd0d5a9` |
| 10, More formats as a submenu | Accepted as B3a's deviation |
| 11, `font-picker-model.ts` | Confirmed (B3a's hunks in B3a#7 and B3a#8) |
| 12, B3b's request 3 | Confirmed: B3b#10 staged it |
| 14, the Assist head and foot | Made in `21d484bb`; the Check slides sentence recorded for a later round (B5's request 11) |

#### B3b (b3b.md)

| Request | Answer |
| --- | --- |
| 8, the core teardown at a phone width | Made in `e8fdee8c` (B3b#14 seam) |
| 9, the two digit hours | Made in `df2d52a8` (B3b#13 seam): the presenter, the inspector's lease time, the profile dialog |
| 10, the eight arrange rows on the memory tier | Recorded for the realtime round: `f8ec63ff` on `realtime/round` (undo and redo wait for each step's admission) is the fix; it is not on this branch, which was cut at `e8b20fec` |
| 11, `decks.file.import-slides-deck` | Made in `df4f8ede`: the walk opens its setup copy once in the browser, as File > Make a copy does, so the Import slides picker (this browser's Recent record since H2) offers it |
| `share.name-prompt.first-share` and `SHARE_NAME_PROMPT_TITLE` | Made in `df2d52a8`: the row retires with its driver, and the constant goes |
| The seven accepted button labels | Kept accepted (deviation 5) |

#### B4 (b4.md)

| Request | Answer |
| --- | --- |
| 1, `measure.ts` | Made in `33b3aa98` (B4a#5) |
| 2, the hosted create path | Made in `a904ef00` (B4b#6 seam); read on the preview by `decks.list.gt-brand-deck` (section 4.4) |
| 3, the store tests | Made in `c17fd8bf` (B4b#6, `store-tests-html.patch`), `0bebf711` and `7d960104` |
| 4, check steps 8, 11 and 14 | Made in `c17fd8bf`: step 8 pins 95 slides, 8 sections and 7 html blocks; steps 11 and 14 count the slides of `decks/gt-brand/deck.json`, so a checkout without the Prototemplate deck reads 85 and the chain's in place import 95 |
| 5, `import.test.ts` and `AGENTS.md` | Made in `c17fd8bf` |
| 6, the importer's inline `<svg>` | Recorded for a later round |
| 10, Reset on a Blank deck | Recorded with HB's request 4 |
| 11, `OPENERS.md` and the 1897 page | Recorded for Kevin |
| 12, the CLI help line | Made in `c17fd8bf` (`cli.ts`, `commands/deck.ts`, and the `deck.create` input's description in `packages/schema/src/actions.ts`, with the contracts regenerated) |
| 13, the drivers that read a new deck's counter or frame | Made in `33b3aa98` |
| 15, `decks.list.gt-brand-deck` 85 to 95 | Made in `c17fd8bf` |
| 17, a speed drawing over its text on the first canvas write | Open: the template landed with the html payload (deviation 1) |
| 18, the stroke grammar and a mask's fills | Answered by B5 in `1adbc355` |
| 19, the importer's two values | Recorded for a later round |

#### B5 (b5.md)

| Request | Answer |
| --- | --- |
| 6, the fifteen accepted findings in files no lane owns | Kept accepted (deviation 5) |
| 10, `facts.json` | Answered by B6c#21 |
| 11, a row for the deck linter's seller messages | Recorded for a later round |
| 12, a fix removes its acceptance | Followed: no integrator commit fixes an accepted finding; the brand lint reads 0 open, 22 accepted, 0 stale at HEAD |
| 13, /home's first paint has no Sign In | By design: /home is prerendered and asks for the sign in facts once after hydration, in a slot whose arrival moves nothing (`sign-in.tsx` `SignInButton`); recorded |
| 14, the /home capture | Made in `5b2af959` |

#### B6 (b6.md)

| Request | Answer |
| --- | --- |
| 4, pictures the realtime round adds outside `realtime/` and `cloudflare/` | Recorded for the merge onto main |
| 7, the gate's comment | Made in `84e2dee5` (B6c#21 seam) |
| 8 and 10, the readers of the evidence folder and the ledger into `docs/` | Recorded for the round after Round 1 |
| 9, the write probe's playwright | Made in `71783b20` (B6b#4 seam) |
| 11, `docs/brand.md` citations | Made in `84e2dee5` |
| 12, `brand-actions.test.ts` and `import.test.ts` | Made in `33b3aa98` and `c17fd8bf` |
| 13, `chrome-round1.ts` unformatted | Made in `e8fdee8c` |
| Check 1 of NEXT.md 5.6 over its bounds | Kevin's decision (section 6) |

### 2. The integrator's commits

In branch order. Each was made under the git lock by the first attempt's commit tool (staged from
HEAD plus the commit's own hunks; the matrix, README and focus renders re-rendered from the staged
matrix and tested before the commit).

| Commit | Push | What it does |
| --- | --- | --- |
| `df4f8ede` | H2 seam | /decks/trash lists the trashed decks the viewer owns; two drivers follow the scoped listing (HA 1, B2 12, B3b 11) |
| `3274a686` | B1#2 seam | the /decks bar and the print bar draw the mark at its 24 px placement (B1 1, 3, 7) |
| `33b3aa98` | B4a#5 | the push itself, from B4's payload: the Blank deck plain in the editor, the PDF and the PowerPoint (B4 1, 13; HB 1, 2) |
| `5bd0d5a9` | B3a#7 seam | the finder and the Assist reference stop naming the removed Tools > Assist row (B3a 6, 7) |
| `21d484bb` | B3a#8 seam | the tmp store banner, You on the own chip, Play animated patterns in the show, two Assist sentences (B3a 2, 3, 14, 15) |
| `df2d52a8` | B3b#13 seam | every clock writes 7:39 PM; the first-Share name prompt row retires (B3b 9, push 13 note) |
| `e8fdee8c` | B3b#14 seam | the core teardown widens a phone page to reach File; the B3b module formatted (B3b 8, B6 13) |
| `71783b20` | B6b#4 seam | the write probe loads its own checkout's playwright (B6 9) |
| `84e2dee5` | B6c#21 seam | `docs/brand.md` cites the archive paths; the gate's ledger comment (B6 11, 7) |
| `a904ef00` | B4b#6 seam | a deck made from the GT template on a hosted tier fetches the pictures the template names past the stored seed deck (B4 2) |
| `5b2af959` | B2a#15 seam | the /home pictures captured again on the round's chrome; the canvas crop leaves the capture (B2 8, B5 14) |
| `c17fd8bf` | B4b#6 | the push itself, from B4's html payload: the GT template is the 95 slide deck of 2026-10-01 (B4 3, 4, 5, 12, 15) |
| `0bebf711` | B4b#6 seam | the store's template test drops the helper the html payload does not use (check step 4) |
| `7d960104` | B4b#6 seam | the store's template test formatted (check step 19) |
| `f6829d70` | H2 seam | the hosted smoke's /decks row reads that a cookieless stranger is listed no deck (the preview's smoke) |

The second attempt's commits, each answering a red of its runs (sections 3 and 4.2):

| Commit | Push | What it does |
| --- | --- | --- |
| `71e42ab4` | H2 seam | Restore on the trash page puts the deck back in this browser's Recent record, so an anonymous owner's /decks lists it again (`decks.trash.restore`, `decks.trash.lists-after-restore`) |
| `c206823c` | B3b#13 seam | the people rows name the guest through Change name, and the shader groups row reads the section's new noun |
| `addedf48` | B2c#17 seam | `chrome.buttons.one-rule` opens the refused page with an id every server refuses |
| `1c821bbf` | B3b#13 seam | `share.dialog.you-label` names its second browser through Change name as well |
| `e1ad28d4` | B3b#13 seam | the accounts spec names a second browser through Change name when Share asks no name |
| `717aabe9` | B6c#21 seam | this note's first version, the run ledgers and the pictures |
| `adf1fd75` | B2b#16 seam | the viewer spec reads a ruled row's 160 px capture as the home page's capture (check step 17) |
| `6b417c80` | B3b#14 seam | the chrome lint opens the editor's menus through the Menus key at a phone width (check step 18) |

### 3. The chain

`scripts/check.mjs` stops at its first red step, so it was run in segments, one step at a time
in the second attempt. The first attempt's readings ran on the trees named. After `c17fd8bf` the
commits change two test files, `scripts/hosted-smoke.mjs`, the trash page's restore (`71e42ab4`)
and drivers; the second attempt's readings are at `e1ad28d4`. Step 7 imports the live
Prototemplate deck into `decks/gt-brand` in place. That import is never committed (question 29),
and the seed deck is restored from git after the segment that ran it.

| Step | What it runs | Attempt and time | Reading |
| --- | --- | --- | --- |
| 1 | `pnpm install --frozen-lockfile` | first, at `c17fd8bf`, 04:13Z, load 24 | ok, 0.4 s |
| 2 | the router's generate | first, 04:13Z | ok, 1.3 s |
| 3 | the contracts current | first, 04:13Z | ok: 14 files current |
| 4 | `tsc -b` | first, 04:13Z at `c17fd8bf`; again 04:27Z at `0bebf711` | red at `c17fd8bf` (TS6133, `contentOf` unused in `templates.test.ts`), fixed by `0bebf711`; ok, 1.2 s |
| 5 | `pnpm test` | first, 04:27Z to 04:30Z at `0bebf711`, load 42 to 49 | ok: 486 files, 5,115 passed, 6 skipped, 2 todo, 136.6 s. The stale pin of the realtime round (`import.test.ts` 85 against 95) is green since `c17fd8bf` |
| 6 | `pnpm build`, the client bundle check, the greps | first, 04:30Z | ok, 11.4 s; the largest client chunk 1,184,195 B over its 600,000 B ceiling is reported and does not hold the step (standing) |
| 7 | the Prototemplate import into `decks/gt-brand` | first, 04:37Z, load 36; second, 15:58:28Z to 16:01:12Z at `e1ad28d4`, load 20.77 to 27.64 (the accounts run's hook inside it) | ok, 1.5 s |
| 8 | 95 slides, 8 sections, 7 html blocks | first, 04:37Z; second, 16:02:12Z | ok (red on the realtime round's 85 pin; green since `c17fd8bf`) |
| 9 | `turboslide validate decks/gt-brand` | first, 04:37Z; second, 16:02:12Z | ok: 95 slides, 0 errors, 49 warnings (ext data kept) |
| 10 | renders in both themes | first, 04:57Z, load 21.4; second, 16:02:14Z to 16:04:19Z, load 21.62 to 12.25 | ok, 22.7 s |
| 11 | two renders per slide | first, 04:57Z; second, 16:04:19Z | ok (190 renders for the imported 95 slides; red on the old 170 pin) |
| 12 | `compare-to-shoot.mjs` against the Prototemplate shoot | first, 04:57Z to 04:58Z, load 21.5 to 25.7; second, 16:04:19Z to 16:05:26Z, load 12.25 to 30.92 | ok, 66.3 s: 190 pairs, 0 over budget, worst 0.408 percent (`fixed-points`), mean 0.017; the speed mark slides read 0.001 to 0.002 percent as html blocks |
| 13 | the contact sheet | second, 20:30:09Z to 20:30:16Z, load 23.70 to 23.89 | ok, 6.2 s |
| 14 | one cell per slide | second, 20:30:16Z | ok (95 cells for the imported 95 slides; skipped on the realtime round's 85 pin) |
| 15 | `turboslide lint all` | second, 18:05:57Z to 18:07:50Z (opens no browser: the rendered layer reads step 10's records), load 58 to 66 | red as standing: 221 findings, 1 at severity 3: `asset/credit-on-plate` on `mood-dictionary` of the live Prototemplate deck that step 7 imports in place. That slide now pictures the 1897 page with the credit "Image: Oxford University Press, 1897, scanned by the Internet Archive, public domain", and the rule checks the plate against `OPENERS.md` 255, which still names Cullen328's Compact OED photograph. B4's licence read found no licence stated on the 1897 page's source, so the committed `decks/gt-brand` and the GT template keep the Compact OED (b4.md request 11, Kevin's) |
| 16 | `turboslide build --budget 16` | second, 18:07:50Z to 18:08:01Z, load 66 | ok, 10.6 s: 14.79 MiB of the 16 MiB budget, 95 slides |
| 17 | `viewer.spec.ts` on the chain's dev server | second, 20:35:32Z to 20:37:49Z, load 23.41 to 22.11 | red, 7 of 8: "the home cards keep their captures" waited for a 320 px render on /decks, and a ruled row asks 160 px since B2b#16; driver fixed in `adf1fd75`. Read again at `adf1fd75`, 21:45:19Z to 21:46:02Z, load 10.99 to 20.05: ok, 8 of 8 in 23.4 s |
| 18 | the chrome lint on six routes | second, 20:37:49Z to 20:39:59Z, load 22.11 to 38.83 | red: /deck/gt-brand's 24 audits passed with 0 findings; /edit stopped at 390 px, where the editorMenu state clicked the hidden menu bar (the Menus key since B3b#14); fixed in `6b417c80`. Read again at `6b417c80`, 21:46:02Z to 21:47:40Z, load 20.05 to 23.65: red on a real finding, the /deck audits clean, the /edit audits 18 with 2 that find: at 390 in the editorPanel state, in both themes, the Menus key's focus outline sits 0.5 px off the key's box at y 48 and 79 ("junction gap 0.5"); the step stops there, so /new, /decks, /home and Not found were not audited in this run (B5b's own run read them with 0 failing, b5.md) |
| 19 | prettier and the README ledger | first, 04:38Z, load 34.7, on `7d960104`'s tree | ok, 64.1 s (H5's one ignore line; red on the realtime round) |
| 20 | the parity audit | second, 21:09:00Z to 21:29:58Z, load 19.63 to 16.86 | red as standing (red before the round): the audit's own count 2,703 passed, 102 failed, 380 skipped. Some of its expectations predate Round 1's words and cuts (File > New > "Presentation" where the row reads "New presentation", a panel titled "Brand kit" where it reads "Theme", the Logo dialog from Insert); others are the toolbar and shortcut reads of the realtime round's list. The step rewrites the tracked `docs/gslides-parity/verification-3/parity-audit.json` (last committed 2026-09-15); its output was kept as `.turboslide/round1/int/parity-audit-step20.json` and the tracked file restored from git |
| 21 | fifteen e2e specs on the chain's dev server | second, 21:45:19Z to 22:03:39Z at `6b417c80`, load 10.99 at the start (after the hook's reruns of 17 and 18) to 20.09 | red: 35 passed, 23 failed, 14 did not run. The realtime round named this step red before the round, with no count to compare. Eight of the 23 read a word, a count or a control that changed: `hygiene.spec` and `landing.spec` wait for "Not saved yet" (B3b#9 shows one status phrase), `present.spec` for the Options menu's stubs behind Tools > Advanced tools (B3a#7), `objects.spec` meets two `insert.shape` items in strict mode (B3b#14's Menus key); and, by a push this note did not trace, `home.spec` reads "Delete Copy of Home beta forever?" without "This cannot be undone", `filmstrip.spec` counts 22 layouts against 21, and `deck-transfer.spec` reads "Fixture deck.zip" and, from a home card's Download, "Fixture deck.pptx" where it wants `fixture-r<n>.zip`. The other 15 (canvas, charts, export-batch, gslides-actions twice, filmstrip twice, present twice, tables, ten-tasks three times, text-editing, text-styles) are not attributed: no reading of this step on the base tree exists, and none was taken (section 6) |
| 22 | the native and flatten exports | second, 20:32:20Z to 20:33:32Z, load 23.84 to 34.12 | ok, 72.1 s: both exports valid, the flatten report perfect |
| 23 | the fonts build | second, 18:08:01Z | skip: no fonts venv at `.turboslide/venv` (standing) |
| 24 | the canvas fidelity of three decks | second, 20:30:16Z to 20:32:20Z, load 23.89 to 23.84 | red, 123.9 s: 191 slides converted, 382 pairs, 28 over the 0.5 percent budget. The 28 are the seven speed mark slides of the imported `decks/gt-brand` and of the committed GT template, in both themes: speed-plate 18.58, speed-lockup 17.26, speed-monogram 13.63, speed-livery 13.57, speed-dithered 13.39, speed-ascii 8.6 and speed-double-cut 3.91 percent. They are html blocks (deviation 1): converting one to a canvas does not keep the drawing in place, b4.md requests 17 and 6. NEXT.md 4.1.3 item 24 records the same slides 13 to 18 percent off before the import. Every other pair is within budget (mean 0.934 percent) |
| 25 | the render worker's container | second, 18:08:01Z | skip: no Docker daemon (standing) |
| 26 | nine e2e specs (accounts, share, security and more) | second, 21:29:59Z to 21:45:19Z, load 16.86 to 10.99 | red as standing: 52 passed, 12 failed, 2 skipped. Eleven are the realtime round's eleven of this step (the accounts spec's share link, cors and chrome surface tests, `people.versions-author-account`, `share.dialog.grant-email-line`, and one each in comments, dither, presence, security, share and versions-by-author). The twelfth is `accounts.decks-list-scoped`: on the chain's file store H2 lists the whole store to every caller by design, so B's /decks reads four more decks; the row reads the tmp store and passed there (4.3) |
| 27 | the layout shift audit on 4344 | second, 18:08:01Z | skip: no preview answers on 4344 (standing; this note started no server on another lane's port) |
| 28 | the dependency audit | first, 04:38Z | ok: 2 advisories at high or above, both accepted in `scripts/audit-allow.json`, none expired |
| 29 | the brand build, home assets, definitions and native record | first, 04:38Z | ok: the mark's paths match their rectangles; 32 files match the manifest; 8 files of 4 pictures; the Linux addon pending as recorded |
| 30 | the Vercel build and `check-vercel-output.mjs` | first, 04:40Z, load 30.7 | ok, 30.3 s: 40 of 40 assertions; the functions at 155.9 MB of the 250 MB cap |
| 31 | the node-server build and its perf budget | second, 11:41:08Z to 11:45:06Z at `f6829d70`, load 8.91 to 21.07 | red as standing: the build ok; 105 of 148 budgets met. The 43 red: 32 js size rows (the largest chunk 1,156 KB against 586 KB on every route), 5 DOM counts (`/deck/gt-brand` 2,560, `/edit/gt-brand` 2,108, the filmstrip with 87 cards 2,818, each against 1,500) and 6 timings read as the load rose past 20 (the warm first byte of `/edit` 50 ms and `/present` 52 ms against 40, the new slide's painted card 20 ms against 16, its acknowledgement 2,040 ms against 250, the capture 2,045 ms against 2,000, the next `/decks` card 1,988 ms against 1,500), void under NEXT.md 4.0's load rule. The realtime round read the same 32 js rows and the DOM counts |
| 32 | the core gate on the chain's dev server | not run | left to the ship: about 3 hours at a load under 24, which the machine did not hold from 16:05Z to 20:30Z. The whole matrix on the node-server build (4.2) is the run of record; the realtime round read this step at 1,069 rows, 900 passed |
| 33 | the brand lint | first, 04:38Z | ok: enforce mode, 0 open, 22 accepted, 0 stale |

Checks outside the chain, at `f6829d70` (second attempt, 05:50Z to 06:20Z), with `tsc -b` exit 0 and
prettier clean again after each of the second attempt's commits (and at `6b417c80`: vitest of
`apps/studio/src/routes`, `packages/headless` and `docs/readme`, 17 files, 93 passed):

- `node_modules/.bin/tsc -b`: exit 0.
- vitest of the packages the last three commits changed: `scripts/hosting-check.test.mjs` and the
  store's `templates`, `template-index` and `template-twins` tests, 4 files, 47 passed. The
  workspace run of step 5 (486 files, 5,115 passed) is the first attempt's at `0bebf711`.
- `node scripts/check.mjs --greps`: exit 0 (28 innerHTML call sites and 26 `overwrite: true` in the
  allowlist).
- `node docs/readme/what-works.mjs --check`: README.md is current.
- `node scripts/probes/core-matrix.mjs --emit-parked docs/gslides-parity/focus/ship-4300058d.json
  --check`: current, 14 parked controls.
- prettier `--check` on every file the round changed outside `docs/gslides-parity/` (910 files):
  exit 0.

The checks of NEXT.md 4.1.5 outside the matrix:

| Check | Reading at HEAD |
| --- | --- |
| The brand lint step exits 0 in enforce mode, credits included (B5b) | step 33 exit 0: 449 scripts, 114 stylesheets, 28 mood pictures; 0 open, 22 accepted, 0 stale |
| `scripts/build-brand.ts --check` with the monogram's sha256 (B1) | step 29 exit 0: the paths match their rectangles and rows; 32 files match the manifest |
| The README head test (B1, rank 26) | `packages/theme/src/brand.test.ts` "the README head and the brand record": 37 of 37 passed |
| The CLI version (B1b, rank 27) | `apps/cli/src/commands/banner.test.ts` passed (the release's version, never 0.0.0) |
| `grep -c turboslide.vercel.app docs/brand.md` reads 0 (B1, rank 28) | 0 |
| The chain's steps 5, 8, 11, 12, 14, 15 and 24 after the import | in the table above |

The checks of NEXT.md 5.6 after B6's last push:

| Check | Reading at HEAD |
| --- | --- |
| 1. at most 5,000 tracked files and 300 MB | over both: 6,205 files and 336.6 MB of tracked bytes (Kevin's decision, section 6) |
| 2. the format step exits 0 | step 19 exit 0 |
| 3. the docs index test | `docs/readme/docs-index.test.mjs` passed |
| 4. no picture over 200 KB, a round folder under 25 MB | `docs/readme/evidence-policy.test.mjs` passed; round1 holds 440 pictures, 18.4 MB, the largest 173,064 bytes |
| 5. no folder over 1,000 entries | the widest is `focus/verification` at 506 |

### 4. The runs

Every run below started at a one minute load under 24, except the hosted smoke's second run,
which opens no browser; the load at the start and the end is beside each. The gate's waiter (`r1int/when-load.sh`) checked every
five minutes until 09:21Z and every minute after. The load stayed between 24 and 372 from 04:58Z
to 11:11Z on 2026-10-03, mostly from other projects' renders and test runs. Ledgers are under
`docs/gslides-parity/round1/verification/`, raw drives under `.turboslide/round1/int/`.

#### 4.1 The hosted smoke

`scripts/hosted-smoke.mjs` sends HTTP requests only, with no browser.

| Run | When and load | Tree of the smoke | Reading |
| --- | --- | --- | --- |
| 1 | 04:56:25Z to 04:57:00Z, load 23.55 to 21.37 | `c17fd8bf` | 41 of 42: `/decks` expected "a 200 list naming the deck" and read 0 cards. H2 makes a cookieless request a stranger, so the row read the fix as a failure; `f6829d70` changes the row |
| 2 | 06:54:47Z to 06:55:17Z, load 162.30 to 150.38 (no browser, so not gated; its ms column is not a timing reading) | `f6829d70` | 42 of 42; `/decks` 200 with 0 cards and no caption; the build commit row reads `c17fd8bf` |

#### 4.2 The whole matrix on the local memory tier

The run of record: `core-gate.mjs --base http://localhost:4510 --tier memory --parked
focus/ship-4300058d.json --lock <scratch> --matrix round1-local-memory.json` (`r1int/gate.sh`),
against the node-server build that check step 31 wrote at 11:41Z to 11:45Z. The pair: 4510 with
`TURBOSLIDE_MAIL=capture` and 4520 with `TURBOSLIDE_MAIL=off` as `TURBOSLIDE_MAIL_OFF_BASE`, one
overlay each on the tmp store, the memory tier, an identity database each, the local open
surface, the fake Google pair, the assist and logo fixtures, secrets minted per start into a file
only the gate's environment reads. The build is `f6829d70`'s product (the commits after it change
drivers and one route, read narrowed below).

11:45:09Z to 14:45:48Z (10,839 s). Load 20.50 at the start, 10 to 30 at the polls of the walk's
first hour, 13.91 to 184.69 (median 36.65) in the two minute samples from 12:46Z, 37.12 at the end.
Other projects' renders drove the load; every timing row of the run's last two hours is read with
that load beside it.

| Part | Reading |
| --- | --- |
| The whole | 1,101 rows: 917 passed, 72 failed, 112 not driven (2 manual), 0 no step, 17 local rows not recorded (the accounts run's, 4.3); retries zero; verdict failed with 56 blocking rows (33 failed, 23 not driven) |
| The walk | 781 steps in 4,163 s |
| The specs | 318 passed, 31 failed, the rest skipped by their rules, 4,900 s |
| The cost rows | `cost.editor-idle.calls`, `cost.editor-editing.calls`, `cost.two-tabs-idle.calls`, `cost.show.calls` and `sync.pull.no-listing` passed; none over its ceiling; `cost.editor-hidden.calls` (headless), `cost.redis.commands` and the six `do` tier rows not driven by their rules, as on the realtime round's run |

Against the realtime round's run of record (`realtime-local-memory.json` on `realtime/round`,
1,069 rows, 895 passed, 65 failed, 109 not driven):

- The round's 31 new rows: 30 passed. `chrome.buttons.one-rule` failed on its driver (its refused
  page address, fixed in `addedf48`).
- 61 rows red on both runs, the standing reds: the arrange and undo class of b3b.md request 10
  (`arrange.group.chords`, `arrange.group.menu-regroup`, `arrange.distribute.*`,
  `arrange.snap.guides-on-off`, `arrange.clipboard.menu-copy-paste`,
  `arrange.redo.after-undone-duplicate`, `arrange.context.rotate-distribute`), the images
  gesture rows (`images.resize.*`, `images.rotate.ring`, `images.crop.redo`), the shapes and
  lines tails, the shaders frame and panel rows, the svg rows, `charts.export.pdf`, the export
  timing rows, the logos picker rows, `templates.gallery.page`, `assist.viewer.disabled`,
  `assist.snackbar.names-change`, and the four rows that copy the GT template
  (`decks.list.gt-brand-deck`, `brand.appearance.default`, `export.download.large-deck-pdf` and
  `-pptx`), which the node-server build cannot copy: its seed holds the decks' documents and none
  of their pictures, so `deck.create` from the GT template answers "The template names an assets
  folder that is missing" (the server log reads "fetched 0 of 209 twins").
- 4 rows green here and red there: `text.select.shift-home-line`, `decks.home.links-and-card`,
  `surface.domain.build-commit` and `sync.title.concurrent-both-kept`.
- 10 rows red here and green there, each read below:

| Row | Cause | Answer |
| --- | --- | --- |
| `decks.trash.restore`, `decks.trash.lists-after-restore` | H2: Move to trash drops the deck from this browser's Recent record, and an anonymous /decks lists that record alone, so a restored deck never listed again | product fix `71e42ab4` (H2 seam) |
| `people.chip-tooltip-trust`, `people.comment-departed-guest`, `realtime.departed-guest.name-stable` | B3b#13: the drivers named the guest through the first Share's prompt, which the Share dialog no longer asks | driver fix `c206823c` (B3b#13 seam) |
| `shaders.panel.section-groups` | B3b#13: the section reads "Animated pattern" and the driver looked for "Shader" | driver fix `c206823c` |
| `present.laser.visible` | the dot's ground read as its own ink (#101010), so the drawn diameter read 1 | read below |
| `slides.import.none-preselected` | H2 with the node-server class above: the Import slides picker no longer lists the seed brand deck for a browser principal, so the walk copies the GT template, which this build cannot | read on a dev server below |
| `text.link.cmd-k-enter`, `text.link.toolbar-button` | "no run undefined on the stage" after the double click; `text.link.cmd-k-enter` was red on the realtime round's check step 32 as well | read again below |

`share.dialog.you-label` read not driven here and passed there: its driver also named the guest
through the first Share's prompt (fixed in `1c821bbf`, B3b#13 seam). The other 22 blocking not
driven rows are not driven on both runs (the `gestures.*` rows, `sync.resend.idempotent`,
`decks.recent.this-browser-sentence`, `realtime.agent.write-announced`).

HB's request 2 (the walk's /new deck starts with no logo): `brand.logo.remove`,
`brand.logo.replace-every-slide` and `brand.background.enter-keeps-open` passed in the walk's own
order. The last one read red on the preview's brand walk (4.4), which runs the brand area alone.

The new reds read again, narrowed, each with its own setup (NEXT.md 6.1 rule 5). The driver
seams were read on the same node-server pair, since a spec's driver is read from the tree at run
time; the H2 seam is in the product, so its rows were read on a vite dev server of the tree on
4520 (the recipe of the round's prompt, the node server on 4520 stopped first, one unmocked visit
to warm it).

| Run | Ledger | When and load | Reading |
| --- | --- | --- | --- |
| The driver seams on 4510 | `round1-local-rerun-drivers.json` | 14:54:52Z to 14:56:57Z, load 13.51 to 18.78 | 7 of 7 passed: `share.dialog.you-label`, `people.chip-tooltip-trust`, `people.comment-departed-guest`, `realtime.departed-guest.name-stable`, `shaders.panel.section-groups`, `chrome.buttons.one-rule`, `present.laser.visible` |
| The text area on 4510 | `round1-local-rerun-text.json` | 14:56:57Z to 15:04:39Z, load 18.78 to 21.18 | 89 rows: 85 passed, 3 failed: `text.link.cmd-k-enter` and `text.link.toolbar-button` red again with the same words, and `text.select.shift-home-line` ("the narrow box was not placed"), which passed in the whole matrix and failed on the realtime round's run |
| The trash rows on the dev server | `round1-local-rerun-dev-trash.json` | 15:07:20Z to 15:07:37Z, load 21.22 to 21.69 | 3 of 3 passed: `decks.trash.listed-after-move`, `decks.trash.restore` (1.2 s), `decks.trash.lists-after-restore` (3.2 s) |
| The text area on the dev server | `round1-local-rerun-dev-text.json` | 15:07:37Z to 15:15:19Z, load 21.69 to 17.88 | 89 rows: 87 passed, 1 failed: `text.link.toolbar-button` with the same words; `text.link.cmd-k-enter` passed |
| The slides area on the dev server | `round1-local-rerun-dev-slides.json` | 15:15:19Z to 15:21:23Z, load 17.88 to 42.30 | 83 rows: 82 passed, 1 failed: `slides.import.none-preselected` (below) |

`present.laser.visible` passed narrowed in 1.5 s. A picture of the show on 4510
(`r1int/peek-show/laser.png`, 15:04:39Z, load 21.18) draws the white slide on the ink surround
with the dot and its paper ring over it. The whole matrix's reading (the ground read as the dot's
own ink) is one red that did not reproduce; its row stays under the flaky rule.

`text.link.cmd-k-enter` and `text.link.toolbar-button`: the walk inserts a throwaway text box at
sheet point 1200, 700 and types its words only when the editor reports a typing session right
after the insert (`toolkit.mjs` `insertByTool`); "no run undefined" means the box landed with no
text. Both rows read red twice on the node build; on vite dev `text.link.toolbar-button` read red
and `text.link.cmd-k-enter` green; the realtime round's check step 32 read
`text.link.cmd-k-enter` red as well. No Round 1 change to that path is
identified; it is a finding for the text walk's owner (section 6).

`slides.import.none-preselected`: since H2 the Import slides picker lists the browser's own and
shared decks, so the seed brand deck is no longer offered to a fresh browser, and the walk copies
the GT template to import from. On the node build that copy fails (the class of 4.2). On vite dev
the copy opens with its 95 tiles, the selection reads right (0 on open, 3 after three clicks with
"Import 3 slides", 8 after the Shift click, 0 after None), but the three picked slides do not land
("landed 0") while the worker renders the copy's 95 tile pictures one by one, about 2 s each
(the dev server's log). A finding for H2's owner and Round 2 (section 6).

#### 4.3 The local accounts run

`core-gate.mjs --only accounts --tier memory` on the node-server pair (`apps/studio/e2e/accounts.spec.ts`,
the 17 local rows). Four runs, because the first two read the harness and not the product:

| Run | Ledger | When and load | Reading |
| --- | --- | --- | --- |
| 1 | `round1-local-accounts-run1.json` | 14:52:49Z to 14:53:02Z, load 19.19 to 17.93 | 3 failed at the code read ("mail.code null"), the rest skipped behind them. A tmp store resolves a relative `TURBOSLIDE_AUTH_DB` under its overlay's `.turboslide` (lsof on the 4510 server), and the gate gave the spec the checkout's path, where the seed found no mail. `gate.sh` now names the overlay's path |
| 2 | none kept (run 3 wrote the same path) | 15:04:39Z to 15:06:13Z, load 21.18 to 23.68 | the code read right; 4 passed, 7 failed, 6 not driven: the rows that sign in met 429, since run 1 had spent the server's sign in mails |
| 3, the run of record | `round1-local-accounts.json` | 15:58:32Z to 16:01:08Z, load 22.47 to 29.01, a fresh pair | 17 rows: 12 passed, 4 failed, 1 not driven (`accounts.google-roundtrip`, manual: no Google client). Red: `people.versions-author-account` ("a record by the anonymous id"), `people.labels-disambiguated` and `share.dialog.grant-email-line`, the realtime round's finding 3, red on its runs too; and `accounts.sign-out-clean` at its sign in (429) |
| 4, the H2 and H3 rows narrowed | `round1-local-accounts-rerun.json` | 16:02:17Z to 16:03:54Z, load 20.77 to 12.29, a fresh pair | 2 of 2 passed |

Why run 3's last row met 429: the tmp store counts as hosted, so `TURBOSLIDE_AUTH_RATE_LIMIT=off`
does not turn off the library's limit of 10 sign in mails per IP per hour
(`auth/better-auth.ts` 80 to 89), and the spec signs in more than ten times from one IP.
The row's own reading is run 4's.

Run 3 and 4 readings of the round's local rows:

- `accounts.decks-list-scoped` (H2): B, signed in, lists its own deck and A's deck shared with B
  by email, and not A's other deck; A lists its own deck alone; `/decks` and `deck.list` agree.
  Passed in run 3 and run 4.
- `accounts.sign-out-clean` (H3): 108 ms from the click to the reload; a second browser saw the
  badge gone 7 ms after; the principal went from the account to a new anonymous id with a new
  cookie and no session. Passed in run 4.
- `accounts.google-button`, `accounts.google-error-sentence`, `accounts.google-leaves` and
  `accounts.email-hidden-without-mail` (the realtime round's rows that H4 changed) passed in run 3;
  `accounts.no-dead-method` (H4) passed on the preview (4.4) and in the whole matrix.
- `people.verified-badge` passed in run 3 with `e1ad28d4` (the guest named through Change name).

#### 4.4 The preview, narrowed

`core-gate.mjs --base <preview> --tier blob --only specs --rows <28 rows> --parked
focus/ship-4300058d.json`, with the bearer and the OIDC token through
`~/.config/turboslide/with-tokens.mjs`. The rows are the guard's seller path (`decks.list.read`,
`decks.list.open-title`, `share.dialog.open`, `share.copy-view-link`, `comments.reply`,
`comments.resolve`, `present.keys.arrow-right`, `export.download.pdf-direct`,
`export.download.pptx-direct`), the round's hosted rows (`decks.list.own-and-shared`,
`decks.list.action-scoped`, the ten `brand.*` spec rows) and the rows of 4.1.7's narrowed preview
list (`decks.og.deck-card`, `decks.manifest.paper`, `chrome.mark.one-product-mark`,
`decks.list.ruled-rows`) with `decks.list.gt-brand-deck`, `export.remove.copies-gone` and
`accounts.no-dead-method`.

| Run | Ledger | When and load | Reading |
| --- | --- | --- | --- |
| The spec rows | `round1-preview.json` | 11:11:56Z to 11:23:27Z, load 23.87 to 18.29, 692 s | 28 rows: 27 passed, 1 failed. `decks.list.gt-brand-deck` read 15,826 ms against its 15 s bound and stopped before its slide count |
| The rerun of the red row, narrowed (6.1 rule 5) | `round1-preview-rerun.json` | 11:37:08Z to 11:37:49Z, load 17.79 to 17.83 | passed in 10.0 s with its 95 slides |
| The brand walk area | `round1-preview-brand-walk.json` | 11:23:27Z to 11:26:39Z, load 18.29 to 29.83, 192 s | 15 rows: 12 passed, 2 failed, 1 not driven. `brand.background.enter-keeps-open` failed at Add to theme's Done ("locator.boundingBox: Timeout 30000ms"; the matrix lists it broken). `brand.objects.kit-colours-first` failed with "no table from the tables area to read", since a run narrowed to the brand area has no tables area before it. `brand.logo.use-on-every-slide` is not driven: `format.image.useOnEverySlide` is not on this build |

Readings on the preview that answer a request or a check:

- `export.remove.copies-gone` (hb.md request 3): 2 copies answered 200, 200 before the removal and
  404, 404 251 ms after it. The Blob cache's 60 s did not show, and the 5 s bound holds on this
  reading.
- `decks.list.own-and-shared`: a fresh browser lists 0 cards; after its own deck it lists that one
  deck; caption count 0; the file's other deck is not listed.
- `decks.list.action-scoped`: the window transport lists the browser's own deck alone (1 with the
  trash); `POST /api/actions/deck.list` with the cookie alone answers 401 in enforce mode; the
  bearer lists 148 decks.
- `decks.og.deck-card`: `og:title` "Northwind renewal v2", `og:url`
  `https://www.turboslide.com/deck/<id>`, `og:image` `https://www.turboslide.com/og/turboslide.png`,
  one `og:title` and one `og:url`; the card's address is not in monospace.
- `decks.list.ruled-rows`: rows, no cards, a 64 by 36 thumbnail with a 1 px edge, the hatch after
  the strip; no Sign In, because the preview offers no sign in method.
- `decks.list.gt-brand-deck` and B4's request 2: the GT template's copy opens with 95 slides on the
  blob tier, with the twins `a904ef00` fetches. The copy took 10.0 s and 15.8 s on two readings,
  so the 15 s bound sits inside the spread of this row on the blob tier (section 6).
- The write probe (`scripts/probes/new-write-probe.mjs --base <preview>`, 11:36:20Z to 11:37:08Z,
  load 22.60 to 17.79): every step ok. Twelve sequential edits each acknowledged at the next
  revision, the reload kept the revision, no self collaborator, the first write after opening was
  not lost, and File > Move to trash then Delete forever removed its deck.

#### 4.5 The pictures

Every brand surface of 4.1.5's divergence map, at 1440 by 900 and 390 by 844 in the light and
the dark appearance, as JPEG viewport captures under 200 KB, under
`docs/gslides-parity/round1/build/integrator/` (67 files, 2.8 MB; the largest is the served card,
173,321 bytes). I looked at every one.

On the preview (`r1int/shoot-preview.mjs`, 11:37:49Z to 11:41:08Z, load 17.83 to 8.91; the
selection again at 14:54:31Z to 14:54:48Z, load 12.81 to 13.51, after the first run clicked a box
on a slide the editor had not opened): `home`, `decks`, `notfound`, `refused` (`/edit/Not_A_Slug`),
`editor` (a Blank deck's first write), `select`, `menus` (Insert, under the Menus key at 390),
`share`, `versions`, `present` (the presenter page), `view` (the /deck route), `access` (a
cookieless stranger on the restricted deck), and `card-1200.png` (the served
`/og/turboslide.png`). The divergence map's ranks read on them: 1 (ruled rows, no stranger's deck),
2 (a Blank deck plain and with no GT mark), 3 and 4 (the title row at 390 keeps the name and fits),
5 (the white slide on the dark workspace), 6 (Assist as the word), 9 to 12 (one rail each side,
crosses at the seams, the 58 px bar, the hatch), 13 (the /home capture plain), 14 (the 16 px
gutter at 390), 16 (`#2f5ce0` with white chip text), 17 (the speed mark on every bar), 18 (Title
Case buttons, square corners, Slideshow with its label first), 19 (the presenter head wraps), 20
(You need access in full sentences), 21 (Share's ruled rows), 22 ("4:38 AM" with the rule across
the panel).

On the local node server 4510 (`r1int/shoot-local-signin.mjs`, 14:53:02Z to 14:53:37Z, load 17.93
to 14.66; under `integrator/local/`): the Sign in surfaces the preview cannot draw, because it
offers no sign in method: the title row with Sign In as text, the More key at 390 with its Sign in
row, the Sign in dialog, and the `/decks` and `/home` bars with Sign In. The dialog is the realtime
round's, with no lockup at its head: its restyle on the auth plate is Round 3 lane A2's (4.1.4).

What the pictures show beyond the rows (section 6):

- At 390 the presenter page's Next slide card runs past the viewport's right edge
  (`present-390-*.jpg`); `present.presenter.phone-head` reads the head alone.
- At 390 the /deck view's first paint draws its keyboard hint over the deck's title
  (`view-390-dark.jpg`), and its facts table names the revision ("r3").
- The refused page shows the store's own words ("deckId must be a slug."), b2.md's finding.
- On the node-server build the GT template's card on `/decks` shows the GT monogram in place of the
  example deck's cover, since that build carries no pictures (the class of 4.2).

### 5. The preview

`https://turboslide-lp2z0cdl8-kl01s-projects.vercel.app` (deployment `dpl_2H7HxTw8rjrPdR974jyGkbMoPJzK`
on Kevin's personal project `kl01s-projects/turboslide`), deployed from
`/Users/kevinliu/repos/Turboslide-next` at `c17fd8bf` on 2026-10-03 at 04:13:36Z with the recorded
command (`vercel deploy --yes --archive=tgz -e TURBOSLIDE_AUTHORIZE=enforce -e
TURBOSLIDE_ASSIST=fixture -e TURBOSLIDE_LOGO_UPSTREAM=fixture -e TURBOSLIDE_MAIL=off -e
TURBOSLIDE_REALTIME=blob -e TURBOSLIDE_PUBLIC_STORE_HOST=ggmycvj7j6224ay5.public.blob.vercel-storage.com`
with the two secrets minted inside the command by `openssl rand -hex 32`; never `--prod`). READY
at 04:15:13Z. The build serves `c17fd8bf` (the smoke's build commit row). The commits after it
change tests, drivers, the smoke script and one product file, `decks.trash.tsx` (`71e42ab4`, the
restore's Recent record), whose rows were read on the dev server (4.2). The preview is otherwise
the round's merged product.

The preview's store listed 171 deck ids to the bearer before the first hosted run (04:17Z) and
listed 172 after the last one (11:45Z). The one more,
`untitled-20261003-j6i0`, was created at 11:31:40Z to 11:31:46Z by an anonymous principal (its
version list), while none of this note's runs was active (the brand walk ended at 11:26:39Z and the
write probe started at 11:36:20Z). The preview shares the personal project's Blob store with
`turboslide.vercel.app` and its other previews, so it is another agent's deck and is left in place.
Every deck this note's runs made was removed: the specs' and the walk's by their teardowns, the
write probe's by its own Delete forever, and the picture run's `untitled-20261003-c5er` by id with
the bearer (`deck.remove` 200, then `deck.info` 404), after the run's own teardown read 401 on an
unauthenticated `deck.remove`. The selection picture's deck `untitled-20261003-hkxi` was removed by
the fixed teardown (trash 200, remove 200, `deck.info` 404 at 14:54Z). The store's listing was not
read again after it.

### 6. Findings by owner

Recorded from the lanes' notes and the integrator's runs. None blocks a push of this round
unless it says so.

- Kevin:
  - NEXT.md 5.6 check 1: the tree holds 6,205 files and 336.6 MB of tracked bytes against the
    bounds of 5,000 and 300 MB. The growth after B6a comes from the round's own lanes and
    pictures. Either the bound follows the measured tree, or the closed rounds' run JSON leaves
    the tree the way their pictures did (b6.md).
  - The licences: `P:deck/shots/OPENERS.md` is out of date for the tablet, Johnson, the gloss and
    the dictionary picture, and the 1897 OED scan states no rights, so the dictionary slide stays
    the Compact OED's (b4.md request 11). Slide 13's eleven reference thumbnails are unread
    (`docs/brand.md` section 8).
  - K7: the regenerated social preview is ready for the repository's settings.
- The realtime round (R2-F1's owner): eight arrange rows read red on the memory tier on `main` and
  on this branch (`group.chords`, `group.menu-regroup`, `distribute.horizontal`,
  `distribute.vertical`, `snap.guides-on-off`, `clipboard.menu-copy-paste`,
  `redo.after-undone-duplicate`, `context.rotate-distribute`); `f8ec63ff` on `realtime/round` is
  the fix (b3b.md request 10).
- Round 2 (storage and cost):
  - A one-time download token minted for a deck's job before the deck is removed still resolves
    for its 15 minutes (hb.md).
  - `builds/` is missing from `isPublicPath` (`migrate.ts` 83), so under the split client a built
    web page goes to the private store while its URL is handed to the browser (hb.md; read, not
    driven).
  - The client bundle's largest chunk is 1,184,195 B against the 600,000 B ceiling (step 6,
    reported, standing).
- Round 3 (auth):
  - A1: `account.decks`'s owned view misses decks owned by a linked anonymous id, and its shared
    view misses email grants (ha.md request 4). On an unsaved `/new` draft, Sign out falls back
    to the library's route and the anonymous cookie is not replaced (A1a, ha.md request 5).
  - A2 and A5: the unused `.ts-sign-in-method.is-later` and `.ts-sign-in-note` rules and the
    `passkeysNotice` field (ha.md request 2); the page sign in dialog on the auth plate (b2.md
    request 10).
- The features round F4 (the brand at work): Reset on a Blank deck draws the GT mark again, and
  Use the default logo draws it too, because the default kit is "General Translation" (hb.md
  request 4, b4.md request 10).
- The store package's owner: `templates.ts` `blankDeckDocument`, the fallback when a decks folder
  has no blank template, still draws the GT mark (hb.md request 5).
- The importer, a later round: an inline `<svg>` as a typed block (b4.md request 6, which also
  closes request 17); a layout property overridden by a later rule keeps its first value, and
  `justify-content: start` on a grid of auto tracks is dropped (b4.md request 19). Until then the
  GT template's seven speed mark slides convert to a canvas 3.9 to 18.6 percent off their render
  (check step 24), so a seller's first canvas write on one of them moves the drawing over its
  text. B4b ships with this, as NEXT.md 4.1.3 item 24 expected.
- The owner of `editor/refusal.ts`: the refused page shows the store's own words, for example
  "deckId must be a slug." (b2.md).
- The owner of `decks.trash.tsx`: its layout predates the round's grammar (b2.md request 11).
- B5's later round: a row for the deck linter's seller messages in Check slides (b5.md request
  11).
- The round after Round 1 (B6): the readers of the evidence folder and the row ledger into
  `docs/` (b6.md requests 8 and 10); pictures the realtime round adds outside `realtime/` and
  `cloudflare/` at its merge (b6.md request 4).

From this note's runs:

- H2's owner and the next round (`slides.import.none-preselected`): since H2 the Import slides
  picker offers a fresh browser no seed brand deck, so a seller who wants the GT deck's slides
  opens or copies it first. Importing three slides from a fresh 95 slide copy landed none on the
  dev server while the worker rendered the copy's 95 tile pictures one at a time, about 2 s each.
  Whether the picker should offer the deployment's example deck to everyone is a product
  question H2's text does not answer.
- The store package's owner, with Round 2: the node-server build's tmp store holds the seed decks'
  documents and none of their pictures (the bundled seed is `nitro:assets:decks`, "0 twins of
  gt-brand written"), and `a904ef00` fetches a template's missing pictures from a static source
  that build does not have. So no deck can be made from the GT template on that build: four rows
  red on both whole matrix runs (`decks.list.gt-brand-deck`, `brand.appearance.default`,
  `export.download.large-deck-pdf` and `-pptx`). The Vercel build and vite dev make it.
- Round 2 (performance): `decks.list.gt-brand-deck` read 15.8 s and 10.0 s on the preview against
  its 15 s bound. Since `a904ef00` the copy also fetches about 3 MB of the template's pictures.
- The text walk's owner: `text.link.cmd-k-enter` and `text.link.toolbar-button` red in five of six
  readings, the two rows on three runs (the throwaway box lands with no text), section 4.2.
- B3b's next round, `PresenterConsole.css`: at 390 the presenter page's Next slide card runs past
  the viewport's right edge.
- B3b's next round, `PhoneEditor.css`: at 390 the Menus key's focus outline sits 0.5 px off the
  key's box (check step 18, two line law findings per theme in the editorPanel state).
- The viewer's owner: at 390 the /deck view's keyboard hint covers the deck's title at first
  paint, and its facts table names the revision ("r3"), a process word.
- Round 3 (auth) and the accounts spec's owner: the tmp store counts as hosted, so
  `TURBOSLIDE_AUTH_RATE_LIMIT=off` does not turn off the library's limit of 10 sign in mails per
  IP per hour, and one run of the accounts spec signs in more than ten times from 127.0.0.1. Its
  last rows meet 429 (section 4.3). A run of record needs a fresh server, or the switch honoured
  on a checkout's tmp store.
- The ship step, with B2 and B3 (check step 21, outside the core matrix): 23 of the fifteen specs'
  tests failed and 14 did not run. Eight read a changed word, count or control (section 3's row);
  their drivers follow the product before the ship. The other 15 need a reading of
  the step on the base tree (`f3e9cd86`) to say whether Round 1 caused them; this note took none.
- The accounts spec's owner (HA's rows): `accounts.decks-list-scoped` runs in check step 26 on the
  chain's file store, where H2 lists the whole store to every caller, so it reads red there; it
  should skip on a file store the way the spec's seeded deck rows skip on a tmp store.
- The gate's owner: on a tmp store a relative `TURBOSLIDE_AUTH_DB` resolves under the overlay's
  `.turboslide`, so a gate run must name that path (the first accounts run read the checkout's
  file and found no code). `core-gate.mjs` could derive it from `TURBOSLIDE_OVERLAY_DIR`.
- The preview shares Kevin's personal project's Blob store with `turboslide.vercel.app` and other
  previews, so a hosted run's store listing can change under it from other agents' runs
  (section 5).

### 7. Deviations

1. B4b#6 landed with B4's html payload. B4's typed payload (correction 5, the seven speed mark
   drawings as typed diagram blocks) was read at 04:11:15Z to 04:11:34Z, load 23.96 to 23.23, with
   `b4/b4b/typed-renders.sh`: the renders and the lint exit 0, and the canvas fidelity is within
   0.5 percent on 10 of 14 pairs, but against a fresh Prototemplate shoot six of the seven slides
   differ by 5.9 to 26.4 percent. Each drawing is drawn at the body's width where the source draws
   it at its own. By B4's own landing order the template takes the html payload, and request 17
   (the first canvas write puts a speed drawing over its text) stays open with request 6.
2. The integrator landed B4a#5 and B4b#6 itself (the prompt names the integrator for seams; B4
   could not commit either push, since each needed files no lane owns: `measure.ts`, the store
   tests, the drivers of request 13).
3. "Guest <label>" for other people and "You" on the roster's own row were not taken. They change
   what the realtime and people rounds' drivers read as a person's name; "You" on the own chip's
   tooltip was taken, with the row's clause.
4. The shader noun of question 10 is on Insert, Tools > Preferences, the show's Options row
   (`21d484bb`) and the Format options section head (B3b#13). The words b3a.md request 4 listed for
   the integrator keep "Shader": the inserted block's name (`editor-shell.ts` 2794), the chip and
   the material block's alt text (question 10's default names Insert and Preferences alone;
   `shaders.insert.words` accepts either noun).
5. The brand lint's 22 acceptances stay: 15 findings in files no lane owns (nine button labels,
   three monospace rules, two eyebrows, the smooth scroll of the standalone runtime) and B3b's
   seven button labels. Each label change moves words that tests and the generated agent docs
   pin, so they wait for a round that owns those words. Each acceptance covers one finding and
   fails the step once that finding is fixed, so the list can only shrink.
6. B2's four grammar classes stay in `components/home/grammar.css`.
7. The integrator's node-server pair carries `TURBOSLIDE_ASSIST=fixture` and
   `TURBOSLIDE_LOGO_UPSTREAM=fixture`, the preview's two fixture switches, so no local row reaches
   a model provider or thesvg.org. The chain's own servers carry neither, as `check.mjs` sets them.
8. The /home pictures (`5b2af959`) were captured with `build-home-assets.ts --capture --port 4520`
   on the integrator's port, before the preview.
9. The ship order of section 8 differs from NEXT.md's where the branch's history does not allow
   it without a merge; both orders are written there with the simulation's readings.
10. The first attempt ended without a note. This note was written by the second attempt from the
    first attempt's commits, its scratch logs (`r1int/` in the session scratchpad) and its draft
    of section 1.
11. The load rule was applied to Playwright runs, gates and picture batches. The chain's steps that
    open no browser (8, 9, 11, 14, 15, 16 and the three that skip) ran at any load, with the load
    beside each.
12. Check step 32 was not run (section 3's row). The narrowed reruns of section 4.2 and the clean
    accounts runs ran from hooks inside the sequence's waits (`r1int/hooks/`), each started at a
    load under 24.
13. Two clean ups were done by hand: the seed deck at 22:05Z, after the sequence's own `git
    checkout` left the chain's import in place, and three node servers of the pair, which closed
    their listener on SIGTERM and stayed alive until SIGKILL at 22:10Z.
14. The interim commit `717aabe9` carried this note with the chain steps then waiting; the last
    commit writes their readings.

### 8. The ship order

The order NEXT.md asks for: the hotfixes in 3.3's order, then the 21 pushes of 4.1.6. Each push
lists every commit that belongs to it, the push's own commit first and its seams after in branch
order. The last commit of a push is the sha the guard deploys. This note's own commits are docs and
ride the last push.

| Order | Push | Commits |
| --- | --- | --- |
| 1 | H2 | `6ac04388`, `df4f8ede`, `f6829d70`, `71e42ab4` |
| 2 | H3 | `40164663` |
| 3 | H4 | `0b6df8d4` |
| 4 | H5 | `56431c76` |
| 5 | H6 | `41332b42` |
| 6 | H7 | `68a60bd3` |
| 7 | H8 | `63fb0ec0` |
| 8 | H9 | `17869dda` |
| 9 | H10 | `f95169b7` |
| 10 | 1, B6a the binaries of the closed rounds | `ea5fec35` |
| 11 | 2, B1 the mark | `bfc3888a`, `3274a686` |
| 12 | 3, B1b the CLI version | `a34b2ee9` |
| 13 | 4, B6b the docs index and the archive | `18632ba3`, `71783b20` |
| 14 | 5, B4a the blank slide plain | `33b3aa98` |
| 15 | 6, B4b the licence read and the 95 slide template | `5c1131b2`, `5ac00c5c`, `1adbc355`, `a904ef00`, `204226cf`, `c17fd8bf`, `0bebf711`, `7d960104` |
| 16 | 7, B3a the cuts | `d85c7964`, `5bd0d5a9` |
| 17 | 8, B3a the words | `9b70d0ae`, `7976a38e`, `21d484bb` |
| 18 | 9, B3b the title row | `2cbcada2` |
| 19 | 10, B3b the chrome's values | `c08ee017` |
| 20 | 11, B3b the stage's appearance | `cabd481d` |
| 21 | 12, B3b the marks in the chrome | `53253fac` |
| 22 | 13, B3b the dialogs and panels | `2a0da406`, `df2d52a8`, `c206823c`, `1c821bbf`, `e1ad28d4` |
| 23 | 14, B3b the phone editor | `2108dad4`, `d05fc4b0`, `e8fdee8c`, `6b417c80` |
| 24 | 15, B2a /home | `3263728a`, `5b2af959` |
| 25 | 16, B2b /decks | `24cc125e`, `adf1fd75` |
| 26 | 17, B2c the error pages | `247fe081`, `addedf48` |
| 27 | 18, B2d the deck's card | `c9380a14` |
| 28 | 19, B5a the brand lint in report mode | `db7f7ecc` |
| 29 | 20, B5b the brand lint in enforce mode | `e4d98663` |
| 30 | 21, B6c the round specifications moved | `f20cf8ac`, `84e2dee5`, then this note's commits (`717aabe9` and the last) |

The branch does not hold that order: each lane committed when its work was ready. I simulated the
picks onto `f3e9cd86` with `git merge-tree --write-tree --merge-base=<commit>^` (no worktree, no
branch and no ref moved; the simulation's commits are dangling objects). The tool and the orders
are in the session scratchpad (`r1int/ship/simulate.mjs`, `order1.txt`, `orderI.txt`).

- NEXT.md's order (the first attempt's 49 commits): 23 of 49 picks are clean. The rest conflict
  in 11 shared files: the matrix total line of `scripts/probes/core-matrix.test.mjs` (every push
  that enters a row adds a term), the three rendered files (`README.md`'s ledger, `docs/FOCUS.md`,
  `focus/rows.md`), the core specs several pushes edit (`decks`, `share`, `chrome` and
  `present`), `Slideshow.tsx` and `shots.test.ts` (seams made after B6c#21's citation rewrite),
  and `b5.md`.
- The hotfixes alone in 3.3's order (H2, H3 and H4 before H5 to H10, the rest in branch order):
  H2 conflicts only on the matrix total line, because H5 to H10 entered their rows' terms before
  it on the branch; H3 and H4 then follow from H2's tree.
- The order below: every pick clean (57 of 57 at `6b417c80`), and the last tree equals HEAD's
  tree. It keeps the branch's order of the pushes and moves each seam next to its push where the
  pick stays clean.

The order that applies without a conflict (33 pushes):

| Order | Push | Commits | Note |
| --- | --- | --- | --- |
| 1 | H5 | `56431c76` | |
| 2 | H6 | `41332b42` | |
| 3 | H7 | `68a60bd3` | |
| 4 | H8 | `63fb0ec0` | |
| 5 | H9 | `17869dda` | |
| 6 | H10 | `f95169b7` | |
| 7 | H2 | `6ac04388`, `df4f8ede`, `f6829d70`, `71e42ab4` | `f6829d70` must ride with H2: the guard runs the smoke from the pushed sha, and H2 turns the old /decks row red; `71e42ab4` closes H2's restore regression |
| 8 | H3 | `40164663` | |
| 9 | H4 | `0b6df8d4` | |
| 10 | B6a#1 | `ea5fec35` | docs only: the guard's smoke alone |
| 11 | B5a#19 | `db7f7ecc`, `5c1131b2` | `5c1131b2` is a B4b seam in the deck linter; it changes no product file |
| 12 | B6b#4 | `18632ba3`, `71783b20` | |
| 13 | B2a#15 | `3263728a` | its CSS carries fallbacks for B1's tokens |
| 14 | B3a#7 | `d85c7964`, `5bd0d5a9` | |
| 15 | B1#2 | `bfc3888a`, `3274a686` | |
| 16 | B1#3 | `a34b2ee9` | |
| 17 | B2b#16 | `24cc125e`, `adf1fd75` | |
| 18 | B2c#17 | `247fe081`, `addedf48` | |
| 19 | B2d#18 | `c9380a14` | |
| 20 | B3a#8 | `9b70d0ae`, `7976a38e` | |
| 21 | B3b#9 | `2cbcada2`, `5ac00c5c` | `5ac00c5c` is a B4b seam in the deck linter |
| 22 | B3b#10 | `c08ee017` | |
| 23 | B3b#11 | `cabd481d` | |
| 24 | B3b#12 | `53253fac` | |
| 25 | B3b#13 | `2a0da406` | its driver seams ride push 31 (they conflict earlier) |
| 26 | B3b#14 | `2108dad4`, `d05fc4b0`, `e8fdee8c`, `6b417c80` | |
| 27 | B5b#20 | `1adbc355`, `e4d98663` | `1adbc355` is a B4b seam in the deck linter |
| 28 | B6c#21 | `f20cf8ac`, `84e2dee5` | 810 paths, mechanical |
| 29 | B4a#5 | `33b3aa98` | |
| 30 | B3a#8 seam | `21d484bb` | it conflicts when moved before B6c#21 or B4a#5 |
| 31 | B3b#13 seam | `df2d52a8`, `c206823c`, `1c821bbf`, `e1ad28d4` | the same |
| 32 | B2a#15 seam | `5b2af959` | the /home pictures of the round's chrome |
| 33 | B4b#6 | `a904ef00`, `204226cf`, `c17fd8bf`, `0bebf711`, `7d960104`, then this note's commits (`717aabe9` and the last) | `a904ef00` must precede `c17fd8bf` (b4.md request 2 holds B4b's ship) |

Two things differ from NEXT.md. H2 ships seventh rather than first, and B4a and B4b ship after B6c,
where 4.1.6 puts them fifth and sixth. 4.1.6 gives one reason for its order: push 4 follows push 2
because it rewrites a string in `scripts/build-brand.ts`. That reason no longer holds, since
B6c#21 made that rewrite (b6.md requests 1 and 2), not B6b#4. If H2 must ship first because it
closes the privacy defect, the ship step resolves one line at the pick: the matrix total in
`core-matrix.test.mjs` takes H2's terms without H5 to H10's. Either way the ship step rebases the
branch onto the realtime round's final `main`, which this branch has not met (it was cut at
`e8b20fec`; `realtime/round` stands at `071a9a34`), and that rebase is a merge of its own.
