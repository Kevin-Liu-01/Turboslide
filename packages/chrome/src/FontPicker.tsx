import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, isFontId } from '@turboslide/schema/fonts';

import { MoreFontsDialog } from './dialogs/MoreFonts';
import type { EditorShellInput } from './editor-shell';
import { useEditorShell } from './editor-shell-context';
import {
  FONT_PICKER,
  controlLabel,
  familyOf,
  flatRows,
  fontsStylesheetHref,
  groupRows,
  rowFamilyStack,
  takesFamily,
  typographyWithFamily,
  usedFamilies,
} from './font-picker-model';
import type { FontGroup, FontRow } from './font-picker-model';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { evaluate } from './menus/model';
import type { TailControl } from './menus/toolbar-tails';
import { anchoredAt } from './pickers/ColorPlate';
import { controlTip } from './ToolbarHead';
import { tipProps } from './Tooltip';

import './FontPicker.css';

/**
 * The toolbar's Font dropdown (gslides-parity SPEC-5-amendments A5 item 4; B7): in Google's
 * position, left of the font size control, a text button that reads the selected block's family
 * and opens a plate with a search field, the families this presentation uses first, then the
 * catalog by category, every label in its own face, and More fonts at the end opening Google's
 * dialog form. A pick writes the block's typography through `block.set /typography` (the theme's
 * face removes the key); the sheet's faces arrive through the stylesheet link `FontFaces` mounts.
 * The rows come from the `font.list` action (the catalog's names, categories, weights, italic and
 * licence) so the catalog's file table never enters the client graph; a row's face loads only when
 * the row scrolls into view, as a stylesheet link per family (`/fonts/faces/<version>/<id>.css`,
 * `font-display: swap` inside it), so opening the picker costs nothing until a row shows.
 */

/** One `font.list` fetch per page, shared by every picker. */
let catalogRows: Promise<FontRow[]> | null = null;

function loadRows(dispatch: EditorShellInput['dispatch']): Promise<FontRow[]> {
  if (catalogRows !== null) return catalogRows;
  const loading: Promise<FontRow[]> = dispatch('font.list', {})
    .then((answer: unknown) => {
      const rows = (answer as { fonts?: unknown }).fonts;
      if (!Array.isArray(rows)) throw new TypeError('font.list answered no rows');
      return rows.filter(
        (row): row is FontRow =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as { id?: unknown }).id === 'string' &&
          isFontId((row as { id: string }).id),
      );
    })
    .catch((error: unknown) => {
      catalogRows = null;
      throw error;
    });
  catalogRows = loading;
  return loading;
}

/** For the tests: forget the shared rows so the next plate fetches again. */
export function resetFontRows(): void {
  catalogRows = null;
}

const linked = new Set<string>();

/**
 * Appends the stylesheet link of one family once per page (the plate's rows and the More fonts
 * list call it when a row shows). The document's own used families are FontFaces' link, which
 * carries several ids in one sheet; a row's link names one.
 */
export function ensureFontFaceLink(id: FontId, doc: Document = document): void {
  if (id === DEFAULT_FONT_ID || linked.has(id)) return;
  linked.add(id);
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = fontsStylesheetHref([id]);
  link.dataset.fontFace = id;
  doc.head.appendChild(link);
}

/** For the tests: forget which faces were linked. */
export function resetFontFaceLinks(): void {
  linked.clear();
}

/**
 * A row's label in its own face: the family's stylesheet is linked when the row first scrolls
 * into view (an IntersectionObserver; at once where the browser has none), never before.
 */
export function FontRowLabel({ row, className }: { row: FontRow; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null || row.id === DEFAULT_FONT_ID) return;
    if (typeof IntersectionObserver === 'undefined') {
      ensureFontFaceLink(row.id);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        ensureFontFaceLink(row.id);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [row.id]);
  return (
    <span
      ref={ref}
      className={cn('ts-font-name', className)}
      style={{ fontFamily: rowFamilyStack(row) }}
      data-font={row.id}
    >
      {row.name}
    </span>
  );
}

export type FontListProps = {
  rows: readonly FontRow[];
  /** the families the presentation uses (the first group) */
  used: readonly FontId[];
  /** the family shown as picked; null for the theme's face */
  picked: FontId | null;
  onPick: (id: FontId | null) => void;
  /** the search query; the caller owns the field */
  query?: string;
  /** the theme's face as the first row of the list */
  themeRow?: boolean;
  autoFocus?: boolean;
  control?: string;
  /** More fonts at the end of the list */
  onMore?: () => void;
};

/**
 * The grouped list (the picker's body and the theme mode's Fonts control, B6): a `listbox` of
 * `option` rows the arrows walk, Enter and Space pick, Home and End jump.
 */
