// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import type { ViewerSlide } from '@turboslide/viewer/model';
import { openPresentChannel } from '@turboslide/viewer/present/presentSync';
import type {
  BroadcastLike,
  PresentChannel,
  PresentMessage,
  PresentMessageBody,
} from '@turboslide/viewer/present/presentSync';

import type { EditorDeck } from '../server/write';
import { PresenterPage } from './PresenterPage';
import { Slideshow } from './Slideshow';

// The presenter follows the audience window's state, and the audience answers each of the
// presenter's moves with a state. Two quick presses put two moves in flight: the late answer to
// the first one described the audience before the second, and the presenter followed it back
// (the snap-back of the presenter audit, item 1). On a slide with click steps the presenter then
// pressed from the stale step, and the audience, already past it, dropped the press. The answer
// now echoes the move it answers (`reply`), and an answer to an older move is never followed.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

vi.mock('./useStudioSession', () => ({ useStudioSession: () => undefined }));
vi.mock('@turboslide/viewer/LiveClone', () => ({ LiveClone: () => null }));
vi.mock('@turboslide/render/slide', () => ({
  renderSlide: (_deck: unknown, slide: { id: string }) => ({
    html: `<section class="slide" data-slide="${slide.id}"></section>`,
  }),
}));
vi.mock('@turboslide/render/deck', () => ({ slideCounter: () => '' }));
vi.mock('@turboslide/chrome/Layer', () => ({ useLayer: () => undefined }));

/** An in-memory BroadcastChannel: every instance on a name hears every other instance at once. */
function fakeBroadcast(): new (name: string) => BroadcastLike {
  const rooms = new Map<string, Set<FakeChannel>>();
  class FakeChannel implements BroadcastLike {
    readonly name: string;
    readonly listeners = new Set<(event: { data: unknown }) => void>();
    constructor(name: string) {
      this.name = name;
      const room = rooms.get(name) ?? new Set<FakeChannel>();
      room.add(this);
      rooms.set(name, room);
    }
    addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
      this.listeners.add(listener);
    }
    postMessage(message: unknown): void {
      for (const other of rooms.get(this.name) ?? []) {
        if (other === this) continue;
        for (const listener of other.listeners) listener({ data: structuredClone(message) });
      }
    }
    close(): void {
      rooms.get(this.name)?.delete(this);
    }
  }
  return FakeChannel;
}

const click = (id: string, block: string) => ({
  id,
  block,
  role: 'enter' as const,
  motion: { preset: 'fade' as const },
  start: 'click' as const,
  durationMs: 400,
});

/** Four slides; the second plays two click steps. */
function deckDocument(): DeckDocument {
  const slide = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: 'content',
    title: id,
    blocks: [],
    ...extra,
  });
  return {
    deck: {
      id: 'd',
      title: 'Snap back',
      revision: 1,
      theme: 'gt-ink-paper',
      sections: [{ id: 'one', name: 'One', slideIds: ['s1', 's2', 's3', 's4'] }],
    },
    slides: {
      s1: slide('s1'),
      s2: slide('s2', { effects: [click('fx-1', 'b1'), click('fx-2', 'b2')] }),
      s3: slide('s3'),
      s4: slide('s4'),
    },
  } as unknown as DeckDocument;
}

type Sent = PresentMessage & { seq: number };

let root: Root | null = null;
let container: HTMLElement | null = null;
let audience: PresentChannel | null = null;
let heard: Sent[] = [];

