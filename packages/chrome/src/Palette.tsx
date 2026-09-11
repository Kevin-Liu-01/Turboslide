import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useRef, useState } from 'react';

import type { EditorDispatch } from './dispatch';
import { Icon } from './icons';
import { cn } from './lib/cn';
import type { PaletteEntry, PaletteGroupRows, PaletteRun } from './palette-data';
import { filterPalette, paletteCount } from './palette-data';

import './Palette.css';

/**
 * The command palette (SPEC 6.3), Prototemplate's Search.tsx grown: a card over a scrim with the
 * 34px field and a count, the results as ruled rows grouped under 12.5px titanium labels, the
 * arrows, Enter and Escape, every slide row carrying data-preview for the hover preview layer.
 * The five groups and the `>` `#` `+` prefixes are palette-data.ts; this component only draws the
 * entries it is given and runs the chosen one: an action through the dispatcher, a prompt entry
 * after one field (a version note), a view toggle through its callback. The palette holds no
 * state but the query, the active row and the prompt.
 *
 * Opening from a key: useShellKeys calls the shell's openSearch (ViewerShell's `onSearch`), which
 * the route wires to `open`; the trigger pill lives in the Toolbar (Toolbar.tsx `onSearch`).
 */
export type PaletteProps = {
  open: boolean;
  entries: ReadonlyArray<PaletteEntry>;
  dispatch: EditorDispatch;
  onClose: () => void;
  /** a line for the toast: what ran, what an entry still needs, an error */
  onNotice?: (message: string) => void;
  className?: string;
};

const TITLE = 'Search slides, actions, blocks and views';

/** The id of the row at `index` in the flat list, for aria-activedescendant and the scroll. */
function rowId(index: number): string {
  return `pt-search-opt-${index}`;
}

