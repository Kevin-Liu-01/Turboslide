# Design B: the free backend

Architect B's note of the Cloudflare design round, written 2026-10-01 in the worktree `/Users/kevinliu/repos/Turboslide-realtime` (branch `realtime/round`, `HEAD` `c978bb43`, equal to `origin/main`, with the realtime build round's uncommitted edits in the tree). Every line number below is `HEAD`'s (`git show HEAD:<path>`) unless the sentence says "working tree"; of the files this note cites, the working copies of `apps/studio/src/server/room.ts` (+250 lines), `checkpoint.ts` (+16), `access.ts` (+99), `write.ts` (+4), `auth/identity.ts` (+92), `auth/better-auth.ts` (+114), `apps/studio/src/editor/controller.tsx` (+105), `packages/realtime/client/room-client.ts` (+371), `packages/realtime/src/channel.ts` (+24) and `protocol.ts` (+56) differ from `HEAD` (`git diff --stat HEAD`, 2026-10-01); `packages/realtime/src/select.ts`, `memory.ts`, `checkpoint.ts`'s constants, `packages/store/src/select.ts`, `blob-vercel.ts`, `apps/studio/src/server/headers.ts`, `hosting-plugin.ts` and `scripts/hosting/realtime-env.mjs` read the same in both. The nine notes of this folder are cited by their short names: T1 `read-channel.md`, T2 `read-auth.md`, T3 `read-store.md`, T4 `read-runtime.md`, W1 `research-durable-objects.md`, W2 `research-d1-auth.md`, W3 `research-r2.md`, W4 `research-workers.md`, W5 `research-access.md`; every product fact repeated from them carries the URL they fetched on 2026-10-01. This note fetched seven more pages today (section 11) and read one 404. The sibling note `design-a.md` was not in the folder when this note was written (`ls` at 13:05 and at the time of writing), so the channel below is designed here in full and the task's "as in A" is read as "the Durable Object channel of T1 section 2 and W1". Nothing was edited outside this file, built, started, deployed or sent to Vercel, Cloudflare or Google. What a fetched page said is data.

