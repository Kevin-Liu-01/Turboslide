import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Entry, NewEntry, RoomEvent } from '@turboslide/realtime/channel';
import { deckKeys } from '@turboslide/realtime/keys';
import { memoryChannel } from '@turboslide/realtime/memory';
import type { MemoryChannel } from '@turboslide/realtime/memory';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { applyWrite } from '@turboslide/schema/reduce';
import { plainOf } from '@turboslide/schema/text';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import {
  CHECKPOINT_IDLE_MS,
  CHECKPOINT_MAX_ENTRIES,
  CHECKPOINT_MAX_MS,
  applyStreamEntries,
  coveredSeq,
  createCheckpointer,
} from './checkpoint';
import type { Timers } from './checkpoint';

// The checkpointer (gslides-parity SPEC-3 0.3, 0.8, 0.51; MILESTONES-3 B2 day 3) over the memory
// channel and a file store in a temp folder: a recorded typing session becomes one record carrying
// its stream range, an interleaved two author session becomes one record per author run whose
// inverse undoes only that author's work, the four triggers fire on fake timers, a stalled holder's
// lock is broken after 3 s, the store entries the follower appended are covered but never
// re-committed, and the stream is trimmed.

const CLIENT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const kevin: Author = {
  kind: 'human',
  name: 'kevin',
  principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
};
const maya: Author = {
  kind: 'human',
  name: 'maya',
  principalId: 'anon_1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
};
const SLIDE = 'content-rule';
const BLOCK = 'p1';

function splice(at: number, remove: number, insert: string): Mutation {
  return { op: 'text.splice', slideId: SLIDE, blockId: BLOCK, path: '/text', at, remove, insert };
}

function entryOf(clientId: string, author: Author, n: number, mutations: Mutation[]): NewEntry {
  return {
    rev: 412,
    kind: 'edit',
    author,
    clientId,
    opId: `${clientId}:${n}`,
    mutations,
    at: '2026-09-13T10:00:00.000Z',
  };
}

function writeRawDeck(dir: string): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
}

