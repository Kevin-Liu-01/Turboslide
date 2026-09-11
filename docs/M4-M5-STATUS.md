# M4 and M5 status

2026-09-11: the Google Slides exporter this document records was removed at Kevin's direction ("instead of exporting to google slides just make it perfect pptx"); the Slides lines below are history, and PPTX is documented in `docs/pptx.md`.

The state of Turboslide at the end of milestones 4 and 5 (the hosted agent surface, the skills and
the judge loop; assets, effects, materials, grammar completion, native PPTX and the Rust crate;
`docs/spec/MILESTONES.md`) plus the parts of M6 that Kevin's directive pulled forward: `/` opens the
editor, the Export menu with PPTX, Google Slides and the standalone file, and the Google Slides
exporter of M6 item 1 with its dry run. Kevin's directive for the round, verbatim: "complete all of
this and then be able to edit and have a full version of the turboslide GT template and be able to
insert any effects or assets or stuff we like and of course make it agent compatible. so then on /
of turboslide it should be straight into a google slides with exporting abilities as well. then
commit and push origin main."

The integrator wired the six builders' reports (landing and templates; materials and capture;
grammar completion and native PPTX; the agent surface and the judge loop; the Rust crate; the
Slides exporter) on 2026-09-11 and ran the lines once; the verifier's drive found three defects
and the template drift, the fixes landed between 02:11 and 02:30, and the verifier then ran
`pnpm check` and every other acceptance line once more, in order, on the tree this commit carries,
from 02:35:09 to 02:56:49 local time (the last line being step 19 alone). Every number below comes from that final run unless the
sentence names an earlier measurement. Host: Node 24.13.0, pnpm 11.15.1, Chrome for Testing
147.0.7727.15 (`chromium-1217`) on ANGLE Metal, Apple M5 Max, rustc 1.98.1, cargo 1.98.1, Docker
29.6, the Prototemplate checkout at `/Users/kevinliu/repos/Prototemplate/deck` with its dev server
on `localhost:3005`. The render worker image was rebuilt from this tree before its gate ran
(02:37:29 to 02:39:33, 124 s, image `761bfc93680e`), because the image of the integration run
predated the import, Slides and chrome changes of the fix round.

The deck revision this tree carries is 24 (was 13 at M3) and the final run left it there: the
grammar builder's two in-place re-imports (14, 15), the recorded plate metrics of the 15 two-tone
pictures (16), the `liquid-metal-diamond` opener captured twice (17, 18), the acceptance line's own
capture (19) and the restore of version 3 that removed it (20), the in-place re-import of
`pnpm check` step 7 that dropped the deck's own asset and metrics (21), their second capture and
measurement (22, 23) and the first re-import after the importer learned to carry them (24). The
version log `decks/gt-brand/versions/` holds seven records (revisions 16 to 20, 22 and 23; a
re-import that changes nothing writes no record). The lines of the final run that write (the
material capture, the site capture, the specs' decks) ran on scratch copies or scratch decks that
were removed afterwards, so `git status decks` after the run shows only the round's own changes.
No Google credentials exist on this machine, so the Slides exporter ran as a dry run only, in both
modes.

## What shipped

Scope items are numbered as in the M4 and M5 sections of the milestone plan.

### M4

1. `POST /api/actions/:action` for every action with the `http` transport and `GET` for its
   contract (`apps/studio/src/routes/api/actions.$action.ts` over `@turboslide/agent/http/dispatch`:
   the bearer rule, the 1 MB and 25 MB body caps, one JSON object, `x-turboslide-author`,
   `?force=1`, one error body); `GET /api/agent` as the runtime manifest (the generated manifest
   with the execution rules plus `implemented`, `notImplemented`, `http.pending`, `auth`, the
   attached sessions); `/openapi.json`, `/llms.txt` and `/llms-full.txt` from the committed
   generated files; `/mcp` over the SDK's streamable HTTP transport (`packages/mcp/src/http.ts`,
   one server per `mcp-session-id`, deck and author bound at initialize, `deck_goto_slide` listed
   while a studio page is attached); `createCsrfMiddleware()` on the server functions
   (`apps/studio/src/start.ts`).
2. Leases enforced for agent authors (`packages/store/src/lease.ts` `leasePolicyFor`: agent
   writes to a slide another author holds are 409 with the holder and the current document unless
   `force` is set; a human's write warns and goes through). The store's watch channel brings
   external writes into the open editor: the version records since the editor's revision are
   applied forward through `applyWrite` (`edit.$deckId.tsx` `adoptExternal`); the agent HTTP spec
   asserts the banner within one second (measured 806 to 900 ms in the integration run).
3. The four `SKILL.md` files completed; `packages/agent/src/__tests__/skills.test.ts` and
   `coverage.test.ts` (every action has a test and a doc row; the MCP tool list,
   `describe().actions`, the OpenAPI paths, the CLI parsers and the skill tables agree by name;
   every rule with a fix produces an applying fix on the lint fixture); `AGENTS.md` finalized.
4. `docs/judge-loop.md`; `turboslide judge bundle` (`apps/cli/src/commands/judge.ts`);
   `scripts/judge-loop.mjs` (runner detection sdk, cli, none, and a preflight call that drops a
   runner that cannot answer it; six judges by lens; skeptics; fixers under `--fix` and a lease;
   the gate); `Finding.source` as `lint`, `judge:<lens>` or `skeptic`.

### M5

1. `asset.capture` with the `gt-site` recipe (`packages/headless/src/capture/gt-site.ts`: theme
   keys seeded before first paint, `cookie_consent=no`, the `dark` class held by a
   MutationObserver, motion stilled, consent banners hidden, a scroll pass, 800 ms settle) and
   identical-region detail crops; `asset.add` intake with the license fields, the share-alike flag
   and the two-tone treatment through the photograph pipeline, the continuous source kept as
   `assets/<id>.source.<ext>` (`Asset.sourceFile`).
2. The Dither section of the inspector (`packages/chrome/src/inspector/dither.tsx`: controls from
   the treatment schema, live twins from `apps/studio/src/workers/dither.worker.ts`, the plate
   rectangle, lit fraction and plate metrics, Recapture and Measure through `asset.dither`);
   `asset.dither` and `asset add --two-tone` in the CLI; `picture/plate-clear`,
   `picture/blank-twin`, `picture/mood-placement`, `asset/credit-on-plate` and
   `asset/license-missing` complete (`packages/lint/src/static/{picture,asset}.ts`).
3. `@turboslide/materials`: the Paper Shaders catalog (17 `paper:*` entries with typed uniform
   specs), the GT palette presets plus the deck's recorded recipes as named presets, the recipe
   resolver and the importer's recipe key, the main-thread mount (`mountMaterial`, played live in
   the edit stage by `packages/viewer/src/MaterialMount.tsx`), `material.capture` with anchors,
   recipe sidecars and the renderer string, `material.list`; the `material` block (schema,
   renderer, catalog, palette insert); `proto:*` listed as unavailable (open question 9).
