import { beforeAll, describe, expect, it } from 'vitest';

import type { BlockOf } from '@turboslide/schema/blocks';
import { EQUATION_SYMBOL_GROUPS, equationSymbolsOf } from '@turboslide/schema/blocks/equation';
import type { EquationSymbolGroup } from '@turboslide/schema/blocks/equation';
import type { Slide } from '@turboslide/schema/deck';

import type { BlockContext } from './context.ts';
import {
  EQUATION_CSS_STYLE_ID,
  EQUATION_DEFAULT_SIZE,
  EQUATION_ENGINE_EVENT,
  EQUATION_SCOPE,
  MATH_FONT_FAMILY,
  TEMML_VERSION,
  clearEquationEngine,
  deckUsesEquations,
  equationCss,
  equationEngine,
  equationMathml,
  loadEquationEngine,
  renderEquation,
  patchPendingEquations,
} from './equation.ts';

// The equation renderer (gslides-parity SPEC-5 8.1; R06 7.1, 8.4, 9.3): Temml's MathML inside
// the block root, the Google aliases as macros, a parse error as Temml's mark plus a warning, the
// kept MathML while the source is empty, the pending source before the engine arrives, the
// scoped stylesheet, and one snapshot per toolbar group so a Temml upgrade shows its diff.
function context(): BlockContext {
  return {
    slideId: 'eq',
    theme: 'light',
    blockAttrs: true,
    gtWord: true,
    image: () => undefined,
    assetUrl: (path) => path,
    rasters: [],
    warnings: [],
    rasterCount: 0,
  };
}

function block(fields: Partial<BlockOf<'equation'>> & { tex: string }): BlockOf<'equation'> {
  return { id: 'eq1', type: 'equation', ...fields } as BlockOf<'equation'>;
}

/** Every command of a group in one source (a structure's LaTeX filled so it parses). */
function groupSource(group: EquationSymbolGroup): string {
  return equationSymbolsOf(group)
    .map((row) => row.latex.replace(/\{\}/g, '{x}').replace(/\[\]/g, '[n]'))
    .join(' \\quad ');
}

beforeAll(async () => {
  await loadEquationEngine();
});

describe('equationMathml', () => {
  it('renders display math with the LaTeX annotated and no trust', () => {
    const out = equationMathml('\\frac{a}{b}');
    expect(out.error).toBeUndefined();
    expect(out.mathml).toMatch(/^<math display="block"/);
    expect(out.mathml).toContain('<mfrac>');
    expect(out.mathml).toContain(
      '<annotation encoding="application/x-tex">\\frac{a}{b}</annotation>',
    );
    expect(equationMathml('x', 'inline').mathml).not.toContain('display="block"');
  });

  it("accepts Google's aliases through the macro table", () => {
    expect(equationMathml('\\rootof{3}{x}').mathml).toContain('<mroot>');
    expect(equationMathml('\\abs{x}').mathml).toContain('|');
    expect(equationMathml('\\limab{x}{0} f').mathml).toContain('<mi>lim</mi>');
    expect(equationMathml('\\subsuperscript{x}{1}{2}').mathml).toContain('<msubsup>');
  });

  it('answers the error mark and the message for a source that does not parse', () => {
    const out = equationMathml('\\frac{a}{');
    expect(out.error).toMatch(/Unexpected end of input/);
    expect(out.mathml).toContain('temml-error');
  });

  it('refuses trusted commands', () => {
    const out = equationMathml('\\href{https://example.com}{x}');
    expect(out.mathml).not.toContain('href="https');
    expect(out.mathml.includes('<a ')).toBe(false);
  });

  it('throws without an engine', () => {
    expect(() => equationMathml('x', 'block', null)).toThrow(/loadEquationEngine/);
  });
});

