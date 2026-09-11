# M2 status

2026-09-11: the Google Slides exporter this document records was removed at Kevin's direction ("instead of exporting to google slides just make it perfect pptx"); the Slides lines below are history, and PPTX is documented in `docs/pptx.md`.

The state of Turboslide at the end of milestone 2 (the store, typed writes, MCP over stdio, flatten
PPTX with a verified report; `docs/spec/MILESTONES.md`, M2). Written by the integrator on
2026-09-10 after `pnpm check` and the rest of the M2 acceptance list ran once more, in order, on the
tree this commit carries, with the M2 review fixes applied. Every number below comes from that run
unless the sentence names an earlier measurement. `pnpm check` started at 19:37:13 local time and
passed all 19 steps in 145.4 s; the acceptance script for the remaining lines
(`.turboslide/m2-final/accept.sh`, steps 19 to 33 below) started at 19:39:53 and ended at
19:50:50 (657 s). Host: Node 24.13.0, pnpm 11.15.1, Chrome for Testing 147.0.7727.15
(`chromium-1217`) on ANGLE Metal, Apple M5 Max, Docker 29.6.2, Python 3.14.6 in `.turboslide/venv`,
the Prototemplate checkout at `/Users/kevinliu/repos/Prototemplate/deck`. Container:
`turboslide-render-worker` built from this tree (`node:24-trixie` on arm64, Node 24.21.0, Chromium
147.0.7727.0 on SwiftShader, LibreOffice 25.2.3.2, pdftocairo 25.03.0). The deck revision this tree
carries is 13. The evidence directory `.turboslide/m2-final/` (one log per step, `results.txt`, the
deck snapshots and version records of the write steps, the diff crops, `vitest.json`) is
git-ignored; the export reports and two diff images are copied to `docs/m2-evidence/`; this file
is the record.

## What shipped

Scope items are numbered as in the M2 section of the milestone plan. Test counts are from
`vitest run --reporter=json` on this tree (`.turboslide/m2-final/vitest.json`).

1. `@turboslide/store` (`packages/store/src/{store,file-store,versions,lease,watch}.ts`): the
   `DeckStore` type and `FileStore` over `decks/<id>`, the version log under `versions/`, advisory
   leases in `<deck>/.turboslide/` and the watch channel over `fs.watch`. Writes go through
   `applyWrite` under an exclusive lock file, touch only the slide files whose normalized value
   changed, append one version record per write and rewrite `deck.json` last; a stale
   `baseRevision` returns the current document with a 409. 17 tests in 3 files.
2. CLI typed writes: `slide put|patch|insert|remove|move`, `block set|insert|remove|move`,
   `sections set`, `version save|list|restore`, `lease`, `diff` (mutation log in prose plus
   `--render` with before and after crops), `fix`, all with `--base-revision`, `--author`,
   `--note`, `--force`, `--file` and `--json`, plus `export` and `fonts`. `store-actions.ts`
   registers every write as a typed function on the dispatcher so the CLI and the MCP server run
   one implementation. `apps/cli`: 3 test files, 25 passed, 1 skipped (the 50 s font rebuild
   behind `TURBOSLIDE_FONTS_CHECK=1`), plus `apps/cli/e2e/mcp-stdio.mjs`.
3. `@turboslide/mcp` and `turboslide mcp`: 25 tools derived from the ACTIONS table (every action
   whose transports include `mcp` and whose handler exists: `deck_get_info`, `deck_list_slides`,
   `deck_get_slide`, `deck_insert_slide`, `deck_remove_slide`, `deck_move_slide`,
   `deck_update_slide`, `deck_replace_slide`, `deck_update_block`, `deck_insert_block`,
   `deck_remove_block`, `deck_move_block`, `deck_set_sections`, `deck_lease_slide`, `deck_render`,
   `deck_sheet`, `deck_lint`, `deck_fix`, `deck_diff`, `deck_version_save`, `deck_version_list`,
   `deck_version_restore`, `deck_export`, `deck_build`, `deck_validate`), input and output JSON
   Schema from the Zod definitions, image content for `deck_render`, `deck_sheet` and `deck_diff`,
   the `deck://` resources of SPEC 7.3, the `deck_review` prompt with the six judge lenses, stdio
   transport with the console redirected to stderr. 30 tests in 4 files.
4. `@turboslide/export` (30 source files): scene extraction in headless Chromium
   (`scene/{measure,extract,two-tone,types}.ts`), PPTX through pptxgenjs 4.0.1 in flatten and
   native mode (`pptx/{build,masters,text,lines,images,notes,baseline,fonts-map}.ts`), the OOXML
   post-process (`ooxml/{kern,fonts,groups,zip,geometry}.ts`: kern strip, embedded font parts as
   EOT-wrapped `.fntdata`, `grpSp` rows, stored media), the verify loop
   (`verify/{libreoffice,diff,geometry,reference,budgets,fixture,report}.ts`: LibreOffice to PDF,
   pdftocairo to PNG, pixelmatch, per-block ink boxes, EMU read-back), the calibration deck and
   `calibration.json`, the typed `ExportReport`. 48 tests in 7 files.
5. `@turboslide/fonts/export`: 17 static TTFs cut by `scripts/build-fonts.py` (fontTools
   instancer; `cv11` and `ss01` frozen into the display face), 15 of them named `GT Inter`,
   `fonts.json` with the license check, `turboslide fonts build [--check]`, the venv under
   `.turboslide/venv` from `scripts/requirements.txt`. 6 tests.
6. `apps/render-worker` (10 source files, 4 tests) and `docker/render-worker.Dockerfile`: a
   sequential job queue (`render`, `sheet`, `export`, `verify`) over the CLI as child processes,
   an HTTP surface on 4322, a content-addressed render cache, and the studio facade routes
   `/api/render/:slideId` and `/api/export/:deckId` through `@turboslide/render-worker/client`.
