# The sync owner's note

## Polish round fix round 3 (2026-09-30)

The sync fixer of the polish round's third fix round, in the worktree
`/Users/kevinliu/repos/Turboslide-live` (branch `polish/round`, `223570e3` at the start with the
integrator's uncommitted edits beside; the other lanes' fix round 3 edits landed in the tree while
this ran), from 12:20Z. Times are UTC. The finding: `sync.structural.concurrent`,
`sync.block.offline-replay-converges` and `sync.reject.sentence-below-toolbar` red twice on the
ship's enforce preview (`ship-2.md`; the run of record `polish-finish-preview-run1` and the once
rerun `polish-finish-preview-rerun-specs`), named as the blob tier's admission class (B5's R15).
Read first hand from the ledgers' Playwright reports (`<scratchpad>/polish/ship2/gate-preview/specs.json`
and `rerun-specs/specs.json`, the `report` path each gate ledger names), the three rows carried the
same readings in both runs, and none of them is the admission class:

- `sync.structural.concurrent`: both drags agreed (2,902 ms and 1,901 ms), the slide was gone in
  both browsers, and "A's reject card none". The loser's write is refused, and nothing draws a
  card.
- `sync.block.offline-replay-converges`: "converged true 880 ms after the reconnect; A's splice
  offset 18 first, 18 on the admitted POST". The four words converge; the resend goes with the
  offset of the first attempt.
- `sync.reject.sentence-below-toolbar`: the structural half reads the snackbar "The room answered
  409"; the typed half reads the card at 128 against the toolbar's bottom 112 and passes.

### The mechanism of each row

1. `sync.reject.sentence-below-toolbar` (the structural half) and the loser's reading in
   `sync.structural.concurrent` are one defect. A refused write reaches the tab twice: the room
   client's `onReject`, where B5's item 102 says the one sentence (`structuralRefusalSentence`) for
   a write with no typed text, and the write's own promise, which `controller.tsx`'s draft queue
   rejected with a `ConflictError` carrying the room's words (`outcome.rejected.message`: the
   transport's "The room answered 409" for the driver's injected 409, the reducer's "No slide
   \"split-1-39f3\"" for the loser of the structural race). The write's caller is the chrome's
   dispatch (`EditorShell.tsx` `say(errorText(error))`), which said those words in the same
   snackbar a microtask after the sentence, so the seller read the room's words with the status
   code or the id and never the sentence. The fix is in the admission path of `controller.tsx`
   (the file table's B5 half by request; the sync owner's by the prompt): a new module
   `apps/studio/src/editor/refused-write.ts` carries `refusedText`, `isStructuralRefusal`,
   `structuralRefusalSentence` (B5's table, moved verbatim, plus the `block.set /pos` write a drag
   or a handle makes: "Your object was not moved or resized. Try again", since item 102 names every
   change and the loser read the generic sentence on the fixed preview) and `refusedWriteSentence`
   (item 102's sentence for a structural write, the room's own for typed text, whose card carries
   it). The two `ConflictError` sites throw `refusedWriteSentence`, so the chrome's catch says the
   same sentence `onReject` said and the snackbar shows one sentence; `onUnplaceable` and
   `publishLocalRefusal` (the loser whose local document already lost the slide) go through the
   same gate (the sentence for a structural write, the card for typed text). The room's words
   still reach the card for typed text and the `rejects` state, so an agent reading the notice
   keeps the reason. Test: `apps/studio/src/editor/refused-write.test.ts` (10 tests with the
   existing `no-action-id-snackbar` read of every `say(` call).
