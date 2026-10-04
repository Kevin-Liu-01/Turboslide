// Two people typing at one point of a text (realtime.title.two-typers; VERIFICATION.md "Realtime
// round, pass 3" finding 3): two text sessions over two room clients of the fake room, each
// session the InlineText rules a tab runs (the burst's write `textBurstMutation` with the
// session's caret, the absorb of another person's change `absorbedSession` with the splice the
// room client placed, `onRemoteApplied`), and a scheduler that interleaves keystrokes, bursts,
// the posts and the deliveries of each tab in a seeded order. Every word typed is in the server's
// text once and whole, and both tabs and the server end on one text.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';
import type { Entry, RoomEvent } from '@turboslide/realtime/channel';
import { fakeRoomServer, tabTransport } from '@turboslide/realtime/client/fake-transport';
import type { FakeIdentity } from '@turboslide/realtime/client/fake-transport';
import { createRoomClient } from '@turboslide/realtime/client/room-client';
import type { RoomClient, RoomTransport } from '@turboslide/realtime/client/room-client';
import { memoryChannel } from '@turboslide/realtime/memory';
import {
  absorbedSession,
  forgetAbsorbed,
  noteAbsorbed,
  noteHanded,
  noteSessionCaret,
  readRunText,
  runKey,
  textBurstMutation,
  trimmedOffset,
} from '@turboslide/viewer/InlineText';

const SLIDE = 'content-rule';
const BLOCK = 'p1';
const KEY = runKey(SLIDE, BLOCK, 'text');
const START = 'Realtime title';

function person(n: number, name: string): FakeIdentity {
  const principalId = `anon_${n}f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b`;
  return { principalId, label: name, role: 'editor', author: { kind: 'human', name, principalId } };
}

function startDocument(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  const document = { deck: result.deck, slides: result.slides };
  return applyMutations(document, [
    { op: 'block.set', slideId: SLIDE, blockId: BLOCK, path: '/text', value: START },
  ]).document;
}

function runText(document: DeckDocument): string {
  const slide = document.slides[SLIDE];
  if (slide === undefined) throw new Error('slide');
  return plainOf(readRunText(slide, BLOCK, 'text') ?? '');
}

/** A seeded generator (mulberry32), so a red seed reads the same order again. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * One tab: a room client whose posts wait for the scheduler and whose stream events queue for it,
 * and the session's state as InlineText holds it (the editable with its ends kept, the caret, the
 * text handed to the document, the absorbed marker, the Editor's committed text).
 */
type Tab = {
  room: RoomClient;
  raw: string;
  caret: number;
  handed: string;
  absorbed: string | undefined;
  committed: string;
  keys: string[];
  posts: (() => void)[];
  inbox: (() => void)[];
  remote: { opId: string; mutations: readonly Mutation[] } | null;
};

function gated(base: RoomTransport, tab: () => Tab): RoomTransport {
  return {
    ...base,
    open(options) {
      return base.open({
        ...options,
        onEvent: (event: RoomEvent) => {
          tab().inbox.push(() => options.onEvent(event));
        },
      });
    },
    async postOps(body) {
      await new Promise<void>((resolve) => tab().posts.push(resolve));
      return base.postOps(body);
    },
  };
}

function makeTab(
  server: ReturnType<typeof fakeRoomServer>,
  identity: FakeIdentity,
  keys: string,
): Tab {
  const tab: Tab = {
    room: undefined as unknown as RoomClient,
    raw: START,
    caret: START.length,
    handed: START,
    absorbed: undefined,
    committed: START,
    keys: [...keys],
    posts: [],
    inbox: [],
    remote: null,
  };
  tab.room = createRoomClient({
    deckId: 'gt-brand',
    transport: gated(tabTransport(server, identity), () => tab),
    document: server.document(),
    seq: server.seq(),
    onResync: async () => server.document(),
    onChange: () => undefined,
    onRemoteApplied: (entry: Entry, local: readonly Mutation[]) => {
      tab.remote = { opId: entry.opId, mutations: local };
    },
    onEvent: (event: RoomEvent) => {
      if (event.type === 'op') announce(tab, event.entry);
    },
  });
  return tab;
}

/** Puts this tab's session records where textBurstMutation reads them (the module keeps one per run). */
function load(tab: Tab): void {
  forgetAbsorbed(KEY);
  noteHanded(KEY, tab.handed);
  if (tab.absorbed !== undefined) noteAbsorbed(KEY, tab.absorbed);
  noteSessionCaret(KEY, () => trimmedOffset(tab.raw, tab.raw.trim(), tab.caret));
}

