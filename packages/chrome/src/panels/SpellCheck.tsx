import { useCallback, useEffect, useRef, useState } from 'react';

import { ROUND_FIVE } from '../menus/strings';
import { Panel } from '../Panel';
import type { SpellingFinding } from '../text-tools';
import { languageLabel } from '../text-tools';
import { tipProps } from '../Tooltip';

import '../dialogs/text-tools-dialogs.css';

/**
 * Tools > Spelling > Spell check (gslides-parity SPEC-5 7.2, 0.35; R10 4.6; P1 5.6): the card at
 * the top right of the canvas, 320 px, with the misspelt word, up to five suggestions (the first
 * selected), Change with a Change all menu, Ignore with Ignore all, the Turboslide row Add to
 * dictionary, and "No misspellings found". The walk runs through `spelling.check` on the window
 * transport (the Worker, wired by the controller); Change writes `spelling.replace` (one
 * `text.splice`), Change all the same with `all: true`, Ignore skips, Ignore all tells
 * `spelling.ignore` and skips every occurrence, Add to dictionary calls `dictionary.add`. The
 * card selects the block and goes to the slide as it steps; `Cmd+'` and `Cmd+;` step next and
 * previous while the card is open (the shell's key rows). A deck whose language has no shipped
 * dictionary reads the sentence naming the browser's marks.
 */
export const SPELL_CHECK_STRINGS = {
  title: 'Spell check',
  change: 'Change',
  changeAll: 'Change all',
  ignore: 'Ignore',
  ignoreAll: 'Ignore all',
  addToDictionary: 'Add to dictionary',
  checking: 'Checking the presentation',
  noDictionary: (language: string) => `No dictionary for ${language}; the browser's marks apply`,
  noSuggestions: 'No suggestions',
  position: (n: number, of: number) => `${n} of ${of}`,
  turboslide: 'Turboslide only',
} as const;

export type SpellCheckPanelProps = {
  /** the deck language; the document's when absent */
  language?: string;
  /** runs the walk: the window transport's `spelling.check` */
  check: () => Promise<{
    language: string;
    dictionary?: string | null;
    misspellings: SpellingFinding[];
  }>;
  /** `spelling.replace` with the range; `all` for Change all */
  replace: (finding: SpellingFinding, text: string, all: boolean) => Promise<unknown>;
  /** `spelling.ignore` for Ignore all (the session set) */
  ignore: (word: string, all: boolean) => Promise<unknown>;
  /** `dictionary.add` */
  addWord: (word: string) => Promise<unknown>;
  /** selects the block of the finding and goes to its slide */
  select: (finding: SpellingFinding) => void;
  onClose: () => void;
  /** the document's revision; a change re-runs the walk */
  revision: number;
};

