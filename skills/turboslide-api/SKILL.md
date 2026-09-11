---
name: turboslide-api
description: Discover and use Turboslide's action table through the CLI, MCP or HTTP: read the deck, make the smallest typed write with baseRevision, take a lease, re-read the normalized result. Use for programmatic or batch work that should not depend on an open browser page.
---

# Turboslide API

Every operation is one named action; the CLI subcommands, the MCP tools and the HTTP endpoints are generated from one table.

## Discovery

1. CLI: `turboslide info --json` and `turboslide slides --json` from a checkout with a `deck.json` upward, or `--deck <dir>`.
2. MCP: `turboslide mcp` over stdio (`--deck <dir>`, `--derived <dir>`, `--author agent:<runId>`), or streamable HTTP at `POST /mcp?deck=<id>` on the studio (initialize first; the `mcp-session-id` header carries the session; `x-turboslide-author` names you). Tools are `deck_<action>` for every implemented action; a tool the server does not list is not implemented, so `tools/list` is the honest capability check. `deck_goto_slide` appears while a studio page is attached to the deck and runs in that page. Resources: `deck://<id>/manifest`, `deck://<id>/slides/<slideId>`, `deck://lint/<id>`, `deck://render/<slideId>/<theme>`, `deck://sheet/<theme>`, `deck://grammar`, `deck://catalog/blocks`, `deck://catalog/icons`, `deck://theme`. The `deck_review` prompt holds the judge lenses.
3. HTTP: `GET /api/agent` for the manifest with the execution rules and what the instance implements, `GET /api/actions/<id>` for one action's contract, `/openapi.json` for the full contract, `/llms.txt` and `/llms-full.txt` for the guides. The studio runs on port 4321.

Read [references/actions.md](references/actions.md) for every action with its input, transports, CLI usage, MCP tool and milestone. An action whose milestone has not landed answers `NotImplementedError` (501); do not retry it.

## Write protocol

1. Read the slide you will touch (`slide.get`) and keep its `revision`.
2. Make the smallest change: `block.set` for one property, `slide.update` with a mutation list, `slide.replace` only for a whole slide.
3. Send `baseRevision` and your author: `--author agent:<runId>` on the CLI, the `x-turboslide-author` header (or `?author=`) over HTTP and on the MCP initialize request. A stale revision returns 409 with `currentRevision` and the current document: re-read it, rebase your change, retry once.
4. Take `slide.lease` before a series of writes to one slide. An agent write to a slide another author holds is refused with 409 and the holder unless `force` is set (`--force`, `?force=1` or `x-turboslide-force: 1`); a human's write warns and goes through. Release the lease when done.
5. Re-read from the response. Writes return the normalized slide and its findings, so the re-read is free; text may have been canonicalized.

## HTTP request shape

- `POST /api/actions/<id>?deck=<slug>` with the action input as one JSON object; `deck` defaults to the instance deck. Bodies are capped at 1 MB (25 MB for asset uploads).
- Auth: `Authorization: Bearer <TURBOSLIDE_TOKEN>` on every deployed instance; an instance without a token serves localhost only and answers 401 elsewhere.
- Errors: `{ error: { name, status, message, code?, pointer?, currentRevision?, current?, holder?, milestone? } }`. An unknown field is 400 with `code: unknown_field` and the pointer to the extra key.

## Contract rules

- Unknown fields are rejected with `unknown_field` and a JSON pointer; unknown data survives only under `ext` on a slide, a block or an asset.
- Slides, sections and assets are slugs; blocks are `slideId#blockId`; fields are JSON pointers. Never address by number.
- `section.set` is the only way to reorder; numbers and counts derive from it.
- Errors are `TypeError` (400), `RangeError` (404), `ConflictError` (409), `NotImplementedError` (501), `Error` (500). Do not retry unchanged invalid input.
- Over MCP a tool result carries the output as JSON text and as `structuredContent`; a list is `{ items, count }`; a refusal is `isError` with the same error body in the text. Render tools return PNGs as image content, at most 12 per call.

## Completion

A write is complete when the response carries the new revision and the findings list for the slide. Then render both themes and lint (`turboslide-verify`); a claim about the deck names the revision it was verified at.
