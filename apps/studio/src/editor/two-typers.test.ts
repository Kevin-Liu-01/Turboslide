// Two and three people typing at one point of a text (realtime.title.two-typers): text sessions
// over room clients and the room's own admission (room.ts `admitOps` on the memory tier, over the
// fake room's channel), with a scheduler that interleaves keystrokes, bursts, the Escape and its
// cover conversion, the posts and the deliveries of each tab. Each session runs the InlineText
// rules a tab runs (the burst's write `textBurstMutation` with the session's caret, the absorb of
// another person's change `absorbedSession` with the splices the room client placed); the Escape
// writes the cover's shrunk size once its title wrapped, which converts the cover to a canvas in
// the same write (controller.tsx `commit`, convert-first.ts). Every word typed is in every copy
// once and whole, and the room and every tab end on one text.
import { describe, expect, it } from 'vitest';

import type { Entry, RoomEvent } from '@turboslide/realtime/channel';
import { fakeRoomServer, tabTransport } from '@turboslide/realtime/client/fake-transport';
import type { FakeIdentity, FakeRoomServer } from '@turboslide/realtime/client/fake-transport';
import { createRoomClient } from '@turboslide/realtime/client/room-client';
import type { RoomClient, RoomTransport } from '@turboslide/realtime/client/room-client';
import { memoryChannel } from '@turboslide/realtime/memory';
import type { MemoryChannel } from '@turboslide/realtime/memory';
import { toCanvas } from '@turboslide/schema/canvas';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { DeckDocument, TitleSlide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { slideFieldOf } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';
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

import { applyStreamEntries } from '../server/checkpoint';
import { admitOps } from '../server/room';
import type { RequestIdentity, Room } from '../server/room';
import {
  fieldRunsFirst,
  isSlideFieldTextRun,
  retargetFieldRuns,
  slideToConvertFor,
} from './convert-first';

const DECK = 'two-typers';
const START = 'Realtime title';
/** The text the sessions type into: the cover's title (a field, then its canvas's block) or a body text. */
type Target = { slideId: string; blockId: string };
const COVER: Target = { slideId: 'title', blockId: 'heading' };
const BODY: Target = { slideId: 'content-rule', blockId: 'p1' };
const BOXES: CanvasBoxes = {
  blocks: { heading: [137, 300, 1646, 180], lead: [137, 520, 1200, 80] },
  mark: [137, 137, 132, 84],
  prompted: [],
};

function person(n: number): FakeIdentity {
  const principalId = `anon_${n}f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b`;
  const label = ['Titanium 471', 'Cobalt 118', 'Argon 905'][n] ?? `Person ${n}`;
  return {
    principalId,
    label,
    role: 'editor',
    author: { kind: 'human', name: label, principalId },
  };
}

/** The cover and one body slide, both reading START, so the admission's validator reads two slides. */
function startDocument(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  const cover = result.slides[COVER.slideId] as TitleSlide;
  const document: DeckDocument = {
    deck: {
      ...result.deck,
      sections: [{ id: 'brand', name: 'Brand', slideIds: [COVER.slideId, BODY.slideId] }],
    },
    slides: {
      [COVER.slideId]: { ...cover, heading: START },
      [BODY.slideId]: result.slides[BODY.slideId]!,
    },
  };
  return applyMutations(document, [
    { op: 'block.set', slideId: BODY.slideId, blockId: BODY.blockId, path: '/text', value: START },
  ]).document;
}

function textOf(document: DeckDocument, target: Target): string {
  const slide = document.slides[target.slideId];
  if (slide === undefined) throw new Error('slide');
  return plainOf(readRunText(slide, target.blockId, 'text') ?? '');
}

/** The memory tier's room over the fake room's channel: the live document follows the stream. */
function memoryRoom(channel: MemoryChannel, start: DeckDocument): Room {
  let live = { seq: 0, document: start };
  return {
    deckId: DECK,
    channel,
    tier: 'memory',
    async live() {
      const head = await channel.head(DECK);
      if (head > live.seq) {
        const entries = await channel.since(DECK, live.seq, head - live.seq);
        live = { seq: head, document: applyStreamEntries(live.document, entries) };
      }
      return live;
    },
    checkpointer: {
      noteComments: () => undefined,
      noteAppended: () => undefined,
      schedule: () => undefined,
      run: async () => undefined,
      pendingComments: () => [],
    },
    revision: () => 0,
  } as unknown as Room;
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

/**
 * One tab: a room client whose posts wait for the scheduler and whose stream events queue for it,
 * and the session's state as InlineText holds it (the editable with its ends kept, the caret, the
 * text handed to the document, the absorbed marker, the Editor's committed text, whether the cover
 * stepped its size down in this session).
 */
type Tab = {
  room: RoomClient;
  open: boolean;
  raw: string;
  caret: number;
  handed: string;
  absorbed: string | undefined;
  committed: string;
  shrunk: boolean;
  keys: string[];
  /** the Escape's write while the controller measures the cover for its conversion */
  measuring: Mutation[] | null;
  posts: (() => void)[];
  inbox: (() => void)[];
  remote: { opId: string; mutations: readonly Mutation[] } | null;
  /** the writes this tab refused before applying them */
  refused: Mutation[][];
};

type World = {
  target: Target;
  key: string;
  /** the cover's title wraps past this many characters, and its Escape writes the shrunk size */
  wrapAt: number;
  room: Room;
  tabs: Tab[];
  /** runs the room clients' flush timers and settles what is in flight */
  tick: () => Promise<void>;
};
type Timers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
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

/** The room clients' flush timers, run at the next tick; the long ones (heartbeat, reopen) never. */
function quickTimers(): { timers: Timers; tick: () => Promise<void> } {
  let due = new Set<() => void>();
  const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  return {
    timers: {
      setTimeout: (run, ms) => {
        if (ms > 200) return null;
        const handle = (): void => run();
        due.add(handle);
        return handle;
      },
      clearTimeout: (handle) => {
        if (typeof handle === 'function') due.delete(handle as () => void);
      },
    },
    async tick() {
      await turn();
      const now = due;
      due = new Set();
      for (const run of now) run();
      await turn();
    },
  };
}

function makeTab(
  world: Omit<World, 'tabs' | 'tick'>,
  server: FakeRoomServer,
  identity: FakeIdentity,
  timers: Timers,
): Tab {
  const tab: Tab = {
    room: undefined as unknown as RoomClient,
    open: false,
    raw: '',
    caret: 0,
    handed: '',
    absorbed: undefined,
    committed: '',
    shrunk: false,
    keys: [],
    measuring: null,
    posts: [],
    inbox: [],
    remote: null,
    refused: [],
  };
  tab.room = createRoomClient({
    deckId: DECK,
    transport: gated(tabTransport(server, identity), () => tab),
    document: server.document(),
    seq: server.seq(),
    timers,
    onResync: async () => (await world.room.live()).document,
    onChange: () => undefined,
    onRemoteApplied: (entry: Entry, local: readonly Mutation[]) => {
      tab.remote = { opId: entry.opId, mutations: local };
    },
    onEvent: (event: RoomEvent) => {
      if (event.type === 'op') announce(world, tab, event.entry);
    },
  });
  return tab;
}

/** The room on the memory tier with `people` tabs on it, each tab's hello taken. */
async function setup(options: { target: Target; people: number; wrapAt?: number }): Promise<World> {
  const channel = memoryChannel();
  const start = startDocument();
  const room = memoryRoom(channel, start);
  let clock = Date.parse('2026-10-07T00:00:00.000Z');
  const server = fakeRoomServer({
    deckId: DECK,
    channel,
    document: start,
    // a minute apart, so the room's budgets never refuse a POST of the simulation
    admit: (body, identity) =>
      admitOps(room, {
        post: body,
        bytes: JSON.stringify(body).length,
        identity: { kind: 'anonymous', identity: identity.principalId } as RequestIdentity,
        author: identity.author,
        role: 'editor',
        now: () => (clock += 61_000),
      }),
  });
  const { timers, tick } = quickTimers();
  const base = {
    target: options.target,
    key: runKey(options.target.slideId, options.target.blockId, 'text'),
    wrapAt: options.wrapAt ?? 40,
    room,
  };
  const tabs = Array.from({ length: options.people }, (_, n) =>
    makeTab(base, server, person(n), timers),
  );
  for (const tab of tabs) tab.room.start();
  for (let i = 0; i < 50 && tabs.some((tab) => tab.inbox.length === 0); i += 1) await tick();
  for (const tab of tabs) deliver(tab);
  return { ...base, tabs, tick };
}

/** Puts this tab's session records where textBurstMutation reads them (the module keeps one per run). */
function load(world: World, tab: Tab): void {
  forgetAbsorbed(world.key);
  noteHanded(world.key, tab.handed);
  if (tab.absorbed !== undefined) noteAbsorbed(world.key, tab.absorbed);
  noteSessionCaret(world.key, () => trimmedOffset(tab.raw, tab.raw.trim(), tab.caret));
}

/**
 * The controller's announce of another person's entry (controller.tsx announceRemoteText: each
 * text op's run read on this tab's document, with the splices this tab placed) and the session's
 * absorb of it (InlineText onTextChanged, absorbRemote).
 */
function announce(world: Omit<World, 'tabs' | 'tick'>, tab: Tab, entry: Entry): void {
  const local = tab.remote !== null && tab.remote.opId === entry.opId ? tab.remote.mutations : null;
  tab.remote = null;
  if (entry.clientId === tab.room.clientId() || !tab.open) return;
  const slide = tab.room.document().slides[world.target.slideId];
  if (slide === undefined) return;
  for (const mutation of entry.mutations ?? []) {
    if (mutation.op !== 'text.splice' && mutation.op !== 'text.mark') continue;
    if (mutation.slideId !== world.target.slideId || mutation.blockId !== world.target.blockId)
      continue;
    // the session's run is `<block>/text` on the sheet: a field run is told under `text` while
    // the slide is the cover, a block run under its path
    const pointer =
      slideFieldOf(slide, mutation.blockId) !== null ? 'text' : mutation.path.slice(1);
    if (pointer !== 'text') continue;
    const text = readRunText(slide, world.target.blockId, 'text');
    if (text === undefined || text === tab.handed) return;
    const splices =
      local === null
        ? undefined
        : local.flatMap((row) =>
            row.op === 'text.splice' &&
            row.slideId === mutation.slideId &&
            row.blockId === mutation.blockId &&
            row.path === mutation.path
              ? [{ at: row.at, remove: row.remove, insert: row.insert }]
              : [],
          );
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
    return;
  }
}

/** Where a person's caret is when the session opens: the end (the row's End key), or a word's edge. */
type Start = 'end' | 'last-word' | 'first-word';

/** A double click on the run, then End or a click at a word's edge (realtime.spec.ts openRun). */
function open(world: World, tab: Tab, keys: string, start: Start = 'end'): void {
  const text = textOf(tab.room.document(), world.target);
  forgetAbsorbed(world.key);
  tab.open = true;
  tab.raw = text;
  tab.caret =
    start === 'end'
      ? text.length
      : start === 'last-word'
        ? Math.max(0, text.lastIndexOf(' '))
        : Math.max(0, text.indexOf(' '));
  tab.handed = text;
  tab.committed = text;
  tab.absorbed = undefined;
  tab.shrunk = false;
  tab.keys = [...keys];
}

function type(tab: Tab, count = 1): void {
  for (let i = 0; i < count; i += 1) {
    const key = tab.keys.shift();
    if (key === undefined) return;
    tab.raw = tab.raw.slice(0, tab.caret) + key + tab.raw.slice(tab.caret);
    tab.caret += key.length;
  }
}

/** The controller's write (controller.tsx `commitAs`): one the reducer refuses on this tab's document is refused before it applies, its letters lost. */
function write(tab: Tab, mutations: Mutation[]): void {
  if (mutations.length === 0) return;
  try {
    tab.room.apply(mutations, 'type', 'now');
  } catch {
    tab.refused.push(mutations);
  }
}

/** A write's conversion, if it names the cover's field object (convert-first.ts `slideToConvertFor`). */
function toConvert(document: DeckDocument, mutations: Mutation[]): string | null {
  return slideToConvertFor(
    document,
    mutations.filter((mutation) => {
      const slide = 'slideId' in mutation ? document.slides[mutation.slideId] : undefined;
      return slide === undefined || !isSlideFieldTextRun(slide, mutation);
    }),
  );
}

/**
 * The Editor's commit of a write (controller.tsx `commit`): a write that names the cover's field
 * object (the shrunk size) converts the cover after the cover is measured (`measured`), and its
 * typed letters land at once (convert-first.ts `fieldRunsFirst`).
 */
function commit(tab: Tab, mutations: Mutation[]): void {
  const document = tab.room.document();
  if (toConvert(document, mutations) === null) return write(tab, mutations);
  const { runs, rest } = fieldRunsFirst(document, mutations);
  write(tab, runs);
  tab.measuring = rest;
}

/**
 * The measure ends (controller.tsx `convertThenCommit`): the cover converts as the document
 * stands now, with the write's field runs re-addressed to the canvas's block, or the write goes as
 * it is when another person's conversion landed first.
 */
function measured(tab: Tab): void {
  const mutations = tab.measuring;
  tab.measuring = null;
  if (mutations === null) return;
  const document = tab.room.document();
  const slideId = toConvert(document, mutations);
  const slide = slideId === null ? undefined : document.slides[slideId];
  const converted = slide === undefined ? null : toCanvas(slide, BOXES);
  write(
    tab,
    slide === undefined || converted === null
      ? mutations
      : [
          { op: 'slide.replace', slideId: slide.id, slide: converted.slide },
          ...retargetFieldRuns(slide, converted.slide, mutations),
        ],
  );
}

/** The session's burst (flushBurst) and the Editor's write of it (writeText); `ending` is the Escape's final write. */
function burst(world: World, tab: Tab, ending = false): void {
  const to = tab.raw.trim();
  const slide = tab.room.document().slides[world.target.slideId];
  if (slide === undefined) throw new Error('slide');
  const cover = world.target === COVER && slide.kind === 'title';
  if (cover && to.length > world.wrapAt) tab.shrunk = true;
  let mutations: Mutation[] = [];
  if (to !== tab.handed || ending) {
    tab.handed = to;
    load(world, tab);
    mutations = textBurstMutation(slide, world.target.blockId, 'text', tab.committed, to);
    tab.absorbed = undefined;
  }
  if (mutations.length > 0) tab.committed = to;
  // the cover's shrunk size travels with the session's final write alone (Editor.tsx growAfterBurst)
  const size: Mutation[] =
    ending && cover && tab.shrunk
      ? [
          {
            op: 'block.set',
            slideId: slide.id,
            blockId: 'heading',
            path: '/typography',
            value: { size: 72 },
          },
          { op: 'block.set', slideId: slide.id, blockId: 'heading', path: '/pos/h', value: 90 },
        ]
      : [];
  commit(tab, [...mutations, ...size]);
}

/** The Escape: the session's final write, then the session ends. */
function escape(world: World, tab: Tab): void {
  burst(world, tab, true);
  tab.open = false;
  tab.absorbed = undefined;
  forgetAbsorbed(world.key);
}

/** The tab's POST goes to the room and its answer comes back. */
async function post(world: World, tab: Tab): Promise<void> {
  await world.tick();
  tab.posts.shift()?.();
  await world.tick();
}

function deliver(tab: Tab): void {
  while (tab.inbox.length > 0) tab.inbox.shift()?.();
}

async function drain(world: World): Promise<void> {
  for (let round = 0; round < 400; round += 1) {
    let moved = false;
    for (const tab of world.tabs) {
      if (tab.measuring !== null) {
        measured(tab);
        moved = true;
      }
      while (tab.posts.length > 0) {
        tab.posts.shift()?.();
        moved = true;
      }
      await world.tick();
      if (tab.inbox.length > 0) moved = true;
      deliver(tab);
    }
    await world.tick();
    const quiet = world.tabs.every(
      (tab) => tab.posts.length === 0 && tab.inbox.length === 0 && tab.room.status().pending === 0,
    );
    if (quiet && !moved) return;
  }
}

/** The room's text, then each tab's document's. */
async function texts(world: World): Promise<string[]> {
  return [
    textOf((await world.room.live()).document, world.target),
    ...world.tabs.map((tab) => textOf(tab.room.document(), world.target)),
  ];
}

const count = (text: string, word: string): number => text.split(word).length - 1;

/** Every word once in every copy and every copy the room's text; the failure as a sentence. */
function judge(label: string, copies: string[], words: string[]): string[] {
  const [room, ...tabs] = copies as [string, ...string[]];
  const lost = words.filter((word) => copies.some((text) => count(text, word) !== 1));
  return lost.length > 0 || tabs.some((text) => text !== room)
    ? [`${label}: room "${room}", tabs ${JSON.stringify(tabs)}`]
    : [];
}

type Play = {
  seed: number;
  target: Target;
  /** each person's keys per round */
  rounds: string[][];
  starts?: (round: number, person: number) => Start;
};

/** One seeded order of every person's rounds: keys, bursts, Escapes, measures, posts and deliveries. */
async function play({ seed, target, rounds, starts }: Play): Promise<string[]> {
  const world = await setup({ target, people: rounds[0]?.length ?? 0 });
  const next = random(seed);
  for (const [round, keys] of rounds.entries()) {
    world.tabs.forEach((tab, n) => open(world, tab, keys[n] ?? '', starts?.(round, n)));
    for (let step = 0; step < 600 && world.tabs.some((tab) => tab.open); step += 1) {
      const tab = world.tabs[Math.floor(next() * world.tabs.length)]!;
      const roll = next();
      if (tab.open && tab.keys.length > 0 && roll < 0.45) type(tab);
      else if (tab.open && roll < 0.6) burst(world, tab);
      else if (tab.open && tab.keys.length === 0 && roll < 0.68) escape(world, tab);
      else if (roll < 0.76) measured(tab);
      else if (roll < 0.88) tab.posts.shift()?.();
      else tab.inbox.shift()?.();
      await world.tick();
    }
    for (const tab of world.tabs) {
      type(tab, tab.keys.length);
      if (tab.open) escape(world, tab);
    }
    await drain(world);
  }
  const copies = await texts(world);
  for (const tab of world.tabs) await tab.room.stop();
  return copies;
}

/** The row's words: each round each person types a word sharing its first letter and its digit with the others', then a second. */
function rowRounds(people: number, rounds: number): string[][] {
  return Array.from({ length: rounds }, (_round, r) =>
    Array.from({ length: people }, (_person, n) => ` t${'abc'[n]}${r + 1} u${'abc'[n]}${r + 1}`),
  );
}
const wordsOf = (rounds: string[][]): string[] =>
  rounds.flatMap((round) => round.flatMap((keys) => keys.match(/ \S+/g) ?? []));

/** The seeds of a property run: SEEDS in the environment widens it (TWO_TYPERS_SEEDS=5000). */
const SEEDS = Number(process.env['TWO_TYPERS_SEEDS'] ?? 0);

describe('two people typing at one point keep every word whole (realtime.title.two-typers)', () => {
  it('moves what landed past the earlier entries of a POST, so a word split over two entries stays whole', async () => {
    const world = await setup({ target: COVER, people: 2 });
    const [A, B] = world.tabs as [Tab, Tab];
    open(world, B, ' tb1');
    type(B, 4);
    escape(world, B);
    await drain(world);
    // A's word last: A's next letters continue A's own text (the run rule)
    open(world, A, ' ta1');
    type(A, 4);
    escape(world, A);
    await drain(world);
    open(world, A, ' ta2');
    open(world, B, ' tb2');
    // A's " t" and "a2" are two bursts before the flush: one POST carries both, on a base
    // without B's word
    type(A, 2);
    burst(world, A);
    type(A, 2);
    burst(world, A);
    await world.tick();
    // B's " tb2" lands at A's point first
    type(B, 4);
    burst(world, B);
    await post(world, B);
    await post(world, A);
    escape(world, A);
    escape(world, B);
    await drain(world);
    const copies = await texts(world);
    expect(copies[0]).toBe(`${START} tb1 ta1 ta2 tb2`);
    expect(judge('one POST', copies, [' tb1', ' ta1', ' ta2', ' tb2'])).toEqual([]);
  });

  it("writes the converting Escape's last letters before the cover's measure, so a conversion landing meanwhile keeps them", async () => {
    // the title wraps past 25 characters: each person's Escape converts the cover with its own copy
    const world = await setup({ target: COVER, people: 2, wrapAt: 25 });
    const [A, B] = world.tabs as [Tab, Tab];
    open(world, A, ' ta1');
    type(A, 4);
    escape(world, A);
    await drain(world);
    open(world, B, ' tb1');
    type(B, 4);
    escape(world, B);
    await drain(world);
    open(world, A, ' ta2');
    open(world, B, ' tb2');
    // B's word rides its Escape, which converts the cover
    type(B, 4);
    escape(world, B);
    measured(B);
    await post(world, B);
    // A's word is unflushed at A's Escape, and B's conversion reaches A while A's cover is measured
    type(A, 4);
    escape(world, A);
    await world.tick();
    deliver(A);
    measured(A);
    await drain(world);
    const copies = await texts(world);
    expect(A.refused).toEqual([]);
    expect(copies[0]).toBe(`${START} ta1 tb1 tb2 ta2`);
    expect(judge('measure', copies, [' ta1', ' tb1', ' ta2', ' tb2'])).toEqual([]);
  });

  it("keeps both people's words whole across seeded orders on a body text", async () => {
    const rounds = [[' ta1 ua1', ' tb1 ub1']];
    const seeds = SEEDS || 400;
    const failures: string[] = [];
    for (let seed = 1; seed <= seeds; seed += 1)
      failures.push(
        ...judge(`seed ${seed}`, await play({ seed, target: BODY, rounds }), wordsOf(rounds)),
      );
    expect(failures.slice(0, 5), `${failures.length} of ${seeds} seeds`).toEqual([]);
  }, 3_600_000);

  it('keeps every word of the row on the cover, three rounds, the title converted at its wrap', async () => {
    const rounds = rowRounds(2, 3);
    const seeds = SEEDS || 800;
    const failures: string[] = [];
    for (let seed = 1; seed <= seeds; seed += 1)
      failures.push(
        ...judge(`seed ${seed}`, await play({ seed, target: COVER, rounds }), wordsOf(rounds)),
      );
    expect(failures.slice(0, 5), `${failures.length} of ${seeds} seeds`).toEqual([]);
  }, 3_600_000);

  it('keeps every word of three people typing at the same and nearby points of the cover', async () => {
    const rounds = rowRounds(3, 2);
    const seeds = SEEDS || 800;
    const choices: Start[] = ['end', 'end', 'last-word', 'first-word'];
    const failures: string[] = [];
    for (let seed = 1; seed <= seeds; seed += 1) {
      const pick = random(seed * 7919);
      const plan = rounds.map((round) => round.map(() => choices[Math.floor(pick() * 4)]!));
      failures.push(
        ...judge(
          `seed ${seed} ${JSON.stringify(plan)}`,
          await play({ seed, target: COVER, rounds, starts: (r, n) => plan[r]![n]! }),
          wordsOf(rounds),
        ),
      );
    }
    expect(failures.slice(0, 5), `${failures.length} of ${seeds} seeds`).toEqual([]);
  }, 3_600_000);
});
