# Studio session polling

Written 2026-09-14 against the working tree of `main` at `02e92c6` plus the uncommitted cadence
change described in section 1.3. This document records the poll storm of 2026-09-12 to 2026-09-15,
the fix that shipped, the remaining cost, a decision on hidden tabs, a design for replacing the
long poll with a push frame on the deck stream, and how to verify the invocation rate after a
deploy. Every claim names the file and line it comes from; where the code does not settle a
question the text says so.

The files read in full: `apps/studio/src/components/useStudioSession.ts` and its test,
`apps/studio/src/server/sessions.ts` and `sessions.server.ts`, `packages/agent/src/http/sessions.ts`,
`apps/studio/src/routes/api/decks.$deckId.stream.ts`, `packages/realtime/src/{channel,protocol,memory,redis,blob,select,keys}.ts`,
`packages/realtime/client/room-client.ts`, the parts of `apps/studio/src/server/{room,actions}.ts`,
`apps/studio/src/routes/mcp.ts`, `apps/studio/src/editor/{controller.tsx,shell-bridge.tsx,EditorRoot.tsx}`
and `packages/agent/src/window/{adapter,ready,registry}.ts` that touch sessions, and the
specifications named inline (`docs/spec/SPEC.md` 7.3 and 7.4, `docs/gslides-parity/SPEC-3.md` 3.3,
3.10, 8.2 and 11.3, `SPEC-4.md` 0.37, 0.42, 3.8 and 4.4, `SPEC-5.md` 0.49, `docs/hosting.md` 6, 9
and 11, `docs/security.md`).

## 1. The incident and the fix that shipped

### 1.1 What happened

Between 2026-09-12 and 2026-09-15 the server function behind `pollStudioSession` received about
3.95 million requests, 2.6 million of them on 2026-09-14 UTC, all from idle studio tabs on the
owner's own machines. The bill was about 25 dollars of Vercel function invocations, active CPU,
provisioned memory and observability events, which is a blended 6.3 dollars per million requests.

The cause is the session command bus. `createSessionRegistry` in
`packages/agent/src/http/sessions.ts` keeps its sessions in a `Map` inside one process (lines 5 to
6 and 144), and the studio holds one registry per function instance on `globalThis`
(`apps/studio/src/server/sessions.ts` lines 27 to 33). Fluid compute runs several instances, and a
tab's poll may land on any of them. Before the fix, `poll()` answered an unknown id with an empty
list at once, and the hook's loop issued the next poll with no delay, so a tab whose polls landed
on an instance that did not hold its session re-polled about 11.7 times a second (the hook's
comment at `useStudioSession.ts` lines 40 to 41, citing R04 7.3). At that rate one tab costs 42,120
invocations an hour; 2.6 million invocations in a day is the equivalent of about 2.6 tabs storming
for 24 hours. The verifier's day 0 run on production saw the loop bimodal, 3 or 465 `_serverFn`
responses a minute depending on which instance the poll reached
(`docs/gslides-parity/verification-4/BASELINE.md` lines 158 to 162, `VERIFICATION-4.md` line 110).

The WAF rule R1 (`firewall/rules.json` lines 12 to 21) limits `/_serverFn/` to 600 requests per
60 s per IP, which the storm exceeded, but the rules run in log mode (`docs/security.md` lines 80
to 87), so nothing was refused.

### 1.2 The two halves of the fix

Commit `43707c3` (live on production as `02e92c6`) changed both sides:

- Server half. `poll()` holds an unknown id for the caller's full `timeoutMs` before answering
  `[]` (`packages/agent/src/http/sessions.ts` lines 217 to 226). A poll that lands on the wrong
  instance now costs one call per timeout; before the fix it cost one call every few milliseconds.
  The registry test's detached poll still answers `[]`, after the timeout it names.
- Client half. The hook sleeps `EMPTY_ANSWER_PAUSE_MS` after an empty answer before the next poll
  (`useStudioSession.ts` lines 112 to 115). The 2 s retry after a thrown poll, `RETRY_MS` at line
  32, is unchanged.

The round four build note records the interim as 20 s hold plus 2 s pause
(`docs/gslides-parity/build-4/b4.md` section 1.7), and that is what `02e92c6` carries: `git show
HEAD:apps/studio/src/components/useStudioSession.ts` has `POLL_MS = 20_000` at line 26 and
`EMPTY_ANSWER_PAUSE_MS = 2_000` at line 37.

### 1.3 The cadence constants and the invariants the test pins

The working tree raises the cadence and adds a test. Both changes are uncommitted at the time of
writing (`git status` shows the hook modified and `useStudioSession.test.ts` untracked):

| Constant                     | File and line                                          | Value      |
| ---------------------------- | ------------------------------------------------------ | ---------- |
| `POLL_MS`                    | `apps/studio/src/components/useStudioSession.ts:31`    | 25,000     |
| `RETRY_MS`                   | `useStudioSession.ts:32`                               | 2,000      |
| `EMPTY_ANSWER_PAUSE_MS`      | `useStudioSession.ts:50`                               | 6,000      |
| `POLL_DEFAULT_MS`            | `apps/studio/src/server/sessions.ts:156`               | 20,000     |
| `POLL_MAX_MS`                | `apps/studio/src/server/sessions.ts:157`               | 25,000     |
| `DEFAULT_STALE_MS`           | `packages/agent/src/http/sessions.ts:88`               | 45,000     |
| `DEFAULT_COMMAND_TIMEOUT_MS` | `packages/agent/src/http/sessions.ts:89`               | 15,000     |
| `SESSION_BINDING_TTL_MS`     | `apps/studio/src/server/sessions.ts:48`                | 90,000     |
| Idle budget                  | `docs/gslides-parity/SPEC-4.md` 4.4 (lines 395 to 397) | 4 per 60 s |