4. Grammar completion: the `composite` block with tracks, gap, justify, align and caption; the six
   declared `dia` templates on the half-pixel grid (`packages/render/src/dia/{templates,snap}.ts`);
   Alt-drag label and marker editing; `dia/*` lints over declared data with composite cell widths;
   the importer emitting `composite`, so the re-import of the Prototemplate deck has zero `html`
   blocks and the same ids as `decks/gt-brand`.
5. Native PPTX for every block type with the M2 width gate closed (the scene measured on a 1x page,
   rasters shot on 2x and 3x pages, the GT run spaced to the mark box, no-break spaces beside
   links, DejaVu Sans Mono in code panels, a face advance calibration); `export.run` gained
   `rasterScale`, `pictureScale`, `baseline` and `dryRun`; the Export menu in the editor
   (`packages/chrome/src/ExportMenu.tsx`: mode, theme, fonts, headings as raster, verify, Export
   PPTX, Google Slides live or Set up plus Dry run, Standalone HTML) with the report card and the
   setup card.
6. `crates/turboslide-native` (the two-tone pipeline, the 1-bit PNG encoder, the diffs and DSSIM
   behind `napi` and `wasm` features), `packages/native` with the seven per-platform packages,
   `@turboslide/effects` selecting native, wasm or TypeScript (`select.ts`), the cell-identity
   parity test, DSSIM in the verify loop.

### Pulled forward from M6 (item 1 and the directive)

- `/` redirects to `/edit/<the newest deck>` and creates `GT brand deck` from the template when
  no deck exists; `/decks` lists the decks with the New deck form; the template record
  `decks/templates/gt-brand/` (85 slides at revision 24, the 8 sections, the 15 archetypes);
  `deck.create` and `deck.rename` on every transport; 15 slide templates in the palette's Insert
  group and the sidebar row menu.
- `@turboslide/export/gslides` (`auth`, `build`, `requests`, `images`, `notes`, `thumbs`, `pace`,
  `schema`, `client`, `calibration`, `units`, `ids`) with `turboslide export gslides --dry-run`,
  the studio's `/api/assets/:token` image host, `calibration/slides.json`, and
  `docs/google-slides.md` with the one-time Google Cloud setup. The rest of M6 (the presenter,
  publishing, the SQLite store) is not started.

## Integration

What the integrator wired after the reports, beyond `pnpm install` and the regenerated contracts:

- The studio's deck dispatcher (`apps/studio/src/server/actions.ts`) registers `asset.add`,
  `asset.dither`, `asset.capture`, `material.capture` and `material.list` through
  `@turboslide/materials/actions` and `judge.bundle` through the CLI child process, so
  `/api/actions` and `/mcp` serve them.
- `apps/studio/src/server/agent-actions.ts` (`runDeckAction`): the editor's `on(...)` table runs
  `asset.add`, `asset.dither`, `material.capture` and `material.list` on the server through the
  same dispatcher, with the action's schema checked first; the write returns over the watch
  channel. The Inspector receives `createDitherWorker` (the studio's `dither.worker.ts`) and
  `onNotice`, so Recapture, Measure, Capture frame and Add asset work in the editor.
- The render worker's export job (`apps/render-worker/src/jobs/export.ts`) accepts and passes
  `rasterScale`, `pictureScale`, `baseline` and `dryRun`, so `export.run` with `format: gslides`
  and `dryRun: true` runs from the editor; the Export menu gained the Dry run entry
  (`export.gslides-dry`) and the report card names a dry run.
- `pnpm generate:contracts` writes `packages/schema/src/rules.json` and
  `packages/lint/fixtures/index.json` (`packages/agent/src/generate/fixtures.ts`), step 3 of
  `scripts/check.mjs` diffs them, and `fixtures.test.ts` fails on a rule with no fixture;
  `dia/stroke-grammar` got a planted raw `dia` block on the fixture deck's `bad-escape` slide.
- `scripts/check.mjs` steps 8 and 12 gate on zero escape blocks and compare every slide (no
  `--skip-html-escapes`).
- `pnpm-workspace.yaml` lists `packages/native/npm/*`; the lockfile now carries the seven
  platform packages, so the frozen-lockfile install in the render worker image passes (the first
  image build of the round failed on it).
- `packages/lint/src/static/dia.test.ts` narrowed a `Mutation` before reading `path` (the only
  `tsc -b` error on the merged tree).
- The importer carries the deck's own assets and the measured plate metrics through an in-place
  re-import (`packages/import/src/import-deck.ts` `carryDeckAssets`, two tests): `pnpm check`
  step 7 re-imports the Prototemplate deck into `decks/gt-brand`, and before this the run dropped
  `liquid-metal-diamond` and the 15 measured records and bumped the revision every time.
- The dev server runs again with the M4 and M5 client graph. Every builder tested against
  `vite build` plus `vite preview`; the dev server failed twice on the merged tree. First the
  dependency optimizer followed the editor's server functions into `server/actions.ts`, the
  materials actions, the headless package and playwright-core's own `vite` import and failed on
  vite's `fsevents` binary (it crawls dynamic imports too), so `apps/studio/vite.config.ts` and
  `vite.deploy.config.ts` generalize the sharp stub to `externalServerOnly()` over `sharp` and
  `playwright-core`, `server/actions.ts` loads the materials actions on first call and
  `download.ts`, `tokens.ts` and `agent-actions.ts` load the worker client and the dispatcher
  inside their handlers. Then `/deck` and `/edit` never settled because
  `packages/agent/src/http/sessions.ts` imported `randomUUID` from `node:crypto` and the studio's
  session server functions keep that module in the client bundle in dev; it uses Web Crypto now.
- The landing spec retries the New deck click until the form is visible: on the dev server the
  first visit to `/decks` hydrates late or reloads once the optimizer finds new modules.
- `deck.create` and `deck.rename` are registered on the studio's dispatcher through the CLI's
  `registerDeckActions` (new export `@turboslide/cli/commands/deck`), so `/api/agent` lists 33
  implemented actions; the 12 left are the window-only and the CLI-only ones.
- `packages/effects/src/parity.test.ts` counts sixteen two-tone assets (the fifteen imported
  pictures plus `liquid-metal-diamond`); `.prettierignore` lists the two generated rule files.

## The fix round

The verifier's drive of the directive's lines on the integrated tree found three defects and the
template drift; four fixes landed before the final run, measured on a throwaway `vite build` and
`vite preview` of the studio on port 4451 (the builder rules keep 4321 for the integrator and the
verifier), 1440 by 900 unless stated.

1. The template snapshot was re-cut from revision 24 with a drift test. The first cut (revision 13)
   still carried the four `html` escape blocks the M5 re-import retired (`diagrams`,
   `fixed-points`, `goals`, `presenter-compare`) and lacked the `liquid-metal-diamond` asset record
   while copying its twins, so a deck created from it had `counts.htmlBlocks` 4, one severity 3
   finding and four `escape/html-block` rows before anyone edited it. `packages/store/src/templates.test.ts`
   now gates the drift in `pnpm check` step 5 (see "Defaults taken", item 1).
2. The deck name was hidden in the default view. `DeckName.css` set `display: none` on the name at
   the fourth label tier while the list column is open, and 1440 with the list open reaches that
   tier, so `landing.spec.ts` failed at its `toBeVisible` and renaming was unreachable from the
   toolbar. The rule is gone: the name never leaves the bar above 900 px. Room comes from the tiers
   instead. Tier four also collapses the Export button (its `.ts-export-anchor` wrapper had kept
   the `.pt-bar-slot > .pt-ib` selector from reaching it, 86 px against 32), turns the status chip
   into its dot (its title and accessible name keep the words) and drops the Search pill's key chip
   (min-width 84 px). A fifth tier, reached only when a route's controls still leave the bar short,
   makes the mode seg's options their icons and the Search pill its glyph, the 900 px reading;
   SPEC 6.3 names four tiers for the ported viewer, and the fifth exists for the editor alone
   (`Toolbar.tsx` `TIERS`, `Toolbar.css`). Measured on the preview build: 1440 with the list open
   lands on tier four with the name whole at 118 px, 36 px to spare; 1280 lands on tier five with
   64 px to spare; at 1170 with the list open the name gives to 73 px and the bar fits exactly; at
   1100 with the list open the name sits at its 56 px floor and the right group overflows by 53 px
   (Help is clipped), the bar's limit with every editor control present. `landing.spec.ts` asserts
   the visible toolbar control, opens the field, closes it with Escape and checks the chip and
   Search keep their boxes beside the name. In the final run's evidence shot (`landing-editor.jpg`,
   1440 by 900 with the list open) the name control is 118 px wide at x 460, the status dot 32 px at
   x 578 and the Search pill 85 px at x 618, all on one row at y 9.5.
