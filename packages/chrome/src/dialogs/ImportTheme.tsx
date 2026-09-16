import { useEffect, useState } from 'react';

import type { ThemeRecord } from '@turboslide/schema/deck';
import { IMPORTED_THEMES_MAX } from '@turboslide/schema/deck';

import { Dialog, DialogTabs } from '../Dialog';
import type { DeckHeadRow } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { ROUND_FIVE } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { formatWhen } from '../VersionsPanel';
import { PPTX_MIME, isPptxFile } from './upload-accept';

import './import-dialogs.css';

/**
 * Import theme (gslides-parity SPEC-5 0.28, 5.3; MILESTONES-5 B3 day 6): the Themes panel's
 * button opens it. Two tabs: a PowerPoint file (the theme part to take, 0 for the master's) and a
 * presentation of this Turboslide (its edited theme and imported records). One `theme.import`
 * appends the record under In this presentation, at most five; the sixth is refused with its
 * sentence and the dialog says so before the call. The file travels as a `data:` URL, so the
 * dialog works on a checkout and hosted alike without a path.
 */
export function ImportThemeDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [tab, setTab] = useState<'file' | 'presentation'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [themeIndex, setThemeIndex] = useState(0);
  const [decks, setDecks] = useState<ReadonlyArray<DeckHeadRow> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imported: ThemeRecord[] = input.document.deck.importedThemes ?? [];
  const full = imported.length >= IMPORTED_THEMES_MAX;

  useEffect(() => {
    if (tab !== 'presentation' || decks !== null) return;
    const list =
      input.listDecks ??
      (() => input.dispatch('deck.list', {}) as Promise<ReadonlyArray<DeckHeadRow>>);
    let live = true;
    list()
      .then((rows) => {
        if (live)
          setDecks(
            rows
              .filter((row) => row.id !== input.deckId)
              .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
          );
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [tab, decks, input]);

  const run = (request: { file?: string; deckId?: string; themeIndex?: number }) => {
    setBusy(true);
    setError(null);
    input
      .dispatch('theme.import', { ...request, baseRevision: input.revision })
      .then((answer) => {
        const record = (answer as { record?: ThemeRecord }).record;
        shell.closeDialog();
        shell.say(record === undefined ? 'Theme imported' : `Imported the theme ${record.name}`);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const importTheme = () => {
    if (full) {
      setError(ROUND_FIVE.fiveThemes);
      return;
    }
    if (tab === 'presentation') {
      if (picked === null) return;
      run({ deckId: picked });
      return;
    }
    if (file === null) return;
    if (!isPptxFile(file)) {
      setError('Pick a PowerPoint file (.pptx)');
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setBusy(false);
      setError(`${file.name} could not be read`);
    };
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null;
      if (url === null) {
        setBusy(false);
        setError(`${file.name} could not be read`);
        return;
      }
      run({ file: url, themeIndex });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog
      title="Import theme"
      lead={`${imported.length} of ${IMPORTED_THEMES_MAX} imported themes in this presentation`}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.importTheme"
      cancel
      actions={[
        {
          label: 'Import Theme',
          primary: true,
          disabled: busy || full || (tab === 'file' ? file === null : picked === null),
          onClick: importTheme,
          control: 'dialog.importTheme.ok',
          doc: full ? ROUND_FIVE.fiveThemes : 'Adds the theme under In this presentation',
        },
      ]}
    >
      <DialogTabs
        tabs={[
          { value: 'file', label: 'PowerPoint file' },
          { value: 'presentation', label: 'Presentation' },
        ]}
        value={tab}
        onChange={setTab}
        control="dialog.importTheme.tab"
      />
      {tab === 'file' ? (
        <>
          <p>
            A PowerPoint file (.pptx). Its colours and fonts join In this presentation; the slides
            stay where they are.
          </p>
          <input
            type="file"
            accept={`.pptx,${PPTX_MIME}`}
            aria-label="PowerPoint file"
            data-control="dialog.importTheme.file"
            disabled={busy}
            onChange={(event) => {
              setError(null);
              setFile(event.target.files?.[0] ?? null);
            }}
            {...tipProps({ name: 'PowerPoint file', doc: 'A .pptx whose theme is imported' })}
          />
          <label className="ts-import-row">
            <span>Theme part</span>
            <input
              type="number"
              min={0}
              max={20}
              value={themeIndex}
              data-control="dialog.importTheme.index"
              aria-label="Theme part"
              onChange={(event) =>
                setThemeIndex(Math.max(0, Math.floor(Number(event.target.value) || 0)))
              }
              {...tipProps({
                name: 'Theme part',
                doc: '0 is the master’s theme; a file with several masters holds more',
              })}
            />
          </label>
        </>
      ) : (
        <>
          {decks === null && error === null ? <p className="ts-dialog-empty">Loading…</p> : null}
          {decks !== null && decks.length === 0 ? (
            <p className="ts-dialog-empty">No other presentations on this Turboslide</p>
          ) : null}
          {decks !== null && decks.length > 0 ? (
            <ul className="ts-dialog-list" role="listbox" aria-label="Presentations">
              {decks.map((deck) => (
                <li key={deck.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={picked === deck.id}
                    className={cn('ts-dialog-row is-button', picked === deck.id && 'is-on')}
                    data-control={`dialog.importTheme.deck.${deck.id}`}
                    disabled={busy}
                    onClick={() => setPicked(deck.id)}
                    {...tipProps({
                      name: deck.title,
                      doc: `${deck.slides} slides, edited ${formatWhen(deck.updatedAt)}; its edited theme and imported themes come over`,
                    })}
                  >
                    <span className="ts-dialog-row-title">{deck.title}</span>
                    <span className="ts-dialog-row-meta">{deck.slides} slides</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
