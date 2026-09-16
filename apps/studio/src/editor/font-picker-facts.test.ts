import { describe, expect, it } from 'vitest';

import { FONT_CATALOG, catalogSummary } from '@turboslide/fonts/catalog';
import {
  CATEGORY_GENERIC as FONTS_GENERIC,
  CURRENT_VERSION_ALIAS,
  FONT_CATEGORY_LABELS as FONTS_LABELS,
  fontsStylesheetPath,
} from '@turboslide/fonts/names';
import { usedFontIds } from '@turboslide/fonts/used';
import { workedDocument } from '@turboslide/schema/fixtures';
import { FONT_IDS } from '@turboslide/schema/fonts';

// The chrome carries no fonts module (packages/chrome depends on the schema, never on
// @turboslide/fonts), so the few catalog facts the Font picker spells itself are pinned here to
// the fonts package, which the studio can import (gslides-parity SPEC-5-amendments A5; B7): the
// family names before `font.list` answered, the generic families, the category words, the
// stylesheet path under the `current` alias, and the used families walk. The chrome module is
// reached through its package export (`./font-picker-model`, the integrator's R11 in b7.md);
// until the export lands the module cannot be resolved from here and the suite is skipped with
// that sentence, never reported as passed.

import type { FontCategory, FontId } from '@turboslide/schema/fonts';

/** The part of packages/chrome/src/font-picker-model.ts this suite reads (spelled here so the file typechecks before the export lands). */
type Model = {
  CATEGORY_GENERIC: Readonly<Record<FontCategory, string>>;
  FONT_CATEGORY_LABELS: Readonly<Record<FontCategory, string>>;
  familyLabel: (id: FontId, rows?: readonly { id: FontId; name: string }[] | null) => string;
  fontsStylesheetHref: (ids: readonly FontId[]) => string;
  usedFamilies: (document: ReturnType<typeof workedDocument>) => FontId[];
};

// a computed specifier, so the bundler leaves the resolution to the runtime and a missing export
// skips the suite instead of failing the file
const specifier = ['@turboslide/chrome', 'font-picker-model'].join('/');
const model: Model | null = await import(/* @vite-ignore */ specifier).catch(() => null);

describe.skipIf(model === null)(
  'the Font picker’s facts agree with the fonts package (skipped: @turboslide/chrome exports no ./font-picker-model yet, b7.md R11)',
  () => {
    const m = model as Model;

    it('names every id as the catalog does, before the catalog answered and after', () => {
      const rows = catalogSummary().fonts;
      for (const row of FONT_CATALOG) {
        expect(m.familyLabel(row.id), row.id).toBe(row.name);
        expect(m.familyLabel(row.id, rows), row.id).toBe(row.name);
      }
    });

    it('shares the generic families, the category words and the stylesheet path', () => {
      expect(m.CATEGORY_GENERIC).toEqual(FONTS_GENERIC);
      expect(m.FONT_CATEGORY_LABELS).toEqual(FONTS_LABELS);
      expect(m.fontsStylesheetHref(['roboto', 'lora'])).toBe(
        fontsStylesheetPath(['roboto', 'lora'], CURRENT_VERSION_ALIAS),
      );
    });

    it('walks the used families the way @turboslide/fonts/used does', () => {
      const document = workedDocument();
      expect(m.usedFamilies(document)).toEqual(
        usedFontIds(document.deck, Object.values(document.slides)),
      );
      const slide = document.slides['content-rule'] as { slots: Record<string, unknown[]> };
      const withFamilies = {
        deck: { ...document.deck, themeEdits: { fonts: { text: FONT_IDS[5] } } },
        slides: {
          ...document.slides,
          'content-rule': {
            ...slide,
            slots: {
              ...slide.slots,
              left: [
                ...slide.slots.left!,
                { id: 'x1', type: 'paragraph', text: 'a', typography: { family: 'fira-code' } },
              ],
            },
          },
        },
      } as never as ReturnType<typeof workedDocument>;
      expect(m.usedFamilies(withFamilies)).toEqual(
        usedFontIds(withFamilies.deck, Object.values(withFamilies.slides)),
      );
      expect(m.usedFamilies(withFamilies)).toEqual([FONT_IDS[5], 'fira-code']);
    });
  },
);
