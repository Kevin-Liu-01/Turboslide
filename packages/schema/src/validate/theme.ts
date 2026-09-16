// The `theme` validator family (gslides-parity SPEC-5 1.2, 9.1; R03 4.2): the colour slots of
// `themeEdits.colors` and of an imported record are the names below (an unknown one is refused),
// a picture in the corner slot names an asset the deck holds, a slot box lies on the page, and a
// rail inset leaves a sheet. The zod schemas of `deck.ts` refuse the shape rules (the `#rrggbb`
// form, the five record cap, the font ids, the inset's 0 to 400 range); this module holds the
// cross reference rules and answers `Issue[]` for `validateDeck`. B6's from day 1 (MILESTONES-5
// B6 "Owns").
//
// The slot table lives here rather than in the theme package because the schema is the bottom
// of the one way dependency direction (SPEC 3.3 item 3): `packages/theme` (the override
// stylesheet's keys), `packages/chrome` (the Colors dropdown), `packages/export` (the theme part)
// and `packages/import` (Import theme's reverse mapping) all read it from
// `@turboslide/schema/validate/theme`.
import type { DeckDocument, ThemeBox } from '../deck.ts';
import { deckPage } from '../render.ts';
import type { Issue } from '../validate.ts';

/**
 * Google's twelve Colors dropdown names in Google's order over the Turboslide slot each writes
 * (R03 4.2; SPEC-5 9.1). The first ten keys of `TOKEN_NAMES` (packages/theme tokens.ts) are the
 * sheet tokens; `ok`, `warn`, `no` and `info` are the four semantic hues (the icons' colours and
 * Google's Accent 1 to 4), `raised` the code panel's ground (Accent 6), `link` the link colour. The
 * followed link (FOLLOWED_HYPERLINK) has no dropdown row and maps to `titanium` in the export.
 * `alpha` marks the four slots whose picker offers transparency (the accents do not, because an
 * accent with alpha would break the exporter's composite rule, SPEC 5.1).
 */
export const THEME_COLOR_SLOTS = [
  { key: 'ink', google: 'Text and background 1', api: 'DARK1', alpha: true },
  { key: 'paper', google: 'Text and background 2', api: 'LIGHT1', alpha: true },
  { key: 'ink-2', google: 'Text and background 3', api: 'DARK2', alpha: true },
  { key: 'plate', google: 'Text and background 4', api: 'LIGHT2', alpha: true },
  { key: 'ok', google: 'Accent 1', api: 'ACCENT1', alpha: false },
  { key: 'warn', google: 'Accent 2', api: 'ACCENT2', alpha: false },
  { key: 'no', google: 'Accent 3', api: 'ACCENT3', alpha: false },
  { key: 'info', google: 'Accent 4', api: 'ACCENT4', alpha: false },
  { key: 'titanium', google: 'Accent 5', api: 'ACCENT5', alpha: false },
  { key: 'raised', google: 'Accent 6', api: 'ACCENT6', alpha: false },
  { key: 'link', google: 'Link', api: 'HYPERLINK', alpha: false },
] as const;

export type ThemeColorSlot = (typeof THEME_COLOR_SLOTS)[number];
export type ThemeColorSlotKey = ThemeColorSlot['key'];

/**
 * The derived tokens (alpha forms of the ink, R03 4.2): not in the dropdown, recomputed from an
 * edited ink by the override stylesheet, and admitted as explicit keys so an agent can pin one.
 */
export const THEME_DERIVED_TOKENS = ['hair', 'hair-soft', 'cross', 'edge', 'thumb'] as const;
export type ThemeDerivedToken = (typeof THEME_DERIVED_TOKENS)[number];

/** Every key `themeEdits.colors.<appearance>` and `ThemeRecord.colors` may carry. */
export const THEME_COLOR_KEYS: ReadonlyArray<ThemeColorSlotKey | ThemeDerivedToken> = [
  ...THEME_COLOR_SLOTS.map((slot) => slot.key),
  ...THEME_DERIVED_TOKENS,
];
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export function isThemeColorKey(value: string): value is ThemeColorKey {
  return (THEME_COLOR_KEYS as ReadonlyArray<string>).includes(value);
}

const DECK_FILE = 'deck.json';

function issue(
  code: Issue['code'],
  severity: Issue['severity'],
  pointer: string,
  message: string,
): Issue {
  return { code, severity, file: DECK_FILE, pointer, message };
}

function checkColorKeys(map: Record<string, string> | undefined, pointer: string): Issue[] {
  if (map === undefined) return [];
  return Object.keys(map)
    .filter((key) => !isThemeColorKey(key))
    .map((key) =>
      issue(
        'theme',
        3,
        `${pointer}/${key}`,
        `Unknown colour slot "${key}"; the slots are ${THEME_COLOR_KEYS.join(', ')} (gslides-parity SPEC-5 9.1; R03 4.2)`,
      ),
    );
}

function checkBox(
  box: ThemeBox | undefined,
  pointer: string,
  page: { width: number; height: number },
  what: string,
): Issue[] {
  if (box === undefined) return [];
  const [x, y, w, h] = box;
  if (x < 0 || y < 0 || x + w > page.width || y + h > page.height) {
    return [
      issue(
        'theme',
        2,
        pointer,
        `The ${what} box ${x}, ${y}, ${w} by ${h} lies outside the ${page.width} by ${page.height} page (gslides-parity SPEC-5 9.2)`,
      ),
    ];
  }
  return [];
}

export function validateTheme(document: DeckDocument): Issue[] {
  const issues: Issue[] = [];
  const { deck } = document;
  const page = deckPage(deck);
  const edits = deck.themeEdits;
  if (edits !== undefined) {
    issues.push(...checkColorKeys(edits.colors?.light, '/themeEdits/colors/light'));
    issues.push(...checkColorKeys(edits.colors?.dark, '/themeEdits/colors/dark'));
    const mark = edits.mark;
    if (mark !== undefined) {
      if (mark.kind === 'picture') {
        if (mark.assetId === undefined) {
          issues.push(
            issue(
              'theme',
              3,
              '/themeEdits/mark/assetId',
              'A picture in the corner slot names the asset it shows (gslides-parity SPEC-5 9.1)',
            ),
          );
        } else if (deck.assets[mark.assetId] === undefined) {
          issues.push(
            issue(
              'reference',
              3,
              '/themeEdits/mark/assetId',
              `The corner slot names asset "${mark.assetId}", which the deck does not hold`,
            ),
          );
        }
      } else if (mark.assetId !== undefined) {
        issues.push(
          issue(
            'theme',
            2,
            '/themeEdits/mark/assetId',
            `The corner slot's asset is read for the picture kind alone; the kind is "${mark.kind}"`,
          ),
        );
      }
      issues.push(...checkBox(mark.box, '/themeEdits/mark/box', page, 'corner slot'));
    }
    issues.push(...checkBox(edits.counter?.box, '/themeEdits/counter/box', page, 'counter'));
    const inset = edits.frame?.inset;
    if (inset !== undefined && inset * 2 >= Math.min(page.width, page.height)) {
      issues.push(
        issue(
          'theme',
          3,
          '/themeEdits/frame/inset',
          `A rail inset of ${inset} leaves no sheet inside the ${page.width} by ${page.height} page`,
        ),
      );
    }
  }
  (deck.importedThemes ?? []).forEach((record, index) => {
    issues.push(...checkColorKeys(record.colors, `/importedThemes/${index}/colors`));
  });
  return issues;
}
