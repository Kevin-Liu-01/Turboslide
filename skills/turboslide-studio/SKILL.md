---
name: turboslide-studio
description: Operate the live Turboslide studio programmatically through window.turboslide.studio: accessible controls and data-control ids, exact source round trips through the source drawer, view state, presenting, and the attached-session bridge that lets MCP drive an open page. Use when the task depends on an open browser page or authentic rendering.
---

# Turboslide studio

Use the supported `window.turboslide.studio` adapter, never private component state or coordinate-only automation.

## Connect

1. Open the studio at `http://localhost:4321/edit/<deckId>` (viewer at `/deck/<deckId>`, presenter at `/present/<deckId>`).
2. Wait for `window.turboslide.studio` or the `turboslide:studio-api-ready` event; its detail is `describe()`.
3. Call `describe()` and `controls()` before relying on actions or labels. Re-read the global after changing owner: the editor, the viewer per mode, the source drawer and the presenter each install an adapter. `describe().owner` says which one is active and `describe().state` carries the deck id, the revision, the slide and the theme.

Read [references/browser-api.md](references/browser-api.md) for the methods, the owners, the window actions and the error classes.

## Operations

- `activate(label)` for buttons; `set(label, value)` for text, numbers, selects and toggles. Labels are `<block id>: <property label>` (`list: Size`); the locale-independent form is the `data-control` id (`block.list.size`). Both work.
- `readSource()` and `applySource(doc)` for exact document changes: read, change only the intended fields, apply through the validator, re-read.
- `invoke('view.goto', { slideId })`, `view.mode`, `view.theme`, `view.present` for the view; `invoke('render.slide', ...)` for a render through the studio; every editor action of the table (`slide.update`, `block.set`, `lint.run`, `fix.run`, `version.save`) runs through the same dispatcher a click uses.
- `download(artifact)` only after verifying a returned artifact.
- From outside the page: an open `/edit` or `/deck` page attaches itself to the studio's session registry, so `deck_goto_slide` over `/mcp` and `view.goto` run in that page and return its view state; `GET /api/agent` lists the attached sessions.

## Rules

- Accessible labels and `data-control` ids are the contract; do not invent them and do not assume one exists in another owner.
- A resolved `applySource` is a React commit boundary, not a render: wait two animation frames, `document.fonts.ready` and image decode before reading pixels.
- Never write `localStorage`, React internals or object URLs to automate the product; the theme is set through `view.theme`.
- Writes from outside the page (CLI, MCP, HTTP) reach the open editor through the store's watch channel within a second: the banner names the revision and the author, and the document updates in place. The editor holds a lease on the slide it edits; an agent write to that slide is 409 unless forced.
- The machine is shared: one browser page at a time, always port 4321.

## Completion

After a change, re-read the source and confirm the intended values survived, then inspect the rendered sheet in both themes (`view.theme`). A source that applied is not a slide that is correct; run `turboslide-verify`.
