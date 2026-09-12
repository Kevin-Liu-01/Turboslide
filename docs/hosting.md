# Hosting the studio

How a deployed studio finds its decks, keeps edits and serves the asset twins, written for the
hosting round of 2026-09-11 (`docs/hosting-diagnosis.md` is the measured cause: the Vercel function
has no checkout above it, no `decks/` folder and a read-only filesystem apart from `/tmp`, so
`repoRoot()` fell back to the working directory and the root route's create-from-template threw).
Kevin's directive, verbatim: "https://studio-delta-six-40.vercel.app/ shows something went wrong".
The renders and exports inside the function are `docs/hosting-chromium.md`.

## 1. One selection, three backends

`@turboslide/store/select` `selectStore(env)` picks the backend once per process and every path
helper of the studio answers from that choice (`apps/studio/src/server/root.ts`):

| Environment                               | Kind   | Decks folder                      | Edits persist | Notice in the editor |
| ----------------------------------------- | ------ | --------------------------------- | ------------- | -------------------- |
| a checkout (`pnpm-workspace.yaml` above)  | `file` | `<repo>/decks`                    | yes, in git   | none                 |
| `VERCEL` set, no `BLOB_READ_WRITE_TOKEN`  | `tmp`  | `/tmp/turboslide/decks` (overlay) | no            | yes                  |
| `VERCEL` set, `BLOB_READ_WRITE_TOKEN` set | `blob` | the overlay as a mirror of Blob   | yes, in Blob  | none                 |
| `TURBOSLIDE_STORE=file\|tmp\|blob`        | forced | as above                          | as above      | as above             |

`TURBOSLIDE_STORE=blob` without a token is a TypeError at the first request that names the
variable; an unknown word is a TypeError that lists the three kinds. `TURBOSLIDE_OVERLAY_DIR` moves
the overlay away from `<tmpdir>/turboslide`. The deck list at `/decks` names the store and its
reason in the footer; the editor's `readEditorDeck` carries the same facts (`EditorDeck.hosting`).

Every backend hands out `DeckStore` instances, so every write still goes through `applyWrite`
(SPEC 7.1), leases (SPEC 6.7) and the version log; the collection behind them
(`@turboslide/store/hosted` `HostedDecks`) serves the deck list, `deck.create`, the store of a deck
and the asset twins through the same six calls whatever the kind.

## 2. The seed inside the function

The function carries the decks a hosted studio starts from. `apps/studio/vite.deploy.config.ts`
lists `decks/templates` and `decks/gt-brand` (the documents and the 30 MB of twins) as the `decks`
server asset group of Nitro (`serverAssets`, pattern `{templates,gt-brand}/**/*`, the state folders
ignored), which the build turns into lazy chunks of the server bundle and exposes at runtime through
`useStorage('assets:decks')`. The Nitro plugin `apps/studio/src/server/hosting-plugin.ts` runs once
at startup and registers that storage as the seed (`keyValueSeed`) plus, when the token is set, a
factory for the `@vercel/blob` client, on `globalThis` (`registerHostingProviders`). `root.ts`
reads the registration; without one (the dev server, the tests) it seeds from the checkout's
`decks/` folder, which is how `TURBOSLIDE_STORE=tmp pnpm dev` exercises the hosted path locally.

Materialization is lazy and idempotent (`@turboslide/store/seed` `materializeSeed`): the first
request writes the documents into the overlay (deck.json, slides, versions, the sidecars, the
templates: 183 files, measured 733 ms in the built function on this machine) and leaves files that
exist; a deck's twins are written on the first request that needs them (the assets route,
`deck.create` from the template, an export: 202 files, 30.6 MB, 1.4 s). Writes go through a
sibling name and a rename so a reader never sees a half-written slide.

The GT deck's twins are also static files of the deployment (`publicAssets` at
`/decks/gt-brand/assets`, one hour cache, fallthrough on), so Vercel's CDN answers them before the
function runs; a twin added later reaches the function's assets route.

