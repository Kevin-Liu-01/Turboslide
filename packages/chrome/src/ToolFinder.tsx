import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import { LAYOUTS } from '@turboslide/schema/layouts';
import type { LayoutId } from '@turboslide/schema/layouts';

import type { EditorDispatch } from './dispatch';
import { KIND_ICONS } from './inspector/sections';
import { finderRows } from './menus/finder';
import type { MenuContext, MenuItem } from './menus/model';
import { findItem, isPresent } from './menus/model';
import { Palette } from './Palette';
import type { PaletteEntry } from './palette-data';
import { filterPalette } from './palette-data';

/**
 * Search the menus (gslides-parity SPEC 2.10, 3.1 row 1; Option+/): the command palette in menu
 * mode. Every menu item of the model that is not omitted is a row with its menu path and its key;
 * the slides and the layouts stay as two more groups (SPEC 2.10: "The Slides and Layouts groups
 * stay"); the Actions group moves to Tools > Advanced > Run an action…, which opens the full
 * palette. Enter runs the item's effect through the shell. The rows' tooltips carry the label,
 * the sentence and the key, never an action id or a pointer (SPEC 12).
 *
 * The product round (docs/PRODUCT.md 6.1; audit-assist 8): the empty state gains the row "Ask the
 * assistant: <phrase>" (`finder.assist.ask`, drawn as `palette.finder.assist.ask`) when a phrase
 * matches nothing; Enter opens the Assist panel with the phrase in the box through `onAsk`. The
 * row is present while the Assist entry is (`title.assist` in the model and drawn for the
 * context), so parking the assist parks the row with it (8.1).
 */
export type ToolFinderProps = {
  open: boolean;
  document: DeckDocument;
  slideId: string;
  menuContext: MenuContext;
  dispatch: EditorDispatch;
  onRunItem: (item: MenuItem) => void;
  onPickLayout: (layout: LayoutId) => void;
  onClose: () => void;
  onNotice?: (message: string) => void;
  /** opens the Assist panel with the phrase; without it the empty state stays "Nothing matches" */
  onAsk?: (phrase: string) => void;
};

/** The Ask row's entry id; the palette draws it as `palette.finder.assist.ask`. */
export const ASK_ENTRY_ID = 'finder.assist.ask';

/** The Ask row's words. */
export const ASK_ROW = {
  title: (phrase: string) => `Ask the assistant: ${phrase}`,
  doc: 'Opens Assist with these words in the box; nothing changes until you accept a card',
} as const;

/** True while the Assist entry exists in the model and the context draws it (the parks rule). */
export function assistPresent(ctx: MenuContext): boolean {
  const item = findItem('title.assist');
  return item !== undefined && isPresent(item, ctx);
}

/** The rows of the finder for a document: the menu items, the slides, the layouts. */
export function toolFinderEntries(
  document: DeckDocument,
  slideId: string,
  ctx: MenuContext,
  run: (item: MenuItem) => void,
  pickLayout: (layout: LayoutId) => void,
): PaletteEntry[] {
  const menus: PaletteEntry[] = finderRows(ctx).map((row) => ({
    id: row.id,
    group: 'menus',
    title: row.title,
    meta: row.path,
    ...(row.doc === undefined ? {} : { hint: row.doc }),
    ...(row.key === undefined ? {} : { keys: row.key }),
    icon: row.item.icon ?? 'document',
    terms: row.terms,
    run: row.enabled
      ? { kind: 'call', call: () => run(row.item) }
      : {
          kind: 'needs',
          action: 'deck.info',
          reason: row.doc ?? 'Not available for the current selection',
        },
  }));
  const order = slideOrder(document.deck);
  const slides: PaletteEntry[] = order.flatMap((id, index) => {
    const slide = document.slides[id];
    if (slide === undefined) return [];
    const n = index + 1;
    return [
      {
        id: `slide:${id}`,
        group: 'slides' as const,
        title: `${n < 10 ? `0${n}` : n}  ${slideTitle(slide, n)}`,
        meta: id === slideId ? 'current' : undefined,
        icon: KIND_ICONS[slide.kind],
        preview: id,
        terms: `${id} ${slide.kind}`,
        run: { kind: 'dispatch' as const, action: 'view.goto' as const, input: { slideId: id } },
      },
    ];
  });
  const layouts: PaletteEntry[] = LAYOUTS.map((entry) => ({
    id: `layout:${entry.id}`,
    group: 'layouts',
    title: entry.label,
    hint: entry.doc,
    meta: entry.google ? undefined : 'GT',
    icon: 'columns',
    terms: `layout ${entry.id} ${entry.kind}`,
    run: { kind: 'call', call: () => pickLayout(entry.id) },
  }));
  return [...menus, ...slides, ...layouts];
}

/**
 * The Ask row for a phrase that matches nothing (docs/PRODUCT.md 6.1): one entry whose words are
 * the phrase itself, so the filter keeps it while every other row is gone; null while the phrase
 * matches a row, is empty, or the assist is absent.
 */
export function askEntry(
  entries: ReadonlyArray<PaletteEntry>,
  phrase: string,
  ctx: MenuContext,
  ask: ((phrase: string) => void) | undefined,
): PaletteEntry | null {
  const trimmed = phrase.trim();
  if (ask === undefined || trimmed === '' || !assistPresent(ctx)) return null;
  if (filterPalette(entries, phrase).some((group) => group.rows.length > 0)) return null;
  return {
    id: ASK_ENTRY_ID,
    group: 'menus',
    title: ASK_ROW.title(trimmed),
    hint: ASK_ROW.doc,
    icon: 'sparkles',
    terms: trimmed.toLowerCase(),
    run: { kind: 'call', call: () => ask(trimmed) },
  };
}

export function ToolFinder({
  open,
  document,
  slideId,
  menuContext,
  dispatch,
  onRunItem,
  onPickLayout,
  onClose,
  onNotice,
  onAsk,
}: ToolFinderProps) {
  const [phrase, setPhrase] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPhrase('');
  }
  const base = useMemo(
    () => (open ? toolFinderEntries(document, slideId, menuContext, onRunItem, onPickLayout) : []),
    [open, document, slideId, menuContext, onRunItem, onPickLayout],
  );
  const ask = useMemo(
    () => (open ? askEntry(base, phrase, menuContext, onAsk) : null),
    [open, base, phrase, menuContext, onAsk],
  );
  const entries = useMemo(() => (ask === null ? base : [...base, ask]), [base, ask]);
  /* the palette owns the query; the finder reads it as it is typed, from the input's own event,
     so the Ask row can join the list when nothing else matches (React's onInput bubbles) */
  const onInput = (event: FormEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset['control'] === 'palette.query')
      setPhrase(target.value);
  };
  return (
    <div onInput={onInput} data-control="toolFinder.frame">
      <Palette
        open={open}
        entries={entries}
        dispatch={dispatch}
        onClose={onClose}
        onNotice={onNotice}
        placeholder="Search the menus"
        label="Search the menus"
        groups={['menus', 'slides', 'layouts']}
        shortcutKey="Option /"
        className="ts-toolfinder"
      />
    </div>
  );
}
