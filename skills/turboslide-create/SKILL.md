---
name: turboslide-create
description: Write or revise Turboslide slides in the GT deck grammar: typed blocks in named slots, slug ids, the four-rule text markup, the twelve archetypes with their plate rules. Use when the requested outcome is a slide or a deck that must look like the GT brand deck.
---

# Turboslide create

Write the document, not the pixels. A slide is a kind, a layout and typed blocks; there are no coordinates.

## Before writing

1. Read [references/grammar.md](references/grammar.md): the sheet, the text markup, the slide kinds with their plate anatomy, the layouts and their slots, every block type with its properties and snap sets, the lint rules.
2. Read the deck: `turboslide info --json`, then `turboslide slide get <id> --json` for a neighbouring slide of the same archetype and copy its shape.
3. Pick the archetype from the grammar table; if no block expresses the idea, say so and use an `html` escape with a `note` that names what the grammar lacks. The count of escapes is the honest scope of the grammar.

## Writing rules

- Ids are slugs, unique across the deck for slides and within the slide for blocks; never renumber.
- Text is a string in the four-rule markup: `*display*`, `[link](url)`, a standalone `GT` becomes the mark, `\*` `\[` `\GT` escape. No line breaks except in `panel.code`.
- Headings: sentence case, no trailing period, a name and never a URL, no product token first. Body: full sentences, no em dashes, no exclamation marks, no metaphors, no "X, not Y" pairs.
- Rows and plain lists instead of bullets; values at most two lines; icons only in a key cell or at a row start, at 20 or 24 px, with a semantic color only when the meaning is done, open, excluded or GT.
- An opener plate is lower left at 740 px and its sentence lists the section's slide families in order; a mood plate is lower right at 560 px with a 44 px title and a 15 px credit; a mood slide never sits directly before an opener.
- Use the snap sets (key widths, gaps, caption sizes, measures) rather than free numbers; the inspector offers the same values.
- Keep `ext` fields and stable ids of anything you did not intend to change.

## Applying

Write through `turboslide-api` (`slide.insert`, `slide.update`, `slide.replace`) with the `baseRevision` you read, or paste JSON into the studio's source drawer; both run the same validator. Fix every `unknown_field` and `reference` issue; keep `ext` only on a slide, a block or an asset.

## Completion

A slide is done when `turboslide validate` passes, `turboslide render <id> --theme light,dark` shows both themes with no overflow, and `turboslide lint <id>` has no severity 3 finding outside `known-findings.json`. Name the revision in the report. Use `turboslide-verify` for the full loop.
