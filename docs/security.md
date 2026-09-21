# Security

The security platform of the third Google Slides parity round (`docs/gslides-parity/SPEC-3.md`
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
missing record as a 404) is dated by Kevin. `authorize()` runs in shadow mode on production for
the week of R3 and every denial it would make is one log line.

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

The twenty capabilities and the matrix are 6.2; the least role a capability needs is data in the
identity package. Deny by default: a caller who may not read a deck gets one 404 whether the deck
exists or not; a caller who may read but lacks the capability gets 403 with the capability named;
a request with no identity gets 401; a revoked publish token gets 410. Bodies are `{ error:
'not_found' }`, `{ error: 'forbidden', capability }`, `{ error: 'unauthorized' }`, `{ error: 'gone'
}` and carry nothing else.

| Variable                    | Values                        | What it does                                                                                                                                                 |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TURBOSLIDE_AUTHORIZE`      | `shadow` (default), `enforce` | `shadow` logs a denial as `authorize.deny` and lets the call proceed with the legacy role (`open: editor` for a deck without a record); `enforce` refuses it |
| `TURBOSLIDE_MISSING_RECORD` | `open` (default), `notFound`  | what a deck without a record means: today's open editor deck, or after R8 a 404                                                                              |

Where the call sits: every server function of `decks.ts`, `download.ts`, `bundle.ts`, `render.ts`
and `agent-actions.ts`; the routes `/api/actions/*`, `/api/render/*`, `/api/export/*`, the bundle
routes and `/api/x/*`; the assets route through the page's `assetBase`. B2's `write.ts`,
`sessions.ts` and the stream, ops and presence routes call the same function (their report names
the rows).

## 3. The WAF rules

`firewall/rules.json`: R1 to R21 and R16b of 8.3, R22 of the product round (`/api/assist` 30 per
60 s per IP, log mode first, docs/PRODUCT.md 6.3) plus the CLI and MCP bypass, in the shape the
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

The assistant's two rows (docs/PRODUCT.md 6.3): `assistCallsPerMinutePerDeck` (anonymous 6,
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

`apps/studio/src/server/flags.ts`. Thirteen flags (8.12; docs/PRODUCT.md 6.3, 6.4) read per request
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
id, role and a ten minute expiry from the `thumbGrant` server function); an unsigned request is 403
in enforce mode and served and logged in shadow mode. Bundle tickets carry the identity they were
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
pipeline for every picture: a size cap by tier (25 MB anonymous, 50 MB signed in, 5 MB avatar),
the magic byte sniff (png, jpeg, webp, gif; svg refused hosted), sharp 0.35.4 with
`limitInputPixels` at 64 megapixels and `failOn: 'error'`, HEIF and JXL blocked at process start,
animated GIFs flattened, a re-encode hosted so no byte of the input survives, digest named twins
through the store's `putAsset` with nothing ever overwritten. Above 3 MB hosted the presigned path:
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

| Variable                                                                                                                 | Where                                                 | Note                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURBOSLIDE_TOKEN`                                                                                                       | preview, production                                   | the bootstrap bearer; a different value per environment; per checkout token in `.turboslide/token`                                                      |
| `TURBOSLIDE_DOWNLOAD_SECRET`                                                                                             | every hosted environment, 16 bytes or more            | required on a `tmp` or `blob` store (a token minted on one instance verifies on another); a builder's dev server on the tmp store sets any 16 byte fake |
| `TURBOSLIDE_SESSION_SECRET`                                                                                              | every hosted environment, 32 characters or more       | the identity cookie's seal; a checkout keeps a generated one under `.turboslide/session-secret`                                                         |
| `BETTER_AUTH_SECRET`                                                                                                     | every hosted environment                              | the account sessions (B3)                                                                                                                               |
| `TURBOSLIDE_AUTHORIZE`                                                                                                   | production `shadow` for the R3 week, then `enforce`   | section 2                                                                                                                                               |
| `TURBOSLIDE_MISSING_RECORD`                                                                                              | after R8                                              | `notFound`                                                                                                                                              |
| `TURBOSLIDE_CSP`                                                                                                         | unset for the report weeks, then `enforce`            | section 8                                                                                                                                               |
| `TURBOSLIDE_TRUST_PROXY`                                                                                                 | a `node-server` deployment behind a proxy             | never on Vercel                                                                                                                                         |
| `TURBOSLIDE_EGRESS`                                                                                                      | unset                                                 | `open` only for a measurement                                                                                                                           |
| `TURBOSLIDE_WEB_SECURITY`                                                                                                | `strict` once the fixture renders                     | section 7                                                                                                                                               |
| `TURBOSLIDE_PUBLIC_STORE_HOST`, `TURBOSLIDE_PRESIGN_HOST`, `TURBOSLIDE_EMBED_ANCESTORS`                                  | when the stores and the customers exist               | section 8                                                                                                                                               |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                     | when the Upstash database exists                      | section 4                                                                                                                                               |
| `TURBOSLIDE_ASSIST`                                                                                                      | `fixture` on the enforce preview; unset in production | docs/PRODUCT.md 6.3: `fixture` answers every propose with a canned card, `off` refuses, unset runs the model when the key is set                        |
| `ANTHROPIC_API_KEY`                                                                                                      | production, set by Kevin on the Vercel project        | the assistant's model key (`ASSIST_KEY_ENV`); never on a preview, never printed; without it a propose answers 503 with the unavailable sentence         |
| `TURBOSLIDE_ASSIST_DAY_CAP`                                                                                              | production (GT sets 60); default 20                   | the anonymous tier's assistant calls per day (section 4)                                                                                                |
| `REDIS_URL`, `TURBOSLIDE_REALTIME`, `DATABASE_URL`, `RESEND_API_KEY`, `TURBOSLIDE_MAIL`, `TURBOSLIDE_BLOB_PRIVATE_TOKEN` | see docs/hosting.md                                   | B2's and B3's tiers                                                                                                                                     |

## 13. The check chain and the smoke

`pnpm check` is 28 steps (`node scripts/check.mjs --list`): step 6 also greps the sources for a
new `innerHTML` or public `overwrite: true` call site outside the allowlist and records the studio
function bundle's size beside the client's (`--greps` runs it alone); step 26 runs the round three
specs, `apps/studio/e2e/security.spec.ts` among them, against the runner's own dev server with the
memory channel, a checkout auth database and captured mail; step 27 is the layout shift audit
against the production preview; step 28 is the audit (`--audit` runs it alone).
`node scripts/hosted-smoke.mjs <url>` carries the security rows: the headers on four routes with
the `worker-src` assertion and the `/embed` exception, the json asset as an attachment, the cross
site `text/plain` POST refused, the unsigned thumbnail (403 in enforce mode, 200 and logged in
shadow mode), the CSP report endpoint; the `/s/` exchange, the 410 after unpublish, the private
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
