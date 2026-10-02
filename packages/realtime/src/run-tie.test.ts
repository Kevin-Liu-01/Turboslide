import { describe, expect, it } from 'vitest';

import type { SpliceMutation } from '@turboslide/schema/mutations';
import { transformMutation } from '@turboslide/schema/transform';
import type { Side } from '@turboslide/schema/transform';

import type { Entry } from './channel.ts';
import { entryRun, runTieSide } from './channel.ts';
import { landedOf, landedOwn, transformEntry } from './room-core.ts';

// The run rule of two inserts at one offset (channel.ts `runTieSide`; the realtime round fix
// round, VERIFICATION.md "Realtime round, pass 1" finding 3, `realtime.title.two-typers`): the
// server half in `transformEntry`, and a convergence check of two typers at the end of one text
// through a model of the client half (the room client's pending inserts moved past a remote one
// with the same side, the remote moved past the pending with the inverse, the author's run end and
// caret kept where another author's insert lands exactly on them). The model is the contract the
// client half follows (build/r1.md, "Realtime round fix round", request R1-R2h); the room client
// itself is lane R2's.

const SLIDE = 'content-rule';
const BLOCK = 'p1';

function splice(at: number, insert: string, remove = 0): SpliceMutation {
  return { op: 'text.splice', slideId: SLIDE, blockId: BLOCK, path: '/text', at, remove, insert };
}

function apply(text: string, mutations: readonly SpliceMutation[]): string {
  let out = text;
  for (const m of mutations) out = out.slice(0, m.at) + m.insert + out.slice(m.at + m.remove);
  return out;
}

function entryOf(seq: number, clientId: string, mutations: SpliceMutation[]): Entry {
  return {
    seq,
    rev: 0,
    kind: 'edit',
    author: { kind: 'human', name: clientId },
    clientId,
    opId: `${clientId}:${seq}`,
    mutations,
    at: '2026-10-02T00:00:00.000Z',
  };
}

/** A point moved past one splice: an insert exactly at the point leaves it (room-client.ts `shiftPoint`'s rule, the editor's caret rule). */
function shiftPoint(point: number, m: SpliceMutation): number {
  if (m.remove === 0 && m.at === point) return point;
  if (m.at + m.remove <= point) return point - m.remove + m.insert.length;
  if (m.at < point) return m.at + m.insert.length;
  return point;
}

