# Realtime architecture for live multiplayer editing

Report 02 of the Turboslide Google Slides parity round three, written 2026-09-13 over `main` at `61b16e4`. It answers one question: how several people, and the agents beside them, edit one deck at the same time on the architecture Turboslide has today (TanStack Start 1.168.50 on Vercel Functions with Fluid compute, a Vercel Blob store with immutable per revision documents, an editor with optimistic writes, a long poll for external revisions, advisory leases), what each candidate transport and merge model costs on Vercel, and which design to build.

Part 1 is Turboslide read from the code. Parts 2 to 6 are the comparisons the task names: the change feed options on Vercel (a), CRDT against OT against server serialized operations for the block document and its text (b), the presence channel (c), how Google, Figma, tldraw, Excalidraw and Liveblocks resolve the same problems (d), and the local checkout and agent story (e). Part 7 is the recommendation with numbers and risks. Part 8 lists what could not be verified. Part 9 lists every source with its URL and the date it was read.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings. No account was signed in; every external fact comes from a public documentation page, help page, engineering post, paper or repository, read on 2026-09-13 unless the source entry says otherwise. No Google icon or artwork is reproduced. Source keys resolve in Part 9: V for Vercel pages, F for framework pages (TanStack, Nitro, crossws, MCP), T for third party vendors, E for engineering posts and papers, G for Google help pages, L for local files.

## 0. The recommendation in one page

1. Keep the document model and the mutation language. The deck stays a JSON block document written through the fifteen mutation ops of `packages/schema/src/mutations.ts`, applied by `applyWrite`, validated, and logged as `versions/<n>.json`. No CRDT replaces the document. The reasons are in Part 3: the validator's invariants, the agent action table, undo as inverse mutations, the version log and the export paths all rest on that language, and the products that ship this class of editor (Figma, tldraw, Liveblocks Storage) chose a central server ordering operations with last writer wins per property over a general CRDT (E1, E3, E6).

2. Add an operation stream in front of the revision log. Today every write is one Blob commit (five advanced Blob operations, four of them sequential HTTPS calls) and every other tab learns of it through a 3 s poll (L3, L7). Vercel Blob caps a Pro store at 75 advanced operations per second for the whole deployment (V5), so per keystroke commits through Blob cannot work for more than a handful of typists, whatever the latency. The design therefore has two paths: an operation stream per deck that orders and fans out operations within about 100 to 200 ms, and the existing revision log, written by a checkpointer at most every few seconds per deck. Every accepted operation reaches the revision log; the client holds an operation until a checkpoint covers it, so no accepted keystroke is lost even if the stream is lost.

3. The stream's ordering authority is an external store with atomic operations, not function memory. A Vercel Function instance shares nothing with the next one and a client's next connection may reach another instance (V2). The default store is Redis through the Vercel Marketplace, on a free tier (Upstash: 500,000 commands per month free, then $0.20 per 100,000, or a fixed $10 per month plan with unlimited commands; Redis Cloud: 30 MB free) (T7, T9, V11). Without Redis the same code runs a reduced mode over Blob alone (1 s polling, no cross instance presence) and on a local checkout it runs in process. Ably, Pusher, Liveblocks, Supabase Realtime and Cloudflare Durable Objects plug in behind one `RealtimeChannel` interface; their numbers are in Part 2.6.

4. Transport: Server-Sent Events down, POST up, on every tier, with WebSockets as a later swap for the presence channel. Vercel Functions serve WebSockets since the 2026-06-22 public beta and Nitro 3 bridges them through crossws (V2, V4, F3), but TanStack Start's own server routes do not upgrade a connection and the maintainers have not committed to a date (F1, F2), and the dev server does not run Nitro. SSE works on the dev server, on Vercel, through the CSRF middleware, and reconnects with `Last-Event-ID` on its own. Both transports die at the function's `maxDuration` (300 s default, 800 s Pro maximum) and reconnect (V1, V2).

5. Merging: server side transformation of text operations, last writer wins per JSON pointer for everything else, re-anchoring for structural operations. `text.replace` and the mark operations of one Text are transformed at admission against the operations committed since the client's base (the client server form of OT, which needs only the first transformation property because one server orders everything, E11). Concurrent `block.set` of one pointer: the later arrival wins, as in Figma and Liveblocks (E1, E6). `slide.insert`, `block.insert` and `block.move` re-resolve their `after` anchor; an operation whose target no longer exists is returned to its author with its content, never dropped silently.

6. Presence is a separate ephemeral channel: cursor, selection, active slide, caret, follow target, display name and colour, throttled to one message per 50 to 80 ms per client, heartbeat every 5 s, stale at 30 s, never written to Blob, capped at 20 live pointers as Google caps it (V9, V10, E9, G1).

7. No hard locks for humans. Google, Figma, tldraw and Excalidraw have none (L9 A5, E1, E3, E4). The "being edited by" outline comes from presence. Leases stay as the agents' soft lock (SPEC 6.7), bound to the holder's presence heartbeat instead of a ten minute clock.

8. Agents and the local checkout ride the same two paths. `POST /api/actions` and `/mcp` admit operations through the stream and force a checkpoint, so an agent's write appears in every editor within the stream's latency and still answers a revision. The `baseRevision` conflict rule becomes "a slide you touched changed since your base", which is what the editor already applies client side; `strict: true` keeps the exact revision check. `turboslide deck follow` subscribes a checkout to a hosted deck's events and applies version records forward byte for byte; the MCP server gains `resources/subscribe`.

Costs for a sales team of ten concurrent editors, eight hours a day, twenty two days a month, on Vercel Pro in `iad1`: Fluid compute in the order of $5 to $15 per month for the always open streams, invocations under $5, Blob under $10 with checkpoint coalescing, Redis $0 to $10 (Part 7.10). The same load on Liveblocks is about $218 per month, on Ably about $45, on Pusher $49, on Supabase Realtime about $33, on Cloudflare Durable Objects about $5 plus a second cloud account (Part 2.6).

## 1. What exists at 61b16e4

### 1.1 The document and the mutation language

