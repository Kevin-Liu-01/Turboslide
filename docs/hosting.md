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
function runs; a twin added later reaches the function's assets route. Round four moves the 30 MB
of twins out of the server bundle and keeps them as those static files and on Blob (section 12.3).

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

### Room on the temp volume

The function's `/tmp` is 525 MB (`docs/hosting-chromium.md` section 3b) and both hosted kinds
share it between the inflated browser (about 205 MB), the overlay's decks and package files
(about 43 MB with the seed's twins, plus 30 MB per deck created from the GT template) and every
derived file the studio writes: the worker's job folders (`.turboslide/worker/jobs/<id>`; a
render job keeps a copy of every image it made beside the cache's), its render cache
(`worker/cache/<deck>/<revision>/<theme>@<scale>x`), the thumbnails
(`.turboslide/thumbs/<deck>/<revision>/<theme>@<width>`) and the standalone builds
(`worker/builds/<deck>/<deck>.html`). Nothing removed them before the Google Slides parity round:
one audit's worth of renders, an HTML build and an export filled a preview instance's volume and
its next write, a Blob sync inside `deck.list`, answered `ENOSPC` as a 500 (verification finding
20).

`root.ts` sweeps those four folders on the hosted kinds ahead of the collection's work
(`ensureDecks`, which every render, export, build, thumbnail and list passes through):

- Every 30 s (`DERIVED_SWEEP_INTERVAL_MS`) the routine sweep removes what nothing can ask for
  again: finished job folders and builds older than the download window (15 min,
  `DERIVED_KEEP_MS`, the life of a download token and of the tmp backend's job file URL), and the
  render and thumbnail caches of every revision but the deck's newest (a render always runs at
  the deck's current revision, so an older revision's cache is never read again). Then it keeps
  the rest under 160 MB (`DERIVED_BUDGET_BYTES`), oldest first.
- Under 128 MB free on the volume (`DERIVED_LOW_WATER_BYTES`, checked with `statfs` on every
  pass) the budget drops to 32 MB (`DERIVED_PRESSURE_BUDGET_BYTES`): the newest few megabytes,
  which are the open deck's thumbnails, stay.
- Nothing younger than 60 s is evicted (`DERIVED_GRACE_MS`), because a job in flight may still
  read it, and a job folder without a `job.json` (the queue writes it last) is never touched.
  `decks/` and `packages/` are never touched either: on the tmp backend they are the store.
- A write that meets `ENOSPC` inside `ensureDecks`, `listStoredDecks`, `openDeckStore`,
  `ensureDeckAssets` or `storedAssetFile` sweeps everything derived older than 10 s and runs
  once more; `createStoredDeck` sweeps and does not run twice. A second `ENOSPC` is a
  `DiskFullError` (`status: 503`, `code: disk_full`, `retryAfterSeconds`) whose message tells
  the caller to retry in a few seconds; the agent transport still maps unknown error classes to
  500 until `@turboslide/schema/errors` `errorStatus` reads the `status` an error carries
  (`docs/gslides-parity/build/b5.md`, fix round request 1).
- A materialization that failed (the packages or the seed) is not cached for the life of the
  instance: `root.ts` forgets its promise so the next request tries again.

Every sweep that removed something, and every pressure sweep, writes one line to the function's
log: `turboslide hosting: sweep (routine|low-water|disk-full): removed N entries, X MB (jobs a,
cache b, thumbs c, builds d); kept M entries, Y MB; Z MB free`. The rules are unit tested on a
temp tree (`apps/studio/src/server/root.test.ts`); the Docker worker's own folder
(`apps/render-worker`, a long-lived container) has no sweep yet and grows the same way.

## 4. The Blob backend

### Layout

One Vercel Blob store, public access, holds each deck under `decks/<id>/` in the layout of SPEC
4.1: `deck.json`, `slides/<slideId>.json`, `versions/<n>.json`, `leases.json`, the sidecars
(`import-ids.json`, `import-report.json`, `known-findings.json`) and `assets/<file>`, the twins,
whose public URLs the browser can read directly. Since the Google Slides parity round two the
prefix also holds `snapshots/<md5>.json`, one immutable copy of the whole document per committed
write (the subsection "Immutable per revision documents" below). Templates are not uploaded; they
ship in the bundle. Produced exports live beside the decks under `exports/<deckId>/<jobId>/` (the
files of a synchronous export; the plan, the parts and the files of a batched one, section 7).
The editor's queued export keeps its record at `exports/.jobs/<jobId>.json`, a folder no deck id
can name (the stream fix round two, `build/t1.md` C3S-F7): written `queued` when the export
starts, rewritten `done` or `failed` by the instance that ran the job under `waitUntil` after its
response, with the produced files stored under `exports/<deckId>/<jobId>/` and their `?download=1`
addresses, so a poll on any instance answers from the record and a job no record names is refused
in the product's words, never a 500. Records older than a day are pruned at the next export start;
`deck.remove` deletes the stored files with the deck prefix and the small record outlives it until
that prune.

### Reads

`BlobStore` (`@turboslide/store/blob-store`) is a `FileStore` over the overlay's copy of one deck
with a sync step around every call. A sync is one `head` of `decks/<id>/deck.json`; when its etag
differs from the mirror's record (`<deck>/.turboslide/blob.json`), the store lists the prefix and
pulls the files whose etag changed through `get(..., { useCache: false })`, which the SDK serves
from origin storage rather than the CDN cache (an overwritten blob is otherwise served stale for up
to its cache max-age, one minute at least), then removes the local documents the store no longer
has. Syncs closer than 750 ms apart share one result. Measured against the in-memory fake: an
unchanged deck costs one `head` per read and no download.

The focus round's second cycle (`docs/gslides-parity/focus/build/b7.md` Cycle 2, `b6.md` Cycle 2)
added four rules to the reads. Every call of the Blob client meets a deadline (`boundedBlobClient`
in `blob-store.ts`: `BLOB_READ_TIMEOUT_MS` 10 s for a `head`, `get`, `list` or `del`,
`BLOB_DOCUMENT_WRITE_TIMEOUT_MS` 20 s for a `put` at or under 256 kB (a document),
`BLOB_WRITE_TIMEOUT_MS` 90 s for a larger `put` (a twin); a call past its deadline settles as a
`BlobTimeoutError` and the deck's serial queue on the instance moves on, since one `head`, `get`
or `put` that never answered held every request of that deck on the instance). Since the third
cycle (`b7.md` Cycle 3, VERIFICATION C2-F24) the call underneath is cancelled at the deadline
through the SDK's `abortSignal`: `@vercel/blob` retries a network error or a 5xx up to
`VERCEL_BLOB_RETRIES` times (10 by default) with waits of 1, 2, 4, 8 ... seconds, so a call the
caller had given up on kept a retry chain running for up to seventeen minutes and held its
sockets; the plain abort ends that chain. The hosted collection's head poll (`HOSTED_POLL_MS`) is
1 s and one at a time (a tick while the last poll's sync is in flight is skipped), and a version
record is read through the store's `head` before its public URL, so a record that does not exist
yet never seeds the edge's cached miss for its path. `list()` enumerates the folder listing joined with the mirrors
this instance holds, so a deck made or opened here lists while the folder listing lags, and a
mirror whose manifest is gone leaves the listing. A `version.restore` record travels on the blob
channel as an external checkpoint at its revision and never as an op, so every tab reloads at that
revision instead of failing to apply a mutation only the store can replay. `readEditorDeck` (the
editor's and the show's loaders, a tab's reload, an access refresh) reads the head on the blob tier
past the sync window and lands at or above the revision a write's answer named
(`apps/studio/src/server/room.ts` `liveAtLeast`); every other read keeps the window. The access
record, the link hash index and the per identity deck index are read proven
(`access-store.ts` `provenGet`: `head()` first, a body accepted when its md5 is the head's version,
else the url read again with a cache busting query, else the last body under its own version so a
write on it is refused as stale), a missing record is never cached on this tier, a link grant is
written on the visitor's deck index so every instance sees it, and the comments sidecar is read by
its index rows and never by the prefix listing.

The stream's slot on an instance (the caps of `packages/realtime/src/admission.ts`, the counters of
`room.ts` `createStreamCounters`; the cycle 3 stream fix round and its fix round, `build/s1.md`,
`seam.md`, `b7.md` SF.2) is released by the runtime's close, abort or cancel when the runtime
reports one, and, where it reports nothing (the deployment, VERIFICATION C3S.3a: a closed stream's
abort and cancel never arrived and its heartbeats were taken, so the slot lived until the lifetime
timer), by three releases the route gives itself: the tab's token (`?tab=` on every open) releases
the tab's earlier slots on the instance the open lands on, hello or not and whatever the deck; a
`leave` of the stream's own client id (the tab's beacon, or a later open of the same tab retiring
it through `?retire=`) closes the stream on whichever instance it landed; and a reader whose
presence has not reached the instance for `STREAM_PRESENCE_UNSEEN_MS` (75 s) after
`STREAM_PRESENCE_GRACE_MS` (45 s) is closed at the heartbeat, never while the store refuses its
poll. A refused open (503 `too_many_streams` with `retry-after`) answers the client id it minted in
its body, so a page whose every open is refused still posts its writes over `POST /ops`; every
hello names the seq the last checkpoint covered (`covered`), so a tab trims what it retained while
its stream was down; and the room client reopens on a gap of `GAP_REOPEN_MS` (8 s) without an
event. None of this changed a cadence or added a store call: the liveness reads the `presence`
events the stream's subscription already receives, and `isStoreBusy` (`packages/store/src/pulse.ts`)
reads the SDK's "Failed to fetch blob: <status>" as a refusal, so the routes answer 503 and the poll
backs off.

Two more readings of the stream fix round two (`build/t1.md` C3S-F8 and C3-F13), neither a cadence
change nor a store call on the polling path: an ops answer to a POST carrying an edit also carries
`between`, the entries between the tab's `base.seq` and its first admitted one (at most 256
entries and 256 kB; over the bound the field is absent and the stream and the gap watch stay the
way), read from the mirror's version log the sync above pulled, so a tab whose stream sits on
another instance settles its answered ops from the answer alone instead of waiting on the gap
watch's reopen; and the pulse poll of a deck ends with one line, `polling <id> stopped, the deck is
gone`, when the store says the deck is gone (Delete forever on another instance), clearing the
deck's watch and comments watch and scheduling no tick, where it logged `polling <id> failed` once
per tick until the last stream closed.

### Writes

A write pulls first, then applies through `FileStore.write` on the mirror (the same `applyWrite`,
lease check and version record as on disk), then pushes in this order. The focus round
(docs/FOCUS.md section 5 ranks 3, 7, 20 and 21; `docs/gslides-parity/focus/build/b7.md`) changed
the order that follows: the version record travels in the second round, before the commit, as a
claim on its number (`overwrite` refused; a number another instance holds is `RecordTakenError`
and the write runs once more from the store's current document; a claim older than 60 s is a
stopped writer's and is taken over), so a record is never invisible to the other instances until
the next commit; the fourth round is the removed bodies alone; every push of `deck.json` (the
seed, `create`, `copy`, `trash`, `restore`) stores its snapshot first; `pull()` fetches the bodies
the manifest names and proves each against its own head, and a lagging body leaves the document
unproven (`StaleMirrorError`, a lost race for the room); and `list()` reads one head per deck (the
mirror when its manifest row names the head's etag, else the origin body when its md5 is the etag,
else the snapshot the etag names), so the listing shows a rename, a trash stamp or a restore within
its own refresh. The steps as they were, for the record of round two:

1. `snapshots/<md5>.json`, the whole document as canonical JSON under the md5 of the `deck.json`
   bytes about to be pushed, with overwrite refused (the subsection below; gslides-parity SPEC-2
   8.2). An existing snapshot whose etag is the md5 of this body is the same document and is left
   alone; one holding another body means another instance is committing the same revision from
   the same base inside the same clock millisecond, and the write stops here with a `conflict`
   outcome naming that (`SnapshotContestedError`), so no committed etag ever names a body its
   writer did not store.
2. `deck.json` with `ifMatch` set to the etag this instance synced. This is the commit point. A
   precondition failure means another instance committed first: the mirror is re-pulled and the
   outcome is `conflict` with the current document attached, the same shape as a stale
   `baseRevision`; the snapshot of step 1 is then named by no record and no etag, and the prune
   removes it.
3. The slides the write changed (`put`, overwrite) and the slides it removed (`del`).
4. `versions/<n>.json`, carrying `snapshot: <md5>`.
5. The retention prune, after the answer and without blocking it.

A named version (`saveVersion`) uploads its record with overwrite refused; a collision with another
instance's record of the same number is a `ConflictError`. Leases are pulled fresh before every
write, lease and release, and pushed after; the file is small and last writer wins. The watch
channel (`watch`) is a revision poll, 3 s by default and 1 s for the hosted collection
(`HOSTED_POLL_MS`, one poll at a time), so an external revision reaches an open editor within that
plus the editor's own poll.

If a push fails between steps (the network, the store), the mirror's record is dropped so the next
sync pulls the store's truth; the caller sees the error and retries from the current revision.
Between step 1 and step 2 a reader on another instance can see the new manifest with the old slide
bytes for a moment; its next sync corrects that.

### Immutable per revision documents

The Google Slides parity round two (gslides-parity SPEC-2 8.2, 0.32, 0.40; `packages/store/src/
snapshots.ts` and `blob-store.ts`): `deck.json` and the slide bodies are overwritten in place and
the CDN serves an overwritten body stale for a while, so round one proved a mirror's copy by
hashing bodies to etags or by replaying the version records. Every committed write now also stores
the whole `DeckDocument` under `snapshots/<md5>.json`, where the md5 is the hash of the `deck.json`
bytes it pushes, which is the etag Vercel Blob answers for them. So:

- `pull()` asks `head('deck.json')` for the etag and reads `snapshots/<etag's md5>.json`; when
  it exists and its `deck` hashes to that etag, it is the current document, proven by its name,
  and the mirror is written from it with no revision read and no slide body fetched. A deck
  written before the round, or a store whose `deck.json` push failed after its snapshot, has none
  and takes the round one replay.