7. The `export/non-native` lint rule (one severity 1 finding per slide naming raster blocks and
   native blocks with raster parts), the `--exclude-share-alike` flag, and
   `docs/export-verification.md` with the manual PowerPoint checklist.

Also in the tree: the importer writes the normalized document, and a re-import that changes
nothing is a no-op (this run's step 7 changed no file in `decks/gt-brand`, not even `importedAt`;
the M1 wart is closed); `packages/schema` gained `export.ts` `NATIVE_BLOCK_TYPES`, the
`fonts.build` action, optional `value` on the set mutations, the `export.run` inputs
`excludeShareAlike`, `slideIds` and `baseline`, and the `sheet`, `pictures`, `theme` and verify
`scale`, `pictureMismatch`, `pictureFraction` fields of the export report; `scripts/check.mjs`
gained `pnpm format:check` as step 19; `.dockerignore` for the image's build context. The root
vitest run is 52 files, 509 tests passing and 2 skipped.

## Decisions taken as the spec's defaults

Kevin has not answered these; the spec's default was taken and is recorded here.

1. Storage is files in the repository with git: `FileStore` over `decks/<id>`. Every committed
   write appends `versions/<n>.json` (the `Version`, its `baseRevision` and the inverse mutations);
   `version save -m` appends an entry with an empty mutation list and the note. No snapshots are
   stored: `documentAt(n)` rebuilds from the current document through the inverses of later
   entries and refuses with a clear message when the log does not reach the current revision (an
   import or a hand edit in between). `version restore <n>` is a write carrying
   `[{ op: 'version.restore', n }]` and is undoable through its own inverse.
2. `diff --staged` (also the default with no revisions) diffs from the newest named version below
   the current revision, or from where the log starts, to the current revision, so a save at the
   current revision followed by `diff --staged --render` shows what the save captured (the
   acceptance sequence). The range is printed on every run.
3. Leases are advisory (SPEC 6.7; M4 enforces): `FileStore` takes `leases: 'advisory' | 'enforce'`,
   a write to a slide another author leased goes through under advisory and the CLI warns on
   stderr; `--force` skips the check. Lease records live in `<deck>/.turboslide/leases.json`,
   already ignored by the repository's `.turboslide` pattern.
4. Flatten is the CLI's default export mode and the verified default; native mode ships text for
   `heading`, `paragraph`, `credit`, `rows`, `plain` and `panel` (`NATIVE_BLOCK_TYPES`, the
   archetypes the pptx report measured) plus lines and rects; everything else is a 2x raster in
   native mode and recoverable only through the invisible text layer in flatten.
5. The export font set is the exact set: per-size Inter instances renamed `GT Inter Display`,
   `GT Inter Text 14` to `26` and their Medium faces, plus `Inter` and `Inter Medium` for
   `--fonts standard`. The Reserved Font Name check came back empty (the "Fonts" section below),
   so the `GT Inter` prefix stands.
6. Google Slides export waits for M6; `turboslide export gslides` answers with a usage error naming
   it.
7. Flatten verification compares at the raster's own scale. SPEC 8.5 states the 0.1 percent gate
   against the Playwright reference without a scale; a flatten page carries a 2x sheet raster, and
   the first container run at 1x (the first integration pass, earlier on 2026-09-10) failed 156 of
   170 pages: 0.1 to 0.4 percent on text slides from the rasterizer's downsample alone, with every
   glyph edge fringed in the diff images. The verifier rasterizes flatten PDFs at 3200 by 1800 and
   renders the reference with `--scale 2` (`FLATTEN_REFERENCE_SCALE`); native stays at 1x, where
   the block budgets are stated.
8. Regenerated two-tone pictures have their own reference. The exporter swaps the deck's 1x twin
   for a dither regenerated at 2x from the one-bit image (SPEC 8.2), which the browser at 2x shows
   as a bilinear upscale of the 1x twin: 19 percent of the opener's pixels and 6.8 percent of a
   mood slide's differ between the two, and no gate can pass on that comparison. Inside the
   picture's box the page is gated on the 2x sheet shot it embeds (named per slide in the report's
   `sheet` and `pictures`), outside it on the 2x render, both at 0.1 percent, both fractions in the
   report (`fraction`, `pictureFraction`). Cell exactness of the dither against the one-bit source
   is the M5 parity test (SPEC 9).
9. Native text boxes are moved up by LibreOffice's first-baseline offset. The first container run
   put 26 of the 27 all-native slides out of the 1 px vertical budget with the pattern the
   calibration deck had predicted: paragraphs 3 to 4 px low, credits 2 px low, display headings 2
   to 4 px high, `dx` 0, `dw` within 1. Chromium centres the leading around the glyphs and
   LibreOffice puts the whole leading above the baseline, so the offset is
   `pitch / 2 - k(size) * size` with k measured per size on the deck (0.555 at 88 px to 0.592 at
   15 px; the pure Inter metric 0.605 drifts by 4 px at 88). `pptx/baseline.ts` reads the anchors
   from `calibration.json` (`firstBaselineModel`) and applies the shift in both modes;
   `--baseline-target none` writes the browser's coordinates for the PowerPoint pass. The flag is
   not `--baseline` because `lint --baseline` is an existing switch.
10. The lint rule `export/non-native` counts native blocks with raster parts (icons, the GT mark)
    as well as raster blocks, so the deck's finding count moved from 115 to 122 (the rule fires on
    65 slides instead of 58); `content-rule` trips it through its icons, which the acceptance
    line requires.
11. The importer writes the normalized form (layout defaults filled, keys in schema order). The
    first `pnpm check` on the M2 tree rewrote `deck.json` (asset key order) and 65 slide files
    once, revision 12 to 13; the pixels are unchanged (step 12 reproduces the M1 numbers exactly)
    and every later import, including this run's step 7, is a byte-for-byte no-op. This commit
    carries revision 13 and the normalized files.
