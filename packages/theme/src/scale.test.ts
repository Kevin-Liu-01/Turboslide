// The design round's parity test (docs/DESIGN.md 2.2, 3.1, 6.1): packages/chrome/src/tokens.css
// is parsed and every number scale.ts states as data is asserted against the CSS, the pattern of
// tokens.test.ts over sheet.css.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { customProperties, declarationsOf, parseCss } from './css.ts';
import type { CssRule } from './css.ts';
import {
  LAYERS,
  LAYER_NAMES,
  LOCAL_Z_LIMIT,
  RADII,
  RADIUS_TOKENS,
  SCROLLBAR,
  isLayerName,
  layerProperty,
  thumbWidth,
} from './scale.ts';

const tokensCss = readFileSync(new URL('../../chrome/src/tokens.css', import.meta.url), 'utf8');
const rules = parseCss(tokensCss);
/** The rules outside every at-rule: the values the page reads when no media query applies. */
const plain: CssRule[] = rules.filter((rule) => rule.media === undefined);
const root = customProperties(plain, ':root');
const darkRoot = customProperties(plain, ":root[data-theme='dark']");

const SCROLL_MEDIA = '@media (hover: hover) and (pointer: fine) and (forced-colors: none)';
const inScrollMedia = rules.filter((rule) => rule.media === SCROLL_MEDIA);

describe('LAYERS agree with tokens.css', () => {
  it('declares one --ts-layer-<name> on :root per layer, with the scale value', () => {
    for (const name of LAYER_NAMES)
      expect(root[layerProperty(name).slice(2)], layerProperty(name)).toBe(String(LAYERS[name]));
    const declared = Object.keys(root).filter((key) => key.startsWith('ts-layer-'));
    expect(declared.sort()).toEqual(LAYER_NAMES.map((name) => `ts-layer-${name}`).sort());
  });

  it('orders the ten layers bottom to top with distinct values, the stage alone under the local limit', () => {
    expect(LAYER_NAMES).toEqual([
      'stage',
      'docked',
      'bar',
      'show',
      'dialog',
      'popover',
      'toast',
      'tooltip',
      'preview',
      'skip',
    ]);
    const values = LAYER_NAMES.map((name) => LAYERS[name]);
    expect(new Set(values).size).toBe(values.length);
    for (let i = 1; i < values.length; i += 1)
      expect(values[i]).toBeGreaterThan(values[i - 1] ?? 0);
    expect(LAYERS.stage).toBeLessThan(LOCAL_Z_LIMIT);
    for (const name of LAYER_NAMES.filter((each) => each !== 'stage'))
      expect(LAYERS[name], name).toBeGreaterThanOrEqual(LOCAL_Z_LIMIT);
    expect(isLayerName('popover')).toBe(true);
    expect(isLayerName('modal')).toBe(false);
    expect(Object.isFrozen(LAYERS)).toBe(true);
  });

  it('keeps the reasons of DESIGN.md 2.2: popover over dialog, toast over both, tooltip over toast, show under dialog, bar under show', () => {
    expect(LAYERS.popover).toBeGreaterThan(LAYERS.dialog);
    expect(LAYERS.toast).toBeGreaterThan(LAYERS.popover);
    expect(LAYERS.tooltip).toBeGreaterThan(LAYERS.toast);
    expect(LAYERS.show).toBeLessThan(LAYERS.dialog);
    expect(LAYERS.bar).toBeLessThan(LAYERS.show);
  });
});

describe('RADII agree with tokens.css', () => {
  it('declares the three rungs with tokens, in px', () => {
    expect(root[RADIUS_TOKENS.chip.slice(2)]).toBe(`${RADII.chip}px`);
    expect(root[RADIUS_TOKENS.control.slice(2)]).toBe(`${RADII.control}px`);
    expect(root[RADIUS_TOKENS.window.slice(2)]).toBe(`${RADII.window}px`);
    expect(RADII.square).toBe(0);
    expect(RADII.round).toBe('50%');
    expect(RADII.chip).toBeLessThan(RADII.control);
    expect(RADII.control).toBeLessThan(RADII.window);
  });

  it('draws the shared plate classes on the ladder with the edge frame and the ring', () => {
    const float = declarationsOf(plain, '.pt-float');
    expect(float['border-radius']).toBe('var(--pt-radius)');
    expect(float.border).toBe('1px solid var(--pt-edge)');
    expect(float['box-shadow']).toBe('var(--pt-ring)');
    const window = declarationsOf(plain, '.pt-window');
    expect(window['border-radius']).toBe('var(--pt-radius-lg)');
    expect(window.border).toBe('1px solid var(--pt-edge)');
    expect(window['box-shadow']).toBe('var(--pt-ring)');
    expect(declarationsOf(plain, '.pt-kbd')['border-radius']).toBe('var(--pt-radius-sm)');
    /* the ring has no blur and no offset: two spreads of 1 and 2 px */
    expect(root['pt-ring']).toBe('0 0 0 1px var(--pt-paper), 0 0 0 2px var(--pt-hair-soft)');
    expect(declarationsOf(plain, '.pt-ib')['border-radius']).toBe('var(--pt-radius)');
    expect(declarationsOf(plain, '.pt-select')['border-radius']).toBe('var(--pt-radius)');
  });

  it('resets the browser popover styles at zero specificity', () => {
    const reset = declarationsOf(plain, ':where([popover])');
    expect(reset).toMatchObject({
      inset: 'auto',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'none',
      color: 'inherit',
      overflow: 'visible',
    });
  });
});

