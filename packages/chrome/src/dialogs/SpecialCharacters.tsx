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
import { ROUND_FIVE } from '../menus/strings';
import {
  SPECIAL_CHARACTER_CATEGORIES,
  searchSpecialCharacters,
  specialCharacterName,
} from './special-characters-data';
import type { SpecialCharacter, SpecialCharacterCategory } from './special-characters-data';
import { recognizeStrokes } from './stroke-recognizer';
import type { Guess, Point, Stroke } from './stroke-recognizer';

import '../pickers/Pickers.css';
import './text-tools-dialogs.css';

/**
 * Insert > Special characters (gslides-parity SPEC-2 0.36, 6.2, section 10): a category
 * dropdown, a search field by name, a grid of glyphs and a Recent row. A click inserts at the
 * caret through the editor's handle (`text.insert` at the caret's offset) and keeps the dialog
 * open, announcing the character's name; with no caret the first pick creates a text box as an
 * object centred on the sheet (480 by 64) holding the character. The recent row is remembered per
 * browser. The drawing box (gslides-parity SPEC-5 0.41, 7.7; round five B5): a 160 by 160 canvas
 * whose strokes run through Turboslide's own recogniser (stroke-recognizer.ts, eight direction
 * histograms against the Math and Arrows templates); its result list is labelled "Best guesses"
 * and a pick inserts the character. No service is called.
 */
const DRAW_SIZE = 160;
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
  /* the drawing box: the strokes drawn so far and the guesses they make */
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [drawn, setDrawn] = useState(0);

  const paint = () => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (!node || !context) return;
    context.clearRect(0, 0, node.width, node.height);
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = getComputedStyle(node).color;
    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        const point = stroke[0] as Point;
        context.beginPath();
        context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      stroke.forEach((point, i) =>
        i === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.stroke();
    }
  };
  const pointOf = (event: { clientX: number; clientY: number }): Point => {
    const node = canvas.current;
    const rect = node?.getBoundingClientRect();
    if (!node || !rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * node.width,
      y: ((event.clientY - rect.top) / rect.height) * node.height,
    };
  };
  const finishStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setGuesses(recognizeStrokes(strokes.current));
    setDrawn(strokes.current.length);
  };
  const clearDrawing = () => {
    strokes.current = [];
    drawing.current = false;
    setGuesses([]);
    setDrawn(0);
    paint();
  };

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
      <div className="ts-draw-box" data-control="dialog.specialCharacters.draw">
        <canvas
          ref={canvas}
          className="ts-draw-canvas"
          width={DRAW_SIZE}
          height={DRAW_SIZE}
          role="img"
          aria-label="Draw a character"
          data-control="dialog.specialCharacters.canvas"
          {...tipProps({
            name: 'Draw a character',
            doc: 'Draw the symbol with the pointer; the best guesses appear beside it',
          })}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            strokes.current = [...strokes.current, [pointOf(event)]];
            paint();
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const current = strokes.current[strokes.current.length - 1];
            if (current !== undefined) current.push(pointOf(event));
            paint();
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
        <div className="ts-draw-guesses">
          <span
            className="ts-dialog-field-label"
            data-control="dialog.specialCharacters.bestGuesses"
          >
            {ROUND_FIVE.bestGuesses}
          </span>
          {guesses.length === 0 ? (
            <span className="ts-tt-note">
              {drawn === 0 ? 'Draw a character in the box' : 'Nothing close yet; keep drawing'}
            </span>
          ) : (
            <div
              className="ts-picker-grid"
              role="list"
              aria-label={ROUND_FIVE.bestGuesses}
              style={{ gridTemplateColumns: 'repeat(5, 40px)' }}
            >
              {guesses.map((guess) => (
                <button
                  key={guess.char}
                  type="button"
                  role="listitem"
                  className="ts-picker-tile"
                  aria-label={specialCharacterName(guess.char)}
                  data-control={`dialog.specialCharacters.guess.${guess.char.codePointAt(0)}`}
                  {...tipProps({
                    name: specialCharacterName(guess.char),
                    doc: 'Inserts this guess',
                  })}
                  onClick={() =>
                    insert({
                      char: guess.char,
                      name: specialCharacterName(guess.char),
                      category: 'Math',
                    })
                  }
                >
                  {guess.char}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="ts-tt-small"
            disabled={drawn === 0}
            data-control="dialog.specialCharacters.clearDrawing"
            {...tipProps({ name: 'Clear', doc: 'Clears the drawing' })}
            onClick={clearDrawing}
          >
            Clear
          </button>
        </div>
      </div>
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
