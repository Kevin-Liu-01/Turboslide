# Polish two, lane D: the docs at /docs

Lane D of `docs/POLISH-2.md` (sections 5, 6.5 and 7.4), in `/Users/kevinliu/repos/Turboslide-polish2`
on `polish2/round`. Each push below names its items, its files, its checks with their readings and the
one minute load beside each timing, its pictures and its deviations. The load stayed between 103 and
470 for the whole lane, so no timing below is a verdict; bytes, counts, headers and corners do not
move with load.

The lane wrote every push before the first commit and read the gates once, on the tree with all six
pushes in, then committed the six pushes in order (`e9145288`, `ce2d9edd`, `51719156`, `3dc0dd3d`,
`8f49c8d4`, and P2-D#6). A file that differs between pushes was staged at each push's own content
(`git update-index --cacheinfo`), so every commit holds that push alone: the first push's
`meta.json`, `editor/meta.json`, `index.mdx`, `vite.deploy.config.ts` and `src/docs/llms.ts` are the
versions with three pages and without the agents' text routes. The rows were read on a copy of
`apps/studio/e2e/core/docs.spec.ts` with the matrix gate off (the rows enter the matrix inside the git
lock at their push, which no lane holds for the length of a run); the copy runs the same test bodies.

## The stack and what the docs cost

- `fumadocs-core` 16.16.2 and `fumadocs-mdx` 15.4.6, headless; no fumadocs-ui, Tailwind or Pagefind.
  The macro collection (`apps/studio/src/docs/source.ts`) is asynchronous: every page's frontmatter
  and `meta.json` in one module, each page's body a chunk of its own.
- The client output of the node-server build: `DocsShell` 41,511 B (13,007 B gzip, fumadocs' loader
  and every docs component), the route chunk 6,041 B (2,075 B), a page's body chunk 10,026 to 21,995 B
  for the written pages (2,050 to 3,744 B gzip; the action reference's largest group, `block`, is
  242,024 B), `docs.css` 12,370 B (2,828 B gzip), the search window 3,717 B and the Copy Page menu
  6,338 B on first use, the search index 200,672 B (45,763 B gzip) on the first open. A docs page
  also preloads the chrome's icon table (51,137 B, 14,714 B gzip), which `/decks` preloads too.
- `/home`, `/decks` and `/edit/gt-brand` preload no docs module (the assertion added to
  `scripts/check-client-bundle.mjs`).
- Every docs page, its twin, `/docs/search.json`, `/docs/llms-full.txt` and `/sitemap.xml` are
  prerendered: 74 files on the build with `/home`. A click between docs pages fetches that page's
  body chunk and nothing else (one route, `docs.$.tsx`, serves `/docs` too).

## P2-D#1, the stack, the routes, the frame, three pages (`e9145288`)

Items 5.1, 5.2, 5.6. Files: `pnpm-workspace.yaml`, `apps/studio/package.json`, `pnpm-lock.yaml`,
`AGENTS.md`; `apps/studio/vite.config.ts`, `vite.deploy.config.ts`; `apps/studio/src/docs/` (source,
paths, markdown, search, search-index, search.test, llms); `apps/studio/src/components/docs/` (DocsShell,
DocsSidebar, DocsArticle, mdx, CopyPage, CopyPageMenu, SearchWindow, docs.css);
`apps/studio/src/routes/docs.tsx`, `docs.$.tsx`, `docs.{$}[.]md.ts`, `docs.search[.]json.ts`;
`apps/studio/src/components/home/PageFrame.tsx` (a `bar` slot); `apps/studio/content/docs/`
(Getting started, The editor, Presenting); `apps/studio/e2e/core/docs.spec.ts`;
`scripts/probes/core-matrix.mjs` (the driver line); `scripts/check-client-bundle.mjs` (the `/docs`
lines); the rows `help.docs.page`, `help.docs.prerendered`, `help.docs.nav-client`.

| Check | Reading | Load |
| --- | --- | --- |
| `tsc -b` | exit 0, 5 min 5 s, every lane's working files in | 126 to 168 |
| vitest, `apps/studio/src/docs/` | 110 of 110 (the content test, the generated pages, search) | 126 |
| Brand lint, enforce | 0 open findings, 22 accepted | 150 |
| Competitor guard | 9 of 9, the docs folder read | 150 |
| prettier --check | every file of the lane | 150 |
| Node-server build (`build.lock`, served on 4750) | exit 0; 74 prerendered files; `/docs` 42,981 B and `/docs/editor` 41,668 B, both with `public, max-age=0, must-revalidate` as `/home`; `/docs/nope` 404 in the docs layout; `/docs/` 307 to `/docs` | 112 to 175 |
| `check-client-bundle.mjs --base` on 4750 | 0 docs modules in the preloads of `/home` (12 chunks), `/decks` (10), `/edit/gt-brand` (8); `/docs` preloads 1,527,714 B over its 450,000 B ceiling, the tree's shared chunk 1,428,094 B of it; `/decks` 1,532,425 B and `/deck/gt-brand` 1,442,778 B over theirs as before; `/edit/gt-brand` 1,949,103 B under 2,000,000; the shared chunk is named `vendor-*.js`, so the largest chunk line is asserted and fails (requests.md P2-D-2) | 126 |
| `home.budget.*` on 4750 | `bytes-page`, `live-module`, `shared` passed; `bytes-first` read the document at 100,579 B over 100,000: other lanes' uncommitted `/home` edits (the document holds no docs byte; this lane's two links make it 184 B smaller) | 106 to 120 |
| Rows on the build | `help.docs.page` (2.6 min: every page at 1440 and 390 in both appearances, the bar, the groups, corners, no blurred shadow, the shared 8 px scrollbar, the Menu sheet, the miss), `help.docs.prerendered` (JavaScript off: title, description, headings and text equal; cache-control equal to `/home`'s), `help.docs.nav-client` (Next and a sidebar click: the page's body chunk alone, no `/_serverFn`, no static server function cache, no document): passed, zero retries | 117 to 300 |
| Rows on the dev server (4745) | the same three passed | 120 to 225 |