3. The status chip ran 93 px under Search at 1280 on `/edit`. The status slot shrank past its chip
   (`min-width: 0`). `Toolbar.tsx` `floorStatusSlot` now writes the slot's inline `min-width` at
   every measure: the name's computed minimum plus the box of everything else in the slot at the
   tier reached (88 px at tier four), and `auto` while nothing in the slot gives. The rename field
   gives too (`data-gives` on the editing span, 72 px minimum): it takes 136 px at 1440 with the
   list open where a rigid 220 px field had pushed Help 84 px past the bar, and the round trip
   (click, Escape) restores the tier, the floor and every box. `scripts/check.mjs` step 18 audits
   `/edit/gt-brand` after `/deck/gt-brand`, both at 1440, 1280 and 390 in both themes.
4. Confirming an Export menu option reset it. `Seg.tsx` returned to the first option on a click of
   the active non-first one (the ported viewer behaviour, SPEC 2.2), so a repeated click on Native
   or Light in the Export menu meant Flatten or Both: a drive exported both themes after choosing
   Light, and a Dry run chosen as Native ran flatten. The return to the first option is now the
   `toggle` prop, passed by the toolbar's mode seg and the sidebar's density seg; every other Seg
   (the Export menu's Mode, Theme and Fonts, the editor's Edit | View, the inspector's enum
   controls) treats a click on the active option as a no-op.
   `packages/chrome/src/__tests__/seg.test.tsx` covers the three cases.

Two more changes of the same round: `scripts/judge-loop.mjs` makes one preflight call and drops a
runner that cannot answer it ("Defaults taken", item 8; the M4 acceptance text in the milestone
plan and `docs/judge-loop.md` say so), and the final run's step 19 found
`packages/export/src/gslides/build.test.ts` and `images.ts` from that round unformatted; the
verifier ran `prettier --write` on the two files (whitespace only) and step 19 passed on the
re-run recorded below.

## Defaults taken

Decisions Kevin has not answered stay at the spec's defaults; the builders recorded these:

