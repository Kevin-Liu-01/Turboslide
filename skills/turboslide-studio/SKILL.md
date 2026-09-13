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
- `invoke('view.goto', { slideId })`, `view.mode`, `view.theme`, `view.present` and `view.zoom` (a factor from 0.25 to 16, Google's 25 to 1600 percent, or `'fit'`, with an optional `center` sheet point the stage keeps under its centre) for the view; `invoke('render.slide', ...)` for a render through the studio; every editor action of the table (`slide.update`, `block.set`, `lint.run`, `fix.run`, `version.save`) runs through the same dispatcher a click uses.
- The Google Slides parity actions run in the page too, with the revision from `describe().state.revision` as `baseRevision`: `slide.new` (the page selects the new slide), `slide.duplicate` (the copy), `slide.skip`, `slide.applyLayout`, `slide.import`, `block.duplicate`, `text.replaceAll`, `export.text`; `deck.list`, `deck.copy`, `deck.trash` and `deck.restore` run on the host from the page. `describe().state` carries `slideId` (the current slide, always one the deck has: after a removal the slide that took its place is current), `zoom`, `revision`, `serverRevision` and `pending`; `pending === 0 && revision === serverRevision` is the settled state to wait for after a write.
- The canvas actions of round two run in the page through the same store actions the CLI runs, with the editor's own measurer: `slide.toCanvas`, `block.set` with a `/pos` path on any slide (the slide converts in the same write and `slide.get` then returns `pos` on every object with `template` and `grammar`), `block.rotate`, `block.flip`, `block.group`, `block.ungroup`, `block.regroup`, `block.order`, `block.align`, `block.distribute`, `block.duplicate`, `block.crop`, `block.mask`, `block.adjust`, `block.resetImage`, `block.shadow`, `block.setAlt`, `block.autofit`, the `text.*`, `table.*`, `chart.*`, `shape.set`, `line.set`, `diagram.insert`, `slide.setBackground`, `deck.setBackground` and `deck.guides`. `describe().state.zoom` reports the factor; the stage's rulers, guides, zoom and pan follow View > Show ruler, View > Guides, View > Snap to and the Zoom box.
- The editor at `/new` is a fresh presentation whose first write creates the deck; the address becomes `/edit/<id>` then. In an inline text edit Esc commits and Enter starts a paragraph; a click on a filmstrip card selects that slide and the Edit menu's Cut, Copy and Paste act on the selected cards.
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