12. The flatten cover picture carries LibreOffice's picture-shape offset. With the comparison at
    2x and no offset, 169 of 170 pages passed and `skills-marks` light missed at 0.120 percent;
    its sheet shot matched the 2x render exactly inside the container, so the residual was the
    LibreOffice path. A page background fill reproduced the same sheet with 0 mismatched pixels
    while a full-page picture shape gave 6,916, hand-written or through pptxgenjs alike; QuickLook
    draws the alpha-0 text over a background fill (alpha 0, `a:noFill`, a hidden cover and a
    transparent cover all showed the text in `qlmanage` thumbnails), so the cover stays a picture,
    moved down by 0.01 mm (360 EMU) where LibreOffice paints it exactly (0 mismatched pixels on
    four sheets, 32,114 at -0.01 mm, 5 at +0.02 mm) and shortened by the same amount so it ends on
    the page edge. Recorded in `calibration.json` under `pictureShapeOffset`.
13. The studio's Vite configs externalize `sharp` (`externalSharp()` in `vite.config.ts` and
    `vite.deploy.config.ts`): the SSR build reaches `@turboslide/effects/io` through the worker
    client's local verify job, and the tsconfig `paths` alias the effects, export and cli packages
    need for sharp's types sent rolldown into `lib/index.d.ts` (`MISSING_EXPORT "default"`). The
    import resolves from the workspace root at runtime; a Vercel deploy that ever runs a verify job
    in process needs sharp as a studio dependency with the Linux binary, which is M6 publishing
    work.
14. The recovered specification documents are prettier-formatted. `pnpm format:check` is an
    acceptance step and `.prettierignore` does not exclude `docs/spec/`, so the integrator's one
    `pnpm format` reformatted `docs/spec/SPEC.md` and the three experiment reports along with 31
    source and doc files: fenced TypeScript and JSON blocks re-indented and table columns padded
    (`git diff -w` shows the code blocks; no sentence changed). Excluding `docs/spec/` from
    prettier instead is a one-line change if Kevin wants the recovered text byte-identical.

## Acceptance

The M2 acceptance list of the milestone plan, run in order from the repository root: `pnpm check`
(the 18 M1 steps plus the format gate as step 19), then the remaining 15 lines as steps 19 to 33.
The generated contract files were staged before the run, as in M1, so step 3 compares the
generator's output with what this commit carries. After steps 21 to 26 the deck was restored from
the snapshot taken before them (`.turboslide/m2-final/deck-before-writes`, verified identical with
`diff -rq`), so the committed deck stays at revision 13 with no `versions/` directory and the
acceptance's `size: 22` never lands in the brand deck; the two container exports therefore
describe the committed deck at revision 13, not the revision 14 the writes produced. The evidence
of the writes is under `.turboslide/m2-final/` (`step-2x.log`, `version-list.json`,
`lint-content-rule.json`, `deck-after-writes/versions/{1,2}.json`, `diff/`).

