import { useEffect, useRef, useState } from 'react';

import { WORD_ART } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './WordArtBar.css';

/**
 * Insert > Word art (gslides-parity SPEC-2 0.14, 6.2): Google's entry bar at the top of the
 * canvas ("Type your text and press Enter"). Enter inserts a text block at 88 px, weight 500,
 * with an ink outline of 1.5 px, centred on the sheet as an object (the slide converts to the
 * canvas first when it is not one); Esc cancels. A labelled text input with Enter and Esc
 * (section 10); the caller makes the write.
 */
export type WordArtBarProps = {
  onInsert: (text: string) => void;
  onCancel: () => void;
};

export function WordArtBar({ onInsert, onCancel }: WordArtBarProps) {
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  const tip = tipProps({ name: WORD_ART.label, doc: WORD_ART.placeholder, key: 'Enter' });
  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onInsert(trimmed);
  };
  return (
    <div
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
