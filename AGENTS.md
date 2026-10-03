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
  Since round four `packages/chrome/src/brand.css` carries the eleven `--ts-` identity tokens
  (gslides-parity SPEC-4 1.8) and `tokens.css` keeps every `--pt-` name and value (the one
  addition is the `--pt-select` block, recorded under the round four seams below).
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
  banner names the revision and the author (`apps/studio/src/editor/controller.tsx`
  `adoptExternal`; it sat in `routes/edit.$deckId.tsx` until round four's merge 1 split the editor).

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
- The written exception for the Google Slides parity round two (`docs/archive/gslides-parity/SPEC-2.md`
  0.43, `docs/archive/gslides-parity/MILESTONES-2.md`): a builder whose row names a port runs their own
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

- The written exception for the Google Slides parity round three (`docs/archive/gslides-parity/SPEC-3.md`,
  `docs/archive/gslides-parity/MILESTONES-3.md`): the round two form stands with two additions. The
  channel is fixed to `memory` so no spec needs a service, and a tmp store refuses to mint an
  export token without `TURBOSLIDE_DOWNLOAD_SECRET` (SPEC-3 8.10, `apps/studio/src/server/tokens.ts`),
  so every builder's server that exports sets it to an obviously fake value of 16 bytes or more.
  From `apps/studio`:

  `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_DOWNLOAD_SECRET=<16 or more fake bytes> node_modules/.bin/vite dev --port <port>`

  | Port | Who                                               | Notes                                                                                                                        |
  | ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
  | 4321 | the integrator, the verifier, `scripts/check.mjs` | the file store; started and stopped by them alone                                                                            |
  | 4331 | B2 (realtime, store, the edit route)              | `realtime.spec.ts`                                                                                                           |
  | 4332 | B3 (identity and accounts)                        | plus `TURBOSLIDE_AUTH_DB=.turboslide/auth-b3.sqlite` and `TURBOSLIDE_MAIL=capture`; `accounts.spec.ts`, `agent-http.spec.ts` |
  | 4333 | B4 (security and the check chain)                 | `security.spec.ts`, `window-api.spec.ts`                                                                                     |
  | 4334 | B5 (dithers, layout shift, route fixes)           | `dither.spec.ts`                                                                                                             |
  | 4335 | B6 (the chrome)                                   | `presence`, `comments`, `share` and `versions-by-author` specs, `scripts/tooltip-audit.mjs`, `lint --chrome`                 |
  | 4336 | the verifier                                      | the parity audit and the rows of VERIFICATION-3                                                                              |
  | 4344 | B5's `vite preview` of a production build         | `scripts/layout-shift-audit.mjs` (SPEC-3 9.4)                                                                                |

- The `vite build` exception (round three, row B5 only): the layout shift audit runs against
  `vite preview` of a production build on 4344, so B5 may run `node_modules/.bin/vite build` inside
  `apps/studio` for that row alone. Nobody else builds; the integrator builds everything else.

- The written exception for the Google Slides parity round four (`docs/archive/gslides-parity/SPEC-4.md`,
  `docs/archive/gslides-parity/MILESTONES-4.md`): the round three form stands with one more variable.
  Round three's identity runtime refuses every request without `TURBOSLIDE_SESSION_SECRET`
  (`apps/studio/src/server/auth/secret.ts`; a tmp store has no state folder to mint it from and
  the server answers 500 on every route), so a builder's server sets both secrets to obviously
  fake values of 16 bytes or more, the way `playwright.config.ts` does for its own server. Nobody
  builds this round either: `pnpm build`, `vite build` and the node-server and Vercel builds are
  `scripts/check.mjs`'s and the integrator's. From `apps/studio`:

  `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_SESSION_SECRET=<fake> TURBOSLIDE_DOWNLOAD_SECRET=<fake> node_modules/.bin/vite dev --port <port> --strictPort`

  | Port | Who                                               | Notes                                                                                                                                                                                                                                  |
  | ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 4321 | the integrator, the verifier, `scripts/check.mjs` | the file store; the `/new` boot probe at every merge; check step 31 builds and serves the node-server output here and fails when something already answers                                                                             |
  | 4341 | B1 (brand assets, tokens, chrome mark)            | the tile and chrome checks, the selection screenshots                                                                                                                                                                                  |
  | 4342 | B2 (the `/home` route)                            | `home-page.spec.ts`, `lint --chrome --url .../home`, `tooltip-audit.mjs --only /home`                                                                                                                                                  |
  | 4343 | B3 (routes and transitions)                       | the `home`, `editor`, `present`, `landing` and `viewer` specs; `perf-budget.mjs --only routes,transitions --runs 1 --report` as a smoke                                                                                                |
  | 4344 | B4 (editor actions and render)                    | the `filmstrip`, `viewer`, `window-api` and `undo` specs; the same number as round three's preview port, so B4's server is down before `pnpm check` reaches step 27, which treats anything answering on 4344 as the production preview |
  | 4345 | unassigned (B5 runs no server)                    |                                                                                                                                                                                                                                        |
  | 4346 | the verifier                                      | the parity audit, the perf budget's rows on a preview or production, `vite preview` of an existing `apps/studio/dist` for a local comparison                                                                                           |

  The dev server measures nothing: every number of SPEC-4 section 4 comes from the node-server
  build (check step 31) or a preview deployment, and a builder's run on a dev server is a smoke.

- The written exception for the focus round (`docs/FOCUS.md`, the binding specification;
  `docs/gslides-parity/focus/build/integrator.md` and `BUILD-STATUS.md` the record): the round
  four form stands, with the two secrets at 32 characters or more (`apps/studio/src/server/auth/
secret.ts` refuses a shorter session secret and the server answers 500 on every route). From
  `apps/studio`:

  `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_SESSION_SECRET=<32 or more fake characters> TURBOSLIDE_DOWNLOAD_SECRET=<32 or more fake characters> node_modules/.bin/vite dev --port <port> --strictPort`

  | Port | Who                                                                               | Notes                                                                                                                                       |
  | ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | 4321 | the integrator, the verifier, `scripts/check.mjs`                                 | the file store; the `/new` boot probe and `new-write-probe.mjs` at every merge; check steps 17, 18, 20, 21, 26, 31 and 32 start and stop it |
  | 4361 | b1 (the surface: the menu model, the toolbar, the palette, the right click menus) | the surface probe as a smoke                                                                                                                |
  | 4362 | b2 (text and slides)                                                              | the text and filmstrip smokes                                                                                                               |
  | 4363 | b3 (objects: shapes, lines, pictures, arrange)                                    | the objects smokes, `scripts/canvas-fidelity.mjs` under the lock                                                                            |
  | 4364 | b4 (the drivers)                                                                  | the probe's `--core` mode and `apps/studio/e2e/core/*.spec.ts` while they are written                                                       |
  | 4365 | b5 (documents: README, `docs/readme/**`, the /home copy)                          | `docs/readme/shoot-readme.mjs` as a smoke                                                                                                   |
  | 4366 | b6 (access, sharing and collaboration)                                            | `roles`, `comments`, `share` and `security` specs, in shadow and in enforce mode (`TURBOSLIDE_AUTHORIZE=enforce` on the server)             |
  | 4367 | the integrator                                                                    | the merge smokes and `node scripts/probes/core-gate.mjs --base http://localhost:4367` beside 4321                                           |
  | 4368 | unassigned                                                                        | spare                                                                                                                                       |
  | 4369 | b7 (the server: the write path, the head read on the blob tier)                   | `new-write-probe.mjs`, the draft picture probe                                                                                              |

  The switch of the round: one `MenuSetting`, `advancedTools`, off by default and remembered per
  browser under `ts-editor-settings`; one row, Tools > Advanced tools (`tools.advancedTools`, a
  check row after Check slides); one flag, `advanced: true`, on a `MenuItem`, a `ToolbarControl`,
  the object form of a `ContextEntry`, a `PaletteEntry` and a Format options section; one
  predicate, `isPresent`, which also hides every Later stub while the switch is off. Hidden, never
  disabled, never deleted: a parked row leaves the menu bar, the toolbar, the right click menus,
  Search the menus, the shortcuts dialog and the bottom bar's view buttons; its block still
  renders; its actions stay on the CLI, MCP, HTTP and window transports and the skills document
  them as advanced. A driver flips the switch through the product (`menu.tools.advancedTools`) and
  reads it from `describe().state.settings.advancedTools` or `.pt-viewer[data-advanced-tools]`.
  The rule for bringing a feature back is docs/FOCUS.md section 8: its rows join the matrix, pass
  on a preview and on production, and only then lose the flag; a feature returns whole or not at all.

  The test matrix (docs/FOCUS.md section 6): `docs/gslides-parity/focus/core-matrix.json`, 390
  rows with stable ids `area.feature.interaction`, read in place by `scripts/probes/core-matrix.mjs`
  (validated on load; `parkedFeaturesOf` and `shipVerdict` compute rule 4 of section 1 and the
  exit rule of 6.2). Two drivers: `node scripts/probes/editor-walk-probe.mjs --core --base
<origin>` (its own walk over the parity walk's helpers, `scripts/probes/core-walk/`, one module
  per area, the scratch deck from `/new` trashed and deleted forever at the end) and the seven
  `apps/studio/e2e/core/<area>.spec.ts` (created and torn down through the product, one context per
  file, a second person a second context, no fixture and no disk). `node scripts/probes/core-gate.mjs
--base <origin> [--out <dir>] [--parked docs/gslides-parity/focus/ship-<commit>.json]` runs both,
  merges every row by id, writes `core-matrix.md` and `core-gate.json` (the `results` map by id is
  what `docs/readme/what-works.mjs --results` renders the README from), asserts `retries` zero and
  exits 1 on any failed, not driven or no step row outside the committed parked list; against a
  localhost base it takes `.turboslide/e2e.lock` itself for the whole run, so a caller never holds
  the lock while it runs; against a deployment it needs no lock and sends `VERCEL_OIDC_TOKEN` as
  `x-vercel-trusted-oidc-idp-token`. Check step 32 is the gate against the runner's server. A row
  the orchestrator's ruling (3) marks manual (`manual: <the obstacle>` in the matrix, a step in
  `docs/gslides-parity/focus/manual-checklist.md`) is recorded not driven with its reason, is never
  counted as passed, parks no feature and fails no ship; a failed manual row fails like any other.
  A not driven row is never reported as passed, anywhere. Step 19 also runs `node
docs/readme/what-works.mjs --check`: the README section "What works today" is rendered from the
  matrix and a stale one fails the chain. The evidence the gate, the probes, the layout shift
  audit and the audit scripts write under `docs/gslides-parity/focus/verification/` (the JSON and
  the generated layout shift reports) and the audits' JSON under `focus/audit-*/` and
  `return/audit-*/` are in `.prettierignore` as written, the rule the earlier rounds' evidence
  folders carry, so a regenerated file never fails step 19; the hand written notes beside them
  stay under the formatter. The acceptance of a ship (6.2): every core row of every
  feature not in the committed parked list passes on the preview built from the ship's commit and
  on production after the alias moves, in the last run of each origin, with the run ledger in the
  ship note and `retries` zero; a row that passes only on a rerun with no code change is flaky and
  fails the ship. `scripts/tooltip-audit.mjs` runs in two passes, the default view and `--advanced`.

  The second cycle of the round (2026-09-16; `docs/gslides-parity/focus/build/BUILD-STATUS.md`
  "Cycle 2"): the click model of `docs/gslides-parity/focus/AMENDMENTS.md` A1 is the canvas rule
  (one click selects an object with the ring, the handles and the chip and places no caret; a
  pointer down anywhere inside a selected object drags it, the whole selection when several are
  selected; a double click on a text object opens the session with the caret at the point; a
  printable key on a selected text object starts the session over the whole text; Enter starts it
  with the caret at the end; Escape returns to the object and a second Escape clears the
  selection), so a spec that types into a run enters by a double click, never a single click.
  Insert > Shape, Insert > Line and Format > Borders & lines are parked whole at the first ship
  under the orchestrator's ruling (1) (FOCUS.md section 4); the ship's parked list is
  `parkedFeatures: ["shapes", "lines"]` (`docs/gslides-parity/focus/verification/parked-cycle2.json`
  until the ship names its commit), the walk drives their rows with the switch on as the evidence
  for the return, and the two features return whole under FOCUS.md section 8. A dev server a lane
  measures against runs on `apps/studio/vite.no-watch.config.ts` (`-c`, the watcher blind to the
  repository, HMR on) so another lane's save cannot remount the page mid run, and no lane edits a
  source file while any Playwright or probe run is on the checkout's servers. Two preview only
  arrangements of the drivers step around Vercel Authentication and never around the product (the
  card Download's bytes fetched with the OIDC header, the hero row's speculation rules removed
  before the click); production and localhost run both rows as written. The store's second cycle
  rules (a deadline on every Blob call, the listing joined with the instance's mirrors, a
  `version.restore` record as an external checkpoint, `readEditorDeck` at the head, the proven
  record and sidecar reads, no cached null on the blob tier) are `docs/hosting.md` "Reads"; the
  third cycle's (every call cancelled underneath at its deadline, 10 s for a read, 20 s for a
  document put and 90 s for a twin put, the hosted collection's head poll at 1 s and one at a
  time, a version record read through the store's head before its public URL, the presence
  roster and the comments index shared across instances through records on the store) are the
  same section and `packages/store/src/presence-store.ts`.

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
environment); `docs/archive/status/HOSTED-STATUS.md` records the round.

