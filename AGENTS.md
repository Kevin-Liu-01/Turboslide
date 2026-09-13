# AGENTS.md

Rules for anyone, human or agent, working in this repository. The specification is authoritative
where this file is silent; see "Where the specification lives" at the end.

## What this repository is

Turboslide is a block document with a validator and a grammar linter, and everything else is a
client of that one library (SPEC 1). The slides are the GT brand deck, unchanged; the theme is
`gt-ink-paper` (SPEC 2.1). Since 2026-09-11 the document also carries the freeform layout, the
primitive blocks and the palette and typography fields of `docs/freeform.md`, a recorded deviation
from SPEC 1 and 6.4 (the deviations list below). The chrome is the Prototemplate viewer shell
ported as source (SPEC 2.2).
The repo is a pnpm workspace on TanStack Start (SPEC 3). Package ownership, file lists and
acceptance commands per milestone are in the milestone plan; the M1 acceptance is `pnpm check`.

## Code rules

- TypeScript strict, ESM everywhere, Node 24. Every package has its own `tsconfig.json` that
  extends `tooling/tsconfig/node.json` or `react.json` by relative path and lists its workspace
  dependencies under `references`; the root `tsconfig.json` references every package so
  `pnpm exec tsc -b` checks the whole tree.
- Dependency versions come from the catalog in `pnpm-workspace.yaml` (`"catalog:"`), which pins
  the exact versions of SPEC 3.2. Never write `latest` or a range. Workspace packages depend on
  each other with `workspace:*`, in the one-way direction of SPEC 3.3 item 3.
- Single quotes, two-space indent, semicolons, 100 columns (`pnpm format`). No `any`. Types, not
  interfaces, except where a library requires interface merging (say so in a comment). No default
  exports except where a framework requires one (Vite, Vitest, Playwright and tsdown configs,
  `eslint.config.js`). No barrel files: packages export TypeScript source through explicit
  subpath `exports` (`"./validate": "./src/validate.ts"`), one line per module (SPEC 3.3 item 2).
- Every package under `packages/` except `viewer`, `chrome` and (later) `native` is framework
  free: no React, no Vite, no `createServerFn`. `createServerFn` appears only under
  `apps/studio/src/server/` (SPEC 3.3 items 1 and 4). Headless Chromium never runs inside the web
  app (SPEC 3.3 item 7).
- Erasable TypeScript syntax only (`erasableSyntaxOnly` in `tsconfig.base.json`): the CLI and the
  contracts generator run their source directly through Node's type stripping, so no `enum`,
  namespaces or parameter properties, and relative imports inside those packages carry the `.ts`
  extension.
- Plain CSS: one `tokens.css` and one small CSS file per component, no Tailwind (SPEC 3.3 item 6).
- Every control, toolbar button, menu item, handle and chip carries the Tooltip primitive
  (`packages/chrome/src/Tooltip.tsx`, `data-tip`) with its name, one sentence on what it does and
  its key; a native `title` alone does not count. `node scripts/tooltip-audit.mjs --base <origin>`
  walks the built client's pages and their menus and exits 1 on a miss. Icons are Heroicons 20
  solid from the theme sprite (`@turboslide/chrome/icons` over `sprite-ids.json`), never inline
  paths; a palette color is a theme token by name or one of the four semantic hues
  (`packages/schema/src/color.ts`), and a custom hex is a `color/off-palette` finding.
- Comments and docs in plain technical English, sentence case, no em dashes, no metaphors. Where a
  rule comes from the grammar or the spec, cite the section (`SPEC 5.1`, `DECK-GRAMMAR.md:22`,
  `head:11-176`).

## The agent surface

Every editor or agent write goes through one action of `packages/schema/src/actions.ts` and one
dispatcher (`@turboslide/agent/dispatch`); the store applies it through `applyWrite` (SPEC 7.1).
From M4 the studio hosts that table for agents (MILESTONES M4 item 1):

- `POST /api/actions/<id>?deck=<slug>` runs an action whose transports include `http`; `GET` on the
  same path returns its contract. The request rules live in `packages/agent/src/http/` (framework
  free, unit tested) and the studio route is an adapter: one JSON object as the input, 1 MB body cap
  (25 MB for asset uploads), `x-turboslide-author: agent:<runId>` (or `?author=`), `?force=1` (or
  `x-turboslide-force: 1`) to write past another author's lease, and one error body
  `{ error: { name, status, message, code?, pointer?, currentRevision?, current?, holder? } }`.
  An unknown field is 400 with `code: unknown_field` and the pointer to the extra key.
- `GET /api/agent` is the generated manifest (`packages/agent/generated/manifest.json`, with the
  execution rules) plus the instance facts: what has a handler here, what waits for a later
  milestone, whether a token is required, the attached studio pages. `/openapi.json`, `/llms.txt`
  and `/llms-full.txt` serve the committed generated files.
- `/mcp` is the MCP server over the SDK's streamable HTTP transport (`packages/mcp/src/http.ts`).
  One session binds one deck (`?deck=`) and one author at initialize; `deck_goto_slide` is listed
  while a studio page (`/edit` or `/deck`) is attached to that deck and runs in that page through
  `window.turboslide.studio` (`apps/studio/src/server/sessions.ts`, `components/useStudioSession.ts`).
