# Turboslide milestones

Companion to `SPEC.md` in this directory. Six milestones, each with scope, the files it creates, acceptance tests an agent can run without a human step, and an estimate in agent-hours. Estimates are judgments from the experiments and the three designs, not measurements; "agent-hours" counts the work of the builders and the integrator together, so a milestone that takes one day of wall time with four parallel builders is about thirty agent-hours. Every acceptance command is run from the repo root at `/Users/kevinliu/repos/Turboslide` on a machine with Node 24, pnpm 11 through corepack, and the Chrome for Testing 147 binary that `playwright-core` 1.62.1 installs; M2 onward also needs Docker for the render worker.

Ordering and the contradictions it resolves. Design A ordered editor, agent surface, assets, PPTX, Slides. Design B ordered editor, assets, agent surface, presenter, export. Design C ordered flatten export, editor, assets, native export and Slides, presenter and judge loop. The judges asked for A's document-first order with flatten PPTX export and the render worker pulled forward, MCP early, the contracts generator and the lint baseline in M1, and the chrome lint in M1. The order below is: the document, renderer, viewer and CLI (M1); the store, typed writes, MCP over stdio, flatten export with a verified report (M2); the editor and the window API (M3); the hosted agent surface, skills, fixers and the judge loop (M4); assets, effects, materials, native PPTX and the Rust crate (M5); Google Slides, the presenter and publishing (M6).

Ownership rule for every milestone: parallel builders own disjoint packages, the integrator runs the acceptance, and nothing is claimed done until the acceptance commands exit 0 and the report files named below exist.

## M1: the document, the renderer, the import, the viewer, the CLI

Estimate: about 30 agent-hours, one day of wall time with four parallel builders (schema and theme; render and import; headless, effects and CLI; studio and viewer) plus an integrator.

### Scope