The server clamps the caller's `timeoutMs` to `POLL_MAX_MS` in the poll validator
(`sessions.ts` line 249), so a hook value above 25 s would only be cut back; the test pins the
hook at or under the cap.

`apps/studio/src/components/useStudioSession.test.ts` pins three invariants:

1. Lines 23 to 27: the poll fits the idle budget with two of the editor's own calls in the
   window. Responses with period P land at most `floor(60 / P) + 1` times in any 60 s window, so
   with P = 31 s the poll lands at most twice, and two polls plus `OWN_CALLS` (2) is at most
   `IDLE_BUDGET` (4). VERIFICATION-4 finding 12 (line 226) is why the editor's own calls are
   budgeted: a loaded machine landed the inbox and comments reads after the check's 5 s settle and
   the node-server build made five calls a minute against a ceiling of four.
2. Lines 29 to 32: `POLL_MS` is at most `POLL_MAX_MS` (the literal 25,000 at line 17, because the
   server module does not export it), and `POLL_MS + EMPTY_ANSWER_PAUSE_MS` (31 s) is under
   `DEFAULT_STALE_MS` (45 s), so every cycle refreshes the session before the registry's sweep.
   The 31 s cycle is also inside the 90 s binding TTL of the directory row, which the poll handler
   touches on every call (`sessions.ts` line 252).
3. Lines 34 to 36: `EMPTY_ANSWER_PAUSE_MS` is under `DEFAULT_COMMAND_TIMEOUT_MS`, so a command
   queued during the pause (`request()` pushes it at `packages/agent/src/http/sessions.ts` line 284) is picked up by the next poll before the issuer's 15 s timer fires (lines 267 to 276).

The e2e counterpart is `apps/studio/e2e/window-api.spec.ts` lines 365 to 400: an idle editor over
60 s makes at most one stream connection and at most four `_serverFn` responses, with gaps over
1.5 s between them. `scripts/perf-budget.mjs` asserts the same budget against a deployment (line
194, the idle check at lines 1146 to 1186).

Two comments are now stale and should be corrected when the change is committed: the hook's
module comment says the server sweeps after 45 s but the directory comment at
`apps/studio/src/server/sessions.ts` line 47 still says "the poll is 20 s", and
`packages/agent/src/http/sessions.ts` line 83 says the same.

### 1.4 What one idle tab costs at each cadence

Each poll is one function invocation held for the poll's duration. Per idle tab:

| Cadence                          | Cycle             | Polls per minute | Polls per hour | Dollars per hour at 6.3 per million |
| -------------------------------- | ----------------- | ---------------- | -------------- | ----------------------------------- |
| Before `43707c3`, wrong instance | about 85 ms       | 702              | 42,120         | 0.27                                |
| `02e92c6` (production now)       | 20 s + 2 s = 22 s | 2.7              | 164            | 0.0010                              |
| Working tree                     | 25 s + 6 s = 31 s | 1.9              | 116            | 0.0007                              |

The arithmetic: 3,600 / 22 = 163.6 and 3,600 / 31 = 116.1. The measured minute rate went from 465
to 3 (`VERIFICATION-4.md` line 110), a factor of 155; the working tree cadence takes it to under 2 a
minute. An always open tab at the working tree cadence costs about 1.8 cents a day.

The dollar column uses the blended figure of section 1.1 and is an upper estimate for held polls:
Fluid compute bills active CPU and provisioned memory, and a held poll spends most of its 25 s
waiting.

### 1.5 What the poll path cannot explain

The task's figure of about 2,600 invocations an hour across a few tabs does not reconcile with the
poll alone: at 164 an hour it needs 16 tabs, at 116 an hour 22 tabs. Three other sources are on
the same function and should be read from the grouped metric of section 4 before the poll is
tuned further:

- The presence heartbeat. The room client posts presence every `PRESENCE_HEARTBEAT_MS` (5 s,
  `packages/realtime/src/protocol.ts` line 54) whenever it is connected
  (`packages/realtime/client/room-client.ts` lines 866 to 873, started unconditionally at line
  921), through `POST /api/decks/<id>/presence` (`apps/studio/src/editor/controller.tsx` lines 349
  to 356). That route runs on the catch all function (SPEC-3 3.3, line 219), so a connected editor
  tab makes 720 invocations an hour on it. Three editor tabs make 2,160 an hour on presence and 348
  on polls, which is about the figure quoted. Only the editor route holds a room client
  (`controller.tsx` line 1350); `/deck` and `/present` do not. Browsers throttle chained timers in
  a hidden tab to about once a minute after five minutes, so a hidden editor tab posts far less
  than a visible idle one. This is outside the poll's scope but it is the likely bulk of the
  remaining cost.
- The error retry. A poll that throws (a 5xx during a deploy, a rate limit in enforce mode) is
  retried after `RETRY_MS`, 2 s, with no backoff and no cap (`useStudioSession.ts` lines 107 to
  110). A persistent error costs 1,800 invocations an hour per tab, and the cadence test does not
  pin this path. A capped exponential backoff (2 s doubling to 60 s) is a one line change the test
  should pin.