| Step | Command (abridged)                                                                                                 | Result        | Measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm install --frozen-lockfile`                                                                                   | pass          | 21 workspace projects (17 in M1), already up to date, 0.3 s; the lockfile gained 949 lines for store, mcp, export, render-worker, pptxgenjs, jszip and the MCP SDK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2    | `pnpm exec tsr generate`                                                                                           | pass          | 0.6 s; picks up `api/render.$slideId.ts` and `api/export.$deckId.ts`; the M1 `replaceRouteChunk` warning from `@tanstack/router-cli`, exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3    | tracked check, `pnpm generate:contracts`, `git diff --exit-code`                                                   | pass          | 10 files current, no diff, 0.8 s: `cli.json` 32.4 KB, `mcp-tools.json` 364.5 KB, `describe.json` 12.5 KB, `openapi.json` 331.0 KB, `manifest.json` 4.4 KB, `docs/grammar.md` 53.2 KB, the four skill tables (`actions.md` 21.1 KB, `grammar.md` 53.2 KB, `browser-api.md` 13.7 KB, `verification.md` 28.2 KB)                                                                                                                                                                                                                                                                                                                                         |
| 4    | `pnpm exec tsc -b`                                                                                                 | pass          | 2.1 s over the 17 referenced projects, including `packages/store`, `packages/mcp`, `packages/export` and `apps/render-worker`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5    | `pnpm test`                                                                                                        | pass          | 52 files, 509 passed, 2 skipped, 7.54 s in vitest 4.1.11 (M1: 33 files, 386 passed, 1 skipped)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6    | `pnpm build && check-client-bundle.mjs`                                                                            | pass          | 2 turbo tasks in 1.7 s (`cli` 102.17 kB through tsdown; studio client 207 modules, SSR 412 modules); marker in 0 of 14 client files and 1 of 18 server files; 2.2 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7    | `turboslide import … --into gt-brand --json`                                                                       | pass          | 85 slides, 8 sections, 4 html escape blocks, 114 assets, 0.8 s; no file under `decks/gt-brand` changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8    | import assertion                                                                                                   | pass          | `slides` 85, `sections` 8, `htmlBlocks` 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9    | `turboslide validate decks/gt-brand`                                                                               | pass          | 85 slides, 0 errors, 43 warnings (every one an `ext` kept notice), 0.7 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 10   | `turboslide render all --theme light,dark --scale 1`                                                               | pass          | 170 PNGs and records in 17.8 s (M1: 49.7 s); renderer `Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11   | render assertion                                                                                                   | pass          | 170 records at revision 13, 0 page errors (also 0 console errors, 0 overflow entries, fonts `loaded` in every record)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12   | `compare-to-shoot.mjs --max-mismatch 0.005 --skip-html-escapes`                                                    | pass          | 170 pairs compared, 8 skipped as escapes, 0 over budget; worst non-escape 0.332 percent (`gem-smoke`), mean 0.011 percent, the M1 numbers exactly; 54.3 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13   | `turboslide sheet all --cols 4 --thumb 480 --numbered`                                                             | pass          | two sheets of 2056 by 8396 px, 85 cells and 8 section labels each, 3.6 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 14   | sheet assertion                                                                                                    | pass          | both PNGs exist, both JSON cell maps have 85 cells                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 15   | `turboslide lint all --json`                                                                                       | pass          | 122 findings: 2 at severity 3 (2 known, 0 blocking), 28 at 2, 92 at 1; 170 render records read; 0.8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 16   | `turboslide build --out … --budget 16`                                                                             | pass          | 14.53 MiB of 16.00 MiB, 85 slides, revision 13; native 32 twins 1.89 MiB, resample-1280 81 twins 5.82 MiB, pass-through 54 twins 1.99 MiB; 2.7 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 17   | `playwright test apps/studio/e2e/viewer.spec.ts`                                                                   | pass          | 6 passed in 8.4 s, one worker, against the dev server the runner started on 4321                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 18   | `turboslide lint --chrome --widths 1440,1280,390 --themes light,dark`                                              | pass          | 24 audits over 3 widths and 2 themes, 0 with findings, 0 states unapplied; 31.6 s; the runner stopped the server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 19   | `pnpm format:check` (in `pnpm check`) and `docker build -f docker/render-worker.Dockerfile`                        | pass          | format: every matched file clean, 3.2 s. Image: 49 s with the apt, Chromium and install layers cached, image `61dc640e61a7`, 4.34 GB; `soffice --version` 25.2.3.2, pdftocairo 25.03.0, Chromium 147.0.7727.0                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 20   | `docker run … fc-list \| grep -c "GT Inter"`                                                                       | pass          | 15 (12 or more required)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 21   | `slide get content-rule --json > .turboslide/slide.json`                                                           | pass          | `{ slide, n: 53, section: blog-and-content, assets: [], render: 2 records }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 22   | `block set content-rule#list /size 22 --base-revision 13 --author agent:m2-accept --json`                          | pass          | revision 13 to 14 in 1 s; 1 finding (`export/non-native`, severity 1: "Native text with raster parts: list (icons and mark)"); `versions/1.json` at revision 14, `baseRevision` 13, authored `{ kind: agent, name: agent, runId: m2-accept }`, 1 mutation, 1 inverse                                                                                                                                                                                                                                                                                                                                                                                  |
| 23   | `block set … /size 24 --base-revision 0 --json; test $? -eq 1`                                                     | pass          | exit 1; stdout `{ error: "ConflictError", status: 409, message: "baseRevision 0 is stale; the document is at revision 14", currentRevision: 14, current: <the document> }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 24   | `version save -m "m2 acceptance" --json && version list --json \| node -e …`                                       | pass          | two entries: n 1 at revision 14 by `agent:m2-accept` (1 mutation, `block.set`), n 2 at revision 14 by `kevinliu` (human, the OS user) with the note and 0 mutations; the assertion found the agent author                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 25   | `diff --staged --render --out .turboslide/diff --json`                                                             | pass          | range 13 to 14, 1 mutation, prose "slide content-rule: block list /size changed to 22", `before/` and `after/` at 1600 by 900, one crop pair `crops/content-rule-list-light-{before,after}.png` at 627 by 336 (the list block), `diff.json` beside them; 2 s                                                                                                                                                                                                                                                                                                                                                                                          |
| 26   | `lint content-rule --json \| node -e …`                                                                            | pass          | 1 finding, `export/non-native` severity 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 27   | `node apps/cli/e2e/mcp-stdio.mjs`                                                                                  | pass          | 18 steps in 5 s: 25 tools listed (`deck_export` among them), a slide inserted, rendered (2 image contents, renderer Chrome for Testing 147.0.7727.15), `copy/heading-period` received, patched with `deck_update_block`, a stale `baseRevision` refused with 409, re-lint clean, version saved with the agent author, log listed, resources and the `deck_review` prompt read; then the calibration deck exported through `deck_export` (flatten, light, verify false: 1 file, 5 slides, passed true, 9 fonts embedded) and a `verify: true` request refused with an error naming `turboslide-render-worker` because `soffice` is not on this machine |
| 28   | `docker run … export pptx --mode flatten --theme light,dark --verify`                                              | pass          | 448 s wall (446.5 s reported: extraction and build of 85 slides in two themes, two LibreOffice conversions, 170 reference renders at 2x on SwiftShader, 170 diffs at 3200 by 1800; verification alone 165.5 s); `gt-brand-light.pptx` 40.75 MiB, `gt-brand-dark.pptx` 42.42 MiB, revision 13, 13 GT Inter faces embedded, Menlo required on the viewer, 753 shapes per file, 0 `custGeom`, 0 `normAutofit`, geometry in bounds, `passed` true, exit 0                                                                                                                                                                                                 |
| 29   | flatten report assertion                                                                                           | pass          | `passed` true, `geometryInBounds` true, 170 entries each naming its theme, 0 of 170 pages over 0.1 percent; 164 pages at exactly 0; worst `opener-developer-experience` light 0.050, `opener-blog` light 0.036, `opener-blog` dark 0.012, `closing` 0.007 in both themes, `opener-developer-experience` dark 0.006; the 30 pages with a regenerated two-tone picture verified against their sheet shot at most 0.055 percent (`mood-lighthouse`, both themes)                                                                                                                                                                                         |
| 30   | `docker run … export pptx --mode native --theme light --verify`                                                    | exit 1        | 120 s wall (119.5 s reported; verification 35.5 s): `gt-brand-light.pptx` 27.95 MiB, 85 slides, revision 13, 11 GT Inter faces embedded, Menlo required on the viewer, 1090 shapes, 0 `custGeom`, 0 `normAutofit`, geometry in bounds; `passed` false because two gated blocks are out of budget (step 31), and the CLI exits 1 on a report that did not pass                                                                                                                                                                                                                                                                                         |
| 31   | native report assertion                                                                                            | fail          | exit 1 naming `avoid` and `surfaces`. 27 all-native slides, 79 text blocks gated: 77 within budget, 2 not: `avoid#p1` dw +4 (ink 420 px wide in LibreOffice against 416 in Chromium, budget 3) and `surfaces#rows` dw -6 with dy +1 (841 against 847 px). Over the 79: `dx` 0 on 76, +1 on 1, -1 on 2; `dy` 0 on 70, +1 on 8, -1 on 1; `dw` 0 on 50, +1 on 4, -1 on 23, +4 on 1, -6 on 1. The 58 slides with raster blocks are listed, not gated (210 blocks: 153 text, 19 line, 38 raster; 5 out of budget: `audience#p1` dw +4, `mark#mark` dx +1 dw -2, `lines#dia1` dx +1 dy +1 dw -2, `motion#dia1` dy +2, `build-log#p1` dy +2)                 |
| 32   | `turboslide fonts build --check && .turboslide/venv/bin/python3 -c "from pptx import Presentation; …"` (85 slides) | pass          | `fonts build --check` through `.turboslide/venv/bin/python`: 0 stale files at version 4.001+gt.1 (the venv existed; the command creates it from `scripts/requirements.txt` when it is missing); python-pptx 1.0.2 on Python 3.14.6 opens `gt-brand-light.pptx` with 85 slides; 25 s                                                                                                                                                                                                                                                                                                                                                                   |
| 33   | `pnpm format:check`                                                                                                | pass (re-run) | the runner's step 33 exited 1 on one file, `docs/M2-STATUS.md`, which was being rewritten during the run; after the document was formatted, `pnpm format:check` was run again and every matched file is clean (step 19 of `pnpm check` had passed the same check on the rest of the tree at 19:39)                                                                                                                                                                                                                                                                                                                                                    |