- Authentication (SPEC 11): with `TURBOSLIDE_TOKEN` set every request to `/api/actions`,
  `/api/agent` and `/mcp` carries `Authorization: Bearer <token>`; without it the surface serves
  localhost only (X-Forwarded-Host, then Host) and answers 401 elsewhere. Server functions run
  under `createCsrfMiddleware()` (`apps/studio/src/start.ts`), filtered to server functions so the
  agent routes stay a bearer-token surface. `/api/export` and `/api/render` require the token only
  when it is set, because the editor's page reaches them without a header (the render route's
  thumbnail variant `?w=` stays open for the sidebar's `<img>` tags), and so do the two bundle
  routes (`docs/deck-transfer.md`). `TURBOSLIDE_TOKEN` is set on the production and preview
  environments of the `turboslide` project since 2026-09-11 (`docs/hosting.md` section 6 records
  the decision); the editor reaches its export and its bundle download through server functions
  and short-lived tickets, so the page never holds the token, and `turboslide deck push` and
  `deck pull` read it from `~/.config/turboslide/hosts.json`. Hosted, every POST to `/api/export`
  runs synchronously (`docs/hosting-chromium.md` section 4).
- Leases (SPEC 6.7) are enforced for agent authors from M4: a write by `agent:*` to a slide another
  author holds is 409 with the holder and the current document unless `force` is set; a human's
  write warns and goes through (`packages/store/src/lease.ts` `leasePolicyFor`). The editor takes
  a ten minute lease on the slide it edits.
- External writes reach an open editor over the store's watch channel within a second: the
  version records since the editor's revision are applied forward through the reducer and the
  banner names the revision and the author (`edit.$deckId.tsx` `adoptExternal`).

