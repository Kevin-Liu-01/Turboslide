import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAB_ONLY } from '@turboslide/chrome/menus/strings';
import type { Mutation } from '@turboslide/schema/mutations';

import { heroDocument } from '../try/hero-deck';
import { createTabBackend } from '../try/tab-backend';
import type { TabPerson } from '../try/tab-backend';
import type { EditorBackend } from './backend';
import { createEditorController } from './controller';
import type { EditorController } from './controller';

// An undo or a redo the room refuses leaves the history as it was. `history.undo()` moves the
// entry to the redo stack before the inverse is committed, and before this a refused commit left
// it there with nothing undone: the next Cmd+Z skipped that change for an older one, and
// Cmd+Shift+Z applied the skipped change a second time. The controller runs over the tab backend
// (tab-backend.test.ts) with the room's ops call wrapped, so one post can be refused; the room
// client then takes the step back out of the document, and the entry returns to its stack.

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

const DECK = 'undo-refused';

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const from = Date.now();
  while (!check()) {
    if (Date.now() - from > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const headingOf = (controller: EditorController): string | undefined => {
  const slide = controller.getSnapshot().document.slides.agenda as unknown as {
    slots: { left: { text?: string }[] };
  };
  return slide.slots.left[0]?.text;
};

const retitle = (value: string): Mutation =>
  ({ op: 'block.set', slideId: 'agenda', blockId: 'h', path: '/text', value }) as Mutation;

describe('an undo or a redo the room refuses', () => {
  let said: string[];
  /** while true the room's ops call answers every entry of a post refused */
  let refuse: boolean;
  let controller: EditorController;
  let stopRoom: () => void;

  beforeEach(() => {
    said = [];
    refuse = false;
    vi.stubGlobal('document', {
      documentElement: { dataset: {} },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('a request left the tab');
      }),
    );
    const { backend, room, payloadFor } = createTabBackend({
      deckId: DECK,
      document: heroDocument(DECK),
      people: [visitor],
      tabOnly: {
        sentence: TAB_ONLY.sentence,
        dialogs: ['share'],
        action: { label: 'New Presentation', run: () => undefined },
      },
      openPage: () => undefined,
      checkpointIdleMs: 50,
    });
    stopRoom = () => room.stop();
    let head = 0;
    let revision = 0;
    const refusing: EditorBackend = {
      ...backend,
      roomTransport: (...args) => {
        const transport = backend.roomTransport(...args);
        return {
          ...transport,
          postOps: async (body) => {
            if (refuse)
              return {
                ok: true,
                entries: [],
                rejected: body.entries.map((entry) => ({
                  opId: entry.opId,
                  reason: 'invalid' as const,
                })),
                head,
                revision,
              };
            const answer = await transport.postOps(body);
            if (answer.ok) {
              head = answer.head;
              revision = answer.revision;
            }
            return answer;
          },
        };
      },
    };
    controller = createEditorController({
      deckId: DECK,
      author: visitor.author,
      payload: payloadFor(visitor),
      backend: refusing,
    });
    controller.attachEditorShell({
      say: (message: string) => {
        said.push(message);
      },
    } as never);
    controller.start();
  });

  afterEach(() => {
    controller.stop();
    stopRoom();
    vi.unstubAllGlobals();
  });

  const historyOf = () => controller.getSnapshot().history;

  it('keeps a refused undo as the next step, and undoes it once the room takes it', async () => {
    await controller.commit([retitle('Agenda today')], 'block.set');
    expect(headingOf(controller)).toBe('Agenda today');
    expect(historyOf().canUndo).toBe(true);

    refuse = true;
    await controller.undo();
    await until(() => headingOf(controller) === 'Agenda today');
    expect(historyOf().canUndo).toBe(true);
    expect(historyOf().canRedo).toBe(false);
    expect(historyOf().entries).toHaveLength(1);

    refuse = false;
    await controller.undo();
    await until(() => headingOf(controller) === 'Agenda');
    expect(historyOf().canUndo).toBe(false);
    expect(historyOf().canRedo).toBe(true);
  }, 20_000);

  it('keeps a refused redo on the redo stack, and redoes it once', async () => {
    await controller.commit([retitle('Agenda today')], 'block.set');
    await controller.undo();
    await until(() => headingOf(controller) === 'Agenda');

    refuse = true;
    await controller.redo();
    await until(() => headingOf(controller) === 'Agenda');
    expect(historyOf().canRedo).toBe(true);
    expect(historyOf().canUndo).toBe(false);

    refuse = false;
    await controller.redo();
    await until(() => headingOf(controller) === 'Agenda today');
    expect(historyOf().canUndo).toBe(true);
    expect(historyOf().canRedo).toBe(false);
    expect(historyOf().entries).toHaveLength(1);
  }, 20_000);
});
