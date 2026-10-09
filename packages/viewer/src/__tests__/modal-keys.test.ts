// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';

import { Editor } from '../Editor';
import { modalDialogOpen, outsideOpenModal, stageOwnsClipboard } from '../Selection';

// The stage behind a modal dialog (the keyboard verifier's pass 1 on the dropdown round, finding
// 1): after a choice in the Share dialog the focus fell to the page body, and from the body Tab
// and Shift Tab walked the slide's objects behind the dialog, Delete removed the selected table
// and typing replaced the title's text. No key and no clipboard event from outside an open modal
// dialog is the stage's; the dialog answers it (Dialog.tsx).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const box = (id: string, y: number): Block => ({
  id,
  type: 'text',
  text: `The ${id} box`,
  pos: { x: 200, y, w: 480, h: 120, z: 1 },
});

const canvas: Slide = {
  schemaVersion: 1,
  id: 'free',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: { main: [box('agenda', 200), box('notes', 500)] },
};

const doc: DeckDocument = {
  deck: {
    schemaVersion: 1,
    id: 'modal-keys',
    title: 'Modal keys',
    theme: 'gt-ink-paper',
    sections: [{ id: 'one', name: 'One', slideIds: ['free'] }],
    assets: {},
    revision: 1,
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
  },
  slides: { free: canvas },
};

type Mounted = {
  root: Root;
  container: HTMLElement;
  dispatch: ReturnType<typeof vi.fn>;
  selections: ReturnType<typeof vi.fn>;
};

function mount(): Mounted {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const dispatch = vi.fn(() => undefined);
  const selections = vi.fn();
  act(() => {
    root.render(
      createElement(Editor, {
        document: doc,
        slideId: 'free',
        theme: 'light',
        assetBase: '/decks/modal-keys/',
        stageSize: { width: 1600, height: 900 },
        index: 0,
        total: 1,
        narrow: false,
        dispatch,
        onSelectionChange: selections,
      }),
    );
  });
  return { root, container, dispatch, selections };
}

/** Selects a box with one press and release, as the browser sends them. */
function select(m: Mounted, id: string): void {
  const el = m.container.querySelector<HTMLElement>(`[data-run="${id}/text"]`);
  if (!el) throw new Error(`no run ${id}/text on the stage`);
  const at = { clientX: 300, clientY: 240, button: 0, bubbles: true };
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', at));
    el.dispatchEvent(new MouseEvent('mousedown', { ...at, detail: 1 }));
    el.dispatchEvent(new MouseEvent('pointerup', at));
    el.dispatchEvent(new MouseEvent('mouseup', { ...at, detail: 1 }));
  });
}

/** A modal card in the page, as Dialog.tsx draws the Share dialog's. */
function openModal(): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.innerHTML = '<button type="button">Done</button>';
  document.body.append(card);
  return card;
}

/** A key pressed with the focus on the body, or on the element given. */
function press(
  key: string,
  init: KeyboardEventInit = {},
  on: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    on.dispatchEvent(event);
  });
  return event;
}

let mounted: Mounted | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('outsideOpenModal', () => {
  it('reads an open modal dialog and where the target sits', () => {
    expect(outsideOpenModal(document.body)).toBe(false);
    const card = openModal();
    expect(outsideOpenModal(document.body)).toBe(true);
    expect(outsideOpenModal(null)).toBe(true);
    expect(outsideOpenModal(card.querySelector('button'))).toBe(false);
    /* a card that is closing (under aria-hidden, the help card's) holds nothing back */
    const closing = document.createElement('div');
    closing.setAttribute('aria-hidden', 'true');
    closing.append(card);
    document.body.append(closing);
    expect(outsideOpenModal(document.body)).toBe(false);
    /* a floating card (no aria-modal) holds nothing back */
    closing.remove();
    const floating = document.createElement('div');
    floating.setAttribute('role', 'dialog');
    document.body.append(floating);
    expect(outsideOpenModal(document.body)).toBe(false);
  });

  it('reads whether a shown modal dialog is open, wherever the key comes from (modalDialogOpen)', () => {
    expect(modalDialogOpen()).toBe(false);
    const card = openModal();
    expect(modalDialogOpen()).toBe(true);
    card.setAttribute('hidden', '');
    expect(modalDialogOpen()).toBe(false);
    card.remove();
    expect(modalDialogOpen()).toBe(false);
  });

  it('keeps the clipboard from the stage while a modal dialog is open and the event comes from outside it', () => {
    const stage = document.createElement('div');
    document.body.append(stage);
    expect(stageOwnsClipboard(document.body, stage, false)).toBe(true);
    const card = openModal();
    expect(stageOwnsClipboard(document.body, stage, false)).toBe(false);
    card.remove();
    expect(stageOwnsClipboard(document.body, stage, false)).toBe(true);
  });
});

describe('the stage behind a modal dialog', () => {
  it('takes no Tab, Shift Tab, Delete, Backspace, Space or letter from the body while the dialog is open', () => {
    mounted = mount();
    const m = mounted;
    select(m, 'agenda');
    expect(m.selections).toHaveBeenCalled();
    const before = m.selections.mock.calls.length;
    const card = openModal();
    for (const event of [
      press('Tab'),
      press('Tab', { shiftKey: true }),
      press('Delete'),
      press('Backspace'),
      press(' '),
      press('x'),
    ])
      expect(event.defaultPrevented, event.key).toBe(false);
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.selections.mock.calls.length).toBe(before);
    expect(m.container.querySelector('[data-editing]')).toBeNull();
    /* the dialog closed: the same keys are the stage's again (the harness reads them) */
    card.remove();
    expect(press('Tab').defaultPrevented).toBe(true);
    expect(m.selections.mock.calls.length).toBeGreaterThan(before);
    press('Delete');
    expect(m.dispatch).toHaveBeenCalled();
  });

  /* the final pass 1, finding 1: a key on the dialog's own buttons is the dialog's and the
     browser's; the stage's listener runs first in the window's capture phase, so it must take
     nothing from inside the card either (crop mode's Enter and Escape came before the control rule) */
  it('takes no key from a button inside the open dialog and prevents none of them', () => {
    mounted = mount();
    const m = mounted;
    select(m, 'agenda');
    const before = m.selections.mock.calls.length;
    const card = openModal();
    const done = card.querySelector('button')!;
    for (const [key, init] of [
      ['Tab', {}],
      ['Tab', { shiftKey: true }],
      ['Delete', {}],
      ['Backspace', {}],
      [' ', {}],
      ['x', {}],
      ['Enter', {}],
      ['Escape', {}],
      ['ArrowLeft', {}],
      ['d', { metaKey: true }],
      ['F10', { shiftKey: true }],
    ] as const) {
      const event = press(key, init, done);
      expect(event.defaultPrevented, `${key} ${JSON.stringify(init)}`).toBe(false);
    }
    expect(m.dispatch).not.toHaveBeenCalled();
    expect(m.selections.mock.calls.length).toBe(before);
    expect(m.container.querySelector('[data-editing]')).toBeNull();
    card.remove();
  });
});