### Render records

170 records at revision 13, all on the same renderer string. Readiness wait p50 10 ms, p95 19 ms,
max 37 ms; screenshot p50 40 ms, p95 102 ms, max 146 ms (M1: p50 99 ms, p95 282 ms). 448 raster
references in total. No record carries a page error, a console error or an overflow entry.

## Export

Fidelity as measured by the verify loop of this run, per mode and theme, against the Turboslide
render of the same slide, theme and revision (SPEC 8.5; the method and its deviations are in
`docs/export-verification.md`). Both runs used the image built in step 19 and the committed deck
at revision 13. The pages were converted by LibreOffice 25.2.3.2 520(Build:2) and rasterized by
pdftocairo 25.03.0; the references were rendered inside the container by Chrome for Testing
147.0.7727.0 on SwiftShader.

### Flatten, light

85 pages at 3200 by 1800 against the 2x render. 0 pages over the 0.1 percent budget; 82 pages at
exactly 0 mismatched pixels; mean 0.0011 percent. The worst pages: `opener-developer-experience`
0.050 percent, `opener-blog` 0.036 percent, `closing` 0.007 percent; every other page 0.000. The
15 pages with a regenerated two-tone picture were compared inside the picture with the embedded 2x
sheet shot: worst `mood-lighthouse` 0.055 percent, `mood-dictionary` 0.053 percent, `mood-wave`
0.030 percent. Ink boxes: 289 blocks (232 text, 19 line, 38 raster), 0 out of budget, `dy` 0 and
`dw` 0 on all 289. Geometry read-back in bounds: 753 shapes, 0 `custGeom`, 0 `normAutofit`, 13
embedded fonts. Verify time for the file 112.9 s (conversion, rasterization, 85 reference renders
at 2x, 85 diffs). `gt-brand-light.pptx` 40.75 MiB.

### Flatten, dark

85 pages at 3200 by 1800 against the 2x render. 0 pages over the 0.1 percent budget; 82 pages at
exactly 0 mismatched pixels; mean 0.0003 percent. The worst pages: `opener-blog` 0.012 percent,
`closing` 0.007 percent, `opener-developer-experience` 0.006 percent; every other page 0.000. The
15 regenerated two-tone pictures: worst `mood-lighthouse` 0.055 percent, `mood-dictionary` 0.053
percent, `mood-wave` 0.030 percent, the same three as in light (the sheet shot and the page carry
the same dither in both themes). Ink boxes: 289 blocks, 0 out of budget, `dx`, `dy` and `dw` 0 on
all 289. Geometry read-back in bounds: 753 shapes, 0 `custGeom`, 0 `normAutofit`, 13 embedded
fonts. `gt-brand-dark.pptx` 42.42 MiB. The merged report (`export-report.json`) carries the 170
entries with their `theme`, `passed` true and `geometryInBounds` true; `skills-marks`, the page
that carried the 0.120 percent cover residual before decision 12, is at 0 mismatched pixels in
both themes.

### Native, light

85 pages at 1600 by 900 against the 1x render. The gate is the per-block budget on the 27 slides
whose blocks are all native-capable (text within 3 px horizontally and 1 px vertically, lines and
rasters within 1 px); the 58 slides with raster blocks are listed with their deltas and not gated.
Result: `passed` false. Of the 79 gated text blocks, 77 are within budget and 2 are not: `avoid#p1`
is 4 px wider in LibreOffice than in Chromium (ink 420 against 416 px, budget 3) and
`surfaces#rows` is 6 px narrower (841 against 847 px) and 1 px low. Distribution over the 79:
`dx` 0 on 76, +1 on 1, -1 on 2; `dy` 0 on 70, +1 on 8, -1 on 1; `dw` 0 on 50, +1 on 4, -1 on 23,
+4 and -6 once each. The vertical budget holds on every gated block, which is the first-baseline
shift (decision 9) at work: the 88 px title heading measures dy +1, dw 0
(`docs/m2-evidence/native-light-02-title.diff.png`). On the 58 listed slides, 210 blocks (153
text, 19 line, 38 raster) measure 5 out of budget: `audience#p1` dw +4, `mark#mark` dx +1 dw -2,
`lines#dia1` dx +1 dy +1 dw -2, `motion#dia1` dy +2, `build-log#p1` dy +2. Ink was measured with
the review's cut on 254 of the 289 blocks and with the fixed 40-unit edge on the other 35 (opaque
pictures and blocks below the contrast floor); 20 blocks were clamped to their own box because a
neighbour overlaps the ring; 50 blocks have a shape read back from the file. Whole-page mismatch
at 1x is informational in native mode (mean 0.77 percent; worst `off-the-site` 2.92 percent on a
slide with a raster pair; the all-native worst is `surfaces` at 1.02 percent): LibreOffice and
Chromium antialias every glyph edge differently, which is why this mode is gated per block and
not per page. Geometry read-back in bounds: 1090 shapes, 0 `custGeom`, 0 `normAutofit`, 11
embedded fonts. `gt-brand-light.pptx` 27.95 MiB; export 119.5 s, of which verification 35.5 s.
The two failing blocks are listed under "Blockers"; their diff images are
`docs/m2-evidence/native-light-30-avoid.diff.png` and
`docs/m2-evidence/native-light-32-surfaces.diff.png`.

