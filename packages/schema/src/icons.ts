// The icon names the grammar allows (SPEC 4.2: "IconName is the sprite's 63 symbols plus
// gt-mark"; DECK-GRAMMAR.md:40). The list mirrors packages/theme/assets/sprite-ids.json in sprite
// order without the `i-` prefix; the theme's sprite test asserts the two agree, and the
// `icon/known` lint rule checks against this list. A new Heroicon is added with the theme's
// add-icon script and then appended here.
import { z } from 'zod';

export const ICON_NAMES = [
  'gt-mark',
  'check-circle',
  'x-circle',
  'clock',
  'exclamation-circle',
  'arrow-top-right-on-square',
  'arrow-right',
  'arrow-up',
  'swatch',
  'document-text',
  'sparkles',
  'globe-alt',
  'signal',
  'folder',
  'presentation-chart-bar',
  'play',
  'arrows-right-left',
  'arrows-up-down',
  'archive-box',
  'bolt',
  'rectangle-stack',
  'list-bullet',
  'photo',
  'cube',
  'map',
  'key',
  'lock-open',
  'star',
  'book-open',
  'squares-2x2',
  'code-bracket',
  'command-line',
  'building-office-2',
  'briefcase',
  'user-group',
  'user-circle',
  'scale',
  'finger-print',
  'eye',
  'eye-slash',
  'pencil-square',
  'chat-bubble-left-right',
  'clipboard-document-check',
  'wrench-screwdriver',
  'cog-6-tooth',
  'pause-circle',
  'adjustments-horizontal',
  'plus',
  'device-phone-mobile',
  'language',
  'table-cells',
  'envelope',
  'server',
  'paint-brush',
  'home',
  'tag',
  'newspaper',
  'magnifying-glass',
  'rocket-launch',
  'check-badge',
  'beaker',
  'bars-3',
  'view-columns',
  'identification',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const iconNameSchema = z.enum(ICON_NAMES);

/** The four semantic hues live only on icons (DECK-GRAMMAR.md:30; head:113-116). */
export const ICON_COLORS = ['ok', 'warn', 'no', 'info'] as const;
export type IconColor = (typeof ICON_COLORS)[number];

/** The sprite symbol id for an icon name: 'check-circle' is '#i-check-circle', the mark is '#gt-mark'. */
export function iconSymbolId(name: IconName): string {
  return name === 'gt-mark' ? 'gt-mark' : `i-${name}`;
}

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as ReadonlyArray<string>).includes(value);
}
