# Turboslide

Turboslide is a slides editor for the General Translation brand deck, built for designers and
agents alike. A deck is a block document: a manifest plus one JSON file per slide plus assets with
light and dark twins. A slide is a kind, a layout and typed blocks whose types are the GT deck
grammar's classes made explicit, with stable slug ids. The grammar layouts carry no x or y
coordinates and are the templates; since the Google Slides parity round two (2026-09-12) every
slide is a canvas: the first drag, resize, rotation, reorder or insert converts it losslessly to
the freeform layout, where every object (the layout's own text, the photograph, the plate, the
mark, pictures, shaders, shapes, lines, tables, charts, diagrams) carries a position with rotation
and flip on the 1600 by 900 sheet and moves as it does in Google Slides, and the primitive blocks
take palette colors and typography fields (docs/freeform.md, docs/gslides-parity/SPEC-2.md). One
framework-free renderer turns the document into the same HTML and CSS the deck uses today, so the
browser editor, the static viewer, the Prototemplate `/deck` iframe, the CLI's screenshots and the
exporters draw from one source, and a render at revision N is the same pixels everywhere. Every
operation is a named action in one action table, from which the CLI subcommands, the MCP tool
list, the in-page window API, the HTTP routes, the OpenAPI document, the palette entries and the
skills' reference tables are generated. Export is a client of the renderer: it measures the
rendered slide in headless Chromium, emits one PPTX per theme, pixel identical in the perfect mode
and as editable text boxes in the native mode, then renders the exported file back and diffs it
against the web render, so "identical" is a measured claim per revision (docs/pptx.md). The
editor's chrome is the Prototemplate viewer shell ported as source.

## Layout

```
apps/
  studio/         TanStack Start app: the editor at /, the deck list, the viewer, the embed, the
                  agent HTTP surface, MCP over HTTP, the export downloads; deployed to Vercel
                  through Nitro (docs/hosting.md)
  cli/            the `turboslide` binary, the file transport that needs no browser page
  render-worker/  the job queue the studio's renders and exports run on; the Docker image
                  turboslide-render-worker carries Chrome for Testing, LibreOffice and the fonts
packages/
  schema/         types, Zod schemas, validateDeck, applyWrite, diffDecks, migrations, the block
                  catalog, the rule table (rules.json), the action table
  store/          the deck store behind one DeckStore type: FileStore over decks/, the tmp
                  overlay and the Vercel Blob mirror; typed writes, the version log, leases, the
                  watch channel, the deck templates, the seed, the store selection, the deck
                  bundle (zip, pack, unpack; docs/deck-transfer.md)
  theme/          gt-ink-paper: sheet.css and stage.css ported from head.html, tokens.ts, sprite.ts
  fonts/          InterVariable woff2 and its CSS; the static export font set under export/
  render/         renderSlide, renderDeck, renderStandalone, renderThumb, renderStage, the dia
                  templates on the half-pixel grid
  effects/        Bayer dither, the two-tone pipeline, the 1-bit PNG encoder, plate metrics, the
                  diffs and DSSIM, and the backend selection (native addon, wasm, TypeScript)
  materials/      the Paper Shaders catalog with uniform schemas and presets, the stage mount,
                  material.capture, the asset actions
  lint/           the grammar linter: static and rendered rules to findings; fixtures/index.json
  headless/       Playwright driver over Chrome for Testing: readiness, overflow scan, screenshots,
                  the site capture recipes (gt-site)
  import/         Prototemplate deck HTML to the document, with the composite block (zero escapes)
  agent/          the action dispatcher, the HTTP request rules, the contracts generator and its
                  generated/ outputs (manifest, describe, cli, mcp-tools, openapi, llms.txt)
  mcp/            the MCP server over stdio and over streamable HTTP
  export/         scene extraction, PPTX (perfect flatten and editable native), the page raster
                  policy, the OOXML post-process and package validation, the verify loop, the
                  calibration constants, export check
  native/         @turboslide/native: the napi addon per platform (npm/*) and the wasm module
  viewer/         React viewer: Stage, Sheet, slide, grid and book modes; Editor with Selection,
                  Gestures, Freeform, Marquee and Guides; MaterialMount
  chrome/         the Prototemplate shell ported as source: tokens.css (--pt-), Seg, Toolbar,
                  Sidebar, Inspector, ExportMenu, ExportReportCard, DeckName, AssetPicker,
                  Tooltip, InsertMenu, IconPicker, ConnectCard, ...
crates/
  turboslide-native/  the Rust crate behind @turboslide/native (napi and wasm features)
docker/           render-worker.Dockerfile
tooling/          shared tsconfig, eslint and prettier configs
scripts/          check.mjs (the acceptance chain), judge-loop.mjs, check-client-bundle.mjs,
                  compare-to-shoot.mjs, hosted-smoke.mjs (probes a deployment),
                  editor-depth-drive.mjs (drives a preview), tooltip-audit.mjs (every control
                  carries a tooltip)
decks/            decks/gt-brand is the GT brand deck; decks/templates/gt-brand is the template
                  record deck.create copies; decks/fixture is the test deck
skills/           the four agent skills with generated reference tables
docs/             reference and status documents, see docs/README.md
```

