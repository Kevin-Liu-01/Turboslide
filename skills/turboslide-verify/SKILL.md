---
name: turboslide-verify
description: Verify a Turboslide deck by artifact: render both themes, read the contact sheet by its cell map, run the grammar linter, judge with the named lenses and the Finding schema, apply mechanical fixes, verify exports against the web render. Use before claiming any slide, deck or export is done.
---

# Turboslide verify

Evidence first, then judgment. Every claim names the revision it was verified at.

## Evidence

1. `turboslide render <ids|all> --theme light,dark --out preview/ --json` writes `preview/<nn>-<slideId>-<theme>.png` and `render.json` with a `RenderRecord` per image: boxes, line counts, font sizes and weights, fonts status, page errors, overflow.
2. `turboslide sheet all --cols 4 --thumb 480 --numbered --overlay lint` writes the sheets and `sheet-<theme>.json`; read the cell map first and address slides by id.
3. `turboslide lint <ids|all> --json` returns `Finding[]` with `source: lint`; exit 1 means a severity 3 finding outside `known-findings.json`.
4. `turboslide judge bundle --out .turboslide/judge --json` packages the renders, the sheets with their cell maps, `lint.json` with the gate, the document, the outline, `numbers.json` (numerals per slide) and the six lens instructions in one directory; `scripts/judge-loop.mjs` runs the judges, the skeptics, the fixers and the gate over it (docs/judge-loop.md).
5. `turboslide export pptx --mode flatten --theme both --verify` writes `export-report.json`; read it: `perfect` says every page raster decoded within 0.1 percent of its shot, `passed` that LibreOffice's pages matched the render. `turboslide export check <file.pptx>` reopens a file with python-pptx and walks its package (docs/pptx.md).
6. Over MCP (`turboslide mcp`, or `/mcp` on the studio): `deck_render` returns the PNGs as image content with the records, `deck_sheet` the sheet with its cell map, `deck_lint` the findings as `{ items, count }`, `deck_judge_bundle` the bundle; `deck://render/<slideId>/<theme>` and `deck://sheet/<theme>` hold the latest ones, and the `deck_review` prompt (argument `lens`) gives the lens instructions below.
7. The other downloads of the Google Slides parity round: `export.run` with `format: 'pdf'` writes one page per slide and its report names the residual of every page against the 2x render (`turboslide export pdf --verify`); `export.text` (`turboslide export txt`, `deck_export_text`) is the deck's words for a copy check; `render.slide` with `format: 'jpg'` is the JPEG download. `includeSkipped` and `includeNotes` are off by default on every download, so a skipped slide and the speaker notes are absent unless asked for; `slide.list` reports `skip` and `template` per slide and `deck.info` counts the skipped slides, so a claim about a download names what it left out. `deck.list` (`turboslide deck list`) walks every deck of a store, trashed ones under `includeTrashed`.

8. The canvas of round two: `turboslide lint` names `layout/freeform` ("This slide is arranged by hand; Apply layout re-flows it") at severity 1 on every converted slide, `freeform/off-sheet` at 3 for an object wholly outside the sheet and at 2 for one crossing an edge, `freeform/overlap` over the rotated bounding boxes, `text/overflow` (rendered) and `chart/size`. `node scripts/canvas-fidelity.mjs --deck <dir> --max-mismatch 0.005` converts every slide of a deck through the measured conversion and compares the canvas render with the grammar render per theme (`pnpm check` step 24 over the GT deck and the templates); `turboslide slide measure <ids> --json` prints the boxes the conversion reads, and the `pos` the editor, the CLI and the hosted studio write are identical in Chromium. `export check` reports the round two counts (italic runs, rotated shapes, groups, chart parts, attached connectors, `numCol`, `avLst`, merged cells).

9. Round three: `turboslide picture materialize --dry-run` names every dithered picture without a variant; the exports materialize the missing ones before the shoot and the report's residual carries one `dither: <slide>#<block> <key12> <state>` line per dithered picture (state `variant` when the export read a file), so a Perfect claim over a dithered deck names them. `turboslide comments --for-me --json` and `notifications --unread` read the review state; `share get` reports the record's revision, mode, role and links; `sync status` compares the store's revision with the room's head. The chrome lint (`turboslide lint --chrome`) allows the six collaborator hues and the two halo values on the live surfaces only (`.ts-flag`, `.ts-remote-outline`, `.ts-remote-caret`, `.ts-remote-pointer`, `.ts-following-plate`, `.ts-chip-stripe`); `scripts/layout-shift-audit.mjs --base <preview>` measures every route and driven state at three widths in both appearances and exits 1 on any layout shift entry.

Read [references/verification.md](references/verification.md) for the evidence actions, the `Finding` schema, the rule table and the judge lenses.

## Judging

- Read the structured record before the pixels: a box outside the sheet, a font size under 15 px or a weight above 500 is a defect whatever the picture looks like.
- One lens at a time (layout, visual consistency and dark mode, copy and case, accuracy, completeness, art direction); return findings at severity 2 and 3 only, each with `slideId`, `blockId` where one exists, evidence, a concrete proposal a fixer can act on without judgment, and `source: judge:<lens>`. A skeptic keeps or drops each finding and writes `source: skeptic` on what it sharpens.
- Apply mechanical fixes with `turboslide fix <ids> --rule <id>` (every rule marked `fix` in the rule table carries mutations); hand the rest to a fixer under a `slide.lease`, one slide each; re-render and re-lint after every fix.

## Completion

- An overflow finding is a failure.
- A severity 3 finding blocks the ship step. The known list is the honest state of the deck, not a place to hide new findings.
- A resolved export call is not a verified export: `export-report.json` must say `passed` and `geometryInBounds`, and a perfect claim needs `perfect`.
- A frame timestamp is not an image; read the file and its dimensions.
- A resolved apply is only a React commit; wait for the render before reading pixels.
- Look at both themes after every edit; a slide passes only when both do.
- The gate (`gate.json` from the judge loop, or `turboslide lint` exit 0 plus `render` with no page errors and `build` under budget) names the revision; the claim is about that revision.
