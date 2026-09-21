import { tooltipKey } from './keys.ts';
import type { MenuContext, MenuItem, Platform } from './model.ts';
import { allItems, isEnabled, isPresent, itemPath, resolveLabel, tooltipDoc } from './model.ts';

/**
 * Search the menus (SPEC 2.10, 3.1 row 1; Google's tool finder, Option+/): the rows the ToolFinder
 * lists, one per menu item of the model that is not omitted, with its menu path and its key.
 * Pure, so `tool-finder.test.ts` runs in Node; ToolFinder.tsx draws the rows through the Palette
 * component and runs the chosen item's effect. Relative imports carry the `.ts` extension so the
 * parity audit script can load this module under Node.
 *
 * The product round (docs/PRODUCT.md 6.1 "Search the menus"; audit-assist 8): a row's words are
 * its menu path, Google's label, its doc sentence and the seller's words of `SELLER_TERMS`, so
 * "hide slide" lists Skip slide, "rename the customer" lists Find and replace and Tailor for a
 * customer, "logo" lists Replace image, and "bigger text" lists Increase font size. A row may
 * also carry its own `terms` array when the model gives it one.
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

/**
 * The seller's words per row id (docs/PRODUCT.md 6.1): what the seller audit typed and got
 * "Nothing matches" for, in the seller's vocabulary, never the product's internal nouns.
 */
export const SELLER_TERMS: Readonly<Record<string, ReadonlyArray<string>>> = {
  'slide.skipSlide': ['hide', 'hide slide', 'skip', 'leave out'],
  'edit.findReplace': [
    'rename',
    'customer',
    'name',
    'rename the customer',
    'change the customer name',
    'swap words',
  ],
  'tools.tailor': ['tailor', 'customer', 'prospect', 'rename the customer', 'logo', 'personalize'],
  'tools.assist': [
    'assistant',
    'ask',
    'help me write',
    'shorter',
    'summarize',
    'speaker notes',
    'talk track',
  ],
  'title.assist': [
    'assistant',
    'ask',
    'help me write',
    'shorter',
    'summarize',
    'speaker notes',
    'talk track',
  ],
  'format.text.size.increase': ['bigger', 'larger text', 'bigger text', 'larger'],
  'format.text.size.decrease': ['smaller', 'smaller text'],
  'view.showSpeakerNotes': ['talk track', 'notes', 'speaker notes', 'what to say'],
  'format.image.replaceImage': ['logo', 'picture', 'swap', 'swap the logo', 'replace the logo'],
  'format.image.replaceImage.upload': ['logo', 'picture', 'swap', 'upload'],
  'insert.image.upload': ['logo', 'picture', 'photo', 'upload'],
  'file.download.pdf': ['send', 'pdf', 'send a pdf', 'email', 'attach'],
  'file.download.pptx': ['powerpoint', 'send', 'export'],
  'title.share': ['send', 'link', 'share a link', 'invite'],
  'file.share': ['send', 'link', 'share a link', 'invite'],
  'title.slideshow': ['present', 'play', 'full screen', 'show'],
  'slide.newSlide': ['add a slide', 'new page'],
  'slide.duplicateSlide': ['copy slide', 'clone'],
  'slide.deleteSlide': ['remove slide'],
  'file.rename': ['rename', 'name', 'title'],
  'file.moveToTrash': ['delete', 'remove', 'trash'],
  'insert.textBox': ['text', 'add text', 'write'],
  'insert.link': ['link', 'url', 'web address'],
  'file.print': ['print', 'paper'],
};

/** True for an item the finder lists: drawn in a menu, or context-only (Alt text), never omitted. */
export function isFinderItem(item: MenuItem): boolean {
  if (item.status === 'omit') return false;
  /* a container that only opens a submenu is not a command */
  if (item.effect?.kind === 'submenu' && item.effect.dynamic === undefined) return false;
  return item.effect !== undefined || item.status === 'later';
}

/** The seller's words of a row: the table's, and the item's own `terms` when the model carries one. */
export function sellerTermsOf(item: MenuItem): string[] {
  const own = (item as { terms?: unknown }).terms;
  const list = Array.isArray(own)
    ? own.filter((word): word is string => typeof word === 'string')
    : [];
  return [...(SELLER_TERMS[item.id] ?? []), ...list];
}

/**
 * Every finder row of the model in its order: the title row's controls, then the ten menus. A row
 * the context does not draw (a role's row, a parked row or a Later row while Tools > Advanced
 * tools is off; docs/FOCUS.md 3.1) is not listed, the same `isPresent` the menus read.
 */
export function finderRows(ctx: MenuContext): FinderRow[] {
  const platform: Platform = ctx.platform;
  const rows: FinderRow[] = [];
  const push = (item: MenuItem) => {
    if (!isFinderItem(item) || !isPresent(item, ctx)) return;
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
      terms: [
        ...path,
        item.google ?? '',
        item.status === 'later' ? '' : (item.doc ?? ''),
        ...sellerTermsOf(item),
      ]
        .join(' ')
        .toLowerCase(),
    });
  };
  for (const item of allItems()) push(item);
  return rows;
}