describe('renderEquation', () => {
  it('emits the block root with the math, the size, the colour, the alt and a 2x raster', () => {
    const ctx = context();
    const html = renderEquation(
      block({ tex: 'E = mc^2', size: 44, color: 'ink-2', alt: 'E equals m c squared' }),
      ctx,
    );
    expect(html).toMatch(/^<div class="equation" style="font-size:44px;color:var\(--ink-2\)"/);
    expect(html).toContain('data-block="eq1"');
    expect(html).toContain('data-type="equation"');
    expect(html).toContain('aria-label="E equals m c squared"');
    expect(html).toContain('data-display="block"');
    expect(html).toContain('data-raster="dia"');
    expect(html).toContain('<msup>');
    expect(html.endsWith('</div>')).toBe(true);
    expect(ctx.rasters).toHaveLength(1);
    expect(ctx.rasters[0]).toMatchObject({ blockId: 'eq1', kind: 'dia', alpha: true });
    expect(ctx.warnings).toEqual([]);
  });

  it('marks an inline equation and writes no aria-label without an alt', () => {
    const html = renderEquation(block({ tex: 'x', display: 'inline' }), context());
    expect(html).toContain('class="equation is-inline"');
    expect(html).not.toContain('aria-label');
    expect(html).toContain('data-display="inline"');
  });

  it('records a parse error on the root and in the warnings', () => {
    const ctx = context();
    const html = renderEquation(block({ tex: '\\frac{a}{' }), ctx);
    expect(html).toContain('data-equation-error=');
    expect(html).toContain('temml-error');
    expect(ctx.warnings[0]).toMatch(/^eq1: equation\/parse /);
  });

  it('emits kept MathML as is while the source is empty, and the source when the MathML is not one math element', () => {
    const kept = '<math display="block"><mi>π</mi></math>';
    expect(renderEquation(block({ tex: '', mathml: kept }), context())).toContain(kept);
    const bad = renderEquation(
      block({ tex: '', mathml: '<math><mi>x</mi></math><script>1</script>' }),
      context(),
    );
    expect(bad).not.toContain('<script');
    expect(bad).toContain('equation-source');
  });

  it('emits the pending source before the engine is present', () => {
    clearEquationEngine();
    try {
      expect(equationEngine()).toBeNull();
      const html = renderEquation(block({ tex: '\\alpha' }), context());
      expect(html).toContain('data-equation-pending');
      expect(html).toContain('\\alpha');
      expect(html).not.toContain('<math');
    } finally {
      // the engine is a module singleton: the other tests of this file need it back
    }
  });

  it('installs the engine again on load and names the event a document listens for', async () => {
    const engine = await loadEquationEngine();
    expect(equationEngine()).toBe(engine);
    expect(EQUATION_ENGINE_EVENT).toBe('ts-equation-engine');
    expect(EQUATION_CSS_STYLE_ID).toBe('ts-equation-css');
  });

  it('draws the pending roots in place once the engine is present (the editor sheet before a render)', () => {
    // a minimal element tree: the block root holds the pending span with the source as its text
    type FakeElement = {
      parentElement: FakeElement | null;
      textContent: string;
      innerHTML: string;
      attrs: Record<string, string>;
      getAttribute: (name: string) => string | null;
      setAttribute: (name: string, value: string) => void;
      removeAttribute: (name: string) => void;
    };
    const make = (attrs: Record<string, string>, text = ''): FakeElement => {
      const el: FakeElement = {
        parentElement: null,
        textContent: text,
        innerHTML: '',
        attrs,
        getAttribute: (name) => el.attrs[name] ?? null,
        setAttribute: (name, value) => {
          el.attrs[name] = value;
        },
        removeAttribute: (name) => {
          delete el.attrs[name];
        },
      };
      return el;
    };
    const fine = make({ 'data-display': 'block' });
    const fineSpan = make({ 'data-equation-pending': '' }, '\\frac{a}{b}');
    fineSpan.parentElement = fine;
    const broken = make({ 'data-display': 'inline' });
    const brokenSpan = make({ 'data-equation-pending': '' }, '\\frac{a}{');
    brokenSpan.parentElement = broken;
    const empty = make({});
    const emptySpan = make({ 'data-equation-pending': '' }, '   ');
    emptySpan.parentElement = empty;
    const root = {
      querySelectorAll: (selector: string) => {
        expect(selector).toBe('.equation > [data-equation-pending]');
        return [fineSpan, brokenSpan, emptySpan];
      },
    } as unknown as Element;
    expect(patchPendingEquations(root)).toBe(2);
    expect(fine.innerHTML).toContain('<mfrac>');
    expect(fine.innerHTML).toContain('display="block"');
    expect(fine.attrs['data-equation-error']).toBeUndefined();
    expect(broken.innerHTML).toContain('temml-error');
    expect(broken.innerHTML).not.toContain('display="block"');
    expect(broken.attrs['data-equation-error']).toMatch(/Unexpected end of input/);
    expect(empty.innerHTML).toBe('');
  });
});

describe('the Temml snapshot per toolbar group (R06 4)', () => {
  it.each([...EQUATION_SYMBOL_GROUPS])('%s renders every command of the group', (group) => {
    const source = groupSource(group);
    const out = equationMathml(source);
    expect(out.error, `${group}: ${out.error ?? ''}`).toBeUndefined();
    expect(out.mathml).not.toContain('temml-error');
    expect(`temml ${TEMML_VERSION}\n${out.mathml}`).toMatchSnapshot();
  });
});

describe('equationCss', () => {
  it('scopes every Temml rule under the equation root and inlines the supplement face', () => {
    const css = equationCss({ temmlWoff2: 'data:font/woff2;base64,AAAA' });
    expect(css).toContain("@font-face { font-family: 'Temml';");
    expect(css).toContain('url(data:font/woff2;base64,AAAA)');
    expect(css).not.toContain('__TEMML_WOFF2__');
    expect(css).not.toContain(MATH_FONT_FAMILY + "'; src");
    const selectors = css
      .split('\n')
      .filter((line) => !line.startsWith('@'))
      .map((line) => line.slice(0, line.indexOf('{')).trim());
    for (const selector of selectors)
      for (const part of selector.split(','))
        expect(part.trim().startsWith('.ts-sheet'), part).toBe(true);
    expect(css).toContain(
      `${EQUATION_SCOPE} { display: block; font-size: ${EQUATION_DEFAULT_SIZE}px;`,
    );
  });

  it('adds the math face only when a url is given (a deck without an equation pays nothing)', () => {
    const css = equationCss({ temmlWoff2: 'a', mathWoff2: 'data:font/woff2;base64,BBBB' });
    expect(css).toContain(
      `@font-face { font-family: '${MATH_FONT_FAMILY}'; src: url(data:font/woff2;base64,BBBB)`,
    );
    expect(css).toContain(
      `${EQUATION_SCOPE} math { font-family: '${MATH_FONT_FAMILY}', 'Cambria Math'`,
    );
  });
});

describe('deckUsesEquations', () => {
  it('finds an equation block in a slot and inside a composite cell', () => {
    const plain = {
      schemaVersion: 1,
      id: 'a',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: { main: [{ id: 't', type: 'text', text: 'hi', pos: { x: 0, y: 0, w: 10, h: 10 } }] },
    } as unknown as Slide;
    const withEquation = {
      ...plain,
      id: 'b',
      slots: { main: [{ id: 'e', type: 'equation', tex: 'x', pos: { x: 0, y: 0, w: 10, h: 10 } }] },
    } as unknown as Slide;
    expect(deckUsesEquations([plain])).toBe(false);
    expect(deckUsesEquations([plain, withEquation])).toBe(true);
  });
});
