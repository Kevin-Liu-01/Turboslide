# Turboslide round five build plan

Companion to `docs/gslides-parity/SPEC-5.md` (section numbers below refer to it unless prefixed SPEC, SPEC-2, SPEC-3 or SPEC-4) in the shape of `MILESTONES-3.md` and `MILESTONES-4.md`. One round, six builders with disjoint file ownership, an integrator, a verifier, a fixer round and a ship step. Written 2026-09-14 against `main` at `d5d7f07` while round four is in the working tree.

Rules (AGENTS.md is the contract; the round one to four rules stand):

- The round starts on `main` after the round four ship step (SPEC-5 0.1). Nobody branches from `gs4/integration`. The integrator re-reads every line citation of SPEC-5 on the round four ship commit before day 0 ends and records the moved lines in `build-5/integrator.md`; a file round four renamed, split or created (`apps/studio/src/editor/controller.tsx`, `packages/chrome/src/Filmstrip.tsx`, `apps/studio/src/components/home/HomeHero.tsx`, `packages/schema/src/shapes/definitions.ts`, `scripts/perf-budget.mjs`) is owned in round five under the name round four gave it, and a file round four did not land is reassigned by the integrator on day 0 without changing which builder owns the behaviour.
- Shared checkout, disjoint ownership per the "Owns" lists below. A builder edits only the files named in their row. A change needed elsewhere is a request in `docs/gslides-parity/build-5/<key>.md` and the integrator or the owner makes it. Never edit another builder's files, never revert another builder's work, never run git write commands (read only git is fine).
- The shared files are the integrator's for the whole round (SPEC-5 0.53): `packages/chrome/src/menus/{model,strings,keys}.ts`, the shared header of `packages/schema/src/actions.ts`, the schema files of 1.2, `packages/export/src/scene/types.ts`, `packages/export/src/check.ts`, the dispatch tables and `apps/studio/src/editor/controller.tsx`. Every row lands on day 0; a later change is a request answered the same day.
- The page sweep (SPEC-5 6.1) is B4's on day 1: the 123 sheet constant sites of R08 part 1 become `deckPage`, `grid(page)` and `geometry(page)` reads with no behaviour change, across every package, merged at merge 1; from merge 1 each file belongs to its round five owner and B4 requests any later page edit in another lane's file.
- Never run `pnpm install`, `pnpm add` or `pnpm exec`; call binaries as `node_modules/.bin/<tool>` or `node <script>`. Never run `pnpm build` or `vite build` (the integrator builds); typecheck with `node_modules/.bin/tsc -b` and run vitest per package. A dev server is `TURBOSLIDE_STORE=tmp node_modules/.bin/vite dev --port <port>` from `apps/studio` on the port the builder's row names (4351 to 4356), always with the tmp store, the memory realtime tier and a fake download secret, stopped before returning, never 4321 or another builder's port; Playwright runs with `PLAYWRIGHT_BASE_URL` and `.turboslide/e2e.lock`, never overlapping. The dev server measures nothing: every number comes from the node-server build (`scripts/check.mjs` step 31) or a preview. A fixture that needs `ffmpeg` or the fonts venv is generated on the builder's machine once and committed; the check chain never runs either.
- Copy rules (Kevin): plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences in body text; buttons Title Case; the product is written "Turboslide"; the five words of SPEC-4 0.26 never appear; a number on a page carries its source line; Google's labels where Google has the feature, `turboslide: true` where it does not, `unverified: true` where no Google page states the label.
- No Google, YouTube or Microsoft artwork; icons are Heroicons 20 solid from the theme sprite; the play, speaker and person glyphs and the motion glyph are Turboslide's own sprite symbols; the mark is drawn by `packages/theme/src/brand.ts` and nowhere else.
- Every new behaviour has a unit test or an e2e spec; never weaken an existing test to pass; the Perfect export of the GT deck stays pixel identical (compare-to-shoot at 0.5 percent); `packages/chrome/src/tokens.css` is byte identical to the ship commit; the layout shift audit (SPEC-3 step 27) stays at zero; every stored deck under `decks/` validates at `schemaVersion` 1 with `migrate` the identity.
- Report honestly with the commands run and their results in `docs/gslides-parity/build-5/<key>.md`; anything the build needs lives in the repository, never only in the session scratchpad, which is wiped at the date change.

Baseline: the round four ship commit on `main` (to be named by the integrator on day 0 as `BASE` in `build-5/integrator.md`). Facts SPEC-5 states about the tree are at `d5d7f07`; the integrator's day 0 note maps each cited line to the baseline.

## The order

```
Day 0                     Days 1 to 2                        Days 3 to 7                                   Day 8            Day 9           Day 10
integrator: BASE,      ─► B4 page sweep (no behaviour)    ─► B1 panel, show, presenter, pen, OOXML, HTML  ─► merge 2 ─► verifier ─► fixer round ─► ship
  the day 0 seam of       B1 compileMotion, data-block       B2 intake, dialogs, posters, controller,        (order B4,   (16.1 to     (own files)
  SPEC-5 1.6, steps       B2 MediaAsset, sniff, parsers      exports, camera, prefix, twin, index, effects    B1, B2, B6,   16.9 on the
  32 to 36 as stubs,      B3 package, xml, theme, inherit    B3 reader, dialogs, Import theme, templates,     B3, B5)      preview)
  pnpm install once       B5 Preferences, prefs actions      blocks, nested groups
verifier: baseline        B6 themeCss, THEME_IDS,            B4 print, PDF, ODP, SVG, interpreter, card
  on production           shapePath seam                    B5 autocorrect, spelling, language, dictation,
                          ─► merge 1 (end of day 2)          dictionary, accessibility, help, rows, chat
                                                             B6 equation, theme mode, Plate, dither, crate
```