The one paragraph answer. The realtime channel moves to one Durable Object per deck on the Workers Free plan; the account database moves to D1 behind the same Worker, which also runs better-auth and answers the Vercel function's identity questions over an internal API; the store moves to one private R2 bucket reached by the S3 API from the Vercel function, with a second, secretless Worker serving the public prefixes on its own `workers.dev` host; the version log is written by the Vercel checkpoint route at the object's request; the app stays on Vercel. At 50 editor hours a day every product stays inside its free amounts with the largest line at 23 % of a daily cap (the object's rows written), so the Cloudflare bill is $0. Two facts and one habit would force the Workers Paid plan at $5 a month: 220 or more editor hours a day (the rows written cap), Kevin's wish that production never fail closed for the rest of a UTC day (the Free plan's cutoff rule), and a hosted gate day against the same account (the caps are account wide and daily). No DNS record moves.

## 1. The shape and the data flows

### 1.1 The shape

- `turboslide-realtime`, a Worker on `turboslide-realtime.<subdomain>.workers.dev`, exports the Durable Object class `DeckRoom` (SQLite backend, the only kind the Free plan allows: W1 1.1, https://developers.cloudflare.com/durable-objects/platform/pricing/ line 23) and three route groups: `/rooms/<deckId>` (the WebSocket upgrade, the HTTP `ops`, `presence` and `leave` fallbacks), `/api/auth/*` (better-auth over the D1 binding, reached by browsers only through the app's same origin proxy) and `/internal/*` (the Vercel function's API under a shared secret: the room's head and tail, the server write, the flush, the identity facts, the principal records, the flags, the open deck registry). One object per deck orders the ops, holds the live document and the roster, admits over hibernating WebSockets, and asks Vercel to commit.
- `turboslide-files`, a Worker on `turboslide-files.<subdomain>.workers.dev` with the R2 bucket bound read only, serves the public prefixes (`decks/<id>/assets/`, `decks/<id>/.thumbs/`, `exports/`, `bundles/`, `builds/`, `u/`, `system/logos/`) and refuses every other key. It holds no secret and no object, so its deploys never touch the channel. Its host is the value of `TURBOSLIDE_PUBLIC_STORE_HOST`.
- The store: the `blob` kind of `packages/store/src/select.ts` (17 to 18, 67 to 92) with a new client module `blob-r2.ts` beside `blob-vercel.ts`, over one private bucket `turboslide` created with the `enam` hint, storage layout v2 (documents never readable by URL, `docs/hosting.md` HEAD 907 to 915; T3 3.7). The Vercel function is the only writer. The object reads three keys of it through its binding at a cold start (section 3).
- The accounts: D1 `turboslide-accounts` (`enam`), the five Turboslide tables plus better-auth's own (`apps/studio/src/server/auth/schema.ts` 1 to 20, 124 to 134; T2 1.1) plus a new `ts_principal` table for the principal records that live in Redis or a file today (`packages/identity/src/principal.ts` 182 to 229; T2 1.1). The runtime that reads and writes them runs on the Worker. The Vercel function keeps the anonymous cookie path local and asks the Worker for everything else, with a 300 s cache per session token (section 2.5, section 4.7).
- The app: pages, loaders, server functions, exports, Chromium, sharp, the agent HTTP surface, the MCP route and the checkpoint commit stay on Vercel in `iad1`. W4 section 3 lists why the heavy paths cannot move (128 MB isolates, no process spawning, no N-API, a per request `/tmp`).
- Hostnames: `turboslide.com`'s nameservers are `dns1.registrar-servers.com` and `dns2.registrar-servers.com` and `www` is a CNAME into Vercel DNS (`dig`, 2026-10-01, in T1, T3, W1, W5). Both Workers live on `workers.dev`, "treated as a Free website" (https://developers.cloudflare.com/workers/configuration/routing/workers-dev/, W5 3.5). No step below touches a record.
- The plan: Workers Free. Section 6 carries the counts; section 6.4 names the three facts that would force Workers Paid ($5 a month, "$5 USD per month for an account", https://developers.cloudflare.com/workers/platform/pricing/ as W1 1.1 quotes it).

### 1.2 A keystroke from A to B

```
A types "x"
  -> room-client coalesces 100 ms (room-client.ts 6; FLUSH_MS 189, text 100 ms)
  -> socket frame { t: "ops", req, clientId, base, entries, insertTie }      (A's browser -> the Worker -> DeckRoom)
  -> DeckRoom.webSocketMessage:
       facts from the socket's attachment (the ticket, 2.2)
       budgets per client, identity, deck (memory; keys of keys.ts 106 to 128)
       base window (admission.ts checkBaseWindow 73 to 77)
       landed since base from the in-memory tail (the last 2,000 entries; SQLite only after a wake)
       dedupe each opId by one indexed point lookup (entries.op_id)
       transformEntry, landedOf, landCandidate (reducer + validator) on the live document (admit.ts, moved from room.ts 1462 to 1642)
       INSERT the entries (seq = head + 1 ...) in one statement set, head and lastOpAt in meta
       arm the alarm if none is pending (10 s idle, 30 s max)
  -> ack to A    { t: "ack", req, ok, entries, head, revision, between }    (SQLite durable before the frame leaves: output gates)
  -> op frames   { t: "op", entry }  to every other socket, filtered per reader (reader.ts, from room.ts 2566 to 2599)
  -> B applies (room-client.ts applyEntry 987 to 1027), draws within one socket frame of the ack
```

Estimated 120 to 170 ms keystroke to screen in one region and 200 to 300 ms across regions (`research-options.md` 5b, repeated by W1 section 5: no first party millisecond figure exists; the row `realtime.keystroke.within-300ms` on the preview is the first number).

### 1.3 A join

```
B opens the link
  -> Vercel loader readEditorDeckFn (write.ts 401 to 495): requestIdentity, decideFor, roomFor
       liveAtLeast on the do tier = store.read() at the last checkpoint + GET /internal/rooms/<id>/since?seq=<covered>  applied in the function
       mintRoomTicket(deck, identity, decision, viewerFacts)  (2.2)
       answer EditorDeck.room = { seq, tier: "do", socket: "wss://turboslide-realtime.../rooms/<id>", ticket }
  -> B's client: new WebSocket(socket + "?since=" + seq, ["turboslide.v1", "t." + ticket])
  -> Worker: Origin in TURBOSLIDE_ROOM_ORIGINS; ticket MAC, deck, origin, exp verified before idFromName (W1 1.4 item 2: validate in the Worker so an invalid upgrade never bills the object)
  -> DeckRoom.fetch (upgrade): one socket per clientId (an older one closes 4409); the per identity and per address socket counts (CAPS.streams, admission.ts 39: 4 anonymous, 8 signed in, 16 per address); editing ceiling 100 (protocol.ts 43) -> Viewing when over
       acceptWebSocket(ws, [clientId, principalId]); serializeAttachment(facts)
       hello { t: "hello", seq, revision, clientId, role, clients (roster filtered for B), editing, tier: "do", covered }
       replay: entries above B's since from SQLite, paged 256, up to 2,000 or 1 MB (replayPlan, admission.ts 85 to 89), resync when the position is above the head or more than 2,000 behind or not contiguous (the working tree's replayFor rule, T1 5 item 5)
  -> presence frame of B's row to A's socket within the same event
  -> A's chip within 1 s of B's editor being ready (row realtime.join.chip-within-1s)
```

The join is one Worker request and one object request. Nothing of it reaches Vercel after the loader.

### 1.4 A presence frame

```
B moves the pointer
  -> client batch 80 ms, 15 a second (PRESENCE_BATCH_MS 54, PRESENCE_PER_SECOND 55)
  -> socket frame { t: "presence", ...PresencePost }   (at most 2,048 bytes, protocol.ts 36)
  -> DeckRoom: presencePostSchema (unknown field -> { t: "presence-refused", field }, the client's legacyPresenceFields rule drops it, T1 5 item 11)
       budget 15 a second per client (memory)
       durableOf(state) strips pointer, drag, clock (R1's PRESENCE_SET projection, working tree redis.ts): a frame whose durable projection is unchanged is volatile
       volatile: fan out only; durable: roster row in memory + the socket attachment (16,384 bytes, W1 section 2) + fan out
       rosterEntryFor adds the identity fields carried by the ticket (room.ts 2449 to 2484 reads them from the identity cache today; on this tier they ride the ticket); pointer and drag kept for owners and editors among the first 20 (2466 to 2475, LIVE_POINTERS_MAX 41)
  -> { t: "presence", entry } to every other socket, each filtered by rosterEntryForReader (room.ts 2515 to 2539)
B idle: the client sends the literal string "hb" every 5 s active, 10 s quiet (PRESENCE_HEARTBEAT_MS 60, PRESENCE_HEARTBEAT_QUIET_MS 66)
  -> answered by setWebSocketAutoResponse("hb" -> "hb") at the edge without waking the object (https://developers.cloudflare.com/durable-objects/api/state/ line 187 as W1 section 4 quotes it)
B closes the tab
  -> webSocketClose -> leave frame to every socket at once; the row and the attachment go
```

The 30 s dim is the receiving client's (R2's `lastSeenAt` from the stamp, T1 5 item 11); the object runs no timer for it. A row whose socket died without a close event is swept at the next real event when `getWebSocketAutoResponseTimestamp(ws)` is older than `PRESENCE_EXPIRY_MS` 120 s (protocol.ts 68).

### 1.5 An agent HTTP write

```
POST /api/actions/text.set?deck=<id>  with a bearer
  -> Vercel: requireAgentAuth (the key facts from the Worker's identity API, cached 5 s as tokens.ts 37 to 38 caches Postgres keys today)
  -> actions.$action.ts 107 to 112: flushRoom(deckId) before a read action; the dispatcher's write -> roomBackedStore.write (room.ts 1126 to 1180) -> admitServerWrite (3281)
  -> on the do tier: POST <worker>/internal/rooms/<id>/server-write  { baseRevision, strict, author: { kind: "agent", name, runId }, clientId: "agent:<principalId>", mutations, note, commit: true }   (Authorization: Bearer TURBOSLIDE_ROOM_SECRET)
  -> DeckRoom: base check against the live document (3346 to 3377's rule), landCandidate, append, op frames to every socket (the author kind agent is what the banner gate reads, controller.tsx 1660 to 1670; REALTIME.md 3.3)
       commit now: POST https://www.turboslide.com/api/internal/decks/<id>/checkpoint  { runs: [{ author, clientId, opIds, mutations, comments, fromSeq, toSeq, note }] }   (Bearer TURBOSLIDE_ROOM_SECRET; AbortSignal.timeout 20 s)
  -> Vercel checkpoint route: store.write per run with { ops: { fromSeq, toSeq }, origin: { clientId, opIds }, force: true } (checkpoint.ts commit 190 to 210, with origin added: T1 finding 9); the comment entries to the comments applier; answers { records }
  -> DeckRoom: covered = toSeq, revision = record.revision; the document chunks rewritten; publish { t: "checkpoint", revision, author, note }; trim to 10,000 behind (STREAM_RETAIN_ENTRIES 37)
  -> answers the server write { ok: true, revision, record, seq }   (ServerWriteResult 3251 to 3261 unchanged)
  -> the action route answers; the tab's banner within 1 s (row realtime.agent.write-announced)
```

Two Vercel invocations and one object round trip. `version.restore` keeps its rule (3287: never through the stream): Vercel writes the store and tells the object `POST /internal/rooms/<id>/external { revision }` (section 3.3).

### 1.6 A reload

```
A reloads
  -> the loader (1.3): the store's document at the last checkpoint (the mirror syncs from R2: head deck.json, the pull when the etag moved, T3 1.3) + the object's entries above covered, applied in the function -> live.seq
       origins for the resync read from the records above A's old position (write.ts 468 to 471), now answered for this tier too because the records carry origin (section 3.1)
  -> A's client: the pending store's queue is offered against the current document (offerPersisted 1797 to 1853); the socket opens at since = live.seq; the replay covers the gap; acked ops named by origins are dropped as acknowledged (invariants 4 and 10)
```

### 1.7 A 20 s offline

```
A's network goes
  -> the browser's offline event: the transport aborts the socket (as sseTransport does at controller.tsx 353 to 356)
  -> A types on: ops queue in the client (flush gates on clientId and bound, not connected: room-client.ts 1449 to 1456); the pending store holds them
  -> online: holdForHello (1083 to 1092); the socket reopens at once with since = A's position and the same ticket (10 min life, 20 s into it)
  -> hello + replay of what B typed; the held resend goes at the caught up base with the shifted offset; the object transforms what it must (invariant 2) and dedupes by opId (invariant 3)
  -> every word in both browsers within 3 s of the reconnect (row realtime.reconnect.loses-nothing)
If the socket cannot reopen but fetch works: postOps falls to POST <worker>/rooms/<id>/ops with "Authorization: Ticket <ticket>" (the C3-F1 rule kept, T1 4 item 3)
```

### 1.8 A version checkpoint

```
the last op landed 10 s ago (or the run is 30 s old, or 2,000 entries, or 1 MB)
  -> alarm() wakes DeckRoom (one request, one row written per setAlarm: pricing line 104 as W1 1.1 quotes it)
  -> coalesceEntries(entries above covered) per author per contiguous run (coalesce.ts 1 to 29, pure)
  -> POST /api/internal/decks/<id>/checkpoint { runs }  (1.5)
  -> Vercel: the four round R2 write per run (T3 1.3: snapshot, record claim, changed bodies; manifest put with If-Match; removed bodies deleted); on this tier the pulse put is skipped (nothing polls)
  -> DeckRoom: covered, revision, document chunks, { t: "checkpoint" } to every socket (the History panel appends it, SYNC.md 3.10), trim; every 20th commit the deletes below the retention run in one statement
```

### 1.9 A sign in

```
the Sign in dialog -> Continue with Google
  -> POST https://www.turboslide.com/api/auth/sign-in/social   (same origin; the CSRF filter of headers.ts 374 to 397 first)
  -> the route auth.$.ts proxies to <worker>/api/auth/sign-in/social with the request's cookies, x-forwarded-host: www.turboslide.com and the proxy header (section 4.7)
  -> the Worker's better-auth (D1) writes the state (600 s), answers Google's URL; the proxy relays the answer
  -> the browser goes to Google; Google redirects to https://www.turboslide.com/api/auth/callback/google?code&state   (the registered URI, unchanged from REALTIME.md 4.5 step 3)
  -> the route proxies the callback with the cookies (the __Host-ts_id anonymous cookie is first party on www and rides along)
  -> the Worker: state checked, the code exchanged at Google, user and account found or made, session row in D1, onSessionCreated: ts_alias, ts_profile, the admin flag, the principal merge in ts_principal; Set-Cookie relayed to the browser on www; 302 to the callbackURL
  -> the editor loads; requestIdentity on Vercel -> POST /internal/identity { cookie, address } -> facts { kind: "signedIn", ..., linkedNow: true, anonymousId }
  -> Vercel runs the onLinked hooks once (the deck index and inbox merges on the store, identity.ts 100 to 101, 427); the badge reads "signed in"
```

## 2. The authority and the auth of the channel

### 2.1 Who admits, who transforms, who holds the roster

The object does all three for its deck. The admission is `admitOps`' loop (room.ts 1693 to 1927) with the memory tier's path, moved into a `node:` free module (section 4.1) and run against the object's live document; the tie rule rides the up frame as `insertTie` (protocol.ts 188 to 202); the refused undo of a sibling, the reanchoring and the reducer's sentence are the same code (1584 to 1593, 1550, 1655 to 1669). The roster is the object's memory while awake and the socket attachments across a wake (W1 section 2; W1 finding 9). The Vercel function holds no live document on this tier: its reads build one on demand from the store plus the object's tail (1.6), its writes go through the object (1.5), and its checkpoint route commits what the object sends (1.8). The authorization decision stays Vercel's: `decideFor` (room.ts 716 to 726) runs where the cookies are, at the ticket mint, and the object enforces the decision the ticket carries.

### 2.2 How a tab proves its right to join

No cookie of `www.turboslide.com` reaches a `workers.dev` host: `__Host-ts_id` cannot carry `Domain` (T2 3.1), better-auth's cookies are host only (T2 3.2), `workers.dev` is on the Public Suffix List (T2 3.5 item 4; W2 answer 2), and a `Lax` cookie is not sent on a cross site `fetch` or upgrade (W4 5.1). The ticket is therefore the design and not an option (W4 5.1).

The ticket. Minted by `mintRoomTicket` in `room.ts` after `requestIdentity`, `decideFor` and `viewerFacts` (2602 to 2617), at the editor's loader and at `POST /api/decks/:id/ticket` (same origin, cookie authenticated, the refresh route):

```
ticket  = "v1." + b64url(payload) + "." + b64url(HMAC-SHA256(TURBOSLIDE_ROOM_SECRET, "v1." + b64url(payload)))
payload = {
  v: 1, deck, cid,                 // cid from mintClientId (room.ts 2663 to 2668), so the id stays the function's
  pid, ident,                      // the principal id (null for a bearer) and the identity string the budgets key on
  role, via, names, comments,      // ViewerFacts (room.ts 2500 to 2508): role, via, showNames, readComments
  author,                          // authorOf(identity) (511): what the entries carry
  display,                         // the roster fields rosterEntryFor adds (2449 to 2484): name, avatar choice, badge
  org,                             // the page origin the socket must come from (W4 5.2: a per deployment origin claim)
  iat, exp,                        // exp = iat + 600 s
  dpl                              // TURBOSLIDE_BUILD_COMMIT, for the ship note's reading of skew
}
```

The shape mirrors the anonymous cookie's `v1.<payload>.<mac>` (session.ts 73 to 91; T2 3.1). The secret is a 32 byte hex value held by both sides (`TURBOSLIDE_ROOM_SECRET`, section 7). The MAC is WebCrypto on both sides (`crypto.subtle` exists in Node 24 and on Workers), so the verifier has no `node:` import. A ticket is about 500 bytes.

How it rides. The browser's `WebSocket` constructor takes a URL and subprotocols and nothing else (W4 5.3), so the ticket goes in the second subprotocol: `new WebSocket(url, ['turboslide.v1', 't.' + ticket])`. MDN's header page, read today: a request carries "one or more WebSocket sub-protocols ... in order of preference", "a comma-separated list of sub-protocol names", and the response "must be the first sub-protocol that the server supports from the list" (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-WebSocket-Protocol, no date on the page); the Worker selects `turboslide.v1` and reads the `t.` entry. Base64url's alphabet and `.` are header token characters, so the ticket needs no escaping. This keeps the ticket out of URLs and out of both platforms' request logs (W4 5.3 names the query string's log trap). The page states no size limit and Cloudflare's header size limit was not read today; if a 500 byte subprotocol is refused anywhere, the fallback is the first frame `{ t: "join", ticket }` within 5 s of the upgrade, verified by the object instead of the Worker (section 10 item 14).

The Worker verifies before the object is touched: the MAC, `exp`, `deck` against the path, `org` against the request's `Origin`, and `Origin` against `TURBOSLIDE_ROOM_ORIGINS` (the four hosts of `DEFAULT_AUTH_HOSTS`, T2 section 5, plus the preview pattern `https://turboslide-*-kl01s-projects.vercel.app`, or the gates' previews are refused: W4 5.2). A failed check answers 401 without `idFromName`, which is the rule the websockets page states for billing (W1 1.4 item 2). The object re-verifies nothing of the MAC; it stores the payload as the socket's attachment and trusts `cid`: an ops or presence frame whose `clientId` is not the attachment's `cid` is refused `client_unbound`, as the route refuses an unbound id today (decks.$deckId.ops.ts, the 403 of T1 2 item 6).

Refresh and expiry. The client fetches a new ticket from the refresh route 300 s after the hello and every 300 s after, and sends `{ t: "ticket", ticket }`; the Worker is not on that path, so the object verifies this one (the same WebCrypto code). A socket whose ticket is 60 s past `exp` without a refresh is closed with code 4401; the client fetches a ticket and reopens at once. The refresh re-runs `requestIdentity` and `decideFor` on Vercel, so it is the 60 s access recheck of the stream route (`decks.$deckId.stream.ts` 70) at a 300 s cadence, with the next rule covering the seconds in between.

Access changes. Every writer of an access record or a link grant on Vercel (`access.ts` `writeAccess` 434, `noteLinkGrant` 247 to 259 and the two other `publishDrop('link', ...)` sites at 318 and 341) calls `POST /internal/rooms/<id>/access-changed { principalIds? }` after its store write. The object closes every socket whose `pid` is named (every socket when none is) with code 4403 `access_changed`; each client fetches a ticket, which re-runs the decision, and reopens or lands on the refused path (a 403 from the ticket route maps to the stream's 403 handling: `bound = false`, the 8 s wait, T1 4 item 7). That replaces the stream's `access` event and its drop (route 166 to 177, 195). A viewer whose link was revoked loses the socket within the Vercel write's round trip.

The function to the Worker and back. Both directions carry `Authorization: Bearer <TURBOSLIDE_ROOM_SECRET>`; the Worker refuses `/internal/*` without it, the Vercel internal routes refuse without it. W4 5.3 names Vercel's OIDC token as the alternative for the function to Worker direction; the shared secret is chosen because the Worker to function direction has no OIDC and one mechanism is simpler to rotate (docs/security.md section 9's rotation runbook applies). On a protected preview the Worker adds `x-vercel-protection-bypass` from `TURBOSLIDE_VERCEL_BYPASS` (W4 5.4); production needs none.

Caps that move into the object. The stream slot counters per identity, address and instance (room.ts 2872 to 2957; `CAPS.streams`), the tab token and `retire` (2708 to 2746), the reader liveness and the closer (2991 to 3106), the 240 to 290 s lifetime (protocol.ts 49) exist because the platform is many short instances (T1 finding 13). In the object: one socket per `cid` (a newer one supersedes the older with 4409), at most 4 sockets per anonymous `ident`, 8 per signed in, 4 per agent, 16 per address (the address the Worker forwards in an internal header from the platform's client address field; which header is not read today, section 10), closed with 4429 and a `retry-after` in the close reason, which the transport maps to the 503 `too_many_streams` shape the client already reads (T1 4 item 1); the per instance cap of 256 has no meaning and goes; the lifetime goes (W1 section 4: hibernation has no lifetime); the client's reopen ladder stays for drops.

### 2.3 The ordering guarantees

1. One object per deck is one thread: appends are totally ordered, `seq` is `head + 1` from the object's `meta`, contiguous, never reused. The first `seq` of a deck that comes from the blob tier continues above the store's last record (`ops.toSeq` when the record carries `ops`, else the revision, as `entryOfRecord` makes seq the revision today: SYNC.md 3.2).
2. An entry is in SQLite before its ack leaves: the SQLite API is synchronous and the runtime's output gate holds the response until the write is confirmed ("the write path runs behind output gates", the 2024 post as W1 section 5 quotes it). The invariant 1 reading of T1 section 3 holds: an op answered at seq n is durable at n.
3. Every socket receives the deck's events in `seq` order, filtered for its reader; a join's hello, its replay and its first live frame come from one event handler with no `await` between the SQLite cursor and the frames (the sqlite page's rule to consume cursors before the next `await`, W1 section 2), so no entry falls between the replay and the live stream.
4. Presence frames are not ordered against ops; a caret carries `caret.seq` and the receiver transforms it (R2's rule, REALTIME.md 3.5). A volatile frame may be dropped under the 15 a second budget; a durable one is never dropped.
5. A server write is admitted in the same order as a tab's op (1.5); its commit is synchronous for the agent and asynchronous (the alarm) for a tab, and a flush (`POST /internal/rooms/<id>/flush`) commits whatever is above `covered` before an agent read, which is what `flushRoom` (room.ts 1088 to 1112) means on this tier.
6. The checkpoint route is the one committer of the version log for an open deck, serialized by the object (one commit in flight per deck); the store's manifest put with `If-Match` stays the commit point and refuses a writer the object did not order (a blob tier instance in the switch window, a `version.restore`), which section 3.3 turns into a reload.

### 2.4 The invariants restated

`docs/SYNC.md` 3.11 (177 to 191 in the working copy, the same text at `HEAD`) and `docs/REALTIME.md` 3.9 (116 to 118), each with the reading on this tier:

1. One ordered log per deck. The object's stream is the order; the record log's commit point stays the manifest put with `If-Match` in Vercel's checkpoint route; an op answered at seq n is in SQLite before the ack; a record above the proven manifest is a claim and the store's rules on it stand.
2. Transform before place on every tier. In the object, with the module of 4.1; the retry after a moved head is the object's own loop, which never meets a moved head from another writer because the object is the only one.
3. Every record names its origin, an op id at most once within 2,000 of the head. The checkpoint route writes `origin: { clientId, opIds }` from `CoalescedWrite` (coalesce.ts 17 to 29), which `checkpoint.ts` 196 to 204 omits today (T1 finding 9); the dedupe is the object's indexed point lookup per op id over its retained tail of 10,000.
4. The client acknowledges by op id: the ack, the echo (its own `op` frame carries its `opId`), the replay, the resync read's `origins`, which this tier now answers because of item 3.
5. Every text a person can type into is a text run. Schema, unchanged.
6. A reader receives every op its role may see, notes stripped for a commenter and a viewer. Per socket, in the object, with the ticket's facts (`filterEventForReader`, `rosterEntryForReader`, `stripNotes` moved to `reader.ts`).
7. The head is read, never listed, and on this tier never polled: the head is the object's `meta`, read by the hello and by Vercel's `GET /internal/rooms/<id>/head` on a loader. The pulse is not written and not read on this tier.
8. Every read of an overwritten path is proven. Store side, unchanged; on R2 the proof always passes on the first read (T3 1.4).
9. The stream opens at the client's position, the replay covers exactly the gap, `hello.covered` is the live seq, the ack's `between` fills what sits under an admitted entry: all from the object's SQLite and tail (`betweenEntries` 1351 to 1366 is pure).
10. Unacknowledged ops survive a reload in the pending store and a replay whose first attempt committed is acknowledged, never committed again: the object's dedupe and the resync read's `origins`.
11. Undo per author moves its inverse past every remote entry: client side, unchanged.
12. The budget: zero timed store calls from the functions on this tier (REALTIME.md 3.9's zero holds); the object makes no store call on the hot path; its store reads are three keys at a cold start (section 3.2) and its store writes are none (Vercel commits). The `cost.*` rows of section 8 carry this tier's ceilings.
13. Retention on a schedule: the snapshot prune every 20th commit rides the checkpoint route's `store.write`; the object deletes entries below `covered - 10,000` every 20th commit in one statement; the sweep stays the round after's.

Two more, from T1 section 3's last paragraph, now stated: the object's SQLite holds the only copy of the entries between the last checkpoint and the head for at most 30 s of continuous activity plus 10 s idle, and at most 2,000 entries or 1 MB (the triggers of 1.8), and the point in time recovery of the storage API covers 30 days (W1 section 2); and a woken object rebuilds its live document (the chunks or the store, 3.2) before it admits the first op after the wake, while presence, joins and the hello need no document and run at once. And one of this design's own: no socket is admitted without a ticket whose MAC, deck, origin and expiry verify; a change of access closes the sockets it touches within the Vercel write's round trip; a ticket is never logged.

### 2.5 The identity reads that remain on Vercel

With the ops, presence and stream routes gone from Vercel, `requestIdentity` (identity.ts 513 to 713) is called by the loaders and server functions of `write.ts`, `actions.ts`, the share, access, notify, assist and session routes, and the ticket route (T2 4.1's list less the three deck routes). Per editor hour that is the loader once or twice, the ticket refresh twelve times, and whatever surfaces the person opens: about 15 to 30 calls, against 1,600 to 2,200 today (T2 4.1). The signed in branch asks the Worker (`POST /internal/identity` with the cookie header and the client address) and caches the answer per instance under the SHA-256 of the session token for 300 s, the life of better-auth's cookie cache (`better-auth.ts` 267; T2 2.4), dropped by `forgetIdentity` (room.ts 2357) and bypassed by `freshIndex: true` (write.ts 429). The anonymous branch stays local: the sealed cookie's MAC under `TURBOSLIDE_SESSION_SECRET` (session.ts 73 to 91) needs no store; the principal record's `touch` (principal.ts 216 to 223, a write on every call today) becomes a write at most once an hour per principal per instance, with the record cached 2 s. The bearer branch asks the Worker for the key facts and caches them 5 s, which is the Postgres path of `tokens.ts` 190 to 227 with the Worker as the database.

## 3. The version log and the store

### 3.1 Who writes records

Vercel's new route `POST /api/internal/decks/:id/checkpoint` under the shared secret. Its body is the object's coalesced runs; each run becomes one `store.write({ baseRevision: live, author, mutations, note }, { ops: { fromSeq, toSeq }, origin: { clientId, opIds }, force: true })`, the call `createCheckpointer.commit` makes today (checkpoint.ts 190 to 210) plus `origin`; comment entries go to the comments applier as today (checkpoint.ts header 11 to 22); the answer is the records. The route uses the mirror's live document as the base (the store's `write` syncs its mirror first, T3 1.3) and never the room's, since the room on this tier has no live document. The triggers are the object's alarms (10 s idle, 30 s max, 2,000 entries, 1 MB; at once for an agent write, `version.save` and the last socket's close), against today's 2 s idle and 10 s max (checkpoint.ts 25 to 27): the longer windows are what section 6 buys the free tier with, and they rest on the object's storage being durable where Redis was not (`docs/hosting.md` 728 to 729's rule was written for a store that may hold no only copy). The product consequence is named in section 10: a Version history row covers a run of up to 30 s instead of 10 s.

The body size: a run is under `CHECKPOINT_MAX_BYTES` 1 MB by the trigger and under Vercel's 4.5 MB request cap (T4 2.8). The answer is the records, small.

### 3.2 Where the records live, and what the object reads of the store

The bucket `turboslide` on R2, Standard class, the `enam` hint (the functions run in `iad1`, `docs/HOSTING-MOVE.md` 18; the hint is best effort, https://developers.cloudflare.com/r2/reference/data-location/ as W3 2.3 reads it), reached from the Vercel function over the S3 API at `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` with `region: "auto"` and an account token scoped Object Read & Write to the bucket (W3 2.1). The key namespace is T3 1.2's, unchanged. Layout v2: every key under `decks/<id>/` other than `assets/` and `.thumbs/` is a document and is never readable by URL; the public set is served by `turboslide-files` from the same bucket, so there is one bucket and no public access setting on it (`r2.dev` stays off; W3 3.1).

The object reads three keys through its own R2 binding when it wakes with no document chunks (a first wake, or after the chunks were deleted at the last close): `HEAD decks/<id>/deck.json` for the etag, `GET decks/<id>/snapshots/<etag>.json` for the document (the manifest's etag names the snapshot, SYNC.md 3.5), and `GET decks/<id>/versions/<revision>.json` for `ops.toSeq`. Three Class B operations, no Vercel invocation, no body cap (a Worker has no response size limit, W4 section 1; a deck is at most 25 MB by `admission.ts` 35 to 37). The parse is a `node:` free module `packages/store/src/snapshot-read.ts` (the three fields: the revision, the document, the record's `ops`), shared with the migration's verify step. The alternative, a Vercel route answering the document, meets the function's 4.5 MB response cap (T4 2.8) on a large deck and costs an invocation per wake, so it is not the design.

Between checkpoints the object keeps its live document in memory and, after each commit, writes it to SQLite as chunks of at most 900 KB (`document(chunk, body)`), so a wake after hibernation rebuilds from local rows (microseconds, W1 section 5) plus the tail above `covered`, and reads R2 only when the chunks are absent. The chunks are deleted when the last socket closes and the run is committed, so the account's storage holds open decks alone (section 6.1).

### 3.3 How the Vercel room follows the external order

Vercel holds no live document on this tier, so "following" is three rules.

1. Reads. `liveIfOpen` (room.ts 1061 to 1070), `roomBackedStore.read` and `revision` (1139 to 1145), `liveAtLeast` (1965 to 2003) and the loader read the store at the last checkpoint and apply the object's entries above `covered` (`GET /internal/rooms/<id>/since`), which is `syncLive`'s cold path (794 to 824) with the channel over HTTP. `atLeast` is met by waiting for the object's head to reach it, as `liveAtLeast` waits on the blob tier's store. A read that needs the records (the agent's `deck.info`, Version history) calls `flush` first, as `flushRoom` does today (1088 to 1112; actions.$action.ts 107 to 112).
2. A record written outside the object. `version.restore` commits through the store (room.ts 3287 to 3345) and then calls `POST /internal/rooms/<id>/external { revision }`; the CLI on a checkout is the memory tier's and never meets this tier; a blob tier instance during the alias switch (section 5.4) writes a record the object did not order. The object learns of the first through the call and of the last through its next commit: the checkpoint route's `store.write` meets a moved manifest, the store answers a conflict (T3 1.3: `conflictFromStore`), the route answers `{ conflict: true, revision }`.
3. The object's answer to an external record, in order: reload the document from the store (3.2's three keys) at the new revision; re-admit the entries above `covered` from their original mutations, transformed past the external records' mutations (the shape of `appendWithRetry`'s hook, admission.ts 167 to 233, with the records as the landed set), as new entries with their original authors and op ids after the reload; commit them at once; publish `{ t: "checkpoint", external: true, revision }`, which every tab reads as a reload at that revision (`announceExternal` 992 to 1007 is the publisher today) and re-offers its pending ops against the document, dropping what the records' `origins` name. Acknowledged words are kept because they were re-admitted before the tabs reloaded. This is REALTIME.md 3.7's window with the lost entries added back.

### 3.4 The store migration and the public URL rewrite

The client. `packages/store/src/blob-r2.ts` implements the six method `BlobClient` (blob-store.ts 153 to 168) over `PutObject`, `HeadObject`, `GetObject`, `ListObjectsV2` (with and without `delimiter`), `DeleteObjects` in chunks of 1,000, as W3 2.2 maps them, with the four facts of W3 2.3 built in: `BlobEntry.version` is the `ETag` once day 0 measures a single part put's etag as the body's md5 in quotes (else the client computes `version` from the bytes and sends `Content-MD5`); the AWS SDK's CRC32 default since 3.729.0 is turned off (`requestChecksumCalculation: 'WHEN_REQUIRED'`, the same for responses) or a small SigV4 signer replaces the SDK, which the lane decides on day 0; a 429 on a hot key (`deck.json` written twice inside a second by two Vercel instances; "1 per second" per key, https://developers.cloudflare.com/r2/platform/limits/) is retried once after one second inside the 20 s document deadline (blob-store.ts 800) and reaches `isStoreBusy` (pulse.ts 187 to 198) with a `retryAfter`; `BlobEntry.url` is `https://${TURBOSLIDE_PUBLIC_STORE_HOST}/${pathname}` for a public path and an unfetchable marker for a document so `fetchFreshByQuery` fails closed (T3 3.2). The `version` wait loop of `blob-vercel.ts` 165 to 194 and the fresh deck index exist for Vercel Blob's two lags (T3 1.4) and run harmlessly on R2 on day one; a later cut retires them.

The selection. `select.ts`'s `blob` kind stays the kind (T3 1.1). A new variable `TURBOSLIDE_STORE_BACKEND=r2|vercel` picks the client; `r2` needs `TURBOSLIDE_R2_ACCOUNT_ID`, `TURBOSLIDE_R2_BUCKET`, `TURBOSLIDE_R2_ACCESS_KEY_ID` and `TURBOSLIDE_R2_SECRET_ACCESS_KEY`, and `hasBlobToken` (select.ts 53 to 55) learns that the R2 variables count as a token; `hosting-plugin.ts` 40 registers the R2 factory beside `layoutBlobClient`; `root.ts` 94 to 101's dev client fallback is unchanged. Three small changes ride along: `.thumbs/` joins the public set in `isPublicPath` (migrate.ts 81 to 86; T3 3.4), so thumbnails stay a 302 and the files Worker serves them; `putPulse` (pulse.ts 151 to 167) is skipped when the realtime tier is `do` (nothing polls, and it is the hottest key); the export puts set `Content-Disposition: attachment` at write time (W3 3.5) and the files Worker also honours `?download=1`, so the links in `exports/.jobs/<jobId>.json` (export-jobs.ts 367 to 370) keep working on both hosts.

The public reads. `turboslide-files` serves the public prefixes with `Cache-Control` from the object's `httpMetadata`, `ETag`, `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy` as the assets route sets them (headers.ts 77 to 95, T3 3.4 item 3), and `Content-Disposition: attachment` on `download=1`. Every read is one Worker request and one Class B operation, since the Worker's cache is not functional on `workers.dev` (W3 3.3). For the link window after the cutover it answers a 302 to `https://<TURBOSLIDE_LEGACY_STORE_HOST>/<key>` when the bucket has no such key, so an export or build link handed out before the flip keeps working for its day (T3 4.3); the fallback variable is removed a week later.

The copy. Cloudflare's tools read S3 compatible sources and Vercel Blob is not one (W3 5.1), so the copy is `scripts/blob-copy.mjs` with an R2 target: about 12,000 objects and 1.0 GiB after the skip set (`exports` older than a day, the per instance sidecars), eight to eleven minutes at eight in flight, under $0.25 of Vercel transfer and inside R2's free Class A million (W3 5.3). The documents take `migrate.ts`'s resumable steps (`plan`, `copy`, `verify`, `cutover`, `delete`) with `legacy` the Vercel client and `documents` the R2 client (T3 4.2), which also lands layout v2 in the same cutover (T3 4.4). The etag comparison both rely on is day 0's measurement; the fallback is the md5 of the bytes read back, which the script already does.

The order. The full copy while production is live; the verify; a deploy of both Vercel projects with `TURBOSLIDE_STORE_BACKEND=r2`, the R2 variables, `TURBOSLIDE_PUBLIC_STORE_HOST` set to the files Worker's host and `TURBOSLIDE_LEGACY_STORE_HOST` set to the Vercel store's host; the delta pass for the objects whose etag moved during the copy (the writes of the minutes between the copy and the deploy land on R2 already, since the new deployment writes there; the delta covers the old deployment's last writes); the Vercel store deleted after the link window. The window in which two deployments write two stores is the alias switch's seconds, the same class `docs/HOSTING-MOVE.md` 2.2 and 3 worked out for the Vercel to Vercel case; the ship note records it. The CSP's `img-src` and `connect-src` follow the one variable (headers.ts 220 to 236), the avatar base follows it (avatar-tier.ts 28), no deck document names a host (T3 4.3), and no avatar row exists yet because production has no database (T3 4.3).

## 4. The code changes by file

### 4.1 `packages/realtime`

- `src/channel.ts` 10: `REALTIME_TIERS` becomes `['memory', 'redis', 'blob', 'do']`. The `RealtimeChannel` type (291 to 338) is unchanged; the working tree's `bus?: DropBus` stays optional and the `do` channel leaves it undefined (the readers fall to their TTLs, T1 5 item 2; section 2.5 shortens two of them).
- `src/protocol.ts` 328: the tier enum follows `REALTIME_TIERS`. New zod schemas for the socket frames: up `joinFrame` (the fallback carrier of the ticket), `opsFrame` (`OpsPost` plus `req`), `presenceFrame`, `leaveFrame`, `ticketFrame`; down `ackFrame` (`OpsResponse` of room-client.ts 60 to 84 plus `req`) and `presenceRefusedFrame`; `roomEventSchema` unchanged, so every `RoomEvent` is a down frame as is. The heartbeat is the literal string `hb`, not JSON, so the auto response pair matches bytes.
- `src/select.ts` 58 to 89: a fourth branch. `TURBOSLIDE_REALTIME=do` forced needs `TURBOSLIDE_REALTIME_WORKER_URL` and `TURBOSLIDE_ROOM_SECRET`, else a TypeError at the first request (the shape of 67 to 71); unforced, the URL set selects `do` the way `REDIS_URL` selects `redis` (79), checked before the Redis branch; `VERCEL` without either stays `blob` (80 to 87). `notice` is null for `do`.
- `src/do.ts`, new: `doChannel({ url, secret, fetch, memory })`. `head`, `since`, `publish`, `trim`, `presence.roster`, `presence.leave`, `flag` over `/internal/*` with the bearer and a 10 s `AbortSignal.timeout`; `subscribe` registers nothing and returns a noop (the function holds no live document on this tier); `append` is `POST /internal/rooms/<id>/append` for the contract test alone (the room never calls it on this tier; the server write is `serverWrite`); `lock`, `heartbeat`, `unlock`, `budget`, `presence.set`, `bind`, `owner` are the memory channel's per instance maps (the blob tier's per instance half, memory.ts 1 to 5), since nothing on this tier needs them across instances. Three calls beyond the interface, on a `DoChannel` type the room narrows to: `serverWrite`, `flush`, `external`, `accessChanged`. `flag('realtime')` reads `/internal/flags` with a 30 s cache per instance (section 6.3 counts it).
- `src/admit.ts`, new, `node:` free: `transformEntry` (room.ts 1485 to 1509), `landedOf` (1462 to 1470), `landedOwn` (1473), `rewritesText` (1416), `reanchor` and `reanchorAll` (1512, 1550), `undoOfSplices` (1584), `landCandidate` (1596 to 1642), `refusalIssue` and `refusalMessage` (1655, 1669), `betweenEntries` (1351 to 1366), `appendShifts` (1217 to 1244), `slideBytes` (1406), `splitReplayed` (2038), the working tree's `yieldConcurrentConversion`, and the body of `admitOps`' loop (1693 to 1927) as `admitBatch(deps, input)` over an injected `{ live, since, append, budget, now }`. `room.ts` keeps thin wrappers that bind its channel and live document, so the memory, redis and blob tiers run the same code they run today and `admitOps`' tests keep their names. The imports of these functions are `@turboslide/schema` (reduce, transform, validate, mutations), which import no `node:` (T1 1.3 item 8; the grep of 2026-10-01 over `packages/schema/src`, `packages/identity/src`, `packages/realtime/src` and `client` finds no `node:` import outside tests).
- `src/reader.ts`, new: `filterEventForReader` (2566 to 2599), `rosterEntryForReader` (2515 to 2539), `stripNotes` (2542 to 2556), `roleWord` (2487), `editingCount` and `overEditingCeiling` (2620 to 2628) over a `ViewerFacts` argument.
- `src/channel-contract.ts`: runs the `do` channel against an in process fake Worker (`do-fake.ts`, the object's handlers over the memory channel) so the thirteen contract cases hold on the fourth tier; the drop bus case is skipped as on blob.
- `package.json` exports: `./do`, `./do-fake`, `./admit`, `./reader`.

### 4.2 `apps/realtime-worker`, the Worker and the object

Location: `apps/realtime-worker/` (an app with its own deploy target and configuration, as `apps/render-worker` is; the root `tsconfig.json` references gain it after `apps/render-worker` at line 60). Package `@turboslide/realtime-worker`, depending on `@turboslide/realtime`, `@turboslide/schema`, `@turboslide/store` (`./snapshot-read` alone), `@turboslide/identity`, `@turboslide/accounts` (4.7), `zod`, and `wrangler` plus `@cloudflare/vitest-plugin` as dev dependencies ("runs your Vitest tests inside the Workers runtime", https://developers.cloudflare.com/workers/testing/vitest-integration/, last updated 2026-08-20; its test API offers `runInDurableObject(stub, callback)` and `runDurableObjectAlarm(stub)`, https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/, last updated 2026-09-28). The catalog in `pnpm-workspace.yaml` carries none of these today (the grep of 2026-10-01); the integrator adds them.

```
apps/realtime-worker/
  wrangler.jsonc
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          the router: /rooms/*, /api/auth/*, /internal/*, OPTIONS for the two cross origin POSTs
  src/room.ts           export class DeckRoom extends DurableObject
  src/ticket.ts         verifyTicket (WebCrypto HMAC), the same code Vercel's room.ts imports from @turboslide/realtime/ticket
  src/frames.ts         the up and down frames over protocol.ts
  src/accounts/         the better-auth mount over D1 and the internal identity API (4.7)
  src/internal.ts       the bearer check and the /internal/* handlers
  src/env.d.ts          the bindings type
  test/room.test.ts     the object under runInDurableObject and runDurableObjectAlarm
  migrations/           the D1 migrations, applied by wrangler (the accounts' schema, 4.7)
```

`wrangler.jsonc`, by the pages W1 6.1 read (the minimum keys, the `exports` form with `storage: "sqlite"`, `migrations` and `exports` mutually exclusive, the `compatibility_date` at or after 2026-08-04 enabling `nodejs_compat` by default per T2 section 6) and the environments page read today ("When you create an environment, Cloudflare effectively creates a new Worker with the name `<top-level-name>-<environment-name>`" and "Bindings and environment variables are non-inheritable, and must be specified per environment", https://developers.cloudflare.com/workers/wrangler/environments/, last updated 2026-09-22):

```jsonc
{
  "name": "turboslide-realtime",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "workers_dev": true,
  "observability": { "enabled": true },
  "durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "DeckRoom" }] },
  "exports": { "DeckRoom": { "type": "durable-object", "storage": "sqlite" } },
  "d1_databases": [{ "binding": "ACCOUNTS", "database_name": "turboslide-accounts", "database_id": "<from wrangler d1 create>", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "STORE", "bucket_name": "turboslide" }],
  "vars": {
    "TURBOSLIDE_APP_ORIGIN": "https://www.turboslide.com",
    "TURBOSLIDE_ROOM_ORIGINS": "https://www.turboslide.com,https://turboslide.com,https://turboslide.vercel.app,https://turboslide-*-kl01s-projects.vercel.app",
    "TURBOSLIDE_ADMIN_EMAILS": "kevin@generaltranslation.com",
    "TURBOSLIDE_MAIL": "off"
  },
  "env": {
    "preview": {
      "durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "DeckRoom" }] },
      "d1_databases": [{ "binding": "ACCOUNTS", "database_name": "turboslide-accounts-preview", "database_id": "<id>", "migrations_dir": "migrations" }],
      "r2_buckets": [{ "binding": "STORE", "bucket_name": "turboslide-preview" }],
      "vars": { "TURBOSLIDE_APP_ORIGIN": "", "TURBOSLIDE_ROOM_ORIGINS": "https://turboslide-*-kl01s-projects.vercel.app,http://localhost:*", "TURBOSLIDE_ADMIN_EMAILS": "kevin@generaltranslation.com", "TURBOSLIDE_MAIL": "capture" }
    }
  }
}
```

Whether the `exports` block must be repeated per environment, and how a Durable Object namespace is provisioned for `turboslide-realtime-preview`, the environments page read today did not say (section 10 item 11); the first `wrangler deploy --env preview` answers it. The bindings: `ROOMS` (the object namespace), `ACCOUNTS` (D1), `STORE` (R2, read by the object's cold start alone). The secrets, set with `wrangler secret bulk <file>` from a 600 JSON file ("You can upload up to 100 secrets per bulk request for a single version", "a path to a JSON or `.env` file", https://developers.cloudflare.com/workers/configuration/secrets/, last updated 2026-07-03; whether `secret put` reads stdin the page does not say, so the wrapper of 4.8 uses `bulk`): `TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_SESSION_SECRET` (the anonymous cookie's MAC, read by the identity API), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optionally `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `TURBOSLIDE_MAIL_FROM`, and on the preview environment `TURBOSLIDE_VERCEL_BYPASS`. `TURBOSLIDE_BUILD_COMMIT` is passed at deploy as a var so `/internal/version` answers the commit the way `/api/agent` does (build-commit.ts 2 to 13).

`DeckRoom`, the object. Its SQLite schema, created in the constructor with `CREATE TABLE IF NOT EXISTS` (W1 section 4: the constructor runs on every wake, so it does the minimum):

```sql
create table if not exists meta (k text primary key, v text not null);
  -- head, covered, revision, run_start_at, last_op_at, open_sockets
create table if not exists entries (
  seq integer primary key, rev integer not null, client_id text not null, op_id text not null,
  kind text not null, body text not null, at integer not null);
create index if not exists entries_op on entries (op_id);
create table if not exists document (chunk integer primary key, body text not null);
```

The row size limit is 2 MB (W1 section 2); an entry's body is under `OPS_POST_MAX_BYTES` 256 KB (protocol.ts 28) and a document chunk is 900 KB. A statement takes at most 100 bound parameters (W1 section 2), so an append of 64 entries runs as five `INSERT` statements of up to 14 rows. The hot path keeps the last 2,000 entries in memory (`tail`) and the op id set with them; SQLite is read on the hot path only for the one indexed lookup per op id; the tail is reloaded from `entries` above `covered` at a wake, which is at most 2,000 rows by the trigger and in practice tens. The handlers: `fetch` (the upgrade, the HTTP `ops`, `presence` and `leave` fallbacks, the internal calls), `webSocketMessage` (the frames of 4.1), `webSocketClose` and `webSocketError` (the leave, the last close's commit and chunk deletion, the `rt_open` row), `alarm` (1.8). No `setTimeout` and no `setInterval` anywhere in the class: W1 finding 4 prices a standing timer at 90 to 450 GB-s an editor hour against 1.5 without. Every outbound `fetch` carries `AbortSignal.timeout(20_000)`: a hung fetch keeps the object awake and billed up to 15 minutes (W1 section 4). `setWebSocketAutoResponse(new WebSocketRequestResponsePair('hb', 'hb'))` in the constructor. `idFromName(deckId)` with `locationHint: 'enam'` from the Worker, near `iad1` where the commit route and the agent writes run; the object never moves after creation (W1 finding 10), and a seller in Europe pays the ocean on every frame, which the cross region reading of `realtime.keystroke.within-300ms` records.

The Worker's `/internal/*` routes, all under the bearer: `GET rooms/:id/head`, `GET rooms/:id/since?seq=&limit=`, `POST rooms/:id/publish`, `POST rooms/:id/append` (the contract test's), `POST rooms/:id/server-write`, `POST rooms/:id/flush`, `POST rooms/:id/external`, `POST rooms/:id/access-changed`, `GET rooms/:id/roster`, `GET rooms/:id/metrics` (requests, wakes, `rowsRead` and `rowsWritten` summed from the cursors, W1 finding 15, for `cost.do.rows`), `GET flags` (the `rt_flags` D1 table, 5 s cache in the Worker), `GET open` (the `rt_open` D1 table: a row per deck with sockets or uncommitted entries, written at the first socket's open and deleted at the last close's commit, for the drain of 5.5), `GET version`, and the accounts routes of 4.7.

### 4.3 `apps/files-worker`

A second Worker, about 150 lines: `wrangler.jsonc` with `name: "turboslide-files"`, the `STORE` R2 binding, the vars `TURBOSLIDE_PUBLIC_PREFIXES` and `TURBOSLIDE_LEGACY_STORE_HOST`, no secret, no object; `src/index.ts` routes `GET` and `HEAD` for keys under the public prefixes (3.4), refuses everything else with 404, answers `OPTIONS` for the font and twin fetches the editor makes cross origin (W4 5.5), and sets the headers of 3.4. The preview environment binds `turboslide-preview`.

### 4.4 `apps/studio`, the server

- `src/server/room.ts`: `buildChannel` (146 to 244) gains the `do` case, building `doChannel` with the URL, the secret and the memory maps; `createRoom` (773 to 1035) on this tier loads the store at `coveredSeq` and applies `channel.since` (the cold path of `syncLive`, 794 to 824) on every `live()` read instead of holding a document and a subscription, with `follow` and `watch` off as on blob (890 to 891, 1009 to 1016); `admitOps` on this tier is unreachable (the ops route of 4.5) and asserts; `admitServerWrite` (3281 to 3471) on this tier calls `channel.serverWrite` with `commit: true` and maps the answer onto `ServerWriteResult` (3251 to 3261); `flushRoom` (1088 to 1112) calls `channel.flush`; `liveAtLeast` (1965 to 2003) waits on the object's head; `mintRoomTicket` and `ticketFor(request, deckId)` (2.2); the hand off machinery of the working tree (`ensureRealtimeTier`, `supersedeRooms`, `noteRedisUnavailable`) gains `noteWorkerUnavailable`, whose fallback is the in process blob channel over the store as today's redis fallback is (T1 5 item 6), and the ticket route answers `{ tier: 'blob' }` while the fallback holds, which is how a tab learns to come back to SSE (5.5). The branches on `room.tier === 'blob'` that T1 2 item 10 lists are each read once for `do`: the server reads "the store plus the object's tail", the client reads like memory and redis.
- `src/server/checkpoint.ts`: `commitRuns(store, runs, applier)` exported from the body of `commit` (190 to 210) with `origin` on the `Write`; `createCheckpointer` keeps running the memory and redis tiers and is not built on the `do` tier.
- `src/routes/api/internal/decks.$deckId.checkpoint.ts`, new: the bearer, `commitRuns`, the comments applier, the card thumbnail's `scheduleCardThumb` after a commit (card-thumb.ts 37 to 39 keeps its 30 s rest and 8 s floor; T1 finding 12 named the lost hook), the answer `{ records }` or `{ conflict, revision }`.
- `src/routes/api/decks.$deckId.ticket.ts`, new: `POST`, same origin (the CSRF filter of `start.ts` 19 to 22, 43 covers it), `requestIdentity`, `decideFor('read')`, `viewerFacts`, the ticket, and `{ tier, socket, ticket, seq }` where `tier` is the instance's selection as the hand off leaves it; a refused decision answers 403.
- `src/routes/api/decks.$deckId.stream.ts`, `decks.$deckId.ops.ts`, `decks.$deckId.presence.ts`: on the `do` tier the stream route answers one SSE `resync` frame and closes (a tab of a deployment older than N, 5.1, reloads its document and shows the reconnecting word until the page is reloaded), the ops route answers 409 `resync`, the presence route answers `{ ok: true, dropped: true }`. On the other tiers they are unchanged.
- `src/server/access.ts`: `writeAccess` (434) and the three `publishDrop('link', ...)` sites (259, 318, 341) call `channel.accessChanged` when the channel is a `DoChannel`. `BLOB_ACCESS_TTL_MS` (70) and `LINK_GRANT_TTL_MS` (168) stand; a miss in `grantCache` (175) is never cached, so a link minted a second ago is found on R2's strongly consistent read (W3 2.2) on every instance (row `realtime.share-link.every-instance`).
- `src/server/write.ts` 401 to 495: `readEditorDeckFn` answers `room: { seq, tier, notice, socket?, ticket? }` from `ticketFor`.
- `src/server/headers.ts` 218 to 240: `connect-src` adds `https://<realtime worker host>` and `wss://<realtime worker host>` from `TURBOSLIDE_REALTIME_WORKER_URL` beside the store host; `img-src` already follows `TURBOSLIDE_PUBLIC_STORE_HOST`. The policy is report only today (`TURBOSLIDE_CSP=report`, hosting.md 1032), so an omission reports and does not block.
- `src/server/room.ts` 2352 to 2360: `IDENTITY_CACHE_MS` reads 2 s on the `do` tier (2.5).
- `src/server/hosting-plugin.ts` 40 and `packages/store/src/select.ts`: the R2 factory (3.4).
- `src/routes/api/auth.$.ts`: the proxy when `TURBOSLIDE_ACCOUNTS_URL` is set (4.7).

### 4.5 `apps/studio`, the client

- `src/editor/controller.tsx` 318 to 470: a second `RoomTransport` beside `sseTransport`, `socketTransport(deckId, socket, ticket, refresh)`. `open({ since, onEvent, onError })` constructs `new WebSocket(`${socket}?since=${since}`, ['turboslide.v1', `t.${ticket}`])`, parses each message with `roomEventOf` or the ack and refusal schemas, maps `close` codes onto `StreamFailure` (room-client.ts 113 to 126: 4401 and 4403 → a ticket fetch then a reopen at once; 4429 → `status: 503, retryAfterMs` from the reason; 4503 → `status: 410`, which the client reads as "ask the ticket route which tier"; any other → the ladder), aborts on the browser's `offline` event as the SSE transport does (353 to 356), and reconnects nothing (the client owns the reopen, 1674 to 1736). `postOps(body)` sends `{ t: 'ops', req, ...body }` and resolves on the matching ack within `OPS_POST_TIMEOUT_MS`; with no open socket it posts `POST ${socket's https form}/ops` with `Authorization: Ticket <ticket>` (1.7). `postPresence(body, { leave })` sends the frame; a leave with no socket goes by `fetch(..., { keepalive: true })` to `/rooms/<id>/leave` with the ticket in the body, since `sendBeacon` carries no header. The heartbeat frame is the string `hb`. The transport is chosen by `room.tier` from the loader and re-chosen on every reopen from the ticket route's answer.
- `packages/realtime/client/room-client.ts`: `helloTier` already resyncs on a foreign tier (the working tree, T1 5 item 10); a 300 s ticket refresh timer that calls the injected `refresh()` and hands the transport the new ticket; the `hb` frame in place of the heartbeat presence POST when nothing changed (the heartbeat POST stays on the other tiers). The state machine above the transport is unchanged (177 to 181, 341).
- `src/editor/EditorRoot.tsx`: reads `room.socket` and `room.ticket` from the loader's answer and passes the refresh function (a `fetch` of the ticket route).
- `packages/realtime/client/fake-transport.ts`: a socket shaped fake for the tests.

### 4.6 `packages/store`

`src/blob-r2.ts`, `src/snapshot-read.ts` (new), `src/select.ts` (the backend variable; `hasBlobToken`), `src/migrate.ts` 81 to 86 (`.thumbs/`), `src/pulse.ts` (`putPulse` skipped on the `do` tier, read from an option the store is built with), `apps/studio/src/server/export-jobs.ts` 367 to 370 and `export-sync.ts` (the `Content-Disposition` header on the put), `scripts/blob-copy.mjs` (the R2 target), the `isStoreBusy` reader (pulse.ts 187 to 198) for the S3 error shape.

### 4.7 The accounts on the Worker

The facts that place it: the D1 binding exists inside a Worker alone and no supported path reaches D1 from a Vercel function (W2 answer 1); the HTTP query API is the control plane under 1,200 requests per five minutes per user (W2 1.3), so a per statement path from Vercel is capped and slow (W2 section 4); a session cookie set by a `workers.dev` host never reaches `www` (W2 answer 2); the one layout without a DNS change is the app proxying `/api/auth/*` to the Worker so the cookies are set first party on `www` (W2 layout A''), and that layout moves the identity reads with the sign in (W2 layout C). Section 2.5 shows why the identity reads are few on this tier, which makes layout C the cheap one.

- `packages/accounts/`, new, the runtime neutral core moved out of `apps/studio/src/server/auth/`: `schema.ts`, `alias.ts`, `profile.ts`, `tokens.ts` (the asynchronous path alone; the synchronous SQLite read of `tokens.ts` 9 to 13 stays in the studio's checkout adapter), `quota.ts`, `better-auth.ts` (`createAuth`, with the `hosted` input already in its shape, identity.ts 173 to 175, 206 to 208), `session.ts` (the anonymous cookie's MAC over WebCrypto), `principal-db.ts` (the `ts_principal` table: `principal_id`, `record` JSON, `last_seen_at`, `expires_at`; `touch` writes only when `last_seen_at` is older than an hour), `mail/` (Resend over `fetch`; the capture table), `onSessionCreated` (identity.ts 431 to 448) with the deck index merge factored out as a `linkedNow` fact for the app, and three dialects: `d1-dialect.ts` (over `kysely-d1` 0.4.0 or the shape of the tree's `sqlite-dialect.ts` 1 to 8 with the `bindable` mapping of 29 to 39 kept in front of D1 until W2 open 5 is read), `node-sqlite-dialect.ts` (moved), `postgres` (kept for a self hosted checkout). better-auth's installed adapter opens no transaction on `type: 'sqlite'` (W2 2.2), which D1 requires. The six `env.VERCEL` reads of the auth path (T2 3.4) become the explicit `hosted` input.
- `apps/realtime-worker/src/accounts/`: the mount of better-auth's handler at `/api/auth/*` (refused without the proxy header `x-turboslide-proxy: <TURBOSLIDE_ROOM_SECRET>`, so the auth origin is `www` alone), `baseURL` fixed to `TURBOSLIDE_APP_ORIGIN` with `trustedOrigins` naming it (T2 3.3, W2 layout A''), the migrations at boot through `getMigrations` and the Kysely schema builder as today (identity.ts 247 to 255) guarded by a D1 row so they run once, and the internal API: `POST /internal/identity` (the cookie header, the authorization header and the address in; `IdentityFacts` out: the session's account facts, the admin flag, the aliases, `linkedNow`, or the API key's facts for a bearer), `POST /internal/principals/{get,put,touch,resolve-many,delete}`, `POST /internal/profiles/{get,set-avatar,set-name,set-admin}`, `POST /internal/keys/{list,mint,revoke,touch}`, `POST /internal/quota/{read,increment}`, `POST /internal/mail/list`, `GET /internal/methods`.
- `apps/studio/src/server/auth/identity.ts`: `buildIdentityRuntime` (173 to 258) gains a client mode when `TURBOSLIDE_ACCOUNTS_URL` is set: `auth: null`, `db: null`, `keys`, `aliases`, `profiles`, `quotas`, `principals` as HTTP clients of the internal API with the caches of 2.5, `methods` from `/internal/methods`, `mailer` null (the Worker sends); `requestIdentity`'s session branch (605 to 645) calls the identity API; the `onLinked` hooks run on `linkedNow`. Without the variable the in process runtime runs as today (a checkout, the tests, a deployment without the Worker).
- `apps/studio/src/routes/api/auth.$.ts`: with `TURBOSLIDE_ACCOUNTS_URL` set, a proxy of the request to the Worker with the request's cookies, `x-forwarded-host` and the proxy header, relaying the answer's status, body and every `Set-Cookie` (h3 2.0.1-rc.31's proxy relays `Set-Cookie` and forwards the request's cookies, `dist/proxy.mjs` 185 to 199, 209 to 227 as W2 reads it); the CSRF filter (headers.ts 374 to 397) stays in front. A runtime proxy in the route is chosen over a build time `routeRules` entry (vite.deploy.config.ts 188 to 203) because the Worker's URL is a runtime variable.
- `apps/studio/e2e/identity-seed.mts` and `accounts.spec.ts`: a second mode reads the OTP code and the alias with `wrangler d1 execute turboslide-accounts --local --json` (W2 8.8) when the server runs against the local Worker; the default mode (node:sqlite in process) is unchanged, so the `accounts.*` rows keep running as `docs/PEOPLE.md` 6.2 runs them.
- `avatar.ts` (sharp) stays on Vercel and writes the avatar choice through `profiles.set-avatar`.

The fallback if this lane runs long: a SQL proxy. The Worker exposes `POST /internal/sql { statements: [{ sql, params }] }` over `env.ACCOUNTS.batch`, Vercel's `db.ts` gains a third engine whose Kysely dialect posts one statement per call, and the runtime stays on Vercel unchanged. It costs 4 to 7 Worker requests per authenticated request past the cookie cache (T2 4.1's statement counts) and one hop per statement, holds inside Workers Free at 50 editor hours a day and approaches the cap at 500 (section 6.3), and it is unsupported by any page read.

### 4.8 Scripts, the guard and the docs

- `scripts/hosting/cloudflare-env.mjs`, in the shape of `realtime-env.mjs` (1 to 38: 600 files, names only, `--dry-run`): subcommands `status`, `worker-secrets` (`wrangler secret bulk` from `~/.config/turboslide/worker-secrets.json`, 600, per environment), `vercel` (`vercel env add <NAME> <env> --sensitive` with the value on stdin for the Vercel side names of section 7 step 10), `store-cutover` (the four R2 variables, the backend, the two hosts), `accounts-on` (`TURBOSLIDE_ACCOUNTS_URL`), `flip` (`TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_REALTIME_WORKER_URL`; writes `scripts/hosting/production.json` to `do`), `drain` (reads `/internal/open` and calls `flush` per deck), `rollback` (`TURBOSLIDE_REALTIME=blob`), each refusing a 600 file whose mode lets anyone else read it. `scripts/hosting/README.md` gains the Cloudflare page.
- The guard patch for `~/.config/turboslide/gt-follow.sh`: a `wrangler deploy` step (`--env preview` for the check, the production name on green) run from `apps/realtime-worker` before the Vercel deploy when the push touches the Worker, with the Worker's `/internal/version` read against the preview and production; the drain before a rollback; the three realtime rows on the seller path as R6's patch already adds them (REALTIME.md 5.4 item 3).
- `docs/CLOUDFLARE.md` (the round's binding document, written from this note and A's by the synthesizer), `docs/hosting.md` section 13 (the Cloudflare runbook, the variables table rows), `docs/security.md` section 12 (the ticket, the two bearers, the proxy header), `docs/SYNC.md` 5.2 (the items the tier makes moot), `README.md`'s what works paragraphs through `what-works.mjs`, `docs/updates.md` at the ship.

## 5. The migration and the flip

### 5.1 Deployment N: the tree that knows the tier

Everything of section 4 lands on `main` with nothing selected: the client's parser accepts `do` (protocol.ts 328 is strict and drops a frame with an unknown word, T1 finding 6, so the client that knows the word must be in production before any hello says it); `select.ts` still reads `blob` on production (the forced row stands, hosting.md 9.2); the R2 client and the accounts client exist and are unused. The guard rides it as any main sha.

### 5.2 The store cutover

Section 3.4's order: the copy and verify, the deploy with the R2 variables on both projects, the delta, the legacy host fallback in the files Worker for a week, the Vercel store's deletion. It is independent of the channel and the accounts and can ship first, since the blob tier runs on any `BlobClient` (T3 1.1). On R2 the blob tier's pulse poll keeps working until the channel flips (the pulse is skipped only on the `do` tier).

### 5.3 The accounts on

`TURBOSLIDE_ACCOUNTS_URL` set on production and preview (`cloudflare-env.mjs accounts-on`) after the Worker is deployed with its secrets and the Google client exists: the Sign in row appears (`signInMethods` reads the Worker's methods), `accounts.google-roundtrip` is read by hand on `www.turboslide.com`. This is REALTIME.md 4.5 steps 2 to 4 and 7 with the Worker in place of Neon and Upstash; step 1 (Upstash) has no counterpart in this design.

### 5.4 The channel flip

1. The Worker is deployed (`turboslide-realtime`) and answers `/internal/version` with the commit.
2. `cloudflare-env.mjs flip` sets `TURBOSLIDE_REALTIME=do` and `TURBOSLIDE_REALTIME_WORKER_URL` on production and preview (`--force` over the forced `blob` row) and writes the expectation; the ship step commits and pushes; the guard checks `TURBOSLIDE_REALTIME_WORKER_URL` is present before the production deploy and runs the three realtime rows on the seller path; the next production deployment selects `do`.
3. A deck on the blob tier opened by the new tier: the object wakes with no chunks, reads the three keys (3.2), seeds `head` from the last record's `ops.toSeq` or the revision, and the first socket's hello carries `tier: 'do'`; a tab whose last hello said `blob` resyncs at `hello.revision` (the working tree's `helloTier` rule), its pending ops survive and replay (REALTIME.md 3.7). A tab's `since` from the blob tier is a store revision; the object answers `resync` when it is above its head or below its retained range (the replay rule), one reload per open tab.
4. Two deployments serving one deck during the alias switch: a blob instance commits a record straight to R2 while the object admits and commits through the checkpoint route; the object's commit meets the moved manifest and takes the path of 3.3 item 3 (reload, re-admit, commit, external checkpoint); the tabs reload once. The window is the seconds of the switch; the ship note records what it saw.
5. The production table is read once after the alias moves (`--base https://www.turboslide.com --tier do`).

### 5.5 The rollback and a deployment without the Worker

The rollback switch is `TURBOSLIDE_REALTIME=blob` (`cloudflare-env.mjs rollback`, `--force`), a redeploy or Vercel's Instant Rollback to the previous production deployment, which was built with the forced `blob` row (hosting.md 9.3's three ways). Before either, `cloudflare-env.mjs drain` lists the decks in `rt_open` and calls `flush` on each, so no acknowledged entry is left in an object's SQLite with no committer; the window after the drain is the seconds of the switch. A tab's socket position is not a store revision, so the blob tier's hello answers `resync` and the tab reloads once; the client's transport switches to SSE on the ticket route's `{ tier: 'blob' }` (4.5). The runtime switch without a deploy is the `rt_flags.realtime` row set off (`wrangler d1 execute turboslide-accounts --remote --command "update rt_flags set v='off' where k='realtime'"`), read within 30 s by every instance and at once by the Worker, which closes every socket with 4503; the tabs ask the ticket route and come back on SSE over the blob channel; `on` hands back.

A deployment without the Worker: `TURBOSLIDE_REALTIME` unset and `TURBOSLIDE_REALTIME_WORKER_URL` unset select `blob` on Vercel and `memory` on a checkout (select.ts 80 to 88); `do` forced without the URL or the secret throws at the first request (the shape of 67 to 71), so a half set environment fails with a sentence instead of running the wrong tier; `TURBOSLIDE_ACCOUNTS_URL` unset keeps the accounts in process (a checkout) or absent (hosted without a database, the state of production today, T2 1.3); `TURBOSLIDE_STORE_BACKEND` unset keeps Vercel Blob. The Worker unreachable at run time: `noteWorkerUnavailable` after three failed internal calls hands the instance's rooms to the in process blob channel over the store (the fallback of T1 5 item 6, over R2 now), the ticket route answers `blob`, the tabs' sockets are dead anyway and their reopen goes to SSE; nothing is lost that the object had committed, and what it had not committed waits in its SQLite for the next wake, which commits it and publishes an external checkpoint the SSE tabs read through the pulse (the blob channel polls the pulse: on this path the pulse is written again, since `putPulse`'s skip reads the live tier). The hand back when the Worker answers again is the same rule in reverse.

## 6. The free tier math

The load model is REALTIME.md section 2's, from `docs/SYNC.md` 4.3 (242: one editor hour is 12 minutes of editing at one edit per 5 s and 48 idle minutes; 1,000 show views a day; two `/decks` loads and one editor load an hour) and `research-options.md` section 6 as W1 1.2 counts it: per editor hour and tab 144 ops, about 1,440 presence frames, 576 heartbeats, a room of two, 300 bytes a message, 30 day months; 50 editor hours a day is 1,500 a month, 500 is 15,000. The caps are the pages W1, W2, W3 and W4 fetched on 2026-10-01 and this note repeats with their URLs. Every count below is the design's upper bound; the preview's `cost.*` rows (section 8) are the measurement.

### 6.1 Durable Objects

Per editor hour: incoming messages 144 ops and 1,440 presence frames, 1,584, at 20 to 1 ("a 20:1 ratio is applied to incoming WebSocket messages", https://developers.cloudflare.com/durable-objects/platform/pricing/ line 63) are 79 request units; heartbeats 0 (auto response, line 65); connects 2; alarms 72 (the 10 s re-arm during the 12 editing minutes, one `setAlarm` per fire, one row written each, line 104); Vercel's internal calls 3; about 156 requests. Rows written: 144 entries, 72 alarms, 24 commits times 3 document chunks and one `meta` update, 96, plus the deletes below retention, which count as writes (line 106) and amortize to one per entry, 144: about 456. Rows read: 144 indexed op id lookups, about 20 wakes at about 14 rows (the tail above `covered` and the chunks), 280, and two joins' replays at under 100 rows: about 600. Duration: about 25 s awake (1,584 handlers at about 2 ms, 24 commits awaiting Vercel at about 0.8 s, 72 alarm fires), 25 s times 0.125 GB is 3.1 GB-s; the hibernatable idle is unbilled (pricing line 35). Storage: the retained tail is at most 10,000 times 300 bytes, 3 MB a deck, and the chunks are the open decks' documents.

| Dimension | Free cap (a day) | 50 editor hours a day | 500 editor hours a day | Where Free breaks |
| --- | ---: | ---: | ---: | --- |
| Requests | 100,000 | 7,800 (8 %) | 78,000 (78 %) | about 640 editor hours a day |
| Duration | 13,000 GB-s | 155 (1.2 %) | 1,550 (12 %) | never in this shape; one standing `setInterval` would pass it at 50 hours (W1 finding 4) |
| Rows written | 100,000 | 22,800 (23 %) | 228,000 (228 %) | about 220 editor hours a day (100,000 ÷ 456) |
| Rows read | 5 million | 30,000 (0.6 %) | 300,000 (6 %) | never |
| SQL stored data | 5 GB total (1 GB an object by the limits page's FAQ, W1 section 2) | tens of MB | hundreds of MB | never while chunks are deleted at the last close |

The rows written line is the binding one, as W1 finding 3 found (84 to 216 % at 500 hours in its shapes). The two levers that move it are not in this design: `DROP TABLE` or `deleteAll()` for compaction (whether they count rows is W1 open 1) and dropping the document chunks (section 3.2 keeps them for the wake path; without them the line reads 192 % at 500 hours and 19 % at 50). On the Paid plan at 500 hours: 2.34 million requests a month, 1.34 million over the included million, rounded to 2 million at $0.15, $0.30; 46,500 GB-s inside 400,000; 6.8 million rows written inside 50 million; storage inside 5 GB-month: $5.30 a month.

### 6.2 D1

Per signed in editor hour the Vercel side makes about 15 to 30 identity calls (2.5), each a miss of the 300 s cache at most once per instance, so about 15 Worker calls of 4 indexed rows, 60 rows read; the principal `touch` writes once an hour, 1 row; a sign in is 7 to 9 rows read and 5 to 8 written (T2 4.2), 10 a day. At 500 signed in editor hours a day: 30,000 rows read (0.6 % of 5 million), about 600 rows written (0.6 % of 100,000). D1 never forces anything and its 500 MB database limit on Free (W2 1.1) is years away at these row sizes. The per request latency is the one Worker hop plus D1's binding, both unmeasured (W2 open 1).

### 6.3 R2 and Workers

R2, per editor hour: 24 commits at 4 Class A operations (the snapshot, the record, one body, the manifest; the pulse skipped; deletes free), 96, plus the card thumbnail's put and list, 2: about 100 Class A. Class B: the commit's two heads and the mirror's pull when another instance committed last, about 10 a commit, 240, plus the loader's head and pull, 15: about 255. Public reads: 1,000 show views a day at a median deck's twins (the median deck holds 14 objects, T3 4.1; the GT brand deck's 202 twins are served from the app's own static set, vite.deploy.config.ts 198 to 202 and T4 1.2, not from the store), say 5 reads a view, 5,000 Class B a day, once per browser because the twins are immutable (`cacheControlMaxAge` a year, T3 1.3). Storage 1.3 GB (T3 4.1).

| Line | Free amount (a month) | 50 editor hours a day | 500 editor hours a day | Where Free breaks |
| --- | ---: | ---: | ---: | --- |
| Class A | 1 million | 150,000 (15 %) | 1.5 million, $2.25 over at $4.50 a million | about 330 editor hours a day |
| Class B | 10 million | 530,000 (5 %) | 4 million (40 %) | about 1,200 editor hours a day |
| Storage | 10 GB-month | 1.3 GB | 1.3 GB | years at September's growth (W3 4.1) |
| Egress | free | | | |

The R2 subscription itself is a checkout (W5 3.4; section 7 step 7); its monthly amount inside these lines is $0.

Workers, per day, both Workers in one account (the Free plan's "100,000 per day" is the account's, W4 section 1): upgrades 2 an editor hour; identity calls 15 an hour; the function's internal calls 3 an hour; the flag read once per 30 s per active instance, about 1,000 at 8 active hours; auth requests through the proxy, tens; the files Worker's reads: 5,000 from show views, about 10 thumbnails per `/decks` load at 2 loads an hour, and a tab's own twins, 5 an hour.

| Line | Free cap (a day) | 50 editor hours a day | 500 editor hours a day |
| --- | ---: | ---: | ---: |
| Worker requests | 100,000 | about 7,000 (7 %) | about 25,000 (25 %) |
| CPU per invocation | 10 ms | unmeasured: HMAC and JSON on the upgrade and the identity route, D1 I/O, a streamed body on the files route | the same |

The swing term is the public set: a deck with 200 twins viewed by 1,000 distinct browsers in a day is 200,000 requests, over the cap by itself. The fallbacks, in order: a custom domain with Cache Everything on a zone Kevin lends (W3 3.2; `gtx.dev` is on Cloudflare nameservers, T3 3.4, which is a decision about the account); or the assets route streaming the body through the function with an immutable `Cache-Control` so the Vercel CDN serves repeats (T3 3.4's fourth path, priced as function time and Fast Data Transfer, not read today). Workers Paid lifts the cap to 10 million a month and its forcing fact is a pipeline habit (a hosted gate day: 6.19 million CDN misses in September on the personal project, W3 3.3), which REALTIME.md 1.1 rule 1 already forbids.

### 6.4 The plan, the forcing facts and the monthly cost

Workers Free holds at 50 editor hours a day with the largest line at 23 % of a daily cap and the Cloudflare bill at $0 (R2's lines inside its free tier, D1 and the objects inside theirs). Three facts, each with its source, force Workers Paid ($5 a month, "$5 USD per month for an account", https://developers.cloudflare.com/workers/platform/pricing/):

1. Load: at about 220 editor hours a day the objects' rows written pass 100,000 a day (6.1), and "If you exceed any one of the free tier limits, further operations of that type will fail with an error" until "00:00 UTC" (https://developers.cloudflare.com/durable-objects/platform/pricing/ lines 30 and 31, W1 1.1).
2. The cutoff rule itself: on Free a passed cap reddens every realtime row for the rest of the UTC day, and under `docs/FOCUS.md` 6.2 (262 to 270 in the working copy) a core row red twice on production is a stop; on Paid the same event is an overage of cents (W1 finding 6). Whether Kevin accepts a fail closed day is his choice; the design runs on Free and names the switch.
3. The spendable budget: a `workers.dev` hostname is public, each upgrade is one Worker request before any check runs, and the docs tell the Worker to validate so the object is not billed, which protects the object's cap and not the Worker's (https://developers.cloudflare.com/durable-objects/best-practices/websockets/ line 471, W1 1.4 item 2). The rate limiting binding is "local to the Cloudflare location that your Worker runs in" and "permissive, eventually consistent" (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/, last updated 2026-04-23), and its plan availability is not on the page; a WAF rule needs a zone (W4 7 item 11). On Free a stranger with 100,000 requests makes a day of red rows; on Paid the same stranger costs $0.03.

The monthly cost: $0 on Workers Free at 50 editor hours a day; $5.00 on Workers Paid at 50 editor hours (every line inside the included amounts); $5.30 of Cloudflare compute plus $2.25 of R2 Class A, about $7.55, at 500 editor hours a day in this shape; up to $17.95 at 500 hours if the object keeps a standing timer (W1 1.4's shape b), which this design forbids. The Vercel line after the move is the Pro seat plus the checkpoint commits (24 an editor hour at about 1.3 GB-s each, 13 GB-hours a month at 50 hours, $0.14) and the page loads; the per tab stream memory that the bills attributed to the pipeline's gates (research-costs-actual.md section 2) has no line left.

## 7. The setup steps the orchestrator performs

In order. The operator is the orchestrator in a browser tab of Kevin's Chrome with the Google session Kevin named, and in a terminal of this machine; it types no password, no card and no code from a phone; values go into 600 files under `~/.config/turboslide/` and are printed nowhere (REALTIME.md 4.5; `realtime-env.mjs` 1 to 9). The marks: ACCOUNT an account creation, PAYMENT a plan purchase, a checkout or a card, TERMS a terms, policy or consent checkbox, DNS any control that adds a site or a record, KEVIN a step only Kevin can do. A marked step is reported to Kevin with the dialog's text before the click; Kevin's message of 2026-10-01 ("access all of these from my google to set this up yourself") is the authorization the orchestrator records against each mark it then clicks, and the orchestrator stops where the text asks for a card or a password. The W5 step lists (Part A and Part B) are the detailed controls; this list orders them for design B.

| # | Step | Mark |
| --- | --- | --- |
| 0 | Kevin names the Cloudflare account (General Translation's, where `gt-edge` deploys from CI with `secrets.CLOUDFLARE_API_TOKEN`, `gt-cloud/.github/workflows/deploy-edge.yml` 64 to 67 as W5 reads it, or one of his own) and the Google account (`kevin@generaltranslation.com`, the design's default, REALTIME.md 7.2). Recorded in the ship note. | KEVIN |
| 1 | Open `https://dash.cloudflare.com/login` in the named Chrome profile. Signed in already: step 2. A Cloudflare user exists for the address: Kevin types the password and the second factor. None exists: Sign in with Google "will create a new account" (W5 3.1); the click creates an account. | KEVIN or ACCOUNT |
| 2 | Read the account id (`Copy account ID`, W5 3.3) into `~/.config/turboslide/cloudflare.env` (600) as `CLOUDFLARE_ACCOUNT_ID`. Confirm the plan reads Workers Free; click no Upgrade. Set the `workers.dev` subdomain (`turboslide`) under Workers & Pages, or let the first deploy prompt for it (W5 3.5). | PAYMENT if an upgrade is the only way forward |
| 3 | In the terminal, from `apps/realtime-worker` once the build lane has committed the package: `npx wrangler login --browser=false --use-keyring`; open the printed `dash.cloudflare.com/oauth2/auth` URL in the same Chrome profile; the consent dialog's Edit Permissions trims the scopes to the Worker, D1 and R2 ones; the callback lands on `http://localhost:8976/oauth/callback` (W5 3.2). This is an OAuth grant to wrangler, not a product term; the credential is encrypted in the OS keychain. The alternative, an API token, needs a password set on a social login account first (W1 6.3) and is Kevin's. | consent dialog (reported, not a stop) |
| 4 | `npx wrangler d1 create turboslide-accounts --location=enam` and `npx wrangler d1 create turboslide-accounts-preview --location=enam`; the two ids into `wrangler.jsonc` (W2 section 5 items 4 and 5). D1 is on the Free plan with no checkout (W2 1.1; W5 3.4). | |
| 5 | R2: Storage & databases > R2 > Overview. "Complete the checkout flow to add an R2 subscription to your account" (https://developers.cloudflare.com/r2/get-started/, W3 4.3, W5 3.4); "A primary payment method is required to purchase Cloudflare products and services" (https://developers.cloudflare.com/billing/create-billing-profile/, W5 3.4). The checkout is a subscription purchase whatever it charges, and two third party pages say it asks for a card (W5 3.4). Report the checkout's first page to Kevin; a card field is Kevin's. | PAYMENT |
| 6 | After the subscription: `npx wrangler r2 bucket create turboslide --location enam` and `... turboslide-preview --location enam`; in the dashboard, R2 > Manage API tokens > Create Account API token, Object Read & Write scoped to the two buckets; the Access Key ID and the Secret Access Key, shown once (W3 2.1), into `cloudflare.env` as `TURBOSLIDE_R2_ACCESS_KEY_ID` and `TURBOSLIDE_R2_SECRET_ACCESS_KEY`. No public access on either bucket; no custom domain (that would be DNS). | DNS if any page offers Add a site or a custom domain: stop |
| 7 | The Google client, W5 Part B: the project `Turboslide` under the named account (B2); Branding with app name, support email, External, the contact address, and the checkbox "I agree to the Google API Services: User Data Policy" (B3); the authorized domain `turboslide.com` and the home page link, the privacy and terms links empty until the pages exist (B4; both answer 404 today, W5 summary 9); Publish app (B5; a dialog that asks to accept anything is a stop); the Web application client `Turboslide web` with the four origins and the four redirect URIs of `design-google-login.md` 230 to 231 (B7; the redirect URI stays on `www`, so nothing of W2 open 7 applies); the client id and secret into `~/.config/turboslide/google-oauth.env` (600; `realtime-env.mjs` 68 to 71 names the file). A first console sign in may show a Terms of Service page (W5 4.2). | TERMS at B3 and possibly B1 and B5 |
| 8 | Mint the secrets locally into `~/.config/turboslide/worker-secrets.json` (600): `TURBOSLIDE_ROOM_SECRET` and `BETTER_AUTH_SECRET` from `openssl rand -hex 32` (one value per environment), `TURBOSLIDE_SESSION_SECRET` copied from the Vercel production value only if it is in a 600 file already, else a new value set on both sides in step 10, the Google pair from `google-oauth.env`. `node scripts/hosting/cloudflare-env.mjs worker-secrets --env production` runs `npx wrangler secret bulk <file>` (section 4.2's page), then `--env preview` with the preview file, which also carries `TURBOSLIDE_VERCEL_BYPASS` from the Vercel project's automation bypass secret (W4 5.4). | |
| 9 | `npx wrangler deploy --env preview` then `npx wrangler deploy` from `apps/realtime-worker`, and the same from `apps/files-worker`; the first deploy provisions the object namespace and prompts for the subdomain if step 2 left it (W1 6.2); `npx wrangler d1 migrations apply turboslide-accounts --remote` for the accounts schema. Read `/internal/version` on each. | |
| 10 | The Vercel variables by `node scripts/hosting/cloudflare-env.mjs vercel --dry-run` then without it, from a root linked to `turboslide-gt` (`vercel env add <NAME> <env> --sensitive`, the value on stdin, `realtime-env.mjs` 4 to 5 and 699 to 704): `TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_REALTIME_WORKER_URL`, `TURBOSLIDE_ACCOUNTS_URL`, `TURBOSLIDE_R2_ACCOUNT_ID`, `TURBOSLIDE_R2_BUCKET`, `TURBOSLIDE_R2_ACCESS_KEY_ID`, `TURBOSLIDE_R2_SECRET_ACCESS_KEY`, `TURBOSLIDE_PUBLIC_STORE_HOST`, `TURBOSLIDE_LEGACY_STORE_HOST`; production and preview each with their own values. `TURBOSLIDE_STORE_BACKEND`, `TURBOSLIDE_REALTIME` and `TURBOSLIDE_ACCOUNTS_URL` are set by the cutover, flip and accounts-on steps of section 5, not here. The personal project `turboslide` takes the same rows only if Kevin keeps it a second production (REALTIME.md 7.6). | |
| 11 | The store copy: `node scripts/blob-copy.mjs --target r2 ...` with both credentials in the environment from the 600 files, `--verify`, then the cutover of 5.2 through `cloudflare-env.mjs store-cutover` and a push through the guard. | |
| 12 | `cloudflare-env.mjs accounts-on`, a push, the hand row `accounts.google-roundtrip` on `www.turboslide.com` (Kevin signs in; the verifier reads). | KEVIN signs in |
| 13 | The redis preview gate of REALTIME.md 5.4 item 2 is replaced by the `do` preview gate of section 9; then `cloudflare-env.mjs flip`, the push, the production table. | |
| 14 | Record in the ship note: the account's name, the account id's first four characters, the subdomain, the plan as shown, the two bucket names, the two database names, the Worker names and their `/internal/version`, the Google project id and the client id's prefix, every mark clicked with the dialog's text and Kevin's authorizing message, and the date. | |

No step moves DNS. Nothing above installs a Vercel Marketplace product. The account boundary sentence of `docs/hosting.md` (working copy 976 to 977: "no agent installs a Vercel Marketplace product, creates a paid resource, changes DNS, registers a sending domain or signs up for a service") is lifted by Kevin's message for the Cloudflare and Google steps the marks name and for nothing else; the ship note records the lift.

## 8. The rows this design meets and the cost rows restated

Of `docs/REALTIME.md` section 2 (lines 25 to 51):

| Row | Met by | Note |
| --- | --- | --- |
| `realtime.keystroke.within-300ms` | 1.2 | the one region bound by the estimate; the cross region reading is the hand row; the object's placement is `enam` |
| `realtime.caret.within-300ms` | 1.4 | a caret frame is one socket frame each way |
| `realtime.caret.offset-after-merge` | R2's transform (REALTIME.md 3.5) | transport independent |
| `realtime.selection.outline-within-300ms` | 1.4 | |
| `realtime.block.drag-live` | 1.4 | `drag` is a volatile frame |
| `realtime.title.two-typers` | 1.2, 2.3 item 1 | one thread orders both |
| `realtime.join.chip-within-1s` | 1.3 | the roster is the object's; no instance seam exists |
| `realtime.follow.for-everyone` | R3's surfaces | transport independent |
| `realtime.agent.write-announced` | 1.5 | the author rides the entry |
| `realtime.share-link.every-instance` | 4.4 (`access.ts`), W3 2.2 | R2's strong read, no cached miss |
| `realtime.reload.loses-nothing` | 1.6 | the records carry `origin` on this tier |
| `realtime.reconnect.loses-nothing` | 1.7 | |
| `realtime.pointer.second-browser` | 1.4 | |
| `realtime.caret.dims-and-leaves` | 1.4 | the leave is `webSocketClose`, at once |
| `realtime.card.chip-painted` | R3's stacking | transport independent |
| `realtime.departed-guest.name-stable` | 4.7 (`ts_principal` on D1), 2.5 (the 2 s cache) | the file per instance store is gone on this tier |
| `accounts.*` five rows | 4.7 | the local rows run in process as today; the hand row on `www` after 5.3 |

The cost rows, restated for the `do` tier in the matrix's shape (REALTIME.md 43 to 46):

| Id | Interaction and bound on the `do` tier | Driver |
| --- | --- | --- |
| `cost.editor-idle.calls` | One tab alone, 3 minutes idle: at most 1 function request a minute (the ticket refresh), 0 store calls, 0 object requests, 0 rows written, at most 12 rows read; the heartbeat is auto answered | `cost-probe` |
| `cost.editor-editing.calls` | One edit per 5 s for 3 minutes: at most 3 function requests a minute (the checkpoint commits at the 30 s cadence plus the refresh), at most 10 Class A and 12 Class B store calls a minute, at most 15 object request units a minute (the ops at 20 to 1 plus 6 alarms), at most 40 rows written a minute, at most 20 rows read | `cost-probe` |
| `cost.two-tabs-idle.calls` | No `list`, 0 Class A store calls a minute, 0 object requests | `cost-probe` |
| `cost.do.rows` (replaces `cost.redis.commands`) | One editor hour as `docs/SYNC.md` 4.3 counts it, driven as 12 editing minutes and 48 idle minutes: at most 200 object requests, 600 rows written, 5,000 rows read and 15 GB-s, read from `GET /internal/rooms/<id>/metrics` before and after, and from the dashboard's analytics for the hour on the preview | `cost-probe` with `--worker-url` through a wrapper |
| `cost.worker.requests` (new) | The same editor hour: at most 60 requests to the two Workers from one tab (upgrades, identity calls, twins, thumbnails), read from the dashboard's analytics | `cost-probe` |

The ceilings hold the ship when passed on the preview (REALTIME.md 5.5). `cost.redis.commands` stays in the matrix for the redis tier and is not driven on this one.

## 9. The lanes, the merge order and the gates

### 9.1 What happens to REALTIME.md 5.1's six lanes

R1 (the channel and the server, redis) stays as landed: the redis tier remains a tier in the tree, its `PRESENCE_SET` script, drop bus, agent author, non contiguous replay rule and hand off machinery are what this design builds on (T1 section 5), and nothing of it is undone. R2 (the client and the carets) stays: the state machine above the transport is unchanged and the `helloTier` rule is the flip's mechanism. R3 (presence and the people surfaces) stays. R4 (Google sign in) stays as code and changes placement: the provider block, the dialog, the local rows land as built, and lane W5 below moves where the runtime runs. R5 (the matrix and the drivers) changes: the gate gains `--tier do` and the rows of section 8. R6 (the hosting scripts and docs) changes: the env wrapper gains a Cloudflare sibling and the runbook is section 5's. The design replaces REALTIME.md 4.5 steps 1 and 2 (Upstash and Neon) with the Worker, D1 and R2, and keeps steps 3 to 7 with the Worker as the database.

### 9.2 The lanes of this build, with disjoint files

| Lane | Owns | Builds | Rows |
| --- | --- | --- | --- |
| W1 the Worker and the object | `apps/realtime-worker/**` except `src/accounts/**`; `packages/realtime/src/do-fake.ts`; `packages/store/src/snapshot-read.ts` | `DeckRoom` (4.2), the router, the ticket verifier, the frames, the alarm commit trigger, the internal API, the metrics, `rt_open` and `rt_flags`, the Vitest tests under `runInDurableObject` and `runDurableObjectAlarm` | every `realtime.*` row on the local do run; `cost.do.rows` |
| W2 the admission split and the `do` tier on the server | `packages/realtime/src/{channel,select,protocol,do,admit,reader,channel-contract}.ts` and their tests; `apps/studio/src/server/{room,checkpoint,access,write,headers}.ts`; the three deck routes; the two new routes of 4.4 | 4.1 and 4.4; the ticket mint; `commitRuns`; `accessChanged`; the CSP; the 2 s identity cache | `realtime.agent.write-announced`, `realtime.share-link.every-instance`, `realtime.reload.loses-nothing` |
| W3 the client transport | `apps/studio/src/editor/controller.tsx` (the transport block), `EditorRoot.tsx` (the room facts), `packages/realtime/client/{room-client,fake-transport}.ts` and tests | `socketTransport`, the ticket refresh, the HTTP fallback, the close code map, the `hb` frame | `realtime.reconnect.loses-nothing`, `realtime.caret.dims-and-leaves`, the flip's one reload per tab |
| W4 the store on R2 and the files Worker | `packages/store/src/{blob-r2,select,migrate,pulse}.ts`, `apps/studio/src/server/{hosting-plugin,root,export-jobs,export-sync,thumbs,auth/avatar-tier}.ts`, `scripts/blob-copy.mjs`, `apps/files-worker/**` | 3.4, 4.3, 4.6; day 0's etag and checksum measurement on the preview bucket | the `sync.*` rows on the R2 preview; `cost.*` store lines |
| W5 the accounts on the Worker | `packages/accounts/**` (new), `apps/studio/src/server/auth/**`, `apps/realtime-worker/src/accounts/**`, `apps/studio/src/routes/api/auth.$.ts`, `apps/studio/e2e/{identity-seed.mts,accounts.spec.ts}` | 4.7 | the five `accounts.*` rows in both modes; `realtime.departed-guest.name-stable` |
| W6 the matrix and the drivers | `docs/gslides-parity/focus/core-matrix.json`, `scripts/probes/{core-matrix,core-gate,sync-cost-probe}.mjs`, `apps/studio/e2e/core/realtime.spec.ts`, `scripts/probes/core-walk/**`, `docs/gslides-parity/cloudflare/verify/**` | the rows of section 8 on day 0; `--tier do`; the two browser spec's Worker run; the metrics reader | every row has a step |
| W7 the hosting scripts and docs | `scripts/hosting/cloudflare-env.mjs` and README, the guard patch under `docs/gslides-parity/cloudflare/build/guard.patch`, `docs/CLOUDFLARE.md`, `docs/hosting.md` section 13 and the variables table, `docs/security.md` section 12, `docs/SYNC.md` 5.2, `README.md` through `what-works.mjs`, `docs/updates.md` | 4.8; the runbook of section 5; the ship note's skeleton with section 7's record | the ship's smoke |

The integrator owns `tsconfig.json`'s references, `pnpm-workspace.yaml`'s catalog (wrangler, `@cloudflare/vitest-plugin`, `kysely-d1` or none, an S3 signer), the root `package.json` scripts, `packages/realtime/package.json`'s exports (by W2's request on day 0), `docs/FOCUS.md` 6.2's Worker step, the merges, the rebases and the two previews. Files two lanes need: `packages/realtime/src/protocol.ts` (W2 owns; W3 reads the frame schemas, merge order W2 then W3); `apps/realtime-worker/src/index.ts` (W1 owns; W5 adds one `import` and one route group by request); `apps/studio/src/server/auth/identity.ts` (W5 owns; W2 reads `requestIdentity` unchanged); `apps/studio/src/server/room.ts` (W2 alone; W5's identity client lives in `auth/`); `docs/hosting.md` (W7 owns; every lane names its rows in `build/<lane>.md`).

### 9.3 The merge order and the gates

The order: W6 first (the rows and drivers exist on day 0), then W4 (the store; independent of the channel; its cutover can ship on its own), then W2 (the server side `do` tier and the admission split, which must land after the realtime round's R1 and R2 are on `main`, since it edits the files R1 is editing now: room.ts, checkpoint.ts, access.ts, channel.ts, select.ts, protocol.ts), then W1 (the Worker, which imports W2's `admit.ts` and `reader.ts`), then W3 (the client, after W2's frames), then W5 (the accounts, after R4 is on `main`), then W7. After each merge the integrator typechecks (`node_modules/.bin/tsc -b`), runs vitest per touched package, runs the `/new` boot probe and rebases onto `origin/main`.

The ships follow `docs/FOCUS.md` 6.2 (working copy 262 to 270) and REALTIME.md 5.3's rule of 2026-10-01: one lane's work per push through the guard, `deployed <sha>` in `gt-follow.log` before the next push, so a red on production names one change. The Worker deploys are the guard's new step (4.8): the preview Worker for the check, the production Worker on green, each read at `/internal/version`; a Durable Object lifecycle change deploys only with `wrangler deploy` (W1 finding 12), and the object runs one version at a time (W4 5.4), so the Worker's "preview" is a second Worker and not a Version URL.

The gates, under REALTIME.md 1.1's three rules (the whole matrix on the local memory tier; one preview per round; a docs only push runs the smoke alone):

1. The local run. Every lane drives its rows on the node server with the memory tier as every round does. W1, W2, W3 and W5 also drive the `do` tier locally: `npx wrangler dev` from `apps/realtime-worker` (bindings "simulated locally" by default, "By default, bindings connect to local resource simulations", https://developers.cloudflare.com/workers/local-development/, last updated 2026-08-20; the page names no port, and 8787 is wrangler's default as the research notes say) beside two node servers on two ports with `TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_REALTIME_WORKER_URL=http://127.0.0.1:8787`, `TURBOSLIDE_ROOM_SECRET=<a test value>`, `TURBOSLIDE_STORE=tmp` over one shared overlay (REALTIME.md 5.4 item 1's two process recipe; R1's day 0 check that the tmp store takes two processes), A on the first port and B on the second, so the two instance rows read; W5's second mode adds `TURBOSLIDE_ACCOUNTS_URL` and the local D1. The object's unit rows run under `@cloudflare/vitest-plugin`. Ports follow REALTIME.md 5.1's rule (a check with `lsof -i`; never 4321, 4410 to 4419, 4441 to 4449, 4461 to 4469); the lanes take 4491 to 4497 with 8791 to 8797 for their Workers.
2. The hosted gate, one per round: the integrator deploys `turboslide-realtime-preview` and `turboslide-files-preview` once from the merged tree, and one Vercel preview with `-e TURBOSLIDE_REALTIME=do -e TURBOSLIDE_REALTIME_WORKER_URL=<preview worker> -e TURBOSLIDE_ACCOUNTS_URL=<preview worker> -e TURBOSLIDE_STORE_BACKEND=r2 -e TURBOSLIDE_PUBLIC_STORE_HOST=<preview files worker>` plus the enforce flags of REALTIME.md 5.4 item 2 and the secrets minted in the command, narrowed to the rows only a deployment can read (the access rules, the CDN, the `cost.*` rows, the `realtime.*` two browser rows, the `sync.*` rows on R2) plus the guard's seller path; a second deployment of the same tree with `-e TURBOSLIDE_REALTIME=blob` runs the fallback rows (`sync.*`, `collab.*`, `cost.*`). The caps are the account's and daily: the preview Worker and the production Worker share the Free plan's 100,000 requests and the objects' 100,000 rows written (section 6), so a hosted gate on the preview counts against production's day; the narrowed run of rule 1 is what keeps that safe, and the ledger records the dashboard's daily counters before and after.
3. The production guard: the push per lane, the Worker step, the three realtime rows on the seller path, the production table once after the last push (`--tier do`).

The acceptance rule stands as REALTIME.md 5.5 states it: every core row of every unparked feature green in the last run of each origin with zero retries; `realtime` unparkable; a `cost` row over its ceiling on the preview holds the ship; a core row red twice on production is a stop; every scratch deck removed by id.

## 10. The risks and what this note does not know

1. The daily caps are the account's and reset at 00:00 UTC; a passed cap fails closed for the rest of the day (section 6.4). A hosted gate against the preview Worker, a stranger on `workers.dev`, or a 200 twin deck viewed by a thousand browsers each spend production's budget. The mitigations are rule 1 of REALTIME.md 1.1, the Paid plan ($5), and the public read fallbacks of 6.3; a second Cloudflare account for the preview Worker would separate the caps and is an account creation.
2. Latency is unmeasured on every leg: browser to object over a socket (W1 section 5 found no first party figure), `iad1` to the Worker's internal API, `iad1` to R2 (W3 open), the object to Vercel's checkpoint route. The row `realtime.keystroke.within-300ms` on the preview is the first number; the four round R2 write multiplies the `iad1` to R2 leg by four per commit.
3. The Workers Free 10 ms CPU limit per invocation (W4 section 1) is unmeasured for the identity route, the auth callback and the files passthrough; the object's own CPU limit is 30 s per request (W1 section 2) and the reducer on a 25 MB deck runs there, not in the Worker.
4. A Worker isolate holds 128 MB shared by the objects in it (W1 section 2's in memory state page), and this design holds a deck's document in the object's memory, up to the 25 MB cap; a picture heavy deck's JSON parsed as objects may be several times its byte size. The preview measures a large deck; the mitigation is to hold the document as its serialized chunks and parse per admission, at a CPU cost.
5. R2: the single part etag as the body's md5 is unverified (W3 2.3 item 1; day 0); the AWS SDK's CRC32 default (item 2); the one write per second per key rule on `deck.json` when two Vercel instances commit within a second (item 3); the R2 checkout's payment requirement (W5 3.4), which may stop the store move at step 5 and leave the store on Vercel Blob, in which case sections 3.4, 4.3, 4.6 and 5.2 wait and everything else of the design stands (the object reads the three keys through Vercel Blob's fetch client instead of the binding, which T1 open 1 left unread).
6. The Cloudflare account: which address owns General Translation's, whether `kevin@generaltranslation.com` has a Cloudflare user, and the Sign in with Google creation rule (W1 6.3, W5 summary 2); `wrangler login` lands the Worker in whichever account signs in.
7. better-auth 1.7.4 over D1 has not run on this tree (W2 open 4 and 5): the adapter's private D1 dialect is selected only for a raw binding, so Turboslide's own Kysely needs `kysely-d1` 0.4.0 or an own dialect, and D1's binding of booleans and dates is unread. The proxy of `/api/auth/*` rests on h3's `Set-Cookie` relay as W2 read the code; a Vercel edge rewrite's behaviour is unknown (W2 open 6), which is why the route proxies at run time.
8. The ticket in a subprotocol: MDN states no size limit and Cloudflare's header limits were not read today; the first frame carrier is the fallback (2.2). The client address header the Worker should forward for the per address cap was not read today.
9. Two deploy surfaces: the Vercel deployment and the Worker version in service must agree on the protocol, the secret and the allowed origins; `helloTier`'s strict enum means deployment N must precede any `do` hello, and a tab older than N shows the reconnecting word until the page reloads (4.4). `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH` on a staged production target is unchanged (W4 5.4).
10. Version history granularity changes on this tier: a row covers a run of up to 30 s and a commit lands 10 s after the last keystroke instead of 2 s (3.1), while an agent write, a named version and a restore commit at once. Kevin decides whether the 2 s idle returns at the price of 6.1's rows written line (144 commits an hour against 24).
11. Wrangler environments: whether the `exports` block and the object namespace are per environment or shared was not stated on the page read today (4.2); the first `wrangler deploy --env preview` answers it. Whether `DROP TABLE` counts rows written (W1 open 1) decides the compaction shape at 500 hours.
12. The hibernation wake path rebuilds the tail and the document from local rows at the first op after a wake (3.2); its latency is unmeasured and the first keystroke after a pause of more than 10 s pays it.
13. The workers.dev hostname is "treated as a Free website and is intended for personal or hobby projects" (W5 3.5); production's realtime channel would run on one until Kevin moves a zone or lends one.
14. The sibling design A was not in the folder when this note was written; where A's channel differs (the ticket's carrier, the alarm cadence, the commit path), the synthesizer reconciles and this note's section 2 is the one to read against.
15. The e2e harness's second mode (4.7) and the Playwright run against a local Worker are unbuilt; a Worker that `wrangler dev` restarts under a run reads as a dropped socket, which the client's ladder covers and the run's ledger should name.
16. The `cost.*` ceilings of section 8 are the design's counts, not measurements; the preview's probe sets the ceilings the ship holds against.

## 11. Sources

Pages fetched by this note on 2026-10-01, with what each said:

- https://developers.cloudflare.com/workers/testing/vitest-integration/ (last updated 2026-08-20): the package `@cloudflare/vitest-plugin` "runs your Vitest tests inside the Workers runtime"; a migration note for users of `@cloudflare/vitest-pool-workers`.
- https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/ (last updated 2026-09-28): `runInDurableObject(stub, callback)` "Runs the provided callback inside the Durable Object that corresponds to the provided stub"; `runDurableObjectAlarm(stub)` "Immediately runs and removes the Durable Object pointed to by stub's alarm if one is scheduled"; `listDurableObjectIds`; `applyD1Migrations`.
- https://developers.cloudflare.com/workers/local-development/ (last updated 2026-08-20): "All resources your Worker is bound to in your Wrangler configuration are simulated locally" except AI bindings; "By default, bindings connect to local resource simulations"; `wrangler dev --remote` is legacy.
- https://developers.cloudflare.com/workers/configuration/secrets/ (last updated 2026-07-03): `wrangler secret put <KEY>` "creates a new version of the Worker and deploys it immediately", with no sentence on stdin; `wrangler secret bulk` takes "a path to a JSON or `.env` file", "up to 100 secrets per bulk request"; `.dev.vars` for local development; secrets "are not visible within Wrangler or Cloudflare dashboard after you define them".
- https://developers.cloudflare.com/workers/wrangler/commands/secret/ answered HTTP 404.
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-WebSocket-Protocol (no date on the page): "A comma-separated list of sub-protocol names, in the order of preference"; the response "must be the first sub-protocol that the server supports from the list provided in the request header"; no size or character limit stated.
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ (last updated 2026-04-23): `namespace_id`, `simple.limit`, `simple.period` of "10 or 60"; "local to the Cloudflare location that your Worker runs in"; "permissive, eventually consistent"; no plan or price sentence.
- https://developers.cloudflare.com/workers/wrangler/environments/ (last updated 2026-09-22): "Cloudflare effectively creates a new Worker with the name `<top-level-name>-<environment-name>`"; "Bindings and environment variables are non-inheritable, and must be specified per environment"; `wrangler deploy --env` and `wrangler secret put <KEY> --env`.

The nine notes of this folder (T1 to T4, W1 to W5) and the URLs they fetched on 2026-10-01, cited inline. The tree at `c978bb43`: `packages/realtime/src/{channel,select,protocol,memory,admission,coalesce,keys}.ts`, `packages/realtime/client/room-client.ts`, `packages/realtime/package.json`, `apps/studio/src/server/{room,checkpoint,access,write,headers,hosting-plugin,root}.ts`, `apps/studio/src/server/auth/{identity,db,better-auth,session,tokens,schema}.ts`, `apps/studio/src/routes/api/{decks.$deckId.stream,decks.$deckId.ops,decks.$deckId.presence,actions.$action,auth.$}.ts`, `apps/studio/src/editor/controller.tsx`, `apps/studio/vite.deploy.config.ts`, `packages/store/src/{select,blob-store,blob-vercel,migrate,pulse}.ts`, `packages/identity/src/principal.ts`, `scripts/hosting/realtime-env.mjs`, `playwright.config.ts`, `scripts/check.mjs`, `tsconfig.json`, `package.json`, `pnpm-workspace.yaml`; `docs/REALTIME.md`, `docs/SYNC.md` section 3 and 4.3, `docs/hosting.md` sections 9 and 11 and the variables table (working copy), `docs/FOCUS.md` 6.2 (working copy), `docs/gslides-parity/realtime/{research-options,research-hosting,research-costs-actual}.md`, `docs/gslides-parity/realtime/build/{r1,r2,r3,r4,r5,r6,google}.md` (headers). `git status`, `git diff --stat HEAD` and `ls docs/gslides-parity/cloudflare/` on 2026-10-01.
