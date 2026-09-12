import { tooltipKey } from './keys.ts';
import type { MenuContext, MenuItem, Platform } from './model.ts';
import { allItems, isEnabled, itemPath, resolveLabel, tooltipDoc } from './model.ts';

/**
 * Search the menus (SPEC 2.10, 3.1 row 1; Google's tool finder, Option+/): the rows the ToolFinder
 * lists, one per menu item of the model that is not omitted, with its menu path and its key.
 * Pure, so `tool-finder.test.ts` runs in Node; ToolFinder.tsx draws the rows through the Palette
 * component and runs the chosen item's effect. Relative imports carry the `.ts` extension so the
 * parity audit script can load this module under Node.
 */
export type FinderRow = {
  /** `menu:<item id>` */
  id: string;
  item: MenuItem;
  /** the label as drawn now (Unskip slide on a skipped slide) */
  title: string;
  /** `File › Download` */
  path: string;
  /** the key as the tooltip chip reads it */
  key?: string;
  /** the tooltip sentence: the stub clause on a Later item, the disabled reason, else the doc */
  doc?: string;
  enabled: boolean;
  later: boolean;
  /** more words the filter matches */
  terms: string;
};

/** The separator between the menu titles of a path. */
export const PATH_SEPARATOR = ' › ';

/** True for an item the finder lists: drawn in a menu, or context-only (Alt text), never omitted. */
export function isFinderItem(item: MenuItem): boolean {
  if (item.status === 'omit') return false;
  /* a container that only opens a submenu is not a command */
  if (item.effect?.kind === 'submenu' && item.effect.dynamic === undefined) return false;
  return item.effect !== undefined || item.status === 'later';
}

/** Every finder row of the model in its order: the title row's controls, then the ten menus. */
export function finderRows(ctx: MenuContext): FinderRow[] {
  const platform: Platform = ctx.platform;
  const rows: FinderRow[] = [];
  const push = (item: MenuItem) => {
    if (!isFinderItem(item)) return;
    const path = itemPath(item.id);
    const title = resolveLabel(item, ctx);
    const parents = path.slice(0, -1);
    const key = tooltipKey(item.key, platform);
    const doc = tooltipDoc(item, ctx);
    rows.push({
      id: `menu:${item.id}`,
      item,
      title,
      path: parents.join(PATH_SEPARATOR),
      ...(key === undefined ? {} : { key }),
      ...(doc === undefined ? {} : { doc }),
      enabled: isEnabled(item, ctx),
      later: item.status === 'later',
      terms: `${path.join(' ')} ${item.google ?? ''}`.toLowerCase(),
    });
  };
  for (const item of allItems()) push(item);
  return rows;
}
