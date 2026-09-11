---
name: turboslide-api
description: Discover and use Turboslide's action table through the CLI, MCP or HTTP: read the deck, make the smallest typed write with baseRevision, take a lease, re-read the normalized result. Use for programmatic or batch work that should not depend on an open browser page.
---

# Turboslide API

Every operation is one named action; the CLI subcommands, the MCP tools and the HTTP endpoints are generated from one table.

## Discovery

1. CLI: `turboslide info --json` and `turboslide slides --json` from a checkout with a `deck.json` upward, or `--deck <dir>`.
2. MCP: `turboslide mcp` over stdio (`--deck <dir>`, `--derived <dir>` for where renders and sheets land, `--author agent:<runId>`), or `/mcp` on the studio from M4. Tools are `deck_<action>` for every implemented action; a tool the server does not list is not implemented yet, so `tools/list` is the honest capability check. Resources: `deck://<id>/manifest`, `deck://<id>/slides/<slideId>`, `deck://lint/<id>`, `deck://render/<slideId>/<theme>` (the latest PNG), `deck://sheet/<theme>` (the latest contact sheet with its cell map), `deck://grammar`, `deck://catalog/blocks`, `deck://catalog/icons`, `deck://theme`. The `deck_review` prompt holds the judge lenses.
3. HTTP: `GET /api/agent` for the manifest, `/openapi.json` for the full contract, `/llms.txt` for the short guide. The studio runs on port 4321.

Read [references/actions.md](references/actions.md) for every action with its input, transports, CLI usage, MCP tool and milestone. An action whose milestone has not landed answers `NotImplementedError` (501); do not retry it.

## Write protocol

1. Read the slide you will touch (`slide.get`) and keep its `revision`.
2. Make the smallest change: `block.set` for one property, `text.replace` for text, `slide.update` with a mutation list, `slide.replace` only for a whole slide.
3. Send `baseRevision` and `--author agent:<runId>` (or the `x-turboslide-author` header). A stale revision returns 409 with the current document: re-read it, rebase your change, retry once.
4. Take `slide.lease` before a series of writes to one slide; another author's write is refused with the holder's name unless forced.
5. Re-read from the response. Writes return the normalized slide, so the re-read is free; text may have been canonicalized.

## Contract rules

- Unknown fields are rejected with `unknown_field` and a JSON pointer; unknown data survives only under `ext` on a slide, a block or an asset.
- Slides, sections and assets are slugs; blocks are `slideId#blockId`; fields are JSON pointers. Never address by number.
- `section.set` is the only way to reorder; numbers and counts derive from it.
- Errors are `TypeError` (400, malformed input with the Zod path), `RangeError` (404, unknown id), `ConflictError` (409), `NotImplementedError` (501), `Error` (500). Do not retry unchanged invalid input.
- Over MCP a tool result carries the action output as JSON text and as `structuredContent`; a list output is wrapped as `{ items, count }`. A refused call is `isError` with `{ error: { name, status, message, currentRevision?, current?, holder? } }` in the text. Render tools return PNGs as image content beside the JSON, at most 12 per call; the rest are read from `deck://render/<slideId>/<theme>`.

## Completion

A write is complete when the response carries the new revision and the findings list for the slide. Then render both themes and lint (`turboslide-verify`); a claim about the deck names the revision it was verified at.
