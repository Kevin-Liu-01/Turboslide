import type { KeyboardEvent } from 'react';
import { useState } from 'react';

import type { EditorWriter } from './dispatch';

import './DeckName.css';

/**
 * The deck name in the toolbar (SPEC 6.1; Kevin's directive: the name is editable where Google
 * Slides puts it). At rest a button in the display face with the title; a click opens a field
 * over the same box, Enter or blur with a changed value writes one deck.rename through the
 * dispatcher with the revision as baseRevision, Escape restores the title. The button is named
 * `Deck name` and carries the `deck.name` control id, so the window API's set('Deck name', …)
 * reaches the field once it is open and activate('Deck name') opens it. Both the button's word
 * and the field's box carry `data-gives`: they are what shrinks in the toolbar's status slot
 * (Toolbar.tsx fitLabels counts the word's hidden letters as room the bar still needs, and
 * floorStatusSlot stops the slot at their minimum).
 */
export type DeckNameProps = EditorWriter & {
  title: string;
  /** a line for the toast */
  onNotice?: (message: string) => void;
  className?: string;
};

export function DeckName({ title, revision, dispatch, onNotice, className }: DeckNameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  const open = () => {
    setValue(title);
    setEditing(true);
  };

  const close = () => setEditing(false);

  const commit = () => {
    const name = value.trim();
    close();
    if (name === '' || name === title) return;
    dispatch('deck.rename', { name, baseRevision: revision })
      .then(() => onNotice?.(`Renamed the deck to ${name}`))
      .catch((error: unknown) =>
        onNotice?.(error instanceof Error ? error.message : String(error)),
      );
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  if (editing) {
    return (
      <span
        className={['ts-deckname is-editing', className ?? ''].filter(Boolean).join(' ')}
        data-gives=""
      >
        <input
          ref={(el) => el?.focus()}
          className="ts-deckname-field"
          type="text"
          value={value}
          aria-label="Deck name"
          data-control="deck.name"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          onFocus={(event) => event.currentTarget.select()}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={['pt-ib ts-deckname', className ?? ''].filter(Boolean).join(' ')}
      title="Rename the deck (click, type the name, press Enter)"
      aria-label="Deck name"
      data-control="deck.name"
      onClick={open}
    >
      <b data-gives="">{title}</b>
    </button>
  );
}
