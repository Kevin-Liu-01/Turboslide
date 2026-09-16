// The theme override stylesheet (gslides-parity SPEC-5 9.1, 9.4; R03 4.6, 4.9; MILESTONES-5 B6
// day 1): an empty record emits an empty sheet, every group of the record emits its rule under
// the sheet root scope, the derived tokens follow an edited ink, and the frame markup the theme
// package states is the one the stage emits.
import type { Deck, ThemeEdits } from '@turboslide/schema/deck';
import { THEME_TYPE_LEVELS } from '@turboslide/schema/deck';
import { FONT_IDS } from '@turboslide/schema/fonts';
import { parseCss } from '@turboslide/theme/css';
import {
  FRAME_VARIABLES,
  GT_FRAME_HTML,
  PLATE_FRAME_HTML,
  stageFrame,
} from '@turboslide/theme/themes';
import { describe, expect, it } from 'vitest';
import { FRAME_HTML } from './stage.ts';
import {
  THEME_CSS_SCOPE,
  THEME_CSS_STYLE_ID,
  fontStack,
  hasThemeEdits,
  themeCss,
  themeCssScope,
} from './theme-css.ts';

function deck(themeEdits?: ThemeEdits): Pick<Deck, 'id' | 'themeEdits' | 'theme'> {
  return themeEdits === undefined
    ? { id: 'acme', theme: 'gt-ink-paper' }
    : { id: 'acme', theme: 'gt-ink-paper', themeEdits };
}

const LIGHT = `${THEME_CSS_SCOPE}:not([data-theme='dark'])`;
const DARK = `${THEME_CSS_SCOPE}[data-theme='dark']`;

const FULL: ThemeEdits = {
  name: 'Acme sales 2026',
  colors: {
    light: {
      ink: '#101010',
      ok: '#0a8a60',
      warn: '#d08a10',
      no: '#c03030',
      info: '#1040c0',
      raised: '#181818',
      link: '#1040c0',
    },
    dark: { paper: '#000000', hair: '#4d4d4d' },
  },
  fonts: { display: 'playfair-display', text: 'roboto', mono: 'jetbrains-mono' },
  frame: { rails: false, rules: false, crosses: false, inset: 64 },
  mark: { kind: 'picture', assetId: 'acme-mark', box: [72, 846, 36, 36] },
  counter: { show: true, side: 'left', format: 'n', box: [72, 856, 60, 22] },
  chips: { show: false },
  type: { levels: { h1: { size: 80, weight: 600, tracking: -0.02 }, body: { size: 24 } } },
  background: { color: 'plate' },
};