- The stream reconnects. The stream closes at a random point between 240 and 290 s
  (`protocol.ts` line 47) and the browser reconnects after 1 to 4 s (line 49), so each editor tab
  opens 12 to 15 streams an hour, each one invocation held for its lifetime.

## 2. The hidden tab policy

### 2.1 Whether a hidden tab must remain drivable

The question is whether the contract binds a studio session to a visible page, or whether the
MCP attach flow assumes any open tab answers. The files answer as follows.

- The window API contract (`docs/spec/SPEC.md` 7.4, lines 1158 to 1160, and
  `packages/agent/src/window/registry.ts` lines 4, 127 and 220) resolves the active owner from
  element state: connected and not under `[inert]`, `[hidden]`, `[aria-hidden="true"]` or
  `[data-active="false"]`. It never reads `document.visibilityState`. A hidden tab therefore has
  an active owner, `activeStudio()` (`packages/agent/src/window/ready.ts` lines 17 to 23) returns
  it, and `view.goto` runs there without a paint.
- The MCP contract (`docs/spec/SPEC.md` 7.3; `packages/agent/src/generate/manifest.ts` line 66;
  `packages/mcp/src/http.ts` lines 5 to 7; `docs/gslides-parity/SPEC-3.md` 3.10, the `/mcp` row at
  line 329) says `deck_goto_slide` is listed "when a studio page (/edit or /deck) is attached to
  the deck and runs in that page". Attached means registered and polling; no text requires the
  page to be visible.
- The dispatch picks the most recently seen page on the deck that offers the action
  (`packages/agent/src/http/sessions.ts` lines 200 to 212, sorted by `lastSeenAt`;
  `apps/studio/src/server/actions.ts` lines 706 to 716). Visibility plays no part; with several
  tabs polling at the same cadence, which one answers is effectively random.
- The only rule about a page that is not shown says it must not attach. SPEC-4 0.42
  (`SPEC-4.md` line 62) gates the session attach and the stream of a prerendered `/new` on
  `document.prerendering`, and `apps/studio/src/editor/shell-bridge.tsx` lines 76 to 82 implement
  it with the comment "a prerendered /new attaches once shown, never while hidden" (`useShown` at
  lines 50 to 57). The embed frame registers an owner but never attaches (`DeckViewer.tsx` lines
  343 to 345 and 365).
- The end to end drive (`apps/cli/e2e/mcp-http.mjs` lines 383 to 425) opens a headless Playwright
  page, which reports itself visible, waits until `/api/agent` lists the session, then drives it.
  It does not depend on a hidden tab answering.

Conclusion: no file binds a session to a visible page, and no file requires a hidden tab to
answer. The one existing visibility rule (a page not shown does not attach) points the other way.
The contract therefore permits hidden tabs to stop polling. The consequence is user visible and
must be accepted knowingly: an agent that targets a deck whose only open tab is in the background
gets the 404 of `actions.ts` lines 709 to 712, "No studio page is attached to deck X; open /deck/X
or /edit/X", until the tab is foregrounded.

### 2.2 Option a: stop polling while hidden

The hook stops issuing polls while `document.visibilityState` is `'hidden'`, lets the registry
sweep the session, and re-attaches on `visibilitychange` back to `'visible'`.

What an agent sees when it targets a hidden tab. Until the sweep at `DEFAULT_STALE_MS` (45 s
after the last poll), the session is still listed, so `request()` queues the command
(`sessions.ts` line 284) and the issuer's 15 s timer fires: a 504 "the studio session did not
answer view.goto within 15000 ms" (lines 267 to 276). When the sweep drops the entry, any waiter
still pending is rejected with "the studio session detached before it answered" (line 156). After
the sweep, `attached()` returns undefined and `view.goto` answers the 404 above; on `/mcp`,
`deck_goto_slide` is not listed at initialize (`apps/studio/src/routes/mcp.ts` line 29;
`actions.ts` lines 978 to 979), and `/api/agent` omits the page from `sessions`
(`apps/studio/src/routes/api/agent.ts` line 81). An MCP client that initialized while the tab was
visible keeps the tool listed and receives the 404 on call, which is what happens today when a
tab closes.

A refinement removes the 45 s of 504s: on hidden, the hook calls `detachStudioSession` (already
used in the cleanup at `useStudioSession.ts` line 148) so the registry and the directory drop the
page at once, and the agent gets the honest 404 immediately. A short grace (let the poll in
flight finish, then detach if still hidden after about 10 s) avoids churn on a quick tab switch.

How long re-attach takes. One `attachStudioSession` round trip on `visibilitychange`. The hook's
`attach()` (lines 79 to 91) sends the session id it holds (line 88); the registry recreates the
entry under the same id (`packages/agent/src/http/sessions.ts` lines 162 to 181) and the directory
replaces the row (`apps/studio/src/server/sessions.ts` lines 86 to 96). The first poll follows at
once, so the page answers commands within one round trip plus the time to the first poll, well
under a second on the hosted deployment.

What happens to a command queued during the gap. If the session was detached or swept, `request()`
rejects at once with a `RangeError` (lines 261 to 264) and nothing is queued; the agent gets a 404
and retries when the tab is visible. If the session is still attached and not polling, the
command sits in the queue until the 15 s timeout, then the 504. Nothing is delivered late, which
is the right outcome for a navigation command.

