# Turboslide

Turboslide is a slides editor for the General Translation brand deck, built for designers and
agents alike. A deck is a block document: a manifest plus one JSON file per slide plus assets with
light and dark twins. A slide is a kind, a layout and typed blocks whose types are the GT deck
grammar's classes made explicit, with stable slug ids and no x or y coordinates. One
framework-free renderer turns the document into the same HTML and CSS the deck uses today, so the
browser editor, the static viewer, the Prototemplate `/deck` iframe, the CLI's screenshots and the
exporters draw from one source, and a render at revision N is the same pixels everywhere. Every
operation is a named action in one action table, from which the CLI subcommands, the MCP tool
list, the in-page window API, the OpenAPI document, the palette entries and the skills' reference
tables are generated. Export is a client of the renderer: it measures the rendered slide in
headless Chromium, emits PPTX and Google Slides natively where those formats can carry the deck
and as 2x rasters where they cannot, then renders the exported file back and diffs it against the
web render, so "identical" is a measured claim per revision. The editor's chrome is the
Prototemplate viewer shell ported as source.

## Layout

```
apps/
  studio/       TanStack Start app: viewer, editor, presenter, agent HTTP surface, MCP over HTTP
  cli/          the `turboslide` binary, the file transport that needs no browser page
packages/
  schema/       types, Zod schemas, validateDeck, applyWrite, diffDecks, migrations, block catalog,
                rule ids, the action table
  theme/        gt-ink-paper: sheet.css and stage.css ported from head.html, tokens.ts, sprite.ts, copy.ts
  fonts/        InterVariable woff2 and its CSS
  render/       renderSlide, renderDeck, renderStandalone, renderThumb, renderStage
  effects/      Bayer dither, the two-tone pipeline, the 1-bit PNG encoder, plate metrics
  lint/         the grammar linter: static and rendered rules to findings
  headless/     Playwright driver over Chrome for Testing: readiness, overflow scan, screenshots
  import/       Prototemplate deck HTML to the document
  agent/        the action dispatcher and the contracts generator
  viewer/       React viewer: Stage, Sheet, slide, grid and book modes; standalone/ for the single file
  chrome/       the Prototemplate shell ported as source: tokens.css (--pt-), Seg, Toolbar, Sidebar, ...
tooling/        shared tsconfig, eslint and prettier configs
scripts/        check.mjs (the acceptance chain), check-client-bundle.mjs, compare-to-shoot.mjs
decks/          imported decks; decks/gt-brand is the GT brand deck (M1)
skills/         agent skills with generated reference tables (M1 stubs, M4 complete)
docs/           reference documents, see docs/README.md
```

Later milestones add `apps/render-worker`, `packages/{store,mcp,export,materials,native}` and
`crates/turboslide-native`.

## Commands (M1)

```
pnpm install                 install (pnpm 11.15.1 through corepack, Node 24)
pnpm dev                     the studio dev server, always on http://localhost:4321
pnpm generate-routes         write apps/studio/src/routeTree.gen.ts (run before typecheck)
pnpm generate:contracts      write the generated contract surfaces from the action table
pnpm typecheck               tsc -b over every package (project references)
pnpm test                    vitest, every package as a project
pnpm lint                    eslint with the shared config
pnpm build                   turbo run build: the studio bundle and the CLI bundle
pnpm check                   the M1 acceptance chain, in order (node scripts/check.mjs --list)

pnpm exec turboslide import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand --json
pnpm exec turboslide validate decks/gt-brand
pnpm exec turboslide render all --theme light,dark --scale 1 --out .turboslide/render --json
pnpm exec turboslide sheet all --cols 4 --thumb 480 --numbered --out .turboslide/sheet
pnpm exec turboslide lint all --json
pnpm exec turboslide build --out .turboslide/brand-deck.html --budget 16
```

Derived files land under `.turboslide/`, which is not committed. The rules for working in this
repository are in [AGENTS.md](AGENTS.md); reference documents are under [docs/](docs/README.md);
third-party licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT, provisionally (see AGENTS.md).
