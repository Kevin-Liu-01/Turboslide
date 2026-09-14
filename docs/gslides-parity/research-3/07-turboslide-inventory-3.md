# Turboslide inventory for round three: identity, sharing, presence, store and network

Report 07 of the Google Slides parity round three, written 2026-09-13 from the code at `main`
`61b16e4` (the working tree carried one untracked folder, `.github/workflows/check.yml`, and
nothing else). It is a reading of the source for the designers of round three (multiplayer,
optional accounts, security, layout shift, background pictures with dithers): every route and
endpoint with its gate, the token and ticket mechanics, the long poll and the external revision
banner, the leases, the store layouts, the version records, the sharing surfaces, the comment
stubs, the picture and background fields, the asset pipeline, the render worker facade, the export
records, the check chain and what the Vercel project carries. Nothing here was run; every fact
names its file and line at `61b16e4`. Where the code and a document disagree the report says so.
No web source was read for this report: it is an inventory of the repository, and the Google side
is the sibling reports' work (round one's `research/10-identity-sharing-and-presence.md` for
identity and presence).

Round one's inventory (`research/06-turboslide-inventory.md`, at `8c7056c`) listed every control,
key and action of the editor; round one's report 10 read the identity story at that commit. This
report covers what those two left out or what round two moved: the Blob layout after the snapshot
round, the bundle routes and tickets, the session registry, the deck collection actions, the
picture object and the background fields, the batched export records, and the current state of
every surface a name would show on.

## Summary

1. Identity is a string. `Author` is `{ kind: 'human' | 'agent', name, runId? }`
   (`packages/schema/src/mutations.ts:80`); the editor writes as `studio` unless the address
   carries `?author=` (`apps/studio/src/routes/edit.$deckId.tsx:292, 350, 387`); the home page's
   Rename writes as `studio` (`apps/studio/src/server/decks.ts:51`); the presenter page attaches as
   `presenter` (`present.$deckId.tsx:204, 239`); agents default to `agent:http` and
   `agent:mcp-http` (`apps/studio/src/server/auth.ts:19-20`); the CLI takes `--author`,
   `TURBOSLIDE_AUTHOR`, then `$USER` (`apps/cli/src/cli.ts:260-261`). Nothing verifies a name.
2. Every page and every server function is open to anyone who can load the host. The one gate on
   server functions is TanStack Start's CSRF middleware (`apps/studio/src/start.ts:12-18`), which
   checks the request's origin, not the person. The bearer token `TURBOSLIDE_TOKEN` gates the
   agent routes, the raw render and export routes and the bundle routes
   (`packages/agent/src/http/auth.ts:75-95`; `routes/api/render.$slideId.ts:50-62`;
   `routes/api/export.$deckId.ts:144-155`; `server/bundle-core.ts:133-150`).
3. Presence is the lease list. The editor takes a ten minute advisory lease on its active slide
   (`edit.$deckId.tsx:295, 1151-1170`), every long poll answer refreshes the list
   (`edit.$deckId.tsx:1246`), and the only drawings are a dot on the filmstrip row
   (`packages/chrome/src/Sidebar.tsx:323`), a line in the inspector (`Inspector.tsx:568-572`) and
   a word in the status chip (`StatusChip.tsx:42`). Two people with the same label draw nothing
   for each other.
4. Another writer's revision reaches an open editor over one long poll (20 s default, 25 s cap,
   `server/write.ts:436-437`), fed by `fs.watch` on the file store (`packages/store/src/watch.ts`)
   or a 3 s manifest poll on the Blob store (`blob-store.ts:308, 815-831`), and is applied forward
   through the reducer (`edit.$deckId.tsx:1189-1239`) under an eight second banner naming the
   revision and the author label (`edit.$deckId.tsx:298, 3793-3818`). A colliding write is
   rebased silently when the slides differ and shows the conflict card with Rebase and Discard
   otherwise (`edit.$deckId.tsx:861-906, 3707-3778`); nothing merges two edits to one text.
5. The Blob store holds each deck under `decks/<id>/` with `deck.json`, `slides/`, `versions/`,
   `leases.json`, the sidecars, `assets/` (public URLs) and, since round two, `snapshots/<md5>.json`,
   one immutable document per committed write, plus `exports/<deckId>/<jobId>/` and
   `bundles/<deckId>/<stamp>-<random>/` beside the decks (`packages/store/src/blob-store.ts:1-12,
141-157`; `snapshots.ts:1-9`; `server/export-sync.ts:104-106`; `server/bundle-core.ts:170-183`).
   The store is public (`blob-vercel.ts:88`), so every twin, export and bundle copy is a public
   URL to whoever knows it.
6. Comments exist only as disabled rows: the title row glyph, View > Comments, Insert > Comment,
   the toolbar's Insert comment and the last row of every context menu, each with the clause
   "Leave a note in the speaker notes instead" (`packages/chrome/src/menus/model.ts:384, 489,
798-807, 1025, 2014-2022, 2137-2256`; `TitleRow.tsx:259, 280-289`). SPEC-2 lists them as
   deferred with `ext.comments` and "a display name step first" (`docs/gslides-parity/SPEC-2.md:785,
805`).
7. A background picture is a `picture` block at `0, 0, 1600, 900` at the bottom of the stack
   (`packages/chrome/src/dialogs/Background.tsx:19-27, 40-54, 104-136`); a background colour is
   `slide.background.color` or `deck.defaults.background` (`packages/schema/src/deck.ts:80-87,
125-141`). The two tone dither is an asset treatment, not a block property
   (`packages/schema/src/assets.ts:62-80, 92-116`): it needs the asset's kept `sourceFile`, runs
   in the effects package (`packages/effects/src/two-tone.ts:95-131`) and in the inspector's
   worker (`apps/studio/src/workers/dither.worker.ts`), and is written by `asset.dither`
   (`packages/materials/src/actions.ts:119-160`). No toggle applies it to a picture object today.
8. There is no rate limit, no security header and no CSP anywhere in the tree (a search of
   `apps/studio/src`, `vercel.json`, `vite.deploy.config.ts`, the agent, MCP and worker packages
   and the two specs for `content-security-policy`, `x-frame-options`, `rate limit`, `429`,
   `firewall` and `helmet` found only the removed Google Slides quota note in
   `docs/spec/SPEC.md:1258`).

## How to read this report

- A path is relative to `/Users/kevinliu/repos/Turboslide`. A line reference is `file:line` or
  `file:from-to` at `61b16e4`.
- "Read" means the fact is in the source. "Recorded" means a document in the repository states it
  (`docs/hosting.md`, `docs/deck-transfer.md`, the status and verification files) and the
  statement was not re-measured here. "Unverified" means neither the code nor a document settles
  it; every such item is repeated in section 16.
- Plain technical English, sentence case, no trailing periods on headings.

## 1. Routes and endpoints

### 1.1 Pages

The route files are `apps/studio/src/routes/*` (25 files: 11 page and asset routes, 8 API routes,
3 contract routes, `mcp.ts`, `__root.tsx` and two CSS files). Every page is server rendered or
`ssr: false` and carries no authentication of its own; a page's data arrives through the server
functions of section 1.3.

| Path                      | File                                     | What it does                                                                                                                                                                                                                                                                            | Gate                              | Facts for the designers                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | `routes/index.tsx:10-20`                 | 307 to `/new` with `X-Robots-Tag: noindex`                                                                                                                                                                                                                                              | none                              | Before round one it opened the newest deck of the shared store (`index.tsx:7-9`)                                                                                                                               |
| `/new`                    | `routes/new.tsx:64-70`                   | `ssr: false`; the editor on a draft of the blank template under `untitled-<yyyymmdd>-<4>` (`server/root.ts:338-351`); the first write creates the deck (`server/write.ts:262-270`) and the address is pinned to `/edit/<id>` through `History.prototype.replaceState` (`new.tsx:82-89`) | none; `noindex` (`__root.tsx:29`) | Takes `?author=` like `/edit` (`new.tsx:49, 95`); two tabs create two decks (`new.tsx:26`)                                                                                                                     |
| `/edit/:deckId`           | `routes/edit.$deckId.tsx:354-371`        | `ssr: false`; the editor. Loader `readEditorDeck` (document, versions, leases, hosting facts, `write.ts:79-126`)                                                                                                                                                                        | none                              | Search params `mode, theme, edit, twin, lint, src, export, author` (`edit.$deckId.tsx:311-352`); the editor is keyed on `${deckId}:${authorLabel(author)}` (`:404`)                                            |
| `/deck/:deckId`           | `routes/deck.$deckId.tsx:33-46`          | The viewer; `?present=1` opens present mode; the payload carries no notes and no skipped slides and a trashed deck is 404 (`server/decks.ts:501-542`)                                                                                                                                   | none                              | This is the Share dialog's View link and Present link (`packages/chrome/src/dialogs/Share.tsx:17-31`)                                                                                                          |
| `/embed/:deckId`          | `routes/embed.$deckId.tsx:11-23`         | The same viewer with the Prototemplate iframe protocol (`#NN`, `gt-deck-slide`, `gt-theme` messages)                                                                                                                                                                                    | none                              | The Publish dialog's iframe snippet (`dialogs/Publish.tsx:22-29`)                                                                                                                                              |
| `/present/:deckId`        | `routes/present.$deckId.tsx:48-70`       | `ssr: false`; the presenter console; loads the editor's read (notes and skip flags), syncs the audience window over `BroadcastChannel('turboslide:<deckId>')` with `localStorage` as the fallback; `?screen=1` redirects to `/deck/:id?present=1`                                       | none                              | Attaches to the session registry as `presenter` (`present.$deckId.tsx:204`); its window actions run as `{ kind: 'human', name: 'presenter' }` (`:239`)                                                         |
| `/print/:deckId`          | `routes/print.$deckId.tsx:28-40`         | Print preview and settings; a trashed deck prints; Download as PDF through the export server functions                                                                                                                                                                                  | none; `noindex`                   | Reads `getDeck` with notes and skipped slides (`print.$deckId.tsx:35-39`)                                                                                                                                      |
| `/decks`                  | `routes/decks.index.tsx:52-59`           | The home page: Start a new presentation, Recent presentations (cards or rows), a per card menu (Open, Open in new tab, Present, Rename, Make a copy, Download, Move to trash), Trash                                                                                                    | none                              | Every deck of the store to every visitor (`decks.index.tsx:39-43`); Recent order is this browser's `localStorage` history first (`:66, 86-99`); thumbnails come from the open `?w=320` render variant (`:181`) |
| `/decks/trash`            | `routes/decks.trash.tsx:28-32`           | The trash: Restore, Delete forever (after a confirm), Empty trash                                                                                                                                                                                                                       | none; `noindex`                   | Delete forever is `deck.remove` per deck (`decks.trash.tsx:72-91`); anyone can empty anyone's trash                                                                                                            |
| `/decks/:deckId/assets/*` | `routes/decks.$deckId.assets.$.ts:26-53` | Streams a twin from the checkout or the overlay; on Blob, 302 to the twin's public URL for a deck made elsewhere; `public, max-age=60`                                                                                                                                                  | none                              | Serves `.svg` as `image/svg+xml` same origin (`:21`); the path is confined to the deck's assets folder by the store (`packages/store/src/hosted.ts:130-134`)                                                   |

### 1.2 API and contract routes