Cost: zero polls per hidden tab. A visible tab keeps the 116 an hour of section 1.4.

### 2.3 Option b: keep polling hidden tabs at a longer cadence

The hook polls a hidden tab with a longer pause and the registry keeps hidden sessions longer.
The numbers show why this does not work well.

- A pause of 60 s after the 25 s hold gives an 85 s cycle, 42 polls an hour per hidden tab (a 64
  percent saving). The sweep for hidden sessions must exceed 85 s, say 120 s, and the binding TTL
  must grow with it, say 240 s. But `DEFAULT_COMMAND_TIMEOUT_MS` is 15 s, so a command that
  arrives in the 60 s pause times out with a 504 before the tab polls; 60 of every 85 s are pause,
  so about 70 percent of commands to a hidden tab fail. Raising the command timeout to cover the
  pause makes an agent wait up to 85 s for `view.goto`.
- The largest pause that keeps commands deliverable is under 15 s. A 14 s pause gives a 39 s
  cycle, 92 polls an hour, a saving of 21 percent over the visible cadence, with the sweep and the
  TTL unchanged.

Option b therefore either saves little or breaks delivery to hidden tabs, and it needs a `hidden`
flag in the poll input (`sessions.ts` validator at lines 243 to 250), a per session stale time in
the registry (`fresh()` at `packages/agent/src/http/sessions.ts` line 148, the sweep at lines 288
to 296) and a `hidden` field with its own TTL on the directory rows (`fresh` at
`apps/studio/src/server/sessions.ts` lines 75 to 76, `SESSION_BINDING_TTL_MS` at line 48).

### 2.4 Recommendation

Adopt option a with the detach refinement. The rule: if the contract does not require hidden tabs
to answer, hidden tabs should not poll at all. Section 2.1 shows the contract does not require it
and that the one existing visibility rule already says a page not shown does not attach.

The exact change, not made here:

1. `apps/studio/src/components/useStudioSession.ts`: register a `visibilitychange` listener
   beside the `READY_EVENT` listener at line 102 and remove it in the cleanup at line 146. In the
   loop at lines 103 to 140, before the `pollStudioSession` call at line 106, gate on visibility:
   when `document.visibilityState === 'hidden'`, wait for the poll in flight, call
   `detachStudioSession({ id: sessionId })` after the grace, then await the next `'visible'`
   event, call the existing `attach(studio)` (lines 79 to 91) and continue. A prerendered page is
   already excluded by `SessionBridge` (`shell-bridge.tsx` lines 76 to 82); the gate should treat
   `document.prerendering` the same way for the `/deck` and `/present` mounts (`DeckViewer.tsx`
   line 365, `PresenterPage.tsx` line 165), which have no such gate today.
2. `apps/studio/src/components/useStudioSession.test.ts`: extract the visibility gate into a pure
   function so the test can drive it with a fake document, and pin that a hidden document issues
   no poll, that a detach is issued once, and that a return to visible issues exactly one attach
   before the next poll. Pin the error backoff of section 1.5 in the same file.
3. The registry's sweep (`packages/agent/src/http/sessions.ts` lines 288 to 296) and
   `DEFAULT_STALE_MS` stay as they are. Option a needs no server change.
4. `docs/gslides-parity/SPEC-4.md` 3.8 and the manifest sentence at
   `packages/agent/src/generate/manifest.ts` line 66 should say that a page attaches while it is
   visible, so the 404 for a background tab is documented behaviour.

## 3. Replacing the long poll with a push channel

### 3.1 What exists today

- One SSE stream per deck per tab on every tier: `GET /api/decks/:id/stream`
  (`apps/studio/src/routes/api/decks.$deckId.stream.ts`), opened by the editor's room client
  (`controller.tsx` lines 297 to 358, `EventSource` at line 319, the client created at line 1350).
  The route authorizes the reader (line 61), takes a stream counter slot (line 64), binds a server
  issued client id to the request's identity (line 72, `bindClient` at `room.ts` lines 1450 to
  1454), writes `hello` and the replay, then forwards every channel event through
  `filterEventForReader` (lines 128 to 137). It runs on the catch all function and never on
  `/_serverFn` (lines 34 to 35).
- Three channel tiers behind one interface (`packages/realtime/src/channel.ts` lines 229 to 272;
  `select.ts` lines 1 to 12; `docs/hosting.md` section 9, the table at lines 599 to 604). On
  `redis`, `publish` is a `PUBLISH` on `deck:<id>:events` and every instance with an open stream
  holds one subscription per deck (`redis.ts` lines 272 to 274 and 309 to 349), so an event
  reaches every instance. On `blob`, `publish` delivers to this process only (`blob.ts` lines 265
  to 267 over `memory.ts` lines 127 to 129) and the header says presence, locks, budgets and flags
  are per instance (lines 6 to 8). On `memory` there is one process.
- A cross instance session directory, on Redis only: `redisSessionDirectory` stores the binding
  rows as one JSON value under `sessions:studio` with a TTL of twice the binding TTL
  (`apps/studio/src/server/sessions.ts` lines 131 to 148), built from the room's Redis connection
  (`sessions.server.ts` lines 18 to 26, `redisCommands()` at `room.ts` lines 159 to 162). The rows
  carry `id`, `deckId`, `owner`, `identity`, `kind`, `attachedAt` and `lastSeenAt` (lines 50 to
  60). They do not carry the page's `actions` or `state`. On the other tiers the directory is in
  memory (`sessions.server.ts` line 23).