Deviations: the search window and its index, Copy Page with its menu, and the twin route land here,
because this push's page row draws the pill and Copy Page and a push may ship alone. `/docs` is
served by `docs.$.tsx` (no `docs.index.tsx`): two routes made the first click from `/docs` fetch the
other route's chunk as well. The loader shares one split chunk with the component and the miss
(`codeSplitGroupings: [['loader', 'component', 'notFoundComponent']]`): with the loader split apart,
the first click after a page load fetched the loader's chunk too (read on the dev server), and with
the miss left out of the split, the whole docs UI joined the shared entry chunk (read on the first
build: the shared chunk 1,523,812 B with the docs' classes in it). The server routes import the
docs' content inside their handlers for the same reason. The prerender runs four requests at a time
with three retries: at the default of one request per core two files timed out on a loaded machine
and the start plugin logged an unhandled rejection rather than failing the build. `/home` gains a
route rule of the same `public, max-age=0, must-revalidate` it answers on Vercel: the node server
answered the page itself with the `/home/**` rule's immutable year. Shiki is off (code is one ink on
its code surface).

Pictures (`d/`): `docs-1440-light.jpg`, `docs-1440-dark.jpg`, `docs-390-light.jpg`,
`docs-390-dark.jpg`, `docs-editr-*` (the miss, four), `docs-editor-390-*-sheet.jpg` (the Menu sheet).

## P2-D#2, every written page, the generated pages, the content test, the guard (`ce2d9edd`)

Items 5.3, 5.4, C29. The written pages of 5.3; `shortcuts.mdx` from the Keyboard shortcuts dialog's
data (`apps/studio/src/docs/shortcuts.ts`, compared by `generated-pages.test.ts`); the action
reference and the grammar page from `packages/agent/src/generate/docs.ts` (registered in
`contracts.ts`, which now generates the five contracts once and hands them to it; `docs.test.ts`);
`apps/studio/src/docs/content.test.ts`; `packages/lint/src/brand/competitor.ts` (`TEXT_ROOTS` gains
the docs folder; the text pattern reads `.mdx`).

