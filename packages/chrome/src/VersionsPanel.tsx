import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { Version } from '@turboslide/schema/mutations';

import type { EditorDispatch } from './dispatch';
import { authorName } from './dispatch';
import type { IdentityView } from './editor-shell';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { DEFAULT_MENU_CONTEXT, isPresent, itemById } from './menus/model';
import type { MenuContext, MenuItem } from './menus/model';
import { PANELS, stubClause } from './menus/strings';
import { IdentityChip, nameOf, trustWordOf } from './presence/IdentityChip';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';
import {
  MARKS_PER_WINDOW,
  groupVersions,
  identityOfAuthor,
  isLegacyAuthor,
  namedCap,
} from './versions-model';
import type { VersionWindow } from './versions-model';

import './VersionsPanel.css';

/**
 * The versions list (SPEC 6.5, 6.7) and, with `history`, the Version history panel of the Google
 * Slides parity rounds (gslides-parity SPEC 2.1, 12 "Panels"; SPEC-3 0.45, 5.7): the records
 * grouped by day, newest first, and inside a day by a 15 minute window whose row shows up to four
 * author marks and the change count and expands to its records; a named record stands alone. Each
 * record carries its author's 16 px mark and trust word (the round one `studio` author collapses
 * into "Earlier edits"); "Only show named versions", "Name current version", "Restore this
 * version" per version, and a More menu per version with "Name this version", "Make a copy" (at
 * that version, through `deck.copy { atVersion }`) and the two delete rows as disabled stubs with
 * their clause; the 40 named versions cap with a sentence naming the oldest. "Show changes" is the
 * checkbox at the panel's bottom, Google's position: it selects a version and the shell runs
 * `version.diff` against its predecessor and hatches the overlay. Restore is a mutation through
 * version.restore with the current baseRevision, so it is undoable. Nothing here reads or writes
 * the log: the studio passes it and the dispatcher acts. Without `history` the component keeps its
 * embedded form for the Inspector: a note field with Save and the flat list.
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
  /** the resolved identities of the records' authors, by principal id (SPEC-3 7.8) */
  identities?: Readonly<Record<string, IdentityView>>;
  /** this browser's own identity: its rows read You (docs/PRODUCT.md 3.2; audit-interface 31) */
  me?: IdentityView;
  /** Show changes (SPEC-3 5.7): the checkbox's state and the selected version */
  showChanges?: boolean;
  selected?: Version | null;
  onShowChanges?: (on: boolean) => void;
  onSelect?: (version: Version | null) => void;
  /**
   * The shell's menu context (docs/FOCUS.md 3.1, the one presence rule): the Show changes row
   * (`file.versionHistory.showChanges`, parked with `advanced: true`) and the two Later delete
   * rows of a version's More menu are drawn only while `isPresent` says so, which is while Tools
   * > Advanced tools is on. The default context is the switch off, so a panel mounted without one
   * (the embedded form, a test) draws neither.
   */
  menuContext?: MenuContext;
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

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

/** The versions newest first, grouped by day; named only when asked (the round one grouping, kept for the tests). */
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
  /* SPEC-3 0.45, 13.3: present and disabled with the clause */
  { ...itemById('file.versionHistory.deleteOlder'), dividerBefore: true },
  itemById('file.versionHistory.deleteHistory'),
];

