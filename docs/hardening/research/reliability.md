# Hardening research: reliability

Key `reliability`. Port 4835. Written 2026-10-08 against the worktree
`/Users/kevinliu/repos/Turboslide-harden` at `0d3920a3`. Research only: nothing was committed,
pushed or deployed, and no Vercel, Cloudflare, GitHub or Google setting was changed. Production was
read twice, passively: one `GET` of the Worker's public `/health` and the response headers of one
page load of `https://www.turboslide.com/`. No secret value is printed here; secrets are named by
their variables. The test secrets of the local runs were minted with `openssl rand -hex 32` into a
600 file in the scratch folder and never shown.

The question was whether anything a person makes can be lost, and whether every failure is handled
and shown. The write path was read end to end (the editor's commit, the room client's queue and
pending store, the transport, the three admissions in `apps/studio/src/server/room.ts`,
`apps/realtime-worker/src/deck-room.ts` and the blob tier, the checkpoint and seed routes, the Blob
store's four round commit), then each failure mode the reading suggested was reproduced: the
network cut with the tab closed, a POST answer lost, a tab closed mid write, the server killed mid
checkpoint, a checkpoint answer lost in the Durable Object, a failed close, and one change larger
than a POST may carry.

## Summary

Production's normal path is sound: an entry is durable in the Durable Object's SQLite before it is
acknowledged, the Blob store's commit is a conditional manifest put, every Blob read of an
overwritten path is proven, and a tab keeps unsent work in memory and IndexedDB. The losses are in
the recovery paths, which run when something fails:

1. A checkpoint whose answer is lost after the route committed is committed a second time. Every
   word of that checkpoint appears twice in the store and in every tab (RELIABILITY-1). Two people
   typing at once for ten seconds can produce a checkpoint that takes longer than the object's 25 s
   deadline, so this needs no outage to happen.
2. The three word losses the two typers verifier found on 2026-10-07 (F1 to F3) are still in the
   tree; F1 was reproduced again today (RELIABILITY-2 to RELIABILITY-4). Every Worker deploy
   disconnects every editor, and the guard deploys the Worker on every push that is not docs only,
   so F1's trigger (a resend after a lost answer) recurs with each push (RELIABILITY-16).
3. The pending store's Apply places words at their old offsets, re-applies words the room already
   holds, and drops anything older than 24 hours without a word (RELIABILITY-5, RELIABILITY-6).
4. One change larger than 256 kB stops every later change of the tab from saving, with no
   refusal; the title row reads Saving for good (RELIABILITY-7).
5. The Durable Object can strand or drop acknowledged entries: a failed close forgets the deck in
   the drain's list, the alarm stops after six retries, any 404 from the checkpoint route drops the
   whole tail, and comments the sidecar did not take are marked committed (RELIABILITY-8 to
   RELIABILITY-10).
6. There is no backup of the deck store and no restore drill (RELIABILITY-13), no client error
   reporting and no alert that reaches a person (RELIABILITY-14), and the kill switches cannot be
   flipped on production (RELIABILITY-15).

## The local setups

Every reproduction ran on this machine; each names its setup by letter.

- **S1, the node server.** `apps/studio/node_modules/.bin/vite dev --port 4835` from
  `apps/studio` with `TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=.turboslide/reliability-overlay
TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1
TURBOSLIDE_AUTH_DB=.turboslide/auth-reliability.sqlite TURBOSLIDE_MAIL=capture
TURBOSLIDE_AUTH_RATE_LIMIT=off GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=fake-secret-for-local-tests TURBOSLIDE_ROOT=<the worktree>`, plus
  `TURBOSLIDE_SESSION_SECRET`, `TURBOSLIDE_DOWNLOAD_SECRET` and `TURBOSLIDE_ROOM_BEARER` as test
  values. No finding below depends on `TURBOSLIDE_LOCAL_OPEN` or on the auth rate limit: the
  browser runs use the anonymous owner cookie of the context that made the deck, and the
  checkpoint route runs use the room bearer. The tmp store writes no `origin` on its records
  (`file-store.ts` 288 to 346 ignores it), which matters for RELIABILITY-6; S3 covers the Blob
  store's behaviour. Stopped at 18:41 UTC; the overlay was removed.
- **S2, the browser.** Headless Chromium from the repository's `playwright-core`, contexts built as
  `apps/studio/e2e/core/lib.ts` `ownerContext` and `sameCookiesContext` build them (the dev
  server's HMR socket answered by nobody), 1440 by 900.
- **S3, the Blob store over the fake.** Node 24 running the tree's
  `packages/store/src/blob-store.ts` over `blob-fake.ts` `memoryBlobClient` with `gt-brand` pushed,
  and `apps/studio/src/server/checkpoint.ts` `commitRuns`, the function the checkpoint route calls.
  Records carry `origin` there (`RECORD_ORIGIN_WRITES = true`, `versions.ts` 30), as on production.
- **S4, the Durable Object.** The real `DeckRoom` under `@cloudflare/vitest-plugin`, from a scratch
  copy of `apps/realtime-worker/vitest.config.ts` with fresh test secrets per run and
  `TURBOSLIDE_APP_ORIGIN=https://app.turboslide.test`, so no call could reach production; the app
  is the tree's fake (`apps/realtime-worker/test/lib.ts` `fakeApp`) with the real route's revision
  check added (`decks.$deckId.checkpoint.ts` 83 to 89).

The machine's one minute load ran from 63 to 285 during the runs (other sessions' jobs). It is
written beside every reading. A lost or doubled word is a content failure at any load; no timing
below is offered as a verdict on production.

## Findings

### RELIABILITY-1: a checkpoint committed whose answer was lost is committed again (severity 4)

**What happens.** The object posts its uncommitted entries to `/api/decks/:id/checkpoint` with its
`revision`. When the route commits and the answer does not come back (the object's 25 s deadline,
`deck-room.ts` 104; a function killed mid run; a dropped response), the alarm's retry posts the
same body with the old revision, the route answers 409 because its own commit moved the store, and
`readmit` (`deck-room.ts` 1924 to 1999) treats every record above its revision as foreign
(`const foreign` at 1930), including the records that hold its own entries. It transforms its tail
past itself, places it on the seed's document (which already holds the text) and posts it again. The
route has no defence: `commitWrite` reads the base revision just before the write
(`checkpoint.ts` 161), so the Blob store's origin check, `recordNamingOps` (`blob-store.ts` 1824),
looks for a record above the current revision (`versions.ts` 127, `record.revision <=
baseRevision`) and never finds the earlier one. The object then publishes an external checkpoint
and every tab reloads into the doubled document.

**Evidence.**

- S4, `DeckRoom`, one ops frame `splice(0, 0, 'word ')`, the first checkpoint's answer dropped after
  the fake committed it. Reading: the first attempt threw `AppCallError: the checkpoint route did
not answer: Network connection lost.`; the retry met 409, read the seed at `since=0`, and posted
  the same op id again; the fake's log holds two records naming `aaaa…:1`; the text reads `word word
Every post states wh…` where `word Every post…` was typed. Load 92.
- S1, the real checkpoint route over HTTP with the room bearer, deck `untitled-20261008-d50e`
  (title `Realtime title x t`): post 1 `{ entries: [" z" at the end], revision: 3 }` answered 200 at
  revision 4; the same body again answered 409 `{ conflict: true, revision: 4 }`; the seed at
  `since=3` answered the record at revision 4; the re-admitted entry (same op id, offset moved by
  two, `revision: 4`) answered 200 at revision 5, `committed: 1, skipped: []`; the title read
  `Realtime title x t z z`. Load 86 to 88.
- S3, the same two `commitRuns` calls over the Blob store with `origin` written: the first record
  carries `origin { clientId: "ffff…", opIds: ["ffff…:1"] }`, the second run committed a new record
  at revision 27, and the text ends `s shaders. z z` (`DOUBLED`).
- How long a checkpoint takes. S3 with each Blob call delayed 160 ms (about one second per record;
  `docs/gslides-parity/realtime/audit-sync.md` 1.3 measured about 650 ms per record on production):
  10 runs alternating two authors took 9,940 ms; 40 runs took 38,086 ms, past the object's 25 s.
  Load 83 to 85; the elapsed time is mostly the injected delay, so the load moves it little. A run
  is one author's contiguous entries (`coalesce.ts` 1 to 12), so two people typing at once for the
  10 s maximum interval produce one run per switch of author. At 650 ms a record, 39 switches pass
  25 s.
- A kill mid run. S1, one checkpoint of 2,000 alternating runs, the server killed with `kill -9`
  4 s after the post: the caller read `no answer: UND_ERR_SOCKET` after 4,050 ms; on disk 130 of
  the 2,000 runs were committed (revision 45 to 175); after the restart a retry with revision 45
  answered 409 `{ conflict: true, revision: 175 }`, the path that doubles the 130 runs. Load 72.6
  at the post, 63.4 at the read.
- A deadline expiry of the object does not stop the route: nothing in the route reads
  `request.signal`, so the function goes on committing while the object retries.

**Fix.** (1) The route answers an entry it already committed from the log: commit by the object's
`fromSeq` and `toSeq` (a record whose `ops.toSeq` covers the entry's seq answers it) or pass the
object's `revision` as `baseRevision` to `commitWrite`, so `recordNamingOps` sees the records above
it. (2) `readmit` drops every stale entry whose op id a record above `meta.revision` names in
`origin.opIds`, moves `covered` past it, and transforms only what is left. (3) The route stops
between runs once `request.signal` aborts. (4) One checkpoint becomes one Write: fold the runs into
one record that keeps each author's runs in the record (the Version history rows read them), so a
checkpoint costs one four round commit whatever the number of authors. (5) Raise the object's
deadline above the route's worst case, or cap a checkpoint at the runs that fit in 15 s.

**Pins.** A Worker test from the S4 probe (`P1`, scratch `worker/probes.test.ts`): the answer lost
after the commit, the retry, one record and one copy of the text. A route test: the same run posted
twice answers the first record and leaves the store at one revision. A matrix row
`realtime.checkpoint.lost-answer-once` on the local do pair.

### RELIABILITY-2: F1, a resent POST's later entries are moved past its own first entry (severity 4)

**What happens.** The room client resends its unsettled ops on its last base after any `postOps`
that threw (`room-client.ts` 2040 to 2051). The admission answers an op id already in the log from
the log (`room.ts` 1875 to 1877; `deck-room.ts` 989 to 991; the blob tier's `admitOnBlob`) but
leaves that entry's rows in the landed set (`room.ts` 1858), so the next entry of the same POST,
written on top of the first, is moved past its own author's letters. Found by the two typers
verifier on 2026-10-07 (`docs/gslides-parity/realtime/build/word-fix.md`, "F1"); no commit since
touches the three admissions.

**Evidence.** S1 and S2 on current `0d3920a3`, the memory tier, deck `untitled-20261008-d50e`, the
two POSTs sent from the editor page itself with its own bound client id, base 2: POST 1 `[" t" at
16]` answered seq 3; POST 2 (the resend) `[" t" at 16, "a1" at 18, run]` answered seq 3 for the
first entry and refused the second with `text.splice: 20 plus 0 is outside a text of 18
characters`. A reload read `Realtime title x t` where `Realtime title x ta1` was typed. Load 83.6
to 88.8. The refused letters go back to the author as a card. On the do tier the HTTP belt posts
the resend before the socket reopens (`transport.ts` 1062 to 1069), and every Worker deploy closes
every socket (RELIABILITY-16).

**Fix.** The verifier's: when an entry is answered from the log and its seq is above the base, take
its rows out of the landed set and move the rows that landed before it past it with `landedPast`,
in all three admissions (one shared function in `packages/realtime/src/room-core.ts`). The
verifier's diagnostic copy took the lost answer property from 52 to 24 of 60 red; the residual it
names (R) needs its own reading.

**Pins.** The S1 reproduction as a unit test of `admitOps`, the object's `admit` and `admitOnBlob`;
the verifier's lost answer property in `apps/studio/src/editor/two-typers.test.ts`.

### RELIABILITY-3: F3, an undo moves onto another person's word typed at the same point (severity 4)

**What happens.** `transformSince` (`room-client.ts`, called by `undo-bursts.ts` `stepBursts`) moves
an inverse past every remote entry with the default tie, while the room placed this person's run
to the left of the other insert by the run rule. The undo then removes the other person's letters.
Found by the verifier (seed 10014: A's undo removed B's ` tb2` and kept A's ` ta2`; 115 of 300 undo
orders red). The files are unchanged since `486b10b2` (`git log` on `room-client.ts`,
`undo-bursts.ts`: the last commit is the hotfix itself, `9c0f96a8`). Not reproduced again here.

**Fix.** Record the tie side each burst was placed with (the run declaration the POST carried and
the side the answer's placed mutations show) and transform the inverse with that side, through the
same `transformEntry` the admissions use.

**Pins.** The verifier's undo property as a seeded test in `two-typers.test.ts`; an e2e row of two
people typing at one point and one undo, both words checked.

### RELIABILITY-4: F2, a Backspace swallows a word another person typed at that point (severity 3)

**What happens.** InlineText `absorbedText` moves the end of the unflushed local change past a
remote insertion that lands exactly at that end, so the local delete covers the other person's word
(verifier, F2: `absorbedSession(...)` returns `Realtime title tq` where `Realtime title tq tb1` is
expected; two of six two browser attempts lost A's word). Unchanged since the verifier's pass.

**Fix.** Move the local change's end with the insertion's side: an end equal to the remote point
stays before it.

**Pins.** The verifier's `absorbedSession` case as a unit test; the Backspace property in
`two-typers.test.ts`.

### RELIABILITY-5: the pending store's Apply places words at old offsets and drops queues silently (severity 3)

**What happens.** A tab closed with unsent work leaves its queue in IndexedDB; the next open offers
"N unsaved changes from this browser" with Apply. Apply calls `client.apply` with each op's original
mutations on the current document (`room-client.ts` 2402 to 2416). The queue stores no base, so
nothing moves the ops past what others wrote meanwhile. An op that throws is dropped in a bare
`catch` (2414) with no card. A queue older than 24 hours is deleted on read
(`pending-store.ts` 97 and 236, `PENDING_MAX_AGE_MS` 13) and a queue over 1 MB loses its oldest
entries (`trimQueue` 65), with no word to the person in either case; the newer entries then apply
without the ones they were typed after.

**Evidence.** S1 and S2, deck `untitled-20261008-91uk`, load 83.8 to 85.5. A typed `Alpha Bravo
Charlie`; A went offline and appended ` Xray` (the title row read `Offline. Changes will save when
you reconnect`, pending 1); A's tab closed. The same person in a second browser put `Zulu ` in
front. A came back online and opened the deck: `1 unsaved change from this browser`, Discard,
Apply. After Apply, A, B and a fresh load all read `Zulu Alpha Bravo Ch Xrayarlie`.

**Fix.** Persist the stream position with the queue. On Apply, read the entries since that
position (the stream's replay or the records' mutations through the seed route) and move the ops
past them with `transformPast`, the reconnect path's own step; past the replay window, hand the
typed text back as the reject card's text and apply nothing. Keep the original op ids
(RELIABILITY-6). Never delete a queue unread: past 24 hours show "Unsaved changes from <date>" with
Copy Text and Discard. At the cap, refuse a new local op with a sentence and keep every queued op.

**Pins.** An e2e row `sync.persisted.apply-after-remote-edit` from the S2 script
(`e1-persisted-apply.mjs`); unit tests on `pending-store.ts` for the stale and the trim cases.

### RELIABILITY-6: Apply re-applies words the room already holds (severity 3)

**What happens.** The offer leaves out the ops the server holds by asking `heldOpIds`
(`apps/studio/src/server/write.ts` 574 to 600), which reads the Blob records' `origin.opIds`. The
room's entries not yet checkpointed (2 s idle, 10 s under typing on the do tier, longer while
checkpoints fail) are not asked, a failed read answers `{ held: [] }` (592) and the client treats a
failed call as nothing held (`room-client.ts` 2382 to 2386), and Apply sends the ops under new op
ids, so the room's dedupe by `(client_id, op_id)` cannot catch them.

**Evidence.** S1 and S2, deck `untitled-20261008-bkkv`, load 72.7 to 69.9. The stream was cut, then
` Charlie` typed; the ops POST reached the server and was admitted, and the tab closed before
reading the answer. The reopened editor read `Alpha Bravo Charlie` and offered `1 unsaved change
from this browser`; after Apply it read `Alpha Bravo Charlie Charlie`. On S1 the window has no end,
because the tmp store writes no `origin`; on production it is the checkpoint lag. A first attempt
with the stream left open showed no offer: the stream's echo settled the op within 800 ms, so the
production trigger is a tab that closes within the round trip of its last flush or while its
socket is down.

**Fix.** Apply re-sends with the persisted op ids; the room answers a known id from its log. On the
do tier, `heldOpIds` asks the object (`findEntry` by op id) as well as the records. A failed check
offers nothing until it answers.

**Pins.** The S2 script `e5-held-ops.mjs` as an e2e row; a room client test that Apply keeps the
op ids.

### RELIABILITY-7: one change over 256 kB stops every later change from saving (severity 3)

**What happens.** The batcher stops at the first op that does not fit
(`room-client.ts` 1997: `bytes + size > OPS_POST_MAX_BYTES - 1024` breaks) and returns when the
batch is empty (2001). An op larger than the cap is therefore never sent and never refused, and
every op queued after it waits behind it. The client checks neither the POST cap nor the 200 kB
slide cap (`admission.ts` 35, checked by the server alone in `room-core.ts` 367).

**Evidence.** S1 and S2, load 68.8 to 80.0. A pasted 297,000 bytes of text into an open title (the
paste was taken; pending 1, the title 297,009 characters). Then a rename through the window API
(`deck.set /title`): no answer within 60 s. After 30 more seconds: pending 3, the title row
`Saving…`, zero ops POSTs since the paste. A second browser read the old name `Size probe` and a
10 character title. Nothing told the person why.

**Fix.** Check both caps when the change is applied (the slide size through room-core's own check,
one shared function) and refuse at once with a sentence ("This slide would pass 200 kB. Split the
text into another slide."), so nothing unsendable enters the queue. The batcher sends an op that
fits alone and refuses one that cannot ever fit, and never returns with ops waiting.

**Pins.** A room client unit test: an op over the cap is refused and the op after it is sent. The
S2 script `e7-oversize-op.mjs` as an e2e row.

### RELIABILITY-8: a failed close leaves the tail with no committer (severity 3)

**What happens.** At the last socket's close, `lastClosed` tries the checkpoint, logs `the close
checkpoint failed` on an error (`deck-room.ts` 1349), and then deletes the deck's `rt_open` row in
any case (1368). The drain (`realtime-env.mjs drain`, `docs/CLOUDFLARE.md` 3.8 item 2) lists
`rt_open` to find the objects whose entries it must flush before a rollback, so it misses this one.
The alarm handler does not catch a failed checkpoint (`alarm` 594 to 613, the call at 610), so the
runtime retries it up to six times from 2 s ("once the 6 retries are exhausted, the alarm will not
be re-run unless `setAlarm` is called again", https://developers.cloudflare.com/durable-objects/api/alarms/,
last updated 2026-04-21, read 2026-10-08) and then nothing re-arms it. The entries stay in the
object's SQLite (durable), but the store of record (exports, the CLI, agents' reads, Version
history, the home page cards) never receives them until someone opens the deck again on the do tier.

**Evidence.** S4, `DeckRoom`, one ops frame, the fake app failing every checkpoint with 503, the
socket closed. Reading: in the drain's list before the close `true`, after it `false`; `head 2,
covered 1, sockets 0`; the alarm the entry armed ran and threw `AppCallError: the checkpoint route
answered 503`; no alarm armed after the throw. Load 92.

**Fix.** Delete `rt_open` only when `head <= covered`. Catch in `alarm`, log at error with the deck,
and re-arm with a backoff capped at ten minutes, so the object never depends on the runtime's six
retries. Add a Worker `scheduled` handler (a cron trigger) that reads `rt_open` and pokes each
object whose tail is older than two minutes. `/control/open` answers each object's `head`,
`covered` and the age of its oldest uncommitted entry, which the guard and an external check read.

**Pins.** The S4 probe `P2` as a Worker test; a test that a thrown checkpoint leaves an alarm armed.

### RELIABILITY-9: comments the sidecar did not take are marked committed and lost (severity 3)

**What happens.** On the do tier a comment is an entry in the object; the sidecar is written by the
checkpoint route (`decks.$deckId.checkpoint.ts` 102 to 111). When `commentsApplierFor(deckId).apply`
throws (a Blob 429, a 5xx or a deadline of the push), the route logs `comments did not land` and
answers 200; the object moves `covered` past the entry. When the sidecar's reducer refuses an op,
the applier logs it and drops it unless `strict` is set (`comments.ts` 122 to 136); the route does
not set it. A person who saw the comment appear finds it gone after a reload. A refused add also
takes every later reply to that thread with it.

**Evidence.** Code reading of the two files above. One S1 attempt to drive the refusal over the
route was refused earlier by the body schema (the probe's comment shape lacked `principalId`) and
was not repeated.

**Fix.** The route applies comments in strict mode and answers 503 when the sidecar write fails,
before it answers the edits, so the object keeps the entries and retries; a comment the reducer
refuses goes to a dead letter table with the deck and the op, logged at error.

**Pins.** A route test with a failing Blob client: the comment entry is answered 503 and lands on
the retry; a Worker test that a 503 keeps `covered`.

### RELIABILITY-10: any 404 from the checkpoint route drops the object's whole tail (severity 3)

**What happens.** `checkpointOnce` calls `abandonTail` for any `AppCallError` with status 404
(`deck-room.ts` 1817 to 1818), which sets `covered = head` and drops every uncommitted entry
(1875 to 1890). `appCall` discards the body of a non 2xx answer, so the object never reads the
route's `gone: true`. A 404 comes from a deployment without the route (an Instant Rollback to a
build before the Cloudflare move), an app origin that names a deleted preview, or the route's own
mapping of any `RangeError` thrown in `commit()` to 404 gone (`decks.$deckId.checkpoint.ts` 71);
the reducer, the pointer code and the slug code all throw `RangeError`
(`packages/schema/src/errors.ts` 87 maps it to 404 everywhere).

**Evidence.** Code reading; the existing Worker test `gone` drives the drop on a fake 404.

**Fix.** Abandon only when the body says `gone: true` and the seed route answers 404 for the deck
too; even then move the tail to a dead letter table kept for 30 days and log at error. The route
throws a typed `DeckGoneError` for a missing deck and answers 500 for every other error.

**Pins.** A Worker test: a 404 without `gone` keeps the tail. A route test: a `RangeError` from the
commit answers 500.

### RELIABILITY-11: entries the store refuses are dropped while the tabs keep them (severity 3)

**What happens.** `commitRuns` skips a run the store refuses for its content and names its op ids
in `skipped` (`checkpoint.ts` 216); the route answers 200 and the object ignores `skipped`. The
object's document and the tabs hold the text; the store does not. At the last close the object drops
its doc rows and the next open seeds from the store without it. The object and the route run
separate builds: the guard deploys the Worker first and the Vercel deployment after it, so each
push that adds a field or a mutation opens a window in which the new Worker admits what the old
app's validator refuses.

**Evidence.** S1, the route, a splice at offset 9999: `200 { committed: [], skipped: ["ffff…:2"],
revision: 5 }`. Load 86.

**Fix.** The route answers 409 with the skipped op ids; the object marks them refused, sends each
author a `rejected` frame (the tab shows the card) and reloads the tabs. The app accepts a protocol
or schema version in the body and refuses a newer one with a code the object waits on.

**Pins.** A route test that a refused run is answered as refused; a Worker test that a skipped op
reaches its author as a rejection.

### RELIABILITY-12: one slow deck moves every deck to the blob tier (severity 2)

**What happens.** A checkpoint that passes the 25 s deadline throws `AppCallError` with status 0,
which `reach` counts as the deployment's failure (`deck-room.ts` 285 to 292). Two in a row on one
object write `rt_flags.callbacks` as failing (`CALLBACK_FAILURES_BEFORE_FLAG` 2), and every Vercel
instance reads realtime off for 120 s (`control.ts` `CALLBACKS_FAILING_TTL_MS`; `do.ts` 261), so
every tab of every deck reconnects on the blob tier and back. The comment at 278 to 283 states the
intent that one deck must not do this; the deadline case does it.

**Fix.** Count only failures that no deck explains (no connection, a redirect, 401, 403, the seed
route's 5xx); a checkpoint deadline is the deck's and leaves the flag alone.

**Pins.** A Worker test: two checkpoint deadline expiries on one object leave `callbacks` at `ok`.

### RELIABILITY-13: no backup of the deck store and no restore drill (severity 3)

**What happens.** Decks live in one Vercel Blob store. The Blob page lists no versioning, no soft
delete and no backup (https://vercel.com/docs/vercel-blob, last updated 2026-08-26, read
2026-10-08); a `del` is final. `deck.remove` deletes the deck's prefix (`decks.ts` 625 to 650),
`deck push --replace` deletes the files the bundle does not carry, the old versions included
(`bundle-core.ts` 293 to 302), and the snapshot and thumbnail prunes delete on a schedule. A bug in
one of them, or a leaked `BLOB_READ_WRITE_TOKEN`, removes work for good. The tree has
`scripts/blob-copy.mjs` (a store to store copy with verify and delta passes) and the header says it
has never run against a real store. D1 has Time Travel (7 days on Free, 30 on Paid,
`docs/CLOUDFLARE.md` 3.9); the Durable Object's point in time recovery is 30 days and unconfirmed
on Free (same section). No document in `docs/` describes a restore.

**Fix.** A nightly copy of the deck documents (`decks/*/deck.json`, `slides/`, `versions/`,
`snapshots/`, `comments/`, `access.json`) to a second store with 30 days of dated prefixes, run by
the existing Vercel cron or a Worker cron trigger with `blob-copy.mjs`'s delta logic; a weekly
`wrangler d1 export` of the accounts database; a monthly drill script that restores one deck from
the backup into a scratch id, opens it, compares its snapshot hash with the original and removes
it; the drill's reading recorded in `docs/hosting.md`.

**Pins.** A test of the copy over two fakes (`blob-copy.test.mjs` exists); the drill script's exit
code as a guard step once a month.

### RELIABILITY-14: failures reach no person (severity 2)

**What happens.** The client reports no error anywhere: no `window.onerror`, no
`unhandledrejection` handler, and the route error pages (`router.tsx` `defaultErrorComponent`,
`edit.$deckId.tsx` `EditRefused`) draw a sentence and send nothing. The alert rules are data in
`apps/studio/src/server/log.ts` 260 to 371 and `docs/security.md` 11 says to "set a Drain to a 30
day store"; no document records a Drain, and runtime logs alone are kept one day (same section).
The object's error lines (`the close checkpoint failed`, `the app does not answer the object`) and
its warn line `the deck is gone; its uncommitted entries are dropped` go to Workers Logs with no
alert. The guard checks production after a push, from Kevin's machine; nothing reads production
between pushes. The app has no health route that reads the store (`server/health.ts` answers a
marker and the Node version).

**Fix.** One shared reporter in a package both apps import: in the browser, `window` errors, unhandled
rejections and the error pages post a scrubbed line (route, build, message, stack head, no text of
the deck) to `/api/x/errors`, sampled and rate limited like the CSP report route; on the server, the
same module writes the log line. A Drain to a 30 day store with three paging alerts: any
`checkpoint` failure line, any dropped tail, and client errors above a rate. A Worker cron trigger
every five minutes reads `/api/health` (a new route that heads a canary deck's manifest and reads
D1) and the Worker's `/health`, and mails on two failures in a row.

**Pins.** A unit test of the scrubber (no deck text, no address); an e2e row that a thrown render
reaches `/api/x/errors`.

### RELIABILITY-15: the kill switches cannot be flipped on production (severity 2)

**What happens.** The thirteen switches (`readOnly`, `exports`, `comments`, `uploads` and the rest,
`packages/schema/src/access.ts` 446 to 480) are read through a reader that is bound only in tests
(`flags.ts` `bindFlags`, 181; no call outside `*.test.ts`). Hosted, the reader falls back to the
file `flags.json` in the function's own state folder (`reader`, 195 to 202), so `turboslide admin flag
readOnly off` writes one instance's ephemeral file. During a store incident or a restore there is
no way to stop writes without a deploy.

**Fix.** Read the switches from D1's `rt_flags` table (the `realtime` switch already lives there)
through the bearer route with the 5 s cache, and write them with `admin.flag`.

**Pins.** A test that a flag written by one node process reads on a second over the same D1.

### RELIABILITY-16: every push restarts every Durable Object (severity 2)

**What happens.** The guard deploys the production Worker on every push that is not docs only once
the tree expects `do` (`scripts/hosting/README.md`, "The guard patch" item 6; `docs/hosting.md`
13.6). "Code updates disconnect all WebSockets. Deploying a new version restarts every Durable
Object" (https://developers.cloudflare.com/durable-objects/best-practices/websockets/, last updated
2026-09-30, read 2026-10-08). The Worker's `/health` read today names commit `e521bcf2`, "the T one
pixel left inside the favicon's box", a change that does not touch the Worker's bundle. Each such
deploy reconnects every editor and runs the resend path of RELIABILITY-2.

**Fix.** Deploy the Worker only when its bundle changes: hash the output of `wrangler deploy
--dry-run --outdir` against the deployed version's, and deploy when they differ.

**Pins.** A guard check that a favicon only push leaves the Worker's `/health` commit unchanged.

### RELIABILITY-17: the do tier re-folds pending text at old offsets after a long gap (severity 2)

**What happens.** When the stream answers `resync` (more than 2,000 entries behind) or a POST
answers 409 `resync` (a base more than 500 behind), the client reloads the document and re-folds
its pending ops on it without moving them past what landed (`room-client.ts` `resync`, 1762 to
1791). The blob tier returns posted ops to their author past the bound (1742); the do tier never
reads `bounded`, because `readEditorDeck`'s answer does not carry it (`controller.tsx` 1000 to
1010). Text typed during a long disconnection on a busy deck lands at the old offsets.

**Evidence.** Code reading; the trigger needs more than 2,000 entries during one disconnection.

**Fix.** The resync answer carries `bounded` on every tier (the read compares `since` with the
oldest record it can answer), and past the bound typed text returns as cards.

**Pins.** A room client test: a resync with `bounded` on the do tier returns the posted text ops.

### RELIABILITY-18: the blob tier gives up on a fresh deck before the store shows it (severity 2)

**What happens.** An ops POST answered 404 is retried five times on the doubling ladder, about 15 s
(`room-client.ts` 245 to 252), and then the ops return to the author. The same comment records a
404 23 s after a deck's first write on a preview. The blob tier is production's fallback whenever
the Worker is off or flagged (RELIABILITY-12).

**Fix.** Retry 404 for 60 s on a deck this tab created or loaded, and ask `hasStoredDeck` with a
forced head before returning the ops.

**Pins.** A room client test with a 404 for 25 s then 200: nothing returns to the author.

### RELIABILITY-19: a rollback cannot read what the newer build wrote (severity 2)

**What happens.** Every object of the document schema is strict (`z.strictObject`,
`packages/schema/src/deck.ts`) and `schemaVersion` stays 1 while fields are added (the freeform
fields of 2026-09-11 among them); the migration chain only stamps 0 to 1
(`packages/schema/src/migrations.ts`). A build before a field refuses a deck that uses it, so an
Instant Rollback or the guard's promote back leaves those decks unopenable until the forward build
returns. The mutations in version records, the object's entries and the pending store keep old
shapes with no migration, so a rename of a field breaks the restore of older versions.

**Fix.** A compatibility gate: the previous release's validator, pinned in the tree as a fixture,
reads documents the current release writes, and each release states whether it can be rolled back
past. Additive fields bump a minor version the reader tolerates. Mutation shapes get the same
migration chain as documents.

**Pins.** A schema test that runs the previous release's validator over the current fixtures.

### RELIABILITY-20: a deleted deck's Durable Object keeps its entries for good (severity 2)

**What happens.** No path calls `deleteAll` on an object (`grep deleteAll apps/realtime-worker/src`
answers nothing); `closeRoom` closes the Vercel instance's room only (`room.ts` 1564 to 1570). A
month table is dropped only once `covered` is 10,000 entries past its last seq (`deck-room.ts` 1745),
so a deck under 10,000 entries keeps every entry. Deleted decks keep their text in the object's
SQLite, and the account's SQL storage grows toward the Free plan's 5 GB, after which writes fail.

**Fix.** `deck.remove` posts `/rooms/:id/purge` under the bearer after the flush, which runs
`deleteAll`. Compaction keeps the replay window (2,000 entries) behind `covered`.

**Pins.** A Worker test: purge leaves no table and no alarm.

### RELIABILITY-21: an agent's retried write applies twice (severity 2)

**What happens.** `POST /api/actions/<action>` carries no idempotency key; `baseRevision` is optional
on most actions (`packages/schema/src/actions.ts`). An MCP client or the CLI that retries after a
timeout repeats `slide.add`, `text.insert` and the other non idempotent actions.

**Fix.** Accept an `Idempotency-Key` header, carry it as the write's op id into the room (the
object's unique index answers the earlier entry) and into the record's `origin`.

**Pins.** An agent HTTP test: the same key posted twice answers the same record once.

### RELIABILITY-22: a spent daily cap stops every save with no hand off (severity 2)

**What happens.** On the Workers Free plan, past 100,000 Durable Object rows written in a UTC day
"further operations of that type will fail with an error" (`docs/CLOUDFLARE.md` 1.3). The object's
INSERT then throws, `webSocketMessage` answers 500 (`deck-room.ts` 523 to 538), and the tab resends
every 8 s. The hand off to the blob tier reads the Worker's `/health` and the callbacks row, both of
which stay `ok`, so every deck stays unsaved until 00:00 UTC. The plan in use is an open question
(`docs/CLOUDFLARE.md` 8 question 3).

**Fix.** The object reports a storage failure as the callbacks row's `failing` (with the error's
class), so the function hands the tabs to the blob tier; and the plan question below.

**Pins.** A Worker test with a SQL error injected: the callbacks row reads `failing`.

### RELIABILITY-23: one render error replaces the whole editor (severity 1)

**What happens.** The editor has one error boundary, the route's (`edit.$deckId.tsx` `EditRefused`).
A throw in a thumbnail, a panel or a dialog replaces the stage, the filmstrip and the title row with
the refused page. Pending work survives in IndexedDB, then meets RELIABILITY-5 on the reload. A
resync that brings entries this tab never saw also clears the undo history (`controller.tsx` around
2112); that is by design and worth a sentence in the snackbar.

**Fix.** Boundaries around the filmstrip, the side panels and each dialog that draw a one line
sentence in place and report through RELIABILITY-14's reporter; the stage keeps the route's.

**Pins.** A component test: a throwing thumbnail leaves the stage editable.

## What holds

- Durability at the acknowledgement: the object writes the entry in one synchronous block before
  the ack (`deck-room.ts` 1058 to 1063; `docs/CLOUDFLARE.md` 3.4 item 2). The blob tier commits to
  Blob before it answers.
- The Blob store's commit: claims, snapshot and bodies first, then the manifest under `ifMatch`; a
  lost race is a conflict outcome; overwritten paths are read by proof (`blob-store.ts` 1782 to
  1900). No finding here beyond RELIABILITY-1's base revision.
- The client keeps every unsent op in memory and in IndexedDB, resends on 5xx, 429 and lost answers
  with a ladder capped at 8 s, holds the resend until the replay lands, and shows Offline within a
  second of the browser's event. The leave warning fires while ops are pending (`EditorRoot.tsx` 806
  to 817).
- A refused typed change comes back as a card with its text; a refused structural change is one
  snackbar sentence.
- The object wakes from its rows and the seed route without a network call for a hello
  (`wake.test.ts`).

## Timeouts and budgets

| Who waits    | For what                                    | Budget         | Where                                | Note                                          |
| ------------ | ------------------------------------------- | -------------- | ------------------------------------ | --------------------------------------------- |
| The tab      | an ops ack on the socket or the belt        | 30 s           | `transport.ts` 70                    | then the resend path (RELIABILITY-2)          |
| The tab      | the reopened stream's hello before a resend | 8 s            | `room-client.ts` 242                 |                                               |
| The object   | the checkpoint route                        | 25 s           | `deck-room.ts` 104                   | shorter than the route's work (RELIABILITY-1) |
| The object   | the seed route                              | 25 s           | `deck-room.ts` 106                   |                                               |
| The route    | its function                                | 300 s          | `vite.deploy.config.ts` 388          | keeps running after the object gave up        |
| The store    | a document write                            | 20 s each      | `blob-store.ts` 816                  | per call, four rounds per record              |
| The store    | a read                                      | 10 s           | `blob-store.ts` 678                  |                                               |
| The function | a call to the object                        | 10 s           | `packages/realtime/src/do.ts` 28     |                                               |
| The function | a D1 query                                  | 10 s           | `server/auth/d1-proxy-dialect.ts` 53 |                                               |
| The export   | the synchronous export                      | 780 s in 800 s | `export-sync.ts` 102                 |                                               |

The one mismatch that loses data is the object's 25 s against the route's sequential runs.

## Questions, each with a default

1. Is the Worker on Workers Free or Paid today? Default: treat it as Free and ship
   RELIABILITY-22's hand off; Paid ($5.00 a month) removes the daily cutoff.
2. Where should the nightly backup go: a second Vercel Blob store, or R2 on the Cloudflare account?
   Default: a second Vercel Blob store in another region, because it needs no new account or
   checkout; R2 when stage 2a of `docs/CLOUDFLARE.md` 7.1 happens.
3. Which channel should an alert use? Default: mail to `TURBOSLIDE_ADMIN_EMAILS` through the
   existing Resend path when `RESEND_API_KEY` is set, else a line in the guard's log.
4. Should a checkpoint be one record per checkpoint (fewer Blob calls, one row per checkpoint in
   Version history with the authors listed) or stay one record per author run with the fixes of
   RELIABILITY-1 items 1 to 3? Default: keep per run and land items 1 to 3 first, since they close
   the doubling without changing Version history.
5. Should the Worker deploy only when its bundle changes? Default: yes (RELIABILITY-16).
6. Does the guard read production between pushes? This lane did not open `gt-follow.sh`. Default:
   add the five minute Worker cron check of RELIABILITY-14 regardless.

## Order of work

RELIABILITY-1 and RELIABILITY-2 first (they change stored text on ordinary days), then 7, 5 and 6
(the client queue), then 8 to 12 (the object's recovery paths), then 13 to 15 (backup, reporting,
switches). The files overlap with the dropdowns round only in `apps/studio/src/editor` (none of the
fixes above touch a select) and with the favicon round nowhere.

## Scratch files

`/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/harden/reliability/`:
`lib.mjs` (the S2 helpers), `e1-persisted-apply.mjs`, `e2-resend.mjs`, `e3-checkpoint-route.mjs`,
`e3b-blob-origin.mts`, `e4-run-cost.mts`, `e5-held-ops.mjs`, `e6-kill-mid-checkpoint.mjs`,
`e7-oversize-op.mjs`, `e8-first-title.mjs`, `e9-after-refusal.mjs`, `worker/vitest.config.mts` and
`worker/probes.test.ts` (S4), and the `.log` file of each run. The scratch folder is wiped on reboot.