Adding an action: the parity chain below, then register its handler in the CLI
(`apps/cli/src/commands/mcp.ts` or `store-actions.ts`), in the studio's dispatcher
(`apps/studio/src/server/actions.ts`; the asset and material actions come from
`@turboslide/materials/actions` `registerAssetActions`, `judge.bundle` and `build.run` run the CLI
as a child process, renders and exports go through the render worker) and, for a window action,
in the editor's `on(...)` table (the freeform round's `block.align`, `block.distribute`,
`block.order` and `slide.setLayout` are there, running the schema's arithmetic and committing one
write; `deck.pack`, `deck.unpack`, `deck.push` and `deck.pull` are `cli` only because they take
paths on the caller's machine, and their hosted surface is the two bundle routes of
`docs/deck-transfer.md`). A window action whose handler needs Node (sharp, the capture
browser: `asset.add`, `asset.dither`, `material.capture`, `material.list`) is listed in
`apps/studio/src/server/agent-actions.ts` `SERVER_SIDE_WINDOW_ACTIONS`; the editor registers it
through `runDeckAction`, which validates the input with the action's schema and runs the same
deck dispatcher, and the write comes back over the watch channel. Export from the editor is
`export.run` through `apps/studio/src/server/download.ts` (the worker job, polled once a second,
signed one-time download URLs); PPTX is the one export target (docs/pptx.md; the Google Slides
exporter was removed on 2026-09-11 at Kevin's direction), and `export.check` is the CLI-only
read-back of a file. Name a new action in a test (the coverage test scans every `*.test.ts`,
`*.spec.ts` and `e2e/*.mjs` for the id, the MCP tool or the CLI command) and it appears in the four
skill tables through `pnpm generate:contracts`.

## The judge loop

`docs/judge-loop.md` is the procedure (SPEC 7.6). `turboslide judge bundle --out <dir>` packages
the evidence (renders in both themes, sheets with cell maps and the lint overlay, `lint.json` with
the gate, the document, the outline, the numerals per slide, the six lens instructions);
`scripts/judge-loop.mjs` runs the judges by lens, the skeptics, the fixers (only with `--fix`) and
the gate, through the Claude Agent SDK when installed, else the `claude` CLI in headless mode, else
with the judges skipped (`--runner none`), and writes `findings.json` (every entry with `slideId`
and `source`: `lint`, `judge:<lens>` or `skeptic`) and `gate.json` with a verdict. The loop writes
to a deck only under `--fix`, as `agent:judge-loop-<stamp>`, under a lease per slide.

## Parity chains

The theme has one source of truth and two copies that must agree (SPEC 5.1):

`Prototemplate/deck/parts/head.html` (lines 11 to 176 and 249 to 258) is ported once to
`packages/theme/src/gt-ink-paper/sheet.css` and `stage.css` under the `.ts-sheet` root class, and
the same values exist as data in `packages/theme/src/tokens.ts`. A vitest parses `sheet.css` and
asserts that the two agree. A change to a token, a size or a grid constant is made in `sheet.css`
and `tokens.ts` together; the test fails otherwise. `packages/theme/assets/sprite.svg` is the
sprite copied out of `head.html` (67 Heroicons plus `gt-mark` after the editor depth round added
the three text alignment glyphs; the ids are in `sprite-ids.json`) and `sprite.ts` is generated
from it.

A UI capability change walks the chain in this order (SPEC 7.5): schema and migration, mutation,
inspector control with label and `data-control`, action table entry, `pnpm generate:contracts`,
skill reference, docs, tests. The chrome is diffable against its source: every file under
`packages/chrome/src` records its Prototemplate origin and commit in `PORTED_FROM.json`, and the
`--pt-` tokens keep their names (SPEC 2.2).

## Dev server rules

These come from a measured incident (tanstack report section 6.3: a console-forwarding loop wrote
a 10.7 GB log in eleven minutes) and from the parallel-builder setup.

- The studio dev server runs on port 4321, always: `pnpm dev` is `vite dev --port 4321 --strictPort`.
  No other port, no second server on one checkout.
- Only the studio builder, the integrator and the verifier start it, and they stop it when done.
  Everyone else works without a server.
- The written exception for the Google Slides parity round two (`docs/gslides-parity/SPEC-2.md`
  0.43, `docs/gslides-parity/MILESTONES-2.md`): a builder whose row names a port runs their own
  server as `TURBOSLIDE_STORE=tmp node_modules/.bin/vite dev --port <port>` from `apps/studio`,
  always with the tmp store so no spec writes `decks/`, stops it before returning, and never
  touches 4321, 3005 or another builder's port. Playwright runs against that server with
  `PLAYWRIGHT_BASE_URL=http://localhost:<port>` (`playwright.config.ts` reads it as `baseURL` and
  defines no `webServer` when it is set). Playwright runs never overlap on the shared machine:
  take `.turboslide/e2e.lock` with `mkdir .turboslide/e2e.lock` before `playwright test`, `rmdir`
  it after, and wait while it exists. `scripts/check.mjs` keeps 4321.
- `server.forwardConsole` stays `false` and `devtools()` stays in every Vite config
  (`apps/studio/vite.config.ts` says why). Never redirect the dev server's output to an unbounded
  file; `scripts/check.mjs` and `playwright.config.ts` cap or discard it.
- One browser page at a time: the machine is shared. Playwright runs with one worker.
- The dev server is never a build step. Anything the product needs in production is a server
  route or a server function, not a Vite plugin hook.

## Hosting

The studio is deployed to Vercel from `apps/studio` (the project `turboslide` in Kevin's team,
root directory `apps/studio`, `apps/studio/vercel.json`: framework off,
`NITRO_PRESET=vercel pnpm run build:deploy`, `pnpm install --frozen-lockfile`). Production deploys
come from the push to `main` and land on `turboslide.vercel.app`; a preview is `vercel deploy --yes
--archive=tgz` from the linked repository root (the root `.vercelignore` keeps the working tree's
derived folders out of the upload), and only the integrator and the verifier run it. `.vercel/`
and `.env.local` are written by the CLI on `link` and `env pull` and never committed.

`docs/hosting.md` is the reference. One selection per process (`@turboslide/store/select`):
`file` in a checkout, `tmp` inside a function without a Blob token (edits live for the instance and
the editor says so in a banner), `blob` with `BLOB_READ_WRITE_TOKEN` (the overlay under `/tmp`
mirrors the Vercel Blob store `turboslide-decks`). The function carries `decks/templates`,
`decks/gt-brand` and the renderer's runtime files as Nitro server assets (`vite.deploy.config.ts`),
materialized on first use by `apps/studio/src/server/root.ts`, which answers every path helper from
the selection. Renders and exports run inside the function on `chrome-headless-shell` (the
recorded deviation below; `docs/hosting-chromium.md`), every POST to `/api/export` is synchronous
there, and verify never runs there. `node scripts/hosted-smoke.mjs <url>` probes a deployment (six
rows, exit 1 on a failure; a preview needs `VERCEL_OIDC_TOKEN` from `vercel env pull` in the
environment); `docs/HOSTED-STATUS.md` records the round.

## Installs and dependencies

- `pnpm install` runs once, by the scaffolder or the integrator. Never run `pnpm install` while
  another builder may be installing. If a package needs a dependency, add it to that package's
  `package.json` (and to the catalog if it is new) and tell the integrator in the report; do not
  install it.
- `pnpm-workspace.yaml` carries `allowBuilds` because pnpm 11 refuses unlisted build scripts. A
  new dependency with an install script needs an entry there, decided explicitly.
- `pnpm check` starts with `pnpm install --frozen-lockfile`, so the lockfile is always committed
  and current.

## Ownership and git

- Builders own disjoint packages and create or edit only the paths their task assigns. The
  scaffold placeholders (`src/index.ts` in every package) are meant to be replaced by their owner.
- Never `git add -A`. Run git commands only when the task lists them. Commits in this repository
  are authored as Kevin <kk23907751@gmail.com> (the repo-local identity).
- Nothing is claimed done until the acceptance commands exit 0 and the report files named in the
  milestone plan exist. A claim about a deck names the revision.

## Acceptance

`pnpm check` runs `scripts/check.mjs`: the M1 acceptance chain from the milestone plan followed by
the M2 format gate (`pnpm format:check`, step 19), the two steps of the Google Slides parity round
(20 and 21) and the three of round two (22 to 24, gslides-parity SPEC-2 11.1: the fixture deck
exported in both modes with the flatten report perfect, `turboslide fonts build --check`, and the
conversion fidelity gate `scripts/canvas-fidelity.mjs` over the GT deck and the two templates at
0.5 percent), in order, stopping at the first failure; step 25 is the container verification of
SPEC-2 11.3, run when a Docker daemon answers and skipped otherwise. `node scripts/check.mjs
--list` prints the steps; `--only 4,5` and `--from 6` run parts of it. The runner skips the two
steps that read the Prototemplate checkout when `/Users/kevinliu/repos/Prototemplate/deck` (or
`TURBOSLIDE_PROTOTEMPLATE_DECK`) is missing, which is the case in CI, skips step 23 without the
fonts venv (`.turboslide/venv`) and step 25 without Docker, and starts and stops the dev server for
the steps that need it with `TURBOSLIDE_EXPORT_BATCH=3`, the batch size `export-batch.spec.ts`
drives. Step 21's spec list carries the round two specs (`canvas.spec.ts`, `objects.spec.ts`,
`text-styles.spec.ts`, `tables.spec.ts`, `charts.spec.ts`, `hygiene.spec.ts`,
`export-batch.spec.ts`). `docs/gslides-parity/BUILD-STATUS-2.md` records the merge 2 run.

The M4 lines beyond `pnpm check` are the skills and coverage vitest files
(`packages/agent/src/__tests__/{skills,coverage}.test.ts`), `apps/studio/e2e/agent-http.spec.ts`
and `node apps/cli/e2e/mcp-http.mjs` against a server on 4321 (the script starts one when nothing
answers and stops it), `turboslide judge bundle` and `scripts/judge-loop.mjs` (docs/judge-loop.md).

