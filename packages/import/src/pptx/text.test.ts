// The text tables (gslides-parity SPEC-5 5.1; R04 5.2): the numbering scheme fold onto the six
// presets and the link rules. The run marks, the list detection, the autofit, the colours and the
// font counts are exercised over fixture 01 in fixtures.test.ts.
import { describe, expect, it } from 'vitest';

import { numberPresetOf } from './text.ts';

describe('numberPresetOf', () => {
  it.each([
    ['arabicPeriod', 'digit-alpha-roman', true],
    ['arabicParenR', 'digit-alpha-roman-parens', true],
    ['arabicParenBoth', 'digit-alpha-roman-parens', false],
    ['alphaUcPeriod', 'upperalpha-alpha-roman', true],
    ['romanUcPeriod', 'upperroman-upperalpha-digit', true],
    ['arabicDbPeriod', 'zerodigit-alpha-roman', true],
    ['alphaLcPeriod', 'digit-alpha-roman', false],
    ['romanLcParenR', 'digit-alpha-roman', false],
    ['ea1ChsPeriod', 'digit-alpha-roman', false],
  ] as const)('%s reads as %s (exact %s)', (scheme, preset, exact) => {
    expect(numberPresetOf(scheme)).toEqual({ preset, exact });
  });
});
