// The used family walk counts a fixed kind's field of its own (the field fonts hotfix,
// docs/gslides-parity/features/build/field-fonts.md 2): a face only the cover's heading or a
// statement's big line names gets its @font-face rules and its `--ts-font-<id>` variable, the
// theme's face never, and the order is the catalog's.
import { describe, expect, it } from 'vitest';

import type { Slide, StatementSlide, TitleSlide } from '@turboslide/schema/deck';
import { THESIS, TITLE, WORKED_DECK } from '@turboslide/schema/fixtures';

import { usedFontIds } from './used.ts';

describe('usedFontIds', () => {
  it('counts a field face beside the blocks and the kit, never the theme face', () => {
    const cover = TITLE as TitleSlide;
    const title: TitleSlide = { ...cover, typography: { heading: { family: 'fraunces' } } };
    const statement: Slide = {
      ...(THESIS as StatementSlide),
      typography: { big: { family: 'manrope', size: 58 } },
    };
    const lead: TitleSlide = {
      ...cover,
      id: 'cover-2',
      typography: { lead: { family: 'inter' }, heading: { size: 72 } },
    };
    expect(usedFontIds({ brand: undefined }, [title, statement, lead])).toEqual([
      'manrope',
      'fraunces',
    ]);
    expect(usedFontIds({ brand: undefined }, [TITLE, THESIS])).toEqual([]);
    expect(usedFontIds(WORKED_DECK, [title])).toEqual(['fraunces']);
  });
});