A second group, `packages`, carries the runtime files the renderer and the exporter read from the
workspace and a function does not have: `packages/theme/src/gt-ink-paper/{sheet,stage}.css`,
`theme/assets/sprite.svg`, `fonts/src/inter.css`, `fonts/assets/InterVariable.woff2`, the export
faces under `fonts/export/` and `export/src/calibration/calibration.json` (24 files, 6,250,989
bytes). `root.ts` `ensureDecks()` writes them under `<overlay>/packages` on the first request
(measured 306 to 315 ms in the preview functions) and sets `TURBOSLIDE_PACKAGES_DIR`, which
`@turboslide/render/theme-node`, `@turboslide/fonts/export`, `@turboslide/export/pptx/fonts-map` and
`@turboslide/export/calibration/locate` read ahead of their `import.meta.resolve` and
`import.meta.url` paths (measured without it: the bundle has no `@turboslide/theme` to resolve and
`new URL('../calibration/calibration.json', import.meta.url)` names a file that is not there).
`ensureDeckAssets(deckId)` (`HostedDecks.ensureAssets`) puts a deck's twins on disk before any
render or export job reads the deck: on the first preview a render hung on the missing images to
the job's 300 s timeout.

## 3. The tmp backend

The overlay alone: `FileStore` over `/tmp/turboslide/decks/<id>`, `.turboslide/` beside it for the
thumbnails, the worker's jobs and the HTTP scratch files (`root.ts` `stateDir()`; the worker's
`TURBOSLIDE_DECKS_DIR` and `TURBOSLIDE_WORKER_DIR` are pointed at the overlay when unset). A new
instance starts from the seed again, so the editor shows the banner "Edits are kept on this server
instance only and do not persist until a Blob store is connected" (`.ts-banner[data-state="hosting"]`,
`@turboslide/store/select` `NOT_PERSISTENT_NOTICE`) and the deck list repeats it. This is the mode
the production URL runs in until a store is connected.

## 4. The Blob backend

### Layout

One Vercel Blob store, public access, holds each deck under `decks/<id>/` in the layout of SPEC
4.1: `deck.json`, `slides/<slideId>.json`, `versions/<n>.json`, `leases.json`, the sidecars
(`import-ids.json`, `import-report.json`, `known-findings.json`) and `assets/<file>`, the twins,
whose public URLs the browser can read directly. Templates are not uploaded; they ship in the
bundle.

### Reads

`BlobStore` (`@turboslide/store/blob-store`) is a `FileStore` over the overlay's copy of one deck
with a sync step around every call. A sync is one `head` of `decks/<id>/deck.json`; when its etag
differs from the mirror's record (`<deck>/.turboslide/blob.json`), the store lists the prefix and
pulls the files whose etag changed through `get(..., { useCache: false })`, which the SDK serves
from origin storage rather than the CDN cache (an overwritten blob is otherwise served stale for up
to its cache max-age, one minute at least), then removes the local documents the store no longer
has. Syncs closer than 750 ms apart share one result. Measured against the in-memory fake: an
unchanged deck costs one `head` per read and no download.

### Writes

A write pulls first, then applies through `FileStore.write` on the mirror (the same `applyWrite`,
lease check and version record as on disk), then pushes in this order:

1. `deck.json` with `ifMatch` set to the etag this instance synced. This is the commit point. A
   precondition failure means another instance committed first: the mirror is re-pulled and the
   outcome is `conflict` with the current document attached, the same shape as a stale
   `baseRevision`.
2. The slides the write changed (`put`, overwrite) and the slides it removed (`del`).
3. `versions/<n>.json`.

A named version (`saveVersion`) uploads its record with overwrite refused; a collision with another
instance's record of the same number is a `ConflictError`. Leases are pulled fresh before every
write, lease and release, and pushed after; the file is small and last writer wins. The watch
channel (`watch`) is a revision poll every 3 s, so an external revision reaches an open editor
within that plus the editor's own poll.

