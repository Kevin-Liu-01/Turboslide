import { useEffect, useState } from 'react';

import { Panel } from '../Panel';
import { languageLabel } from '../text-tools';
import { tipProps } from '../Tooltip';

import '../dialogs/text-tools-dialogs.css';

/**
 * Tools > Dictionary (gslides-parity SPEC-5 7.4, 0.37; R10 8; P1 5.11): the side panel with a
 * search field prefilled from the selection, results from `dictionary.lookup` (the hosted studio
 * answers through `/api/define` over the Wiktionary REST definition endpoint), each entry with
 * its part of speech and numbered definitions, the Wiktionary attribution line (CC BY-SA) and a
 * link to the page. Pronunciation, synonyms and antonyms are not in that endpoint and are not
 * drawn. Under `TURBOSLIDE_DICTIONARY=link` (a checkout without egress) the answer carries the
 * address alone, so the panel offers the page in a new tab. `Cmd+Shift+Y` opens the panel.
 */
export const DICTIONARY_STRINGS = {
  title: 'Dictionary',
  search: 'Look up a word',
  lookUp: 'Look up',
  open: 'Open in Wiktionary',
  empty: 'Type a word and press Enter',
  none: (word: string) => `No definition found for ${word}`,
  linkOnly: 'Definitions open on Wiktionary in a new tab on this instance',
  looking: 'Looking up',
} as const;

export type DictionaryAnswer = {
  word: string;
  url: string;
  definitions?: { partOfSpeech: string; definitions: string[] }[];
  attribution?: string;
};

export type DictionaryPanelProps = {
  /** the selection's word when the panel opened */
  initialWord?: string;
  language: string;
  lookup: (word: string) => Promise<DictionaryAnswer>;
  onClose: () => void;
  /** opens a URL in a new tab */
  open: (url: string) => void;
};

export function DictionaryPanel({
  initialWord,
  language,
  lookup,
  onClose,
  open,
}: DictionaryPanelProps) {
  const [query, setQuery] = useState(initialWord ?? '');
  const [answer, setAnswer] = useState<DictionaryAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (word: string) => {
    const trimmed = word.trim();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    lookup(trimmed)
      .then((result) => setAnswer(result))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (initialWord !== undefined && initialWord.trim() !== '') run(initialWord);
    // one lookup for the word the panel opened on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldTip = tipProps({
    name: DICTIONARY_STRINGS.search,
    doc: `Looks the word up in ${languageLabel(language)}`,
    key: 'Enter',
  });
  return (
    <Panel
      title={DICTIONARY_STRINGS.title}
      onClose={onClose}
      control="panel.dictionary"
      className="ts-dictionary-panel"
    >
      <div className="ts-tt-row">
        <input
          type="search"
          className="ts-tt-field is-wide ts-tt-grow"
          value={query}
          placeholder={DICTIONARY_STRINGS.search}
          aria-label={DICTIONARY_STRINGS.search}
          data-control="panel.dictionary.search"
          autoComplete="off"
          spellCheck={false}
          lang={language}
          {...fieldTip}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            fieldTip.onKeyDown(event);
            if (event.key === 'Enter') {
              event.preventDefault();
              run(query);
            }
            event.stopPropagation();
          }}
        />
        <button
          type="button"
          className="ts-tt-small"
          disabled={busy || query.trim() === ''}
          data-control="panel.dictionary.lookUp"
          {...tipProps({ name: DICTIONARY_STRINGS.lookUp, doc: 'Looks the word up', key: 'Enter' })}
          onClick={() => run(query)}
        >
          {DICTIONARY_STRINGS.lookUp}
        </button>
      </div>
      {busy ? <p className="ts-tt-empty">{DICTIONARY_STRINGS.looking}</p> : null}
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
      {answer === null && !busy && error === null ? (
        <p className="ts-tt-empty">{DICTIONARY_STRINGS.empty}</p>
      ) : null}
      {answer !== null && !busy ? (
        <div data-control="panel.dictionary.result" lang={language}>
          <p className="ts-spell-word" data-control="panel.dictionary.word">
            {answer.word}
          </p>
          {answer.definitions === undefined ? (
            <p className="ts-tt-note" data-control="panel.dictionary.linkOnly">
              {DICTIONARY_STRINGS.linkOnly}
            </p>
          ) : answer.definitions.length === 0 ? (
            <p className="ts-tt-empty">{DICTIONARY_STRINGS.none(answer.word)}</p>
          ) : (
            answer.definitions.map((entry, index) => (
              <div
                key={`${entry.partOfSpeech}:${index}`}
                className="ts-dict-entry"
                data-control={`panel.dictionary.entry.${index}`}
              >
                <p className="ts-dict-pos">{entry.partOfSpeech}</p>
                <ol className="ts-dict-defs">
                  {entry.definitions.map((definition, at) => (
                    <li key={at}>{definition}</li>
                  ))}
                </ol>
              </div>
            ))
          )}
          <p className="ts-dict-attribution">
            {answer.attribution !== undefined ? `${answer.attribution}. ` : ''}
            <a
              href={answer.url}
              target="_blank"
              rel="noopener"
              data-control="panel.dictionary.open"
              {...tipProps({
                name: DICTIONARY_STRINGS.open,
                doc: 'The word’s page on Wiktionary, in a new tab',
              })}
              onClick={(event) => {
                event.preventDefault();
                open(answer.url);
              }}
            >
              {DICTIONARY_STRINGS.open}
            </a>
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
