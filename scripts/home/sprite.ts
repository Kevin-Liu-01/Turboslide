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

import { DIAGRAM_WORDS } from '../../apps/studio/src/components/home/design-copy.ts';

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

// ---------------------------------------------------------------------------------------------
// The line diagrams (docs/DESIGN.md 8.0 "Diagrams"): the B2a sources (b5921633:
// apps/studio/src/components/home/diagrams/Present.tsx and Export.tsx) restyled and written as
// symbols of the sprite, which the bands draw by one `<use>`, so they cost no script: 1 px strokes
// (non-scaling) in --pt-hair and --pt-edge, fills --pt-plate, 11 unit square markers in ink at a
// flow's end and no arrowheads, labels at 20 units in --pt-ink-2 in the page's face (inherited
// through the `<use>`), the window boxes at the 8 px corner, both appearances from the tokens.

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const STROKE = 'fill:none;vector-effect:non-scaling-stroke;stroke-width:1px;stroke:';
const box = (x: number, y: number, w: number, h: number, kind: 'edge' | 'hair' | 'plate', rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx > 0 ? ` rx="${rx}"` : ''} style="${
    kind === 'plate' ? 'fill:var(--pt-plate)' : `${STROKE}var(--pt-${kind})`
  }"/>`;
const line = (points: string, kind: 'edge' | 'hair' = 'edge') =>
  `<polyline points="${points}" style="${STROKE}var(--pt-${kind})"/>`;
const marker = (x: number, y: number) =>
  `<rect x="${x - 5.5}" y="${y - 5.5}" width="11" height="11" style="fill:var(--pt-ink)"/>`;
const label = (x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'start') =>
  `<text x="${x}" y="${y}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`} style="fill:var(--pt-ink-2);font-size:20px">${esc(text)}</text>`;

/** The diagrams' viewBoxes, which the bands' `<svg>`s repeat. */
export const DIAGRAM_VIEWBOX = {
  present: '0 0 612 400',
  export: '0 0 612 300',
  agents: '0 0 612 230',
} as const;

/** The Present band's flow: the editor to presenter view (the S key) and to a phone's show (the link). */
function presentDiagram(): string {
  const d = DIAGRAM_WORDS.present;
  return [
    box(20, 180, 260, 180, 'edge', 8),
    line('20,200 280,200', 'hair'),
    box(32, 212, 44, 26, 'hair'),
    box(32, 248, 44, 26, 'hair'),
    box(32, 284, 44, 26, 'hair'),
    box(96, 212, 168, 96, 'plate'),
    label(20, 389, d.editor),
    box(340, 20, 252, 180, 'edge', 8),
    line('340,40 592,40', 'hair'),
    box(352, 52, 80, 48, 'hair'),
    label(392, 83, d.timer, 'middle'),
    box(444, 52, 136, 76, 'plate'),
    label(512, 97, d.next, 'middle'),
    box(352, 140, 228, 48, 'hair'),
    label(466, 171, d.notes, 'middle'),
    label(340, 229, d.presenter),
    box(520, 252, 72, 120, 'edge', 8),
    box(528, 264, 56, 96, 'hair'),
    box(532, 298, 48, 27, 'plate'),
    label(520, 396, d.show),
    line('280,250 310,250 310,110 340,110'),
    marker(340, 110),
    label(322, 170, d.key),
    line('280,320 520,320'),
    marker(520, 320),
    label(400, 302, d.link, 'middle'),
  ].join('');
}

/** The export band's flow: one slide forking to pitch.pdf and pitch.pptx. */
function exportDiagram(): string {
  const d = DIAGRAM_WORDS.export;
  return [
    box(20, 80, 240, 135, 'edge', 8),
    line('44,108 200,108', 'hair'),
    line('44,124 150,124', 'hair'),
    box(44, 144, 192, 52, 'plate'),
    label(20, 244, d.slide),
    line('260,148 340,148'),
    line('340,68 340,208'),
    line('340,68 380,68'),
    marker(380, 68),
    line('340,208 380,208'),
    marker(380, 208),
    box(380, 20, 96, 96, 'edge', 8),
    box(392, 68, 48, 36, 'plate'),
    label(380, 145, d.pdf),
    box(380, 160, 96, 96, 'edge', 8),
    box(392, 208, 48, 36, 'plate'),
    label(380, 285, d.pptx),
  ].join('');
}

/**
 * The agents band's flow (DESIGN.md 8.0 "Diagrams", 8.8; the B2a source `Agents.tsx` with the
 * deck's Version history beside its slide): the CLI, the MCP server and the HTTP API each draw a
 * line into one action, and one line goes from the action to the deck, whose window holds the
 * slide and Version history's rows.
 */
function agentsDiagram(): string {
  const d = DIAGRAM_WORDS.agents;
  const ins = [
    [d.cli, 60],
    [d.mcp, 110],
    [d.http, 160],
  ] as const;
  return [
    ...ins.flatMap(([word, y]) => [label(20, y + 7, word), line(`92,${y} 200,${y}`), marker(200, y)]),
    box(200, 36, 120, 148, 'edge'),
    line('212,80 308,80', 'hair'),
    line('212,110 308,110', 'hair'),
    line('212,140 308,140', 'hair'),
    label(260, 212, d.action, 'middle'),
    line('320,110 380,110'),
    marker(380, 110),
    box(380, 36, 212, 148, 'edge', 8),
    line('380,56 592,56', 'hair'),
    box(392, 68, 124, 70, 'plate'),
    line('528,56 528,184', 'hair'),
    line('536,84 584,84', 'hair'),
    line('536,112 584,112', 'hair'),
    line('536,140 584,140', 'hair'),
    label(380, 212, d.deck),
    label(592, 212, d.history, 'end'),
  ].join('');
}

/** The diagrams as symbols: `d-present`, `d-export` and `d-agents`. */
export function diagramSymbols(): string {
  return [
    `<symbol id="d-present" viewBox="${DIAGRAM_VIEWBOX.present}">${presentDiagram()}</symbol>`,
    `<symbol id="d-export" viewBox="${DIAGRAM_VIEWBOX.export}">${exportDiagram()}</symbol>`,
    `<symbol id="d-agents" viewBox="${DIAGRAM_VIEWBOX.agents}">${agentsDiagram()}</symbol>`,
  ].join('');
}

/** The sprite's text: the glyphs, then the diagrams. */
export function deriveSprite(): string {
  return spriteSvg(spriteNames(), (_name, i) => `g${i}`).replace(
    '</svg>\n',
    `${diagramSymbols()}</svg>\n`,
  );
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
