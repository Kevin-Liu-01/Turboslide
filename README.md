# Turboslide

Turboslide is a slides editor for the General Translation brand deck, built for designers and
agents alike. A deck is a block document: a manifest plus one JSON file per slide plus assets with
light and dark twins. A slide is a kind, a layout and typed blocks whose types are the GT deck
grammar's classes made explicit, with stable slug ids and no x or y coordinates. One
framework-free renderer turns the document into the same HTML and CSS the deck uses today, so the
browser editor, the static viewer, the Prototemplate `/deck` iframe, the CLI's screenshots and the
exporters draw from one source, and a render at revision N is the same pixels everywhere. Every
operation is a named action in one action table, from which the CLI subcommands, the MCP tool
list, the in-page window API, the HTTP routes, the OpenAPI document, the palette entries and the
skills' reference tables are generated. Export is a client of the renderer: it measures the
rendered slide in headless Chromium, emits PPTX and Google Slides natively where those formats can
carry the deck and as 2x rasters where they cannot, then renders the exported file back and diffs
it against the web render, so "identical" is a measured claim per revision. The editor's chrome is
the Prototemplate viewer shell ported as source.

## Layout

```
apps/
  studio/         TanStack Start app: the editor at /, the deck list, the viewer, the embed, the
                  agent HTTP surface, MCP over HTTP, the export downloads
  cli/            the `turboslide` binary, the file transport that needs no browser page
  render-worker/  the job queue the studio's renders and exports run on; the Docker image
                  turboslide-render-worker carries Chrome for Testing, LibreOffice and the fonts
packages/
  schema/         types, Zod schemas, validateDeck, applyWrite, diffDecks, migrations, the block
                  catalog, the rule table (rules.json), the action table
  store/          the file store: typed writes, the version log, leases, the watch channel, the
                  deck templates
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
  export/         scene extraction, PPTX (flatten and native), the OOXML writer, the verify loop,
                  the calibration constants, the Google Slides exporter (gslides/)
  native/         @turboslide/native: the napi addon per platform (npm/*) and the wasm module
  viewer/         React viewer: Stage, Sheet, slide, grid and book modes; Editor; MaterialMount
  chrome/         the Prototemplate shell ported as source: tokens.css (--pt-), Seg, Toolbar,
                  Sidebar, Inspector, ExportMenu, DeckName, SetupCard, AssetPicker, ...
crates/
  turboslide-native/  the Rust crate behind @turboslide/native (napi and wasm features)
docker/           render-worker.Dockerfile
tooling/          shared tsconfig, eslint and prettier configs
scripts/          check.mjs (the acceptance chain), judge-loop.mjs, check-client-bundle.mjs,
                  compare-to-shoot.mjs
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

`http://localhost:4321/` opens the editor on the newest deck, the way Google Slides opens a
document; when no deck exists under `decks/` it creates `GT brand deck` from the template and
opens that. The other pages: `/decks` (every deck, newest first, with the New deck form: a name
and the GT brand or blank template), `/edit/:deckId` (the editor: sidebar tree, stage, inspector,
the Cmd K palette with the Insert group of 15 slide templates, the Export menu with PPTX, Google
Slides and the standalone file), `/deck/:deckId` (the viewer: slide, grid and book modes),
`/embed/:deckId` (the framed embed). The agent surface: `GET /api/agent` (the manifest and the
instance facts), `POST /api/actions/:action?deck=<id>` (one action per request, `GET` for its
contract), `/mcp` (MCP over streamable HTTP, one deck per session), `/openapi.json`, `/llms.txt`
and `/llms-full.txt`. With `TURBOSLIDE_TOKEN` set those routes want `Authorization: Bearer`;
without it they serve localhost only. Renders and exports run on the render worker
(`apps/render-worker`), started by the studio in dev or as the Docker image in production.

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
slides, slide get|put|patch|insert|remove|move, block set|insert|remove|move, sections set
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
export pptx [ids|all] --mode flatten|native --theme light,dark --fonts exact [--verify] --out <dir>
export gslides [ids|all] --mode flatten|native --theme light [--dry-run] [--verify] --out <dir>
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
pnpm exec turboslide export gslides --deck decks/gt-brand --mode native --theme light --dry-run --out .turboslide/export-gslides
docker build -f docker/render-worker.Dockerfile -t turboslide-render-worker .
docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx --deck /work/decks/gt-brand --mode native --theme light,dark --fonts exact --verify --out /work/.turboslide/export-native
cargo test --manifest-path crates/turboslide-native/Cargo.toml
pnpm --filter @turboslide/native build && pnpm exec vitest run packages/effects/src/parity.test.ts
```

## Export

PPTX is exported in two modes. Flatten writes the 2x sheet raster per page with the text layer
behind it, so the page is pixel exact. Native writes every text as a text box in the embedded GT
Inter static faces, the frame as lines, the paper chips and plates as shapes, and the icons,
marks, dithers, diagrams and pictures as rasters at 2x or 3x; `--verify` renders the file back
through LibreOffice in the worker image and diffs every page and block against the web render at
the same revision. Google Slides works the same way over the Slides API: `--dry-run` builds and
validates every `batchUpdate` request without credentials and writes `requests.json`,
`images.json` and the report; the live run needs `TURBOSLIDE_GOOGLE_CREDENTIALS` to name an OAuth
client secrets file (the one-time Google Cloud setup and the steps are in
[docs/google-slides.md](docs/google-slides.md) and the Slides section of
[docs/M4-M5-STATUS.md](docs/M4-M5-STATUS.md)). The Export menu of the editor runs the same
`export.run` action and hands the files back as one-time download links. The standalone file
(`build`) is the deck as one HTML file under a byte budget.

Derived files land under `.turboslide/`, which is not committed. The rules for working in this
repository are in [AGENTS.md](AGENTS.md); reference documents are under [docs/](docs/README.md);
third-party licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT, provisionally (see AGENTS.md).