Round three adds the tiers of SPEC-3 2.5 behind environment switches. The realtime channel
(`@turboslide/realtime/select`, `selectRealtime(env)`) is `memory` on a checkout and in the tests,
`redis` when `TURBOSLIDE_REALTIME=redis` or `REDIS_URL` is set, and `blob` hosted without Redis
(`BlobStore.write` per batch, a one second head poll, the presence roster and the comments index
shared across instances through records on the store since the focus round's third cycle while
live cursors stay per instance, and the title row says so). Identity is the sealed anonymous cookie `__Host-ts_id` (`apps/studio/src/server/auth/session.ts`)
under `TURBOSLIDE_SESSION_SECRET`; a hosted deployment without it derives the secret from
`TURBOSLIDE_TOKEN` and warns once. Accounts are better-auth over `node:sqlite` when
`TURBOSLIDE_AUTH_DB` is set and Postgres when `DATABASE_URL` is set, else anonymous only; mail is
captured with `TURBOSLIDE_MAIL=capture` on every preview. Documents move to a private Blob store
(`turboslide-private`) while assets stay on the public one (`turboslide-decks`), through
`turboslide admin migrate-storage` with a dual read window and a rollback flag (SPEC-3 8.9, 11.5).
`authorize()` runs in shadow mode (`TURBOSLIDE_AUTHORIZE=shadow`, the default; `enforce` after the
week SPEC-3 R3 and R5 name). `TURBOSLIDE_DOWNLOAD_SECRET` (16 bytes or more) is required on every
hosted environment and on a tmp store. `docs/hosting.md` (B2's this round) carries the
environment table and the runbook.

The account boundary of round three (the orchestrator's rule, above SPEC-3 where they differ):
no agent installs a Vercel Marketplace product, creates a paid resource, changes DNS, registers a
sending domain or signs up for any service. The redis channel, the Upstash rate limiter, Neon
Postgres and Resend are implemented and tested against fakes and local backends (the memory and
blob channels, the file and blob stores, `node:sqlite`, `TURBOSLIDE_MAIL=capture`, the in memory
and blob rate limit backends), and `docs/hosting.md` names the exact steps and variables Kevin
sets to turn each one on. Previews and production run on the degraded tiers this round
(multiplayer over the blob channel, anonymous identity with the name prompt, magic link disabled
with the row saying why) and the verifier measures them as they are. A second Blob store
(private) may be created through the vercel CLI if SPEC-3 11.4 needs it, because Blob is part of
the project's storage and not a Marketplace install; the storage migration runs on the preview
store first and on production only after the verifier has proved the dual read window and the
rollback flag. The WAF rules ship as `firewall/rules.json` and are applied in log mode only,
through the Vercel API from the ship step, if the plan accepts them; a refusal is recorded and
never worked around. `TURBOSLIDE_AUTHORIZE` ships in shadow mode on production (SPEC-3 R8) so no
existing deck link breaks. At merge 2 the preview and production environments of the Vercel
project hold `TURBOSLIDE_TOKEN` and `BLOB_READ_WRITE_TOKEN` only; the merge 2 preview carried
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_AUTHORIZE=shadow`, `TURBOSLIDE_SESSION_SECRET` and
`TURBOSLIDE_DOWNLOAD_SECRET` as per deployment variables (`vercel deploy -e`, values generated
and never printed), and the ship step sets the two secrets on the project's production
environment with Kevin before the deploy (a blob store refuses to mint an export token without
`TURBOSLIDE_DOWNLOAD_SECRET`).

## Installs and dependencies

- `pnpm install` runs once, by the scaffolder or the integrator. Never run `pnpm install` while
  another builder may be installing. If a package needs a dependency, add it to that package's
  `package.json` (and to the catalog if it is new) and tell the integrator in the report; do not
  install it.
- `pnpm-workspace.yaml` carries `allowBuilds` because pnpm 11 refuses unlisted build scripts. A
  new dependency with an install script needs an entry there, decided explicitly.
- `pnpm check` starts with `pnpm install --frozen-lockfile`, so the lockfile is always committed
  and current.

- Round three catalog entries (SPEC-3 0.20, 0.23, 0.25, 0.27, 2.5, 8.10; merge 1): `better-auth`
  1.7.4, `kysely` 0.29.5, `ioredis` 6.0.0, `dompurify` 3.4.15 (with the pinned `jsdom` and
  `@types/jsdom` 30.0.0), `@upstash/ratelimit` 2.0.8 with its peer `@upstash/redis` 1.38.4,
  `@simplewebauthn/server` 14.0.1 and `@simplewebauthn/browser` 14.0.0, `resend` 6.28.0, `pg`
  8.23.0 with `@types/pg` 8.23.1, `ulid` 3.0.2; `sharp` bumped to 0.35.4 (GHSA-rgj7-g3m4-5g8c). A
  builder names a package and its version in `docs/gslides-parity/build-3/<key>.md`; the
  integrator adds it to the catalog and to the consuming package's `package.json` and installs
  once. `ulid` is in the catalog and attached to no package yet.
- `pnpm-workspace.yaml` carries an `overrides` block since round three: `pptxgenjs>image-size` is
  removed (`-`) because pptxgenjs never loads it (its Node path requires the module name `sizeof`)
  and no image-size release fixes its two advisories; `pnpm audit --prod --audit-level=high` is
  clean with it (check step 28 of SPEC-3 16.1).
- The per checkout agent token lives at `.turboslide/token` (SPEC-3 7.7), gitignored with the rest
  of `.turboslide/`. Never print it, and never print `TURBOSLIDE_TOKEN`, a cookie value or a key.
- Round four catalog entry (SPEC-4 0.31; day 0): `@vercel/functions` 3.9.7, attached to
  `apps/studio` for `waitUntil` (SPEC-4 names no version; the newest release on 2026-09-14 was
  pinned). Two workspace edges joined the graph: `@turboslide/theme` depends on
  `@turboslide/effects` (`brand.ts` imports `bayer8`) and `@turboslide/chrome` on
  `@turboslide/theme` (`TurboslideMark.tsx` imports the geometry module); both point down the one
  way direction. A builder names a package and its version in
  `docs/gslides-parity/build-4/<key>.md` and the integrator installs once.

## Ownership and git

- Builders own disjoint packages and create or edit only the paths their task assigns. The
  scaffold placeholders (`src/index.ts` in every package) are meant to be replaced by their owner.
- Never `git add -A`. Run git commands only when the task lists them. Commits in this repository
  are authored as Kevin <kk23907751@gmail.com> (the repo-local identity).
- Nothing is claimed done until the acceptance commands exit 0 and the report files named in the
  milestone plan exist. A claim about a deck names the revision.

- Round three: ownership is the "Owns" lists of `docs/archive/gslides-parity/MILESTONES-3.md`; a change
  needed in another builder's file is a request in `docs/gslides-parity/build-3/<key>.md` and the
  integrator makes it or reassigns it. `pnpm generate:contracts` is run by B1 and the integrator
  only; `pnpm install`, `pnpm build` and `vite build` are the integrator's (the one exception is
  the B5 row under the dev server rules). Nothing is committed until the ship step.
- Round four: ownership is the "Owns" lists of `docs/archive/gslides-parity/MILESTONES-4.md` with the day 0
  amendments of `docs/gslides-parity/build-4/integrator.md` section 3; a request goes in
  `docs/gslides-parity/build-4/<key>.md` and the integrator makes it. From merge 1
  `apps/studio/src/editor/controller.tsx` is B4's, and `editor/EditorRoot.tsx`,
  `editor/shell-bridge.tsx`, `routes/-edit-search.ts` and the route files are B3's. From merge 2
  (b2.md R8, b3.md R10): B2 owns `apps/studio/src/routes/home.tsx` and `home.css`,
  `apps/studio/src/components/home/**` (the nine bands, `HomeLink.tsx`, `HomeEditor.tsx`,
  `Shot.tsx`, `SpriteIcon.tsx`, `copy.ts`, `facts.ts`, the generated `facts-data.ts`, `shots.ts`
  and `shots.json`, the three tests), `apps/studio/e2e/home-page.spec.ts`,
  `scripts/build-home-assets.ts` and `apps/studio/public/home/**` (generated, never edited by
  hand; `facts-data.ts` is a checked copy of ten values of `packages/theme/brand/facts.json` with
  its sha256, and `build-home-assets.ts --check` and `facts.test.ts` fail when the facts file moves
  on); B3 owns `apps/studio/src/routes/-recent.ts`, `-recent.test.ts`, `-link-slot.tsx`,
  `-access-page.tsx` and `apps/studio/src/components/PresenterPage.tsx` beside the route files.
  Nothing is committed until the ship step; the untracked `packages/native/wasm/` files of a local
  build are never committed before B4 replaces them with CI's outputs and `BUILD-RECORD.json`.

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
`export-batch.spec.ts`). `docs/archive/gslides-parity/BUILD-STATUS-2.md` records the merge 2 run.

The M4 lines beyond `pnpm check` are the skills and coverage vitest files
(`packages/agent/src/__tests__/{skills,coverage}.test.ts`), `apps/studio/e2e/agent-http.spec.ts`
and `node apps/cli/e2e/mcp-http.mjs` against a server on 4321 (the script starts one when nothing
answers and stops it), `turboslide judge bundle` and `scripts/judge-loop.mjs` (docs/judge-loop.md).

The M5 lines beyond `pnpm check` are in the M5 section of the milestone plan: the zero-escape
re-import with identical ids (`scripts/check.mjs` steps 8 and 12 now gate on zero escapes and
compare every slide), `asset dither --all-two-tone --from-recorded --verify-cells`, the liquid
metal `material capture` against `decks/gt-brand/assets/liquid-metal-diamond.recipe.json`, a site
capture with the `gt-site` recipe, `cargo test`, the native build with the parity test, the
native PPTX gate in the container, and the lint fixture index. `docs/archive/status/M4-M5-STATUS.md` records the
run with its numbers. `pnpm-workspace.yaml` lists `packages/native/npm/*` (the per-platform addon
packages `@turboslide/native` depends on optionally) so the frozen-lockfile install in the render
worker image resolves them.

All 18 M1 steps passed on the M1 tree (2026-09-10, 219 s on Kevin's machine with the Prototemplate
checkout present); `docs/archive/status/M1-STATUS.md` records every step with its measured numbers. All 19 steps
pass on the M2 tree (2026-09-10, 145.4 s on the same machine); `docs/archive/status/M2-STATUS.md` records them
with the rest of the M2 acceptance list. All 19 steps pass on the M3 tree (2026-09-10, 163.4 s on
the same machine) and the five other M3 lines pass against a server on 4321 started and stopped by
the verifier; `docs/archive/status/M3-STATUS.md` records them. On the M4 and M5 tree (2026-09-11, the same
machine, the render worker image building alongside) steps 1 to 18 passed in 265.6 s of step time,
step 19 failed once on two unformatted files of the fix round and passed alone after they were
formatted, and every M4, M5 and M6 item 1 line plus the directive's lines passed: the container
gate on the rebuilt image in 348 s, the Slides exporter (since removed) as a dry run in both
modes, the judge loop as written with its runner dropped at the preflight; `docs/archive/status/M4-M5-STATUS.md`
records them with the numbers. On the bare scaffold only steps 1 to 6 passed (install, route
generation, contracts generation, `tsc -b`, vitest, build plus the client bundle check).

The hosting round's lines beyond `pnpm check` (2026-09-11) are a preview deploy of the tree,
`node scripts/hosted-smoke.mjs <preview>` at 6 of 6, one synchronous export on it, and the
integrator's preview drives (`docs/archive/status/hosted-evidence/README.md`). On the hosting tree steps 1, 2 and
4 to 19 passed (271.9 s of step time; step 3 failed as written on the uncommitted generated files,
was verified by regeneration and diff, and passed alone after the paths were staged), the preview
`turboslide-8ueqvr3ej` answered the six rows and a one-slide flatten export in 7.46 s with
`perfect: true`; `docs/archive/status/HOSTED-STATUS.md` records them with the numbers, the production URL facts
and what Kevin must decide.

The editor depth round's lines beyond `pnpm check` (2026-09-11 to 12) are a preview deploy of the
tree, `node docs/archive/status/editor-depth-drive.mjs <preview>` (one Playwright page at 1440 by 900 through
the head and density, a deck from the GT template, the Insert menu's primitives, the freeform
switch, drag with guides, resize, align, palette and custom colors with the lint mark, typography,
a drag across columns, tooltips, the menu's Perfect export, the bundle round trip and present),
`node scripts/tooltip-audit.mjs --base <built client>` at zero misses, `turboslide export check` on
the exported files, `turboslide deck pull` and `deck push` against the preview, and eight writes
through `POST /api/actions` landing in the Blob store; `docs/archive/status/EDITOR-DEPTH-STATUS.md` records the
run with its numbers and `docs/archive/status/editor-depth-evidence/` holds the screenshots and tables. On that
tree steps 4 to 19 passed (step 3 fails as written on the uncommitted generated files and passes
by regeneration and diff; step 5 timed out twice on the material capture test while other
worktrees' servers loaded the machine and passed alone and on the rerun).

Round three's lines (`docs/archive/gslides-parity/SPEC-3.md` 16.1; `docs/archive/gslides-parity/BUILD-STATUS-3.md`):
`pnpm check` is 28 steps; step 26 runs the eight two browser specs of the round against the
runner's server on the memory channel with `TURBOSLIDE_AUTH_DB=.turboslide/auth.sqlite`,
`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_LOCAL_OPEN=1` and `TURBOSLIDE_AUTH_RATE_LIMIT=off`, step 27
runs `scripts/layout-shift-audit.mjs` against `vite preview --port 4344` of the production build
(started by the integrator or the verifier over `pnpm build`; the step skips with its reason when
nothing answers on 4344), and step 28 is `pnpm audit --prod --audit-level=high` with
`scripts/audit-allow.json`. Beyond `pnpm check`: `node apps/cli/e2e/share.mjs` (the CLI walk of the
64 actions on a temp deck, 19 steps), the merge 2 action walk over `POST /api/actions` (every GS3
id resolves; `.turboslide/int2-actions-walk.mjs`), `node scripts/hosted-smoke.mjs --base <preview>
--token-env TURBOSLIDE_TOKEN` with `VERCEL_OIDC_TOKEN` from `vercel env pull` in the environment
(19 rows; the development token expires within the hour, pull it again when every row answers
403 `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH`), and the verifier's VERIFICATION-3 rows. On the merge 2
tree (2026-09-13, `BUILD-STATUS-3.md` "The tree at merge 2") steps 1, 2 and 4 to 18 passed in
parts (step 5 once the machine was quiet, step 6 after the sessions split and the overwrite
allowlist, step 18 after the chrome lint's hue exception), step 3 fails as written on the
uncommitted generated files and passes by regeneration, step 19 fails on the other workflow's
untracked documents alone, and the remaining steps are recorded step by step in
`docs/gslides-parity/build-3/integrator.md` section 15.

Round four's lines (`docs/archive/gslides-parity/SPEC-4.md` 6.1 and 0.46; `docs/archive/gslides-parity/BUILD-STATUS-4.md`):
`pnpm check` is 31 steps. Step 29 is the generated files check: `node scripts/build-brand.ts
--check` (the icon set, the twins and the card against `apps/studio/public/brand-manifest.json`
by bytes, rebuilt and compared, plus the facts of SPEC-4 6.4; it launches Chrome for Testing once
for the card compare when chromium-1217 is present and the fonts venv's python once for the
outlines, and prints why it skips either), then `node scripts/build-home-assets.ts --check` (the
`/home` screenshots and `facts-data.ts` against `facts.json`), `node
packages/schema/scripts/build-definitions.mjs --check` (the shape table as one compact string and
`ids.ts`; the generator moved from `src/shapes/` at merge 2) and `node
packages/native/scripts/check-record.mjs` (the wasm module rebuilt when cargo, the wasm32 target
and wasm-bindgen are present and compared with `packages/native/BUILD-RECORD.json`; the Linux
addon by hash, a pending addon reported and not failed). Step 30 is `NITRO_PRESET=vercel pnpm
--filter @turboslide/studio build:deploy && node scripts/check-vercel-output.mjs` (the header rules
of SPEC-4 1.6 and the `/` redirect in `.vercel/output/config.json`, the static files of 0.13, every
picture under `apps/studio/public/brand/` and `/home/`, the prerendered `/home`, every `*.func`
directory against 250 MB); it runs on a machine linked to the Vercel project
(`.vercel/project.json`) once `brand-manifest.json` exists, or with `TURBOSLIDE_CHECK_VERCEL=1`,
and is skipped in CI. Step 31 is `node scripts/perf-budget.mjs --base http://localhost:4321
--profile local --write --runs 3 --json .turboslide/perf-budget.json` against the node-server
build the runner makes (`NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy`,
then `node apps/studio/.output/server/index.mjs` with `PORT=4321`, `TURBOSLIDE_STORE=tmp` and the
two fake secrets), never the dev server and never `vite preview`, with `--report` in CI until two
runs agree, followed by `node scripts/check-client-bundle.mjs apps/studio/dist --base
http://localhost:4321 --client apps/studio/.output/public` (the per route preload ceilings of
SPEC-4 3.12 read from the served heads of `/decks`, `/deck/gt-brand` and `/edit/gt-brand`; the
largest chunk ceiling of 600,000 bytes is asserted in step 6 too). The `TURBOSLIDE_CHECK_PERF`
opt in of days 0 to 5 is gone since merge 2. Step 18's `lint --chrome` list carries `/home` and
the Not found page (`/no-such-page`, a 404 the shell driver accepts when the document carries
`main[data-control="notfound"]`), both with `--states ''`; step 26's list carries
`home-page.spec.ts`. Every merge runs `node scripts/probes/new-write-probe.mjs --base
http://localhost:4321` (17 rows: the draft on `/new`, six writes saved, the address moved to
`/edit/<id>`, the room attached, the reopened page's first write, Move to trash and Delete
forever) against a dev server the integrator starts with `playwright.config.ts`'s environment on
the file store and stops afterwards. Beyond `pnpm check`: the per builder lines of SPEC-4 6.2, the
verifier's VERIFICATION-4 rows, `node scripts/hosted-smoke.mjs` on the preview with the round's
rows, and `NO_COLOR=1 node apps/cli/bin/turboslide.mjs --version` twice with identical output
(from B1's day 3). `scripts/tooltip-audit.mjs` walks `/home` in its default list; one page alone
is `--url <page>` (the `--only` of MILESTONES-4 B2's acceptance line is not a flag of the script).
`scripts/hosted-smoke.mjs` carries the round's rows: `/home`, the icon set, the card, the eight
twins and `/home` twice with `x-vercel-cache: HIT` on an https base, the thumbnail cache with and
without `r`, and with `--token-env` the `/api/agent` `instance` facts (the effects backend, the
runtime's glibc) and, with `--template-copy`, one deck created from the GT template and deleted
forever again. On the merge 1 tree (2026-09-14, `BUILD-STATUS-4.md` "Merge 1") steps 1, 2, 4, 5,
6 and 29 passed and the probe answered 17 of 17; the merge 2 run is recorded in
`BUILD-STATUS-4.md` "Merge 2".

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
  is read by the Vite plugin. Both produce the same route list; since round three the Start Vite
  plugin appends a `declare module '@tanstack/react-start'` `Register` block (ten lines) that the
  CLI does not write, so the two copies differ by that block alone and `tsc -b` passes with either
  (round four, `build-4/b3.md` finding 5).
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
  every `on(...)` handler of the editor's controller (`apps/studio/src/editor/controller.tsx`; the
  edit route file until round four's merge 1) is the store action over the editor's store, so one
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

- The round three seams (gslides-parity SPEC-3; MILESTONES-3 "The seams every builder types
  against"), as merge 1 installed them:
  - `@turboslide/schema/{comments,access,transform,blocks/dither}` are subpath exports.
    `Author.principalId?`, `text.splice` and `text.mark` in `MUTATION_OPS` with exact inverses,
    `PictureDither` on `picture` and `shot`, `Asset.variants`, `HtmlBlock.htmlSanitized?`, the 64
    GS3 action ids in `ACTION_IDS` (169) with the milestone `GS3` and the six new action groups;
    `transformSplice`, `transformMark`, `transformMutation` and `transformAgainst` throw
    `NotImplementedError` until B1's day 3.
  - `@turboslide/realtime/{channel,protocol,keys,memory,redis,redis-fake,blob,lua,coalesce,admission,select}`
    (the `client/*` exports name B2's day 4 files). No `node:` import anywhere in the package; the
    Redis client is injected (`ioredisCommands(client)`) and `ioredis` is a dependency of
    `apps/studio` alone.
  - `@turboslide/identity/{ids,labels,hues,names,access,resolve,marks,principal,sha256,index}`,
    browser safe. `decide(record, ctx, capability, options?)` is the matrix of SPEC-3 6.2 with its
    cell by cell test; `readPrincipal(request, secret)` lives in
    `apps/studio/src/server/auth/session.ts`.
  - `DeckStore.putAsset(relative, bytes, contentType?)` and `removeAsset(relative)` on
    `@turboslide/store/store` for the file, tmp and blob backends: nothing under `assets/` is ever
    overwritten (`AssetExistsError`; identical bytes are idempotent) and names carry the digest
    (`digestAssetName`, `assetDigest` of `@turboslide/store/file-store`). `VersionRecord.ops?`;
    `access.json` is not mirrored and `comments/` travels with the records.
  - `authorize(ctx, deckId, capability)` in `apps/studio/src/server/authorize.ts`, shadow by
    default; `SERVER_SIDE_WINDOW_ACTIONS` carries the ids of SPEC-3 11.3 and the dispatcher
    answers `NotImplementedError` 501 for a landed id without a handler; `TURBOSLIDE_TRUST_PROXY`
    decides whether a forwarded host is believed.
  - The renderer's DOM: `.picture[data-dither][data-dither-key][data-dither-state]`,
    `canvas.picture-dither` in live renders only, `img[width][height]` on every emitted image,
    `iframe.ts-x-frame` behind `RenderOptions.htmlFrame`, and the collaborator classes and
    geometry of `@turboslide/render/collab` (`COLLAB_CLASSES`, `COLLAB_GEOMETRY`).
    `@turboslide/render/{collab,dither-key,blocks/dither-attrs,blocks/html-frame,blocks/img-size}`
    are exports; `@turboslide/materials` and `@turboslide/chrome` depend on `@turboslide/render`
    directly.
  - The chrome contract: `EditorShellInput` gains `presence`, `comments`, `inbox`, `access`,
    `account`, `sync`, `role`, `capabilities` and `mode`; `MenuRole` is the schema's `Role` plus
    `none`, `MenuCapability` is the schema's `Capability`, `MenuActionId` is `ActionId` again,
    `PictureDitherLike` is `PictureDither` and `MarkSpecLike` is `MarkSpec` (the names kept). The
    model loads under plain Node for the parity audit. The theme sprite carries Heroicons `bell`
    and `inbox` (70 symbols; `ICON_NAMES` agrees).
  - `apps/studio`'s unit tests run under vitest (`apps/studio/vitest.config.ts`, `src/**/*.test.ts`)
    and in the root `pnpm test`; `apps/studio/e2e/*.spec.ts` stay Playwright's. Every package has a
    `vitest.config.ts`, so `cd <package> && ../../node_modules/.bin/vitest run` runs it alone.
  - Merge 2 (`docs/gslides-parity/build-3/integrator.md` section 8): the studio's deck dispatcher
    (`apps/studio/src/server/actions.ts` `deckDispatcher(deckId, { request? })`) composes the
    round in a fixed order, the later registration of an id winning: the readers, the CLI's store
    actions (`picture.dither`, `version.diff` included), the deck folder actions, the hosted
    collection actions and `slide.import`, B1's record actions (`@turboslide/cli/record-actions`
    over the studio's store with the access record read and written through
    `hostedAccessHooks` of `server/access.ts`, `RecordDeps.access`), B2's stream path for the
    twelve comment ids (`commentCallerFor` then `runCommentAction`) and the inbox for the three
    notification ids, `admin.migrateStorage`, B3's account and admin ids with the request's
    identity (`auth/actions.ts`), the materials package's `asset.*`, `material.*` and
    `picture.materialize` (the dither pipeline), the worker actions and `admin.flag`. The two
    background writes stay the record actions' (one write per call; the file, url and upload
    forms through `asset.add`), on the CLI too (`apps/cli/src/dispatch.ts` forwards
    `picture.materialize` alone to the materials package). The caller of the record, comment,
    notification and account actions is the request's identity (B3's `requestIdentity`), never
    the body; a cookieless request the localhost rule admits (curl, `--to` on a dev server, an MCP
    client) is the checkout holder `agent:localhost` on both identity paths (`server/actions.ts`
    `callerFactsFor`, `server/room.ts` `requestIdentity`), so a walk sees one caller. The access
    record lives at `decks/<id>/.turboslide/access.json` on a checkout (the CLI, the access store
    and `authorize()` agree) and in the access store hosted; `bindAuthorize({ loadRecord })`,
    `bindIdentityHooks({ findShareLink, deckIndex })` and the Redis and Upstash binds run once per
    server process from `apps/studio/src/start.ts` (`bindServerSeams`). `/api/share/<id>/<action>`
    dispatches the same handlers. The CSRF filter passes a bearer on the three room routes and GET
    on `/device` and `/api/auth/magic-link/verify`; `playwright.config.ts` and `scripts/check.mjs`
    start their servers with `TURBOSLIDE_LOCAL_OPEN=1` and `TURBOSLIDE_AUTH_RATE_LIMIT=off`.

- The round four seams (gslides-parity SPEC-4; MILESTONES-4 "The seams every builder types
  against"; the orchestrator's rulings above SPEC-4 where they differ), as merge 1 installed them:
  - The brand module: `@turboslide/theme/brand` (`packages/theme/src/brand.ts`, framework free,
    `bayer8` from `@turboslide/effects/bayer`) is the one geometry source (SPEC-4 0.10):
    `BRAND_TOKENS` and `BRAND_TOKENS_NARROW`, `WINDOW`, `FIELD_END`, `isBody`, `windowDistance`,
    `field`, `markBits(N)`, `litCount`, `markPath(unit = 2)`, `cellRects`, `markGrid(sizePx)`,
    `markSvg`, `markBlocks`, `CELL_THRESHOLD_PX = 64`, the tile data (`TILE_SIZES`, `solidWindow`,
    `tileMarkPath`), the WCAG helpers and `SELECTION_COLORS`. `TurboslideMark.tsx`,
    `scripts/build-brand.ts` and the CLI banner import it, and nothing else computes the mark's
    bits or path, so the tab icon, the title row, the README, the card and the terminal draw one
    form. `@turboslide/theme/brand/site` is `SITE` (`description`, `imageAlt`,
    `origin(requestOrigin?)`, `themeColor`, `icons`, `twins`, `card`, `manifest`, `robots`) and
    `/home` reads the twins and the brand paths from it. `@turboslide/chrome/brand.css` carries the
    eleven `--ts-` identity tokens on `:root`, the 760 px block, the two `::view-transition-*`
    rules of 0.40 and the lockup and Not found classes; `__root.tsx` loads it after `tokens.css`
    for every route, so no route sheet declares a `--ts-` identity token (`grep -cE --
'--ts-(cell|mark|h1|h2|h3|lead|body|small|figure|rail|plate)\b' apps/studio/src/styles.css`
    is 0; round three's `--ts-` presence tokens stay).
  - The chrome components (B1): `TurboslideMark({ size, tile? })` (the solid path under 64 px, the
    cells of `markBits` from 64 px, `currentColor`, `crispEdges`; `role="img"`
    `aria-label="Turboslide"` alone and `aria-hidden` inside a labelled link),
    `AppBarBrand({ linkComponent?, homeTo = '/decks', aboutTo = '/home' })` (the mark as
    `appbar.home`, the word as `appbar.about`), `EmptyFigure({ title, sentence, action?, figure,
mark? })`, `TitleHomeLink` (`title.home`), and `Progress` with the deck's ramp masked on the
    fill's leading sixteen cells (`shiftOf`, `rampEdgeMask`). The `linkComponent` seam (SPEC-4
    0.16): `EditorShellInput.linkComponent?: LinkComponent` (`editor-shell.ts` `LinkSlotProps`:
    `{ to, preload?: 'intent', className?, children }` plus the anchor attributes) is the router's
    `Link` wrapped by the studio, so the chrome stays router free and a click on the title row's
    mark is a same document transition; a plain anchor when absent. B3 fills it in `EditorRoot`
    and mounts `AppBarBrand` on `/decks` (b1.md R5). `Thumb.capture?: 'never' | 'when-available'`
    is typed at merge 1 so `Sidebar` compiles against the seam; the behaviour is B4's day 2.
  - The selection colour (the orchestrator's ruling 1 over SPEC-4 0.3 and 0.9; Kevin's directive
    that the canvas boxes turn blue): `--pt-select` (`#1a73e8` light, `#3d86f0` dark) and
    `--pt-guide` (`#d6336c`, `#f0397a`) are the only additions to `packages/chrome/src/tokens.css`,
    and the acceptance gate `git diff --exit-code packages/chrome/src/tokens.css` reads "differs
    from `BASE` by that block only". The readers are the canvas selection ring, the eight handles
    and the rotation handle, the marquee, the hover outline, the crop frame, the group box and
    the selection chip (`Overlay.css`, `Marquee.css`) and the snap guides (`Guides.css`); the
    chrome lint's `select` and `guides` scopes (`packages/lint/src/chrome.ts`,
    `TURBOSLIDE_CHROME.select` and `.guides`, `SHELL_CHROME.tokens.select` and `.guide`) are the
    allow list, and a border or an outline in either colour anywhere else is a finding. Each
    value holds 3:1 against both the paper and the ink of its appearance (`brand.ts`
    `SELECTION_COLORS`, pinned in `brand.test.ts`), so a ring reads on a white slide and on a
    dark photograph. The remote collaborator outlines keep the six hues; the exports, the deck
    content, the menus, `/home`, the card and the README stay paper and ink.
  - The editor split (SPEC-4 0.44, PP 7 row 1; B3's day 1): `apps/studio/src/routes/edit.$deckId.tsx`
    is the route alone (`Route` with the skeleton and `EditMissing`, `EditPage`; 89 lines),
    `routes/-edit-search.ts` holds `validateEditSearch` (a dash prefixed file is not a route),
    `apps/studio/src/editor/controller.tsx` holds `createEditorController` with the hotfix's write
    path (`reportedRevision()`, `checkBase`, the room client wiring, `adoptExternal`, the `on(...)`
    table) and `toViewerDeck`, `editor/EditorRoot.tsx` holds `EditorRoot`, the stage and the
    banners with the two `recordDeckOpened` call sites, and `editor/shell-bridge.tsx` the shell
    glue; `new.tsx` imports `EditorRoot` directly. The import direction is route to `EditorRoot`
    to the controller and the shell bridge, never back into the page. Every unit moved verbatim
    (82 of 82; b3.md 1.1), so the route's reference module no longer carries the editor.
    `scripts/check.mjs` `INNER_HTML_ALLOW` names `editor/EditorRoot.tsx` for the sprite mount.
  - `import()` (SPEC-4 0.44): this file carries no rule against dynamic import. In the browser
    graph it is allowed in three places and nowhere else, all landed at merge 2 (B4's day 4;
    b4.md R13): `packages/viewer/src/MaterialMount.tsx` (`@turboslide/materials/mount` on the
    first `[data-recipe]` root), `packages/chrome/src/EditorShell.tsx` through `lib/lazyDialog.ts`
    (the 26 dialogs, `DiagramPanel`, `EditHtmlPanel` and `ShortcutsDialog` on first open under
    `Suspense`, preloaded when a menu first opens) and `packages/chrome/src/SourceDrawer.tsx`
    (CodeMirror through `source/editor` on the first open). SPEC-4's fourth place, the one `marked`
    importer in `packages/render`, does not exist: no `marked` is in the tree, so that diet row is
    void. Everywhere else the client code under `apps/studio/src/{routes,editor,components}`,
    `packages/chrome/src` and `packages/viewer/src` has none (the two `import('./x').Type` forms
    in `editor-shell.ts` and `editor-shell-context.ts` are type positions). The router's
    `lazyRouteComponent` importers are the Start plugin's, and the `import()` calls inside server
    function handlers (`apps/studio/src/server/*.ts`, `start.ts`) and the Node only packages are
    the server's, keeping those imports out of the client graph.
  - The studio side of the seams as merge 2 installed them (B3's days 2 to 5, b3.md R10):
    `apps/studio/src/routes/-link-slot.tsx` `RouterLinkSlot` is the router's `Link` as the
    chrome's `LinkComponent` slot (`EditorRoot` fills `linkComponent` with it, `AppBarBrand` on
    `/decks` and `/decks/trash` takes it); `decks.index.tsx` exports `useStreamedList(promise)`
    (one mounted list that suspends on the first promise and takes later ones through an effect;
    the loaders return the store listing unawaited so the shell and the Recent row render at
    first byte); the Recent row is a cookie mirror `ts-recent` of the `localStorage` record scoped
    to `Path=/decks` and pruned to twelve entries (`routes/-recent.ts`); `getDeck` and
    `getDeckSlides` are GET server functions whose RPC answer carries `public, s-maxage=60,
stale-while-revalidate=3600` only for the public shape of an open or published deck at the
    named revision (`private, no-store` otherwise, never on the document); the You need access
    page is `routes/-access-page.tsx` `AccessPage({ deckId })` over
    `@turboslide/chrome/YouNeedAccess`, mounted as the `notFoundComponent` of the deck, edit,
    present and print routes (the print route's line is the integrator's on b3.md R7); the
    presenter is its own chunk (`components/PresenterPage.tsx`, imported inside `component`, so
    `scripts/check.mjs` `INNER_HTML_ALLOW` names it and not the route file). The shell driver's
    default `readySelector` and the chrome lint's roots carry `.ts-product` (the `/home` root,
    b2.md R1) and `.ts-notfound`.
  - `turboslide --version` (SPEC-4 0.17; B1's day 3): a flag parsed in `apps/cli/src/cli.ts`
    before the command table and handled by `apps/cli/src/commands/banner.ts`; it prints
    `markBlocks(8)` from the brand module beside the word, the version, the hosted address, the
    action count and `effects backend: <describeBackends().selected>`, with no colour so
    `NO_COLOR` changes nothing, and `turboslide info` prints the same header before the deck
    facts. `apps/cli/src/commands/version.ts` stays the `version save|list|restore` command.
  - The head (SPEC-4 1.6; B1's day 1): `__root.tsx` carries the description, `application-name`,
    `apple-mobile-web-app-title`, the `og:*` and `twitter:*` set with the static card at
    `SITE.origin()` (which reads `TURBOSLIDE_PUBLIC_ORIGIN`, else the production origin),
    `/favicon.ico` with `sizes="32x32"` before `/icon.svg`, the touch icon, the manifest and one
    `theme-color` that a boot script after `<HeadContent />` sets to the stamped theme's paper;
    `NOINDEX_ROUTES` carries `/edit/$deckId`. `NotFound` is an `EmptyFigure` with the 64 px mark
    and three tooltipped buttons (`notfound.new`, `notfound.decks`, `notfound.about`). The icon
    set under `apps/studio/public/` (`icon.svg`, `favicon.ico` with three entries at 16, 32 and
    48, `apple-touch-icon.png`, `manifest.webmanifest`, `robots.txt`, `icons/*.png`) is written by
    `node scripts/build-brand.ts` and checked byte for byte against `brand-manifest.json` by
    check step 29; edit the generator, never a generated file.

## Deviations from the spec, recorded

The deviations recorded from M1 to round four (2026-09-10 to 2026-09-14) are in `docs/archive/deviations.md`. A later deviation is recorded in its round's specification.

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

## The rounds since 2026-09-19

Each round after the focus round has its own specification and keeps its evidence under `docs/gslides-parity/<round>/`. The binding documents are `docs/FOCUS.md` (the core set, the matrix and the ship gate of section 6.2), `docs/REALTIME.md` with `docs/CLOUDFLARE.md` (the realtime round) and `docs/NEXT.md` (the next program). A closed round's specification is a record. The last push of Round 1 moved the closed specifications to `docs/archive/rounds/` (`docs/NEXT.md` 5.2 item 4). In Round 1 the lanes and the files each lane owns are `docs/NEXT.md` 4.1.6, and a lane writes its requests in `docs/gslides-parity/round1/build/<key>.md`. The index of every document is `docs/README.md`.

| Round            | Specification                            | First committed | Shipped (`docs/updates.md`)               | Evidence                   |
| ---------------- | ---------------------------------------- | --------------- | ----------------------------------------- | -------------------------- |
| return           | `docs/archive/rounds/RETURN.md`          | 2026-09-18      | 2026-09-19                                | `return/`                  |
| product          | `docs/archive/rounds/PRODUCT.md`         | 2026-09-19      | 2026-09-21                                | `product/`                 |
| features         | `docs/archive/rounds/FEATURES.md`        | 2026-09-21      | ship one 2026-09-23, ship two 2026-09-26  | `features/`                |
| sync and costs   | `docs/archive/rounds/SYNC.md`            | 2026-09-21      | 2026-09-22                                | `sync/`                    |
| vector           | `docs/archive/rounds/VECTOR.md`          | 2026-09-25      | 2026-09-25                                | `vector/`                  |
| objects          | `docs/archive/rounds/OBJECTS.md`         | 2026-09-26      | 2026-09-27                                | `objects/`                 |
| polish           | `docs/archive/rounds/POLISH.md`          | 2026-09-28      | 2026-10-01                                | `polish/`                  |
| people           | `docs/archive/rounds/PEOPLE.md`          | 2026-09-29      | 2026-09-30                                | `people/`                  |
| realtime         | `docs/REALTIME.md`, `docs/CLOUDFLARE.md` | 2026-10-01      | shipping lane by lane from its own branch | `realtime/`, `cloudflare/` |
| the next program | `docs/NEXT.md`                           | 2026-10-01      | Round 1 is building on `next/round1`      | `next/`, `round1/`         |
