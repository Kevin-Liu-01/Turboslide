// The brand kit's override stylesheet (docs/PRODUCT.md 4.1, 8.3; ported from round five's test
// and re pointed at `deck.brand`): an empty record emits an empty sheet, each role redefines its
// token under the appearance's selector, the derived tokens follow an edited text colour, the
// slots draw the default, none and a picture (stage.ts frameBandOf and slide.ts titleMarkSlot),
// and every rule is scoped to the sheet root.
import type { BrandKit, DefaultKit } from '@turboslide/schema/brand';
import { defaultKitOf, DEFAULT_APPEARANCE } from '@turboslide/schema/brand';
import type { Deck, TitleSlide } from '@turboslide/schema/deck';
import { parseCss } from '@turboslide/theme/css';
import { describe, expect, it } from 'vitest';
import { renderSlide } from './slide.ts';
import { kitStyle } from './slide.ts';
import { counterText, frameBandHtml, frameBandOf, GT_BAND, WORDMARK_HTML } from './stage.ts';
import {
  THEME_CSS_CLASS,
  THEME_CSS_SCOPE,
  THEME_CSS_STYLE_ID,
  displayFeatures,
  fontStack,
  hasKitOverrides,
  kitDrawsFooter,
  themeCss,
} from './theme-css.ts';
import { fontVariablesRule } from './fonts.ts';
import { fontFamilyStack } from '@turboslide/fonts/summary';
import { typographyDeclarations } from '@turboslide/schema/typography';
import { DISPLAY } from '@turboslide/theme/tokens';

const LIGHT = `${THEME_CSS_SCOPE}:not([data-theme='dark'])`;
const DARK = `${THEME_CSS_SCOPE}[data-theme='dark']`;

function deck(brand?: BrandKit): Deck {
  return {
    schemaVersion: 1,
    id: 'acme',
    title: 'Acme',
    theme: 'gt-ink-paper',
    sections: [{ id: 'deck', name: 'Deck', slideIds: ['title'] }],
    assets: {
      'acme-mark': {
        id: 'acme-mark',
        role: 'logo',
        alt: 'The Acme mark',
        twins: { neutral: 'assets/acme-mark.png' },
        size: [400, 200],
        scale: 1,
        source: { kind: 'file' },
        inline: 'pass-through',
      },
    },
    revision: 3,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    ...(brand === undefined ? {} : { brand }),
  };
}

const title: TitleSlide = {
  schemaVersion: 1,
  id: 'title',
  kind: 'title',
  mark: { w: 132, h: 84 },
  heading: 'Acme',
  lead: 'A pitch',
};

const FULL: BrandKit = {
  name: 'Acme',
  appearance: 'dark',
  colors: {
    light: { text: '#101010', primary: '#0b3d91', background: '#f4f1ea' },
    dark: { background: '#000000', hint: '#9a9a9a' },
  },
  fonts: { display: 'playfair-display', text: 'source-sans-3' },
  frame: { rails: false, rules: false, crosses: false },
  mark: { kind: 'picture', assetId: 'acme-mark' },
  footer: { logo: 'picture', assetId: 'acme-mark', text: 'Confidential' },
  counter: { show: true, format: 'Slide n', skipTitle: true },
  positions: { mark: 'top-right', footerLogo: 'bottom-right' },
  lexicon: ['Acme'],
};

