// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { heldNotes, NOTES_DEFAULT_HEIGHT, NotesPane } from '@turboslide/chrome/NotesPane';
import type { SyncStatus } from '@turboslide/realtime/client/room-client';

import { leaveListeners } from './leave-warning';

// The speaker notes typed in the 400 ms before their write (NotesPane NOTES_BURST_MS) leave with
// the page like InlineText's held bursts: the leave warning counts them, and `pagehide` and a tab
// turning hidden write them before the controller stops. Under jsdom with the real pane and the
// listeners' own defaults (flushHeldTyping, heldTyping), as EditorRoot registers them.

declare global {
  // React reads it to allow act() outside a test renderer
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const snapshot = { sync: { pending: 0 } as SyncStatus, pending: 0, serverWrites: 0 };
let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

/** Mounts one notes pane on slide `s1` whose commits are recorded in `calls`. */
function mountPane(calls: string[]): HTMLTextAreaElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(NotesPane, {
        slideId: 's1',
        notes: '',
        onCommit: (notes: string) => calls.push(`write:${notes}`),
        height: NOTES_DEFAULT_HEIGHT,
        onHeightChange: () => undefined,
        windowHeight: 900,
      }),
    ),
  );
  const area = host.querySelector<HTMLTextAreaElement>('[data-control="notes.text"]');
  if (!area) throw new Error('no notes field');
  return area;
}

/** Types `text` into the field the way the browser does: the value, then an input event. */
function type(area: HTMLTextAreaElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(area, text);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function asks(listener: (event: BeforeUnloadEvent) => void): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  listener(event as BeforeUnloadEvent);
  return event.defaultPrevented;
}

describe('leaveListeners and the speaker notes', () => {
  it('counts a held note in the leave warning and writes it on pagehide before the stop', () => {
    const calls: string[] = [];
    const area = mountPane(calls);
    const listeners = leaveListeners(
      { getSnapshot: () => snapshot, stop: () => calls.push('stop') },
      { kind: 'server' },
      undefined,
      () => 'visible',
      () => undefined,
    );
    expect(asks(listeners.beforeunload)).toBe(false);
    type(area, 'Open with the number');
    expect(heldNotes()).toBe(1);
    expect(asks(listeners.beforeunload)).toBe(true);
    listeners.pagehide();
    expect(calls).toEqual(['write:Open with the number', 'stop']);
    expect(heldNotes()).toBe(0);
    expect(asks(listeners.beforeunload)).toBe(false);
  });

  it('writes a held note when the tab turns hidden', () => {
    const calls: string[] = [];
    const area = mountPane(calls);
    let state: DocumentVisibilityState = 'visible';
    const listeners = leaveListeners(
      { getSnapshot: () => snapshot, stop: () => undefined },
      { kind: 'server' },
      undefined,
      () => state,
      () => undefined,
    );
    type(area, 'Close on the ask');
    listeners.visibilitychange();
    expect(calls).toEqual([]);
    state = 'hidden';
    listeners.visibilitychange();
    expect(calls).toEqual(['write:Close on the ask']);
  });
});