describe('themeCss', () => {
  it('emits nothing for a deck without edits, an empty record or a name alone', () => {
    expect(themeCss(deck())).toBe('');
    expect(themeCss(deck({}))).toBe('');
    expect(themeCss(deck({ name: 'Acme' }))).toBe('');
    expect(themeCss(deck({ background: { color: 'plate' } }))).toBe('');
    expect(hasThemeEdits(deck())).toBe(false);
    expect(hasThemeEdits(deck({ name: 'Acme' }))).toBe(false);
    expect(hasThemeEdits(deck({ chips: { show: false } }))).toBe(true);
  });

  it('scopes every rule to the sheet root with the base tile opt out', () => {
    expect(themeCssScope()).toBe('.ts-sheet:not([data-theme-base])');
    expect(THEME_CSS_STYLE_ID).toBe('ts-theme-css');
    const rules = parseCss(themeCss(deck(FULL)));
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) {
      expect(rule.selector.startsWith(THEME_CSS_SCOPE), rule.selector).toBe(true);
      expect(Object.keys(rule.declarations).length, rule.selector).toBeGreaterThan(0);
    }
  });

  it('writes a light ink under the light selector and recomputes the derived tokens from it', () => {
    const css = themeCss(deck({ colors: { light: { ink: '#101010' } } }));
    const rules = parseCss(css);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe(LIGHT);
    expect(rules[0]?.declarations).toEqual({
      '--ink': '#101010',
      '--hair': 'rgba(16, 16, 16, 0.18)',
      '--hair-soft': 'rgba(16, 16, 16, 0.09)',
      '--cross': 'rgba(16, 16, 16, 0.38)',
      '--edge': 'rgba(16, 16, 16, 0.62)',
      '--thumb': 'rgba(16, 16, 16, 0.32)',
    });
    expect(css).not.toContain(DARK);
  });

  it('keeps a pinned derived token and writes a dark edit under the dark selector alone', () => {
    const rules = parseCss(
      themeCss(deck({ colors: { dark: { ink: '#e0e0e0', hair: '#4d4d4d' } } })),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe(DARK);
    expect(rules[0]?.declarations['--hair']).toBe('#4d4d4d');
    expect(rules[0]?.declarations['--edge']).toBe('rgba(224, 224, 224, 0.55)');
    expect(rules[0]?.declarations['--ink']).toBe('#e0e0e0');
    expect(Object.keys(rules[0]?.declarations ?? {})).not.toContain('--paper');
  });

  it('writes the semantic hues on the icons, the raised panel and the link colour', () => {
    const css = themeCss(
      deck({ colors: { light: { ok: '#0a8a60', raised: '#181818', link: '#1040c0' } } }),
    );
    const rules = parseCss(css);
    expect(rules.map((rule) => rule.selector)).toEqual([
      `${LIGHT} .ic.ok`,
      `${LIGHT} .panel`,
      `${LIGHT} .slide a`,
    ]);
    expect(rules[0]?.declarations.color).toBe('#0a8a60');
    expect(rules[1]?.declarations.background).toBe('#181818');
    expect(rules[2]?.declarations.color).toBe('#1040c0');
    expect(css).not.toContain('--ok');
  });

  it('writes the font roles as the sheet stacks', () => {
    const rules = parseCss(
      themeCss(deck({ fonts: { display: 'playfair-display', text: 'roboto' } })),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe(THEME_CSS_SCOPE);
    expect(rules[0]?.declarations['--display']).toBe(
      "'Playfair Display', Georgia, 'Times New Roman', serif",
    );
    expect(rules[0]?.declarations['--text']).toBe("'Roboto', 'Helvetica Neue', Arial, sans-serif");
    for (const id of FONT_IDS) expect(fontStack(id).startsWith("'"), id).toBe(true);
    expect(fontStack('jetbrains-mono')).toContain('monospace');
    expect(fontStack('inter')).toBe("'Inter', 'Helvetica Neue', Arial, sans-serif");
  });

  it('moves the rails through the frame variables and hides what the record turns off', () => {
    const rules = parseCss(themeCss(deck({ frame: { inset: 64, rails: false, crosses: false } })));
    const root = rules.find((rule) => rule.selector === THEME_CSS_SCOPE);
    expect(root?.declarations).toEqual({ '--rail': '64px', '--cross-offset': '59px' });
    expect(rules.map((rule) => rule.selector)).toContain(`${THEME_CSS_SCOPE} .frame::before`);
    expect(rules.map((rule) => rule.selector)).toContain(`${THEME_CSS_SCOPE} .frame::after`);
    expect(rules.map((rule) => rule.selector)).toContain(`${THEME_CSS_SCOPE} .frame .cross`);
    expect(rules.map((rule) => rule.selector)).not.toContain(`${THEME_CSS_SCOPE} .frame .rule`);
    for (const name of ['--rail', '--cross-offset'] as const)
      expect(FRAME_VARIABLES).toContain(name);
  });

  it('empties or moves the corner slot', () => {
    expect(parseCss(themeCss(deck({ mark: { kind: 'none' } })))).toEqual([
      { selector: `${THEME_CSS_SCOPE} .wordmark`, declarations: { display: 'none' } },
    ]);
    const rules = parseCss(themeCss(deck({ mark: { kind: 'gt', box: [72, 846, 36, 36] } })));
    const root = rules.find((rule) => rule.selector === THEME_CSS_SCOPE);
    expect(root?.declarations).toEqual({
      '--mark-left': '72px',
      '--mark-bottom': 'calc(var(--ts-sheet-h, 900px) - 882px)',
      '--mark-height': '36px',
    });
    expect(
      rules.find((rule) => rule.selector === `${THEME_CSS_SCOPE} .wordmark`)?.declarations,
    ).toEqual({
      width: '36px',
    });
    expect(rules.some((rule) => rule.selector === `${THEME_CSS_SCOPE} .wordmark svg`)).toBe(true);
  });

  it('hides, sides and moves the counter', () => {
    expect(parseCss(themeCss(deck({ counter: { show: false } })))).toEqual([
      { selector: `${THEME_CSS_SCOPE} .counter`, declarations: { display: 'none' } },
    ]);
    const left = parseCss(themeCss(deck({ counter: { side: 'left', box: [72, 856, 60, 22] } })));
    expect(left.find((rule) => rule.selector === THEME_CSS_SCOPE)?.declarations).toEqual({
      '--counter-inset': '72px',
      '--counter-bottom': 'calc(var(--ts-sheet-h, 900px) - 878px)',
    });
    expect(
      left.find((rule) => rule.selector === `${THEME_CSS_SCOPE} .counter`)?.declarations,
    ).toEqual({
      right: 'auto',
      left: 'var(--counter-inset)',
      'text-align': 'left',
      width: '60px',
    });
    const right = parseCss(themeCss(deck({ counter: { box: [1468, 856, 60, 22] } })));
    expect(
      right.find((rule) => rule.selector === THEME_CSS_SCOPE)?.declarations['--counter-inset'],
    ).toBe('calc(var(--ts-sheet-w, 1600px) - 1528px)');
  });

  it('hides the chips and writes the type levels on their sheet selectors', () => {
    expect(parseCss(themeCss(deck({ chips: { show: false } })))).toEqual([
      { selector: `${THEME_CSS_SCOPE} .ts-chips`, declarations: { display: 'none' } },
    ]);
    const rules = parseCss(
      themeCss(
        deck({
          type: {
            levels: {
              h1: { size: 80, weight: 600, tracking: -0.02 },
              body: { size: 24 },
              small: {},
            },
          },
        }),
      ),
    );
    expect(rules).toEqual([
      {
        selector: `${THEME_CSS_SCOPE} h1`,
        declarations: { 'font-size': '80px', 'font-weight': '600', 'letter-spacing': '-0.02em' },
      },
      { selector: `${THEME_CSS_SCOPE} p`, declarations: { 'font-size': '24px' } },
    ]);
    expect(THEME_TYPE_LEVELS).toContain('small');
  });

  it('emits every group of a full record in a fixed order', () => {
    const css = themeCss(deck(FULL));
    const selectors = parseCss(css).map((rule) => rule.selector);
    expect(selectors[0]).toBe(LIGHT);
    expect(selectors).toContain(DARK);
    expect(selectors.indexOf(DARK)).toBeGreaterThan(selectors.lastIndexOf(`${LIGHT} .slide a`));
    expect(selectors).toContain(THEME_CSS_SCOPE);
    expect(selectors).toContain(`${THEME_CSS_SCOPE} .ts-chips`);
    expect(selectors[selectors.length - 1]).toBe(`${THEME_CSS_SCOPE} p`);
    expect(css).toBe(themeCss(deck(FULL)));
    expect(css).not.toContain('Acme');
  });
});

describe('the stage frame', () => {
  it('is the markup the theme package states, so the stage can read stageFrame(deck.theme)', () => {
    expect(GT_FRAME_HTML).toBe(FRAME_HTML);
    expect(stageFrame('gt-ink-paper')).toBe(FRAME_HTML);
    // the Plate frame (SPEC-5 9.3, day 6): the bottom rule alone inside `.frame`, the left rail
    // the element's ::before, no crosses; the same class grammar so sheet.css's rules apply
    expect(stageFrame('ts-plate')).toBe(PLATE_FRAME_HTML);
    expect(PLATE_FRAME_HTML).toBe('<div class="frame"><div class="rule bottom"></div></div>');
  });
});
