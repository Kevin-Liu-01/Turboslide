# Security

The security platform of the third Google Slides parity round (`docs/archive/gslides-parity/SPEC-3.md`
sections 6, 8 and 11.4; the threat model is `docs/gslides-parity/research-3/04-security-and-rate-limiting.md`
and its addendum `10-security-and-storage-addendum.md`). This page is the operator's reference:
what every request passes through, the tables the code reads, the variables each environment
sets, and the runbooks for an incident. Section numbers refer to SPEC-3 unless prefixed. Nothing
here prints a secret; a value is named by its variable.

## 1. The threat model in one page

Report 04 read the code as it stood after round two and found fifty three items, F1 to F53 with
the addendum. The ones that shaped this round:

- F1, F2, F12: every deck operation was open to every visitor, authors were self declared, one
  shared bearer served every agent. The answer is identity (an anonymous principal from a sealed
  cookie, accounts through better-auth, agent keys as records) and `authorize()` first in every
  server function and route (section 2 below).
- F4, F5: stored script through the `html` escape block (eight bypasses of the regular expression
  sanitizer) and through svg. The answer is three layers on the block (section 6) and svg refused
  on hosted transports and served as an attachment where a checkout keeps one.
- F3, F18: server side requests to internal addresses through `asset.add`, the bundle fetch and
  Chromium's subresources. The answer is one `safeFetch` with a pinned lookup, and Chromium's
  network closed during renders (section 7).
- F6, F7, F9: unmetered Chromium, sharp and Blob work. The answer is the WAF rules, the
  application quotas, the deck caps, the kill switches, the signed thumbnail URL and the export
  cancel token (sections 3, 4, 5, 9).
- F10, F11, F13, F15: error bodies with paths, forwarded host trust, cross site writes against a
  local studio, no headers and no CSP. The answer is the header middleware, the widened CSRF
  filter, the JSON content type rule, the browser `Origin` refusal and `TURBOSLIDE_TRUST_PROXY`
  (section 8).
- F17, F19: an old sharp, image-size through pptxgenjs, a per instance download secret. The
  answer is the catalog bumps, the audit step and `TURBOSLIDE_DOWNLOAD_SECRET` required hosted
  (section 10).
- F20: nothing was logged. The answer is one structured line per security relevant event with a
  keyed IP hash and the alert and retention tables (section 11).

The rollout order is 11.5: R0 (the day one edits) and R1 to R5 ship in this round's ship step,
R6 waits on Kevin's sending domain, R7 lands beside R5, R8 (enforcement of the CSP and the WAF, a
missing record as a 404) is dated by Kevin. `authorize()` ran in shadow mode on production from
the week of R3 until security hotfix H3 (2026-10-08), which removed the mode: every denial is
refused and logged on every deployment.

## 2. Authorization

`apps/studio/src/server/authorize.ts`. `authorize(ctx, deckId, capability)` loads the deck's access
record (`decks/<id>/.turboslide/access.json` on a checkout; B2's access store hosted, bound through
`bindAuthorize({ loadRecord })`) and asks the identity package's pure `decide()`
(`packages/identity/src/access.ts`, one assertion per cell in its test) for the decision. The
context of a request comes from `requestContext()`: the bootstrap bearer (`TURBOSLIDE_TOKEN`) as
the deployment admin, else the anonymous principal of the sealed `__Host-ts_id` cookie
(`apps/studio/src/server/auth/session.ts`), else a stranger. The author of every write is derived
from that context (`authorFor`): the anonymous label with the principal id, an agent's token id;
`?author=` and the body's author are never trusted for identity (8.2).

A signed in account is one person with the anonymous ids the alias table links to it (SPEC-3 7.4;
docs/archive/rounds/PEOPLE.md 3.6): its `Principal` carries `aliases`, and `standingOf` matches the record's
owner and grant holders against the account and its aliases, so a deck made before the sign in
keeps its creator as the owner. The `Principal` of an account also carries its verified address
and nothing else's: a pending grant by email admits the account whose address it names
(`isPendingEmailGrantFor`), and the studio binds the grant to the account's id at that first read
of the deck (`server/access.ts` `bindEmailGrants`, one announced record write; the store keeps no
index of grants by address, so nothing binds at sign in). An unverified address admits nobody.

The twenty capabilities and the matrix are 6.2; the least role a capability needs is data in the
identity package. Since the realtime round (docs/REALTIME.md 7.5) the `follow` cell admits every
editor and owner, by link and anonymous included, and never an agent (`packages/identity/src/access.ts`:
`follow` leaves `NOT_BY_LINK` for editor links); it is a client state and no server write, so no
authorization decision changes with it. Deny by default: a caller who may not read a deck gets one 404 whether the deck
exists or not; a caller who may read but lacks the capability gets 403 with the capability named;
a request with no identity gets 401; a revoked publish token gets 410. Bodies are `{ error:
'not_found' }`, `{ error: 'forbidden', capability }`, `{ error: 'unauthorized' }`, `{ error: 'gone'
}` and carry nothing else.

| Variable                    | Values                       | What it does                                                                                                                                                                 |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURBOSLIDE_AUTHORIZE`      | ignored since H3             | every denial is refused and logged as `authorize.deny`; a value other than `enforce` (production carries `shadow`) is logged once per process as ignored and changes nothing |
| `TURBOSLIDE_MISSING_RECORD` | `open` (default), `notFound` | a checkout's file store only: what a deck without a record means there (the folder holder's open editor deck, or a 404). A hosted store ignores it since H3 (below)          |

Every decision is enforced (security hotfix H3, DATA-1). The shadow mode of R3 let a denial
through with a floor role and production kept it, so a stranger who knew a deck id read, renamed,
copied, trashed and removed it. `TURBOSLIDE_AUTHORIZE` no longer weakens anything: `authorizeMode()`
answers `enforce` and logs a different value once. One context builder serves the routes and the
server functions (`requestContext()` is `room.ts` `requestIdentity`'s context: the bearer, the
account session, the sealed cookie and the link grants), so a signed in owner is the owner on
`/deck/<id>`, rename, trash and every other server function. An action that names a deck in its
input (`deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `slide.import`) is decided on the
deck it names as well as the one its transport addresses.

A deck without a stored record (security hotfix H3, DATA-V3; `server/access.ts`
`missingRecordRule`). On a hosted store the loader `authorize()` binds answers, in this order: the
seed deck (`gt-brand`) open to everyone as a viewer, read and copy, owned by nobody but the
deployment's admin; a deck the store does not hold as nothing, which `decide()` answers with the
same 404 a restricted deck gives a stranger; a deck whose first version record names a person (an
anonymous or an account principal id) restricted with that person as owner; any other deck closed
(restricted, no owner, the admin alone, and `admin.assignOwner` gives it to someone). The creator
and closed records are written once, so the rule runs once per deck. A new deck's record is written
before the deck (`createWithRecord`: the draft's first save, `deck.create`, `deck.copy`, the first
picture or logo on a draft), a request with no identity creates nothing (401), and a record is
never written over a deck the store already holds. `share.claim` is the admin's alone.