/** Fake timers the checkpointer runs on: fired by hand at a virtual time. */
function fakeTimers(): Timers & { advance: (ms: number) => Promise<void>; now: () => number } {
  let clock = 1_700_000_000_000;
  let nextId = 1;
  const timeouts = new Map<number, { at: number; run: () => void; every?: number }>();
  return {
    now: () => clock,
    setTimeout(run, ms) {
      const id = nextId++;
      timeouts.set(id, { at: clock + ms, run });
      return id;
    },
    clearTimeout(handle) {
      timeouts.delete(handle as number);
    },
    setInterval(run, ms) {
      const id = nextId++;
      timeouts.set(id, { at: clock + ms, run, every: ms });
      return id;
    },
    clearInterval(handle) {
      timeouts.delete(handle as number);
    },
    async advance(ms) {
      const until = clock + ms;
      for (;;) {
        const due = [...timeouts.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        const [id, t] = due;
        clock = t.at;
        if (t.every !== undefined) t.at = clock + t.every;
        else timeouts.delete(id);
        t.run();
        // let the run's promises settle before the next timer fires
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));
      }
      clock = until;
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe('the checkpointer', () => {
  let root: string;
  let dir: string;
  let store: FileStore;
  let channel: MemoryChannel;
  let timers: ReturnType<typeof fakeTimers>;
  const events: RoomEvent[] = [];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-checkpoint-'));
    dir = join(root, 'decks', 'gt-brand');
    writeRawDeck(dir);
    store = openFileStore({ dir, now: () => '2026-09-13T10:00:00.000Z' });
    timers = fakeTimers();
    channel = memoryChannel({ now: timers.now });
    events.length = 0;
    channel.subscribe('gt-brand', (event) => {
      if (event.type === 'checkpoint') events.push(event);
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function checkpointer(extra: { log?: (line: string) => void } = {}) {
    return createCheckpointer({
      deckId: 'gt-brand',
      channel,
      store,
      timers,
      now: timers.now,
      ...extra,
    });
  }

  it('coalesces a recorded typing session into one record that names its stream range', async () => {
    const typed = 'Hello, '
      .split('')
      .map((ch, i) => entryOf(CLIENT_A, kevin, i + 1, [splice(i, 0, ch)]));
    const appended = await channel.append('gt-brand', 0, typed);
    expect(appended.ok).toBe(true);
    const cp = checkpointer();
    const result = await cp.run({ force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.committed).toHaveLength(1);
    expect(result.fromSeq).toBe(1);
    expect(result.toSeq).toBe(7);
    const records = await store.records();
    expect(records).toHaveLength(1);
    expect(records[0]?.ops).toEqual({ fromSeq: 1, toSeq: 7 });
    expect(records[0]?.mutations).toEqual([splice(0, 0, 'Hello, ')]);
    expect(records[0]?.author).toEqual(kevin);
    expect(coveredSeq(records)).toBe(7);
    const after = await store.read();
    const block = after.document.slides[SLIDE];
    const stored = block === undefined ? '' : String(findText(block));
    expect(plainOf(stored).startsWith('Hello, ')).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'checkpoint', fromSeq: 1, toSeq: 7, revision: 413 });
    expect(cp.state().covered).toBe(7);
  });

  it('keeps two authors apart so each record’s inverse undoes only that author’s work', async () => {
    const a1 = entryOf(CLIENT_A, kevin, 1, [splice(0, 0, 'A')]);
    const a2 = entryOf(CLIENT_A, kevin, 2, [splice(1, 0, 'a')]);
    const b1 = entryOf(CLIENT_B, maya, 1, [splice(20, 0, 'B')]);
    const a3 = entryOf(CLIENT_A, kevin, 3, [splice(2, 0, '!')]);
    await channel.append('gt-brand', 0, [a1, a2, b1, a3]);
    const result = await checkpointer().run({ force: true });
    expect(result.ok && result.committed.length).toBe(3);
    const records = await store.records();
    expect(records.map((r) => [r.author.name, r.ops?.fromSeq, r.ops?.toSeq])).toEqual([
      ['kevin', 1, 2],
      ['maya', 3, 3],
      ['kevin', 4, 4],
    ]);
    // undoing maya's record on the document it produced gives the document before it: her
    // character goes and kevin's run stays (the client transforms an inverse against later ops
    // before it sends it, SPEC-3 3.5)
    const afterMaya = await store.documentAt(2);
    const beforeMaya = await store.documentAt(1);
    expect(plainOf(String(findText(afterMaya.slides[SLIDE])))).toContain('B');
    const undone = applyWrite(afterMaya, {
      baseRevision: afterMaya.deck.revision,
      author: maya,
      mutations: records[1]?.inverse ?? [],
    });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    const text = String(findText(undone.document.slides[SLIDE]));
    expect(text).toBe(String(findText(beforeMaya.slides[SLIDE])));
    expect(plainOf(text)).not.toContain('B');
    expect(plainOf(text).startsWith('Aa')).toBe(true);
    const final = await store.read();
    expect(plainOf(String(findText(final.document.slides[SLIDE]))).startsWith('Aa!')).toBe(true);
    // one checkpoint event covers the run
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromSeq: 1, toSeq: 4, revision: 415 });
  });

  it('commits a noted entry as its own record under its history label, the typing around it apart (the product round fix round)', async () => {
    const before = entryOf(CLIENT_A, kevin, 1, [splice(0, 0, 'A')]);
    const kit: NewEntry = {
      ...entryOf(CLIENT_A, kevin, 2, [
        { op: 'block.set', slideId: SLIDE, blockId: 'list', path: '/size', value: 22 },
      ]),
      note: 'Brand kit: Primary',
    };
    const after = entryOf(CLIENT_A, kevin, 3, [splice(1, 0, 'a')]);
    await channel.append('gt-brand', 0, [before, kit, after]);
    const result = await checkpointer().run({ force: true });
    expect(result.ok && result.committed.length).toBe(3);
    const records = await store.records();
    expect(records.map((r) => [r.note, r.ops?.fromSeq, r.ops?.toSeq])).toEqual([
      ['', 1, 1],
      ['Brand kit: Primary', 2, 2],
      ['', 3, 3],
    ]);
    // the checkpoint event names the last record's note, as before
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromSeq: 1, toSeq: 3, note: '' });
  });

  it('fires 2 s after the last operation, and at 10 s under continuous typing', async () => {
    const cp = checkpointer();
    await channel.append('gt-brand', 0, [entryOf(CLIENT_A, kevin, 1, [splice(0, 0, 'x')])]);
    cp.schedule();
    await timers.advance(CHECKPOINT_IDLE_MS - 1);
    expect((await store.records()).length).toBe(0);
    await timers.advance(2);
    await settle();
    expect((await store.records()).length).toBe(1);
    // continuous typing: schedule() every 500 ms keeps the idle timer away; the hard timer fires
    let seq = 1;
    for (let t = 0; t < CHECKPOINT_MAX_MS - 500; t += 500) {
      seq += 1;
      await channel.append('gt-brand', seq - 1, [
        entryOf(CLIENT_A, kevin, seq, [splice(seq - 1, 0, 'y')]),
      ]);
      cp.schedule();
      await timers.advance(500);
    }
    expect((await store.records()).length).toBe(1);
    await timers.advance(600);
    await settle();
    expect((await store.records()).length).toBe(2);
    await cp.stop();
  });

  it('runs at once past 2,000 retained entries', async () => {
    const cp = checkpointer();
    const entries: NewEntry[] = [];
    for (let i = 0; i < CHECKPOINT_MAX_ENTRIES; i += 1)
      entries.push(entryOf(CLIENT_A, kevin, i + 1, [splice(i, 0, 'z')]));
    let base = 0;
    for (let i = 0; i < entries.length; i += 64) {
      const page = entries.slice(i, i + 64);
      const result = await channel.append('gt-brand', base, page);
      if (result.ok) base = result.entries[result.entries.length - 1]?.seq ?? base;
    }
    cp.noteAppended(entries as unknown as Entry[], 40_000);
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await store.records()).length).toBe(1);
    expect((await store.records())[0]?.ops).toEqual({ fromSeq: 1, toSeq: 2000 });
    await cp.stop();
  });

  it('breaks a lock whose heartbeat is older than 3 s and waits behind a live one', async () => {
    const keys = deckKeys('gt-brand');
    await channel.append('gt-brand', 0, [entryOf(CLIENT_A, kevin, 1, [splice(0, 0, 'x')])]);
    expect(await channel.lock(keys.ckpt, 'other-holder', 5000)).toBe(true);
    const cp = checkpointer();
    const locked = await cp.run({ force: true });
    expect(locked).toEqual({ ok: false, reason: 'locked' });
    // the holder stalls: 3 s later its heartbeat is stale and the waiter takes over
    await timers.advance(3001);
    const broken = await cp.run({ force: true });
    expect(broken.ok).toBe(true);
    expect((await store.records()).length).toBe(1);
    // the lock is released on the way out
    expect(await channel.lock(keys.ckpt, 'third', 5000)).toBe(true);
  });

  it('covers the follower’s store entries without committing them again, and trims the stream', async () => {
    // a CLI write landed at the store first; the follower appended it as a store entry
    const cli = await store.write({
      baseRevision: 412,
      author: maya,
      mutations: [splice(0, 0, 'CLI ')],
    });
    expect(cli.ok).toBe(true);
    await channel.append('gt-brand', 0, [
      { ...entryOf('store', maya, 1, [splice(0, 0, 'CLI ')]), opId: 'store:1' },
      entryOf(CLIENT_A, kevin, 1, [splice(4, 0, 'k')]),
    ]);
    const result = await checkpointer().run({ force: true });
    expect(result.ok && result.committed.length).toBe(1);
    const records = await store.records();
    expect(records).toHaveLength(2);
    // the record names the range it coalesced; the store entry before it is covered by the event
    expect(records[1]?.ops).toEqual({ fromSeq: 2, toSeq: 2 });
    expect(records[1]?.mutations).toEqual([splice(4, 0, 'k')]);
    expect(events[0]).toMatchObject({ fromSeq: 1, toSeq: 2 });
    const after = await store.read();
    expect(plainOf(String(findText(after.document.slides[SLIDE]))).startsWith('CLI k')).toBe(true);
    // the stream keeps at most the retention window
    expect((await channel.since('gt-brand', 0, 100)).length).toBe(2);
    // a cold instance that loads the store (the CLI write included) and replays the stream skips
    // the store entry, whose rev is below the document's revision, and applies the rest once
    const stream = await channel.since('gt-brand', 0, 100);
    const replayed = applyStreamEntries(await store.documentAt(1), stream);
    expect(plainOf(String(findText(replayed.slides[SLIDE]))).startsWith('CLI k')).toBe(true);
    expect(plainOf(String(findText(replayed.slides[SLIDE])))).not.toMatch(/^CLI CLI/);
  });

  it('commits the client entries admitted before a follower’s store entry instead of skipping them (the stream fix round two, T1-R4)', async () => {
    // a tab typed two keystrokes (seq 1 and 2, uncommitted), then an agent's strict write landed
    // at the store and the follower appended it as a store entry (seq 3): the run commits the two
    // keystrokes onto the store that already holds the agent's record, filters the store entry,
    // and covers all three; before this the follower moved `covered` to the store entry's seq and
    // the keystrokes never reached the store
    const before = plainOf(String(findText((await store.read()).document.slides[SLIDE])));
    const agent = await store.write({
      baseRevision: 412,
      author: maya,
      mutations: [splice(before.length, 0, ' agent')],
    });
    expect(agent.ok).toBe(true);
    await channel.append('gt-brand', 0, [
      entryOf(CLIENT_A, kevin, 1, [splice(0, 0, 'k')]),
      entryOf(CLIENT_A, kevin, 1, [splice(1, 0, 'e')]),
      { ...entryOf('store', maya, 1, [splice(before.length, 0, ' agent')]), opId: 'store:1' },
    ]);
    const runner = checkpointer();
    const result = await runner.run({ force: true });
    expect(result.ok && result.committed.length).toBe(1);
    expect(result.ok && result.toSeq).toBe(3);
    const records = await store.records();
    expect(records[1]?.ops).toEqual({ fromSeq: 1, toSeq: 2 });
    expect(records[1]?.mutations).toEqual([splice(0, 0, 'ke')]);
    const after = plainOf(String(findText((await store.read()).document.slides[SLIDE])));
    expect(after).toBe(`ke${before} agent`);
    expect(runner.state().covered).toBe(3);
  });
});

/** The text of the fixture's paragraph `p1` in the left slot. */
function findText(slide: unknown): unknown {
  return getAt(slide, '/slots/left/1/text');
}
