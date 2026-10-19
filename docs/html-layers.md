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
   profile, the `id` and `name` attributes removed (the layer draws in the editor's own document,
   where an id could shadow one the editor reads; style the markup by class), every `src`,
   `href`, `poster` or `srcset` that points anywhere but `assets/`, `data:image/` or `#` removed
   (`confineLayerMarkup`: the standalone file and the export capture carry no CSP, so an `https:`
   image there would be a fetch the author chose), and the CSS tokenizer. The answer lists the CSS the tokenizer dropped. A layer with neither CSS nor markup
   left is removed. A process that cannot load the parser sanitizes with the regular expressions
   alone, which also drop the SVG animation elements (`animate`, `set`), and logs the reason
   once (`turboslide sanitizer: DOMPurify did not load (...)`). The Vercel function carries
   dompurify and jsdom (`TRACE_DEPS` in `apps/studio/vite.deploy.config.ts`) as plain files:
   `FUNCTION_LINKS` replaces nf3's links to a package traced at two versions with copies. The
   server's jsdom is 26.1.0 (the `sanitizer` catalog in `pnpm-workspace.yaml`): the function's
   runtime refuses `require()` of an ES module, and jsdom 27.0.0 and later need it.
3. At render time, every surface sanitizes again (`packages/render/src/html-layers.ts`), so a
   layer written by another path (a raw `slide.set`, a bundle) is never drawn unsanitized. A page
   that has not loaded the parser yet draws no markup until it has, and the export capture,
   `turboslide render` and `turboslide build` load it first for a deck that holds markup
   (`loadPurifierFor`), so they sanitize with DOMPurify and not the regular expressions alone.

The CSS tokenizer (`packages/render/src/sanitize/css.ts`) reads the text as a browser does
(comments, strings, unquoted `url()`, escapes, and the braces outside them) and rebuilds it from
its tokens, so every brace in its output is structural. It keeps style rules and the grouping
rules `@media`, `@supports`, `@container` and `@layer`, and drops:

- every other at rule (`@import`, `@font-face`, `@keyframes`, `@property`, `@page`,
  `@starting-style`, a statement such as `@layer a, b;`), each of which fetches or acts on the
  whole document;
- a nested style rule (CSS nesting: `&` makes its selector absolute);
- a selector or declaration with a backslash escape, a string holding a brace, or a malformed
  string or url, and a selector with `&` or `url()`;
- a `url()` outside `assets/` and `data:image/`, and `image-set`, `src`, `attr`, `element` and
  `cross-fade`;
- `expression`, `behavior`, `-moz-binding`, `position: fixed` and `sticky`, a `position` read from
  `var()`, and `pointer-events`; `!important` on `z-index` is stripped.

`scopeCss` (`sanitize/scope.ts`) then prefixes every selector with the slide's scope, splitting a
selector list only on its top level commas. It scopes the rules inside the grouping rules at any
depth, matches a scope class whole, and refuses a selector that starts with a combinator or puts
`~` or `+` right after `:scope` (the scope's siblings, the other slides of a page). The html
block shares all of these rules.

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