- A per instance command bus: the registry's queue and poller per entry
  (`packages/agent/src/http/sessions.ts` lines 123 to 129), which the directory comment names as
  a known limit: "The command bus above stays in process: a long poll is answered by the instance
  holding it, so a command for a page reaches the instance the page polls"
  (`apps/studio/src/server/sessions.ts` lines 36 to 43). SPEC-3 11.3 (line 1000) and 3.10 (line 329) planned the registry's move to Redis "so a poll and a command meet whichever instance holds
  them"; the directory shipped, the bus did not.
- The correctness gap today: `view.goto` calls `studioSessions().attached(deckId, 'view.goto')`
  on the instance serving the request (`actions.ts` line 708), and the MCP tool list is bound at
  initialize on the instance serving that request (`mcp.ts` line 29; `actions.ts` lines 978 to
  979). A command reaches a page only if the request lands on the instance the page last polled;
  otherwise the agent sees the 404 although a page is attached. The hosted test
  (`apps/cli/e2e/mcp-http.mjs`) passes when the requests happen to co-locate.

### 3.2 The transport

The stream is the right carrier and the design below needs no new connection. Two facts settle the
WebSocket question:

- Vercel Functions accept WebSocket connections in public beta (announced 2026-06-22; see
  https://vercel.com/docs/functions/websockets and
  https://vercel.com/changelog/websocket-support-is-now-in-public-beta). They require Fluid
  compute, a connection is pinned to one function instance for its lifetime, there is no built in
  way to broadcast to connections held by other instances, and the default duration cap is five
  minutes (thirty in beta on Pro and Enterprise). A WebSocket therefore has the same shape as the
  SSE stream for this problem: one instance holds the tab's connection, and reaching it from
  another instance still needs Redis.
- The repository's own record predates the beta and should be updated: `SPEC-5.md` line 631 says
  the WebSocket transport is "ignored on Vercel functions because functions do not upgrade",
  `SPEC-3.md` section 17 (line 1244) defers `TURBOSLIDE_REALTIME_WS`, `docs/security.md` line 86
  keeps WAF rule R19 (the upgrade) inactive, and `docs/hosting.md` names no WebSocket flag.

The design is transport neutral: the command frame is a room event, and a WebSocket transport, if
it ships behind `TURBOSLIDE_REALTIME_WS`, carries the same frame.

### 3.3 The command bus in Redis

The bus moves next to the directory, keyed by session id, on the same `RedisCommands` connection
(`room.ts` line 160; the interface at `redis.ts` lines 36 to 45 offers `call` and `subscribe`; the
directory's `Kv` type at `sessions.ts` line 73 names `call` only and would widen).

- `session:<id>:q`: the pending commands of a session as one JSON list, written with `PX` equal
  to `DEFAULT_COMMAND_TIMEOUT_MS` (15 s) so a command nobody fetched expires with its issuer's
  timer. Keys start with a fixed prefix and a UUID, in the shape `keys.ts` requires (no user text
  in a key).
- `session:cmd:<commandId>`: the answer, written by whichever instance receives the answer POST,
  `PX` 30 s, `SET NX` so a second answer for the same command is ignored.
- `sessions:bus`: one pub/sub channel per deployment, one subscription per instance (as the deck
  channel does at `redis.ts` lines 309 to 349), carrying `{ t: 'answer', commandId }` so the
  issuing instance resolves its waiter without polling Redis.

`request()` (`packages/agent/src/http/sessions.ts` lines 260 to 287) writes the command to the
queue, publishes the frame of section 3.4 on the deck channel, and awaits the answer through the
bus with its existing 15 s timer; before rejecting on timeout it reads `session:cmd:<commandId>`
once, so a lost `PUBLISH` of the answer does not lose an answer that was written. `poll()` (lines
216 to 247) drains the Redis queue first and answers at once when it holds anything; otherwise it
holds as today. `answer()` (lines 248 to 259) resolves the local waiter when there is one and
otherwise writes the answer key and publishes on `sessions:bus`. The registry keeps its in memory
behaviour when no bus is injected, which is the memory tier and every existing test.

Blob tier. `publish` is process local and the directory is in memory, so neither the frame nor the
queue crosses instances. The push path then works only when the tab's stream and the agent's
request land on the same instance, which is the situation today, and the poll fallback of section
3.7 covers the rest. Cross instance command delivery requires Redis. This is consistent with
`docs/hosting.md` section 9's rule that Redis must never hold the only copy of anything: a command
is short lived by construction and its loss is reported to the issuer.

### 3.4 The command frame on the deck stream

A new room event, `{ type: 'command', sessionId, command: { id, action, input, issuedAt } }`,
published with `room.channel.publish(deckId, event)` (`channel.ts` line 253). It rides the existing
stream on the redis tier through `publishWire` and the subscriber's `roomEventSchema` check
(`redis.ts` lines 266 to 269), which means the type must be added to the strict discriminated
union at `protocol.ts` lines 258 to 294 and to `RoomEvent` at `channel.ts` lines 164 to 192
before it can be published at all; an unknown type is dropped by the subscriber and by the
browser's `roomEventOf` (`protocol.ts` lines 365 to 375), so an old client ignores the frame.

Delivered only to the tab whose session it names. `filterEventForReader` (`room.ts` lines 1290 to 1320) is the per stream gate, and the `inbox` case (lines 1314 to 1316) is the precedent: a frame
carrying a `principalId` reaches that principal's connections only. The `command` case forwards
the frame when the session named belongs to the reader's identity, which is the directory row's
`identity` (`sessions.ts` line 55) compared with the stream's `identity.identity` (the stream
route line 50; for a browser the identity equals the principal id, `room.ts` line 253, and
`ViewerFacts.principalId` at line 1247 already carries it). The lookup is one `forIdentity` read
per command frame per stream, at the command rate. A tab of the same identity that does not hold
the session ignores the frame by id, so nothing leaks beyond one person's own tabs. The `default`
branch at lines 1317 to 1318 forwards every unrecognised type to every reader, so the `command`
case must land in the same change as the type, otherwise every tab on the deck receives every
command frame.

The frame carries no `id:` line, so a reconnect with `Last-Event-ID` never replays it (`replayFor`
replays admitted entries only, line 120 of the stream route). The command is not in the ops stream
and is not persisted anywhere but the 15 s queue key.

### 3.5 The acknowledgement path

The tab keeps the answer POST it already makes: `answerStudioSession` (`sessions.ts` lines 264 to 305) after `activeStudio().invoke(action, input)` (`useStudioSession.ts` lines 117 to 138). The
POST lands on any instance; that instance's `answer()` resolves a local waiter when the issuing
instance is itself, and otherwise writes `session:cmd:<commandId>` and publishes on `sessions:bus`
(section 3.3). The issuing instance resolves the agent's request with the page's view state, or
rejects it with the page's error mapped by `transportError` (`packages/agent/src/http/sessions.ts`
lines 107 to 115), as today.

