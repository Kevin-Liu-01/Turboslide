// The conversion a format write on a fixed kind's field needs first (docs/archive/rounds/RETURN.md 2.14 item 1;
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
import { isCanvasSlide, slideBlocks } from '@turboslide/schema/deck';
import type { Mutation, SlideFieldId } from '@turboslide/schema/mutations';
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
 * A text run on a title or statement slide's field (docs/archive/rounds/SYNC.md 3.4; the sync and costs round):
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

/**
 * The block a slide field became on the canvas a conversion made (schema/canvas.ts `toCanvas`):
 * the title's main slot lists the mark, the heading and the lead in that order, the statement's
 * lists the big line, and the record's ids are read the way the reducer's `deckTitleSource` reads
 * the heading's. Null when `after` is not a canvas of the field's kind or the block is not there.
 */
function canvasFieldBlockId(after: Slide, field: SlideFieldId): string | null {
  if (!isCanvasSlide(after) || after.grammar === undefined) return null;
  const main = after.grammar.slots?.main;
  const id =
    after.grammar.kind === 'title' && field === 'heading'
      ? (main?.[1] ?? 'heading')
      : after.grammar.kind === 'title' && field === 'lead'
        ? (main?.[2] ?? 'lead')
        : after.grammar.kind === 'statement' && field === 'big'
          ? (main?.[0] ?? 'big')
          : null;
  if (id === null) return null;
  const block = slideBlocks(after).find((each) => each.block.id === id)?.block;
  return block !== undefined && 'text' in block && typeof block.text === 'string' ? id : null;
}

/**
 * The write's field text runs re-addressed to the canvas the same write makes (VERIFICATION.md
 * "Polish round, pass 1" finding 1). A text run on the cover's heading names the field (`blockId`
 * `heading`, `path` `/heading`, docs/archive/rounds/SYNC.md 3.4) and converts nothing on its own; when another
 * mutation of the same write converts the slide first (the placeholder shrink's `block.set
 * /typography` and `/pos/h` on the title's last burst, docs/archive/rounds/POLISH.md 2.3 item 21), the measured
 * `slide.replace` travels in front and the run is applied to a content slide, where `heading` is
 * a block whose Text sits at `/text`: the reducer refused it as `/heading is not a string on
 * block "heading"` and the whole write with it, so a title that wrapped lost its last words on
 * the next reload and every later session on it was refused. The run's plain offsets are the
 * block's too, since the conversion carries the field's markup over unchanged. A run on another
 * slide, on a block, or on a field the canvas did not make is returned as it stands.
 */
export function retargetFieldRuns(
  before: Slide,
  after: Slide,
  mutations: ReadonlyArray<Mutation>,
): Mutation[] {
  return mutations.map((mutation) => {
    if (!('slideId' in mutation) || mutation.slideId !== before.id) return mutation;
    if (!isSlideFieldTextRun(before, mutation)) return mutation;
    if (
      mutation.op !== 'text.splice' &&
      mutation.op !== 'text.mark' &&
      mutation.op !== 'text.replace'
    )
      return mutation;
    const field = slideFieldOf(before, mutation.blockId);
    const blockId = field === null ? null : canvasFieldBlockId(after, field);
    if (blockId === null) return mutation;
    return { ...mutation, blockId, path: '/text' };
  });
}

/**
 * A write that converts a slide, split around the conversion's measure (realtime.title.two-typers):
 * the typed letters on the fields of a slide that is not converted yet (`text.splice` field runs,
 * which the reducer writes on the slide as it stands), and the rest, which waits for the measured
 * `slide.replace` as before (a mark rides the conversion, one undo step with it). The cover's
 * title converts with its session's final write (the shrunk size of a title that wrapped,
 * Editor.tsx growAfterBurst), and that write carried the session's last letters: they waited for
 * the measure, and another person's write that landed meanwhile left them at offsets the title no
 * longer had (" t2a2 ua" for " ta2 ua2"), or, when that write had converted the cover first, made
 * them a field run on a canvas that was refused and lost (" ua2" read " ua"). Written first, they
 * are an ordinary pending write the room client and the admission move past what lands.
 */
export function fieldRunsFirst(
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): { runs: Mutation[]; rest: Mutation[] } {
  const runs: Mutation[] = [];
  const rest: Mutation[] = [];
  for (const mutation of mutations) {
    const slide = 'slideId' in mutation ? document.slides[mutation.slideId] : undefined;
    if (
      slide !== undefined &&
      mutation.op === 'text.splice' &&
      isSlideFieldTextRun(slide, mutation)
    )
      runs.push(mutation);
    else rest.push(mutation);
  }
  return { runs, rest };
}