2. `sync.block.offline-replay-converges`: item 100's `online` event (`room-client.ts`
   `onBrowserOnline`) flushed at once, so the resend went on the old base with the original
   offset and the server transformed it (docs/SYNC.md 3.3): correct on the document, wrong against
   3.7, which records the order the row reads (the reopen's replay first, then the resend at base
   60). Before item 100 the order was the race between the failed POST's backoff timer and the
   stream's reopen ladder, which `gate-production-vector.json` (2026-09-26) already read red once.
   The fix in `packages/realtime/client/room-client.ts`: on the `online` event while the stream is
   not connected, the reopen timer is cleared, the stream reopens at once, and the resend holds
   for the hello (`holdForHello`: `caughtUp` false, as finding 33's first flush hold); the hello
   releases it into the existing replay wait (`caughtUp = seq >= helloSeq`, `noteCaughtUp` after
   the drain), a reopen that fails releases it in `reopenStream` (the ops post while the stream
   waits for a slot, C3-F1), and `RECONNECT_HOLD_MAX_MS` (8 s, `BACKOFF_MAX_MS`) caps it so a
   stream that hangs never holds a write. `stop()` clears the timer. docs/SYNC.md 3.7 carries one
   sentence for it. Tests: `packages/realtime/client/reconnect-order.test.ts` (the reopen and the
   resend at the caught up base with the shifted offset through a fake `window`'s events; the
   refused reopen's release) beside the 46 of `room-client.test.ts`.
3. `sync.structural.concurrent` (the card read): the driver expects "the loser's reject card is
   shown" (`sync.spec.ts` 936 to 953, the matrix row's words from docs/SYNC.md 6.1, FEATURES.md
   2.2 rank 8's gate in `EditorRoot.tsx` `isControlRefusal`). docs/POLISH.md item 102 binds above
   SYNC.md and FEATURES.md: "a structural refusal is one snackbar sentence; the card stays for typed
   text alone", and audit-collab item 7's Google reading is "a structural conflict is resolved, a
   lost edit is a brief snackbar". The loser's `block.set /pos` carries no text, so the product is
   right to say one sentence and the driver is wrong against the rule. The driver's fix is R1 to
   B6 below with the evidence; the product side of this round is the sentence itself (item 1).

### Reproduced on the hosted tier, then read fixed

Two enforce previews were deployed from the worktree with the recorded command (`vercel deploy
--yes --archive=tgz` with the six `-e` variables and the two secrets minted inside; never
`--prod`, no project setting, no env command; `<scratchpad>/polish/sync-fix3/deploy.sh`):

| Preview                                                          | Tree                                                              | Deployed               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| `https://turboslide-392lxforp-kl01s-projects.vercel.app` (repro) | `223570e3` plus the integrator's uncommitted docs, before any fix | 12:31:49Z to 12:34:42Z |
| `https://turboslide-gesd8i6h3-kl01s-projects.vercel.app` (fix1)  | `b501e505` plus this lane's fix (the `/pos` sentence not yet)     | 12:39:36Z, exit 0      |
| `https://turboslide-e9j1ahpzg-kl01s-projects.vercel.app` (fix2)  | the tree with the `/pos` sentence and the SYNC.md line            | 12:51Z to 12:54:03Z    |
| fix3 (the URL in the gate table below)                           | the tree with the 404 retry of the room client                    | 13:03Z, see below      |

The hand drive (`<scratchpad>/polish/sync-fix3/drive.mjs` through the token wrapper: two browsers
of one person, the rows' gestures at human speed, one scratch deck from `/new` per scenario, the
wire's ops POSTs read for their splice offsets, a picture at every reading, the decks trashed and
deleted forever with the 404 read) on the two previews:

| Reading                                                     | repro (before the fix)                                                                                                         | fix1                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| two drags agree within 5 s                                  | one position in both, 3,031 ms                                                                                                 | one position in both, 3,031 ms                                                                                       |
| the loser's reading after the reconnect                     | **snackbar `No slide "split-1-39f3"`** (an id), no card, 205 ms after the reconnect; `repro/04-structural-a-loser-reading.png` | snackbar "Your change was not applied. Try again", no card, 206 ms; `fix1/04-structural-a-loser-reading.png`         |
| the sentence leaves on its own after 6 s                    | yes                                                                                                                            | yes                                                                                                                  |
| the title row reads Offline within 1 s of the cut           | 5 ms                                                                                                                           | 1 ms                                                                                                                 |
| all four words in both browsers within 10 s                 | 622 ms, both "Start of the block ob1 ob2 ob3 oa1"                                                                              | 741 ms, the same                                                                                                     |
| A's resend carries the offset shifted past B's words        | **first attempt at 18 (base 2), admitted POST at 18 (base 2, seq 6)**                                                          | first attempt at 18 (base 2), admitted POST at 30 (base 5, seq 6); `fix1/offline-wire.json`                          |
| a structural refusal: one snackbar sentence, no id, no JSON | **"The room answered 409"**, the only sentence seen in 2.5 s; `repro/09-reject-structural-snackbar.png`                        | "Your new slide was not added. Try again", the only sentence seen in 2.5 s; `fix1/09-reject-structural-snackbar.png` |
| a refused typed text keeps the card below the toolbar       | card top 128 against the toolbar's bottom 112                                                                                  | the same; `fix1/10-reject-typed-card.png`                                                                            |
| teardown                                                    | 404 for `untitled-20260930-lwi4`, `-948s`, `-auwk`                                                                             | 404 for `untitled-20260930-u7ip`, `-lsfm`, `-w7pq`                                                                   |

The readings are in `docs/gslides-parity/polish/build/sync/fix3/{repro,fix1}/readings.json`
(14 ok and 3 failed of 17 on repro; 17 of 17 on fix1). The fix1 loser read the generic sentence
because the drag writes `block.set /pos`, not `block.move`; the `/pos` sentence above is in fix2.

The fix2 drive (`https://turboslide-e9j1ahpzg-kl01s-projects.vercel.app`, deployed 12:51Z to
12:54:03Z; `sync/fix3/fix2/readings.json`, 15 ok and 2 failed of 17): the loser read "Your object
was not moved or resized. Try again" 206 ms after the reconnect with no card
(`fix2/04-structural-a-loser-reading.png`), the structural refusal read its one sentence, and the
offline scenario read a fourth thing. A's wire (`fix2/offline-wire.json`): the first attempt at
offset 18 on base 2 with no answer, five resends while offline the same, then 760 ms after the
return **the resend at base 5 with offset 30** (the fix's order: after the replay, past B's three
words) **answered 404** by the preview, so the room client returned the word to its author (the
`forbidden` path: a refusal that will not change on a retry) and the card kept " oa1" while both
documents read "Start of the block ob1 ob2 ob3" at 10 s. The ops route answers 404 when `roomFor`
finds no stored deck on its instance (`hasStoredDeck` is a blob `head` of `decks/<id>/deck.json`),
the class B5's `access-refresh.ts` names for the read side this round ("a deck made seconds ago
answers 404 on another instance for a while"); the deck was 23 s old with two revisions. The
same POST was answered 200 on fix1 and on repro, so the class is the instance's, not the order's;
it is the blob tier's hosted class the row meets on a resend, and the room client's answer to it
was the defect: a 404 on a write is a moment's on that tier and never the deck's within a session
that has the deck open. Fix in `room-client.ts`: an ops POST answered 404 is sent again after the
backoff ladder, `NOT_FOUND_RETRY_MAX` (5) times, with `resending` true (the title row's retry
word); a deck gone for good answers 404 on every retry and the ops return to the author once the
retries are spent (`not-found-retry.test.ts`, both ways, on the ladder divided by 50). The fix3
preview carries it; its drive and gate runs are below.

### The gate, narrowed (`--only specs --rows <the three ids>`)

The runs wait for `pgrep -f core-gate.mjs` to find none (a five minute poll, an hour at most, as
the prompt asks; the people round's full gate `gate-p10` ended at 12:44Z and B1's narrowed
`polish-text` walk on its own preview ran after it). The ledgers land under
`docs/gslides-parity/polish/build/sync/fix3/gate-<label>.json` with their `-core-gate.json` and
`-core-matrix.md` beside; the log of each run is `<scratchpad>/polish/sync-fix3/gate-<label>.log`.

| Run                   | Time, load                                                                                   | Result and ledgers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| repro, the three rows | 12:53:50Z, 128 s; a one minute load of 2.4 (`uptime` at the start), two sibling gates beside | 3 rows: 1 passed, 2 failed; exit 1. `sync.block.offline-replay-converges` failed ("A's splice offset 18 first, 18 on the admitted POST"); `sync.reject.sentence-below-toolbar` failed (snackbar "The room answered 409"); `sync.structural.concurrent` **passed by the other path**: the replay landed before the resend, the pending `block.set` was dropped as unplaceable and A drew the old card "A change was not applied. Another change landed first; the text is kept here. Object changed. Details [ { "op": "block.set", "slideId": "split-1-e3c3", … ]" (audit-collab item 7's card with the id and the JSON, which item 102 retires; `onUnplaceable` now says the sentence). `sync/fix3/gate-repro.json`, `-core-gate.json`, `-core-matrix.md` |

| fix2, the three rows | not run | the chain was stopped at 13:00Z when the fix2 drive's 404 reading (above) showed a third defect, and the fix3 preview supersedes fix2 |
| fix3, the three rows; fix3-sync, the other eleven sync spec rows | queued at 13:03Z behind the fix3 deploy (`https://turboslide-26hmuos8z-kl01s-projects.vercel.app`, building at 13:03Z) and the pgrep wait; this lane returned before they ran | the runs continue detached (`<scratchpad>/polish/sync-fix3/run-chain3.sh`, `drive-when-up3.sh`): their ledgers land at `sync/fix3/gate-fix3.json` and `gate-fix3-sync.json` (with `--out` folders `<scratchpad>/polish/sync-fix3/gate-fix3*`), the two hand drives at `sync/fix3/fix3/` and `fix3b/` with `<scratchpad>/polish/sync-fix3/drive-fix3*.log`; **no number of theirs is this note's**, and the next reader takes them from the files. Every deck those runs make is trashed and deleted forever by the specs' and the drive's own teardowns |

So no gate run of the fixed tree completed inside this lane's run: the three rows' readings on
the fixed tree are the hand drives' (fix1 17 of 17; fix2 15 of 17 with the 404 class named above),
and `sync.structural.concurrent`'s driver stays red by its card read until R1 lands.

So the row's two readings on the tree before the fix were the room's raw sentence with an id in the
snackbar (the hand drive, the resend before the replay) and the JSON card (the gate, the replay
before the resend); after the fix both paths read item 102's one sentence, and the driver's card
read (R1) is what stands between the row and green.

### The tree

- `packages/realtime/client/room-client.ts`: `RECONNECT_HOLD_MAX_MS`, `holdingForHello` and
  `holdTimer`, `holdForHello` and `releaseHold` beside `noteCaughtUp`, the release in the hello
  and in `reopenStream`, the new `onBrowserOnline`, the timer's clear in `stop()`;
  `NOT_FOUND_RETRY_MAX` and `notFoundRetries`, the 404 branch of `flush` before the forbidden
  fallthrough, the counter's reset on an admitted answer.
- `packages/realtime/client/reconnect-order.test.ts` and `not-found-retry.test.ts`: new.
- `apps/studio/src/editor/refused-write.ts` and `refused-write.test.ts`: new.
- `apps/studio/src/editor/controller.tsx`: the import; `rejectNoticeOf` reads `refusedText`; B5's
  closure `structuralRefusalSentence` replaced by the module's; `onUnplaceable` and
  `publishLocalRefusal` through item 102's gate; the two `ConflictError` sites throw
  `refusedWriteSentence`. Eight hunks of this lane's; the file's diff read at 12:57Z also carries
  B5's fix round 3 hunks (`readAccessWithRetries` from `./access-refresh`, `refreshAccess`'s
  `onMissing`), which are not this lane's and land with B5's commit.
- `docs/SYNC.md` 3.7: one sentence on the online event's order.
- `node_modules/.bin/tsc -p packages/realtime/tsconfig.json --noEmit` exit 0;
  `tsc -p apps/studio/tsconfig.json --noEmit` clean outside `e2e/`; `tsc -b` reads three errors in
  `apps/studio/e2e/core/svg.spec.ts` (708, 741, 743), another lane's uncommitted edit of this fix
  round, not this lane's. Prettier clean on every file above.
- `apps/studio/src/editor/room-client.ts`, named in the finding's file list, does not exist; the
  room client is `packages/realtime/client/room-client.ts`.

### Requests

R1 (B6, `apps/studio/e2e/core/sync.spec.ts` 936 to 953 and `core-matrix.json`'s row
`sync.structural.concurrent`). The row's third read expects the loser's card; docs/POLISH.md item
102 makes a structural refusal one snackbar sentence and keeps the card for typed text alone, and
the loser's `block.set /pos` carries no text. Evidence: "A's reject card none" in both runs of
record; the hand drive's fix1 reading "snackbar 'Your change was not applied. Try again'; card none;
first seen 206 ms after the reconnect" with the picture `sync/fix3/fix1/04-structural-a-loser-reading.png`,
and fix2's "Your object was not moved or resized. Try again". The hunk, in place of the card wait:

```ts
/* the reconnect, the resend and the refusal: the memory tier answers within a second or two,
       the blob tier within its pulse. The loser reads one snackbar sentence (docs/POLISH.md item
       102: a structural refusal is one sentence with no id and no JSON; the card stays for typed
       text), never a card: the sync fix round 3 read the sentence 206 ms after the reconnect on
       the enforce preview of 2026-09-30 */
const snack = A.locator('.ts-snackbar.is-on');
let sentence = '';
const sentenceShown = await expect
  .poll(
    async () => {
      sentence = (
        (await snack
          .first()
          .textContent()
          .catch(() => '')) ?? ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      return sentence;
    },
    { timeout: 15_000 },
  )
  .toMatch(/not moved|not resized|not applied|Try again/i)
  .then(() => true)
  .catch(() => false);
const cardShown = (await A.locator('.ts-conflict').count()) > 0;
test.info().annotations.push({
  type: 'measure',
  description: `slide gone in both within 5 s ${gone} (${Date.now() - deleteAt} ms); A's snackbar ${sentenceShown ? `"${sentence.slice(0, 160)}"` : 'none'}; card ${cardShown ? 'shown' : 'none'}`,
});
expect(gone, 'both browsers show the slide gone within 5 s').toBe(true);
expect(sentenceShown, 'the loser reads one snackbar sentence (docs/POLISH.md item 102)').toBe(true);
expect(sentence, 'no id and no JSON in the sentence').not.toMatch(/split-|\{|"/);
expect(cardShown, 'no card for a structural refusal').toBe(false);
```

The `conflict.discard` click after it goes. The matrix row's `interaction` ends "the loser reads
one snackbar sentence with no id (docs/POLISH.md item 102) and both browsers show the slide gone
within 5 s"; its `evidence` adds "item 102".

R2 (B5, docs only): `apps/studio/src/editor/EditorRoot.tsx` `isControlRefusal`'s comment and
`refusal-gate.test.ts`'s header say the row reads A's card; since item 102 `onReject` says the
sentence before a structural notice reaches `rejects`, so the gate meets typed notices alone. A
sentence there saves the next reader the detour. Beside it, an observation outside this round's
rows: the typed text card (`RejectCard`) shows `notice.message` verbatim, which for a reducer
refusal carries an id ("No slide \"split-3\""); item 102 reads "no id" for the card too.

### The store sweep

Every scratch deck this lane made on the previews was trashed through File > Move to trash and
deleted forever on `/decks/trash` by the drive's own finally block, and `/edit/<id>` answered 404
for each: repro `untitled-20260930-lwi4`, `untitled-20260930-948s`, `untitled-20260930-auwk`; fix1
`untitled-20260930-u7ip`, `untitled-20260930-lsfm`, `untitled-20260930-w7pq`. The gate runs' decks
are the specs' own teardowns'; their ids are read from each ledger below. No deck was made on
production; no template was written.

### The machine

No dev server of this lane ran, no lock was taken (every drive and gate ran on a deployment
base), nothing was written on Vercel or GitHub beyond the previews above, no git write command
ran. The one minute load read 2.1 to 2.9 through the drives.
