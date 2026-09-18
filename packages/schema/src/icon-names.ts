// The icon names without their schema (SPEC 4.2; the list ./icons.ts describes): the names, the
// four semantic hues, `iconSymbolId` and `isIconName`, importing nothing. Split from ./icons.ts in
// the focus round (cycle 3 stream fix round's fix round; VERIFICATION C2-F18): the theme's sprite
// and the renderer's primitives read `iconSymbolId`, and through ./icons.ts, whose
// `iconNameSchema` is a top level `z.enum`, they carried zod (99 KB decoded) into /home, /present
// and /deck. ./icons.ts keeps the schema over this list and re-exports the names, so a reader of
// the schema keeps one import.

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
  'lock-closed',
  'bars-3-bottom-left',
  'bars-3-center-left',
  'bars-3-bottom-right',
  // round three (gslides-parity SPEC-3 5.3, 5.5; build-3/b6.md request 2): the inbox plate and Notification settings
  'bell',
  'inbox',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

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
