import { useEffect, useRef, useState } from 'react';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';

import { FORMAT } from '../menus/strings';
import { tipProps } from '../Tooltip';
import type { SectionWrite } from './fields';

/**
 * Alt text (gslides-parity SPEC-2 0.51, 2.5.6, section 5; R05 B7, Cmd+Option+Y): the description
 * a screen reader reads, on every block. One `block.setAlt` on blur when the text changed: the
 * action writes the block's own `alt`, or the asset's description on a block that shows an asset
 * (two pictures of one asset share one description), and its output names where it went.
 *
 * The focus (docs/archive/rounds/POLISH.md 2.5 item 45; the polish round's fix round 2, the row
 * `images.alt.focused-empty`): the panel focuses the field marked `data-autofocus` when a row
 * opens it at this section (FormatOptions.tsx), a call that does nothing while the field is not
 * drawn or not enabled yet. The section hands the focus to its own field once the field is drawn
 * and enabled, on the frames after it mounts and again when it becomes enabled, while nothing
 * else holds the focus and this section is the one the panel was opened at (the only open
 * section; a panel opened from the toolbar keeps its remembered set and the button holds the
 * focus), so a seller types at once on every tier and the field never takes the focus from
 * anything (`takeFocusWhenDrawn`).
 */
export type AltTextSectionProps = {
  block: Block;
  /** the asset the block shows, whose description it shares */
  asset?: Asset;
  write: SectionWrite;
};

/** How many animation frames the field waits to be drawn and enabled before it gives up. */
export const FOCUS_WAIT_FRAMES = 60;

/**
 * True when the field is the one the panel was opened at and nothing holds the focus: its
 * section is open and is the panel's only open section (a row's opening collapses the others,
 * FormatOptions.tsx `openingCollapsed`), and the active element is the body or nothing.
 */
export function wantsFocus(field: HTMLElement, active: Element | null): boolean {
  if (active !== null && active !== field.ownerDocument.body) return false;
  const section = field.closest('[data-section]');
  if (section === null || section.classList.contains('is-closed')) return false;
  const panel = section.closest('.ts-panel') ?? section.parentElement;
  const open = panel?.querySelectorAll('[data-section]:not(.is-closed)') ?? [];
  return open.length === 1 && open[0] === section;
}

/**
 * Focuses the field once it is drawn and enabled, on the animation frames after the call, for at
 * most `FOCUS_WAIT_FRAMES`; stops when something else takes the focus. Answers the cancel.
 */
export function takeFocusWhenDrawn(
  field: HTMLTextAreaElement,
  frame: (run: () => void) => number = (run) => requestAnimationFrame(run),
  cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
): () => void {
  let id = 0;
  let left = FOCUS_WAIT_FRAMES;
  const tick = () => {
    id = 0;
    if (!field.isConnected) return;
    const active = field.ownerDocument.activeElement;
    if (active === field) return;
    if (!wantsFocus(field, active)) return;
    if (!field.disabled && field.getClientRects().length > 0) {
      field.focus();
      if (field.ownerDocument.activeElement === field) return;
    }
    left -= 1;
    if (left > 0) id = frame(tick);
  };
  id = frame(tick);
  return () => {
    if (id !== 0) cancel(id);
  };
}

export function AltTextSection({ block, asset, write }: AltTextSectionProps) {
  const words = FORMAT.alt;
  const current = asset?.alt ?? block.alt ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const tip = tipProps({ name: words.description, doc: words.doc });
  const field = useRef<HTMLTextAreaElement>(null);
  /* the focus after the mount and once the field is enabled (the panel's own call ran before
     either on the blob tier, and the focus stayed on the body) */
  useEffect(() => {
    if (field.current === null || write.busy) return undefined;
    return takeFocusWhenDrawn(field.current);
  }, [write.busy]);
  const commit = () => {
    if (draft === null) return;
    const alt = draft.trim();
    setDraft(null);
    if (alt === current) return;
    write.report(
      write.dispatch('block.setAlt', {
        slideId: write.slideId,
        blockId: block.id,
        alt,
        baseRevision: write.revision,
      }),
    );
  };
  return (
    <label className="ts-fo-alt">
      <span className="ts-fo-field-label">{words.description}</span>
      {/* the field the panel focuses when a row opens it on this section (docs/archive/rounds/POLISH.md item 45;
          FormatOptions.tsx reads data-autofocus, build/b4.md R3), so the seller types at once */}
      <textarea
        ref={field}
        value={draft ?? current}
        aria-label={words.description}
        data-control="formatOptions.altText.description"
        data-autofocus=""
        rows={3}
        disabled={write.busy}
        {...tip}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
    </label>
  );
}
