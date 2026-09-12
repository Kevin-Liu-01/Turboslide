import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { Version } from '@turboslide/schema/mutations';

import type { EditorDispatch } from './dispatch';
import { authorName } from './dispatch';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { DEFAULT_MENU_CONTEXT } from './menus/model';
import type { MenuItem } from './menus/model';
import { PANELS, stubClause } from './menus/strings';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './VersionsPanel.css';

/**
 * The versions list (SPEC 6.5, 6.7) and, with `history`, the Version history panel of the Google
 * Slides parity round (gslides-parity SPEC 2.1, 12 "Panels"): the versions grouped by day, newest
 * first, "Only show named versions", "Restore this version" per version, and a More menu per
 * version with "Name this version" and "Make a copy"; "Show changes" is the Later row inside the
 * panel. A named version is one with a note; a write entry reads its mutation count. Restore is a
 * mutation through version.restore with the current baseRevision, so it is undoable. Nothing here
 * reads or writes the log: the studio passes it and the dispatcher acts. Without `history` the
 * component keeps its embedded form for the Inspector: a note field with Save and the flat list.
 */
export type VersionsPanelProps = {
  versions: ReadonlyArray<Version>;
  revision: number;
  dispatch: EditorDispatch;
  /** inside the inspector: no head of its own */
  embedded?: boolean;
  /** the Version history panel form (gslides-parity SPEC 2.1) */
  history?: boolean;
  /** Make a copy at a version: opens the Make a copy dialog */
  onMakeCopy?: (version: Version) => void;
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

/** The day heading of a version: Today, Yesterday, or the date. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/** The versions newest first, grouped by day; named only when asked. */
export function groupByDay(
  versions: ReadonlyArray<Version>,
  namedOnly: boolean,
): Array<{ day: string; versions: Version[] }> {
  const rows = [...versions].reverse().filter((version) => !namedOnly || version.note !== '');
  const out: Array<{ day: string; versions: Version[] }> = [];
  for (const version of rows) {
    const day = dayLabel(version.createdAt);
    const last = out[out.length - 1];
    if (last !== undefined && last.day === day) last.versions.push(version);
    else out.push({ day, versions: [version] });
  }
  return out;
}

const MORE_ITEMS: ReadonlyArray<MenuItem> = [
  {
    id: 'version.name',
    label: PANELS.versionHistory.name,
    status: 'now',
    effect: { kind: 'client', handler: 'runAction' },
  },
  {
    id: 'version.copy',
    label: PANELS.versionHistory.copy,
    status: 'now',
    effect: { kind: 'client', handler: 'runAction' },
  },
  {
    id: 'version.showChanges',
    label: 'Show changes',
    status: 'later',
    stubReason: 'The changes between versions arrive in a later round',
  },
];

export function VersionsPanel({
  versions,
  revision,
  dispatch,
  embedded = false,
  history = false,
  onMakeCopy,
  className,
}: VersionsPanelProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [namedOnly, setNamedOnly] = useState(false);
  const [more, setMore] = useState<{ version: Version; anchor: HTMLElement } | null>(null);
  const [naming, setNaming] = useState<{ version: Version; value: string } | null>(null);
  const rows = [...versions].reverse();
  const listRef = useRef<HTMLDivElement>(null);

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

  const restore = (version: Version) => {
    if (busy) return;
    run(
      dispatch('version.restore', { n: version.n, baseRevision: revision }),
      history
        ? `Restored the version of ${formatWhen(version.createdAt)}`
        : `Restored version ${version.n}`,
    );
  };

  const noteTip = tipProps({
    name: 'Version note',
    doc: 'Names the version to save; Enter saves it.',
    key: 'Enter',
  });

  if (history) {
    const groups = groupByDay(versions, namedOnly);
    return (
      <div
        className={cn('ts-versions is-history', className)}
        data-count={versions.length}
        ref={listRef}
      >
        <label
          className="ts-versions-named"
          {...tipProps({
            name: PANELS.versionHistory.onlyNamed,
            doc: 'Hides the versions every edit writes',
          })}
        >
          <input
            type="checkbox"
            checked={namedOnly}
            data-control="versionHistory.namedOnly"
            onChange={(event) => setNamedOnly(event.target.checked)}
          />
          <span className="ts-versions-named-box" aria-hidden="true" />
          <span>{PANELS.versionHistory.onlyNamed}</span>
        </label>
        {notice ? (
          <p className="ts-versions-notice" role="status">
            {notice}
          </p>
        ) : null}
        {groups.length === 0 ? (
          <p className="ts-versions-empty">
            {namedOnly ? 'No named versions yet' : 'No versions yet'}
          </p>
        ) : null}
        {groups.map((group) => (
          <section key={group.day} className="ts-versions-day" aria-label={group.day}>
            <h3 className="ts-versions-day-head">{group.day}</h3>
            <ul className="ts-versions-list">
              {group.versions.map((version) => {
                const current = version.revision === revision;
                return (
                  <li
                    key={version.n}
                    className={cn(
                      'ts-version',
                      version.note !== '' && 'is-named',
                      current && 'is-current',
                    )}
                    data-version={version.n}
                  >
                    <span className="ts-version-body">
                      {naming?.version.n === version.n ? (
                        <input
                          className="ts-versions-note"
                          type="text"
                          value={naming.value}
                          autoFocus
                          aria-label={PANELS.versionHistory.name}
                          data-control={`versionHistory.${version.n}.name`}
                          {...tipProps({
                            name: PANELS.versionHistory.name,
                            doc: 'Enter saves the name',
                            key: 'Enter',
                          })}
                          onChange={(event) => setNaming({ version, value: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              const trimmed = naming.value.trim();
                              setNaming(null);
                              if (trimmed !== '')
                                run(
                                  dispatch('version.save', { note: trimmed }),
                                  `Saved "${trimmed}"`,
                                );
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              event.stopPropagation();
                              setNaming(null);
                            }
                          }}
                          onBlur={() => setNaming(null)}
                        />
                      ) : (
                        <span className="ts-version-note">
                          {version.note !== '' ? version.note : formatWhen(version.createdAt)}
                        </span>
                      )}
                      <span className="ts-version-meta">
                        {version.note !== '' ? `${formatWhen(version.createdAt)} · ` : ''}
                        {authorName(version.author) === 'studio'
                          ? ''
                          : `${authorName(version.author)} · `}
                        {version.mutations.length === 0
                          ? 'named'
                          : `${version.mutations.length} change${version.mutations.length === 1 ? '' : 's'}`}
                        {current ? ' · current' : ''}
                      </span>
                    </span>
                    {!current ? (
                      <ToolButton
                        label={PANELS.versionHistory.restore}
                        title={PANELS.versionHistory.restore}
                        doc="Brings the presentation back to this version; Undo returns"
                        ariaLabel={`${PANELS.versionHistory.restore} ${version.note !== '' ? version.note : formatWhen(version.createdAt)}`}
                        className="ts-version-restore"
                        control={`versionHistory.${version.n}.restore`}
                        onClick={() => restore(version)}
                      />
                    ) : null}
                    <ToolButton
                      icon="ellipsis-vertical"
                      title="More"
                      doc="Name this version, Make a copy"
                      ariaLabel={`More for the version of ${formatWhen(version.createdAt)}`}
                      className="ts-version-more"
                      control={`versionHistory.${version.n}.more`}
                      onClick={() => {
                        const el = listRef.current?.querySelector<HTMLElement>(
                          `[data-control="versionHistory.${version.n}.more"]`,
                        );
                        if (el)
                          setMore((open) =>
                            open?.version.n === version.n ? null : { version, anchor: el },
                          );
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {more !== null ? (
          <Menu
            items={MORE_ITEMS}
            context={DEFAULT_MENU_CONTEXT}
            label="More"
            anchor={{ kind: 'element', element: more.anchor }}
            placement="below"
            returnFocusTo={more.anchor}
            onSelect={(item) => {
              if (item.id === 'version.name')
                setNaming({ version: more.version, value: more.version.note });
              if (item.id === 'version.copy') onMakeCopy?.(more.version);
            }}
            onClose={() => setMore(null)}
            id="ts-menu-version-more"
          />
        ) : null}
        <p
          className="ts-versions-foot"
          data-status="later"
          {...tipProps({
            name: 'Show changes',
            doc: stubClause('The changes between versions arrive in a later round'),
          })}
        >
          Show changes is not available yet
        </p>
      </div>
    );
  }

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
          {...noteTip}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            noteTip.onKeyDown(event);
            onNoteKey(event);
          }}
        />
        <ToolButton
          label="Save"
          title="Save a named version at the current revision"
          doc="Writes version.save with the note; the version appears here and in the palette."
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
                title="Restore"
                doc={`Restores version ${version.n} as a mutation (version.restore), so History undoes it.`}
                ariaLabel={`Restore version ${version.n}`}
                className="ts-version-restore"
                control={`version.restore.${version.n}`}
                onClick={() => restore(version)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