export function FontList({
  rows,
  used,
  picked,
  onPick,
  query = '',
  themeRow = true,
  autoFocus = false,
  control = 'font',
  onMore,
}: FontListProps) {
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupRows(rows, used, query), [rows, used, query]);
  const flat = useMemo(() => flatRows(groups), [groups]);
  const themeShown =
    themeRow && (query.trim() === '' || 'inter'.includes(query.trim().toLocaleLowerCase()));
  const moreShown = onMore !== undefined && query.trim() === '';
  /** the walkable entries: the theme row (null), each row of each group, More fonts ('more') */
  type Walked = { group: FontGroup['id'] | 'theme'; row: FontRow | null } | 'more';
  const walk: Walked[] = useMemo(
    () => [
      ...(themeShown ? [{ group: 'theme' as const, row: null }] : []),
      ...flat,
      ...(moreShown ? (['more'] as const) : []),
    ],
    [flat, moreShown, themeShown],
  );
  const [index, setIndex] = useState(() => {
    const at = walk.findIndex((entry) => entry !== 'more' && (entry.row?.id ?? null) === picked);
    return Math.max(0, at);
  });
  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (index >= walk.length) setIndex(Math.max(0, walk.length - 1));
  }, [index, walk.length]);
  const active = walk[Math.min(index, walk.length - 1)];
  const activeId = (entry: Walked | undefined): string =>
    entry === undefined
      ? ''
      : entry === 'more'
        ? 'ts-font-more'
        : `ts-font-${entry.group}-${entry.row?.id ?? 'theme'}`;
  const choose = (entry: Walked | undefined): void => {
    if (entry === undefined) return;
    if (entry === 'more') onMore?.();
    else onPick(entry.row === null ? null : entry.row.id);
  };
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(walk.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = walk.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      choose(active);
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    setIndex(next);
    const target = root.current?.querySelector<HTMLElement>(`#${activeId(walk[next])}`);
    if (target !== null && target !== undefined && typeof target.scrollIntoView === 'function')
      target.scrollIntoView({ block: 'nearest' });
  };
  const moreTip = tipProps({ name: FONT_PICKER.moreFonts, doc: FONT_PICKER.moreFontsDoc });
  let walked = -1;
  const rowNode = (row: FontRow | null, group: FontGroup['id'] | 'theme') => {
    walked += 1;
    const at = walked;
    const id = row?.id ?? null;
    const isPicked = picked === id;
    const entry: Walked = { group, row };
    return (
      <div
        key={`${group}:${id ?? 'theme'}`}
        id={activeId(entry)}
        role="option"
        aria-selected={isPicked}
        className={cn('ts-font-row', at === index && 'is-active', isPicked && 'is-picked')}
        data-control={`${control}.pick.${id ?? 'theme'}`}
        data-font={id ?? 'theme'}
        data-group={group}
        onMouseEnter={() => setIndex(at)}
        onClick={() => choose(entry)}
      >
        <span className="ts-font-check" aria-hidden="true">
          {isPicked ? <Icon name="check" size={14} /> : null}
        </span>
        {row === null ? (
          <span className="ts-font-name">{FONT_PICKER.themeFace}</span>
        ) : (
          <FontRowLabel row={row} />
        )}
      </div>
    );
  };
  return (
    <div
      ref={root}
      className="ts-font-list"
      role="listbox"
      aria-label={FONT_PICKER.control}
      aria-activedescendant={activeId(active)}
      tabIndex={0}
      data-control={`${control}.list`}
      data-rows={flat.length}
      onKeyDown={onKey}
    >
      {themeShown ? rowNode(null, 'theme') : null}
      {groups.map((group) => (
        <div key={group.id} className="ts-font-group" role="group" aria-label={group.title}>
          <h4 className="ts-picker-title">{group.title}</h4>
          {group.rows.map((row) => rowNode(row, group.id))}
        </div>
      ))}
      {flat.length === 0 ? <p className="ts-font-empty">{FONT_PICKER.noMatch}</p> : null}
      {moreShown ? (
        <>
          <span className="ts-menu-divider" role="separator" />
          <div
            id="ts-font-more"
            role="option"
            aria-selected={false}
            className={cn('ts-font-row ts-font-more', active === 'more' && 'is-active')}
            data-control={`${control}.more`}
            onClick={onMore}
            {...moreTip}
            onMouseEnter={(event) => {
              moreTip.onMouseEnter(event);
              setIndex(walk.length - 1);
            }}
          >
            <span className="ts-font-check" aria-hidden="true" />
            <span className="ts-font-name">{FONT_PICKER.moreFonts}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export type FontPickerPlateProps = {
  anchor: HTMLElement;
  rows: readonly FontRow[] | null;
  used: readonly FontId[];
  picked: FontId | null;
  onPick: (id: FontId | null) => void;
  onClose: () => void;
  control: string;
  /** the rows failed to load */
  error?: string | null;
};

/**
 * The plate under the Font control: the search field, the grouped list, More fonts. Esc and a
 * click outside close it and return focus to the control.
 */
export function FontPickerPlate({
  anchor,
  rows,
  used,
  picked,
  onPick,
  onClose,
  control,
  error = null,
}: FontPickerPlateProps) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [more, setMore] = useState(false);
  const at = anchoredAt(anchor, 280, 420);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) || anchor.contains(event.target)) return;
      // the dialog over the plate is its own layer
      if (more) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, more, onClose]);
  const pick = (id: FontId | null) => {
    onPick(id);
    onClose();
    anchor.focus();
  };
  return (
    <>
      <div
        ref={root}
        // the plate steps aside while More fonts is open (is-aside: display none, since the
        // plate's own display rule would beat the hidden attribute): the dialog is the one layer
        // a click reaches, and the plate returns with the list focused when the dialog closes
        className={cn('ts-plate-anchored ts-chrome ts-font-plate', more && 'is-aside')}
        role="dialog"
        aria-label={FONT_PICKER.control}
        style={{ left: at.left, top: at.top }}
        data-control={`${control}.plate`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            anchor.focus();
          }
        }}
      >
        <input
          className="ts-font-search"
          type="search"
          value={query}
          placeholder={FONT_PICKER.search}
          aria-label={FONT_PICKER.search}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          data-control={`${control}.search`}
          {...tipProps({ name: FONT_PICKER.search, doc: FONT_PICKER.searchDoc })}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              root.current?.querySelector<HTMLElement>('.ts-font-list')?.focus();
            }
          }}
        />
        {rows === null ? (
          <p className="ts-font-empty" data-control={`${control}.loading`}>
            {error ?? '…'}
          </p>
        ) : (
          <FontList
            rows={rows}
            used={used}
            picked={picked}
            query={query}
            onPick={pick}
            control={control}
            onMore={() => setMore(true)}
          />
        )}
      </div>
      {more && rows !== null ? (
        <MoreFontsDialog
          rows={rows}
          used={used}
          picked={picked}
          onPick={(id) => {
            setMore(false);
            pick(id);
          }}
          onClose={() => {
            setMore(false);
            root.current?.querySelector<HTMLElement>('.ts-font-list')?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The toolbar control (toolbar-tails.ts `toolbar.font`, ToolbarTail.tsx renders it for
 * `op: 'font'`): the selected block's family name with a chevron; the plate on a click.
 */
export function FontField({ control, block }: { control: TailControl; block: Block | undefined }) {
  const shell = useEditorShell();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FontRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const takes = takesFamily(block);
  const enabled = control.status === 'now' && evaluate(control.enabled, shell.menuContext) && takes;
  const tip = controlTip(
    {
      ...control,
      ...(block !== undefined && !takes ? { disabledReason: FONT_PICKER.tableDoc } : {}),
    },
    shell.platform,
    enabled,
  );
  const family = familyOf(block);
  const label = controlLabel(block, rows);
  const { input } = shell;
  const used = useMemo(() => usedFamilies(input.document), [input.document]);
  useEffect(() => {
    // the rows on the first open, or at once when the block carries a family, so the control
    // reads the catalog's name rather than the id's title case
    if ((!open && family === null) || rows !== null) return;
    let alive = true;
    loadRows(input.dispatch)
      .then((loaded) => {
        if (alive) setRows(loaded);
      })
      .catch((failure: unknown) => {
        if (alive) setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      alive = false;
    };
  }, [family, input.dispatch, open, rows]);
  const apply = (next: FontId | null) => {
    if (block === undefined) return;
    const typography =
      'typography' in block && typeof block.typography === 'object' && block.typography !== null
        ? (block.typography as Record<string, unknown>)
        : {};
    input
      .dispatch('block.set', {
        slideId: input.slideId,
        blockId: block.id,
        path: '/typography',
        value: typographyWithFamily(typography, next),
        baseRevision: input.revision,
      })
      .catch((failure: unknown) =>
        shell.say(failure instanceof Error ? failure.message : String(failure)),
      );
  };
  return (
    <span className={cn('ts-tb-slot ts-font-slot', !enabled && 'is-disabled')}>
      <button
        ref={button}
        type="button"
        className={cn('pt-ib ts-tb is-text has-chevron ts-font-control', open && 'is-on')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={enabled ? undefined : true}
        data-control={control.control}
        data-status={control.status}
        data-font={family ?? 'theme'}
        onClick={() => {
          if (enabled) setOpen((on) => !on);
        }}
        {...tipProps(tip)}
      >
        <span className="pt-lb ts-font-label">{label}</span>
        <Icon name="chevron-down" />
      </button>
      {open && button.current !== null ? (
        <FontPickerPlate
          anchor={button.current}
          rows={rows}
          error={error}
          used={used}
          picked={family}
          onPick={apply}
          onClose={() => setOpen(false)}
          control={control.control}
        />
      ) : null}
    </span>
  );
}
