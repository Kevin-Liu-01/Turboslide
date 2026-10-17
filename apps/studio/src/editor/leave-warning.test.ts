import { describe, expect, it } from 'vitest';

import type { SyncStatus } from '@turboslide/realtime/client/room-client';
import { heldBursts } from '@turboslide/viewer/InlineText';

import { heroDocument } from '../try/hero-deck';
import { createTabBackend } from '../try/tab-backend';
import type { TabPerson } from '../try/tab-backend';
import type { EditorBackend } from './backend';
import { createEditorController } from './controller';
import { leaveWarning, unsavedWrites } from './leave-warning';

// The leave warning (SPEC-3 0.7, 3.6): on the server backend a leave with operations pending, or
// with a deck write running on the server (a picture upload), asks for the browser's leave prompt;
// on the tab backend of /try, which /home frames, no leave asks, since nothing there is saved
// beyond the tab.

/** Dispatches one cancelable `beforeunload` at the listener, as a window does; answers the event. */
function leave(listener: (event: BeforeUnloadEvent) => void): Event {
  const target = new EventTarget();
  target.addEventListener('beforeunload', (event) => listener(event));
  const event = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const from = Date.now();
  while (!check()) {
    if (Date.now() - from > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('leaveWarning', () => {
  it('asks on the server backend while operations are pending', () => {
    expect(leave(leaveWarning({ kind: 'server' }, () => 2)).defaultPrevented).toBe(true);
  });

  it('asks nothing on the server backend once nothing is pending', () => {
    expect(leave(leaveWarning({ kind: 'server' }, () => 0)).defaultPrevented).toBe(false);
  });

  it('never asks on the tab backend, pending or not', () => {
    expect(leave(leaveWarning({ kind: 'tab' }, () => 3)).defaultPrevented).toBe(false);
    expect(leave(leaveWarning({ kind: 'tab' }, () => 0)).defaultPrevented).toBe(false);
  });

  it('counts a server side write the room does not hold yet', () => {
    const sync = { pending: 0 } as SyncStatus;
    const asks = (serverWrites: number) =>
      leave(
        leaveWarning({ kind: 'server' }, () => unsavedWrites({ sync, pending: 0, serverWrites })),
      ).defaultPrevented;
    expect(asks(1)).toBe(true);
    expect(asks(0)).toBe(false);
  });

  /* InlineText holds the keys of the last 100 ms before its burst writes them (TEXT_BURST_MS);
     EditorRoot writes them on pagehide, and the warning counts them until then */
  it('counts a text session holding typed keys its burst has not written', () => {
    const sync = { pending: 0 } as SyncStatus;
    const asks = (held: number) =>
      leave(
        leaveWarning({ kind: 'server' }, () =>
          unsavedWrites({ sync, pending: 0, serverWrites: 0 }, held),
        ),
      ).defaultPrevented;
    expect(asks(1)).toBe(true);
    expect(asks(0)).toBe(false);
    /* without a count it reads InlineText heldBursts(): no session is open here */
    expect(heldBursts()).toBe(0);
    expect(unsavedWrites({ sync, pending: 0, serverWrites: 0 })).toBe(0);
  });

  it('asks while a picture uploads on the server backend, and not once the upload answers', async () => {
    const deckId = 'leave-upload';
    const person: TabPerson = {
      author: {
        kind: 'human',
        name: 'Cobalt 118',
        principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
      },
      role: 'owner',
      trust: 'label',
      hue: 1,
    };
    const tab = createTabBackend({
      deckId,
      document: heroDocument(deckId),
      people: [person],
      tabOnly: {
        sentence: 'This presentation lives only in this tab.',
        dialogs: [],
        action: { label: 'New Presentation', run: () => undefined },
      },
      openPage: () => undefined,
    });
    /* the upload's server call, held until the test answers it */
    const held: { reject?: (error: Error) => void } = {};
    const backend: EditorBackend = {
      ...tab.backend,
      kind: 'server',
      runDeckActionDetailed: () =>
        new Promise((_resolve, reject) => {
          held.reject = reject;
        }),
    };
    const controller = createEditorController({
      deckId,
      author: person.author,
      payload: tab.payloadFor(person),
      backend,
    });
    const warning = leaveWarning(backend, () => unsavedWrites(controller.getSnapshot()));
    const upload = controller.invoke('asset.add', {
      id: 'photo',
      file: 'data:image/png;base64,iVBORw0KGgo=',
      role: 'capture',
      alt: '',
      baseRevision: controller.getSnapshot().serverRevision,
    });
    await until(() => held.reject !== undefined);
    expect(controller.getSnapshot().serverWrites).toBe(1);
    expect(controller.getSnapshot().pending).toBe(0);
    expect(leave(warning).defaultPrevented).toBe(true);
    held.reject?.(new Error('The store did not answer'));
    await expect(upload).rejects.toThrow();
    expect(controller.getSnapshot().serverWrites).toBe(0);
    expect(leave(warning).defaultPrevented).toBe(false);
  });
});
