import { useMemo } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import { LAYOUTS } from '@turboslide/schema/layouts';
import type { LayoutId } from '@turboslide/schema/layouts';

import type { EditorDispatch } from './dispatch';
import { KIND_ICONS } from './inspector/sections';
import { finderRows } from './menus/finder';
import type { MenuContext, MenuItem } from './menus/model';
import { Palette } from './Palette';
import type { PaletteEntry } from './palette-data';

/**
 * Search the menus (gslides-parity SPEC 2.10, 3.1 row 1; Option+/): the command palette in menu
 * mode. Every menu item of the model that is not omitted is a row with its menu path and its key;
 * the slides and the layouts stay as two more groups (SPEC 2.10: "The Slides and Layouts groups
 * stay"); the Actions group moves to Tools > Advanced > Run an action…, which opens the full
 * palette. Enter runs the item's effect through the shell. The rows' tooltips carry the label,
 * the sentence and the key, never an action id or a pointer (SPEC 12).
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
};

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
}: ToolFinderProps) {
  const entries = useMemo(
    () => (open ? toolFinderEntries(document, slideId, menuContext, onRunItem, onPickLayout) : []),
    [open, document, slideId, menuContext, onRunItem, onPickLayout],
  );
  return (
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
  );
}