The M5 lines beyond `pnpm check` are in the M5 section of the milestone plan: the zero-escape
re-import with identical ids (`scripts/check.mjs` steps 8 and 12 now gate on zero escapes and
compare every slide), `asset dither --all-two-tone --from-recorded --verify-cells`, the liquid
metal `material capture` against `decks/gt-brand/assets/liquid-metal-diamond.recipe.json`, a site
capture with the `gt-site` recipe, `cargo test`, the native build with the parity test, the
native PPTX gate in the container, and the lint fixture index. `docs/M4-M5-STATUS.md` records the
run with its numbers. `pnpm-workspace.yaml` lists `packages/native/npm/*` (the per-platform addon
packages `@turboslide/native` depends on optionally) so the frozen-lockfile install in the render
worker image resolves them.

All 18 M1 steps passed on the M1 tree (2026-09-10, 219 s on Kevin's machine with the Prototemplate
checkout present); `docs/M1-STATUS.md` records every step with its measured numbers. All 19 steps
pass on the M2 tree (2026-09-10, 145.4 s on the same machine); `docs/M2-STATUS.md` records them
with the rest of the M2 acceptance list. All 19 steps pass on the M3 tree (2026-09-10, 163.4 s on
the same machine) and the five other M3 lines pass against a server on 4321 started and stopped by
the verifier; `docs/M3-STATUS.md` records them. On the M4 and M5 tree (2026-09-11, the same
machine, the render worker image building alongside) steps 1 to 18 passed in 265.6 s of step time,
step 19 failed once on two unformatted files of the fix round and passed alone after they were
formatted, and every M4, M5 and M6 item 1 line plus the directive's lines passed: the container
gate on the rebuilt image in 348 s, the Slides exporter (since removed) as a dry run in both
modes, the judge loop as written with its runner dropped at the preflight; `docs/M4-M5-STATUS.md`
records them with the numbers. On the bare scaffold only steps 1 to 6 passed (install, route
generation, contracts generation, `tsc -b`, vitest, build plus the client bundle check).

The hosting round's lines beyond `pnpm check` (2026-09-11) are a preview deploy of the tree,
`node scripts/hosted-smoke.mjs <preview>` at 6 of 6, one synchronous export on it, and the
integrator's preview drives (`docs/hosted-evidence/README.md`). On the hosting tree steps 1, 2 and
4 to 19 passed (271.9 s of step time; step 3 failed as written on the uncommitted generated files,
was verified by regeneration and diff, and passed alone after the paths were staged), the preview
`turboslide-8ueqvr3ej` answered the six rows and a one-slide flatten export in 7.46 s with
`perfect: true`; `docs/HOSTED-STATUS.md` records them with the numbers, the production URL facts
and what Kevin must decide.

