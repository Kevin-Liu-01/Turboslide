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
5. `turboslide export pptx --mode flatten --theme light --verify` writes `export-report.json`; read it.
6. Over MCP (`turboslide mcp`, or `/mcp` on the studio): `deck_render` returns the PNGs as image content with the records, `deck_sheet` the sheet with its cell map, `deck_lint` the findings as `{ items, count }`, `deck_judge_bundle` the bundle; `deck://render/<slideId>/<theme>` and `deck://sheet/<theme>` hold the latest ones, and the `deck_review` prompt (argument `lens`) gives the lens instructions below.

Read [references/verification.md](references/verification.md) for the evidence actions, the `Finding` schema, the rule table and the judge lenses.

## Judging

- Read the structured record before the pixels: a box outside the sheet, a font size under 15 px or a weight above 500 is a defect whatever the picture looks like.
- One lens at a time (layout, visual consistency and dark mode, copy and case, accuracy, completeness, art direction); return findings at severity 2 and 3 only, each with `slideId`, `blockId` where one exists, evidence, a concrete proposal a fixer can act on without judgment, and `source: judge:<lens>`. A skeptic keeps or drops each finding and writes `source: skeptic` on what it sharpens.
- Apply mechanical fixes with `turboslide fix <ids> --rule <id>` (every rule marked `fix` in the rule table carries mutations); hand the rest to a fixer under a `slide.lease`, one slide each; re-render and re-lint after every fix.

## Completion

- An overflow finding is a failure.
- A severity 3 finding blocks the ship step. The known list is the honest state of the deck, not a place to hide new findings.
- A resolved export call is not a verified export: `export-report.json` must say `passed` and `geometryInBounds`.
- A frame timestamp is not an image; read the file and its dimensions.
- A resolved apply is only a React commit; wait for the render before reading pixels.
- Look at both themes after every edit; a slide passes only when both do.
- The gate (`gate.json` from the judge loop, or `turboslide lint` exit 0 plus `render` with no page errors and `build` under budget) names the revision; the claim is about that revision.