`packages/schema/src/mutations.ts` (L1) defines the `Mutation` union of fifteen ops: `slide.insert`, `slide.remove`, `slide.move`, `slide.set`, `slide.replace`, `block.insert`, `block.remove`, `block.move`, `block.set`, `text.replace`, `section.set`, `asset.set`, `asset.remove`, `deck.set`, `version.restore`. Four address fields by JSON pointer (`slide.set`, `block.set`, `deck.set`, and `text.replace` which names the Text's pointer). A `Write` is `{ baseRevision, author, note?, mutations }` and is applied atomically by `applyWrite` in `packages/schema/src/reduce.ts`: a stale `baseRevision` returns the current document as a conflict, a mutation that throws or a result that fails validation returns `invalid`, a success bumps `revision`, returns the inverse mutations and the log entry (L2).

`text.replace` is documented as "typing, coalesced; range is [start, end) in the markup string at `path`" with a `Text` payload (L1). The Text is a markup string (`packages/schema/src/text.ts`, L5): `*display*`, `[text](url)`, `[text]{marks}` with the marks `i u s sup sub c:<color> h:<color>`, escapes, a standalone `GT` word, and `\n` as the paragraph break in the multiline pointers. The range operations `styleRange`, `caseRange` and `insertAt` in the same file work in plain text offsets ("in the plain text of the Text", SPEC-2 3), so today two offset systems exist: `text.replace` counts markup characters and `text.style` counts plain characters.

The editor emits typing as one `text.replace` per 400 ms pause per block (`TEXT_BURST_MS = 400`, `textBurstMutation`, `textDiff` in `packages/viewer/src/InlineText.tsx`, L6; SPEC 6.7, L10), and a whole text commit or a slide field (the title slide's heading and lead, the statement slide's `big`) as a `block.set` or `slide.set` of the whole markup (`textCommitMutation`, L6). Marks are applied by rewriting the whole markup string through `serializeRuns` (L5).

### 1.2 The write path

`apps/studio/src/routes/edit.$deckId.tsx` (L7) holds the controller. `commitAs` applies the write through `applyWrite` in the browser, pushes a history entry, publishes the new document, and enqueues the write; `pump` sends the queue one write at a time to the `writeDeck` server function (`apps/studio/src/server/write.ts`, L8) and waits for each answer. A `StaleMirrorError` from the Blob store is retried up to six times at 1,500 ms times the attempt (`WRITE_RETRIES`, `WRITE_RETRY_MS`). A conflict answer carries `current`, `currentRevision`, `holder?` and `since` (the version records after the caller's base); `onConflict` replays the pending writes on the current document when no slide is touched by both sides and neither side made a deck level change, and otherwise shows the conflict card with Rebase and Discard and rejects the pending writes. Undo and redo are forward writes of the inverse mutations. `commitServerFirst` sends `version.restore` without the optimistic step.

The one implementation rule of SPEC 7.1 holds: every editor gesture, every `window.turboslide.studio` action, every CLI command and every MCP tool is one action of `packages/schema/src/actions.ts` dispatched through `@turboslide/agent/dispatch` and applied through `applyWrite` in the store (L11 "The agent surface").

### 1.3 The Blob store's commit protocol and what it costs

`packages/store/src/blob-store.ts` (L3) is a `FileStore` over a `/tmp` mirror with a sync step around every call. A write does, in order: `head('deck.json')` (a simple Blob operation), a `pull()` when the mirror is behind (one `list` and the changed bodies), `pullLeases()` (one URL read), `file.write` on the mirror (`applyWrite`, the lease check, the version record), then `put snapshots/<md5>.json` with overwrite refused, `put deck.json` with `ifMatch` (the commit point), one `put` per changed slide, `put versions/<n>.json`, and a snapshot prune (`list` plus one free `del`) after the answer. A one slide write is therefore five advanced operations (four `put`, one `list`) and two simple ones when the mirror is current, and four of the `put` calls are sequential HTTPS round trips. Leases are a separate file pulled before and pushed after every lease call, last writer wins.

Vercel Blob prices simple operations at $0.40 per million (a URL read on a cache miss, or `head`) and advanced operations at $5.00 per million (`put`, `copy`, `list`), so one write costs about $0.000026 and a million writes about $26 (V5). The constraint is the rate limit, not the price: a Pro store allows 7,200 simple operations per minute (120 per second) and 4,500 advanced per minute (75 per second); Hobby allows 1,200 and 900 per minute (V5). Five advanced operations per write means at most 15 one slide writes per second across every deck of the deployment on Pro, and 3 per second on Hobby. Ten people typing with the 400 ms burst rule already reach that ceiling in the worst case; per keystroke commits at five to eight keys per second would exceed it with two typists.

Vercel confirms the store's consistency model: "When you overwrite a blob at an existing pathname, readers might see the cached version for up to 60 seconds" and `useCache: false` consistent reads are shown for private stores (V6). The store `turboslide-decks` is public, which is why `pull()` proves a body by hashing it to the etag or replays the version records, and why the round two snapshots exist (L3, L4 section 4).

No single write latency was measured hosted. The seed upload pushed 183 documents in 6.8 s with eight in flight (L4 section 5), which puts one `put` in the order of 100 to 300 ms, so a commit's four sequential `put` calls are in the order of half a second to a second before the answer. This is an estimate and is listed in Part 8.

### 1.4 The watch channel and the propagation latency today

`watchDeck` (L8) is a long poll: it answers when `deck.json` carries a revision other than `since` or after `WATCH_DEFAULT_MS = 20_000` (cap 25,000), with the records written since, the newest entry and the leases. On the file store the event comes from `fs.watch` debounced 80 ms (`packages/store/src/watch.ts`, L12). On the Blob store `watch()` polls the manifest's etag every `pollMs = 3000` and trusts a sync for `syncTtlMs = 750` (L3). The editor's `watchLoop` applies the records forward through `applyWrite` once its own queue is idle (`adoptExternal`) and shows the banner for `EXTERNAL_BANNER_MS = 8000`. So an external write reaches an open editor within about a second on a checkout and within about 1.5 to 3 s plus one round trip hosted, with the banner naming the author label. There are no cursors, selections, avatars or chat (L9 B4).

### 1.5 Leases, sessions, the agent surface, deck pull and push

Leases (`packages/store/src/lease.ts`, L13): ten minutes by default, 120 at most, advisory for humans and enforced for agents (`leasePolicyFor`); the editor takes one on the active slide and releases the previous; a lease outlives a closed tab for up to ten minutes (L11 "Deviations", fix round). Two humans with the same author label are one author to the lease code (`sameAuthor`), and the default label of every browser is `studio` (L7 `DEFAULT_AUTHOR`, L9 B1).

The attached studio sessions (`apps/studio/src/server/sessions.ts`, `packages/agent/src/http/sessions.ts`, L14) are "in-memory and per process": a page attaches, long polls for commands (20 s default, 25 s cap), and answers them through `window.turboslide.studio`. Hosted, an attach and its poll may reach different function instances, so `deck_goto_slide` over `/mcp` works only when both land on the same instance; the same store that carries the operation stream should carry this registry.

The agent surface (L11): `POST /api/actions/<id>?deck=<slug>` and `/mcp` (streamable HTTP, one deck and one author per session) behind `TURBOSLIDE_TOKEN`, `GET /api/agent`, `/openapi.json`, `/llms.txt`. The MCP server declares `capabilities: { tools: {}, resources: {}, prompts: {} }` (`packages/mcp/src/server.ts` line 109, L15): resources without `subscribe` or `listChanged`. The CLI has no remote mode; `deck.push` and `deck.pull` move a whole deck as a zip bundle through `POST /api/decks/bundle` and `GET /api/decks/<id>/bundle` with the bearer from `~/.config/turboslide/hosts.json`, and a bundle over the 4.5 MB function body cap travels by a stored Blob copy (L16, L17). A version record `versions/<n>.json` carries `n`, `revision`, `baseRevision`, `author`, `note`, `createdAt`, `mutations`, `inverse` and, on Blob, `snapshot` (the md5 that names the immutable document), so the version log is already an operation log with enough to replay a deck byte for byte (`documentAtVersion`, `pull()`'s replay path, L3, L18).

### 1.6 What Vercel gives the function

| Fact                                | Value                                                                                                                                                                                                                     | Source |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Maximum duration with Fluid compute | Hobby 300 s default and maximum; Pro and Enterprise 300 s default, 800 s maximum, 1,800 s in beta per function                                                                                                            | V1     |
| Duration counts streamed responses  | "this includes time spent processing the request and sending the response, including streamed responses"                                                                                                                  | V1     |
| Request and response body           | 4.5 MB                                                                                                                                                                                                                    | V1     |
| Memory                              | default 2 GB / 1 vCPU; Pro maximum 4 GB / 2 vCPU                                                                                                                                                                          | V1     |
| File descriptors                    | "1,024 file descriptors shared across all concurrent executions" of an instance, including the runtime's own                                                                                                              | V1     |
| Region                              | `iad1` by default; Pro can set up to 3 regions, Enterprise all                                                                                                                                                            | V1, V3 |
| Concurrency                         | auto scales to 30,000 (Hobby and Pro)                                                                                                                                                                                     | V1     |
| Instances share nothing             | "New WebSocket connections are not guaranteed to reach the same Vercel Function instance"; store presence and pub/sub coordination "in an external data store instead of relying on in-memory variables"                  | V2     |
| Idle streams                        | Vercel sends HTTP/2 `PING` frames while a response is idle; "HTTP/1.1 clients and intermediate network layers may still close idle connections. For those cases, stream progress or heartbeat data while work is running" | V4     |
| Pricing in `iad1`                   | Active CPU $0.128 per hour, Provisioned Memory $0.0106 per GB-hour, invocations $0.60 per million on Pro; memory bills "until the last in-flight request completes"                                                       | V7     |
| Turboslide's own rules              | catch all 300 s; `/api/export/**`, `/api/render/**`, `/_serverFn/**` at 800 s and 3,009 MB                                                                                                                                | L19    |

The last row matters for a stream: a server function response held open lives under the `/_serverFn/**` rule, so it is billed at 3 GB of provisioned memory for its lifetime, while a plain server route lives under the catch all at 2 GB. A stream route should be a plain server route with its own function rule.

## 2. The change feed on Vercel

### 2.1 Long polling, what exists

A long poll is one invocation per wait window. It is the cheapest transport in invocations when nothing changes (one request per 20 s per tab: ten tabs for eight hours a day, twenty two days, is 316,800 invocations, $0.19 on Pro at $0.60 per million, V7), and it carries the answer as one JSON body, so it composes with the server function boundary and the CSRF middleware as it does today. Its latency floor is one round trip after the event plus the Blob poll on the hosted store (Part 1.4). Its cost in propagation is that every tab re-requests after every event, so under continuous typing it degenerates into a request per event per tab, and it cannot carry a high frequency presence channel at all (each cursor move would be a request).

### 2.2 Server-Sent Events from a function

A server route returns a `ReadableStream` with `Content-Type: text/event-stream` and writes events as they happen; TanStack Start documents streaming from server functions and server routes through `ReadableStream` or async generators (F4). The Vercel constraints: the response is one in-flight request, so the instance's provisioned memory bills for its whole life (V7), the stream ends at `maxDuration` (300 s on the catch all; V1) and the browser's `EventSource` reconnects on its own and sends `Last-Event-ID`, which the route uses as the resume position; a heartbeat comment every 15 s keeps HTTP/1.1 intermediaries from closing an idle stream (V4). One instance handles many streams under Fluid compute's optimized concurrency (V3), bounded by the 1,024 file descriptors it shares with everything else (V1). Vercel's own guidance: "SSE stays on standard HTTP with no upgrade handshake, and browsers reconnect on their own" and it "suits one-way server-to-client streaming" (V8).

The cross instance problem is the same as for every transport here: the instance holding a tab's stream is not the instance that admitted another tab's operation, so a fan out store is needed (Part 2.5). On the file store (one process) the stream is fed in process.

### 2.3 WebSockets on Vercel Functions

Vercel Functions serve WebSocket connections since the public beta of 2026-06-22 (V4 changelog): "A single WebSocket connection is pinned to one Vercel Function instance", "Fluid compute allows a single function instance to handle multiple WebSocket connections", the upgrade request passes routing, Firewall rules and rate limits, connections "close when a Vercel Function reaches its maximum duration", and "billing only applies to the time your Function spends processing messages, not idle connection time" under Active CPU (V2, V4). Nitro exposes `defineWebSocketHandler` with `open`, `message`, `close` and `error` hooks and `peer.subscribe` and `peer.publish` behind `features: { websocket: true }`, on "Node.js, Bun, Deno, Vercel and Cloudflare Workers" (F3); Vercel's Nitro starter runs a WebSocket route "on Vercel through the preset's `crossws/adapters/vercel` bridge" and holds its roster "in memory", with reconnect "with exponential backoff" when the function's duration ends (V12). Nitro 3.0.260903-beta, the version in Turboslide's catalog, moved to crossws 0.4.12 with "a sync backplane to share channels across instances, plus auth and context support" (F5); crossws states "By default pub/sub is in-memory and local to one instance" and that clustering relays "over a shared backplane with a sync adapter" whose backends the page does not name (F6).

The obstacle is TanStack Start itself. Its discussion on WebSocket support records, as of 2026-07-03, that the framework's own server layer (srvx and h3 v2) does not perform the upgrade ("srvx 0.11.x doesn't handle this property", 2026-02-25), that a Nitro configuration with `features.websocket` and handlers in a separate `serverDir` works for the Nitro build (2026-02-07), that `VITE_USE_NITRO=true` enables it in development (2026-03-25), and that no maintainer has committed to native support (F1). Turboslide's deploy build already runs `nitro/vite` beside `tanstackStart()` (L19), so the production path exists; the dev server (`vite dev --port 4321`) does not run Nitro, so WebSockets would diverge between the dev server and the deployment unless the dev rule changes. That is why Part 7 puts SSE first and WebSockets behind a capability flag, starting with the presence channel where the saved round trip matters most.

### 2.4 Third party channels

Ably: Free plan "6,000,000" messages per month, "200" concurrent connections, "200" concurrent channels, "500" messages per second; Standard $29 per month with 10,000 connections and channels and 2,500 messages per second; consumption at "$2.50 per million messages" (to $0.50 with volume), "$1.00 for every million minutes" of connection and channel time (T1).

Pusher Channels: Sandbox free with 100 concurrent connections and 200,000 messages per day; Startup $49 per month with 500 connections and 1 million messages per day; Pro $99 with 2,000 and 4 million (T2).

Liveblocks: the rendered pricing page shows a Free plan of "3,000 minutes" of collaboration and "1 GB" realtime storage, Pro at "$30/mo" with "$30" of credits, Team from "$600/mo", and metered rates of "$0.002 per minute" of collaboration, "$1 per 1M updates" of storage and "$0.01 per comment"; the plan definition is "Solo sessions cost $0. If only one person or agent is in a room, it is not billed", "Metering pauses when a room is inactive for 10 seconds" (T3, T4). Storage rules: for `LiveObject` and `LiveMap` "the last modification received by the Liveblocks servers is the winner"; lists use fractional indexing with the user id appended to break ties (E6, E7). Limits per data type: 2 MB per `LiveObject` and per `LiveText` (T5).

Supabase Realtime: Free 200 concurrent connections and 2 million messages per month, Pro 500 and 5 million, overage "$10 per 1,000 peak connections" and "$2.50 per 1 million messages"; presence messages capped at 20 per second on Free and 50 on Pro, broadcast 100 and 500 messages per second (T6, T10). It requires a Supabase project.

PartyKit and Cloudflare Durable Objects: PartyKit joined Cloudflare in April 2024 and its server library, PartyServer, "enhances Durable Objects" with room routing, `onConnect`, `onMessage`, `broadcast` and hibernation (E8, T11). Durable Objects bill "100,000 / day" requests and "13,000 GB-s / day" free, then "1 million / month, + $0.15/million" requests and "400,000 GB-s / month, + $12.50/million GB-s"; incoming WebSocket messages count at a 20:1 ratio, outgoing are free, and hibernated objects incur no duration (T12). "Each individual Object is inherently single-threaded" with "a soft limit of 1,000 requests per second" (T13). Workers Paid is $5 per month minimum; Durable Objects with SQLite storage are available on the free plan (T14). tldraw.com runs its sync rooms on this platform (E3). It is the natural single threaded room per deck, and it is a second cloud account, a second deployment and a second auth boundary.

Upstash Realtime (`@upstash/realtime`) is described in search results as "100% HTTP-based: Redis streams & SSE" for Next.js; the npm page returned 403 to this tool and the claim is listed in Part 8.

### 2.5 The coordination store

Every transport on Vercel needs one store that orders operations and carries them between instances, because "function instances don't share memory" (V8). Vercel's own guide names the patterns: Redis Streams (`XADD`, `XREAD`) for "chat history plus live relay", Redis pub/sub with sorted sets for presence, and Vercel Queues for durable fan out of backend events (V8). Its two worked examples use exactly that: a hash and a sorted set for participants, a pub/sub channel per room where "Each instance subscribes to the shared channel and ignores events it published itself", cursor messages "throttled to one send every `80ms`", entries that expire after 120 s, and a client that "reconnects with a capped backoff" of 8 s (V9); a sorted set per room with a 5 s heartbeat and `STALE_MS = 30_000`, and a 25 s client keep alive ping (V10).

Redis through the Marketplace: Upstash lists Redis at "Free, Pay as You Go" and fixed tiers with the environment variables set by the integration (V11); its free tier is "500K" commands per month with "256 MB" of storage, pay as you go "$0.2 per 100K commands", fixed plans from "$10/ month" for 250 MB with unlimited commands (T7). The REST API "provides Redis SUBSCRIBE and PUBLISH commands" over Server-Sent Events but not the blocking `BLPOP` or `XREAD BLOCK`; the Redis protocol over TCP supports everything (T8). Redis Cloud, the other Marketplace listing, offers 30 MB free (T9, V11).

Vercel Queues (public beta 2026-02-27) is "at-least-once" topic fan out to function consumers at "$0.60 per 1M operations" (V13). It is a backend to backend primitive; it does not deliver to browsers and it is not needed for this design.

Vercel Blob alone can order operations: `put` with `overwrite: false` is an atomic create, which is how `versions/<n>.json` and `snapshots/<md5>.json` already work (L3). It cannot carry a per keystroke stream because of the 75 advanced operations per second cap, and it cannot fan out except by polling `head` (a simple operation, 120 per second on Pro). That is the reduced tier of Part 7.7.

### 2.6 Comparison

The load model for the cost column, used again in Part 7.10: ten concurrent editors, eight hours a day, twenty two days a month, one document operation per second per editor on average (6.34 million per month), cursors throttled to 12.5 Hz per editor and batched per instance, a Vercel Pro team in `iad1`, three function instances warm during business hours.

| Option                                       | Op to screen latency                                           | Monthly cost at the load model                                                                 | Hard limits                                                                             | Fits Turboslide                                              |
| -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Long poll over Blob (today)                  | 1.5 to 3 s hosted, under 1 s on a checkout                     | $0.19 invocations; Blob $26 per million writes                                                 | 15 writes per second per deployment (Blob advanced cap); no presence                    | exists; too slow and too capped for typing together          |
| SSE down, POST up, Redis order and fan out   | about 1.5 round trips plus a few ms: 60 to 200 ms by geography | compute $5 to $15, invocations about $4, Redis $0 to $10, Blob under $10                       | stream ends at 300 s and reconnects; 1,024 fds per instance; single region              | recommended default                                          |
| WebSocket on Vercel, Redis order and fan out | about 1 round trip: 40 to 150 ms                               | as above minus per op invocations                                                              | same as SSE; TanStack Start does not upgrade, Nitro route needed; dev server divergence | the presence channel's later swap                            |
| SSE down, Blob only (no Redis)               | 0.5 to 1.5 s (1 s head poll)                                   | compute as above; Blob head polls 9 per second at three instances and three decks              | writes capped at 15 per second; presence per instance only                              | the reduced tier                                             |
| Ably                                         | vendor edge round trip, tens of ms                             | Free plan is borderline at 6 million messages; Standard $29 plus about $16 messages: about $45 | 200 connections free                                                                    | plug in                                                      |
| Pusher Channels                              | tens of ms                                                     | Startup $49                                                                                    | 500 connections                                                                         | plug in                                                      |
| Liveblocks                                   | tens of ms; brings storage, presence, comments                 | 105,600 collaboration minutes at $0.002 is $211 plus storage updates: about $218               | 2 MB per LiveObject                                                                     | plug in, but replaces the document model it would sit beside |
| Supabase Realtime                            | tens of ms                                                     | Pro $25 plus overage: about $33                                                                | 500 connections; 50 presence messages per second on Pro                                 | plug in with a Supabase project                              |
| Cloudflare Durable Objects (PartyServer)     | tens of ms, single threaded room                               | about $5 (Workers Paid), requests and duration within the included amounts                     | 1,000 requests per second per object, one object per deck                               | the strongest plug in technically; a second cloud            |

The latency figures for browser round trips are typical public internet values and were not measured for this report (Part 8).

## 3. Merging: CRDT, OT or server serialized operations

### 3.1 The three families

Operational transformation keeps a linear history at a central server and transforms an operation from a client's older base against the operations that landed since, so every client converges; the client server form (Jupiter, used by Google Docs) needs a "Central transformation server" and only the first transformation property, CP1/TP1 (E11). Wikipedia states that "Google Docs uses an operational transformation method based on the Jupiter algorithm, where the document is stored as a list of changes", citing Google's 2010 post (E12); the bodies of those posts render only through JavaScript and were not readable (Part 8). The known cost of OT is correctness: "formal proofs are very complicated and error-prone, even for OT algorithms that only treat two character-wise primitives" (E11).

CRDTs give every character or element a stable identity so that concurrent operations commute without a server order. Yjs encodes changes as binary updates that are "commutative, associative, and idempotent" and exchanges only the missing differences through state vectors (E13); Automerge 3.0 (July 2025) cut memory "by over 10x" (a Moby Dick sized text from "700Mb" to "1.3Mb") and is the default in `@automerge/automerge-repo` 2.1.0 (E14); Loro offers "Text Editing with Fugue", a "Rich Text CRDT", a movable list, a movable tree and a last writer wins map under MIT as `loro-crdt` over WebAssembly (E15). Rich text is the hard part: Peritext (Ink and Switch, 2022) anchors formatting spans to character identifiers, distinguishes bold and italic (which extend when text is inserted at their boundary) from links (which do not) and comments (non exclusive) from colour (last write wins), and remains "the first step towards a system for asynchronous collaboration" without block elements (E16); Loro's rich text implements Peritext and Fugue (E15). The Fugue paper (Weidner, Gentle, Kleppmann, revised 2025-10-21) records that concurrent inserts at one position can interleave "resulting in corrupted and potentially unreadable text", a defect that "affects both CRDTs and Operational Transformation", and defines maximal non interleaving (E17). Seph Gentle's 2020 post gives the performance history: Automerge once "grows to 1.1GB in memory" for a 100 KB paper while Yjs held it in "3MB in memory", and modern implementations handle millions of edits per second (E18). A third party guide gives Yjs at 18 kB gzipped and Automerge's WebAssembly at 320 kB (E19; not verified against the packages, Part 8).

Server serialized operations with per property last writer wins are what the shipping design tools use. Figma: a central server processes changes in arrival order, "two clients changing the same property on the same object, in which case the document will just end up with the last value that was sent to the server", changes are "atomic at the property value boundary", unrelated properties never conflict, the server rejects a reparenting that would create a cycle, and text is not merged because "Figma is a design tool, not a text editor" (E1). Figma rejected OT as "unnecessarily complex" for a design tool and rejected off the shelf CRDTs because a central server lets them remove the decentralised overhead (E1). tldraw sync: "the server acts as the source of truth", local changes apply immediately, the server validates and broadcasts, and on conflict "the client undoes local changes, applies server changes, then re-applies local changes on top", at 30 frames per second while collaborating and 1 when alone (E3). Liveblocks Storage: last writer wins per key, fractional indices for lists (E6, E7). Excalidraw: per element `version`, `versionNonce` and `updated`, "Higher `version` wins", equal versions broken by the nonce, deletions as `isDeleted` tombstones, undo stacks cleared on a peer's update as an acknowledged "subpar user experience" (E4, E5).

### 3.2 What the block document needs

The deck is a validated JSON tree with invariants a merge must preserve: slide ids are unique and named by `sections[].slideIds`; a block lives in exactly one slot list of one slide or in the plate; a slot exists only for the slide's layout; `pos` of a freeform block is a box on the 1600 by 900 sheet; a Text is one line except in the four multiline pointers; a connector's ends name sites on existing blocks; assets referenced exist (L2, L20, L21). The validator runs on every write and a write that fails it is refused (`applyWrite` `invalid`), the linter reads the document, and the exporters consume it.

A general purpose CRDT holds a JSON tree without those invariants. Figma's own conclusion applies: the server must "step in only to ensure the document remains a valid tree" (E1), which means a validating server sits in the path anyway, and once it does, the server can order operations and the CRDT's decentralised machinery buys nothing for this product. The version log (SPEC 6.7 "the server log stays linear"), undo as forward inverse writes, `version.restore` as a mutation, the `since` records on a conflict, the agent action table with `baseRevision`, `deck pull` and `deck push` and `documentAtRevision` all assume a linear history of mutations. Replacing the document with Yjs or Loro would mean either storing the CRDT's binary updates as the truth and deriving JSON on every read (the agent and export surface then read a projection), or maintaining two truths. Either is a rewrite of the store, not an addition to it.

### 3.3 Per keystroke merging inside one Text

The one place where last writer wins is not acceptable to Kevin's directive is two people typing in one Text, or one person typing while another changes marks or a slide's text through an agent. The verified Google behaviour is that "Two editors can type in the same text box at the same time and Google merges the edits without locking either person out" (L9 A5, corroborated by third party sources; the Google posts themselves are unreadable). Three ways to get there on this document:

Option T1, transform the text operations at the server. A Text is one string plus marks; the operations that touch it are `text.replace` (insert or delete a span), `text.style` and `text.case` (a range and a mark or case change, implemented as whole string rewrites today through `styleRange`), `text.insert`, and the whole value `block.set` or `slide.set`. Transforming insert and delete against insert and delete in one string is the two primitive case of OT, whose functions fit in a few dozen lines and whose CP1 property is what a single ordering server needs (E11); `styleRange` and `caseRange` become range operations that shift with inserts and deletes before them and split around deletes inside them; a whole value rewrite from an agent stays last writer wins for the string, and a client's pending inserts are re-anchored on the new string by diff (`textDiff`, L6). Concurrent inserts at one offset interleave character by character in the worst case (E17), which Google's OT shares; the tie is broken by server order, so both clients converge. Cost: a transform module in `packages/schema` (about the size of `text.ts`'s range section) with property tests for convergence, and one change to the mutation language: `text.replace` ranges in plain text offsets like `text.style`, with the marks carried by the run the caret is in (`insertAt` already does this), so the two offset systems of Part 1.1 become one. Records already written keep their meaning because a record's `mutations` are replayed against the document as it was.

Option T2, a CRDT per Text. A Yjs `Y.Text` (insert with attributes, `format`, `toDelta` equivalent to Quill's Delta, E20) or a Loro rich text per Text pointer, with the markup string serialised from the delta on every checkpoint. It merges marks correctly under concurrency (Peritext's anchors, E16) and never interleaves worse than Fugue allows (Loro) or Yjs's algorithm, but it makes every Text a binary CRDT state that must be persisted beside the JSON, gives agents a second write path or a translation layer from JSON pointer mutations to CRDT operations, and puts a 18 kB (Yjs) or larger WebAssembly (Loro, Automerge) runtime in the editor, the CLI and the function for a gain the slide medium rarely exercises (two people typing in one box at once). It is the right choice for a document editor and a poor fit for this deck.

Option T3, block level last writer wins with a warning. Figma's choice. It loses keystrokes when two people type in one box, which the directive forbids.

Verdict: T1, scoped to insert, delete, mark and case operations on one Text, everything else per pointer last writer wins with server order. Part 7.5 states the rule per op.

### 3.4 The OT libraries for JSON, read for completeness

ShareDB is "a realtime database backend based on Operational Transformation (OT) of JSON documents", horizontally scalable through pub/sub adapters such as Redis, with presence, offline sync and historic versions (E21). Its newer JSON type `ot-json1` supports "concurrently editing arbitrarily complex nested structures", moves, and embedded text subtypes, and its author writes "Usable in practice, but contains a couple super obscure known bugs" with incomplete cursor transformation inside edited strings (E22). Adopting them would mean adopting their operation language in place of the fifteen ops and their server in place of the store; the transformation Turboslide needs (Part 3.3) is a small subset of what json1 covers, and the structural conflicts are handled by re-anchoring rather than transformation (Part 7.5). They inform the design and are not recommended as dependencies.

### 3.5 The verdict

Keep server serialized mutations. Add transformation for the text operations of one Text. Resolve concurrent writes to one JSON pointer by server order. Re-anchor structural operations and return the unplaceable ones to their author. Do not adopt a document CRDT in round three; keep the door open by making the operation stream's payload the mutation language itself, which a later per Text CRDT could sit beside.

## 4. Presence and cursors

Presence is ephemeral and high frequency, and it must never enter the revision log or the Blob store. What it carries per client: a `clientId` (per tab), the author identity from this round's identity report (display name, colour, avatar reference), the active slide, the selection (slide id, block ids, and for a caret the Text pointer and plain offset or range), the pointer position on the sheet in sheet units when live pointers are on, the follow target when following, and a `clock` that increases with every change (the Yjs awareness model: "an increasing clock attached to a schemaless JSON object", peers marked offline after 30 s without an update, E9).

Rates and lifetimes, from the references: cursor messages at one per 80 ms (V9) or about 30 per second (Excalidraw, E5; tldraw, E3); heartbeat every 5 s and stale after 30 s (V10, E9); expiry of a participant record after 120 s (V9); a keep alive ping every 25 s on the client (V10). Google shows live pointers only when 20 or fewer collaborators are present, lets only editors show a pointer while "All access levels can view pointers", and restricts the feature to computers (G1). Google's presence surfaces themselves (avatars, Follow, the pointer toggles, chat) are catalogued in L9 Part A and are the reference for the design report of this round.

Transport and storage: the same SSE stream carries presence events as a second event type; the upstream is a POST per throttled batch, or the WebSocket when adopted. Cross instance fan out is the Redis pub/sub channel per deck, with one publish per instance per 80 ms carrying every changed cursor of that instance (batching keeps the command count independent of the number of tabs), and a hash plus a sorted set per deck for the roster with `EXPIRE` at 120 s (V9, V10). On the file store, presence is in the dev server's memory. Selection based "being edited by" outlines and the filmstrip markers derive from the roster; no lock is taken (Part 7.5).

## 5. How Google, Figma, tldraw, Excalidraw and Liveblocks handle it

| Concern                    | Google Slides                                                             | Figma                                                                            | tldraw sync                                                                          | Excalidraw                                                         | Liveblocks Storage                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Ordering                   | one server, OT (Jupiter), document as a list of changes (E12, L9 A5)      | one server, arrival order (E1)                                                   | server as source of truth, client rebases (E3)                                       | none central for elements; peers merge by version (E4)             | server orders, last writer wins per key (E6)                                                                                |
| Same property, two writers | merged edits in text; other properties not documented on the pages read   | last value to reach the server wins (E1)                                         | server decides, client re-applies (E3)                                               | higher `version`, then `versionNonce`, then `updated` (E5)         | last modification received wins (E6)                                                                                        |
| Text                       | merged per character without locks (L9 A5)                                | either value, never merged (E1)                                                  | not stated on the pages read                                                         | element level (E4)                                                 | `LiveText` up to 2 MB (T5); details not on the pages read                                                                   |
| Lists                      | not stated                                                                | fractional index between 0 and 1 (E1)                                            | not stated                                                                           | element order by version                                           | fractional index with user id tie break, base 96 growth (E7)                                                                |
| Locks                      | none (L9 A5)                                                              | none; cycles rejected by the server (E1)                                         | none stated                                                                          | none                                                               | none stated                                                                                                                 |
| Presence                   | avatars, Follow, live pointers with a 20 person cap, chat (L9 A1, A2, G1) | not covered by the post (E1)                                                     | cursors, selections, viewports, follow, cursor chat, separate from the document (E3) | pointers at about 30 per second, active, idle and away states (E5) | Presence separate from Storage, "temporary" (E6)                                                                            |
| Undo under concurrency     | not stated                                                                | undo modifies redo history so undoing never overwrites another's later edit (E1) | not stated                                                                           | stacks cleared on a peer's update (E4)                             | per user stack in memory; undo "reverts the user's Storage changes without reversing work made by other collaborators" (E6) |
| Offline and reconnect      | not stated                                                                | download a fresh copy, reapply offline edits, resume over a new socket (E1)      | rebase (E3)                                                                          | reconcile by version (E4)                                          | not on the pages read                                                                                                       |
| Update cadence             | not stated                                                                | not stated                                                                       | 30 frames per second collaborating, 1 alone (E3)                                     | about 30 per second for pointers (E5)                              | metering pauses after 10 s idle (T4)                                                                                        |

Two conclusions for Turboslide. First, no shipping design tool locks objects; the "being edited by" signal is presence, and the merge rule is last writer wins per property with a server order, except for text where the two products that merge text (Google, and Liveblocks through `LiveText`) do it with an ordering server or a text CRDT. Second, undo must be per author and must never revert another author's later change: Figma's rule and Liveblocks's rule agree, and Excalidraw's cleared stacks show the alternative. Turboslide's undo is already a forward inverse write, which makes the rule implementable: an inverse `block.set` is applied only if the pointer still holds the value the author's operation wrote, otherwise the step is skipped with a notice.

## 6. The local checkout and the agents

What exists (Part 1.5): on a checkout the CLI and the MCP server over stdio write `decks/<id>` through the `FileStore`, an open editor on the dev server learns of it through `fs.watch` within a second, and hosted decks are reached through `POST /api/actions`, `/mcp` over streamable HTTP, and the two bundle routes; `deck pull` and `deck push` move whole decks.

What the design must keep: an agent's write is one `Write` with a `baseRevision` and an answer that carries the new revision, so the agent's next call can name it; the CLI on a checkout works with no server; an MCP client sees one deck per session; the four transports run one implementation of each action (SPEC 7.1).

What changes:

1. Hosted agent writes are admitted through the operation stream like an editor's, transformed and validated, and then checkpointed at once so the answer carries a revision (Part 7.9). The conflict rule for `baseRevision` becomes per touched slide: a write is a 409 with `since` and `current` when a slide it touches, or the deck level, changed since its base; a write to other slides is transformed and applied, which is what the editor already does client side for its own pending writes (`onConflict`, L7). `strict: true` on the input keeps the exact revision check for agents that want a compare and set. The `since` records and `current` document remain the answer's shape.

2. Agents can follow a deck. `GET /api/decks/<id>/events?since=<revision>` is the SSE stream with the bearer token, carrying checkpoint events (revision, author, note, the record) and, on request, the operations; the MCP server declares `resources: { subscribe: true, listChanged: true }` and sends `notifications/resources/updated` for the deck resource when a checkpoint lands (the specification's `resources/subscribe` and `notifications/resources/updated`, F7); over stdio on a checkout the same notification comes from `fs.watch`. A `deck.watch` action with `since` and a timeout is the polling form for transports without a stream.

3. The attached studio session registry moves from `globalThis` to the same store, so `deck_goto_slide` over `/mcp` reaches the page whichever instance holds its poll (Part 1.5).

4. A local checkout follows a hosted deck. `turboslide deck follow <id> --from <studio>` subscribes to the events since the local revision and applies each version record forward through the `FileStore` with the record's `createdAt` and the same reducer, which reproduces the writer's bytes exactly as `blob-store.ts` `pull()` does, and checks the result against the record's `snapshot` md5; the local `decks/<id>` then tracks the host and the local editor shows the same banner it shows for any external revision. `--push` sends local version records that the host does not have as writes with their `baseRevision`, under the per slide conflict rule; a conflict prints both sides and offers `--force` or `--theirs`. `deck pull` and `deck push` stay for whole deck transfer, and a bundle still travels through Blob when it exceeds 4.5 MB (L17).

5. Presence for agents: an agent session appears in the roster as an agent avatar with its run id (the identity report designs the glyph), so people see "an agent is editing slide 12" the same way they see a colleague, and the lease it holds is shown from the roster. An agent's leases expire with its session (60 s without a heartbeat) instead of ten minutes.

## 7. The recommended architecture

### 7.1 Two paths

The operation stream: one ordered sequence of admitted operations per deck, each with a sequence number `seq`, the revision it followed, the author, the `clientId`, the client's operation id, and the mutation list as transformed at admission. It lives in Redis as a stream (`XADD deck:<id>:ops`) with a per deck head counter, is fanned out by pub/sub, and is trimmed after each checkpoint to a retention window (the last 10,000 entries or 24 hours, whichever is larger).

The revision log: the existing `versions/<n>.json`, `snapshots/<md5>.json`, `deck.json` and `slides/<id>.json` on Blob, written by a checkpointer that takes the stream's entries since the last checkpoint, coalesces them into one `Write` per author run (consecutive `text.replace` on one run into one, consecutive `block.set` of one pointer into the last value, a drag's `pos` sets into the final box), applies them through `BlobStore.write` and announces `{ type: 'checkpoint', revision, fromSeq, toSeq, snapshot }` on the stream. The checkpointer runs on the instance that admitted the latest operation, after 2 s without operations or every 10 s during continuous activity, under a Redis lock (`SET deck:<id>:ckpt NX PX 5000`); an agent write forces one. Checkpointing at that cadence keeps three active decks at about 0.1 commits per second each, far under the 15 writes per second Blob allows (Part 1.3), and keeps the History panel readable as bursts rather than keystrokes.

Acknowledgement has two levels. `seqAck` says the operation is in the stream; `revAck` says a checkpoint covers it. The client keeps every operation until `revAck`. If Redis loses the stream (eviction, an outage, a plan limit), clients resend their un-checkpointed operations against the Blob document, transformed against whatever landed, so an accepted keystroke is never lost; only its position may move.

### 7.2 The room protocol

A room is the set of connections open on one deck. Messages down the stream, each with an `id` the client echoes as `Last-Event-ID`:

- `hello { seq, revision, clients[] }` on connect, then `ops { seq, entries[] }` for the operations since the client's position, or `resync { revision }` when the position is older than the retention window, in which case the client reloads the document at `revision` and continues.
- `op { seq, rev, author, clientId, opId, mutations }` for each admitted operation, including the author's own (so the author replaces its pending copy with the admitted form).
- `checkpoint { revision, fromSeq, toSeq, snapshot, author, note }`.
- `presence { clientId, clock, state }` and `leave { clientId }`.
- `reject { opId, reason, mutations }`: the author's operation could not be placed; its content comes back.
- a comment line every 15 s as the heartbeat.

Messages up (a POST per batch, or WebSocket frames later):

- `ops { deckId, clientId, base: { seq }, entries: [{ opId, mutations }] }`, at most 64 entries and 256 kB per POST (a `slide.replace` of a large slide fits; a `block.insert` with a large asset still goes through the asset actions).
- `presence { deckId, clientId, clock, state }`, throttled to one per 80 ms per client, coalesced.
- `lease` and `release` for agents.

Identifiers: `clientId` is a per tab UUID; `opId` is `clientId:counter`; the server deduplicates a re-sent `opId` after a reconnect.

### 7.3 Admission and transformation at the server

The function that receives an `ops` POST:

1. Loads the deck's document at the last checkpoint from the instance's mirror (the `/tmp` overlay `BlobStore` already keeps, L3) and applies the stream entries since that checkpoint from Redis (`XRANGE`), caching the result per instance keyed by `seq` so a warm instance does this incrementally.
2. For each incoming operation, transforms it from the client's `base.seq` to the head: text operations by the transform functions of Part 3.3; `after` anchors re-resolved; everything else unchanged.
3. Applies it through `applyMutation` and validates the touched slide (`validateSlide`) and, for deck level ops, the manifest. An operation that fails is answered as `reject` with its content and never enters the stream.
4. Appends atomically. A Lua script reads `deck:<id>:head`, and when it equals the head the function transformed against, appends the entries with `XADD`, increments the head, and publishes; otherwise it returns the entries since the function's head so the function transforms once more and retries. Redis runs the script on one thread, so two instances cannot interleave appends. After two failed attempts the function takes a 200 ms lock and retries under it.

The admitted operations reach every instance's subscribers through the pub/sub message, and each instance writes them to its open streams. The author's own tab receives the admitted form and reconciles.

### 7.4 What the client does

The controller keeps the local document, a queue of pending operations (un-acked at `seq`), and a set of operations acked at `seq` but not yet covered by a checkpoint. On a local gesture it applies the mutation through `applyMutation`, records the undo entry with its inverse, and sends the operation on the next flush (immediately for structural ops, coalesced at 50 ms for `pos` sets during a drag, at 100 ms for typing so that one `text.replace` carries the characters since the last flush; the undo grouping keeps its own 400 ms rule, since undo granularity and sending cadence are separate concerns). On an incoming `op` from another client it transforms its pending operations against it (text against text; a pending `block.set` of the same pointer stays as the local prediction, as Figma does with unacknowledged changes, E1), applies the incoming operation, and re-renders the touched slides through the existing `setDocument`. On its own admitted `op` it drops the pending copy and, if the server transformed it, adjusts the local document by the difference. On `reject` it removes the operation from the document and shows the inline recovery with the content. On `checkpoint` it moves the covered operations out of the retained set, appends the version to the History panel, and updates `serverRevision`.

The conflict card of round one is retired for text and property conflicts, which no longer occur, and stays as the surface for a `reject` and for the two cases that need a decision: `version.restore` while others are editing (the restore is admitted as a normal operation and everyone's pending operations are re-anchored or rejected against the restored document), and a deck level `section.set` that reorders slides someone is editing (the operations still apply; only the filmstrip moves).

### 7.5 Conflict rules per operation

| Operation                                                                  | Two concurrent writers                                                                                       | Rule at admission                                        | Undo rule                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `text.replace` (insert or delete in one Text)                              | both kept, offsets transformed; equal position ties broken by server order                                   | transform against the ops since base, plain text offsets | inverse is transformed against later ops before it is applied       |
| `text.style`, `text.case`, `text.insert`                                   | ranges shifted and split around concurrent inserts and deletes                                               | transform as range operations                            | same                                                                |
| whole Text `block.set` or `slide.set` (an agent, a paste, `slide.replace`) | last arrival wins the string; the other side's pending inserts are re-anchored by diff                       | last writer wins                                         | applied only if the pointer still holds the value this author wrote |
| `block.set` of any other pointer (`pos`, colour, alt, crop, chart data)    | last arrival wins the pointer; different pointers never conflict                                             | last writer wins per pointer                             | same                                                                |
| `block.insert`, `slide.insert`                                             | both inserted; an `after` that was removed resolves to the end of the slot or section                        | re-anchor                                                | inverse removes the inserted id if it still exists                  |
| `block.move`, `slide.move`                                                 | last arrival decides the position; `z` last writer wins                                                      | re-anchor `after`; keep `z`                              | same                                                                |
| `block.remove`, `slide.remove`                                             | the removal wins; concurrent edits to the removed target are rejected to their author with content           | the target must exist                                    | inverse re-inserts at the recorded anchor, re-anchored              |
| `slide.replace`                                                            | last arrival wins the slide; pending ops on it are re-anchored by id where the block survives, else rejected | last writer wins                                         | as whole Text                                                       |
| `section.set`                                                              | last arrival wins the order; slides added since are appended to their section                                | last writer wins with reconciliation of ids              | same                                                                |
| `asset.set`, `asset.remove`, `deck.set`                                    | last writer wins per asset id or pointer                                                                     | last writer wins                                         | same                                                                |
| `version.restore`                                                          | admitted as one operation; everyone rebases on the restored document                                         | forces a checkpoint                                      | it is itself a version, undoable as today                           |

The rule that spans the table: an operation that the server admitted is never dropped afterwards, and an operation that cannot be placed is returned to its author with its content and a reason, in the editor as an inline notice and on the agent surface as a 409 body.

No hard locks for humans. Leases stay for agents (enforced, SPEC 6.7), with the lease bound to the agent's presence heartbeat and expiring 60 s after the last one, and with `force` unchanged. The editor stops taking a ten minute lease on the active slide; the "Maya is editing this" outline and the filmstrip marker come from the roster.

### 7.6 The presence channel

As Part 4 states: presence events on the same stream, a POST per 80 ms batch upstream, Redis hash and sorted set per deck with 120 s expiry, one pub/sub message per instance per 80 ms batch, a 5 s heartbeat, 30 s stale, 20 live pointers at most. The follow feature reads the followed client's active slide from the roster and stops on the follower's own edit, click, present or version history, as Google does (L9 A1). Presence is off for the public view routes and hidden in present mode (G1 for the pointer rule).

### 7.7 Transports per tier and the interface

One interface in `packages/store`, framework free:

```ts
type RealtimeChannel = {
  append(deckId, base: number, entries: Entry[]): Promise<Appended | Behind>;
  since(deckId, seq: number): Promise<Entry[]>;
  subscribe(deckId, onEvent): () => void;
  presence: {
    set(deckId, clientId, state, ttlMs): Promise<void>;
    roster(deckId): Promise<PresenceState[]>;
  };
  lock(key, ttlMs): Promise<boolean>;
};
```

Implementations, selected once per process like `selectStore` (L4 section 1):

- `memory`: one process; the checkout's dev server, the tests, `node-server`. The `FileStore`'s `fs.watch` feeds external writes into the stream so the CLI beside the dev server appears live.
- `redis`: the default hosted implementation when `REDIS_URL` (or the Marketplace's variable) is set; Redis Streams, pub/sub, hash and sorted set, one Lua script. Upstash over the Redis protocol; the REST API cannot block on `XREAD` and is not used for the subscriber (T8).
- `blob`: the reduced tier when no Redis is configured: `append` is `BlobStore.write` per batch with the 400 ms coalescing kept and a per deck admission rate of one write per second (a queue in the instance), `subscribe` polls `head('deck.json')` once per second per deck per instance (about 9 simple operations per second at three instances and three decks, under the 120 per second Pro cap), presence is per instance only, and the editor shows "Presence and live cursors need a Redis store on this deployment" in the title row. Every function stays; latency is a second.
- plug ins: `ably`, `pusher`, `liveblocks` (presence and broadcast only; the document stays in Blob), `durable-objects` (a PartyServer room per deck holding the stream in the object's SQLite storage and doing admission itself, with the checkpointer calling back into the studio's bundle route). Each is a package behind the same interface and is not built in round three; the interface is designed so they can be.

Transports to the browser: SSE from a plain server route (`/api/decks/<id>/stream`, catch all function rule at 300 s, 2 GB), POST to a server route for `ops` and `presence` (the CSRF middleware filter widened from `serverFn` to these routes, or the routes made server functions), WebSocket through a Nitro route file under a separate `serverDir` behind `TURBOSLIDE_REALTIME_WS=1` once the dev server story is settled (F1). The client transport is chosen by capability and falls back: WebSocket, then SSE plus POST, then the existing long poll for a browser without `EventSource` (none in the supported set, kept as the last resort).

### 7.8 Changes to the store contract

`DeckStore` gains nothing; the stream sits beside it. The studio's `openDeckStore` hands the room a `BlobStore` for checkpoints and reads. `write.ts` keeps `writeDeck` as the strict, checkpointed write for the agent surface and for `version.restore`, adds `appendOps` and `readStream` server routes, and drops `watchDeck` once the stream ships (kept one release for the long poll fallback). `VersionRecord` gains an optional `ops: { fromSeq, toSeq }` so a version names the stream range it coalesced.

### 7.9 Agents, the CLI and the MCP server

- `POST /api/actions/<id>`: the action's mutations are admitted through the room (transform, validate, append) as author `agent:<runId>`, the checkpointer is forced, and the answer is the revision and the record as today. `baseRevision` conflicts follow the per touched slide rule; `strict: true` restores the exact check. Leases are enforced as today and bound to the session heartbeat.
- `/mcp`: the same path; `resources: { subscribe: true, listChanged: true }`; `notifications/resources/updated` per checkpoint (F7); `deck_goto_slide` through the store backed session registry.
- CLI on a checkout: unchanged for local decks; `deck follow` and `deck follow --push` as Part 6 item 4; `deck watch <id> --from <studio>` prints checkpoints as they land.
- `window.turboslide.studio`: `describe().state` gains `presence` (the roster) and `sync` (`seq`, `revision`, pending and retained counts), and the actions `presence.list`, `presence.follow`, `presence.unfollow`, `sync.status` join the table so the four transports read the same facts.

### 7.10 Numbers

Latency, op to screen, for two tabs in the same region as `iad1`: the author's POST (one round trip, 20 to 40 ms US East), admission (mirror apply plus one Lua script to Redis in the same region, a few ms), pub/sub to the other instance and the write into its open stream (a few ms), and the last half round trip to the other tab: about 60 to 100 ms; from the US West coast about 150 ms; from Europe about 200 to 250 ms. Presence at the same cost per hop with the 80 ms throttle added. Today's figure is 1.5 to 3 s hosted (Part 1.4). These round trip values are typical, not measured (Part 8).

Cost per month for the load model of Part 2.6 (ten editors, eight hours, twenty two days, 6.34 million operations, Pro, `iad1`):

- Fluid compute: each warm instance with open streams bills 2 GB for its life: 2 GB times 8 h times 22 days is 352 GB-h, $3.73 per instance (V7); three instances $11. Active CPU at 2 ms per operation: 6.34 million operations is 12,680 CPU-s, 3.5 CPU-h, $0.45. Invocations: 6.34 million POSTs at $0.60 per million is $3.80; stream reconnects every 300 s for ten tabs is 21,120, negligible.
- Redis (Upstash): counted as up to 3 commands per operation (the script, the `XADD` inside it, the `PUBLISH`; how Upstash meters a script's inner commands was not verified, Part 8) is 19 million per month, $38 pay as you go at $0.20 per 100,000 or $10 on the fixed 250 MB plan with unlimited commands; presence at one `PUBLISH` per instance per 80 ms while cursors move adds up to 19 million more per month at three instances, so the fixed plan is the right default. The free tier's 500,000 commands last about a working day at this load, enough for the pilot (T7).
- Blob: three active decks checkpointed at 0.1 per second is 190,000 commits, 950,000 advanced operations, $4.75 at $5 per million (V5); snapshot storage stays bounded by the 50 record retention.
- Total: about $20 to $30 per month on the recommended tier, most of it warm instances, against about $218 on Liveblocks, $45 on Ably, $49 on Pusher, $33 on Supabase Realtime and $5 plus a second cloud on Durable Objects (Part 2.6).

Limits to design against: 300 s stream life (800 s if the stream route takes the Pro maximum), 1,024 file descriptors per instance (cap streams per instance at a few hundred and prefer more instances), 4.5 MB per request, 75 advanced Blob operations per second per deployment, Redis command budget per plan, single region for writes, 20 live pointers.

### 7.11 Risks

1. Instance spread. Vercel decides which warm instance takes a new connection or POST; nothing pins a deck to an instance. The design assumes nothing about locality: admission reads the mirror plus the stream, and fan out goes through Redis. The cost is one Redis round trip per operation and a mirror apply per instance; the measurement in 7.12 checks that the per instance incremental apply keeps admission under 10 ms.
2. Stream loss. Redis eviction or an outage loses un-checkpointed operations at the server; the two level acknowledgement and client resend keep accepted keystrokes; the checkpoint cadence bounds the exposure to a few seconds of operations that were admitted and not yet on Blob. The `blob` tier is the automatic fallback while Redis is unreachable.
3. Transform correctness. The text transform functions must be property tested for convergence under random concurrent insert, delete, style and case operations on the fixture deck's Texts, with the interleaving anomaly (E17) accepted and documented. Everything outside text is last writer wins or re-anchoring, which needs no transform.
4. Provisioned memory while idle. A stream keeps an instance's memory billed for its life; the instance pauses only when the last stream ends. The cost is bounded (7.10) and the stream route runs at 2 GB, not the 3,009 MB of the server function rule (L19).
5. TanStack Start and WebSockets. The upgrade is not supported by the framework's server layer and the dev server does not run Nitro (F1); SSE first removes the dependency, and the WebSocket swap is gated on a measured dev and preview run.
6. Blob consistency. `list()` lags and overwritten bodies are served stale for up to 60 s (V6, L4); the checkpointer keeps relying on etags and immutable snapshots and never on `list()` for correctness.
7. Agents typing over people. An agent's whole Text rewrite is last writer wins over a person's in flight typing; the person's pending inserts are re-anchored by diff and, when the diff cannot place them, returned in a notice. The identity and design reports decide the wording.
8. Security surface. New routes accept high frequency untrusted input: rate limit per `clientId` and per IP (60 operations per second, 15 presence batches per second), cap entries and bytes per POST, validate presence state with a schema (display names render as text, never HTML), and keep the bearer rule on the agent routes. The security report of this round owns the threat model; this report names the inputs.
9. The single region. Writes go to `iad1` and the Redis primary beside it; European users pay one Atlantic round trip per operation. Multi region functions (Pro up to 3, V3) would need a globally replicated Redis for reads and still one primary for the head counter; not for round three.
10. Version log readability. Coalescing decides whether History reads as bursts or as noise; the checkpointer's coalescing rules are unit tested on recorded typing sessions.

### 7.12 What to measure before building

1. On a preview deployment: an SSE stream's actual lifetime against the 300 s rule, the heartbeat's effect on HTTP/1.1 clients, and the `Last-Event-ID` reconnect gap.
2. How many instances ten tabs land on, and the per instance file descriptor count per stream (`/proc/self/fd` from the function).
3. `XADD` plus `PUBLISH` round trip from `iad1` to an Upstash database in `us-east-1`, and the Lua compare and append under two instances contending.
4. One `put` and one full commit to `turboslide-decks` from the function, timed, to replace the estimate of Part 1.3.
5. The transform module's convergence property tests and the coalescing rules on a recorded typing session.
6. The checkpointer's Blob operation count per hour on a deck with continuous typing, against the 75 per second cap.

## 8. Unverified

- Single write latency on the hosted Blob store; Part 1.3's half second to one second is an estimate from the seed upload's aggregate figure.
- Browser round trip times to `iad1` used in Parts 2.6 and 7.10 are typical public values, not measured.
- Upstash command latency from `iad1`; Upstash's regional latency figures were not read from a primary page. Whether Upstash meters a Lua script as one command or as the commands it runs was not verified either; Part 7.10 counts the upper bound.
- Liveblocks per plan connection limits: the limits page renders its figures through placeholders and one rendered value ("10" simultaneous connections per room on Pro) looks like an artifact of the rendering; the plan figures come from the marketing pricing page (T3) and the definitions from the plans page (T4).
- Yjs at 18 kB gzipped and Automerge's WebAssembly at 320 kB are from a third party comparison (E19); bundlephobia and npm pages returned 403 to this tool.
- Loro's current release: the README shows "Loro 1.0 is out" and a 1.23.2 thumbnail (E15); a search result named a 0.4.0-alpha.0 dated 2026-08-29 without a clear package; loro.dev's docs and blog returned 403.
- `@upstash/realtime`: the npm page returned 403; the "Redis streams and SSE, Next.js" description is a search snippet.
- Redis Cloud's free tier connection and operation limits, and the wording "From $0.007/hour (Minimum $200/month)" for Essentials as rendered (T9).
- Google's own engineering description of Slides collaboration: the 2010 Docs posts render only through JavaScript (E12 cites them); the merge without locks is corroborated by third party sources in L9 A5.
- crossws's sync backplane backends are not named on the page read (F6).
- Whether TanStack Start 1.168.50's Nitro build honours `features.websocket` with route files under a separate `serverDir` on the Vercel preset for this repository; the discussion reports it for Nitro in February 2026 (F1) and it was not tried here.
- tldraw's per record conflict rule: the pages read describe the server as the source of truth and the rebase, not the rule for one record written by two clients.
- Excalidraw's "about 30fps" pointer throttle comes from a mirror of their developer docs (E5).
- The Blob `list()` lag of up to a minute is Turboslide's own measurement recorded in `docs/hosting.md` (L4), not a Vercel statement.

## 9. Sources

Every web page was read on 2026-09-13. Local files were read at `61b16e4` on 2026-09-13; L9 was written on 2026-09-11 and re-read today.

Vercel

- V1 Vercel Functions Limits (last updated 2026-08-24). https://vercel.com/docs/functions/limitations
- V2 WebSockets in Vercel Functions (last updated 2026-08-10). https://vercel.com/docs/functions/websockets
- V3 Fluid compute (last updated 2026-08-24). https://vercel.com/docs/fluid-compute
- V4 WebSocket support is now in Public Beta (2026-06-22). https://vercel.com/changelog/websocket-support-is-now-in-public-beta ; Configuring Maximum Duration for Vercel Functions (last updated 2026-08-24, the HTTP/2 PING note). https://vercel.com/docs/functions/configuring-functions/duration
- V5 Vercel Blob Pricing (last updated 2026-08-11). https://vercel.com/docs/vercel-blob/usage-and-pricing
- V6 Vercel Blob now supports consistent reads on private storage (2026-07-14). https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage
- V7 Fluid compute pricing (last updated 2026-06-16). https://vercel.com/docs/functions/usage-and-pricing
- V8 Publish and subscribe to realtime data on Vercel. https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel
- V9 Build Figma-style multiplayer cursors with WebSockets on Vercel. https://vercel.com/kb/guide/real-time-board-nextjs-fastapi
- V10 Build Notion-style real-time presence with WebSockets on Vercel. https://vercel.com/kb/guide/real-time-presence-hono-react
- V11 Vercel Marketplace, Redis. https://vercel.com/marketplace/redis ; Upstash. https://vercel.com/marketplace/upstash
- V12 Nitro + WebSockets Starter. https://vercel.com/templates/nitro/nitro-websockets-starter
- V13 Vercel Queues now in public beta (2026-02-27). https://vercel.com/changelog/vercel-queues-now-in-public-beta
- V14 Streaming with Vercel Functions (last updated 2026-09-01). https://vercel.com/docs/functions/streaming-functions
- V15 Vercel Community, SSE Time Limits (2025-02-17). https://community.vercel.com/t/sse-time-limits/5954
- V16 Configuring regions for Vercel Functions. https://vercel.com/docs/functions/configuring-functions/region

Frameworks and protocols

- F1 TanStack Router discussion 4576, Websocket support in tanstack start (comments dated 2026-02-05 to 2026-07-03). https://github.com/TanStack/router/discussions/4576
- F2 TanStack Start, Hosting. https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- F3 Nitro, WebSocket. https://nitro.build/docs/websocket
- F4 TanStack Start, Streaming Data from Server Functions. https://tanstack.com/start/latest/docs/framework/react/guide/streaming-data-from-server-functions
- F5 nitro 3.0.260903-beta release notes (via newreleases.io). https://newreleases.io/project/npm/nitro/release/3.0.260903-beta
- F6 crossws, Pub/Sub. https://crossws.h3.dev/guide/pubsub ; Guide. https://crossws.h3.dev/guide
- F7 Model Context Protocol specification 2025-06-18, Resources. https://modelcontextprotocol.io/specification/2025-06-18/server/resources

Third party vendors

- T1 Ably, Pricing overview. https://ably.com/docs/platform/pricing
- T2 Pusher Channels, Pricing. https://pusher.com/channels/pricing/
- T3 Liveblocks, Pricing. https://liveblocks.io/pricing
- T4 Liveblocks, Plans. https://liveblocks.io/docs/pricing/plans
- T5 Liveblocks, Limits. https://liveblocks.io/docs/platform/limits
- T6 Supabase, Realtime Limits. https://supabase.com/docs/guides/realtime/limits
- T7 Upstash, Redis Pricing. https://upstash.com/pricing/redis
- T8 Upstash, REST API. https://upstash.com/docs/redis/features/restapi
- T9 Redis, Pricing. https://redis.io/pricing/
- T10 Supabase, Realtime Pricing. https://supabase.com/docs/guides/realtime/pricing
- T11 PartyServer README (cloudflare/partykit). https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md
- T12 Cloudflare Durable Objects, Pricing. https://developers.cloudflare.com/durable-objects/platform/pricing
- T13 Cloudflare Durable Objects, Limits. https://developers.cloudflare.com/durable-objects/platform/limits/
- T14 Cloudflare Workers, Pricing. https://developers.cloudflare.com/workers/platform/pricing/

Engineering posts and papers

- E1 Evan Wallace, How Figma's multiplayer technology works (Figma blog). https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- E2 tldraw, Announcing tldraw sync (2024-08-05). https://tldraw.dev/blog/announcing-tldraw-sync
- E3 tldraw sync documentation. https://tldraw.dev/docs/sync ; Multiplayer overview. https://tldraw-tldraw.mintlify.app/sync/introduction
- E4 Excalidraw, Building Excalidraw's P2P Collaboration Feature. https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature
- E5 Excalidraw developer docs, Collaboration (mirror). https://excalidraw-excalidraw.mintlify.app/concepts/collaboration
- E6 Liveblocks, Liveblocks Storage. https://liveblocks.io/docs/ready-made-features/multiplayer/sync-engine/liveblocks-storage
- E7 Liveblocks, How CRDTs and sync engines keep realtime lists ordered with fractional indexing. https://liveblocks.io/blog/how-crdts-and-sync-engines-keep-realtime-lists-ordered-with-fractional-indexing
- E8 PartyKit is joining Cloudflare (April 2024). https://blog.partykit.io/posts/partykit-is-joining-cloudflare/
- E9 Yjs docs, Awareness. https://docs.yjs.dev/api/about-awareness
- E10 Yjs docs, y-websocket README (yjs/y-websocket). https://github.com/yjs/y-websocket/blob/master/README.md ; yhub. https://github.com/yjs/yhub
- E11 Wikipedia, Operational transformation. https://en.wikipedia.org/wiki/Operational_transformation
- E12 Wikipedia, Google Docs (citing John Day-Richter, What's different about the new Google Docs: Conflict resolution, Google Drive Blog, 2010-09-22). https://en.wikipedia.org/wiki/Google_Docs ; the 2010 post pages, bodies unreadable: https://drive.googleblog.com/2010/09/whats-different-about-new-google-docs.html
- E13 Yjs docs, Document Updates. https://docs.yjs.dev/api/document-updates
- E14 Automerge 3.0 (July 2025). https://automerge.org/blog/automerge-3/
- E15 loro-dev/loro README. https://github.com/loro-dev/loro
- E16 Ink and Switch, Peritext: A CRDT for Rich-Text Collaboration. https://www.inkandswitch.com/peritext/
- E17 Weidner, Gentle, Kleppmann, The Art of the Fugue: Minimizing Interleaving in Collaborative Text Editing (arXiv 2305.00583, v3 2025-10-21). https://arxiv.org/abs/2305.00583
- E18 Joseph Gentle, I was wrong. CRDTs are the future (2020-09-26). https://josephg.com/blog/crdts-are-the-future/
- E19 PkgPulse, Yjs vs Automerge vs Loro: CRDT Libraries 2026 (third party). https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026
- E20 Yjs docs, Y.Text. https://docs.yjs.dev/api/shared-types/y.text
- E21 share/sharedb README. https://github.com/share/sharedb
- E22 ottypes/json1 README. https://github.com/ottypes/json1

Google

- G1 View live pointers on Google Slides. https://support.google.com/docs/answer/13853477

Local files at 61b16e4

- L1 `packages/schema/src/mutations.ts`
- L2 `packages/schema/src/reduce.ts`
- L3 `packages/store/src/blob-store.ts`
- L4 `docs/hosting.md`
- L5 `packages/schema/src/text.ts`
- L6 `packages/viewer/src/InlineText.tsx`
- L7 `apps/studio/src/routes/edit.$deckId.tsx`
- L8 `apps/studio/src/server/write.ts`
- L9 `docs/gslides-parity/research/10-identity-sharing-and-presence.md` (written 2026-09-11)
- L10 `docs/spec/SPEC.md` section 6.7
- L11 `AGENTS.md`
- L12 `packages/store/src/watch.ts`
- L13 `packages/store/src/lease.ts`
- L14 `apps/studio/src/server/sessions.ts`, `packages/agent/src/http/sessions.ts`
- L15 `packages/mcp/src/server.ts`
- L16 `packages/schema/src/actions.ts` (`deck.push`, `deck.pull`), `apps/cli/src/hosts.ts`
- L17 `docs/deck-transfer.md`
- L18 `packages/store/src/versions.ts`, `packages/store/src/store.ts`
- L19 `apps/studio/vite.deploy.config.ts`, `apps/studio/src/start.ts`
- L20 `docs/gslides-parity/SPEC-2.md` sections 1, 8.2 and 12
- L21 `docs/gslides-parity/BUILD-STATUS-2.md`, `pnpm-workspace.yaml` (the catalog)
