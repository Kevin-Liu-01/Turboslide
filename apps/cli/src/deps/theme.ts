// The theme's copy lists and the sprite's icon names for the linter (SPEC 5.1 copy.ts; SPEC 4.2
// IconName), and the fonts CSS the contact sheet inlines for its labels.
import { ICON_NAMES } from '@turboslide/schema/icons';
import { PRODUCT_TOKENS, PROPER_NOUNS } from '@turboslide/theme/copy';

import { themeBundle } from './render.ts';

export type LintLists = {
  properNouns: readonly string[];
  tokens: readonly string[];
  iconNames: readonly string[];
};

export function lintLists(): LintLists {
  return { properNouns: PROPER_NOUNS, tokens: PRODUCT_TOKENS, iconNames: ICON_NAMES };
}

/** The InterVariable @font-face CSS with the woff2 inlined, for documents this binary writes. */
export function loadFontsCss(): string {
  return themeBundle().fontsCss;
}