### 3.6 The delivery guarantee, stated honestly

On the redis tier a command reaches the page whenever the page has an open stream or polls within
15 s of the issue, on any instance, because the frame reaches every instance holding a stream for
the deck and the queue is readable from every instance. The failure modes that remain:

- Redis pub/sub is fire and forget (`redis.ts` line 226). A frame lost in transit is not
  redelivered; the queue still holds the command for a poll, and the fallback poll of section 3.7
  or the drain on reconnect catches it if either happens inside the 15 s. Otherwise the issuer
  gets the 504 it gets today, and the tab never runs the command late.
- The stream closes every 240 to 290 s and the browser reconnects after 1 to 4 s (`protocol.ts`
  lines 47 to 49). A frame published in that gap is lost as above. The client should issue one
  poll on every `hello` (the room client's `hello` case at `room-client.ts` lines 607 to 638 is
  where the controller learns of a reconnect), which drains the queue at once; that is 12 to 15
  extra calls an hour per tab.
- Redis unreachable. The channel logs `redis.unavailable` and the tabs fall to blob behaviour
  (`docs/hosting.md` lines 640 to 643); the bus does the same, and delivery is per instance until
  Redis returns.
- The blob and memory tiers make no cross instance promise (section 3.3).

The stream route holds the frame's fan out and the queue holds the command, so at no point does a
command exist only in one instance's memory on the redis tier, which is the property the poll never
had.

### 3.7 The fallback when no stream is open

`/deck` and `/present` hold no stream today (`createRoomClient` is called only from the editor,
`controller.tsx` line 1350), and an editor tab is without a stream during reconnects and while
offline. In every such case the hook polls at the current cadence, 25 s hold and 6 s pause, and
`poll()` drains the Redis queue first, so the poll is now correct on every instance. While a stream
is connected (`SyncStatus.transport === 'sse'` and
`connected`, `room-client.ts` lines 110 to 125), the hook drops to one poll per 60 s as the
heartbeat that keeps the directory row inside its 90 s TTL (`touch` at `sessions.ts` line 252),
which is 60 invocations an hour per editor tab, and none for a hidden tab under section 2. A
second step moves the heartbeat onto the stream: the tab passes its session id on the stream URL
once it has one, and the route touches the row at open and on its 60 s authorize recheck
(`AUTHORIZE_RECHECK_MS`, stream route lines 38 and 151), after which a connected tab makes no
server function calls while idle. The stream opens before the session attaches (the room client
starts with the controller, the hook waits on `whenStudioReady`), so the first open carries no id
and the id rides the next reconnect.

### 3.8 Ordering and duplicates

- Per session, commands are appended to the queue and published in issue order on one Redis
  connection per issuing instance. Two agents on two instances may interleave; the page runs
  commands in arrival order and every answer is keyed by command id, which is the behaviour of the
  per instance FIFO today (`packages/agent/src/http/sessions.ts` line 284) and is harmless for
  `view.goto`, where the last command wins.
- A command may arrive twice: once as a frame and once from a poll that drained the queue before
  the answer landed. The hook keeps a bounded set of recent command ids and runs each id once. On
  the server, the second answer finds no waiter and `SET NX` refuses a second answer key, so
  `answer()` returns false as it does now for an unknown command (lines 252 to 253).
- A poll that drains the queue drops any command whose answer key already exists.
- Nothing is ever replayed from the stream (section 3.4).

### 3.9 Security

- The binding rows and the identity check at attach stay as they are: `attachFn` derives the
  identity from the request (`sessions.ts` lines 212 to 224), the directory caps pages per
  identity and per deck (lines 45 to 46 and 86 to 96), and the row's identity is what the stream
  filter of section 3.4 compares against.
- The frame carries no secret: the session id (a UUID the tab already holds and the client already
  sends, validated at line 207), the command id, the action id and its input. It is forwarded only
  to streams of the identity that bound the session; the stream itself already passed
  `authorize(read)` at open and every 60 s.
