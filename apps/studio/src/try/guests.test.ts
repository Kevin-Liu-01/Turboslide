import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentPresence } from './agents';
import { STAY_MS, blocksOn, createGuests } from './guests';
import type { GuestHandle } from './guests';
import { heroDocument } from './hero-deck';

// The short visits of the title's avatars (docs/SITE.md B, C.10) on a fake clock: a pressed
// person joins, points at the slide the visitor is looking at and leaves after STAY_MS; a second
// press keeps them longer; OpenClaw and Hermes leave one comment on that slide and resolve it
// before they leave; a guest writes nothing else; nothing is posted while the agents' gate is
// shut; and under reduced motion each pointer move is one post.

type Log = {
  presence: { key: string; state: AgentPresence }[];
  invokes: { key: string; action: string; input: unknown }[];
  joined: string[];
  left: string[];
};

function setup(options: { open?: () => boolean; reduced?: boolean; active?: string | null } = {}) {
  const log: Log = { presence: [], invokes: [], joined: [], left: [] };
  const document = heroDocument('try-guests');
  const arrived: string[] = [];
  const guests = createGuests({
    join: (key): GuestHandle => {
      log.joined.push(key);
      return {
        present: (state) => log.presence.push({ key, state }),
        invoke: async (action, input) => {
          log.invokes.push({ key, action, input });
          return action === 'comment.add' ? { thread: { id: `thread-${key}` } } : {};
        },
        leave: () => log.left.push(key),
      };
    },
    visitor: { activeSlide: () => (options.active === undefined ? 'numbers' : options.active) },
    document: () => document,
    open: options.open ?? (() => true),
    reducedMotion: () => options.reduced === true,
    onArrive: (key) => arrived.push(key),
  });
  return { guests, log, arrived, document };
}

describe("the title's guests", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-15T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('brings a person in on the visitor’s slide and lets them leave after the stay', async () => {
    const { guests, log, arrived } = setup();
    guests.visit({ key: 'guest:argon-905', kind: 'person' });
    expect(log.joined).toEqual(['guest:argon-905']);
    expect(guests.active()).toEqual(['guest:argon-905']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(arrived).toEqual(['guest:argon-905']);
    expect(log.presence.length).toBeGreaterThan(5);
    expect(new Set(log.presence.map((row) => row.state.slideId))).toEqual(new Set(['numbers']));
    /* an outline rests only on a block of that slide */
    const blocks = new Set(blocksOn(heroDocument('x').slides.numbers));
    for (const row of log.presence)
      for (const id of row.state.selection?.blockIds ?? []) expect(blocks.has(id)).toBe(true);
    /* a person writes nothing */
    expect(log.invokes).toEqual([]);
    await vi.advanceTimersByTimeAsync(STAY_MS + 6000);
    expect(log.left).toEqual(['guest:argon-905']);
    expect(guests.active()).toEqual([]);
  });

  it('keeps a guest longer on a second press, with one join', async () => {
    const { guests, log } = setup();
    guests.visit({ key: 'guest:neon-260', kind: 'person' });
    await vi.advanceTimersByTimeAsync(STAY_MS - 2000);
    guests.visit({ key: 'guest:neon-260', kind: 'person' });
    await vi.advanceTimersByTimeAsync(8000);
    expect(log.left).toEqual([]);
    expect(log.joined).toEqual(['guest:neon-260']);
    await vi.advanceTimersByTimeAsync(STAY_MS);
    expect(log.left).toEqual(['guest:neon-260']);
  });

  it('has an agent comment on the visitor’s slide and resolve it before it leaves', async () => {
    const { guests, log } = setup({ active: 'plan' });
    guests.visit({ key: 'agent:hermes', kind: 'agent', comment: 'Read this slide.' });
    await vi.advanceTimersByTimeAsync(STAY_MS + 6000);
    expect(log.invokes.map((row) => row.action)).toEqual(['comment.add', 'comment.resolve']);
    expect(log.invokes[0]?.input).toEqual({
      anchor: { kind: 'slide', slideId: 'plan' },
      body: { text: 'Read this slide.', mentions: [] },
    });
    expect(log.invokes[1]?.input).toEqual({ threadId: 'thread-agent:hermes' });
    expect(log.left).toEqual(['agent:hermes']);
  });

  it('posts nothing while the gate is shut, and moves on once it opens', async () => {
    let open = false;
    const { guests, log } = setup({ open: () => open });
    guests.visit({ key: 'guest:xenon-734', kind: 'person' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(log.presence).toEqual([]);
    open = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(log.presence.length).toBeGreaterThan(0);
    guests.stop();
  });

  it('under reduced motion moves the pointer in one post', async () => {
    const { guests, log } = setup({ reduced: true });
    guests.visit({ key: 'guest:cobalt-118', kind: 'person' });
    await vi.advanceTimersByTimeAsync(400);
    expect(log.presence).toHaveLength(1);
    guests.stop();
  });

  it('falls back to the first slide when the visitor is on none', async () => {
    const { guests, log, document } = setup({ active: null });
    guests.visit({ key: 'guest:titanium-471', kind: 'person' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(log.presence[0]?.state.slideId).toBe(document.deck.sections[0]?.slideIds[0]);
    guests.stop();
  });
});
