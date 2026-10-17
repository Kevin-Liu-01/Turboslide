The move of the hosted studio to the General Translation team is planned in [docs/HOSTING-MOVE.md](HOSTING-MOVE.md), which supersedes the project and account facts below; this file stays the reference for the store selection, the seed, the Blob backend, the deploy configuration and the verification it describes.

# Hosting the studio

How a deployed studio finds its decks, keeps edits and serves the asset twins, written for the
hosting round of 2026-09-11 (`docs/archive/status/hosting-diagnosis.md` is the measured cause: the Vercel function
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
instance starts from the seed again, so the editor shows the banner "Edits on this copy of
Turboslide are lost when it restarts." (`.ts-banner[data-state="hosting"]`, `@turboslide/store/select`
`NOT_PERSISTENT_NOTICE`), and the server logs the setup sentence `NOT_PERSISTENT_SETUP` once at
start: "Edits are kept on this server instance only. Connect a Blob store to the Vercel project to
keep them". This is the mode the production URL runs in until a store is connected.

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

One Vercel Blob store, public access, holds each deck under `decks/<id>/` in the layout of SPEC 4.1:
`deck.json`, `slides/<slideId>.json`, `versions/<n>.json`, `leases.json`, the sidecars
(`import-ids.json`, `import-report.json`, `known-findings.json`) and `assets/<file>`, the twins,
whose public URLs the browser can read directly. Since the Google Slides parity round two the prefix
also holds `snapshots/<md5>.json`, immutable copies of the whole document: one per committed write
until hardening PS#4, and since then one on every tenth record, for a restore, for a document over 3
MB and at the deck's last close (the subsection "Immutable per revision documents" below). Templates
are not uploaded; they ship in the bundle. Produced exports live beside the decks under
`exports/<deckId>/<jobId>/` (the files of a synchronous export; the plan, the parts and the files of
a batched one, section 7). The editor's queued export keeps its record at
`exports/.jobs/<jobId>.json`, a folder no deck id can name (the stream fix round two, `build/t1.md`
C3S-F7): written `queued` when the export starts, rewritten `done` or `failed` by the instance that
ran the job under `waitUntil` after its response, with the produced files stored under
`exports/<deckId>/<jobId>/` and their `?download=1` addresses, so a poll on any instance answers
from the record and a job no record names is refused in the product's words, never a 500. Records
older than a day are pruned at the next export start; `deck.remove` deletes the stored files with
the deck prefix and the small record outlives it until that prune.

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
(docs/FOCUS.md section 5 ranks 3, 7, 20 and 21; `docs/gslides-parity/focus/build/b7.md`) changed the
order that follows: the version record travels in the second round, before the commit, as a claim on
its number (`overwrite` refused; a number another instance holds is `RecordTakenError` and the write
runs once more from the store's current document; a claim older than 60 s is a stopped writer's and
is taken over), so a record is never invisible to the other instances until the next commit; the
fourth round is the removed bodies alone; every push of `deck.json` (the seed, `create`, `copy`,
`trash`, `restore`) stores its snapshot first, and since hardening PS#4 a write stores it on every
tenth record, for a version restore and above 3 MB alone, while a reader replays the records above
its mirror or above the newest stored snapshot a record names; `pull()` fetches the bodies the
manifest names and proves each against its own head, and a lagging body leaves the document unproven
(`StaleMirrorError`, a lost race for the room); and `list()` reads one head per deck (the mirror
when its manifest row names the head's etag, else the origin body when its md5 is the etag, else the
snapshot the etag names), so the listing shows a rename, a trash stamp or a restore within its own
refresh. The steps as they were, for the record of round two:

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

Vercel Blob prices (read on 2026-09-11, `docs/archive/status/hosting-diagnosis.md` section 7): `head` and a URL
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
onto r11 (`docs/archive/status/editor-depth-evidence/README.md`; every second write of the drive failed this way).
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
round's drive, `node docs/archive/status/editor-depth-drive.mjs <url>` (docs/archive/status/editor-depth-evidence/README.md).