## Running it

```
pnpm install                 install (pnpm 11.15.1 through corepack, Node 24)
pnpm dev                     the studio dev server, always on http://localhost:4321
pnpm generate-routes         write apps/studio/src/routeTree.gen.ts (run before typecheck)
pnpm generate:contracts      write the generated contract surfaces from the action table
pnpm typecheck               tsc -b over every package (project references)
pnpm test                    vitest, every package as a project
pnpm lint                    eslint with the shared config
pnpm build                   turbo run build: the studio bundle and the CLI bundle
pnpm check                   the acceptance chain, in order (node scripts/check.mjs --list)
```

`http://localhost:4321/` opens the editor on the newest deck at once; when no deck exists under
`decks/` it creates `GT brand deck` from the template and opens that. The other pages: `/decks` (every deck, newest first, with the New deck form: a name and the GT
brand or blank template; Upload deck bundle; a row per deck with Open, Present, Export and
Download bundle; and the Connect card naming the `deck push` and `deck pull` commands for this
studio), `/edit/:deckId` (the editor: the slide sidebar in thumbnail density by default under the
head reading Turboslide, the stage with drag to move and reorder blocks within and across slots
and, on a freeform slide, drag, resize, marquee selection and the arrange bar, the inspector in
sections with icons and the color, typography and position controls, the toolbar's Insert menu
with the primitives, the Cmd K palette with the Insert group of 15 slide templates, the Export
menu with PPTX, the standalone file and the deck bundle, and a tooltip on every control),
`/deck/:deckId` (the viewer: slide, grid and book modes; `?present=1` opens it in present mode,
so `/deck/gt-brand?present=1` is the GT template presentation), `/embed/:deckId` (the framed
embed). The agent surface: `GET /api/agent` (the manifest and the
instance facts), `POST /api/actions/:action?deck=<id>` (one action per request, `GET` for its
contract), `/mcp` (MCP over streamable HTTP, one deck per session), `/openapi.json`, `/llms.txt`
and `/llms-full.txt`. With `TURBOSLIDE_TOKEN` set those routes want `Authorization: Bearer`;
without it they serve localhost only. In a checkout, renders and exports run on the render worker
(`apps/render-worker`), started by the studio in dev or as the Docker image over
`TURBOSLIDE_WORKER_URL`; hosted, they run inside the Vercel function (below).

## Hosting

