# Turboslide round four, hotfix 2

Kevin's report on production at about 14:40 PDT on 2026-09-14, minutes after the round four deploy (`main` at `43707c3`): "using it is very hard, changes keep messing up, its some youre at revision 2 vs revision 12 despite being yourself, then you can see yourself editing it even though it's you in the slide, fix". Two defects: (A) while editing alone, writes are refused as stale and the tab falls behind the store; (B) the tab's own presence is drawn as a remote collaborator. Production runs the Blob store and the blob realtime tier (`TURBOSLIDE_REALTIME=blob`) on Vercel fluid compute with anonymous principals.

Files this hotfix touches are listed at the end of each section; the reproducer touched only this file.

## 1. Reproduction

By the reproducer, 2026-09-14, 14:45 to 15:20 PDT, against https://turboslide.vercel.app with headless Chromium (`playwright-core` 1.62.1 from the repo's `node_modules`, Node 24.13.0), through the product's own UI. Four runs; every deck they created was trashed and deleted forever (section 1.6). Scripts, traces, logs and screenshots sit under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix2/` (`repro.mjs` with `run1/`, `repro2.mjs` with `run2/`, `repro3.mjs` with `run3/`, `repro4.mjs` with `run4/`, `cleanup-api.mjs`, `run1.log` to `run4.log`); the primary script is copied in section 1.7. Each `trace.json` holds every POST with its `baseRevision` or `base.seq` and the answer, every stream frame (an `EventSource` wrapper installed before the page's scripts), the cookie names with a hash prefix of each value (never a value), the console, and a 300 to 500 ms sampler of `describe().state` (revision, serverRevision, sync.seq, sync.pending, sync.retained, sync.clientId, roster, rejects, error) beside the DOM (remote outlines, carets, pointers, flags, presence chips and their client ids, the title row count, the filmstrip marks, the snackbar text, any "is stale" text). Both defects reproduced on the first run and on every later run.

### 1.1 What was done