function isPlainClick(event: ReactMouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type Prompt = { entry: PaletteEntry; run: PaletteRun & { kind: 'prompt' }; value: string };

export function Palette({ open, entries, dispatch, onClose, onNotice, className }: PaletteProps) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const card = useRef<HTMLDivElement>(null);

  /* a fresh open starts empty: the query, the row and the prompt reset as the card comes back
     (state adjusted during render from a prop change, the documented pattern) */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setSel(0);
      setPrompt(null);
    }
  }

  if (!open) return null;

  const groups: readonly PaletteGroupRows[] = filterPalette(entries, query);
  const rows: readonly PaletteEntry[] = groups.flatMap((group) => group.rows);
  const at = Math.min(sel, Math.max(rows.length - 1, 0));

  const close = () => {
    setPrompt(null);
    onClose();
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && card.current?.contains(focused)) focused.blur();
  };

  const notice = (message: string) => onNotice?.(message);

  const perform = (entry: PaletteEntry, run: PaletteRun) => {
    switch (run.kind) {
      case 'dispatch':
        close();
        dispatch(run.action, run.input)
          .then(() => notice(`${entry.title}: done`))
          .catch((error: unknown) =>
            notice(error instanceof Error ? error.message : String(error)),
          );
        return;
      case 'call':
        close();
        run.call();
        return;
      case 'needs':
        notice(`${entry.title}: ${run.reason}`);
        return;
      case 'prompt':
        setPrompt({ entry, run, value: '' });
        return;
    }
  };

  const go = (entry: PaletteEntry) => perform(entry, entry.run);

  const submitPrompt = () => {
    if (!prompt) return;
    const value = prompt.value.trim();
    if (value === '') return;
    const input = { ...prompt.run.input, [prompt.run.field]: value };
    perform(prompt.entry, { kind: 'dispatch', action: prompt.run.action, input });
  };

  /* keep the active row in view as the arrows move it */
  const move = (next: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, next));
    setSel(clamped);
    requestAnimationFrame(() => {
      document.getElementById(rowId(clamped))?.scrollIntoView({ block: 'nearest' });
    });
  };

  const onInputKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(at + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(at - 1);
    } else if (event.key === 'Home' && !query) {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End' && !query) {
      event.preventDefault();
      move(rows.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = rows[at];
      if (entry) go(entry);
    }
  };

  const onPromptKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitPrompt();
    }
  };

  /* Escape anywhere in the card closes it, or steps back from the prompt; prevented so the
     shell's ladder does not also step */
  const onCardKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (prompt) setPrompt(null);
    else close();
  };

  let index = -1;

  return (
    <div
      className={cn('pt-search ts-chrome', className)}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={card}
        className="pt-search-card"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-control="palette"
        onKeyDown={onCardKey}
      >
        {prompt ? (
          <div className="pt-search-tools is-prompt">
            <label className="pt-search-field">
              <Icon name="sparkles" />
              <input
                type="text"
                value={prompt.value}
                autoFocus
                onChange={(event) => setPrompt({ ...prompt, value: event.target.value })}
                onKeyDown={onPromptKey}
                placeholder={prompt.run.label}
                aria-label={`${prompt.entry.title}: ${prompt.run.label}`}
                data-control={`palette.prompt.${prompt.run.field}`}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
              />
            </label>
            <span className="pt-search-count">{prompt.entry.title}</span>
          </div>
        ) : (
          <div className="pt-search-tools">
            <label className="pt-search-field">
              <Icon name="search" />
              <input
                type="search"
                value={query}
                autoFocus
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSel(0);
                }}
                onKeyDown={onInputKey}
                placeholder={TITLE}
                aria-label={TITLE}
                aria-controls="pt-search-list"
                aria-activedescendant={rows.length > 0 ? rowId(at) : undefined}
                data-control="palette.query"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
              />
            </label>
            <span className="pt-search-count">{paletteCount(rows.length)}</span>
          </div>
        )}
        {prompt ? (
          <p className="pt-search-empty">
            Type the {prompt.run.label.toLowerCase()} and press Enter. Escape returns to the list.
          </p>
        ) : (
          <div
            id="pt-search-list"
            className="pt-search-list pt-scroll"
            role="listbox"
            aria-label="Results"
          >
            {groups.map((group) => (
              <div className="pt-search-group" key={group.group.id} data-group={group.group.id}>
                <h4>
                  {group.group.label}
                  {group.group.prefix ? <kbd aria-hidden="true">{group.group.prefix}</kbd> : null}
                </h4>
                {group.rows.map((row) => {
                  index += 1;
                  const i = index;
                  const active = i === at;
                  const needs = row.run.kind === 'needs';
                  return (
                    <div
                      key={row.id}
                      id={rowId(i)}
                      className={cn('pt-search-row', active && 'is-active', needs && 'is-needs')}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      data-preview={row.preview}
                      data-control={`palette.${row.id}`}
                      title={row.hint}
                      onClick={(event) => {
                        if (!isPlainClick(event)) return;
                        event.preventDefault();
                        go(row);
                      }}
                      onMouseMove={() => {
                        if (!active) setSel(i);
                      }}
                    >
                      <span className="pt-search-ic">
                        <Icon name={row.icon} />
                      </span>
                      <span className="pt-search-t">{row.title}</span>
                      {row.keys ? <kbd className="pt-search-keys">{row.keys}</kbd> : null}
                      <span className="pt-search-m">{row.meta}</span>
                      {row.hint ? <span className="pt-search-hint">{row.hint}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {rows.length === 0 ? <p className="pt-search-empty">Nothing matches</p> : null}
          </div>
        )}
        <p className="pt-search-foot" aria-hidden="true">
          <span>Up and down arrows move</span>
          <span>Enter runs</span>
          <span>Escape closes</span>
          <span className="pt-search-foot-prefixes">
            <kbd>#</kbd> slides <kbd>+</kbd> insert <kbd>&gt;</kbd> actions
          </span>
        </p>
      </div>
    </div>
  );
}