describe('themeCss', () => {
  it('emits nothing for a deck without a record, an empty record or a record that draws nothing', () => {
    expect(themeCss(deck())).toBe('');
    expect(themeCss(deck({}))).toBe('');
    expect(themeCss(deck({ name: 'Acme', appearance: 'light', lexicon: ['Acme'] }))).toBe('');
    expect(hasKitOverrides(deck())).toBe(false);
    expect(hasKitOverrides(deck({ name: 'Acme' }))).toBe(false);
    expect(hasKitOverrides(deck({ frame: { crosses: false } }))).toBe(true);
    expect(THEME_CSS_STYLE_ID).toBe('ts-theme-css');
  });

  it('scopes every rule to the sheet root with the base tile opt out', () => {
    expect(THEME_CSS_SCOPE).toBe('.ts-sheet:not([data-theme-base])');
    const rules = parseCss(themeCss(deck(FULL)));
    expect(rules.length).toBeGreaterThan(6);
    for (const rule of rules) {
      expect(rule.selector.startsWith(THEME_CSS_SCOPE), rule.selector).toBe(true);
      expect(Object.keys(rule.declarations).length, rule.selector).toBeGreaterThan(0);
    }
  });

  it('redefines each role’s token under the appearance’s selector and recomputes the derived tokens from the text colour', () => {
    const css = themeCss(deck({ colors: { light: { text: '#101010', caption: '#333333' } } }));
    const rules = parseCss(css);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe(LIGHT);
    expect(rules[0]?.declarations).toEqual({
      '--ink': '#101010',
      '--ink-2': '#333333',
      '--hair': 'rgba(16, 16, 16, 0.18)',
      '--hair-soft': 'rgba(16, 16, 16, 0.09)',
      '--cross': 'rgba(16, 16, 16, 0.38)',
      '--edge': 'rgba(16, 16, 16, 0.62)',
      '--thumb': 'rgba(16, 16, 16, 0.32)',
    });
    expect(css).not.toContain(DARK);
    const dark = parseCss(
      themeCss(deck({ colors: { dark: { hint: '#9a9a9a', accent: '#ff8800' } } })),
    );
    expect(dark).toHaveLength(1);
    expect(dark[0]?.selector).toBe(DARK);
    expect(dark[0]?.declarations).toEqual({ '--titanium': '#9a9a9a', '--accent': '#ff8800' });
  });

  it('writes Primary as the blue token, the link colour and, until Accent is set, the accent too', () => {
    const rules = parseCss(themeCss(deck({ colors: { light: { primary: '#0b3d91' } } })));
    expect(rules.map((rule) => rule.selector)).toEqual([LIGHT, `${LIGHT} .slide a`]);
    expect(rules[0]?.declarations).toEqual({ '--blue': '#0b3d91', '--accent': '#0b3d91' });
    expect(rules[1]?.declarations).toEqual({ color: '#0b3d91' });
    const both = parseCss(
      themeCss(deck({ colors: { light: { primary: '#0b3d91', accent: '#12a37a' } } })),
    );
    expect(both[0]?.declarations).toEqual({ '--blue': '#0b3d91', '--accent': '#12a37a' });
  });

  it('paints the background on the paper token and the viewer’s slide box, and recomputes a hint that reads on it', () => {
    const rules = parseCss(themeCss(deck({ colors: { light: { background: '#0b3d91' } } })));
    const root = rules.find((rule) => rule.selector === LIGHT);
    expect(root?.declarations['--paper']).toBe('#0b3d91');
    // the plate stays the ink's alpha form over the new ground
    expect(root?.declarations['--plate']).toBe('rgba(7, 7, 7, 0.035)');
    // titanium on navy reads at 3.3 to 1, so the hint keeps the base value
    expect(root?.declarations['--titanium']).toBeUndefined();
    expect(rules.some((rule) => rule.selector === `${LIGHT} .pt-slide`)).toBe(true);
    // a mid grey ground: the base hint does not read, the text colour takes its place
    const grey = parseCss(themeCss(deck({ colors: { light: { background: '#8a8f98' } } })));
    expect(grey.find((rule) => rule.selector === LIGHT)?.declarations['--titanium']).toBe(
      '#070707',
    );
  });

  it('writes the two font roles as the sheet stacks', () => {
    const rules = parseCss(
      themeCss(deck({ fonts: { display: 'playfair-display', text: 'roboto' } })),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe(THEME_CSS_SCOPE);
    expect(rules[0]?.declarations['--display']).toBe(
      "'Playfair Display', Georgia, 'Times New Roman', serif",
    );
    expect(rules[0]?.declarations['--text']).toBe("'Roboto', 'Helvetica Neue', Arial, sans-serif");
    expect(fontStack('jetbrains-mono')).toContain('monospace');
    // the sheet's own stack with the metric matched fallback second (docs/FEATURES.md 3.1 item 3)
    expect(fontStack('inter')).toBe(
      "'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif",
    );
    // one definition for the kit path and the block path (3.5; audit-fonts 16)
    expect(fontStack('roboto')).toBe(fontFamilyStack('roboto'));
    expect(fontStack('fraunces')).toBe(fontFamilyStack('fraunces'));
    expect(fontVariablesRule(['roboto'])).toContain(`--ts-font-roboto: ${fontStack('roboto')};`);
  });

  it('writes --display-features beside the display face: Inter keeps cv11 and ss01, another family reads normal (docs/FEATURES.md 3.1 item 5)', () => {
    const fraunces = parseCss(themeCss(deck({ fonts: { display: 'fraunces' } })));
    expect(fraunces[0]?.declarations['--display']).toBe(fontStack('fraunces'));
    expect(fraunces[0]?.declarations['--display-features']).toBe('normal');
    const playfair = parseCss(themeCss(deck({ fonts: { display: 'playfair-display' } })));
    expect(playfair[0]?.declarations['--display-features']).toBe('normal');
    const inter = parseCss(themeCss(deck({ fonts: { display: 'inter' } })));
    expect(inter[0]?.declarations['--display-features']).toBe("'cv11', 'ss01'");
    expect(displayFeatures('inter')).toBe(DISPLAY.features);
    expect(displayFeatures('geist')).toBe('normal');
    // the text role alone leaves the display features to the sheet's base value
    const text = parseCss(themeCss(deck({ fonts: { text: 'roboto' } })));
    expect(text[0]?.declarations['--display-features']).toBeUndefined();
    expect(text[0]?.declarations['--text']).toBe(fontStack('roboto'));
    // the rendered slide carries the same declaration
    const html = renderSlide(deck({ fonts: { display: 'fraunces', text: 'fraunces' } }), title, {
      theme: 'light',
      chrome: false,
      assetBase: 'decks/acme/',
      blockAttrs: false,
      gtWord: true,
    }).html;
    expect(html).toContain('--display-features: normal');
    expect(html).toContain(`--display: ${fontStack('fraunces')}`);
  });

  it('emits the block declarations of a family and of tabular figures (docs/FEATURES.md 3.1 items 4 and 5)', () => {
    // a block in another family drops the sheet's display features; Inter and an absent family keep them
    expect(typographyDeclarations({ family: 'playfair-display' })).toEqual([
      'font-family:var(--ts-font-playfair-display, inherit)',
      'font-feature-settings:normal',
    ]);
    expect(typographyDeclarations({ family: 'inter' })).toEqual([
      'font-family:var(--ts-font-inter, inherit)',
    ]);
    expect(typographyDeclarations({ size: 22 })).toEqual(['font-size:22px']);
    // tabular figures ride as font-variant-numeric, independent of the feature settings
    expect(typographyDeclarations({ numerals: 'tabular' })).toEqual([
      'font-variant-numeric:tabular-nums',
    ]);
    expect(typographyDeclarations({ family: 'geist', numerals: 'tabular' })).toEqual([
      'font-family:var(--ts-font-geist, inherit)',
      'font-feature-settings:normal',
      'font-variant-numeric:tabular-nums',
    ]);
    expect(typographyDeclarations({})).toEqual([]);
  });

  it('hides the rails, the rules and the crosses the record turns off', () => {
    const rules = parseCss(themeCss(deck({ frame: { rails: false, crosses: false } })));
    const selectors = rules.map((rule) => rule.selector);
    expect(selectors).toContain(`${THEME_CSS_SCOPE} .frame::before`);
    expect(selectors).toContain(`${THEME_CSS_SCOPE} .frame::after`);
    expect(selectors).toContain(`${THEME_CSS_SCOPE} .frame .cross`);
    expect(selectors).not.toContain(`${THEME_CSS_SCOPE} .frame .rule`);
    expect(
      parseCss(themeCss(deck({ frame: { rails: true, rules: true, crosses: true } }))),
    ).toEqual([]);
  });

  it('steps the stage’s own wordmark aside when the kit draws the footer slot', () => {
    expect(kitDrawsFooter(undefined)).toBe(false);
    expect(kitDrawsFooter({ footer: { logo: 'default' } })).toBe(false);
    expect(kitDrawsFooter({ footer: { logo: 'none' } })).toBe(true);
    expect(kitDrawsFooter({ footer: { text: 'Confidential' } })).toBe(true);
    expect(kitDrawsFooter({ positions: { footerLogo: 'top-right' } })).toBe(true);
    expect(parseCss(themeCss(deck({ footer: { logo: 'none' } })))).toEqual([
      {
        selector: `${THEME_CSS_SCOPE} .wordmark:not(.ts-kit-wordmark)`,
        declarations: { display: 'none' },
      },
    ]);
    /* the counter's format is the frame band's (stage.ts frameBandOf), never a rule here */
    expect(themeCss(deck({ counter: { format: 'Slide n' } }))).toBe('');
    expect(themeCss(deck({ counter: { format: 'n / N', show: false } }))).toBe('');
  });

  it('is stable over a full record', () => {
    const css = themeCss(deck(FULL));
    expect(css).toBe(themeCss(deck(FULL)));
    expect(css).not.toContain('Acme');
    expect(css).not.toContain('Confidential');
  });
});

describe('the slots', () => {
  const resolve = (assetId: string) =>
    assetId === 'acme-mark'
      ? {
          src: `decks/acme/assets/${assetId}.png`,
          size: [400, 200] as [number, number],
          alt: 'The Acme mark',
        }
      : undefined;

  it('reads the GT band for a deck without a record and renders the wordmark byte for byte', () => {
    expect(frameBandOf(deck(), 'light', resolve)).toBe(GT_BAND);
    expect(frameBandHtml(GT_BAND)).toBe(WORDMARK_HTML);
    expect(frameBandOf(deck({ footer: { logo: 'default' } }), 'light', resolve)).toBe(GT_BAND);
  });

  it('draws the footer slot as the default logo, none, or a picture fitted to 18 px tall', () => {
    const none = frameBandOf(deck({ footer: { logo: 'none' } }), 'light', resolve);
    expect(none.logo).toEqual({ kind: 'none' });
    expect(frameBandHtml(none)).toBe('');
    const picture = frameBandOf(deck(FULL), 'dark', resolve);
    expect(picture.logo).toEqual({
      kind: 'picture',
      position: 'bottom-right',
      src: 'decks/acme/assets/acme-mark.png',
      alt: 'The Acme mark',
      w: 36,
      h: 18,
    });
    expect(picture.text).toBe('Confidential');
    expect(picture.counterFormat).toBe('Slide n');
    const html = frameBandHtml(picture);
    /* the kit's band carries the class the theme sheet's override reads (the features round,
       docs/FEATURES.md 4.8): without it the export's document hid the footer logo */
    expect(html).toContain('class="wordmark ts-kit-wordmark pos-bottom-right is-picture"');
    expect(html).toContain('<img src="decks/acme/assets/acme-mark.png" width="36" height="18"');
    expect(html).toContain('<div class="ts-kit-footer" aria-hidden="true">Confidential</div>');
    // a picture whose asset the deck lacks draws the default logo
    const missing = frameBandOf(
      deck({ footer: { logo: 'picture', assetId: 'gone' } }),
      'light',
      resolve,
    );
    expect(missing.logo).toEqual({ kind: 'default', position: 'bottom-left' });
    const hidden = frameBandOf(deck({ positions: { footerLogo: 'hidden' } }), 'light', resolve);
    expect(hidden.logo).toEqual({ kind: 'none' });
  });

  it('formats the counter three ways', () => {
    expect(counterText(3, 12)).toBe('03 / 12');
    expect(counterText(3, 12, 'n')).toBe('03');
    expect(counterText(3, 12, 'Slide n')).toBe('Slide 3');
  });

  it('renders the title slide’s mark from the record: the GT mark, a picture, nothing, or a corner', () => {
    const options = {
      theme: 'light' as const,
      chrome: false,
      assetBase: 'decks/acme/',
      blockAttrs: false,
      gtWord: true,
    };
    const base = renderSlide(deck(), title, options).html;
    expect(base).toContain('<use href="#gt-mark"/>');
    expect(base).not.toContain(THEME_CSS_CLASS);
    const picture = renderSlide(
      deck({ mark: { kind: 'picture', assetId: 'acme-mark' } }),
      title,
      options,
    ).html;
    expect(picture).toContain('class="mark mark-picture"');
    expect(picture).toContain('width="132" height="66"');
    expect(picture).not.toContain('#gt-mark');
    const none = renderSlide(deck({ mark: { kind: 'none' } }), title, options).html;
    expect(none).not.toContain('class="mark');
    expect(none).not.toContain('#gt-mark');
    const corner = renderSlide(deck({ positions: { mark: 'top-right' } }), title, options).html;
    expect(corner).toContain('class="ts-kit"');
    expect(corner).toContain('ts-kit-logo is-mark pos-top-right');
    expect(corner.indexOf('#gt-mark')).toBeGreaterThan(corner.indexOf('class="ts-kit"'));
  });

  it('carries the override stylesheet and the used faces inside the slide', () => {
    const options = {
      theme: 'light' as const,
      chrome: false,
      assetBase: 'decks/acme/',
      blockAttrs: false,
      gtWord: true,
    };
    const html = renderSlide(deck(FULL), title, options).html;
    expect(html).toContain(`<style class="${THEME_CSS_CLASS}">`);
    expect(html).toContain("--display: 'Playfair Display'");
    expect(html).toContain("font-family: 'Playfair Display'");
    expect(html).toContain("font-family: 'Source Sans 3'");
    expect(html).toContain('--ts-font-playfair-display');
    expect(html).toContain("url('/fonts/");
    expect(kitStyle(deck(), title, options)).toBe('');
    // a caller that mounts the sheet itself leaves it out
    expect(renderSlide(deck(FULL), title, { ...options, noKitCss: true }).html).not.toContain(
      THEME_CSS_CLASS,
    );
  });

  it('reads a template’s kit into the default kit with the round’s default appearance', () => {
    const kit: DefaultKit = defaultKitOf({ name: 'General Translation', appearance: 'light' });
    expect(kit).toEqual({ name: 'General Translation', appearance: 'light' });
    expect(defaultKitOf(undefined).appearance).toBe(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE).toBe('light');
  });
});