function inverse(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

describe('the run rule on the server', () => {
  it('keeps an entry that continues its own text left of a landed insert at its offset, and server order without it', () => {
    // A's " ta" landed at 0..3; B's " tb" at 3 (typed after it); A's "3" at 3 continues " ta"
    const landed = [entryOf(2, 'b', [splice(3, ' tb')])];
    const post = {
      clientId: 'a',
      base: { seq: 1 },
      entries: [
        { opId: 'a:3', kind: 'edit' as const, mutations: [splice(3, '3')], run: true as const },
      ],
    };
    const rows = landedOf(landed, post);
    expect(entryRun(post.entries[0])).toBe(true);
    expect(transformEntry([splice(3, '3')], rows, true)).toEqual([splice(3, '3')]);
    expect(apply(apply(' ta', [splice(3, ' tb')]), [splice(3, '3')])).toBe(' ta3 tb');
    // without the declaration: server order, the stray "3" after B's word
    expect(transformEntry([splice(3, '3')], rows)).toEqual([splice(6, '3')]);
    // an entry of the POST's own making (the undo of a refused sibling) keeps its side
    expect(transformEntry([splice(3, '3')], landedOwn([splice(3, 'x')]), true)).toEqual([
      splice(4, '3'),
    ]);
    expect(runTieSide(undefined, 'right')).toBe('right');
    expect(runTieSide(true, 'right')).toBe('left');
    expect(entryRun({ run: 'yes' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Two typers at the end of one text, every interleaving a seeded scheduler picks

type Pending = { opId: string; mutations: SpliceMutation[]; run: boolean; sent: boolean };
type Client = {
  id: string;
  word: string;
  typed: number;
  server: string;
  seq: number;
  pending: Pending[];
  inflight: boolean;
  caret: number;
  /** the end of this author's last insert, or null before the first */
  runEnd: number | null;
  inbox: Entry[];
  counter: number;
};
type Post = { clientId: string; base: number; entry: Pending };

function makeClient(id: string, word: string, text: string): Client {
  return {
    id,
    word,
    typed: 0,
    server: text,
    seq: 0,
    pending: [],
    inflight: false,
    caret: text.length,
    runEnd: null,
    inbox: [],
    counter: 0,
  };
}

function localOf(client: Client): string {
  return apply(
    client.server,
    client.pending.flatMap((p) => p.mutations),
  );
}

function runTwoTypers(seed: number, declareRun: boolean) {
  let state = seed;
  const random = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const start = 'Heading';
  let text = start;
  const log: (Entry & { run: boolean })[] = [];
  const inbox: Post[] = [];
  const clients = [makeClient('a', ' ta3', start), makeClient('b', ' tb3', start)];
  const deliver = (client: Client): void => {
    const entry = client.inbox.shift();
    if (entry === undefined) return;
    const mutations = (entry.mutations ?? []) as SpliceMutation[];
    if (entry.clientId === client.id) {
      const own = client.pending.shift();
      // the client predicted the server's placement (the same tie on both ends)
      expect(own?.mutations, `seed ${seed}: the own entry as placed`).toEqual(mutations);
      client.inflight = false;
    } else {
      // the pending inserts move past the remote one, the remote past each pending with the inverse
      let remote = mutations;
      for (const p of client.pending) {
        const side = runTieSide(p.run, 'right');
        const moved: SpliceMutation[] = [];
        for (const m of p.mutations)
          for (const r of remote)
            moved.push(...(transformMutation(m, r, 'right', side) as SpliceMutation[]));
        const next: SpliceMutation[] = [];
        for (const r of remote)
          for (const m of p.mutations)
            next.push(...(transformMutation(r, m, 'right', inverse(side)) as SpliceMutation[]));
        p.mutations = moved;
        remote = next;
      }
      for (const r of remote) {
        client.caret = shiftPoint(client.caret, r);
        if (client.runEnd !== null) client.runEnd = shiftPoint(client.runEnd, r);
      }
    }
    client.server = apply(client.server, mutations);
    client.seq = entry.seq;
  };
  const type = (client: Client): void => {
    const ch = client.word[client.typed];
    if (ch === undefined) return;
    client.typed += 1;
    client.counter += 1;
    const run = declareRun && client.runEnd === client.caret;
    client.pending.push({
      opId: `${client.id}:${client.counter}`,
      mutations: [splice(client.caret, ch)],
      run,
      sent: false,
    });
    client.caret += 1;
    client.runEnd = client.caret;
  };
  const send = (client: Client): void => {
    if (client.inflight) return;
    const next = client.pending.find((p) => !p.sent);
    if (next === undefined) return;
    next.sent = true;
    client.inflight = true;
    inbox.push({
      clientId: client.id,
      base: client.seq,
      entry: { ...next, mutations: [...next.mutations] },
    });
  };
  const admit = (): void => {
    // posts of one client arrive in order; across clients the scheduler picks
    const index = Math.floor(random() * inbox.length);
    const first = inbox.findIndex((post) => post.clientId === inbox[index]?.clientId);
    const [post] = inbox.splice(first, 1);
    if (post === undefined) return;
    const landed = log.filter((entry) => entry.seq > post.base);
    const rows = landedOf(landed, {
      clientId: post.clientId,
      base: { seq: post.base },
      entries: [{ opId: post.entry.opId, kind: 'edit', mutations: post.entry.mutations }],
    });
    const placed = transformEntry(post.entry.mutations, rows, post.entry.run) as SpliceMutation[];
    text = apply(text, placed);
    const entry = { ...entryOf(log.length + 1, post.clientId, placed), run: post.entry.run };
    log.push(entry);
    for (const client of clients) client.inbox.push(entry);
  };
  for (let step = 0; step < 10_000; step += 1) {
    const moves: (() => void)[] = [];
    for (const client of clients) {
      if (client.typed < client.word.length) moves.push(() => type(client));
      if (!client.inflight && client.pending.some((p) => !p.sent)) moves.push(() => send(client));
      if (client.inbox.length > 0) moves.push(() => deliver(client));
    }
    if (inbox.length > 0) moves.push(admit);
    if (moves.length === 0) break;
    moves[Math.floor(random() * moves.length)]?.();
  }
  return { text, a: localOf(clients[0]!), b: localOf(clients[1]!), start };
}

describe('two typers at the end of one text', () => {
  it('converge on one text with each word whole when every entry declares the rule', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { text, a, b, start } = runTwoTypers(seed, true);
      expect(a, `seed ${seed}: A converges`).toBe(text);
      expect(b, `seed ${seed}: B converges`).toBe(text);
      expect(text.length).toBe(start.length + 8);
      expect(text.startsWith(start)).toBe(true);
      expect(text.includes(' ta3'), `seed ${seed}: ${JSON.stringify(text)} keeps A's word`).toBe(
        true,
      );
      expect(text.includes(' tb3'), `seed ${seed}: ${JSON.stringify(text)} keeps B's word`).toBe(
        true,
      );
    }
  });

  it('converge by server order without the declaration, and some interleavings cut a word', () => {
    let cut = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const { text, a, b } = runTwoTypers(seed, false);
      expect(a).toBe(text);
      expect(b).toBe(text);
      if (!text.includes(' ta3') || !text.includes(' tb3')) cut += 1;
    }
    // the class the row read red (the integrator's finding 14): server order alone loses a word
    expect(cut).toBeGreaterThan(0);
  });
});