If a push fails between steps (the network, the store), the mirror's record is dropped so the next
sync pulls the store's truth; the caller sees the error and retries from the current revision.
Between step 1 and step 2 a reader on another instance can see the new manifest with the old slide
bytes for a moment; its next sync corrects that.

### The seed, once

`ready()` on the first instance that finds no `decks/gt-brand/deck.json` in the store uploads the
seed deck (documents and twins, `deck.json` last, overwrite refused so two cold instances cannot
both win) and records the mirror's etags. `deck.create` writes the new deck into the overlay, then
uploads it the same way; the collection lists decks from the store's folders (`list(prefix,
mode: 'folded')`), so a deck made on one instance appears on the next.

### Twins

`/decks/<id>/assets/<file>` streams the twin from the overlay when this instance has it (the seed
deck, a deck it created) and otherwise answers a 302 to the twin's Blob URL (one `head`, cached per
process). `BlobStore.pullAssets()` downloads a deck's twins into the overlay for code that reads
them from disk (an export).

### Costs

Vercel Blob prices (read on 2026-09-11, `docs/hosting-diagnosis.md` section 7): `head` and a URL
read on a cache miss are simple operations, `put`, `list` and `copy` are advanced. A page view of
the editor is a handful of `head` calls; a write is one `list` (only when the manifest moved), one
`put` per changed slide, one for the version record and one for the manifest; a deck created from
the GT template is about 290 `put` calls (85 slides, the manifest and 202 twins, eight at a time,
measured a few seconds against the fake with no network). The seed upload happens once per store.

## 5. Connect a Blob store

One store, connected to the `turboslide` project (the Vercel project Kevin imported; its
`rootDirectory` is `apps/studio`), and the platform sets `BLOB_READ_WRITE_TOKEN` on every
deployment; the next deployment (or a redeploy) then runs the blob backend. Either way:

- Dashboard: the project, Storage, Create Database, Blob, a name such as `turboslide`, region
  `iad1` (the function's region), Public access, Connect. The environments production, preview and
  development are checked by default.
- CLI (58.4.4, logged in, from the repository root after `vercel link --project turboslide`):
  `vercel blob create-store turboslide-decks --access public --region iad1 --yes`; the store is
  connected to the linked project for production, preview and development, and `vercel env pull`
  writes `.env.local` (which Vite loads into the dev server, so `TURBOSLIDE_STORE=blob pnpm dev`
  then talks to the real store; remove the file after, and remove the `.env*` line the CLI appends
  to `.gitignore`).

The store must be public for the twins' URLs to serve to browsers; a private store needs
`TURBOSLIDE_BLOB_ACCESS=private` and the assets route falls back to streaming through the function
(not measured). The integrator ran that command on 2026-09-11: the store `turboslide-decks`
(`store_GGmYcVj7j6224Ay5`, iad1, public) is connected to `turboslide`, `BLOB_READ_WRITE_TOKEN` is
set for the three environments, and the first request of the next preview uploaded the seed
(`decks/gt-brand/`, 183 documents and 202 twins) in 6.8 s. The production deploy from `main` picks
the token up on its own.

Two facts of the live service that the in-memory fake did not have (`@turboslide/store/blob-vercel`):
the SDK's error classes are anonymous, so `error.name` is never `BlobNotFoundError` and the client
checks the class (`instanceof`) with the message as the fallback; and `get({ useCache: false })`
answers a weak validator (`W/"fc8e..."`) where `head`, `list` and `put` answer the strong etag
(`"fc8e..."`) that `ifMatch` requires, so the client strips the `W/` prefix (`strongEtag`).
Measured before the fix: every page 500 on "The requested blob does not exist" (a missing blob's
`head` was not recognized), then every editor commit answered "changed in the Blob store since it
was read" and the deck stayed at revision 24.

Environment variables the hosted studio reads:

| Variable                                        | Set by         | Effect                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL`                                        | the platform   | selects `tmp` or `blob` (with the token)                                                                                                                                                                                                                  |
| `BLOB_READ_WRITE_TOKEN`                         | the Blob store | the `blob` backend; `@vercel/blob` reads it                                                                                                                                                                                                               |
| `TURBOSLIDE_STORE`                              | you            | forces `file`, `tmp` or `blob`                                                                                                                                                                                                                            |
| `TURBOSLIDE_OVERLAY_DIR`                        | you            | moves the overlay (default `<tmpdir>/turboslide`)                                                                                                                                                                                                         |
| `TURBOSLIDE_BLOB_ACCESS`                        | you            | `public` (default) or `private`                                                                                                                                                                                                                           |
| `TURBOSLIDE_TOKEN`                              | you            | the bearer token of `/api/actions`, `/api/agent`, `/mcp` off localhost (SPEC 11), and of `/api/export`, `/api/render` (the thumbnail variant `?w=` stays open) and the bundle routes once set; set on production and preview since 2026-09-11 (section 6) |
| `TURBOSLIDE_DOWNLOAD_SECRET`                    | you            | the signing secret of the export download URLs; random per instance when unset                                                                                                                                                                            |
| `TURBOSLIDE_DECKS_DIR`, `TURBOSLIDE_WORKER_DIR` | root.ts        | pointed at the overlay for the render worker's local mode when hosted                                                                                                                                                                                     |
| `TURBOSLIDE_PACKAGES_DIR`                       | root.ts        | the materialized `packages` group the renderer and exporter read from (section 2); unset in a checkout                                                                                                                                                    |
| `TURBOSLIDE_LAUNCH_LOG`                         | you            | prints the browser launch steps on stderr (always on inside a function; docs/hosting-chromium.md)                                                                                                                                                         |

