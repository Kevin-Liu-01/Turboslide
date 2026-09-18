// The auto-title of a fresh presentation (SPEC 6.3), the editor's own module. It lived in
// ../server/write.ts until the focus round (cycle 3 stream fix round's fix round; VERIFICATION
// C2-F18): the loaders of /new and /edit import that module, so its client copy rides the studio's
// entry chunk on every route, and this one pure function carried `plainText` (@turboslide/schema/text,
// whose zod schemas kept zod's 99 KB in the entry) and the chrome's strings there. Here it is
// reached from the controller alone and travels with the editor's chunk.
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { plainText } from '@turboslide/schema/text';
import { TITLE_ROW } from '@turboslide/chrome/menus/strings';

/**
 * The auto-title (SPEC 6.3): a presentation still named "Untitled presentation" takes the title
 * slide's heading as its title the first time that heading is committed non-empty, as a second
 * `deck.set /title` in the same write, so one undo removes both. Pure: the editor's commit
 * appends what this returns to the write it is about to apply (the mutations are read as they
 * stand, before the reducer runs).
 */
export function autoTitleMutations(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): Mutation[] {
  // TITLE_ROW.untitled is the store's DEFAULT_BLANK_TITLE; the chrome's strings module is the one
  // the browser can load (the store's templates module reaches node:fs at its top)
  if (document.deck.title !== TITLE_ROW.untitled) return [];
  if (mutations.some((mutation) => mutation.op === 'deck.set' && mutation.path === '/title'))
    return [];
  for (const mutation of mutations) {
    // the title slide's heading is a slide field, written by slide.set /heading (InlineText's
    // textCommitMutation) or by a whole slide.replace; block text never names it
    let slideId: string | undefined;
    let value: unknown;
    if (mutation.op === 'slide.set' && mutation.path === '/heading') {
      slideId = mutation.slideId;
      value = mutation.value;
    } else if (mutation.op === 'slide.replace' && mutation.slide.kind === 'title') {
      slideId = mutation.slide.id;
      value = mutation.slide.heading;
    }
    if (slideId === undefined) continue;
    const slide = document.slides[slideId];
    if (slide === undefined || slide.kind !== 'title') continue;
    const heading = typeof value === 'string' ? plainText(value).trim() : '';
    if (heading === '') continue;
    return [{ op: 'deck.set', path: '/title', value: heading }];
  }
  return [];
}