### Report facts common to both runs

The GT Inter faces are embedded as EOT-wrapped `.fntdata` parts (13 in flatten: `GT Inter
Display`, `GT Inter Text 14`, `15`, `15 Medium`, `18`, `18 Medium`, `20`, `20 Medium`, `22`,
`22 Medium`, `24 Medium`, `26`, `26 Medium`; 11 in native). Menlo is listed under
`fonts.requiredOnViewer` for the code panels (SPEC 8.6) and `fonts.substitutedIn` names Keynote,
PowerPoint for the web and Google Slides. The residual carries the renderer string, the mode line
("the slide is a 2x raster of the sheet; text is an invisible native layer" for flatten), the
fonts line and the two `verify:` lines per file. File hashes are in the reports (`files[].sha256`).

Evidence: `docs/m2-evidence/export-report-flatten.json` (the merged flatten report, 170 slide
entries with `theme` and `verify`), `docs/m2-evidence/export-report-native-light.json`,
`docs/m2-evidence/flatten-light-63-skills-marks.diff.png` (the 2x diff of the page that carried
the cover residual before decision 12) and `docs/m2-evidence/native-light-02-title.diff.png` (the
88 px title heading after the baseline shift), `docs/m2-evidence/native-light-30-avoid.diff.png`
and `docs/m2-evidence/native-light-32-surfaces.diff.png` (the two blocks the native gate names),
all from this run. The complete runs, with the
pages, references, diffs and `verify-summary.json`, are under `.turboslide/export` and
`.turboslide/export-native`; the first integration pass's runs and its QuickLook and LibreOffice
experiments (`qltest/`, `pictest/`, `offtest/`, `offtest2/`, `bgtest/`) are under
`.turboslide/m2/` and `.turboslide/m2-prev/`.

## Fonts

The decision (SPEC 8.4, open question 5) was taken as the spec's default: per-size Inter
instances renamed with the `GT Inter` prefix, on the condition that Inter's license declares no
Reserved Font Name. The check, made before the set was accepted:

- `packages/fonts` carries no `LICENSE.txt` of its own; the Inter license text in this repository
  is the SIL Open Font License 1.1 block in `THIRD_PARTY_NOTICES.md` (section "Inter"), which
  states no Reserved Font Name. Upstream, `https://github.com/rsms/inter/blob/master/LICENSE.txt`
  opens with the copyright line and the sentence "This Font Software is licensed under the SIL
  Open Font License, Version 1.1" and no "with Reserved Font Name" clause (read on 2026-09-10).
- The source font's name table (`packages/fonts/assets/InterVariable.woff2`, version
  `4.001;git-9221beed3`, read with fontTools 4.65.0 from `.turboslide/venv`): name ID 0
  "Copyright 2016 The Inter Project Authors", ID 13 the OFL statement with no Reserved Font Name,
  ID 14 `http://scripts.sil.org/OFL`, `fsType` 0 (installable embedding). `scripts/build-fonts.py`
  makes the same check and records it in `fonts.json` under `license` (`reservedFontName: null`,
  `checked: name 0, 7, 13, 14, THIRD_PARTY_NOTICES.md`); it refuses to rename if a later release
  declares one.
- Name ID 7 is a trademark notice: "Inter UI and Inter is a trademark of rsms." A trademark notice
  is separate from the OFL's Reserved Font Name mechanism and does not restrict renamed derivatives
  under the OFL; whether the shipped family names should carry the word Inter at all is a naming
  question for Kevin (listed under "Open items").

Result: no Reserved Font Name is declared, so the renamed instances are permitted under OFL 1.1
condition 3 and the `GT Inter` prefix stands. The set is 17 faces: `GT Inter Display` (opsz 32,
weight 500, `cv11` and `ss01` frozen), `GT Inter Text <size>` and `GT Inter Text <size> Medium`
for 26, 24, 22, 20, 18, 15 and 14 (opsz at the size), and `Inter` and `Inter Medium` (opsz 14)
for `--fonts standard`; `fonts.json` version `4.001+gt.1`. `turboslide fonts build --check`
rebuilt the set in step 32 and reported it current, so the committed files are reproducible from
the source font and the script.

## Known findings baseline

`decks/gt-brand/known-findings.json` is unchanged from M1: the two severity 3 findings inside the
html escape blocks of `fixed-points` (`icon/known`) and `goals` (`type/svg-label-min`). The lint
report at revision 13 is 122 findings: 2 at severity 3 (both known), 28 at 2, 92 at 1. By rule:
`export/non-native` 65, `dia/stroke-grammar` 14, `dia/fit-slot` 8, `rows/two-lines` 8,
`opener/sentence-lists-section` 6, `copy/full-sentence-caption` 5, `escape/html-block` 4,
`dia/half-pixel` 3, `numbers/contradiction` 3, `copy/metaphor-candidate` 2, `copy/sentence-case` 1,
`type/sizes-ladder` 1, `icon/known` 1, `type/svg-label-min` 1. The 4 html escape blocks and the 12
slides with residual CSS under `ext` are as listed in `docs/M1-STATUS.md`.

