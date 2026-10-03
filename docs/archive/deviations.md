# Deviations from the spec, recorded

The list that `AGENTS.md` carried from M1 to round four of the Google Slides parity (written 2026-09-10 to 2026-09-14), moved here unchanged in Round 1 (`docs/NEXT.md` 5.1 item 3). A deviation recorded since then is in its round's specification and notes.

- `vitest` is pinned at 4.1.11, not a 3.x release: vitest 3 depends on Vite 5 to 7 and would have
  pulled a second Vite next to the pinned 8.2.2; vitest 4 runs on Vite 8.
- `eslint` is 10.10.0: `@tanstack/eslint-config` 0.4.0 depends on `@eslint/js` 10, and 9.39.5 is
  deprecated on npm.
- The Chromium revision note above.
- Flatten export verification compares at 2x, not 1x (M2 integration, `docs/export-verification.md`):
  SPEC 8.5 states the 0.1 percent gate against the Playwright reference without naming a scale,
  and a flatten page carries a 2x sheet raster, so the PDF is rasterized at 3200 by 1800 and the
  reference is `render --scale 2`; measured at 1x the rasterizer's downsample alone costs 0.1 to
  0.4 percent per text slide. Inside a regenerated two-tone picture the page is gated on the 2x
  sheet shot it embeds, because the browser at 2x shows a bilinear upscale of the 1x twin.
- Native text boxes are moved up by LibreOffice's measured first-baseline offset
  (`packages/export/src/pptx/baseline.ts`, `calibration.json` `firstBaselineModel`); the CLI flag
  is `--baseline-target libreoffice|none` because `lint --baseline` already names a switch. The
  action input field is `baseline`.
- `apps/studio` externalizes `sharp` in its Vite configs (`externalSharp()`): the render worker
  client reaches `@turboslide/effects/io` through the local verify job, and the tsconfig `paths`
  alias the effects, export and cli packages need for sharp's types would otherwise send
  rolldown into `lib/index.d.ts` (measured: `MISSING_EXPORT "default"` on the SSR build).