- Two checks that do not exist today should land with the bus. `answerFn` and `pollFn` accept any
  caller who knows the session id (lines 243 to 260 and 264 to 305); the bus should refuse an
  answer or a poll whose request identity differs from the row's identity, since the row is now
  readable from every instance. And the registry's principal scoping (`attached(deckId, action,
principalId)`, `packages/agent/src/http/sessions.ts` lines 58 to 65) is unused: `attachFn` passes
  `rest` without `principalId` (line 215) and `registerViewActions` calls `attached` without one
  (`actions.ts` line 708), so SPEC-3 8.2's rule that "commands go to pages of the agent owner's
  identity" (line 668) is not enforced. The push design should not widen this; a command issued by
  an API key should target pages bound to the key owner's identity, which the directory rows make
  possible.
- The frame's `input` is bounded by the existing 1 MB action body cap upstream; the queue value
  should be capped at 64 KB to keep the Redis table small.

### 3.10 Migration steps, in order

1. `packages/realtime/src/channel.ts` (the `RoomEvent` union, lines 164 to 192) and
   `packages/realtime/src/protocol.ts` (`roomEventSchema`, lines 258 to 294): add the `command`
   event as a strict object with a capped `input`. Tests: `protocol.test.ts` parses and rejects
   it; `redis.test.ts` over `redis-fake.ts` delivers it through `publish` and `subscribe`.
2. `apps/studio/src/server/room.ts`: the `command` case in `filterEventForReader` (before line
   1317), with the session lookup injected so the function stays pure; `ViewerFacts` (lines 1240
   to 1248) gains the identity string if `principalId` is not enough for the agent case. Test in
   the room's filter tests: a reader of another identity gets null, the owner gets the frame, a
   viewer role gets it too since `view.goto` is a viewer action.
3. `packages/agent/src/http/sessions.ts`: a `SessionBus` seam in `SessionRegistryOptions` (line 82) with `enqueue`, `drain`, `putAnswer`, `awaitAnswer` and `publish`; `request()` (lines 260
   to 287) publishes and awaits through it, and accepts a session the directory knows but this
   registry does not (the `entries.get` check at line 261 must not refuse a foreign id when a bus
   is present); `poll()` (lines 216 to 247) drains first; `answer()` (lines 248 to 259) writes
   through the bus when no waiter is local. The in memory default keeps every existing test green.
4. `apps/studio/src/server/sessions.server.ts`: build the Redis bus from `redisCommands()` beside
   the directory (lines 18 to 26), memory elsewhere; add `actions` to the directory row
   (`sessions.ts` lines 50 to 60) so `attached(deckId, 'view.goto')` can read the directory,
   which every instance shares.
5. `apps/studio/src/server/sessions.ts`: `studioSessions()` (lines 29 to 33) constructs the
   registry with the bus; `answerFn` and `pollFn` gain the identity check of section 3.9; `attachFn`
   passes the identity as `principalId` (line 215).
6. `apps/studio/src/server/actions.ts`: `registerViewActions` (lines 706 to 716) and the
   `withView` check (lines 978 to 979) read attachment from the directory, so `deck_goto_slide` is
   listed and dispatched on every instance; `apps/studio/src/routes/mcp.ts` line 29 and
   `apps/studio/src/routes/api/agent.ts` line 81 follow without change.
7. Client: `apps/studio/src/editor/controller.tsx` adds `'command'` to `EVENTS` (lines 299 to
   310); `packages/realtime/client/room-client.ts` passes the event to `options.onEvent` as it
   does for `inbox` and `access` (lines 693 to 696) and issues the drain poll on `hello`;
   `apps/studio/src/components/useStudioSession.ts` receives frames (a window event the controller
   dispatches, or a subscription handed through `SessionBridge` at `shell-bridge.tsx` lines 76 to
   82), dedupes by id, runs them through the existing invoke and answer code (lines 116 to 139),
   and lengthens the poll to the heartbeat while the stream is connected (section 3.7).
8. Documents: `docs/hosting.md` section 9 lists the two new key prefixes and the bus channel;
   `docs/gslides-parity/SPEC-4.md` 3.8 and this document record the cadence; `SPEC-5.md` line 631
   and `SPEC-3.md` section 17 are corrected for the WebSocket beta.
9. Ship behind the `realtime` kill switch (`packages/realtime/src/keys.ts` lines 32 to 45): when
   `realtime` reads as off the bus is memory and the poll carries every command, which is today's
   behaviour.

### 3.11 Tests

- The two instance test, in `packages/agent/src/http/sessions.test.ts` beside the tests at lines 6
  to 120: two `createSessionRegistry({ bus })` over one shared bus. First over a memory bus built on
  `memoryChannel()` (`memory.ts` lines 119 to 129 give `subscribe` and `publish` in one process,
  which stands in for two instances sharing Redis), then over `redisChannel(fakeRedis())`
  (`redis-fake.ts` handles `PUBLISH` at line 478 and `subscribe` at line 544). Cases: registry A
  issues `request(sessionId)` for a session attached on registry B; the frame reaches B's
  subscriber; the tab answers through B; A's request resolves with the result. Then the lost
  frame: `redis-fake.ts` line 17 offers `dropPublish`; drop the command frame and assert that B's
  `poll()` drains the queue and the answer still resolves A; drop the answer publish and assert
  that A's final read of the answer key resolves it before the timeout. Then duplicates: deliver
  the frame and drain the queue for the same command and assert one invoke and one accepted
  answer. Then the blob tier: over `blobChannel` with two registries, assert the request times out
  with the 504 and that the poll on the issuing instance still delivers, which documents the
  limit.
- The studio tests: `apps/studio/src/server/sessions.test.ts` (lines 80 to 90) gains the identity
  check on answer and poll; the room filter tests gain the `command` case.
- The e2e: `apps/studio/e2e/window-api.spec.ts` keeps its idle budget (lines 365 to 400); a new
  spec aborts the poll route with `page.route` and drives `view.goto` over `/api/actions`,
  asserting the page moved within 2 s, which proves the push path on the memory tier;
  `apps/cli/e2e/mcp-http.mjs` (lines 383 to 425) keeps proving the MCP drive end to end.
- The hosted smoke row. `scripts/hosted-smoke.mjs` is HTTP only (no browser; the rows are `GET`
  probes with a `pass(r)` predicate, lines 340 to 460). Two rows: with no page attached, `POST