- `documentAtRevision(r)` reads record r, then `snapshots/<record.snapshot>.json`, and falls
  back to the replay from the inverses for a record without the key or whose snapshot is gone. The
  batched export renders every batch from the plan's revision through it, and a named version's
  record carries the key of the document it names (stored then when the deck's last write
  predates the round).
- Two writers that race from one revision push different manifests (their `updatedAt` differs by
  at least a millisecond) and so store different keys; the loser's snapshot is orphaned. Equal
  manifests with different bodies (the same clock millisecond) contest one name, and the store
  refuses the second writer before its manifest push (the Writes list above); `hosted.test.ts`
  stages both races with the fake's frozen clock.
- Retention: after a commit the store deletes, in one `del`, every snapshot no record among the
  newest 50 and no named version names, older than five minutes (a commit in flight on another
  instance has stored its snapshot and not yet its manifest); the current manifest's snapshot
  stays whatever the records say. `BlobStore.snapshots()` counts them for `deck.info`;
  `BlobStore.pruneSnapshots()` runs the prune on demand. No migration runs: a deck with no
  snapshots reads as in round one and its next write creates the first.
- The file and tmp stores gain nothing; their bodies are local.

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
them from disk (an export). Round four adds the thumbnail cache under the same prefix
(`decks/<id>/.thumbs/`, section 12.2), which `pull()` and the mirror skip.

