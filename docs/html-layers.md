# HTML and CSS under the hood of a slide

Kevin, 2026-10-18: "html slides are the default for how turboslides are already rendered, so add
it as additional under the hood capability. like shared slide html/css + per slide html and css."

A slide already renders as HTML (`packages/render/src/slide.ts`). This document adds two optional
fields to that render: the deck's `html`, shared by every slide, and a slide's own `html`. Each
is an HtmlLayer. It replaces the separate domain that "HTML slides wave B" proposed for user HTML:
the markup runs under the same three layers as an `html` block (`docs/security.md` section 6), so
it needs no origin of its own.

## 1. The field

```ts
type HtmlLayer = {
  css?: string; // at most 65,536 characters
  markup?: string; // at most 262,144 characters
  layer?: 'under' | 'over'; // where the markup draws; under when absent
};
```

`deck.json` carries `html?: HtmlLayer` beside `brand`, and every slide file carries
`html?: HtmlLayer` beside `background` (`packages/schema/src/deck.ts`). Both are optional. A deck
and a slide without the field render byte for byte as before.

The field is schema minor 1 (`SCHEMA_MINOR`). `applyWrite` stamps `schemaMinor: 1` on the
manifest and on each slide file that holds one (`reduce.ts` `stampMinor`). A release of minor 0
(a rollback past this one, an older CLI) reads such a file tolerantly, keeps the field and writes
it back unchanged. A file without the field stays unstamped.

## 2. What it draws

- `css` styles the slide. The deck's CSS and then the slide's are scoped to the slide's root,
  `.ts-sheet [data-slide="<id>"] <selector>`, so they restyle the theme's own blocks and the
  markup alike. `:scope` names the slide root itself. Each rendered slide carries the rules for
  itself alone, the editor's filmstrip clones included.
- `markup` is a layer the size of the sheet (1600 by 900, the box of `.slide-bg`). `under` draws
  it after the background and before the slide's blocks (`.in`), and `over` draws it after them.
  The layer never takes a pointer, so the editor's selection and the show's clicks reach the
  slide as before. The deck's layer draws before the slide's at the same place.
- Images in the markup reference deck assets by their `assets/...` path, as an html block's do,
  and resolve to the theme's twin.

## 3. Sanitizing

Three passes, the ones an `html` block gets:

1. At the schema boundary, `css` passes `safeStyleText`, so no text can close the style element
   it renders into.
2. At write time, `deck.setHtml` and `slide.setHtml` run `sanitizeHtmlLayer`
   (`packages/render/src/sanitize/html.ts`): DOMPurify over the markup with the html block's
   profile, and the CSS tokenizer (no `@import`, no `@font-face`, no `url()` outside `assets/` and
   `data:image/`, no `position: fixed` or `sticky`, no `expression`). The answer lists the CSS the
   tokenizer dropped. A layer with neither CSS nor markup left is removed.
3. At render time, every surface sanitizes again (`packages/render/src/html-layers.ts`), so a
   layer written by another path (a raw `slide.set`, a bundle) is never drawn unsanitized. A page
   that has not loaded the parser yet draws no markup until it has.

`scopeCss` scopes the rules inside `@media`, `@supports`, `@container` and `@layer` at any depth,
matches a scope class whole, and drops a statement or a stray brace where rules stand, so no rule
leaves the slide's scope. The html block shares these fixes.

## 4. Where it renders

- The studio's view, show, embed and print payloads (`apps/studio/src/server/decks.ts`) draw each
  markup layer in the sandboxed frame of an html block (`htmlLayerFrameFor`,
  `packages/render/src/sanitize/frame.ts`): `<iframe class="ts-x-frame" sandbox="">` with an
  opaque origin, scripts off, and the frame's CSP. The frame document carries the layer's CSS
  scoped to its own root and the theme's variables.
- The editor stage, the filmstrip, the presenter, the standalone file, the print document and the
  export capture draw the markup inline, sanitized and scoped, as they draw an html block.
- PDF keeps the markup as vector. Flatten PPTX rasterizes the page as always. Editable text PPTX
  places each markup layer as a picture with alpha (`data-raster="html"`), so the slide's own text
  stays editable over it.

## 5. Policy

The html block's policy decides. Where an html block would render as its note (a deck shared by
link or published, unless the owner allows embedded HTML; the `htmlBlocks` kill switch off), the
view payloads draw neither the layer's CSS nor its markup (`htmlLayersOff`).

## 6. Actions

| Action          | CLI                                                                                             | MCP                   |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------- |
| `deck.setHtml`  | `turboslide deck html [--css <file>] [--markup <file>] [--layer under\|over] \| --clear`        | `deck_set_html`       |
| `slide.setHtml` | `turboslide slide html <ids> [--css <file>] [--markup <file>] [--layer under\|over] \| --clear` | `deck_set_slide_html` |

The input is `{ html: HtmlLayer | null, baseRevision }` (with `slideIds` for the slide action);
null removes the layer. Each is one write, so one Undo takes it back. Both run on every transport
(CLI, HTTP, MCP and the editor's window API). There is no menu or panel for them: the capability
is for agents and the API, and the inspector leaves the field out.
