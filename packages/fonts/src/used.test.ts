// The used family walk counts a fixed kind's field of its own (the field fonts hotfix,
// docs/gslides-parity/features/build/field-fonts.md 2): a face only the cover's heading or a
// statement's big line names gets its @font-face rules and its `--ts-font-<id>` variable, Inter
// never, a theme's own faces where the kit names none, and the order is the catalog's.
import { describe, expect, it } from 'vitest';

import type { Slide, StatementSlide, TitleSlide } from '@turboslide/schema/deck';
import { THESIS, TITLE, WORKED_DECK } from '@turboslide/schema/fixtures';

import { usedFontIds } from './used.ts';

describe('usedFontIds', () => {
  it('counts a field face beside the blocks and the kit, never Inter', () => {
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

  // a theme's own faces (schema THEME_FACTS fonts) load with its decks, each role the kit leaves
  // alone, so a Coral deck draws Fraunces and DM Sans and a Simple deck still loads nothing
  it("counts the theme's faces for the roles the kit names none of", () => {
    expect(usedFontIds({ brand: undefined, theme: 'coral' }, [TITLE])).toEqual([
      'dm-sans',
      'fraunces',
    ]);
    expect(usedFontIds({ brand: undefined, theme: 'signal' }, [TITLE])).toEqual(['oswald']);
    expect(usedFontIds({ brand: { fonts: { display: 'lora' } }, theme: 'coral' }, [TITLE])).toEqual(
      ['lora', 'dm-sans'],
    );
    expect(usedFontIds({ brand: undefined, theme: 'simple' }, [TITLE])).toEqual([]);
    expect(usedFontIds({ brand: undefined, theme: 'general-translation' }, [TITLE])).toEqual([]);
  });
});
