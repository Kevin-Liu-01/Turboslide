import { useEffect, useState } from 'react';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { tipProps } from '../Tooltip';

import './text-tools-dialogs.css';

/**
 * Tools > Spelling > Personal dictionary (gslides-parity SPEC-5 7.2; R10 4.8; G1 "Enter your new
 * word. Click OK."): Google's dialog over `preferences.spelling.dictionary`, a field, the list
 * with a remove control per word, OK. The words are read through `dictionary.list` (the record
 * and, on a checkout, `.turboslide/dictionary.txt`) and written through `dictionary.add` and
 * `dictionary.remove`, record writes with no revision; the spell check skips them afterwards.
 */
export const PERSONAL_DICTIONARY_STRINGS = {
  title: 'Personal dictionary',
  word: 'Enter your new word',
  add: 'Add',
  remove: 'Remove',
  ok: 'OK',
  empty: 'No words yet. A word you add is never marked as misspelt.',
} as const;

export function PersonalDictionaryDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [words, setWords] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const report = (promise: Promise<unknown>) =>
    promise
      .then((answer) => {
        const list = (answer as { dictionary?: unknown }).dictionary;
        if (Array.isArray(list))
          setWords(list.filter((word): word is string => typeof word === 'string'));
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

  useEffect(() => {
    void report(input.dispatch('dictionary.list', {}));
    // the list is read once when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = () => {
    const word = draft.trim();
    if (word === '' || /\s/u.test(word)) return;
    setDraft('');
    void report(input.dispatch('dictionary.add', { word }));
  };

  const fieldTip = tipProps({
    name: PERSONAL_DICTIONARY_STRINGS.word,
    doc: 'One word; Enter adds it to your dictionary',
    key: 'Enter',
  });
  return (
    <Dialog
      title={PERSONAL_DICTIONARY_STRINGS.title}
      onClose={shell.closeDialog}
      width={420}
      control="dialog.personalDictionary"
      actions={[
        {
          label: PERSONAL_DICTIONARY_STRINGS.ok,
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.personalDictionary.ok',
          doc: 'Closes the dialog; every word is already saved',
        },
      ]}
    >
      <div className="ts-tt-row">
        <input
          type="text"
          className="ts-tt-field is-wide ts-tt-grow"
          value={draft}
          placeholder={PERSONAL_DICTIONARY_STRINGS.word}
          aria-label={PERSONAL_DICTIONARY_STRINGS.word}
          data-control="dialog.personalDictionary.word"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          {...fieldTip}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            fieldTip.onKeyDown(event);
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="ts-tt-small"
          disabled={draft.trim() === '' || /\s/u.test(draft.trim())}
          data-control="dialog.personalDictionary.add"
          {...tipProps({
            name: PERSONAL_DICTIONARY_STRINGS.add,
            doc: 'Adds the word',
            key: 'Enter',
          })}
          onClick={add}
        >
          {PERSONAL_DICTIONARY_STRINGS.add}
        </button>
      </div>
      {words === null ? null : words.length === 0 ? (
        <p className="ts-tt-empty" data-control="dialog.personalDictionary.empty">
          {PERSONAL_DICTIONARY_STRINGS.empty}
        </p>
      ) : (
        <ul
          className="ts-tt-list"
          aria-label={PERSONAL_DICTIONARY_STRINGS.title}
          data-control="dialog.personalDictionary.list"
        >
          {words.map((word) => (
            <li key={word}>
              <span>{word}</span>
              <button
                type="button"
                className="ts-tt-remove"
                data-control={`dialog.personalDictionary.remove.${word}`}
                {...tipProps({
                  name: PERSONAL_DICTIONARY_STRINGS.remove,
                  doc: `Removes ${word} from your dictionary`,
                })}
                onClick={() => void report(input.dispatch('dictionary.remove', { word }))}
              >
                {PERSONAL_DICTIONARY_STRINGS.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
