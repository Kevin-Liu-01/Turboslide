import { useEffect, useMemo, useRef, useState } from 'react';

import { Dialog } from '../Dialog';
import {
  selectedBlock,
  textPathOf,
  textAt,
  insertBlockPlan,
  factsOf,
  TOOL_SIZES,
} from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS } from '../menus/strings';
import { gridKey } from '../pickers/grid';
import { tipProps } from '../Tooltip';
import {
  SPECIAL_CHARACTER_CATEGORIES,
  searchSpecialCharacters,
  specialCharacterName,
} from './special-characters-data';
import type { SpecialCharacter, SpecialCharacterCategory } from './special-characters-data';

import '../pickers/Pickers.css';

/**
 * Insert > Special characters (gslides-parity SPEC-2 0.36, 6.2, section 10): a category
 * dropdown, a search field by name, a grid of glyphs and a Recent row. A click inserts at the
 * caret through the editor's handle (`text.insert` at the caret's offset) and keeps the dialog
 * open, announcing the character's name; with no caret the first pick creates a text box as an
 * object centred on the sheet (480 by 64) holding the character. The recent row is remembered per
 * browser. Google's drawing box is not built (round three).
 */
const RECENT_STORAGE = 'ts-special-characters-recent';
const GRID_COLUMNS = 10;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((each): each is string => typeof each === 'string')
      : [];
  } catch {
    return [];
  }
}

function storeRecent(recent: string[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE, JSON.stringify(recent.slice(0, 20)));
  } catch {
    // private mode: the row holds for the session
  }
}

export function SpecialCharactersDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const words = DIALOGS.specialCharacters;
  const [category, setCategory] = useState<SpecialCharacterCategory | null>('Arrows');
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadRecent(),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchSpecialCharacters(query, query.trim() === '' ? category : null),
    [query, category],
  );
  useEffect(() => setIndex(0), [results.length]);
  const active = results[Math.min(index, results.length - 1)];

  const insert = (entry: SpecialCharacter) => {
    setError(null);
    const next = [entry.char, ...recent.filter((each) => each !== entry.char)];
    setRecent(next);
    storeRecent(next);
    const slide = input.document.slides[input.slideId];
    const block = selectedBlock(slide, input.selection);
    if (input.editor?.insertText) {
      input.editor.insertText(entry.char);
      setNotice(words.inserted(entry.name));
      return;
    }
    /* a caret in a text: text.insert at its offset; else a new text box as an object */
    if (block !== undefined && input.selection?.text === true) {
      const path = textPathOf(block, input.selection);
      if (path !== null) {
        const at = input.selection.range?.[1] ?? (textAt(block, path) ?? '').length;
        input
          .dispatch('text.insert', {
            slideId: input.slideId,
            blockId: block.id,
            path,
            at,
            text: entry.char,
            baseRevision: input.revision,
          })
          .then(() => setNotice(words.inserted(entry.name)))
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        return;
      }
    }
    const plan = insertBlockPlan(
      factsOf(input),
      'text',
      (id) => ({ id, type: 'text', text: entry.char, autofit: 'grow' }),
      words.title,
      { size: TOOL_SIZES.text },
    );
    if ('refused' in plan) {
      setError(plan.refused);
      return;
    }
    input
      .dispatch(plan.action, plan.input)
      .then(() => setNotice(words.inserted(entry.name)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const searchTip = tipProps({ name: words.search, doc: 'Type part of the character’s name' });
  const gridTip = tipProps({
    name: 'Characters',
    doc: 'The arrows move, Enter inserts',
    key: 'Enter',
  });

  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.specialCharacters"
      className="ts-special-characters"
    >
      <div className="ts-dialog-modes">
        <label className="ts-dialog-field">
          <span className="ts-dialog-field-label">Category</span>
          <select
            value={category ?? ''}
            aria-label="Category"
            data-control="dialog.specialCharacters.category"
            onChange={(event) =>
              setCategory(
                event.target.value === '' ? null : (event.target.value as SpecialCharacterCategory),
              )
            }
            {...tipProps({
              name: 'Category',
              doc: 'Arrows, punctuation, currency, math, symbols or emoji',
            })}
          >
            {SPECIAL_CHARACTER_CATEGORIES.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </label>
        <label className="ts-dialog-field">
          <span className="ts-dialog-field-label">{words.search}</span>
          <input
            type="search"
            value={query}
            placeholder={words.search}
            aria-label={words.search}
            data-control="dialog.specialCharacters.search"
            autoComplete="off"
            spellCheck={false}
            {...searchTip}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              searchTip.onKeyDown(event);
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                grid.current?.focus();
              }
            }}
          />
        </label>
      </div>
      {recent.length > 0 ? (
        <div className="ts-dialog-field">
          <span className="ts-dialog-field-label">{words.recent}</span>
          <div
            className="ts-picker-grid"
            role="list"
            aria-label={words.recent}
            style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 40px)` }}
          >
            {recent.map((char) => (
              <button
                key={char}
                type="button"
                role="listitem"
                className="ts-picker-tile"
                aria-label={specialCharacterName(char)}
                data-control="dialog.specialCharacters.recent"
                onClick={() =>
                  insert({ char, name: specialCharacterName(char), category: 'Symbols' })
                }
                {...tipProps({ name: specialCharacterName(char) })}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {results.length === 0 ? (
        <p className="ts-dialog-empty">{words.empty}</p>
      ) : (
        <div
          ref={grid}
          className="ts-picker-grid pt-scroll"
          role="grid"
          aria-label="Characters"
          aria-activedescendant={
            active === undefined ? undefined : `ts-char-${active.char.codePointAt(0)}`
          }
          tabIndex={0}
          style={{
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, 40px)`,
            maxHeight: 280,
            overflowY: 'auto',
          }}
          data-control="dialog.specialCharacters.grid"
          {...gridTip}
          onKeyDown={(event) => {
            gridTip.onKeyDown(event);
            const result = gridKey(event, index, results.length, GRID_COLUMNS);
            if (result === null) {
              /* ArrowLeft on the first column stays in the dialog: nothing to close */
              if (event.key === 'ArrowLeft') event.preventDefault();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if ('pick' in result) {
              if (active !== undefined) insert(active);
              return;
            }
            setIndex(result.index);
          }}
        >
          {results.map((entry, at) => (
            <div
              key={`${entry.category}-${entry.char}-${entry.name}`}
              id={at === index ? `ts-char-${entry.char.codePointAt(0)}` : undefined}
              role="gridcell"
              aria-label={entry.name}
              aria-selected={at === index}
              className={cn('ts-picker-tile', at === index && 'is-active')}
              data-control={`dialog.specialCharacters.pick.${entry.char.codePointAt(0)}`}
              {...tipProps({ name: entry.name })}
              onMouseEnter={(event) => {
                tipProps({ name: entry.name }).onMouseEnter(event);
                setIndex(at);
              }}
              onClick={(event) => {
                event.stopPropagation();
                insert(entry);
              }}
            >
              {entry.char}
            </div>
          ))}
        </div>
      )}
      <p
        className="ts-dialog-hint"
        role="status"
        aria-live="polite"
        data-control="dialog.specialCharacters.notice"
      >
        {notice ?? ''}
      </p>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
