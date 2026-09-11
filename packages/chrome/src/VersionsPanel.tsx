import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { Version } from '@turboslide/schema/mutations';

import type { EditorDispatch } from './dispatch';
import { authorName } from './dispatch';
import { cn } from './lib/cn';
import { ToolButton } from './ToolButton';

import './VersionsPanel.css';

/**
 * The versions list (SPEC 6.5, 6.7): every entry of the version log newest first, with author,
 * note, revision and time; a named version is one with a note, a write entry reads `write` and
 * its mutation count. Save writes a named version through version.save; Restore is a mutation
 * through version.restore with the current baseRevision, so it is undoable and shows in History
 * (SPEC 6.7). Nothing here reads or writes the log: the studio passes it and the dispatcher acts.
 */
export type VersionsPanelProps = {
  versions: ReadonlyArray<Version>;
  revision: number;
  dispatch: EditorDispatch;
  /** inside the inspector: no head of its own */
  embedded?: boolean;
  className?: string;
};

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VersionsPanel({
  versions,
  revision,
  dispatch,
  embedded = false,
  className,
}: VersionsPanelProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = [...versions].reverse();

  const run = (promise: Promise<unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    promise
      .then(() => setNotice(done))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };

  const save = () => {
    const trimmed = note.trim();
    if (trimmed === '' || busy) return;
    run(dispatch('version.save', { note: trimmed }), `Saved "${trimmed}" at r${revision}`);
    setNote('');
  };

  const onNoteKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  };

  return (
    <div
      className={cn('ts-versions', embedded && 'is-embedded', className)}
      data-count={versions.length}
    >
      {!embedded ? (
        <div className="ts-versions-head">
          <b>Versions</b>
          <span>r{revision}</span>
        </div>
      ) : null}
      <div className="ts-versions-save">
        <input
          className="ts-versions-note"
          type="text"
          value={note}
          placeholder="Name this version"
          aria-label="Version note"
          data-control="version.save.note"
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={onNoteKey}
        />
        <ToolButton
          label="Save"
          title="Save a named version at the current revision (Cmd S)"
          ariaLabel="Save version"
          control="version.save"
          onClick={save}
        />
      </div>
      {notice ? (
        <p className="ts-versions-notice" role="status">
          {notice}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="ts-versions-empty">
          No versions yet. Every write appends one; Save names one.
        </p>
      ) : (
        <ul className="ts-versions-list">
          {rows.map((version) => (
            <li key={version.n} className={cn('ts-version', version.note !== '' && 'is-named')}>
              <span className="ts-version-n">{version.n}</span>
              <span className="ts-version-body">
                <span className="ts-version-note">
                  {version.note !== ''
                    ? version.note
                    : `write, ${version.mutations.length} mutation${version.mutations.length === 1 ? '' : 's'}`}
                </span>
                <span className="ts-version-meta">
                  {authorName(version.author)} · r{version.revision} ·{' '}
                  {formatWhen(version.createdAt)}
                </span>
              </span>
              <ToolButton
                label="Restore"
                title={`Restore version ${version.n} as a mutation (undoable)`}
                ariaLabel={`Restore version ${version.n}`}
                className="ts-version-restore"
                control={`version.restore.${version.n}`}
                onClick={() => {
                  if (busy) return;
                  run(
                    dispatch('version.restore', { n: version.n, baseRevision: revision }),
                    `Restored version ${version.n}`,
                  );
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