The editor depth round's lines beyond `pnpm check` (2026-09-11 to 12) are a preview deploy of the
tree, `node scripts/editor-depth-drive.mjs <preview>` (one Playwright page at 1440 by 900 through
the head and density, a deck from the GT template, the Insert menu's primitives, the freeform
switch, drag with guides, resize, align, palette and custom colors with the lint mark, typography,
a drag across columns, tooltips, the menu's Perfect export, the bundle round trip and present),
`node scripts/tooltip-audit.mjs --base <built client>` at zero misses, `turboslide export check` on
the exported files, `turboslide deck pull` and `deck push` against the preview, and eight writes
through `POST /api/actions` landing in the Blob store; `docs/EDITOR-DEPTH-STATUS.md` records the
run with its numbers and `docs/editor-depth-evidence/` holds the screenshots and tables. On that
tree steps 4 to 19 passed (step 3 fails as written on the uncommitted generated files and passes
by regeneration and diff; step 5 timed out twice on the material capture test while other
worktrees' servers loaded the machine and passed alone and on the rerun).

Type checking: `pnpm exec tsr generate` must run before `tsc -b` because `routeTree.gen.ts` is
generated and git-ignored (measured: three type errors otherwise). `tsc -b` writes declaration
output to `<package>/dist/types` (project references need it); run `pnpm typecheck` once after a
clone so editors resolve cross-package imports.

Tests: root `pnpm test` runs vitest with every folder under `packages/` and `apps/cli` as a
project. A package that needs jsdom (`viewer`, `chrome`) adds its own `vitest.config.ts` and the
`jsdom` dependency. Browser tests live in `apps/studio/e2e` and run through the root
`playwright.config.ts` (`pnpm exec playwright test apps/studio/e2e/<spec>`), which reuses a
running 4321 server or starts one.

## Chromium

Rendering uses the full Chrome for Testing binary, never the headless shell (SPEC 3.2, 5.3), with
`--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` on macOS and
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` on Linux.

Measured on 2026-09-10 while scaffolding: `playwright-core` 1.62.1 installs Chromium revision
1234 (Chrome for Testing 151.0.7922.34), not the `chromium-1217` build (147.0.7727.15) that the
spec names and that the deck's `shoot-slide.mjs` hard-codes at
`/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
The pixel comparison against `shoot-slide.mjs` (`scripts/compare-to-shoot.mjs`) is only meaningful
on the same build, so `@turboslide/headless` resolves the executable in this order:
`TURBOSLIDE_CHROME` if set, then that `chromium-1217` path if it exists, then
`chromium.executablePath()` from `playwright-core`. CI installs with
`pnpm exec playwright-core install --with-deps chromium` and records the renderer string in every
`RenderRecord` (SPEC 4.2).

## Contracts between builders that the scripts assume

- `turboslide render --out <dir> --json` writes `<dir>/render.json` as `RenderRecord[]` (SPEC 4.2)
  whose `image` is the PNG path, relative to `<dir>` or absolute, and names the files
  `<nn>-<slideId>-<theme>.png` (SPEC 7.2). `compare-to-shoot.mjs` reads the records first and
  falls back to the file names.
- Slide numbering is `deck.json` `sections[].slideIds` flattened, `n = index + 1` (SPEC 4.2).
- `decks/gt-brand/import-report.json` has one row per slide with the slide `id` and an `html`
  field that is `null` or `{ reason }` when an escape block was needed; `htmlBlocks` at the top
  level is the count. `scripts/lib/import-report.mjs` documents the other shapes it accepts.
- `turboslide import --json` prints `{ slides, sections, htmlBlocks, ... }` on stdout (the
  acceptance asserts 85, 8 and at most 4).
- `apps/studio` keeps a route that calls a server function returning
  `TURBOSLIDE_SERVER_ONLY_MARKER_7f3a` (today `src/server/health.ts` from `routes/index.tsx`);
  `scripts/check-client-bundle.mjs` fails when the marker is missing from `dist/server` or present
  in `dist/client`, or when a Solid or devtools chunk lands in the server output.
- The root `tsr.config.json` exists so that the literal acceptance line
  `pnpm exec tsr generate --config apps/studio/tsr.config.json` works from the repo root: the
  `tsr` CLI has no `--config` flag (yargs ignores it) and reads `tsr.config.json` from the working
  directory, so the root copy points at `apps/studio/src/routes`. The app's own `tsr.config.json`
  is read by the Vite plugin. Both produce the same `routeTree.gen.ts` (verified).
- `pnpm generate:contracts` runs `packages/agent/src/generate/main.ts` with Node's type stripping;
  it must write every generated file deterministically so `git diff --exit-code` passes. From M4
  the outputs include `packages/agent/generated/llms.txt` and `llms-full.txt`; from M5
  `packages/schema/src/rules.json` (the rule ids in table order) and
  `packages/lint/fixtures/index.json` (per rule: the fixture deck slides the static layer raises
  it on and the test files under `packages/lint/src` that name it; `null` for a rule with
  neither, which `packages/agent/src/__tests__/fixtures.test.ts` and the last M5 acceptance line
  refuse). A new rule therefore needs a planted slide in `packages/lint/src/fixtures/deck.ts` or
  a test naming it before the chain passes. Step 3 of `scripts/check.mjs` diffs both files.
- `GET /api/agent` keeps `actions` as the window API's action list (the M3 window-api spec compares
  it with `describe().actions` in the page); the manifest's grouped ids are `actionsByGroup`.
- A deck bundle is one zip holding `manifest.json` and `decks/<id>/...` in the layout of SPEC 4.1
  (`@turboslide/store/pack`, `unpack`, `zip`); `GET /api/decks/:deckId/bundle` and
  `POST /api/decks/bundle` move it hosted, with the bearer or a ticket from the `bundle.ts` server
  functions, and a bundle over a function's 4.5 MB body cap travels by a stored Blob copy
  (`docs/deck-transfer.md`).
- `apps/studio` depends on `@turboslide/cli` (its `./store-actions` export, so the HTTP and MCP
  writes run the CLI's store actions) and on `@turboslide/mcp`; the render worker already depended
  on the CLI the same way. Since round two the window transport runs the same store actions too:
  every `on(...)` handler of the editor route is the store action over the editor's store, so one
  implementation serves the four transports (SPEC 7.1).
- The canvas model of round two (gslides-parity SPEC-2 section 1): every slide is a canvas. A
  canvas write (`block.set /pos`, `block.move` with `z`, a positioned `block.insert`, the arrange,
  rotate, flip, group, crop and duplicate actions, `slide.toCanvas`, `slide.setLayout` to
  freeform, `diagram.insert`) on a slide that is not on the freeform layout converts it first,
  losslessly, through `toCanvas` of `@turboslide/schema/canvas` over the boxes one DOM function
  measures: `measureCanvasBoxes` of `@turboslide/render/measure-dom` on a 1x sheet with the prompts
  drawn, after `awaitSheetReady`, relative to the `.ts-stage` element, at 1/64 px. The editor
  evaluates it on a hidden sheet in the current theme (`@turboslide/viewer/canvas-measure`,
  bound as the store actions' `measureCanvas` and `measureFit` on the window transport); the CLI
  and the MCP server evaluate it on a headless page (`apps/cli/src/deps/canvas.ts`); the hosted
  studio's `/api/actions` runs the read only `turboslide slide measure <ids> --deck <dir> --json`
  through the render worker (its CLI child process, or the worker's `measure` job over
  `TURBOSLIDE_WORKER_URL`; `apps/studio/src/server/measure.ts`). The `pos` every transport writes
  are identical in Chromium (SPEC-2 0.104); the five GT slides with a code panel measure one pixel
  differently between the themes (b2.md decision 2), so a conversion made in dark and viewed in
  light, or the reverse, differs by that pixel there. `scripts/canvas-fidelity.mjs` (check step 24)
  converts every slide of the GT deck and the templates and compares the two renders per theme,
  measuring in the theme it compares.
- A route module of `apps/studio` may import a `src/server/*.ts` module only when everything the
  module exports is a server function wrapper or a pure helper with no worker, headless or `node:`
  import: TanStack Start's client transform strips a server function's handler and the imports
  only the handler used, but a plain exported function keeps its imports alive in the browser
  graph. Merge 1 of round two put `measureSlidesThroughWorker` (which reaches
  `@turboslide/render-worker/cli` and `node:child_process`) in `server/render.ts`, a module the
  edit route imports for `renderSlideImages`, and no editor page booted on any dev server or on the
  preview until merge 2 moved it to `server/measure.ts`, imported by `server/actions.ts` alone.
  `scripts/check-client-bundle.mjs` (step 6) fails on `node:fs`, `node:path`, `node:zlib` and
  `node:child_process` in a client chunk, but only the dev server shows the module graph a build
  tree shakes, so a boot probe of `/new` on a dev server is part of every merge.

## Deviations from the spec, recorded

- `vitest` is pinned at 4.1.11, not a 3.x release: vitest 3 depends on Vite 5 to 7 and would have
  pulled a second Vite next to the pinned 8.2.2; vitest 4 runs on Vite 8.
- `eslint` is 10.10.0: `@tanstack/eslint-config` 0.4.0 depends on `@eslint/js` 10, and 9.39.5 is
  deprecated on npm.
- The Chromium revision note above.
- Flatten export verification compares at 2x, not 1x (M2 integration, `docs/export-verification.md`):
  SPEC 8.5 states the 0.1 percent gate against the Playwright reference without naming a scale,
  and a flatten page carries a 2x sheet raster, so the PDF is rasterized at 3200 by 1800 and the
  reference is `render --scale 2`; measured at 1x the rasterizer's downsample alone costs 0.1 to
  0.4 percent per text slide. Inside a regenerated two-tone picture the page is gated on the 2x
  sheet shot it embeds, because the browser at 2x shows a bilinear upscale of the 1x twin.
- Native text boxes are moved up by LibreOffice's measured first-baseline offset
  (`packages/export/src/pptx/baseline.ts`, `calibration.json` `firstBaselineModel`); the CLI flag
  is `--baseline-target libreoffice|none` because `lint --baseline` already names a switch. The
  action input field is `baseline`.
- `apps/studio` externalizes `sharp` in its Vite configs (`externalSharp()`): the render worker
  client reaches `@turboslide/effects/io` through the local verify job, and the tsconfig `paths`
  alias the effects, export and cli packages need for sharp's types would otherwise send
  rolldown into `lib/index.d.ts` (measured: `MISSING_EXPORT "default"` on the SSR build).
- PPTX is the one export target (Kevin, 2026-09-11: "instead of exporting to google slides just
  make it perfect pptx"): SPEC 8.3 (Google Slides) is not implemented and its code, its `gslides`
  format, its dry run, the Slides image host route and `docs/google-slides.md` were removed;
  MILESTONES M6 item 1 is closed as withdrawn. `docs/pptx.md` is the PPTX reference.
- The flatten page raster is not always the PNG SPEC 8.2 names: the page raster policy
  (`packages/export/src/pptx/page-raster.ts`) writes a 1-bit PNG, a palette PNG, a JPEG at quality
  92 (photographic pages only) or a truecolor PNG, whichever is smallest within a measured
  mismatch budget, and the report records the format and the decoded mismatch per page;
  `perfect` is the claim that every page stays under 0.1 percent (docs/pptx.md).
- Fonts are not embedded by default (SPEC 8.2 post-process, 8.4): the flatten file has no visible
  text to draw and PowerPoint repairs a file whose font parts it rejects, so the flatten export
  never embeds and the native export embeds only under `--embed-fonts` (`embedFonts` in
  `export.run`). The render worker image installs the faces, so the LibreOffice gate is unchanged.
- Every slide part carries `<p:cSld name>` set to the slide title and a hidden title placeholder
  (`hidden="1"`, an alpha 0 run at the heading's box), which SPEC 8.2 does not name; it is what
  PowerPoint's own accessibility command writes, kept inside the page for the geometry read-back.
- Hosted renders and exports run inside the Vercel function (SPEC 3.3 item 7 keeps Chromium out
  of the web app) on `chrome-headless-shell` 147.0.7727.0 from `@sparticuz/chromium` (SPEC 5.3 and
  the Chromium section above want the full Chrome for Testing binary): a function has no second
  process to hand the work to and the package ships only the shell. Every hosted `RenderRecord`
  names it in `renderer`, the gate stays on this machine and in the worker image, and
  `docs/hosting-chromium.md` records the switches, the single-process shell's crash on context
  close (its browser is killed by pid, never closed) and the measurements. Kevin has not approved
  this beyond the directive to make the deployment work.
- The freeform layout, the primitive blocks and the palette and typography fields (Kevin,
  2026-09-11: "be able to drag stuff around in each slide and reorder or move stuff", "be able to
  reuse primitives and icons like boxes and shapes and selecting colors and font and typography
  controls"): SPEC 1 and 6.4 rule out free x and y, resize handles on text, z-order and rotation.
  The grammar layouts keep that rule and gain drag to move and reorder blocks within and across
  slots (`block.move`); the `freeform` layout carries `pos` (x, y, w, h and z on the 1600 by 900
  sheet, snapped to the 8 px grid and to the rails, plates and column seams) and is a
  `layout/freeform` finding at severity 1 so a pure grammar deck knows; the primitives box, shape
  (rectangle, rounded rectangle, ellipse, line, arrow), rule, text and icon take palette colors
  (the theme tokens and green, amber, red and GT blue) with a custom hex allowed as
  `color/off-palette` at severity 2; typography offers the ladder sizes, weights 300 to 700 with
  the 500 cap as the `type/weight-cap` lint rather than a block, alignment, tracking and leading
  steps. Rotation stays out. `docs/freeform.md` is the reference and `docs/EDITOR-DEPTH-STATUS.md`
  the round's record.
- The acceptance line names `apps/studio/src/routes/openapi.json.ts`. The file is
  `apps/studio/src/routes/openapi[.]json.ts` because TanStack Router's file-based routing escapes
  a dot inside a path segment as `[.]` (the route path stays `/openapi.json`), and the
  generator does not write it; it serves `packages/agent/generated/openapi.json`. Step 3 of
  `scripts/check.mjs` names the file through git's `:(literal)` pathspec magic so the brackets
  are not read as a glob class.
- The Google Slides parity round (`docs/gslides-parity/SPEC.md`, section 7.9, decision 15.11)
  amends six sentences of this spec; the integrator edited them into `docs/spec/SPEC.md` and
  records them here until Kevin approves them:
  1. SPEC 4.2 text markup: line breaks are allowed as a paragraph break in paragraph, text, box
     and table cell Texts (`multilineTextSchema`) and as `\n` in `panel.code`; nowhere else.
  2. SPEC 8.2: "five hairlines plus key and value boxes, never a PPTX table" is scoped to `rows`
     and `plain`; the `table` block is a PPTX table in Editable text.
  3. SPEC 2.1: ruled rows and lists instead of bullets is unchanged; the Bulleted list control
     produces the ruled list (decision 15.1) and `plain.numbered` draws a tabular numeral.
  4. SPEC 6.9: the editor binds no bare letters; the view route keeps the shell keys (parity
     SPEC 10.2 retires E, `⌘/`, `⌘L` and `⇧D` in the editor).
  5. SPEC 3.4: `/` redirects to `/new`; `/decks` is the home page; `/new`, `/decks/trash`,
     `/print/:deckId` and `/present/:deckId` (Presenter view) are routes.
  6. SPEC 6.1: the editor's frame is the title row, the menu bar, the toolbar, the filmstrip, the
     canvas with the notes pane, the right panels and the bottom bar of parity SPEC 1; the status
     chip and the revision leave the default view.
- The builders' deviations from the parity SPEC, each argued in `docs/gslides-parity/build/
<key>.md` and listed in `docs/gslides-parity/BUILD-STATUS.md`, recorded for Kevin (parity SPEC
  15.11):
  - B2: the PDF gate rasterizes at 3200 by 1800 instead of `pdftoppm -r 144` (parity SPEC 7.6),
    because the diff needs the 2x render's pixel grid; picture regions are compared separately
    and never gated (every viewer resamples the twins with its own filter); speaker notes travel
    in a PPTX only under `includeNotes` (parity SPEC 7.2.13, decision 15.2).
  - B3: parity SPEC 2.12's printed tally does not follow from its tables (the model counts 106
    Now, 24 Later, 38 Omit, plus one Omit for Regroup); parity SPEC 4.3's "Every item here is
    also in the menu bar" gains two exceptions, Text fitting and Alt text, which are Format
    options sections; parity SPEC 14.4 item 2's stub tooltip check reads the tooltip's sentence
    span, not the plate's whole text; Hide the menus sits on the toolbar row (parity SPEC 3.1 row
    18), not the menu bar row of 1.1.
  - B4: a right-click inside an editing run opens the browser's own menu (parity SPEC 4.3 lists
    a text selection menu), because only the browser's menu carries its spelling suggestions;
    several dragged cards write one `section.set` (parity SPEC 4.1 says one `slide.move` per
    slide in one write; no action carries several moves); deleting several cards is several
    `slide.remove` writes with one Undo each.
  - B6: the slideshow surround is `--pt-panel-ink`, not `--pt-ink` (parity SPEC 9.2), so a light
    sheet sits on black in both themes; the present toolbar draws eight controls where Google's
    compact bar has four; no new action for the blank slide, the laser pointer or full screen
    (parity SPEC 7.5 lists none), which stay readable through `describe().state` and drivable by
    the keys and the menu.
- The builders' deviations of round two (gslides-parity SPEC-2; `docs/gslides-parity/build-2/
<key>.md`, listed in `docs/gslides-parity/BUILD-STATUS-2.md`), recorded for Kevin:
  - SPEC-2 2.9 (the amendments to the two specifications and to `docs/freeform.md`), edited in by
    the integrator at merge 2: every slide becomes a freeform slide on its first canvas
    manipulation and the grammar layouts are the templates (gslides-parity SPEC 7.1 rule 3, SPEC
    4.3 of this spec); a `shape` holds a Text (gslides-parity SPEC 3.3); an inserted text box
    converts the slide and lands as an object (gslides-parity SPEC 2.4); the text markup has five
    rules, the mark span the fifth (this spec 4.2); the ruled list stays the default and
    `plain.marker` draws glyphs and numerals on request (2.1); a coloured run is a severity 1 lint,
    not a refusal (2.1); rotation is in and `pos` carries `rotate`, `flip` and `group`
    (`docs/freeform.md` 2); resize handles on every object of a canvas (6.4); Apply layout's table
    gains the picture object and the plate box and a canvas re-flows by the same table
    (gslides-parity SPEC 5.5); the conversion record is the schema field `SlideBase.grammar`, so
    no `ext` key is written (gslides-parity SPEC 7.1 rule 2, this spec 4.1); `layout/freeform`
    carries the sales sentence and `freeform/off-sheet` has two severities (`docs/freeform.md` 1
    and 6).
  - B1: a connector end off its site is a severity 2 validator note, not a refusal; `padding` and
    `valign` without `pos` are refused on shape and text only; a rectangle target offers eight
    connection sites; `block insert --pos` lands the object last in `main` with z one above the
    highest; `slide.setLayout` to freeform on a canvas slide writes nothing; `alt` on `BlockBase`
    puts the key second in every block the schema serializes, so the committed GT deck was
    re-imported once in the fix round (22 slide files with `dia` and `dither` blocks, `alt` moved
    before `type`, no value changed, revision 25) and check step 7 is byte identical again from
    that tree (VERIFICATION-2 finding 3; the integrator's call).
  - B2: the measured box is written at 1/64 px, never the pixel (b2.md decision 1, request R2,
    applied at merge 2 in `packages/schema/src/canvas.ts`); the picture object travels as
    `slide.background` only when it covers the sheet, so the fixture's `canvas-opener` (its
    picture moved 40 px right) travels as a `p:pic` and `background-picture` exercises the
    background form (R4); a curve travels as the polyline through its points; a rotated table is
    written unrotated (pptxgenjs has no `rotate` on a table); the PDF's `word-art` page sits at
    0.103 percent against the 0.1 target and under the 0.5 fail line; the dark theme of five GT
    code panel slides measures one pixel differently from light (R3, recorded above), so
    `scripts/canvas-fidelity.mjs` measures, converts and compares once per theme (the fix round;
    171 slides, 342 pairs, worst 0.262 percent, 95 s) while the CLI's conversion measures in light.
  - B3: a grammar slide's fields are objects to the shell through `pseudoBlockOf` before the first
    write converts the slide; Order on a grammar slide plans `block.order`; inserts never land in
    a slot; the Background dialog's Choose without the stage handle is two writes; "Line kind"
    reads "Line type" (kind is a forbidden default view word); seventeen round one lint rules'
    proposals carry forbidden words and are pinned as a ceiling in `default-view-words.test.ts`.
  - B4: Cmd Up and Cmd Down on a real block of a grammar slide reorder within its slot (SPEC-2 6.1
    row 13 asks for one stack); the handle and the keys write `block.set /pos` (and `/trim`) in one
    `slide.update` where SPEC-2 6.1 names `block.rotate`, `block.flip`, `block.group` and
    `block.crop` (the documents written are identical; the agent spellings stay the CLI's and the
    menu rows'); autofit after a resize is one ladder step per commit; the point tools end on
    Enter or the first point (a double click lands as two clicks); a `cellRange` target is not
    selected by the stage this round; the clip lift is scoped to `.ts-editor`; the hidden measure
    root resets the inherited text defaults so it measures as the CLI's present document does.
  - B5: a hierarchy of n levels has 2n minus 1 nodes; the timeline's labels are ink in every
    style; the three diagram styles are the theme's tones (Outline, Plate, Ink); the Format
    options slot props carry `slide.id` (the route adapts B3's `slideId`).
  - B6: the four batched export server functions live in `download.ts` and the logic in
    `export-batch.ts`; `POST /api/export/:deckId?start=1` is the http form of the plan; the cancel
    form needs no bearer (the job id is the capability); `documentAtRevision` decides staleness;
    the snapshot key contention rule (two writers from one revision inside one clock millisecond
    push equal manifests with different bodies and contest one key: the store verifies the existing
    snapshot's etag against its own body and answers a conflict before its manifest push, SPEC-2
    0.40 and 8.2); the merge duplicates the per theme report lines; the batch spec exports one
    theme; `ten-tasks.spec.ts`'s Cut assertion of the Slide deleted snackbar is retired (SPEC-2
    0.30).
  - Integrator (merge 2): the fixture's `diagram` slide is rebuilt through `diagram.insert`
    (process, four steps, plate style, at the default box; the hand written labels "1. Connect"
    became the template's "Step 1"); the committed `canvas-walk` recordings are re-derived at
    1/64 px while the fixture's `canvas-title`, `canvas-opener` and `background-picture` keep the
    integer `pos` the CLI wrote before R2 (valid positions; the headless test compares at the
    pixel); the stage's Cmd+D runs `block.duplicate` on every slide kind (one implementation,
    the copy after its source as round one's spec pins), the stage's own paste path serving only a
    kind's object that is not a block; the Edit menu's Cut and Delete remove several cards in one
    write (one Undo); a lease on a slide removed while the lease was in flight is quiet; the TanStack
    devtools do not mount for an automated browser (their Inter face shadowed the theme's on the
    dev stage, b4.md request 6; this devtools version has no shadow root option); `selectSoon`
    re-selects once when the filmstrip has rendered the card (a select is a hash navigation, and
    one per frame remounted the shell); the `deck.info` contract gains `counts.snapshots`.
  - Fix round (integrator): after a write, an undo or an external change removes the current
    slide, the editor selects the slide now at the removed slide's index, clamped to the end
    (`replacementSlide` in `apps/studio/src/routes/edit.$deckId.tsx`). The research (R02, R07)
    records that Google deletes without confirmation and does not record which slide it selects
    next; the rule follows Google's observed behaviour (the next slide, the previous one at the
    end) and is recorded here as an assumption until the audit checks it against Google. In the
    same round the editor's write queue treats a lease refusal (SPEC 6.7: an agent's write to a
    slide another author holds answers 409 with the holder) as a conflict card with the holder
    and Force, never as a revision conflict to rebase on: the server changed nothing, so a rebase
    re-sent the same write to the same refusal in a loop (measured at one write every 2 ms). A
    lease still outlives the tab that took it, ten minutes at most.

## License

The repository license is SPEC open question 14 and is Kevin's decision. MIT (`LICENSE`,
copyright 2026 Kevin Liu) is the provisional choice, matching Glyphfield. If the repository stays
public under MIT, the GT deck and its licensed photographs move to a private `decks/` overlay
(SPEC 11).

## Where the specification lives

The specification is `docs/spec/SPEC.md`, the milestone plan `docs/spec/MILESTONES.md`, and the
three experiment reports are under `docs/spec/experiments/`. They were written on 2026-09-10 in a
session scratchpad that was cleared the same day and were recovered from that session's transcript
(`docs/spec/README.md` records the provenance and what was not recoverable: the three candidate
designs and the M1 evidence directory). The recovered text is as written, so it still names the
scratchpad paths and cites private material; whether `docs/spec/` stays in this public repository
or moves to a private overlay is Kevin's decision (SPEC 11, open question 14). A SPEC citation in
code (`SPEC 5.1`) is checked against `docs/spec/SPEC.md`.