The studio runs on Vercel at `https://turboslide.vercel.app` (the project `turboslide`, root
directory `apps/studio`; production deploys come from the push to `main`). The function carries the
GT deck and the templates as its seed, edits persist in the connected Vercel Blob store
(`turboslide-decks`), and renders and exports run inside the function on `chrome-headless-shell`
with every export synchronous (`POST /api/export/:deckId` answers the file, the report with
`Accept: application/json`, or a 302 to the stored copy). Without a Blob token the editor shows a
banner and edits live for the instance only. `node scripts/hosted-smoke.mjs <url>` probes a
deployment. `TURBOSLIDE_TOKEN` is set on the production and preview environments since
2026-09-11: the agent routes open to callers that send `Authorization: Bearer <token>`, the raw
export, render and bundle routes require it, and the editor reaches them through server
functions and tickets so the page never holds it. A local deck moves into the hosted studio with
`turboslide deck push <id> --to https://turboslide.vercel.app --token <TURBOSLIDE_TOKEN>` and back
with `deck pull` ([docs/deck-transfer.md](docs/deck-transfer.md); the token is saved per host after
the first call). [docs/hosting.md](docs/hosting.md) has the store, the deploy configuration and
the bearer token decision; [docs/hosting-chromium.md](docs/hosting-chromium.md) the browser;
[docs/HOSTED-STATUS.md](docs/HOSTED-STATUS.md) the hosting round's measured state;
[docs/EDITOR-DEPTH-STATUS.md](docs/EDITOR-DEPTH-STATUS.md) the editor depth round's.

## The CLI

`pnpm exec turboslide <command>` from the repo root, or `turboslide` inside the worker image.
Every write names the revision it read (`--base-revision`), carries an author (`--author`, agents
pass `agent:<runId>`) and goes through the same action table the editor and the agents use.

```
import <dir> --into <id>                 the Prototemplate deck HTML into decks/<id>/ (zero escapes)
validate [dir]                           parse, migrate and normalize; exit 2 on errors
info                                     title, theme, sections, counts, revision
deck create <name> --from gt-brand|blank a deck from the GT brand template (85 slides) or a title slide
deck rename <name>                       the deck title
deck pack <id> [--out <file.zip>]        decks/<id> as one bundle zip (deck.json, slides, assets, versions)
deck unpack <file.zip> [--as <id>]       a deck from a bundle; nothing is written when the bundle is refused
deck push <id> --to <url> [--token <t>]  pack decks/<id> and upload it to a hosted studio (the token is saved per host)
deck pull <id> --from <url> [--token <t>] download a deck's bundle from a hosted studio and unpack it
slides, slide get|put|patch|insert|remove|move, block set|insert|remove|move, sections set
slide set-layout <id> --type <layout>    the layout; to freeform every block takes the box it is drawn at, back is by geometry
slide to-canvas <id,id,...>              arrange slides by hand: every object takes its measured box (one headless page)
slide measure <id,id,...> --json         the boxes and text fit the conversion reads, writing nothing
slide background <ids> --color|--off, deck background, deck guides --add-vertical|--add-horizontal|--clear
block align|distribute|order <slideId>   arrange positioned blocks (--blocks, --edge | --axis | --move); block move --z
block group|ungroup|regroup|rotate|flip|crop|mask|reset-image|adjust|alt|shadow|autofit, block insert --pos
text style|case|insert|list|spacing|columns|indent, table merge|unmerge|insert-rows|insert-columns|delete-rows|delete-columns|distribute|cell-style
chart set-data|set-kind, shape set, line set (--connect-start, --connect-end, --detach), diagram insert --kind --count --style
asset add <file|url> --role --alt        a picture with its license fields; --two-tone runs the screen
asset capture <url> --theme both         a page at 1440 by 900 at 2x through a recipe (--recipe gt-site)
asset dither <id> | --all-two-tone --from-recorded --verify-cells
material list [<id>]                     the Paper Shaders catalog with uniforms and presets
material capture <id> --anchor <ms>      frozen frames at 3200 by 1800 as assets with recipe keys
version save|list|restore, lease <slideId>, diff [from [to]]
fix [ids|all] [--rule <id>]              apply the fix mutations of findings that carry one
render [ids|all] --theme light,dark --scale 1 --out <dir>
sheet [ids|all] --cols 4 --thumb 480 --numbered --out <dir> [--overlay lint|plate]
lint [ids|all] [--layers static|rendered|both] [--baseline]
lint --chrome --url <url> --widths 1440,1280,390 --themes light,dark
judge bundle [ids|all] --out <dir>       the evidence bundle for the judge loop (docs/judge-loop.md)
build --out <file> --budget 16           the standalone file under a byte budget
export pptx [ids|all] --mode flatten|native --theme light,dark|both --fonts exact [--embed-fonts] [--verify] --out <dir>
export check <file.pptx> [--python <bin>] [--no-quick-look]
fonts build [--check]                    cut the export font set (scripts/build-fonts.py)
generate                                 the contracts generator
mcp                                      the MCP server over stdio
```