- PPTX is the one export target (Kevin, 2026-09-11: "instead of exporting to google slides just
  make it perfect pptx"): SPEC 8.3 (Google Slides) is not implemented and its code, its `gslides`
  format, its dry run, the Slides image host route and `docs/google-slides.md` were removed;
  MILESTONES M6 item 1 is closed as withdrawn. `docs/pptx.md` is the PPTX reference.
- The flatten page raster is not always the PNG SPEC 8.2 names: the page raster policy
  (`packages/export/src/pptx/page-raster.ts`) writes a 1-bit PNG, a palette PNG, a JPEG at quality
  92 (photographic pages only) or a truecolor PNG, whichever is smallest within a measured
  mismatch budget, and the report records the format and the decoded mismatch per page;
  `perfect` is the claim that every page stays under 0.1 percent (docs/pptx.md).
- Fonts are not embedded by default (SPEC 8.2 post-process, 8.4): the flatten file has no visible
  text to draw and PowerPoint repairs a file whose font parts it rejects, so the flatten export
  never embeds and the native export embeds only under `--embed-fonts` (`embedFonts` in
  `export.run`). The render worker image installs the faces, so the LibreOffice gate is unchanged.
- Every slide part carries `<p:cSld name>` set to the slide title and a hidden title placeholder
  (`hidden="1"`, an alpha 0 run at the heading's box), which SPEC 8.2 does not name; it is what
  PowerPoint's own accessibility command writes, kept inside the page for the geometry read-back.
- Hosted renders and exports run inside the Vercel function (SPEC 3.3 item 7 keeps Chromium out
  of the web app) on `chrome-headless-shell` 147.0.7727.0 from `@sparticuz/chromium` (SPEC 5.3 and
  the Chromium section above want the full Chrome for Testing binary): a function has no second
  process to hand the work to and the package ships only the shell. Every hosted `RenderRecord`
  names it in `renderer`, the gate stays on this machine and in the worker image, and
  `docs/hosting-chromium.md` records the switches, the single-process shell's crash on context
  close (its browser is killed by pid, never closed) and the measurements. Kevin has not approved
  this beyond the directive to make the deployment work.
- The freeform layout, the primitive blocks and the palette and typography fields (Kevin,
  2026-09-11: "be able to drag stuff around in each slide and reorder or move stuff", "be able to
  reuse primitives and icons like boxes and shapes and selecting colors and font and typography
  controls"): SPEC 1 and 6.4 rule out free x and y, resize handles on text, z-order and rotation.
  The grammar layouts keep that rule and gain drag to move and reorder blocks within and across
  slots (`block.move`); the `freeform` layout carries `pos` (x, y, w, h and z on the 1600 by 900
  sheet, snapped to the 8 px grid and to the rails, plates and column seams) and is a
  `layout/freeform` finding at severity 1 so a pure grammar deck knows; the primitives box, shape
  (rectangle, rounded rectangle, ellipse, line, arrow), rule, text and icon take palette colors
  (the theme tokens and green, amber, red and GT blue) with a custom hex allowed as
  `color/off-palette` at severity 2; typography offers the ladder sizes, weights 300 to 700 with
  the 500 cap as the `type/weight-cap` lint rather than a block, alignment, tracking and leading
  steps. Rotation stays out. `docs/freeform.md` is the reference and `docs/archive/status/EDITOR-DEPTH-STATUS.md`
  the round's record.
- The acceptance line names `apps/studio/src/routes/openapi.json.ts`. The file is
  `apps/studio/src/routes/openapi[.]json.ts` because TanStack Router's file-based routing escapes
  a dot inside a path segment as `[.]` (the route path stays `/openapi.json`), and the
  generator does not write it; it serves `packages/agent/generated/openapi.json`. Step 3 of
  `scripts/check.mjs` names the file through git's `:(literal)` pathspec magic so the brackets
  are not read as a glob class.
- The Google Slides parity round (`docs/archive/gslides-parity/SPEC.md`, section 7.9, decision 15.11)
  amends six sentences of this spec; the integrator edited them into `docs/spec/SPEC.md` and
  records them here until Kevin approves them:
  1. SPEC 4.2 text markup: line breaks are allowed as a paragraph break in paragraph, text, box
     and table cell Texts (`multilineTextSchema`) and as `\n` in `panel.code`; nowhere else.
  2. SPEC 8.2: "five hairlines plus key and value boxes, never a PPTX table" is scoped to `rows`
     and `plain`; the `table` block is a PPTX table in Editable text.
  3. SPEC 2.1: ruled rows and lists instead of bullets is unchanged; the Bulleted list control
     produces the ruled list (decision 15.1) and `plain.numbered` draws a tabular numeral.
  4. SPEC 6.9: the editor binds no bare letters; the view route keeps the shell keys (parity
     SPEC 10.2 retires E, `⌘/`, `⌘L` and `⇧D` in the editor).
  5. SPEC 3.4: `/` redirects to `/new`; `/decks` is the home page; `/new`, `/decks/trash`,
     `/print/:deckId` and `/present/:deckId` (Presenter view) are routes.
  6. SPEC 6.1: the editor's frame is the title row, the menu bar, the toolbar, the filmstrip, the
     canvas with the notes pane, the right panels and the bottom bar of parity SPEC 1; the status
     chip and the revision leave the default view.
- The builders' deviations from the parity SPEC, each argued in `docs/gslides-parity/build/
<key>.md` and listed in `docs/archive/gslides-parity/BUILD-STATUS.md`, recorded for Kevin (parity SPEC
  15.11):
  - B2: the PDF gate rasterizes at 3200 by 1800 instead of `pdftoppm -r 144` (parity SPEC 7.6),
    because the diff needs the 2x render's pixel grid; picture regions are compared separately
    and never gated (every viewer resamples the twins with its own filter); speaker notes travel
    in a PPTX only under `includeNotes` (parity SPEC 7.2.13, decision 15.2).
  - B3: parity SPEC 2.12's printed tally does not follow from its tables (the model counts 106
    Now, 24 Later, 38 Omit, plus one Omit for Regroup); parity SPEC 4.3's "Every item here is
    also in the menu bar" gains two exceptions, Text fitting and Alt text, which are Format
    options sections; parity SPEC 14.4 item 2's stub tooltip check reads the tooltip's sentence
    span, not the plate's whole text; Hide the menus sits on the toolbar row (parity SPEC 3.1 row
    18), not the menu bar row of 1.1.
  - B4: a right-click inside an editing run opens the browser's own menu (parity SPEC 4.3 lists
    a text selection menu), because only the browser's menu carries its spelling suggestions;
    several dragged cards write one `section.set` (parity SPEC 4.1 says one `slide.move` per
    slide in one write; no action carries several moves); deleting several cards is several
    `slide.remove` writes with one Undo each.
  - B6: the slideshow surround is `--pt-panel-ink`, not `--pt-ink` (parity SPEC 9.2), so a light
    sheet sits on black in both themes; the present toolbar draws eight controls where Google's
    compact bar has four; no new action for the blank slide, the laser pointer or full screen
    (parity SPEC 7.5 lists none), which stay readable through `describe().state` and drivable by
    the keys and the menu.
- The builders' deviations of round two (gslides-parity SPEC-2; `docs/gslides-parity/build-2/
<key>.md`, listed in `docs/archive/gslides-parity/BUILD-STATUS-2.md`), recorded for Kevin:
  - SPEC-2 2.9 (the amendments to the two specifications and to `docs/freeform.md`), edited in by
    the integrator at merge 2: every slide becomes a freeform slide on its first canvas
    manipulation and the grammar layouts are the templates (gslides-parity SPEC 7.1 rule 3, SPEC
    4.3 of this spec); a `shape` holds a Text (gslides-parity SPEC 3.3); an inserted text box
    converts the slide and lands as an object (gslides-parity SPEC 2.4); the text markup has five
    rules, the mark span the fifth (this spec 4.2); the ruled list stays the default and
    `plain.marker` draws glyphs and numerals on request (2.1); a coloured run is a severity 1 lint,
    not a refusal (2.1); rotation is in and `pos` carries `rotate`, `flip` and `group`
    (`docs/freeform.md` 2); resize handles on every object of a canvas (6.4); Apply layout's table
    gains the picture object and the plate box and a canvas re-flows by the same table
    (gslides-parity SPEC 5.5); the conversion record is the schema field `SlideBase.grammar`, so
    no `ext` key is written (gslides-parity SPEC 7.1 rule 2, this spec 4.1); `layout/freeform`
    carries the sales sentence and `freeform/off-sheet` has two severities (`docs/freeform.md` 1
    and 6).
  - B1: a connector end off its site is a severity 2 validator note, not a refusal; `padding` and
    `valign` without `pos` are refused on shape and text only; a rectangle target offers eight
    connection sites; `block insert --pos` lands the object last in `main` with z one above the
    highest; `slide.setLayout` to freeform on a canvas slide writes nothing; `alt` on `BlockBase`
    puts the key second in every block the schema serializes, so the committed GT deck was
    re-imported once in the fix round (22 slide files with `dia` and `dither` blocks, `alt` moved
    before `type`, no value changed, revision 25) and check step 7 is byte identical again from
    that tree (VERIFICATION-2 finding 3; the integrator's call).
  - B2: the measured box is written at 1/64 px, never the pixel (b2.md decision 1, request R2,
    applied at merge 2 in `packages/schema/src/canvas.ts`); the picture object travels as
    `slide.background` only when it covers the sheet, so the fixture's `canvas-opener` (its
    picture moved 40 px right) travels as a `p:pic` and `background-picture` exercises the
    background form (R4); a curve travels as the polyline through its points; a rotated table is
    written unrotated (pptxgenjs has no `rotate` on a table); the PDF's `word-art` page sits at
    0.103 percent against the 0.1 target and under the 0.5 fail line; the dark theme of five GT
    code panel slides measures one pixel differently from light (R3, recorded above), so
    `scripts/canvas-fidelity.mjs` measures, converts and compares once per theme (the fix round;
    171 slides, 342 pairs, worst 0.262 percent, 95 s) while the CLI's conversion measures in light.
  - B3: a grammar slide's fields are objects to the shell through `pseudoBlockOf` before the first
    write converts the slide; Order on a grammar slide plans `block.order`; inserts never land in
    a slot; the Background dialog's Choose without the stage handle is two writes; "Line kind"
    reads "Line type" (kind is a forbidden default view word); seventeen round one lint rules'
    proposals carry forbidden words and are pinned as a ceiling in `default-view-words.test.ts`.
  - B4: Cmd Up and Cmd Down on a real block of a grammar slide reorder within its slot (SPEC-2 6.1
    row 13 asks for one stack); the handle and the keys write `block.set /pos` (and `/trim`) in one
    `slide.update` where SPEC-2 6.1 names `block.rotate`, `block.flip`, `block.group` and
    `block.crop` (the documents written are identical; the agent spellings stay the CLI's and the
    menu rows'); autofit after a resize is one ladder step per commit; the point tools end on
    Enter or the first point (a double click lands as two clicks); a `cellRange` target is not
    selected by the stage this round; the clip lift is scoped to `.ts-editor`; the hidden measure
    root resets the inherited text defaults so it measures as the CLI's present document does.
  - B5: a hierarchy of n levels has 2n minus 1 nodes; the timeline's labels are ink in every
    style; the three diagram styles are the theme's tones (Outline, Plate, Ink); the Format
    options slot props carry `slide.id` (the route adapts B3's `slideId`).
  - B6: the four batched export server functions live in `download.ts` and the logic in
    `export-batch.ts`; `POST /api/export/:deckId?start=1` is the http form of the plan; the cancel
    form needs no bearer (the job id is the capability); `documentAtRevision` decides staleness;
    the snapshot key contention rule (two writers from one revision inside one clock millisecond
    push equal manifests with different bodies and contest one key: the store verifies the existing
    snapshot's etag against its own body and answers a conflict before its manifest push, SPEC-2
    0.40 and 8.2); the merge duplicates the per theme report lines; the batch spec exports one
    theme; `ten-tasks.spec.ts`'s Cut assertion of the Slide deleted snackbar is retired (SPEC-2
    0.30).
  - Integrator (merge 2): the fixture's `diagram` slide is rebuilt through `diagram.insert`
    (process, four steps, plate style, at the default box; the hand written labels "1. Connect"
    became the template's "Step 1"); the committed `canvas-walk` recordings are re-derived at
    1/64 px while the fixture's `canvas-title`, `canvas-opener` and `background-picture` keep the
    integer `pos` the CLI wrote before R2 (valid positions; the headless test compares at the
    pixel); the stage's Cmd+D runs `block.duplicate` on every slide kind (one implementation,
    the copy after its source as round one's spec pins), the stage's own paste path serving only a
    kind's object that is not a block; the Edit menu's Cut and Delete remove several cards in one
    write (one Undo); a lease on a slide removed while the lease was in flight is quiet; the TanStack
    devtools do not mount for an automated browser (their Inter face shadowed the theme's on the
    dev stage, b4.md request 6; this devtools version has no shadow root option); `selectSoon`
    re-selects once when the filmstrip has rendered the card (a select is a hash navigation, and
    one per frame remounted the shell); the `deck.info` contract gains `counts.snapshots`.
  - Fix round (integrator): after a write, an undo or an external change removes the current
    slide, the editor selects the slide now at the removed slide's index, clamped to the end
    (`replacementSlide`, in `apps/studio/src/editor/controller.tsx` since round four's split). The
    research (R02, R07)
    records that Google deletes without confirmation and does not record which slide it selects
    next; the rule follows Google's observed behaviour (the next slide, the previous one at the
    end) and is recorded here as an assumption until the audit checks it against Google. In the
    same round the editor's write queue treats a lease refusal (SPEC 6.7: an agent's write to a
    slide another author holds answers 409 with the holder) as a conflict card with the holder
    and Force, never as a revision conflict to rebase on: the server changed nothing, so a rebase
    re-sent the same write to the same refusal in a loop (measured at one write every 2 ms). A
    lease still outlives the tab that took it, ten minutes at most.

- Round three, merge 1 (`docs/gslides-parity/build-3/integrator.md`): `image-size` is removed from
  pptxgenjs's dependency graph through a pnpm override instead of bumped, because no fixed release
  exists (SPEC-3 8.10 reads "overridden past 2.0.2"); `@simplewebauthn/server` is pinned at 14.0.1,
  not 14.0.2, which was published on the day of the install; `@sparticuz/chromium` and
  `playwright-core` are not bumped although 153.0.0 and 1.63.0 exist (SPEC-3 8.10 "bumped together
  when a newer stable exists"): no advisory names them and a Chromium change moves the pixel
  gates, so the bump is a fixer round decision taken with the verifier's compare-to-shoot run;
  `apps/studio` joins the vitest project list with its own config although SPEC-3 16.1 named no
  config change for step 5.

- Round three, merge 2 (`docs/gslides-parity/build-3/integrator.md` section 8,
  `BUILD-STATUS-3.md`): the account boundary held, so the preview runs on the blob channel,
  anonymous identity and captured mail with the deployment's own environment passed per
  deployment (`vercel deploy -e`), and no Marketplace product, private Blob store or WAF rule
  was created or applied; the storage migration ran on the fake only (SPEC-3 11.4, 11.5 R7 wait
  on Kevin). The fixture deck's two dither slides carry their materialized variants in the
  committed deck (`turboslide picture materialize` at merge 2, revision 2) because the export
  path writes them under the deck on the first export, which left untracked files in the fixture
  after every run; B5's two dither tests strip the variants from their scratch copies. The
  materials package's `picture.materialize` answers `missing` as what is still missing after the
  write (the rows it rendered leave the list), and its `slide.toCanvas` call names `slideIds`
  (the action's input), both found by the CLI's real dispatcher. SPEC-3 12 spells the comments
  filter `--author <who>`; the CLI uses `--author-id <who>` because `--author` is the principal
  flag since round one (B1). The localhost token (`TURBOSLIDE_LOCAL_TOKEN=require`) stays opt in
  this round: flipping the default at merge 2 (b3.md R12) would have changed every builder's dev
  server rule under the verifier's feet, so the flip is a fixer round decision. Cookieless
  localhost agent calls are the checkout holder on both identity paths (a design decision above,
  not in SPEC-3's text). `share.emailCollaborators` answers 501 by design (round four).
  `presence.list` and `sync.status` over HTTP and MCP read the CLI's file records, not the room's
  roster (the window transport reads the room); the digest queue and the one click unsubscribe
  (`/api/notify/unsubscribe`, 501) are not wired (b2.md R14d, R17); `account me --avatar-png`
  is not wired on the CLI (b3.md R15c); `closeAgentSessions` is not bound (b3.md R15b). A
  fixed tamper in `tokens.test.ts` matched the original token one run in sixteen and now flips
  the digit. The realtime spec's frozen `describe()` revision and the coalesced writes after a
  resync (b2.md, two defects), the intermittent `no thread` 404 on a reopen right after a
  resolve (one of six sequences on the merge 2 walk), and finding 28 stay for the fixer round.

- Round four, merge 1 (`docs/gslides-parity/build-4/integrator.md`, `b1.md`, `b3.md`;
  `BUILD-STATUS-4.md` "Merge 1"): `@vercel/functions` is pinned at 3.9.7 because SPEC-4 0.31 names
  no version. The whole `packages/native/wasm/` folder is tracked (0.38 names the glue, the
  `.wasm` and "the `.d.ts`", and there are two `.d.ts` files); the four files of an earlier local
  build stay untracked until B4 commits CI's outputs with `BUILD-RECORD.json`. SPEC-4 6.4's "208
  ink cells" is the area of the 16 unit path (`markBits(8)` lights 52 of 64 cells) and
  `brand.test.ts` pins both readings. The 16 px tile carries a hinted 12 px mark (rails of 2 px, a
  6 by 4 window) so the three ICO entries decode to three colours each with no anti aliased pixel;
  `icon-dark-*.png` are the paper plate with the ink mark (SPEC-4 1.5 step 2; P2 named them the
  other way); the progress track keeps the port's 2 px where 1.9 says 1 px. `SITE.origin()` in the
  root `head()` has no request, so a preview without `TURBOSLIDE_PUBLIC_ORIGIN` carries
  production's card address. The Not found page's About Turboslide button is a plain anchor until
  B2's `home.tsx` exists. The two `recordDeckOpened` call sites moved with `EditorRoot` (B3's
  file), so the day 0 amendment's "B4 passes the new arguments from `controller.tsx`" is void and
  the day 3 change stays inside B3's files. `import './edit.$deckId.css'` stays in the route file
  until B3's day 2 decides when the editor's CSS arrives. `landing.spec.ts` tests 3 and 4,
  `editor.spec.ts` and `undo.spec.ts` read or seed the checkout's `decks/` on disk and cannot pass
  against a tmp store server (b3.md finding 1); step 21 runs them on the runner's file store.
  `realtime.spec.ts` test 4 is intermittent on this machine before and after the split (the frozen
  `describe()` revision above). A direct `eslint` over the six split files reports four type aware
  errors and four `no-shadow` warnings in code byte identical to `BASE`, while
  `scripts/lint-packages.mjs --only studio` reports none of the errors there and 91 in
  `apps/studio/e2e/*.spec.ts` above the baseline of 8; the file owners decide on day 2. The tmp
  store dev server and the node-server build refuse every request without
  `TURBOSLIDE_SESSION_SECRET`, so the round four server command above and check step 31's runner
  set it. The verifier's day 0 requests on `scripts/perf-budget.mjs` (the local commit stamp of
  4.6 row 1, the hosting banner over `toolbar.layout` on the tmp tier, the memory channel's two
  second checkpoint cadence against 4.6's local ceilings, the twins row counting a 304, the idle
  window missing a stream opened before it) are open for merge 2 (`build-4/verifier.md`).

- Round four, merge 2 (`docs/gslides-parity/build-4/integrator.md` sections 15 to 20;
  `BUILD-STATUS-4.md` "Merge 2"; the builders' `b1.md` to `b5.md`), 2026-09-14: the requests that
  fell in nobody's file were applied by the integrator as the smallest edit with a note in the
  file: `packages/headless/src/shell.ts` accepts a 404 whose document carries the Not found root
  and its default `readySelector` names `.ts-product` and `.ts-notfound` (b1.md R8, b2.md R1);
  `packages/lint/src/chrome.ts` roots gain the two classes; `packages/store/src/blob-vercel.ts`
  passes `cacheControlMaxAge` to the SDK (b4.md R1); `packages/store/src/tmp-store.ts` takes
  `HostedOptions.fetchAsset` and fetches the twins the seed does not carry after the overlay's
  copy (b4.md R2), so `DROP_SEED_TWINS` ships as `true` in `vite.deploy.config.ts` with the
  `blob` tier's fetch (B4) and the `tmp` tier's fetch (this) both in place; `apps/studio/src/routes/api/agent.ts`
  answers an `instance` block (`effectsBackend`, `glibcVersionRuntime`, `node`, `platform`) for
  the hosted smoke's backend row (b4.md R11); `packages/schema/src/shapes/build-definitions.mjs`
  was removed for `packages/schema/scripts/build-definitions.mjs` and `THIRD_PARTY_NOTICES.md`
  names the new path (b4.md R3); `packages/chrome/PORTED_FROM.json` gained rows for
  `Filmstrip.tsx`, `Filmstrip.css` and `lib/lazyDialog.ts` (b4.md R12); `packages/chrome/package.json`
  exports `./YouNeedAccess` and `./Filmstrip` (b3.md R6). Not applied and recorded: the Linux x64
  glibc addon of SPEC-4 0.38 is not built (no `cargo-zigbuild` and no `zig` on this machine;
  b4.md R7 has the commands and `packages/native/ci/native.yml` is the workflow), so the function
  runs the TypeScript stages, `apps/studio/package.json` gains no `@turboslide/native-linux-x64-gnu`
  (b3.md R13, b4.md R10) and `TURBOSLIDE_NATIVE_REQUIRED=1` is not set on step 5; the
  `.github/` folder is untracked and outside the round's files, so `native.yml` stays under
  `packages/native/ci/` until the ship step places it; the optional b4.md R4 (the validators
  importing `ids.ts`), R5 (a `ViewerShell` render prop to keep `Filmstrip.tsx` out of the viewer
  route) and R8 (`@turboslide/native` as a studio dependency) were not taken. The perf check's
  metric changes (B4's R14 and the verifier's requests 1, 3 and 4) are recorded in
  `scripts/perf-budget.mjs`'s header: DOM nodes after a garbage collection with the live element
  count beside them, the local commit stamp from `pending` rising, "saved" as the acknowledgement
  on the `local` profile because the memory channel checkpoints on a two second cadence (the
  checkpoint recorded beside it; the `deployment` profile keeps the checkpoint), and a 304
  revalidation not counted as a twin re-fetch. From B5 (b5.md R5): the README's images are `<img>`
  tags because the B5 acceptance grep counts a markdown image's `!`, so a future README edit adds
  an image as a tag too; `docs/freeform.md` line 130 was edited by B5 on the integrator's
  forwarding of b3.md R5. MILESTONES-4 B2's acceptance line `tooltip-audit.mjs --only /home` reads
  `--url <origin>/home` (the script has no `--only`). The task's numbering of the round's steps
  (the perf budget as 29, the Vercel output as 30, the brand test as 31) differs from SPEC-4 6.1;
  the check keeps SPEC-4's order (29 the generated files, 30 the Vercel output, 31 the perf budget).
  Two repository files outside every builder's row changed with a note (`integrator.md` section
  16): `.vercelignore` no longer drops `packages/native/wasm/` from a CLI preview's upload (the
  first preview build of merge 2 failed on the dither worker's glue import; the module is a
  committed build product since SPEC-4 0.38) and `.prettierignore` covers that folder (the
  formatter had reflowed the wasm-bindgen glue, which `BUILD-RECORD.json` pins by sha256). The
  vendor chunk group of SPEC-4 3.12 does not take effect inside the studio's Vite 8.2.2 build
  (Rolldown 1.2.8 splits the same entry alone; in the Vite build a function `test`, `name` or
  `manualChunks` is called zero times and the output is byte identical), so
  `scripts/check-client-bundle.mjs` reports the largest chunk ceiling until a `vendor-*.js` chunk
  exists (SPEC-4 0.27's gating rule) and the entry chunk stays at 914,233 bytes with the
  attribution in `integrator.md` section 17 (React DOM, the schema package with its 281 KB shape
  table reached through `render/dither-key.ts`, zod, the router); the `/home` and `/decks` js
  decoded rows of 4.1 miss by construction until the fixer round. Step 19 was met by `prettier
--write` over this round's committed research and design records and the round three
  verification records (the round three precedent; whitespace and table alignment only), never
  over the other workflow's `research-5/`, `design-5/` and `SPEC-5.md`, which were restored from
  `HEAD` after the pass had touched them (the other workflow then committed them formatted as
  `e2904d5`, and step 19 is green on the whole tree since); the verifier's untracked
  `verification-4/` files were reformatted by the same pass and could not be restored (whitespace
  only; recorded for the verifier). Step 27's audit writes `verification-3/layout-shift.json` and
  `layout-shift.md` unformatted, so a chain that runs step 27 needs `prettier --write` on those
  two before step 19 is run again (the committed copies are formatted). A Vercel preview stamps `x-robots-tag:
noindex` on every answer, static and function alike, while production carries it on `/` alone,
  so `hosted-smoke.mjs`'s `/home` row asserts the meta always and the header outside a preview.
  The render route's answers carry the anonymous principal cookie (`set-cookie: __Host-ts_id`),
  which keeps the CDN from caching thumbnails (`x-vercel-cache: MISS` on the second stamped
  request); a finding for B4 and the verifier, not a merge edit.
