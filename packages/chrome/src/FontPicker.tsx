import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { FontId } from '@turboslide/schema/fonts';
import { DEFAULT_FONT_ID, isFontId } from '@turboslide/schema/fonts';

import { fontRows } from '@turboslide/render/fonts';

import { MoreFontsDialog } from './dialogs/MoreFonts';
import { useEditorShell } from './editor-shell-context';
import {
  FONT_CATEGORY_LABELS,
  FONT_PICKER,
  brandFamilies,
  controlLabel,
  familyLabel,
  familyOf,
  flatRows,
  fontsStylesheetHref,
  groupRows,
  pushRecentFont,
  readRecentFonts,
  rowFamilyStack,
  takesFamily,
  typographyWithFamily,
  usedFamilies,
  writeRecentFonts,
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
 * The toolbar's Font dropdown (gslides-parity SPEC-5-amendments A5 item 4; docs/PRODUCT.md 4.2;
 * ported from round five): in Google's position, left of the font size control, a text button
 * that reads the selected block's family and opens a plate with a search field, the brand kit's
 * two faces under Brand, the families this presentation uses, then the catalog by category,
 * every label in its own face, and More fonts at the end opening Google's dialog form. A pick
 * writes the block's typography through `block.set /typography` (the theme's face removes the
 * key), one revision, one Undo. The rows come from the `font.list` action (the catalog's names,
 * categories, weights, italic and licence); a row's face loads only when the row scrolls into
 * view, as a stylesheet link per family (`/fonts/faces/current/<id>.css`, `font-display: swap`
 * inside it), so opening the picker costs nothing until a row shows. The Brand kit panel's two
 * Fonts controls are the same dropdown (`FontDropdown`) with their own control ids.
 *
 * The features round (docs/FEATURES.md 3.5, P1; audit-fonts 10, 11, 17): a Recent group of up to
 * five faces per browser after Used, written on every pick, with Clear recent at its foot; the
 * search matches the name, the category label and the id; a row's tooltip names the face and its
 * category, and the licence stays in More fonts.
 *
 * Ids (PRODUCT.md 7.1): `<control>.search`, `<control>.group.<brand|used|recent|sans|serif|display|mono>`,
 * `<control>.row.<id>`, `<control>.clearRecent`, `<control>.more`.
 */

/** The catalog's rows, read once from the renderer's light table (the same rows `font.list` answers). */
let catalogRows: FontRow[] | null = null;

export function catalogFontRows(): FontRow[] {
  if (catalogRows === null)
    catalogRows = fontRows().filter((row): row is FontRow => isFontId(row.id));
  return catalogRows;
}

const linked = new Set<string>();

/**
 * Appends the stylesheet link of one family once per page (the plate's rows and the More fonts
 * list call it when a row shows). The document's own used families ride inside the rendered
 * slides (render slide.ts kitStyle); a row's link names one family for its label alone.
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

/** The browser's store for the Recent group; null where none is at hand (a server render, a blocked store). */
function storageOf(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
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
  /** the kit's faces (the Brand group) */
  brand: readonly FontId[];
  /** the families the presentation uses (the second group) */
  used: readonly FontId[];
  /** the faces this browser picked lately (the Recent group, after Used) */
  recent?: readonly FontId[];
  /** Clear recent at the Recent group's foot */
  onClearRecent?: () => void;
  /** the family shown as picked; null for the theme's face */
  picked: FontId | null;
  onPick: (id: FontId | null) => void;
  /** the search query; the caller owns the field */
  query?: string;
  autoFocus?: boolean;
  control: string;
  /** More fonts at the end of the list */
  onMore?: () => void;
};

/**
 * The grouped list (the dropdown's body and the Brand kit panel's Fonts controls): a `listbox`
 * of `option` rows the arrows walk, Enter and Space pick, Home and End jump.
 */
