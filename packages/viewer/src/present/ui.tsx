import type { ReactNode } from 'react';

/**
 * What the present components borrow from the chrome without importing it (SPEC 3.3: the chrome
 * depends on the viewer, never the reverse). The studio's composition hands in the Tooltip
 * primitive's anchor props and the chrome's Heroicons; the defaults below keep every control
 * named and drawn when nothing is handed in (the viewer's own tests, a bare mount).
 */

export type TipContent = {
  /** the control's name */
  name: string;
  /** one sentence on what it does */
  doc?: string;
  /** its key, as words: `L`, `Cmd P` */
  key?: string;
};

/** The anchor props of one control's tooltip: `data-tip` plus the hover and focus handlers. */
export type PresentTip = (content: TipContent) => Record<string, unknown>;

/** The fallback tooltip: the audit's `data-tip` mark alone, so a control is never nameless. */
export const defaultTip: PresentTip = (content) => ({ 'data-tip': content.name });

export type PresentIconName =
  | 'previous'
  | 'next'
  | 'laser'
  | 'captions'
  | 'fullscreen'
  | 'exitFullscreen'
  | 'exit'
  | 'options'
  | 'plus'
  | 'minus';

export type PresentIcons = Partial<Record<PresentIconName, ReactNode>>;

/** The text glyphs drawn when the chrome's icons are not handed in. */
const GLYPHS: Readonly<Record<PresentIconName, string>> = {
  previous: '‹',
  next: '›',
  laser: '●',
  captions: 'CC',
  fullscreen: '⤢',
  exitFullscreen: '⤡',
  exit: '×',
  options: '⋯',
  plus: '+',
  minus: '−',
};

/** The icon of a control: the one handed in, else its text glyph. Decorative in both cases. */
export function PresentIcon({ name, icons }: { name: PresentIconName; icons?: PresentIcons }) {
  const given = icons?.[name];
  if (given !== undefined) return <>{given}</>;
  return (
    <span className="ts-present-glyph" data-glyph={name} aria-hidden="true">
      {GLYPHS[name]}
    </span>
  );
}

/** True when the element is one of the slideshow's own controls or fields. */
export function isControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('button, a, input, select, textarea, [role="option"], [role="tab"]') !== null
  );
}

/** True when the element takes typed text: nothing in the show acts on its keys. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}