### Costs

Vercel Blob prices (read on 2026-09-11, `docs/hosting-diagnosis.md` section 7): `head` and a URL
read on a cache miss are simple operations, `put`, `list` and `copy` are advanced. A page view of
the editor is a handful of `head` calls; a write is one `list` (only when the manifest moved), one
`put` per changed slide, one for the version record and one for the manifest; a deck created from
the GT template is about 290 `put` calls (85 slides, the manifest and 202 twins, eight at a time,
measured a few seconds against the fake with no network). The seed upload happens once per store.
The editor's queued export costs one `list` (the prune of the day old records) and two `put` calls
for its record, plus one `put` per produced file, all on a write the person asked for; the ops
answer's `between` and the pulse poll's stop added no store call.

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
| `TURBOSLIDE_DOWNLOAD_SECRET`                    | you            | the signing secret of the export download URLs; required on every hosted environment, 16 bytes or more (a `tmp` or `blob` store refuses to mint an export token without it since the Google Slides parity round three); random per instance on a checkout |
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
  (`docs/hosting-chromium.md` section 6 has the measurement). Round four adds the Linux addon of
  the native module to the same two lists and the `routeRules` of section 12.1.
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
- The editor keeps its export because `runSyncExport` (in `apps/studio/src/editor/controller.tsx`
  since the round four editor split; `routes/edit.$deckId.tsx` before it) calls the `syncExport`
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

