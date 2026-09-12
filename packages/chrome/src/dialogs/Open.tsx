import { useEffect, useRef, useState } from 'react';

import { Dialog, DialogTabs } from '../Dialog';
import type { DeckHeadRow } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS, IMPORT_PPTX } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { formatWhen } from '../VersionsPanel';

/**
 * File > Open (gslides-parity SPEC 2.1, 12 "Dialogs"; Cmd+O): a search field and this studio's
 * presentations newest first (deck.list), an Upload tab that takes a Turboslide bundle (.zip),
 * and Open. A .pptx is refused with the sentence of SPEC 12. Opening navigates to /edit/<id>.
 */
export function OpenDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [tab, setTab] = useState<'presentations' | 'upload'>('presentations');
  const [query, setQuery] = useState('');
  const [decks, setDecks] = useState<ReadonlyArray<DeckHeadRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list =
      input.listDecks ??
      (() => input.dispatch('deck.list', {}) as Promise<ReadonlyArray<DeckHeadRow>>);
    let live = true;
    list()
      .then((rows) => {
        if (!live) return;
        const sorted = [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        setDecks(sorted);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [input]);

  const needle = query.trim().toLowerCase();
  const rows = (decks ?? []).filter(
    (deck) =>
      needle === '' || deck.title.toLowerCase().includes(needle) || deck.id.includes(needle),
  );

  const navigate = (path: string, newTab?: boolean) => {
    if (input.navigate) input.navigate(path, newTab);
    else if (newTab) window.open(path, '_blank', 'noopener');
    else window.location.assign(path);
  };

  const open = () => {
    if (tab === 'presentations') {
      if (picked === null) return;
      shell.closeDialog();
      navigate(`/edit/${encodeURIComponent(picked)}`);
      return;
    }
    if (file === null) return;
    if (/\.pptx$/i.test(file.name)) {
      setError(IMPORT_PPTX);
      return;
    }
    if (input.uploadBundle === undefined) {
      setError('Upload a bundle from the home page');
      return;
    }
    setBusy(true);
    input
      .uploadBundle(file)
      .then(({ id }) => {
        shell.closeDialog();
        navigate(`/edit/${encodeURIComponent(id)}`);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const searchTip = tipProps({ name: DIALOGS.open.search, doc: 'Filters the list by title' });
  return (
    <Dialog
      title={DIALOGS.open.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.open"
      cancel
      actions={[
        {
          label: DIALOGS.open.ok,
          primary: true,
          disabled: busy || (tab === 'presentations' ? picked === null : file === null),
          onClick: open,
          control: 'dialog.open.ok',
          doc:
            tab === 'presentations'
              ? 'Opens the selected presentation'
              : 'Uploads the bundle and opens it',
        },
      ]}
    >
      <DialogTabs
        tabs={[
          { value: 'presentations', label: DIALOGS.open.presentations },
          { value: 'upload', label: DIALOGS.open.upload },
        ]}
        value={tab}
        onChange={setTab}
        control="dialog.open.tab"
      />
      {tab === 'presentations' ? (
        <>
          <input
            type="search"
            value={query}
            placeholder={DIALOGS.open.search}
            aria-label={DIALOGS.open.search}
            data-control="dialog.open.search"
            autoComplete="off"
            spellCheck={false}
            {...searchTip}
            onChange={(event) => setQuery(event.target.value)}
          />
          {decks === null && error === null ? <p className="ts-dialog-empty">Loading…</p> : null}
          {decks !== null && rows.length === 0 ? (
            <p className="ts-dialog-empty">No presentations match</p>
          ) : null}
          {rows.length > 0 ? (
            <ul className="ts-dialog-list" role="listbox" aria-label={DIALOGS.open.presentations}>
              {rows.map((deck) => (
                <li key={deck.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={picked === deck.id}
                    className={cn('ts-dialog-row is-button', picked === deck.id && 'is-on')}
                    data-control={`dialog.open.deck.${deck.id}`}
                    onClick={() => setPicked(deck.id)}
                    onDoubleClick={() => {
                      setPicked(deck.id);
                      shell.closeDialog();
                      navigate(`/edit/${encodeURIComponent(deck.id)}`);
                    }}
                    {...tipProps({
                      name: deck.title,
                      doc: `${deck.slides} slides, edited ${formatWhen(deck.updatedAt)}`,
                    })}
                  >
                    <span className="ts-dialog-row-title">{deck.title}</span>
                    <span className="ts-dialog-row-meta">
                      {deck.slides} slides · {formatWhen(deck.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          <p>A Turboslide bundle (.zip) from Download, or from the command line.</p>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            aria-label="Bundle file"
            data-control="dialog.open.file"
            onChange={(event) => {
              setError(null);
              setFile(event.target.files?.[0] ?? null);
            }}
            {...tipProps({ name: 'Bundle file', doc: 'A Turboslide bundle (.zip)' })}
          />
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