| Path                                           | File                                                              | Methods                                    | Gate                                                                                                                                                       | Body and size rules                                                                                                                                                                                                       | Notes                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/actions/:action`                         | `routes/api/actions.$action.ts:19-56`                             | GET (contract), POST, PUT and DELETE (405) | `requireAgentAuth` before the deck lookup (`:31-33`): bearer when `TURBOSLIDE_TOKEN` is set, else localhost only (`packages/agent/src/http/auth.ts:75-95`) | 1 MB, 25 MB for `asset.add` and `asset.capture` (`packages/agent/src/http/dispatch.ts:20-29`); one JSON object; unknown field 400 `unknown_field`                                                                         | `?deck=` (default `gt-brand`, `server/actions.ts:80`), `x-turboslide-author` or `?author=` (`auth.ts:107-113`), `?force=1` or `x-turboslide-force` (`:121-126`); a dispatch log line under `TURBOSLIDE_AGENT_LOG=1` (`actions.$action.ts:48-54`)                                                                                                                    |
| `/api/agent`                                   | `routes/api/agent.ts:18-43`                                       | GET                                        | the same bearer rule                                                                                                                                       | none                                                                                                                                                                                                                      | The manifest with `auth.required`, the implemented actions and the attached sessions (id, deckId, owner, actions, lastSeenAt; `packages/agent/src/http/manifest.ts:162-182, 219-225`)                                                                                                                                                                               |
| `/mcp`                                         | `routes/mcp.ts:56-64`                                             | GET, POST, DELETE                          | the same bearer rule, run by the handler before the transport (`mcp.ts:25`; `packages/mcp/src/http.ts:144-145`)                                            | the SDK's                                                                                                                                                                                                                 | One session per `mcp-session-id`, bound to `?deck=` and the author at initialize, 30 min idle (`packages/mcp/src/http.ts:14-17, 107-140`); the handler lives on `globalThis` (`mcp.ts:20-24`)                                                                                                                                                                       |
| `/api/render/:slideId`                         | `routes/api/render.$slideId.ts:64-144`                            | GET                                        | bearer when the token is set, except `?w=` thumbnails, which stay open (`:50-62`); open in a checkout                                                      | none                                                                                                                                                                                                                      | `?deck&theme&scale&format=jpg                                                                                                                                                                                                                                                                                                                                       | json`; `?w=160 | 320 | 640`with`?r=<revision>` is immutable for a year (`server/thumbs.ts:254-274`); a thumbnail miss runs a Chromium render on the instance (`thumbs.ts:229-248`) |
| `/api/export/:deckId`                          | `routes/api/export.$deckId.ts:303-400`                            | POST, GET                                  | bearer when the token is set; the `?cancel=<job>` POST needs no bearer (the job id is the capability, `:79-80, 306-310`)                                   | 1 MB (`:91, 312-324`); `export.run`'s schema (`:343`); `out` removed (`:351-352`)                                                                                                                                         | Hosted, every POST runs synchronously (`:340-342`, `X-Turboslide-Sync: hosted`); `?sync=1`, `?format=json`; the batched forms `?start=1`, `?batch=<i>&job=<id>`, `?merge=<id>`, `?cancel=<id>` (`:176-231`); GET lists jobs or one job, `?job&file` streams a produced file (`:103-136, 367-397`); a body over 4.5 MB is 302 to the stored copy or 413 (`:275-291`) |
| `/api/download/:token`                         | `routes/api/download.$token.ts:14-36`                             | GET                                        | the signed one time token itself (`server/tokens.ts`)                                                                                                      | token at most 2048 chars of `[A-Za-z0-9_.-]`                                                                                                                                                                              | 404 with no detail for a malformed, forged, expired, spent or unknown token; streams a job file or a build file                                                                                                                                                                                                                                                     |
| `/api/decks/bundle`                            | `routes/api/decks.bundle.ts:121-159`                              | POST, GET (405)                            | a ticket `?t=` for purpose `bundle-upload` and subject `*`, else bearer when set, else open (`server/bundle-core.ts:133-150`)                              | 200 MB (`packages/store/src/bundle.ts:22`); raw zip, multipart (`file` or `bundle`), or JSON `{ url, as?, replace? }` (64 KB) fetched from `*.blob.vercel-storage.com` only, redirects refused (`bundle-core.ts:258-306`) | Creates or replaces a deck: 201 or 200 with `editUrl` and `Location`; `?as=` and `?replace=1`; the unpack validates every digest and image signature before a write (`packages/store/src/unpack.ts:72-150`)                                                                                                                                                         |
| `/api/decks/:deckId/bundle`                    | `routes/api/decks.$deckId.bundle.ts:31-88`                        | GET                                        | a ticket for purpose `bundle-download` and subject `<deckId>`, else bearer when set, else open                                                             | none                                                                                                                                                                                                                      | The deck as `<deckId>-r<revision>.zip` with `X-Turboslide-Bundle`; over 4.5 MB in a function, 302 to a stored public copy under `bundles/<deckId>/<stamp>-<random>/` (`bundle-core.ts:170-183`) or 413 on tmp                                                                                                                                                       |
| `/openapi.json`, `/llms.txt`, `/llms-full.txt` | `routes/openapi[.]json.ts`, `llms[.]txt.ts`, `llms-full[.]txt.ts` | GET                                        | none                                                                                                                                                       | none                                                                                                                                                                                                                      | Serve `packages/agent/generated/*` read under `repoRoot()` (`server/contracts.ts:16-21`); hosted that root is the overlay, so the stubs are served there (recorded, `docs/hosting.md:553-555`)                                                                                                                                                                      |

### 1.3 Server functions

TanStack Start posts every server function to `/_serverFn/<id>`; the deployment gives that path
800 s and 3009 MB (`apps/studio/vite.deploy.config.ts:88, 127-134`). The only gate is the CSRF
middleware filtered to server functions (`apps/studio/src/start.ts:12-18`), which validates
`Sec-Fetch-Site`, `Origin` or `Referer`; no function reads a cookie, a session or a token, and
every one of them accepts any `author` the caller sends. The boundary is JSON text for the
functions whose shapes carry `unknown` (`server/write.ts:38-42`; `server/json.ts`).

| Module                                      | Functions and inputs                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Who is trusted                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/write.ts`                           | `readEditorDeck { deckId }` (`:97-126`); `readDraftDeck` (`:131-171`); `writeDeck { deckId, write, force?, returnDocument? }` (`:244-318`); `saveVersion { deckId, author, note }` (`:320-344`); `listVersions` (`:346-358`); `leaseSlide { deckId, slideId, author, minutes?, force?, release? }` (`:369-412`); `watchDeck { deckId, since, timeoutMs? }` (`:465-522`)                                                                                                                    | The `author` inside `write` and the `author` field are parsed with `authorSchema` only (`:73-77`); `force` skips the lease check for anyone (`:272`)                                 |
| `server/decks.ts`                           | `listDecks` (`:201-203`), `listTrashedDecks` (`:206-214`), `getHostingFacts` (`:217-219`), `createDeck { name, from, id? }` (`:257-275`), `renameDeck { deckId, name, baseRevision? }` as author `studio` (`:51, 286-313`), `copyDeck` (`:328-361`), `trashDeck`, `restoreDeck`, `removeDeck { deckId, baseRevision? }` (`:372-408`), `deckDetails` (`:425-445`), `readSourceDeckSlides` (`:459-496`), `getDeck { deckId, theme?, notes?, includeSkipped?, includeTrashed? }` (`:521-542`) | Anyone; `removeDeck` is irreversible and asks nothing on the server (`:393-402`)                                                                                                     |
| `server/download.ts`                        | `exportCapabilities` (`:84-94`), `startExport`, `syncExport` (`:135-169`), `startBatchedExport`, `exportBatch`, `mergeExport`, `cancelBatchedExport` (`:176-246`), `pollExport { jobId }` (`:415-462`), `signDownload` (`:467-495`), `runBuild { deckId, budgetMB? }` (`:525-583`)                                                                                                                                                                                                         | Anyone can start a Chromium export of up to 780 s per call (`server/export-sync.ts:82`) or a standalone build of up to 600 s (`download.ts:542`); the job records carry no requester |
| `server/bundle.ts`                          | `bundleDownloadTicket { deckId }` (`:27-46`), `bundleUploadTicket` with no input (`:48-58`), `connectFacts` (`:87-105`)                                                                                                                                                                                                                                                                                                                                                                    | Anyone on the page can mint a ticket that the bundle routes accept in place of the bearer                                                                                            |
| `server/sessions.ts`                        | `attachStudioSession { deckId, owner, actions, author?, url?, state?, id? }` (`:74-96`), `pollStudioSession { id, timeoutMs? }` (`:100-116`), `answerStudioSession` (`:120-161`), `detachStudioSession` (`:163-174`)                                                                                                                                                                                                                                                                       | The page names its own author label; a session id is a UUID the page holds (`packages/agent/src/http/sessions.ts:123-125`)                                                           |
| `server/agent-actions.ts`                   | `runDeckAction { deckId, action, input, author, force? }` for `asset.add`, `asset.dither`, `material.capture`, `material.list`, `deck.list`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `slide.import` (`:39-50, 74-131`)                                                                                                                                                                                                                                                   | The `author` is whatever the page sends, parsed by `authorSchema` (`:94-95`); `force` is honoured (`:110, 123`)                                                                      |
| `server/render.ts`                          | `renderSlideImages { deckId, slideIds, themes?, scale?, format? }` (`:67-128`)                                                                                                                                                                                                                                                                                                                                                                                                             | Anyone; one Chromium run per slide and theme                                                                                                                                         |
| `server/warm.ts`                            | `warmThumbnails { deckId, theme, width?, slideIds? }` (`:17-29`)                                                                                                                                                                                                                                                                                                                                                                                                                           | Anyone; one render job for every missing thumbnail of a theme                                                                                                                        |
| `server/lint.ts`, `measure.ts`, `health.ts` | The lint server functions, the canvas measurement through the worker, `getServerHealth` (marker, Node version)                                                                                                                                                                                                                                                                                                                                                                             | Anyone                                                                                                                                                                               |

## 2. Tokens, tickets, sessions and the client's storage

### 2.1 The bearer token

| Fact                                                                                                                                             | Where                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `TURBOSLIDE_TOKEN` set: every request to the agent routes carries `Authorization: Bearer <token>`, compared with `timingSafeEqual`               | `packages/agent/src/http/auth.ts:14, 61-65, 75-87`                                                  |
| Unset: only requests addressed to localhost, `127.0.0.1`, `::1`, `0.0.0.0` or `*.localhost` are served, judged by `X-Forwarded-Host` then `Host` | `auth.ts:26-52, 88-94`                                                                              |
| The render and export routes and the bundle routes check the token only when it is set; open in a checkout                                       | `routes/api/render.$slideId.ts:50-62`; `export.$deckId.ts:144-155`; `server/bundle-core.ts:133-150` |
| The manifest reports `auth: { required, env, localhostOpen }`                                                                                    | `auth.ts:97-105`; `manifest.ts:178, 219`                                                            |
| The token is set on the production and preview environments since 2026-09-11; the same value is in `~/.config/turboslide/hosts.json` (mode 0600) | recorded, `docs/hosting.md:330-336`; `apps/cli/src/hosts.ts:1-6, 73-90`                             |
| The CLI resolves `--token`, then `TURBOSLIDE_TOKEN`, then the hosts file, per origin                                                             | `apps/cli/src/hosts.ts:97-109`                                                                      |
| The render worker's own bearer `TURBOSLIDE_WORKER_TOKEN` gates every worker route but `/healthz`; the comparison is a plain string equality      | `apps/render-worker/src/server.ts:15, 146-150`; `main.ts:1-5`                                       |

### 2.2 The signed download tokens

`apps/studio/src/server/tokens.ts`: a token names an export job and a file's base name, or a
deck id and a build file's name (`:21-25`); the payload is base64url JSON signed with HMAC-SHA256
under `TURBOSLIDE_DOWNLOAD_SECRET` or a random per process key kept on `globalThis` (`:32-48`);
fifteen minute TTL (`:30`); a nonce spent on the first successful resolution, kept in a process
local map (`:159-190`). The path is always derived from the job's report or the builds folder,
never from the token (`:154-158, 169-186`). Minted by `pollExport`, `signDownload` and `runBuild`
(`download.ts:445-455, 482-490, 570-576`). A random per process secret means a token minted on
one hosted instance does not verify on another; the download route is a 404 there (read; not
measured).

### 2.3 The bundle tickets

`server/bundle-core.ts:46-120`: `{ p: purpose, s: subject, exp, nonce }`, ten minute TTL, HMAC-SHA256
keyed from `TURBOSLIDE_TOKEN` through a second HMAC (so every instance of a deployment verifies
every other's tickets), else `TURBOSLIDE_DOWNLOAD_SECRET`, else a random per process key
(`:59-74`). `verifyTicket` checks purpose, subject and expiry and does not spend the nonce
(`:93-120`), so a ticket is reusable within its ten minutes. The upload ticket's subject is `*`
(`:51`); `bundleUploadTicketFn` takes no input and any page visitor can call it
(`server/bundle.ts:48-58`). The page posts the zip to `POST /api/decks/bundle?t=<ticket>`
(`edit.$deckId.tsx:2477-2495`; `dialogs/Open.tsx:71-78`) and downloads through
`GET /api/decks/<id>/bundle?t=<ticket>` (`decks.index.tsx:413-414`).

### 2.4 The studio session registry

`packages/agent/src/http/sessions.ts` and `apps/studio/src/server/sessions.ts`: a page on `/edit`,
`/deck` or `/present` attaches once `window.turboslide.studio` is ready
(`apps/studio/src/components/useStudioSession.ts:46-124`) with `deckId`, `owner`
(`editor | viewer | presenter`), the action ids it answers, its author label, its URL and its
view state; the registry is in memory per process on `globalThis` (`sessions.ts:26-32`); a
session is swept after 45 s without a poll (`http/sessions.ts:74`); the poll is 20 s, capped at
25 s (`sessions.ts:34-35`); a command waits 15 s for the page (`http/sessions.ts:75`). The
manifest lists every session's id, deck, owner, actions and last seen time to any bearer holder
(`manifest.ts:219-225`). This is the only "who is here" data the server holds, and it names a
label, a URL and a tab, never a person. Hosted, Fluid compute may put two tabs on two processes,
so two registries exist (read from the design; not measured).

### 2.5 The MCP sessions

`packages/mcp/src/http.ts:78-193`: one SDK server per `mcp-session-id`, created on `initialize`
from the studio's factory, which binds `?deck=` and the author of `x-turboslide-author` or
`?author=` (`routes/mcp.ts:26-47`); 30 minute idle sweep (`http.ts:17, 101-105`); a request with
an unknown session id is a 404 JSON-RPC error (`:149-151`). The facts logged per session are the
deck id, the author label and the tool names (`mcp.ts:41-46`).

### 2.6 The client's storage

The browser holds these keys today; none is an identity (read).

| Key                                                                   | Where                                                         | What                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `turboslide:opened`                                                   | `routes/decks.index.tsx:66, 86-99`                            | Deck id to ISO time, the Recent order and "Opened" line |
| `turboslide:home`                                                     | `decks.index.tsx:69`                                          | The home page's sort and view                           |
| `gt-theme`, `gt-deck-theme`                                           | `packages/viewer/src/theme.ts:21-22, 177`                     | The theme                                               |
| `gt-shell-sb`, `gt-shell-density`, `gt-shell-hint`, `gt-shell-groups` | `packages/chrome/src/ViewerShell.tsx:38-44`; `Sidebar.tsx:93` | Shell state                                             |
| `ts-inspector-sections`                                               | `packages/chrome/src/inspector/sections.ts:125`               | Open inspector sections                                 |
| `turboslide:presenter:notes-size`                                     | `packages/viewer/src/present/PresenterConsole.tsx:50`         | The console's notes size                                |
| `BroadcastChannel('turboslide:<deckId>')`                             | `routes/present.$deckId.tsx:29-33`                            | The slideshow and console sync                          |

## 3. Identity today

### 3.1 The type and its parsers

`packages/schema/src/mutations.ts:79-91`: `Author = { kind: 'human' | 'agent'; name: string; runId?: string }`;
`Write = { baseRevision, author, note?, mutations }`; `Version = { n, revision, author, note, createdAt, mutations }`;
`Lease = { slideId, holder: Author, until }`. `authorSchema` requires a non empty name and nothing
else (`:159-163`). `parseAuthor('agent:<x>')` is an agent with `runId x`; any other string is a
human named by it (`:188-194`). `sameAuthor` compares kind, name and runId; `authorLabel` prints
`agent:<runId>` or the name (`packages/store/src/store.ts:125-133`); the chrome's `authorName` is
the same rule (`packages/chrome/src/dispatch.ts:19-21`). The deck manifest has no owner, author or
createdBy field (`packages/schema/src/deck.ts:80-105`); `DeckHead` is
`{ id, title, slides, sections, revision, updatedAt, createdAt, trashedAt? }`
(`packages/store/src/templates.ts:317-327`).

### 3.2 Where an author comes from

| Surface                                    | Author                                                                               | Where                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| The editor, `/edit/:id`                    | `parseAuthor(search.author ?? 'studio')`; `?author=` is any non empty string         | `edit.$deckId.tsx:291-292, 321, 350, 387`                                     |
| The fresh presentation, `/new`             | the same rule                                                                        | `new.tsx:48-49, 95`                                                           |
| Every editor write, lease, version save    | the editor's author                                                                  | `edit.$deckId.tsx:995, 1111, 1140, 1163, 1836, 2081`                          |
| Server side window actions from the editor | the editor's author, sent in the body                                                | `edit.$deckId.tsx:1493`; `server/agent-actions.ts:94-95`                      |
| The session registry                       | `authorLabel(author)` as a label string                                              | `edit.$deckId.tsx:3237-3240`; `useStudioSession.ts:62`                        |
| The home page's Rename                     | `{ kind: 'human', name: 'studio' }`                                                  | `server/decks.ts:51, 303`                                                     |
| The presenter console                      | session author `presenter`; window actions as `{ kind: 'human', name: 'presenter' }` | `present.$deckId.tsx:204, 239`                                                |
| `/api/actions`                             | `x-turboslide-author`, else `?author=`, else `agent:http`                            | `packages/agent/src/http/auth.ts:22, 107-113`; `server/auth.ts:19`            |
| `/mcp`                                     | the same headers, else `agent:mcp-http`, bound at initialize                         | `server/auth.ts:20`; `routes/mcp.ts:28`; `packages/mcp/src/server.ts:46, 103` |
| The CLI                                    | `--author`, then `TURBOSLIDE_AUTHOR`, then `$USER`, then `unknown`                   | `apps/cli/src/cli.ts:188, 260-261`                                            |
| The judge loop                             | `agent:judge-loop-<stamp>`                                                           | recorded, `AGENTS.md` (The judge loop)                                        |
| The Blob replay                            | a record's `author` is re-applied as written                                         | `packages/store/src/blob-store.ts:447-455`                                    |

### 3.3 Every place a display name or an author shows

| Surface                                          | What it prints                                                                                                                | Where                                                                              | Note                                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Title row, Last edit clock                       | `Last edit <ago>` and ` by <label>` only when the editor's own label is not `studio`                                          | `packages/chrome/src/TitleRow.tsx:169-190`; `edit.$deckId.tsx:2994-2999`           | The "by" is the current tab's author, not the author of the last version record (`save.lastEditBy` is set from `author`) |
| Title row, save words                            | `All changes saved`, `Saving…`, `Not saved yet`, `Couldn't save, retrying`                                                    | `TitleRow.tsx:44-57`; `menus/strings.ts:28-38`                                     | No name                                                                                                                  |
| Version history panel                            | per version: the note or the time, then `<author> · ` unless the author name is `studio`, then the change count and `current` | `packages/chrome/src/VersionsPanel.tsx:249-262`                                    | Grouped by day; Only show named versions; Restore this version; Name this version; Make a copy                           |
| Versions section (embedded form)                 | `<author> · r<revision> · <time>`                                                                                             | `VersionsPanel.tsx:385-388`                                                        |                                                                                                                          |
| History panel (Change history)                   | `r<revision>`, the author, the time, the note per entry                                                                       | `packages/chrome/src/HistoryPanel.tsx:56-60`                                       | Undo to here                                                                                                             |
| Inspector, slide section                         | `Leased by <author> until <time>`                                                                                             | `packages/chrome/src/Inspector.tsx:430, 568-572`                                   | Only another author's lease                                                                                              |
| Status chip                                      | `lease <holder>` and the aria text `slide leased by <holder>`                                                                 | `packages/chrome/src/StatusChip.tsx:17-18, 42, 46`                                 |                                                                                                                          |
| Filmstrip row                                    | a lease dot with the title `Held by another author`                                                                           | `packages/chrome/src/Sidebar.tsx:270, 312-323`; `edit.$deckId.tsx:2344-2347, 2360` | No name on the dot                                                                                                       |
| External revision banner                         | `Revision r<n> by <label> arrived from outside this editor and is shown[: <note>]` for 8 s, with Reload                       | `edit.$deckId.tsx:298, 1189-1200, 3793-3818`                                       | The label is the last record's author, else the head's                                                                   |
| Conflict card                                    | `<label> wrote N revisions while M local mutations waited; both touched <slides>`; the holder's label on a lease refusal      | `edit.$deckId.tsx:3707-3737`                                                       | Shows both slides as JSON                                                                                                |
| Source drawer                                    | the external revision's author label or `outside`                                                                             | `edit.$deckId.tsx:3080-3087`                                                       |                                                                                                                          |
| Details dialog                                   | Title, Slides, Sections, Created, `Last edit <time> (change <revision>)`                                                      | `packages/chrome/src/dialogs/Details.tsx:18-35`                                    | No author                                                                                                                |
| Home page card                                   | `Opened <ago>` from this browser, else `Edited <date>`                                                                        | `decks.index.tsx:775-779`                                                          | No author                                                                                                                |
| Trash card                                       | `Trashed <date> · N slides`                                                                                                   | `decks.trash.tsx:257-259`                                                          | No author                                                                                                                |
| `/api/agent` sessions                            | id, deckId, owner, actions, lastSeenAt                                                                                        | `manifest.ts:219-225`                                                              | The session's author label is stored but not projected                                                                   |
| MCP session log line                             | `{ deckId, author, tools, attached }`                                                                                         | `routes/mcp.ts:41-46`                                                              | Server log only                                                                                                          |
| Lease refusals over every transport              | `Slide "<id>" is leased by <label> until <until>; pass force to write anyway`                                                 | `packages/store/src/lease.ts:31-34, 98-101, 123-125`                               |                                                                                                                          |
| The snackbar `Rebased N pending changes onto rN` | no name                                                                                                                       | `edit.$deckId.tsx:882-884`                                                         |                                                                                                                          |
| Comments, presence chips, avatars, cursors       | none exist                                                                                                                    | section 8                                                                          |                                                                                                                          |

## 4. Leases

| Fact                                                                                                                                                                      | Where                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Default 10 minutes, at most 120; a lease is `{ slideId, holder, until }`; whole deck writes take none                                                                     | `packages/store/src/lease.ts:23-24, 88-107`; `store.ts:135-163` |
| Policy: `enforce` for an agent author, `advisory` for a human; a `FileStore` opened without a policy reads it per write                                                   | `lease.ts:26-29`; `file-store.ts:198, 224-242`                  |
| Under `enforce` a write to a slide another author holds is a `conflict` outcome with the holder; under `advisory` it goes through with a warning line                     | `file-store.ts:230-241`; `store.ts:50-72`                       |
| `force` skips the check for anyone                                                                                                                                        | `file-store.ts:224`; `server/write.ts:272`                      |
| The same label is never a conflict (`sameAuthor`); two `studio` tabs replace each other's lease silently                                                                  | `lease.ts:62-72, 105`                                           |
| File store: `<deck>/.turboslide/leases.json`, gitignored; Blob: `decks/<id>/leases.json`, pulled before every write, lease and release and pushed after, last writer wins | `file-store.ts:199`; `blob-store.ts:146, 527-539, 656, 789-813` |
| Leases never travel in a bundle                                                                                                                                           | `packages/store/src/bundle.ts:23-24, 7`                         |
| The editor takes a lease on its active slide when it changes and releases the previous one; a failure is a snackbar line                                                  | `edit.$deckId.tsx:295, 1151-1170`                               |
| Every long poll answer replaces the editor's lease list; the shell gets every lease not held by this author                                                               | `edit.$deckId.tsx:1246, 3014`                                   |
| `slide.lease` on the window transport takes, renews or releases as the editor's author                                                                                    | `edit.$deckId.tsx:1829-1847`                                    |
| The server function answers a lease on an unsaved draft without touching a store                                                                                          | `server/write.ts:382-393`                                       |
| A lease refusal is shown as the conflict card, not rebased (a refused write would be re-sent every 2 ms)                                                                  | `edit.$deckId.tsx:869-876`                                      |

## 5. The long poll, the external revision banner and conflicts

### 5.1 The channel

| Layer           | Mechanism                                                                                                                                                                                                                                                                            | Where                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| File store      | `fs.watch` on the deck directory, recursive, debounced 80 ms, ignoring `.turboslide/`, reporting the changed paths and the revision `deck.json` carries                                                                                                                              | `packages/store/src/watch.ts:1-4, 39-68`                |
| Blob store      | no push channel: a `setInterval` of 3000 ms calls `sync()` (one `head` of `deck.json`, a pull when the etag moved) and reports one event when the mirror's revision changed; syncs within 750 ms share a result                                                                      | `blob-store.ts:283-286, 308-309, 502-520, 815-831`      |
| Server function | `watchDeck { deckId, since, timeoutMs }`: answers at once when the revision differs from `since`, else holds up to 20 s (25 s cap) on `store.watch` and answers `{ revision, head, leases, changed, since: VersionRecord[] }`; an unsaved draft polls once a second for its creation | `server/write.ts:414-522`                               |
| Editor loop     | `watchLoop`: one poll after another; publishes the leases on every answer; when the revision moved past what this tab wrote, waits for the local queue to drain, skips while a conflict card is up, then `adoptExternal`; 2 s back off on an error                                   | `edit.$deckId.tsx:1240-1260`                            |
| `adoptExternal` | applies the records since the local revision forward through `applyWrite` with the server's timestamps and authors, adds them to the version list, re-renders the touched slides (or all on a deck level change), and reloads when a record does not chain or is a `version.restore` | `edit.$deckId.tsx:1184-1239`                            |
| The banner      | `Revision r<n> by <label> arrived from outside this editor and is shown` for `EXTERNAL_BANNER_MS = 8000` with a Reload button that drops local state; it shares its slot with the trashed and hosting banners                                                                        | `edit.$deckId.tsx:298, 1177-1183, 3221-3227, 3793-3818` |

Latency, read from the constants: a checkout answers within the debounce plus the poll's own
return; the Blob store adds up to 3 s of manifest poll plus the CDN's `head` (`docs/hosting.md:171-173`
records "within that plus the editor's own poll"). No measurement of round three's target
("fast propagation") exists yet.

### 5.2 Writes and conflicts

| Step                                                | Behaviour                                                                                                                                                                                                                     | Where                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Local apply                                         | `commitAs` runs `applyWrite` on the local document at once, pushes a history entry and enqueues the `Write` with the local revision as `baseRevision`                                                                         | `edit.$deckId.tsx:981-1014`                                           |
| The queue                                           | `pump` sends one write at a time to `writeDeck`; a `StaleMirrorError` (the hosted store's "retry the write") is retried up to 6 times at 1.5 s times the attempt                                                              | `edit.$deckId.tsx:429-434, 908-930`                                   |
| Confirmed                                           | the server's revision, version entry and warnings replace the local ones; `updatedAt` takes the server's stamp                                                                                                                | `edit.$deckId.tsx:931-952`                                            |
| Conflict, disjoint slides                           | `onConflict` replays the waiting writes on the server's current document and re-queues them; snackbar `Rebased N pending changes onto rN`                                                                                     | `edit.$deckId.tsx:861-886`                                            |
| Conflict, same slide or deck level or lease refusal | the conflict card with the current document and this editor's slide as JSON, Rebase (replay again) and Discard (adopt the server's); further writes throw `Resolve the conflict card before writing again`                    | `edit.$deckId.tsx:886-906, 986-993, 1068-1099, 3707-3778`             |
| Server refused a locally valid write                | the queue is dropped and the document reloaded                                                                                                                                                                                | `edit.$deckId.tsx:959-966`                                            |
| Store side                                          | `applyWrite` checks `baseRevision`; a stale one is `conflict` with the current document; the studio adds `since`, the records after the caller's base                                                                         | `packages/store/src/file-store.ts:243-248`; `server/write.ts:285-295` |
| Blob side                                           | the commit point is `deck.json` with `ifMatch`; a precondition failure or a contested snapshot is the same `conflict` shape after a re-pull                                                                                   | `blob-store.ts:619-630, 647-716`                                      |
| Text                                                | there is no character level merge; `text.replace` carries a range in the block's markup string and two editors on one run are last writer wins after a rebase or a conflict card (read; round one report 10 B3 says the same) | `packages/schema/src/mutations.ts:42-50`                              |

## 6. The store

### 6.1 Selection and the environment

`packages/store/src/select.ts:67-92`: `TURBOSLIDE_STORE=file|tmp|blob` wins; else `VERCEL` set
selects `blob` with `BLOB_READ_WRITE_TOKEN` and `tmp` without; else `file`. The overlay is
`TURBOSLIDE_OVERLAY_DIR` or `<tmpdir>/turboslide` (`:100-103`). `docs/hosting.md:271-282` is the
variable table (`VERCEL`, `BLOB_READ_WRITE_TOKEN`, `TURBOSLIDE_STORE`, `TURBOSLIDE_OVERLAY_DIR`,
`TURBOSLIDE_BLOB_ACCESS`, `TURBOSLIDE_TOKEN`, `TURBOSLIDE_DOWNLOAD_SECRET`, `TURBOSLIDE_DECKS_DIR`,
`TURBOSLIDE_WORKER_DIR`, `TURBOSLIDE_PACKAGES_DIR`, `TURBOSLIDE_LAUNCH_LOG`); the code adds
`TURBOSLIDE_WORKER_URL` and `TURBOSLIDE_WORKER_TOKEN` (`apps/render-worker/src/client.ts:298-301,
370-374`), `TURBOSLIDE_WORKER_EXEC` (`cli.ts:265-271`), `TURBOSLIDE_AGENT_LOG`
(`routes/api/actions.$action.ts:49`), `TURBOSLIDE_EXPORT_BATCH` (`server/download.ts:79-81`),
`TURBOSLIDE_EFFECTS_BACKEND` (`packages/effects/src/select.ts:16`) and `TURBOSLIDE_ROOT`
(`server/root.ts:61`).

### 6.2 The file layout (checkout and overlay)

| Path under `decks/<id>/`                                                     | What                                                                                 | Where                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `deck.json`                                                                  | the manifest, written last on every write, canonical JSON                            | `packages/store/src/file-store.ts:1-7, 191-193, 261`                                                                                    |
| `slides/<slideId>.json`                                                      | one file per slide, written only when its normalized value changed                   | `file-store.ts:175-189`                                                                                                                 |
| `versions/<n>.json`                                                          | one record per committed write and per named save, numbered from 1                   | `packages/store/src/versions.ts:1-5, 59-64`                                                                                             |
| `assets/<file>`, `assets/<id>.source.<ext>`, `assets/<id>.recipe.json`       | the twins, the kept continuous source of a two tone asset, a material recipe sidecar | `packages/schema/src/assets.ts:104-110`; `packages/headless/src/capture/intake.ts:165-170`; `packages/materials/src/capture.ts:556-557` |
| `import-ids.json`, `import-report.json`, `known-findings.json`               | the sidecars                                                                         | `packages/store/src/bundle.ts:4-5, 113-116`                                                                                             |
| `.turboslide/leases.json`, `.turboslide/write.lock`, `.turboslide/blob.json` | the leases, the write lock (5 s wait, 30 s stale), the Blob mirror's etag manifest   | `file-store.ts:82, 199-201`; `blob-store.ts:160-187`                                                                                    |

Beside the decks: `.turboslide/thumbs/<deck>/<revision>/<theme>@<width>/<slide>.png`
(`server/thumbs.ts:113-131`), `.turboslide/worker/{jobs/<id>, cache/<deck>/<revision>/<theme>@<scale>x[-jpg], builds/<deck>/<deck>.html}`
(`apps/render-worker/src/paths.ts:68-88`; `server/tokens.ts:150-152`), `.turboslide/exports/`
(the disk part store, `server/export-batch.ts:49-54, 92-103`), `.turboslide/http/{judge,build}/<deck>`
(`server/actions.ts:254, 273`), `.turboslide/unpack/` staging (`unpack.ts:233-235`) and
`.turboslide/dev-server.log` (`scripts/check.mjs:32`). Hosted, the root is `/tmp/turboslide`
with `decks/`, `packages/` and `.turboslide/` under it (`server/root.ts:22-37`), and the derived
folders are swept every 30 s to 160 MB, 32 MB under 128 MB free, nothing younger than 60 s, jobs
and builds kept 15 min (`root.ts:414-427`).

### 6.3 The Blob layout after round two

| Prefix                                         | What                                                                                                                                                                                           | Where                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `decks/<id>/deck.json`                         | the manifest; its etag is the md5 of its bytes; `ifMatch` on it is the commit point                                                                                                            | `blob-store.ts:1-12, 214-217, 672-675`                                                       |
| `decks/<id>/slides/<slideId>.json`             | the slide bodies, overwritten in place (the CDN can serve an overwritten body stale for a while)                                                                                               | `blob-store.ts:322-338, 676-685`                                                             |
| `decks/<id>/versions/<n>.json`                 | the records, written once under immutable names, each carrying `snapshot: <md5>` since round two                                                                                               | `blob-store.ts:662-666, 686-689`; `versions.ts:23-29`                                        |
| `decks/<id>/snapshots/<md5>.json`              | the whole `DeckDocument` as canonical JSON, `overwrite: false`, stored before the manifest flips; retention keeps the newest 50 records' and every named version's, prunes after a 5 min grace | `packages/store/src/snapshots.ts:1-9, 19-30, 90-129`; `blob-store.ts:559-600, 693`           |
| `decks/<id>/leases.json`                       | the leases, whole file, last writer wins                                                                                                                                                       | `blob-store.ts:146, 533-539`                                                                 |
| `decks/<id>/assets/<file>`                     | the twins and sources; public URLs the browser reads directly; the assets route answers 302 to them                                                                                            | `blob-store.ts:5, 846-861, 1162-1172`                                                        |
| `decks/<id>/<sidecar>.json`                    | the sidecars                                                                                                                                                                                   | `blob-store.ts:148-157`                                                                      |
| `exports/<deckId>/<jobId>/<file>`              | a synchronous export's files (public copies); the batched export's `plan.json`, `parts/` and files, pruned after 24 h by the next start                                                        | `server/export-sync.ts:103-106, 117-142`; `export-batch.ts:41-54`; `docs/hosting.md:469-473` |
| `bundles/<deckId>/<stamp>-<random>/<file>.zip` | a bundle over the 4.5 MB answer cap, public and unguessable, never deleted                                                                                                                     | `server/bundle-core.ts:165-183`; `docs/deck-transfer.md:112-115, 179`                        |

The collection lists decks from the folders under `decks/` and syncs every one on every list
(`blob-store.ts:978-984, 1032-1042`); `has` is one `head` (`:1043-1046`); `create` and `copy`
push the folder with `deck.json` last and refuse an existing id (`:1054-1115`); `trash` and
`restore` stamp `deck.json` with `ifMatch` (`:986-1024`); `remove` deletes `deck.json` first and
then the prefix (`:1129-1149`). The store's access is `public` unless `TURBOSLIDE_BLOB_ACCESS=private`
(`blob-vercel.ts:23-26, 88`); the stored export and bundle copies therefore need no credential to
read. The production store is `turboslide-decks` (`store_GGmYcVj7j6224Ay5`, `iad1`, public), connected
to the `turboslide` project for production, preview and development (recorded,
`docs/hosting.md:254-258`).

### 6.4 The version records and the author field

| Fact                                                                                                                                   | Where                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `VersionRecord = Version & { baseRevision, inverse: Mutation[], snapshot? }`; `Version` carries `author`                               | `packages/store/src/store.ts:25-40`; `mutations.ts:82-89`               |
| A committed write appends `{ n, revision, baseRevision, author: write.author, note: write.note ?? '', createdAt, mutations, inverse }` | `file-store.ts:250-260`                                                 |
| A named version is a record with a non empty note, empty mutations, the caller's author                                                | `file-store.ts:274-292`; `versions.ts:83-86`                            |
| `documentAt(n)` rebuilds from the head by inverses and needs a contiguous chain; `documentAtRevision` reads the snapshot on Blob first | `versions.ts:114-187`; `blob-store.ts:775-787`                          |
| The action table: `version.save`, `version.list`, `version.restore` (a mutation, so undoable); `diff.run` between records              | `packages/schema/src/actions.ts:1663, 1711, 1725, 1739`                 |
| The editor's version list is the loader's, appended on every confirmed write and every adopted external record                         | `server/write.ts:105-119`; `edit.$deckId.tsx:933-935, 1232-1236`        |
| `deck.info` reports `counts.snapshots` on Blob                                                                                         | `server/actions.ts:517-520`; `packages/agent/src/http/readers.ts:48-52` |

What the author field can say at `61b16e4`: `studio`, any string a URL carried, `agent:<runId>`,
`agent:http`, `agent:mcp-http`, `agent:judge-loop-<stamp>`, `presenter` (through the presenter's
window actions), a shell user name, or `unknown`. Round one's report 10 (B5) said the same at
`8c7056c`; nothing changed in round two.

### 6.5 The deck collection actions and the trash

`packages/store/src/hosted.ts:53-83` is the interface: `list`, `has`, `open`, `create`, `copy`,
`trash`, `restore`, `remove`, `ensureAssets`, `assetFile`, `assetUrl`, `facts`; no owner and no
permission on any call. The trash is `trashedAt` on the manifest, written at the store level and
never through `deck.set` (`templates.ts:526-567`); `remove` deletes the folder or the prefix
(`:569-584`; `blob-store.ts:1129-1149`); the studio's `deck.remove` action needs `confirm: true`
(`server/actions.ts:411-415`) and nothing runs on a schedule (`decks.trash.tsx:22-24`).

## 7. Sharing surfaces

| Surface                       | Content                                                                                                                                                                                                                                                                                                                                                                       | Where                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Title row Share button        | a lock glyph and `Share`; opens the Share dialog                                                                                                                                                                                                                                                                                                                              | `TitleRow.tsx:291-301`; `menus/model.ts:519`                                       |
| Share dialog                  | `Share <title>`; Links: View link `/deck/<id>` ("Read only, opens on slide 1"), Present link `/deck/<id>?present=1`, Edit link `/edit/<id>` ("Anyone with this link can edit"), Copy link each; the sentences "Turboslide has no accounts yet. Anyone who has a link can open it" and "Skipped slides and speaker notes are not included in the view and present links"; Done | `packages/chrome/src/dialogs/Share.tsx:6-32, 48-93`; `menus/strings.ts:102-112`    |
| File > Share                  | Share with others (the dialog), Publish to web                                                                                                                                                                                                                                                                                                                                | `menus/model.ts:555-559`                                                           |
| Publish to the web            | Link tab: the present link; Embed tab: the `/embed/<id>` iframe at Small 480 by 270, Medium 960 by 540, Large 1440 by 810 or Custom; Auto advance and Start slideshow disabled; "Every Turboslide presentation is reachable by anyone who has its link"; no Stop publishing                                                                                                   | `dialogs/Publish.tsx:8-14, 15-29, 152-168`; `strings.ts:113-121`                   |
| Extensions > Agent access     | the MCP address `/mcp?deck=<id>`, the API address `/api/actions`, the push and pull commands with this origin, Copy each, "A token is required and is never shown here"                                                                                                                                                                                                       | `dialogs/AgentAccess.tsx:7-25`; `ConnectCard.tsx:27-37`; `server/bundle.ts:60-105` |
| Toolbar Copy link             | copies `window.location.href` (the editor's own URL with its `?author=` when set) or the share sheet on a phone                                                                                                                                                                                                                                                               | `packages/chrome/src/Toolbar.tsx:486-500`                                          |
| Omitted title row items       | Star ("Starring needs a person to star for; there are no accounts"), Move, Meet, Record                                                                                                                                                                                                                                                                                       | `menus/model.ts:479-480, 490-491`                                                  |
| File > Email                  | Email collaborators omitted ("No mail service")                                                                                                                                                                                                                                                                                                                               | `menus/model.ts:563-569`                                                           |
| SPEC-2's deferred sharing row | "A display name, the view token and Stop sharing, a private flag" at the Share dialog, clause "Turboslide has no accounts yet", pointing at R10 C3 items 2 and 6                                                                                                                                                                                                              | `docs/gslides-parity/SPEC-2.md:805`                                                |
| Round one's decision          | 0.25: the three links ship; a revocable per deck view token with Stop sharing is a named later item because refusing requests without a token breaks every `/deck/:id` link and the Prototemplate embed                                                                                                                                                                       | `docs/gslides-parity/SPEC.md:45`                                                   |

The view and present links strip notes and skipped slides (`server/decks.ts:104-110, 129-131,
156, 516-519`); the print and presenter routes ask for them (`print.$deckId.tsx:35-39`;
`present.$deckId.tsx:29-33, 63`).

## 8. The comment stubs of round one

Every comment surface is a `later` row: present, disabled, tooltip "Not available in Turboslide
yet" plus the clause `COMMENTS_LATER = 'Leave a note in the speaker notes instead'`
(`menus/model.ts:384`). The parity audit asserts the disabled state and the clause
(`scripts/gslides-parity-audit.mjs:16-21`).

| Surface               | Row                                                                                                                                                               | Where                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Title row             | `title.comments` "Show all comments", icon `chat`, drawn `ariaDisabled` with the doc "Not available in Turboslide yet. Leave a note in the speaker notes instead" | `menus/model.ts:489`; `TitleRow.tsx:259, 280-289`               |
| View > Comments       | the submenu with Hide comments, Minimize comments, Expand comments, each `later`                                                                                  | `menus/model.ts:798-807`                                        |
| View > Mode           | Commenting omitted "Until comments exist"; Editing and Viewing are `now`                                                                                          | `menus/model.ts:825-838`                                        |
| View > Live pointers  | Show my pointer, Show collaborator pointers omitted "Needs presence (R10 C1)"                                                                                     | `menus/model.ts:808-820`                                        |
| Insert > Comment      | `insert.comment`, `later`                                                                                                                                         | `menus/model.ts:1025`                                           |
| Toolbar               | `toolbar.insertComment` "Insert comment", icon `chat`, key `Cmd+Option+M`, `later`; the same row in the toolbar tails                                             | `menus/model.ts:2014-2022`; `menus/toolbar-tails.ts:218-224`    |
| Context menus         | `insert.comment` as the last row of the filmstrip menu and of `emptyCanvas` (before Guides), `textBlock`, `image`, `shape`, `line`, `group` and `chart`           | `menus/model.ts:2137, 2154, 2169, 2188, 2207, 2221, 2239, 2256` |
| Shortcuts dialog      | the comment chords among the greyed rows                                                                                                                          | `docs/gslides-parity/SPEC-2.md:650`                             |
| SPEC-2's deferred row | "Comments (title row, View > Comments, Insert > Comment, the context rows)", clause as round one, design note "`ext.comments`; a display name step first"         | `docs/gslides-parity/SPEC-2.md:785`                             |
| Round one's rationale | "Comments are document data that can ship without accounts (R10 C3 item 4) and are not in the ten tasks"                                                          | `docs/gslides-parity/SPEC.md:124`                               |

No comment data type, mutation, action, panel or notification exists in the schema, the store or
the chrome (a search for `comment` in `packages/schema/src` finds only the list level docblock of
`blocks.ts:131`; the edit route has no match).

## 9. The picture block, the background fields and the dither

### 9.1 The document

| Field                                        | Meaning                                                                                                                                                                                                   | Where                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Slide.background?: { color }`               | the slide's own background colour, a palette token or a custom hex; "A background picture is a picture object at the bottom of the stack"                                                                 | `packages/schema/src/deck.ts:125-141, 449-453`                                                |
| `Deck.defaults.background?`                  | the background every slide without its own takes; what Add to theme writes                                                                                                                                | `deck.ts:80-87, 568-572`; `backgroundOf` at `:694-696`                                        |
| `Deck.defaults.appearance`, `defaults.notes` | the theme appearance every surface defaults to; a deck level notes default                                                                                                                                | `deck.ts:80-84, 551-560`                                                                      |
| `Slide.notes?: string`                       | speaker notes; the only place notes live                                                                                                                                                                  | `deck.ts:114-115, 430`                                                                        |
| `picture` block                              | a photograph as an object on a canvas slide: `asset`, `position` (the cover crop's anchor), the picture tools (`trim`, `mask`, `frame`, `adjust`), `side` (the plate side a material recipe composes for) | `packages/schema/src/blocks.ts:494-502, 1182-1315`                                            |
| `shot` block                                 | a figure with a caption and a frame, the same picture tools                                                                                                                                               | `blocks.ts:469-493, 1253-1295`                                                                |
| `dither` block                               | the round one dither figure (`fit: 'slot'                                                                                                                                                                 | { viewBox }`)                                                                                 | `blocks.ts:565-571, 1513`              |
| `material` block                             | a shader recipe (`materialId`, `preset`, `uniforms`, `anchor`, `twoTone`, `plate`) drawn live and captured to a frame                                                                                     | `packages/chrome/src/inspector/material.tsx:24-35, 58-66`                                     |
| `Asset`                                      | `{ id, role, alt, twins: { light, dark }                                                                                                                                                                  | { neutral }, size, scale, source, treatment?, sourceFile?, credit?, inline, metrics?, ext? }` | `packages/schema/src/assets.ts:92-116` |
| `Asset.treatment`                            | `two-tone` (`crop, channel, invert, blur, autocontrast 0.5, black, white, gamma, minFilter, unsharp, polarity, cell 2, bayer 8, resampler lanczos3`) or `continuous` (`quality 88                         | 92                                                                                            | 95`)                                   | `assets.ts:62-80, 162-228` |
| `Asset.sourceFile`                           | the kept continuous original a two tone treatment re-runs from; absent for the imported GT deck, whose sources were not committed                                                                         | `assets.ts:104-110`                                                                           |
| `Asset.metrics`                              | `litFraction`, `plateClear { plate, nearestLitPx, litUnder, litInBand }`                                                                                                                                  | `assets.ts:82-90`                                                                             |
| `Asset.source`                               | `material` (recipe key, renderer), `capture` (url, viewport), `photo` (origin, artist, license, shareAlike), `file`                                                                                       | `assets.ts:31-60`                                                                             |

### 9.2 The background dialog

`packages/chrome/src/dialogs/Background.tsx:19-27`: Colour (a swatch grid of the palette tokens
plus a custom hex, Done writes `slide.setBackground`, previewed through the editor's handle while
open), Reset to theme, Add to theme (`deck.setBackground`), and Image with Upload from computer
(the route's file picker, `input.uploadPicture({ kind: 'background', slideId })`, `:262-271`),
By URL (the Image by URL dialog with a `background` target, `:276-287`), the list of this
presentation's pictures (`:289-308`) and Remove for a covering picture already at the bottom of
the stack (`:40-57, 138-147`). Choosing a picture inserts a `picture` block at
`BACKGROUND_PICTURE_POS` and orders it to the back, converting the slide to the canvas first
(`:103-136`; the editor's `insertBackgroundPicture` handle when present). The context menu keeps
Change background and Guides one click away on a covering picture (`menus/model.ts:2189-2193`).

### 9.3 The two tone pipeline and its surfaces

| Piece                          | Fact                                                                                                                                                                                                                                                                                                                             | Where                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The stages                     | gray or one channel, crop, invert, minimum filter, blur, cover fit to 800 by 450 with Lanczos3, unsharp band, autocontrast 0.5 percent, black and white points and gamma through a LUT, the 8 by 8 Bayer screen at thresholds `(m + 0.5) / 64`, polarity, 2x nearest to 1600 by 900, both twins as 1 bit PNGs, the plate metrics | `packages/effects/src/two-tone.ts:1-11, 95-131`; `pipeline.ts:28-39`; `bayer.ts:1-58` |
| Backends                       | the napi addon, then wasm, then TypeScript; `TURBOSLIDE_EFFECTS_BACKEND` pins one                                                                                                                                                                                                                                                | `packages/effects/src/select.ts:1-56`                                                 |
| Export scale                   | `twoToneAtScale` scales the screen 2k times nearest for a 2x export                                                                                                                                                                                                                                                              | `two-tone.ts:133-140`                                                                 |
| The inspector's Dither section | controls generated from the treatment schema, a live preview from `dither.worker.ts` with the plate drawn over both twins and the lit metrics, Recapture writes `asset.dither`, Measure reads the committed twins back; without `sourceFile` it shows the committed twins and the recorded metrics only                          | `packages/chrome/src/inspector/dither.tsx:16-29, 46-70`                               |
| The worker                     | the same stages repeated stage by stage for the browser (the PNG encoder needs `node:zlib`); the source arrives as an `ImageBitmap`; twins come back as `ImageBitmap`s                                                                                                                                                           | `apps/studio/src/workers/dither.worker.ts:11-30`; `edit.$deckId.tsx:302-306`          |
| `asset.add`                    | a file, a data URL or an allowed URL through sharp; `twoTone: true` keeps the source as `assets/<id>.source.<ext>` at a long side of 1800 and cuts the twins with the treatment                                                                                                                                                  | `packages/headless/src/capture/intake.ts:34, 117-140, 143-170`                        |
| `asset.dither`                 | re-runs the two tone treatment of one asset or every two tone asset from the kept source and writes `asset.set`; a continuous treatment is refused here and goes through `asset.set`                                                                                                                                             | `packages/materials/src/actions.ts:119-160`                                           |
| Server side window actions     | `asset.add`, `asset.dither`, `material.capture`, `material.list` run on the server through `runDeckAction`; the editor waits for the write to come back over the watch channel before it answers                                                                                                                                 | `server/agent-actions.ts:39-50`; `edit.$deckId.tsx:1487-1519`                         |
| The Material section           | preset, uniforms, anchor, two tone toggle, plate; Capture runs `material.capture` and points the block or the picture at the frozen frame                                                                                                                                                                                        | `inspector/material.tsx:24-35`                                                        |
| The picture object's material  | a picture object whose asset is a material plays the shader live at its box (`data-recipe`, `data-live`, `MaterialMount`); the plate parameter is optional for a Choose image picture                                                                                                                                            | recorded, `docs/gslides-parity/SPEC-2.md:180`                                         |
| Picture tools                  | Replace image, Crop, Mask, Reset image, Frame (weight, colour, dash), Transparency, Brightness and Contrast (`block.adjust`), on a shot and a picture object                                                                                                                                                                     | `packages/chrome/src/inspector/picture.tsx:14-23, 212-278`                            |
| Export                         | a dither page is a 1 bit palette PNG by construction; a two tone picture is gated against the sheet shot; `slide.background = { color }` on a chrome free master, a picture object at its box, a covering one as the slide's fill; a background picture's trim, mask and adjust travel in the raster                             | recorded, `docs/pptx.md:216-226, 251-264, 323`                                        |

What does not exist for directive (4): a dither property on a picture object (the treatment lives
on the asset, so toggling a dither means a second asset or a re-treated asset with its source
kept); a strength control (the treatment has black, white, gamma, blur, min filter, crop and
polarity, not a single strength); the shader materials as a background control surface (a
material is a block or a captured asset; a background is a colour or a picture object); and an
export path for a live shader background (the exporter takes the captured frame).

## 10. The asset pipeline and where files live

| Step                      | Fact                                                                                                                                                                                                                                                                        | Where                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Inputs                    | a data URL (the pasted or picked file), an http(s) URL, or a path relative to the CLI's cwd; 25 MB cap on each                                                                                                                                                              | `packages/headless/src/capture/shared.ts:110, 121-160`                                             |
| URL allowlist             | `localhost`, `127.0.0.1`, `::1`, `generaltranslation.com`, `prototemplate.com`, `glyphfield.com`, `commons.wikimedia.org`, `upload.wikimedia.org` and their subdomains, plus `deck.json` `captureHosts` or `--allow`; only `http:` and `https:`                             | `shared.ts:72-107`                                                                                 |
| The fetch                 | `fetch(url, { redirect: 'follow' })`; the host check runs on the request URL, not on a redirect target; the length header and the body are capped at 25 MB                                                                                                                  | `shared.ts:142-148`                                                                                |
| Decoding                  | sharp reads the image; png, gif and svg stay lossless, everything else becomes JPEG at 95 with 4:4:4; a two tone source is resized to a long side of 1800                                                                                                                   | `intake.ts:34, 117-140`                                                                            |
| Path inputs               | an absolute path is read as given; on the HTTP transport the cwd is `repoRoot()`                                                                                                                                                                                            | `shared.ts:154-159`; `server/actions.ts:346`                                                       |
| The write                 | `asset.set` mutations as one `Write` through the deps' store; a held lease or a stale base is a `ConflictError`                                                                                                                                                             | `packages/materials/src/actions.ts:70-101`                                                         |
| Which store on the studio | `registerAssetActionsLazily` hands the asset actions the plain `FileStore` over the mirror folder (`storeFor`), while the document actions get the hosted store (`openDeckStore`); the asset files are written under `deckDir` and nothing pushes them to Blob in that call | `server/actions.ts:101-106, 335-358, 507-508, 567`; recorded in `docs/hosting.md:550-552`          |
| `slide.import`            | copies the referenced twins under the target deck and pushes them under its prefix on Blob                                                                                                                                                                                  | `server/actions.ts:435-477`                                                                        |
| Bundles                   | the unpack validates the manifest, every sha256, every asset's image signature (png, jpeg, gif, webp, svg, json) and the document before a byte is written; staging then rename; the archive may inflate to twice 200 MB; zip64 refused                                     | `packages/store/src/unpack.ts:67-150, 208-270`; `bundle.ts:159-224`; `docs/deck-transfer.md:34-46` |
| SVG                       | accepted by the sniff (`<svg` in the first 4096 bytes) and served same origin as `image/svg+xml`                                                                                                                                                                            | `bundle.ts:184-201`; `routes/decks.$deckId.assets.$.ts:21`                                         |
| Serving                   | a checkout streams `decks/<id>/assets/<file>`; hosted streams the overlay's twin or 302s to the public Blob URL; the GT twins are also CDN static files with a one hour cache                                                                                               | `routes/decks.$deckId.assets.$.ts:9-15`; `vite.deploy.config.ts:118-125`                           |
| The editor's file picker  | `pickPicture` opens an `<input type=file accept=image/*>`; the file reaches `asset.add` through `runDeckAction` as a data URL (the intake's `kind: 'data'`, `origin: 'pasted image'`)                                                                                       | `edit.$deckId.tsx:2497-2510`; `shared.ts:126-139`                                                  |

## 11. The render worker facade and the export records

| Fact                                                                                                                                                                                                                                                                     | Where                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| One client interface, two modes: HTTP when `TURBOSLIDE_WORKER_URL` is set (bearer `TURBOSLIDE_WORKER_TOKEN`), else a local queue in this process running the CLI as a child process or in process inside a function                                                      | `apps/render-worker/src/client.ts:1-8, 45-68, 295-374`; `cli.ts:232-271`                          |
| The local queue runs one job at a time in submission order; kinds `render, sheet, export, verify, measure`                                                                                                                                                               | `queue.ts:1-7, 12-13`                                                                             |
| `JobRecord = { id, kind, status, input, dir, createdAt, startedAt?, finishedAt?, ms?, result?, error?, log }`; no requester, no author; 200 finished records in memory, 500 log lines, `job.json` on disk; the id is `<base36 time>-<3 bytes hex>`                       | `queue.ts:17-30, 73-79, 86-88, 117-124`                                                           |
| The worker's HTTP routes: `/healthz` (open), `POST /jobs`, `GET /jobs[?kind]`, `/jobs/:id[/wait]`, `/jobs/:id/files/<path>`, `/cache/<path>`, `/render/:deckId/:slideId`; 1 MB bodies; paths confined to the job or cache directory                                      | `server.ts:1-17, 40, 108-133, 158-276`                                                            |
| The Docker image: Node 24, Chrome for Testing 147, LibreOffice, poppler, the export fonts; `TURBOSLIDE_WORKER_HOST=0.0.0.0`, port 4322, `/work` volume                                                                                                                   | `docker/render-worker.Dockerfile`                                                                 |
| The synchronous export: `runJob('export')` with a 780 s timeout, the files read back, stored under `exports/<deckId>/<jobId>/` on Blob (public URLs) or served from this instance's job folder on tmp and file; the job directory is pruned once the bytes are in memory | `server/export-sync.ts:78-82, 103-142, 165-227`                                                   |
| The `SyncExportResult`: `jobId, deckId, report, files[{ name, bytes, sha256, contentType, url?, stored? }], verify, worker, exec, renderer, ms, log`; the JSON variant and the `X-Turboslide-Export-Report` summary                                                      | `export-sync.ts:62-76, 331-374, 397-429`                                                          |
| The batched export: `plan.json` with the revision, the batches (60 slides, `TURBOSLIDE_EXPORT_BATCH`) and the pinned asset hashes; parts under `parts/`; `{ stale: 'revision'                                                                                            | 'asset' }`when the deck moved; the merge answers`peakMb`; job ids `b<base36>-<8 hex>`; 24 h prune | `server/export-batch.ts:41-80`; `docs/hosting.md:451-498` |
| The editor's export: `syncExport` or `runBatchedExport` server functions, the stored URL or the job file URL, a HEAD probe before the download, `pagehide` cancel with `keepalive` and no header                                                                         | `server/download.ts:148-169, 286-297, 299-387`; `edit.$deckId.tsx:2213-2226`                      |
| Thumbnails: `<state>/thumbs/<deck>/<revision>/<theme>@<width>/<slide>.png`, widths 160, 320, 640; a miss runs a Chromium render; `warmThumbs` renders every missing slide of a theme in one job                                                                          | `server/thumbs.ts:48-51, 113-131, 229-248, 290-380`                                               |
| Function budgets: base `maxDuration: 300`; `/api/export/**`, `/api/render/**`, `/_serverFn/**` at 800 s and 3009 MB; Nitro writes each rule as its own function copy                                                                                                     | `apps/studio/vite.deploy.config.ts:81-88, 127-134`; `docs/hosting.md:290-298`                     |

## 12. The audit scripts and the check steps

`scripts/check.mjs:68-151` is the chain (`node scripts/check.mjs --list` prints it numbered):

| Step   | Command (abridged)                                                                                                                                  | Needs         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1      | `pnpm install --frozen-lockfile`                                                                                                                    |               |
| 2      | `tsr generate`                                                                                                                                      |               |
| 3      | generated contracts tracked and `pnpm generate:contracts` leaves no diff                                                                            |               |
| 4      | `tsc -b`                                                                                                                                            |               |
| 5      | `pnpm test`                                                                                                                                         |               |
| 6      | `pnpm build && node scripts/check-client-bundle.mjs apps/studio/dist` (no server only marker, no Solid chunk, no `node:` builtin in a client chunk) |               |
| 7, 8   | the Prototemplate import and its counts                                                                                                             | prototemplate |
| 9      | `turboslide validate decks/gt-brand`                                                                                                                |               |
| 10, 11 | `turboslide render all` both themes and its record count (170, no page errors)                                                                      |               |
| 12     | `compare-to-shoot.mjs` at 0.5 percent                                                                                                               | prototemplate |
| 13, 14 | `turboslide sheet all` and its cells                                                                                                                |               |
| 15     | `turboslide lint all --json`                                                                                                                        |               |
| 16     | `turboslide build --budget 16`                                                                                                                      |               |
| 17     | `playwright test apps/studio/e2e/viewer.spec.ts`                                                                                                    | server        |
| 18     | `turboslide lint --chrome` on `/deck`, `/edit`, `/new`, `/decks` at 1440, 1280, 390 in both themes with the editor states                           | server        |
| 19     | `pnpm format:check`                                                                                                                                 |               |
| 20     | `node scripts/gslides-parity-audit.mjs --base http://localhost:4321 --out docs/gslides-parity/verification-2/parity-audit.json`                     | server        |
| 21     | the fifteen Playwright specs of rounds one and two                                                                                                  | server        |
| 22     | the fixture deck exported in both modes, `export check`, the flatten report perfect                                                                 |               |
| 23     | `turboslide fonts build --check`                                                                                                                    | python        |
| 24     | `node scripts/canvas-fidelity.mjs` on the GT deck and both templates at 0.5 percent                                                                 |               |
| 25     | the container verification in the render worker image                                                                                               | docker        |

The other scripts: `tooltip-audit.mjs` (every interactive element carries the Tooltip primitive;
run by the parity audit's step 8), `hosted-smoke.mjs` (ten rows against a deployment, `/api/agent`
expected 401, plus `deck.info` snapshots and the batched export with `--token-env`), `lint-packages.mjs`
(eslint per package against a baseline), `compare-to-shoot.mjs`, `editor-depth-drive.mjs`,
`judge-loop.mjs`. CI runs `pnpm check` on Ubuntu with Chrome for Testing
(`.github/workflows/check.yml`, untracked in the working tree at the time of reading). The tests
that touch identity and the network: `apps/studio/e2e/agent-http.spec.ts` (409 with the holder,
force, `unknown_field`, 401 off localhost, the agent's write shown in the editor within a second),
`deck-transfer.spec.ts`, `apps/cli/e2e/deck-transfer.mjs` and `mcp-http.mjs`,
`packages/store/src/hosted.test.ts` (two instances, leases across instances, the Blob races, the
snapshot round), `packages/agent/src/http/http.test.ts` and `sessions.test.ts`. No test measures
propagation latency between two browsers, and no test covers rate, size or abuse limits beyond
the body caps.

## 13. What the Vercel project has

Everything here is recorded in `docs/hosting.md`, `docs/HOSTED-STATUS.md` and
`docs/gslides-parity/VERIFICATION-2.md`; the dashboard itself was not read.

| Item                                     | State                                                                                                                                                                                                                                                                             | Where                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Project                                  | `turboslide`, root directory `apps/studio`, framework off, `NITRO_PRESET=vercel pnpm run build:deploy`, `pnpm install --frozen-lockfile`; production from the push to `main` at `turboslide.vercel.app`; previews by `vercel deploy --yes --archive=tgz` from the repository root | `apps/studio/vercel.json`; `docs/hosting.md:284-310`; `AGENTS.md` (Hosting)   |
| Functions                                | the catch all at 300 s; `/api/export/**`, `/api/render/**`, `/_serverFn/**` at 800 s and 3009 MB, each its own ~150 MB function copy with Chromium traced                                                                                                                         | `vite.deploy.config.ts:88, 127-134`; `docs/hosting.md:290-298`                |
| Blob                                     | `turboslide-decks`, `iad1`, public, connected for production, preview and development; `BLOB_READ_WRITE_TOKEN` on the three environments; the seed uploaded once                                                                                                                  | `docs/hosting.md:236-258`                                                     |
| Environment                              | `TURBOSLIDE_TOKEN` on production and preview (64 characters, never printed); `BLOB_READ_WRITE_TOKEN`; nothing else recorded (`TURBOSLIDE_DOWNLOAD_SECRET` is documented as optional and not recorded as set)                                                                      | `docs/hosting.md:317-357`; `VERIFICATION-2.md:395-401, 541`                   |
| Regions                                  | the Blob store in `iad1`, described as "the function's region"; no function region setting exists in the repository                                                                                                                                                               | `docs/hosting.md:241-242`                                                     |
| Deployment Protection                    | previews sit behind Vercel Authentication (the smoke script and the CLI send the OIDC token from `vercel env pull`); production does not, by design ("would protect the editor itself")                                                                                           | `docs/hosting.md:346-350, 381-385`                                            |
| Firewall, WAF, rate limits, CSP, headers | none in the repository; no `vercel.json` `headers`, no middleware, no Nitro route rule adds a header                                                                                                                                                                              | `apps/studio/vercel.json`; the search of section Summary item 8               |
| Observability                            | `vercel logs <url> --json`; the function logs the store selection, the seed, every worker job line, the launch steps and the sweep; the agent dispatch log needs `TURBOSLIDE_AGENT_LOG=1`                                                                                         | `docs/hosting.md:500-502`; `server/root.ts:86-88`; `actions.$action.ts:48-54` |
| Static assets                            | the GT deck's twins as public CDN files at `/decks/gt-brand/assets`, one hour cache                                                                                                                                                                                               | `vite.deploy.config.ts:118-125`                                               |
| A stray project                          | `studio` (`prj_g7MnEbMtpUvd4dBoCAGfSC0fiUfK`), empty, created by `vercel link --yes --project studio`; deleting it is Kevin's call                                                                                                                                                | `docs/hosting.md:571-573`                                                     |
| Production content at ship               | 15 decks on `deck.list` on 2026-09-13 at 10:55, one written by another author after the deploy                                                                                                                                                                                    | `VERIFICATION-2.md:896-898`                                                   |

## 14. The network surface for the threat model, as read

Each row is what the code does at `61b16e4`; none of it was exercised for this report.

| Entry                                      | Gate                                  | What an anonymous caller can do                                                                                                                                                                                                                    | Where                                                                                          |
| ------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Every page                                 | none                                  | read every deck (`/decks`), edit every deck (`/edit/<id>`), write as any label (`?author=`), empty the trash, download every bundle                                                                                                                | section 1.1                                                                                    |
| Every server function                      | CSRF middleware (origin), no identity | everything the editor can do, from any page of the same origin: writes, leases (with `force`), version saves, deck create, copy, trash, restore, remove, exports of 780 s, builds of 600 s, thumbnail warms, bundle tickets                        | `start.ts:12-18`; section 1.3                                                                  |
| `/api/render?w=`                           | none                                  | start one Chromium render per new deck, slide, theme and width (bounded by the deck's slides and cached per revision)                                                                                                                              | `render.$slideId.ts:28-35, 50-62`                                                              |
| `/api/export?cancel=`                      | none (job id)                         | cancel a batched job whose id is known                                                                                                                                                                                                             | `export.$deckId.ts:79-80, 306-310`                                                             |
| `/api/actions`, `/api/agent`, `/mcp`       | bearer, or localhost                  | with the token: every action of the table (105 ids, `packages/schema/src/actions.ts`), as any author, with `force`                                                                                                                                 | section 1.2                                                                                    |
| `asset.add` with `file`                    | bearer                                | read an absolute path on the server as an image (the intake resolves paths against the cwd and reads them; sharp then decodes)                                                                                                                     | `shared.ts:154-159`; `server/actions.ts:346`                                                   |
| `asset.add` and `asset.capture` with `url` | bearer                                | fetch from the allowlisted hosts; redirects followed after the host check                                                                                                                                                                          | `shared.ts:72-107, 142-148`                                                                    |
| `POST /api/decks/bundle` `{ url }`         | ticket or bearer                      | make the server fetch a 200 MB zip from `*.blob.vercel-storage.com` (redirects refused) and create a deck                                                                                                                                          | `bundle-core.ts:258-306`                                                                       |
| Bundle tickets                             | a server function anyone can call     | ten minute reusable tickets (the nonce is not spent); the upload ticket's subject is every deck                                                                                                                                                    | `bundle-core.ts:46-51, 93-120`; `server/bundle.ts:48-58`                                       |
| The `html` block                           | a write                               | stored markup rendered with a regex sanitizer (`<script>`, `<iframe>`, `<object>`, `<embed>`, `on*=` attributes and `javascript:` URLs removed; CSS scoped under a generated class); the M1 acceptance asserts `htmlBlocks === 0` on the GT import | `packages/render/src/blocks/html-escape.ts:1-3, 15-22, 26-48, 106-114`; `scripts/check.mjs:87` |
| SVG assets                                 | a write or a bundle                   | an SVG with script is accepted by the signature sniff, stored, and served same origin as `image/svg+xml` by the assets route (a checkout or the overlay) or by the public Blob URL                                                                 | `bundle.ts:184-201`; `decks.$deckId.assets.$.ts:21`                                            |
| Deck size                                  | 1 MB per write, no total              | a deck grows without bound one 1 MB write at a time; slides, versions and snapshots accumulate on Blob (snapshots pruned to 50 plus named)                                                                                                         | `dispatch.ts:21`; `snapshots.ts:21-30`                                                         |
| Blob costs                                 | none                                  | every list syncs every deck (one `head` each, a `list` and pulls when moved); every write is several `put`s; a deck from the GT template is about 290 `put`s                                                                                       | `blob-store.ts:1032-1042`; `docs/hosting.md:227-234`                                           |
| Temp volume                                | the sweep                             | renders, builds and exports fill `/tmp` (525 MB) until the sweep; decks created from the GT template (30 MB each) are never swept and end in `DiskFullError` 503                                                                                   | `server/root.ts:390-427, 728-740`; `docs/hosting.md:575-579`                                   |
| Secrets                                    |                                       | the bearer in the environment and `~/.config/turboslide/hosts.json`; the download secret optional; nothing in `deck.json`; the manifest never prints the token; the CLI never prints it                                                            | `docs/hosting.md:330-336`; `apps/cli/src/hosts.ts:1-6`                                         |
| Logging                                    |                                       | the agent dispatch log names the action, status, deck and author label under `TURBOSLIDE_AGENT_LOG`; the MCP log names the deck, author and tools per session; nothing logs a request's IP                                                         | `actions.$action.ts:48-54`; `mcp.ts:37, 41-46`                                                 |
| Dependency audit                           |                                       | no audit step in `check.mjs`; the lockfile is frozen on install                                                                                                                                                                                    | `scripts/check.mjs:69`                                                                         |

## 15. Facts the round three designers will reach for

- The page never holds a token: exports, renders, bundle downloads and uploads go through server
  functions and tickets (`docs/hosting.md:341-347`). A session cookie would have to fit beside the
  CSRF middleware, which today is the only thing a server function checks.
- Every write carries an `Author` already, every version record stores it, every lease names it,
  and every transport parses it the same way (section 3). A verified identity has a field to
  land in and eleven surfaces that already print the label (section 3.3).
- The long poll already returns the lease list and the records since a revision on every answer
  (`server/write.ts:422-434`); presence today is derived from leases alone, refreshed at most
  every 20 s and, on Blob, 3 s behind the store.
- The hosted store serializes writes per instance through a queue and across instances through
  `ifMatch` on `deck.json` (`blob-store.ts:256-263, 647-716`); two instances can each hold a
  session registry and an MCP session table (`globalThis`), and a download token's random
  secret is per process (`tokens.ts:39-41`).
- `SERVER_SIDE_WINDOW_ACTIONS` is the list of window actions that run on the server
  (`server/agent-actions.ts:39-50`); a comment, presence or share action that needs the store
  would join it, and the editor's `serverSide(...)` helper already waits for the resulting write
  to come back over the watch channel (`edit.$deckId.tsx:1487-1519`).
- `docs/hosting.md` section 8 (`:541-585`) is the builders' own list of what the hosting round
  left open: agent asset writes not pushed to Blob, the contract stubs hosted, one Chromium per
  instance, the Docker worker's folder never swept, the version log's contiguity after a failed
  push, no rate limits.

## 16. Unverified and open

- Whether an `asset.add` from the editor on the Blob backend reaches the store: the code hands the
  asset actions the plain `FileStore` (`server/actions.ts:567`), `docs/hosting.md:550-552`
  records that such writes are not uploaded, and no test or measurement in the tree settles what
  the next `BlobStore.write` from the same instance does with the mirror's unpushed record.
- Whether a download token minted on one hosted instance is honoured on another: the secret is
  random per process when `TURBOSLIDE_DOWNLOAD_SECRET` is unset (`tokens.ts:39-41`), and
  `docs/hosting.md:279` records the variable as optional without saying whether it is set.
- The Vercel dashboard's state beyond what `docs/hosting.md` records: function regions, Fluid
  compute settings, any Firewall rule, Deployment Protection on production. Nothing in the
  repository sets them.
- Propagation latency between two browsers on the Blob backend: the constants say up to 3 s plus
  the poll's return; no measurement exists.
- Whether a redirect from an allowlisted host can reach an internal address through the intake's
  `redirect: 'follow'` (`shared.ts:144`): read from the code, not exercised.
- Whether the SVG signature path is reachable from the editor's picker (the intake decodes with
  sharp, whose `format` may be `svg`; the bundle path accepts SVG by signature). Read, not run.
- Whether `.github/workflows/check.yml` is meant to be committed: it is untracked at `61b16e4`.

## Sources

Read on 2026-09-13 at `/Users/kevinliu/repos/Turboslide`, `main` `61b16e4`. No web page was
read for this report.

Code: `AGENTS.md`; `apps/studio/src/start.ts`; `apps/studio/src/routes/__root.tsx`, `index.tsx`,
`new.tsx`, `edit.$deckId.tsx` (lines 270-530, 670-760, 836-1280, 1480-1525, 1820-1850,
2210-2232, 2330-2365, 2470-2510, 2985-3095, 3185-3240, 3605-3818), `deck.$deckId.tsx`,
`embed.$deckId.tsx`, `present.$deckId.tsx` (1-70 and the author lines), `print.$deckId.tsx`
(1-45), `decks.index.tsx` (28-60, 86-110, 170-195, 326-334, 413-416, 775-779),
`decks.trash.tsx`, `decks.$deckId.assets.$.ts`, `mcp.ts`, `llms[.]txt.ts`, `openapi[.]json.ts`,
`api/actions.$action.ts`, `api/agent.ts`, `api/render.$slideId.ts`, `api/export.$deckId.ts`,
`api/download.$token.ts`, `api/decks.bundle.ts`, `api/decks.$deckId.bundle.ts`;
`apps/studio/src/server/actions.ts`, `agent-actions.ts`, `auth.ts`, `bundle.ts`,
`bundle-core.ts`, `contracts.ts`, `decks.ts`, `download.ts`, `export-batch.ts` (1-160),
`export-sync.ts`, `health.ts`, `hosting-plugin.ts`, `json.ts`, `render.ts`, `root.ts`,
`sessions.ts`, `thumbs.ts`, `tokens.ts`, `warm.ts`, `write.ts`;
`apps/studio/src/components/useStudioSession.ts`; `apps/studio/src/workers/dither.worker.ts`
(1-40); `apps/studio/vercel.json`, `vite.deploy.config.ts`, `package.json`;
`apps/render-worker/src/client.ts`, `queue.ts`, `server.ts`, `paths.ts`, `main.ts`, `cli.ts`
(1-60), `jobs/export.ts` (1-60); `docker/render-worker.Dockerfile`; `apps/cli/src/hosts.ts`,
`cli.ts` (188, 260-261); `packages/agent/src/http/auth.ts`, `dispatch.ts`, `errors.ts`,
`manifest.ts` (1-80), `readers.ts` (1-60), `sessions.ts`; `packages/mcp/src/http.ts`,
`server.ts` (author lines); `packages/store/src/store.ts`, `lease.ts`, `versions.ts`, `watch.ts`,
`file-store.ts`, `blob-store.ts`, `blob-vercel.ts`, `blob-disk.ts` (1-30), `hosted.ts`,
`snapshots.ts`, `select.ts`, `bundle.ts`, `unpack.ts`, `tmp-store.ts`, `templates.ts`;
`packages/schema/src/mutations.ts`, `errors.ts`, `assets.ts`, `deck.ts` (grep), `blocks.ts`
(grep), `actions.ts` (the id list); `packages/chrome/src/TitleRow.tsx`, `VersionsPanel.tsx`,
`HistoryPanel.tsx`, `ConnectCard.tsx` (1-60), `dispatch.ts` (19-21), `StatusChip.tsx`,
`Inspector.tsx` (lease lines), `Sidebar.tsx` (262-330), `Toolbar.tsx` (480-500),
`ExportMenu.tsx` (grep), `dialogs/Share.tsx`, `Publish.tsx`, `AgentAccess.tsx`, `Details.tsx`,
`Background.tsx`, `ImageByUrl.tsx` (1-60), `Open.tsx` (grep), `inspector/picture.tsx`,
`dither.tsx` (1-70), `material.tsx` (1-60), `menus/model.ts` (375-505, 790-850, 2005-2035,
2125-2265, the share and file rows), `menus/strings.ts`, `menus/toolbar-tails.ts` (218-224);
`packages/render/src/blocks/html-escape.ts` (grep); `packages/headless/src/capture/intake.ts`
(50-75, 118-175), `shared.ts` (72-160); `packages/materials/src/actions.ts`, `catalog.ts` (1-60),
`capture.ts` (1-50); `packages/effects/src/two-tone.ts`, `bayer.ts`, `pipeline.ts`, `select.ts`;
`packages/viewer/src/model.ts` (grep); `scripts/check.mjs`, `hosted-smoke.mjs` (1-60),
`gslides-parity-audit.mjs` (1-80), `canvas-fidelity.mjs` (1-50), `tooltip-audit.mjs` (1-40),
`check-client-bundle.mjs` (1-40), `lint-packages.mjs` (1-40); `.github/workflows/check.yml`;
`.gitignore`; `.vercelignore`; `decks/gt-brand/deck.json` (head).

Documents: `docs/hosting.md`; `docs/deck-transfer.md`; `docs/freeform.md`; `docs/pptx.md`
(grep); `docs/HOSTED-STATUS.md` (1-50); `docs/spec/SPEC.md` sections 11 and 12;
`docs/gslides-parity/SPEC.md` (grep); `docs/gslides-parity/SPEC-2.md` (0.32, 0.40, 8.2, the
deferred table at 778-810); `docs/gslides-parity/BUILD-STATUS-2.md` (1-60);
`docs/gslides-parity/VERIFICATION-2.md` (grep, 885-910);
`docs/gslides-parity/research/06-turboslide-inventory.md` (headings);
`docs/gslides-parity/research/10-identity-sharing-and-presence.md`.