export function SpellCheckPanel({
  language,
  check,
  replace,
  ignore,
  addWord,
  select,
  onClose,
  revision,
}: SpellCheckPanelProps) {
  const [findings, setFindings] = useState<SpellingFinding[] | null>(null);
  const [dictionary, setDictionary] = useState<string | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ignored = useRef(new Set<string>());
  const skipped = useRef(new Set<string>());
  const checkedAt = useRef(-1);

  const run = useCallback(() => {
    check()
      .then((answer) => {
        setDictionary(answer.dictionary ?? null);
        const rows = answer.misspellings.filter(
          (row) =>
            !ignored.current.has(row.word) &&
            !skipped.current.has(
              `${row.slideId}:${row.blockId ?? ''}:${row.path}:${row.range.join('-')}`,
            ),
        );
        setFindings(rows);
        setIndex((current) => Math.min(current, Math.max(0, rows.length - 1)));
        setPicked(0);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [check]);

  useEffect(() => {
    if (checkedAt.current === revision) return;
    checkedAt.current = revision;
    run();
  }, [revision, run]);

  const current = findings?.[index];
  useEffect(() => {
    if (current !== undefined) select(current);
    // the selection follows the card as it steps; `select` is stable in the shell
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.slideId, current?.blockId, current?.path, current?.range[0]]);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (findings === null || findings.length === 0) return;
      setIndex((at) => (at + direction + findings.length) % findings.length);
      setPicked(0);
    },
    [findings],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key === "'") {
        event.preventDefault();
        step(1);
      } else if (event.key === ';') {
        event.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const act = (promise: Promise<unknown>, after: () => void) => {
    setBusy(true);
    promise
      .then(() => {
        after();
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const removeCurrent = (all: boolean) => {
    if (current === undefined) return;
    if (all) ignored.current.add(current.word);
    else
      skipped.current.add(
        `${current.slideId}:${current.blockId ?? ''}:${current.path}:${current.range.join('-')}`,
      );
    const rest = (findings ?? []).filter((row) =>
      all ? row.word !== current.word : row !== current,
    );
    setFindings(rest);
    setIndex((at) => Math.min(at, Math.max(0, rest.length - 1)));
    setPicked(0);
  };

  const change = (all: boolean) => {
    if (current === undefined) return;
    const text = current.suggestions[picked];
    if (text === undefined) return;
    act(replace(current, text, all), () => removeCurrent(all));
  };

  const tag = language ?? 'en-US';
  const body = (() => {
    if (error !== null)
      return (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      );
    if (findings === null) return <p className="ts-tt-empty">{SPELL_CHECK_STRINGS.checking}</p>;
    if (dictionary === null)
      return (
        <p className="ts-tt-empty" data-control="panel.spellCheck.noDictionary">
          {SPELL_CHECK_STRINGS.noDictionary(languageLabel(tag))}
        </p>
      );
    if (current === undefined)
      return (
        <p className="ts-tt-empty" role="status" data-control="panel.spellCheck.none">
          {ROUND_FIVE.noMisspellings}
        </p>
      );
    return (
      <>
        <p className="ts-spell-word" data-control="panel.spellCheck.word" lang={tag}>
          {current.word}
        </p>
        <p className="ts-spell-context" data-control="panel.spellCheck.position">
          {SPELL_CHECK_STRINGS.position(index + 1, findings.length)}
        </p>
        {current.suggestions.length === 0 ? (
          <p className="ts-tt-empty">{SPELL_CHECK_STRINGS.noSuggestions}</p>
        ) : (
          <ul
            className="ts-spell-suggestions"
            aria-label="Suggestions"
            data-control="panel.spellCheck.suggestions"
          >
            {current.suggestions.map((suggestion, at) => (
              <li key={suggestion}>
                <button
                  type="button"
                  aria-pressed={at === picked}
                  data-control={`panel.spellCheck.suggestion.${at}`}
                  {...tipProps({ name: suggestion, doc: 'Picks this spelling; Change writes it' })}
                  onClick={() => setPicked(at)}
                  onDoubleClick={() => change(false)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ts-spell-actions">
          <span className="ts-spell-split">
            <button
              type="button"
              className="ts-tt-small"
              disabled={busy || current.suggestions.length === 0}
              data-control="panel.spellCheck.change"
              {...tipProps({
                name: SPELL_CHECK_STRINGS.change,
                doc: 'Writes the picked spelling here',
              })}
              onClick={() => change(false)}
            >
              {SPELL_CHECK_STRINGS.change}
            </button>
            <button
              type="button"
              className="ts-tt-small"
              disabled={busy || current.suggestions.length === 0}
              aria-label={SPELL_CHECK_STRINGS.changeAll}
              data-control="panel.spellCheck.changeAll"
              {...tipProps({
                name: SPELL_CHECK_STRINGS.changeAll,
                doc: 'Writes the picked spelling everywhere this word appears',
              })}
              onClick={() => change(true)}
            >
              ▾
            </button>
          </span>
          <span className="ts-spell-split">
            <button
              type="button"
              className="ts-tt-small"
              disabled={busy}
              data-control="panel.spellCheck.ignore"
              {...tipProps({ name: SPELL_CHECK_STRINGS.ignore, doc: 'Leaves this one as it is' })}
              onClick={() => removeCurrent(false)}
            >
              {SPELL_CHECK_STRINGS.ignore}
            </button>
            <button
              type="button"
              className="ts-tt-small"
              disabled={busy}
              aria-label={SPELL_CHECK_STRINGS.ignoreAll}
              data-control="panel.spellCheck.ignoreAll"
              {...tipProps({
                name: SPELL_CHECK_STRINGS.ignoreAll,
                doc: 'Leaves every occurrence of this word for the session',
              })}
              onClick={() => act(ignore(current.word, true), () => removeCurrent(true))}
            >
              ▾
            </button>
          </span>
          <button
            type="button"
            className="ts-tt-small"
            disabled={busy}
            data-control="panel.spellCheck.addToDictionary"
            {...tipProps({
              name: SPELL_CHECK_STRINGS.addToDictionary,
              doc: `${SPELL_CHECK_STRINGS.turboslide}: adds the word to your personal dictionary`,
            })}
            onClick={() => act(addWord(current.word), () => removeCurrent(true))}
          >
            {SPELL_CHECK_STRINGS.addToDictionary}
          </button>
        </div>
      </>
    );
  })();

  return (
    <Panel
      title={SPELL_CHECK_STRINGS.title}
      count={findings === null || findings.length === 0 ? undefined : findings.length}
      onClose={onClose}
      control="panel.spellCheck"
      className="ts-spell-panel"
    >
      <div className="ts-spell-card" data-control="panel.spellCheck.card">
        {body}
      </div>
    </Panel>
  );
}