describe('the numerals token', () => {
  it('declares --pt-numerals and the .pt-num class over it, with the slashed zero on codes', () => {
    expect(root['pt-numerals']).toBe('tabular-nums');
    expect(declarationsOf(plain, '.pt-num')['font-variant-numeric']).toBe('var(--pt-numerals)');
    expect(declarationsOf(plain, ".pt-num[data-num='code']")['font-variant-numeric']).toBe(
      'tabular-nums slashed-zero',
    );
    expect(declarationsOf(plain, '.pt-kbd')['font-variant-numeric']).toBe('var(--pt-numerals)');
  });
});

describe('SCROLLBAR agrees with tokens.css', () => {
  it('declares the gutter, the two insets and the shortest thumb in px', () => {
    expect(root['pt-scroll-w']).toBe(`${SCROLLBAR.gutter}px`);
    expect(root['pt-scroll-inset']).toBe(`${SCROLLBAR.inset}px`);
    expect(root['pt-scroll-inset-on']).toBe(`${SCROLLBAR.insetOn}px`);
    expect(root['pt-scroll-min']).toBe(`${SCROLLBAR.min}px`);
    expect(thumbWidth('rest')).toBe(4);
    expect(thumbWidth('pointer')).toBe(6);
  });

  it('draws the thumb in ink at the scale alpha in both appearances', () => {
    expect(root['pt-thumb']).toBe(`rgba(7, 7, 7, ${SCROLLBAR.thumbAlpha})`);
    expect(darkRoot['pt-thumb']).toBe(`rgba(242, 242, 240, ${SCROLLBAR.thumbAlpha})`);
  });

  it('applies to every scroller on a fine pointer, with the thumb on the tokens', () => {
    const bar = declarationsOf(inScrollMedia, '::-webkit-scrollbar');
    expect(bar.width).toBe('var(--pt-scroll-w)');
    expect(bar.height).toBe('var(--pt-scroll-w)');
    const thumb = declarationsOf(inScrollMedia, '::-webkit-scrollbar-thumb');
    expect(thumb.border).toBe('var(--pt-scroll-inset) solid transparent');
    expect(thumb['border-radius']).toBe('var(--pt-radius-sm)');
    expect(thumb['min-height']).toBe('var(--pt-scroll-min)');
    expect(thumb['background-clip']).toBe('padding-box');
    expect(declarationsOf(inScrollMedia, '::-webkit-scrollbar-thumb:hover')['border-width']).toBe(
      'var(--pt-scroll-inset-on)',
    );
    expect(declarationsOf(inScrollMedia, '::-webkit-scrollbar-button').display).toBe('none');
  });

  it('gates Firefox on the thumb pseudo-element and sets scrollbar-color nowhere else', () => {
    const firefox = rules.filter(
      (rule) => rule.media === '@supports not selector(::-webkit-scrollbar-thumb)',
    );
    expect(declarationsOf(firefox, ':root')['scrollbar-color']).toBe('var(--pt-thumb) transparent');
    expect(declarationsOf(firefox, '*')['scrollbar-width']).toBe('thin');
    const outside = rules.filter(
      (rule) =>
        rule.media !== '@supports not selector(::-webkit-scrollbar-thumb)' &&
        ('scrollbar-color' in rule.declarations || 'scrollbar-width' in rule.declarations),
    );
    expect(outside.map((rule) => rule.selector)).toEqual([]);
    expect(declarationsOf(plain, '.pt-scroll')).toMatchObject({
      'overflow-y': 'auto',
      'scrollbar-gutter': 'stable',
    });
    expect(customProperties(plain, '.pt-on-ink')['pt-thumb']).toBe('rgba(255, 255, 255, 0.44)');
  });
});