The ids of new decks are 128 random bits (security hotfix H3, DATA-V1; `server/root.ts`
`newDeckId`, 26 lower case base32 characters): the draft of /new (`untitled-<yyyymmdd>-<26>`),
`deck.create`, `deck.copy` and a bundle upload, whatever id the page sends; a taken id is passed
over for another fresh one and never named. The templates and the seed deck keep their slugs, and
the deployment's admin may still name an id on the agent surface. A deck a caller may not read
and a deck that does not exist answer the same status and body on every route and server
function: the decision runs before the store is asked whether the deck exists (the stream, ops,
presence and ticket routes, `deckRevision`), the record loader answers null for a missing deck
(one 404 from `decide()`), and `share.requestAccess` answers its one sentence for both.

No answer carries a path of this instance's file system (security hotfix H3, DATA-V6;
`server/paths-out.ts`): the create, copy, template and bundle answers drop `dir`, a standalone
build answers its file's name, and the job records, render records and export reports the
studio's routes and server functions pass on have every path under the instance's folders cut to
its last segment.

Where the call sits: every server function of `decks.ts`, `download.ts`, `bundle.ts`, `render.ts`
and `agent-actions.ts`; the routes `/api/actions/*`, `/api/render/*`, `/api/export/*`, the bundle
routes and `/api/x/*`; the assets route through the page's `assetBase`. B2's `write.ts`,
`sessions.ts` and the stream, ops and presence routes call the same function (their report names
the rows).

## 3. The WAF rules

`firewall/rules.json`: R1 to R21 and R16b of 8.3, R22 of the product round (`/api/assist` 30 per
60 s per IP, log mode first, docs/archive/rounds/PRODUCT.md 6.3) plus the CLI and MCP bypass, in the shape the
firewall API's `rules.insert` takes, every applied action `log`, and the `enforce` object per rule
holding the action of the R8 flip (429, deny 15 minutes or 1 hour, challenge). Counters are per IP
and per region, so each number sits about a third under the intended global one and is counted
again in the application. On a deployment without Redis the application count is per instance
and never reaches a limit (section 4), so these rules are the only limits that hold across
instances until Upstash is installed; a rate limit rule whose action is 429 (R1, R2, R5, R6, R10,
R12 to R15, R16b, R17, R18, R20) is recoverable for a browser and a CLI alike, so Kevin may flip
those before the deny and challenge rules finish their log week. The file is applied by the
integrator in the ship step through the API in log mode, if the plan accepts it; a refusal is
recorded, never worked around. The rule ids the API answers are written beside `appliedAt`. R19
(the WebSocket upgrade) is committed inactive for round four. `/api/x/csp/report` has no rule: the
endpoint keeps its own in process limit of 60 reports a minute per address.

The flip after the log week: `rules.update` per rule with the `enforce` object as the action, in
the `order` array's sequence, the bypass first; Bot Protection from log to challenge. Read the
Firewall traffic page per rule id first; a rule that fired on the editor's own traffic is a number
to raise, not a reason to skip the flip.

## 4. The application quotas and the deck caps

`apps/studio/src/server/ratelimit.ts`. `QUOTAS` is the table of 8.3: one row per quota with the
window and the three tiers anonymous, signed in and agent key. A refusal is 429 with `Retry-After`
and the row's sentence (`{ error: 'rate_limited', message, quota }`), logged once as `http.429` with
the quota under `rule`. `DECK_CAPS` are the caps independent of identity (500 slides, 400 blocks
per slide, 200 KB per slide document, 5 MB per `html` block, 25 MB of documents, 200 mutations per
write, 40 named versions, 600 grant holders, 50 live links and the rest of 8.3), checked in
`applyWrite` and at admission.

Backends behind one interface, bound once per process (`bindRateLimiter` in `start.ts`'s
`bindServerSeams`):

| Backend   | When                                                                                   | How                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `memory`  | the default: a checkout, the `tmp` store, the `blob` tier without Redis, the fallback  | a fixed window counter per key in this process                                                                           |
| `kv`      | `REDIS_URL` set (the `redis` tier): the room's ioredis client with `get`, `set`, `del` | a fixed window counter as JSON with the window's TTL; two instances racing admit one extra request per window            |
| `upstash` | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set                            | `@upstash/ratelimit` (sliding window, one instance per limit and window); a concurrency slot falls to the memory limiter |

The quotas hold hosted only with Redis. Without `REDIS_URL` and without the Upstash pair (the
degraded tier previews and production run on this round) the backend is `memory`, every function
instance keeps its own counters and Fluid compute spreads one caller's requests across instances,
so no windowed quota reaches its limit: the verifier sent 430 anonymous thumbnail renders against
the 400 per hour row in 79 s and every one answered 200 (VERIFICATION-3 finding 17). On that tier
the WAF rules of section 3 are the only limits that count across instances, and they limit only
after their flip from log mode to their action; until Kevin installs Upstash, that flip is the
rate limit of the deployment. What does hold on every tier: a row whose tier limit is 0 (an
anonymous invitation, an anonymous avatar upload) refuses at once, the largest picture is a size
compared per request, and the deck caps are checked against the document. A platform process
(`VERCEL` set) on the memory backend logs one `config.degraded` line at start naming the two
variables (`warnPerInstanceQuotas`); the `config-degraded` alert notifies and never pages, because
the degraded tier is a known state and one line per instance start is the instance count. A
checkout is quiet, tmp store or not: one process, so its counter holds. No counter runs over the
Blob store on purpose: a `BlobStore.write` per counted request would cost more than the request
it counts, and Blob commits are about 15 a second across a deployment (docs/hosting.md section 9).

