// The icon names the grammar allows (SPEC 4.2: "IconName is the sprite's 63 symbols plus
// gt-mark"; DECK-GRAMMAR.md:40; M5 added lock-closed, the closed lock slide 83 defined inline; the
// editor depth round added the three bars glyphs the arrange bar's align buttons draw,
// packages/chrome/src/Overlay.tsx). The list mirrors packages/theme/assets/sprite-ids.json in sprite
// order without the `i-` prefix; the theme's sprite test asserts the two agree, and the
// `icon/known` lint rule checks against this list. A new Heroicon is added with the theme's
// add-icon script and then appended to ./icon-names.ts, which holds the list, the hues,
// `iconSymbolId` and `isIconName` without zod since the focus round (VERIFICATION C2-F18); this
// module is the schema over that list and re-exports the names for the readers that need both.
import { z } from 'zod';

import { ICON_NAMES } from './icon-names.ts';

export type { IconColor, IconName } from './icon-names.ts';
export { ICON_COLORS, ICON_NAMES, iconSymbolId, isIconName } from './icon-names.ts';

export const iconNameSchema = z.enum(ICON_NAMES);
