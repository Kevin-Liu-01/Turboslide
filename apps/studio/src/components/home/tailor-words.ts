/**
 * The editor's Tailor words the landing's live modules use (packages/chrome/src/panels/
 * assist-strings.ts TAILOR): the menus band's Tools > Tailor dialog and the Tailor band's count
 * and snackbar. Copied, so the page's script after a full scroll does not carry the editor's
 * whole Assist strings module (3,187 B; docs/DESIGN.md 8.16, the design round's finishing round
 * 2); copy.test.ts pins every word to the editor's and both functions on a table of counts.
 */
export const TAILOR_WORDS = {
  title: 'Tailor for a customer',
  lead: 'Rename the customer, swap the pictures named after the old one and skip the slides they should not see, as one change',
  from: 'Replace',
  to: 'With',
  apply: 'Apply',
  cancel: 'Cancel',
  /** the count under With: the places and slides the name is on */
  count: (places: number, slides: number): string =>
    places === 0
      ? 'Not found in the text'
      : `${plural(places, 'place')} on ${plural(slides, 'slide')}`,
  /** the snackbar after Apply: the counts the pass made */
  result: (to: string, places: number, slides: number, skipped: number): string => {
    const head = to === '' ? 'Tailored' : `Tailored for ${to}`;
    const parts: string[] = [];
    if (places > 0) parts.push(`${plural(places, 'place')} on ${plural(slides, 'slide')}`);
    if (skipped > 0) parts.push(`${plural(skipped, 'slide')} skipped`);
    return parts.length === 0 ? head : `${head}: ${parts.join(', ')}`;
  },
} as const;

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