function mount(): HTMLElement {
  const Channel = fakeBroadcast();
  vi.stubGlobal('BroadcastChannel', Channel);
  heard = [];
  audience = openPresentChannel('d', 'audience', (message) => heard.push(message as Sent), {
    BroadcastChannel: Channel,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const payload = { deckId: 'd', document: deckDocument(), sprite: '' } as unknown as EditorDeck;
  act(() => {
    root?.render(createElement(PresenterPage, { payload }));
  });
  return container;
}

/** The presenter window's id, from its hello. */
function presenterId(): string {
  const hello = heard.find((message) => message.type === 'hello');
  if (hello === undefined) throw new Error('the presenter said no hello');
  return hello.from;
}

function gotos(): Array<Extract<Sent, { type: 'goto' }>> {
  return heard.filter((message): message is Extract<Sent, { type: 'goto' }> => {
    return message.type === 'goto';
  });
}

/** The audience's state, answering the move `reply` names (null: its own move). */
function state(
  slideId: string,
  index: number,
  reply: { to: string; seq: number } | null,
  step = 0,
  steps = 0,
): void {
  const body = {
    type: 'state',
    slideId,
    index,
    total: 4,
    blank: null,
    laser: false,
    step,
    steps,
    reply,
  } as PresentMessageBody;
  act(() => audience?.post(body));
}

function press(key: string): void {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function shown(host: HTMLElement): { index: string | null; step: string | null } {
  return {
    index: host.querySelector('[data-control="presenter"]')?.getAttribute('data-index') ?? null,
    step: host.querySelector('[data-control="presenter.step"]')?.getAttribute('data-step') ?? null,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  act(() => root?.unmount());
  /* useMountEffect runs its cleanup on a timer after the unmount: let it remove the listeners */
  await new Promise((resolve) => setTimeout(resolve, 0));
  container?.remove();
  audience?.close();
  root = null;
  container = null;
  audience = null;
  vi.unstubAllGlobals();
});

describe('the presenter and a late answer to an older move', () => {
  it('stays on its latest slide when the answer to the press before arrives', () => {
    const host = mount();
    const me = presenterId();
    state('s3', 2, null);
    expect(shown(host).index).toBe('2');

    /* two quick presses, forward to s4 and back to s3: two moves in flight */
    press('ArrowRight');
    press('ArrowLeft');
    const moves = gotos();
    expect(moves.map((move) => move.slideId)).toEqual(['s4', 's3']);
    expect(shown(host).index).toBe('2');

    /* the late answer to the first press says s4: the presenter stays on s3 */
    state('s4', 3, { to: me, seq: moves[0]!.seq });
    expect(shown(host).index).toBe('2');

    /* the answer to the latest press is followed, and so is the audience's own move after it */
    state('s3', 2, { to: me, seq: moves[1]!.seq });
    expect(shown(host).index).toBe('2');
    state('s4', 3, { to: me, seq: moves[1]!.seq });
    expect(shown(host).index).toBe('3');
  });

  it('keeps its latest step on a slide with click steps, so the next press leaves the slide', () => {
    const host = mount();
    const me = presenterId();
    state('s2', 1, null, 0, 2);
    expect(shown(host)).toEqual({ index: '1', step: '0' });

    press('ArrowRight');
    press('ArrowRight');
    expect(shown(host)).toEqual({ index: '1', step: '2' });
    const [one, two] = gotos();
    expect([one?.step, two?.step]).toEqual([1, 2]);

    /* the answer to the first click arrives after the second: the presenter keeps step 2 */
    state('s2', 1, { to: me, seq: one!.seq }, 1, 2);
    expect(shown(host)).toEqual({ index: '1', step: '2' });

    /* so the next press asks for the next slide, not for step 2 the audience already shows */
    press('ArrowRight');
    expect(gotos().at(-1)).toMatchObject({ slideId: 's3', step: 0 });
    expect(shown(host).index).toBe('2');
  });

  it('follows the audience once its latest move is answered, and without a move in flight', () => {
    const host = mount();
    const me = presenterId();
    state('s1', 0, null);
    press('ArrowRight');
    const [move] = gotos();
    expect(move).toMatchObject({ slideId: 's2', step: 0 });
    state('s2', 1, { to: me, seq: move!.seq }, 0, 2);
    expect(shown(host)).toEqual({ index: '1', step: '0' });
    /* the audience's own moves: clicks on its slide, then a jump back */
    state('s2', 1, { to: me, seq: move!.seq }, 1, 2);
    expect(shown(host)).toEqual({ index: '1', step: '1' });
    state('s1', 0, { to: me, seq: move!.seq });
    expect(shown(host).index).toBe('0');
  });
});

/* the audience side: the slideshow window answers every goto, and its states name the answer */

function viewerSlide(id: string, n: number): ViewerSlide {
  return {
    id,
    n,
    title: id,
    kind: 'content',
    sectionId: 'one',
    html: `<section class="slide" data-slide="${id}"></section>`,
  };
}

const SHOW = ['s1', 's2', 's3'].map((id, at) => viewerSlide(id, at + 1));

let presenter: PresentChannel | null = null;

/** The show over a host that keeps the active slide, as the viewer's shell does. */
function mountShow(): { states: () => Array<Extract<Sent, { type: 'state' }>> } {
  const Channel = fakeBroadcast();
  vi.stubGlobal('BroadcastChannel', Channel);
  heard = [];
  presenter = openPresentChannel('d', 'presenter', (message) => heard.push(message as Sent), {
    BroadcastChannel: Channel,
  });
  function Host() {
    const [active, setActive] = useState('s1');
    return createElement(Slideshow, {
      deckId: 'd',
      slides: SHOW,
      activeId: active,
      theme: 'light',
      onGoto: setActive,
      onExit: () => undefined,
      say: () => undefined,
    });
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Host));
  });
  return {
    states: () =>
      heard.filter((message): message is Extract<Sent, { type: 'state' }> => {
        return message.type === 'state';
      }),
  };
}