The Upstash binding is written against the package's `limit()` shape and tested against a fake;
the account boundary of this round creates no Upstash database. To turn the shared counter on:
install Upstash Redis from the project's Storage tab (the fixed plan, 8.3: Upstash bills outside
Vercel's spend cap), which sets `REDIS_URL` (the `kv` backend binds over the room's client on the
next deploy) and, for the `upstash` backend, set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` from the same database; redeploy; the `config.degraded` line stops, and
the 401st anonymous render of an hour answers 429 with `Retry-After` and "Too many slide renders
this hour. Try again later" from any instance.

The assistant's two rows (docs/archive/rounds/PRODUCT.md 6.3): `assistCallsPerMinutePerDeck` (anonymous 6,
account 20, agent 60, per deck) and `assistCallsPerDay` (anonymous `TURBOSLIDE_ASSIST_DAY_CAP`,
default 20; account 300; agent 1000), refused with 429, `Retry-After` and "Too many assistant
requests. Try again in a minute" or "You have reached today's limit for the assistant"; counted on
a propose alone, on `/api/assist` and on the agent path. On the memory backend they count per
instance like every row above, so R22 is the limit that holds across instances until Upstash.

Where the quotas are counted: writes per minute per deck on every mutating window and HTTP
action; renders per hour on `render.slide` and `/api/x/render`; exports per day, the export
concurrency slot and standalone builds per day on every export path; deck creates per day on
`deck.create` and `deck.copy`; bundles per day and bytes per day on the ticket and the route;
pictures per day, bytes per day and the largest picture on the presigned route.

## 5. The kill switches

`apps/studio/src/server/flags.ts`. Thirteen flags (8.12; docs/archive/rounds/PRODUCT.md 6.3, 6.4) read per request
with a 5 second in process cache: `realtime`, `presence`, `comments`, `invites`, `email`, `exports`,
`uploads`, `renderThumbs`, `materialize`, `htmlBlocks`, `signup`, `readOnly`, `assist` (the
assistant's kill switch: off answers 503 with "The assistant is off on this Turboslide" on
`/api/assist` and the panel shows the sentence). Hosted, a flag lives at
`flag:<name>` in Redis and is read through the realtime channel's `flag()`; on a checkout and the
`tmp` store in `.turboslide/flags.json`. When the reader fails (Redis unreachable) the flag takes
the default of the table: `realtime` off (the `blob` tier), every other on, and the failure is one
`redis.unavailable` line. An off switch answers 503 with `Retry-After: 60` and one sentence
(`FLAG_REFUSALS`: "Downloads are paused right now. Try again in a few minutes", "This presentation
is read only right now"), logged as `flag.refused` with the flag under `killSwitch`.

### Runbook: flip a kill switch

1. Name the switch from the table above. `readOnly` stops every write; `exports` stops every
   export route and server function; `uploads` stops the presigned path and leaves the 3 MB path;
   `htmlBlocks` renders every `html` block as its note.
2. Run `turboslide admin flag <name> --on false` against the deployment with the bearer (or an
   admin key), or `POST /api/actions/admin.flag` with `{ "name": "<name>", "on": false }`. The
   answer names the flag, its value, its default and the store it was written to.
3. Every instance reads the change within 5 seconds; no deploy. The log shows one `flag.changed`
   line with the identity that flipped it and one `flag.refused` line per refused request.
4. Turn it back on the same way. On a checkout the file `.turboslide/flags.json` is the state and
   can be edited by hand.

## 6. The html block

`packages/render/src/sanitize/{html,css,frame}.ts` and `blocks/html-escape.ts` (0.27, 8.4).
Three layers, all three:

1. The parser at write time and at render time: DOMPurify 3.4.15 over jsdom on the server and the
   page's window in the browser, with the profile of 8.4 (`FORBID_TAGS` script, iframe, object,
   embed, base, meta, link, style, form, input, button, textarea, select, math; `style` attributes
   through the CSS value allowlist; `formaction` and `action` never; URI attributes limited to
   `https:`, `data:image/`, `#` and `assets/`), then the regular expressions of round one with
   entity decoding on every URI attribute. `sanitizeHtmlBlock` is the write time entry (B2's
   `applyWrite`, the bundle importer, B1's `html/sanitize` fix rule) and stamps `htmlSanitized:
true`; a block without the stamp is flagged by the linter until `turboslide fix` runs on the
   deck by hand, never inside `migrate`. The CSS tokenizer drops `@import`, `@font-face`,
   `@namespace`, any `url()` outside `assets/` and `data:image/`, `expression(`, `behavior:`,
   `-moz-binding`, `position: fixed` and `sticky`, and `!important` on `z-index`; `scopeCss` runs
   after it. DOMPurify and jsdom load lazily (`loadPurifier`) and only when a deck holds an `html`
   block; the render path uses the loaded instance when there is one and the regular expressions
   otherwise.
2. The sandboxed frame at render time: `<iframe class="ts-x-frame" sandbox="" srcdoc="...">` (no
   scripts, an opaque origin) whose document carries `<meta http-equiv="Content-Security-Policy"
content="default-src 'none'; img-src 'self' data: https://<public store>; style-src
'unsafe-inline'; font-src 'self' data:">`, the theme's sheet variables and reset, the block's
   CSS after the tokenizer and the scope prefix, and the sanitized markup with its images resolved.
   `htmlFrameFor(...)` is what every call site that renders a slide for a browser passes as
   `RenderOptions.htmlFrame`: the viewer, embed, present and print payloads do (`server/decks.ts`);
   the edit route, the render worker and the standalone build are requests to their owners. The
   PPTX and PDF exporters rasterize the block in Chromium as before, and the canvas fidelity gate
   proves the GT deck's four imported escape blocks render the same; a mismatch is fixed by
   extending the frame's theme CSS, never by weakening the sandbox.
3. The scheme check on every link: `run.link` and `BlockLink` accept `https:`, `http:`, `mailto:`,
   `tel:` and the slide forms in the schema and in `renderRuns`, rendered with
   `rel="noopener noreferrer"`.

Policy: in a deck shared beyond its owner, `html` blocks render only under the owner's "Allow
embedded HTML blocks in this shared presentation" switch; otherwise the block renders as its note
in a plate (`htmlBlockPolicy`). The `htmlBlocks` kill switch renders every block as its note.

## 7. Server side requests and Chromium's network

`packages/headless/src/capture/shared.ts` (0.30, 8.6). One `safeFetch`: the allowlist (exact
hostnames or an explicit `*.` prefix; `localhost`, `127.0.0.1` and `::1` out of the hosted list;
`deck.json` `captureHosts` for the owner's decks), the pinned lookup (`resolvePinned`: every
address a name resolves to is checked against the private, loopback, link local, multicast,
reserved, documentation and mapped ranges, and a name that resolves to any private address is
refused whole), the connection to the checked address with the name kept for TLS and the Host
header (`pinnedFetch` over `node:http(s)` with a pinned `lookup`, so nothing can change between the
check and the connect), `redirect: 'manual'` with at most three hops each re-checked and
re-resolved, `AbortSignal.timeout(20_000)`, and a counting stream that aborts past 25 MB. `file`
paths are refused on every studio transport (`allowPaths: false`). A refusal is one `ssrf.refused`
line that names the host and never the address.

Chromium: `openSheetPage` closes the network of every render, thumbnail and export context
(`denyEgress`: `file:`, `data:`, `blob:`, `about:` and the loopback names pass, every other request
is aborted with `blockedbyclient` and recorded), `TURBOSLIDE_EGRESS=open` restores the old
behaviour for a measurement; a capture context aborts requests to private and loopback hosts other
than the capture's own. `TURBOSLIDE_WEB_SECURITY=strict` drops `--disable-web-security` and
`--allow-running-insecure-content` from the serverless binary's switches; the default keeps them
until the verifier's preview run shows the `file://` subresource fixture rendering without them,
then the default flips (8.10).

## 8. Headers, CSP, CSRF and the agent surface

`apps/studio/src/server/headers.ts` and `apps/studio/src/start.ts` (0.31, 8.7, 8.8). The request
middleware runs in this order on every request: the principal middleware (the cookie), the
security headers middleware, the JSON content type rule, the CSRF middleware.

Headers on every answer: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` (`no-referrer` on `/s/*`), `Permissions-Policy`, `X-Request-Id`
(Vercel's id or one minted here; error bodies carry it and never a stack), `X-Frame-Options: DENY`
and `Cross-Origin-Opener-Policy: same-origin` on every route except `/embed/:id`,
`Cross-Origin-Resource-Policy: same-site` on the asset routes, `Cache-Control: no-store` on every
API and server function answer, `Strict-Transport-Security: max-age=63072000; includeSubDomains;
preload` on https. The CSP is nonce based (`__root.tsx` renders an inline boot script):
`default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self'
'unsafe-inline'; img-src 'self' data: blob: https://<public store>; font-src 'self' data:;
connect-src 'self' https://<public store> https://<presign host>; worker-src 'self' blob:;
frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
(the Prototemplate hosts on `/embed`); upgrade-insecure-requests` (hosted), shipped as
`Content-Security-Policy-Report-Only` with `report-uri /api/x/csp/report` until R8. The nonce is
minted per request into the request context (`context.nonce`); `getRouter()` hands it to
`ssr.nonce` and the root document to its boot script (a request to the integrator for the two
unowned files; until it lands the report endpoint records the inline boot script as a violation,
which is the expected noise of the report weeks).

| Variable                       | What it does                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `TURBOSLIDE_CSP`               | `report` (default) sends the policy as report only; `enforce` enforces it; `off` sends none               |
| `TURBOSLIDE_PUBLIC_STORE_HOST` | the public store's host for `img-src` and `connect-src` and the frame's policy                            |
| `TURBOSLIDE_PRESIGN_HOST`      | the private store's presign host for `connect-src`                                                        |
| `TURBOSLIDE_EMBED_ANCESTORS`   | a comma list of extra `https://` origins the embed may be framed by, beside the Prototemplate hosts       |
| `TURBOSLIDE_TRUST_PROXY`       | `1` believes `X-Forwarded-Host` and `X-Forwarded-For`; unset, a forwarded host can narrow and never widen |

CSRF: the middleware validates `Sec-Fetch-Site`, `Origin` or `Referer` on every server function
and on `/api/decks/*/{stream,ops,presence}`, `/api/comments/*`, `/api/share/*`, `/api/access/*`,
`/api/x/*`, `/api/avatar/*`, `/api/notify/*`, `/api/auth/*` and `/device`; on `/s/*` it guards
unsafe methods only, because the exchange is a GET that accepts top level navigations from any
origin. Every JSON route requires `Content-Type: application/json` for a body on an unsafe method
(415 otherwise; an empty body needs no type, so a bare agent POST and the pagehide cancel with
`keepalive` still work). The agent routes (`/api/actions`, `/api/agent`, `/mcp`) stay bearer surfaces
and refuse a browser `Origin` that is not the studio's own (403); agents send none. The cookies
are `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`.

### The CSP report weeks and the flip

1. Deploy with `TURBOSLIDE_CSP` unset (report only). The endpoint writes one `csp.report` line per
   report with the violated directive, the blocked URI's host, the document's path and the line.
2. Read the Drain for two weeks. Expected: the inline boot script until the nonce wiring lands,
   the TanStack devtools on a dev browser, nothing else. A report naming a shader worker or the
   Prototemplate embed is a directive to add, not a reason to drop the policy.
3. Set `TURBOSLIDE_CSP=enforce` on the preview first, walk the editor, then on production (R8).

## 9. Tokens, tickets and the window transport

`apps/studio/src/server/tokens.ts`, `bundle-core.ts`, `packages/agent/src/window/guard.ts` (0.32,
8.13). Download tokens are signed under `TURBOSLIDE_DOWNLOAD_SECRET`, expire after fifteen minutes
and are spent once; the spent set is per instance in memory and `dl:spent:<nonce>` in the redis
tier's key value client (`bindSpentSet`). The export cancel is `?cancel=<jobId>&ct=<token>` with an
HMAC over the job id minted with the plan; a bare job id is 403 (an agent's bearer still cancels).
The thumbnail variant of `/api/render/:slide?w=` takes the page's grant (`?s=`, an HMAC over deck
id, role and a ten minute expiry from the `thumbGrant` server function); an unsigned request with
no identity of its own is 403. Bundle tickets carry the identity they were
minted for and the route runs `authorize()` for it (`write` on a replaced deck, `exportNotes` on a
download). The window API refuses the share, comment, notification, account, admin and publish
actions unless the input carries the page's nonce, which the editor owner holds in a closure
(`createPageNonce`); the refusal is "This action is available from the presentation's own
controls" and agents use the HTTP and MCP transports for those actions.

### Runbook: rotate a secret

`TURBOSLIDE_DOWNLOAD_SECRET` (the download tokens, the cancel token, the thumbnail grant, the
upload tokens), `TURBOSLIDE_SESSION_SECRET` (the identity cookie), `TURBOSLIDE_TOKEN` (the bootstrap
bearer), `BETTER_AUTH_SECRET` (the account sessions). Every one differs between preview and
production.

1. Mint the new value: `openssl rand -hex 32`. Never paste it into a chat, a log or a commit.
2. `vercel env rm <VAR> <environment>` then `vercel env add <VAR> <environment>` with the value on
   stdin, from the linked repository root (docs/hosting.md section 6).
3. Redeploy the environment. Tokens minted under the old value stop verifying at once: an export
   URL a person is holding answers 404 and they export again; a session cookie sealed under the
   old session secret reads as no cookie and the next request mints a new anonymous principal (a
   signed in person stays signed in through better-auth's own session, whose secret is separate).
4. For `TURBOSLIDE_TOKEN`, update `~/.config/turboslide/hosts.json` on every operator's machine
   (`turboslide login` writes it) and the CI secret; the old value answers 401 everywhere within
   the deploy.
5. Confirm with `node scripts/hosted-smoke.mjs <url>`: every row green, `/api/agent` 401 without
   the bearer.

## 10. Uploads and the dependency gate

`apps/studio/src/server/upload.ts`, `packages/headless/src/capture/intake.ts` (0.29, 8.5). One
pipeline for every picture: a size cap by tier (25 MB anonymous, 50 MB signed in, 512 KB avatar
after the browser's 256 px resize, checked on the data URL string before any decode and again on
the bytes; `limitInputPixels` 1024 by 1024 for that path, docs/archive/rounds/PEOPLE.md 4.2), the magic byte
sniff (png, jpeg, webp, gif; svg refused hosted), sharp 0.35.4 with `limitInputPixels` at 64
megapixels and `failOn: 'error'`, HEIF and JXL blocked at process start, animated GIFs flattened,
a re-encode hosted so no byte of the input survives, digest named twins through the store's
`putAsset` with nothing ever overwritten. The avatar files land under the public `u/<avatarKey>/`
prefix of the public store on the blob tier, put once with a year of cache because the digest is
in the name and the key rotates on every change; a replaced picture can stay readable at its old
unguessable address until that cache expires, and only `admin.avatar.sweep` removes files under
`u/`, by key, never a sweep by date or name. Above 3 MB hosted the presigned path:
`POST /api/x/upload/picture` runs `authorize(write)`, the `uploads` switch and the picture quotas
and issues a ten minute token for `uploads/<principalId>/<uuid>`; the browser PUTs the bytes (on
the local backend to `/api/x/upload/put/<token>`, streamed under the cap and sniffed before it is
kept; the private store's client upload takes the same grant shape when the store exists);
`asset.add { upload }` reads the object, re-encodes, commits and deletes it; unclaimed uploads are
swept after 24 hours. Bundles stream with a per entry cap, records validate, `access.json` and
`leases.json` are dropped and the importer is stamped (B2's unpack).

`pnpm audit --prod --audit-level=high` is step 28 of `pnpm check` with `scripts/audit-allow.json`:
an advisory not listed there fails the step, and so does a listed one past its expiry. The catalog
pins sharp 0.35.4; image-size is removed from pptxgenjs's graph by a pnpm override
(`docs/gslides-parity/build-3/integrator.md` section 5); `@sparticuz/chromium` and Playwright are
bumped together when the pixel gates allow.

## 11. Logging, alerts and retention

`apps/studio/src/server/log.ts` (0.34, 8.11). One JSON line per security relevant event through
`console.log`, so the runtime log and a Drain both receive it: `{ t, source, event, requestId,
identity, ip, deckId, action, revision, bytes, ms, status, reason }` plus the per surface fields of
report 10 6.1 (`clientId`, `seq`, `opCount`, `streamMs`, `role`, `linkId`, `threadId`, `emailKind`,
`recipient`, `redisCmds`, `blobOps`, `uploadBytes`, `sniffedType`, `variantKey`, `rule`,
`killSwitch`). The client address is written as `<yyyymmdd>:<16 hex>`, an HMAC under a salt that
rotates daily and is discarded after 48 hours (`ipHash`), so the value is a same day correlation
key and nothing else once the salt is gone. An email address in any text field is written as
`[redacted]`; a link is named by its id and never its token; comment bodies never appear;
`process.env` is never printed. The event names are `SECURITY_EVENT_NAMES`; the alerts are
`ALERTS` (page on any sanitizer rewrite on a shared deck, any Chromium crash, any SSRF refusal,
`redis.unavailable`, a key rotation failure, a missing configuration; notify on the degraded quota
backend, the 429 and 403 rates, exports per hour, stream opens per minute, the ops reject ratio, the Redis budget, the mail
plan at 60 percent and ten confusable name rejections in an hour); the retention per class is
`RETENTION` (the ops stream 24 hours, presence 120 seconds, counters at most an hour, sessions 7
days idle, codes 10 minutes, versions 30 days then thinned, comments the deck's life with
tombstones, the inbox 500 unread and 5,000 total, requests 30 days, uploads 24 hours, exports and
bundles 7 days, the log 30 days, the salt 48 hours). Set a Drain to a 30 day store on the project;
runtime logs alone are one day.

## 12. The variables per environment

| Variable                                                                                                                                                           | Where                                                                                                                                                                                                 | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TURBOSLIDE_TOKEN`                                                                                                                                                 | preview, production                                                                                                                                                                                   | the bootstrap bearer; a different value per environment; per checkout token in `.turboslide/token`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `TURBOSLIDE_DOWNLOAD_SECRET`                                                                                                                                       | every hosted environment, 16 bytes or more                                                                                                                                                            | required on a `tmp` or `blob` store (a token minted on one instance verifies on another); a builder's dev server on the tmp store sets any 16 byte fake                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TURBOSLIDE_SESSION_SECRET`                                                                                                                                        | every hosted environment, 32 characters or more                                                                                                                                                       | the identity cookie's seal; a checkout keeps a generated one under `.turboslide/session-secret`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `BETTER_AUTH_SECRET`                                                                                                                                               | every hosted environment, one value per environment                                                                                                                                                   | the account sessions (B3); minted with `openssl rand -hex 32` into `~/.config/turboslide/better-auth.env` (600) and set by `scripts/hosting/realtime-env.mjs database` (the realtime round)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TURBOSLIDE_AUTHORIZE`                                                                                                                                             | none needed: ignored since H3                                                                                                                                                                         | section 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TURBOSLIDE_MISSING_RECORD`                                                                                                                                        | a checkout's file store only                                                                                                                                                                          | section 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TURBOSLIDE_CSP`                                                                                                                                                   | unset for the report weeks, then `enforce`                                                                                                                                                            | section 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TURBOSLIDE_TRUST_PROXY`                                                                                                                                           | a `node-server` deployment behind a proxy                                                                                                                                                             | never on Vercel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `TURBOSLIDE_EGRESS`                                                                                                                                                | unset                                                                                                                                                                                                 | `open` only for a measurement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `TURBOSLIDE_WEB_SECURITY`                                                                                                                                          | `strict` once the fixture renders                                                                                                                                                                     | section 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `TURBOSLIDE_PUBLIC_STORE_HOST`, `TURBOSLIDE_PRESIGN_HOST`, `TURBOSLIDE_EMBED_ANCESTORS`                                                                            | when the stores and the customers exist                                                                                                                                                               | section 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                               | never set in the Cloudflare phase (docs/CLOUDFLARE.md 4.4)                                                                                                                                            | section 4; the memory limiter per instance stays under the WAF rule R8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `TURBOSLIDE_ASSIST`                                                                                                                                                | `fixture` on the enforce preview; unset in production                                                                                                                                                 | docs/archive/rounds/PRODUCT.md 6.3: `fixture` answers every propose with a canned card, `off` refuses, unset runs the model when the key is set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `RAMP_ROUTER_API_KEY`                                                                                                                                              | production on both projects (2026-09-29)                                                                                                                                                              | the assistant's model key for the router (docs.router.com; `ASSIST_ROUTER_KEY_ENV`); never on a preview, never printed; wins over the Anthropic key                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TURBOSLIDE_ASSIST_MODEL`                                                                                                                                          | unset (the code names `gpt-6-luna`)                                                                                                                                                                   | the router model, an id from the router's GET /v1/models; docs/gslides-parity/product/assist-router.md is the benchmark behind the default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ANTHROPIC_API_KEY`                                                                                                                                                | unset; the Messages API path without the router                                                                                                                                                       | the assistant's model key (`ASSIST_KEY_ENV`); never on a preview, never printed; without either key a propose answers 503 with the unavailable sentence                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TURBOSLIDE_ASSIST_DAY_CAP`                                                                                                                                        | production (GT sets 60); default 20                                                                                                                                                                   | the anonymous tier's assistant calls per day (section 4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `REDIS_URL`                                                                                                                                                        | never set on either project (docs/CLOUDFLARE.md 4.4; the redis tier stays in the tree as code and is never deployed, 5.1)                                                                             | a value here would select the redis tier at the next deploy when nothing is forced (`select.ts`); `scripts/hosting/realtime-env.mjs status` reports it under the names that must be absent                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `TURBOSLIDE_REALTIME`                                                                                                                                              | unset on production after the flip (`realtime-env.mjs flip --tier do`), so `TURBOSLIDE_ROOM_HOST` selects `do`; `blob` is the rollback switch (`rollback`)                                            | docs/hosting.md 13.2 and 13.3; `do` forced without the three room variables and `redis` without `REDIS_URL` are a TypeError at the first request, so the removal and never a forced word (REALTIME.md 7.9)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `TURBOSLIDE_ROOM_HOST`                                                                                                                                             | preview, production, plain (`realtime-env.mjs do`, from `~/.config/turboslide/cloudflare.env`): `turboslide-realtime-preview.kk23907751.workers.dev` and `turboslide-realtime.kk23907751.workers.dev` | selects the `do` tier when nothing is forced (`select.ts`); the CSP `connect-src` gains its `https://` and `wss://` (`headers.ts`); which pages may open a socket is the room ticket's `org` claim, not the host (docs/CLOUDFLARE.md 3.3)                                                                                                                                                                                                                                                                                                                                                                                      |
| `TURBOSLIDE_ROOM_SECRET`                                                                                                                                           | preview and production, sensitive, each its own (`room.env` `_PREVIEW`, `_PRODUCTION`; the shared pair until production's rotation); the same value on that environment's Worker                      | the HMAC-SHA256 key of the room ticket (10 minutes, refreshed at `exp` minus 120 s and on a `reauth` frame; carried as the second WebSocket subprotocol or an `Authorization: Ticket` header, never a query string) that the Worker verifies with a constant time compare before a socket reaches an object; never logged on either host; `TURBOSLIDE_ROOM_SECRET_PREVIOUS` on the Worker during a rotation (docs/hosting.md 13.8)                                                                                                                                                                                             |
| `TURBOSLIDE_ROOM_BEARER`                                                                                                                                           | the same places as the ticket secret; `TURBOSLIDE_ROOM_BEARER_PREVIOUS` on the Worker and on Vercel during a rotation (taken, never sent)                                                             | the bearer of the function's calls to the Worker (`/rooms/:id/{write,comment,flush,external,publish,roster,document,counters,access-changed}`, `/control/{open,flags}`, `/db/counters`) and of the object's calls to the function (`/api/decks/:id/checkpoint`, `/seed`); its reach is every deck's order and no account row since AUTH-3 (a Worker without `TURBOSLIDE_DB_BEARER` still takes it on `/db`, as production does until its own rotation); one secret for both directions on purpose (docs/CLOUDFLARE.md 3.3); the agent surface's `TURBOSLIDE_TOKEN` never reaches the Worker; no host ever prints it or logs it |
| `TURBOSLIDE_DB_BEARER`                                                                                                                                             | the same places as the ticket secret (production from step 3 of docs/hosting.md 13.8); `TURBOSLIDE_DB_BEARER_PREVIOUS` on the Worker during a rotation                                                | AUTH-3: the bearer of `/db/query` and `/db/batch`, which run only the statements of `apps/realtime-worker/src/db-statements.json` (403 `statement_not_allowed` otherwise); its reach is what the accounts code does, which includes acting for an account whose id or address its holder knows (the next paragraph); the Worker logs a statement's kind, first table and digest prefix, never its text or parameters                                                                                                                                                                                                           |
| `TURBOSLIDE_ACCOUNTS`                                                                                                                                              | preview, production, plain: `d1` (`realtime-env.mjs database`)                                                                                                                                        | the accounts database is D1 bound to the Worker and reached through its bearer routes by the Kysely dialect `d1-proxy-dialect.ts` (docs/CLOUDFLARE.md 4.2); needs `TURBOSLIDE_ROOM_HOST` and `TURBOSLIDE_DB_BEARER` (the room bearer stands in before the database bearer is set) or throws at the first request; says nothing about the channel's tier                                                                                                                                                                                                                                                                        |
| `VERCEL_AUTOMATION_BYPASS_SECRET`                                                                                                                                  | the preview Worker's secret alone (`realtime-env.mjs worker-secrets --env preview` from `vercel-bypass.env`), after Kevin's project setting (docs/CLOUDFLARE.md section 6 step 15)                    | lets the object's callbacks (the seed and checkpoint routes) reach a Vercel preview behind Deployment Protection; never on the production Worker, never on a Vercel environment                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `TURBOSLIDE_APP_ORIGIN`, `TURBOSLIDE_PROTOCOL`, `TURBOSLIDE_ROOM_HINT`, `TURBOSLIDE_CHECKPOINT_IDLE_MS`, `TURBOSLIDE_CHECKPOINT_MAX_MS`, `TURBOSLIDE_BUILD_COMMIT` | the Worker's `vars` in `apps/realtime-worker/wrangler.jsonc` (not secrets); the preview's `TURBOSLIDE_APP_ORIGIN` and the commit are passed at deploy with `--var`                                    | the app the object calls back and the only `org` a production ticket may name (`/health` echoes it as `appOrigin`); the room protocol version; the object's placement hint (empty: none); the checkpoint cadence (2,000 and 10,000 ms; the cost lever of docs/CLOUDFLARE.md 2.2); the commit `/health` answers                                                                                                                                                                                                                                                                                                                 |
| `DATABASE_URL`                                                                                                                                                     | never set on either project (docs/CLOUDFLARE.md 4.4)                                                                                                                                                  | a self hosted Postgres keeps the `postgres` kind of `auth/db.ts`; production's accounts are D1 (`TURBOSLIDE_ACCOUNTS=d1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                                                         | preview, production, sensitive; from `~/.config/turboslide/google-oauth.env` (600) through `scripts/hosting/realtime-env.mjs google`, the value on stdin and never on a command line                  | the Google sign in (REALTIME.md 4.1; R4): the redirect URI `<origin>/api/auth/callback/google`, the scopes `openid email profile`, `prompt=select_account`, no offline access and no consent prompt; the two limiter rules `/sign-in/social` and `/callback/google` at 10 per 60 s                                                                                                                                                                                                                                                                                                                                             |
| `TURBOSLIDE_AUTH_HOSTS`                                                                                                                                            | when a deployment owns a host off the default list                                                                                                                                                    | the Host names better-auth's `baseURL.allowedHosts` accepts; the default is `www.turboslide.com`, `turboslide.com`, `turboslide.vercel.app`, `localhost:*`, `127.0.0.1:*` with `TURBOSLIDE_PUBLIC_ORIGIN` as the hosted fallback, so a Host the deployment does not own is refused (REALTIME.md 4.1; R4)                                                                                                                                                                                                                                                                                                                       |
| `TURBOSLIDE_ADMIN_EMAILS`                                                                                                                                          | preview, production: `kevin@generaltranslation.com`                                                                                                                                                   | the first sign in with a listed address is the admin (`auth/profile.ts` `adminEmails`); set by `realtime-env.mjs google`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`, `TURBOSLIDE_MAIL`                                                                                                        | `TURBOSLIDE_MAIL=off` on production until the Resend pair exists (`mail.env`, `realtime-env.mjs mail`); `capture` on previews                                                                         | `off` hides the email field and Google may be the only method (REALTIME.md 4.1, default 7.7); `capture` writes outgoing mail to the capture list; with the pair set and no forced value the sender is Resend (`auth/mail/mailer.ts` `selectMail`)                                                                                                                                                                                                                                                                                                                                                                              |
| `TURBOSLIDE_BLOB_PRIVATE_TOKEN`                                                                                                                                    | see docs/hosting.md section 10                                                                                                                                                                        | layout v2's private store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### The room bearer, the database bearer, the D1 routes and their rotation

The Cloudflare phase (docs/CLOUDFLARE.md 3.3, 4.1, 4.2) put the accounts database behind the Worker, and AUTH-3 (docs/hardening/research/auth-verify.md, 2026-10-08) found its first form open: `POST /db/query` and `POST /db/batch` ran any statement under `TURBOSLIDE_ROOM_BEARER`, the `session` table holds the session token in plain text, and one ticket secret and one room bearer served both environments, so a leak from any preview build reached production's accounts. Since AUTH-3 each environment holds three secrets of its own, from `~/.config/turboslide/room.env` (600) under `<NAME>_PRODUCTION` and `<NAME>_PREVIEW`: `TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_ROOM_BEARER` and `TURBOSLIDE_DB_BEARER`. `scripts/hosting/realtime-env.mjs` refuses to send a production value, the shared pair of before included, to the preview, and refuses a database bearer equal to its environment's room bearer. `TURBOSLIDE_ROOM_BEARER` is the bearer between the two hosts in both directions: the Vercel function's calls to the Worker's room and control routes, and the object's calls to the function (`/api/decks/:id/checkpoint`, `/seed`); its reach is every deck's order (a `/rooms/:id/write` is an admitted write) and no account row. `TURBOSLIDE_DB_BEARER` is the only bearer `/db/query` and `/db/batch` take once the Worker holds it, and those routes run only the statement skeletons of `apps/realtime-worker/src/db-statements.json`, which `apps/studio/src/server/auth/record-statements.test.ts` records from the accounts code: no schema statement, no pragma, no read of a whole session, account, user or verification table, and no write of anything but a parameter. What the database bearer still reaches is what the accounts code does: the library reads an account's sessions by user id and inserts a session, so its holder can act for an account whose id or address it knows, and three listed reads carry no key column (the API key cache's whole table of hashes, owners and scopes; the verification cleanup's expired rows, whose values are hashed codes and OAuth state; the captured mail list, which only the preview's capture mode fills). Removing that reach is AUTH-3's other option: better-auth on a D1 binding in the Worker's own runtime, or the session token hashed at rest. No value is ever typed, printed or logged: values reach Vercel through `vercel env add --sensitive` with the value on stdin (`realtime-env.mjs do`) and the Worker through `wrangler secret put <NAME>` with the value piped from the file (`realtime-env.mjs worker-secrets`). The agent surface's `TURBOSLIDE_TOKEN` never reaches the Worker: an agent's write enters through the Vercel actions route and is forwarded under the room bearer.

The logging rule on both hosts: the Worker logs a statement's kind, its first table name and, for a refused or unlisted statement, the first 12 hex characters of its text's SHA-256, never the text or its parameters (`apps/realtime-worker/src/db.ts`), never a ticket, never a bearer; the function's dialect (`apps/studio/src/server/auth/d1-proxy-dialect.ts`) logs nothing, and the one line the identity runtime writes when the proxy does not answer carries the route's status and the Worker's sentence, never a parameter or the bearer (`identity.ts` `accountSession`, at most once a minute). The e2e seed's d1 mode reads the captured code and the alias through the same route with the bearer in its environment and prints neither the bearer nor the host's secrets.

Runbook: docs/hosting.md 13.8 is the rotation of all three secrets, and it refuses no call. The receiver of a secret takes a second value while a rotation is in flight, `<NAME>_PREVIOUS`, and never sends it: the Worker for all three (`TURBOSLIDE_ROOM_SECRET_PREVIOUS`, `TURBOSLIDE_ROOM_BEARER_PREVIOUS`, `TURBOSLIDE_DB_BEARER_PREVIOUS`) and the app for the room bearer (`TURBOSLIDE_ROOM_BEARER_PREVIOUS`), which both hosts send. The order: mint the new values (`realtime-env.mjs mint --environments <e>`); give the app the coming room bearer as its partner (`app-partner`) and deploy; switch the Worker while it keeps taking the old values (`worker-secrets`, with `--from-shared` for the move off the shared pair); switch the app (`do --force`, which waits for the Worker's `/health` `db: rotating` or `own` on production; then `app-settle`) and deploy; delete the Worker's previous names (`worker-settle`). `/health` answers `db: rotating` while the Worker's window is open and `realtime-env.mjs status` names the app's partner while it stands. A rotation on a suspected leak takes the same steps at once; the window is the time between them, not a deploy. A Worker rollback to a version from before AUTH-3 needs the shared pair back on the Worker first (`realtime-env.mjs worker-rollback`), since that code knows neither the database bearer nor the previous names. The hand switch for a statement the allowlist misses is the Worker secret `TURBOSLIDE_DB_STATEMENTS=report` (the statement runs and is logged), deleted once the list carries it.

### The count of the statements outside the list (HR-K2#3)

The list has been enforced on both Workers since AUTH-3, so a statement the recording missed is refused with 403 and the sign in path that sent it fails for the people who reach it. Since HR-K2#3 the Worker also counts each such statement in `ts_db_unlisted` (`apps/realtime-worker/migrations/0004_db_unlisted.sql`): per digest (the first 12 hex characters of the text's SHA-256, as the 403 answer and the log line carry it), its kind and first table name, how many times it was refused and how many times it ran under `TURBOSLIDE_DB_STATEMENTS=report`, and the first and last time; never the text and never a parameter, and at most 500 rows. `GET /control/db-unlisted` answers the rows under the database bearer (the room bearer only on a Worker that has no database bearer), and `node scripts/hosting/realtime-env.mjs db-unlisted [--env preview]` prints their number, with `--digests` one line per digest. A number above zero names a statement to record (`record-statements.test.ts` with `TURBOSLIDE_RECORD_STATEMENTS=write`) or a caller to find; the digest is `statementDigest` of the text. The migration runs on both databases (`realtime-env.mjs worker-migrate`, then with `--env preview`) before the push that reads the table; until then the route answers 503 and the count is a log line alone.

What a WAF rule cannot do here: the Worker answers on its `workers.dev` hostname, and a Cloudflare WAF rule in front of `/db/*` needs a zone the account does not hold (`turboslide.com` is at the registrar; docs/CLOUDFLARE.md section 8 question 2), so the bearer's constant time compare in the Worker's router is the only gate on the route until a zone exists; the Worker's daily request cap is the exposure a stranger can spend against the hostname (CLOUDFLARE.md 1.3).

## 13. The check chain and the smoke

`pnpm check` is 28 steps (`node scripts/check.mjs --list`): step 6 also greps the sources for a
new `innerHTML` or public `overwrite: true` call site outside the allowlist and records the studio
function bundle's size beside the client's (`--greps` runs it alone); step 26 runs the round three
specs, `apps/studio/e2e/security.spec.ts` among them, against the runner's own dev server with the
memory channel, a checkout auth database and captured mail; step 27 is the layout shift audit
against the production preview; step 28 is the audit (`--audit` runs it alone).
`node scripts/hosted-smoke.mjs <url>` carries the security rows: the headers on four routes with
the `worker-src` assertion and the `/embed` exception, the json asset as an attachment, the cross
site `text/plain` POST refused, the unsigned thumbnail (403 or 401; a 200 or a 302 fails the row
since H3), the CSP report endpoint; the `/s/` exchange, the 410 after unpublish, the private
document 403 and the twin URL derivability rows are listed as skipped until their flags and stores
exist, never as passed.

## 14. What this round leaves

Chromium in a function or worker without `BLOB_READ_WRITE_TOKEN` and the bearer (8.10, round
four's first item); the WebSocket transport and R19; the private store and the storage layout v2
(the migration of 11.5 runs on the preview store first); the Upstash limiter and the Redis kill
switch reader bound to a live database; the CSP nonce wiring in `router.tsx` and `__root.tsx`; the
`html` block frame in the edit route, the render worker and the standalone build; the nonce guard
set on the editor's adapter; the `sanitizer.rewrite` line from `applyWrite`. Each is named with
its owner in `docs/gslides-parity/build-3/b4.md`.

## 15. Stored data (hardening lane SD)

The thumbnail cache rule (HR-SD#5, CRIT-M2). The CDN keys an answer by its URL, and a thumbnail URL carries no identity, so until HR-SD#5 a restricted deck's thumbnail that its owner fetched (`public, max-age=31536000, immutable` with `r`, `public, s-maxage=60, stale-while-revalidate=86400` without) was served from the CDN to the next requester of the same URL without passing `authorize`. The rule is now the reader's standing (`apps/studio/src/server/thumbs.ts` `thumbCacheControl`), as a deck read's is (`decks.ts` `setDeckCacheHeader`). A reader who reached the deck as anyone would, through its general access (`via: 'open'`) or the published player (`via: 'publish'`), keeps the two public values. A URL that carries the thumbnail grant (`s`) answers `public, s-maxage=<seconds the grant has left>`, or at most 60 for an answer that is not the URL's current pixels, never `immutable`. Every other reader (the owner, a grant or link holder, an agent, the admin) and every 302 to the stored object answer a `private` rule: the 302 names the stored object's URL, which no shared cache may hand on and which the storage migration deletes. For those readers a stamped answer of the current pixels (`r`, as each card on `/decks` asks) is kept by the reader's own browser alone, a body as `private, max-age=31536000, immutable` and a 302 as `private, max-age=3600` (an hour, because the migration's `delete` removes the public copy the redirect names); every other answer is `private, no-store`. Before that rule the owner's cards asked the function again on every visit to `/decks` (verifier pass 1: 4 of 5 thumbnail requests reached the server on the second visit, against 1 of 5 on `origin/main`). Pins: `render-thumb-cache.test.ts` (the route, one reader per standing) and `thumbs.test.ts`; the hosted smoke rows `access answer reads enforce`, `restricted thumbnail private` (a scratch deck the smoke makes with the bearer and removes in the same run, `scratch deck removed`) and the restated `thumbnail with r twice` (asked with the smoke's own identity cookie on the open seed deck).

The assets route by key (HR-SD#6, CRIT-M3). `GET /decks/<id>/assets/*` ran no identity check and no `authorize`, so anyone who knew a deck id and a file name read its twins, and after HR-K1#3 its 302 would have handed out the deck's asset key. The rule is `apps/studio/src/server/twin-access.ts`. A keyed deck's twin is served at `/decks/<id>/assets/<assetKey>/<file>` by the key alone, as the store's own URL serves it. On the blob store, where a keyed deck's twins live under its key, a request by the file name is served only to a reader the deck admits (`authorize(read)`), with `private, max-age=60`, and anyone else gets the answer a missing file gets (404, `Not found`, no location). A deck without a key of its own keeps its names until `migrate-storage rekey` and `delete` move its twins, a checkout keeps its folder rule, and a tmp store keeps names. The name stays open to the deck's readers because the editor and the presenter still build `/decks/<id>/` on the client; once they take the loader's keyed base, the name answers 404 to everyone. Pins: `twin-access.test.ts` (the rule and the route over a fake blob store) and the hosted smoke row `asset by name 404` (a picture on the scratch deck: by name with no identity 404, by key the picture or a 302 to the keyed store path; deployments alone).
