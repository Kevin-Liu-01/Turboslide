// The conversion a format write on a fixed kind's field needs first (docs/RETURN.md 2.14 item 1;
// FOCUS.md 2.5; SPEC-2 1.6). The cover title keeps `heading` and `lead` as slide fields, a
// statement keeps `big`, and the picture kinds keep their photograph and plate; the renderer
// draws them as objects under fixed ids and the menus plan writes against those ids
// (editor-shell.ts `pseudoBlockOf`). The reducer knows only blocks, so `block.set /typography` on
// `heading` of a title slide answered `No block "heading" on slide "title"` and the revision did
// not move (audit-formatting rows 3 to 7). The Align rows already convert such a slide to a
// canvas in the same write through the store's `withCanvas` (a measured `slide.replace` in front
// of the gesture's mutations, one revision and one undo step); the editor's commit does the same
// for every write that names a field object, so Bold, Center, the size, a mark, a colour and
// Clear formatting land on the cover title from one click. Pure: this module says which slide
// needs converting; the controller measures and converts.
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { slideFieldOf, slideFieldPath } from '@turboslide/schema/mutations';

/**
 * The ids a fixed kind's fields carry as objects before the slide converts: the ones the renderer
 * gives them and `toCanvas` keeps (schema/canvas.ts: `heading`, `lead`, `mark`; `big`; `picture`,
 * `plate`, `mark`), so a selection survives the first write.
 */
export function fieldObjectIds(slide: Slide): ReadonlySet<string> {
  switch (slide.kind) {
    case 'title':
      return new Set(['heading', 'lead', 'mark']);
    case 'statement':
      return new Set(['big']);
    case 'opener':
    case 'mood':
    case 'closing':
      return new Set(['picture', 'plate', 'mark']);
    default:
      return new Set();
  }
}

/**
 * A text run on a title or statement slide's field (docs/SYNC.md 3.4; the sync and costs round):
 * `text.splice`, `text.mark` or `text.replace` whose `blockId` names a field of the slide's kind
 * and whose `path` is the field's own pointer (schema mutations.ts `slideFieldOf`,
 * `slideFieldPath`). The reducer writes the field in place, so such a write addresses no block
 * and never asks for the conversion: typing into the cover keeps its kind and the first format
 * write alone converts it (build/b2.md R2).
 */
export function isSlideFieldTextRun(slide: Slide, mutation: Mutation): boolean {
  if (
    mutation.op !== 'text.splice' &&
    mutation.op !== 'text.mark' &&
    mutation.op !== 'text.replace'
  )
    return false;
  const field = slideFieldOf(slide, mutation.blockId);
  return field !== null && mutation.path === slideFieldPath(field);
}

/**
 * The slide a write must convert to a canvas before its mutations apply: the first one whose
 * mutation names a block that is one of the slide's field objects and not a block of the slide.
 * Null when every named block exists (the common case, one Set lookup per mutation on a fixed
 * kind and nothing on a content slide). A text run on a slide field (`isSlideFieldTextRun`) is
 * read past: it writes the field itself.
 */
export function slideToConvertFor(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): string | null {
  for (const mutation of mutations) {
    if (!('blockId' in mutation) || !('slideId' in mutation)) continue;
    const slide = document.slides[mutation.slideId];
    if (slide === undefined || slide.kind === 'content') continue;
    if (!fieldObjectIds(slide).has(mutation.blockId)) continue;
    if (isSlideFieldTextRun(slide, mutation)) continue;
    if (slideBlocks(slide).some(({ block }) => block.id === mutation.blockId)) continue;
    return slide.id;
  }
  return null;
}