1. Repo scaffold at `/Users/kevinliu/repos/Turboslide`: `pnpm-workspace.yaml` with the exact catalog from SPEC section 3.2 and `allowBuilds` for `esbuild`, `lightningcss`, `unrs-resolver`, `sharp`; `tsconfig.base.json` with project references; `turbo.json`; `AGENTS.md` with the parity chain and the dev-server rules; `THIRD_PARTY_NOTICES.md`; `tooling/*`; `scripts/check-client-bundle.mjs`; `scripts/compare-to-shoot.mjs`; CI that runs `pnpm check`.
2. `apps/studio` created with `pnpm dlx @tanstack/cli@latest create studio --framework React --package-manager pnpm --toolchain eslint --no-examples --no-git --no-intent --non-interactive` (https://tanstack.com/start/latest/docs/framework/react/quick-start; the `experiments/tanstack/turboslide-tanstack` scaffold is the reference, minus its probes), then edited: Tailwind removed, `devtools()` kept in every config and the component mounted under `import.meta.env.DEV`, `server: { forwardConsole: false }`, dev script `vite dev --port 4321`, `vite.deploy.config.ts` with `nitro()`.
3. `@turboslide/schema`: the types of SPEC section 4.2, the Zod schemas with inspector annotations, `parseText` and `serializeRuns`, `validateDeck`, `applyWrite` with inverse mutations, `diffDecks`, migrations, the block catalog, the rule id constants, and the action table with `label` and `transports` for every action (entries are declared now even where the implementation lands later; the dispatcher returns `not_implemented` for those).
4. `pnpm generate:contracts` in `@turboslide/agent`: writes the CLI option parsers, the MCP tool list JSON, `describe().actions`, `openapi.json`, `docs/grammar.md` and the four `skills/*/references/*.md` tables; a stale-file test compares committed outputs with a fresh generation.
5. `@turboslide/theme`: `sheet.css` ported from head:11-176 under `.ts-sheet`, `stage.css` from head:249-258, `tokens.ts` with the CSS parity test, `sprite.ts` with the 63 Heroicons and `gt-mark`, `copy.ts`; `@turboslide/fonts` with the InterVariable woff2 CSS.
6. `@turboslide/render`: `renderSlide`, `renderDeck`, `renderStandalone`, `renderThumb`, `renderStage`, slot geometry, the GT word transform, `RasterRef` emission, snapshot tests per block type in both themes.
7. `@turboslide/import` and `decks/gt-brand/` produced by `turboslide import`, with `import-ids.json`, `import-report.json` and `known-findings.json` (the severity 3 findings the current deck actually has, reviewed once and committed as the baseline).
8. `@turboslide/headless`: launch config with the Metal and SwiftShader flag sets, the readiness wait, the overflow scan, 1x and 2x screenshots, the `RenderRecord` with `renderer` and `rasters`. `@turboslide/effects`: `bayer8`, `ditherRamp`, the TypeScript `twoTone` pipeline with the pinned Lanczos3, the tone LUT, the 1-bit PNG encoder, the plate metrics.
9. `@turboslide/lint`: every static rule of SPEC section 7.7 and the rendered rules `sheet/overflow`, `type/floor-15`, `type/weight-cap`, `type/face`, `rows/two-lines`, `sheet/rail-touch`; `lint --chrome` as the `lint-lines.mjs` port in shell mode.
10. `apps/cli`: `import`, `validate`, `info`, `slides`, `slide get`, `render`, `sheet` (with the JSON cell map), `lint`, `build`, `generate` (an alias for the contracts generator). No writes yet beyond `import`.
11. `apps/studio` routes `/`, `/deck/:deckId` (slide, grid, book, present; theme; keys; `#NN` and `#s/<slideId>` hashes; the sidebar tree in outline density; the toolbar with the mode Seg; the hover preview layer over live clones), `/embed/:deckId` (the `gt-theme` and `gt-deck-slide` protocol), `/openapi.json`, `/llms.txt`, `/api/agent`. No editing.
12. `@turboslide/viewer` with `standalone/` (the tail.html port) used by `renderStandalone`; `@turboslide/chrome` with `tokens.css` verbatim (`--pt-`), `ToolButton`, `Seg`, `Toolbar`, `Sidebar`, `ListRow`, `SidebarFilter`, `PreviewLayer`, `HelpCard`, `Toast`, `Progress`, `ThemeButton`, `useShellKeys`, and `PORTED_FROM.json`.

### Files

`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`, `AGENTS.md`, `THIRD_PARTY_NOTICES.md`, `tooling/{tsconfig,eslint-config,prettier-config}/`, `scripts/check-client-bundle.mjs`, `scripts/compare-to-shoot.mjs`, `apps/studio/{vite.config.ts,vite.deploy.config.ts,tsr.config.json,src/router.tsx,src/routes/__root.tsx,src/routes/index.tsx,src/routes/deck.$deckId.tsx,src/routes/embed.$deckId.tsx,src/routes/api/agent.ts,src/routes/openapi.json.ts,src/routes/llms.txt.ts}`, `apps/cli/src/{main.ts,commands/*.ts}`, `packages/schema/src/{deck,text,blocks,assets,mutations,findings,render,export,actions,validate,reduce,diff,catalog,rules,migrations}.ts`, `packages/theme/src/gt-ink-paper/{sheet.css,stage.css}`, `packages/theme/src/{tokens,sprite,copy}.ts`, `packages/fonts/src/inter.css`, `packages/render/src/{slide,deck,standalone,thumb,stage,geometry,text,blocks/*.ts}`, `packages/import/src/{parse,map,ids,report}.ts`, `packages/headless/src/{launch,ready,measure,screenshot,record}.ts`, `packages/effects/src/{bayer,ramp,two-tone,tone,resample,png1,metrics}.ts`, `packages/lint/src/{static/*.ts,rendered/*.ts,chrome.ts,run.ts}`, `packages/agent/src/generate/{cli,mcp,openapi,describe,skills,grammar}.ts`, `packages/viewer/src/{Stage,Sheet,SlideView,GridView,BookView,theme,keys,hash}.tsx`, `packages/viewer/standalone/runtime.ts`, `packages/chrome/src/{tokens.css,ToolButton,Seg,Toolbar,Sidebar,ListRow,SidebarFilter,PreviewLayer,HelpCard,Toast,Progress,ThemeButton}.tsx`, `packages/chrome/PORTED_FROM.json`, `decks/gt-brand/{deck.json,slides/*.json,assets/*,import-ids.json,import-report.json,known-findings.json}`, `skills/*/SKILL.md` (stubs) and `skills/*/references/*.md` (generated), `docs/grammar.md` (generated).

### Acceptance

`pnpm check` runs all of the following in order and exits 0.

```
pnpm install --frozen-lockfile
pnpm exec tsr generate --config apps/studio/tsr.config.json
pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md apps/studio/src/routes/openapi.json.ts
pnpm exec tsc -b
pnpm test
pnpm build && node scripts/check-client-bundle.mjs apps/studio/dist
pnpm exec turboslide import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand --json > .turboslide/import.json
node -e "const r=require('./.turboslide/import.json'); if(r.slides!==85||r.sections!==8||r.htmlBlocks>4) process.exit(1)"
pnpm exec turboslide validate decks/gt-brand
pnpm exec turboslide render all --theme light,dark --scale 1 --out .turboslide/render --json
node -e "const r=require('./.turboslide/render/render.json'); if(r.length!==170||r.some(x=>x.pageErrors.length)) process.exit(1)"
node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot /Users/kevinliu/repos/Prototemplate/deck --max-mismatch 0.005 --skip-html-escapes
pnpm exec turboslide sheet all --cols 4 --thumb 480 --numbered --out .turboslide/sheet
node -e "const fs=require('fs'); for (const t of ['light','dark']) { fs.statSync('.turboslide/sheet/sheet-'+t+'.png'); const m=JSON.parse(fs.readFileSync('.turboslide/sheet/sheet-'+t+'.json')); if(m.cells.length!==85) process.exit(1) }"
pnpm exec turboslide lint all --json > .turboslide/lint.json
pnpm exec turboslide build --out .turboslide/brand-deck.html --budget 16
pnpm exec playwright test apps/studio/e2e/viewer.spec.ts
pnpm exec turboslide lint --chrome --url http://localhost:4321/deck/gt-brand --widths 1440,1280,390 --themes light,dark
```

What each line proves:

- `tsr generate` before `tsc -b`: the route tree exists before type checking (measured: three errors otherwise, tanstack report section 5.1).
- `generate:contracts` followed by `git diff --exit-code`: every generated surface is committed and current.
- `check-client-bundle.mjs`: the server-only marker appears in 0 files under `dist/client` and no Solid chunk appears in the server output (tanstack report sections 5.2 and 5.5).
- `import`: 85 slides, 8 sections, at most 4 `html` blocks, each with its reason in `import-report.json`.
- `render`: 170 PNGs and 170 `RenderRecord`s with zero page errors; the overflow list matches the current `shoot-slide.mjs` report for every slide.
- `compare-to-shoot.mjs`: for every non-escape slide, pixelmatch at threshold 0.1 between the Turboslide render and a fresh `shoot-slide.mjs` render on the same Chromium build is under 0.5 percent.
- `sheet`: two sheets at 4 columns and 480 px with section labels, each with a JSON cell map of 85 cells.
- `lint`: exits 0 because every severity 3 finding is in `known-findings.json`; the report is the deliverable, and the known list is the honest state of the deck.
- `build`: a file under 16 MB that opens in Prototemplate's `/deck` iframe and answers the `gt-theme` message (checked by `viewer.spec.ts` against `/embed/gt-brand` too).
- `viewer.spec.ts`: a Playwright test opens `/deck/gt-brand`, presses `g`, `b`, `d`, `p`, types `1`, `2`, Enter, and asserts the mode, theme, present state and active slide; `/embed/gt-brand` posts `{ type: 'gt-deck-slide', n }` on navigation and applies `{ type: 'gt-theme' }`.
- `lint --chrome`: the ported line-law auditor passes on the viewer shell at three widths in both themes with the list toggled and the grid and book modes on (dev server started by the test harness on 4321 and stopped afterwards; its output goes to a size-capped log).

## M2: the store, typed writes, MCP over stdio, flatten PPTX with a verified report

Estimate: about 40 agent-hours, one week of wall time with three parallel builders (store and CLI writes; scene and PPTX; render worker, fonts and verify).

### Scope

1. `@turboslide/store`: the `DeckStore` interface and `FileStore` (revision, `baseRevision` check, versions under `versions/`, a watch channel over `fs.watch`, leases as advisory records).
2. CLI typed writes: `slide put|patch|insert|remove|move`, `block set|insert|remove|move`, `sections set`, `version save|list|restore`, `lease`, `diff` (mutation log in prose, `--render` with before and after crops), all with `--base-revision` and `--author`; `fix` for findings that carry `fix`.
3. `@turboslide/mcp` over stdio (`turboslide mcp`) exposing every action whose transports include `mcp` and that is implemented, with the resources of SPEC section 7.3 and the `deck_review` prompt; render tools return image content.
4. `@turboslide/export`: `scene/measure.ts`, `pptx/` in flatten mode plus native text for `heading`, `paragraph`, `credit`, `rows`, `plain`, `panel`, lines and rects (the archetypes measured in the pptx report), `ooxml/` (kern strip, font parts, `grpSp`, stored media), `verify/` (LibreOffice to PDF to PNG, pixelmatch with per-block budgets, EMU read-back), `calibration/` with the calibration deck and `calibration.json`, and the typed `ExportReport`.
5. `@turboslide/fonts/export` built by `scripts/build-fonts.py` and committed, with `fonts.json`; `turboslide fonts build` as the command.
6. `apps/render-worker` with `docker/render-worker.Dockerfile` (Node 24, Chrome for Testing 147, LibreOffice 26.8, poppler, the export fonts), a job queue (`render`, `sheet`, `export`, `verify`), and the studio facade routes `/api/render/:slideId` and `/api/export/:deckId`.
7. The `export/non-native` lint rule; the `--exclude-share-alike` export flag; `docs/export-verification.md` with the manual PowerPoint checklist.

### Files

`packages/store/src/{store,file-store,watch,lease}.ts`, `apps/cli/src/commands/{slide,block,sections,version,lease,diff,fix,export,fonts,mcp}.ts`, `packages/mcp/src/{server,tools,resources,prompts,stdio}.ts`, `packages/export/src/scene/measure.ts`, `packages/export/src/pptx/{build,masters,text,lines,images,notes}.ts`, `packages/export/src/ooxml/{kern,fonts,groups,zip}.ts`, `packages/export/src/verify/{libreoffice,diff,geometry,report}.ts`, `packages/export/src/calibration/{deck.ts,calibration.json}`, `packages/fonts/export/*.ttf`, `packages/fonts/export/fonts.json`, `scripts/build-fonts.py`, `scripts/requirements.txt`, `apps/render-worker/src/{main,queue,jobs/*.ts}`, `docker/render-worker.Dockerfile`, `apps/studio/src/routes/api/render.$slideId.ts`, `apps/studio/src/routes/api/export.$deckId.ts`, `docs/export-verification.md`.

### Acceptance

```
pnpm check
docker build -f docker/render-worker.Dockerfile -t turboslide-render-worker .
docker run --rm turboslide-render-worker fc-list | grep -c "GT Inter"          # 12 or more faces listed
pnpm exec turboslide slide get content-rule --json > .turboslide/slide.json
pnpm exec turboslide block set content-rule#list /size 22 --base-revision $(node -e "console.log(require('./decks/gt-brand/deck.json').revision)") --author agent:m2-accept --json
pnpm exec turboslide block set content-rule#list /size 24 --base-revision 0 --json; test $? -eq 1        # stale baseRevision is rejected with the current document
pnpm exec turboslide version save -m "m2 acceptance" --json && pnpm exec turboslide version list --json | node -e "const v=JSON.parse(require('fs').readFileSync(0)); if(!v.some(x=>x.author.kind==='agent'&&x.author.runId==='m2-accept')) process.exit(1)"
pnpm exec turboslide diff --staged --render --out .turboslide/diff --json
pnpm exec turboslide lint content-rule --json | node -e "const f=JSON.parse(require('fs').readFileSync(0)); if(!f.some(x=>x.rule==='export/non-native')) process.exit(1)"
node apps/cli/e2e/mcp-stdio.mjs                                          # an MCP client over stdio lists tools, inserts a slide, renders it, receives a finding, patches, re-lints, saves a version
docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx --deck /work/decks/gt-brand --mode flatten --theme light,dark --fonts exact --verify --out /work/.turboslide/export
node -e "const r=require('./.turboslide/export/export-report.json'); if(!r.passed||!r.geometryInBounds||r.slides.some(s=>s.verify.fraction>0.001)) process.exit(1)"
docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx --deck /work/decks/gt-brand --mode native --theme light --fonts exact --verify --out /work/.turboslide/export-native
node -e "const r=require('./.turboslide/export-native/export-report.json'); const bad=r.slides.filter(s=>s.raster.length===0&&s.verify.blocks.some(b=>!b.ok)); if(bad.length) { console.error(bad.map(s=>s.slideId)); process.exit(1) }"
pnpm exec turboslide fonts build --check && .turboslide/venv/bin/python3 -c "from pptx import Presentation; p=Presentation('.turboslide/export/gt-brand-light.pptx'); assert len(p.slides)==85"
pnpm format:check
```

What each line proves: the typed write path works over files with `baseRevision` and a typed `Author`; a stale write returns the current document and exit 1; versions record agent authors; `diff --render` writes before and after crops; `export/non-native` lists the raster blocks per slide; the MCP stdio server completes a create, render, lint, patch, save cycle with no browser page and exports the calibration deck through `deck_export`; flatten export verifies under 0.1 percent mismatch per slide with geometry in bounds; native export passes the per-block budgets (3 px horizontal, 1 px vertical for text, 1 px for lines) on every slide whose blocks are all native-capable and lists the raster blocks for the rest; the files reopen in python-pptx with 85 slides through the repository's interpreter (`turboslide fonts build --check` creates `.turboslide/venv` from `scripts/requirements.txt`, which pins python-pptx; the system `python3` has no `pptx` module and nothing is installed globally); the tree is formatted (`pnpm check` runs the same prettier check as its last step). The manual PowerPoint checklist is scheduled, not automated, and its first run records EOT acceptance, the first-baseline constant and `custGeom` counters in `calibration.json`.

## M3: the editor and the window API

Estimate: about 60 agent-hours, two weeks of wall time with three parallel builders (chrome and inspector; stage, overlay and direct manipulation; window API, undo and versions).

### Scope

1. `/edit/:deckId` (`ssr: false`): the layout of SPEC section 6.1, the sidebar tree with drag reorder and the density Seg backed by render-worker thumbnails (live clone fallback), the toolbar with the `Edit | View` Seg, Twin, Lint and Source, the ⌘K palette with its five groups, the status chip.
2. The inspector generated from the Zod annotations, the source drawer with CodeMirror 6 and JSON Schema completion, the lint panel with Fix, Versions and History sections.
3. Selection and the overlay, the direct manipulation table of SPEC section 6.4 except diagram editing, inline text editing with the run toolbar, undo as forward writes with inverse mutations, `version.restore` as a mutation, autosave through `writeDeck`, the conflict card, the external revision banner, advisory leases with the sidebar dot.
4. `window.turboslide.studio` in `@turboslide/agent` with the three owners (editor, viewer per mode, source drawer as delegating owner), accessible labels plus `data-control` ids, the lifetime test and the ready event.
5. Static thumbnails for the grid and sidebar from the render worker; the twin view; the remaining rendered lint rules (`dia/label-clearance`, `lines/law`, `contrast/both-themes`, `layout/empty-half`, `layout/pair-gaps`, `layout/columns-aligned`, `asset/stretched`, `sheet/thumb-legible`).

### Files

`apps/studio/src/routes/edit.$deckId.tsx`, `apps/studio/src/server/{write,lint,render}.ts`, `apps/studio/src/workers/dither.worker.ts`, `packages/chrome/src/{Palette,Inspector,InspectorControl,SourceDrawer,Overlay,StatusChip,TwinStage}.tsx`, `packages/chrome/src/inspector/{seg,select,stepper,check,text,icon,asset}.tsx`, `packages/viewer/src/{Editor,Selection,Gestures}.tsx`, `packages/agent/src/window/{registry,adapter,controls,invoke,ready}.ts`, `packages/agent/src/window/__tests__/lifetime.test.tsx`, `packages/lint/src/rendered/{clearance,lines,contrast,layout,stretched,thumb}.ts`, `apps/studio/e2e/{editor.spec.ts,window-api.spec.ts,undo.spec.ts}`.

### Acceptance

```
pnpm check
pnpm exec playwright test apps/studio/e2e/window-api.spec.ts
pnpm exec playwright test apps/studio/e2e/editor.spec.ts
pnpm exec playwright test apps/studio/e2e/undo.spec.ts
pnpm exec turboslide lint --chrome --url http://localhost:4321/edit/gt-brand --widths 1440,1280,390 --themes light,dark --states inspector,source,palette,twin
pnpm exec vitest run packages/agent/src/window
```

What each spec proves: `window-api.spec.ts` seeds a deck only through `applySource`, calls `set('list: Size', 22)` and `set('block.list.size', 22)` and asserts both are one call, reads `readSource()` back and sees `size: 22`, invokes `render.slide` and asserts the decoded PNG's row boxes moved, and asserts that `describe().actions` equals the generated list. `editor.spec.ts` drags the key column edge of a `rows` block and asserts `block.set /key` landed on a snap value, drags the column seam and asserts `/layout/ratio`, edits text inline with a bare `GT` and asserts the mark rendered and the document kept the letters, opens the source drawer and asserts Apply and `applySource` produce identical mutation logs for the same edit, and asserts the lint panel's Fix applies a `fix` and clears the finding. `undo.spec.ts` performs ten mutations, presses `⌘Z` ten times and asserts the document is byte identical to the start and the server log has twenty forward writes. `lint --chrome` passes with the inspector, source drawer, palette and twin view open. The vitest pins adapter lifetime across re-renders and asserts the ready event fires once per owner change.

## M4: the hosted agent surface, skills, fixers and the judge loop

Estimate: about 40 agent-hours, one week of wall time with two parallel builders (HTTP and MCP over HTTP; skills, judge loop and fixers).

### Scope

1. `/api/actions/:action` for every action whose transports include `http`, `/api/agent` manifest with execution rules, `/openapi.json` and `/llms.txt` served from the generated files, `/mcp` over streamable HTTP with the `view.*` tools when a studio session is attached, bearer token authentication off `localhost`, request size caps, `createCsrfMiddleware()` on server functions.
2. Leases enforced for agent writes with `force` and the holder in the 409; the store watch channel bringing external writes into the open editor within one second.
3. The four `SKILL.md` files completed with their completion sections; the skills test; `AGENTS.md` finalized.
4. `docs/judge-loop.md`; `turboslide judge bundle`; `turboslide fix` covering every rule with `fix`; a harness script `scripts/judge-loop.mjs` that runs render, sheet, lint, six judges, skeptics, fixers and the gate against `decks/gt-brand` using the workflow harness's agent runner; `Finding.source` populated with `judge:<lens>` and `skeptic`.

### Files

`apps/studio/src/routes/api/actions.$action.ts`, `apps/studio/src/routes/mcp.ts`, `apps/studio/src/server/auth.ts`, `packages/agent/src/http/{dispatch,auth,errors,manifest}.ts`, `packages/mcp/src/http.ts`, `packages/store/src/lease.ts` (enforcement), `apps/cli/src/commands/judge.ts`, `scripts/judge-loop.mjs`, `docs/judge-loop.md`, `skills/turboslide-{create,api,studio,verify}/SKILL.md`, `packages/agent/src/__tests__/skills.test.ts`, `packages/agent/src/__tests__/coverage.test.ts`, `apps/studio/e2e/agent-http.spec.ts`.

### Acceptance

```
pnpm check
pnpm exec vitest run packages/agent/src/__tests__/skills.test.ts packages/agent/src/__tests__/coverage.test.ts
pnpm exec playwright test apps/studio/e2e/agent-http.spec.ts
node apps/cli/e2e/mcp-http.mjs
pnpm exec turboslide judge bundle --out .turboslide/judge --json
node scripts/judge-loop.mjs --deck decks/gt-brand --bundle .turboslide/judge --out .turboslide/judge/findings.json --gate .turboslide/judge/gate.json
node -e "const g=require('./.turboslide/judge/gate.json'); const f=require('./.turboslide/judge/findings.json'); if(typeof g.verdict!=='string'||f.some(x=>!x.slideId||!x.source)) process.exit(1)"
```

What each line proves: the coverage test asserts every action has a test and a doc row and that the MCP tool list, `describe().actions`, the OpenAPI paths, the CLI parsers and the skill tables agree by name; `agent-http.spec.ts` posts a `slide.update` with a stale `baseRevision` and receives 409 with the current document, posts with a held lease and receives 409 with the holder's name, posts with `force` and succeeds, posts an unknown field and receives `unknown_field` with a pointer, posts without a token to a non-localhost host and receives 401, and asserts the open editor shows the agent's write with the agent as author within one second; `mcp-http.mjs` repeats the M2 stdio cycle over `/mcp` and drives `deck_goto_slide` in an attached viewer; the judge loop produces `findings.json` whose every entry carries `slideId`, `blockId` where rendered, a pixel box where rendered, and `source`, and a `gate.json` verdict, with no human step.

## M5: assets, effects, materials, grammar completion, native PPTX, the Rust crate

Estimate: about 50 agent-hours, two weeks of wall time with three parallel builders (capture and photograph intake; materials and dither tooling; native PPTX, the `composite` block and the crate).

### Scope

1. `asset.capture` with per-site recipes (`gt-site`: theme key, `cookie_consent=no`, the `dark` class, reduced motion, settle) and identical-region detail crops; photograph intake with license, share-alike flag and candidate sheets (`sheet --overlay plate --kind opener|mood`).
2. The dither tool in the inspector with the live preview from `dither.worker.ts` and the plate clearance metrics; `asset.dither` and `asset.add --two-tone` in the CLI; the `picture/*` and `asset/*` lints complete.
3. `@turboslide/materials`: the Paper Shaders catalog with uniform schemas and brand palette presets, main-thread mount in the stage, `material.capture` with three anchors and recipe keys and the renderer string, LICENSE and NOTICE shipping; the `proto:*` engines if open question 9 says yes.
4. Grammar completion: the `composite` block, declared `dia` templates (flow, scale, layers, timeline, before and after, iso plate) with Alt-drag editing on the half-pixel grid, `dia/*` lints for declared data, the importer upgraded to emit `composite` so the escape count reaches zero.
5. Native PPTX for every block type (icons, marks, dithers, frames, diagrams and `html` as PNG at 2x or 3x; two-tone twins regenerated at 2x and 3x from the one-bit image); the export dialog in the editor with mode, theme, font set and `--headings raster`.
6. `crates/turboslide-native` with the `napi` and `wasm` features, `packages/native` with per-platform optional dependencies and the wasm build, `@turboslide/effects` selecting native, wasm or TypeScript, the cell-identity parity test, dssim in the verify loop.

### Files

`packages/headless/src/capture/{recipes,gt-site,region}.ts`, `apps/cli/src/commands/{asset,material}.ts`, `packages/materials/src/{catalog,paper,proto,mount,capture,presets}.ts`, `packages/chrome/src/inspector/{dither,material}.tsx`, `packages/schema/src/blocks/composite.ts`, `packages/render/src/blocks/composite.ts`, `packages/import/src/composite.ts`, `packages/render/src/dia/{templates,snap}.ts`, `packages/lint/src/static/{picture,asset,dia}.ts`, `packages/export/src/pptx/rasters.ts`, `packages/chrome/src/ExportDialog.tsx`, `crates/turboslide-native/{Cargo.toml,src/*.rs}`, `packages/native/{index.ts,npm/*/package.json,wasm/}`, `packages/effects/src/{select,parity.test.ts}`, `decks/gt-brand/assets/*` (twins regenerated where parameters exist).

### Acceptance

```
pnpm check
pnpm exec turboslide import /Users/kevinliu/repos/Prototemplate/deck --into gt-brand-reimport --json | node -e "const r=JSON.parse(require('fs').readFileSync(0)); if(r.htmlBlocks!==0) process.exit(1)"
node -e "const a=require('./decks/gt-brand/import-ids.json'), b=require('./decks/gt-brand-reimport/import-ids.json'); if(JSON.stringify(a)!==JSON.stringify(b)) process.exit(1)"
pnpm exec turboslide asset dither --all-two-tone --from-recorded --verify-cells --json | node -e "const r=JSON.parse(require('fs').readFileSync(0)); const bad=r.filter(x=>x.mismatchedCells>0&&!x.missingParameter); if(bad.length) process.exit(1)"
pnpm exec turboslide material capture paper:liquid-metal --uniforms decks/gt-brand/assets/liquid-metal-diamond.recipe.json --anchor 5500 --two-tone --plate lower-left --json | node -e "const r=JSON.parse(require('fs').readFileSync(0)); if(r.metrics.plateClear.litUnder!==0||r.source.recipeKey!==require('./decks/gt-brand/deck.json').assets['liquid-metal-diamond'].source.recipeKey) process.exit(1)"
pnpm exec turboslide asset capture https://generaltranslation.com/docs --theme both --scale 2 --recipe gt-site --json | node -e "const a=JSON.parse(require('fs').readFileSync(0)); if(!a.twins.light||!a.twins.dark||a.size[0]!==2880) process.exit(1)"
cargo test --manifest-path crates/turboslide-native/Cargo.toml
pnpm --filter @turboslide/native build && pnpm exec vitest run packages/effects/src/parity.test.ts
docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx --deck /work/decks/gt-brand --mode native --theme light,dark --fonts exact --verify --out /work/.turboslide/export-native
node -e "const r=require('./.turboslide/export-native/export-report.json'); if(!r.passed||r.slides.some(s=>s.verify.blocks.some(b=>!b.ok))) process.exit(1)"
pnpm exec turboslide lint all --json | node -e "const f=JSON.parse(require('fs').readFileSync(0)); const rules=new Set(f.map(x=>x.rule)); require('./packages/schema/src/rules.json').forEach(r=>{ if(!require('./packages/lint/fixtures/index.json')[r]) { console.error('no fixture for', r); process.exit(1) } })"
```

What each line proves: a re-import yields zero `html` blocks and identical ids; every two-tone twin with recorded parameters is reproduced cell for cell (assets whose prose record lacks a parameter are listed as `missingParameter`, which is the documented residual); the liquid metal opener captured at its recorded uniforms and anchor reproduces its recipe key and clears the plate; a site capture lands as one asset with twins; the Rust crate passes its own tests, and the TypeScript, napi and wasm implementations light identical cells on the twelve fixtures; native PPTX passes the per-block budgets on all 85 slides in both themes with the verify loop's text gate on dssim; every lint rule has a fixture.

## M6: Google Slides, the presenter, publishing

Estimate: about 50 agent-hours, two weeks of wall time with three parallel builders (Slides export; presenter; build targets and publishing), gated on open questions 3 and 11.

### Scope

1. `@turboslide/export/gslides` native and flatten: OAuth with `drive.file`, signed Cloud Storage URLs with a 15 minute TTL, as few `batchUpdate` calls per deck as the payload allows, notes in a second call, `writeControl.requiredRevisionId`, quota pacing with backoff, `getThumbnail` verification, the Slides calibration constants (normal pitch, default inset, minimum honored line weight, zero-height lines, `pageSize` read back), `--headings raster`.
2. `/present/:deckId` with notes, timer, next slide, the audience window, `BroadcastChannel` sync, `view.goto` from MCP; live materials on the audience screen behind GPU detection with the frame fallback if open question 11 says yes.
3. Build targets from the model: the standalone file, the sub-16 MB artifact copy with recorded flag values, the framed `/deck` embed; republishing to the artifact URL and the Prototemplate deploy; the surfaces index fed from the manifest; PDF export of book mode through Chromium print.
4. `SqliteStore` behind `DeckStore` with identity for `Author` if open question 1 says shared decks are wanted.

### Files

`packages/export/src/gslides/{auth,build,requests,images,notes,thumbs,pace}.ts`, `packages/export/src/calibration/slides.json`, `apps/studio/src/routes/present.$deckId.tsx`, `packages/viewer/src/Presenter.tsx`, `packages/viewer/src/presenter/{channel,timer}.ts`, `apps/cli/src/commands/{publish,pdf}.ts`, `packages/store/src/sqlite-store.ts`, `apps/studio/e2e/presenter.spec.ts`, `docs/publishing.md`.

### Acceptance

```
pnpm check
TURBOSLIDE_GOOGLE_CREDENTIALS=$HOME/.config/turboslide/credentials.json pnpm exec turboslide export gslides --deck decks/gt-brand --mode native --theme light --verify --out .turboslide/export-gslides --json
node -e "const r=require('./.turboslide/export-gslides/export-report.json'); if(!r.presentationId||!r.passed||r.slides.some(s=>s.verify.fraction>0.03)) process.exit(1)"
TURBOSLIDE_GOOGLE_CREDENTIALS=$HOME/.config/turboslide/credentials.json pnpm exec turboslide export gslides --deck decks/gt-brand --mode flatten --theme dark --verify --out .turboslide/export-gslides-flat --json
node -e "const r=require('./.turboslide/export-gslides-flat/export-report.json'); if(!r.passed||r.slides.some(s=>s.verify.fraction>0.001)) process.exit(1)"
pnpm exec playwright test apps/studio/e2e/presenter.spec.ts
pnpm exec turboslide build --out .turboslide/brand-deck.html --artifact .turboslide/deck-16mb.html --budget 16 --json | node -e "const r=JSON.parse(require('fs').readFileSync(0)); if(r.artifactBytes>16000000||r.sections!==8||r.slides!==85) process.exit(1)"
pnpm exec turboslide export pdf --deck decks/gt-brand --theme light --out .turboslide/gt-brand-light.pdf && python3 -c "import subprocess; assert b'Pages: 85' in subprocess.run(['pdfinfo','.turboslide/gt-brand-light.pdf'],capture_output=True).stdout"
```

What each line proves: a native Slides export of the deck completes within the per-user quota with backoff, its `LARGE` thumbnails diff within the calibrated 3 percent per-slide budget and the report names every raster block and the substituting viewers; flatten lands under 0.1 percent; `presenter.spec.ts` opens the console and the audience window, advances with the keyboard and with `deck_goto_slide` over MCP, and asserts both windows show the same slide and the console shows the notes and the timer; the build writes the standalone file and the artifact under 16 MB with 85 slides and 8 sections derived from the manifest, and the file passes the old `build-deck.mjs` assertions (font marker replaced, no `shots/` paths left); the PDF has 85 pages.

## Cross-milestone gates

These run on every PR from M1 and are the `pnpm check` body: install with a frozen lockfile, `tsr generate`, `generate:contracts` with a clean diff, `tsc -b`, vitest, `build` with the client-bundle grep, the M1 import, render, compare, sheet, lint, build and viewer lines. From M2 the flatten export verify runs in the Docker worker on CI; from M3 the editor specs and `lint --chrome` on the editor; from M4 the coverage and skills tests and the judge loop as a nightly job; from M5 the parity test and the native export verify; from M6 the Slides verify as a nightly job behind stored credentials.

Ship criteria for any deck revision, at every milestone: `lint` clean at severity 3 beyond the committed baseline, `render` with zero page errors, `build` under budget, and `export --verify` passed when an export is requested; the claim names the revision.
