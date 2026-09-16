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

- The written exception for the Google Slides parity round three (`docs/gslides-parity/SPEC-3.md`,
  `docs/gslides-parity/MILESTONES-3.md`): the round two form stands with two additions. The
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

- The written exception for the Google Slides parity round four (`docs/gslides-parity/SPEC-4.md`,
  `docs/gslides-parity/MILESTONES-4.md`): the round three form stands with one more variable.
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

- The written exception for the Google Slides parity round five (`docs/gslides-parity/SPEC-5.md`,
  `docs/gslides-parity/SPEC-5-amendments.md`, `docs/gslides-parity/MILESTONES-5.md`; the
  orchestrator's rulings above them where they differ): the round four form stands. Seven builders
  and the verifier each run their own server on their own port with the tmp store, the memory
  realtime tier and both fake secrets, stopped before returning; nobody touches 4321 or another
  builder's port; nobody runs `pnpm build` or `vite build` outside `scripts/check.mjs`; Playwright
  runs only while the builder holds `.turboslide/e2e.lock` (`until mkdir .turboslide/e2e.lock; do
sleep 5; done`, released with `rmdir`; a lock older than two hours with no Playwright or probe
  process alive is orphaned and may be removed). `scripts/probes/editor-walk-probe.mjs --base
http://localhost:<port> --quick` stays green for the surfaces a lane changes (a step it cannot
  drive is recorded as not driven, never as passed). From `apps/studio`:

  `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_SESSION_SECRET=<fake> TURBOSLIDE_DOWNLOAD_SECRET=<fake> node_modules/.bin/vite dev --port <port> --strictPort`

  | Port | Who                                                                | Notes                                                                                                               |
  | ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
  | 4321 | the integrator, the verifier, `scripts/check.mjs`                  | the file store; the `/new` boot probe at every merge; steps 31 and 37 build and serve the node-server output here   |
  | 4351 | B1 (motion and the show)                                           | `motion.spec.ts`                                                                                                    |
  | 4352 | B2 (media, camera, screens, pictures, the store engineering)       | `media.spec.ts`, the `Range` and header rows                                                                        |
  | 4353 | B3 (import, templates, building blocks, nested groups)             | `import.spec.ts`, `templates.spec.ts`, the parity audit's Upload, Import slides, gallery and pane rows              |
  | 4354 | B4 (the page, print, ODP, SVG, the shape interpreter, the card)    | `page-setup.spec.ts`, `resize.spec.ts`                                                                              |
  | 4355 | B5 (text tools, chat, help, accessibility, the remaining rows)     | `text-tools.spec.ts`, `chat.spec.ts`, `lint --chrome` and the tooltip audit on `/help/training` and `/help/updates` |
  | 4356 | B6 (equation, theme, the second theme, dither families, the crate) | `theme.spec.ts`, `equation.spec.ts`, the parity audit's Insert > Equation, Edit theme and Themes panel rows         |
  | 4357 | the verifier                                                       | the parity audit, the perf budget's rows on a preview or production, `resize.spec.ts` against the preview           |
  | 4358 | B7 (the sync engine and the font catalog; SPEC-5-amendments A6)    | `sync.spec.ts`, `fonts.spec.ts`, `scripts/probes/sync-stress-probe.mjs`                                             |

  The dev server measures nothing: every number of SPEC-5 16.6 comes from the node-server build
  (check steps 31 and 37) or a preview deployment. A fixture that needs `ffmpeg`, the fonts venv,
  `cargo` or `soffice` is generated once on the builder's machine and committed; the check chain
  never runs those tools, and a builder without one records the exact commands for Kevin in
  `docs/gslides-parity/build-5/<key>.md` and ships the fallback without weakening a gate.

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

Round three adds the tiers of SPEC-3 2.5 behind environment switches. The realtime channel
(`@turboslide/realtime/select`, `selectRealtime(env)`) is `memory` on a checkout and in the tests,
`redis` when `TURBOSLIDE_REALTIME=redis` or `REDIS_URL` is set, and `blob` hosted without Redis
(`BlobStore.write` per batch, a one second head poll, presence per instance, and the title row says
so). Identity is the sealed anonymous cookie `__Host-ts_id` (`apps/studio/src/server/auth/session.ts`)
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
- Round five catalog entries (SPEC-5 1.6, 16.6; day 0, `pnpm audit --prod --audit-level=high`
  clean with all of them, `build-5/integrator.md` section 5): `@xmldom/xmldom` 0.9.12
  (`packages/import`, B3's reader), `temml` 0.13.5 (`packages/render`, B6's equation block),
  `nspell` 2.1.5 with `@types/nspell` 2.1.6 and the seven dictionaries `dictionary-en` 4.0.0,
  `dictionary-en-gb` 3.0.0, `dictionary-fr` 3.0.0, `dictionary-es` 4.0.0, `dictionary-pt` 4.0.0,
  `dictionary-pt-pt` 2.0.0, `dictionary-nl` 2.0.0 (the new `packages/spelling`, B5's, scaffolded on
  day 0 so the install attaches them), `fontkit` 2.0.4 (`packages/export`, B4's SVG outline mode)
  and `web-vitals` 6.2.2 (`apps/studio`, the integrator's field INP sample). SPEC-5 names no
  version for the dictionaries or `web-vitals`, so the newest release on the registry on
  2026-09-15 is pinned; pnpm appended `web-vitals@6.2.2` to `minimumReleaseAgeExclude`. `pnpm
install` ran once on day 0 and never in a builder's session; a builder names a package and its
  version in `docs/gslides-parity/build-5/<key>.md` and the integrator installs once.

## Ownership and git

- Builders own disjoint packages and create or edit only the paths their task assigns. The
  scaffold placeholders (`src/index.ts` in every package) are meant to be replaced by their owner.
- Never `git add -A`. Run git commands only when the task lists them. Commits in this repository
  are authored as Kevin <kk23907751@gmail.com> (the repo-local identity).
- Nothing is claimed done until the acceptance commands exit 0 and the report files named in the
  milestone plan exist. A claim about a deck names the revision.

- Round three: ownership is the "Owns" lists of `docs/gslides-parity/MILESTONES-3.md`; a change
  needed in another builder's file is a request in `docs/gslides-parity/build-3/<key>.md` and the
  integrator makes it or reassigns it. `pnpm generate:contracts` is run by B1 and the integrator
  only; `pnpm install`, `pnpm build` and `vite build` are the integrator's (the one exception is
  the B5 row under the dev server rules). Nothing is committed until the ship step.
- Round four: ownership is the "Owns" lists of `docs/gslides-parity/MILESTONES-4.md` with the day 0
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
- Round five: ownership is the "Owns" lists of `docs/gslides-parity/MILESTONES-5.md`, B7's row
  in `SPEC-5-amendments.md` A6, and the day 0 amendments of `docs/gslides-parity/build-5/integrator.md`
  section 3 (a file round four renamed, split or created is owned under the name round four gave
  it; a file round four did not land is reassigned there without changing which lane owns the
  behaviour). One shared checkout, no `gs5/integration` branch, no per builder commits: nobody but
  the ship step runs a git write command, and the ship step commits on `main` by an explicit path
  list. The shared files are the integrator's for the whole round (SPEC-5 0.53): the schema files
  of 1.2, `packages/schema/src/actions.ts`, `packages/export/src/scene/types.ts`,
  `packages/export/src/check.ts`, the dispatch tables (`apps/cli/src/store-actions.ts`'s
  `registerLaneActions` and `apps/studio/src/server/actions.ts`), `apps/studio/src/editor/controller.tsx`,
  `packages/chrome/src/menus/{model,strings,keys}.ts` and `packages/render/src/blocks/render-block.ts`'s
  switch; every row landed on day 0 and a later change is a request in `build-5/<key>.md` answered
  the same day. A lane's handlers live in its module under `apps/cli/src/actions/` (`motion`,
  `media`, `import`, `templates`, `page`, `print`, `prefs`, `spelling`, `equation`, `theme`, `chat`,
  `font`), which stays free of `node:` imports because the editor page imports that graph; the
  window transport rows land in the controller's `on(...)` table through a request naming the
  handler (`GS5_WINDOW_SLOTS` lists each lane's ids). Nothing this round changes
  `packages/chrome/src/tokens.css`, the Perfect export's bytes for the GT deck, or round four's
  budgets and identity; every builder re-baselines a number on the current tree before claiming a
  gain, against the verifier's day 0 baseline under `verification-5/`.

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

Round three's lines (`docs/gslides-parity/SPEC-3.md` 16.1; `docs/gslides-parity/BUILD-STATUS-3.md`):
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

Round four's lines (`docs/gslides-parity/SPEC-4.md` 6.1 and 0.46; `docs/gslides-parity/BUILD-STATUS-4.md`):
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

Round five's lines (`docs/gslides-parity/SPEC-5.md` 16.7 and 0.51; `SPEC-5-amendments.md` A7;
`docs/gslides-parity/BUILD-STATUS-5.md`): `pnpm check` is 37 steps. Steps 32 to 37 are the
round's, each the literal command of SPEC-5 16.7 (37 is A7's: `scripts/probes/sync-stress-probe.mjs`
on the node-server build and the fonts tests), gated on the files its lane lands: while a file is
missing the step prints one "not yet" line naming the files and the command and exits 0, never a
silent pass and never a failure on another lane's day (`--list` marks a pending step). 32 is the
page and the print layouts with `resize.spec.ts` beside `page-setup.spec.ts` (A4); 33 motion and
media; 34 import, templates and building blocks (the python oracle runs inside the vitest when
`.turboslide/venv` exists); 35 the text tools and chat with the two help routes answering 200; 36
the theme, the equation, ODP and SVG; 37 the sync engine and the fonts. Steps 3, 5, 6, 18, 20, 21,
22, 25, 26 and 27 grow as SPEC-5 16.7 names. Beyond `pnpm check`: the per builder acceptance
lines of MILESTONES-5 and A6, `node scripts/probes/new-write-probe.mjs --base http://localhost:4321`
against a dev server on the file store at every merge, `scripts/probes/editor-walk-probe.mjs`
against every preview and production, the verifier's VERIFICATION-5 rows and the hosted smoke
rows of SPEC-5 16.8. On the day 0 tree (2026-09-15, `BUILD-STATUS-5.md` "Day 0") steps 1, 2, 4, 5
and 6 passed, steps 32 to 37 answered their "not yet" lines, `tsc -b` was clean, and step 3 fails
as written on the uncommitted regenerated contracts until the ship step commits them; step 29's
`facts.json` was refreshed at merge 2 through `build-brand.ts --facts` (220 actions, 194 MCP tools,
201 HTTP paths, 37 check steps; no count is typed by hand). On the merge 2 tree (2026-09-15,
`BUILD-STATUS-5.md` "Merge 2") steps 32 and 36 still answer their "not yet" lines because B4's
`apps/studio/e2e/page-setup.spec.ts`, `packages/export/src/export-odp.ts` and
`packages/export/src/svg/write.ts` do not exist, and step 5 carries B4's in-progress failures
(`packages/schema/src/shapes.test.ts`, `shapes/geometry.test.ts`, `diagrams.test.ts`,
`packages/render/src/__tests__/canvas.test.ts`, the padded shape row of
`packages/export/src/gslides-fixture.test.ts`), each named with its owner in BUILD-STATUS-5.
Two rows joined the step 6 grep allowlists at merge 2 (`packages/render/src/blocks/equation.ts`
for Temml's MathML, `apps/studio/src/routes/api/vitals.ts` for the vitals mirror), and
`.prettierignore` covers the import's `*.expected/` documents, which `fixtures.test.ts` compares
byte for byte as `canonicalJson` output.

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

- The round five seams (gslides-parity SPEC-5 1.6, 12, 13; SPEC-5-amendments A3 to A6;
  MILESTONES-5 "The seams every builder types against"), as the integrator installed them on day 0
  (`docs/gslides-parity/build-5/integrator.md`):
  - The schema fields of SPEC-5 1.2, every one optional with the meaning of an absent field in its
    doc comment: `SlideBase.transition` and `.animations` (`@turboslide/schema/motion`: the eight
    transitions, the ten effects, the three triggers, `DURATION_MS`, `Animation`, `MOTION_LABELS`,
    `normalizeMotion`, the `MotionSchedule` type and schema), `Deck.page` (`@turboslide/schema/render`
    `deckPage`, `DEFAULT_PAGE`, `PAGE_PRESETS`, the 120 to 6720 px bounds), `Deck.language`
    (`DEFAULT_LANGUAGE` en-US), `Deck.themeEdits`, `Deck.importedThemes` (at most five) and
    `Deck.customLayouts` (`custom-<slug>` ids; `SlideBase.template` widens to them and `isLayoutId`
    guards every built in reader), `THEMES` with `ts-plate`, `BlockBase.placeholder` (not
    annotated: the theme mode offers it, never an ordinary block's inspector), `PlainBlock.start`,
    `.prefix`, `.suffix`, `Typography.firstLine`, `.hanging` and `.family` (`@turboslide/schema/fonts`
    `FONT_IDS`, the 26 ids of A5), `ShotAdjust.reflection` and `.recolor` (`RECOLOR_PRESETS`),
    `TableCell.border` per edge (`CellEdgeBorder`, `CELL_BORDER_EDGES`), `DeckGuides.colors` (keyed
    `x:800` or `y:450`), `Position.group` as a path (`groupPathSchema`, `groupSegments`,
    `outerGroup`), `DITHER_PATTERNS` with the four families and `angle` (the resolved record keeps
    `angle` optional so every existing variant key is unchanged), the three block types `media`,
    `spotlight` and `equation` (`@turboslide/schema/blocks/media`, `blocks/equation`; the catalog
    entries with `export: 'mixed'`; the renderer's switch draws each as a plain box with its
    description until B2's and B6's renderers land), `MediaAsset` (`@turboslide/schema/assets`)
    in its own map `Deck.media` (a recorded deviation from 0.16's union in `assets`, `build-5/integrator.md`
    section 7: 96 picture readers in 40 files; `asset.set` and `asset.remove` carry both records
    and the reducer routes by `kind`, so the operation stream sees one map), `Preferences`
    (`@turboslide/schema/preferences`, the defaults of 7.1 and the twelve substitutions) on
    `PrincipalRecord.preferences`, the `chat` entry kind with `chatMessageSchema` on the realtime
    protocol, the export options, report rows and check sections of `@turboslide/schema/export`
    (`EXPORT_FORMATS` with `odp`, `PRINT_LAYOUTS`, `PAPERS`, `MOTION_EXPORT_MODES`,
    `MEDIA_EXPORT_MODES`), `ImportReport` (`@turboslide/schema/import-report`) and the template
    and building block indexes (`@turboslide/schema/building-blocks`).
  - The validator families: `IssueCode` gains `motion`, `media`, `equation`, `equation/parse`,
    `page`, `theme` and `layout`, one module each under `packages/schema/src/validate/` aggregated
    by `validateDeck`; every module answers `[]` on day 0 except `validate/page.ts`, which bounds
    the guides by the deck's page because the zod maximum moved from the sheet to the page cap.
    The `text/spelling` lint rule is B5's with its fixture (the generator refuses a rule with
    neither a planted slide nor a test).
  - The action table: `Milestone` gains `GS5`, `ACTION_GROUPS` gains `motion`, `media`, `theme`
    and `import`, `ACTION_IDS` the 51 ids of SPEC-5 13 and A5 (`GS5_ACTION_IDS`, 220 in all), each
    with its full `ActionSpec` (input, output, CLI usage, MCP name, example) and no handler, so
    every transport answers `NotImplementedError` with `GS5` until its lane registers one
    (`packages/schema/src/actions-gs5.test.ts`, `packages/agent/src/__tests__/gs5-seam.test.ts`);
    the widened inputs of 13 on `export.run`, `build.run`, `render.slide`, `view.present`,
    `view.goto`, `slide.import`, `deck.create`, `deck.set` (`/language`), `deck.info`, `deck.guides`,
    `text.indent`, `text.list`, `table.cellStyle`, `block.adjust` and `export.check`; the
    reducer's `DECK_SET_ROOTS` admits `language`, `page`, `themeEdits`, `importedThemes` and
    `customLayouts` for the actions that write them while the `deck.set` action's regex stays
    closed to the four records. `NO_REVISION_WRITES` carries the record, room and log writes.
  - The dispatchers: `registerLaneActions(dispatcher, deps)` in `apps/cli/src/store-actions.ts`
    spreads the twelve lane modules of `apps/cli/src/actions/` (`LaneDeps` in `deps.ts`), for the
    CLI, the MCP server and the window transport, and the hosted `deckDispatcher` spreads them
    again with `deps.hosted` (the deck id, the request, the origin) so a hosted form can win.
  - The scene (`packages/export/src/scene/types.ts`): `page`, `language`, `transition`, `schedule`,
    `media` (`SceneMedia`), `equations` (`SceneEquation`) and `themeCss`, all optional, plus
    `SceneLine.baseline`; `extractScenes` sets them from `deckPage`, `compileMotion`
    (`@turboslide/render/motion`, the empty schedule until B1's merge 1; `paragraphCountOf` counts
    the distinct `SceneLine.paragraph` values per block), `sceneMedia` (`scene/media.ts`, B2),
    `sceneEquations` (`scene/equations.ts`, B6) and `themeCss` (`@turboslide/render/theme-css`,
    B6), each an identity on day 0. `pptx/build.ts` calls `rewriteMedia` (`ooxml/media.ts`, B2)
    and `rewriteEquations` (`ooxml/math.ts`, B6) after the alt text and before the grouping in
    Editable text mode, both identities on day 0; B1 adds the renumber, the transition and the
    timing after the hidden title. `check.ts` calls `checkMotion`, `checkMedia` and
    `checkEquations` (`packages/export/src/check/`) on every PPTX and carries their sections;
    `checkOdf`, `checkOdfContainer` and `checkSvg` wait for B4's writers.
  - The menu model: `MenuSetting` gains `screenReader`, `braille`, `speakAloud`, `equationToolbar`
    and `starred`, `MenuClientHandler` gains `themeMode`, `dictate` and `fontPicker`, `Menu` gains
    `setting?` (the Accessibility menu draws under `screenReader`), and `GS5_PLANNED_EFFECTS`,
    `GS5_DIALOG_TITLES` and `GS5_PANEL_TITLES` record the effect and title every row of 14.1 takes
    while the rows stand as they did (a Later row carries no effect, `menu-model.test.ts`); the
    flip is one edit per row by its lane, with the clause of 14.2 retiring and the count tables
    moving. `keys.ts` `GS5_KEY_ROWS` records the key rows of 15 the same way (the Google rows stay
    in `OMITTED_SHORTCUTS` until their lane moves them). `strings.ts` `ROUND_FIVE` holds the
    sentences of 15. The toolbar's Font row exists as `toolbar.font` (disabled with its sentence);
    B7 flips `enabled` and wires the picker.
  - The controller: `EditorSnapshot.editorMode` (`edit` or `theme`) with `setEditorMode`, and
    `GS5_WINDOW_SLOTS`, the window transport ids each lane wires into `on(...)` by request.
  - `menu-model.test.ts` counts the `file.email` container: `allItems()` walks containers, so the
    Later count reads 22 at `BASE` (21 leaf rows plus the container) and 3 at the end of the round
    over `allItems()` (`file.email`, `file.email.collaborators`, `tools.activityDashboard.viewers`),
    2 over leaf rows; SPEC-5 14.2's "Later count at 2" is the leaf count and the round's assertion
    names both numbers. At merge 2 the assertion reads 5 leaf rows and 6 over `allItems()`: the
    two of 14.2 plus `file.download.odp`, `file.download.svg` and `file.pageSetup`, whose surfaces
    (B4's ODP and SVG writers and the Page setup dialog) had not landed, so `DOWNLOAD_FORMATS`
    keeps its clause and the three rows flip with their files (`menu-model.test.ts`
    `RETIRED_ROUND_FIVE_CLAUSES` lists the clauses that did retire).

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
    (`replacementSlide`, in `apps/studio/src/editor/controller.tsx` since round four's split). The
    research (R02, R07)
    records that Google deletes without confirmation and does not record which slide it selects
    next; the rule follows Google's observed behaviour (the next slide, the previous one at the
    end) and is recorded here as an assumption until the audit checks it against Google. In the
    same round the editor's write queue treats a lease refusal (SPEC 6.7: an agent's write to a
    slide another author holds answers 409 with the holder) as a conflict card with the holder
    and Force, never as a revision conflict to rebase on: the server changed nothing, so a rebase
    re-sent the same write to the same refusal in a loop (measured at one write every 2 ms). A
    lease still outlives the tab that took it, ten minutes at most.

- Round three, merge 1 (`docs/gslides-parity/build-3/integrator.md`): `image-size` is removed from
  pptxgenjs's dependency graph through a pnpm override instead of bumped, because no fixed release
  exists (SPEC-3 8.10 reads "overridden past 2.0.2"); `@simplewebauthn/server` is pinned at 14.0.1,
  not 14.0.2, which was published on the day of the install; `@sparticuz/chromium` and
  `playwright-core` are not bumped although 153.0.0 and 1.63.0 exist (SPEC-3 8.10 "bumped together
  when a newer stable exists"): no advisory names them and a Chromium change moves the pixel
  gates, so the bump is a fixer round decision taken with the verifier's compare-to-shoot run;
  `apps/studio` joins the vitest project list with its own config although SPEC-3 16.1 named no
  config change for step 5.

- Round three, merge 2 (`docs/gslides-parity/build-3/integrator.md` section 8,
  `BUILD-STATUS-3.md`): the account boundary held, so the preview runs on the blob channel,
  anonymous identity and captured mail with the deployment's own environment passed per
  deployment (`vercel deploy -e`), and no Marketplace product, private Blob store or WAF rule
  was created or applied; the storage migration ran on the fake only (SPEC-3 11.4, 11.5 R7 wait
  on Kevin). The fixture deck's two dither slides carry their materialized variants in the
  committed deck (`turboslide picture materialize` at merge 2, revision 2) because the export
  path writes them under the deck on the first export, which left untracked files in the fixture
  after every run; B5's two dither tests strip the variants from their scratch copies. The
  materials package's `picture.materialize` answers `missing` as what is still missing after the
  write (the rows it rendered leave the list), and its `slide.toCanvas` call names `slideIds`
  (the action's input), both found by the CLI's real dispatcher. SPEC-3 12 spells the comments
  filter `--author <who>`; the CLI uses `--author-id <who>` because `--author` is the principal
  flag since round one (B1). The localhost token (`TURBOSLIDE_LOCAL_TOKEN=require`) stays opt in
  this round: flipping the default at merge 2 (b3.md R12) would have changed every builder's dev
  server rule under the verifier's feet, so the flip is a fixer round decision. Cookieless
  localhost agent calls are the checkout holder on both identity paths (a design decision above,
  not in SPEC-3's text). `share.emailCollaborators` answers 501 by design (round four).
  `presence.list` and `sync.status` over HTTP and MCP read the CLI's file records, not the room's
  roster (the window transport reads the room); the digest queue and the one click unsubscribe
  (`/api/notify/unsubscribe`, 501) are not wired (b2.md R14d, R17); `account me --avatar-png`
  is not wired on the CLI (b3.md R15c); `closeAgentSessions` is not bound (b3.md R15b). A
  fixed tamper in `tokens.test.ts` matched the original token one run in sixteen and now flips
  the digit. The realtime spec's frozen `describe()` revision and the coalesced writes after a
  resync (b2.md, two defects), the intermittent `no thread` 404 on a reopen right after a
  resolve (one of six sequences on the merge 2 walk), and finding 28 stay for the fixer round.

- Round four, merge 1 (`docs/gslides-parity/build-4/integrator.md`, `b1.md`, `b3.md`;
  `BUILD-STATUS-4.md` "Merge 1"): `@vercel/functions` is pinned at 3.9.7 because SPEC-4 0.31 names
  no version. The whole `packages/native/wasm/` folder is tracked (0.38 names the glue, the
  `.wasm` and "the `.d.ts`", and there are two `.d.ts` files); the four files of an earlier local
  build stay untracked until B4 commits CI's outputs with `BUILD-RECORD.json`. SPEC-4 6.4's "208
  ink cells" is the area of the 16 unit path (`markBits(8)` lights 52 of 64 cells) and
  `brand.test.ts` pins both readings. The 16 px tile carries a hinted 12 px mark (rails of 2 px, a
  6 by 4 window) so the three ICO entries decode to three colours each with no anti aliased pixel;
  `icon-dark-*.png` are the paper plate with the ink mark (SPEC-4 1.5 step 2; P2 named them the
  other way); the progress track keeps the port's 2 px where 1.9 says 1 px. `SITE.origin()` in the
  root `head()` has no request, so a preview without `TURBOSLIDE_PUBLIC_ORIGIN` carries
  production's card address. The Not found page's About Turboslide button is a plain anchor until
  B2's `home.tsx` exists. The two `recordDeckOpened` call sites moved with `EditorRoot` (B3's
  file), so the day 0 amendment's "B4 passes the new arguments from `controller.tsx`" is void and
  the day 3 change stays inside B3's files. `import './edit.$deckId.css'` stays in the route file
  until B3's day 2 decides when the editor's CSS arrives. `landing.spec.ts` tests 3 and 4,
  `editor.spec.ts` and `undo.spec.ts` read or seed the checkout's `decks/` on disk and cannot pass
  against a tmp store server (b3.md finding 1); step 21 runs them on the runner's file store.
  `realtime.spec.ts` test 4 is intermittent on this machine before and after the split (the frozen
  `describe()` revision above). A direct `eslint` over the six split files reports four type aware
  errors and four `no-shadow` warnings in code byte identical to `BASE`, while
  `scripts/lint-packages.mjs --only studio` reports none of the errors there and 91 in
  `apps/studio/e2e/*.spec.ts` above the baseline of 8; the file owners decide on day 2. The tmp
  store dev server and the node-server build refuse every request without
  `TURBOSLIDE_SESSION_SECRET`, so the round four server command above and check step 31's runner
  set it. The verifier's day 0 requests on `scripts/perf-budget.mjs` (the local commit stamp of
  4.6 row 1, the hosting banner over `toolbar.layout` on the tmp tier, the memory channel's two
  second checkpoint cadence against 4.6's local ceilings, the twins row counting a 304, the idle
  window missing a stream opened before it) are open for merge 2 (`build-4/verifier.md`).

- Round four, merge 2 (`docs/gslides-parity/build-4/integrator.md` sections 15 to 20;
  `BUILD-STATUS-4.md` "Merge 2"; the builders' `b1.md` to `b5.md`), 2026-09-14: the requests that
  fell in nobody's file were applied by the integrator as the smallest edit with a note in the
  file: `packages/headless/src/shell.ts` accepts a 404 whose document carries the Not found root
  and its default `readySelector` names `.ts-product` and `.ts-notfound` (b1.md R8, b2.md R1);
  `packages/lint/src/chrome.ts` roots gain the two classes; `packages/store/src/blob-vercel.ts`
  passes `cacheControlMaxAge` to the SDK (b4.md R1); `packages/store/src/tmp-store.ts` takes
  `HostedOptions.fetchAsset` and fetches the twins the seed does not carry after the overlay's
  copy (b4.md R2), so `DROP_SEED_TWINS` ships as `true` in `vite.deploy.config.ts` with the
  `blob` tier's fetch (B4) and the `tmp` tier's fetch (this) both in place; `apps/studio/src/routes/api/agent.ts`
  answers an `instance` block (`effectsBackend`, `glibcVersionRuntime`, `node`, `platform`) for
  the hosted smoke's backend row (b4.md R11); `packages/schema/src/shapes/build-definitions.mjs`
  was removed for `packages/schema/scripts/build-definitions.mjs` and `THIRD_PARTY_NOTICES.md`
  names the new path (b4.md R3); `packages/chrome/PORTED_FROM.json` gained rows for
  `Filmstrip.tsx`, `Filmstrip.css` and `lib/lazyDialog.ts` (b4.md R12); `packages/chrome/package.json`
  exports `./YouNeedAccess` and `./Filmstrip` (b3.md R6). Not applied and recorded: the Linux x64
  glibc addon of SPEC-4 0.38 is not built (no `cargo-zigbuild` and no `zig` on this machine;
  b4.md R7 has the commands and `packages/native/ci/native.yml` is the workflow), so the function
  runs the TypeScript stages, `apps/studio/package.json` gains no `@turboslide/native-linux-x64-gnu`
  (b3.md R13, b4.md R10) and `TURBOSLIDE_NATIVE_REQUIRED=1` is not set on step 5; the
  `.github/` folder is untracked and outside the round's files, so `native.yml` stays under
  `packages/native/ci/` until the ship step places it; the optional b4.md R4 (the validators
  importing `ids.ts`), R5 (a `ViewerShell` render prop to keep `Filmstrip.tsx` out of the viewer
  route) and R8 (`@turboslide/native` as a studio dependency) were not taken. The perf check's
  metric changes (B4's R14 and the verifier's requests 1, 3 and 4) are recorded in
  `scripts/perf-budget.mjs`'s header: DOM nodes after a garbage collection with the live element
  count beside them, the local commit stamp from `pending` rising, "saved" as the acknowledgement
  on the `local` profile because the memory channel checkpoints on a two second cadence (the
  checkpoint recorded beside it; the `deployment` profile keeps the checkpoint), and a 304
  revalidation not counted as a twin re-fetch. From B5 (b5.md R5): the README's images are `<img>`
  tags because the B5 acceptance grep counts a markdown image's `!`, so a future README edit adds
  an image as a tag too; `docs/freeform.md` line 130 was edited by B5 on the integrator's
  forwarding of b3.md R5. MILESTONES-4 B2's acceptance line `tooltip-audit.mjs --only /home` reads
  `--url <origin>/home` (the script has no `--only`). The task's numbering of the round's steps
  (the perf budget as 29, the Vercel output as 30, the brand test as 31) differs from SPEC-4 6.1;
  the check keeps SPEC-4's order (29 the generated files, 30 the Vercel output, 31 the perf budget).
  Two repository files outside every builder's row changed with a note (`integrator.md` section
  16): `.vercelignore` no longer drops `packages/native/wasm/` from a CLI preview's upload (the
  first preview build of merge 2 failed on the dither worker's glue import; the module is a
  committed build product since SPEC-4 0.38) and `.prettierignore` covers that folder (the
  formatter had reflowed the wasm-bindgen glue, which `BUILD-RECORD.json` pins by sha256). The
  vendor chunk group of SPEC-4 3.12 does not take effect inside the studio's Vite 8.2.2 build
  (Rolldown 1.2.8 splits the same entry alone; in the Vite build a function `test`, `name` or
  `manualChunks` is called zero times and the output is byte identical), so
  `scripts/check-client-bundle.mjs` reports the largest chunk ceiling until a `vendor-*.js` chunk
  exists (SPEC-4 0.27's gating rule) and the entry chunk stays at 914,233 bytes with the
  attribution in `integrator.md` section 17 (React DOM, the schema package with its 281 KB shape
  table reached through `render/dither-key.ts`, zod, the router); the `/home` and `/decks` js
  decoded rows of 4.1 miss by construction until the fixer round. Step 19 was met by `prettier
--write` over this round's committed research and design records and the round three
  verification records (the round three precedent; whitespace and table alignment only), never
  over the other workflow's `research-5/`, `design-5/` and `SPEC-5.md`, which were restored from
  `HEAD` after the pass had touched them (the other workflow then committed them formatted as
  `e2904d5`, and step 19 is green on the whole tree since); the verifier's untracked
  `verification-4/` files were reformatted by the same pass and could not be restored (whitespace
  only; recorded for the verifier). Step 27's audit writes `verification-3/layout-shift.json` and
  `layout-shift.md` unformatted, so a chain that runs step 27 needs `prettier --write` on those
  two before step 19 is run again (the committed copies are formatted). A Vercel preview stamps `x-robots-tag:
noindex` on every answer, static and function alike, while production carries it on `/` alone,
  so `hosted-smoke.mjs`'s `/home` row asserts the meta always and the header outside a preview.
  The render route's answers carry the anonymous principal cookie (`set-cookie: __Host-ts_id`),
  which keeps the CDN from caching thumbnails (`x-vercel-cache: MISS` on the second stamped
  request); a finding for B4 and the verifier, not a merge edit.

- Round five, merge 2 (gslides-parity SPEC-5; `docs/gslides-parity/BUILD-STATUS-5.md` "Merge 2",
  `build-5/integrator.md` section 10). B4's days 3 to 7 (Page setup and the print layouts' dialog,
  the ODP and SVG writers, the card render path, the `og:image` line) were not delivered to the
  merge, so the three menu rows that need them stay Later and check steps 32 and 36 stay gated;
  the shape interpreter B4 did land changes the text rectangle of the roundRect preset, which the
  fixture export's padded shape row and the render snapshots still pin at the day one seam (B4's to
  update, named in the status file). The Nitro upgrade route `api/decks.$deckId.ws.ts` is not
  written: the flag, the client transport with its SSE fallback and the dev sidecar on 4322 are,
  so a checkout runs the socket path end to end and a node-server deployment falls back to SSE.
  The hero gate is in place with `HERO_LIVE` false until the second `perf-budget.mjs` measurement
  against the preview is read, and the two-tone screen pass is not applied to the live frame. The
  hosted `version.delete` refuses (no store level version removal exists; the checkout removes the
  file); the chat port is composed in the hosted dispatcher over the room channel because B7's
  `admitChat` never landed. Two merge fixes sit in other lanes' areas with a note in the file:
  `packages/schema/src/assets.ts` (the duplicate `camera` discriminator of `MediaAssetSource`,
  which broke every zod parse of a deck with media) and `packages/export/src/pptx/text.ts`
  (`catalogFace` skips the export set's own instances; `registerBoxLink` gives a block link on a
  text box its relationship, a `BASE` defect SPEC-5 8.3's validator exposed). Step 19 was met by
  `prettier --write` over 84 unformatted files of the lanes (formatting only; the import's expected
  documents were then restored to `canonicalJson` bytes and ignored by the formatter) and over three
  committed round four records (`build-4/hotfix-4/walk-preview.json`, `walk-production.json`,
  `verification-4/production-ship/production-selection-record.json`), which had been committed
  unformatted. `packages/agent/src/__tests__/fixtures.test.ts` waives the planted slide requirement
  for `text/spelling`, a static rule that runs over an injected checker and so has its test as its
  fixture. The preview of merge 2 runs behind Vercel Authentication; every probe carries
  `VERCEL_OIDC_TOKEN` from `vercel env pull` as the trusted sources header, and the bearer rows of
  the smoke are skipped because the pulled development environment holds no `TURBOSLIDE_TOKEN`.

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