## Integration fixes

Made by the integrators to reconcile the builders' trees; every one is in this commit.

- `apps/cli/src/cli.ts` registers `export` and `fonts` (imports, `COMMANDS`, usage lines);
  `args.ts` takes `python` and `baseline-target` as valued flags. The root `tsconfig.json`
  references `packages/mcp` and `apps/render-worker`; `vitest.config.ts` adds `apps/render-worker`.
- `pnpm install` once, by the integrator: the lockfile the builders' implicit installs had
  rewritten is the one committed; `--frozen-lockfile` is clean (step 1).
- The studio build (step 6) failed on `sharp` reached through the worker client; decision 13.
- Flatten verify at 2x with the regenerated-picture rule (decisions 7 and 8): `verify/report.ts`,
  `verify/reference.ts` (a `scale` on every reference lookup and render), `verify/diff.ts`
  (`cropPng`, `diffImagesOutside`), the report schema, `export-pptx.ts` (per-slide `sheet` and
  `pictures`), `scene/extract.ts` (`pictureRegenerated`), the calibration run (a 2x render for the
  flatten fixture), the verify tests (a 2x flatten case and a regenerated-picture case).
- The first-baseline shift (decision 9): `pptx/baseline.ts` with tests, `pptx/text.ts`,
  `pptx/build.ts`, `export-pptx.ts`, the CLI flag, the `export.run` input, `calibration.json`.
- The cover picture offset (decision 12): `pptx/build.ts`, `calibration.json`.
- The final pass: `pnpm format` over the 35 files the review left (the ten `apps/render-worker`
  sources, `apps/cli/src/commands/fonts.ts` and its test, 13 `packages/export` files,
  `packages/fonts/export/fonts.json`, `packages/fonts/src/export.ts` and its test,
  `packages/lint/src/static/export-non-native.test.ts`, `docs/M1-STATUS.md`, `docs/README.md`,
  `docs/spec/SPEC.md`, the three experiment reports); AGENTS.md's acceptance paragraph names the
  19-step chain; `docs/README.md` gained this file's row.
- `docs/export-verification.md` and `AGENTS.md` record the deviations.

## Review fixes

Applied on 2026-09-10 after the M2 review, in the files the review named, before this run.

1. `deck_export` (finding: `export.run` implemented in the CLI but not offered as an MCP tool).
   `apps/cli/src/commands/mcp.ts` registers `export.run` on the dispatcher through the export
   command (the action input mapped to the CLI flags, the output directory under `--derived`) and
   returns the merged `ExportReport` whether or not it passed. When `verify` is requested and
   `soffice` is neither `TURBOSLIDE_SOFFICE`, the macOS app nor on PATH, the handler throws a plain
   error naming `turboslide-render-worker` before anything is exported. The server lists 25 tools.
   `apps/cli/e2e/mcp-stdio.mjs` asserts the count and the tool, writes the calibration deck under
   `.turboslide/e2e-mcp/calibration`, exports it through `deck_export` and, when soffice is
   absent, asserts the refusal (step 27); `packages/mcp/src/tools.test.ts` derives the tool from an
   implemented `export.run` and checks the `theme` in its outputSchema.
2. Per-block ink boxes (finding: `compareBlock` misreports offsets next to hairlines). Measured on
   the container's pages and reference renders: the deck's lightest hairline sits 45 units from the
   paper (18 percent of the paper-to-ink range) and LibreOffice's resampling of the 2x raster puts
   it on two rows at about half that, so a fixed tolerance of 40 counted it in the reference and
   not in the page (`positioning#dia1` dy 33 dw -150, `line-law#rows` dy 21, `ladder#ladder` dy
   20, `voice#say` dy 27). `verify/diff.ts` now counts a pixel as ink past a cut one third of the
   way from the region background to the block's ink color (`budgets.ts` `INK_CUT`; the ink color
   is the farther of the recorded text color and the reference's darkest color inside the block,
   `MIN_INK_CONTRAST` 48 below which the fixed tolerance stays). The midpoint the review proposed
   was measured and rejected: it cuts through the muted text color at 46 percent (`surfaces#rows`
   dw -6 at a 40 percent cut and -42 at 50), while a third sits between the diagram's medium
   strokes (30 percent) and that text. The search clamps to the block's own box when a neighbour's
   box overlaps the 6 px ring (20 blocks on the deck) and the background is read from the ring with
   the neighbours left out. Opaque pictures (record rasters with `alpha` false: `shot`, `html`)
   keep the 40-unit edge measure. The review's geometry read-back was implemented and kept as
   information, not as the placement measure: the exporter writes a raster at the element rect the
   extractor measured on its 2x page and the record's box is the same rect on the render page, and
   the two disagree by up to 1.5 px (`positioning#dia1` shape [731.50, 299.69, 731.50, 300.61]
   against box [733, 301, 732, 301]) while LibreOffice paints the raster within 1 px of the
   reference, so a geometry delta would report the extractor, not the renderer. `report.ts` reads
   every shape of the file back (`shapesByPart`, `shapeBoxFor`: `ts:<slideId>#<blockId>` and its
   `:<n>` raster parts) and `verify-summary.json` carries `shape`, `measure`, `ink` and `clamped`
   per block. `verify.test.ts` covers the half-intensity hairline beside a text block, the dark
   theme, the neighbour clamp, the opaque edge, the shape union and the by-theme pairing. The
   numbers this cut produces on the deck are in the "Native, light" section above.
3. `theme` on the merged report's entries (finding: the merged two-theme report cannot attribute
   a slide entry to a theme). `ExportReport.slides[].theme` is optional in the type and the Zod
   schema (`packages/schema/src/export.ts`); `exportPptx` sets it on every entry of the merged
   report and `verifyPptx` pairs each file with the entries of its theme when every entry has one,
   keeping the positional split for reports that predate the field. `pnpm generate:contracts`
   rewrote `mcp-tools.json` and `openapi.json`.