export function FontList({
  rows,
  brand,
  used,
  recent = [],
  onClearRecent,
  picked,
  onPick,
  query = '',
  autoFocus = false,
  control,
  onMore,
}: FontListProps) {
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(
    () => groupRows(rows, used, query, brand, recent),
    [rows, used, query, brand, recent],
  );
  const flat = useMemo(() => flatRows(groups), [groups]);
  const moreShown = onMore !== undefined && query.trim() === '';
  type Walked = { group: FontGroup['id']; row: FontRow } | 'more';
  const walk: Walked[] = useMemo(
    () => [...flat, ...(moreShown ? (['more'] as const) : [])],
    [flat, moreShown],
  );
  const [index, setIndex] = useState(() => {
    const at = walk.findIndex(
      (entry) => entry !== 'more' && entry.row.id === (picked ?? DEFAULT_FONT_ID),
    );
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
        ? `${control}-more`
        : `${control}-${entry.group}-${entry.row.id}`;
  const choose = (entry: Walked | undefined): void => {
    if (entry === undefined) return;
    if (entry === 'more') onMore?.();
    else onPick(entry.row.id === DEFAULT_FONT_ID ? null : entry.row.id);
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
    const target = root.current?.querySelector<HTMLElement>(`[id="${activeId(walk[next])}"]`);
    if (target !== null && target !== undefined && typeof target.scrollIntoView === 'function')
      target.scrollIntoView({ block: 'nearest' });
  };
  const { onMouseEnter: moreEnter, ...moreTip } = tipProps({
    name: FONT_PICKER.moreFonts,
    doc: FONT_PICKER.moreFontsDoc,
  });
  let walked = -1;
  const rowNode = (row: FontRow, group: FontGroup['id']) => {
    walked += 1;
    const at = walked;
    const isPicked = (picked ?? DEFAULT_FONT_ID) === row.id;
    const entry: Walked = { group, row };
    /* the tooltip names the face and its category; the licence stays in More fonts (audit-fonts 17) */
    const { onMouseEnter: rowEnter, ...rowTip } = tipProps({
      name: row.name,
      doc: `${FONT_CATEGORY_LABELS[row.category]}; Enter picks it`,
    });
    return (
      <div
        key={`${group}:${row.id}`}
        id={activeId(entry)}
        role="option"
        aria-selected={isPicked}
        className={cn('ts-font-row', at === index && 'is-active', isPicked && 'is-picked')}
        // the row itself draws in the face (the label span too): a reader of the row's computed
        // family, the walk's `fonts.dropdown.opens` among them, sees the face and not the chrome's
        style={{ fontFamily: rowFamilyStack(row) }}
        data-control={`${control}.row.${row.id}`}
        data-font={row.id}
        data-group={group}
        {...rowTip}
        onMouseEnter={(event) => {
          rowEnter(event);
          setIndex(at);
        }}
        onClick={() => choose(entry)}
      >
        <span className="ts-font-check" aria-hidden="true">
          {isPicked ? <Icon name="check" size={14} /> : null}
        </span>
        <FontRowLabel row={row} />
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
      {groups.map((group) => (
        <div
          key={group.id}
          className="ts-font-group"
          role="group"
          aria-label={group.title}
          data-control={`${control}.group.${group.id}`}
        >
          <h4 className="ts-picker-title">{group.title}</h4>
          {group.rows.map((row) => rowNode(row, group.id))}
          {group.id === 'recent' && onClearRecent !== undefined ? (
            <button
              type="button"
              className="ts-font-clear"
              data-control={`${control}.clearRecent`}
              onClick={onClearRecent}
              {...tipProps({ name: FONT_PICKER.clearRecent, doc: FONT_PICKER.clearRecentDoc })}
            >
              {FONT_PICKER.clearRecent}
            </button>
          ) : null}
        </div>
      ))}
      {flat.length === 0 ? <p className="ts-font-empty">{FONT_PICKER.noMatch}</p> : null}
      {moreShown ? (
        <>
          <span className="ts-menu-divider" role="separator" />
          <div
            id={`${control}-more`}
            role="option"
            aria-selected={false}
            className={cn('ts-font-row ts-font-more', active === 'more' && 'is-active')}
            data-control={`${control}.more`}
            {...moreTip}
            onClick={onMore}
            onMouseEnter={(event) => {
              moreEnter(event);
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
  brand: readonly FontId[];
  used: readonly FontId[];
  picked: FontId | null;
  onPick: (id: FontId | null) => void;
  onClose: () => void;
  control: string;
  /** the rows failed to load */
  error?: string | null;
};

/**
 * The plate under a Font control: the search field, the grouped list, More fonts. Esc and a
 * click outside close it and return focus to the control.
 */
export function FontPickerPlate({
  anchor,
  rows,
  brand,
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
  /* the Recent group (FEATURES.md 3.5, P1): read on open, written on every pick, per browser */
  const [recent, setRecent] = useState<FontId[]>(() => readRecentFonts(storageOf()));
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
    /* written before the plate closes: a state updater would never run on the unmounted plate,
       and the store write lives in the push (measured on 4411: no Recent group after a pick) */
    setRecent(pushRecentFont(recent, id, storageOf()));
    onPick(id);
    onClose();
    anchor.focus();
  };
  const clearRecent = () => {
    writeRecentFonts([], storageOf());
    setRecent([]);
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
            brand={brand}
            used={used}
            recent={recent}
            onClearRecent={clearRecent}
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
          used={[...brand, ...used.filter((id) => !brand.includes(id))]}
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

export type FontDropdownProps = {
  /** the control id; the plate's ids hang off it */
  control: string;
  label: string;
  doc: string;
  /** the family shown; null for the theme's face */
  value: FontId | null;
  onPick: (id: FontId | null) => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
};

/**
 * A Font dropdown anywhere in the chrome: the family name with a chevron, the plate on a click.
 * The toolbar's control (`FontField`) and the Brand kit panel's Display and Text controls use it.
 */
export function FontDropdown({
  control,
  label,
  doc,
  value,
  onPick,
  disabled = false,
  disabledReason,
  className,
}: FontDropdownProps) {
  const shell = useEditorShell();
  const { input } = shell;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const rows = catalogFontRows();
  const error = null;
  const used = useMemo(() => usedFamilies(input.document), [input.document]);
  const brand = useMemo(
    () => brandFamilies(input.document.deck.brand),
    [input.document.deck.brand],
  );
  return (
    <span className={cn('ts-tb-slot ts-font-slot', disabled && 'is-disabled', className)}>
      <button
        ref={button}
        type="button"
        className={cn('pt-ib ts-tb is-text has-chevron ts-font-control', open && 'is-on')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled ? true : undefined}
        data-control={control}
        data-status="now"
        data-font={value ?? 'theme'}
        onClick={() => {
          if (!disabled) setOpen((on) => !on);
        }}
        {...tipProps({
          name: label,
          doc: disabled && disabledReason !== undefined ? disabledReason : doc,
        })}
      >
        <span className="pt-lb ts-font-label">{familyLabel(value ?? DEFAULT_FONT_ID, rows)}</span>
        <Icon name="chevron-down" />
      </button>
      {open && button.current !== null ? (
        <FontPickerPlate
          anchor={button.current}
          rows={rows}
          error={error}
          brand={brand}
          used={used}
          picked={value}
          onPick={onPick}
          onClose={() => setOpen(false)}
          control={control}
        />
      ) : null}
    </span>
  );
}

/**
 * The toolbar control (toolbar-tails.ts `toolbar.font`, ToolbarTail.tsx renders it for
 * `op: 'font'`): the selected block's family name with a chevron; the plate on a click. With the
 * catalog parked by the ship's rule (`FONTS_PARKED`, docs/PRODUCT.md 3.4) the control draws the
 * family as a read only value with the same tooltip and no chevron.
 */
export function FontField({
  control,
  block,
  readOnly = false,
}: {
  control: TailControl;
  block: Block | undefined;
  readOnly?: boolean;
}) {
  const shell = useEditorShell();
  const { input } = shell;
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
  if (readOnly)
    return (
      <span className="ts-tb-slot ts-font-slot is-readonly">
        <span
          className="pt-ib ts-tb is-text ts-font-control is-readonly"
          data-control={control.control}
          data-status="now"
          data-font={family ?? 'theme'}
          aria-disabled="true"
          {...tipProps(tip)}
        >
          <span className="pt-lb ts-font-label">{controlLabel(block)}</span>
        </span>
      </span>
    );
  return (
    <FontDropdown
      control={control.control}
      label={tip.name}
      doc={tip.doc ?? FONT_PICKER.doc}
      value={family}
      onPick={apply}
      disabled={!enabled}
      {...(tip.doc !== undefined ? { disabledReason: tip.doc } : {})}
    />
  );
}
