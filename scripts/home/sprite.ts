// The landing's glyph sprite (docs/DESIGN.md 8.0 "Icons", 8.4; DR-D4#4). D4 owns this file.
// `scripts/build-home-assets.ts --slides` calls these and writes:
// - `apps/studio/public/home/glyphs-<hash>.svg`: one `<symbol>` per glyph a band chunk draws below
//   the first screen, read from packages/chrome/src/icons.tsx (`spriteSvg` of icons.ts), listed in
//   assets.json as the `glyphs` role, requested by the first `<use>` a band draws;
// - `sprite.generated.ts`: the sprite's served path, which `live/sprite.ts` names in each `<use>`,
//   the ids of the glyphs the band chunks name (`HOME_GLYPHS`) and every name's id
//   (`HOME_GLYPH_IDS`, which the drivers read; no chunk imports it, so the bundler leaves it out);
// - `menu-glyphs.generated.ts`: each row's glyph of the miniature's menus as its index in the
//   sprite, in the order of `menusOf()` depth first (the rows of `menus.generated.ts`), which the
//   menus chunk imports on its own when it starts, so the menus chunk stays inside its 16 KB gzip.
//
// A symbol's id is `g` and the glyph's index in the sorted list (`glyphId`), so the rows' list is
// 247 small numbers (about 280 B gzip) where the names took about 800 B.
//
// The rows' glyphs are the menu model's (`MenuItem.icon`), the checked row's the editor's `check`
// and a submenu's the editor's `next` (Menu.tsx). `sparkles` and `cursor-arrow-rays` stay off the
// page (DESIGN.md 8.0): a row that names one draws no glyph.
import {
  DEFAULT_MENU_CONTEXT,
  visibleItems,
  visibleMenus,
} from '../../packages/chrome/src/menus/model.ts';
import type { MenuItem } from '../../packages/chrome/src/menus/model.ts';

import { formatPanel } from './chrome.ts';
import { iconPathsOf, spriteSvg } from './icons.ts';

/** The glyphs the page never draws (DESIGN.md 8.0 "Icons"). */
export const OFF_PAGE = new Set(['sparkles', 'cursor-arrow-rays']);

/**
 * The glyphs a band draws besides the menu rows' own: the check and the submenu mark (Menu.tsx),
 * Tailor's thumbnail moves (the model's Move slide up and down), and the Format options readout's
 * section glyphs (`formatPanel().icons`).
 */
export function bandGlyphs(): string[] {
  return ['check', 'next', 'bars-arrow-up', 'bars-arrow-down', ...formatPanel().icons];
}

/** Each row's glyph, depth first in the order `scripts/home/menus.ts` `menusOf()` writes them. */
export function menuGlyphs(): string[] {
  const out: string[] = [];
  const walk = (items: readonly MenuItem[]): void => {
    for (const item of visibleItems(items, {
      context: DEFAULT_MENU_CONTEXT,
      collapseSingles: true,
    })) {
      const icon = item.icon ?? '';
      out.push(OFF_PAGE.has(icon) ? '' : icon);
      if (item.items !== undefined) {
        const children = visibleItems(item.items, {
          context: DEFAULT_MENU_CONTEXT,
          collapseSingles: true,
        });
        if (children.length > 0) walk(item.items);
      }
    }
  };
  for (const menu of visibleMenus(DEFAULT_MENU_CONTEXT)) walk(menu.items);
  return out;
}

let names: string[] | null = null;

/** The sprite's glyph names, sorted, each one icons.tsx draws. */
export function spriteNames(): string[] {
  if (names !== null) return names;
  names = [...new Set([...menuGlyphs(), ...bandGlyphs()])].filter((n) => n !== '').sort();
  for (const name of names) {
    if (OFF_PAGE.has(name)) throw new Error(`the sprite holds ${name}, which stays off the page`);
    iconPathsOf(name);
  }
  return names;
}

/** A glyph's symbol id in the sprite: `g` and its index in `spriteNames()`. */
export function glyphId(name: string): string {
  const i = spriteNames().indexOf(name);
  if (i < 0) throw new Error(`the sprite holds no ${name}`);
  return `g${i}`;
}

/** The sprite's text. */
export function deriveSprite(): string {
  return spriteSvg(spriteNames(), (_name, i) => `g${i}`);
}

/** `sprite.generated.ts`: the served path of the sprite. */
export function deriveSpriteModule(header: string, path: string): string {
  return `${header}
//
// The landing's glyph sprite (docs/DESIGN.md 8.0 "Icons"; scripts/home/sprite.ts): every glyph a
// band chunk draws below the first screen, one \`<symbol>\` each, read from the editor's icons.tsx.
// \`live/sprite.ts\` names it in each \`<use>\`; the file is assets.json's \`glyphs\` role.

export const HOME_SPRITE = ${JSON.stringify(path)};

/** The symbol ids of the glyphs the band chunks name: the check, the submenu mark, the moves, the readout's sections. */
export const HOME_GLYPHS = ${JSON.stringify(Object.fromEntries(bandGlyphs().map((n) => [n, glyphId(n)])), null, 2)} as const;

/** Every glyph's symbol id, by its icons.tsx name (the drivers read it). */
export const HOME_GLYPH_IDS: Readonly<Record<string, string>> = ${JSON.stringify(Object.fromEntries(spriteNames().map((n) => [n, glyphId(n)])), null, 2)};
`;
}

/** `menu-glyphs.generated.ts`: the rows' glyphs in `MINI_MENUS`'s depth first order. */
export function deriveMenuGlyphsModule(header: string): string {
  return `${header}
//
// The miniature's menu rows' glyphs (docs/DESIGN.md 8.4; scripts/home/sprite.ts): for each row of
// \`MINI_MENUS\`, depth first, its glyph's index in the sprite (the symbol \`g<index>\`), -1 for a
// row that draws none. The menus chunk imports this module on its own, so the list travels apart
// from the menus.

export const MENU_GLYPHS: readonly number[] = ${JSON.stringify(menuGlyphs().map((n) => (n === '' ? -1 : spriteNames().indexOf(n))))};
`;
}
