// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';

import type { EditorDispatch } from '../dispatch';
import {
  AltTextSection,
  FOCUS_WAIT_FRAMES,
  takeFocusWhenDrawn,
  wantsFocus,
} from '../inspector/alt';
import { hideTooltip } from '../Tooltip';

// The Alt text field's focus (docs/POLISH.md 2.5 item 45; the polish round's fix round 2, the row
// images.alt.focused-empty): the section hands the focus to its own field once the field is drawn
// and enabled, while nothing else holds the focus and the section is the only open one of its
// panel; a field that is not drawn yet waits a frame at a time and gives up after the bound; a
// focus held elsewhere, a second open section or a closed section leaves the focus alone. jsdom
// draws nothing, so "drawn" is stubbed through getClientRects on the field.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const block: Block = {
  id: 'pic',
  type: 'shot',
  asset: 'a',
  pos: { x: 200, y: 160, w: 480, h: 320, z: 1 },
} as Block;

/** A fake frame scheduler: callbacks run when `step` is called, one frame at a time. */
function frames() {
  const queue = new Map<number, () => void>();
  let next = 1;
  return {
    frame: (run: () => void): number => {
      const id = next;
      next += 1;
      queue.set(id, run);
      return id;
    },
    cancel: (id: number) => {
      queue.delete(id);
    },
    step: () => {
      const pending = [...queue.entries()];
      queue.clear();
      for (const [, run] of pending) run();
    },
    size: () => queue.size,
  };
}

/** A panel with two sections, the Alt text one open and the other closed unless `bothOpen`. */
function panel(
  bothOpen = false,
  closedAlt = false,
): { field: HTMLTextAreaElement; other: HTMLButtonElement } {
  const root = document.createElement('div');
  root.className = 'ts-panel';
  root.innerHTML = `
    <section class="ts-panel-section ${bothOpen ? '' : 'is-closed'}" data-section="picture"><button type="button" id="other">Replace</button></section>
    <section class="ts-panel-section ${closedAlt ? 'is-closed' : ''}" data-section="altText"><textarea data-control="formatOptions.altText.description"></textarea></section>`;
  document.body.appendChild(root);
  const field = root.querySelector('textarea') as HTMLTextAreaElement;
  const other = root.querySelector('#other') as HTMLButtonElement;
  return { field, other };
}

const drawn = (field: HTMLElement) => {
  field.getClientRects = () => [{}] as unknown as DOMRectList;
};

describe('wantsFocus', () => {
  it('is true for the only open section while the body holds the focus, false when another element does, another section is open too, or the section is closed', () => {
    const { field, other } = panel();
    expect(wantsFocus(field, document.body)).toBe(true);
    expect(wantsFocus(field, null)).toBe(true);
    expect(wantsFocus(field, other)).toBe(false);
    cleanup();
    document.body.innerHTML = '';
    expect(wantsFocus(panel(true).field, document.body)).toBe(false);
    document.body.innerHTML = '';
    expect(wantsFocus(panel(false, true).field, document.body)).toBe(false);
    document.body.innerHTML = '';
  });
});

describe('takeFocusWhenDrawn', () => {
  it('focuses the field on the first frame it is drawn and enabled, and waits while it is not', () => {
    const { field } = panel();
    const f = frames();
    takeFocusWhenDrawn(field, f.frame, f.cancel);
    /* not drawn yet: the frames pass and the focus stays on the body */
    f.step();
    f.step();
    expect(document.activeElement).toBe(document.body);
    drawn(field);
    field.disabled = true;
    f.step();
    expect(document.activeElement).toBe(document.body);
    field.disabled = false;
    f.step();
    expect(document.activeElement).toBe(field);
    /* once the field holds the focus nothing more is scheduled */
    f.step();
    expect(f.size()).toBe(0);
    document.body.innerHTML = '';
  });

  it('never takes the focus from another element, and stops when one takes it', () => {
    const { field, other } = panel();
    drawn(field);
    other.focus();
    const f = frames();
    takeFocusWhenDrawn(field, f.frame, f.cancel);
    f.step();
    expect(document.activeElement).toBe(other);
    expect(f.size()).toBe(0);
    document.body.innerHTML = '';
  });

  it('gives up after the bound and answers a cancel', () => {
    const { field } = panel();
    const f = frames();
    const stop = takeFocusWhenDrawn(field, f.frame, f.cancel);
    for (let i = 0; i < FOCUS_WAIT_FRAMES + 2; i += 1) f.step();
    expect(f.size()).toBe(0);
    expect(document.activeElement).toBe(document.body);
    const again = takeFocusWhenDrawn(field, f.frame, f.cancel);
    expect(f.size()).toBe(1);
    again();
    expect(f.size()).toBe(0);
    stop();
    document.body.innerHTML = '';
  });

  it('the section wires it: a mounted field in the only open section takes the focus once drawn', async () => {
    const dispatch = (async () => ({})) as unknown as EditorDispatch;
    const host = document.createElement('div');
    host.className = 'ts-panel';
    host.innerHTML =
      '<section class="ts-panel-section is-closed" data-section="picture"></section>';
    const section = document.createElement('section');
    section.className = 'ts-panel-section';
    section.setAttribute('data-section', 'altText');
    host.appendChild(section);
    document.body.appendChild(host);
    const draws = HTMLTextAreaElement.prototype.getClientRects;
    HTMLTextAreaElement.prototype.getClientRects = () => [{}] as unknown as DOMRectList;
    try {
      render(
        <AltTextSection
          block={block}
          write={{ slideId: 'cv', revision: 1, dispatch, busy: false, report: () => undefined }}
        />,
        { container: section },
      );
      const field = section.querySelector('textarea') as HTMLTextAreaElement;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(document.activeElement).toBe(field);
    } finally {
      HTMLTextAreaElement.prototype.getClientRects = draws;
      document.body.innerHTML = '';
    }
  });
});
