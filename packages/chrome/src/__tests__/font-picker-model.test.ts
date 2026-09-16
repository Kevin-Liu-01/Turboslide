import { describe, expect, it } from 'vitest';

import { FONT_CATEGORIES, FONT_IDS } from '@turboslide/schema/fonts';
import { workedDocument } from '@turboslide/schema/fixtures';

import {
  CATEGORY_GENERIC,
  FONT_CATEGORY_LABELS,
  FONT_PICKER,
  controlLabel,
  familyLabel,
  familyOf,
  filterRows,
  flatRows,
  fontsStylesheetHref,
  groupRows,
  rowFamilyStack,
  takesFamily,
  typographyWithFamily,
  usedFamilies,
} from '../font-picker-model.ts';
import type { FontRow } from '../font-picker-model.ts';
import { forbiddenWordsIn } from '../menus/strings.ts';

// The Font picker's rules (gslides-parity SPEC-5-amendments A5 item 4; B7): the groups (the
// presentation's families first, then Google's four categories), the search, the family a block
// carries, the families a document uses, the label before the catalog answered, the write value,
// and the words free of the engineering vocabulary.

const rows: FontRow[] = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans',
    weights: [400],
    italic: true,
    licence: 'OFL 1.1',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans',
    weights: [400],
    italic: true,
    licence: 'OFL 1.1',
  },
  { id: 'lora', name: 'Lora', category: 'serif', weights: [400], italic: true, licence: 'OFL 1.1' },
  {
    id: 'pt-serif',
    name: 'PT Serif',
    category: 'serif',
    weights: [400, 700],
    italic: true,
    licence: 'OFL 1.1',
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'display',
    weights: [400],
    italic: false,
    licence: 'OFL 1.1',
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    category: 'mono',
    weights: [400],
    italic: false,
    licence: 'OFL 1.1',
  },
];

describe('the Font picker model', () => {
  it('groups the presentation’s families first, then the catalog by Google’s categories in order', () => {
    const groups = groupRows(rows, ['lora', 'roboto']);
    expect(groups.map((group) => group.id)).toEqual(['used', ...FONT_CATEGORIES]);
    expect(groups[0]?.title).toBe(FONT_PICKER.inThisPresentation);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(['roboto', 'lora']);
    expect(groups.slice(1).map((group) => group.title)).toEqual(
      FONT_CATEGORIES.map((category) => FONT_CATEGORY_LABELS[category]),
    );
    // a used family stays in its category too, so the catalog reads whole
    expect(groups.find((group) => group.id === 'serif')?.rows.map((row) => row.id)).toEqual([
      'lora',
      'pt-serif',
    ]);
    // no used group without used families; empty categories are dropped
    const plain = groupRows(rows.slice(0, 2), []);
    expect(plain.map((group) => group.id)).toEqual(['sans']);
    expect(flatRows(groups)).toHaveLength(2 + rows.length);
  });

  it('searches names case folded and shows every row for an empty query', () => {
    expect(filterRows(rows, '').map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(filterRows(rows, 'SER').map((row) => row.id)).toEqual(['pt-serif']);
    expect(filterRows(rows, '  lo ').map((row) => row.id)).toEqual(['lora']);
    expect(filterRows(rows, 'zzz')).toEqual([]);
    expect(groupRows(rows, ['lora'], 'fira').map((group) => group.id)).toEqual(['mono']);
  });

  it('reads a block’s family, refuses a table and labels the theme face', () => {
    expect(familyOf(undefined)).toBeNull();
    expect(familyOf({ id: 'p', type: 'paragraph', text: 'x' } as never)).toBeNull();
    expect(
      familyOf({ id: 'p', type: 'paragraph', text: 'x', typography: { family: 'lora' } } as never),
    ).toBe('lora');
    expect(
      familyOf({ id: 'p', type: 'paragraph', text: 'x', typography: { family: 'inter' } } as never),
    ).toBeNull();
    expect(takesFamily({ id: 't', type: 'table' } as never)).toBe(false);
    expect(takesFamily({ id: 'p', type: 'paragraph', text: 'x' } as never)).toBe(true);
    expect(takesFamily(undefined)).toBe(false);
    expect(controlLabel(undefined)).toBe('Inter');
    expect(
      controlLabel({
        id: 'p',
        type: 'paragraph',
        text: 'x',
        typography: { family: 'lora' },
      } as never),
    ).toBe('Lora');
  });

  it('labels every id before the catalog answered and prefers the catalog’s name after', () => {
    for (const id of FONT_IDS) expect(familyLabel(id).length, id).toBeGreaterThan(0);
    expect(familyLabel('ibm-plex-mono')).toBe('IBM Plex Mono');
    expect(familyLabel('source-sans-3')).toBe('Source Sans 3');
    expect(familyLabel('pt-serif', rows)).toBe('PT Serif');
    expect(familyLabel('lora', [{ ...rows[2]!, name: 'Lora (catalog)' }])).toBe('Lora (catalog)');
  });

  it('lists the families a document uses in FONT_IDS order, never Inter, roles included', () => {
    const document = workedDocument();
    expect(usedFamilies(document)).toEqual([]);
    const slideId = 'content-rule';
    const slide = document.slides[slideId] as { slots: Record<string, unknown[]> };
    const withFamilies = {
      deck: { ...document.deck, themeEdits: { fonts: { display: 'oswald' as const } } },
      slides: {
        ...document.slides,
        [slideId]: {
          ...slide,
          slots: {
            ...slide.slots,
            left: [
              ...slide.slots.left!,
              { id: 'x1', type: 'paragraph', text: 'a', typography: { family: 'lora' } },
              { id: 'x2', type: 'paragraph', text: 'b', typography: { family: 'inter' } },
              { id: 'x3', type: 'paragraph', text: 'c', typography: { family: 'roboto' } },
            ],
          },
        },
      },
    };
    expect(usedFamilies(withFamilies as never)).toEqual(['roboto', 'lora', 'oswald']);
  });

  it('writes the family into the typography and removes it for the theme face', () => {
    expect(typographyWithFamily({ size: 20 }, 'lora')).toEqual({ size: 20, family: 'lora' });
    expect(typographyWithFamily({ size: 20, family: 'lora' }, null)).toEqual({ size: 20 });
    expect(typographyWithFamily({ family: 'lora' }, 'inter')).toEqual({});
  });

  it('names the stylesheet under the current alias and the font-family stack per row', () => {
    expect(fontsStylesheetHref(['roboto', 'lora'])).toBe('/fonts/faces/current/roboto+lora.css');
    expect(rowFamilyStack(rows[3]!)).toBe(`'PT Serif', ${CATEGORY_GENERIC.serif}`);
    expect(rowFamilyStack({ name: "O'Neil", category: 'mono' })).toBe(`'O\\'Neil', monospace`);
  });

  it('keeps the engineering vocabulary out of every word', () => {
    const words: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') words.push(value);
      else if (typeof value === 'function')
        words.push(String((value as (x: never) => string)('OFL 1.1' as never)));
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(FONT_PICKER);
    walk(FONT_CATEGORY_LABELS);
    for (const word of words) expect(forbiddenWordsIn(word), word).toEqual([]);
  });
});