`node scripts/hosted-smoke.mjs <url>` (or `--base <url>`) probes `/` (307 to `/new` with
`X-Robots-Tag: noindex`, gslides-parity SPEC 6.1), `/new` (200, the SSR shell with the theme boot
script and a `noindex` meta), `/deck/gt-brand` (200, and the payload carries no `notes` key, SPEC
6.6), `/edit/gt-brand` (200, the SSR shell), `/decks` (200, naming the deck), `/decks/trash` (200),
`/print/gt-brand` (200, the print bar and one page per slide, SPEC 6.8), `/present/gt-brand` (200,
SPEC 9.3), one twin (200 image or 302 to one; the first twin of `decks/gt-brand/deck.json` in the
checkout, or `--asset <file>`) and `/api/agent` (401 off localhost without a token), prints a table
and exits 1 on a failure. Ten rows since the Google Slides parity round (six before it). A preview sits behind Vercel Authentication, so the script sends the project's
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

### The batched Perfect export

Round two (gslides-parity SPEC-2 8.1, 0.31, 0.44, 0.45; `packages/export/src/batch/`,
`apps/studio/src/server/export-batch.ts`, `download.ts`, the export route): a Download of a deck
whose play list is longer than the batch size runs as per slide batches, each one synchronous
function call, and a final merge. The size is `floor(240 s / (2.6 s per slide × 1.5))`, 61
written as 60 (the constants and the measurement they come from are in `batch/plan.ts`;
`TURBOSLIDE_EXPORT_BATCH` overrides them, the end to end spec uses 3), so the GT deck is two
batches of 60 and 25. A whole GT deck still fits one 800 s call (190 to 222 s measured in round
one); batching exists for robustness: a Chromium crash or a cold instance fails one batch, which
the dialog retries once, not the file.

The protocol, as server functions under the CSRF middleware (`download.ts`) and as the http form on
`POST /api/export/:deckId` (`?start=1`, `?batch=<i>&job=<id>`, `?merge=<id>`, `?cancel=<id>`, or
the action's `batch: { index, of, jobId }` and `merge: { jobId }` body fields), the same bearer
rule as the route except the cancel, which the page sends from `pagehide` with `keepalive` and no
header (the job id is the capability):

1. `startBatchedExport` validates the input through `export.run`'s schema (PPTX only: the PDF is
   one print of the whole document and stays a single call), reads the deck at its current
   revision, computes the play list and the batches, pins the sha256 of every twin the play list
   references, prunes every job under `exports/<deckId>/` older than 24 h and stores
   `exports/<deckId>/<jobId>/plan.json`; answers `{ jobId, revision, batches, batchSize, total }`.
   The job id is `b<start time in base 36>-<8 hex>`, so the prune reads the age off a folder name
   when the store reports no upload time.
2. `exportBatch` renders one batch from the document at the plan's revision
   (`documentAtRevision`, the snapshot path above) with the whole play list's numbering, so the
   counters read right, and stores each scene as JSON plus the 2x sheet shot, the rasters, the
   regenerated or twin picture and the wordmark under `parts/`, with `overwrite: true`, so a rerun
   rewrites the same paths and a repeat answers the same result. It answers `{ stale: 'revision' }`
   when the revision can no longer be read and `{ stale: 'asset' }` when a twin the batch references
   no longer hashes as the plan recorded (a picture replaced during the download); the dialog then
   cancels the job and starts again from the current revision. One browser at a time per process.
3. `mergeExport` streams the parts to the function's disk one file at a time, runs `buildPptx` per
   theme over the scenes in play order from the paths on disk (no browser), stores the files and
   the reports under the job, and answers the `jsonBody` shape of the synchronous export plus
   `peakMb`, the largest resident memory sampled every second during the merge, so VERIFICATION-2
   records the merge against the 3009 MB function.
4. `cancelBatchedExport` deletes the job's prefix.

The dialog (`runBatchedExport` in `download.ts`) runs the batches in sequence and shows
"Preparing slide 60 of 85, about 1 minute left" with the estimate recomputed from the measured
batch times after every batch, rounded to the half minute, then "Merging your file", then "Your
file is ready" (`DOWNLOAD_PROGRESS`); `exportCapabilities().batchSize` tells the editor when to
take this path. On the file and tmp backends the part store is a folder of the instance's derived
files (`.turboslide/exports/`, `@turboslide/store/blob-disk`) and the files' URLs are the route's
`?job=<id>&file=<name>` form, which streams them from that instance; on the blob backend the files
are stored copies with public URLs, as the synchronous export's are.

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

### The routes of the Google Slides parity round