export function VersionsPanel({
  versions,
  revision,
  dispatch,
  embedded = false,
  history = false,
  onMakeCopy,
  identities,
  showChanges = false,
  selected = null,
  onShowChanges,
  onSelect,
  menuContext = DEFAULT_MENU_CONTEXT,
  me,
  className,
}: VersionsPanelProps) {
  /* the author's name: You for this browser's own records, the display name otherwise (3.2); an
     agent author with a name of its own reads it (the assistant's accept writes as "Assistant",
     docs/PRODUCT.md 6.1), where the presence chips word an agent by its run (nameOf) */
  const authorWord = (identity: IdentityView): string => {
    if (me !== undefined && identity.principalId === me.principalId) return 'You';
    if (identity.trust === 'agent' && identity.name !== undefined && identity.name !== 'Agent')
      return identity.name;
    return nameOf(identity);
  };
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [namedOnly, setNamedOnly] = useState(false);
  const [more, setMore] = useState<{ version: Version; anchor: HTMLElement } | null>(null);
  const [naming, setNaming] = useState<{ version: Version; value: string } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [namingCurrent, setNamingCurrent] = useState<string | null>(null);
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

  const cap = namedCap(versions);
  const saveNamed = (trimmed: string) => {
    if (trimmed === '' || busy) return;
    if (cap.full) {
      setNotice(PANELS.versionHistory.namedCap(cap.oldest ?? ''));
      return;
    }
    run(dispatch('version.save', { note: trimmed }), `Saved "${trimmed}" at r${revision}`);
  };

  const save = () => {
    const trimmed = note.trim();
    if (trimmed === '' || busy) return;
    saveNamed(trimmed);
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

  const toggleWindow = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const versionRow = (version: Version, inWindow: boolean) => {
    const current = version.revision === revision;
    const identity = identityOfAuthor(version.author, identities);
    const legacy = isLegacyAuthor(identity);
    const trust = trustWordOf(identity);
    const picked = selected?.n === version.n;
    return (
      <li
        key={version.n}
        className={cn(
          'ts-version',
          version.note !== '' && 'is-named',
          current && 'is-current',
          inWindow && 'is-in-window',
          picked && 'is-picked',
        )}
        data-version={version.n}
        data-author={identity.principalId}
        aria-selected={onSelect ? picked : undefined}
      >
        <span className="ts-version-mark" aria-hidden={legacy ? 'true' : undefined}>
          {legacy ? (
            <span className="ts-chip is-blank ts-chip-16" />
          ) : (
            <IdentityChip identity={identity} size={16} />
          )}
        </span>
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
                  if (trimmed !== '') saveNamed(trimmed);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setNaming(null);
                }
              }}
              onBlur={() => setNaming(null)}
            />
          ) : (
            <button
              type="button"
              className="ts-version-note ts-version-pick"
              data-control={`versionHistory.${version.n}.pick`}
              onClick={() => onSelect?.(picked ? null : version)}
              {...tipProps({
                name: version.note !== '' ? version.note : formatWhen(version.createdAt),
                doc: showChanges
                  ? 'Shows this version’s changes on the slide'
                  : 'Selects this version',
              })}
            >
              {version.note !== ''
                ? version.note
                : inWindow
                  ? formatTime(version.createdAt)
                  : formatWhen(version.createdAt)}
            </button>
          )}
          <span className="ts-version-meta">
            {version.note !== '' ? `${formatWhen(version.createdAt)} · ` : ''}
            <span className="ts-version-author" data-author-word={authorWord(identity)}>
              {authorWord(identity)}
              {trust !== null && authorWord(identity) !== 'You' ? ` · ${trust}` : ''}
            </span>
            {' · '}
            {version.mutations.length === 0
              ? 'named'
              : PANELS.versionHistory.changes(version.mutations.length)}
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
              setMore((state) => (state?.version.n === version.n ? null : { version, anchor: el }));
          }}
        />
      </li>
    );
  };

  const windowRow = (window: VersionWindow) => {
    const single = window.versions.length === 1 || window.named;
    if (single) return window.versions.map((version) => versionRow(version, false));
    const expanded = open.has(window.key);
    const marks = window.authors.slice(0, MARKS_PER_WINDOW);
    const more = window.authors.length - marks.length;
    return (
      <li
        key={window.key}
        className={cn('ts-version-window', expanded && 'is-open')}
        data-window={window.key}
      >
        <button
          type="button"
          className="ts-version-window-row"
          aria-expanded={expanded}
          data-control={`versionHistory.window.${window.key}`}
          onClick={() => toggleWindow(window.key)}
          {...tipProps({
            name: `${formatTime(window.from)} to ${formatTime(window.to)}`,
            doc: `${window.versions.length} versions by ${window.authors.length === 1 ? 'one person' : `${window.authors.length} people`}; click to list them`,
          })}
        >
          <span className="ts-version-marks" aria-label={window.authors.map(authorWord).join(', ')}>
            {marks.map((identity) =>
              isLegacyAuthor(identity) ? (
                <span key={identity.principalId} className="ts-chip is-blank ts-chip-16" />
              ) : (
                <IdentityChip key={identity.principalId} identity={identity} size={16} />
              ),
            )}
            {more > 0 ? <span className="ts-version-marks-more">+{more}</span> : null}
          </span>
          <span className="ts-version-body">
            <span className="ts-version-note">
              {formatTime(window.from)} to {formatTime(window.to)}
            </span>
            <span className="ts-version-meta">
              {window.authors.map(authorWord).join(', ')} ·{' '}
              {PANELS.versionHistory.changes(window.changes)}
            </span>
          </span>
          <span className="ts-version-window-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        </button>
        {expanded ? (
          <ul className="ts-versions-list is-window">
            {window.versions.map((version) => versionRow(version, true))}
          </ul>
        ) : null}
      </li>
    );
  };

  if (history) {
    const days = groupVersions(versions, identities, namedOnly);
    const showChangesItem = itemById('file.versionHistory.showChanges');
    return (
      <div
        className={cn('ts-versions is-history', className)}
        data-count={versions.length}
        data-show-changes={showChanges ? '' : undefined}
        ref={listRef}
      >
        <div className="ts-versions-tools">
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
          {namingCurrent === null ? (
            <button
              type="button"
              className="pt-ib is-text"
              data-control="versionHistory.nameCurrent"
              data-menu-item="file.versionHistory.nameCurrent"
              onClick={() => setNamingCurrent('')}
              {...tipProps({
                name: PANELS.versionHistory.nameCurrent,
                doc: `Up to ${40} named versions`,
              })}
            >
              <span className="pt-lb">{PANELS.versionHistory.nameCurrent}</span>
            </button>
          ) : (
            <input
              className="ts-versions-note"
              type="text"
              value={namingCurrent}
              autoFocus
              aria-label={PANELS.versionHistory.nameCurrent}
              data-control="versionHistory.nameCurrent.field"
              {...tipProps({
                name: PANELS.versionHistory.nameCurrent,
                doc: 'Enter saves the name',
                key: 'Enter',
              })}
              onChange={(event) => setNamingCurrent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const trimmed = namingCurrent.trim();
                  setNamingCurrent(null);
                  saveNamed(trimmed);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setNamingCurrent(null);
                }
              }}
              onBlur={() => setNamingCurrent(null)}
            />
          )}
        </div>
        {notice ? (
          <p className="ts-versions-notice" role="status">
            {notice}
          </p>
        ) : null}
        {days.length === 0 ? (
          <p className="ts-versions-empty">
            {namedOnly ? 'No named versions yet' : 'No versions yet'}
          </p>
        ) : null}
        {days.map((day) => (
          <section key={day.day} className="ts-versions-day" aria-label={day.day}>
            <h3 className="ts-versions-day-head">{day.day}</h3>
            <ul className="ts-versions-list">
              {day.windows.flatMap((window) => windowRow(window))}
            </ul>
          </section>
        ))}
        {more !== null ? (
          <Menu
            items={MORE_ITEMS}
            context={menuContext}
            /* the two delete rows are contextOnly rows of the File menu's model (SPEC-3 0.45, 13.3:
               present here and disabled with their clause); without this flag the Menu drops
               them, and with the switch off `isPresent` hides them (docs/FOCUS.md 3.1) */
            includeContextOnly
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
        {isPresent(showChangesItem, menuContext) ? (
          <label
            className={cn('ts-versions-named ts-versions-foot', showChanges && 'is-on')}
            data-control="versionHistory.showChanges.row"
            {...tipProps({
              name: showChangesItem.label,
              doc: showChangesItem.doc ?? 'Hatches what the selected version changed, by author',
            })}
          >
            <input
              type="checkbox"
              checked={showChanges}
              data-control="versionHistory.showChanges"
              data-menu-item={showChangesItem.id}
              onChange={(event) => onShowChanges?.(event.target.checked)}
            />
            <span className="ts-versions-named-box" aria-hidden="true" />
            <span>{showChangesItem.label}</span>
          </label>
        ) : null}
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

/** The stub sentence of the two delete rows, for the tests (SPEC-3 0.45). */
export const DELETE_ROWS_CLAUSE = stubClause(
  itemById('file.versionHistory.deleteOlder').stubReason ?? '',
);