/** The controller's announce and the session's absorb of another person's entry (onTextChanged, absorbRemote). */
function announce(tab: Tab, entry: Entry): void {
  const local = tab.remote !== null && tab.remote.opId === entry.opId ? tab.remote.mutations : null;
  tab.remote = null;
  if (entry.clientId === tab.room.clientId()) return;
  if (!(entry.mutations ?? []).some((m) => 'blockId' in m && m.blockId === BLOCK)) return;
  const text = runText(tab.room.document());
  const splices =
    local === null
      ? undefined
      : local.flatMap((row) =>
          row.op === 'text.splice' && row.blockId === BLOCK && row.path === '/text'
            ? [{ at: row.at, remove: row.remove, insert: row.insert }]
            : [],
        );
  if (text === tab.handed) return;
  tab.absorbed = text;
  const next = absorbedSession({
    base: tab.handed,
    raw: tab.raw,
    trimmed: tab.raw.trim(),
    remote: text,
    selection: [tab.caret, tab.caret],
    ...(splices === undefined ? {} : { splices }),
  });
  tab.raw = next.text;
  tab.caret = next.selection?.[0] ?? next.text.length;
  tab.handed = text;
}

function type(tab: Tab): void {
  const key = tab.keys.shift();
  if (key === undefined) return;
  tab.raw = tab.raw.slice(0, tab.caret) + key + tab.raw.slice(tab.caret);
  tab.caret += key.length;
}

/** The session's burst (flushBurst) and the Editor's write of it (writeText, the controller's commit). */
function burst(tab: Tab): void {
  const to = tab.raw.trim();
  if (to === tab.handed) return;
  tab.handed = to;
  load(tab);
  const slide = tab.room.document().slides[SLIDE];
  if (slide === undefined) throw new Error('slide');
  const mutations = textBurstMutation(slide, BLOCK, 'text', tab.committed, to);
  tab.absorbed = undefined;
  if (mutations.length === 0) return;
  tab.committed = to;
  tab.room.apply(mutations, 'type', 'now');
}

async function drain(tabs: Tab[]): Promise<void> {
  for (let round = 0; round < 200; round += 1) {
    let moved = false;
    for (const tab of tabs) {
      burst(tab);
      while (tab.posts.length > 0) {
        tab.posts.shift()?.();
        moved = true;
      }
      await tick();
      while (tab.inbox.length > 0) {
        tab.inbox.shift()?.();
        moved = true;
      }
    }
    await tick();
    const quiet = tabs.every(
      (tab) => tab.posts.length === 0 && tab.inbox.length === 0 && tab.room.status().pending === 0,
    );
    if (quiet && !moved) return;
  }
}

async function play(seed: number, a: string, b: string): Promise<{ texts: string[] }> {
  const server = fakeRoomServer({
    deckId: 'gt-brand',
    channel: memoryChannel(),
    document: startDocument(),
  });
  const A = makeTab(server, person(1, 'Titanium 471'), a);
  const B = makeTab(server, person(2, 'Cobalt 118'), b);
  const tabs = [A, B];
  for (const tab of tabs) tab.room.start();
  for (let i = 0; i < 50 && tabs.some((tab) => tab.inbox.length === 0); i += 1) await tick();
  for (const tab of tabs) while (tab.inbox.length > 0) tab.inbox.shift()?.();
  const next = random(seed);
  for (let step = 0; step < 400; step += 1) {
    if (tabs.every((tab) => tab.keys.length === 0)) break;
    const tab = tabs[next() < 0.5 ? 0 : 1]!;
    const roll = next();
    if (roll < 0.5) type(tab);
    else if (roll < 0.65) burst(tab);
    else if (roll < 0.8) tab.posts.shift()?.();
    else tab.inbox.shift()?.();
    await tick();
  }
  for (const tab of tabs) while (tab.keys.length > 0) type(tab);
  await drain(tabs);
  const texts = [
    runText(server.document()),
    ...tabs.map((tab) => runText(tab.room.document())),
    ...tabs.map((tab) => tab.raw.trim()),
  ];
  for (const tab of tabs) await tab.room.stop();
  return { texts };
}

const count = (text: string, word: string): number => text.split(word).length - 1;

describe('two people typing at one point keep every word whole (realtime.title.two-typers)', () => {
  it("keeps both people's words whole across seeded orders of keys, bursts, posts and deliveries", async () => {
    const words = { a: [' ta1', ' ua1'], b: [' tb1', ' ub1'] };
    const failures: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const { texts } = await play(seed, words.a.join(''), words.b.join(''));
      const [server, ...others] = texts as [string, ...string[]];
      const lost = [...words.a, ...words.b].filter((word) => count(server, word) !== 1);
      // the two documents and the two editables end on the server's text
      if (lost.length > 0 || others.some((text) => text !== server))
        failures.push(`seed ${seed}: server "${server}", A and B ${JSON.stringify(others)}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
