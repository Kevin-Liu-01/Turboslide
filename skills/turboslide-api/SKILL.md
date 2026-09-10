---
name: turboslide-api
description: Discover and use Turboslide's action table through the CLI, MCP or HTTP: read the deck, make the smallest typed write with baseRevision, take a lease, re-read the normalized result. Use for programmatic or batch work that should not depend on an open browser page.
---

# Turboslide API

Every operation is one named action; the CLI subcommands, the MCP tools and the HTTP endpoints are generated from one table.

## Discovery

1. CLI: `turboslide info --json` and `turboslide slides --json` from a checkout with a `deck.json` upward, or `--deck <dir>`.
2. MCP: `turboslide mcp` over stdio, or `/mcp` on the studio; read `deck://manifest`, `deck://grammar`, `deck://catalog/blocks`, `deck://catalog/icons`, `deck://theme`.
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

## Completion

A write is complete when the response carries the new revision and the findings list for the slide. Then render both themes and lint (`turboslide-verify`); a claim about the deck names the revision it was verified at.