- Day 0: the verifier records the baseline (the parity audit, the perf run with the deployment profile, the layout shift audit and `pnpm check --list` at 31 on the round four production deploy) under `verification-5/`; the integrator names `BASE`, lands the day 0 seam of SPEC-5 1.6 (the schema fields, the validator codes with empty per family modules, every `ActionSpec` row of section 13 answering `NotImplementedError`, the dispatch spread lines and one empty handler module per lane, the menu rows as `later` with their final effects and the `MenuSetting`, `MenuClientHandler`, dialog and panel titles, the key rows, the catalog entries, the `Scene` fields with identity functions in the owners' modules, the post process call sites with identity rewrites, the five check modules called by `check.ts`, the `normalizeMotion` call sites, the catalog dependencies), adds check steps 32 to 36 as gated stubs, runs `pnpm install` once and `pnpm generate:contracts` once, and settles whether `menu-model.test.ts` counts the `file.email` container.
- Days 1 to 2: B4 lands the page sweep and `deckPage`, `grid(page)`, `geometry(page)`, `scaleCanvas` and the `shapePath` seam (the box path behind the new signature); B1 lands `compileMotion`, `motionCss`, `normalizeMotion` and `data-block` on `renderSlide`; B2 lands the `MediaAsset` union's runtime, the sniff and the parsers with their fixtures; B3 lands `package.ts`, `xml.ts`, `theme.ts` and `inherit.ts` over fixture 01; B5 lands the `Preferences` record, its migration and `prefs.get` and `prefs.set`; B6 lands `themeCss` (an empty record emits an empty sheet), `THEME_IDS`, `tokensFor(id)`, `sheetRootAttributes` and `stageFrame(id)` returning today's GT frame. Merge 1 at the end of day 2 with steps 1 to 6 green, the `/new` boot probe and `compare-to-shoot` at 0.5 percent.
- Days 3 to 7: the parallel build against merge 1, each builder on their own port, requests in `build-5/<key>.md` answered by the integrator the same day.
- Day 8: merge 2 in the order B4, B1, B2, B6, B3, B5 (everyone reads the page; the controller is called from B1's step advance; the templates and Import theme's panel need the theme; the chat entry lands last because it touches the realtime protocol); `pnpm check` 36 of 36 on the merged tree with `--list` at 36; the preview deployment; the verifier's first pass.
- Day 9: the fixer round in each builder's files; the verifier's second pass.
- Day 10: the ship step.

## The seams every builder types against

Fixed by SPEC-5 so the parallel builders need no negotiation; the integrator lands them on day 0 as types and identity stubs, the named owner fills them by merge 1 or by the day named.

- The schema fields of SPEC-5 1.2 (integrator, day 0): `SlideBase.transition`, `SlideBase.animations`, `MediaBlock`, `SpotlightBlock`, `EquationBlock`, `MediaAsset`, `AssetVariant` 320, `Deck.page`, `Deck.language`, `Deck.themeEdits`, `Deck.importedThemes`, `Deck.customLayouts`, `THEMES`, `PlainBlock.start`, `prefix`, `suffix`, `Typography.firstLine`, `hanging`, `ShotAdjust.reflection`, `recolor`, `TableCell.border` per edge, `DeckGuides.colors`, `Position.group` as a path, the dither patterns, the export options, report and check types, the action rows and groups, the validator codes, the catalog entries, `Principal.preferences`, the `chat` entry kind.
- `compileMotion(slide, blocks, paragraphs): MotionSchedule`, `motionCss(schedule, page)`, `normalizeMotion(slide)` and `MOTION_LABELS` (B1, merge 1): read by B4's `odp/motion.ts`, B2's media controller, B1's own writers, the palette and the skills.
- `data-block` on every top level block root under `blockAttrs` or `motion` (B1, merge 1) and `data-media` with the eight playback attributes on the poster root (B2, day 3): the present layer, the standalone script and the pen address blocks through them.
- The `Scene` fields (integrator, day 0, as optional with identity functions): `schedule` and `transition` filled by `compileMotion` (B1), `media` by `sceneMedia` in `scene/media.ts` (B2), `equations` by `sceneEquations` in `scene/equations.ts` (B6), `themeCss` by `themeCss(deck)` (B6), `page` by `deckPage` and `language` by the manifest (B4), `SceneLine.baseline` by `scene/measure.ts` (B4). `extractScenes` calls them and is B1's file afterwards.
- The post process order of SPEC-5 2.4 (B1 owns `pptx/build.ts`): `rewriteMedia(xml, scene, zip)` in `ooxml/media.ts` (B2) and `rewriteEquations(xml, scene, zip)` in `ooxml/math.ts` (B6) are called at the fixed positions and are identity functions on day 0; `groupShapes` returns each group's id and the shape regex admits `mc:AlternateContent` (B3's `ooxml/groups.ts`, merge 1).
- `check.ts` (integrator) calls `checkMotion(zip)` (B1), `checkMedia(zip)` (B2), `checkEquations(zip)` (B6), `checkOdf(zip)` and `checkSvg(text)` (B4), each `{ ok: true, lines: [] }` on day 0.
- `deckPage(deck)`, `grid(page)`, `geometry(page)`, `pageEmu(page)`, the stage's `--ts-sheet-w` and `--ts-sheet-h`, `scaleCanvas(slide, from, to, mode)` (B4, merge 1): read by every lane from merge 1.
- `shapePath(preset, box, adjusts): PathCommand[]`, `textInset`, `sites` (B4): the box path behind the new signature at merge 1, the interpreter by day 6; the ODP and SVG writers read it.
- `printLayout({ page, layout, paper, orientation, order })` (B4, day 4): read by the print route and `pdf/build.ts`, both B4's.
- `Preferences` and `prefs.get`, `prefs.set` (B5, merge 1): `units` read by B4's rulers and readouts, `svgText` by B4's SVG row and the Download dialog, `spelling` and `accessibility` by B5, `autofit` by `block.insert`, `starred` by the home page.
- `themeCss(deck)`, `THEME_IDS`, `tokensFor(id)`, `sheetCss(id)`, `stageCss(id)`, `stageFrame(id)`, `sheetRootAttributes(id, appearance)` (B6, merge 1): read by B4's `stage.ts` and `slide.ts`, B1's show, the print document, the standalone build, the SVG writer and `masters.ts`.
- `ThemeRecord` and `importedThemes` (integrator, day 0): written by B3's `theme-import.ts`, read by B6's Themes panel and `theme.applyImported`.
- The media controller's `mount(slide)`, `unmount(slide)`, `play(blockId)`, `pause(blockId)`, `restart(blockId)`, `onState(cb)` (B2, day 4): called from B1's step advance and the presenter's `mediaControl` handler; ported to the standalone motion script by B1 from B2's module.
- The presenter channel's `state.step`, `state.steps`, `goto.step`, `media`, `mediaControl` and `stroke` messages (B1, day 4): `presentSync.ts` is B1's; B2's console rows read `media`.
- `ImportReport` (`summary`, `rows`, `fonts`, `theme`, `source`, `validation`) (B3, merge 1): read by B3's dialogs, the CLI and the verifier's fidelity table.
- `BuildingBlock` and `TemplateRecord` (B3, merge 1): the two indexes the home page, the panes and the actions read.
- `EQUATION_SYMBOLS` (B6, day 3): read by the equation toolbar, the palette, `equation.symbols`, the OMML writer and B5's drawing box recogniser (the Math and Arrows features).
- `DITHER_PATTERNS` (B6, day 6): read by `picture.dither`, the Dither section and the crate parity test.
- The window action table in `apps/studio/src/editor/controller.tsx` and the `mode: 'theme'` state (integrator): each lane's window actions are wired as they land through a request naming the handler.

## B1 Motion and the show

Estimate: 92 agent hours. Dev server port 4351.

### Inputs

SPEC-5 sections 0 (0.3 to 0.15, 0.50, 0.54), 1 (1.3 to 1.5), 2 (every subsection), 12.6, 13 (the motion rows), 16.2; R01 sections 1 to 4, 6, 8; R05 sections 2, 4, 5, 6, 9, 10, 11; R07 sections 3, 5.3; P3 sections 1.3, 2; P1 sections 1.2, 1.4 (the pen and the downloads); P2 section 1.4 (the presenter preview).

### Owns

`packages/schema/src/motion.ts` and `motion.test.ts`, `packages/schema/src/validate/motion.ts`, `packages/render/src/motion.ts`, `motion-css.ts` and their tests, `packages/render/src/standalone.ts`, `packages/viewer/src/present/**` (`presentKeys.ts`, `presentModel.ts`, `presentSync.ts`, `PresenterConsole.tsx`, `PresentToolbar.tsx`, `SlideshowLayer.tsx`, `SlideList.tsx`, `strings.ts`, `ui.tsx`, new `pen.ts`), `packages/viewer/standalone/motion.ts` (new) and `runtime.ts` (the one hook), `apps/studio/src/components/{Slideshow,PresenterPage,DeckViewer}.tsx` and `presentActions.ts`, new `packages/chrome/src/panels/MotionPanel.tsx` and `MotionPanel.css`, `packages/chrome/src/{Filmstrip,Sidebar}.tsx` (the glyph; B2's `srcset` by request), new `packages/export/src/ooxml/{ids,transition,timing}.ts` and their tests, `packages/export/src/pptx/build.ts` (the order, the page from B4's sweep), `packages/export/src/scene/extract.ts` (from day 0), new `packages/export/src/check/motion.ts`, the motion handler module (`apps/cli/src/actions/motion.ts` or the split the integrator names), `decks/fixture/motion/**`, `apps/studio/e2e/motion.spec.ts`, `docs/gslides-parity/build-5/b1.md`. Requests: `data-block` in `renderSlide` (B4 owns `slide.ts`; the attribute lands through B1's request at merge 1), the `Filmstrip` `srcset` line (from B2), the `on(...)` rows for `motion.play` and the panel (integrator), `odp/motion.ts` reading the schedule (B4 writes it against B1's snapshot).

### Delivers

1. Day 1: `motion.ts` (the constants, the `Animation` type, `MOTION_LABELS`, `normalizeMotion`), `compileMotion` and `motionCss` with the snapshot test over the eleven fixture slides, the `motion` validator module, the `data-block` request, the reducer call sites confirmed with the integrator.
2. Day 3: the Motion panel with every control of 2.1 writing the seven actions, the six entry points, the filmstrip and grid glyph, the panel's Play over the present layer's CSS, `Alt+Up` and `Alt+Down`, the handler module for `motion.setTransition`, `add`, `update`, `remove`, `reorder`, `compile`.
3. Day 4: the show's step model (`stepCount`, `nextPosition`, `previousPosition`), `data-step` and the four classes, the two mounted slides during a transition, reduced motion, the digit and Home and End rules, the channel's `step`, `steps`, `goto.step`, `media`, `mediaControl` and `stroke` messages, the presenter's "Step 2 of 4" line and the next preview one step ahead, `view.present` and `view.goto` with `step`, the media controller's `play(blockId)` called from the step advance against B2's seam.
4. Day 5: `ids.ts`, `transition.ts`, `timing.ts` with their tests against the snapshot, the `spd` thresholds at 500, 999 and 1000 ms, the `bldP` and `pRg` per paragraph, the media nodes over B2's `SceneMedia`, the order in `pptx/build.ts` with B2's and B6's rewrite calls, `checkMotion` and the round five line, `export.run --motion drop`.
5. Day 6: `#ts-motion` and `#ts-motion-css` in `renderStandalone`, the standalone motion script with the media controller ported from B2's module, the runtime hook, `build.run` and `export.run` with `motion`, `autoplay` and `media`, the Download dialog's three Web page controls (a request to B4 for `Download.tsx`).
6. Day 7: Auto-play with the timer, the pen with the `stroke` mirror, the in show downloads over the Download dialog, the three stubs retired, `motion.spec.ts` on the motion fixture and the 4:3 fixture, the parity audit rows handed to the verifier.

