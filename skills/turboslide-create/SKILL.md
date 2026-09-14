---
name: turboslide-create
description: Write or revise Turboslide slides in the GT deck grammar: typed blocks in named slots, slug ids, the four-rule text markup, the twelve archetypes with their plate rules. Use when the requested outcome is a slide or a deck that must look like the GT brand deck.
---

# Turboslide create

Write the document, not the pixels. A slide is a kind, a layout and typed blocks; there are no coordinates.

## Before writing

1. Read [references/grammar.md](references/grammar.md): the sheet, the text markup, the slide kinds with their plate anatomy, the layouts and their slots, every block type with its properties and snap sets, the lint rules.
2. Read the deck: `turboslide info --json`, then `turboslide slide get <id> --json` for a neighbouring slide of the same archetype and copy its shape. Over HTTP the same reads are `POST /api/actions/deck.info` and `POST /api/actions/slide.get`. On a hosted studio the agent guide is `/llms.txt` and the product page `/home`; the GT brand deck, the record every layout was drawn from, is `/deck/gt-brand`.
3. Pick the archetype from the grammar table; if no block expresses the idea, say so and use an `html` escape with a `note` that names what the grammar lacks. The count of escapes is the honest scope of the grammar.

## Writing rules

- Ids are slugs, unique across the deck for slides and within the slide for blocks; never renumber.
- Text is a string in the four-rule markup: `*display*`, `[link](url)`, a standalone `GT` becomes the mark, `\*` `\[` `\GT` escape. A `\n` is a paragraph break in paragraph, text, box and table cell Texts and a line break in `panel.code`; nowhere else.
- A Text may be empty: `slide.new` inserts a layout's placeholders that way, the editor shows the layout's prompt in them, a download draws nothing, and the linter reports `copy/empty-placeholder` so a finished deck carries none. In the editor, Esc commits an edit and Enter inside a paragraph starts a new one.
- Headings: sentence case, no trailing period, a name and never a URL, no product token first. Body: full sentences, no em dashes, no exclamation marks, no metaphors, no "X, not Y" pairs.
- Rows and plain lists instead of bullets; values at most two lines; icons only in a key cell or at a row start, at 20 or 24 px, with a semantic color only when the meaning is done, open, excluded or GT.
- An opener plate is lower left at 740 px and its sentence lists the section's slide families in order; a mood plate is lower right at 560 px with a 44 px title and a 15 px credit; a mood slide never sits directly before an opener.
- Use the snap sets (key widths, gaps, caption sizes, measures) rather than free numbers; the inspector offers the same values.
- Keep `ext` fields and stable ids of anything you did not intend to change.

## Applying

Write through `turboslide-api` (`slide.insert`, `slide.update`, `slide.replace`; over MCP the tools `deck_insert_slide`, `deck_update_slide`, `deck_replace_slide` and `deck_update_block`; over HTTP `POST /api/actions/<id>?deck=<id>` with `x-turboslide-author: agent:<runId>`) with the `baseRevision` you read, or paste JSON into the studio's source drawer; every path runs the same validator. Start a slide from a layout with `slide.new` (`turboslide slide new --layout split --after <slideId>` for Title and body; 21 layouts, Google's eleven first, `turboslide slides --json` names each slide's `template`) and fill its empty Texts with `block.set`; change a slide's shape with `slide.applyLayout`, which keeps the content; copy slides with `slide.duplicate` or from another deck with `slide.import`; copy blocks with `block.duplicate`; rename a customer across the deck with `text.replaceAll`; hide a slide from the show and the downloads with `slide.skip`. A `table` block is rows of cells, each a Text (`spans` merge cells, `cells` style them); a `plain` list with `numbered: true` counts its items, and `marker` with `preset` and per item `level` draws Google's glyph bullets and numbering. Every slide is a canvas: the grammar layouts are the templates, and a slide you arrange by hand (`slide.toCanvas`, or any write of a `pos`, a rotation, a group or a positioned insert) converts losslessly to the freeform layout with every object carrying `pos` (`x`, `y`, `w`, `h`, `z`, `rotate`, `flip`, `group`) on the 1600 by 900 sheet; `slide.applyLayout` re-flows it by the layout's table. The 135 shape presets (`shape.set --kind`), the line kinds with connectors that follow a moved shape, a text `[run]{i u s c:red}` with the marks, a `chart` block with up to 12 categories and 6 series, and `diagram.insert` for Google's six diagram types are the round two vocabulary (docs/gslides-parity/SPEC-2.md). Take `slide.lease` first when you make more than one write to a slide: an agent write to a slide someone else holds is refused with 409 and the holder. Since round three (docs/gslides-parity/SPEC-3.md) a text edit may travel as `text.splice` (a range replaced by plain offset, with the run flags) or `text.mark` beside `text.replace`; people editing the same Text at once converge, so a small splice is kinder to a co-editor than a whole `block.set` of the text. A photograph becomes a slide background with the deck's two tone screen through `slide.setBackgroundPicture` with `dither` (the Photograph preset `bayer8`, black 120, white 230, gamma 0.9; the Neutral identity `strength` under 1 keeps the picture visible), `picture.dither` sets or clears the field on any picture object or shot, and `picture.materialize` writes the variant files every export reads; a shader material is a background through `slide.setBackgroundMaterial`. Comments are records beside the document (`comment.add slide:<id>#<blockId> -m <text>`), never text in a block. Fix every `unknown_field` and `reference` issue; keep `ext` only on a slide, a block or an asset. Mechanical findings the write returns with `fix` mutations are applied by `turboslide fix <id>`.

## Completion

A slide is done when `turboslide validate` passes, `turboslide render <id> --theme light,dark` shows both themes with no overflow, and `turboslide lint <id>` has no severity 3 finding outside `known-findings.json`. Name the revision in the report. Use `turboslide-verify` for the full loop, and the judge loop (`turboslide judge bundle`, `scripts/judge-loop.mjs`) before a deck ships.
