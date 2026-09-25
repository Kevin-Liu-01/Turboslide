import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { shapePath } from '@turboslide/schema/shapes';

import { ICON_NAMES, Icon, iconPaths } from '../icons';
import type { IconName } from '../icons';

// The icon table of the vector round (docs/VECTOR.md 3.1, 3.4; the three assertions of 6.3):
// every name has paths, every name the theme sprite also draws carries the sprite's `d` strings
// (the promise of icons.tsx's header: the chrome and the sheet draw one glyph per name), and every
// drawn glyph is non empty. The one family rule (`menus.icons.one-family`) is pinned on the
// rendered markup: one `svg[viewBox="0 0 20 20"]` at 16 px per glyph, a filled or a stroked path,
// never a `<use>` and never an `<img>`.

const theme = (file: string) => new URL(`../../../theme/assets/${file}`, import.meta.url);
const spriteSvg = readFileSync(theme('sprite.svg'), 'utf8');
const spriteIds = JSON.parse(readFileSync(theme('sprite-ids.json'), 'utf8')) as string[];

/** The `d` strings of one sprite symbol, in the symbol's order. */
function spritePaths(id: string): string[] | undefined {
  const match = new RegExp(`<symbol id="${id}"[^>]*>([\\s\\S]*?)</symbol>`).exec(spriteSvg);
  if (match === null) return undefined;
  return [...(match[1] ?? '').matchAll(/\sd="([^"]+)"/g)].map((each) => each[1] ?? '');
}

const DRAWN: ReadonlyArray<IconName> = [
  'shape-rect',
  'shape-round-rect',
  'shape-ellipse',
  'line-line',
  'line-arrow',
  'line-rule',
  'line-elbow',
  'line-curved',
  'line-curve',
  'line-polyline',
  'line-scribble',
  'chart-bars',
  'chart-line',
  'word-art',
  'line-weight',
  'line-dash',
  'line-start',
  'line-end',
  'mask',
  'shadow',
];

const LINE_KINDS: ReadonlyArray<IconName> = [
  'line-line',
  'line-arrow',
  'line-rule',
  'line-elbow',
  'line-curved',
  'line-curve',
  'line-polyline',
  'line-scribble',
];

const markup = (name: IconName) => renderToStaticMarkup(createElement(Icon, { name }));

describe('the icon table', () => {
  it('has at least one path with a non empty d for every name', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(130);
    for (const name of ICON_NAMES) {
      const paths = iconPaths(name);
      expect(paths.length, name).toBeGreaterThan(0);
      for (const path of paths) expect(path.d.length, name).toBeGreaterThan(0);
    }
  });

  it('carries the sprite’s d strings for every name the theme sprite draws too', () => {
    const shared = ICON_NAMES.filter((name) => spriteIds.includes(`i-${name}`));
    expect(shared.length).toBeGreaterThan(20);
    for (const name of shared) {
      expect(
        iconPaths(name).map((path) => path.d),
        name,
      ).toEqual(spritePaths(`i-${name}`));
    }
    /* none of the round’s names is drawn by the sheet, so the sprite gains nothing (VECTOR.md 3.4) */
    for (const name of DRAWN) expect(spriteIds, name).not.toContain(`i-${name}`);
    for (const name of ['arrow-long-right', 'chat-bubble-left', 'chart-pie'] as const)
      expect(spriteIds, name).not.toContain(`i-${name}`);
  });

  it('draws every drawn glyph from a non empty path, the shapes from shapePath at 16 by 12', () => {
    for (const name of DRAWN)
      for (const path of iconPaths(name)) expect(path.d.trim().length, name).toBeGreaterThan(0);
    expect(iconPaths('shape-rect')[0]?.d).toBe(shapePath('rect', 16, 12));
    expect(iconPaths('shape-round-rect')[0]?.d).toBe(shapePath('roundRect', 16, 12));
    expect(iconPaths('shape-ellipse')[0]?.d).toBe(shapePath('ellipse', 16, 12));
    for (const name of ['shape-rect', 'shape-round-rect', 'shape-ellipse'] as const)
      expect(iconPaths(name)[0]?.translate).toEqual([2, 4]);
    const shapes = new Set(
      (['shape-rect', 'shape-round-rect', 'shape-ellipse'] as const).map(
        (name) => iconPaths(name)[0]?.d,
      ),
    );
    expect(shapes.size).toBe(3);
    /* the eight line kinds are eight distinct stroked paths */
    const lines = LINE_KINDS.map((name) => iconPaths(name).find((path) => path.stroke === true));
    for (const [i, path] of lines.entries()) expect(path, LINE_KINDS[i]).toBeDefined();
    expect(new Set(lines.map((path) => path?.d)).size).toBe(LINE_KINDS.length);
    /* the arrow kinds carry a filled head beside the stroked line */
    for (const name of ['line-arrow', 'line-start', 'line-end'] as const) {
      expect(iconPaths(name).filter((path) => path.stroke === undefined)).toHaveLength(1);
    }
    /* the weights and the dash */
    expect(iconPaths('line-weight').map((path) => path.width)).toEqual([1, 2, 3]);
    expect(iconPaths('line-dash')[0]?.dash).toBe('3 2');
    expect(iconPaths('word-art')[0]?.width).toBe(2);
  });

  it('renders one family: an svg on the 20 grid at 16 px with filled or stroked paths, no use and no img', () => {
    for (const name of ICON_NAMES) {
      const html = markup(name);
      expect(html.startsWith('<svg viewBox="0 0 20 20" width="16" height="16"'), name).toBe(true);
      expect(html, name).not.toContain('<use');
      expect(html, name).not.toContain('<img');
      expect((html.match(/<path /g) ?? []).length, name).toBe(iconPaths(name).length);
    }
    const line = markup('line-line');
    expect(line).toContain('fill="none"');
    expect(line).toContain('stroke="currentColor"');
    expect(line).toContain('stroke-width="1.5"');
    expect(line).toContain('stroke-linecap="round"');
    const dash = markup('line-dash');
    expect(dash).toContain('stroke-dasharray="3 2"');
    const rect = markup('shape-rect');
    expect(rect).toContain('transform="translate(2 4)"');
    expect(rect).not.toContain('stroke=');
    const weight = markup('line-weight');
    expect(weight).toContain('stroke-width="1"');
    expect(weight).toContain('stroke-width="3"');
    /* a Heroicon renders as before: a filled path, evenodd where the source says so */
    const chat = markup('chat-bubble-left');
    expect(chat).toContain('fill-rule="evenodd"');
    expect(chat).not.toContain('stroke=');
  });
});