/api/actions/view.goto?deck=<deck>` with the bearer must answer 404 and the body must name "No
  studio page is attached", which proves the dispatch path on whichever instance answers; and a
  `--browser` mode that opens `/deck/<deck>` with Playwright the way `mcp-http.mjs` does, waits
  until `/api/agent` lists the session (as at `mcp-http.mjs` lines 395 to 403), then issues
  `view.goto` ten times and asserts every call moved the page within 2 s. Fluid routing is not
  controllable from outside, so the row reports how many of the ten calls were served over the
  frame and how many over the poll (the hook can expose the count on `describe().state`), and the
  row passes only when all ten moved the page. Ten calls across a deployment with more than one
  instance make it very likely that at least one crossed instances.

## 4. Verification after deploy

### 4.1 The command

```
vercel metrics vercel.function_invocation.count --project turboslide --scope kl01s-projects \
  --since 24h --granularity 1h --group-by request_path
```

The metric's dimensions include `request_path`, `route`, `path_type`, `http_status`,
`deployment_id`, `environment` and `function_start_type` (`vercel metrics schema
vercel.function_invocation.count`, read only). Two flags matter for reading it:

- `--limit` is 10 groups per time bucket by default, and a deployment has many paths, so either
  raise it (`--limit 50`) or filter to the poll path once its id is known: `-f "request_path eq
'/_serverFn/<id>'"`. Add `--prod` to exclude preview deployments.
- `--group-by route` would show `/_serverFn/[...]` as one row for every server function;
  `request_path` separates them by id.

The command reads and changes nothing. This document does not depend on it having been run.

### 4.2 Finding the poll path

Server functions are posted to `/_serverFn/<id>` where `<id>` is a 64 character hex string. Do not
hard code it; find the current one in one of two ways.

From the built output. The server chunk for `apps/studio/src/server/sessions.ts` is
`.vercel/output/functions/_serverFn/[...].func/_ssr/sessions-<hash>.mjs` (the same file also sits
under `__server.func`). Each `createServerFn` there ends in `.handler(createSsrRpc("<id>"))`, in
source order: attach, poll, answer, detach. The poll's is the one whose preceding validator clamps
the timeout, `Math.min(POLL_MAX_MS, Math.max(0, timeoutMs))`. The client chunk
`static/assets/useStudioSession-<hash>.js` carries the same four ids as strings, and the client
posts to `/_serverFn/` followed by the id (the fetch helper in `static/assets/index-<hash>.js`
builds the URL that way). In the two local builds of 2026-09-14 (15:27 and 17:47, with different
chunk hashes) the poll id was identical,
`bf5e8df0252e4b3589308a538d455995a3bd443677567cc93eaf3a661a05479c`, so the id is stable while the
file keeps its path and the function keeps its name. A rename or a move changes it, which is why
the id must be looked up at verification time.

From a network log. In the browser's network panel filtered on `_serverFn`, the poll is the POST
that recurs every 31 s (22 s on `02e92c6`), takes about 25 s to answer, and whose request payload
contains `"timeoutMs":25000`. Its URL is the path.

### 4.3 Reading the output and the target

Read the poll path's row per hour. The expected rate is 116 an hour per polling tab at the working
tree cadence and 164 on `02e92c6` (section 1.4). The target of about 200 an hour with two or three
tabs open is met under one of two conditions: at most one of the tabs polls, which is what the
hidden tab rule of section 2.4 produces when one tab per machine is in front; or the push design of
section 3 has turned the poll into a 60 s heartbeat, at which point three connected tabs make 180
an hour and a connected hidden tab none. With all three tabs polling at the current cadence the
row reads about 350 an hour, which is correct behaviour for the cadence and a sign that the hidden
tab rule has not shipped.

Read three more rows in the same output before drawing a conclusion about the poll:
`/api/decks/<id>/presence` (720 an hour per connected editor tab, section 1.5),
`/api/decks/<id>/stream` (12 to 15 an hour per editor tab), and the poll path grouped by
`http_status` (`--group-by http_status` with the path filter), where any 5xx count at all means
the 2 s error retry of section 1.5 is running and should be backed off.

A regression of the storm shows as the poll path at hundreds of thousands an hour; the fixed cadence
shows as a flat line of a few hundred; the target state shows as a flat line under 200 with the
presence path as the largest remaining row until it, too, is addressed.