function showing(): string | null {
  return (
    container?.querySelector('[data-control="present.show"]')?.getAttribute('data-slide-id') ?? null
  );
}

describe('the slideshow window answers the presenter', () => {
  afterEach(() => {
    presenter?.close();
    presenter = null;
  });

  it('names the goto it applied in the state it sends, a goto to where it already is included', () => {
    const { states } = mountShow();
    expect(states().at(-1)).toMatchObject({ slideId: 's1', reply: null });

    let seq = 0;
    act(() => {
      seq = presenter?.post({ type: 'goto', slideId: 's2', step: 0 }) ?? 0;
    });
    expect(showing()).toBe('s2');
    expect(states().at(-1)).toMatchObject({
      slideId: 's2',
      reply: { to: presenter?.id, seq },
    });

    /* the presenter asks for the slide the show already draws: nothing moves, the answer comes */
    const before = states().length;
    act(() => {
      seq = presenter?.post({ type: 'goto', slideId: 's2', step: 0 }) ?? 0;
    });
    expect(showing()).toBe('s2');
    expect(states().length).toBe(before + 1);
    expect(states().at(-1)).toMatchObject({ slideId: 's2', reply: { seq } });

    /* a slide the show does not hold moves nothing and is answered too */
    act(() => {
      seq = presenter?.post({ type: 'goto', slideId: 'gone' }) ?? 0;
    });
    expect(showing()).toBe('s2');
    expect(states().at(-1)).toMatchObject({ slideId: 's2', reply: { seq } });
  });

  it('lands on the latest of two gotos that arrive before one render', () => {
    const { states } = mountShow();
    let last = 0;
    act(() => {
      presenter?.post({ type: 'goto', slideId: 's3', step: 0 });
      last = presenter?.post({ type: 'goto', slideId: 's1', step: 0 }) ?? 0;
    });
    expect(showing()).toBe('s1');
    expect(states().at(-1)).toMatchObject({ slideId: 's1', reply: { seq: last } });

    act(() => {
      presenter?.post({ type: 'goto', slideId: 's2', step: 0 });
      last = presenter?.post({ type: 'goto', slideId: 's3', step: 0 }) ?? 0;
    });
    expect(showing()).toBe('s3');
    expect(states().at(-1)).toMatchObject({ slideId: 's3', reply: { seq: last } });
  });
});
