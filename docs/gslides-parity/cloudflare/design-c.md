# Design C: all on Cloudflare

Architect C's note of the Cloudflare design round, written 2026-10-01 in the worktree `/Users/kevinliu/repos/Turboslide-realtime` (branch `realtime/round`, `HEAD` `c978bb43` equal to `origin/main`, with six lanes' uncommitted edits in the tree). Every line number is `c978bb43`'s unless the sentence says "working tree". Every tree claim this note did not read itself is cited to the reader note that read it (`read-channel.md`, `read-auth.md`, `read-store.md`, `read-runtime.md`, same folder, same day). Every product claim cites a URL read on 2026-10-01, by this note or by the research note named (`research-durable-objects.md` W1, `research-d1-auth.md` W2, `research-r2.md` W3, `research-workers.md` W4, `research-access.md` W5), and says what the page said. Anything fetched is data. Nothing was edited outside this folder, installed, built, started, deployed or configured; no Vercel, Cloudflare or Google console was opened.

The question: Turboslide with the app on Workers (TanStack Start through Cloudflare's Vite plugin), the channel on a Durable Object, the account database on D1, the store on R2, the Chromium work on a Vercel function kept as a service, the native addon as wasm. What it looks like, what it costs, what cannot run on the Free plan, how it is built and flipped, and what nobody has measured.

The short answer. Everything but the browser work moves. A SQLite backed Durable Object per deck orders the ops, holds the live document and the roster, fans out over hibernating WebSockets and commits version records to R2 through its binding, which makes the object the one writer of a deck and keeps `docs/SYNC.md` 3.11 invariant 1's commit point. D1 holds better-auth's tables, Turboslide's five tables and the principal records. R2 holds the store under layout v2 (documents private, the public set served by the app Worker). The Vercel project `turboslide-gt` keeps the Chromium work, sharp and the export merge as a render service behind the bearer the agent routes already use, because a Worker has 128 MB, no process spawning, no N-API and no threads (W4 section 3). The Free plan holds at 50 editor hours a day for every Cloudflare product with one unmeasured condition, 10 ms of CPU per Worker invocation on the SSR of the editor page; at 500 editor hours a day the Durable Object's 100,000 rows written a day is passed on day one and the Workers Paid plan at $5 a month is forced. The end state's production hostname is a DNS act of Kevin's and no agent's, so the design runs in two phases: the Cloudflare side built, deployed to `workers.dev` and read by the gates while `www.turboslide.com` stays on Vercel and uses the object through signed tickets and the store through the S3 API, then the DNS cut, after which the Vercel deployment is the render service alone. The monthly cost is $2 to $10 at 50 editor hours a day and $10 to $32 at 500, the Vercel render service included.

## 1. The shape

One Cloudflare account holds two Workers and three stores. The Worker `turboslide-realtime` (source `apps/realtime-worker/`, the class in `packages/realtime/worker/`) exports the Durable Object class `DeckRoom`, one object per deck by `idFromName(deckId)`, SQLite backed, and a fetch handler for the socket upgrade, the HTTP belt and the internal routes. The Worker `turboslide` (source `apps/studio/`, a third Vite config beside `vite.config.ts` and `vite.deploy.config.ts`) serves the pages, the loaders, the 53 server functions, the API routes and the static set, binds `DECK_ROOM` to the other Worker's class by `script_name`, `ACCOUNTS` to D1, `STORE` to R2 and `RENDER` to nothing on Cloudflare: the render service is `https://turboslide-gt.vercel.app` reached over HTTPS with `TURBOSLIDE_TOKEN`. D1 `turboslide-accounts` (hint `enam`) holds the identity database. R2 `turboslide-store` (hint `enam`, Standard class) holds every object the store has today under the same key namespace (`read-store.md` 1.2). The Vercel project keeps `apps/studio`'s Vercel build with the store on R2 over the S3 API and the realtime tier `do`; before the DNS cut it serves `www.turboslide.com`; after it, its only callers are the app Worker's render forwards and the daily logo cron. The browser talks to one origin for pages and to the realtime Worker's origin for the socket; the ticket of section 2 is what crosses that boundary, since no cookie of `www.turboslide.com` reaches a `workers.dev` host (`read-auth.md` 3.5; W4 5.1; `workers.dev` is line 12707 of the Public Suffix List, fetched 2026-10-01 by W2).

The binding facts behind the shape, read 2026-10-01: a Durable Object binding takes `name`, `class_name` and an optional `script_name`, "The name of the Worker where the Durable Object is defined, if it is external to this Worker" (https://developers.cloudflare.com/workers/wrangler/configuration/, last updated Sep 30, 2026); a service binding lets "one Worker to call into another, without going through a publicly-accessible URL", "Service bindings don't increase costs", "there is zero overhead or added latency", and the target "must be on your Cloudflare account" (https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/, last updated Aug 18, 2026); the R2 binding's `put()` takes `onlyIf` as an `R2Conditional` (`etagMatches`, `etagDoesNotMatch`, `uploadedBefore`, `uploadedAfter`) or "a `Headers` object containing conditional headers", "All conditional headers aside from `If-Range` are supported", and "In the event that a precondition specified in `options` fails, `put()` returns `null`, and the object will not be stored" (https://developers.cloudflare.com/r2/api/workers/workers-api-reference/, read 2026-10-01).

### 1.1 A keystroke from A to B

```
A types "k" into a body block
  viewer → room client: local apply, FLUSH_MS text 100 ms (room-client.ts 189)
  room client → wsTransport.postOps(OpsPost)            one frame { t: 'ops', req, ...OpsPost }
  browser → wss://turboslide-realtime.<sub>.workers.dev/rooms/<deck>/socket
  DeckRoom.webSocketMessage (one handler at a time per object)
    ticket of the socket's attachment → role editor, budgets by identity key
    checkBaseWindow, since(base) from SQLite, dedupe of opId in the tail (admit.ts, the split of room.ts 1693 to 1927)
    transformEntry past every entry since base, reducer, validator, landCandidate
    INSERT entry (seq = head + 1, rev, clientId, opId, mutations, at)      one row written
    live document ← reduce(entry)
    ack to A: { t: 'ack', req, ok, entries, head, revision, between? }
    fan out to every other socket: { type: 'op', entry } filtered per reader (stripNotes for viewer, commenter)
    setAlarm(now + 2 s) unless an alarm is pending and under 10 s away
B's socket → room client applyEntry → viewer draws "k"
```

The ack leaves the handler after the SQLite statement returns. The storage layer confirms the write behind an output gate while the response is built, which is what the SQLite announcement describes as "The application is able to work on constructing the response in parallel with the storage layer confirming the write" (https://blog.cloudflare.com/sqlite-in-durable-objects/, 2024-09-26, as W1 section 5 read it). Nothing in the path touches R2 or D1. The estimate for the bound of `realtime.keystroke.within-300ms` stays `research-options.md` 5b's 10 to 30 ms a frame in region; no first party millisecond figure exists (W1 finding 11), so the row on the preview is the first number.

### 1.2 A join

```
B opens /edit/<deck> on the app's origin
  loader readEditorDeckFn (write.ts 401 onward)
    requestIdentity (cookie, bearer or session) → decideFor('read') → viewerFacts
    document: DECK_ROOM.get(idFromName(deck)).fetch('/internal/doc?atLeast=...')   the live document at the head
    ticket: mintTicket({ deck, client, principal, identity, role, via, showNames, readComments, origin, exp: now + 300 s })
    payload.room = { seq, tier: 'do', url: 'wss://...', ticket, clientId }
  room client → wsTransport.open({ since: seq })
  browser → GET /rooms/<deck>/socket  Upgrade: websocket  Sec-WebSocket-Protocol: turboslide.v1, t.<ticket>
  realtime Worker fetch: Origin in the allowed list, ticket signature and expiry, deck id a slug
    → DECK_ROOM stub.fetch(request with the verified ticket as a header)
  DeckRoom.fetch: acceptWebSocket(ws, [deck, clientId, principal]); serializeAttachment(ticket facts + presence state)
    hello: { seq, revision, clientId, role, clients (roster from attachments), editing, tier: 'do', covered }
    replay: since(position) from SQLite under replayPlan (admission.ts 85 to 89), resync past 2,000 or a hole
  presence: B's first state frame → every socket; A's chip draws B
```

The identity fields of the roster row (`rosterEntryFor`, `room.ts` 2449 to 2484) are resolved by the app at mint time and ride the ticket, so the object never reads D1. Row `realtime.join.chip-within-1s`: the second browser's chip is one frame after B's hello.

### 1.3 A presence frame

```
B moves the pointer; the stage samples per 80 ms batch (PRESENCE_BATCH_MS, protocol.ts 54)
  room client coalesces, latest wins, 15 a second cap (protocol.ts 55)
  frame { t: 'presence', ...PresencePost }   ≤ 2,048 bytes
  DeckRoom.webSocketMessage: clock check against the attachment; the budget per client
    durable fields (slideId, selection, caret, follow, pointerOn, presenting): attachment rewritten (≤ 16,384 bytes)
    volatile only (pointer, drag, clock): not stored
    fan out { type: 'presence', entry } to every other socket; pointer kept for owners and editors among the first 20
B idle: heartbeat every 5 s is the literal string the object registered with setWebSocketAutoResponse
    → answered at the edge, no wake, no row, no duration
B closes the tab: webSocketClose → leave published at once to every socket
```

The two frame classes are R1's working tree semantics (durable and volatile, `read-channel.md` 5 item 1) kept on the socket. The heartbeat as an auto response is the single rule that keeps the object asleep for the 48 idle minutes of an editor hour: "If a request is received matching the provided request then the auto-response will be returned without waking WebSockets in hibernation and incurring billable duration charges" (https://developers.cloudflare.com/durable-objects/api/state/, dateModified 2026-09-30, W1 section 4). The 30 s dim of `realtime.caret.dims-and-leaves` is read from `getWebSocketAutoResponseTimestamp` on the next real event, never from a timer, because a standing `setTimeout` or `setInterval` keeps the object awake and billed (W1 finding 4).

### 1.4 An agent HTTP write

```
POST /api/actions/text.set?deck=<id>   Authorization: Bearer <api key>   (the app's origin)
  requireAgentAuth → callerFactsFor: author.kind agent, run id, principal (actions.ts, R1's working tree)
  deckDispatcher → roomBackedStore.write (room.ts 1146 to 1178) → admitServerWrite (3281 onward)
    tier do: DECK_ROOM.get(id).fetch('/internal/write', { base, mutations, author, clientId: 'agent:<principal>' })
  DeckRoom.fetch('/internal/write'):
    bearer check (the request came through the binding; the app verified the caller)
    admit as one entry at the head with the transform, the reducer, the validator
    INSERT; fan out { type: 'op' } to every socket (A's tab draws the agent banner, controller.tsx 1660 to 1670)
    checkpoint now (force): snapshot put, record put with origin, body puts, deck.json put If-Match
    answer { revision, record, seq }
  the route answers the agent; flushRoom before an agent read is '/internal/flush'
```

The record exists before the answer, as `admitServerWrite` requires today (`room.ts` 3443 to 3470, `read-channel.md` 1.3 item 5). One Worker request, one object request, four to five Class A operations.

### 1.5 A reload

```
A reloads with three pending ops in the pending store (pending-store.ts 1 to 48)
  loader: /internal/doc at the head; ticket; room.seq = head
  socket open at since = head; hello; replay is empty
  offerPersisted: the three ops filtered by heldOps, posted at the current base
  DeckRoom: dedupe by opId against the tail (invariant 3); a first attempt that landed answers its seq
  the resync read (readEditorDeckFn with since) asks /internal/doc?since=<old position>
    → origins of the records above it, from SQLite entries and the records' origin field
```

The document a reload reads is the object's, not a store snapshot behind by the checkpoint interval, which is what `liveIfOpen` (`room.ts` 1061) and `roomBackedStore.read` (1139) give today in process (`read-channel.md` 1.3 item 6). Bound `realtime.reload.loses-nothing`: 3 s.

### 1.6 Twenty seconds offline

```
A's network drops; the transport's offline listener aborts the socket (controller.tsx 346 to 351 today)
  room client: pending ops stay queued; the reopen ladder (reopenWaitMs, room-client.ts 1666)
  B keeps typing; the object fans out to B alone; A's socket closed → webSocketClose → leave
A's browser fires online: holdForHello (room-client.ts 1083), reopen at once
  new ticket if the old one expired (GET /api/decks/<id>/ticket); socket open at since = A's position
  hello; replay from SQLite covers the gap exactly (invariant 9)
  flush: A's ops at the caught up base, transformed by the object past B's entries
  B draws A's words at the shifted offset
```

The 8 s gap watch (`watchGap`, room-client.ts 1150) stays as a guard. Bound `realtime.reconnect.loses-nothing`: 3 s after the reconnect.

### 1.7 A version checkpoint

```
alarm() fires (2 s after the last op, or 10 s after the previous commit under continuous editing)
  entries since covered → coalesceEntries (coalesce.ts 1 to 29): one write per author per run
  for each run:
    snapshot = JSON of the live document; md5
    STORE.put('decks/<id>/snapshots/<md5>.json', body, { onlyIf: { 'If-None-Match': '*' } })   null = already there, fine
    STORE.put('decks/<id>/versions/<n>.json', record with origin { clientId, opIds }, { onlyIf If-None-Match '*' })
      null = a foreign claim on the number → section 3.3's reload path
    STORE.put('decks/<id>/slides/<slideId>.json', ...) for each changed slide
    STORE.put('decks/<id>/deck.json', manifest, { onlyIf: { etagMatches: <the etag the object holds> } })
      null = a foreign commit → section 3.3's reload path
    covered = toSeq; the object's etag = the put's result etag
  publish { type: 'checkpoint', revision, author, note } to every socket
  no trim on the hot path (section 3.2); an alarm is re set only if entries remain
```

Four sequential Class A operations per run, no Class B, no pulse. The alarm is "billed as a single row written" and counts as one request (https://developers.cloudflare.com/durable-objects/platform/pricing/, dateModified 2026-09-30, lines 41 and 104 as W1 quoted them).

### 1.8 A sign in

```
the person clicks Continue with Google in the Sign in dialog (SignIn.tsx, R4's working tree)
  POST /api/auth/sign-in/social on the app's origin → better-auth on the Worker
    state → the verification table on D1 (no secondary storage; one row written)
  302 to accounts.google.com; consent; top level GET /api/auth/callback/google
    the request carries __Host-ts_id (SameSite=Lax, a top level navigation; session.ts 184)
    code exchange; user and account rows on D1; session row on D1; the cookies set on the app's origin
    onSessionCreated (identity.ts 431 to 448): accountFacts, principals.touch, linkAnonymous (ts_alias), bindInvitations
  the editor reloads with the badge
```

This path exists only once the app and the auth routes share one origin: on `turboslide.<sub>.workers.dev` for the staging deployment, on `www.turboslide.com` after the DNS cut (section 5.4), or through the Vercel app proxying `/api/auth/*` to the Worker before it (W2 layout A''). The D1 facts: the installed `@better-auth/kysely-adapter` 1.7.4 "ships a D1 dialect" chosen when the `database` option is the raw binding, with `transaction = false`, and the library opens no transaction on `type: 'sqlite'` (W2 2.1 and 2.2); Turboslide's own five tables need a Kysely D1 dialect of their own (`kysely-d1` 0.4.0 or one in `sqlite-dialect.ts`'s shape, W2 2.1).

## 2. The authority and the auth of the channel

### 2.1 Who admits, who transforms, who holds the roster

The object does all three. The admission loop of `admitOps` (`room.ts` 1693 to 1927) and the server write of `admitServerWrite` (3281 to 3471) move into the object as `packages/realtime/src/admit.ts`, a pure module without `node:crypto` and `ioredis` (`room.ts` lines 1 and 3 import both; `packages/realtime/src` and `packages/schema/src` import no `node:` outside tests, `read-channel.md` 1.3 item 8). What the module carries: `transformEntry` (1485 to 1509), `landedOf` (1462 to 1470), `landCandidate` (1596 to 1642), `reanchorAll`, `undoOfSplices` (1584 to 1593), `betweenEntries` (1351 to 1366), `refusalIssue`, `appendShifts` (1217 to 1244) for the comment anchors, the working tree's `yieldConcurrentConversion`, and the budgets of `admitOps` 1712 to 1750 with the keys of `keys.ts` 106 to 128 as per object counters. The roster is memory while the object is awake and the socket attachments otherwise: `serializeAttachment` holds up to 16,384 bytes per socket and `getWebSockets()` returns every hibernated socket on wake (W1 section 2). The per instance machinery of the function (the slot counters 2872 to 2957, `retire` and the tab token 2708 to 2746, the reader liveness 2991 to 3015, the closer 3045 to 3106, the 60 s recheck and the 240 to 290 s lifetime) has no reason in one object with socket close events (`read-channel.md` finding 13) and is not ported; the caps of `CAPS.streams` (`admission.ts` 39: anonymous 4, signed in 8, agent 4, address 16) become the object's count of open sockets per identity key and per address from the ticket.

### 2.2 How a tab proves its right to join

The ticket. A tab never carries a cookie to the realtime Worker (section 1), so the app mints a signed token from the facts the function computes today for the stream route's hello (`viewerFacts`, `room.ts` 2602 to 2617; `ViewerFacts` 2500 to 2508) and the client id it mints (`mintClientId` 2663 to 2668):

```
RoomTicket (packages/realtime/src/ticket.ts, zod, browser safe, WebCrypto HMAC-SHA256)
  v: 1
  deck: slug                      the deck id (SLUG_PATTERN)
  client: 32 hex                  the client id the app minted
  principal: string               the principal id (anon_<uuid> or the account's)
  identity: string                the budgets key (the identity string admitOps keys on)
  role: owner | editor | commenter | viewer
  via: how the role was granted (ViewerFacts.via)
  showNames, readComments: boolean
  origin: the page's origin       one of the allowed origins; checked against the upgrade's Origin header
  iat, exp: seconds               exp = iat + 300
token = base64url(payload) '.' base64url(HMAC-SHA256(TURBOSLIDE_ROOM_SECRET, payload))
```

It rides the `Sec-WebSocket-Protocol` header as the second value (`turboslide.v1, t.<token>`), which the browser's `WebSocket(url, protocols)` constructor sends and the Worker reads before `acceptWebSocket`, so a refused ticket is a refused upgrade with a status the transport reads as today (`controller.tsx` 371 to 385 maps a refused open's status, `read-channel.md` 4 item 1), and the token lands in no URL and no log line. On the HTTP belt (`POST /rooms/<deck>/ops`, `/presence`) it rides `Authorization: Ticket <token>`. The Worker verifies the signature with the shared secret, the expiry, the deck id against the path, and the `origin` claim against the request's `Origin` header, which is the CSRF filter of `start.ts` 19 to 22 and `refuseCrossSite` (`room.ts` 3165 to 3184) moved to the upgrade. In the end state the app Worker mints the ticket in the same request that runs `requestIdentity` and `decideFor` and hands it to the object over the binding; in phase 1 the Vercel route `GET /api/decks/<id>/ticket` mints it. One admission rule for both phases.

The refresh and the revocation. The ticket lives 300 s; the room client fetches a fresh one at 240 s and sends `{ t: 'ticket', token }` over the socket, and on a reopen the transport fetches one first. A grant change (the share and access routes, `access.ts` `noteLinkGrant` 186 to 195 and the access record writer) posts `/internal/rooms/<deck>/access { principals | all }` through the binding; the object sends `{ t: 'reauth' }` to the matching sockets and closes any whose fresh ticket does not arrive within 10 s or arrives with a lower role than the one its attachment holds, publishing `leave`. The tab's refused refresh is today's `access` event (`RoomEvent` 193 to 236) and the dialog that follows. Today's 60 s recheck (the stream route line 70) is replaced by the push plus the 300 s expiry, so a revocation that fires the push lands in one frame and one that does not lands within 300 s; the ticket life is the one number the design trades against Worker requests (15 refreshes an editor hour, section 6).

Why not a cookie on the Worker's host: a `SameSite=None; Secure` cookie set by the Worker would serve its own host only and is subject to third party cookie policies (W4 5.1); the ticket avoids the question. Why not the query string: Workers log up to 256 KB per request and the app logs one line per request, so a token in a URL is a token in two logs (W4 5.3).

### 2.3 The ordering guarantees

- One object per deck, one handler at a time: a Durable Object processes its events serially, and the entry's `seq` is assigned in the handler before the ack. The 20 pointer publishers at the 15 a second cap of the worst room are 300 messages a second, under the soft limit of "1,000 requests per second" per object (https://developers.cloudflare.com/durable-objects/platform/limits/, dateModified 2026-06-01, W1 section 3).
- Durability before the ack: the SQLite `INSERT` returns before the ack frame is written (1.1). An object evicted between the ack and the checkpoint rebuilds from SQLite on wake (2.5).
- The replay from SQLite covers the gap exactly (`replayPlan`, `admission.ts` 85 to 89): a position above the head or more than 2,000 behind answers `resync`; a page whose first seq is not `position + 1` answers `resync` (R1's working tree rule, `read-channel.md` 5 item 5). `hello.covered` is the object's `covered`.
- The fan out order is the stream order: each socket receives entries in `seq` order because the handler writes them in that order and the runtime delivers a socket's frames in order.
- The agent write and the tab's ops enter the same order through the same handler (1.4).

### 2.4 The invariants of SYNC.md 3.11 and REALTIME.md 3.9, restated for the object

`docs/SYNC.md` 3.11 (177 to 191) and `docs/REALTIME.md` 3.9 (116 to 118); the restatements follow `read-channel.md` section 3 and add what the R2 commit changes.

1. One ordered log per deck. The object's SQLite entries are the order in front of the record log; the manifest put with `etagMatches` on R2 is the one commit point, written by the object alone (section 3). A record is claimed with `If-None-Match: *` and never overwritten; a record above the proven manifest is a claim and is never applied. A hole is recorded, never a stop.
2. Transform before place, on every tier. In the object, by `admit.ts`; the tie rule rides the frame as `insertTie` (`protocol.ts` 188 to 202); the retry after a moved head does not exist inside one object, since the head never moves between the read and the write of one handler.
3. Every record names its origin; an op id is admitted at most once within 2,000 of the head. The object's record carries `origin: { clientId, opIds }` from `CoalescedWrite` (`coalesce.ts` 17 to 29), which `checkpoint.ts` 196 to 204 does not pass today (`read-channel.md` finding 9); the dedupe is the tail check of `admitOps` 1789 to 1805 over SQLite.
4. The client acknowledges by op id; transport independent (`room-client.ts` 987 to 1027).
5. Every text a person can type into is a text run; schema, unchanged.
6. A reader receives every op its role may see with the notes stripped for a commenter and a viewer: `filterEventForReader` (2566 to 2599), `rosterEntryForReader` (2515 to 2539) and `stripNotes` (2542 to 2556) run per socket in the object with the ticket's `role`, `showNames` and `readComments`.
7. The head is read, never listed. In the object the head is memory and SQLite; on the hello and never polled (REALTIME.md 3.9's reading). The app's listing page reads `deck.json` and the snapshot by key on R2, never a list of records.
8. Every read of an overwritten path is proven. R2 reads are strongly consistent ("readers will immediately see the latest object globally", https://developers.cloudflare.com/r2/reference/consistency/, W3 2.2), so the proof is the etag of the body read; the copies and the cache busting fetch of `provenGet` (`access-store.ts` 382 to 420) are no ops that the Vercel side keeps until a later cut (`read-store.md` 1.4).
9. The stream opens at the client's position, the replay covers exactly the gap, `hello.covered` is the object's covered seq, the ack's `between` fills what sits under an admitted entry (`betweenEntries` over SQLite).
10. Unacknowledged ops survive a reload in the pending store; a replay whose first attempt committed is acknowledged, never committed again, by the tail dedupe and the resync read's `origins` from `/internal/doc?since=`.
11. Undo per author moves the inverse past every remote entry; client side, unchanged.
12. The budget: zero timed store calls per tick per open deck on every instance, since no function and no Worker polls anything; the object's own R2 calls are its checkpoints (four Class A per run) and its wake (one Class B); the `cost.*` rows of section 8 restate the ceilings for the `do` column.
13. Retention on a schedule: the snapshot prune every 20th commit rides the object's checkpoint (one `list` of `snapshots/`, one `delete`); the daily sweep of `docs/SYNC.md` 3.6 is a Cron Trigger on the app Worker (Free: "5" per account, W4 section 1).

Two more, which the Redis rule of `docs/hosting.md` section 9 ("Redis must never hold the only copy of anything", HEAD 728 to 729) does not cover: the entries between the last checkpoint and the head are the only copy for up to 10 s (the hard trigger) and live in the object's SQLite, whose storage is durable and recoverable to any point in the past 30 days (https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/, W1 section 2), so the rule reads "the object's storage holds entries for at most the checkpoint interval before R2 has them, and an alarm is always set while any entry is uncommitted"; and the rebuild after an eviction is `syncLive`'s cold path (`room.ts` 794 to 824: the snapshot at the last checkpoint plus the entries above it) run in the constructor's first `blockConcurrencyWhile`, so no hello is answered from an unbuilt document.

### 2.5 The object's state

| Where | What | Why |
| --- | --- | --- |
| SQLite table `entries` | `seq`, `rev`, `clientId`, `opId`, `kind`, `body` (JSON), `at`; index on `opId` | the order, the replay, the dedupe; one row per op |
| SQLite table `meta` | `head`, `covered`, `revision`, `etag` (of `deck.json` on R2), `snapshotMd5`, `schemaVersion`, the flags | the cold rebuild, the commit's `etagMatches` |
| SQLite table `doc` | the live document as one row per slide plus one for the manifest, each under 2 MB | a picture heavy deck's JSON can pass the 2 MB row cap as one row (W1 section 2), so the document is rows per slide; rebuilt from R2 only when `meta.etag` disagrees with R2's head |
| memory | the live document as an object, the roster, the budgets' windows | rebuilt from `doc` and from `getWebSockets()` plus attachments on wake |
| socket attachment | the ticket facts, the durable presence state, the hue slot | ≤ 16,384 bytes; survives hibernation |

A wake with the heartbeat auto answered happens on a join or the first real frame after a quiet spell. Its cost is the constructor's reads: `meta` (1 row), `doc` (one row per slide, 20 to 80 rows for a seller's deck), the tail above `covered` (0 to a few hundred rows), and one `STORE.head('deck.json')` to compare the etag (1 Class B). Section 6 counts it.

## 3. The version log and the store

### 3.1 Who writes records, where

The object writes every record of a deck, to R2, through its binding, as 1.7 shows. The writes it makes per checkpoint run and the conditions it uses:

| Key | Condition | On refusal (`put()` answers `null`) |
| --- | --- | --- |
| `decks/<id>/snapshots/<md5>.json` | `If-None-Match: *` | the snapshot exists; fine |
| `decks/<id>/versions/<n>.json` | `If-None-Match: *` | a foreign claim on `n`; the reload path of 3.3 |
| `decks/<id>/slides/<slideId>.json` | none, last writer wins (as today, `blob-store.ts` 1868) | |
| `decks/<id>/deck.json` | `etagMatches: <meta.etag>` | a foreign commit; the reload path of 3.3 |

The layout, the record shape, the snapshot's md5 naming and the manifest naming the bodies are `docs/SYNC.md` 3.1, 3.5, 3.6 as the store writes them today (`blob-store.ts` 1766 to 1981, `read-store.md` 1.3); the object imports the pure parts of `packages/store` (`versions.ts`'s parser, `snapshots.ts`'s md5 rule, the manifest builder) and none of `blob-store.ts`'s mirror, which is `node:fs` (`blob-store.ts` 24 to 34). The record carries `origin` (2.4 item 3). No pulse is written: `pulse.json` exists for the blob tier's pollers and the `do` tier has none; the Vercel render service reads documents by key and polls nothing.

The one write per second per key rule of R2 ("Maximum concurrent writes to the same object name (key) | 1 per second", https://developers.cloudflare.com/r2/platform/limits/, W3 2.3 item 3) is met by construction for `deck.json`: one writer per deck, and a run with two authors writes two records and one manifest, the object spacing the second manifest put a second after the first inside the handler (the run's writes are sequential). The S3 side (the render service's thumbnails, exports) never writes a document.

What else writes under `decks/<id>/`: the creation of a deck (`pushDeckDir`, `blob-store.ts` 2191 to 2250: about 290 puts eight at a time, `deck.json` last with `If-None-Match: *`) runs in the app Worker over the binding before any object exists for the id; the trash and restore stamp (2636 to 2683), `saveVersion` (1983 to 2031), `lease` and `release` (2067, 1623 to 1634), `putAsset` and `removeAsset` (2133 to 2159) go through the object's `/internal/write` as server writes, so the object stays the single writer of a deck once it exists. The collection level objects (`index/fresh-decks.json`, `templates/`, `users/<principal>/decks.json`, `links/<hex>.json`, `exports/`, `bundles/`, `builds/`, `u/`, `system/`) are the app Worker's and the render service's, written with `etagMatches` where today's code uses `ifMatch` (`read-store.md` 1.3) and plain puts otherwise; `index/fresh-decks.json` and the phantom folder memory exist for Blob's listing lag (`read-store.md` 1.4) and are retired in the store lane, since "The list operation will list all objects at that point in time" on R2 (the consistency page, W3).

### 3.2 Retention in the object

The object keeps entries in SQLite after a checkpoint for the replay (10,000 behind `covered` today, `STREAM_RETAIN_ENTRIES`, `checkpoint.ts` 37). It does not delete rows on the hot path, because "Deletes are counted as rows written" (the pricing page, line 106 as W1 quoted it) and a delete per op doubles the one row the Free plan's write cap is spent on. Compaction is a partition: entries are inserted into `entries_<month>`; the daily sweep of 2.4 item 13 drops a month's table once `covered` is above its last seq and it is older than the replay window. Whether `DROP TABLE` counts rows written is W1 open 1; day 0 of the Worker lane probes it with one table and `rowsWritten` on the cursor (https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/, W1 section 2: "The final value is used for SQL billing"). Section 6 gives the write count both ways. Storage: 300 bytes an op is 43 KB an editor hour; the Free plan's per object storage reads 1 GB by the limits page's FAQ against 10 GB in its table (W1 open 6), 23,000 editor hours of one deck at the safe figure.

### 3.3 How the room follows an external order

In the end state there is no room outside the object, so the question is what the object does when R2 refuses a conditional put, which happens only when something else wrote the deck: a blob tier instance during the alias switch of the flip (section 5), a copy or restore script, or a bug.

```
deck.json put with etagMatches answers null
  head deck.json → the foreign etag and revision m > the object's revision n
  read versions/<n+1>.json .. versions/<m>.json by number (records carry mutations)
  for each foreign record: publish it to every socket as an op entry with clientId 'store'
     (the follower's rule today, room.ts 938 to 947) and reduce it into the live document
  transform the object's uncommitted entries (covered+1 .. head) past the foreign mutations with transformEntry;
     re-place; an entry the reducer refuses is returned to its author as reject
  set meta.etag, meta.revision = m; commit the re-placed run as records m+1 ...
  publish checkpoint
```

A record whose number is taken (`versions/<n>.json` refused) is the same path with one number. A snapshot read that proves nothing (the manifest names a snapshot that is missing) is a hole recorded as `docs/SYNC.md` 3.6 says and an external checkpoint to the sockets. The window in which this path runs is the seconds of a deploy's alias switch (REALTIME.md 3.7) and the ship note records it.

In phase 1 the Vercel app holds no live document on the `do` tier: `liveIfOpen` (`room.ts` 1061) answers the object's `/internal/doc`, `roomBackedStore.read` and `revision` (1139 to 1145) read the object, `flushRoom` (1088) posts `/internal/flush`, and the editor's loader and resync read ask `/internal/doc?atLeast=&since=` (write.ts 442 to 490 today reads `liveAtLeast` and `originsSince` over the mirror). The follower (`follow` 890 to 990, driven by `store.watch`) is off on the `do` tier as it is on the blob tier (891). The reads of the viewer and the print payload (`decks.ts` 855 to 863) take the object's document when a room is open and the R2 snapshot otherwise.

### 3.4 The store below the room

On the app Worker the store is `BlobClient` (`blob-store.ts` 153 to 168: `head`, `get`, `list`, `folders`, `put`, `del`) over the R2 binding, one module `packages/store/src/blob-r2-binding.ts`, beside `blob-vercel.ts`, `blob-disk.ts` and `blob-fake.ts` (three implementations of one contract exist, `read-store.md` 1.1). On the Vercel render service the same interface is `blob-r2.ts`, a SigV4 signer over `fetch` against `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` with `region: auto`, `PutObject` only and never a multipart helper (W3 2.2), both checksum settings `WHEN_REQUIRED` or `Content-MD5` sent by hand (W3 2.3 item 2). The mapping of the six calls to S3 operations and classes is `read-store.md` 3.2 and W3 2.2; `BlobEntry.url` is computed from `TURBOSLIDE_PUBLIC_STORE_BASE` for a public path and is an unfetchable marker for a document.

What does not move as written is the mirror: `BlobStore` is "the overlay as a mirror of a store" over `node:fs` (`blob-store.ts` 1 to 12; `select.ts` 100 to 103 puts it under `<tmpdir>/turboslide`), and on a Worker `/tmp` is memory, "not persistent and are unique to each request", counted against the 128 MB isolate (https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/, dateModified 2026-04-23, W4 section 1). The app Worker therefore reads a document without a mirror: `deck.json` by key, the snapshot it names by key (two Class B), the records by number only for Version history. The pull's proof machinery (1239 to 1258), the record walk, `StaleMirrorError`, the fresh deck index and the copies were built against Blob's two lags (`read-store.md` 1.4) and have no work on R2. The `FileStore` stays the checkout's and the Vercel render service's store (the render service keeps the mirror over `/tmp` as today, now synced from R2 over the S3 client); on the Worker the `DeckStore` interface (`store.ts` 182 to 226) gets a fourth implementation `r2-store.ts` whose `read` is the two gets, whose `write` is `/internal/write` to the object, and whose collection (`hosted.ts` 81 to 119: `list`, `cardFacts`, `has`, `open`, `create`, `copy`, `trash`, `restore`, `remove`, `templates`) is the binding. This is the two round item W4 4.1 named and the one blocking dependency on Vercel for the pages (W4 section 6 item 3).

The public set (twins `decks/<id>/assets/`, `.thumbs/`, `exports/`, `bundles/`, `builds/`, `u/`) is served by the app Worker at `/store/<pathname>` from the binding with `Cache-Control` from `httpMetadata`, `Content-Disposition: attachment` when the object was stored with it (exports are written with the header at put time, replacing Vercel Blob's `?download=1`, W3 3.5), `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy` as the assets route sets them (`headers.ts` 77 to 95), every other prefix refused (`read-store.md` 3.4 item 3). `TURBOSLIDE_PUBLIC_STORE_BASE` is `https://<app host>/store`, read by the CSP's `img-src` and `connect-src` (`headers.ts` 154 to 167, 234 to 236), the avatar base (`avatar-tier.ts` 28) and the R2 clients. `.thumbs/` joins `isPublicPath` (`migrate.ts` 81 to 86). Every such read is one Class B operation, since the Workers cache is not functional on `workers.dev` (W3 3.3); a custom domain on the bucket would cache them and needs the zone (section 5.4).

## 4. The code changes by file

### 4.1 The fourth tier

- `packages/realtime/src/channel.ts` 10: `REALTIME_TIERS = ['memory', 'redis', 'blob', 'do']`. `protocol.ts` 328's `tier: z.enum(REALTIME_TIERS)` follows, and `roomEventOf` (440 to 441) drops a frame with an unknown word, so the client that knows `do` deploys before any server says it (`read-channel.md` finding 6).
- `packages/realtime/src/select.ts`: a new variable `TURBOSLIDE_REALTIME_URL` (the realtime Worker's origin). Precedence: a forced `TURBOSLIDE_REALTIME` wins (61 to 78); else the URL set selects `do`; else `REDIS_URL` selects `redis` (79); else `VERCEL` selects `blob` (80 to 87); else `memory`. `do` forced or selected without the URL or without `TURBOSLIDE_ROOM_SECRET` is a TypeError at the first request, in the shape of the `redis` refusal (67 to 71). `noticeFor('do')` is null.
- `packages/realtime/src/do.ts` (new): `doChannel({ url, secret, bearer, fetch })` answering `RealtimeChannel` for what a function or the app Worker still asks of the channel on this tier, over the realtime Worker's `/internal` routes under `TURBOSLIDE_TOKEN`: `head`, `since`, `publish` (an external checkpoint announce), `presence.roster`, and `append` refused with a TypeError (the function never transforms on this tier). It adds the tier's own methods the way `MemoryChannel` adds `setFlag` (`memory.ts` 38 to 43): `write(deckId, { base, mutations, author, clientId })` answering `{ revision, record, seq }`, `document(deckId, { atLeast?, since? })` answering the live document, the seq and the origins, `flush(deckId)`, `accessChanged(deckId, { principals | all })`, `health()`. On the app Worker the same module takes the `DECK_ROOM` binding instead of a URL and calls `stub.fetch` with the same paths.
- `packages/realtime/src/ticket.ts` (new): `RoomTicket`, `mintTicket`, `verifyTicket`, the zod schema of 2.2, WebCrypto only.
- `packages/realtime/src/admit.ts` (new): the pure admission split out of `room.ts` (2.1). `room.ts` imports it for the memory, redis and blob tiers so the three tiers and the object run one transform.

### 4.2 The Worker

- `packages/realtime/worker/deck-room.ts` (new): the `DeckRoom` class extending `DurableObject`: `fetch` (the upgrade, `/internal/*`), `webSocketMessage`, `webSocketClose`, `webSocketError`, `alarm`; the SQLite schema of 2.5; the checkpoint of 1.7 and 3.1 over `env.STORE`; the reload path of 3.3; `setWebSocketAutoResponse(new WebSocketRequestResponsePair(<the heartbeat string>, <the pong string>))` in the constructor; no `setTimeout`, no `setInterval`.
- `packages/realtime/worker/socket-protocol.ts` (new): the up frames `{ t: 'ops', req, ...OpsPost }`, `{ t: 'presence', ...PresencePost }`, `{ t: 'leave', clock }`, `{ t: 'ticket', token }`; the down frames: every `RoomEvent` plus `{ t: 'ack', req, ...OpsResponse }` and `{ t: 'reauth' }`; zod over `protocol.ts`'s schemas.
- `packages/realtime/worker/commit.ts` (new): the R2 commit of 3.1 with the conditional puts, the record builder with `origin`, the snapshot md5, the slide body diff; imports the pure parts of `packages/store` only.
- `packages/realtime/worker/entry.ts` (new): the Worker's `fetch`: `GET /rooms/:deck/socket` (Origin check against `ALLOWED_ORIGINS`, the ticket's verification, the stub), `POST /rooms/:deck/ops` and `/presence` (the HTTP belt, the ticket in `Authorization`), `/internal/*` (the bearer `TURBOSLIDE_TOKEN`, or the service binding's caller in the end state), `GET /health`.
- `apps/realtime-worker/` (new): `package.json` (`@turboslide/realtime-worker`, depends on `@turboslide/realtime`, `@turboslide/schema`, `@turboslide/store`, `wrangler` as a dev dependency), `src/index.ts` (re-exports `DeckRoom` and the default handler from `packages/realtime/worker`), `tsconfig.json`, `README.md`, and:

```jsonc
// apps/realtime-worker/wrangler.jsonc
{
  "name": "turboslide-realtime",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "observability": { "enabled": true },
  "durable_objects": {
    "bindings": [{ "name": "DECK_ROOM", "class_name": "DeckRoom" }]
  },
  "exports": {
    "DeckRoom": { "type": "durable-object", "storage": "sqlite" }
  },
  "r2_buckets": [{ "binding": "STORE", "bucket_name": "turboslide-store" }],
  "vars": {
    "ALLOWED_ORIGINS": "https://www.turboslide.com,https://turboslide.com,https://turboslide.vercel.app,https://turboslide.<sub>.workers.dev",
    "TURBOSLIDE_BUILD_COMMIT": ""
  }
}
```

The `exports` form and its rules ("storage is required for live entries", "mutually exclusive with migrations", the namespace provisioned on the first `wrangler deploy`, lifecycle changes applied by `wrangler deploy` and not `versions upload`) are https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ (dateModified 2026-09-28) as W1 6.1 quoted it. The pipeline's preview hosts (`https://turboslide-<hash>-kl01s-projects.vercel.app`) are not in the list; a preview's ticket carries its origin and the Worker accepts an origin either from the list or matching `*.vercel.app` under a second variable `ALLOWED_ORIGIN_PATTERNS`, which the design names and the lane sizes (W4 5.2).

Secrets of the realtime Worker, set by `wrangler secret put` from stdin ("The `put` command can also receive piped input", https://developers.cloudflare.com/workers/wrangler/commands/workers/, last updated Sep 22, 2026): `TURBOSLIDE_ROOM_SECRET` (32 bytes, shared with the app), `TURBOSLIDE_TOKEN` (the bearer of `/internal`, shared with the app and the render service).

### 4.3 The server on the `do` tier (phase 1, the Vercel app; the same code on the app Worker)

- `apps/studio/src/server/room.ts`: `buildChannel` (146 to 243) gains `case 'do'` returning `doChannel(...)`; `createRoom` on `do` builds no live document (`syncLive` 794 skipped as on `blob` 795), `follow` off (891), `stopWatch` off (1010), `covered` from the object (1027); `liveIfOpen` (1061), `roomBackedStore.read`, `revision` and `write` (1139 to 1178), `flushRoom` (1088), `liveAtLeast` (1965) and `admitServerWrite` (3281) take the `do` branch beside the `blob` one at each `tier === 'blob'` site (795, 891, 1010, 1027, 1098, 1136, 1751, 3287); `version.restore` becomes `doChannel.write` with a `restore { revision }` kind the object serves from the R2 snapshot at that revision; `announceExternal` (992 to 1007) is `doChannel.publish`.
- `apps/studio/src/routes/api/decks.$deckId.ticket.ts` (new): `requestIdentity`, `decideFor('read')`, `viewerFacts`, `mintClientId`, `mintTicket`; answers `{ ticket, url, exp, clientId }`; the CSRF filter of `start.ts` applies.
- `apps/studio/src/routes/api/decks.$deckId.stream.ts`, `decks.$deckId.ops.ts`, `decks.$deckId.presence.ts`: on the `do` tier answer `410 { code: 'tier_moved', tier: 'do' }`; the room client treats a 410 on an open or a POST as "reload the editor" (the loader hands the socket transport). The three routes stay as the blob tier's.
- `apps/studio/src/server/write.ts` `readEditorDeckFn` (401 onward): on `do` the document and `origins` come from `doChannel.document`; `room` in the payload (the `EditorDeck` field at 489) gains `url`, `ticket`, `clientId` and `exp`.
- `apps/studio/src/server/access.ts` and the share and access routes: `doChannel.accessChanged` after every grant write (`noteLinkGrant` 186 to 195, the access record writer, the invitation binder).
- `apps/studio/src/server/thumbs.ts` and `card-thumb.ts`: the card thumbnail's triggers in the ops and stream paths (`decks.$deckId.ops.ts` 137; the stream route 142 to 149) lose their hook on `do` (`read-channel.md` finding 12); the object's checkpoint publishes `{ type: 'checkpoint' }` and the app's `/internal` listener is not a thing a Worker has, so the trigger moves to the client: the tab posts `POST /api/decks/<id>/thumb` once the deck has rested 30 s and once on `pagehide` (`card-thumb.ts` 37 to 39's rules), and the route forwards to the render service.

### 4.4 The client transport

- `apps/studio/src/editor/transport.ts` (new): `sseTransport` moved from `controller.tsx` 332 to 492 (R3's file; the move is one import line by request) and `wsTransport(deckId, room: { url, ticket, clientId, exp })` answering `RoomTransport` (`room-client.ts` 177 to 181): `open` is one `WebSocket(url, ['turboslide.v1', 't.' + ticket])` per open, reporting its end once as `StreamFailure` (113 to 126) with the close code and the `retry-after` the Worker sends in the close reason, reconnecting nothing; `postOps` sends `{ t: 'ops', req }` and resolves on the `ack` with that `req` within the 30 s deadline (`controller.tsx` 500), or posts to the HTTP belt when no socket is open (the C3-F1 rule, `room-client.ts` 1449 to 1456, kept at the cost of two paths into the object, `read-channel.md` 4 item 3); `postPresence` sends the frame, and the leave under `pagehide` goes by `sendBeacon` to the HTTP belt as the belt for a tab killed mid flight (4 item 8); the `offline` listener closes the socket (4 item 4); the ticket refresh at 240 s of 2.2.
- `packages/realtime/client/room-client.ts`: the `do` word in the hello is the working tree's `helloTier` rule's trigger (`build/r1.md` R1-R2a); the 410 rule above; nothing else, since the state machine sits above the transport (`read-channel.md` finding 7).
- `apps/studio/src/server/headers.ts` 236: `connect-src` gains the realtime Worker's origin as `wss:` and `https:`; the policy is report only until the enforce flip (`docs/hosting.md` 1032, W4 5.2).

### 4.5 The store

- `packages/store/src/blob-r2.ts` (new, SigV4 over `fetch`, Node and Workers) and `blob-r2-binding.ts` (new, the binding); `select.ts` 17 to 18 keeps the three kinds and `hosted.ts`'s `BlobClientFactory` gets a third factory beside the Vercel one and the dev client (`hosting-plugin.ts` 40; `root.ts` 94 to 101) chosen by `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (the render service) or the `STORE` binding (the Worker); `TURBOSLIDE_PUBLIC_STORE_BASE` replaces `TURBOSLIDE_PUBLIC_STORE_HOST` in `headers.ts` 167, `avatar-tier.ts` 28 and the URL computation.
- `packages/store/src/r2-store.ts` (new): the Worker's `DeckStore` and collection without a mirror (3.4).
- `packages/store/src/migrate.ts` `runMigrationStep` (309 to 435) with `documents` an R2 client, `isPublicPath` with `.thumbs/`; `scripts/blob-copy.mjs` with an R2 target put for the public set (W3 5.2).
- `apps/studio/src/server/export-jobs.ts` 367 to 370 and `export-batch.ts` 589: `Content-Disposition` stored at put time, the `?download=1` suffix dropped.
- `apps/studio/src/routes/store.$.ts` (new): the public read route of 3.4.
- `packages/store/src/pulse.ts` `isStoreBusy` (187 to 198): the S3 error shape's 429 as `retryAfter`.

### 4.6 Accounts on D1

- `apps/studio/src/server/auth/db.ts`: kind `d1` selected when the `ACCOUNTS` binding is present (the Worker passes it through `setIdentityRuntime`'s input); `node:sqlite` (line 11) behind a dynamic import inside the `sqlite` branch, since on Workers it is "a non-functional stub" (https://developers.cloudflare.com/workers/runtime-apis/nodejs/, W4 section 1) and the import at module load would be reached by every path; `auth/d1-dialect.ts` (new) in `sqlite-dialect.ts`'s shape (1 to 8, 23 to 39: the statement kind from the SQL, booleans and dates bound by hand) over `prepare().bind().all()`, because the adapter's own D1 dialect is private (W2 2.1) and Turboslide's five tables need one; `tokens.ts` takes the cache path on `d1` as on Postgres (37 to 38, 190 to 227), since D1 has no synchronous read.
- `better-auth.ts` 251: `database: { db, type: 'sqlite' }` with the D1 backed Kysely; no secondary storage, so the session row is on D1 and `findSession` is one indexed select (W2 2.4); `rateLimit.storage` `memory` per isolate as today without Redis (278).
- `auth/schema.ts`: a sixth table `ts_principal` (`id`, `record` JSON, `touchedAt`, `expiresAt`) and a D1 backed `PrincipalStore` in `apps/studio/src/server/auth/principal.ts` beside the file and Redis ones (`identity.ts` 182 to 236 working tree); `touch` writes at most once per 300 s per principal (the ticket cadence), which turns 1,600 to 2,200 principal writes an editor hour (`read-auth.md` 4.1) into at most 12.
- The hosted switch: `TURBOSLIDE_HOSTED=1` replaces the `env.VERCEL` reads on the auth path (`middleware.ts` 24, `secret.ts` 40, `db.ts` 52, `headers.ts` 51 and 244, `start.ts` 118; `read-auth.md` 3.4) and the others T4 listed (`store/select.ts` 58, `realtime/select.ts` 80, `launch.ts` 56, `root.ts` 114; `read-runtime.md` 2.11); `isVercel` stays true on Vercel and `isHosted` reads the new variable or `VERCEL`.
- `better-auth.ts` 48 to 56 (working tree): `TURBOSLIDE_AUTH_HOSTS` gains the staging host `turboslide.<sub>.workers.dev`; `TURBOSLIDE_PUBLIC_ORIGIN` names the production origin.
- The e2e harness: `apps/studio/e2e/identity-seed.mts` (1 to 14, 36) opens the server's SQLite file to read the captured code and the alias; against a local `wrangler dev` D1 the file is Miniflare's and the seed reads through a test only route under `TURBOSLIDE_LOCAL_OPEN=1` or through `wrangler d1 execute --local` (W2 open 8). The local accounts server of `docs/PEOPLE.md` 6.2 (`TURBOSLIDE_AUTH_DB`, node) keeps running the `accounts.*` rows as today; the D1 path gets its own narrowed run.

### 4.7 The app on Workers

- `apps/studio/vite.cloudflare.config.ts` (new): `cloudflare({ viteEnvironment: { name: 'ssr' } })` before `tanstackStart()`, as Cloudflare's guide places them, with `externalServerOnly()` and `devtools()` kept for the reasons `vite.config.ts` 7 to 12 records; `build:cloudflare` in `package.json` 14. The guide: "install `@cloudflare/vite-plugin` and `wrangler`", `"main": "@tanstack/react-start/server-entry"`, a `compatibility_date`, `"compatibility_flags": ["nodejs_compat"]`, the assets directory, `wrangler deploy`, bindings in a server function with `import { env } from 'cloudflare:workers'`, and "a custom entrypoint can export Durable Objects beside the default handler" (https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/, last updated 2026-09-04, as W4 section 2 read it). TanStack's own guide says the official setup "currently uses Vite through @cloudflare/vite-plugin", not Nitro (W4). The Nitro deploy config stays the Vercel build's.
- `apps/studio/src/server/worker-entry.ts` (new): the default export wrapping the Start handler with the hosting registration (`registerHostingProviders` from `@turboslide/store/hosted` with the seed over the `ASSETS` binding and the R2 factory, the Nitro plugin's job at `hosting-plugin.ts` 25 to 44), a `scheduled` handler for the two crons (the logo refresh forwarded to the render service with `CRON_SECRET`; the sweep of 2.4 item 13), and the MCP session store moved from `globalThis` (`routes/mcp.ts` 10 to 24) to the deck's object (`/internal/mcp-session`), since an isolate is replaced at 128 MB and shares nothing (W4 row 4).
- The seed documents leave the script: `_virtual/` is 41 MB of the node-server build and the script cap is "64 MiB" uncompressed (W4 section 2, the bundle paragraph; https://developers.cloudflare.com/workers/platform/limits/, dateModified 2026-09-05), so `decks/templates` and `decks/gt-brand` ship as static assets under `/_seed/` ("Requests to static assets are free and unlimited", W4 section 1) and `keyValueSeed` reads them through `env.ASSETS.fetch`; the `packages` group (fonts, theme CSS, calibration) the same way.

```jsonc
// apps/studio/wrangler.jsonc
{
  "name": "turboslide",
  "main": "src/server/worker-entry.ts",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "assets": { "directory": "./dist/client", "binding": "ASSETS", "run_worker_first": ["/api/*", "/_serverFn/*", "/store/*", "/edit/*", "/deck/*", "/present/*", "/s/*"] },
  "durable_objects": {
    "bindings": [{ "name": "DECK_ROOM", "class_name": "DeckRoom", "script_name": "turboslide-realtime" }]
  },
  "d1_databases": [{ "binding": "ACCOUNTS", "database_name": "turboslide-accounts", "database_id": "<from wrangler d1 create>" }],
  "r2_buckets": [{ "binding": "STORE", "bucket_name": "turboslide-store" }],
  "services": [{ "binding": "REALTIME", "service": "turboslide-realtime" }],
  "triggers": { "crons": ["0 6 * * *", "30 6 * * *"] },
  "vars": {
    "TURBOSLIDE_HOSTED": "1",
    "TURBOSLIDE_REALTIME": "do",
    "TURBOSLIDE_PUBLIC_ORIGIN": "https://www.turboslide.com",
    "TURBOSLIDE_PUBLIC_STORE_BASE": "https://turboslide.<sub>.workers.dev/store",
    "TURBOSLIDE_AUTH_HOSTS": "www.turboslide.com,turboslide.com,turboslide.<sub>.workers.dev,localhost:*,127.0.0.1:*",
    "TURBOSLIDE_RENDER_URL": "https://turboslide-gt.vercel.app",
    "TURBOSLIDE_AUTHORIZE": "enforce",
    "TURBOSLIDE_MAIL": "off",
    "TURBOSLIDE_BUILD_COMMIT": ""
  }
}
```

`run_worker_first` as "an array of route patterns" sends matching requests to the script and, on the Free tier past the daily limit, such requests "will receive a 429 (Too Many Requests) response instead of falling back to static asset serving" (https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/, W4 row 15). The Free plan's variable count is "64/Worker" (W4 section 1); the list above is 10 variables and the secrets below, under it. Secrets (`wrangler secret put` from stdin): `TURBOSLIDE_TOKEN`, `TURBOSLIDE_SESSION_SECRET`, `TURBOSLIDE_DOWNLOAD_SECRET`, `TURBOSLIDE_ROOM_SECRET`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `RAMP_ROUTER_API_KEY` or `ANTHROPIC_API_KEY`, and `TURBOSLIDE_ADMIN_EMAILS` as a var.

- The render service client, `apps/studio/src/server/render-service.ts` (new): `fetch` to `TURBOSLIDE_RENDER_URL` with `Authorization: Bearer TURBOSLIDE_TOKEN` and `x-turboslide-build-commit`; the routes that reach Chromium or sharp forward their request to it unchanged: `/api/render/**`, `/api/export/**`, `/api/x/export/**`, `/api/x/render/**`, `/api/decks/**/bundle`, `/api/decks/bundle`, the thumbnail route, `/api/avatar/*` (the resize at `avatar.ts` 25), `/api/logo/refresh` (sharp at `logo-index.ts` 36), the shader frame capture, the standalone build of `download.ts`, and the server functions whose dispatcher reaches `@turboslide/headless` (the asset and material actions, `vite.config.ts` 26 to 29). The Worker's body limits make the 4.5 MB shapes (`export-sync.ts` 92, the 302 to the stored copy, the 413, the presign at 3 MB) unnecessary but harmless (W4 row 3); they stay as written because the render service still runs on Vercel.
- `packages/native/src/worker.ts` (new): `import wasm from '../wasm/turboslide_native_bg.wasm'` as a module import and `initSync({ module: wasm })` through `wasm.ts` 151 to 160's `initWasmSync`, because `WebAssembly.instantiate()` "only supports pre-compiled modules" on Workers (https://developers.cloudflare.com/workers/runtime-apis/webassembly/, dateModified 2026-04-23, W4 row 6) and `node.ts` 92 to 113 reads the bytes with `readFileSync`; `packages/effects/src/select.ts` 41 to 49 picks it when `navigator.userAgent` is the Workers runtime or `TURBOSLIDE_EFFECTS_BACKEND=wasm`. The sites that need sharp (`effects/io.ts` 6 and 13's `sharp.block` at module load, `dither-io.ts` 10, `page-raster.ts` 17, the capture modules, `avatar.ts` 25, `logo-index.ts` 36) are reached only through the render service; `effects/io.ts`'s module load `sharp.block` must move behind a function so the Worker can import the package (a one line split the lane names).
- `apps/studio/src/server/log.ts` 3 to 15: one JSON line per event through `console.log` lands in Workers Logs with "256 KB" per request (W4 section 1); the Drain has no counterpart and the gate reads `wrangler tail`.

### 4.8 The render service on Vercel

No new route: the Vercel deployment of `apps/studio` is the service. Its variables gain the four `R2_*` rows, `TURBOSLIDE_PUBLIC_STORE_BASE`, `TURBOSLIDE_REALTIME_URL`, `TURBOSLIDE_ROOM_SECRET`; its store selection reads `blob` with the R2 factory. After the DNS cut its pages are unreachable by anyone and `TURBOSLIDE_ROLE=render` makes `/`, `/home`, `/edit/*` and the auth routes answer 308 to `TURBOSLIDE_PUBLIC_ORIGIN`, so a bookmarked `turboslide-gt.vercel.app` link lands on the Worker. The WAF rules (`firewall/rules.json`, 24 rows) keep protecting the render routes on Vercel; the Worker on `workers.dev` has no WAF home without a zone (W4 open 11).

## 5. The migration and the flip

The order never breaks a deployment and lands one lane per push through the guard (`docs/FOCUS.md` 6.2; REALTIME.md 5.3). Each step has its rollback. The store moves first because the object commits to R2 and the Vercel app must read and write the same store, or the two writers of 3.3 diverge on two stores.

### 5.1 Step one: the store to R2 behind the Vercel app

The cutover `docs/HOSTING-MOVE.md` 2.2 and 3 worked out for the Vercel to Vercel case with the target changed (W3 5.5): the full copy while production is live (`scripts/blob-copy.mjs` with an R2 target put, about 12,000 objects and 1.0 GiB after the skip set, eight to eleven minutes, under $0.25 on the Vercel side and inside the free Class A million on R2; W3 5.3), the dual read window of `splitBlobClient` (`migrate.ts` 160 to 232) with `legacy` the Vercel client and `documents` the R2 client on both deployments (`www.turboslide.com` and `turboslide.vercel.app` build the same `main`), the delta pass of the objects whose etag changed, the variable flip (`R2_*` and `TURBOSLIDE_PUBLIC_STORE_BASE` set, `BLOB_READ_WRITE_TOKEN` left in place for the link window), the deploy through the guard, and the old store's deletion after the day the export job records live (`read-store.md` 4.3). Layout v2 falls out of it: the documents private behind the S3 API, the public set served by the public read Worker of 3.4 or, before the app Worker exists, by the Vercel assets route streaming the body (`TURBOSLIDE_BLOB_ACCESS=private`, the fourth path of W3 3.4). Day 0 of this lane measures the single part etag against `quotedMd5` on a scratch bucket (W3 2.3 item 1) and the latency of one `PutObject` from `iad1` to the `enam` bucket, both unmeasured. Rollback: unset the `R2_*` rows and redeploy; the Vercel store still holds every object written before the flip and the delta pass runs backwards for the window.

### 5.2 Step two: the `do` channel with the Vercel app

- The realtime Worker deploys (`wrangler deploy` of `apps/realtime-worker`); `TURBOSLIDE_REALTIME_URL` and `TURBOSLIDE_ROOM_SECRET` land on `turboslide-gt` by the wrapper; production keeps its forced `TURBOSLIDE_REALTIME=blob` row, so the next main deploy reads the URL and stays on `blob`.
- A deck on the blob tier opened by the new tier: the object's first wake finds no `meta`; it reads `deck.json` and the snapshot it names from R2, sets `revision` and `etag`, `covered = 0`, `head = 0`; the hello carries `tier: 'do'` and `revision`; the client's foreign tier rule resyncs at `hello.revision` (`build/r1.md` R1-R2a, `read-channel.md` 4 item 10), its pending ops replay against the current document (`offerPersisted`, `room-client.ts` 1797), one reload per open tab. A tab still on the blob tier's stream route gets `410 tier_moved` and reloads.
- Two deployments serving one deck during the alias switch: a blob instance commits straight to R2 with `If-Match` while the object commits with `etagMatches`; whichever is second is refused and the object's 3.3 path reads the foreign record, publishes it, transforms its tail and recommits; the blob instance's loser is `conflictFromStore` (`blob-store.ts` 1948) as today and its tab resends. The window is the seconds of the switch and the ship note records it.
- The flip: the preview gate of 5.5 on a deployment forced `-e TURBOSLIDE_REALTIME=do`, then `realtime-env.mjs flip` removes the forced `blob` row (REALTIME.md default 7.9: the removal, so a deployment without the URL falls to `blob` on its own), then the main deploy through the guard selects `do` from the URL.
- Rollback: `TURBOSLIDE_REALTIME=blob` set on production by `realtime-env.mjs rollback` and a redeploy, or Vercel's Instant Rollback to the guard's previous production deployment (REALTIME.md 3.8). Before the flip back, `POST /internal/drain` on the realtime Worker sets a flag every awake object reads and commits on; a hibernated object has nothing uncommitted older than its pending alarm (10 s), so the rollback waits 30 s and then every entry is in R2. The tabs reload once (the hello tier rule in reverse: the blob tier's hello says `blob`).
- A deployment without the Worker: `TURBOSLIDE_REALTIME_URL` absent on Vercel selects `blob` (hosted without a URL) and the app runs as today on R2. With the URL set and the Worker unreachable: the ticket route probes `/health` with a 2 s deadline, and on failure the loader hands `tier: 'blob'` with the blob tier's notice (`BLOB_TIER_NOTICE`, `select.ts` 23) and logs `realtime.unavailable`; the working tree's hand off machinery (`ensureRealtimeTier`, `supersedeRooms`, `read-channel.md` 5 item 6) gets `do` as a tier whose fallback is the in process blob channel over the R2 store, the one fallback that needs no second service (`read-channel.md` open 6). The object's tail commits on its alarm whether or not Vercel can reach it; when the Worker returns, the next hello says `do` and the tab resyncs; the object's 3.3 path absorbs what the blob instances committed meanwhile. A Cloudflare incident therefore degrades the deck to the blob tier's lag and loses nothing.

### 5.3 Step three: the app Worker on `workers.dev` and the accounts on D1

- `wrangler deploy` of `apps/studio` as `turboslide` on `https://turboslide.<sub>.workers.dev`: a complete second deployment of the same `main` reading the same R2 store and the same objects, with D1 accounts and Google sign in live on that origin if the console accepts `<sub>.workers.dev` as an authorized domain (W5 item 14, open; else sign in is read on localhost and lands with the DNS cut). The gates' hosted narrowed run reads this host; `www.turboslide.com` stays on Vercel on the `do` tier.
- Accounts before the DNS cut, optional and not the default: the Vercel app proxies `/api/auth/*` to the app Worker (a Nitro `routeRules` proxy; the installed h3 2.0.1-rc.31 relays upstream `Set-Cookie` headers, `dist/proxy.mjs` 185 to 199 as W2 3 read it) and asks `/internal/identity` for the account facts once per request (W2 layout C), one function invocation plus one Worker hop per auth request. The default waits for the DNS cut, because production has no accounts today (`research-hosting.md` 9) and the proxy moves the identity reads with the sign in.

### 5.4 Step four: the DNS cut, Kevin's alone

`www.turboslide.com` is a CNAME to `5661780b11730745.vercel-dns-016.com` and the zone's nameservers are `dns1.registrar-servers.com` and `dns2.registrar-servers.com` (`dig`, 2026-10-01, every reader note). A Worker's custom domain needs "An active Cloudflare zone" (https://developers.cloudflare.com/workers/configuration/routing/custom-domains/, W2 answer 2), so the end state is the zone moved to Cloudflare's nameservers at Namecheap, or Cloudflare for SaaS with a CNAME at Namecheap and a zone Kevin already holds on Cloudflare as the fallback origin (`gtx.dev` is on Cloudflare nameservers on the General Translation account, `read-store.md` 3.4). Either is a DNS change, which no agent makes (`docs/hosting.md` working tree 976 to 977; HEAD 800 to 802). After it: `www` and the apex route to the app Worker, `TURBOSLIDE_PUBLIC_STORE_BASE` may become a custom domain on the bucket with the cache in front of the twins (W3 3.2), Google's redirect URI `https://www.turboslide.com/api/auth/callback/google` lands on the Worker and the sign in of 1.8 is production's, the Vercel deployment turns `TURBOSLIDE_ROLE=render`, and the guard's production step is the Worker's (section 9). Until Kevin moves the record, production is phase 1 (the Vercel app on the `do` tier over R2) and the Worker is the staging and the gates' host.

### 5.5 The gates of each step

Rules 1 to 3 of REALTIME.md 1.1 hold: the whole matrix on the local tier, one preview deployment per round narrowed to what only a deployment can read, a docs only push the smoke alone. The local `do` tier is `wrangler dev` of `apps/realtime-worker` with its local object and local R2 ("All resources your Worker is bound to in your Wrangler configuration are simulated locally"; Durable Objects "currently will always run locally", https://developers.cloudflare.com/workers/development-testing/, last updated Aug 20, 2026) beside two node server processes on two ports over one tmp store with `TURBOSLIDE_REALTIME=do` and `TURBOSLIDE_REALTIME_URL=http://127.0.0.1:8787`, A's context on one port and B's on the other (the shape of REALTIME.md 5.4 item 1 with the Worker in place of Redis); the realtime Worker's own vitest rows run under the same local runtime. The one hosted preview per round is the Vercel preview forced `-e TURBOSLIDE_REALTIME=do` against a second realtime Worker `turboslide-realtime-stage` (its own namespace; 100 Workers and 100 classes on Free, W1 section 3), because a Version URL is "Not generated for Durable Objects" and the object runs one version at a time (W4 5.4), so a staged object is a second Worker, not a version. The production table is read once after the alias moves.

## 6. The free tier math

The load model is `docs/SYNC.md` 4.3 (one editor hour is 12 minutes of editing at one edit per 5 s and 48 idle minutes) as `research-options.md` 103 to 106 counts it: 144 ops, about 1,440 presence frames, 576 heartbeats, a room of two, 30 day months (W1 section 1). The design's shapes: the heartbeat is the auto response, no timer stands, presence never touches SQLite, the checkpoint alarm is 2 s idle with a 10 s floor between commits (72 commits an editing hour at most, 4 Class A each), the ticket lives 300 s (15 refreshes an editor hour), compaction is the partition drop of 3.2 (counted both ways), a wake reads at most 300 rows and one Class B. The caps are the pages W1, W2, W3 and W4 read on 2026-10-01 and this note repeats by note and section.

### 6.1 Per editor hour

| Line | Count | Where it comes from |
| --- | --- | --- |
| Object requests | 79 message units ((144 + 1,440) / 20) + 72 alarms + 3 connects + 1 ticket frame unit = about 155 | the 20:1 rule and "A request is needed to create a WebSocket connection", pricing line 63 (W1 1.1) |
| Object rows written | 144 ops + 72 alarms = 216; plus 144 if compaction is row deletes = 360 | "Each setAlarm() is billed as a single row written", "Deletes are counted as rows written" (W1 1.1) |
| Object rows read | 12 wakes × 300 + 3 joins × 300 = about 4,500 | 2.5 |
| Object duration | 1,584 handler events × 2 ms + 72 commits × 300 ms = about 25 s awake × 0.125 GB = 3.1 GB-s; the design budgets 5 | "Duration billing charges for the 128 MB", "idle and eligible for hibernation are not billed" (W1 1.1) |
| Object storage | 43 KB uncompacted | 300 bytes an op |
| R2 Class A | 72 × 4 = 288 (the floor; 48 if a run commits once per 10 s hard trigger at 12 commits) | 1.7; the Class A list (W3 2.2) |
| R2 Class B | 12 wakes + the public reads of the tab (about 20 twins and thumbnails per open) = about 35 | the Class B list (W3 2.2) |
| D1 rows read | 15 ticket mints × 1 (anonymous) or × 5 (signed in: user, profile, alias ×2, session past the cookie cache) = 15 to 75 | `read-auth.md` 4.1's branches at the ticket cadence |
| D1 rows written | ≤ 12 principal touches | 4.6 |
| App Worker requests | 1 SSR + 15 tickets + 20 store reads + 3 upgrades (the realtime Worker's) + the HTTP belt (rare) = about 40 | static assets are free (W4 section 1) |
| Realtime Worker requests | 3 upgrades + the internal calls of agent writes | "WebSocket connections made to a Worker are charged as a request ... WebSocket messages routed through a Worker do not count as requests" (W1 1.1) |

Show views add 1,000 a day in every scenario of `docs/SYNC.md` 4.3: one SSR and about 20 store reads each, 21,000 app Worker requests and 20,000 Class B a day, the GT seed deck's 202 twins the worst case (W3 4.2).

### 6.2 Per day, against the Free caps

| Product and cap (Free, per day unless said) | At 50 editor hours a day | At 500 editor hours a day | Where Free breaks |
| --- | --- | --- | --- |
| Durable Objects requests, 100,000 | 7,750 (8 %) | 77,500 (78 %) | about 645 editor hours a day |
| Durable Objects rows written, 100,000 | 10,800 to 18,000 (11 to 18 %) | 108,000 to 180,000 (108 to 180 %) | 278 to 463 editor hours a day; at 500 the cap is reached 13 to 22 hours into the UTC day on the first such day, and "further operations of that type will fail with an error" until 00:00 UTC (pricing line 30, W1 1.4), which is every admission refused and every realtime row red |
| Durable Objects rows read, 5 million | 225,000 (5 %) | 2.25 million (45 %) | about 1,100 editor hours a day |
| Durable Objects duration, 13,000 GB-s | 250 (2 %) | 2,500 (19 %) | about 2,600 editor hours a day in shape (a); one standing `setInterval` would pass it at 29 editor hours a day (W1 finding 4) |
| Durable Objects storage, 5 GB total (1 GB per object by the FAQ) | 2.2 MB a day | 22 MB a day, 7.7 months to 5 GB uncompacted | the partition drop of 3.2 keeps each object under its replay window |
| D1 rows read, 5 million | 750 to 3,750 | 7,500 to 37,500 | never at this cadence; 570 to 780 signed in editor hours a day if every op ran `requestIdentity` as it does over HTTP today (W2 answer 3), which the socket removes |
| D1 rows written, 100,000 | 600 + 80 (sign ins) | 6,000 + 80 | about 8,000 editor hours a day |
| D1 storage, 500 MB a database on Free | kilobytes | kilobytes | never |
| R2 Class A, 1 million a month | 72,000 to 432,000 a month | 720,000 to 4.32 million a month | at 500 hours in the floor shape: (4.32 minus 1) × $4.50 = $14.94 a month; the 10 s floor shape is inside the million |
| R2 Class B, 10 million a month | 52,500 + 600,000 (show views) a month | 525,000 + 600,000 a month | never at these counts; the 202 twin worst case of W3 (6.1 million a month) stays inside |
| R2 storage, 10 GB-month | 1.27 GiB (2026-09-20) | the same | never at the store's growth |
| App Worker requests, 100,000 | 2,000 + 21,000 (show views) = 23,000 (23 %) | 20,000 + 21,000 = 41,000 (41 %) | about 1,975 editor hours a day; a hosted gate day (6.19 million CDN misses in September, about 200,000 a day, W4 4.2) breaks it on its own, which REALTIME.md 1.1 rule 1 forbids |
| App Worker CPU, 10 ms per invocation | unmeasured | unmeasured | the SSR of the editor page is the one invocation likely over 10 ms; the measurement is a scratch build (W4 open 1) |
| Realtime Worker requests, 100,000 | 150 | 1,500 | never |
| Browser Run (if the browser moved), 10 minutes a day, 3 concurrent, 1 new browser per 20 s | 126 slide 1 renders a day at 1.6 to 9.0 s is 3.4 to 19 minutes (W4 row 5; `card-thumb.ts` 28 to 30) | ten times that | on a busy seller day already; Paid: "10 hours per month, then $0.09 per additional hour" (W4 row 5) |

Reading. At 50 editor hours a day every Cloudflare row holds on Free with a margin, and the one unknown is the CPU of an SSR invocation. At 500 editor hours a day the Durable Object's rows written are over the cap in every shape on day one; nothing else breaks. The fact that forces the Paid plan, with its source: "If you exceed any one of the free tier limits, further operations of that type will fail with an error" (https://developers.cloudflare.com/durable-objects/platform/pricing/, dateModified 2026-09-30, line 30 as W1 quoted it), and the Paid plan has "No limit" on requests and bills overage (W1 1.4). Under `docs/FOCUS.md` 6.2 a core row red twice on production is a stop, and a daily cutoff reddens every realtime row at once; the Free plan is therefore a plan for a product whose busiest day stays under about 280 editor hours, and the probe `cost.do.rows-written` of section 8 is what says when the day is near.

### 6.3 On the Paid plan

Workers Paid is "$5 USD per month for an account" with "10 million included per month" requests and "30 million CPU milliseconds included per month" (https://developers.cloudflare.com/workers/platform/pricing/, dateModified 2026-08-28, W1 1.1); Durable Objects on Paid: "1 million / month" requests then "$0.15/million", "400,000 GB-s / month" then "$12.50/million GB-s", rows written "First 50 million / month included", rows read "First 25 billion / month included", storage "5 GB-month" then "$0.20/ GB-month", billable usage "rounded up to the next billable unit" (W1 1.1). At 500 editor hours a day: object requests 2.3 million a month, 1.3 million over, rounded to 2 million, $0.30; rows written 3.2 to 5.4 million, inside 50 million; duration 75,000 GB-s, inside 400,000; storage inside 5 GB-month; Worker requests 1.2 million, inside 10 million; CPU unmeasured, at most a few dollars by the September active CPU reading (33.7 million CPU ms a week with Chromium's share included, W4 4.2). So $5.30 a month of Cloudflare compute at 500 editor hours, plus the R2 Class A line of 6.2.

### 6.4 The month, end to end

| Line | At 50 editor hours a day | At 500 editor hours a day | Source |
| --- | --- | --- | --- |
| Workers plan | $0 (Free), or $5 if an SSR invocation passes 10 ms of CPU | $5 (Paid, forced by the object's rows written) | 6.2, 6.3 |
| Durable Objects overage | $0 | $0.30 | 6.3 |
| D1 | $0 | $0 | 6.2 |
| R2 | $0 | $0 to $14.94 (Class A) | 6.2; W3 2.2 prices |
| Browser Run | not used in the first form | not used | W4 row 5's four unknowns |
| The Vercel render service (`turboslide-gt`): renders, exports, the logo cron, the Pro seat not Turboslide's | $2 to $5 (Turboslide's share of the GT team's bill today is $3 to $5 a month, `research-costs-actual.md` as REALTIME.md 1.1 reads it; the pages leave it) | $5 to $10 (ten times the renders and exports at the September rate of about $0.025 per GB hour implied by 3,758 GB hours for $85 to $100) | REALTIME.md 1.1; `research-costs-actual.md` |
| One time | the R2 subscription's checkout (a payment stop, 7.1), the migration's $0.25 | the same | W3 4.3, 5.3 |
| Total | $2 to $10 a month | $10 to $32 a month | |

Against today's lines: the blob tier at 50 editor hours is $12 to $41 a month and the redis design $15 to $44 with the Upstash plan at $10 (REALTIME.md section 1, prices of 2026-10-01); the pipeline's September on the personal project was $85 to $100 and sellers a rounding error (REALTIME.md 1.1). The saving the gates on the local tier make is larger than any hosting move's; this design's own saving is the Vercel function memory that an open tab holds today (265 s of 2 GB per open alone on its instance, `read-runtime.md` 2.2) and the Blob operations and egress ($8 a month of egress in September, `read-store.md` 3.6).

## 7. The setup, in order, as the orchestrator performs it

Conventions from W5 section 5: the orchestrator works in a browser tab of Kevin's Chrome with a session that exists and types no password, no card and no code from a phone; values go into 600 files under `~/.config/turboslide/` and into no chat, log or repository; a step marked STOP ends the run with the dialog's text reported to Kevin. Marks: ACCOUNT (an account creation), PAYMENT (a plan purchase, a checkout or a card), TERMS (a terms, policy or consent checkbox), DNS (a site, zone or record), KEVIN (a password, a second factor, a decision). Kevin's message of 2026-10-01 ("access all of these from my google to set this up yourself") puts every unmarked step with the orchestrator; a marked step is still named to him before it runs. This round installs nothing and runs none of it; the build round's integrator does, with `wrangler` added as a dev dependency of the two Worker packages (wrangler 4.146.0 on the registry 2026-10-01, W1 6.2) and run as `pnpm exec wrangler`.

| # | Step | Command or control, in the page's words | Mark |
| --- | --- | --- | --- |
| 1 | Kevin names the Cloudflare account: the General Translation account that `gt-edge` deploys to (`/Users/kevinliu/gt/gt-cloud/apps/edge/wrangler.toml`; its CI uses `secrets.CLOUDFLARE_API_TOKEN`, W5 item 2) or an account of his own. Its plan decides whether the Worker bills on Free or Paid. | | KEVIN |
| 2 | Open `https://dash.cloudflare.com/login` in the Chrome profile Kevin names. Signed in: go to 4. A Cloudflare user exists for the address and the session is out: Kevin types the password and the second factor. No user exists: Sign in with Google "will create a new account" (https://developers.cloudflare.com/fundamentals/account/login/, Apr 20, 2026, W5 3.1); stop before the click. | | KEVIN, or ACCOUNT |
| 3 | Confirm the plan: Workers & Pages shows Workers Free ("By default, users have access to the Workers Free plan", the Workers pricing page). Select no Upgrade or Purchase control. | | PAYMENT if offered as the only way forward |
| 4 | Read the account id (Workers & Pages, Account Details, or Search `Copy account ID`, https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/, Aug 3, 2026) into `~/.config/turboslide/cloudflare.env` as `CLOUDFLARE_ACCOUNT_ID=`, mode 600. Set the `workers.dev` subdomain (Workers & Pages, Change next to Your subdomain; W5 3.5), `turboslide` or Kevin's word. | | |
| 5 | `pnpm exec wrangler login --browser=false --use-keyring`; open the printed `https://dash.cloudflare.com/oauth2/auth?...` link in the same Chrome profile; the consent dialog lists the scopes with an Edit Permissions button ("Required scopes remain selected", the changelog of 2026-08-22, W5 3.2); Allow; the callback lands on `http://localhost:8976/oauth/callback`; the credential goes to the OS keychain, not a plaintext `default.toml`. Or the headless path: My Profile > API Tokens > Create Token, the template Edit Cloudflare Workers plus Account > D1 > Edit, Continue to summary, Create Token, the secret once into `cloudflare.env` as `CLOUDFLARE_API_TOKEN=`; a social login account must set a password before it can create a token (W1 6.3). | the OAuth consent is a grant of the CLI's scopes to Kevin's account | the consent is covered by Kevin's message; the scope list is reported in the ship note |
| 6 | `pnpm exec wrangler d1 create turboslide-accounts --location=enam` ("Creates a new D1 database, and provides the binding and UUID", W2 section 5); the `database_id` goes into `apps/studio/wrangler.jsonc` (not a secret). The hint is final. | | |
| 7 | R2: Storage & databases > R2 > Overview, "Complete the checkout flow to add an R2 subscription to your account" (https://developers.cloudflare.com/r2/get-started/, Apr 21, 2026) and "A primary payment method is required to purchase Cloudflare products and services" (https://developers.cloudflare.com/billing/create-billing-profile/, May 29, 2026; W5 3.4). Stop at the checkout; Kevin completes it. The free tier is "10 GB-month / month", "1 million requests / month" Class A, "10 million requests / month" Class B (https://developers.cloudflare.com/r2/pricing/, Oct 1, 2026). | | PAYMENT |
| 8 | After 7: `pnpm exec wrangler r2 bucket create turboslide-store --location enam` (`--location`: "The optional location hint that determines geographic placement of the R2 bucket", https://developers.cloudflare.com/r2/reference/wrangler-commands/, Apr 21, 2026; names are lowercase letters, digits and hyphens, 3 to 63 characters, https://developers.cloudflare.com/r2/buckets/create-buckets/, April 30, 2026). `pnpm exec wrangler r2 bucket cors set turboslide-store --file apps/realtime-worker/cors.json` with the app's origins. Day 0's etag probe: `wrangler r2 object put turboslide-store/probe.bin --file <known bytes>` and a head through the S3 client, the etag compared to `quotedMd5`. | | |
| 9 | The S3 key pair for the render service: R2 > Manage API tokens > Create Account API token, permission Object Read & Write scoped to `turboslide-store` ("You will not be able to access your Secret Access Key again after this step", https://developers.cloudflare.com/r2/api/tokens/, Oct 1, 2026); the two values into `~/.config/turboslide/r2.env` (600) as `R2_ACCESS_KEY_ID=`, `R2_SECRET_ACCESS_KEY=`, with `R2_ACCOUNT_ID=` and `R2_BUCKET=turboslide-store`. | | |
| 10 | Mint the shared secrets into `~/.config/turboslide/cloudflare.env`: `TURBOSLIDE_ROOM_SECRET` by `openssl rand -hex 32`; `TURBOSLIDE_TOKEN` as production has it (read from the Vercel project by `vercel env pull` into a 600 file, never printed). | | |
| 11 | Deploy the realtime Worker: `pnpm exec wrangler deploy -c apps/realtime-worker/wrangler.jsonc --var TURBOSLIDE_BUILD_COMMIT:<sha>`; the first deploy "provisions a namespace for the class" and prompts for the subdomain if 4 skipped it (W1 6.1, 6.2). Then the secrets from stdin: `node scripts/hosting/wrangler-env.mjs realtime` runs `pnpm exec wrangler secret put TURBOSLIDE_ROOM_SECRET -c ... < <(the wrapper's fd)` and the same for `TURBOSLIDE_TOKEN` ("The `put` command can also receive piped input", the Workers commands page, Sep 22, 2026). `curl https://turboslide-realtime.<sub>.workers.dev/health` answers the commit. Repeat with `--name turboslide-realtime-stage` for the gates' Worker. | | |
| 12 | The Vercel variables by the wrapper: `node scripts/hosting/realtime-env.mjs cloudflare` sets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TURBOSLIDE_PUBLIC_STORE_BASE`, `TURBOSLIDE_REALTIME_URL`, `TURBOSLIDE_ROOM_SECRET` on production and preview of `turboslide-gt` with `vercel env add <NAME> <env> --sensitive` and the value on stdin, names only in the output (the shape of `realtime-env.mjs` 1 to 9); `--dry-run` first. The forced `TURBOSLIDE_REALTIME=blob` row stays until 5.2's flip. | | |
| 13 | The Google client, W5 Part B as written: Kevin names the account (`kevin@generaltranslation.com` under the `generaltranslation.com` organisation is the default, REALTIME.md 7.2; the machine's gcloud and gws are `kk23907751@gmail.com`, W5 item 13); the console's Welcome page with a Terms of Service checkbox is a stop; Create a Project `Turboslide`; Branding with the checkbox "I agree to the Google API Services: User Data Policy" is a stop (Kevin ticks it, or says in chat that the orchestrator may); authorized domain `turboslide.com` first; Audience External, Publish app; one Web application client `Turboslide web` with the origins `https://www.turboslide.com`, `https://turboslide.com`, `https://turboslide.vercel.app`, `http://localhost:4321` and, if the console accepts `<sub>.workers.dev` as an authorized domain (W5 item 14, open), `https://turboslide.<sub>.workers.dev`, each with `/api/auth/callback/google` as a redirect URI; the client id and secret once into `~/.config/turboslide/google-oauth.env` (600), which `realtime-env.mjs` 69 to 70 already reads. "It may take 5 minutes to a few hours for changes made to these settings to take effect" (https://support.google.com/cloud/answer/6158849, W5 4.6). | | KEVIN (the account), TERMS (twice) |
| 14 | Deploy the app Worker: `pnpm --filter @turboslide/studio build:cloudflare`, `pnpm exec wrangler deploy -c apps/studio/wrangler.jsonc`; the secrets of 4.7 from stdin by `wrangler-env.mjs app` (`BETTER_AUTH_SECRET` minted per Worker by `openssl rand -hex 32`); the smoke against `https://turboslide.<sub>.workers.dev`. | | |
| 15 | Workers Paid, if 6.2's rows written or the SSR's CPU force it: a plan purchase in the dashboard; whether it asks for a payment method is on no page read (W1 open 7, W4 open 12). Kevin's. | | PAYMENT |
| 16 | DNS: nothing. Any Add a site, Add domain, nameserver or record control for `turboslide.com` is a stop. When Kevin moves the zone (5.4), the orchestrator adds the custom domain to the app Worker (the custom domains page W2 read says it needs "An active Cloudflare zone"; the configuration syntax was not read this round) and the bucket's domain (`wrangler r2 bucket domain add turboslide-store --domain <host> --zone-id <id>`, the R2 wrangler page) and redeploys. | | DNS |
| 17 | Record in the ship note: the account's name and the id's first four characters, the plan as shown, the subdomain, the two Worker names and their deployed commits, the database id, the bucket's name and hint, the token names and TTLs, the Google project id and the client id's prefix, every stop reached and who cleared it, and the date. | | |

## 8. The rows this design meets, and the cost rows restated

Every `realtime.*` row of REALTIME.md section 2 is met by the object with the row's bound unchanged; the cross region reading stays the verifier's hand row. What each row reads on this tier:

| Row | On the `do` tier |
| --- | --- |
| `realtime.keystroke.within-300ms` | 1.1; the estimate 120 to 170 ms in region (`research-options.md` 5b), measured on the preview for the first time |
| `realtime.caret.within-300ms`, `realtime.selection.outline-within-300ms`, `realtime.pointer.second-browser` | 1.3; one frame; "whichever instance answers B's POST" has no meaning in one object |
| `realtime.caret.offset-after-merge`, `realtime.block.drag-live`, `realtime.caret.dims-and-leaves` | R2's client work unchanged; the dim read from `getWebSocketAutoResponseTimestamp` on the next event, the leave from `webSocketClose` |
| `realtime.title.two-typers` | 1.1; the two words transformed in one handler |
| `realtime.join.chip-within-1s` | 1.2; "the two tabs on different instances" is read as two browsers on the one object, and `sync.status` names the object's colo |
| `realtime.follow.for-everyone`, `realtime.card.chip-painted` | R3's surfaces, transport independent |
| `realtime.agent.write-announced` | 1.4; the author rides the entry (`serverClientId`, R1's working tree) |
| `realtime.share-link.every-instance` | the link grant is read from R2 (strongly consistent) by every isolate; the 5 s TTL caches (`access.ts` 70, 168) stay and the row's 1 s bound holds because a fresh index read (`freshIndex`, write.ts 414) is an R2 get, not a Blob CDN read |
| `realtime.departed-guest.name-stable` | the principal records on D1 (4.6), one database for every isolate |
| `realtime.reload.loses-nothing`, `realtime.reconnect.loses-nothing` | 1.5, 1.6 |
| `accounts.*` | R4's rows on the local accounts server as today; the D1 path's own narrowed run (4.6) |

The cost rows, restated for a `do` column beside the redis one (REALTIME.md section 2 gives redis columns only, `read-channel.md` open 7):

| Row | The `do` tier's ceiling | Measured how |
| --- | --- | --- |
| `cost.editor-idle.calls` | 0 function or Worker requests a minute from the open tab (the heartbeat is an auto response); 0 store calls; 0 object requests | `sync-cost-probe.mjs` with `--tier do` reads the Worker's analytics for the deck's object and the R2 metrics, through a wrapper holding the API token |
| `cost.editor-editing.calls` | 0 HTTP requests a minute from the tab; at most 6 object alarms a minute (the 10 s floor); at most 24 Class A and 0 Class B store calls a minute | the same |
| `cost.two-tabs-idle.calls` | 0 and 0 | the same |
| `cost.redis.commands` | retired on this tier; replaced by the three rows below | |
| `cost.do.requests` (new) | at most 200 object requests per driven editor hour (6.1's 155 with margin) | the object's `requests` metric before and after the hour |
| `cost.do.rows-written` (new) | at most 400 rows written per driven editor hour; a day's total over 50,000 on production holds the next ship until Kevin decides on the Paid plan (6.2) | `rowsWritten` summed from the cursors and reported by `/internal/stats`; the account's daily figure from the dashboard |
| `cost.r2.class-a` (new) | at most 300 Class A per driven editor hour; at most 60 Class B | the R2 metrics |
| `cost.worker.cpu` (new) | the SSR of `/edit/<deck>` under 10 ms of CPU, or the ship note names the Paid plan as forced | `wrangler tail`'s `cpuTime` on the preview |

## 9. The lanes, the merge order and the gates

### 9.1 What stays, changes or is replaced of REALTIME.md 5.1

| Lane | Verdict | What it owns under this design |
| --- | --- | --- |
| R1 the channel and the server | changes to C1 | Keeps every transport independent hunk of its working tree (the bus, the agent author, the `resync` for a non contiguous page, `serverClientId`, the checkpointer's `origin`, the concurrent conversion; `read-channel.md` 5 items 2, 4, 5, 7, 8). Adds `admit.ts` (the split), `do.ts`, `ticket.ts`, the fourth tier in `channel.ts` and `select.ts`, `room.ts`'s `do` branches, the ticket route, the 410 rule on the three routes, `access.ts`'s `accessChanged`, `thumbs.ts`'s client trigger. The Redis specific hunks (`lua.ts` `PRESENCE_SET`, `redis.ts`, the hand off to Redis) stay in the tree as the redis tier and are not deployed; nothing is deleted this round |
| R2 the client and the viewer's carets | stays | Its working tree lands as is; adds the `do` word's handling (nothing beyond `helloTier`) and the 410 rule in `room-client.ts` |
| R3 presence and the people surfaces | stays | Unchanged; one import line in `controller.tsx` for the moved transport, by C1's request on day 0 |
| R4 Google sign in and the account surfaces | changes to C4 | Its working tree lands as is; adds `db.ts`'s `d1` kind, `d1-dialect.ts`, `node:sqlite` behind the branch, `tokens.ts`'s cache path on `d1`, `ts_principal` and the D1 principal store, the hosted switch on the auth path, the staging host in `TURBOSLIDE_AUTH_HOSTS`, the e2e seed's route (4.6) |
| R5 the matrix and the drivers | stays, extended | `--tier do` in `core-gate.mjs` (75 to 78 already take a tier word), the `cost.do.*`, `cost.r2.*` and `cost.worker.cpu` probes, the two browser spec against the local `wrangler dev` pair, the `wrangler dev` process in `playwright.config.ts` beside the node server, `sync.status` naming the object's colo |
| R6 the hosting setup scripts and docs | changes to C6 | `realtime-env.mjs` gains `cloudflare`, `do-flip`, `do-rollback` (the `flip` and `rollback` of REALTIME.md 3.7 and 3.8 with the URL in place of `REDIS_URL`); the new `scripts/hosting/wrangler-env.mjs` (secrets from 600 files to `wrangler secret put` on stdin, names only); the guard patch (9.3); `docs/hosting.md` section 12 (Cloudflare), the variables table, `docs/security.md` section 12's table, `docs/CLOUDFLARE.md`'s runbook, `docs/updates.md` at the ship |
| C2 the Worker (new) | | `packages/realtime/worker/*`, `apps/realtime-worker/*`, the commit's pure imports from `packages/store` (`versions.ts`, `snapshots.ts`), the vitest rows under the local runtime, the `cors.json`, the `README.md` |
| C7 the store on R2 (new) | | `packages/store/src/blob-r2.ts`, `blob-r2-binding.ts`, `r2-store.ts`, `select.ts`'s factory inputs, `hosting-plugin.ts` 40, `migrate.ts`'s target and `isPublicPath`, `scripts/blob-copy.mjs`'s target, `export-jobs.ts` and `export-batch.ts`'s stored disposition, `pulse.ts`'s 429 reading, `headers.ts` 154 to 167 and `avatar-tier.ts` 28 (`TURBOSLIDE_PUBLIC_STORE_BASE`), the `routes/store.$.ts` route, the day 0 etag and latency probes |
| C8 the app on Workers (new) | | `apps/studio/wrangler.jsonc`, `vite.cloudflare.config.ts`, `src/server/worker-entry.ts`, `render-service.ts` and the route forwards, the seed as static assets, `packages/native/src/worker.ts` and `effects/select.ts`, `effects/io.ts`'s `sharp.block` behind a function, the hosted switch outside the auth path (`store/select.ts` 58, `realtime/select.ts` 80, `launch.ts` 56, `root.ts` 114, `headers.ts` 51 and 244, `start.ts` 118), the MCP session store, `TURBOSLIDE_ROLE=render` on the Vercel side, the scratch build's three measurements (CPU per SSR invocation, the script size against 64 MiB, the global scope against 1 s) |

Files two lanes need, in the order they merge: `packages/realtime/src/channel.ts` (C1 owns the tier word; R2 reads it), `protocol.ts` (R2 owns the two presence fields as 5.2 says; C1 owns nothing there since the tier enum reads `channel.ts`), `apps/studio/src/editor/controller.tsx` (R3 alone; C1's import line by request), `apps/studio/src/server/auth/identity.ts` (C1 owns the principal store's tier lines as R1 did; C4 owns the mail mode argument and the D1 store's wiring; merge C1 then C4), `apps/studio/src/server/write.ts` (C1 owns `readEditorDeckFn`'s `do` branch and the `room` payload; C4 owns `EditorAuthFacts.google`; merge C1 then C4), `packages/store/src/select.ts` (C7 owns the factory inputs; C8 owns the hosted switch line; merge C7 then C8), `apps/studio/src/server/headers.ts` (C7 owns the store base lines 154 to 167; C1 owns `connect-src` 236's realtime origin; C8 owns the two `VERCEL` reads at 51 and 244; merge C7, C1, C8), `apps/studio/src/server/room.ts` (C1 alone), `docs/hosting.md` and `docs/security.md` (C6 alone; every lane names its rows in `build/<lane>.md`).

### 9.2 The merge order and the ships

The tree merges R5 first (the rows and the drivers exist on day 0), then C7 (the store every lane reads), then C1 (the seam and the tier), then C2 (the Worker, which reads C1's `admit.ts` and `ticket.ts`), then R2, then R3, then C4, then C8, then C6. After each merge the integrator typechecks (`node_modules/.bin/tsc -b`), runs vitest per touched package and the realtime Worker's rows under `wrangler dev`, runs the `/new` boot probe on 4478, and rebases onto `origin/main` (REALTIME.md 5.3).

The ships, one lane's work per push through the guard (FOCUS.md 6.2 rule 2 of 2026-10-01), in the order of section 5: ship one is C7 (the store cutover of 5.1; it waits for step 7 of section 7, the R2 checkout, which is Kevin's); ship two is C1 with C2, R2, R3 and R5's rows (the `do` channel of 5.2; it waits for steps 5 to 12); ship three is C4 with C8 and C6 (the app Worker and the accounts of 5.3; it waits for steps 13 and 14), after which the DNS cut of 5.4 is Kevin's and the guard's production step moves. Nothing is read on production between the pushes; the production table of record is read once after the last push.

### 9.3 The gates

1. The local run. Every lane drives its rows on the node server with the memory tier as every round does. C1, C2 and R2 drive the `do` tier locally as 5.5 says: `wrangler dev` of the realtime Worker (its local object and local R2) beside two node server processes over one tmp store, A and B on different ports; C7 drives the R2 client against the local R2 of the same `wrangler dev` through its S3 endpoint if the local runtime exposes one, else against a scratch bucket with the key pair of step 9 read through a wrapper (the design names both; W3 and this note did not read whether Miniflare's R2 serves the S3 API); C4 drives the D1 path against `wrangler dev`'s local D1 and the `accounts.*` rows on the node accounts server as today; C8 drives the app Worker under `wrangler dev` with the render service as the local node server on another port.
2. The hosted preview, one per round under rule 2 of REALTIME.md 1.1: the Vercel preview of the merged tree forced `-e TURBOSLIDE_REALTIME=do -e TURBOSLIDE_REALTIME_URL=https://turboslide-realtime-stage.<sub>.workers.dev` with the staging Worker deployed from the same tree, narrowed to the rows only a deployment can read (the `do` tier's two browser rows across the Vercel to Cloudflare boundary, the access rules, the CDN, `cost.*`), plus the guard's seller path; a second narrowed run of the same tree with `-e TURBOSLIDE_REALTIME=blob` as the fallback tier's check (REALTIME.md 5.4 item 2's shape). The app Worker's hosted check is `https://turboslide.<sub>.workers.dev` after ship three, read by the hosted smoke and the core gate, which take any origin (`hosted-smoke.mjs` 3 to 7; `core-gate.mjs` 16 to 20) with the Vercel protection step and the `x-vercel-cache` expectation skipped on a Worker origin. A hosted whole matrix run never opens tabs against the production Worker (6.2's Worker request row).
3. The production guard. The ship's push rides `~/.config/turboslide/gt-follow.sh` as today for the Vercel side; C6's patch adds the Worker step before the Vercel promote: `wrangler versions upload` of the realtime Worker with the sha, the stateless routes smoked on the Version URL ("Version URLs are publicly available", "Not generated for Durable Objects", W4 5.4), `wrangler deploy` to move the object's code (one version at a time), the two browser rows `realtime.title.two-typers`, `realtime.caret.within-300ms`, `realtime.join.chip-within-1s` on production, and on red the previous version redeployed (the gradual deployments page's shape, W4 5.4) with the Vercel promote back; a check that `TURBOSLIDE_REALTIME_URL` is present in the deployment's environment names when the tree expects the `do` tier (`scripts/hosting/production.json`). Two deploy surfaces agree on the ticket's schema, the protocol version and the allowed origins at the moment of the switch; the Worker deploys first, since a ticket an older Worker cannot verify is a refused socket and a ticket a newer Worker verifies against an older app is fine (the `v` field).
4. The acceptance rule stands (REALTIME.md 5.5; FOCUS.md 6.2): every core row of every unparked feature green in the last run of each origin with `retries` zero, `realtime` unparkable, a `cost` row over its ceiling on the preview holds the ship, a core row red twice on production a stop fixed forward or reverted within the hour, every scratch deck removed by id.

## 10. The risks and what is not known

1. The CPU of one SSR invocation against the Free plan's 10 ms. Unmeasured anywhere in the tree (`docs/performance.md` 93 to 104 holds wall times); the editor page's first byte is 141 ms cold on production with the store reads inside it (W4 section 3). If it is over, the app Worker needs Workers Paid at $5 a month on day one, and the SSR of a large deck could meet "Error 1102" on Paid's 30 s only in pathological cases. The scratch build of C8 measures it before anything else of that lane.
2. The store rewrite. The mirror is the whole hosted store's shape (`blob-store.ts` 1 to 12; `node:fs` in about 70 modules, `read-runtime.md` 2.7), and `r2-store.ts` is a new `DeckStore` over the binding without it. W4 4.1 sized it at two rounds. The render service keeps the mirror, so two store shapes live in the tree.
3. The Durable Object's rows written cap. At 500 editor hours a day it is passed every day and the Free plan fails closed for the rest of the day (6.2). The threshold is 278 to 463 editor hours a day depending on whether compaction counts; `DROP TABLE`'s accounting is unread (W1 open 1). The insurance is the Paid plan at $5, which Kevin chooses once `cost.do.rows-written` reads a day over 50,000.
4. The public `workers.dev` budget. Each upgrade is a Worker request before any check runs, and a stranger can spend the Free day's 100,000 against the realtime Worker (W1 1.4 fact 2); the object's cap is protected by the ticket, the Worker's own is not. Workers Paid removes the daily cutoff; a WAF rate limit needs a zone (W4 open 11).
5. The DNS dependency. The end state's production hostname, the Google sign in on `www`, a cached public set and any WAF rule all wait for Kevin's zone move (5.4). Until then production is phase 1 and the app Worker is staging. Nobody in this round schedules the move.
6. The Cloudflare account. Whether `kevin@generaltranslation.com` already owns a Cloudflare user (the GT account exists in some form; its owner is not in the tree), which account bills, and whether that account is on Workers Paid already, which would change section 6's Free column into included allowances (W1 open 2, W2 open 2, W5 7.1).
7. Two payment stops. The R2 subscription's checkout ("A primary payment method is required to purchase", W5 3.4) and Workers Paid if forced; whether either charges anything at these volumes is $0 by the pages, but entering a card is Kevin's act alone.
8. The R2 client's three day 0 facts: the single part etag as the body's md5 (no page states it; W3 2.3 item 1), the AWS SDK's CRC32 default against R2 (W3 2.3 item 2, moot with a SigV4 signer and `Content-MD5`), and the per call latency from `iad1` to the `enam` bucket, which the four round commit multiplies (W3 open).
9. The object's latency and placement. No first party millisecond figure for a browser to object frame exists (W1 finding 11); an object is placed near its first request and never moves (W1 finding 10), so a deck first opened in Europe keeps its object there for the US seller who joins later; `locationHint` at `idFromName` from the deck owner's region is the lever and is best effort.
10. The browser work. Browser Run's Free allowance (10 minutes a day, 3 concurrent, 1 new browser per 20 s) is under a busy seller day's thumbnails, and WebGL, `page.pdf` under the binding, the pinned Chromium 147 and the in memory origin of the shader capture are confirmed by no page (W4 open 2 to 5). The design keeps Chromium, sharp and the export merge (834.6 MiB resident, `build-2/b6.md` 199) on Vercel; moving them is a later round after a scratch measurement, and the Vercel remainder is $2 to $10 a month.
11. The schema skew of two deploy surfaces. The ticket's `v`, the socket protocol's version and the presence field rule for an older server (`legacyPresenceFields`, R2's working tree) are the three seams; the Worker deploys first (9.3 item 3). A tab alive across a protocol change is kept by the presence rule and reloaded by the hello tier rule otherwise.
12. The e2e harness over D1 and the local runtime: whether Miniflare's R2 answers the S3 API for C7's local rows, whether alarms and hibernation behave locally (alarms "may fail after a hot reload" under `wrangler dev`, W1 section 4), and the seed's read of the captured code through a route instead of the SQLite file (W2 open 8). Each is a day 0 item of its lane.
13. The `workers.dev` host as a Google authorized domain (W5 item 14): if the console refuses it, the staging deployment has no Google sign in and the round trip is read on localhost until the DNS cut.
14. The 1 GB against 10 GB per object on Free (the limits page's FAQ against its table, W1 open 6); the design quotes 1 GB and the partition drop keeps an object far under it.
15. What a Worker build does with the 53 server functions, the hosting registration and the `node:` graph under `nodejs_compat`: the official Vite plugin path drops the Nitro configuration (`serverAssets`, `routeRules`, `publicAssets`, `vercel`) and this round ran no build (W4 open 10; `read-runtime.md` 6 item 4).
16. The MCP sessions and the `/api/assist` route's 60 s budget on a Worker with no wall limit but 10 ms of CPU on Free: the session store moves into the object (4.7) and the assist route is I/O bound; neither is measured.

## Sources

Tree, read on 2026-10-01 at `c978bb43` unless the sentence said working tree: `packages/realtime/src/{channel,select,memory,keys,protocol,admission,coalesce,blob,redis}.ts`, `packages/realtime/client/room-client.ts`, `packages/realtime/package.json`, `apps/studio/src/server/{room,checkpoint,write,access,thumbs,card-thumb,headers,start,root,hosting-plugin}.ts`, `apps/studio/src/server/auth/{db,better-auth,identity,tokens,schema,sqlite-dialect,session,secret,middleware,avatar,avatar-tier,principal}.ts`, `apps/studio/src/routes/api/*.ts` (the listing), `apps/studio/src/routes/mcp.ts`, `apps/studio/src/editor/controller.tsx` (332 to 492), `apps/studio/vite.config.ts`, `apps/studio/vite.deploy.config.ts`, `apps/studio/package.json`, `apps/studio/vercel.json`, `packages/store/src/{select,store,hosted,blob-store,blob-vercel,migrate,pulse,access-store,snapshots,versions}.ts`, `packages/native/src/{node,wasm}.ts`, `packages/effects/src/{io,select}.ts`, `scripts/hosting/realtime-env.mjs`, `scripts/probes/core-gate.mjs`, `pnpm-workspace.yaml`, `docs/REALTIME.md`, `docs/SYNC.md` section 3, `docs/FOCUS.md` 6.2, `docs/hosting.md` (HEAD and working tree), and the nine notes of this folder.

Network, read on 2026-10-01 by this note: https://developers.cloudflare.com/workers/wrangler/configuration/ (last updated Sep 30, 2026: the Durable Object binding's `script_name`, the D1, R2, service and assets fields, `vars` and `triggers.crons`); https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/ (Aug 18, 2026); https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ (`onlyIf` as `R2Conditional` or a `Headers` object, `put()` null on a failed precondition, `checksums.md5`, 1,000 keys per delete, 1,000 per list, `httpMetadata.cacheControl` and `contentDisposition`); https://developers.cloudflare.com/r2/buckets/create-buckets/ (April 30, 2026); https://developers.cloudflare.com/workers/development-testing/ (Aug 20, 2026); https://developers.cloudflare.com/workers/wrangler/commands/workers/ (Sep 22, 2026: `secret put` with piped input, `secret bulk` up to 100 secrets, `versions upload --dry-run`); https://developers.cloudflare.com/r2/reference/wrangler-commands/ (April 21, 2026: `r2 bucket create --location`, `cors set --file`, `domain add --domain --zone-id`, `object put`). https://developers.cloudflare.com/workers/wrangler/commands/secret/ answered 404 and is not cited. Every other product sentence is cited to the research note that fetched it and to its URL as that note gives it.