### Acceptance

```
cd packages/schema && ../../node_modules/.bin/vitest run motion validate/motion reduce
cd packages/render && ../../node_modules/.bin/vitest run motion motion-css standalone
cd packages/export && ../../node_modules/.bin/vitest run ooxml/timing ooxml/transition ooxml/ids check/motion
cd packages/viewer && ../../node_modules/.bin/vitest run present
PLAYWRIGHT_BASE_URL=http://localhost:4351 node_modules/.bin/playwright test apps/studio/e2e/motion.spec.ts
node apps/cli/bin/turboslide.mjs export decks/fixture/motion --mode native --out .turboslide/motion-native && node apps/cli/bin/turboslide.mjs export check .turboslide/motion-native   # the round five line: one transition per slide, the effect and bldP counts
node apps/cli/bin/turboslide.mjs export decks/fixture/motion --mode flatten --out .turboslide/motion-flatten   # the report perfect: true
node apps/cli/bin/turboslide.mjs motion compile <slideId> --deck decks/fixture/motion --json
```

Plus: `#ts-motion` absent from the GT deck's standalone file; `compare-to-shoot` at 0.5 percent after `data-block` lands; the Perfect report of the motion fixture `perfect: true` with the rasters within `PAGE_RASTER_BUDGETS.perfect`; `b1.md` records the click counts per fixture slide against the snapshot.

## B2 Media, camera, screens, pictures and the store engineering

Estimate: 104 agent hours. Dev server port 4352.

### Inputs

SPEC-5 sections 0 (0.16 to 0.21, 0.47, 0.49), 1.2 (the media and asset rows), 3 (every subsection), 11 (the twin variant, the deck index, Reflection and Recolor), 12.6, 13 (the media rows), 16.4 (the media legs); R11 (every section); R05 sections 3, 7, 8; R02 a.1, a.2; R04 5.5 (the picture effects); SPEC-3 8.3, 8.5, 8.8; `docs/hosting.md` sections 4, 5 and the storage layout v2 note.

### Owns

New `packages/store/src/media/**` (`sniff.ts`, `isobmff.ts`, `ebml.ts`, `mp3.ts`, `wav.ts`, `info.ts`, their tests, `README.md`), new `packages/schema/src/blocks/media.ts` and `validate/media.ts`, new `packages/render/src/blocks/media.ts`, `packages/render/src/blocks/picture.ts` (reflection, recolor), new `packages/viewer/src/present/media-controller.ts` and its test, `packages/viewer/src/LiveClone.tsx`, new `packages/export/src/ooxml/media.ts`, `packages/export/src/ooxml/clean.ts`, new `packages/export/src/scene/media.ts`, new `packages/export/src/check/media.ts`, `packages/export/src/pptx/images.ts` (the effects), `packages/store/src/{blob-store,blob-vercel,bundle,unpack,hosted}.ts` (the content types, `putAssetFile`, `cacheControlMaxAge`, the keyed prefix, the media entries, the index), `apps/studio/src/server/{upload,ratelimit,headers}.ts`, `apps/studio/src/routes/api/x.upload.$.ts`, `apps/studio/src/routes/decks.$deckId.assets.$.ts` (Range, HEAD, the prefix), `packages/headless/src/capture/shared.ts` (the allow list entries, `maxBytes` per kind), `packages/materials/src/actions.ts` (the media actions and the 320 variant), new `packages/chrome/src/dialogs/{InsertAudio,InsertVideo,Camera,DisplayOptions}.tsx`, new `packages/chrome/src/inspector/media.tsx` and `packages/chrome/src/inspector/picture.tsx` (the Reflection and Recolor rows), the three sprite symbols in `packages/theme/assets/sprite.svg` and `sprite-ids.json`, the media handler module, `fixtures/media/**` with its `README.md`, `apps/studio/e2e/media.spec.ts`, `docs/gslides-parity/build-5/b2.md`. Requests: the Share dialog's interim sentence and its removal (B5 owns nothing there; the integrator applies it to `dialogs/Share.tsx`), the `srcset` line in `Filmstrip.tsx` (B1), the `Thumb.tsx` variant read (round four's file, integrator), the bundle cap constant if Kevin confirms 500 MB (integrator).

### Delivers