## 6. The deploy configuration

`apps/studio/vercel.json` is unchanged: framework off, `NITRO_PRESET=vercel pnpm run build:deploy`,
`pnpm install --frozen-lockfile`. `vite.deploy.config.ts` carries the Nitro options:

- `serverAssets` (the seed, section 2) and `publicAssets` (the GT twins on the CDN).
- `plugins`: the hosting plugin.
- `vercel.functions.maxDuration: 300` on the catch-all function, and `functionRules` for
  `/api/export/**`, `/api/render/**` and `/_serverFn/**` (TanStack Start posts server functions
  there) at `maxDuration: 800`, `memory: 3009` (`HEAVY` in the config: 800 s is the Pro maximum and
  what the synchronous export's 780 s budget assumes, 3009 MB the Pro memory cap; the integrator
  reconciled the two builders' numbers there). Nitro writes each rule as its own function
  directory, a copy of the server: with the Chromium package traced each is about 150 MB
  uncompressed (four functions, under the 250 MB per-function cap); the Vercel build accepted the
  `.vc-config.json` values without a warning.
- `SERVER_ONLY` carries `@sparticuz/chromium` in both Vite configs, `traceDeps:
['@sparticuz/chromium*']` copies the package with its `bin/` folder, and `apps/studio/package.json`
  declares the package as an optional dependency so Nitro's tracer can resolve it
  (`docs/hosting-chromium.md` section 6 has the measurement).
- `serverAssets` has the second group, `packages` (section 2).
- Deploying a preview from the CLI: the project's root directory is `apps/studio`, so `vercel
deploy --yes --archive=tgz` runs from the repository root (linked with `vercel link --project
turboslide`; from `apps/studio` the CLI looks for `apps/studio/apps/studio` and stops), and the
  root `.vercelignore` mirrors `.gitignore` because the CLI otherwise uploads the working tree
  (measured: 4.6 GB with `.turboslide/`; 24.9 MB with the file). The CLI also writes `.env.local`
  and appends `.env*` to `.gitignore` on `link` and `env pull`; both are removed after. Production
  deploys come from the push to `main` and need none of this.

Measured build (scratch copy of the tree, `NITRO_PRESET=vercel vite build -c vite.deploy.config.ts`,
2026-09-11): `.vercel/output/functions/__server.func` 72 MB (the seed's 30 MB of twins as base64
chunks under `_virtual/`, `@vercel/blob` inlined at 1.1 MB), `static/` 36 MB with the 202 twins
under `decks/gt-brand/assets`, `config.json` routes for the three rules before the catch-all.

### The bearer token on the production URL, decided

Measured on 2026-09-11 before this round: `vercel env ls` on the `turboslide` project listed
`BLOB_READ_WRITE_TOKEN` alone, so `TURBOSLIDE_TOKEN` was unset on every environment. `/api/actions`,
`/api/agent` and `/mcp` answered 401 off localhost by the rule of `@turboslide/agent/http/auth`, and
`/api/export` and `/api/render`, which check the token only when it is set, were open on the
production URL (an anonymous caller could start a Chromium export of up to 800 s). SPEC 11 asks for
a bearer token per deployment.

The tree allowed three ways out: leave the routes open with the open editor (what ran), set the
token and move the editor's export to a server function, or put the deployment behind Vercel
Deployment Protection. The deck transfer round of 2026-09-11 implemented the second (option 2):

- `TURBOSLIDE_TOKEN` is set on the production and preview environments of the `turboslide` project
  (`openssl rand -hex 32`, then `vercel env add TURBOSLIDE_TOKEN production` and `preview` from the
  linked repository root with the value on stdin; `vercel env ls` shows both as Encrypted). The same
  value is in Kevin's `~/.config/turboslide/hosts.json` under `https://turboslide.vercel.app`, mode
  0600, where `turboslide deck push` and `deck pull` read it (docs/deck-transfer.md); it was never
  printed and is nowhere in the tree. The next production deploy (the push to `main`) picks it up;
  until then the production URL still runs open.
- With the token set, `/api/actions`, `/api/agent` and `/mcp` open to callers that send it,
  `/api/export`, the full-size and JSON variants of `/api/render` and the two bundle routes require
  it, and the `?w=` thumbnail variant stays open (an `<img>` carries no header; the result is cached
  per revision and the work is bounded to the deck's slides at three widths and two themes).
- The editor keeps its export because `edit.$deckId.tsx` `runSyncExport` calls the `syncExport`
  server function of `apps/studio/src/server/download.ts` (the same `runSyncExport` and the same
  JSON answer as the route's `?sync=1&format=json`, reached same origin under the CSRF middleware),
  and its full-size renders go through the `renderSlideImages` server function; the page holds no
  token. The /decks page and the Export menu download and upload bundles through short-lived
  tickets minted by server functions (`apps/studio/src/server/bundle.ts`), which the bundle routes
  accept in place of the bearer.
- A server function answers any client that sends the CSRF headers, so the token gates the agent
  surface and the raw routes, not the export's compute; Deployment Protection (option 3) remains
  available as a project setting on vercel.com and would protect the editor itself.

Measured against the built studio on this machine with `TURBOSLIDE_TOKEN` set (`vite preview`,
2026-09-11): `/api/decks/gt-brand/bundle` 401 without the header and 200 with it, `POST
/api/decks/bundle` 401, `/api/agent` 401 and 200 with the bearer, `GET /api/export/gt-brand` 401,
`/api/render/thesis?w=160` 200; the page's bundle download and upload passed through their tickets
(`apps/studio/e2e/deck-transfer.spec.ts`) and `apps/cli/e2e/deck-transfer.mjs` passed its seven
steps with the token on both sides.

### Blob listing consistency, measured

Vercel Blob's `list()` lags its `head()` and `get()`: on the preview of 2026-09-11, after one
function instance committed r12 of a deck, the next write landed on another instance whose
`head(deck.json)` saw the new etag while its listing still carried r11's, so the mirror's
listing-based pull kept the stale copy, the conditional commit answered "Precondition failed", and
the editor showed `decks/<id>/deck.json changed in the Blob store since it was read` and rebased
onto r11 (`docs/editor-depth-evidence/README.md`; every second write of the drive failed this way).
`packages/store/src/blob-store.ts` `pull()` now reads `deck.json` straight from `get`, walks the
version records above the mirror's last one by number until the store has none or the record reaches
the document's revision, and fetches the slides those records touched whatever the listing says;
`hosted.test.ts` holds the fake's listing stale between two instances' writes to keep it so.

## 7. Verify a deployment

`node scripts/hosted-smoke.mjs <url>` probes `/` (307 to `/edit/<deck>`), `/deck/gt-brand` (200),
`/edit/gt-brand` (200, the SSR shell with the theme boot script), `/decks` (200, naming the deck),
one twin (200 image or 302 to one; the first twin of `decks/gt-brand/deck.json` in the checkout, or
`--asset <file>`) and `/api/agent` (401 off localhost without a token), prints a table and exits 1 on
a failure. A preview sits behind Vercel Authentication, so the script sends the project's
development token in the Trusted Sources header when `VERCEL_OIDC_TOKEN` is in the environment
(`vercel env pull <file>`, never printed or committed); `vercel curl` does the same for one request,
and so do `turboslide deck push` and `deck pull` (docs/deck-transfer.md) and the editor depth
round's drive, `node scripts/editor-depth-drive.mjs <url>` (docs/editor-depth-evidence/README.md).

Measured on 2026-09-11 against the preview deploys of the `turboslide` project (the full table with
the files is `docs/hosted-evidence/README.md`):

- The smoke table: 6 of 6 on the last four previews; `/` 568 ms warm and 1.6 to 3.9 s on a cold
  instance (the seed's 183 documents in about 300 ms, the 24 package files in about 310 ms, the
  Blob manifest read), `/deck/gt-brand` 597 to 751 ms, the shell 104 to 242 ms, the list 164 to
  292 ms, a twin 112 to 299 ms from the CDN, `/api/agent` 401.
- The editor: the window API answers 4.1 to 5.9 s after the shell; an inspector write
  (`slide.title` on `thesis`) moved the deck from r27 to r28 with `Saved · r28`, and a reload that
  landed on another instance answered r28 with the text. On the first preview, before the store was
  connected, the same write showed r25 and the reload r24, which is the tmp backend's promise.
- Renders: `/api/render/opener-brand?w=320` 7.2 to 9.0 s on a cold instance (the browser inflates
  in 2.4 to 2.7 s, launches in 50 to 67 ms, the slide is ready in 30 ms and shot in 194 ms; the rest
  is the seed and the module load), 239 to 385 ms from the thumbnail cache, 1.6 to 2.2 s for another
  slide on a warm instance. The renderer string is `chrome-headless-shell 147.0.7727.0, SwiftShader,
Google`.
- Exports: `POST /api/export/gt-brand?sync=1` with `{ mode: "flatten", theme: ["light"] }` ran the
  85 pages in 187.9, 199.8 and 203.1 s (well under the 800 s function budget), produced 16,271,404
  to 16,278,003 bytes (15.52 MiB), and answered 302 to the stored copy on the Blob store
  (`exports/gt-brand/<job>/gt-brand-light.pptx`; the JSON variant lists the URL). python-pptx reopens
  the file with 85 slides and 774 shapes, `turboslide export check` reports it valid (446 parts,
  528 relationships, 83 palette PNG and 2 JPEG pages, 85 titles) and the report says `perfect:
true` with a worst decoded mismatch of 0.003 percent; verify is `not-requested` there because the
  function has no LibreOffice.
- Native (Editable text) exports, measured on `turboslide-no1sl8n5y`, the preview of the fix round:
  `{ mode: "native", theme: ["light"] }` ran the 85 slides in 127.4 s and produced 23,689,436 bytes
  (22.59 MiB); `theme: ["dark"]` ran them in 125.4 s and produced 24,847,042 bytes
  (23.70 MiB); both stored on Blob, `passed: true`, geometry in bounds, 242 native text
  blocks and 70 raster blocks per theme, verify not requested. `turboslide export check` reports
  both files valid and python-pptx reopens 85 slides in each. A one-slide native export (`thesis`)
  answers in 6.5 s on a cold instance and in 1.8 s warm with `rasterScale: 3`. Before the fix every
  native export on the previews answered 502 after the slides had measured, because the 3x shot
  page for icons and marks closed its context on the single-process shell
  (`docs/hosting-chromium.md` section 3b); flatten never opens that page.
- The editor's Export menu (PPTX, light) posts the sync route with `format=json` when
  `capabilities.sync` is set: 200 after 184.8 s, the report card says `Passed in 179.4 s`, perfect,
  and the browser downloads the stored copy (`?download=1`). One earlier attempt from the editor
  ran into the route's 780 s limit and answered 502; the cause is not established (the logs the
  CLI returns had rolled over), and the retry passed.
- Two exports on one instance in a row pass since the browser leftovers are handled
  (`docs/hosting-chromium.md` section 3b): 270 MB of the function's 525 MB `/tmp` stay free after a
  render.
- The hosted sync rule (the preview `turboslide-krbfpkh3a`, deployed from the working tree on
  2026-09-11 after the export route learned it): the smoke table 6 of 6 (`/` 307 in 2.0 s cold,
  `/deck/gt-brand` 799 ms, the shell 117 ms, the list 201 ms, a twin 117 ms, `/api/agent` 401).
  `POST /api/export/gt-brand` without `?sync=1` and a one-slide native body answered 200 in 10.6 s
  cold with `X-Turboslide-Sync: hosted`, `X-Turboslide-Exec: inprocess`, the report (`passed: true`,
  renderer `chrome-headless-shell 147.0.7727.0, SwiftShader, Google`) and the stored copy's URL
  (`gt-brand-light.pptx`, 29,284 bytes) under `Accept: application/json`, and the PPTX itself as an
  attachment in 4.5 s warm without that header; the same POST with `?sync=1` answered
  `X-Turboslide-Sync: requested` in 4.1 s. `GET /api/export/gt-brand` on the instance that ran them
  listed the jobs as `done`. `/api/render/opener-brand?w=320` answered the PNG (18,735 bytes, 2.8 s)
  and the JSON variant the cached record, both without a token, which is the state section 6
  records.
- The token rule, driven against the built function on this machine (`VERCEL=1`, the local Chrome,
  a fresh overlay per drive, the in-process method below): without `TURBOSLIDE_TOKEN`, `/api/agent`
  401 by the localhost rule and every render and export request 200 (a plain POST
  `X-Turboslide-Sync: hosted` in 8.2 s cold); with `TURBOSLIDE_TOKEN` set, `/api/agent` 401 without
  the header and 200 with it, `/api/render` 401 for the full-size JSON variant without the header or
  with a wrong bearer and 200 with the right one, the `?w=160` thumbnail 200 with no header,
  `/api/export` 401 for GET and POST without the header and 200 with it (`hosted` for the plain
  POST, `requested` with `?sync=1`); every refusal is
  `{ error: { name, status: 401, message, code: "unauthorized" } }`.

`vercel logs <url> --json` shows the function's lines per request: the store selection, the seed
and package materialization, every worker job line (`turboslide hosting: worker [...]`), the
launch steps (`turboslide launch: ...`) and the volume before each job.

Locally: `TURBOSLIDE_STORE=tmp pnpm dev` seeds `/tmp/turboslide/decks` from the checkout and shows the
banner; `TURBOSLIDE_STORE=blob` with a token in the environment talks to the real store from the dev
server (the client is loaded through a variable import, so the browser's dependency scanner never
sees `@vercel/blob`). The built function can be driven in this process too: import
`.vercel/output/functions/__server.func/index.mjs` from a directory with no workspace above it and
call its `fetch(new Request(url))` with `VERCEL=1` (the integrator's `drive2.mjs` method; a cold
render answered in 5.8 s on this machine through the local Chrome).

Tests: `pnpm --filter @turboslide/store test` runs the selection (`select.test.ts`), the seed
(`seed.test.ts`) and `hosted.test.ts`: the `DeckStore` contract over `FileStore` and over
`BlobStore` with an in-memory Blob fake (`@turboslide/store/blob-fake`), two store instances
standing in for two function instances (a write on one read by the other, a stale `baseRevision`,
leases enforced across instances, named versions, history), the Blob races (the lost commit as a
conflict outcome converging on the winner, a dropped push re-read from the store, a colliding named
version as a `ConflictError`, the watch poll), and the tmp and blob collections (seed
materialization, list, open, create from the template with the twins, the twin URL of a deck made
elsewhere, the seed uploaded once across instances). 71 tests.

## 8. What this round did not cover

- The agent surface's writes (`/api/actions`, `/mcp`, the window actions that run on the server)
  still open `FileStore` over `deckDir()` directly (`apps/studio/src/server/actions.ts` `storeFor`,
  `lint.ts`, `render.ts`, `download.ts`). On the tmp backend that is the overlay, the same folder the
  editor writes, so they work; on the blob backend their writes land in this instance's mirror and
  are not pushed, and the next sync overwrites them. The change is `await openDeckStore(deckId)`
  from `root.ts` in place of `openFileStore({ dir: deckDir(deckId) })`; `actions.ts` builds its
  dispatcher synchronously around `storeFor`, so that one needs its `deckDispatcher` made async.
- Asset uploads (`asset.add`, `asset.dither`, `material.capture`) write files under the deck's
  folder through `deckDir`; on blob they are not uploaded. `pushDeckDir` and `BlobStore.pullAssets`
  are the pieces to wire.
- `/openapi.json`, `/llms.txt` and `/llms-full.txt` still read `packages/agent/generated` under
  `repoRoot()`, which is the overlay when hosted, so they serve the placeholder stubs
  (`docs/hosting-diagnosis.md` section 2). Bundling the generated files as imports fixes it.
- Renders and exports inside the function are `docs/hosting-chromium.md` (section 3b has what the
  previews taught); the render worker's local mode reads the overlay through `TURBOSLIDE_DECKS_DIR`.
- One instance runs one Chromium job at a time (the local queue), and Fluid compute sends several
  routes of one deployment to one process: the editor's thumbnails (`/api/render/<slide>?w=320`,
  one browser launch each, about 2 s warm) and an export share that queue, so an export started
  from an editor whose sidebar is still filling waits behind the thumbnails. A render cache per
  revision on the instance and the Blob-stored export copies limit the repeat cost; a shared
  thumbnail cache (the Blob store) and a worker service are the next steps.
- The editor's sync export (`capabilities.sync`) runs through the `syncExport` server function of
  `download.ts` (the same answer as `POST /api/export/:deckId?sync=1&format=json`) and downloads
  from `files[].url`: the stored Blob copy on the blob backend, this instance's job file on the
  tmp backend (404 from another instance, which the card reports).
- The route's 202 path is not offered hosted: every POST to `/api/export/:deckId` runs
  synchronously there and answers `X-Turboslide-Sync: hosted` (`docs/hosting-chromium.md`
  section 4).
- `vercel link --yes --project studio` created a stray empty Vercel project named `studio`
  (`prj_g7MnEbMtpUvd4dBoCAGfSC0fiUfK`, root directory `.`) before the integrator found that Kevin's
  project is `turboslide`; nothing was deployed to it, and deleting it is Kevin's call.
- No deck deletion exists; a deck created by mistake stays in the store until `vercel blob del`.
- `/tmp` holds the seed (31 MB), every created deck's copy of the twins (30 MB each) and the
  inflated browser; Vercel does not state its size in the limits page.
- The version log is rebuilt from inverses (SPEC 6.7) and needs a contiguous chain; a push that
  failed after the manifest committed (step 1 of section 4) leaves the log short of one entry, which
  `documentAt` reports as a break. It is a rare network failure, not a conflict, and the document
  itself stays consistent on the next sync.
- The per-route function copies triple the upload; Nitro offers no shared directory for rules.
