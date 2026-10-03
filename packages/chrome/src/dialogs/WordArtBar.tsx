import { useEffect, useRef, useState } from 'react';

import { WORD_ART } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './WordArtBar.css';

/**
 * Insert > Word art (gslides-parity SPEC-2 0.14, 6.2): Google's entry bar at the top of the
 * canvas ("Type your text and press Enter"). Enter inserts a text block at 88 px with an ink
 * outline of 1.5 px, centred on the sheet as an object (the slide converts to the canvas first
 * when it is not one); Esc cancels. A labelled text input with Enter and Esc (section 10); the
 * caller makes the write. The bar closes the way Google's does (the polish round, docs/archive/rounds/POLISH.md
 * item 67; audit-chrome item 13: it stayed open through every later menu, dialog and panel
 * because Escape reached it only while its field had the focus): Escape anywhere in the document
 * cancels it unless a menu or a dialog took the key first, and so does a pointer down outside
 * the bar, which is what a click on the sheet, a menu row or a panel is.
 */
export type WordArtBarProps = {
  onInsert: (text: string) => void;
  onCancel: () => void;
};

export function WordArtBar({ onInsert, onCancel }: WordArtBarProps) {
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    field.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      /* the field's own Escape handler ran already; every other Escape closes the bar unless a
         menu or a dialog took it (they prevent the default on the way up) */
      if (root.current?.contains(event.target as Node)) return;
      cancel.current();
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      cancel.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);
  const tip = tipProps({ name: WORD_ART.label, doc: WORD_ART.placeholder, key: 'Enter' });
  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onInsert(trimmed);
  };
  return (
    <div
      ref={root}
      className="ts-wordart ts-chrome"
      role="group"
      aria-label={WORD_ART.label}
      data-control="wordArt.bar"
    >
      <input
        ref={field}
        className="ts-wordart-field"
        type="text"
        value={text}
        placeholder={WORD_ART.placeholder}
        aria-label={WORD_ART.label}
        data-control="wordArt.text"
        autoComplete="off"
        spellCheck
        {...tip}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      <button
        type="button"
        className="ts-dialog-btn"
        data-control="wordArt.insert"
        disabled={text.trim() === ''}
        onClick={commit}
        {...tipProps({ name: WORD_ART.insert, doc: 'Places the text on the slide', key: 'Enter' })}
      >
        {WORD_ART.insert}
      </button>
      <button
        type="button"
        className="ts-dialog-btn"
        data-control="wordArt.cancel"
        onClick={onCancel}
        {...tipProps({ name: WORD_ART.cancel, key: 'Esc' })}
      >
        {WORD_ART.cancel}
      </button>
    </div>
  );
}
