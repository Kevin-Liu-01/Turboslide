// The auto-title of a fresh presentation (SPEC 6.3), the editor's own module. It lived in
// ../server/write.ts until the focus round (cycle 3 stream fix round's fix round; VERIFICATION
// C2-F18): the loaders of /new and /edit import that module, so its client copy rides the studio's
// entry chunk on every route, and this one pure function carried `plainText` (@turboslide/schema/text,
// whose zod schemas kept zod's 99 KB in the entry) and the chrome's strings there. Here it is
// reached from the controller alone and travels with the editor's chunk.
//
// The return round (docs/RETURN.md 2.18, `decks.name.follows-heading`): the name followed the
// heading once, on the first committed burst, so a slow typist's deck was named "Chrom" or "P"
// in the title row, Details, the Share dialog and every file name (audit-chrome row 2,
// audit-surface row 5). The name now follows the heading until the deck is renamed by hand: a
// rename is appended while the deck is still Untitled, or while its name is the heading the
// write starts from (the name this function gave it), or the last name this function wrote in
// this session. A name typed by hand differs from all three, so it stays; Google Docs names an
// untitled document from its first line the same way and stops once the name is edited.
//
// The product round (docs/PRODUCT.md 6.1 "Outside writes"; audit-assist 7): the rule follows a
// write to the first title whoever wrote it. The controller runs this same function over the
// document before a remote agent's op and commits the rename it answers (controller.tsx
// `announceAgentWrite`), so the deck's name and the tab title no longer diverge from the slide
// after an assistant or an agent over HTTP renamed the customer on the cover.
//
// The sync and costs round (docs/SYNC.md 3.4; build/b2.md R3): a heading burst is a text run
// (`text.splice` on the field) and the reducer derives the title from it (schema reduce.ts
// `followTitle`: the title follows the heading while it still reads the blank deck's title or
// the heading's previous text, a `deck.set /title` that made them differ wins until a set makes
// them equal, and the op's inverse restores the title), so the controller appends nothing here
// for a write that carries a text run (`withAutoTitle`, `announceAgentWrite`). This function
// still names the rename for the whole value writes the reducer does not derive from (a
// `slide.set` of the heading, a `slide.replace`, an agent's write of the field as one value).
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { applyMutation } from '@turboslide/schema/reduce';
import { plainText } from '@turboslide/schema/text';
import { TITLE_ROW } from '@turboslide/chrome/menus/strings';

/** What the controller remembers between writes: the last name this function wrote. */
export type AutoTitleMemory = { lastAuto: string | null };

/**
 * The heading Text of a title slide: the `heading` field of a grammar title slide, or the heading
 * block of a title slide converted to a canvas (schema/canvas.ts keeps `grammar.kind` 'title' and
 * the block id `heading`, or the id its record's main slot names second). Null for any other slide.
 */
export function titleHeadingOf(slide: Slide): string | null {
  if (slide.kind === 'title') return slide.heading;
  if (slide.kind !== 'content' || slide.grammar?.kind !== 'title') return null;
  const id = slide.grammar.slots?.main?.[1] ?? 'heading';
  const block = (slide.slots.main ?? []).find((each) => each.id === id);
  return block !== undefined && 'text' in block && typeof block.text === 'string' ? block.text : '';
}

/**
 * The heading of a title slide after the write's mutations for that slide apply, read on a copy
 * of the slide alone (the mutations of one write address one slide; a deck level mutation is
 * left aside). Null when the slide is not a title slide before or after, or a mutation fails
 * (the write itself will fail the same way).
 */
export function headingAfter(
  document: DeckDocument,
  slide: Slide,
  mutations: ReadonlyArray<Mutation>,
): string | null {
  if (titleHeadingOf(slide) === null) {
    // a slide.replace can turn another kind into a title slide; nothing else can
    if (!mutations.some((m) => m.op === 'slide.replace' && m.slideId === slide.id)) return null;
  }
  /* the probe owns every object the reducer can touch: the deck is cloned too, because
     `slide.remove` and `slide.move` splice the deck's `sections[].slideIds` in place, and a probe
     sharing the live deck removed the slide from its section before the real apply ran, whose
     inverse then carried no `after` (the undone delete put the slide at the front) or the wrong one
     (the undone drag left the dragged order): the four slides undo rows of the return round's
     gate (return/build/b4.md request 2). The two order mutations change no heading and are
     skipped as well, so the probe never reorders anything */
  const probe: DeckDocument = {
    deck: structuredClone(document.deck),
    slides: { [slide.id]: structuredClone(slide) },
  };
  try {
    for (const mutation of mutations) {
      if (mutation.op === 'slide.insert' || !('slideId' in mutation)) continue;
      if (mutation.slideId !== slide.id) continue;
      // the slide leaves the deck: no heading after the write
      if (mutation.op === 'slide.remove') return null;
      // a move changes no heading
      if (mutation.op === 'slide.move') continue;
      applyMutation(probe, mutation);
    }
  } catch {
    return null;
  }
  const after = probe.slides[slide.id];
  return after === undefined ? null : titleHeadingOf(after);
}

/**
 * The auto-title (SPEC 6.3, RETURN.md 2.18): the rename appended to a write that changes a title
 * slide's heading while the deck's name still follows it: one `deck.set /title` in the same
 * write, so one undo removes both. Pure: the editor's commit appends what this returns to the
 * write it is about to apply (the mutations are read as they stand, before the reducer runs); the
 * memory is the controller's, the last name this function wrote.
 */
export function autoTitleMutations(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
  memory: AutoTitleMemory = { lastAuto: null },
): Mutation[] {
  // TITLE_ROW.untitled is the store's DEFAULT_BLANK_TITLE; the chrome's strings module is the one
  // the browser can load (the store's templates module reaches node:fs at its top)
  const title = document.deck.title;
  if (mutations.some((mutation) => mutation.op === 'deck.set' && mutation.path === '/title'))
    return [];
  const seen = new Set<string>();
  for (const mutation of mutations) {
    const slideId =
      mutation.op === 'slide.insert'
        ? undefined
        : 'slideId' in mutation
          ? mutation.slideId
          : undefined;
    if (slideId === undefined || seen.has(slideId)) continue;
    seen.add(slideId);
    const slide = document.slides[slideId];
    if (slide === undefined) continue;
    const before = titleHeadingOf(slide);
    const after = headingAfter(document, slide, mutations);
    if (after === null) continue;
    const heading = plainText(after).trim();
    // an emptied heading keeps the name; the next typed heading takes it again
    if (heading === '' || heading === title) continue;
    const previous = before === null ? '' : plainText(before).trim();
    const follows =
      title === TITLE_ROW.untitled ||
      (previous !== '' && title === previous) ||
      (memory.lastAuto !== null && title === memory.lastAuto);
    if (!follows) return [];
    return [{ op: 'deck.set', path: '/title', value: heading }];
  }
  return [];
}