4. The python-pptx acceptance line (finding: the system `python3` has no `pptx`). The line in
   `docs/spec/MILESTONES.md` now reads `pnpm exec turboslide fonts build --check &&
.turboslide/venv/bin/python3 -c …` (step 32).
5. Formatting (finding: 41 files not prettier-clean). The review formatted the files it touched;
   `scripts/check.mjs` gained `pnpm format:check` as its last step (19, so the M1 step numbers stay
   valid) and the M2 acceptance lists the same command; the integrator formatted the remaining 35
   (the "Integration fixes" section).

## Deviations recorded

- Flatten verification compares at 2x (decision 7), regenerated two-tone pictures are gated on the
  embedded sheet shot (decision 8), native text boxes carry the LibreOffice first-baseline shift
  (decision 9) and the flatten cover picture carries a 0.01 mm offset (decision 12); each is in
  `docs/export-verification.md` and the first three in AGENTS.md.
- The exports verified the committed deck at revision 13 after the write steps were rolled back,
  not the revision 14 the list's order would have produced (the "Acceptance" section).
- LibreOffice in the image is 25.2.3.2 from Debian 13, not the 26.8 the milestone names: The
  Document Foundation ships Linux builds for x86_64 only and the image is built for the host's
  arm64. An x86_64 CI runner can install the TDF 26.8 debs; `soffice --version` lands in every
  report.
- The Chromium revision note of AGENTS.md: renders and the compare step run on `chromium-1217`
  (147.0.7727.15 on macOS, 147.0.7727.0 in the Linux image); `playwright-core` 1.62.1 installs
  `chromium-1234`, which is what CI renders on. Steps 7, 8 and 12 are skipped in CI because the
  Prototemplate checkout is not there.
- The 2 skipped vitest cases: `two-tone.test.ts` "reproduces the pair within the floor" (runs only
  when `TURBOSLIDE_TWO_TONE_SOURCE` names the 3200 by 1800 source render, not recovered) and
  `fonts.test.ts` "reports the committed set current with --check" (the 50 s rebuild, runs when
  `TURBOSLIDE_FONTS_CHECK=1`; step 32 ran the same check directly).
- The recovered specification documents are prettier-formatted (decision 14).

## Blockers

- `.github/workflows/check.yml` is written but not committed or pushed, as in M1: the `gh` token
  that git uses for github.com still has the scopes `gist`, `read:org` and `repo` only, and GitHub
  refuses a push that creates a workflow file without the `workflow` scope. Kevin runs
  `gh auth refresh -h github.com -s workflow` once, then `git add .github && git commit` and
  `git push origin main`. Until then CI does not run on push.
- PowerPoint acceptance of the EOT-wrapped `.fntdata` parts, PowerPoint's first-baseline constant
  and the `custGeom` counters are the scheduled manual pass (`docs/export-verification.md`); with
  the LibreOffice shift applied, PowerPoint may show native text a few pixels high until its
  constant is measured, and `--baseline-target none` exists for that measurement.
- The native gate fails on this tree (steps 30 and 31): `avoid#p1` is 4 px wider and
  `surfaces#rows` 6 px narrower in LibreOffice than in Chromium against a 3 px width budget, 2 of
  the 79 gated blocks; the other 77, and the vertical budget everywhere, hold. The verifier reports
  it instead of hiding it behind the old row rule and the antialiasing fringe (review fix 2).
  Closing it is exporter work (character spacing and size rounding to hundredths of a point, the
  kern strip, width slack) or a budget decision for Kevin. Flatten, the verified default, is not
  affected.
- `@turboslide/render-worker/client` imports the job runners (and through the verify job the
  export package and sharp) into the studio process for its local mode. The routes work and the
  SSR build externalizes sharp (decision 13), but the coupling is why the studio needs the
  workaround; a `turboslide verify` subcommand would let the local queue stay a pure
  child-process runner.
- Code panels travel in Menlo, which the image does not have; LibreOffice substitutes and the
  report's residual says so (SPEC 8.6).

## Open items

- The extractor's 2x page and the render page disagree by up to 1.5 px on element positions
  (`positioning#dia1` at 731.50 in the scene against 733 in the record), which bounds every raster
  delta at about 1 px; the cause is in `packages/export/src/scene/measure.ts` or
  `packages/headless/src/measure.ts`.
- The calibration fixture's first-baseline table sits 1 to 1.5 px more positive than the deck at
  every size; the exporter follows the deck measurement and `calibration.json` records both.
- The family name: the OFL permits the renamed instances, and name ID 7 of the source font is a
  trademark notice for the name Inter (the "Fonts" section). Whether the shipped families keep
  `GT Inter` or take a name without the word Inter is Kevin's call (SPEC open question 5); the
  prefix is one constant in `scripts/build-fonts.py` and `fonts.json`.
- Express the 4 escape blocks in the grammar (the `composite` block, SPEC 4.2, is M5) and retire
  the 2 known findings with them; map the 17 residual CSS rules and 12 inline styles on the 12
  slides listed in `docs/M1-STATUS.md`, or decide they stay under `ext`.
- The 28 severity 2 findings, mostly `dia/stroke-grammar` (14) on raw svg diagrams and
  `rows/two-lines` (8).
- Google Slides export (M6), the editor and the window API (M3), the judge loop and lease
  enforcement (M4), the `composite` block and the GT mark as custom geometry (M5).
- `docs/spec/` and the deck's licensed photographs are in a public repository provisionally (SPEC
  11, open question 14); Kevin's decision, as is the MIT license.
- Archive `.turboslide/m2-final/` from this accepted run when the milestone is signed off; it is
  regenerated by `pnpm check` plus `.turboslide/m2-final/accept.sh` and is not committed.