Measured on 2026-09-11 against the preview deploys of the `turboslide` project (the full table with
the files is `docs/archive/status/hosted-evidence/README.md`):

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
  store gains no deck per crawler. A lease or a thumbnail warm on an unsaved draft answers as an
  empty deck would.
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
  (`docs/archive/status/hosting-diagnosis.md` section 2; production answered a 236 byte `/openapi.json` on
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

## 9. The realtime tiers

The multiplayer room of `docs/archive/gslides-parity/SPEC-3.md` section 2.3 needs a channel that
every function instance shares and that can fan out: Vercel Blob allows about 15 one slide commits
per second across a deployment and cannot push a change to another instance.
`@turboslide/realtime/select` `selectRealtime(env)` picks the tier once per process, like
`selectStore`:

| Environment                                                 | Tier     | Change feed                                                       | Presence                                                |
| ----------------------------------------------------------- | -------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| a checkout, the tests                                       | `memory` | in process; CLI writes beside the dev server arrive by `fs.watch` | in process                                              |
| `TURBOSLIDE_ROOM_HOST` set, with the room secret and bearer | `do`     | the deck's Durable Object on the realtime Worker (section 13)     | the object                                              |
| hosted without the Worker                                   | `blob`   | every batch is a `BlobStore.write`; `head('deck.json')` polled    | the store's shared roster record; the title row says so |
| `TURBOSLIDE_REALTIME=memory\|blob\|do`                      | forced   | as above                                                          | as above                                                |

The redis tier of round three (a Redis stream per deck, pub/sub and one Lua compare and append
over `ioredis`, with the principal records, the inboxes, the session directory, better-auth's
secondary storage and the counters in the same database) was built and tested, never deployed
(`docs/CLOUDFLARE.md` 5.1: `REDIS_URL` was never set on either project), and left the tree in
hardening HR-C#8 (CLEANUP-6). `REDIS_URL` selects nothing since, and `TURBOSLIDE_REALTIME=redis`
is a TypeError at the first request. Its design and its runbook are `docs/REALTIME.md` and this
file's history before HR-C#8.

The stream protocol (SPEC-3 3.3): `GET /api/decks/:id/stream` is Server-Sent Events with `hello`,
`ops`, `op`, `checkpoint`, `presence`, `leave`, `reject`, `inbox`, `access` and `resync`, a comment
line every 15 s, `Last-Event-ID` (or `?since=`) to resume, a server close at a random point between
240 and 290 s with `retry` between 1,000 and 4,000 ms so tabs never reconnect together; `POST
/api/decks/:id/ops` admits a batch of operations against `base.seq` (64 entries and 256 kB at
most, a 500 entry window behind the head, transform against what landed, the reducer and the
validator, one compare and append); `POST /api/decks/:id/presence` posts one presence state
(15 a second per client, coalesced). Both POST routes and the stream sit behind the CSRF filter of
`apps/studio/src/start.ts`: a browser passes with `Sec-Fetch-Site: same-origin`; `curl` needs the
header set by hand.

The checkpointer (`apps/studio/src/server/checkpoint.ts`) turns the stream into version records:
one record per author and contiguous run (SPEC-3 0.51), after 2 s idle, 10 s at most, 2,000
entries or 1 MB, at once for an agent's write and a named version, under the channel's checkpoint
lock; the
record carries `ops: { fromSeq, toSeq }` so a cold instance loads the document at the last
checkpoint and applies the entries after it (0.53). Comment entries ride the same run into the
sidecar (section 10) on the memory tier; on the blob tier the version log carries no
comment entries for the checkpointer to fold, so the channel writes them to the sidecar itself in
the same append (`room.ts` attaches the comments store as the channel's `applyComments`; without
it every comment write answered 400 on the previews, VERIFICATION-3 finding 6). Measured on the
dev server with the memory tier: the numbers of `docs/gslides-parity/build-3/b2.md`.

The realtime round (2026-10-01; `docs/REALTIME.md`) left these transport independent rules, which
the `do` tier builds on:

- A bearer's write over `POST /api/actions/<action>?deck=<id>` enters the deck's stream like a
  tab's POST (every tier but `blob`; every mutation but `version.restore`) with `author.kind:
'agent'`, the token's label as the name, the `x-turboslide-author` run id when present and the
  client id `agent:<principalId>`, so the open tab's banner names the agent and Cmd+Z does not
  take the write back (REALTIME.md 3.3).
- The resync rule: a stream open whose `since` is above the head, more than 2,000 behind it, or
  below the first retained entry of the stream (the trim) is answered `resync`, never a replay
  with a gap and never a hang, on every tier (a blob tier revision above the new head at the flip
  and the same case backwards at a rollback are the two hosted cases); the tab reloads once at the
  head and its pending ops replay from the pending store (REALTIME.md 3.7).

## 10. The private store and storage layout v2

Layout v1 (sections 4 and 5) is one public store: every document has a predictable public URL, and
once roles exist (SPEC-3 6) a viewer link must not be a way to read `deck.json` or `access.json`
by address (research 04 F8). Layout v2 keeps the twins on the public store, because a browser
`<img>` needs a URL, and moves every document to a private store of each environment:

| Store                                                   | Access  | Holds                                                                                                                                 |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `turboslide-decks` (one store for every environment)    | public  | `decks/<id>/assets/*` (the twins, the recipes, the dither variants), `d/<id>/<assetKey>/*`, `u/<avatarKey>/*`, `exports/`, `bundles/` |
| `turboslide-private` (production)                       | private | every other path: the deck folders' documents and the root units, `meta.json`, `migration.json`, `migration/plan.json`                |
| `turboslide-private-preview` (every preview deployment) | private | the same, for the preview                                                                                                             |

The public store is shared: production, every preview and a development checkout with
`BLOB_READ_WRITE_TOKEN` read the same objects. `sharesPublicStore(env)` (`packages/store/src/select.ts`)
is true for a preview and for anything but production that holds the public token. A deployment
that shares the public store never writes or removes a public document.

### 10.1 The code

`packages/store/src/migrate.ts` holds the layout and the migration; `blob-vercel.ts` opens the
private store from `TURBOSLIDE_BLOB_PRIVATE_TOKEN` or `TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN`.

- `splitBlobClient({ legacy, documents })` routes by path. `isPublicPath` (the twins under
  `decks/<id>/assets/` and the folders `d/`, `u/`, `exports/`, `bundles/`) always goes to the public
  store. Every other path is a document, deck folder or not, so the root units (`users/`, `links/`,
  `templates/`, `system/`, `index/`, `builds/`, `vitals/`, `decks/index.json`) move with the decks.
- The layout record is `meta.json` on the private store: `state` (`v1`, `dual` or `v2`), `frozen`
  (`since`, `settlesAt`, `expiresAt`) and `opensAt`. A document is read and written on the public
  store in `v1` and on the private store in `v2`. `dual` is the record the preview wrote on
  2026-10-11 under the migration before this one: reads go to the private store first and to the
  public store when absent there, writes go to the private store.
- The read fails closed. A failed or late read of `meta.json` (5 s deadline) fails the request with
  503 (`StorageLayoutError`) and is not cached. Only a confirmed absence on a private store that
  lists neither `meta.json` nor `migration.json` reads as `v1`; a process that once read a record
  never reads an absence as `v1`.
- The only layout cache is the 5 s one of each process (`LAYOUT_TTL_MS`). Twin keys are cached for
  10 minutes (`TWIN_KEY_TTL_MS`), which only `rekey` waits for.
- While the record is frozen, and until `opensAt`, every document put and removal throws
  `StorageFrozenError`: 503, `retry-after` 30 s and the sentence "Saving is paused while the
  documents move between stores; your changes are kept, try again in a minute". Reads go on. A
  deployment that shares the public store refuses document writes in `v1` the same way, so a
  preview saves documents only after its own switch.
- Every document put and removal carries a 90 s deadline (`DOCUMENT_WRITE_CAP_MS`), so the last
  write an instance admitted before a freeze lands inside the settle.

What the product does during a freeze:

- `writeDeck` answers a refusal as a 503 value with its name, sentence and wait in the body
  (`answeringRefusals`, `server/write.ts`), since the framework drops a thrown error's status. The
  first save of a new deck keeps the write and the edits queued behind it and sends it again after
  each wait, for up to 46 minutes, with the sentence on the snackbar (`editor/draft-retry.ts`).
- On the `do` tier the edits wait in the Durable Object's rows and its alarm sends the checkpoint
  again after a 503. The seed route answers a busy store with 503 and `retry-after`, which the
  realtime Worker does not count as the deployment failing (`deck-room.ts` `AppCallError`), so no
  tab leaves the `do` tier for it.
- A server write (`admitServerWrite`) throws a 503 refusal as it is. A thumbnail put the freeze
  refuses is skipped; the next render stores it.
- The avatar sweep refuses on a deployment that shares the public store, since its profiles do not
  name production's avatars.

The keyed twins (hardening K1#3 and K1#4, `docs/hardening/HARDENING.md` 4.1). A deck created since
K1#3 takes a random `assetKey` in its record (`newAssetKey`, packages/schema access.ts). The
deployment's client (`layoutBlobClient`) is `keyedTwinsClient` over the store: every twin path
`decks/<id>/assets/<file>` of a deck with a key of its own is read and written at
`d/<id>/<assetKey>/assets/<file>`, so the asset intake, the captures, the variants, the frames, the
copies, the pull and the removal reach the keyed place with no change of their own. A twin still at
its old place is read there until `delete` moves it. The viewer payload names
`https://<TURBOSLIDE_PUBLIC_STORE_HOST>/d/<id>/<assetKey>/` as its asset base for such a deck
(`viewerAssetBase`, server/decks.ts). On a deployment that shares the public store a twin removed by
name leaves only from under a key of the deployment's own, never from the old place and never from
under the key of the deck's public record, which production may still read.

### 10.2 The window

A migration is one run on one environment, `turboslide admin migrate-storage <step>`
(`admin.migrateStorage`, the admin's bearer), and every step but `unfreeze` takes a lease in
`migration.json`, so one call runs at a time. A call works for `--budget` seconds (120 to 240, 240
by default, under the function's 300 s) and answers.

| Step               | What it does                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan`             | Outside a freeze: the counts (public documents, bytes, the listing's time, the private store's count). Inside a settled freeze: the plan of record, every public document with its etag, in `migration/plan.json`.                                                                                                                                                                                                        |
| `freeze`           | Writes the record frozen with its state kept. `settlesAt` is 4 min 20 s out: the record's write (20 s), the layout cache (5 s), a write admitted just before (90 s), a write landing late (30 s), the listing lag (60 s) and 55 s of margin. `expiresAt` is 10 minutes after the settle.                                                                                                                                  |
| `copy`             | Every planned document, 32 requests in flight by default (`--concurrency`, 1 to 128), each a get of the planned etag and a put with `overwrite`, checked by the etag the private store answers. Tried 5 times on a 429, a 5xx or a network error. Resumes from its cursor.                                                                                                                                                |
| `verify`           | From 60 s after the copy's last put: every planned document has a private copy with the planned etag, the public store still holds the plan, and the private store holds nothing else. A verify with rows ends the freeze by itself.                                                                                                                                                                                      |
| `switch`           | One record write: `v2`, not frozen, document writes open 30 s later (`opensAt`), so no instance writes the private store while another still reads the public one.                                                                                                                                                                                                                                                        |
| `unfreeze`         | Ends a freeze and keeps the state. Takes no lease.                                                                                                                                                                                                                                                                                                                                                                        |
| `rekey`            | On `v2`, open: each deck whose private record holds no key of the environment's own gets one, its twins copied under it, then the key written. A pass clean from 12 minutes after the last key it wrote closes it; the answer's `rekeyAfter` says when to run the next pass.                                                                                                                                              |
| `verify` (on `v2`) | Names each public document a `v1` writer changed or added since the switch; `delete` keeps them.                                                                                                                                                                                                                                                                                                                          |
| `rollback`         | Production only, after the switch and before `delete`, refused while a `rekey` pass is due: freezes `v2`, then after the settle copies back to the public store every private document whose etag it lacks, and writes `v1` with writes open 30 s later.                                                                                                                                                                  |
| `delete`           | Production only, on `v2` not frozen, 3 hours after the switch, after a `verify` on `v2` and a closed `rekey`, with `--i-have-a-backup <ISO>`, the time a backup of the private store began after the switch. Moves the old twins of keyed decks under their keys (a deck keeps its old twins, with a row, until the key holds every one of them), then removes the public documents whose etag is the plan's, 50 a batch. |

Every call inside the freeze checks that the freeze is this run's, that it settled and that more
than 90 s of it is left, and moves `expiresAt` to 10 minutes after the call, never past 45 minutes
from the freeze (`FREEZE_LIMIT_MS`). A freeze whose operator stops ends by itself at `expiresAt`, so
the store is never left read only. A run that fails before the switch goes back to the state it
froze with `unfreeze`, by itself when `verify` finds rows, or at `expiresAt`. Nothing reads the
private store of a `v1` record before the switch.

On a preview the private store is a one-time snapshot of the shared public documents. Production
writes during the preview's window, so the preview's `verify` counts a planned document production
changed or removed since the plan (whatever version the copy took) in its note, and a planned
document production did not move must have the planned etag. The first copy removes nothing from
the preview's private store, and the preview's writes since 2026-10-11 to a document the public
store also holds are replaced by the public version. `rollback`, `delete` and the avatar sweep
refuse on a preview. After its switch the preview reads its own private store, and production's
later writes never reach it.

Deployments from before this code know no freeze. On a shared public store every record tells them
layout `v2`, so they write the preview's private store and remove no public document. On
production the record's `layout` equals the state, and such a deployment ignores a freeze: no older
production deployment may serve from the freeze to the end of the switch.

### 10.3 The copy, measured

`packages/store/src/migrate-copy.test.ts` copies 40,000 documents from a public fake whose reads
take 50 ms to a private fake whose puts take 200 ms (the rehearsal of 2026-10-11 measured about
200 ms per document copied one at a time against Vercel Blob), which answers 1 percent of puts with
a 429, 0.5 percent with a 5xx and every put over 48 in flight with a 429, in virtual time:

| In flight | Copy time | Calls | Per second | Retries (429s) | Rows | Verify |
| --------- | --------- | ----- | ---------- | -------------- | ---- | ------ |
| 8         | 1,331 s   | 6     | 30         | 603 (414)      | 0    | clean  |
| 16        | 668 s     | 3     | 60         | 632 (429)      | 0    | clean  |
| 32        | 333 s     | 2     | 120        | 575 (390)      | 0    | clean  |
| 64        | 218 s     | 2     | 183        | 3,269 (3,063)  | 13   | clean  |

32 is the default: twice the rate of 16 with few refusals, and 64 spends most of its calls on
429s. The window's refused writes last the settle (4 min 20 s), the plan of record's listing, the
copy (documents over the copy's rate), the listing lag (60 s), verify's listing and the 30 s after
the switch. At about 92,000 documents (the shared public store's count in the k1/ship runbook of
2026-10-13) and 120 a second that is about 19 minutes plus the two listings, which `plan`
measures, inside the 45 minute limit. The preview's
run reads the real rate in each copy answer (`perSecond`) and the real listing time (`listMs`);
production's `--concurrency` is set from it.

The race simulation (`packages/store/src/migrate-sim.ts`, `migrate-sim.test.ts` runs 200 seeds; the
reading of record runs `node packages/store/src/migrate-sim.ts <from> <to>` in four processes of
5,000 seeds) has three production and two preview instances, each with its layout cache and a
clock skewed by up to 3 s, write, remove and read while each environment's operator runs the
window, stops at a random step or ends it with `unfreeze`, and production sometimes rolls the
switch back. Every store call takes a random time, and a write past its deadline lands up to 30 s
later. Each seed checks that no accepted write is lost, no private document is read before its
switch, no instance writes a public document after the switch, every freeze ends, and no write
lands inside a closed record. 20,000 seeds on 2026-10-15: no violation, 3,153,172 writes, of
which 2,363,422 were refused by a freeze; 15,008 production switches and 10,122 production
rollbacks. That reading is of the code before the preview's `verify` counted production's writes:
1,142 preview runs then ended with verify rows because production wrote a planned document twice
during the window. The 20,000 seeds have not been read again since that change.

### 10.4 The runbook

Turning the private store on is Kevin's (no agent creates a paid resource). Since 2026-10-08 the
project `turboslide-gt` holds `turboslide-private-preview` (Preview) and `turboslide-private`
(Production), each as `TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN`, and `turboslide-backup`
(Production) as `TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN`. The preview runs the window first, then
production at a quiet hour. Every command runs from a checkout at this code, through the guard's
token wrapper, which never prints a token:

```sh
PROD=https://www.turboslide.com
URL=<the newest "deployed preview" URL of ~/.config/turboslide/gt-follow.log>   # production: URL=$PROD
OIDC=                                                                           # production: OIDC=--no-oidc
m() { node ~/.config/turboslide/with-tokens.mjs --base "$URL" --bearer-of "$PROD" $OIDC -- \
  node apps/cli/bin/turboslide.mjs admin migrate-storage "$@" --to "$URL"; }
```

Before the window: this code serves `$URL`; on production the guard's loop is stopped for the
window, so no deploy and no rollback to an older deployment happens during it; on the preview the
preview Worker's `/health` names `$URL` as its `appOrigin`.

```sh
m plan                       # the counts; listMs and the document count give the window's length
m freeze                     # note settlesAt and expiresAt
m plan                       # after settlesAt: the plan of record
while m copy --json | jq -e '.done | not' > /dev/null; do :; done
                             # each call 240 s; the loop stops on done or on a refusal
m verify                     # 60 s after the last copy; done and clean, or rows and the freeze ended
m switch                     # v2; writes open 30 s later
```

Then on `$URL`: `/decks`, an existing deck in the editor and the viewer, a share link, a template
and an export, which now read the private store.

```sh
while m rekey --json | jq -e '.done | not' > /dev/null; do :; done
                             # one pass; run another pass from the answer's rekeyAfter until it reads null
m verify                     # production: the public documents a v1 writer changed since the switch
```

The way out before the switch, at any step from `freeze` to `verify`: `m unfreeze`. If the operator
stops, the freeze ends at its `expiresAt`, at most 10 minutes after the last call. After the switch
on production, before `delete`: `m rollback` freezes `v2`, and after its `settlesAt`
`while m rollback --json | jq -e '.state != "v1"' > /dev/null; do :; done` copies back and writes
`v1`.

`delete`, on production alone, 3 hours or more after the switch (`DELETE_AFTER_SWITCH_MS`).
Until it begins `rollback` stays possible; after it the backup is the way back. The wait was a day
until Kevin cut it on 2026-10-16: production had no real saves for days, and the `v2` code ran the
guard's full walk and specs on the preview since the rehearsal. Kevin takes a full backup of the
private store after the switch, every prefix and not only what the nightly copy of section 14
holds, and checks it, then calls `delete` until it answers `done true`. A call that moves twins
answers `done false`. A refusal answers JSON with `error` and no `done`: stop. A call whose budget
ends inside the removals answers a 500 abort, which the CLI prints on stderr with nothing on
stdout: wait out its 30 s lease and call again.

```sh
while :; do
  out=$(m delete --i-have-a-backup <backup start ISO> --json)
  [ "$(jq -r .done <<< "$out" 2> /dev/null)" = true ] && break
  [ -z "$out" ] || jq -e '.error == null and .done == false' <<< "$out" > /dev/null || break
  sleep 32
done
```

Never in this runbook: a step against a deployment built before this code; `rollback`, `delete` or
`avatar-sweep` against a preview (each refuses); a removal by hand on either store. After
production's `delete`, HR-K1#5b and HR-K1#6 follow.

## 11. The runbook of the round three services

The account boundary of MILESTONES-3: no agent installs a Vercel Marketplace product, creates a paid
resource, changes DNS, registers a sending domain or signs up for a service. Every tier below is
built behind an environment switch with a fake in the tests and turns on when the variable is set.

- The realtime channel and the accounts database: the realtime Worker on Cloudflare (section 13).
  The Redis tier, the Upstash limiter and the Postgres accounts dialect (`DATABASE_URL`) left in
  hardening HR-C#8 (section 9).
- Resend: `RESEND_API_KEY` and `TURBOSLIDE_MAIL_FROM` after Kevin registers the sending domain;
  `TURBOSLIDE_MAIL=capture` on every preview writes outgoing mail to the capture store that
  `admin.mail.list` reads instead of sending.
- The private store: section 10.
- The WAF rules file (`firewall/rules.json`, B4): log mode from the ship step; enforce is Kevin's
  date (SPEC-3 11.5 R8).
- `TURBOSLIDE_AUTHORIZE`: production carried `shadow` from the R3 week on; since security hotfix
  H3 the variable changes nothing and every deployment enforces (`docs/security.md` section 2).
- Retention (SPEC-3 8.10): presence 120 s, the ops stream 24 hours and 10,000 entries, counters an
  hour at most, inboxes 500 unread and 5,000 in all, comments the deck's life with tombstones
  restorable for 30 days.

A dev server needs `TURBOSLIDE_SESSION_SECRET` (32 characters or more; every `/api/actions/*`
request derives its author from the sealed cookie, and the tmp store's export tokens need
`TURBOSLIDE_DOWNLOAD_SECRET` beside it); an obviously fake value is fine on a checkout.

Environment variables the round adds (every secret differs between preview and production). The
realtime round of 2026-10-01 and its Cloudflare phase (section 13.2) set the rows they name through
`scripts/hosting/realtime-env.mjs`, from 600 files under `~/.config/turboslide/`, names only in
its output:

| Variable                                       | Set by                                                                                                                                                                                                 | Effect                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURBOSLIDE_REALTIME`                          | you; `realtime-env.mjs flip --tier do` removes it, `rollback` sets `blob`                                                                                                                              | forces `memory`, `blob` or `do`; production forced `blob` until the Cloudflare phase's flip removed the row (13.2); the rollback switch (13.3); `redis` (removed in HR-C#8) and `do` without the three room variables are a TypeError at the first request                                     |
| `TURBOSLIDE_ROOM_HOST`                         | `realtime-env.mjs do`, plain, from `~/.config/turboslide/cloudflare.env` (`turboslide-realtime.kk23907751.workers.dev` on production, `turboslide-realtime-preview.kk23907751.workers.dev` on preview) | selects the `do` tier when nothing is forced (`select.ts`; CLOUDFLARE.md 3.6.1): the deck's Durable Object on the Worker is the channel and the presence; the CSP `connect-src` gains its `https://` and `wss://`; on a checkout `127.0.0.1:87<lane>` with `TURBOSLIDE_ROOM_INSECURE=1` (13.7) |
| `TURBOSLIDE_ROOM_SECRET`                       | `realtime-env.mjs do`, sensitive, from `room.env` (600, `openssl rand -hex 32`); the same value on the Worker's secrets (`worker-secrets`)                                                             | the HMAC key of the room ticket the editor loader mints and the Worker verifies before a socket reaches an object (CLOUDFLARE.md 3.3)                                                                                                                                                          |
| `TURBOSLIDE_ROOM_BEARER`                       | the same, from `room.env`; the same value on the Worker's secrets                                                                                                                                      | the bearer of the function's calls to the Worker and of the object's calls to the function (the checkpoint and seed routes); `docs/security.md` section 12 has its reach and rotation                                                                                                          |
| `TURBOSLIDE_ACCOUNTS`                          | `realtime-env.mjs database`, plain: `d1`                                                                                                                                                               | the accounts database is D1 behind the Worker's bearer routes (CLOUDFLARE.md 4.2; `auth/db.ts`); needs the host and the bearer; without it the Sign in row is absent (`NO_DATABASE_NOTICE`)                                                                                                    |
| `TURBOSLIDE_BLOB_PRIVATE_TOKEN`                | the private store; the dashboard's connection names it `TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN`, which the studio reads too                                                                          | layout v2: documents in the private store through `layoutBlobClient` (section 10)                                                                                                                                                                                                              |
| `TURBOSLIDE_BLOB_PRIVATE_DIR`                  | you, a checkout                                                                                                                                                                                        | a folder as the private store for a migration rehearsal                                                                                                                                                                                                                                        |
| `BETTER_AUTH_SECRET`                           | `realtime-env.mjs database` mints and sets it, one value per environment, into `~/.config/turboslide/better-auth.env`                                                                                  | the account sessions (B3)                                                                                                                                                                                                                                                                      |
| `TURBOSLIDE_SESSION_SECRET`                    | you                                                                                                                                                                                                    | seals the anonymous principal cookie; 32 characters or more, `openssl rand -hex 32`                                                                                                                                                                                                            |
| `RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`       | you, after the domain; `realtime-env.mjs mail` from `mail.env`                                                                                                                                         | the mail sender (B3)                                                                                                                                                                                                                                                                           |
| `TURBOSLIDE_MAIL`                              | you; `realtime-env.mjs mail`                                                                                                                                                                           | `capture` on previews; `off` on production until the Resend pair exists, which hides the email field so Google may be the one method (REALTIME.md 4.1, default 7.7)                                                                                                                            |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`     | you                                                                                                                                                                                                    | the GitHub sign in (B3)                                                                                                                                                                                                                                                                        |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`     | `realtime-env.mjs google` from `~/.config/turboslide/google-oauth.env` (Kevin writes it, 4.5 steps 3 and 4)                                                                                            | the Google sign in (the realtime round, REALTIME.md 4.1; R4's `auth/better-auth.ts`): the redirect URI `<origin>/api/auth/callback/google`, the scopes `openid email profile`, `prompt=select_account`, no offline access                                                                      |
| `TURBOSLIDE_AUTH_HOSTS`                        | you, when a deployment owns a host off the default list                                                                                                                                                | the Host names better-auth's `baseURL.allowedHosts` accepts; the default list is `www.turboslide.com`, `turboslide.com`, `turboslide.vercel.app`, `localhost:*`, `127.0.0.1:*` (REALTIME.md 4.1; R4)                                                                                           |
| `TURBOSLIDE_ADMIN_EMAILS`                      | `realtime-env.mjs google` (`kevin@generaltranslation.com` by default)                                                                                                                                  | the deployment admins; the first sign in with a listed address is the admin (`auth/profile.ts` `adminEmails`)                                                                                                                                                                                  |
| `TURBOSLIDE_BUILD_COMMIT`                      | the guard, per deployment (`-e` and `--build-env`)                                                                                                                                                     | the commit a CLI deployment serves, read by `/api/agent` (`server/build-commit.ts`); a CLI deployment carries no `VERCEL_GIT_COMMIT_SHA`                                                                                                                                                       |
| `TURBOSLIDE_DOWNLOAD_SECRET`                   | you                                                                                                                                                                                                    | required on every hosted environment, 16 bytes or more (section 5's table)                                                                                                                                                                                                                     |
| `TURBOSLIDE_AUTH_DB`                           | you, a checkout                                                                                                                                                                                        | `node:sqlite` accounts on a checkout                                                                                                                                                                                                                                                           |
| `TURBOSLIDE_AUTHORIZE`                         | nobody: ignored since security hotfix H3                                                                                                                                                               | every deployment refuses every denial; a value other than `enforce` (production carries `shadow`) is logged once as ignored (`docs/security.md` section 2)                                                                                                                                     |
| `TURBOSLIDE_MISSING_RECORD`                    | you, a checkout                                                                                                                                                                                        | what a deck without `access.json` means on a checkout's file store (`open`, the default, or `notFound`); a hosted store ignores it and gives such a deck the seed, creator or closed record (`docs/security.md` section 2, H3)                                                                 |
| `TURBOSLIDE_TRUST_PROXY`                       | you                                                                                                                                                                                                    | trusts the platform's client address header (B4)                                                                                                                                                                                                                                               |
| `TURBOSLIDE_LOCAL_OPEN`                        | a checkout's tests                                                                                                                                                                                     | the localhost open rule for the test runs only                                                                                                                                                                                                                                                 |
| `TURBOSLIDE_LOCAL_TOKEN`                       | you, a checkout                                                                                                                                                                                        | `require` makes the localhost agent surface take the token of `.turboslide/token` (B3)                                                                                                                                                                                                         |
| `TURBOSLIDE_AUTH_RATE_LIMIT`                   | a checkout's tests                                                                                                                                                                                     | `off` turns the library's sign in limiter off for a spec run; ignored hosted                                                                                                                                                                                                                   |
| `TURBOSLIDE_CSP`                               | you                                                                                                                                                                                                    | `report` (default) sends the nonce CSP as report only; `enforce` after the report weeks; `off`                                                                                                                                                                                                 |
| `TURBOSLIDE_EGRESS`, `TURBOSLIDE_WEB_SECURITY` | you                                                                                                                                                                                                    | the capture browser's egress denial and `strict` web security (B4, docs/security.md)                                                                                                                                                                                                           |
| `TURBOSLIDE_PUBLIC_STORE_HOST`                 | you, hosted                                                                                                                                                                                            | the public store's host for the CSP's `img-src` (B4)                                                                                                                                                                                                                                           |

## 12. Round four: the CDN rules, the thumbnail cache, the seed twins and the native addon

The Google Slides parity round four (`docs/archive/gslides-parity/SPEC-4.md` sections 0.13, 0.31, 0.35,
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

## 13. The `do` tier: the realtime Worker on Cloudflare (the realtime round's Cloudflare phase, 2026-10-01)

Kevin, 2026-10-01, after reading `docs/REALTIME.md`: "access all of these from my google to set
this up yourself, and we should use cloudflare instead of vercel stuff for free". `docs/CLOUDFLARE.md`
is the binding design and this section is its runbook. The realtime channel and the presence move
to one Cloudflare Worker, `turboslide-realtime` on `turboslide-realtime.kk23907751.workers.dev`,
holding one SQLite backed Durable Object per deck (`DeckRoom`, bound as `DECK_ROOM`) over
hibernating WebSockets; the accounts database is D1 (`turboslide-accounts`, bound as `ACCOUNTS`) on
the same Worker, reached from the Vercel function through the Worker's bearer routes `POST
/db/query` and `POST /db/batch`; the app, the store and the version log stay on Vercel and Vercel
Blob. No Upstash, no Neon, no `REDIS_URL`, no `DATABASE_URL`, ever (CLOUDFLARE.md 4.4); the redis
tier of section 9 was never deployed (5.1) and left the tree in hardening HR-C#8. The preview Worker is
`turboslide-realtime-preview` on `turboslide-realtime-preview.kk23907751.workers.dev`, the second
Worker the preview environment of the same `apps/realtime-worker/wrangler.jsonc` makes, with its
own object namespace and its own D1 (`turboslide-accounts-preview`). The account is Kevin's own,
on Workers Free; the account id, the `workers.dev` subdomain (`kk23907751`, the account's existing
one, never changed), the two D1 ids and the two hosts are in `~/.config/turboslide/cloudflare.env`
(600; none of them a secret).

### 13.1 The selection and what the object holds

`selectRealtime(env)` (`packages/realtime/src/select.ts`, R1) gains the `do` tier:

| Environment                                                                            | Tier     | Change feed                                                                                                                                                                                                                                                                                                                  | Presence                                                                                                                              |
| -------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| a checkout, the tests                                                                  | `memory` | in process                                                                                                                                                                                                                                                                                                                   | in process                                                                                                                            |
| `TURBOSLIDE_ROOM_HOST` set, with `TURBOSLIDE_ROOM_SECRET` and `TURBOSLIDE_ROOM_BEARER` | `do`     | one WebSocket per tab to the deck's object; the object assigns the seq, transforms each entry past what landed, writes it to its SQLite before the ack and fans it out per reader; its alarm posts the uncommitted entries to `POST /api/decks/:id/checkpoint` on the app, which writes the version records to Blob as today | the object's roster, in memory while awake and in each socket's attachment while hibernated; volatile frames published and not stored |
| hosted without a channel                                                               | `blob`   | section 4; the fallback of a deployment without the host, of the `realtime` flag set off and of a Cloudflare incident                                                                                                                                                                                                        | per instance only; the title row says so                                                                                              |
| `TURBOSLIDE_REALTIME=memory\|blob\|do`                                                 | forced   | as above; `do` forced without the three variables is a TypeError at the first request, like `redis` since HR-C#8                                                                                                                                                                                                             | as above                                                                                                                              |

Unforced, `TURBOSLIDE_ROOM_HOST` selects `do`, so a server that wants
the Worker's database with a local channel forces `TURBOSLIDE_REALTIME=memory` (CLOUDFLARE.md 2.1's
hand row). `TURBOSLIDE_ACCOUNTS=d1` selects the accounts kind (`auth/db.ts`), needs the host and
the bearer, and says nothing about the channel's tier.

What the object holds (CLOUDFLARE.md 3.4 and 3.6.2): `meta` (one row: `head`, `covered`,
`revision`, the checkpoint times, the months), `entries_<yyyymm>` (the ordered entries, with a
unique index on `(client_id, op_id)` for the dedupe; a month's table is dropped once `covered`
passes its last seq and it is older than the replay window, so no hot path deletes rows), `doc`
(one row per slide and one for the manifest while the deck has a socket or an uncommitted entry,
dropped as a table at the last close). The version log stays `versions/<n>.json` on Blob, written
by the checkpoint route alone with `origin` on every record and `force: true` as the lease skip;
the manifest put with `ifMatch` stays the store's one commit point. The only copy window is the
checkpoint interval: 2 s idle and 10 s under typing by default (`TURBOSLIDE_CHECKPOINT_IDLE_MS`,
`TURBOSLIDE_CHECKPOINT_MAX_MS`, the Worker's `vars`), at most 2,000 entries or 1 MB, at once for an
agent write, a `version.save` and the last socket's close. A woken object answers the hello, the
replay and presence from the `meta` row and the entries, and rebuilds the live document from the
`doc` rows and the entries above `covered` on the first thing that needs it; an object with no
rows reads the seed route `GET /api/decks/:id/seed` under the bearer (the store's document at the
last checkpoint, the revision, the covered seq).

The two secrets both hosts hold, the same two values on the Vercel environments and on the
Worker's secrets: `TURBOSLIDE_ROOM_SECRET` (the HMAC key of the room ticket the editor loader
mints and the Worker verifies before a socket reaches an object, CLOUDFLARE.md 3.3) and
`TURBOSLIDE_ROOM_BEARER` (the bearer of the function's calls to the Worker, `/rooms/:id/*`,
`/db/*`, `/control/*`, and of the object's calls to the function, the checkpoint and seed routes).
`docs/security.md` section 12 has their reach and rotation; `TURBOSLIDE_TOKEN` never reaches the
Worker. Since AUTH-3 (13.8) each environment holds its own values, and the Worker's `/db` routes
take a third secret, `TURBOSLIDE_DB_BEARER`, in place of the room bearer.

### 13.2 The runbook: turning the tier on (CLOUDFLARE.md 3.7 and section 6)

The order never breaks a deployment: `select.ts` reads the host only when nothing is forced, and
the forced `TURBOSLIDE_REALTIME=blob` row stands until the flip. Every step on Vercel runs through
`node scripts/hosting/realtime-env.mjs <subcommand>` from a root linked to `turboslide-gt`
(`scripts/hosting/README.md`): values from 600 files under `~/.config/turboslide/`, names only in
the output, `--dry-run` to see the plan first. A remote `wrangler` command is the integrator's for
the preview environment and the ship step's for production, by the round's rules. The account
steps are the orchestrator's in Kevin's Google session with the stops of section 6 (an account
creation, a payment, a terms checkbox or a DNS change ends the run); the project setting of step 7
and the Google console's checkboxes are Kevin's. State on 2026-10-01: steps 1 to 3 done; the
Vercel variables of step 5 set by the orchestrator before the Merge phase with the forced `blob`
row standing; the Worker not yet deployed; the Google client not yet created.

1. The account (section 6 steps 1 to 5, 7 and 8): Kevin's own Cloudflare account on Workers Free;
   `pnpm exec wrangler login --browser=false --use-keyring` under Kevin's instruction, the scope
   list reported before Allow and recorded in the ship note; the account's existing `workers.dev`
   subdomain `kk23907751` (another Worker of Kevin's lives on it and is never touched); the id,
   the subdomain and the hosts in `cloudflare.env`. [The ship step writes the scope list.]
2. The databases (step 9): `pnpm exec wrangler d1 create turboslide-accounts --location=enam` and
   `turboslide-accounts-preview` the same way; the two ids in `apps/realtime-worker/wrangler.jsonc`
   (production's in the top level `d1_databases`, the preview's under `env.preview`). Done
   2026-10-01.
3. The secrets (step 10): `openssl rand -hex 32` twice into `~/.config/turboslide/room.env`
   (`TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_ROOM_BEARER`) and once per environment into
   `better-auth.env` (`BETTER_AUTH_SECRET_PRODUCTION`, `BETTER_AUTH_SECRET_PREVIEW`), mode 600.
   Done 2026-10-01.
4. The Worker (steps 11 and 12), per environment in this order: `realtime-env.mjs worker-migrate
[--env preview]` (`wrangler d1 migrations apply <database> --remote`: the control tables `rt_open`
   and `rt_flags` and the `realtime = on` row of `apps/realtime-worker/migrations/0001_control.sql`);
   `pnpm exec wrangler deploy [--env preview] --var TURBOSLIDE_BUILD_COMMIT:<sha>` from
   `apps/realtime-worker` (the first deploy provisions the `DeckRoom` namespace; `pnpm exec wrangler
deploy --dry-run [--env preview]` validates the configuration and the bundle first, which R6 ran on
   2026-10-01 against a stub that exports the class); `realtime-env.mjs worker-secrets [--env
preview]` (the two secrets piped from `room.env` into `wrangler secret put`, one at a time; each put
   deploys a new version); then `GET https://<host>/health` must answer `{ ok: true, protocol: 1,
commit: <sha>, realtime: 'on', appOrigin }` with `appOrigin` `https://www.turboslide.com` on
   production and empty on the preview (a gate sets it per Vercel preview deployment with `--var
TURBOSLIDE_APP_ORIGIN:<url>`). `realtime: 'unset'` means the migration has not run; the router
   refuses upgrades with 4503 until it has. [The ship step writes both `/health` readings and the
   Version IDs here.]
5. The Vercel variables (step 14), with the forced `blob` row standing: `realtime-env.mjs do`
   (reads `/health` on both Workers first, then `TURBOSLIDE_ROOM_HOST` plain and the two secrets
   sensitive on production and preview); `realtime-env.mjs database` (`TURBOSLIDE_ACCOUNTS=d1` and
   `BETTER_AUTH_SECRET`); `realtime-env.mjs google` once `google-oauth.env` exists
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURBOSLIDE_ADMIN_EMAILS`); `realtime-env.mjs mail`
   (nothing without `mail.env`: `TURBOSLIDE_MAIL` stays `off`, the email field hides and Google is
   the one method, REALTIME.md default 7.7). The next main deploy reads the host and stays on
   `blob`. `realtime-env.mjs status` reports the names per environment and the four that must be
   absent (`REDIS_URL`, `DATABASE_URL`, the Upstash pair). [The ship step writes `vercel env ls`'s
   names per environment on the day.]
6. The Google client (step 13): the Google Cloud project `Turboslide` and the Web application
   client `Turboslide web` with the four origins (`https://www.turboslide.com`,
   `https://turboslide.com`, `https://turboslide.vercel.app`, `http://localhost:4321`) and the four
   redirect URIs (each followed by `/api/auth/callback/google`), in Kevin's Google session with
   the stops of section 6 (a terms checkbox is a stop); the id and the secret into
   `~/.config/turboslide/google-oauth.env` (600), never into a chat. The accounts turn on at the
   next deploy after `realtime-env.mjs google`; `accounts.google-roundtrip` is read by hand first on
   `http://localhost:4321` with `TURBOSLIDE_ACCOUNTS=d1`, the preview Worker's host and bearer and
   `TURBOSLIDE_REALTIME=memory` forced (an unforced host would select `do` against a Worker whose
   `TURBOSLIDE_APP_ORIGIN` cannot reach `localhost`), then on `www.turboslide.com` after step 9.
7. The preview protection bypass (step 15, Kevin): Protection Bypass for Automation on the Vercel
   project, the generated secret into `~/.config/turboslide/vercel-bypass.env`
   (`VERCEL_AUTOMATION_BYPASS_SECRET=`, 600), then `realtime-env.mjs worker-secrets --env preview`.
   Without it the object cannot read the seed route or post its checkpoints to a Vercel preview
   behind Deployment Protection, and the hosted realtime rows are read on the local two process
   run and on production after the flip (CLOUDFLARE.md 5.5 item 2); the guard's three realtime
   rows read red on a preview until it exists (13.6).
8. The gates (5.5): the local run of every lane on the memory tier and the two process `do` run
   (13.7); the one hosted gate, Vercel first because the Worker's variable is the URL that deploy
   mints: one Vercel preview with `-e TURBOSLIDE_REALTIME=do -e TURBOSLIDE_ROOM_HOST=<the preview
Worker> -e TURBOSLIDE_ACCOUNTS=d1 -e TURBOSLIDE_MAIL=capture ...` and the secrets through the
   wrapper, then `pnpm exec wrangler deploy --env preview --var TURBOSLIDE_APP_ORIGIN:<that url>
--var TURBOSLIDE_BUILD_COMMIT:<sha>`, then `/health` on the preview Worker answering the sha and
   that URL before a row runs; narrowed to the rows only a deployment can read; a second
   deployment of the same tree with `-e TURBOSLIDE_REALTIME=blob` for the fallback rows. The
   account's daily Durable Object and Worker counters are read from the dashboard before and
   after (`setup.free-plan.caps`, 13.5). [The ship step writes the ledgers and both counters.]
9. The flip (step 16; 3.7 item 4): `realtime-env.mjs flip --tier do` (requires the three room
   variables on both environments, removes the forced `TURBOSLIDE_REALTIME` row on both, writes
   `scripts/hosting/production.json` to `do`), the commit and the push through the guard, which
   deploys the Worker before the app on that push and holds the sha while `TURBOSLIDE_ROOM_HOST` is
   absent from production's names (13.6). The next production deployment selects `do`. A deck on
   the blob tier opened by the new tier has records and a manifest and no object: the first
   socket creates the object, which reads the seed route before its first hello, so the order
   starts at the store's revision with `head = covered` (0 on a blob tier deck; the seq and the
   revision are two numbers). A tab of the previous deployment whose last hello said `blob`
   resyncs once at `hello.revision` (the `helloTier` rule) and its pending ops replay; a tab older
   than that deployment reads Reconnecting until it is reloaded by hand (the class the ship note
   names). The production table is read once after the alias moves (`--base
https://www.turboslide.com --tier do`); Kevin signs in once on `www.turboslide.com`, the badge is
   read on a second browser, the scratch deck is removed by id. [The ship step writes the time of
   the flip, the sha and the table.]
10. DNS: nothing (step 17). The Worker stays on `workers.dev` until Kevin moves a record
    (CLOUDFLARE.md section 8 question 2); R2 for the store and the app on Workers are stage 2
    (section 7), each behind a stop of Kevin's.

Two deployments serve one deck during the alias switch: a blob instance writes records straight to
the store while the object orders and the checkpoint route commits; the object's next checkpoint
meets the moved manifest and takes the re-admission path (CLOUDFLARE.md 3.5: the document reloaded
from the seed route at the new revision, its entries above `covered` re-admitted from their
original mutations transformed past the foreign records, committed at once, an external
checkpoint published so every tab reloads once and re-offers its pending ops, dropping what the
records' `origins` name). The window is the seconds of the switch. [The ship step records what it
saw.]

### 13.3 The rollback switch (CLOUDFLARE.md 3.8)

`TURBOSLIDE_REALTIME` keeps its meaning with the values `memory`, `blob` and `do`.
Production after the flip has no forced row and selects `do` from `TURBOSLIDE_ROOM_HOST`. Four ways
back, from the fastest:

1. No deploy: `realtime-env.mjs do-flag off` posts `/control/flags { realtime: 'off' }` on the
   Worker under the room bearer and reads it back (the hand fallback, the ship step's: `pnpm exec
wrangler d1 execute turboslide-accounts --remote --command "update rt_flags set v='off' where
k='realtime'"` from `apps/realtime-worker`). The router reads it within 30 s and refuses upgrades
   with 4503; every awake object flushes its tail through the checkpoint route and closes its
   sockets with 4503; a hibernated object has nothing uncommitted older than its pending alarm;
   the tabs ask the ticket route, read `blob` once the instance's `/health` probe (60 s cache) has
   read it, and come back on Server-Sent Events over the blob channel built in process. `do-flag
on` hands back and the tabs resync once. [R1 verifies the path on the local run and the ship step
   on the preview; the reading goes here.]
2. The drain and the forced row: `realtime-env.mjs drain` (`GET /control/open`, then `POST
/rooms/:id/flush` per open deck, so no acknowledged entry is left in an object's SQLite with no
   committer), then `realtime-env.mjs rollback` (`TURBOSLIDE_REALTIME=blob` on production and
   preview with `--force`, `production.json` to `blob`), the commit and the guard's next pass. The
   Worker stays deployed. A tab on the `do` JavaScript keeps its socket until the object's next
   checkpoint lands on a route whose instance now serves `blob`; the route commits whatever the
   tier and answers `tier: 'blob'`; the object publishes `resync` and closes; the tabs reload onto
   the blob deployment and the SSE transport. Nothing acknowledged is lost.
3. Vercel's Instant Rollback (`vercel rollback --scope general-translation --yes`, or `vercel
promote <previous production url>`) to the guard's previous production deployment, built with the
   forced `blob` row; the same object behaviour as item 2, after the drain. `~/.config/turboslide/README.md`
   "Rolling back by hand" has the steps and the hold that stops the loop redeploying the sha; the
   guard itself redeploys the previous sha's Worker beside its promote back (13.6).
4. The Worker unreachable (a Cloudflare incident): each instance's `GET /health` probe (60 s cache)
   reads off, or fails three times, and hands the instance's rooms to the blob channel built on
   demand (room.ts `ensureRealtimeTier`); the ticket route answers `blob`; a tab's transport
   falls to SSE after 30 s of failed opens and resyncs once; the object's tail commits on its next
   alarm whether or not it can reach Vercel at that moment (alarms are at least once, with
   exponential backoff from 2 s up to 6 times); when the Worker returns the next hello says `do`,
   the tabs resync, and the re-admission path absorbs what the blob instances committed meanwhile.
   A Cloudflare incident degrades the deck to the blob tier's lag and loses nothing.

### 13.4 The failure modes (CLOUDFLARE.md 3.8)

| Failure                                                        | What happens                                                                                                                                                                                                                                                                                                  | Where                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| The checkpoint route refuses or times out                      | the alarm handler throws; alarms retry with exponential backoff from 2 s up to 6 times; the entries stay in SQLite; the sockets stay open; a 25 s `AbortSignal` bounds each attempt                                                                                                                           | `deck-room.ts` `alarm`                                |
| A moved manifest under the commit                              | `{ conflict, revision }`, the re-admission path of 3.5                                                                                                                                                                                                                                                        | the checkpoint route, `deck-room.ts`                  |
| The Free plan's daily cap passed                               | the operation class fails with an error for the rest of the UTC day; every realtime row reads red; the hand off of 13.3 item 4 puts the tabs on the blob tier; `cost.do.rows-written`'s threshold is the early warning (13.5)                                                                                 | `docs/FOCUS.md` 6.2: a stop                           |
| A stranger spends the Worker's daily cap                       | the same cutoff on upgrades (a request counts before the ticket is verified); the Paid plan removes it; a WAF rule needs a zone the account does not hold                                                                                                                                                     | CLOUDFLARE.md section 8 question 3                    |
| A presence flood                                               | the per client budget drops frames past 15 a second; volatile frames are published and not stored                                                                                                                                                                                                             | `deck-room.ts`                                        |
| A late alarm                                                   | alarms are at least once; how late one may fire is on no page read; a late alarm widens the only copy window of 13.1                                                                                                                                                                                          | `deck-room.ts`                                        |
| The D1 route refuses or times out                              | the Kysely dialect throws a store error; `requestIdentity`'s account branch falls to anonymous for that request after one retry; the anonymous branch needs no database; the per instance session facts cache covers 300 s                                                                                    | `d1-proxy-dialect.ts`, `identity.ts`                  |
| A deployment with the host set and no Worker                   | the probe reads off within 60 s and the instance serves `blob`; until then the loader hands out tickets to a socket that cannot open and the tab waits on its ladder; 13.2 deploys the Worker and reads `/health` before any Vercel variable names it                                                         | `realtime-env.mjs do` refuses until `/health` answers |
| An isolate over 128 MB (several open documents on one isolate) | the runtime finishes the in flight requests and starts a new isolate; the objects wake again on the next frame from their rows and nothing acknowledged is lost; `setup.do.memory` reads the case on the preview and CLOUDFLARE.md 3.6.2 names the fallback                                                   | `deck-room.ts`; CLOUDFLARE.md 2.3                     |
| The control tables missing or the `realtime` row unset         | upgrades refused with 4503, `/health` answers `realtime: 'unset'`, `setup.worker.health` red, the tabs on the blob tier; the fix is `realtime-env.mjs worker-migrate [--env preview]`                                                                                                                         | CLOUDFLARE.md 3.6.2                                   |
| The Worker's version and the app's commit differ               | a newer Worker verifies an older app's tickets through the ticket's `v` window and the frames' optional fields, so the guard deploys the Worker first (13.6); `/health`'s `commit` against the deployment's `TURBOSLIDE_BUILD_COMMIT` is `setup.worker.health`'s reading and a skew is named in the ship note | CLOUDFLARE.md 5.6 item 5                              |

### 13.5 The Free plan caps and the cadence switch (CLOUDFLARE.md 1.3 and 2.2)

The caps are the account's and daily, shared by the production Worker and the preview Worker
(the pricing pages as CLOUDFLARE.md 1.3 cites them, read 2026-10-01): Durable Object requests
100,000, rows written 100,000 (a `setAlarm` and a delete each count as one), duration 13,000 GB-s,
rows read 5 million, SQL storage 5 GB in all; Worker requests 100,000 (both environments, one
account; 10 ms of CPU per invocation); D1 rows read 5 million and rows written 100,000 a day. "If
you exceed any one of the free tier limits, further operations of that type will fail with an
error"; the day resets at 00:00 UTC. At 50 editor hours a day the largest line is the object's
rows written at 28,800 to 36,000 (29 to 36 percent), then object requests at 12 percent, duration
at 5 percent, Worker requests at 6 to 9 percent, D1 under 1 percent; the Cloudflare bill is $0.00
and the Vercel residual of the channel (the checkpoint route and the Blob records) is about $7 a
month on the Pro seat. The break day is 139 to 174 editor hours a day at the default cadence (116
to 139 if `DROP TABLE` turns out to count rows written, which R1's day 0 probe reads), and 347 to
379 at the 10 s and 30 s cadence.

The cadence switch: `TURBOSLIDE_CHECKPOINT_IDLE_MS` and `TURBOSLIDE_CHECKPOINT_MAX_MS` in
`apps/realtime-worker/wrangler.jsonc`'s `vars` (2000 and 10000 today, both environments), set to
10000 and 30000 and redeployed; a Version history row then covers a run of up to 30 s and a commit
lands 10 s after the last keystroke (CLOUDFLARE.md section 8 question 7, Kevin's). The thresholds:
a production day over 25,000 rows written flips the switch in the next ship; a day over 50,000
holds the next ship until Kevin decides on Workers Paid ($5.00 a month, which removes the daily
cutoff and makes a stranger's 100,000 requests $0.03 instead of a red day; the purchase is his
click and whether it asks for a payment method was read on no page). The readings: `GET
/rooms/:id/counters` under the bearer (`rowsWritten` summed from the object's cursors), `GET
/db/counters`, the dashboard's Durable Objects, Workers and D1 metrics; the ship note records the
account's daily counters before and after the one hosted gate and on the day of the flip.
[The ship step writes the dashboard's figures and the preview's `cost.do.*`, `cost.d1.*` and
`cost.worker.requests` readings here.]

### 13.6 The guard (CLOUDFLARE.md 5.6)

`~/.config/turboslide/gt-follow.sh` gains the Worker step through
`docs/gslides-parity/cloudflare/build/guard.patch`, applied by the ship step after R5's push and
before R1's (`scripts/hosting/README.md` "The guard patch" has the apply protocol and the check
script's readings). Per push: after the Vercel preview deploy, when the tree's
`scripts/hosting/production.json` expects `do` or the push touched `apps/realtime-worker/**`,
`packages/realtime/src/room-core.ts` or `frames.ts`, the preview Worker is deployed with the
preview URL as its app origin and `/health` must answer the sha and that URL before a row runs;
the three two browser rows `realtime.title.two-typers`, `realtime.caret.within-300ms` and
`realtime.join.chip-within-1s` join the seller path only when the matrix carries them, the tree
expects `do` and the deployment's environment names carry `TURBOSLIDE_ROOM_HOST`; on green a tree
that expects `do` is held while `TURBOSLIDE_ROOM_HOST` is absent from production's names, else the
production Worker deploys first (`pnpm exec wrangler deploy --env "" --var
TURBOSLIDE_BUILD_COMMIT:<sha>`), `/health` must answer the sha, then the Vercel production deploy
runs as today; on a red production smoke the previous sha's Worker is redeployed beside the
promote back. A docs-only push leaves the Worker alone. The guard's worktree needs the Worker's
dependencies once (`pnpm install --frozen-lockfile` in `/Users/kevinliu/repos/Turboslide-vector`
after it has checked out a sha with `apps/realtime-worker`) and the keyring credential of
`wrangler login`.

### 13.7 A checkout (CLOUDFLARE.md 5.4)

`pnpm exec wrangler dev --port 87<lane digit>` in `apps/realtime-worker` runs the Worker, the
object and the D1 simulated locally (workerd); `.dev.vars` (600, ignored by git) carries test
values of `TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_ROOM_BEARER`, `TURBOSLIDE_DB_BEARER` (13.8; the
node servers take the same three) and `TURBOSLIDE_APP_ORIGIN=http://127.0.0.1:<the
first node port>`; `realtime-env.mjs worker-migrate --local` makes the control tables, the
accounts tables and the schema's version row in the local D1 before the first run (without the
row the accounts read anonymous: `/db` refuses the boot's schema statements); alarms may fail
after a hot reload, so the Worker is restarted rather than edited live. The Worker's tests carry
their own test secrets (`vitest.config.ts`) and need no `.dev.vars`. The two process run is two node servers (`apps/studio/.output/server/index.mjs`
after one `scripts/check.mjs` build) on the lane's two ports over one `TURBOSLIDE_STORE=tmp
TURBOSLIDE_OVERLAY_DIR=<folder>` with `TURBOSLIDE_REALTIME=do TURBOSLIDE_ROOM_HOST=127.0.0.1:87<lane>
TURBOSLIDE_ROOM_INSECURE=1` (the socket is `ws://` instead of `wss://`) and the same two test
secrets, plus `TURBOSLIDE_ACCOUNTS=d1 TURBOSLIDE_MAIL=capture` for the account rows; A's browser
context on the first port and B's on the second, so one object orders both and the object's seed
and checkpoint callbacks go to the first port. The Worker's own tests run under
`@cloudflare/vitest-plugin` (`pnpm --filter @turboslide/realtime-worker test`); the e2e server of
`scripts/check.mjs` keeps `TURBOSLIDE_REALTIME=memory` and `TURBOSLIDE_AUTH_DB`. The configuration
alone is checked with `pnpm exec wrangler deploy --dry-run [--env preview]` from
`apps/realtime-worker`, which bundles and prints the bindings without an upload.

The gate's flags of this phase (R5, `scripts/probes/core-gate.mjs`): `--tier do` (recorded in the
ledger and passed to the cost probe), `--only setup` (implies `do`: the health read, the two
instance spec row and the two hand rows), `--second-base <origin>` (B's origin, handed to the two
browser spec as `PLAYWRIGHT_SECOND_BASE_URL` and `REALTIME_BASES`), `--room-host <host>` (else
`TURBOSLIDE_ROOM_HOST`; the room bearer is `TURBOSLIDE_ROOM_BEARER` in the environment the wrapper
sets, never a flag), `--known-skew <sha>` (a Worker commit the ship note names as a known skew for
`setup.worker.health`), `--caps-before <json>` and `--caps-after <json>` (the dashboard's
`{ readAt, doRequests, doRowsWritten, workerRequests }` for `setup.free-plan.caps`),
`--memory-reading <json>` (the verifier's `{ result, reason, measure }` for `setup.do.memory`) and
`--cost-dashboard <json>` (the hour's `{ readAt, doDurationGbs, workerRequests, ... }` for the cost
probe). The production table of 13.2 step 9 is `node scripts/probes/core-gate.mjs --base
https://www.turboslide.com --tier do --room-host turboslide-realtime.kk23907751.workers.dev`; the
guard's three realtime rows need no new flag.

### 13.8 The accounts database bearer and the secrets per environment (AUTH-3, 2026-10-08)

AUTH-3 (`docs/hardening/research/auth-verify.md`, severity 3): the Worker's `POST /db/query` and
`POST /db/batch` ran any SQL on the accounts D1 under the room bearer, the `session` table holds
the session token in plain text, and one ticket secret and one room bearer served both
environments from one `room.env`, so a leak from any preview build reached production's accounts.
Kevin approved the setting changes on 2026-10-08 ("Yes, do it"). Since this change:

- Each environment holds three secrets of its own: `TURBOSLIDE_ROOM_SECRET` (the ticket key),
  `TURBOSLIDE_ROOM_BEARER` (the room and control routes, both directions) and
  `TURBOSLIDE_DB_BEARER` (the Worker's `/db/query` and `/db/batch`). `room.env` keeps them as
  `<NAME>_PRODUCTION` and `<NAME>_PREVIEW`. The unsuffixed pair is the shared pair of before:
  production's values until its rotation ends, never sent to the preview (`realtime-env.mjs`
  refuses with exit 2, and refuses a database bearer equal to its environment's room bearer).
- The Worker takes the database bearer alone on `/db` once it holds one. Without one it takes the
  room bearer and logs `db.bearer.fallback` once per isolate, which is how production runs until
  step 3 below. `/health` answers `db` (`own`, `rotating` or `fallback`) and `statements`
  (`enforce` or `report`), never a value.
- `/db` runs only the statements of `apps/realtime-worker/src/db-statements.json`. Anything else
  answers 403 `statement_not_allowed` and logs `db.statement.refused` with the first 12 hex
  characters of the text's SHA-256. A new statement of the accounts code is recorded with
  `TURBOSLIDE_RECORD_STATEMENTS=write node_modules/.bin/vitest run
apps/studio/src/server/auth/record-statements.test.ts` and committed with the code that sends
  it. The hand switch for a statement the recording missed: `pnpm exec wrangler secret put
TURBOSLIDE_DB_STATEMENTS [--env preview]` from `apps/realtime-worker` with the value `report`
  on stdin. The Worker then runs an unlisted statement and logs `db.statement.unlisted`; delete
  the secret once the list carries the statement. `/db` refuses every schema statement: a schema
  change is a wrangler migration (`realtime-env.mjs worker-migrate [--env preview]`) that also
  writes the `ts_schema` row, applied on both databases before the push that needs it.
- A rotation never refuses a call. The receiver of a secret also takes a second value, its
  `<NAME>_PREVIOUS`, for the window of the rotation: the Worker for all three, and the app for the
  room bearer, which both hosts send. `/health` `db: rotating` says the Worker's window is open;
  `realtime-env.mjs status` names `TURBOSLIDE_ROOM_BEARER_PREVIOUS` present while the app's is.

Where each value lives (the room.env key it comes from):

| Name                              | Preview Worker and Vercel preview | Production Worker                               | Vercel production                                 |
| --------------------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `TURBOSLIDE_ROOM_SECRET`          | `_PREVIEW`                        | the shared pair, then `_PRODUCTION` from step 3 | the shared pair, then `_PRODUCTION` from step 4   |
| `TURBOSLIDE_ROOM_BEARER`          | `_PREVIEW`                        | the shared pair, then `_PRODUCTION` from step 3 | the shared pair, then `_PRODUCTION` from step 4   |
| `TURBOSLIDE_DB_BEARER`            | `_PREVIEW`                        | `_PRODUCTION` from step 3                       | `_PRODUCTION` from step 4                         |
| `TURBOSLIDE_ROOM_SECRET_PREVIOUS` | never                             | the shared ticket secret, steps 3 to 5          | never                                             |
| `TURBOSLIDE_ROOM_BEARER_PREVIOUS` | never                             | the shared room bearer, steps 3 to 5            | `TURBOSLIDE_ROOM_BEARER_PRODUCTION`, steps 1 to 4 |
| `TURBOSLIDE_DB_BEARER_PREVIOUS`   | never                             | the shared room bearer, steps 3 to 5            | never                                             |
| `TURBOSLIDE_DB_STATEMENTS`        | unset (`report` by hand only)     | unset (`report` by hand only)                   | never                                             |

Every command below is `node scripts/hosting/realtime-env.mjs <subcommand>` from a root linked to
`turboslide-gt`, with `--dry-run` to print the plan first; the output names variables and Workers,
never a value. A Vercel variable reaches a deployment at its next build; a Worker secret serves at
once (each `wrangler secret put` or `delete` deploys a new version).

**The preview half** (lane K2, 2026-10-08; the readings follow the list):

1. The database: none created. `turboslide-accounts-preview` exists (created 2026-10-01, bound
   as `ACCOUNTS` under `env.preview` in `apps/realtime-worker/wrangler.jsonc`) with the accounts
   schema of migrations 0001 and 0002 and the current `ts_schema` row, so it is reused.
2. `mint --environments preview`: the three `_PREVIEW` keys into `room.env`.
3. `worker-secrets --env preview`: the database bearer, the ticket secret and the room bearer on
   the preview Worker (and `VERCEL_AUTOMATION_BYPASS_SECRET` when `vercel-bypass.env` exists).
4. `do --environments preview --force`: the preview Worker's host and the three values on Vercel
   preview.
5. `status`: `distinct` for the ticket secret and the room bearer.

The preview Worker keeps main's code until the guard deploys this change: that code ignores
`TURBOSLIDE_DB_BEARER` and takes the preview's own room bearer on `/db`, which the preview
deployments built after step 4 send. From this change on it takes the database bearer alone. A
preview deployment built before step 4 carries the shared pair and is refused by the preview
Worker from step 3; the guard builds a new one per push.

**The production half**, for the orchestrator, in this order. No step refuses a call: at every
moment each value a host sends is one its receiver takes.

1. Before pushing this change (room.env and Vercel only; the running deployment is untouched):
   `mint --environments production`, then `app-partner --environments production`
   (`TURBOSLIDE_ROOM_BEARER_PREVIOUS` on Vercel production is the coming room bearer).
2. Push through the guard. The guard deploys the Worker, then the app, which now takes the coming
   room bearer beside the shared one. Read: `GET https://turboslide-realtime.kk23907751.workers.dev/health`
   answers `db: fallback` and `statements: enforce`; Google sign in on `www.turboslide.com`; an
   API key through `turboslide login`; the Worker's logs carry no `db.statement.refused`.
3. Only once step 2's deployment serves on `www.turboslide.com` (it carries the app's partner;
   before it, the objects' checkpoint and seed calls would be refused until a deploy, the entries
   waiting in the objects), the Worker switches: `worker-secrets --from-shared`. It puts the
   shared ticket secret and room
   bearer as `TURBOSLIDE_ROOM_SECRET_PREVIOUS`, `TURBOSLIDE_ROOM_BEARER_PREVIOUS` and
   `TURBOSLIDE_DB_BEARER_PREVIOUS` first, then production's own database bearer, ticket secret
   and room bearer. The app still sends the shared pair, which the Worker takes as the previous
   values; the objects now send production's own room bearer, which the app takes as its partner.
   Read: `/health` `db: rotating`; sign in; `~/.config/turboslide/gt-follow.sh --check
https://www.turboslide.com` (the realtime rows).
4. The app switches: `do --environments production --force` (it sets the three only because
   `/health` answers `rotating`), then `app-settle --environments production`, then a push
   through the guard (the commit of the readings). Read as in step 2.
5. The window closes: `worker-settle`. Read: `/health` `db: own`; `status` answers `distinct` for
   all three names.
6. A later push removes the fallback from the code (HARDENING.md HR-K2#4): `/db` then refuses
   every call on a Worker without a database bearer.

The window is bounded by steps 4 and 5, not by a deploy: the Worker's three `_PREVIOUS` names and
the app's partner are deleted by hand, and both are visible until then.

Rollback, per step:

- Step 1: `app-settle --environments production`. The room.env keys are inert.
- Step 2: the guard's own (a red production smoke promotes the previous deployment and redeploys
  the previous sha's Worker); the secrets are untouched, so the previous code runs as before. A
  refused statement alone: `TURBOSLIDE_DB_STATEMENTS=report` on the production Worker, as above.
- Step 3: `worker-rollback`: the shared pair back as the Worker's ticket secret and room bearer,
  then `TURBOSLIDE_DB_BEARER` and the three `_PREVIOUS` names deleted; `/health` answers
  `db: fallback` and the app of step 2 runs as before.
- Step 4: promote the step 2 deployment (`~/.config/turboslide/README.md` "Rolling back by hand");
  the Worker in its window takes it. Before step 5 only.
- Step 5: `worker-secrets --from-shared` reopens the window; then any deployment from step 2 on
  may be promoted.
- Below this change (a deployment or a Worker from before step 2): run `worker-rollback` first,
  since that code knows neither the database bearer nor the previous names.

What the narrowing leaves (the next fix is AUTH-3's other option, better-auth on a D1 binding in the
Worker's own runtime, or the session token hashed at rest): the database bearer still acts as the
auth server for an account whose id or address its holder knows, because the library's own
statements read a user's sessions by user id and insert a session. The list also carries three
reads without a key column: `select * from "ts_api_key"` (the key cache: hashes, owners and
scopes), the verification cleanup read (`expiresAt < ?`, whose values are hashed codes and OAuth
state) and the captured mail list (the preview's capture mode only; production runs
`TURBOSLIDE_MAIL=off`). What it removes: a bulk read of the session, account, user and
verification tables, every schema statement (a table, a trigger, a drop), a write of anything but
a parameter, and any reach of the room bearer, which the objects and the probes carry, into the
accounts.

The preview half's readings, 2026-10-08 (no value is recorded anywhere; names, ids and
statuses only):

- `wrangler d1 list`: `turboslide-accounts` (87d3f46e-ef12-428d-b115-5c34fd322b5b) and
  `turboslide-accounts-preview` (9b66676e-55ac-4d14-a063-5cc7f0091789, created
  2026-10-01T21:42Z). On the preview database: the twelve accounts tables, the two control
  tables and the seven indexes, `ts_schema` at `better-auth 1.7.4; turboslide 2026-10-01.1`,
  no user and no session row. Production's database, read the same way (names and the version
  row only): the same tables and version.
- `mint --environments preview` wrote `TURBOSLIDE_ROOM_SECRET_PREVIEW`,
  `TURBOSLIDE_ROOM_BEARER_PREVIEW` and `TURBOSLIDE_DB_BEARER_PREVIEW` into `room.env` (600); the
  file before is kept as `room.env.before-k2` (600) beside it.
- `worker-secrets --env preview` (20:02Z): the preview Worker's secrets are
  `TURBOSLIDE_DB_BEARER`, `TURBOSLIDE_ROOM_BEARER` and `TURBOSLIDE_ROOM_SECRET`; the three puts
  made versions ab1d5e26, e37fa638 and 63040c46 over the guard's upload 4d9f4b12 (main at
  8be64284). The production Worker's secrets are unchanged: `TURBOSLIDE_ROOM_BEARER` and
  `TURBOSLIDE_ROOM_SECRET`.
- `do --environments preview --force`: `/health` on the preview Worker answered ok, realtime on,
  commit 8be64284 (main's code, so no `db` field yet); then `TURBOSLIDE_ROOM_HOST` (the preview
  host from `cloudflare.env`), `TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_ROOM_BEARER` replaced and
  `TURBOSLIDE_DB_BEARER` added on Vercel preview. `status`: production has no
  `TURBOSLIDE_DB_BEARER` and no `TURBOSLIDE_ROOM_BEARER_PREVIOUS`, the preview has the database
  bearer; `TURBOSLIDE_ROOM_SECRET` and `TURBOSLIDE_ROOM_BEARER`: production and preview
  `distinct`.
- `GET /control/flags` on the preview Worker: 401 under the shared (production) room bearer, 200
  under the preview's own, 401 under the preview's database bearer.
- `worker-migrate --env preview` applied `0003_schema_version.sql` (the version row; the insert
  changed nothing there): `d1_migrations` lists 0001 to 0003.

The local run of the code (lane K2, 2026-10-08): `wrangler dev --port 8771` with test values in
`.dev.vars` (the three secrets, `TURBOSLIDE_APP_ORIGIN=http://127.0.0.1:4871`) over a local D1
made by `wrangler d1 migrations apply turboslide-accounts --local`, and the studio by `vite dev`
on 4871 (4854 was another lane's) with `TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_ACCOUNTS=d1`,
`TURBOSLIDE_ROOM_HOST=127.0.0.1:8771`, `TURBOSLIDE_ROOM_INSECURE=1`, `TURBOSLIDE_MAIL=capture`
and `TURBOSLIDE_LOCAL_OPEN` and `TURBOSLIDE_AUTH_RATE_LIMIT` unset. The Worker's `/health`
answered `db: own`, `statements: enforce`. The first boot found no version row (migrations 0001
and 0002 make none) and its three `create table` statements were refused, which is why
`0003_schema_version.sql` exists; after it every flow passed: the code sign in (the captured
code read by `e2e/identity-seed.mts` through the narrowed `/db`), `account.me` as the address,
`account.sessions`, `account.tokens.create` and the new key alone as the bearer of
`account.tokens.list`, a fresh magic link (302 with the session cookie), `account.signOut` of
the current session (then `account.me` reads anonymous) and `/api/auth/sign-out`. An editor tab
on `/edit/gt-brand` opened its socket through the Worker (101 under the app's ticket), and a
typed note was committed by the object's checkpoint call into the app under the room bearer
(`versions/8.json` with `ops` 1 to 1). Straight at the Worker: `select * from session`,
`select "token" from "session"` and a `create trigger` under the database bearer answered 403
`statement_not_allowed`; the version read answered 200 under the database bearer and 401 under
the room bearer, as did `select * from session`. The Worker's log over the run: 98 `/db/query`
calls, 6 refused (the boot's three before 0003 and the three above), 2 answered 401.

Optional on production, a no-op: `worker-migrate` applies `0003_schema_version.sql`, whose row
production already has; by the round's rules a remote migration on production is the ship
step's.

## 14. The backup (hardening O#1a)

Vercel Blob keeps no versions, no soft delete and no backup of its own, and a `del` is final
(RELIABILITY-13, `docs/hardening/HARDENING.md` 4.8). Every night the deployment copies the deck
documents into a second store, `turboslide-backup` in the General Translation team, private,
connected to Production as `TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN` (`TURBOSLIDE_BACKUP_BLOB_TOKEN`
is read first when it is set; `server/backup.ts` `BACKUP_TOKEN_VARIABLES`). The client opens it with
private access, so a public store would refuse every put and the night would fail in the log
instead of publishing access records. The preview has no backup store and answers 503.

What a night copies, under `backup/<yyyy-mm-dd>/` with the pathnames the documents store uses:

- per deck with a manifest: `deck.json`, `access.json`, `slides/`, `versions/`, `snapshots/` and
  `comments/`. `deck.json` is copied first and the deck's folder is listed after it: a commit
  that stores a snapshot stores it before it pushes `deck.json` (section 4, Writes), so the backup
  holds every snapshot its records name. Since hardening PS#4 a deck copied in the middle of a
  session may hold no snapshot of its manifest; a restore then reads the newest named snapshot and
  replays the records above it, which the backup holds too;
- `users/<principal>/decks.json`, the per principal deck indexes;
- `links/<hash>.json`, the link hash index, so a restored deck's share links open.

Left out: the twins (`assets/`, `d/`), `.thumbs/`, `leases.json`, every `.turboslide/` sidecar and
copy, `exports/`, `bundles/`, `builds/`, `index/` and `vitals/`. The twins stay on the public store
under their digest, and only `deck.remove` deletes them, so a deck restored after a removal comes
back without its pictures.

How it runs. `apps/studio/vercel.json` calls `GET /api/cron/backup` at `*/10 3-5 * * *`, every ten
minutes from 03:00 to 05:59 UTC (18 calls a night), with `Authorization: Bearer <CRON_SECRET>`; any
other caller is answered 401 (`server/cron.ts` holds the one cron credential, which the logo
refresh uses too). The source is the deployment's own client (`exportBlobClient`), so the copy
reads the public store before K1's cutover, both stores during its dual read window and the
private store after it. One call copies for at most 240 s from the cursor
`backup/<day>/cursor.json` (the phase and the last deck finished), writes the cursor after every
deck, and writes `backup/<day>/done.json` (decks, objects, bytes, failures, calls) once the day is
whole; the calls after it read `done.json` and copy nothing. A document the source changed since
an earlier call of the same night is copied again over its own etag. An object whose copy failed
is tried once more at once and then named in the day's record. Every store call has a 30 s
deadline. The copy is `packages/store/src/copy.ts`, the module `scripts/blob-copy.mjs` runs too.

The answers: 200 with the day's counts; 500 when a copy failed (the first failures are in the
body and in the function's log under `turboslide backup:`); 503 when no backup store or no Blob
store is connected; 401 without the secret.

Retention: 30 dated folders, the day of the run and the 29 before it. Older days are removed after
a night completes, the oldest first; the newest complete day stays whatever its age, so a month of
failed nights never leaves the store empty.

Size and cost, from the listing of 2026-09-20 (`docs/HOSTING-MOVE.md` 1.3): about 7,600 objects
and 55 MiB a night (72 manifests, 57 access records, 1,172 slides, 3,907 version records, 977
snapshots, the indexes and the link files). Each object is one put, two heads and one get, so a
month is about 230,000 advanced and 690,000 simple operations, about $1.15 and $0.30 at Blob's
prices, and 1.6 GB kept, about $0.04, with about 1.6 GB of reads.

A rehearsal on a checkout: `TURBOSLIDE_BACKUP_DIR=<folder>` opens a folder as the backup store
(`diskBlobClient`). The route reads the Blob store as its source, so a dev server on the tmp
store answers 503; `apps/studio/src/server/backup.test.ts` runs a night over two in-memory stores
cut into calls by a small budget, and `cron-backup.test.ts` drives the route.

## 15. The restore drill and the accounts export (hardening O#1b)

The restore drill. `apps/studio/vercel.json` calls `GET /api/cron/restore-drill` at `0 6 1 * *`,
06:00 UTC on the first of every month, after the night's backup is due, with the cron secret
(401 otherwise; `server/cron.ts`). The drill (`server/backup.ts` `runRestoreDrill`):

1. takes the newest night of the backup store with its `done.json`;
2. chooses a deck by the date: the day count since 1970 modulo the decks of that night, or the
   next one of the ten after it whose manifest's snapshot the backup holds;
3. copies that deck's files out of `backup/<day>/decks/<id>/` into `decks/<scratch id>/` of a
   folder of the function instance (`drill-<yyyymmdd>-<8 hex>`), through `packages/store/src/copy.ts`;
4. reads the scratch deck through the store as a function instance reads a deck it has not
   mirrored (`openBlobStore` over the folder: the manifest's etag names the snapshot);
5. checks five things: the restored `deck.json` has the backup's bytes; the backup holds
   `snapshots/<md5 of deck.json>.json`; the restored snapshot has the backup's bytes; the document
   the store reads validates; and that document is the backup's snapshot byte for byte as
   canonical JSON;
6. removes the folder and writes `backup/drills/<yyyy-mm>.json` into the backup store (the day,
   the deck, the scratch id, the object count, the revision, the snapshot key, the five checks,
   the time).

The live documents store is never written. The route answers 200 when every check held and 500
with the reason when one did not, which is also a line at error in the function's log under
`turboslide restore drill:` (HR-O#3's alert reads failures once it lands); 503 without a backup
store. By hand, with the same code:

    ( set -a; . <env file with TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN>; set +a; node scripts/restore-drill.mjs )
    TURBOSLIDE_BACKUP_DIR=<folder> node scripts/restore-drill.mjs --deck <id> --keep <folder> --no-record

`--deck` and `--day` choose the deck and the night, `--keep <folder>` restores there and leaves
the folder (the deck sits under `store/decks/<scratch id>/`), `--no-record` writes nothing into
the backup store, and the exit code is 0 when every check held, 1 when one did not, 2 without a
backup store. The backup store is connected to Production alone, so the preview has no drill;
the first reading of the store itself is the cron's on 2026-11-01, or Kevin's run by hand.

The reading on a checkout (lane O, 2026-10-11 18:32 to 18:34 UTC, load 110 to 147): the
repository's `decks/gt-brand` pushed into a folder store as the seed push does, two commits through
the store (revision 27), `users/` and a principal index beside it, then one night of
`runBackup` into a second folder store: `done` in one call, 1 deck and 99 objects (1,466,708
bytes) in 1,748 ms. `TURBOSLIDE_BACKUP_DIR=<that folder> node scripts/restore-drill.mjs` restored
`gt-brand` from 2026-10-11 as `drill-20261011-a7cbdd9d`: 98 objects, revision 27, snapshot
`9947e59aba475222c851ff4b23ebb531`, every check held, 3,512 ms, exit 0, the record
`backup/drills/2026-10.json` written. The route on the lane's dev server (port 4861, the same
folder as `TURBOSLIDE_BACKUP_DIR`): 401 without the secret, 200 with it and the same five checks
true, 2.3 s. The script answers exit 2 without a backup store and on a malformed `--day`.

Restoring a deck in an incident is a step this round does not build: `--keep` gives the restored
documents as a folder, and copying them back under the deck's id into the documents store is a
person's decision taken with the deck's owner.

The weekly accounts export. `scripts/hosting/d1-export.mjs` runs `wrangler d1 export
turboslide-accounts --remote --skip-confirmation` with `--table` for `user`, `account`, `ts_alias`,
`ts_api_key`, `ts_principal`, `ts_profile`, `ts_schema` and `rt_flags`: never `session`,
`verification`, `deviceCode`, `ts_mail`, `ts_quota`, `rt_open` or a table this round adds
(`ts_db_unlisted` from K2#3, the limiter's and the report counts' to come), because a session
token or a code on disk is a key to an account. It writes
`~/.config/turboslide/backups/accounts-<yyyy-mm-dd>.sql` through a `.part` file inside a folder of
mode 700, sets the file to 600 before the rename, keeps the newest eight, and does nothing until
the newest export is a week old; a failed run waits six hours before the next try. `account` holds
Google's tokens until HR-K2#7 stores them encrypted, so every file is a secret: it never leaves the
machine and never enters a repository, and the disk it sits on is the machine's encrypted disk
(question 30). The guard runs the script between passes from its checkout under its lock
(`docs/hardening/build/guard-d1-export.patch`, a patch of `~/.config/turboslide/gt-follow.sh` that
Kevin or the orchestrator applies after `patch -p1 --dry-run -d ~/.config/turboslide`); a poll
that finds nothing due logs nothing, a written file logs `accounts export: wrote ...` and a
failure logs its exit code. D1's Time Travel (7 days on Free, `docs/CLOUDFLARE.md` 3.9) is the
first way back; an export is the second, read into a database Kevin chooses with
`wrangler d1 execute <database> --remote --file <export>`. The patch's step, run on 2026-10-11 in
a sandbox (the patched function over a checkout copy whose wrangler is a fake that records its
call): the first call wrote `accounts-2026-10-11.sql` with mode 600 in a folder of mode 700 and
logged one line; the fake saw `d1 export turboslide-accounts --remote`, the eight tables, the
account id in its environment and `apps/realtime-worker` as its folder; the second call ran no
wrangler and logged nothing. `scripts/hosting/d1-export.test.mjs` holds the same over a fake.