The acceptance lines the milestone plan names, as they run here:

```
pnpm exec turboslide import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand --json
pnpm exec turboslide validate decks/gt-brand
pnpm exec turboslide render all --theme light,dark --scale 1 --out .turboslide/render --json
pnpm exec turboslide sheet all --cols 4 --thumb 480 --numbered --out .turboslide/sheet
pnpm exec turboslide lint all --json
pnpm exec turboslide build --out .turboslide/brand-deck.html --budget 16
pnpm exec turboslide judge bundle --out .turboslide/judge --json
node scripts/judge-loop.mjs --deck decks/gt-brand --bundle .turboslide/judge --out .turboslide/judge/findings.json --gate .turboslide/judge/gate.json
docker build -f docker/render-worker.Dockerfile -t turboslide-render-worker .
docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx --deck /work/decks/gt-brand --mode flatten --theme both --fonts exact --verify --out /work/.turboslide/export
docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx --deck /work/decks/gt-brand --mode native --theme light,dark --fonts exact --verify --out /work/.turboslide/export-native
pnpm exec turboslide export check .turboslide/export/gt-brand-light.pptx
cargo test --manifest-path crates/turboslide-native/Cargo.toml
pnpm --filter @turboslide/native build && pnpm exec vitest run packages/effects/src/parity.test.ts
```

## Export

PPTX is the one export target ([docs/pptx.md](docs/pptx.md)), in two modes. Perfect (`--mode
flatten`, the default) writes each page as its 2x sheet raster over an invisible, searchable text
layer, so the page is pixel identical; each raster travels in the smallest encoding that decodes
within 0.1 percent of the shot (a 1-bit PNG, a palette PNG, a JPEG for photographic pages, else
truecolor), no fonts are embedded, and the report's `perfect` flag says every page matched.
Editable text (`--mode native`) writes every text as a text box in the GT Inter static faces
(`--embed-fonts` embeds them), the frame as lines, the paper chips and plates as shapes, the box,
shape and rule primitives as native rectangles, rounded rectangles, ellipses, lines and arrows with
their fill and stroke, the text primitive as a text box, and the icons, marks, dithers, diagrams
and pictures as rasters at 2x or 3x; layout is identical within
3 px. Both modes name every slide after its title, give it a hidden title placeholder, keep the
speaker notes, write one file per theme plus `<deckId>-both.zip`, strip what PowerPoint is known to
repair and validate the package against its content types and relationships. `--verify` renders
the file back through LibreOffice in the worker image and diffs every page and block against the
web render at the same revision, with a QuickLook smoke check where macOS provides one;
`turboslide export check <file>` reopens any file with python-pptx and walks its zip. The Export
menu of the editor runs the same `export.run` action and hands the files back as one-time
download links, and its Download deck bundle entry hands the deck back as one zip. The standalone file (`build`) is the deck as one HTML file under a byte budget.

Derived files land under `.turboslide/`, which is not committed. The rules for working in this
repository are in [AGENTS.md](AGENTS.md); reference documents are under [docs/](docs/README.md);
third-party licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT, provisionally (see AGENTS.md).