Every route below runs on the file, tmp and Blob backends through the same server functions
(`apps/studio/src/server/decks.ts` and `write.ts` over `root.ts`'s collection):

- `/` is a 307 to `/new`; `/new` edits a draft of the blank template under an id of the shape
  `untitled-<yyyymmdd>-<4 chars>` that the store has not seen. The first write against revision 0
  creates the deck through `createStoredDeck` (on Blob the upload happens before the write lands)
  and the address becomes `/edit/<id>`; a visit that only looks creates nothing, so the shared
  store gains no deck per crawler. A lease, a watch poll or a thumbnail warm on an unsaved draft
  answers as an empty deck would.
- `/decks` lists `deck.list` (the trash left out) with a 320 by 180 thumbnail per card from the
  render route's `?w=320` variant, which stays open when the token is set; the card menu's Rename,
  Make a copy, Move to trash and Download run `deck.rename`, `deck.copy`, `deck.trash` and the
  bundle ticket through the collection, so on Blob a copy is pushed and a trash stamp is written
  with `ifMatch`. `/decks/trash` runs `deck.restore` and `deck.remove` (the prefix on Blob).
- `/deck/<id>` and `/embed/<id>` answer 404 for a deck in the trash and carry neither speaker notes
  nor skipped slides; `/present/<id>` and `/print/<id>` ask for what they need.

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
  (`docs/hosting-diagnosis.md` section 2; production answered a 236 byte `/openapi.json` on
  2026-09-13). Bundling the generated files as imports fixes it; round four does so (section 12.5).
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
- `/tmp` (525 MB measured) holds the seed (31 MB), every created deck's copy of the twins
  (30 MB each) and the inflated browser (205 MB); the derived files are swept since the Google
  Slides parity round (section 3, "Room on the temp volume"), the decks are not, so an instance
  that creates many decks from the GT template still fills up and starts answering
  `DiskFullError` until it is recycled.
- The version log is rebuilt from inverses (SPEC 6.7) and needs a contiguous chain; a push that
  failed after the manifest committed (step 1 of section 4) leaves the log short of one entry, which
  `documentAt` reports as a break. It is a rare network failure, not a conflict, and the document
  itself stays consistent on the next sync.
- The per-route function copies triple the upload; Nitro offers no shared directory for rules.

## 9. Redis, the realtime tier (Google Slides parity round three)

The multiplayer room of `docs/gslides-parity/SPEC-3.md` section 2.3 needs a store that every
function instance shares and that can fan out: Vercel Blob allows about 15 one slide commits per
second across a deployment and cannot push a change to another instance, so the room runs on Redis
over the Redis protocol (`ioredis`; the REST API cannot block on `XREAD`). `@turboslide/realtime/select`
`selectRealtime(env)` picks the tier once per process, like `selectStore`:

| Environment                               | Tier     | Change feed                                                       | Presence                                 |
| ----------------------------------------- | -------- | ----------------------------------------------------------------- | ---------------------------------------- |
| a checkout, the tests                     | `memory` | in process; CLI writes beside the dev server arrive by `fs.watch` | in process                               |
| `REDIS_URL` set                           | `redis`  | a Redis stream per deck, pub/sub, one Lua compare and append      | a Redis hash and sorted set              |
| hosted without `REDIS_URL`                | `blob`   | every batch is a `BlobStore.write`; `head('deck.json')` polled    | per instance only; the title row says so |
| `TURBOSLIDE_REALTIME=memory\|redis\|blob` | forced   | as above                                                          | as above                                 |

What Redis holds, all of it derived or short lived (a flush loses nothing a store does not have;
the room reloads the document from the store and the tabs resync): the operation stream of each
deck (`deck:<id>:ops`, trimmed to 10,000 entries after a checkpoint), its head, the checkpointer
lock (`deck:<id>:ckpt`, `SET NX PX 5000`, a 1 s heartbeat, broken after 3 s of silence), the
follow lock, the presence hash and roster (120 s expiry), the client bindings (report 10 F26), the
per client and per identity budgets (fixed windows), the access record cache (60 s, dropped by a
`PUBLISH` on every write), the deck head cache (`head:<deckId>`, a day, refreshed by the commit
path), the anonymous principal records, the anonymous inboxes (`inbox:<principalId>`, 30 days),
the studio session directory (`sessions:studio`), the kill switch flags and the spent download
tokens. The key builder is `packages/realtime/src/keys.ts`; every key starts with the slug
validated deck id or one of the fixed prefixes, so a key never carries user text.

The stream protocol (SPEC-3 3.3): `GET /api/decks/:id/stream` is Server-Sent Events with `hello`,
`ops`, `op`, `checkpoint`, `presence`, `leave`, `reject`, `inbox`, `access` and `resync`, a comment
line every 15 s, `Last-Event-ID` (or `?since=`) to resume, a server close at a random point between
240 and 290 s with `retry` between 1,000 and 4,000 ms so tabs never reconnect together; `POST
/api/decks/:id/ops` admits a batch of operations against `base.seq` (64 entries and 256 kB at
most, a 500 entry window behind the head, transform against what landed, the reducer and the
validator, one Lua compare and append); `POST /api/decks/:id/presence` posts one presence state
(15 a second per client, coalesced). Both POST routes and the stream sit behind the CSRF filter of
`apps/studio/src/start.ts`: a browser passes with `Sec-Fetch-Site: same-origin`; `curl` needs the
header set by hand.

The checkpointer (`apps/studio/src/server/checkpoint.ts`) turns the stream into version records:
one record per author and contiguous run (SPEC-3 0.51), after 2 s idle, 10 s at most, 2,000
entries or 1 MB, at once for an agent's write and a named version, under the lock above; the
record carries `ops: { fromSeq, toSeq }` so a cold instance loads the document at the last
checkpoint and applies the entries after it (0.53). Comment entries ride the same run into the
sidecar (section 10) on the memory and redis tiers; on the blob tier the version log carries no
comment entries for the checkpointer to fold, so the channel writes them to the sidecar itself in
the same append (`room.ts` attaches the comments store as the channel's `applyComments`; without
it every comment write answered 400 on the previews, VERIFICATION-3 finding 6). Measured on the
dev server with the memory tier: the numbers of `docs/gslides-parity/build-3/b2.md`.

When Redis is unreachable the channel logs `redis.unavailable`, the kill switch `realtime` reads
as off and the tabs fall to the `blob` tier's behaviour until the connection returns; nothing is
lost, because every admitted entry reaches the store within the checkpoint interval. Redis must
never hold the only copy of anything: that is the test of whether a value belongs there.

## 10. The private store and storage layout v2

Layout v1 (sections 4 and 5) is one public store: every document has a predictable public URL, and
once roles exist (SPEC-3 6) a viewer link must not be a way to read `deck.json` or `access.json`
by address (research 04 F8). Layout v2 keeps the twins on the public store, because a browser
`<img>` needs a URL, and moves every document to a second, private store:

| Store                        | Access  | Holds                                                                                                                                             |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turboslide-decks` (today's) | public  | `decks/<id>/assets/*` (the twins, the recipes, the dither variants), `exports/`, `bundles/`; later `d/<id>/<assetKey>/*` and `u/<avatarKey>/*`    |
| `turboslide-private` (new)   | private | `decks/<id>/{deck.json,slides/,versions/,snapshots/,leases.json,access.json,comments/,<sidecars>}`, `users/<principalId>/decks.json`, `meta.json` |

The code (`packages/store/src/migrate.ts`, `blob-vercel.ts`): `vercelDocumentsClient(env)` opens
the private store from `TURBOSLIDE_BLOB_PRIVATE_TOKEN` with `access: private`; `splitBlobClient({
legacy, documents })` is one `BlobClient` that routes by pathname (`isPublicPath`: twins, keyed
twins, exports and bundles are public, everything else a document), reads a document from the
private store first and, during the dual read window, from the public one when it is absent there,
and writes every document private from the first request after the plan; `layoutBlobClient(env)`
returns that client when the private token is set and the plain public client otherwise, so a
deployment without the second store runs layout v1 unchanged. `openBlobStore` and `openHostedDecks`
take the split client as their client with no change of their own. The layout is read from
`meta.json` in the private store and cached for 5 s per process.

The migration is `turboslide admin migrate-storage <step> [--batch <n>]` (`admin.migrateStorage`,
the admin's bearer, then an API key), one step per call and resumable from the cursor `meta.json`
keeps, so a function timeout never loses work:

1. `plan`: lists `decks/` on the public store (the templates are not stored), writes `meta.json`
   with `layout: 'v1'`, the deck list, `dualRead: true`. From here every document write goes
   private and every read checks the private store first.
2. `copy`: per deck (5 per call by default), every document of the public store that the private
   one lacks is read and put with `overwrite: false`; the etag of the copy must equal the source's
   (Vercel Blob's etag is the md5 of the body; the fake's too), else the deck is listed under
   `failed`. A document already private is left alone: it is the copy of an earlier call, or a
   write of the window, which is newer than the public copy.
3. `verify`: per deck, a `head` per document compares the etags; a snapshot is compared byte for
   byte; a private copy newer than the public one (a write of the window) passes. Verified decks
   accumulate in `meta.verified`.
4. `cutover`: refused with the list of unverified decks while any deck failed or is unverified;
   otherwise flips `layout: 'v2'` and ends the dual read window. From here a document that exists
   on the public store only is invisible.
5. `delete`: per deck, the public documents leave in `del` batches of at most 50 paths, off the
   request path (the CLI runs it after the cutover verified).
6. `rollback`: before the cutover, sets the rollback flag: reads and writes go to the public store
   again, as if no plan had run; `plan` restarts the migration. After the cutover there is no
   rollback flag; `deck pull` and `deck push` still move any deck.

Tested on the fake in `packages/store/src/migrate.test.ts`: two decks with 68 documents each move
byte for byte with equal etags, the twins stay, the templates are not touched, a copy re-run is
idempotent, the cutover before verify refuses, the public documents leave in batches, a tampered
private copy fails verification and a rollback before the cutover flips the reads. The rehearsal
on a checkout: `TURBOSLIDE_BLOB_PRIVATE_DIR=<folder>` opens a folder as the private store
(`diskBlobClient`).

Deviation from SPEC-3 11.5, recorded for the verifier: the migration does not generate an
`assetKey` per deck or copy the twins to `d/<id>/<assetKey>/<digest name>` with an `asset.set`
rewrite of `twins` and `sourceFile`. The twins keep their `decks/<id>/assets/` paths on the public
store, which the assets route serves today; the keyed layout of the twins is the assets route's
change (B4) and can run as a later step of the same command once that route reads `assetKey`.

Turning the private store on (Kevin or the integrator; no agent creates a paid resource):
`vercel blob create-store turboslide-private --access private --region iad1 --yes` from the linked
project, then `vercel env add TURBOSLIDE_BLOB_PRIVATE_TOKEN preview` with the store's read write
token (the Marketplace names it with the prefix Kevin picks; the variable the studio reads is this
one), redeploy the preview, run the migration to its dual read window on the preview store
(`plan`, `copy` until `done`, `verify` until `done`), watch the editor and `/decks` for a day, then
`cutover` and `delete`. Production repeats the same steps with its own token after the preview
verified.

## 11. The runbook of the round three services

The account boundary of MILESTONES-3: no agent installs a Vercel Marketplace product, creates a paid
resource, changes DNS, registers a sending domain or signs up for a service. Every tier below is
built behind an environment switch with a fake in the tests and turns on when the variable is set.

- Redis (Upstash, Marketplace, the fixed 250 MB plan): install from the project's Storage tab,
  which sets `REDIS_URL` (the Redis protocol URL, `rediss://`); redeploy; `turboslide sync status
--from <studio>` answers `tier: redis`. To turn it off, unset the variable: the deployment falls
  to the `blob` tier with the title row's notice.
- Postgres (Neon, Marketplace, free tier): sets `DATABASE_URL`; better-auth's Kysely adapter runs
  the migrations at the first request (B3's `apps/studio/src/server/auth/better-auth.ts`); without
  it the deployment has anonymous principals only.
- Resend: `RESEND_API_KEY` and `TURBOSLIDE_MAIL_FROM` after Kevin registers the sending domain;
  `TURBOSLIDE_MAIL=capture` on every preview writes outgoing mail to a Redis list that
  `admin.mail.list` reads instead of sending.
- The private store: section 10.
- The WAF rules file (`firewall/rules.json`, B4): log mode from the ship step; enforce is Kevin's
  date (SPEC-3 11.5 R8).
- `TURBOSLIDE_AUTHORIZE=shadow` on production for a week (R3), `enforce` after the denial counts
  per route were reviewed.
- Retention (SPEC-3 8.10): presence 120 s, the ops stream 24 hours and 10,000 entries, counters an
  hour at most, inboxes 500 unread and 5,000 in all, comments the deck's life with tombstones
  restorable for 30 days.

A dev server needs `TURBOSLIDE_SESSION_SECRET` (32 characters or more; every `/api/actions/*`
request derives its author from the sealed cookie, and the tmp store's export tokens need
`TURBOSLIDE_DOWNLOAD_SECRET` beside it); an obviously fake value is fine on a checkout.

Environment variables the round adds (every secret differs between preview and production):

| Variable                                             | Set by                | Effect                                                                                         |
| ---------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `REDIS_URL`                                          | the Upstash install   | the `redis` realtime tier, the caches and the inboxes of section 9                             |
| `TURBOSLIDE_REALTIME`                                | you                   | forces `memory`, `redis` or `blob`                                                             |
| `TURBOSLIDE_BLOB_PRIVATE_TOKEN`                      | the private store     | layout v2: documents in the private store through `layoutBlobClient` (section 10)              |
| `TURBOSLIDE_BLOB_PRIVATE_DIR`                        | you, a checkout       | a folder as the private store for a migration rehearsal                                        |
| `DATABASE_URL`, `BETTER_AUTH_SECRET`                 | the Neon install, you | accounts (B3)                                                                                  |
| `TURBOSLIDE_SESSION_SECRET`                          | you                   | seals the anonymous principal cookie; 32 characters or more, `openssl rand -hex 32`            |
| `RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`             | you, after the domain | the mail sender (B3)                                                                           |
| `TURBOSLIDE_MAIL`                                    | you                   | `capture` on previews                                                                          |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`           | you                   | the GitHub sign in (B3)                                                                        |
| `TURBOSLIDE_ADMIN_EMAILS`                            | you                   | the deployment admins                                                                          |
| `TURBOSLIDE_DOWNLOAD_SECRET`                         | you                   | required on every hosted environment, 16 bytes or more (section 5's table)                     |
| `TURBOSLIDE_AUTH_DB`                                 | you, a checkout       | `node:sqlite` accounts on a checkout                                                           |
| `TURBOSLIDE_AUTHORIZE`                               | you                   | `shadow` (default) logs denials and allows; `enforce` refuses                                  |
| `TURBOSLIDE_MISSING_RECORD`                          | you                   | what a deck without `access.json` synthesizes as (B4's `authorize.ts`)                         |
| `TURBOSLIDE_TRUST_PROXY`                             | you                   | trusts the platform's client address header (B4)                                               |
| `TURBOSLIDE_LOCAL_OPEN`                              | a checkout's tests    | the localhost open rule for the test runs only                                                 |
| `TURBOSLIDE_LOCAL_TOKEN`                             | you, a checkout       | `require` makes the localhost agent surface take the token of `.turboslide/token` (B3)         |
| `TURBOSLIDE_AUTH_RATE_LIMIT`                         | a checkout's tests    | `off` turns the library's sign in limiter off for a spec run; ignored hosted                   |
| `TURBOSLIDE_PASSKEY_RPID`                            | reserved              | the production host once final; the passkey plugin reads it when installed                     |
| `TURBOSLIDE_CSP`                                     | you                   | `report` (default) sends the nonce CSP as report only; `enforce` after the report weeks; `off` |
| `TURBOSLIDE_EGRESS`, `TURBOSLIDE_WEB_SECURITY`       | you                   | the capture browser's egress denial and `strict` web security (B4, docs/security.md)           |
| `TURBOSLIDE_PUBLIC_STORE_HOST`                       | you, hosted           | the public store's host for the CSP's `img-src` (B4)                                           |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | the Upstash install   | the Upstash rate limiter replaces the memory one when both are set (B4)                        |

## 12. Round four: the CDN rules, the thumbnail cache, the seed twins and the native addon

The Google Slides parity round four (`docs/gslides-parity/SPEC-4.md` sections 0.13, 0.31, 0.35,
0.38, 0.43, 0.45, 1.6, 3.6, 3.11; `docs/performance.md` is the plan's record) changes what the
deployment serves from the CDN and what the function carries. Written on 2026-09-14 after merge 1
of that round; each item names its state on that tree and the builder key of `MILESTONES-4.md`
that lands it, so a reader after the ship step should check the file the item names before
relying on the sentence.

### 12.1 The `routeRules` and the root redirect

`vite.deploy.config.ts` gains Nitro `routeRules` (B3, day 4) so the CDN answers the identity's files
and the twins with a cache policy and the root redirect never wakes the function:

| Path                                                                                   | Rule                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/favicon.ico`, `/icon.svg`, `/apple-touch-icon.png`, `/og/turboslide.png`             | `public, max-age=86400, stale-while-revalidate=604800` (a day in the browser, a week of stale service)                                                                                    |
| `/manifest.webmanifest`                                                                | `public, max-age=86400`                                                                                                                                                                   |
| `/icons/**`                                                                            | a week, a month stale                                                                                                                                                                     |
| `/brand/**` (the two tone twins of the identity), `/home/**` (the `/home` screenshots) | content hashed names, `public, max-age=31536000, immutable`                                                                                                                               |
| `/decks/gt-brand/assets/**`                                                            | an hour in the browser, a day of `s-maxage`, a week stale (`publicAssets` above gave an hour alone)                                                                                       |
| `/`                                                                                    | `{ redirect: { to: '/new', statusCode: 307 } }` with the `x-robots-tag: noindex` header, compiled into `config.json`; `routes/index.tsx` keeps its `beforeLoad` for the client side visit |

`/home` is prerendered at build (the start plugin's `prerender.enabled` with `/home` in `pages`)
and served as a static file, so its second request is a CDN `HIT` like the icon paths. Check step
30 (`node scripts/check-vercel-output.mjs` after a `NITRO_PRESET=vercel` build) asserts one route
per header rule and the redirect in `.vercel/output/config.json`, every file of the icon set and
the prerendered `/home` under `static/`, and prints each function directory's size against the
250 MB cap; the perf budget's `cdn` rows request each path twice and expect `x-vercel-cache: HIT`
on the second answer. Measured before the round (2026-09-14): every icon path, `/og/turboslide.png`
and `/home` answered a function 404 with `MISS`. State on 2026-09-14: the icon set is in
`apps/studio/public/` since merge 1 and the `routeRules` had not landed.

### 12.2 The thumbnail cache on Blob

The capture path's cache moves from the instance's `/tmp` (`<state>/thumbs/<deckId>/<revision>/
<theme>@<width>/<slideId>.png`, swept by section 3's routine) to Blob under
`decks/<id>/.thumbs/<stamp>/<theme>@<width>/<slide>.png`, put with a year's `cacheControlMaxAge`
(B4, day 3; SPEC-4 0.31). `GET /api/render/<slide>?w=&r=<stamp>` answers a 302 to the Blob URL
when the object exists and the store is public, streams the body under
`TURBOSLIDE_BLOB_ACCESS=private`, else renders, puts and answers; without `r` the route answers
the newest stored thumbnail with `s-maxage=60, stale-while-revalidate=86400` and refreshes inside
`waitUntil()` from `@vercel/functions` (in the catalog since day 0 at 3.9.7). Retention keeps the
newest three stamps per slide and theme, pruned in the same `waitUntil` as the render; `pull()`'s
listing and the mirror skip the `.thumbs/` prefix. The signed short lived URL of round three
(SPEC-3 8.13: an HMAC over deck id, width, revision and role, ten minutes) stays, so a CDN entry
lives at most ten minutes per signature while the Blob object is shared across instances and
signatures: one render per stamp holds, one CDN hit per signature does not, and the copy claims the
former only. The editor's own filmstrip stops asking for captures at all (SPEC-4 0.30: the card is
the renderer's HTML); the viewer's grid, the home cards and the presenter keep them.

### 12.3 The seed twins leave the function bundle

`SEED_PATTERN` drops `assets/**` (B3), so the seed deck's 30 MB of twins are no longer base64
chunks of the server bundle (72 MB of the 2026-09-11 `__server.func` measurement in section 6,
with 146.6 MB per function directory once Chromium is traced); they stay static files of the
deployment under `/decks/gt-brand/assets/` and on Blob after `seedOnce`. `ensureDeckAssets`
(`server/root.ts`, B4) pulls the seed deck's twins from the deployment's static URL or from Blob
for a render or an export, and a deck created from the GT template copies its 202 twins from the
same source, because the GT template card on `/decks` copies them into the new deck on a fresh
instance and would otherwise break. `scripts/check-vercel-output.mjs` prints every function
directory's size; the 200 MB gate is round five's. The base function keeps the Chromium package,
since Nitro's `traceDeps` is one list per deployment.

### 12.4 The native addon in the function

The Linux x64 glibc addon of the native module (`packages/native/npm/linux-x64-gnu/
turboslide-native.linux-x64-gnu.node`, about 770 KB) and the wasm module are committed build
outputs since round four, regenerated by a CI job against a glibc floor of 2.28 and recorded with
their sha256 in `packages/native/BUILD-RECORD.json` (SPEC-4 0.38; `docs/native.md` "Round four").
`vite.deploy.config.ts` treats `@turboslide/native-linux-x64-gnu` as `SERVER_ONLY` treats `sharp`
(external on the server, a stub in the client) and `traceDeps` gains it (B4's lines, applied by
B3), so the function holds the addon and `select.ts` picks `native` through its existing loading
order. `hosted-smoke.mjs` reads `describeBackends()` through `/api/agent`'s instance facts on a
preview and fails when the selection is not `native` once the addon is committed, and records the
runtime's glibc (`process.report.header.glibcVersionRuntime`) once into `docs/native.md`.
`TURBOSLIDE_EFFECTS_BACKEND=typescript` is the documented pin if the addon misbehaves. State on
2026-09-14: the root `.gitignore` tracks the wasm folder and negates the one addon file; no addon
is committed and the hosted studio runs the TypeScript stages.

### 12.5 The contracts routes serve the bundle

`/openapi.json`, `/llms.txt` and `/llms-full.txt` serve the generated files bundled with the
function (an import of the committed text, `public, max-age=300, s-maxage=86400`) instead of
reading `packages/agent/generated` under `repoRoot()`, which is the overlay when hosted and
answered placeholders on production (section 8; B4, `apps/studio/src/server/contracts.ts` and the
three route files). The MCP server's `instructions` gain one sentence naming `/home` as the
product page and `/llms.txt` as the agent guide (B1, day 3; SPEC-4 0.18).

### 12.6 The check on a checkout

Check step 31 builds the node-server output (`NITRO_PRESET=node-server pnpm --filter
@turboslide/studio build:deploy`), starts `node apps/studio/.output/server/index.mjs` on 4321 with
`TURBOSLIDE_STORE=tmp` and runs `scripts/perf-budget.mjs` against it (`docs/performance.md`
section 4). That server, like every tmp store server since round three, refuses every request
with a 500 unless `TURBOSLIDE_SESSION_SECRET` is set (a tmp store has no state folder to mint it
from; `apps/studio/src/server/auth/secret.ts`) and needs `TURBOSLIDE_DOWNLOAD_SECRET` for its
export tokens; the runner sets both to obviously fake values, the way `playwright.config.ts` does
for its own server and section 11 allows on a checkout. `scripts/hosted-smoke.mjs` gains the rows
of the round on a preview: `/home` (200, the hero sentence, a CDN `HIT` on the second request), the
icon paths and `/og/turboslide.png` with the CDN hit, the thumbnail 302 or body, the backend
assertion with the glibc record, one render and one template copy of the GT deck (200 and 202
twins).
