// The equation validator family (gslides-parity SPEC-5 1.2, 8.1; MILESTONES-5 B6 day 1).
import { describe, expect, it } from 'vitest';
import type { Block } from '../blocks.ts';
import { workedDocument } from '../fixtures.ts';
import { validateDeck } from '../validate.ts';
import { isMathMlElement, validateEquations } from './equation.ts';

const MATHML = '<math display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';

function withEquation(fields: Partial<Extract<Block, { type: 'equation' }>>) {
  const document = workedDocument();
  const slide = document.slides['content-rule'];
  if (slide === undefined || slide.kind !== 'content') throw new Error('fixture');
  const block: Block = { id: 'eq', type: 'equation', tex: '\\frac{a}{b}', ...fields };
  slide.slots.right = [...(slide.slots.right ?? []), block];
  return document;
}

describe('isMathMlElement', () => {
  it('accepts one math element and refuses anything else', () => {
    expect(isMathMlElement(MATHML)).toBe(true);
    expect(isMathMlElement(`  ${MATHML}\n`)).toBe(true);
    expect(isMathMlElement('<mi>a</mi>')).toBe(false);
    expect(isMathMlElement(`${MATHML}<p>after</p>`)).toBe(false);
    expect(isMathMlElement(`<p>before</p>${MATHML}`)).toBe(false);
    expect(isMathMlElement('<math><mi onclick="x()">a</mi></math>')).toBe(false);
    expect(isMathMlElement('<math><script>1</script></math>')).toBe(false);
    expect(isMathMlElement('<math><annotation-xml><div/></annotation-xml></math>')).toBe(false);
    expect(
      isMathMlElement('<math><semantics><mi>a</mi><annotation>a</annotation></semantics></math>'),
    ).toBe(true);
    expect(isMathMlElement('<mathx></mathx>')).toBe(false);
  });
});

describe('validateEquations', () => {
  it('answers nothing for a deck without equations and for a sourced block', () => {
    expect(validateEquations(workedDocument())).toEqual([]);
    const document = withEquation({});
    expect(validateEquations(document)).toEqual([]);
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('warns about a block with no source and no kept MathML, at severity 2', () => {
    const issues = validateEquations(withEquation({ tex: '  ' }));
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'equation',
        severity: 2,
        file: 'slides/content-rule.json',
        pointer: '/slots/right/1/tex',
      }),
    ]);
    expect(validateEquations(withEquation({ tex: '', mathml: MATHML }))).toEqual([]);
    const document = withEquation({ tex: '' });
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(true);
    expect(result.issues.map((row) => row.code)).toEqual(['equation']);
  });

  it('refuses kept MathML that is not one math element', () => {
    const issues = validateEquations(
      withEquation({ tex: '', mathml: '<math><mi>a</mi></math><img src="x">' }),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'equation',
        severity: 3,
        pointer: '/slots/right/1/mathml',
      }),
    ]);
    const document = withEquation({ mathml: '<script>1</script>' });
    const result = validateDeck({ deck: document.deck, slides: Object.values(document.slides) });
    expect(result.ok).toBe(false);
  });
});
