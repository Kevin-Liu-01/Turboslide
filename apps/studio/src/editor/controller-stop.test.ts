import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAB_ONLY } from '@turboslide/chrome/menus/strings';

import { heroDocument } from '../try/hero-deck';
import { createTabBackend } from '../try/tab-backend';
import type { TabPerson } from '../try/tab-backend';
import { createEditorController } from './controller';

// The controller's listeners on the document live from start() to stop(). Added at creation and
// never removed, they kept every controller a page ever made reachable from the document: one per
// editor mount, and one per guest visit of the landing's frame (try/session.ts). The tests run in
// node, so `document` is a recorder here; the controller is built over the tab backend, the way
// tab-backend.test.ts builds one, and `fetch` throws so nothing leaves the test.

const visitor: TabPerson = {
  author: {
    kind: 'human',
    name: 'Cobalt 118',
    principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  },
  role: 'owner',
  trust: 'label',
  hue: 1,
};

type Listener = EventListenerOrEventListenerObject;

/** A document that only records who listens, by event type. */
function recordingDocument() {
  const held = new Map<string, Set<Listener>>();
  return {
    held,
    count: (type: string): number => held.get(type)?.size ?? 0,
    total: (): number => [...held.values()].reduce((sum, set) => sum + set.size, 0),
    stub: {
      /* the theme the render reads (viewer theme-state.ts readTheme) */
      documentElement: { dataset: {} },
      addEventListener: (type: string, listener: Listener) => {
        const set = held.get(type) ?? new Set<Listener>();
        set.add(listener);
        held.set(type, set);
      },
      removeEventListener: (type: string, listener: Listener) => {
        held.get(type)?.delete(listener);
      },
    },
  };
}

const LISTENED = ['pointerdown', 'pointerup', 'pointercancel', 'keydown'] as const;

describe("the editor controller's document listeners", () => {
  let doc: ReturnType<typeof recordingDocument>;
  beforeEach(() => {
    doc = recordingDocument();
    vi.stubGlobal('document', doc.stub);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('a request left the tab');
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function controllerOnTheTab(record?: (call: string) => void) {
    const deckId = 'stop-test';
    const { backend: tab, payloadFor } = createTabBackend({
      deckId,
      document: heroDocument(deckId),
      people: [visitor],
      tabOnly: {
        sentence: TAB_ONLY.sentence,
        dialogs: ['share'],
        action: { label: 'New Presentation', run: () => undefined },
      },
      openPage: () => undefined,
      checkpointIdleMs: 50,
    });
    /* every call the controller makes on the backend, by method and action, when asked */
    const backend =
      record === undefined
        ? tab
        : (Object.fromEntries(
            Object.entries(tab).map(([key, value]) => [
              key,
              typeof value === 'function'
                ? (...args: unknown[]) => {
                    const input = args[0] as { action?: unknown } | undefined;
                    record(typeof input?.action === 'string' ? `${key} ${input.action}` : key);
                    return (value as (...a: unknown[]) => unknown).apply(tab, args);
                  }
                : value,
            ]),
          ) as typeof tab);
    return createEditorController({
      deckId,
      author: visitor.author,
      payload: payloadFor(visitor),
      backend,
    });
  }

  it('listens from start() to stop() and holds nothing before or after', () => {
    const controller = controllerOnTheTab();
    expect(doc.total()).toBe(0);
    controller.start();
    for (const type of LISTENED) expect(doc.count(type), type).toBe(1);
    expect(doc.total()).toBe(LISTENED.length);
    controller.stop();
    expect(doc.total()).toBe(0);
  });

  it('holds one listener of each kind through a start, a stop and a second start', () => {
    const controller = controllerOnTheTab();
    controller.start();
    controller.start();
    controller.stop();
    controller.start();
    for (const type of LISTENED) expect(doc.count(type), type).toBe(1);
    controller.stop();
    expect(doc.total()).toBe(0);
  });

  it('leaves no listener behind when controllers come and go, as the guests of /try do', () => {
    for (let visit = 0; visit < 5; visit += 1) {
      const controller = controllerOnTheTab();
      controller.start();
      controller.stop();
    }
    expect(doc.total()).toBe(0);
  });

  /* the reads a start schedules (the sidecar and the inbox, 60 ms after the room attaches) and
     the History panel's re-read were left running by stop(): a stopped editor read the comments,
     the notifications and the versions of a deck nobody had open */
  it('drops the comment, inbox and version reads still pending at the stop', async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const controller = controllerOnTheTab((call) => calls.push(call));
      controller.start();
      controller.stop();
      const before = calls.length;
      await vi.advanceTimersByTimeAsync(5_000);
      const late = calls.slice(before).filter((call) => /comment|notification|version/i.test(call));
      expect(late).toEqual([]);
      /* a second start schedules them again */
      controller.start();
      await vi.advanceTimersByTimeAsync(5_000);
      controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
