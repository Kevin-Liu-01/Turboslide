import type { SectionIconName } from './copy';

/**
 * The Heroicon 20 solid of a key cell on /home (docs/LANDING.md 2.0 "Shape", 2.9; DECK-GRAMMAR 40:
 * an icon sits only in a key cell, never before a heading, and never `sparkles` or
 * `cursor-arrow-rays`): the parts table's eight rows and Version history's author cell. Every name
 * comes from the theme sprite (`packages/theme/assets/sprite-ids.json`), written by the build into
 * `icons.generated.css` as a mask over the text's colour, so the document carries no path of
 * them (the 80 KB line of LANDING.md 4.1). 16 px, decorative.
 */
export function SectionIcon({ name }: { name: SectionIconName }) {
  return <i className="ts-icon" data-icon={name} aria-hidden="true" />;
}

/** An icon's markup for server written rows: the same element `SectionIcon` draws. */
export function iconMarkup(name: SectionIconName): string {
  return `<i class="ts-icon" data-icon="${name}" aria-hidden="true"></i>`;
}