| Check | Reading | Load |
| --- | --- | --- |
| `generate:contracts --check` | every committed contract current | 126 |
| `contracts.test.ts` | 4 of 4 with a 600 s timeout, 84 s of test time; the default 5 s timeout fails at this load whatever the push | 126 |
| `docs.test.ts`, content test, generated pages | 4 of 4; 110 of 110 | 126 |
| `help.docs.page` on every page | passed on the build and on the dev server | 117 to 300 |

Deviation: the reference pages land with their generator here, not in P2-D#5, so the sidebar draws its
three groups from this push. Pictures: `docs-editor-objects-*`, `docs-agents-cli-*`,
`docs-reference-deck-*`, each at 1440 and 390 in both appearances.

## P2-D#3, search (`51719156`)

The row `help.docs.search`; the code landed with P2-D#1. Passed on the build and on the dev server:
Cmd+K, Ctrl+K and / open the 8 px window on the dialog layer with its field focused; the index is
requested on the first open and once; "theme" lists Themes and brand kits first (the page's title
ranks before its sections); no hit holds Copy Page; Enter opens `/docs/themes`; Escape closes and puts
the focus back. Pictures: `docs-editor-*-search` at 1440 and 390 in both appearances.

## P2-D#4, the twins, Copy Page, llms.txt, the full text, the sitemap (`3dc0dd3d`)

`/llms.txt` gains a Documentation section listing every twin; `/docs/llms-full.txt` (83,875 B) holds
every written page; `/sitemap.xml` lists `/home` and the 35 docs pages; both prerendered. Rows
`help.docs.twin` and `help.docs.copy-page` passed on the build and on the dev server (every twin
`text/markdown; charset=utf-8` with its canonical `Link`, through a route rule per twin on the static
copy; no JSX, import or heading id; a callout a block quote, steps a numbered list, tabs one
subheading per tab, cards a list of links; the clipboard equal to the `.md` response; the menu a 6 px
plate on the popover layer with its rows and the OpenAPI row on reference pages). Pictures:
`docs-editor-*-copymenu` at 1440 and 390 in both appearances.

## P2-D#5, the action reference (`8f49c8d4`)

The row `help.docs.reference`. `/docs/reference` prints 194 actions: 181 on the command line, 170 as
MCP tools, 173 as HTTP endpoints and 178 in the page, each read from the contracts at generation. The
first dev server run failed on two driver faults (the OpenAPI template path counted, a markdown escape
in a heading), fixed in `docs.spec.ts`; the build's run passed.

## P2-D#6, the links

`copy.ts` (the navigation's and the footer's Documentation: `/docs`, no new tab, no external glyph),
`Help.tsx` (`/docs` in a new tab), `scripts/probes/core-walk/areas/help.mjs` (`/docs` answering 200
on the base). Rows: `help.docs.links` entered, `help.documentation-link` restated.

| Check | Reading | Load |
| --- | --- | --- |
| `help.docs.links` on the build | red on its robots clause alone (no `Sitemap:` line until requests.md P2-D-1 lands); the navigation and the footer link `/docs` with no glyph, `/sitemap.xml` lists `/home` and every page, Help's link opens `/docs` in a new tab | 135 |
| `core-gate --only probe --areas help` on 4750 | `help.documentation-link` "/docs -> 200"; the help area's 7 rows passed, verdict ok, zero retries | 104 to 150 |
| `copy.test.ts`, `brand-files.test.ts` | 34 of 34 | 126 |

Pictures: `home-nav-*` and `home-footer-*` at 1440 and 390 in both appearances, `help-dialog-1440-*`
in both appearances. The 390 Help picture timed out: the phone editor draws its own menu, not the
menu bar the driver opened.

## Requests

In `requests.md` under D: P2-D-1 (robots.txt's `Sitemap:` line, lane F's generator) and P2-D-2 (the
shared chunk named `vendor` once the docs' lazy chunks are in, which turns the bundle check's largest
chunk line from reported to asserted).

## Not done

- `help.docs.links` reads red on its robots clause until P2-D-1 lands.
- The `/docs` preload ceiling (450,000 B) cannot hold while the tree's shared chunk is 1,428,094 B;
  the docs' own script is about 99,600 B decoded of the 1,527,714 B a docs page preloads.
- No reading of the twins' headers or the `/docs/**` cache rule on Vercel: no preview was deployed.