1. Day 1: the `MediaAsset` union's runtime helpers, the sniff and the four parsers with `fixtures/media` and the unit tests (duration within 20 ms), the content type tables, the `media` validator module.
2. Day 3: the three intake paths (`media.insert { file | url | upload | youtube }`, the presigned `blob` backend with the media grant route, the CLI wrap), the quota rows and `DECK_CAPS.mediaBytes`, the `tmp` tier refusal, the checkout route's Range and HEAD, the CSP and `Permissions-Policy` changes with their header tests, the YouTube URL grammar and the oEmbed title, the two dialogs and the drop and paste path.
3. Day 4: the poster root in the renderer with `data-media` and the eight attributes, the three sprite symbols, the poster capture and its fallbacks, `media.poster`, `media.info`, `media.list`, the Format options sections with Google's defaults writing `media.setPlayback` and the `playMedia` row rule, the media controller with `mount`, `unmount`, `play`, `pause`, `restart`, `onState`, the `NotAllowedError` toast, the deck level audio layer, the YouTube iframe.
4. Day 5: `ooxml/media.ts` (the media picture, the two relationships, the stored part, `p14:trim`, the `p:audio` and `p:video` node data for B1's timing writer), `cleanContentTypes`, `checkMedia`, `sceneMedia`, `export.run --media embed|poster`, the standalone's three media modes handed to B1, the keyed prefix for media on restricted decks with rotation and the assets route resolution, the Share dialog sentence request.
5. Day 6: the Camera dialog and `camera.capture`, the spotlight block's renderer and show mount, Present on another screen and Presentation display options over the Window Management API with the disabled state, Reflection and Recolor (the renderer, the native `a:grayscl` and `a:duotone`, the baked raster for the rest with the residual line, the inspector rows).
6. Day 7: the 320 px twin variant (the variant writer, `picture.materialize --clone`, `LiveClone`'s `srcset`, the `Filmstrip` request), the deck index on the blob tier with `ifMatch`, the coalesced write and the rebuild, `media.spec.ts`, the presigned upload of a 150 MB `webm` on a preview through the CLI recorded in `b2.md`.

### Acceptance

```
cd packages/store && ../../node_modules/.bin/vitest run media bundle blob-store hosted
cd packages/schema && ../../node_modules/.bin/vitest run validate/media
cd packages/render && ../../node_modules/.bin/vitest run blocks/media blocks/picture
cd packages/viewer && ../../node_modules/.bin/vitest run media-controller
cd packages/export && ../../node_modules/.bin/vitest run ooxml/media ooxml/clean check/media pptx/images
cd apps/studio && ../../node_modules/.bin/vitest run server/headers server/upload server/ratelimit routes/assets
PLAYWRIGHT_BASE_URL=http://localhost:4352 node_modules/.bin/playwright test apps/studio/e2e/media.spec.ts
node apps/cli/bin/turboslide.mjs export decks/fixture/motion --mode native --out .turboslide/media-native && node apps/cli/bin/turboslide.mjs export check .turboslide/media-native   # a:audioFile, a:videoFile, p14:media, the parts, the five content types
node apps/cli/bin/turboslide.mjs media info <assetId> --deck decks/fixture/motion --json
```

Plus: a `Range: bytes=0-99` request on the dev server's asset route answers `206` with `Content-Range`; the poster of `bars-1s.webm` is 320 px wide in the filmstrip clone and 1600 px in the sheet; a media file on a restricted deck lives under `d/<deckId>/<assetKey>/` and a revoked link rotates the key; `b2.md` records the presigned upload's three steps and the `describeBackends` answer on the preview.

## B3 Import, templates, building blocks and nested groups

Estimate: 106 agent hours. Dev server port 4353. If the reader runs long, the eight templates ship as the Sales pitch, Blank (Plate) and at least one template per category by day 7 and the rest in the fixer round; the reader, the dialogs and the fixtures are never cut.

### Inputs

SPEC-5 sections 0 (0.22 to 0.29, 0.48, 0.54), 4, 5, 11 (nested groups), 12.6, 13 (the import and template rows), 16.3; R04 (every section); R02 b.1, c.1; R01 6.6; R06 8.5; R08 3g; R03 4.7; P1 sections 3.2 to 3.6, 4; P2 sections 3, 4; P3 sections 4, 5.

### Owns

New `packages/import/src/pptx/**` (the modules of SPEC-5 5.1 and their tests), new `packages/import/src/theme-import.ts`, `packages/import/src/import-deck.ts` (the dispatch by source), `packages/import/package.json` (the `@xmldom/xmldom` line by request to the integrator), new `packages/import/src/__fixtures__/pptx/**`, new `scripts/pptx-fixtures.py` and `scripts/pptx-oracle.py`, `apps/cli/src/commands/import.ts`, `apps/studio/src/server/bundle-core.ts` (the `.pptx` ticket), new `packages/schema/src/building-blocks.ts`, `packages/schema/src/{position,freeform}.ts` (the group path arithmetic, from merge 1), `packages/export/src/ooxml/groups.ts` (the regex, the ids, the nesting), `packages/store/src/{templates,seed}.ts`, `decks/templates/{sales-pitch,status-report,consulting-proposal,case-study,product-roadmap,lesson-plan,book-report,portfolio,blank-plate}/**`, `decks/templates/building-blocks/**`, `decks/templates/templates.json`, `packages/chrome/src/dialogs/{Open,ImportSlides}.tsx`, new `packages/chrome/src/dialogs/{ImportTheme,ImportReport}.tsx`, new `packages/chrome/src/panels/{TemplatesPane,BuildingBlocksPane}.tsx`, new `packages/chrome/src/SidebarStrip.tsx`, new `apps/studio/src/routes/decks.templates.tsx`, the strip section of `apps/studio/src/routes/decks.index.tsx` (round four's B3 file; the strip lines by ownership from merge 1), `packages/chrome/src/slide-templates.ts`, the import and templates handler modules, `docs/import-pptx.md`, `apps/studio/e2e/{import,templates}.spec.ts`, `docs/gslides-parity/build-5/b3.md`. Requests: the selection level state in `Gestures.tsx` (B4), the Themes panel's Import theme button and "In this presentation" group (B6 owns `ThemesPanel.tsx`; B3 supplies `theme-import.ts` and the dialog), the `IMPORT_PPTX` retirement in `strings.ts` and the test (integrator), the `a:reflection` and `a:duotone` field targets (B2's fields exist from day 0).

### Delivers

1. Day 1: `package.ts`, `xml.ts`, `theme.ts`, `inherit.ts`, `units.ts` over fixture `01-text` with `pptx-fixtures.py` generating it in the venv, the `ImportReport` type and `report.ts`, the `.pptx` accept on the three Upload tabs, `groupShapes` returning ids and the `mc:AlternateContent` regex for B1.
2. Day 3: `text.ts`, `shapes.ts`, `pictures.ts`, `tables.ts`, `charts.ts` with fixtures 02 and 03, the `adopt` and `keep` modes, the font run counts, the six guards.
3. Day 4: `groups.ts`, `diagrams.ts`, `motion.ts`, `media.ts`, `equations.ts` with fixture 04, the fold of R01 6.6, the picture effect rows, `pptxGroupPath` onto the group path, `import.pptx` with `dryRun` and the two `sheet` modes, the oracle script.
4. Day 5: the round trip of fixture 05 and 05b with the equality gate, the report card and the Open snackbar, the Import slides dialog's two steps with the checkbox unchecked and `after` defaulting to the last slide, `slide.import` with `sourceFile`, `slideIndexes` and `sourceTemplateId`, the CLI's `.pptx` branch, `docs/import-pptx.md`.
5. Day 6: `theme-import.ts` listing every `themeN.xml` and writing `importedThemes` with the five cap, the Import theme dialog, the request to B6 for the panel's group; the nested group path arithmetic in `position.ts` and `freeform.ts` (outer segment on group, one level on ungroup, outermost first on selection) with the `Gestures.tsx` request; `ooxml/groups.ts` nesting by path with a two level test.
6. Day 7: the eight templates and `blank-plate` on `ts-plate` from B6's merge 1 seam, `templates.json`, the building blocks with their index, the Templates and Building blocks panes, the sidebar strip, the gallery page with the three headings and the strip's five cards, `template.list`, `template.slides`, `buildingBlock.list`, `buildingBlock.insert`, `deck.create --from`, `templates.spec.ts`, `import.spec.ts`, the producer inbox read.

### Acceptance

```
cd packages/import && ../../node_modules/.bin/vitest run
cd packages/schema && ../../node_modules/.bin/vitest run building-blocks position freeform
cd packages/export && ../../node_modules/.bin/vitest run ooxml/groups
cd packages/store && ../../node_modules/.bin/vitest run templates seed
node apps/cli/bin/turboslide.mjs import packages/import/src/__fixtures__/pptx/04-charts-motion-media.pptx --dry-run --json   # the report rows equal 04.report.json
node apps/cli/bin/turboslide.mjs import packages/import/src/__fixtures__/pptx/05-roundtrip.pptx --into rt && node apps/cli/bin/turboslide.mjs export decks/rt --mode native --out .turboslide/rt && node apps/cli/bin/turboslide.mjs import .turboslide/rt/*.pptx --into rt2 --dry-run --json   # no new rows
for t in decks/templates/*/; do node apps/cli/bin/turboslide.mjs validate "$t" && node apps/cli/bin/turboslide.mjs lint "$t" --json; done   # no finding above severity 1
node apps/cli/bin/turboslide.mjs export decks/templates/sales-pitch --mode native --out .turboslide/sp && node apps/cli/bin/turboslide.mjs export check .turboslide/sp   # bldP build="p" on the pricing rows, a:videoFile on the demo slide
PLAYWRIGHT_BASE_URL=http://localhost:4353 node_modules/.bin/playwright test apps/studio/e2e/import.spec.ts apps/studio/e2e/templates.spec.ts
```

Plus: every fixture slide renders through the render package with a non blank thumbnail; the oracle counts agree in the venv; the parity audit's Upload tab, Import slides, gallery and pane rows pass on 4353; `b3.md` records the kept, substituted and dropped counts per fixture and the worst position delta of the round trip.

## B4 Page, print, ODP, SVG, the shape interpreter and the card

Estimate: 106 agent hours. Dev server port 4354. The page sweep is days 1 to 2 and merges at merge 1; the rest from merge 1.

### Inputs

SPEC-5 sections 0 (0.30 to 0.33, 0.49), 1.4 (the page and baseline fields), 6 (every subsection), 11 (the card, the interpreter), 12.6, 13 (the page and export rows), 16.4, 16.7 (step 32); R08 (every section, part 1's table row by row); R09 (every section); R05 10 leg 2 and 11 (the ODP animation tree reads B1's schedule); SPEC-2 0.57; VERIFICATION-2 item 6; SPEC-4 0.48 and R02 section 7 of round four (the card); `docs/pptx.md`; `docs/freeform.md`.

### Owns

`packages/schema/src/{render,canvas}.ts` (the page derivations, `scaleCanvas`), `packages/schema/src/shapes.ts` and round four's `shapes/definitions.ts` reader `shapes/geometry.ts` (new; the interpreter), new `packages/schema/src/validate/page.ts`, `packages/theme/src/tokens.ts` (`grid(page)`; B6's per theme tokens live in `themes.ts`), `packages/theme/src/gt-ink-paper/stage.css`, `packages/render/src/{geometry,print,stage,slide}.ts` (the page, `--ts-sheet-w` and `--ts-sheet-h`, `stageFrame(id)` read from B6, `data-block` from B1's request, the theme stylesheet and `lang` from B6's and B5's requests), new `packages/render/src/print-layout.ts` and `print-layout.test.ts`, `packages/viewer/src/{Editor,Gestures,Sheet,Freeform,Selection,Marquee}.tsx` and `packages/viewer/src/{rulers-model,snap,canvas-measure,model}.ts` (the sheet literals, the level state by B3's request, the point handles of Edit points), `packages/chrome/src/{Rulers,Overlay}.tsx`, new `packages/chrome/src/dialogs/PageSetup.tsx`, `packages/chrome/src/dialogs/Download.tsx` (the ODP form, the SVG text mode, B1's three Web page controls by request), `apps/studio/src/routes/print.$deckId.tsx` and `print.css`, `packages/export/src/units.ts`, new `packages/export/src/export-odp.ts`, `packages/export/src/pptx/masters.ts` (the page; B6's record lines by request), `packages/export/src/pdf/build.ts`, `packages/export/src/verify/**` except `fixture.ts`, new `packages/export/src/odp/**`, new `packages/export/src/svg/**`, `packages/export/src/scene/measure.ts` (`baseline`), new `packages/export/src/check/{odf,svg}.ts`, `packages/headless/src/{context,document,measure,screenshot,sheet}.ts`, new `apps/studio/src/routes/og.deck.$deckId[.]png.ts`, the page and print handler modules, `decks/fixture/{page-4-3,page-16-10}/**`, `apps/studio/e2e/page-setup.spec.ts`, `docs/gslides-parity/build-5/b4.md`. Requests: the render path of the card in round four's `server/thumbs.ts` (integrator), the perf budget's 4 s card row and the `og:image` line on `deck.$deckId.tsx` (integrator), `line.set --points` in the actions header (integrator, day 0), `fontkit` in the catalog (integrator, after `pnpm audit`).

### Delivers

1. Days 1 to 2 (merge 1): `Deck.page` runtime, `deckPage`, `grid(page)`, `geometry(page)`, `pageEmu`, the stage's two custom properties, the 123 site sweep with no behaviour change (`tokens.test.ts` asserting `grid(DEFAULT_PAGE)` equals the legacy constants and `grid({1200, 900})` yields 926 by 642 with the chips at 66, 858 and 1074, 856), `scaleCanvas` with its tests, `compare-to-shoot` and `canvas-fidelity` reading `SHEET` from the deck, the `shapePath` seam behind the new signature, `decks/fixture/page-4-3` (about eight slides) and `page-16-10` (three).
2. Day 3: `deck.setPageSize` with the second step rule, the Page setup dialog with Google's four labels and OK, `deck.info.page`, the rulers and readouts from the page and `preferences.units`, `GUIDE_MAX`, the exports reading the page (`p:sldSz`, `TS_SHEET_<W>x<H>`, the 2W by 2H raster, the PDF page, the standalone properties, the thumbnails' aspect), the batch planner's area factor, `page-setup.spec.ts`.
3. Day 4: `printLayout` with the four tables of R08 4.5 pinned by `print-layout.test.ts`, `renderPrintDocument`'s layouts, paper, orientation, order and Hide background, the print route's seven rows, Orientation, the Paper dropdown, Include skipped slides, Hide background, Download as PDF, `export.run` for PDF with the five fields and the per cell gate, `HANDOUT_STUB` retired.
4. Day 5: the ODP writer's `package.ts`, `styles.ts`, `text.ts`, `notes.ts`, `build.ts`, `export-odp.ts` in both modes over the gslides fixture, `checkOdf` (`mimetype` first and stored, the manifest, the attribute names), the Download dialog's ODP row, `export.check --odp`.
5. Day 6: the shape interpreter (`shapes.test.ts` asserting the 135 paths against the definitions; `canvas-fidelity` and the Perfect gate green on the fixture decks), the ODP `shapes.ts`, `table.ts`, `chart.ts`, `media.ts` (over B2's `SceneMedia`) and `motion.ts` (over B1's schedule snapshot, the speed quantisation in `residual`), the path b oracle diff in the container leg handed to the integrator for step 25.
6. Day 7: the SVG writer with the three text modes, `SceneLine.baseline`, `render.slide --format svg --text`, the hosted render route's `svg` answer, `checkSvg`, the Chromium gate at 2x for `embed` and the `outline` measurement recorded, the Download dialog's SVG row and the Preferences read; the per deck card route with its access rule and cache keys; Edit points and Change shape on a path in `Gestures.tsx` writing `line.set --points`.

### Acceptance

```
cd packages/theme && ../../node_modules/.bin/vitest run tokens
cd packages/schema && ../../node_modules/.bin/vitest run canvas shapes validate/page render
cd packages/render && ../../node_modules/.bin/vitest run print-layout geometry print stage
cd packages/export && ../../node_modules/.bin/vitest run units odp svg check/odf check/svg pdf scene/measure
cd packages/viewer && ../../node_modules/.bin/vitest run rulers-model snap
PLAYWRIGHT_BASE_URL=http://localhost:4354 node_modules/.bin/playwright test apps/studio/e2e/page-setup.spec.ts
node apps/cli/bin/turboslide.mjs export decks/fixture/page-4-3 --mode flatten --out .turboslide/p43-flatten && node apps/cli/bin/turboslide.mjs export check .turboslide/p43-flatten --page 1200x900
node apps/cli/bin/turboslide.mjs export pdf decks/fixture/gslides --layout handout-6 --paper letter --orientation portrait --out .turboslide/handout   # pages equal to ceil(slides / 6), the per cell report under the fail line
node apps/cli/bin/turboslide.mjs export odp decks/fixture/gslides --mode native --out .turboslide/odp && node apps/cli/bin/turboslide.mjs export check .turboslide/odp
node apps/cli/bin/turboslide.mjs render slide <slideId> --deck decks/gt-brand --format svg --text embed --out .turboslide/slide.svg && node apps/cli/bin/turboslide.mjs export check .turboslide/slide.svg
node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005
node scripts/canvas-fidelity.mjs --max-mismatch 0.005 && node scripts/canvas-fidelity.mjs --deck decks/fixture/page-4-3 --max-mismatch 0.005
```

Plus: `slides` with `paper: 'slide'` is byte identical for a 16:9 deck after the print change; the GT deck's Perfect export bytes are unchanged after the interpreter (the GT deck uses `rect`, `roundRect` and `ellipse` only); `b4.md` records the 76, 12 and 35 site verdicts against R08 part 1's table, the ODP round trip's attribute names, and the SVG sizes per text mode on the brand deck's eight scenes.

## B5 Text tools, chat, help, accessibility and the remaining rows

Estimate: 97 agent hours. Dev server port 4355.

### Inputs

SPEC-5 sections 0 (0.34 to 0.42, 0.46), 7 (every subsection), 10, 12.6, 13 (the prefs, spelling, dictionary, accessibility, chat and version rows), 16.7 (step 35); R10 (every section); R02 d.3, d.4, d.5; R03 1 (the Later rows), 8 items 4 and 6; SPEC-3 0.45, 2.2, 5, 14, 17; SPEC-2 12 (the Format rows); P1 sections 5.5 to 5.13, 8; P3 sections 6.5 to 6.11, 9.

### Owns

New `packages/spelling/**` (`engine.ts`, `walk.ts`, `worker.ts`, `node.ts`, their tests, `package.json` by request), new `packages/schema/src/{autocorrect,autocorrect-lists,preferences}.ts` and their tests, `packages/identity/src/principal.ts` (the `preferences` field and its migration), `apps/studio/src/server/auth/principal.ts`, `packages/viewer/src/InlineText.tsx` (the trigger path), `packages/viewer/src/Guides.tsx` (the colours), `packages/chrome/src/{NotesPane,Palette,DeckGuides,TitleRow}.tsx` (the dictation box, the "Text in this presentation" group, the guides, Star and Join chat), new `packages/chrome/src/dialogs/{Preferences,PersonalDictionary,Language,Guides,IndentationOptions,ListOptions}.tsx`, `packages/chrome/src/dialogs/SpecialCharacters.tsx` and `special-characters-data.ts` (the drawing box and the stroke feature table), new `packages/chrome/src/panels/{SpellCheck,Chat,Dictionary}.tsx`, `packages/chrome/src/inspector/table.tsx` (the edge picker), `packages/export/src/pptx/{text,table}.ts` (`lang`, `marL`, `indent`, `startAt`, the prefix and suffix, the side borders), `packages/realtime/src/{protocol,admission}.ts` (the chat entry kind and its admission), `apps/studio/src/server/log.ts` (the chat line), new `apps/studio/src/routes/{help.training,help.updates}.tsx` and `api/define.ts`, new `docs/{training,updates}.md`, new `scripts/updates-from-model.mjs`, `apps/studio/public/dictionaries/**`, new `scripts/check-dictionaries.mjs`, new `packages/lint/src/static/spelling.ts`, the prefs, spelling, dictionary, accessibility, chat, version and remaining rows handler modules, `apps/studio/e2e/{text-tools,chat}.spec.ts`, `docs/gslides-parity/build-5/b5.md`. Requests: the Accessibility `Menu` with its `setting`, the eleven key rows and the `OMITTED_SHORTCUTS` changes (integrator, day 0), the `chatMessagesPerMinutePerDeck` quota rows in `ratelimit.ts` (B2), the `lang` attribute on the sheet root (B4's `slide.ts`), the `microphone=(self)` header (B2, landed day 3), the `/help` routes in the prerender list, `NOINDEX_ROUTES`' complement and the perf budget's route list (integrator), the Starred view's filter on `/decks` (round four's B3 file, integrator).

### Delivers

1. Day 1 (merge 1): the `Preferences` record with its defaults, the `localStorage` mirror, the one time migration of `spellcheck` and `announce`, `prefs.get` and `prefs.set` by JSON pointer, the seven dictionaries under `public/dictionaries/` with `check-dictionaries.mjs` under the gzip budget.
2. Day 3: the autocorrect engine and its lists with the undo rule in InlineText and the notes textarea, `text.autocorrect` with `--dry-run`, the Preferences dialog's two tabs and the Substitutions table, the SVG text row, `Deck.language` through `deck.set /language`, the File > Language submenu, the tag on the sheet, the HTML, the print route, `a:rPr lang` and `fo:language`.
3. Day 4: `packages/spelling` (nspell in the Worker and in Node, the walk with its skip rules), the spell check card with its four buttons and Add to dictionary, `Cmd+'` and `Cmd+;`, Underline errors through the CSS Custom Highlight API with the decorator fallback, the Personal dictionary dialog and `.turboslide/dictionary.txt`, `spelling.check`, `replace`, `ignore`, `dictionary.add`, `remove`, `list`, the `text/spelling` lint rule.
4. Day 5: Dictate speaker notes with the on device path and the privacy sentence, the Accessibility settings toggles, the Accessibility menu's rows over the live region and `speechSynthesis`, the braille names, `accessibility.verbalize`; the Dictionary panel over `/api/define` with the link fallback under `TURBOSLIDE_DICTIONARY=link`, `dictionary.lookup`; the tool finder's "Text in this presentation" group and the prefilled Find and replace row.
5. Day 6: chat (`kind: 'chat'` on the stream, the admission with the caps and the rate rows, the Chat panel with its first line, `chat.send`, `chat.list`, `chat.clear`, the log line, the kill switch), the help pages from `docs/training.md` and `docs/updates.md` with `updates-from-model.mjs`, both prerendered and indexable.
6. Day 7: the remaining rows (Edit guides with colours, Indentation options with the ruler markers by request to B4's `Rulers.tsx`, Restart numbering and Edit prefix and suffix with the PPTX `startAt` and scheme text, `version.delete` with the re authentication rule and the confirm, the cell border edge picker with `a:lnL` to `a:lnB`, Star with the Starred view), the special characters drawing box with the "Best guesses" label over the Math and Arrows features of B6's `EQUATION_SYMBOLS`, `text-tools.spec.ts`, `chat.spec.ts`.

### Acceptance

```
cd packages/spelling && ../../node_modules/.bin/vitest run
cd packages/schema && ../../node_modules/.bin/vitest run autocorrect preferences
cd packages/identity && ../../node_modules/.bin/vitest run principal
cd packages/realtime && ../../node_modules/.bin/vitest run protocol admission channel
cd packages/export && ../../node_modules/.bin/vitest run pptx/text pptx/table
cd packages/chrome && ../../node_modules/.bin/vitest run special-characters
node scripts/check-dictionaries.mjs
PLAYWRIGHT_BASE_URL=http://localhost:4355 node_modules/.bin/playwright test apps/studio/e2e/text-tools.spec.ts apps/studio/e2e/chat.spec.ts
node apps/cli/bin/turboslide.mjs spelling check --deck decks/fixture/gslides --json
node apps/cli/bin/turboslide.mjs prefs set /units cm && node apps/cli/bin/turboslide.mjs prefs get /units
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4355/help/training && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4355/help/updates
```

Plus: `lint --chrome` and the tooltip audit green on `/help/training`, `/help/updates` and the editor with the spell check card, the Chat panel and the Dictionary panel open; the copy lints on `docs/training.md` and `docs/updates.md` (no em dash, no exclamation, every number with a source line); `b5.md` records the dictionary sizes gzipped and the recognition of ten drawn glyphs by the drawing box.

## B6 Equation, theme, the second theme, dither families and the crate

Estimate: 100 agent hours. Dev server port 4356.

### Inputs

SPEC-5 sections 0 (0.28, 0.43 to 0.45, 0.49), 8, 9, 11 (the dither families, the crate patterns), 12.6, 13 (the equation, theme and layout rows), 16.7 (step 36); R06 (every section); R03 sections 2, 4, 5, 6, 8; R08 3c (the plate fraction); SPEC-4 1.1 to 1.3, 1.9, 0.38; SPEC-3 17 (the dither families); `docs/native.md`; P3 sections 7, 8; P1 sections 6, 7, 9.6 to 9.8.

### Owns

New `packages/schema/src/blocks/equation.ts` (the block, `GOOGLE_ALIASES`, `EQUATION_SYMBOLS`) and `packages/schema/src/blocks/dither.ts` (the patterns), new `packages/schema/src/validate/{equation,theme,layout}.ts`, new `packages/render/src/blocks/equation.ts`, new `packages/render/src/theme-css.ts` and `theme-css.test.ts`, `packages/render/src/theme-node.ts` (the math font, the override stylesheet), new `packages/export/src/ooxml/math.ts` and `math.test.ts`, new `packages/export/src/scene/equations.ts`, new `packages/export/src/check/equations.ts`, `packages/export/src/verify/fixture.ts` (the theme part per theme), `packages/export/src/ooxml/validate.ts` (the `m` and `a14` namespaces), `packages/theme/src/theme.ts`, new `packages/theme/src/themes.ts`, new `packages/theme/src/ts-plate/{sheet.css,stage.css}`, `packages/theme/src/gt-ink-paper/sheet.css` (the frame variables with today's values), `packages/chrome/src/ThemesPanel.tsx` (the three groups, Import theme's button over B3's dialog), new `packages/chrome/src/{ThemeToolbar,EquationToolbar}.tsx`, new `packages/chrome/src/inspector/equation.tsx`, `packages/chrome/src/inspector/dither.tsx` (the Pattern dropdown), new `apps/studio/src/editor/theme-mode.tsx`, `packages/effects/src/dither.ts` and `parity.test.ts` (the new patterns), new `crates/turboslide-native/src/dither.rs` and the two binds, `packages/native/**` (the outputs through the CI job), the equation and theme handler modules, `decks/fixture/equation/**`, `apps/studio/e2e/{theme,equation}.spec.ts`, `docs/gslides-parity/build-5/b6.md`. Requests: the `mode: 'theme'` state and the equation toolbar's slot in `controller.tsx` (integrator), the record's lines in `pptx/masters.ts` (B4), `Temml-Local.css` and the math font in the fonts build (integrator for the catalog, B6 for the files), the `native.yml` rebuild (integrator), the `Filmstrip` theme tile in the mode (B1's file, by request).

### Delivers

1. Day 1 (merge 1): `themeCss(deck)` emitting an empty sheet for an empty record and the frame variables in `sheet.css` with `tokens.test.ts` still pinning the base theme, `THEME_IDS`, `tokensFor(id)`, `sheetCss(id)`, `stageCss(id)`, `stageFrame(id)` (today's GT frame), `sheetRootAttributes` stamping `data-sheet`, the `theme`, `layout` and `equation` validator modules.
2. Day 3: the equation block's renderer over Temml with the scoped CSS and the lazy chunk, `GOOGLE_ALIASES`, `EQUATION_SYMBOLS` (handed to B5 for the drawing box), `equation.insert`, `equation.render`, `equation.symbols`, the equation toolbar with the six dropdowns replacing the text toolbar in place, the inspector's source field, `decks/fixture/equation`, the Temml snapshot per group.
3. Day 4: `ooxml/math.ts` with the MathML Core to OMML transform over the nineteen objects and the `mc:AlternateContent` wrapper with the PNG Fallback, `math.test.ts` against the hand written fixture, `ooxml/validate.ts`'s namespaces, `checkEquations`, `sceneEquations` with the 2x raster for the SVG and ODP writers, the math font inlined for decks with an equation, `equation.spec.ts`.
4. Day 5: the theme mode (the filmstrip's Theme and Layouts tiles, the toolbar's Background, Colors with Google's twelve names, Fonts, Insert placeholder, Rename, the X, the layout context rows, the custom layouts with placeholders and Apply layout over them), `theme.get`, `set`, `rename`, `reset`, the six `layout.*` actions, the Themes panel's three groups with `theme.applyImported` over B3's records, the Editable text theme part and masters from the record (the request to B4).
5. Day 6: `ts-plate` (the two stylesheets, the plates as fractions, the empty corner slot with the picture kind and the schema only `turboslide` kind, Inter 500 with the features), the second blank card's theme lines for B3's `blank-plate`, `tokens.test.ts` per theme, the export fixture's second `clrScheme`, `theme.spec.ts` (including Plate moving no object); the dither families in TypeScript (`floyd-steinberg`, `atkinson`, `halftone-dot`, `halftone-line`) with the Pattern dropdown and the 100 ms budget fallback.
6. Day 7: `dither.rs` with `bayer4`, `blue64`, `random`, `tone`, `steps`, `strength` and the four families behind the napi and wasm binds, the parity test at agreement 1.0 against the TypeScript stages, the `native.yml` request and the committed outputs with `BUILD-RECORD.json`, `b6.md` recording the sha256 per output.

### Acceptance

```
cd packages/schema && ../../node_modules/.bin/vitest run blocks/equation blocks/dither validate/equation validate/theme validate/layout
cd packages/render && ../../node_modules/.bin/vitest run theme-css blocks/equation theme-node
cd packages/theme && ../../node_modules/.bin/vitest run
cd packages/export && ../../node_modules/.bin/vitest run ooxml/math check/equations verify/fixture
cd packages/effects && TURBOSLIDE_NATIVE_REQUIRED=1 ../../node_modules/.bin/vitest run src/parity.test.ts src/dither.test.ts
PLAYWRIGHT_BASE_URL=http://localhost:4356 node_modules/.bin/playwright test apps/studio/e2e/theme.spec.ts apps/studio/e2e/equation.spec.ts
node apps/cli/bin/turboslide.mjs export decks/fixture/equation --mode native --out .turboslide/eq && node apps/cli/bin/turboslide.mjs export check .turboslide/eq   # the a14:m count equals the block count
node apps/cli/bin/turboslide.mjs equation render '\frac{a}{b}' --out mathml
node apps/cli/bin/turboslide.mjs theme set /colors/light/ink '#101010' --deck <scratch> && node apps/cli/bin/turboslide.mjs theme get --deck <scratch>
git diff --exit-code packages/chrome/src/tokens.css
```

Plus: `lint --chrome` unchanged because the override colours live inside the sheet; the equation chunk and Temml load only on the first equation block (the network log in `b6.md`); the Perfect export of the GT deck unchanged after the frame variables land; the parity audit's Insert > Equation, Edit theme and Themes panel rows pass on 4356.

## Integrator

Estimate: 74 agent hours.

### Owns

`packages/schema/src/{deck,blocks,assets,typography,export,validate,catalog,actions}.ts` and `blocks/table.ts` (day 0; afterwards by request), `packages/schema/src/reduce.ts` (the two `normalizeMotion` call sites), `packages/export/src/scene/types.ts`, `packages/export/src/check.ts` (the aggregator), `apps/cli/src/store-actions.ts` and `apps/studio/src/server/actions.ts` (the spread lines over the per lane handler modules), `apps/studio/src/editor/controller.tsx` (the mode and the window action table), `packages/chrome/src/menus/{model,strings,keys}.ts`, `packages/chrome/src/dialogs/Share.tsx` (B2's interim sentence and its removal), `apps/studio/src/components/home/HomeHero.tsx` and `packages/materials/src/mount.ts` (the hero gate), new `apps/studio/src/routes/api/{vitals,decks.$deckId.ws}.ts`, new `packages/realtime/src/client/ws.ts`, `apps/studio/src/routes/deck.$deckId.tsx` (the `og:image` line) and round four's `server/thumbs.ts` (B4's card render path), `.github/workflows/{check,lighthouse,native}.yml`, `scripts/{check,perf-budget,check-vercel-output,hosted-smoke,tooltip-audit,layout-shift-audit}.mjs` and new `scripts/vitals-report.mjs`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, every `package.json`, `packages/agent/generated/**` and the four skills' `references/` through `generate:contracts`, `AGENTS.md` (the round five sections), `docs/gslides-parity/{SPEC-5,MILESTONES-5,BUILD-STATUS-5}.md`, `docs/gslides-parity/build-5/integrator.md`, the merges, the preview deployments, the scratch deck cleanup after `--write` on a preview.

### Delivers

1. Day 0: `BASE` named; the line citation map; the day 0 seam of SPEC-5 1.6 in full; the catalog entries (`@xmldom/xmldom` 0.9.12, `temml` 0.13.5, `nspell` 2.1.5, `dictionary-en`, `-en-gb`, `-fr`, `-es`, `-pt`, `-pt-pt`, `-nl`, `fontkit` 2.0.4, `web-vitals`, each after `pnpm audit --prod --audit-level=high`); `pnpm install` once; `pnpm generate:contracts` once; check steps 32 to 36 as gated stubs; the `file.email` container question settled in `menu-model.test.ts`; AGENTS.md's round five sections (the day 0 seam pattern, the handler modules, the ports 4351 to 4357, the shared file rule, the check steps).
2. Day 2: merge 1 (B4's sweep, B1's schedule, B2's parsers, B3's package modules, B5's record, B6's `themeCss` and theme ids) with steps 1 to 6 green, the `/new` boot probe, `compare-to-shoot` at 0.5 percent and `canvas-fidelity` unchanged.
3. Days 3 to 7: the requests in `build-5/<key>.md` answered the same day; the window action rows in `controller.tsx` as each lane lands; the hero gate behind its five conditions with the second `perf-budget.mjs` measurement; `api/vitals.ts` with the sample and the rate limit, `vitals-report.mjs`, the INP row; `lighthouse.yml` against the node-server build; the cold first byte and function size gates; the WebSocket flag with the upgrade route on the node-server preset and the dev sidecar on 4322; the `native.yml` change for B6's crate patterns; the hosted smoke rows of SPEC-5 16.8; the tooltip audit and layout shift audit page lists.
4. Day 8: merge 2 in the order B4, B1, B2, B6, B3, B5; `pnpm check` 36 of 36 with `--list` at 36; the preview deployment (`vercel deploy --yes --archive=tgz` from the linked root); `node scripts/hosted-smoke.mjs --base <preview>` with the new rows; the perf run of 16.6 against the preview with `--write` once and the scratch deck removed; the Share dialog's interim sentence removed once B2's prefix is in.
5. Day 10: the ship step; `docs/updates.md`'s first entry; `BUILD-STATUS-5.md` with one heading per builder, what landed, what was cut, the open requests, the deviations recorded.

### Acceptance

`pnpm check` 36 of 36 on the merged tree; `pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'`; the `/new` boot probe after every merge; `git diff --exit-code packages/chrome/src/tokens.css` against `BASE` empty; the preview smoke green; the action count on `/home` and in `facts.json` read from the tree.

## Verifier

Estimate: 44 agent hours, day 0 and days 8 to 9. Dev server port 4357.

### Owns

`docs/gslides-parity/VERIFICATION-5.md`, `docs/gslides-parity/verification-5/**` (the baseline JSON, `import-fidelity.json`, the motion and media recordings, the scenario screenshots, the container logs, the PowerPoint checklist, the tab and dialog screenshots, the perf JSON per run, the hosted smoke tables, the SVG viewer results), `scripts/gslides-parity-audit.mjs` (the rows of SPEC-5 16.1), `.turboslide/inbox` (the producer files Kevin drops).

### Delivers

1. Day 0: the baseline of round four's production deploy (the parity audit output, `perf-budget.mjs --profile deployment --runs 3`, the layout shift audit, `check --list` at 31) under `verification-5/`.
2. Day 8: SPEC-5 16.1 to 16.6 on the merged tree (the node-server build) and on the preview: the parity audit exit 0 with the unverified labels listed, the chrome lint and the tooltip audit on the new pages and panels, the layout shift audit at zero on the nine routes and the new rows, the perf run with the deployment profile, the container legs of 16.4 with their logs, the motion walk in two browsers (the audience and the presenter through the preview), the import fidelity table over the five fixtures and the producer inbox, the SVG files opened in Chromium and, where available, in Inkscape and Figma, the PowerPoint manual checklist extended as 16.4 says, the seven scenarios S1 to S7 walked on the Sales pitch with a screenshot per step, the hosted smoke rows of 16.8.
3. Day 9: `VERIFICATION-5.md` in the shape of `VERIFICATION-3.md`: the 36 check steps with their numbers, every budget row against its ceiling with the baseline beside it, the fidelity table, the scenario results, the deviations recorded with their reasons, the blockers, the list of SPEC-5 16.9 with the round's reading of each, and the list for Kevin (SPEC-5 17) with the round's default per row.
4. After the ship: the production table appended.

### Acceptance

`VERIFICATION-5.md` names every miss with the builder who owns the file, every budget row against its ceiling with the run's date and URL, every deviation with its reason, every unverified Google fact with the reading taken; `verification-5/` holds the JSON, the screenshots, the recordings and the tables.

## Fixer round

Estimate: 30 agent hours, day 9.

The verifier's `VERIFICATION-5.md` lists every miss with the builder who owns the file. Each builder fixes only in their own files; the integrator merges in the same order as merge 2; the verifier reruns the parity audit, the layout shift audit, steps 32 to 36 and `pnpm check`. B3's remaining templates land here if the reader ran long. A miss that needs a design change (a LibreOffice fallback for `p14:flip` or `p14:gallery` that arrives as something other than a fade, a Google behaviour the fixture contradicts, a budget the arithmetic cannot reach, a codec the container's Chromium cannot decode) is written into `VERIFICATION-5.md` as a deviation with the reason and left for Kevin, and nobody patches around it; a budget row that fails only on the deployment profile and passes locally is recorded with both numbers and stays a failure until the fixer round closes it or Kevin accepts the ceiling. The fixer round ends when `pnpm check` is 36 of 36 and the deployment profile is green on the preview, or when the remaining misses are all recorded deviations.

## Ship step

Estimate: 8 agent hours, day 10.

1. `pnpm check` 36 of 36 on `gs5/integration` with `main` merged in; `git log` shows one commit per builder plus the integration commits; no conflict markers (`git grep -n '<<<<<<<'` empty); the fixtures (`decks/fixture/{motion,equation,page-4-3,page-16-10}`, `fixtures/media`, the five import fixtures with their expected documents), the templates with their indexes, the building blocks, the dictionaries, the native outputs with `BUILD-RECORD.json` and the generated contracts committed; `git diff --exit-code packages/chrome/src/tokens.css` against `BASE` empty.
2. A preview deployment of `gs5/integration`; `node scripts/hosted-smoke.mjs --base <preview>` green including the round five rows; the parity audit against the preview exit 0; `node scripts/perf-budget.mjs --base <preview> --profile deployment --runs 3` green on every asserted row; the layout shift audit at zero on the preview build; the container verification's motion, media, ODP and equation legs green.
3. Kevin's manual checks on the preview: the Sales pitch's pricing rows revealing one per click in the show and in PowerPoint's Animation Pane; the demo clip playing on the next click with the presenter console's row; Fade applied to all slides and visible in PowerPoint's Transitions gallery; Insert > Video with a YouTube link playing on `youtube-nocookie.com`; a `.pptx` of his own opened from the home page with the report sentence and Details; the 4:3 template through Page setup with the exports at 10 by 7.5 in; the 3 per page handout on Letter with note lines; the ODP opened in LibreOffice; the SVG opened in a browser and in Figma; Edit theme changing Text and background 1 with a picture in the corner slot and every slide following; the Plate theme moving no object; the equation opening as native math in PowerPoint; a chat message reaching a second browser and gone after both leave; the spell check card, Dictate speaker notes and the Accessibility menu; `/help/training` and `/help/updates`.
4. Merge to `main`, push, production deploy; `hosted-smoke.mjs` against production green; `perf-budget.mjs --profile deployment` against production without `--write`; the verifier appends the production table to `VERIFICATION-5.md`; the integrator writes `BUILD-STATUS-5.md` and appends `docs/updates.md`.
5. The README and the four skills' prose gain the round's rows through the generator and `facts.json`; no count is typed by hand.

## What ships in this round

- Motion: the Motion panel in Google's position with Google's controls, the eight transitions and fifteen animations, By paragraph, Apply to all slides, one schedule for the show, the presenter, the HTML autoplay export, the PPTX timing tree and the ODP animation tree; steps in present mode with Left arrow reversing; "Step k of n" and the next preview one step ahead in Presenter view; Auto-play, the pen and the in show downloads; the still rule with the Perfect export unchanged.
- Media: Insert > Audio and Insert > Video with Google's tabs and Format options sections, the sniffed and capped intake with presigned uploads, posters, the media controller, YouTube through the privacy enhanced host, the keyed prefix for media on restricted decks, native media in the Editable text PPTX and `draw:plugin` in the ODP, Camera, Speaker spotlight, Present on another screen.
- Templates: eight templates on the Plate theme led by the fifteen slide Sales pitch, Blank (Plate), the gallery page with Personal, Work and Education, the Templates and Building blocks panes with about thirty blocks in nine categories, File > New > From template gallery.
- Import: File > Open, the home page's Upload tab and File > Import slides accepting `.pptx` through one reader with the row based report, `adopt` and `keep`, `match` and `fit`, Import theme with "In this presentation", the five fixtures and the round trip gate.
- Page and print: Page setup with the height rule and every export following, handouts of 2, 3, 4, 6 and 9 and notes pages on Letter or A4, ODP in both modes, SVG of the current slide in three text modes, the shape interpreter drawing the 135 presets.
- Text tools: Preferences per principal with autocorrect and substitutions, spell check over nspell, File > Language, Dictate speaker notes, the Dictionary panel, the tool finder's deck text group, the Accessibility menu, Training and Updates, the remaining Later rows including the special characters drawing box.
- The equation block with Google Docs' toolbar and native OMML; Edit theme as a mode over a record with custom layouts; the Plate theme; chat inside the file.
- The deferred engineering: the live hero behind its gates, the per deck card, the 320 px twin variant, the deck index, field INP and Lighthouse CI, the crate's dither patterns, the error diffusion and halftone families, Reflection and Recolor, nested groups, the WebSocket flag.
- The agent surface: about fifty new actions with CLI, MCP, HTTP and window handlers, four new groups, the regenerated skills, OpenAPI and `llms.txt`; 36 check steps; the Later count at 2 with every Omit row naming its reason.

## What remains after the round

SPEC-5 section 17's table: the items that need Kevin's infrastructure or his call (the worker host, Redis, Postgres, Resend, the domain, the WAF in enforce mode, a stock picture provider, the YouTube Data API key, German and Italian dictionaries, the definitions provider, the Viewers tab, the Privacy Policy and Terms texts, Record, Make available offline, Q&A history, Captions) and the defaults he may reverse (Blank on Plate, the Turboslide mark toggle, the transition default, the presenter preview, the pixel unit, the paper default, the SVG text mode, the math font). Each is recorded in `docs/performance.md`, `docs/hosting.md` and `docs/updates.md` without naming a round on any product surface.

## Day 0 amendments

Recorded by the integrator on day 0 over the round four ship commit (`BASE`); the full list with its reasons is `docs/gslides-parity/build-5/integrator.md` section 3, and the orchestrator's rulings stand above SPEC-5 where they differ. Expected entries: the file names round four gave the editor split, the filmstrip, the home components and the shape definitions; whether `apps/cli/src/store-actions.ts` already splits handlers by area (the per lane modules map onto the existing split if so); whether `menu-model.test.ts` counts the `file.email` container (the Later count is 2 or 3 accordingly); the line citations of SPEC-5 remapped from `d5d7f07`; any round four file a round five lane needs that round four did not land, reassigned without changing which lane owns the behaviour.