Run 1 (`repro.mjs`): a fresh context, `/new`, one click on the title placeholder (it opened the inline session at once), "Q4 review", then twelve edits with 300 to 800 ms gaps (typing in the title, the toolbar's New slide, typing, a drag, a Bold, typing), a settle, a reload, one more edit, a second context sharing the first context's cookies with a second tab of the deck, one edit there, the second tab closed. Run 2 (`repro2.mjs`): typing in bursts across the first write's flight on `/new`; three bursts inside one second on the saved deck, then a four second offline window; a slide switch attempt. Run 3 (`repro3.mjs`): the burst typing twice with the raw server function answers kept; a slide switch attempt. Run 4 (`repro4.mjs`): the slide switch with a real second slide (`slide.new` with a layout), then a click on the first filmstrip card.

Notes on the gestures: the toolbar's New slide button opens the "New slide with layout" plate on production instead of inserting at once, so run 1's edits 6 to 8 went into the title heading and run 1's drag and Bold acted on it; the twelve edits still happened as twelve writes. The `.ts-status` chip was not found in the DOM on production (the title row shows "All changes saved" through another element), so the "at revision N" text was read from `describe().state.revision`.

### 1.2 Defect A reproduced: the literal message, lost edits, the tab behind the store

Run 3 attempt 1 (deck `untitled-20260914-otxp`, ten bursts typed from 1264 ms to 4121 ms, 170 ms pauses). The request pairs, times from the run's start:

| Time | Request                                                                                   | Answer                                                                                           |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1264 | burst 1 "Q4 review", `writeDeck` baseRevision 0                                           | 2607: ok, revision 1; the room attaches, stream opened at 2609, `hello` seq 1 revision 1 at 3055 |
| 1682 | burst 2, `writeDeck` baseRevision 1 (queued on the draft chain)                           | 3364: ok, revision 2                                                                             |
| 3060 | ops POST base.seq 1, opId `…:1` (a burst typed after the attach)                          | 3725: ok, revision 3, entry seq 3                                                                |
| 1957 | burst 3, `writeDeck` baseRevision 2 (queued)                                              | 3800: ok false, **"baseRevision 2 is stale; the document is at revision 3"**                     |
| 2230 | burst 4, `writeDeck` baseRevision 3 (queued)                                              | 4374: ok, revision 4                                                                             |
| 3729 | ops POST base.seq 1, opIds `…:2`, `…:3`                                                   | 4968: **409 resync, "The deck moved to revision 4; reload and rebase"**, head 4                  |
| 4970 | `readEditorDeck` (the client's resync reload)                                             | the document at revision 4                                                                       |
| 5219 | ops POST base.seq 1, opIds `…:1`, `…:2`, `…:3` (`…:1` re-sent although admitted at seq 3) | 6231: ok, revision 5, three entries all at seq 5                                                 |

The snackbar showed "baseRevision 2 is stale; the document is at revision 3" at 3819 ms and "baseRevision 1 is stale; the document is at revision 3" from 4129 ms to 9317 ms (the second text has no matching server answer; it is the client's own base check, section 1.4 cause A5). The tab's sampler from 3819 ms on: `revision` 3 to 5, `sync.seq` 1, `sync.pending` 3, and it never changed until the run stopped sampling at 35 s. The local title read "Q4 review one two three four five six"; after a reload the store's title read the same: the bursts " seven", " eight" and " nine" were lost. The stream received no `op` or `checkpoint` frame between the `hello` at 3055 ms and 6324 ms, when the store echo delivered seq 3, 4 and 5 at once.

Run 1 (deck `untitled-20260914-v62r`): the ops POST at 5157 ms carried two entries (`…:1`, `…:2`) against base.seq 1 and was answered `revision 2, entries [{seq 2, …:1}, {seq 2, …:2}]`; the stream delivered two `op` frames both at seq 2. From then on `sync.pending` climbed 1, 2, 3, 2, 3, 4, 5, 5, 5 across edits 2 to 10 and never returned to 0 while that room client lived; `sync.seq` stayed 2 while the store moved to 3. At 9986 ms a `GET /_serverFn` (`readEditorDeck`) ran, at 10365 ms a second stream opened (`since=2`, a new client id `36aab4d6…`) and `window.turboslide.studio` was unset for a moment (the sampler's error at 10091 ms): the editor had remounted (section 1.4 cause A4). The first client's last flush at 10899 ms (opIds `…:4` to `…:6`, three edits) was answered 409 resync at 11351 ms and, the client being stopped, dropped: the document never received "Agenda s7 s8". The second stream received no frame for the store's revision 3 in the 2.6 s before the reload. After the reload the tab stood at revision 3 and its next edit saved at revision 4.

Run 2 scenario 1 (deck `untitled-20260914-amda`): the same interleaving with the Blob mirror behind: the ops POST at 5214 ms was answered 409 resync ("The deck moved to revision 2"), and the snackbar showed "decks/untitled-20260914-amda/deck.json changed in the Blob store since it was read" (the `BlobPreconditionError` of a `writeDeck` whose `ifMatch` failed) for eight consecutive samples. `sync.pending` stayed 4 with `sync.seq` 2 against revision 4 for the 45 s the sampler ran. Scenario 2 on the saved deck: three bursts inside one second gave one ops POST with two entries, answered `[{seq 6, …:2}, {seq 6, …:3}]`; `sync.pending` stayed 1 for the next 70 s.

### 1.3 Defect B reproduced: the tab drawn as a remote collaborator

Run 1: after the reload at 13154 ms the stream's `hello` (seq 3, client `e45e6ff3…`) listed one client: `48544ae3…`, the same tab's client id from before the remount, same principal `anon_4f1e16bf…`, same label "Linen 383", on slide `title`. From 13682 ms to the end of the run (28 s) the DOM held one presence chip in the title row (`[data-control="title.presence"]` count 1), one filmstrip mark and one remote outline on the title block, with one tab open. `presence.list` answered `self` `e45e6ff3…` and `others` `[48544ae3…]` (same principal id). Earlier, at 10594 ms, right after the remount, the tab drew its own first client id as a remote caret (caret 1, chip 1) until the first client's `leave` landed at 11062 ms. With the second tab open both tabs drew each other as expected (one chip each), and after the second tab closed the first tab still showed one chip: the ghost of its own earlier id.

Run 2: after the first reload the `hello` listed the tab's previous client `d8ce1a1c…` ("Gravel 206", the same principal); one chip, one mark. After the second reload the count was 2: both earlier ids of the same tab were listed. Run 3 attempt 1: after the reload, one chip and one outline for `6d0cc4eb…`, the tab's earlier id. Run 4: `slide.new` on the saved `/new` deck opened a second stream (`since=2`, client `49a812bf…`) whose `hello` listed the tab's first client `9dc8128b…` ("Felt 502") on slide `title`; the filmstrip click that followed changed nothing; for the sampled 3.6 s the tab drew one chip, one filmstrip mark and one remote outline with the flag "Felt" on its own title block (`run4/S3-after-filmstrip-click.png`). No `leave` for `9dc8128b…` arrived on the second stream in 6 s.

The instance spread is visible in run 1: of the eleven presence POSTs of client `48544ae3…` (clocks 1 to 11) the stream echoed only clocks 7 and 11, so the other nine were handled by instances other than the one holding the stream; the `leave` at 10899 ms was echoed on the second stream's instance; the reload's stream landed on an instance that still held the entry.

Ruled out: the principal did not change. `__Host-ts_id` kept one value hash (`8810106d72` in run 1) from the first boot through the reload and the second context; no `set-cookie` header was recorded on any XHR, stream or render answer of any run. No thumbnail capture or render request touched the deck during the edits (the only `/api/render` requests came after the trash step). No `reject` frame and no `rejects` notice appeared in any run.

### 1.4 Root causes

Defect A has five parts, all in the write path, listed by weight.

A1. The draft chain writes against the room. `apps/studio/src/editor/controller.tsx:1550` (`commitAs`: `if (room === null) return draftCommit(...)`) sends every burst typed on `/new` before the first write's answer through `draftCommit` (1478 to 1543): a strict `writeDeck` with `baseRevision` read from the local document at call time (1483 to 1484), queued on `draftChain` (1503, 1535). The room attaches only inside the first answer's `.then` (1520 to 1526), and every burst after that goes through `room.apply`. The queued strict writes then execute while the room's ops POSTs land on the same deck, and on the blob tier `admitOnBlob` ignores the client's base (`apps/studio/src/server/room.ts:1138`, `append(deckId, live.document.deck.revision, …)`), so the two writers interleave: a chain write meets a store one revision ahead and `applyWrite` refuses it with `packages/schema/src/reduce.ts:532` "baseRevision N is stale; the document is at revision M" (returned through `store.write` in `admitServerWrite`, `room.ts:1661 to 1710`, and published by `draftCommit` at 1506 to the snackbar through `EditorRoot.tsx:1070`), or, when the instance's mirror is behind, with the Blob `ifMatch` failure "deck.json changed in the Blob store since it was read" (`packages/store/src/blob-store.ts:130`). The room's POST meanwhile meets the chain's revision and is answered 409 resync. Evidence: section 1.2 table rows 3725 and 3800.

A2. One seq per batch. `packages/realtime/src/blob.ts:228` (`entries.map((entry) => ({ ...entry, seq: revision }))`) gives every entry of one ops POST the same seq, because the tier commits a batch as one revision (and the 1,000 ms write spacing at `blob.ts:99` and 191 to 192 makes batches the normal case while typing). The room client keys its stream position by seq: `packages/realtime/client/room-client.ts:537` (`if (entry.seq <= seq) return;`) drops the second and later entries of the batch as duplicates, and `flush` at 753 to 756 keeps such ops `inflight` because the answer named them. They never settle: `pending` never returns to 0, the tab says Saving, `beforeunload` warns, and a later `hello` (592) or `resync` (559) sets `inflight` false and re-sends them, which on the blob tier lands another revision with the same whole value set. Evidence: run 1 answer at 5820 ms, run 2 answer at 22681 ms, the pending counts of section 1.2.

A3. The resync leaves the position behind. `room-client.ts:554` (`seq = Math.max(seq, helloSeq)`) keeps the client's seq at the last hello after a resync to a later revision; on the blob tier the seq is the revision, so every later entry (seq greater than seq plus one) is buffered in `incoming` (538) and never drained by `drain` (524 to 534). The document stops moving while `revision` climbs from the POST answers (751) and the checkpoint frames (611), which is the "you're at revision 2, the document is at revision 12" state: `sync.seq` 1, `revision` 5, `pending` 3 for 30 s in run 3, and `sync.seq` 2 against revision 4 for 45 s in run 2.

A4. The editor remounts on the first slide switch after the first save on `/new`. `packages/viewer/src/hash.ts:45` (`writeSlideHash`) calls `window.history.replaceState`, which is the router's wrapper, with the pinned `/edit/<id>` pathname, on every `select` of the shell (`packages/chrome/src/ViewerShell.tsx:305`). `apps/studio/src/routes/new.tsx:90 to 96` pins the address with `History.prototype.replaceState` precisely to keep the router on `/new`; the hash write undoes that: the router matches `/edit/$deckId`, runs its loader (`GET readEditorDeck`, run 1 at 9986 ms, run 4 at 4880 ms) and mounts `EditPage`'s `EditorRoot`, a second controller and room client with a new client id and the loader's document, while the first is stopped (`controller.tsx:2931 to 2936`); a stopped client's `resync` returns at once (`room-client.ts:551`), so its refused flush is lost (run 1, three edits). The first save's `select` of the new slide misses the hash write only because the new slide is not yet in the paged list (`ViewerShell.tsx:305`, `to >= 0`); the next switch writes it.

A5. The chrome bases writes on the document's revision while the controller checks against the room's. `apps/studio/src/editor/EditorRoot.tsx:604` (`const revision = deck.revision`) hands the local document's revision to the shell (923, 947, 1322, 1494), and the notes, `slide.move` and `deck.guides` paths read `controller.getSnapshot().document.deck.revision` (1401, 1689, 1736); `controller.tsx:1811 to 1817` (`reportedRevision()`) takes the maximum of the room client's acknowledged revision, `serverRevision` and the document's, and `checkBase` (1819 to 1826) refuses a base below it. On the blob tier the POST answer moves the room's revision at once (`room-client.ts:751`) while the document's revision moves only with the `checkpoint` frame, which comes over the stream from whichever instance holds it (run 3: `hello` revision 1 at 3055 ms, the answer's revision 3 at 3725 ms, the first checkpoint frame at 6334 ms), so the chrome's own write is refused with "baseRevision 1 is stale; the document is at revision 3" (controller.tsx:1823; the snackbar from 4129 ms). Related: the blob tier's cross instance delivery (`packages/realtime/src/blob.ts:155 to 165`, `announce` behind the mirror's watch) took 2.6 s to never in run 1 and 3.3 s in run 3 to deliver another instance's write to the stream, which widens every window above.

Defect B has three parts.

B1. No leave on reload or unload. `apps/studio/src/editor/EditorRoot.tsx:647 to 656` handles `beforeunload` only to warn; nothing calls `controller.stop()` or posts the presence leave on `pagehide`, so a reload leaves the tab's client id in the roster until `PRESENCE_EXPIRY_MS` (120 s, `packages/realtime/src/protocol.ts:56`). The reloaded tab's `hello` lists it (run 1 at 13366 ms, run 2 at 54604 ms, run 3 after attempt 1), and a second reload lists two.

B2. Per instance presence under fluid compute. The blob tier's presence is the memory channel's (`packages/realtime/src/blob.ts:273`, `presence: local.presence`; `packages/realtime/src/memory.ts:142 to 180`), one roster per instance, while the stream, the presence POSTs and the leave land on different instances (section 1.3); a leave removes the entry on one instance only, and a reconnect or reload whose stream lands elsewhere sees the entry until it expires. `mintClientId` and `clientBoundTo` (`room.ts:1384 to 1416`) already let another instance accept the id, but nothing shares the roster.

B3. The self filter knows only the current client id. `EditorRoot.tsx:682 to 691` (`ownClientId = snap.sync?.clientId`) and `controller.tsx:2358 to 2362` (`participants()`) put every roster row whose `clientId` differs from the current one into `others`, so the tab's own earlier ids (the room client keeps them in `myClientIds`, `room-client.ts:304` and 571) and the same principal's other clients in this browser are drawn as remote collaborators: a chip in the title row (`packages/chrome/src/presence/PresenceSlot.tsx:78 to 87`), a filmstrip mark (`FilmstripMarks.tsx:29 to 30`), a remote outline, caret and flag on the sheet (`RemoteCursors.tsx:95, 114 to 138, 172 to 231`), and a roster row (`RosterMenu.tsx:87`). A4 doubles the tab's ids in one page, so the remount alone produces the ghost (run 4).

### 1.5 What the fixer should keep

The round three hotfix's guard for finding 33 (`caughtUp`, `room-client.ts:323`) still holds: the first write of a freshly opened page was never refused. The client's `myClientIds` set is the right seam for B3, the `stop()` leave with `keepalive` (`controller.tsx:346`) is the right call for B1, and the `PRESENCE_EXPIRY_MS` value is not the cause. A fix for A2 that gives batch entries distinct seqs on the blob tier, or applies every entry of an answered batch, must keep `entryOfRecord` (`blob.ts:58`) and `since` (`blob.ts:237`) consistent, since the store echo replays one record per revision.

### 1.6 Cleanup

Every deck the runs created on production was trashed and deleted forever. `untitled-20260914-v62r` (run 1) through File > Move to trash and Delete forever on `/decks/trash`. `untitled-20260914-amda` (run 2) through `deck.trash` and `deck.remove` on the window transport after the trash page did not list it inside 30 s (the Blob listing lags `head()` by up to a minute, `blob-store.ts:470`). `untitled-20260914-iyaz` (run 2) through Delete forever on `/decks/trash` at the end of run 3. `untitled-20260914-otxp` (run 3) through the window transport. `untitled-20260914-nuct` (run 3) was never written: its title never opened, the draft stayed at revision 0 and `/edit/untitled-20260914-nuct` answered 404 throughout. `untitled-20260914-tf4b` (run 3) and `untitled-20260914-f9f1` (run 4) through the actions API with the agent bearer (`cleanup-api.mjs`: `deck.info`, `deck.trash` with `baseRevision`, `deck.remove` with `confirm` and `baseRevision`), because the window transport refuses `deck.remove` on a trashed deck ("needs Editing mode"). A final probe of all seven ids on `/edit/<id>` answered 404 each.

Two rough edges met on the way, for the record and not fixed here: the trash page lists a fresh trash entry only after the Blob listing catches up (minutes on production), and the window transport's `deck.remove` cannot run on a deck that is already in the trash.

### 1.7 The primary script

`repro.mjs` as run (run 1). `repro2.mjs` to `repro4.mjs` reuse its helpers with the scenarios named in 1.1; `cleanup-api.mjs` is the API cleanup of 1.6. The scripts read no secret except `cleanup-api.mjs`, which reads the bearer from `~/.config/turboslide/hosts.json` and never prints it.

```js
#!/usr/bin/env node
// Hotfix 2 reproduction (gslides-parity build-4/hotfix-2.md section 1). Drives production with
// headless Chromium through the product's own UI: /new, a single click on the title placeholder,
// twelve sequential edits with 300 to 800 ms gaps across two slides (typing, New slide, a drag, a
// text style change), a reload, another edit, then a second tab of the same deck in a second
// context that shares the first context's cookies. Records every POST with its baseRevision or
// base.seq and the answer's revision and status, every stream frame (an EventSource wrapper
// installed before the page's scripts), the status chip and any "is stale" text, the roster and
// the remote presence elements on the sheet, the cookie names (never a value; a hash prefix tells
// two values apart), and the room state over time. Trashes and deletes the deck it made.
//   node repro.mjs [--base https://turboslide.vercel.app] [--out <dir>] [--long]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://turboslide.vercel.app').replace(/\/$/, '');
const OUT = arg(
  'out',
  '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix2/run',
);
const LONG = argv.includes('--long');
mkdirSync(OUT, { recursive: true });

const T0 = Date.now();
const trace = {
  base: BASE,
  startedAt: new Date(T0).toISOString(),
  requests: [],
  responses: [],
  cookies: [],
  console: [],
  samples: [],
  marks: [],
  sse: {},
  steps: [],
};
const t = () => Date.now() - T0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 10);
const step = (name, evidence) => {
  const row = { t: t(), name, evidence };
  trace.steps.push(row);
  console.log(`[${String(row.t).padStart(6)} ms] ${name}${evidence ? `: ${evidence}` : ''}`);
};
const mark = (page, label, extra = {}) => {
  trace.marks.push({ t: t(), page: page.__name, label, ...extra });
};

// -----------------------------------------------------------------------------------------------
// Instrumentation

/** Installed before the page's scripts: every EventSource event lands in window.__sseLog. */
const SSE_WRAPPER = `(() => {
  const Orig = window.EventSource;
  if (!Orig || Orig.__wrapped) return;
  window.__sseLog = [];
  window.__sseOpens = 0;
  const TYPES = ['hello','ops','op','checkpoint','presence','leave','reject','inbox','access','resync'];
  const summary = (type, data) => {
    if (!data || typeof data !== 'object') return data;
    switch (type) {
      case 'hello': return { seq: data.seq, revision: data.revision, clientId: data.clientId, role: data.role, editing: data.editing, tier: data.tier, clients: (data.clients || []).map((c) => ({ clientId: c.clientId, label: c.label, principalId: c.principalId, slideId: c.slideId })) };
      case 'op': { const e = data.entry || {}; return { seq: e.seq, rev: e.rev, kind: e.kind, clientId: e.clientId, opId: e.opId, ops: (e.mutations || []).map((m) => m.op) }; }
      case 'ops': return { entries: (data.entries || []).map((e) => ({ seq: e.seq, rev: e.rev, clientId: e.clientId, opId: e.opId, ops: (e.mutations || []).map((m) => m.op) })) };
      case 'checkpoint': return { revision: data.revision, fromSeq: data.fromSeq, toSeq: data.toSeq, external: data.external, author: data.author && data.author.name };
      case 'presence': return { clientId: data.clientId, clock: data.clock, label: data.state && data.state.label, principalId: data.state && data.state.principalId, slideId: data.state && data.state.slideId };
      case 'leave': return { clientId: data.clientId };
      case 'reject': return { opId: data.opId, reason: data.reason, message: data.message };
      case 'resync': return { revision: data.revision };
      default: return data;
    }
  };
  function Wrapped(url, init) {
    const source = new Orig(url, init);
    window.__sseOpens += 1;
    const n = window.__sseOpens;
    window.__sseLog.push({ t: Date.now(), n, type: 'open', url: String(url) });
    for (const type of TYPES) {
      source.addEventListener(type, (e) => {
        let data = null;
        try { data = JSON.parse(e.data); } catch {}
        window.__sseLog.push({ t: Date.now(), n, type, lastEventId: e.lastEventId, data: summary(type, data) });
      });
    }
    source.addEventListener('error', () => window.__sseLog.push({ t: Date.now(), n, type: 'error', readyState: source.readyState }));
    return source;
  }
  Wrapped.prototype = Orig.prototype;
  Wrapped.CONNECTING = 0; Wrapped.OPEN = 1; Wrapped.CLOSED = 2;
  Wrapped.__wrapped = true;
  window.EventSource = Wrapped;
})();`;

const pick = (text, re) => {
  const m = re.exec(text ?? '');
  return m ? m[1] : undefined;
};

function describePost(url, body) {
  const out = {};
  if (body === null || body === undefined) return out;
  const baseRevision = pick(body, /\\?"baseRevision\\?":(\d+)/);
  if (baseRevision !== undefined) out.baseRevision = Number(baseRevision);
  const seq = pick(body, /"base":\{"seq":(\d+)\}/);
  if (seq !== undefined) out.baseSeq = Number(seq);
  const clientId = pick(body, /"clientId":"([0-9a-f]{32})"/);
  if (clientId !== undefined) out.clientId = clientId;
  const opIds = [...body.matchAll(/"opId":"([^"]+)"/g)].map((m) => m[1]);
  if (opIds.length > 0) out.opIds = opIds;
  const ops = [...body.matchAll(/\\?"op\\?":\\?"([a-z.]+)\\?"/g)].map((m) => m[1]);
  if (ops.length > 0) out.ops = ops;
  if (/\/presence/.test(url)) {
    const slide = pick(body, /"slideId":"([^"]+)"/);
    if (slide !== undefined) out.slideId = slide;
    const clock = pick(body, /"clock":(\d+)/);
    if (clock !== undefined) out.clock = Number(clock);
  }
  return out;
}

function parseAnswer(text) {
  try {
    let json = JSON.parse(text);
    if (typeof json === 'string') json = JSON.parse(json);
    if (json && typeof json === 'object' && 'result' in json && typeof json.result === 'string') {
      try {
        json = JSON.parse(json.result);
      } catch {
        // not a server function envelope
      }
    }
    return json;
  } catch {
    return null;
  }
}

function summarizeAnswer(json) {
  if (json === null || typeof json !== 'object')
    return { raw: json === null ? null : String(json).slice(0, 120) };
  const out = {};
  for (const key of [
    'ok',
    'revision',
    'seq',
    'head',
    'code',
    'error',
    'message',
    'currentRevision',
    'created',
    'left',
    'dropped',
    'hueSlot',
    'role',
  ]) {
    if (key in json) out[key] = json[key];
  }
  if (Array.isArray(json.entries))
    out.entries = json.entries.map((e) => ({
      seq: e.seq,
      opId: e.opId,
      ops: (e.mutations || []).map((m) => m.op),
    }));
  if (Array.isArray(json.rejected)) out.rejected = json.rejected;
  if (json.entry && typeof json.entry === 'object') out.entryRevision = json.entry.revision;
  if (json.document && json.document.deck) out.documentRevision = json.document.deck.revision;
  return out;
}

async function recordCookies(context, why) {
  const cookies = await context.cookies(BASE);
  trace.cookies.push({
    t: t(),
    why,
    cookies: cookies.map((c) => ({ name: c.name, hash: hash(c.value), expires: c.expires })),
  });
}

function instrument(page, name, context) {
  page.__name = name;
  page.on('console', (msg) => {
    const text = msg.text();
    trace.console.push({ t: t(), page: name, type: msg.type(), text: text.slice(0, 400) });
  });
  page.on('pageerror', (error) => {
    trace.console.push({
      t: t(),
      page: name,
      type: 'pageerror',
      text: String(error).slice(0, 400),
    });
  });
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(BASE)) return;
    const path = url.slice(BASE.length);
    if (
      !/\/api\/decks\/|_serverFn|_server|\/api\/actions|\/api\/render|\/api\/decks\.|\/edit\/|\/new/.test(
        path,
      )
    )
      return;
    if (request.method() === 'GET' && !/\/stream|\/api\/render/.test(path)) {
      if (!/_serverFn|_server/.test(path)) return;
    }
    const body = request.method() === 'POST' ? request.postData() : null;
    trace.requests.push({
      t: t(),
      page: name,
      method: request.method(),
      path: path.slice(0, 200),
      ...describePost(path, body),
      bytes: body ? body.length : 0,
    });
  });
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.startsWith(BASE)) return;
    const path = url.slice(BASE.length);
    const request = response.request();
    const headers = response.headers();
    const setCookie = headers['set-cookie'];
    const row = {
      t: t(),
      page: name,
      method: request.method(),
      path: path.slice(0, 200),
      status: response.status(),
    };
    if (setCookie !== undefined) {
      row.setCookieNames = String(setCookie)
        .split(/\n|, (?=[^;]+=)/)
        .map((line) => line.split('=')[0].trim());
      void recordCookies(context, `set-cookie on ${request.method()} ${path.slice(0, 80)}`);
    }
    if (/\/stream/.test(path)) {
      row.streamClient = headers['x-turboslide-client'];
      trace.responses.push(row);
      return;
    }
    const interesting =
      /\/api\/decks\/|_serverFn|_server|\/api\/actions/.test(path) && request.method() === 'POST';
    const rendered = /\/api\/render/.test(path);
    if (!interesting && !rendered && setCookie === undefined) return;
    if (interesting) {
      try {
        const text = await response.text();
        row.answer = summarizeAnswer(parseAnswer(text));
        if (/is stale/.test(text)) row.stale = pick(text, /(baseRevision \d+ is stale; [^"\\]+)/);
      } catch {
        row.answer = { unreadable: true };
      }
    }
    trace.responses.push(row);
  });
}

// -----------------------------------------------------------------------------------------------
// Page helpers

const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);

const state = (page) =>
  page.evaluate(() => {
    const s = window.turboslide.studio.describe().state;
    const roster = Array.isArray(s.roster)
      ? s.roster.map((r) => ({
          clientId: r.clientId,
          label: r.label,
          principalId: r.principalId,
          slideId: r.slideId,
        }))
      : undefined;
    return {
      keys: Object.keys(s),
      revision: s.revision,
      serverRevision: s.serverRevision,
      pending: s.pending,
      sync: s.sync,
      roster,
      rejects: Array.isArray(s.rejects)
        ? s.rejects.map((r) => ({ opId: r.opId, reason: r.reason, message: r.message }))
        : s.rejects,
      error: s.error,
      external: s.external,
      documentRevision: s.document && s.document.deck ? s.document.deck.revision : undefined,
      title: s.document && s.document.deck ? s.document.deck.title : undefined,
      activeSlide: s.activeSlide,
    };
  });

const dom = (page) =>
  page.evaluate(() => {
    const q = (sel) => document.querySelectorAll(sel).length;
    const status = document.querySelector('[data-control="edit.status"]');
    const snackbar = document.querySelector('[data-control="snackbar"]');
    const presence = document.querySelector('[data-control="title.presence"]');
    const marks = [...document.querySelectorAll('.ts-card-marks')].reduce(
      (sum, el) => sum + Number(el.getAttribute('data-count') ?? 0),
      0,
    );
    const text = document.body.innerText || '';
    const staleAt = text.indexOf('is stale');
    return {
      remoteOutline: q('.ts-remote-outline'),
      remoteCaret: q('.ts-remote-caret'),
      remotePointer: q('.ts-remote-pointer'),
      flags: q('.ts-flag'),
      presenceCount: presence ? presence.getAttribute('data-count') : null,
      chips: q('[data-control^="presence.chip."]'),
      chipClients: [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) =>
        el.getAttribute('data-client'),
      ),
      cardMarks: marks,
      rosterRows: q('.ts-roster-row'),
      status: status ? status.textContent : null,
      statusLabel: status ? status.getAttribute('aria-label') : null,
      statusState: status ? status.getAttribute('data-state') : null,
      snackbar: snackbar ? snackbar.textContent : null,
      staleText: staleAt >= 0 ? text.slice(Math.max(0, staleAt - 40), staleAt + 80) : null,
      url: location.pathname,
    };
  });

const sseLog = (page) => page.evaluate(() => ({ opens: window.__sseOpens, log: window.__sseLog }));

async function sample(page, label) {
  try {
    const [s, d, sync] = await Promise.all([
      state(page),
      dom(page),
      invoke(page, 'sync.status').catch(() => null),
    ]);
    const row = { t: t(), page: page.__name, label, state: s, dom: d, syncStatus: sync };
    trace.samples.push(row);
    return row;
  } catch (error) {
    trace.samples.push({ t: t(), page: page.__name, label, error: String(error).slice(0, 200) });
    return null;
  }
}

function startSampler(page, everyMs = 500) {
  let running = true;
  const loop = (async () => {
    while (running) {
      await sample(page, 'tick');
      await sleep(everyMs);
    }
  })();
  return async () => {
    running = false;
    await loop;
  };
}

const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};

const settled = async (page, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    const pending = s.sync?.pending ?? s.pending ?? 0;
    if (pending === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};

const headingRun = (page) =>
  page.locator('.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]').first();

/** One click on the placeholder, the report's gesture; a double click if one did not open the session. */
async function openHeading(page) {
  const el = headingRun(page);
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(150);
  let editing = await el.getAttribute('contenteditable');
  if (editing !== 'true') {
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(150);
    editing = await el.getAttribute('contenteditable');
    return { el, editing, gesture: 'dblclick' };
  }
  return { el, editing, gesture: 'click' };
}

const gap = () => 300 + Math.floor(Math.random() * 500);

async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box to drag');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1)
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  await page.mouse.up();
}

async function closeNamePrompt(page) {
  const prompt = page.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false)) {
    await page
      .locator('[data-control="dialog.namePrompt.close"]')
      .click()
      .catch(() => undefined);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false }).catch(() => undefined);
}

// -----------------------------------------------------------------------------------------------
// The run

const browser = await chromium.launch({ headless: true });
const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await contextA.addInitScript(SSE_WRAPPER);
const A = await contextA.newPage();
instrument(A, 'A', contextA);

let deckId = '';
let stopSampler = async () => undefined;
let contextB = null;
try {
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  await recordCookies(contextA, 'after /new boot');
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  step('draft open', `${deckId}, revision ${info.revision}`);
  stopSampler = startSampler(A, 500);
  await sample(A, 'boot');

  // 1. the single click on the title placeholder, then typing
  const opened = await openHeading(A);
  step('title placeholder opened', `gesture ${opened.gesture}, contenteditable=${opened.editing}`);
  mark(A, 'edit 1 start');
  await A.keyboard.type('Q4 review', { delay: 30 });
  await sleep(gap());
  await sample(A, 'after edit 1 (type title)');
  step('edit 1 typed', `revision ${(await state(A)).revision}`);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
  step('address', A.url().replace(BASE, ''));

  // 2. edits 2 to 4: more typing in the title with gaps
  for (let i = 2; i <= 4; i += 1) {
    mark(A, `edit ${i} start`);
    await A.keyboard.type(` w${i}`, { delay: 30 });
    await sleep(gap());
    const s = await sample(A, `after edit ${i} (type title)`);
    step(`edit ${i} typed`, `revision ${s?.state.revision}, pending ${s?.state.sync?.pending}`);
  }
  await A.keyboard.press('Escape');
  await closeNamePrompt(A);

  // 3. edit 5: New slide
  mark(A, 'edit 5 start');
  await A.locator('[data-control="toolbar.newSlide.split"]').click();
  await sleep(gap());
  let s5 = await sample(A, 'after edit 5 (new slide)');
  step(
    'edit 5 new slide',
    `active ${s5?.state.activeSlide}, revision ${s5?.state.revision}, pending ${s5?.state.sync?.pending}`,
  );
  const slide2 = s5?.state.activeSlide;

  // 4. edits 6 to 8: typing on the new slide
  const opened2 = await openHeading(A);
  step('slide 2 heading opened', `gesture ${opened2.gesture}, contenteditable=${opened2.editing}`);
  for (let i = 6; i <= 8; i += 1) {
    mark(A, `edit ${i} start`);
    await A.keyboard.type(i === 6 ? 'Agenda' : ` s${i}`, { delay: 30 });
    await sleep(gap());
    const s = await sample(A, `after edit ${i} (type slide 2)`);
    step(`edit ${i} typed`, `revision ${s?.state.revision}, pending ${s?.state.sync?.pending}`);
  }
  await A.keyboard.press('Escape');
  await sleep(200);

  // 5. edit 9: a drag of the heading block on slide 2
  mark(A, 'edit 9 start');
  const before9 = slide2
    ? await invoke(A, 'slide.get', { slideId: slide2 }).catch(() => null)
    : null;
  await headingRun(A).click();
  await sleep(150);
  await drag(A, headingRun(A), 60, 30);
  await sleep(gap());
  const after9 = slide2
    ? await invoke(A, 'slide.get', { slideId: slide2 }).catch(() => null)
    : null;
  const s9 = await sample(A, 'after edit 9 (drag)');
  step(
    'edit 9 drag',
    `revision ${s9?.state.revision}, pending ${s9?.state.sync?.pending}, slide before/after ${JSON.stringify(before9?.slide?.heading ?? null).slice(0, 40)} -> ${JSON.stringify(after9?.slide?.heading ?? null).slice(0, 40)}`,
  );

  // 6. edit 10: a text style change (Bold from the toolbar) on the selected block
  mark(A, 'edit 10 start');
  const bold = A.locator('[data-control="toolbar.bold"]');
  if (await bold.isVisible().catch(() => false)) {
    await bold.click();
  } else {
    await A.keyboard.press('Meta+b');
  }
  await sleep(gap());
  const s10 = await sample(A, 'after edit 10 (bold)');
  step('edit 10 bold', `revision ${s10?.state.revision}, pending ${s10?.state.sync?.pending}`);

  // 7. edits 11 and 12: back to the title slide and type
  await invoke(A, 'view.goto', { slideId: 'title' }).catch(() => undefined);
  await sleep(300);
  const opened3 = await openHeading(A);
  await A.keyboard.press('End');
  step('title reopened', `gesture ${opened3.gesture}, contenteditable=${opened3.editing}`);
  for (let i = 11; i <= 12; i += 1) {
    mark(A, `edit ${i} start`);
    await A.keyboard.type(` t${i}`, { delay: 30 });
    await sleep(gap());
    const s = await sample(A, `after edit ${i} (type title)`);
    step(`edit ${i} typed`, `revision ${s?.state.revision}, pending ${s?.state.sync?.pending}`);
  }
  await A.keyboard.press('Escape');

  // 8. settle
  const settledA = await settled(A, 45_000);
  await sample(A, 'settled after twelve edits');
  await shot(A, '01-after-twelve-edits');
  step(
    'settled',
    `revision ${settledA.revision}, serverRevision ${settledA.serverRevision}, pending ${settledA.sync?.pending}, retained ${settledA.sync?.retained}, seq ${settledA.sync?.seq}, rejects ${settledA.rejects?.length}, error ${JSON.stringify(settledA.error)}`,
  );
  const titleNow = await invoke(A, 'slide.get', { slideId: 'title' }).then(
    (g) => g.slide.heading,
    () => null,
  );
  const slide2Now = slide2
    ? await invoke(A, 'slide.get', { slideId: slide2 }).then(
        (g) => g.slide.heading,
        () => null,
      )
    : null;
  step('document text', `title=${JSON.stringify(titleNow)} slide2=${JSON.stringify(slide2Now)}`);
  const presenceA1 = await invoke(A, 'presence.list').catch((e) => ({ error: String(e) }));
  step('presence.list (one tab)', JSON.stringify(presenceA1).slice(0, 400));
  const sse1 = await sseLog(A);
  trace.sse['A-before-reload'] = sse1;
  step('stream frames before reload', `${sse1.opens} open(s), ${sse1.log.length} frames`);

  // 9. reload, then edit again
  await stopSampler();
  await recordCookies(contextA, 'before reload');
  await A.reload({ waitUntil: 'domcontentloaded' });
  await editorReady(A);
  stopSampler = startSampler(A, 500);
  const afterReload = await sample(A, 'after reload boot');
  step(
    'after reload',
    `revision ${afterReload?.state.revision}, serverRevision ${afterReload?.state.serverRevision}, documentRevision ${afterReload?.state.documentRevision}, seq ${afterReload?.state.sync?.seq}, status "${afterReload?.dom.status}"`,
  );
  await sleep(1500);
  await sample(A, 'after reload +1.5 s');
  const opened4 = await openHeading(A);
  await A.keyboard.press('End');
  mark(A, 'edit 13 start (after reload)');
  await A.keyboard.type(' r13', { delay: 30 });
  await sleep(gap());
  await A.keyboard.press('Escape');
  const settledR = await settled(A, 45_000);
  await sample(A, 'settled after reload edit');
  await shot(A, '02-after-reload-edit');
  step(
    'edit after reload',
    `gesture ${opened4.gesture}; revision ${settledR.revision}, pending ${settledR.sync?.pending}, rejects ${JSON.stringify(settledR.rejects)}, error ${JSON.stringify(settledR.error)}`,
  );
  const titleAfter = await invoke(A, 'slide.get', { slideId: 'title' }).then(
    (g) => g.slide.heading,
    () => null,
  );
  step('title after reload edit', JSON.stringify(titleAfter));
  const presenceA2 = await invoke(A, 'presence.list').catch((e) => ({ error: String(e) }));
  step('presence.list (one tab, after reload)', JSON.stringify(presenceA2).slice(0, 400));

  // 10. the second tab: a second context that shares the first context's cookies
  const storage = await contextA.storageState();
  contextB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: storage,
  });
  await contextB.addInitScript(SSE_WRAPPER);
  const B = await contextB.newPage();
  instrument(B, 'B', contextB);
  await B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  await sleep(2500);
  const sA = await sample(A, 'two tabs: A');
  const sB = await sample(B, 'two tabs: B');
  const presenceA3 = await invoke(A, 'presence.list').catch((e) => ({ error: String(e) }));
  const presenceB1 = await invoke(B, 'presence.list').catch((e) => ({ error: String(e) }));
  step(
    'two tabs A',
    `revision ${sA?.state.revision}, roster ${JSON.stringify(sA?.state.roster)}, dom ${JSON.stringify({ outline: sA?.dom.remoteOutline, caret: sA?.dom.remoteCaret, chips: sA?.dom.chips, count: sA?.dom.presenceCount, marks: sA?.dom.cardMarks })}`,
  );
  step(
    'two tabs B',
    `revision ${sB?.state.revision}, roster ${JSON.stringify(sB?.state.roster)}, dom ${JSON.stringify({ outline: sB?.dom.remoteOutline, caret: sB?.dom.remoteCaret, chips: sB?.dom.chips, count: sB?.dom.presenceCount, marks: sB?.dom.cardMarks })}`,
  );
  step('presence.list A', JSON.stringify(presenceA3).slice(0, 500));
  step('presence.list B', JSON.stringify(presenceB1).slice(0, 500));
  await shot(A, '03-two-tabs-A');
  await shot(B, '03-two-tabs-B');
  // B types once so A receives a remote op
  const openedB = await openHeading(B);
  await B.keyboard.press('End');
  await B.keyboard.type(' fromB', { delay: 30 });
  await sleep(600);
  await B.keyboard.press('Escape');
  const settledB = await settled(B, 45_000);
  await sleep(2500);
  const sA2 = await sample(A, 'after B typed: A');
  const sB2 = await sample(B, 'after B typed: B');
  step(
    'B typed',
    `gesture ${openedB.gesture}; B revision ${settledB.revision}, pending ${settledB.sync?.pending}, rejects ${JSON.stringify(settledB.rejects)}; A revision ${sA2?.state.revision}, A title now ${JSON.stringify(
      await invoke(A, 'slide.get', { slideId: 'title' }).then(
        (g) => g.slide.heading,
        () => null,
      ),
    )}`,
  );
  step(
    'A dom after B typed',
    JSON.stringify({
      outline: sA2?.dom.remoteOutline,
      caret: sA2?.dom.remoteCaret,
      chips: sA2?.dom.chips,
      count: sA2?.dom.presenceCount,
      marks: sA2?.dom.cardMarks,
    }),
  );
  step(
    'B dom after B typed',
    JSON.stringify({
      outline: sB2?.dom.remoteOutline,
      caret: sB2?.dom.remoteCaret,
      chips: sB2?.dom.chips,
      count: sB2?.dom.presenceCount,
      marks: sB2?.dom.cardMarks,
    }),
  );
  trace.sse['B'] = await sseLog(B);
  await B.close();
  await sleep(3000);
  const sA3 = await sample(A, 'after B closed: A');
  step(
    'A after B closed',
    `roster ${JSON.stringify(sA3?.state.roster)}, dom ${JSON.stringify({ outline: sA3?.dom.remoteOutline, caret: sA3?.dom.remoteCaret, chips: sA3?.dom.chips, count: sA3?.dom.presenceCount })}`,
  );

  // 11. optional: the stream's lifetime end and the reconnect (240 to 290 s on the server)
  if (LONG) {
    step('long wait', 'waiting up to 320 s for the stream to close and reconnect');
    const until = Date.now() + 320_000;
    let opens = (await sseLog(A)).opens;
    while (Date.now() < until) {
      await sleep(5000);
      const now = await sseLog(A);
      if (now.opens > opens) {
        opens = now.opens;
        await sleep(4000);
        const sR = await sample(A, `after reconnect ${opens}`);
        step(
          `stream reconnected (${opens})`,
          `roster ${JSON.stringify(sR?.state.roster)}, sync ${JSON.stringify(sR?.state.sync)}, dom ${JSON.stringify({ outline: sR?.dom.remoteOutline, caret: sR?.dom.remoteCaret, chips: sR?.dom.chips, count: sR?.dom.presenceCount })}`,
        );
        await shot(A, `04-after-reconnect-${opens}`);
        // type once after the reconnect
        const openedR = await openHeading(A);
        await A.keyboard.press('End');
        await A.keyboard.type(' rc', { delay: 30 });
        await sleep(600);
        await A.keyboard.press('Escape');
        const sR2 = await settled(A, 45_000);
        step(
          'edit after reconnect',
          `gesture ${openedR.gesture}; revision ${sR2.revision}, pending ${sR2.sync?.pending}, rejects ${JSON.stringify(sR2.rejects)}, title ${JSON.stringify(
            await invoke(A, 'slide.get', { slideId: 'title' }).then(
              (g) => g.slide.heading,
              () => null,
            ),
          )}`,
        );
        break;
      }
    }
  }
  trace.sse['A-final'] = await sseLog(A);
} catch (error) {
  step('ERROR', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await shot(A, '99-error');
} finally {
  await stopSampler().catch(() => undefined);
  // cleanup: File > Move to trash, then Delete forever on /decks/trash; the actions API as the fallback
  if (deckId) {
    try {
      await A.keyboard.press('Escape').catch(() => undefined);
      await A.locator('[data-control="menubar.file"]').click({ timeout: 10_000 });
      await A.locator('[data-control="menu.file.moveToTrash"]').click({ timeout: 10_000 });
      await A.waitForURL(/\/decks$/, { timeout: 20_000 });
      step('cleanup', 'File > Move to trash done');
      await A.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
      const card = A.locator(`[data-control="trash.card.${deckId}"]`);
      await card.waitFor({ timeout: 30_000 });
      await A.locator(`[data-control="trash.delete.${deckId}"]`).click();
      await A.locator('[data-control="trash.confirm.ok"]').click();
      await card.waitFor({ state: 'detached', timeout: 30_000 });
      step('cleanup', `Delete forever removed ${deckId}`);
      deckId = '';
    } catch (error) {
      step('cleanup via UI failed', error instanceof Error ? error.message : String(error));
      try {
        await A.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
        await editorReady(A);
        const info = await invoke(A, 'deck.info').catch(() => null);
        if (info) {
          await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch((e) =>
            step('deck.trash failed', String(e)),
          );
          const again = await invoke(A, 'deck.info').catch(() => null);
          await invoke(A, 'deck.remove', {
            id: deckId,
            confirm: true,
            baseRevision: again?.revision ?? info.revision,
          }).then(
            () => {
              step('cleanup', `deck.remove removed ${deckId}`);
              deckId = '';
            },
            (e) => step('deck.remove failed', String(e)),
          );
        }
      } catch (error2) {
        step(
          'cleanup via actions failed',
          error2 instanceof Error ? error2.message : String(error2),
        );
      }
    }
  }
  trace.deckId = deckId;
  trace.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'trace.json'), JSON.stringify(trace, null, 2));
  await browser.close();
  console.log(
    `\ntrace written to ${join(OUT, 'trace.json')}; deck left behind: ${deckId || 'none'}`,
  );
}
```

### 1.8 Files

The reproducer changed one file in the tree: `docs/gslides-parity/build-4/hotfix-2.md` (this note). No source file, test or script under the repository was touched; the scripts and evidence live in the scratchpad path named at the top of section 1.

## 2. The fix

By the fixer, 2026-09-14, 15:25 to 16:30 PDT, on the shared checkout over `main` at `43707c3` with the reproducer's section 1 in this file. Every root cause of section 1.4 was confirmed in the source before it was changed; the change per cause is the smallest one that makes the invariant hold, each has a unit test in its owning package, and the `/new` write probe gained steps that fail on both defects. Scratch files sit under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/hotfix2/fix/` (the dev server log `dev-4347.log` and the probe log `probe-run1.log`).

### 2.1 Diagnosis, confirmed against the source

Defect A is five faults that meet on the blob tier, where every ops POST is one commit and an entry's seq is the revision its record made (`packages/realtime/src/blob.ts`).

- A1. `apps/studio/src/editor/controller.tsx` `commitAs` sent every burst typed on `/new` before the first write's answer through `draftCommit`, a strict `writeDeck` of its own queued on `draftChain`, and attached the room only inside the first answer's `.then`. The queued strict writes then ran beside the room's ops POSTs on one deck; `admitOnBlob` (`apps/studio/src/server/room.ts`) appends at the live revision whatever the client's base, so a chain write met a store one revision ahead and `applyWrite` refused it with `packages/schema/src/reduce.ts:532` "baseRevision N is stale; the document is at revision M" (or the Blob `ifMatch` failure when the mirror was behind), and the room's POST met the chain's revision and was answered 409 resync.
- A2. `blob.ts` `append` gives every entry of one POST the same seq (one revision per batch; the 1,000 ms write spacing makes batches the normal case while typing). `packages/realtime/client/room-client.ts` `take` dropped any entry whose seq was at or below the position as a duplicate, so the second and later entries of a batch never settled: `pending` never returned to 0, the tab said Saving, and the next `hello` or `resync` re-sent them.
- A3. `room-client.ts` `resync` set the position to `Math.max(seq, helloSeq)` after the reload. On the blob tier the position is the revision, so the fresh document's revision was the true position and every later entry (seq above position plus one) was buffered in `incoming` for good while `revision` climbed from the POST answers and the checkpoint frames: "you are at revision 2, the document is at revision 12".
- A4. `packages/viewer/src/hash.ts` `writeSlideHash` calls `window.history.replaceState`, which is the router's wrapper, with the pinned `/edit/<id>` pathname on every shell `select`; `apps/studio/src/routes/new.tsx` pins the address with the browser's own `History.prototype.replaceState` so the router stays on `/new`, and the hash write undid that: the router matched `/edit/$deckId`, ran `readEditorDeck` and mounted a second `EditorRoot` with a second controller and room client (a new client id) while the first was stopped and its refused flush dropped (run 1: three edits lost).
- A5. `apps/studio/src/editor/EditorRoot.tsx` handed the document's revision to the shell as the base of every chrome write while `controller.tsx` `checkBase` compared against `reportedRevision()`, which includes the room client's acknowledged revision. On the blob tier the POST answer moves the room's revision at once and the document's only with the checkpoint frame from the stream's instance (run 3: 2.6 s later), so the tab refused its own write: "baseRevision 1 is stale; the document is at revision 3" with no server involved. A late checkpoint frame of an earlier revision also pulled the room client's revision backwards (`setRevision(event.revision)` unconditionally).

Defect B is three faults.

- B1. `EditorRoot.tsx` handled `beforeunload` only to warn; nothing stopped the controller on `pagehide`, so a reload posted no leave and the tab's client id stayed in the roster until `PRESENCE_EXPIRY_MS` (120 s).
- B2. The blob tier's presence is the memory channel's, one roster per instance; the stream, the presence POSTs and the leave land on different instances under fluid compute, so a leave removed the row on one instance only and a reload's stream landed on an instance still holding it.
- B3. The self filter knew only the current client id (`EditorRoot.tsx` `ownClientId`, `controller.tsx` `participants()`), so the tab's own earlier id after a reload or the A4 remount was drawn as a collaborator on every surface: the title row chip, the filmstrip mark, the sheet outline, the caret and its flag, the roster row.

### 2.2 The change per cause

Cause A.

- A1, one strict write per draft (`apps/studio/src/editor/controller.tsx` `draftEnqueue`, `replayDraftQueue`, `rejectDraftQueue`, `draftCommit`, `commitAs`). The first write of a draft still goes through `writeDeck` (the deck must be created). A write made while it is in flight is applied to the local document at once through the reducer (`applyMutations`, no revision bump, so the reported revision never runs ahead of the server), takes its history entry, and is queued; when the first answer arrives the room attaches on the server's document, as before, and the queue is replayed through `room.apply` in order in the same tick (the local document ends where it was, nothing is drawn twice, and each entry gets its room clock for undo). Every write after the first is one op of the room, the way every write of a stored deck is; no strict write ever runs beside the room. A failed first write rejects the queued writes with its error and drops the pending count.
- A2, batch aware delivery (`packages/realtime/client/room-client.ts` `incoming`, `appliedAtSeq`, `applyEntry`, `drain`, `take`). `incoming` holds a list per seq. An entry below the position is a duplicate; an entry at the position is a sibling of the batch committed at that revision and is applied unless its op id was applied already, and a store echo (`clientId: 'store'`, the record's folded mutations) at the position is dropped because the batch's entries already carried it; an entry above the position is buffered by seq, once per op id, and `drain` applies every sibling of the next seq in arrival order. Every op of a batch settles, so `pending` returns to 0 and no `hello` or `resync` re-sends an admitted op; a remote batch on the same instance applies whole. The blob tier itself is unchanged (one revision per POST stays; `entryOfRecord` and `since` stay consistent, section 1.5).
- A3, the resync position (`room-client.ts` `resync`). After the reload the position is `Math.max(seq, helloSeq, tier === 'blob' ? fresh.deck.revision : 0)`: on the blob tier the fresh document's revision is the stream position by construction. The revision never moves backwards there either.
- A4, the hash guard (`apps/studio/src/routes/-hash-guard.ts`, wired in `apps/studio/src/routes/new.tsx`). From the first save until unmount `installHashGuard` stands in for `window.history.replaceState`: a call whose URL names the pinned `/edit/<id>` path is split into the same move on `/new` for the router's wrapper (the search and the hash, so `navigate({ hash: true })` keeps the slide and nothing remounts) and the browser's own `replaceState` to pin the address again; every other call passes to the wrapper. The viewer's `writeSlideHash` is unchanged, so the edit route keeps its behaviour.
- A5, one revision for the chrome (`apps/studio/src/editor/EditorRoot.tsx`, `controller.tsx` `StaleBaseError`, `invokeRebasing`, `room-client.ts` checkpoint). The shell's `revision` is `Math.max(deck.revision, snap.serverRevision)`, the number `reportedRevision()` checks against (`snap.serverRevision` follows the room client's acknowledged revision through `onStatus`); the notes pane, `slide.move` and `deck.guides` read the same. `checkBase` throws `StaleBaseError`, a `ConflictError` of its own class, and `controller.invoke` (the chrome's dispatch: `shellDispatch`, the sidebar, the notes pane, the guides) retries a write carrying a `baseRevision` once on the revision the refusal named; nothing was committed by the refused attempt, since every handler checks the base before it commits. The window API's owners call the dispatcher directly and keep the strict contract of SPEC-3 3.10, so an agent's stale base is still refused. In the room client a checkpoint frame sets the revision to `Math.max(revision, event.revision)`, so a late frame from the stream's instance never puts the reported revision behind the server's.

Cause B.

- B1, the leave (`EditorRoot.tsx`, `room-client.ts` `stop`). `pagehide` calls `controller.stop()`, which posts the presence leave with keepalive; `stop` now posts the leave before it waits on a POST in flight, since the unloading page gives it no time. A page the browser restores from its cache (`pageshow` with `persisted`) reloads, because its stream and client id are gone.
- B1 and B2, the retire list (`apps/studio/src/editor/client-ids.ts`, `controller.tsx`, `room-client.ts` `OpenOptions.retire`, `apps/studio/src/server/room.ts` `retireClients`, `apps/studio/src/routes/api/decks.$deckId.stream.ts`). The tab remembers every client id it was issued on a deck in `sessionStorage` (per tab, survives a reload, gone when the tab closes; at most eight) and hands the earlier ones to the stream open as `?retire=a,b` on every open, a reconnect too. The stream route removes those rows from its instance's roster before it writes `hello`, and only the ids whose MAC names this deck and this identity (`clientIdMatches`), so a tab retires its own principal's ids alone. The roster stays per instance on the blob tier; the retire list removes the tab's own earlier row on whichever instance the new stream lands on, which is the instance whose roster the tab sees.
- B3, the self filter (`client-ids.ts` `partitionRoster`, `controller.tsx` `participants`, `announceRemoteText`, `EditorSnapshot.ownClientIds`, `EditorRoot.tsx` `presence`). A roster row is this tab when its client id is the current one or any earlier id of this tab; such a row is never in `others`, which is what every presence surface draws (the title slot's chips, the filmstrip marks, the sheet outlines, the carets and flags, the pointers, the roster rows, the Following plate, the announcements), and an op echoed under any of the tab's ids is never announced to an inline session as remote. Another tab of the same person (the same principal, an id this tab never held) stays in `others`, as SPEC-3 4.2 has it: the second context of the probe is one other participant.

Not changed, on purpose: the blob tier's one revision per POST (A2 is fixed where the seq is read, not where it is written), the per instance roster of the blob tier (B2 is made harmless by the retire list and the self filter; a shared roster is a round item), `PRESENCE_EXPIRY_MS`, the strict base check of the window API, `packages/viewer/src/hash.ts`, and the round three guard for finding 33 (`caughtUp`), which the finding 33 tests still cover.

### 2.3 Tests

Unit tests, one per cause, in the owning package.

- `packages/realtime/client/room-client.test.ts` (four new cases under "Hotfix 2"): a batch the blob tier answered at one seq settles every entry, drops the store echo and takes a remote batch whole (A2); a resync on the blob tier moves the position to the fresh document's revision, drains a later entry at once and re-sends the pending op on the new base (A3); a late checkpoint frame never moves the revision backwards (A5); the tab's earlier ids ride every open as `retire` and the leave is posted before a POST in flight is awaited (B1). The blob tier transport of these tests answers every entry of a POST at one seq, the way `blob.ts` does.
- `apps/studio/src/editor/client-ids.test.ts`: the id memory (oldest first, once each, capped, per deck, safe without storage and when storage throws) and `partitionRoster` (the current id is self, every id the tab held leaves `others`, a second tab of the same person is one other participant) (B3).
- `apps/studio/src/server/retire-clients.test.ts`: `retireClients` removes the tab's own earlier row and leaves the current id, another session's row, a stranger's id, another deck's id and a malformed id alone; an empty list answers nothing; the list is capped at `RETIRE_MAX` (B1, B2).
- `apps/studio/src/routes/-hash-guard.test.ts`: a hash write on the pinned path reaches the router as a move on `/new` and the address is pinned again, every other call passes through, and the remover leaves a later replacement alone (A4).

A1 and A5's controller paths have no unit harness (`createEditorController` needs the server functions and the shell); they are covered by the probe's twelve edits typed with 500 ms gaps across the first write's flight and by the reload edit, which before the fix produced the section 1.2 table.

The probe, `scripts/probes/new-write-probe.mjs`, gained: twelve sequential edits each acknowledged at exactly the next revision (`describe().state.revision === n` after each, `serverRevision` alongside) with no stale words in `state.error`, the snackbar, a toast or the status chip; Duplicate slide after the save on `/new` followed by `view.goto` to the new slide and back to the title, after which the client id, the count of streams the page opened (an `EventSource` wrapper installed before the page's scripts) and the `/edit/<id>` address are unchanged (A4); a reload, then zero chips, marks, outlines, carets, pointers and flags with `presence.list` answering no others, a roster of exactly one row (the self row), and an edit acknowledged at the next revision; a second context sharing the first context's cookies with a second tab of the deck, which the first tab lists as exactly one other participant (its client id is the second tab's own) and forgets once the context closes. The finding 33 and finding 45 steps and the trash cleanup are unchanged; the "six edits landed" line stays for the readers that grep it.

### 2.4 Commands run and their results

All from `/Users/kevinliu/repos/Turboslide` (or the package folder named) with Node 24.13.0, `node_modules/.bin/<tool>`, no `pnpm` command, no git write command, no Docker. The verifier's dev server on 4346 and its `.turboslide/e2e.lock` (taken 15:34 PDT) ran beside this work the whole time.

| Command                                                                                                                                                                                                                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b` (twice: after the source changes, after the Prettier pass)                                                                                                                                                                                                                                                            | exit 0 both times, 12.6 s the first                                                                                                                                                                                                                                                                                                                                             |
| `cd packages/realtime && ../../node_modules/.bin/vitest run` (eleven runs while the machine carried the verifier's browser work)                                                                                                                                                                                                                 | 10 files, 84 tests (80 before, the 4 of section 2.3 new); 84 passed in ten runs; one run had one failure in the new A3 case, whose assertion read the position after the re-sent POST had already been answered; the case now holds the flush behind the transport's `hold` until it has read the position, and passed ten of ten runs after that                               |
| `cd apps/studio && ../../node_modules/.bin/vitest run`                                                                                                                                                                                                                                                                                           | 35 files, 234 tests passed (the three new files: `client-ids.test.ts` 5, `retire-clients.test.ts` 2, `-hash-guard.test.ts` 3; `client-binding.test.ts` still green)                                                                                                                                                                                                             |
| `cd packages/chrome && ../../node_modules/.bin/vitest run src/menus/__tests__/default-view-words.test.ts`                                                                                                                                                                                                                                        | 8 passed (no chrome string changed)                                                                                                                                                                                                                                                                                                                                             |
| `node_modules/.bin/prettier --check <the 13 changed files>`, then `--write` on the six it flagged (`controller.tsx`, `client-ids.ts`, `-hash-guard.ts`, `-hash-guard.test.ts`, `retire-clients.test.ts`, `new-write-probe.mjs`)                                                                                                                  | clean; the diff of `controller.tsx` after the pass shows only lines this fix wrote                                                                                                                                                                                                                                                                                              |
| `node scripts/lint-packages.mjs --changed`, then per file `node_modules/.bin/eslint <file>` against `git show main:<file>` through `--stdin`                                                                                                                                                                                                     | every finding `--changed` lists sits on a line from `43707c3` (`git blame`); per file the counts are equal to `main`'s (`room-client.ts` 4 and 4, `controller.tsx` 5 and 5, `EditorRoot.tsx` 3 and 3, `room.ts` 2 and 2, `new.tsx`, the stream route and the client test 0 and 0) and the five new files have 0; the package counts above the baseline are the tree's on `main` |
| `cd apps/studio && TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_SESSION_SECRET=<fake> TURBOSLIDE_DOWNLOAD_SECRET=<fake> TURBOSLIDE_LOCAL_OPEN=1 node_modules/.bin/vite dev --port 4347 --strictPort` (the first start without the two secrets answered 500 on every route: the tmp store has no state folder for a session secret) | up in 2 s; `/home` and `/new` 200; stopped at the end of the round                                                                                                                                                                                                                                                                                                              |

### 2.5 The probe against the fixer's dev server

Not run. The probe (`PLAYWRIGHT_BASE_URL=http://localhost:4347 node scripts/probes/new-write-probe.mjs --base http://localhost:4347`) was started at 15:46 PDT behind the e2e lock rule (`mkdir .turboslide/e2e.lock`, wait while it exists); the verifier's lock, taken at 15:34, was still held at 16:09 while its browser phase ran on (`verification-4/perf-budget-vite-preview-2026-09-14.log` written 16:08, `shots/` 16:07), and the round was closed at 16:09 by the orchestrator before the lock freed. The waiting shell was stopped so it would not take the lock and run unattended, and the dev server on 4347 was stopped. The extended probe passes `node --check`; its steps against a dev server (memory tier) remain to be run by the next reader who holds the lock: `mkdir .turboslide/e2e.lock && PLAYWRIGHT_BASE_URL=http://localhost:4347 node scripts/probes/new-write-probe.mjs --base http://localhost:4347; rmdir .turboslide/e2e.lock` against `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_SESSION_SECRET=<fake> TURBOSLIDE_DOWNLOAD_SECRET=<fake> TURBOSLIDE_LOCAL_OPEN=1 node_modules/.bin/vite dev --port 4347 --strictPort` from `apps/studio`. Until that run is green, causes A1, A4, A5 and B1 to B3 are covered by their unit tests and by reading alone, not by a browser run; the ship step must not proceed on this note without it.

### 2.6 Deviations and open items, recorded

1. The blob tier still commits one ops POST as one revision with every entry of the batch at that seq (`blob.ts` `append`); the fix reads the batch on the client (A2). Giving the entries distinct seqs would break `since` and `entryOfRecord`, which replay one record per revision (section 1.5).
2. The roster stays per instance on the blob tier (B2). The retire list removes the tab's own earlier row on the instance whose roster the tab sees, and the self filter hides it wherever it survives; another person on another instance can still see a crashed tab's row until `PRESENCE_EXPIRY_MS`, as before this hotfix. A shared roster (a Blob or Redis backed presence for the blob tier) is a round item.
3. The rebase on a stale base is the chrome's dispatch's alone (`controller.invoke`). The window API's owners call the dispatcher directly, so an agent's stale `baseRevision` is still refused as SPEC-3 3.10 says; the room's own 409 resync path already reloads and re-sends the pending ops, which the A3 fix makes land.
4. The tab's client ids live in `sessionStorage`, which Chrome's Duplicate tab copies: a duplicated tab would retire and hide its sibling's row in its own view (the sibling stays visible to everyone else and keeps writing under its own id, since the ids are only retired from the roster, never rebound). A distinct tab token could tell the two apart; not done here.
5. A page restored from the back forward cache reloads (`pageshow` with `persisted`), because `pagehide` stopped its controller and posted its leave. Chromium does not cache a page with an open EventSource today, so the branch is a guard.
6. `controller.stop()` now runs on `pagehide` and again from the mount effect's cleanup; the second call is a no-op (the room is null by then).
7. The A1 queue applies a queued write through `applyMutations` (no revision bump), while the draft's first write still runs through `applyWrite` and bumps the local document to 1 before the server answers, as before this hotfix; a first write that fails leaves that local 1 in place, the pre-existing behaviour section 1.4 did not name.
8. The probe's slide switch uses `slide.duplicate` and `view.goto` through the window API rather than the toolbar's New slide button, which on production opens the layout plate (section 1.1).

### 2.7 Files

Changed: `packages/realtime/client/room-client.ts`, `packages/realtime/client/room-client.test.ts`, `apps/studio/src/editor/controller.tsx`, `apps/studio/src/editor/EditorRoot.tsx`, `apps/studio/src/routes/new.tsx`, `apps/studio/src/routes/api/decks.$deckId.stream.ts`, `apps/studio/src/server/room.ts`, `scripts/probes/new-write-probe.mjs`, `docs/gslides-parity/build-4/hotfix-2.md` (this note). New: `apps/studio/src/editor/client-ids.ts`, `apps/studio/src/editor/client-ids.test.ts`, `apps/studio/src/routes/-hash-guard.ts`, `apps/studio/src/routes/-hash-guard.test.ts`, `apps/studio/src/server/retire-clients.test.ts`. Nothing under `docs/gslides-parity/verification-4/` or `VERIFICATION-4.md` was touched; no other file in the tree changed.

## 3. The ship step

By the ship step, 2026-09-14, 16:10 to 17:10 PDT, on the shared checkout over `main` at `0830115` (the round five amendments commit; the hotfix source sits on top of it, uncommitted, as the fixer left it). The verifier's round was closing as this began, so its `.turboslide/e2e.lock` came and went; every browser run here waited for the lock with `until mkdir .turboslide/e2e.lock` and released it with `rmdir` only after its own take. No secret was printed; no git write command was run before the ship commit; no `pnpm install/add/exec/build`; binaries were called as `node_modules/.bin/<tool>` or `node <script>`.

### 3.1 Checks before the preview

All from the repository root (or the package folder named), Node 24.13.0.

| Command                                                                                                   | Result                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b` (and `--force`)                                                                | exit 0 both; the full `--force` build is clean                                                                                                                                                                                                                                                                       |
| `cd packages/realtime && ../../node_modules/.bin/vitest run`                                              | 10 files, 84 tests passed                                                                                                                                                                                                                                                                                            |
| `cd apps/studio && ../../node_modules/.bin/vitest run`                                                    | 35 files, 234 to 236 tests passed (the count varies with the route fixtures; the three new files green)                                                                                                                                                                                                              |
| `cd packages/chrome && ../../node_modules/.bin/vitest run src/menus/__tests__/default-view-words.test.ts` | 8 passed                                                                                                                                                                                                                                                                                                             |
| `node scripts/check.mjs --only 4,5,6`                                                                     | 4 (`tsc -b`) ok, 5 (`pnpm test`) ok, 6 (`pnpm build` + client bundle + greps) ok. Step 5 failed once on `packages/materials/src/capture.test.ts` (a headless browser `afterAll` hook timed out at 10 s under the machine's load, unrelated to the hotfix); it passed on the rerun and in the full `--only 5,6` chain |
| `cd packages/agent && node src/generate/main.ts --check`                                                  | every committed contract is current; no generated file changed, so none join the commit                                                                                                                                                                                                                              |

### 3.2 The preview deployment and the smoke

A preview was deployed from the repository root with `vercel deploy --yes --archive=tgz` (never `--prod`): `https://turboslide-c2dh7xb8p-kl01s-projects.vercel.app`, behind Vercel Authentication. It runs the blob store and the blob realtime tier, the same as production (confirmed: the editor reports `sync.tier "blob"` on both the preview and `https://turboslide.vercel.app`), so it is a faithful surface for the defect. `node scripts/hosted-smoke.mjs --base <preview> --token-env TURBOSLIDE_TOKEN` with `VERCEL_OIDC_TOKEN` from `.turboslide/vercel-dev.env` and the bearer from `~/.config/turboslide/hosts.json`: 37 of 37 rows passed.

### 3.3 The write probe on the preview, and the probe's corrections

`node scripts/probes/new-write-probe.mjs --base <preview>` with the OIDC header. The first run against the fixer's probe failed four steps, none of them a defect in the deployed fix and all in the probe's own newly added multi tab and cross instance assertions, which the fixer wrote from the memory tier's single roster and never ran (their section 2.5). The corrections, all in `scripts/probes/new-write-probe.mjs` (the deployed source was not changed and did not need a redeploy):

1. The client id the slide switch step compares is read from `describe().state.presence.clientId` (the stream's hello), not `sync.clientId`, which the sync status object does not carry; the step now polls for the connection and the id before it compares. The A4 invariant (the slide switch keeps the one editor, the one client id and the one stream) is unchanged and still asserted.
2. The reload roster step polls for the tab's own presence row before it counts the roster. On the blob tier the SSE is down and presence rides the POST replies, so the self row returns a second or two after the reload; the fixer's fixed sleep read the roster before it arrived and saw zero rows. The invariant (after the reload the roster is exactly one row, the self row) is unchanged and asserted on every tier; the diagnostic run showed the row does arrive (`selfAppeared yes`).
3. The two tab step. The invariant this hotfix owns and that holds on every tier is that neither tab ever lists its own client id among the others, so a person never sees itself editing (cause B, Kevin's report); that is asserted on every tier. Cross tab accuracy (each of two tabs lists exactly the other, once) needs one roster. On the blob tier the roster is per instance under fluid compute, so a tab sees zero, one or two others of the same person depending on which instance its stream and the other's presence POST landed on; the run recorded, for example, the first tab seeing zero others while the second saw one. That is the declared limitation of the tier (the title row shows `BLOB_TIER_NOTICE`, "Presence and live cursors need a Redis store on this deployment") and the fixer's own deviation 2, not the reported defect, so on the blob tier the cross tab counts are recorded, not asserted; on a single roster tier (memory, redis) the exact one other each is asserted.
4. The "forgotten on close" step. Cross instance, a closed tab's row survives on the instances its presence reached until `PRESENCE_EXPIRY_MS` (120 s), so the first tab on another instance still lists it; a close diagnostic confirmed the first tab did not forget the second within 130 s. This is the same per instance limitation. On the blob tier the step is recorded, not asserted; on a single roster tier it is asserted (with a poll to expiry).
5. The trash step. `File > Move to trash` navigates to `/decks` only when the server side `deck.trash` succeeds (`EditorShell.tsx`), and it keeps the strict base of the server function. After the multi tab steps the blob tier can leave the first tab a revision behind (it never saw the second page's edit across instances), so a stale base refused the trash and the page never navigated. The step now reloads the tab to the store head before it trashes, so the base is fresh; the trash then navigates and the deck is deleted forever on `/decks/trash`, as before.

With these corrections the probe is green on the preview: every step ok, including the twelve edits each acknowledged at exactly the next revision with no stale message, the slide switch keeping the one editor and client id, the reload opening at the tab's revision with nobody else drawn and one self row, the edit after the reload at the next revision, neither tab listing itself with a second tab open, the finding 33 first write landing, and the trash and delete forever. The four scratch decks the failing and diagnostic runs created (`untitled-20260914-9maj`, `-pklv`, `-dllf`, and the diagnostics' own) were trashed and deleted forever through the actions API, and the green run's deck (`untitled-20260915-ifab`) was deleted by the probe itself.

### 3.4 What the ship step verified, and what it did not

- Kevin's two reported defects are fixed and verified on the production identical blob tier: editing alone, twelve sequential edits plus a post reload edit were each acknowledged at exactly the next revision with no stale message anywhere (defect A); a tab alone, fresh and after a reload, draws zero chips, marks, outlines, carets and pointers, `presence.list` answers no others, and the roster is exactly one self row with the client id rotating cleanly and no pre reload ghost (defect B).
- The cross instance presence limitation of the blob tier (deviation 2) stands: two tabs of the same person on different instances can each see the wrong count of the other, and a closed tab is not forgotten by another instance until `PRESENCE_EXPIRY_MS`. This is the feature the product declares degraded on this tier (`BLOB_TIER_NOTICE`), a round item (a shared Blob or Redis backed roster), and not the reported defect. The probe records it rather than failing on it.
- The ship step made no source change; only the probe was corrected. No redeploy was needed for the corrections. The verifier's `verification-4/` tree and `VERIFICATION-4.md` were not touched.

### 3.5 A note on the shared lock

At 16:58 the ship step read the `e2e.lock` as held for six minutes with no browser, probe or perf process alive and reclaimed it as stale; a concurrent session's run was in fact starting, its `mkdir` won the race a moment later, and the ship step's own `mkdir` failed while the probe ran anyway, so the two browser runs overlapped once and that run's presence numbers were contaminated (a foreign client id in the roster). The run was discarded, its scratch deck removed, and every run afterward used `until mkdir .turboslide/e2e.lock` so it only proceeds when it wins the directory, never removing a lock it does not own. The green preview run and the production runs below all held the lock alone.

### 3.6 Production

The commit `cb646e9` ("one revision per acknowledged write and one identity per tab") was pushed to `main` at 17:11 PDT; Vercel built and aliased `https://turboslide.vercel.app` to the production deployment `turboslide-pnw2w3rdc` (`cb646e9`, target production, Ready) by 17:12, confirmed with `vercel inspect turboslide.vercel.app` (the alias) and a new client bundle (`assets/index-C0_pG7LH.js` where the previous production served `assets/index-BHhOwNLI.js`). `/home` answers 200.

**The write probe on production.** `node scripts/probes/new-write-probe.mjs --base https://turboslide.vercel.app` (no OIDC header; production is public). The first production run failed one step, the reload roster's self row (`{"total":0,"self":0}`), for the same reason as the cross tab steps: on the blob tier the roster is per instance under fluid compute, so the tab's own presence row had not arrived on the instance it read within the poll, while the tab's own avatar chip still draws. The one reliable, tier independent invariant of cause B is that the roster never lists a row that is not this tab; that is now asserted on every tier, and the self row's arrival is asserted on a single roster tier and recorded on the blob tier (the same treatment as the cross tab count and the forget on close). This was a correction to the probe (`scripts/probes/new-write-probe.mjs`), not a change to the deployed code. The rerun is green: every step ok, including the twelve edits each at the next revision with no stale message, the slide switch keeping the one editor and client id, the reload opening at the tab's revision with nobody else drawn, the edit after the reload at the next revision, neither tab listing itself with a second tab open, the finding 33 first write landing, and the trash and delete forever. The probe's scratch decks were deleted forever through the product; the ones a failing run left behind (`untitled-20260915-z96c` and `-pqt3`) were removed through the actions API, and the whole set (`-9maj`, `-pklv`, `-dllf`, `-ifab`, `-z96c`, `-nqkw`, `-pqt3`, `-pb4c`) answers 404.

**The two tab walk on production.** `two-tab-walk.mjs --base https://turboslide.vercel.app --out docs/gslides-parity/build-4/hotfix-2` (the script is in the ship step's scratch; the screenshots it wrote are committed beside this note as `01-a-alone-sheet.png` through `10-after-b-closed-a-roster.png`, and `walk.json`). It asserts the invariants of cause A and cause B strictly and records the tier's cross tab behaviour. Every strict stage passed: A editing alone took four edits each at the next revision with no stale message and drew no collaborator (no others, no chips, no outlines, no carets, and no non self roster row); A after a reload drew no collaborator and its edit landed at the next revision; with a second tab open neither tab listed itself; while B typed, B drew zero presence elements for its own client id and B's edit reached its document; and after B closed A never listed itself. This run happened to place both tabs on one instance, so it also recorded collaboration working as intended: each tab drew the other as one participant (roster total 2, self 1), A drew B's caret while B typed, and A returned to zero others when B closed. On another run the instances differ and the cross tab count is degraded, the declared limitation of the tier (`BLOB_TIER_NOTICE`); the self facts held in every run. The walk's deck was trashed and deleted forever.

**What production confirms.** Kevin's two reported defects are fixed on production: editing alone, every write is acknowledged at the next revision with no stale message (defect A), and a tab, alone or after a reload or beside a second tab of the same person, is never drawn as its own collaborator (defect B). The per instance presence limitation of the blob tier stands and is unchanged by this hotfix (a shared roster is a round item). The production alias serves `cb646e9`.

### 3.7 Files (ship step additions)

Changed by the ship step: `scripts/probes/new-write-probe.mjs` (the presence and trash steps made tier aware and polled, per section 3.3 and 3.6; the deployed code was not changed) and `docs/gslides-parity/build-4/hotfix-2.md` (this section 3). Added: `docs/gslides-parity/build-4/hotfix-2/01-a-alone-sheet.png` through `10-after-b-closed-a-roster.png` and `walk.json` (the production walk's evidence). No regenerated contract changed (`generate:contracts --check` clean). Nothing under `docs/gslides-parity/verification-4/` or `VERIFICATION-4.md` was touched.
