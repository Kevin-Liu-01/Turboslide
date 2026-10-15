import {
  ARROW_LEFT,
  ARROW_RIGHT,
  BOOK_OPEN,
  CHAT_BUBBLE_LEFT_RIGHT,
  CLIPBOARD_DOCUMENT,
  CODE_BRACKET,
  COMMAND_LINE,
  DOCUMENT_TEXT,
  EXCLAMATION_TRIANGLE,
  GLOBE_ALT,
  Glyph,
  INFORMATION_CIRCLE,
  LIGHT_BULB,
  PENCIL_SQUARE,
  PHOTO,
  PLAY,
  PLUS,
  PRESENTATION_CHART_BAR,
  PRESENTATION_CHART_LINE,
  PUZZLE_PIECE,
  QUEUE_LIST,
  WINDOW,
} from '@turboslide/chrome/icons';

/**
 * The solid icons of /home and /docs (docs/SITE.md D11): Heroicons 20 solid from the chrome's one
 * icon module, picked by name from its exported constants, so the pages carry the paths they draw
 * and none of the editor's table. Every glyph is `currentColor`, 16 px unless a size is given,
 * and `aria-hidden`: the word beside it is the name.
 */
const SITE_GLYPHS = {
  'arrow-left': ARROW_LEFT,
  'arrow-right': ARROW_RIGHT,
  'book-open': BOOK_OPEN,
  'chat-bubble-left-right': CHAT_BUBBLE_LEFT_RIGHT,
  'clipboard-document': CLIPBOARD_DOCUMENT,
  'code-bracket': CODE_BRACKET,
  'command-line': COMMAND_LINE,
  'document-text': DOCUMENT_TEXT,
  'exclamation-triangle': EXCLAMATION_TRIANGLE,
  'globe-alt': GLOBE_ALT,
  'information-circle': INFORMATION_CIRCLE,
  'light-bulb': LIGHT_BULB,
  'pencil-square': PENCIL_SQUARE,
  photo: PHOTO,
  play: PLAY,
  plus: PLUS,
  'presentation-chart-bar': PRESENTATION_CHART_BAR,
  'presentation-chart-line': PRESENTATION_CHART_LINE,
  'puzzle-piece': PUZZLE_PIECE,
  'queue-list': QUEUE_LIST,
  window: WINDOW,
} as const;

export type SiteIconName = keyof typeof SITE_GLYPHS;

export const SITE_ICON_NAMES = Object.keys(SITE_GLYPHS) as SiteIconName[];

export function SiteIcon({ name, size = 16 }: { name: SiteIconName; size?: 16 | 20 }) {
  return <Glyph paths={SITE_GLYPHS[name]} size={size} />;
}