1. The GT template record does not carry a second copy of the 30 MB of asset twins:
   `template.json` names `assets: "../../gt-brand/assets"` and `deck.create` copies that folder
   into the new deck. The record's `deck.json` and slides are a snapshot of `decks/gt-brand` at
   revision 24 and do not follow later edits to the working deck on their own;
   `packages/store/src/templates.test.ts` gates the drift in `pnpm check` step 5: the template's
   slide files must equal the working deck's byte for byte and hold no `html` block, the manifest
   must equal it apart from `revision`, `createdAt` and `updatedAt`, the description must name
   the revision the manifest carries, and `deck.create` over the committed record (a scratch
   `decks/` folder linking the template and the working deck) must yield 85 slides, 8 sections,
   every asset record with both twin files and no `html` block. After an edit to `decks/gt-brand`,
   re-snapshot with `cp decks/gt-brand/deck.json decks/templates/gt-brand/deck.json`,
   `cp decks/gt-brand/slides/*.json decks/templates/gt-brand/slides/`, and the new revision in
   `template.json`. The template copies no `known-findings.json`: the revision 24 snapshot has no
   severity 3 static finding, and both rows of `decks/gt-brand/known-findings.json` name `#html`
   blocks that no longer exist. Measured after the re-cut: `turboslide deck create` with
   `--from gt-brand` gives 85 slides, 8 sections, 115 assets, 0 `html` blocks, 0 missing twins;
   `turboslide lint all --layers static --json` on that deck exits 0 with 124 findings, 0 at
   severity 3, 25 at 2, 99 at 1 (the working deck's numbers), against 196 findings, 1 at severity
   3 and 4 escape rows from the revision 13 cut.
2. A created deck starts at revision 0 with an empty version log, the name as title and the slug
   of the name as id; the blank template is one section with one title slide; a duplicate id is a
   TypeError (400), a missing template a RangeError (404).
3. Slide template placeholder copy uses the contrast-pair shape ("Placeholder heading, not final
   copy") so `copy/contrast-pair` (severity 1, no fix) flags every text until it is edited.
4. The `proto:*` engines (open question 9) are listed as unavailable and refused by
   `material.capture`; the Paper Shaders catalog is the materials source.
5. The committed `opener-prototemplate` pair is reproducible from its record only through the
   treatment path (the round's frame was a live-playback screenshot with an unrecorded `u_angle`;
   a fresh `setFrame(5500)` render agrees on 92.58 percent of the cells). The deck's recipe
   records describe the material, not the exact frame.
6. The Slides exporter's calibration constants (`calibration/slides.json` `assumed`) drive the
   request builder until a live run fills the `measured` block; the presentations land in the
   consenting account's My Drive under `drive.file`; images are hosted through the studio's
   `/api/assets/:token` route (a tunnel origin for a live run) or a Cloud Storage bucket when
   `TURBOSLIDE_GCS_BUCKET` is set (open question 3).
7. Leases are enforced for `agent:*` authors only; a human's write past another author's lease
   warns and goes through (SPEC 6.7 read as advisory for people).
8. The judge loop runs the judges through the Claude Agent SDK when installed, else the `claude`
   CLI, else skips them (`--runner none`, the gate then rests on lint, render and build). A
   detected runner must answer one preflight call first; a runner that cannot (an authentication
   error, no answer within `--timeout-s`, default 240 s, or a non-zero exit) is dropped after that
   call, `auto` continuing as `none` with the reason in `gate.json` and an explicit `--runner`
   exiting 1. On a machine without an authenticated runner the acceptance line runs with
   `--runner none`.
9. `asset dither --from-recorded` on the imported deck reads the committed twins back (the
   sources are not on disk: `missingSource` on all 16) and records their plate metrics; the
   `opener-website` opener measures 1789 lit cells under its plate and 681 in the band, so the
   deck carries `picture/plate-clear` findings at severity 2 that are deck work.
10. The `liquid-metal-diamond` opener the M5 acceptance line reads is captured at the `diamond`
    preset, anchor 5500, with the recorded crop `[-1325, 105, 2709, 2374]` and black point 20
    (the action example's values); its sidecar carries the treatment so a re-capture from the
    sidecar reproduces the plate clearance.
11. The acceptance line for the liquid metal capture writes an asset into the deck it runs on. The
    integration run ran it on `decks/gt-brand` and removed the asset with `version restore`,
    which is why revisions 19 and 20 exist. The final run ran the same line on a scratch copy of
    the deck (`decks/gt-brand-scratch`, removed afterwards) and compared the recipe key with the
    committed `decks/gt-brand/deck.json` as the line does, so the committed deck stays at 24.

## Acceptance

### `pnpm check`

Steps 1 to 18 passed in order on this tree; step 19 failed once on the two unformatted Slides
files named above, they were formatted, and step 19 passed alone on the final tree. The run
started at 02:35:09 and reached step 19 at 02:39:43 (265.6 s of step time, 280.9 s reported with
the dev server start and the failed step). The render worker image build ran alongside steps 10
to 18 (02:37:29 to 02:39:33), so steps 10, 12 and 18 carry that contention (the integration run
measured step 10 at 18.0 s and step 12 at 53.4 s on an idle machine).

| Step | Command                                              | Result                                                                                                                                                                                              |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm install --frozen-lockfile`                     | ok in 0.4 s, 30 workspace projects (the seven native platform packages report their platform and are skipped on darwin arm64 except `darwin-arm64`), lockfile current                               |
| 2    | `tsr generate`                                       | ok in 0.8 s                                                                                                                                                                                         |
| 3    | contracts generated and diffed                       | ok in 1.2 s, 14 files current (the 5 JSON contracts, the 2 llms guides, `docs/grammar.md`, `rules.json`, `fixtures/index.json`, the 4 skill references)                                             |
| 4    | `tsc -b`                                             | ok in 3.5 s, 0 errors over every package and app                                                                                                                                                    |
| 5    | `pnpm test`                                          | ok in 27.9 s: 98 files, 948 tests passed, 2 skipped (the two Prototemplate-checkout guards); the template drift test and the parity test's native rows run here                                     |
| 6    | `pnpm build` and the client bundle check             | ok in 9.9 s                                                                                                                                                                                         |
| 7    | import the Prototemplate deck into `gt-brand`        | ok in 2.7 s: 85 slides, 8 sections, 0 escape blocks, 115 assets; the revision stays 24                                                                                                              |
| 8    | `htmlBlocks === 0`                                   | ok (was `<= 4` before M5)                                                                                                                                                                           |
| 9    | `validate decks/gt-brand`                            | ok in 2.2 s, 0 errors                                                                                                                                                                               |
| 10   | `render all` both themes at 1x                       | ok in 37.1 s, 170 records                                                                                                                                                                           |
| 11   | 170 records, 0 page errors                           | ok                                                                                                                                                                                                  |
| 12   | `compare-to-shoot` at 0.5 percent, every slide       | ok in 59.8 s: 170 pairs, 170 compared, 0 skipped as escapes, 0 over budget, worst 0.408 percent (`fixed-points` light; 0.402 dark), mean 0.016 percent                                              |
| 13   | `sheet all`                                          | ok in 7.3 s                                                                                                                                                                                         |
| 14   | sheets exist with 85 cells                           | ok                                                                                                                                                                                                  |
| 15   | `lint all --json`                                    | ok in 11.8 s: 187 findings, 99 at severity 1, 88 at severity 2, 0 at severity 3; 14 carry a fix                                                                                                     |
| 16   | `build --budget 16`                                  | ok in 3.8 s: `brand-deck.html` 15,239,429 bytes (15.24 MB of the 16 MB budget; 199 twins inlined: 34 native, 88 resampled to 1280, 32 two-color, 45 passed through)                                 |
| 17   | `viewer.spec.ts` on the dev server                   | ok in 16.0 s, 6 passed (15.1 s in Playwright; the runner started the server)                                                                                                                        |
| 18   | `lint --chrome` at 1440, 1280 and 390 in both themes | ok in 81.1 s: `/deck/gt-brand` 24 audits, 0 with findings, 0 states unapplied; `/edit/gt-brand` 24 audits, 0 with findings, 0 states unapplied                                                      |
| 19   | `pnpm format:check`                                  | failed in 7.0 s on `packages/export/src/gslides/build.test.ts` and `images.ts` (unformatted by the fix round); formatted; passed alone at the end of the run after the documents below were written |

### Step 18 re-run after the line law flake (2026-09-11)

The verification round found step 18 failing on this tree in 4 of 4 runs, two ways: `--only 18`
on a cold dev server with `state "list" did not apply` on the first audit (exit 2 after 36 to
41 s), and the full chain with four findings on `/edit/gt-brand` at 390 dark in the book state.
Both are the driver and the runner reading the page too early; the chrome is unchanged.

1. `driveShell` (`packages/headless/src/shell.ts`) waited a fixed 1200 ms after the SSR
   `.pt-viewer` selector, and on a cold Vite dev server the `[` key landed before hydration (the
   key listeners attach in the shell's mount effect). It now waits, bounded at 30 s, for
   `.pt-viewer[data-settled]` (set one frame after that mount effect) or `window.turboslide.studio`,
   and a page that never hydrates is an infrastructure failure naming both marks. A page without
   the ported shell root (the Prototemplate deck iframe) keeps the fixed settle.
   `scripts/check.mjs` fetches `/deck/gt-brand` and `/edit/gt-brand` once the server answers and
   crawls the client module graph they name (386 modules in 2.0 to 3.8 s), so the dependency
   optimizer has run before the first browser opens them.
2. The four `/edit` 390 dark book findings (`ts-ctl-textarea | DIV`, `ts-ctl-json-field | DIV`,
   `A | ts-insp-head`, `ts-ctl-select | A`) are the auditor reading through a view transition.
   At or below 900 px the inspector takes the whole main region and the book is laid out under
   it (z 2 in `.pt-stagewrap`, the inspector z 4 on paper); the book's meta rules and contents
   anchors sit 0 to 2 px from the inspector's field and head rules. The mode change runs through
   `document.startViewTransition`, and while its 200 ms cross-fade runs, `document.elementsFromPoint`
   returns no covering element, so `bothVisible` (`packages/lint/src/chrome.ts`) sees the book's
   lines through the opaque inspector. Measured with `auditDocument` in the page: 3 doubles and
   1 junction at 100 ms after the key, 0 at 300 ms, the same 554 segments both times. The state's
   fixed 700 ms settle lands inside the transition only when the book's mount is slow (one run of
   three by hand, the full chain under the image build). `driveShell` now waits before every
   audit, bounded at 2 s, until no finite animation is running (the view transition's
   pseudo-element animations included; finished fill-mode animations and infinite loops are not
   motion) and every scroll offset is unchanged across 120 ms. Inside the transition the wait
   measured 256 to 257 ms and the audit after it was clean in 3 of 3 runs. The textarea, JSON
   field, select and inspector head rules named in the finding were not changed: the doubles are
   two layers, not a seam.

Also in `scripts/check.mjs`: the server left by `--keep-server` died on its next log line once the
runner exited (its stdout was a pipe to the runner; measured: one more lint run answered, then
`ERR_CONNECTION_REFUSED`); it now runs with its output discarded, never an unbounded file.

Runs on this tree: `node scripts/check.mjs --only 18` on a cold server passed 4 of 4 (72.9, 61.4,
67.5 and 62.2 s of step time; 48 audits, 0 with findings, 0 states unapplied each). By hand
against one server, `turboslide lint --chrome --url http://localhost:4321/edit/gt-brand --widths 390
--themes dark --states book` was clean 6 of 6 and the default states 3 of 3; before the settle the
same book-only line reproduced the four findings in 1 of 3 runs.

### M4 lines

The browser lines ran against a dev server the verifier started on 4321 at 02:44:36 (Vite ready
in 4.1 s, log capped at 2 MB, 35.7 KB written) and stopped at 02:48:50. The log holds 30
`AbortError` entries and one aborted request, all from the watch channel's long polls being
cancelled when the specs closed their pages, and nothing else.

| Line                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest run packages/agent/src/__tests__/skills.test.ts coverage.test.ts` (plus `fixtures.test.ts`) | passed, 3 files, 76 tests in 0.93 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `playwright test apps/studio/e2e/agent-http.spec.ts`                                                | passed, 5 tests in 5.4 s (the manifest and the contract; stale `baseRevision` 409 with the current document; held lease 409 with the holder, `force` succeeds; `unknown_field` with a pointer and 401 off localhost; the open editor shows the agent's write with the agent as author within one second, 4.0 s test)                                                                                                                                                                                                                             |
| `node apps/cli/e2e/mcp-http.mjs`                                                                    | passed, 17 steps (tools, insert, render with image content, lint, patch, stale 409, `unknown_field`, versions, resources, an attached headless `/deck` page, a second session listing and driving `deck_goto_slide`, close)                                                                                                                                                                                                                                                                                                                      |
| `turboslide judge bundle --out .turboslide/judge --json`                                            | passed in 18 s: 170 render records reused from step 10 at revision 24, 2 sheets at 2056 by 8396 with 85 cells and 8 section labels each, 187 findings (0 blocking, 0 known), 6 lenses, 185 files                                                                                                                                                                                                                                                                                                                                                 |
| `node scripts/judge-loop.mjs --deck decks/gt-brand --bundle .turboslide/judge ...`                  | passed as written (`--runner auto`) in 205.7 s: the `claude` CLI on `PATH` was detected, its preflight call answered `401 API key is invalid` (the nested session's inherited key), the runner was dropped and the loop continued as `none`; 187 lint findings, 14 mechanical fixes planned (not applied, no `--fix`), 175 remain; gate `ship` at revision 24, lint ok (clean at severity 3 beyond the baseline, 0 known), render ok (170 records, 0 page errors), judges skipped with that reason. With `--runner none` the same gate in 24.6 s |
| the `node -e` gate over `gate.json` and `findings.json`                                             | passed: `verdict` is the string `ship`, every one of the 187 findings carries `slideId` and `source` (all `lint`; no judge or skeptic findings exist without an authenticated runner)                                                                                                                                                                                                                                                                                                                                                            |

### M5 lines

| Line                                                                                                                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turboslide import <Prototemplate deck> --into gt-brand-reimport --json`, `htmlBlocks === 0`                                                 | passed in 2 s: 85 slides, 8 sections, 0 escape blocks, 114 assets (the working deck's 115th is its own `liquid-metal-diamond`)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `import-ids.json` of the re-import equals `decks/gt-brand`                                                                                   | passed: 332 id entries identical (the scratch deck was removed afterwards)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `turboslide asset dither --all-two-tone --from-recorded --verify-cells --json`, no mismatched cells                                          | passed in 2 s: 16 assets read back from their committed twins (the 15 imported pictures and `liquid-metal-diamond`), 0 mismatched cells, 0 `missingParameter`, 16 `missingSource` (the imported deck keeps no continuous sources), every light twin the exact inverse of its dark twin (`twinInverseMismatch` 0 on all 16), no record written (`written` empty on every row), revision 24 before and after                                                                                                                                                                  |
| `turboslide material capture paper:liquid-metal --uniforms .../liquid-metal-diamond.recipe.json --anchor 5500 --two-tone --plate lower-left` | passed in 5 s on a scratch copy of the deck ("Defaults taken", item 11): recipe key `sha256:a00e58cf54dd...` equals the committed record, lit 2.35 percent, plate `[137,500,740,271]` 0 under, 0 in the band, nearest lit cell 204 px, asset size 1600 by 900 at 1x; Chrome for Testing 147.0.7727.15 on ANGLE Metal, one frame at 3200 by 1800 in 3287 ms; the scratch copy went to revision 25 and was removed                                                                                                                                                            |
| `turboslide asset capture https://generaltranslation.com/docs --theme both --scale 2 --recipe gt-site --json`, twins at 2880 wide            | passed in 9 s at the acceptance's literal URL, into a scratch blank deck `e2e-capture` created with `deck create --from blank` and removed afterwards: asset `generaltranslation-docs`, role `capture`, light and dark JPEG twins at 2880 by 1800, both files in 7083 ms (the integration run captured the local Prototemplate server at `localhost:3005/docs` instead)                                                                                                                                                                                                     |
| `cargo test --manifest-path crates/turboslide-native/Cargo.toml`                                                                             | passed: 37 unit tests in 0.35 s and 6 Pillow parity tests in 0.40 s (build cached, 0.03 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm --filter @turboslide/native build && vitest run packages/effects/src/parity.test.ts`                                                   | passed: the addon `turboslide-native.darwin-arm64.node` (771,968 bytes) and the wasm module (273,863 bytes) rebuilt from the cached release targets; 26 parity tests in 7.78 s (the sixteen deck assets light identical cells on the TypeScript, napi and wasm backends)                                                                                                                                                                                                                                                                                                    |
| `docker run ... turboslide export pptx --deck /work/decks/gt-brand --mode native --theme light,dark --fonts exact --verify`                  | passed on the image rebuilt from this tree, 348 s wall (346.6 s reported; light verify 65.5 s, dark 86.7 s): 170 pages, 484 native blocks, 140 raster blocks, 624 gated blocks every one ok, 0 out of budget, worst page fraction 1.21 percent (`inspirations` dark), largest block offsets 1 px in x and y and 2 px in width, geometry in bounds, 13 fonts embedded, DejaVu Sans Mono required on the viewer; `gt-brand-light.pptx` 28.05 MB, `gt-brand-dark.pptx` 29.21 MB; LibreOffice 25.2.3.2, pdftocairo 25.03.0, 1244 shapes per file, 0 `custGeom`, 0 `normAutofit` |
| the `node -e` gate over `export-report.json` (passed and every block ok)                                                                     | passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| every rule in `packages/schema/src/rules.json` has an entry in `packages/lint/fixtures/index.json`                                           | passed in 15 s: 46 rules, 46 entries, 0 null, over 187 findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### M6 item 1 and the directive's lines

| Line                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curl -I /` on the dev server                                                                  | `307` with `location: /edit/gt-brand` in 4.6 ms; `/decks` answers 200                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GET /api/agent`                                                                               | 41 actions, 33 implemented on the studio, `http.pending` empty, `auth.required` false with `localhostOpen` true (no `TURBOSLIDE_TOKEN`), 12 studio sessions listed at the time of the probe (the specs' pages then open; a page that stops polling for 45 s is swept); not implemented on the studio: the window-only `view.goto` (it runs in the attached page over MCP), `view.mode`, `view.theme`, `view.present`, `source.read`, `source.apply`, `controls.list`, `control.activate`, `control.set`, `artifact.download` and the CLI-only `fonts.build`, `import.run`                     |
| `GET /openapi.json`, `/llms.txt`, `/llms-full.txt`, `/mcp`                                     | 200 with 424,742, 4,745 and 21,259 bytes; `GET /mcp` without a session is 400 from the transport                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| the off-localhost rule by hand                                                                 | `X-Forwarded-Host: studio.example.com` on `/api/agent` is 401 from the studio's rule; a bare `Host: studio.example.com` is 403 from Vite's `allowedHosts` check, which exists on the dev server only                                                                                                                                                                                                                                                                                                                                                                                          |
| `GET /api/actions/slide.update?deck=gt-brand`                                                  | the contract: `slide.update`, group `slide`, `mutates` true, transports cli, mcp, http, window, `implemented` true, `POST /api/actions/slide.update`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `playwright test apps/studio/e2e/landing.spec.ts`                                              | passed, 4 tests in 24.8 s: `/` lands on `/edit/<the newest deck>` with the sidebar tree and the name as a visible toolbar control that opens its field and closes on Escape with the chip and Search beside it; New deck from the GT template creates `e2e-landing-deck` with 85 slides, 8 sections and over 100 assets and opens it (5.8 s); the Export menu of a blank deck downloads `e2e-landing-blank-light.pptx` above 1 MB and shows a passed report card (12.9 s); the Google Slides entry shows the setup card without credentials (2.2 s); the scratch decks were removed           |
| `turboslide export gslides --deck decks/gt-brand --mode native --theme light --dry-run --json` | passed in 68.5 s (alongside the container gate and the native build): 85 slides, 6060 requests in 4 batches (1,743,541 bytes), 180 images planned, 0 missing, 0 invalid, geometry in bounds, `presentationId` null; `requests.json` 4.51 MB, `images.json` 0.14 MB; 242 native text blocks and 70 raster blocks per the report; the request kinds: createSlide 85, updatePageProperties 85, createLine 1206, updateLineProperties 1206, groupObjects 224, createShape 624, updateShapeProperties 624, createImage 285, insertText 563, updateTextStyle 595, updateParagraphStyle 563; 0 notes |
| `turboslide export gslides --mode flatten --theme dark --dry-run --json`                       | passed in 43 s: 85 slides, 3836 requests in 2 batches (1,090,592 bytes), 85 images (one 2x sheet raster per page), 0 invalid, geometry in bounds; the request kinds: createSlide 85, updatePageProperties 85, createShape 713, insertText 713, updateShapeProperties 713, updateTextStyle 729, updateParagraphStyle 713, createImage 85; `requests.json` 2.69 MB                                                                                                                                                                                                                              |
| the Export menu's Dry run entry in the editor (`export.run`, format `gslides`, `dryRun: true`) | measured by the integrator in the browser: the report card `Export: Google Slides flatten (dry run)` with `data-passed="true"` appeared 41.7 s after the click, offering `requests.json` and `images.json` for download (`export-report-card.jpg`); the landing spec covers the Export menu's PPTX path and the setup card in the final run                                                                                                                                                                                                                                                   |
| a live Google Slides export                                                                    | not run: no `TURBOSLIDE_GOOGLE_CREDENTIALS` on this machine; the steps are below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Regression pass on the M3 lines

The fix round changed the toolbar, the Seg and the sidebar, so the three M3 editor specs ran once
more against the same server: `editor.spec.ts` 5 passed, `undo.spec.ts` 1 passed (ten mutations
and ten Cmd Z leave the document byte identical after twenty forward writes), `window-api.spec.ts`
3 passed (`describe().actions` equals the generated list); 9 tests in 26.4 s. `viewer.spec.ts` is
step 17 of the chain.

## Export fidelity per mode and target

Every export is verified by rendering the exported file back and diffing it against the web render
of the same slide at the same revision (SPEC 8.5); "identical" is the measured number in the
report. The table names the reference the number was measured against and the run it comes from.

| Target and mode             | Measured                                                                                                                                                                                                                                                                                                                          | Gate                                                                                         | Run                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| PPTX flatten, both themes   | 0 of 170 pages over budget; 164 pages at exactly 0 mismatched pixels; worst `opener-developer-experience` light 0.050 percent; the 30 pages with a regenerated two-tone picture at most 0.055 percent against the sheet shot they embed; 40.75 and 42.42 MiB                                                                      | 0.1 percent of the page at 3200 by 1800 against the 2x render                                | M2 container gate at revision 13 (`docs/M2-STATUS.md`) |
| PPTX native, both themes    | 170 pages, 624 gated blocks all within budget, worst page 1.21 percent (`inspirations` dark), block offsets at most 1 px in position and 2 px in width; 484 native text and line blocks, 140 raster blocks (icons and marks at 3x, diagrams and the language specimen at 1x, the rest at 2x, two-tone pictures regenerated at 2x) | per-block ink offsets and the page text fraction through LibreOffice 25.2.3.2 (`budgets.ts`) | this run, revision 24, the rebuilt worker image        |
| Google Slides native, light | dry run: 6060 requests in 4 batches validate against the strict request schemas, every element inside the 9,144,000 by 5,143,500 EMU page, 180 images planned, 0 missing; nothing measured against Google's renderer yet                                                                                                          | 3 percent of a `LARGE` thumbnail per slide (`calibration/slides.json`), needs a live run     | this run, dry run                                      |
| Google Slides flatten, dark | dry run: 3836 requests in 2 batches, one 2x sheet raster per page over a paper-colored text layer, 0 invalid, geometry in bounds; nothing measured against Google's renderer yet                                                                                                                                                  | 0.1 percent of a `LARGE` thumbnail per slide, needs a live run                               | this run, dry run                                      |
| Standalone HTML             | one file of 15,239,429 bytes with 85 slides, 8 sections, the fonts and 199 twins inlined; the renderer is the same code, so the pixels are the web render                                                                                                                                                                         | 16 MB budget                                                                                 | this run, step 16                                      |

What the Slides target does not carry, recorded in every report's `residual`: letter spacing
(Slides has no tracking, so headings run about 2.5 percent wider in Google Fonts Inter and the
browser's lines travel as hard breaks with the width slack), the text inset (compensated from an
assumed 7.2 by 3.6 pt until measured), `cv11` and `ss01` and the optical sizes (text is Google
Fonts Inter at weights 400 and 500 through `weightedFontFamily`), the page size (fixed at 10 by
5.625 inches, the sheet mapped at 5,715 EMU per px), line pitch (a percentage of an assumed 1.21
normal), hairlines at 0.45 pt whose minimum honored weight is unverified, flatten text without
alpha, and the GT letters as a paper-colored run under the mark on the eight slides that carry
one. PPTX native carries the same GT-run residual, code panels in DejaVu Sans Mono (Menlo on a Mac
without it), and 13 static GT Inter faces embedded.

## The escape count

Zero. The Prototemplate deck imports into 85 slides with 0 `html` escape blocks (step 7 and the
re-import line); at M1 to M3 the count was 4 (`diagrams`, `fixed-points`, `goals`,
`presenter-compare`), retired by the `composite` block, the declared `dia` templates and the
`lock-closed` icon. Four gates hold it at zero: step 8 (`htmlBlocks === 0`), step 12 (every slide
compared, no `--skip-html-escapes`), the template drift test (no `html` block in the snapshot) and
the M5 re-import line with identical ids. The two rows of `decks/gt-brand/known-findings.json`
name `#html` blocks that no longer exist and can be retired.

## The native gate

The M2 blocker was the native width gate: two text blocks out of budget because LibreOffice
measured the text wider than the browser (M2 status, steps 30 and 31). M5 closed it by measuring
the scene on a 1x page, shooting rasters on 2x and 3x pages, spacing the GT run to the mark box,
placing no-break spaces beside links, using DejaVu Sans Mono in code panels and calibrating the
face advance (`packages/export/src/pptx/{face-advance,baseline,text}.ts`). On this tree the
container gate passes on all 170 pages with every one of the 624 gated blocks within budget; the
57 slides that carry raster blocks (diagrams, figures, tiles, pairs, the mark, the swatches) are
gated on the page fraction with their raster blocks' offsets reported but not budgeted, which the
verify log says per slide. The container renders with Chrome for Testing 147.0.7727.0 on
SwiftShader; the host renders on ANGLE Metal; the reference of the diff is the container's own
render, so the gate is free of that difference.

## Running a real Google Slides export

The steps Kevin follows, from `docs/google-slides.md` and the code of this tree. Nothing here is
committed to the repository; the credentials and the token live under `~/.config/turboslide/`.

1. Create a Google Cloud project, or pick the GT workspace's, at console.cloud.google.com, and
   enable the Google Slides API and the Google Drive API under APIs and services, Library.
2. Configure the OAuth consent screen: user type Internal for the GT workspace (no verification
   review; only workspace accounts can consent), app name Turboslide, a support email and a
   developer contact. Under Data access add the two scopes the CLI requests
   (`packages/export/src/gslides/auth.ts`): `https://www.googleapis.com/auth/drive.file` and
   `https://www.googleapis.com/auth/presentations`. The editor's setup card names `drive.file`
   only; the consent page shows both.
3. Create an OAuth client under APIs and services, Credentials, Create credentials, OAuth client
   ID, application type Desktop app, name Turboslide CLI, and download the JSON (an `installed`
   object with `client_id` and `client_secret`).
4. Save it outside the repository and point Turboslide at it:

   ```
   mkdir -p ~/.config/turboslide && mv ~/Downloads/client_secret_*.json ~/.config/turboslide/credentials.json
   chmod 600 ~/.config/turboslide/credentials.json
   export TURBOSLIDE_GOOGLE_CREDENTIALS=$HOME/.config/turboslide/credentials.json
   ```

5. Give Google a URL it can fetch for every image. Google's servers fetch `createImage` and
   `stretchedPictureFill` URLs once at write time and cannot reach `localhost`. Either run the
   studio and a tunnel, and pass the tunnel's origin:

   ```
   pnpm dev                                       # the studio on 4321 serves /api/assets/<sha256>
   cloudflared tunnel --url http://localhost:4321  # prints https://<name>.trycloudflare.com
   ```

   then add `--assets-url=https://<name>.trycloudflare.com` to the export line (or set
   `TURBOSLIDE_ASSET_BASE_URL`); the exporter stages each image content addressed under
   `.turboslide/gslides-assets/<sha256>.png` and the route serves that folder for 15 minutes per
   file. Or set `TURBOSLIDE_GCS_BUCKET`, `TURBOSLIDE_GCS_CREDENTIALS` (a service account key with
   object create and read on the bucket) and optionally `TURBOSLIDE_GCS_PREFIX`, and pass
   `--images=gcs`; objects are uploaded once and handed to Google as V4 signed URLs with a 900 s
   TTL, redacted in `images.json`.

6. Run the first M6 acceptance line from the repo root:

   ```
   TURBOSLIDE_GOOGLE_CREDENTIALS=$HOME/.config/turboslide/credentials.json pnpm exec turboslide export gslides --deck decks/gt-brand --mode native --theme light --verify --assets-url=https://<name>.trycloudflare.com --out .turboslide/export-gslides --json
   ```

   The CLI prints a consent URL and listens on a loopback port (`http://127.0.0.1:<port>`); open
   the URL in a browser signed in to the account that should own the presentation, approve the two
   scopes, and the redirect lands on the loopback server with the code. The token is cached at
   `~/.config/turboslide/token.json` (mode 0600, `XDG_CONFIG_HOME` honored) with a refresh token, so
   later runs need no browser; delete the file to force a new consent, or revoke the app at
   myaccount.google.com/permissions. The run creates one presentation (`presentations.create`
   with the title, `pageSize` read back and checked against the default page), sends the 4
   batches with `writeControl.requiredRevisionId` chained, sends the notes and the removal of the
   default first slide as the second call, then fetches every slide's `LARGE` thumbnail and diffs
   it against the Turboslide render at the same revision. The pacer keeps 60 writes and 60 reads
   per minute per user with backoff on 429 and 5xx; a two-theme verify run is about three minutes
   of thumbnails. Exit 0 when `passed`, 1 when a slide is over its budget, 2 when the credentials
   are missing.

7. Check the report the way the milestone plan does:

   ```
   node -e "const r=require('./.turboslide/export-gslides/export-report.json'); if(!r.presentationId||!r.passed||r.slides.some(s=>s.verify.fraction>0.03)) process.exit(1)"
   ```

   The report carries `presentationId`, `url` (open it: the file is in the consenting account's
   My Drive, which is all `drive.file` reaches), and per slide the mismatch, the fraction and the
   reference, thumbnail and diff paths.

8. Run the flatten line and its gate the same way (`--mode flatten --theme dark --out
.turboslide/export-gslides-flat`, 0.001 as the fraction).
9. Read what the first live run measured back into `packages/export/src/calibration/slides.json`
   under `measured`: the `pageSize`, whether a zero-height line was accepted, whether the 0.45 pt
   weight rendered as one pixel in the thumbnail, and the text inset and pitch against the
   calibration deck. Until then the `assumed` values drive the builder, and the fidelity list in
   the report says so.
10. From the editor: start the studio with the variable set (`TURBOSLIDE_GOOGLE_CREDENTIALS=... pnpm dev`)
    and the Export menu's Google Slides entry runs the live export (`export.run` with
    `format: 'gslides'`); the report card shows the presentation URL and offers the report for
    download. Without the variable the entry is the setup card and Dry run, which is what this
    machine shows.

## Evidence

`docs/m4-m5-evidence/` holds six JPEGs at 1440 by 900 (quality 72) in the editor's default dark
theme. Three were retaken by the verifier in the final run against the dev server at 02:47, after
the toolbar, Seg and Export menu changes of the fix round: `landing-editor.jpg` (`/` after the
redirect: the editor on `opener-brand` of `gt-brand` with the sidebar tree, the deck name control,
the status dot, Search, the Edit | View seg and the Export button in the toolbar, the inspector's
Slide, Layout and Block sections), `export-menu.jpg` (the Export card: Mode, Theme, Fonts,
Headings as raster, Verify with LibreOffice, Export PPTX, the Google Slides section saying
`TURBOSLIDE_GOOGLE_CREDENTIALS` is not set with Set up Google Slides and Dry run, Standalone HTML
with Build and download) and `setup-card.jpg` (the six Google Slides setup steps with the export
line and Copy). Three are the integrator's from 01:33 to 01:35 on the integrated tree, unchanged by
the fix round: `insert-templates.jpg` (Cmd K, `+`: the Insert group with the 15 slide templates and
the block types), `material-inspector.jpg` (`opener-prototemplate`: the liquid metal material
playing live on the stage through `MaterialMount`, the Material section with the preset, the
uniforms, the anchor and the two-tone controls) and `export-report-card.jpg` (the report card after
the Dry run entry: `Export: Google Slides flatten (dry run)`, Passed, mode, pages, raster blocks,
geometry, revision and the two files with Download buttons). The orange button at the bottom
right of the shots is the TanStack devtools trigger, present on the dev server only. The verifier
read every retaken image.

The run's logs and JSON are under `.turboslide/m4-m5-final/` (git-ignored): `check.log`,
`docker-build.log`, `export-native.log`, `gslides-dry.log` and `gslides-dry-flat.log` with their
JSON, `vitest-agent.log`, `cargo-test.log`, `native-build.log`, `parity.log`, `reimport.log`,
`dither.log` and `dither.json`, `material-capture.log` and `.json`, `site-capture.log` and
`.json`, `judge-bundle.log`, `judge-loop.log`, `judge-loop-none.log`, `agent-http.log`,
`mcp-http.log`, `landing.log`, `m3-specs.log`, `api-agent.json`, the capped `dev-server.log`, and
`shots.mjs`, the script that took the three evidence shots.

## Blockers

- No live Google Slides export has run. The exporter's calibration (`calibration/slides.json`)
  carries assumed values until the first live run fills the `measured` block; the two M6 Slides
  acceptance lines need Kevin's Google Cloud project (open question 3) and
  `TURBOSLIDE_GOOGLE_CREDENTIALS` (the steps above).
- No judge or skeptic findings exist for the deck: the `claude` CLI this session inherits answers
  `401 API key is invalid` to its preflight call, so the loop drops the runner and the gate rests
  on lint, render and build. A run with the Claude Agent SDK installed or a logged-in `claude`
  populates `judge:<lens>` and `skeptic` findings; the acceptance line is unchanged.
- `proto:*` materials (open question 9) are refused; the five Prototemplate direction engines are
  listed as unavailable.
- The PowerPoint manual pass (EOT acceptance, the first-baseline constant, `custGeom` counters) is
  unchanged from M2; DejaVu Sans Mono as the code panel family substitutes to Menlo on macOS and
  is unmeasured in PowerPoint; the `say` block stays a raster until the font set cuts a 27 px face.
- The committed `opener-prototemplate` pair is reproducible from its record only through the
  treatment path (92.58 percent cell agreement from a fresh `setFrame(5500)` render); regenerating
  that opener means re-choosing a frame.
- The render worker image must be rebuilt after a source change before the container gate is
  meaningful (`docker build -f docker/render-worker.Dockerfile -t turboslide-render-worker .`,
  124 s here with the apt and Chromium layers cached); the image this run used was built from
  this tree.
- `.github/` stays untracked and unpushed, as in M1 to M3 (the `gh` token lacks the `workflow`
  scope).

## Open items

- The deck carries 88 severity 2 findings (`contrast/both-themes` 37, `dia/stroke-grammar` 19,
  `dia/label-clearance` 18, `rows/two-lines` 8, `picture/plate-clear` 4, `copy/sentence-case` 1,
  `copy/token-first` 1) and 99 at severity 1 (`export/non-native` 64 on the blocks that travel as
  rasters, `dia/fit-slot` 8, `picture/plate-clear` 8, `opener/sentence-lists-section` 6,
  `copy/full-sentence-caption` 5, `dia/half-pixel` 3, `numbers/contradiction` 3,
  `copy/metaphor-candidate` 2); the gate is severity 3 beyond the baseline, so none blocks, and
  they are deck work or a limits decision. 14 carry a mechanical fix (`turboslide fix all`).
- The setup card (`packages/chrome/src/SetupCard.tsx` `GOOGLE_SCOPE`) names one scope where the
  CLI requests two; the docblock of `packages/chrome/src/inspector/seg.tsx` still describes the
  return to the first option that the `toggle` prop replaced. Both files were outside the fix
  round's paths.
- The window-transport actions the editor runs on the server (`asset.add`, `asset.dither`,
  `material.capture`, `material.list`) return over the watch channel within a second; the
  Material section's Capture frame waits for the document revision before pointing the block at
  the frame. `asset.capture` has no window transport (a site capture is a CLI, HTTP or MCP call).
- The dev server's dependency optimizer treats every module a client route imports as browser
  code, dynamic imports included. A server-function module must keep its module-level imports
  browser safe and reach Node-only packages inside its handlers; the `externalServerOnly()` plugin
  covers `sharp` and `playwright-core`. A builder who tests only with `vite build` plus
  `vite preview` does not see this; the check chain's steps 17 and 18 do.
- `pnpm check` step 7 re-imports the Prototemplate deck in place on every run; the importer
  carries the deck's own assets and metrics, and a re-import that changes nothing keeps the
  revision (verified again at 24 in this run).
- The M3 open items stand (the rendered lint layer in the inspector, Cmd D on the key, the inline
  text coalescing, the thumbnails cache per revision, the twin view ground), as do the M2 ones
  (the extractor's positioning disagreement, the `GT Inter` family name, `docs/spec/` and the
  photographs in a public repository, the MIT license).
