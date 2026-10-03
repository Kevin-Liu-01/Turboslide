// Two people typing into a cover that converts to a canvas (the realtime round, fix round 3;
// docs/gslides-parity/focus/VERIFICATION.md "Realtime round, pass 3" finding 3, the rows
// `realtime.title.two-typers` and `sync.title.concurrent-both-kept`). The rules the admission
// applies when an entry carries a slide's conversion or a text op on a cover's field, in a module
// with nothing but the schema under it, so the room client can apply the same rules to its
// pending ops (build/r1.md "Realtime round fix round 3", request R1-R2k). room-core.ts
// `transformEntry` calls them and re-exports them.
//
// A cover's title is a slide field while the slide is a title slide: its text ops name the field
// (`blockId` `heading`, `path` `/heading`, docs/archive/rounds/SYNC.md 3.4). When the title wraps, each tab's
// Escape writes the shrunk size, and the size write converts the cover to a canvas first
// (apps/studio convert-first.ts): the entry is `slide.replace` with the tab's own copy of the
// cover as a canvas, then the tab's unsent words retargeted to the canvas's `heading` block
// (`path` `/text`), then the size and the height. Each tab measures its own copy, so each copy
// lacks the words the other person typed since that tab last heard from the room. R1's two
// process run of fix round 3 read the object's admissions of a red standing row: B's conversion
// with its word landed first; A's POST then carried A's last word as a field run, refused on the
// canvas ("text.splice: /heading is not a string on block heading"), and A's conversion with the
// size writes alone, which replaced the slide with A's copy and lost B's word.
import type { ContentSlide, DeckDocument, Slide } from '@turboslide/schema/deck';
import { isCanvasSlide, slideBlocks } from '@turboslide/schema/deck';
import type { Mutation, SlideFieldId, TextOp } from '@turboslide/schema/mutations';
import { isSlideFieldPath } from '@turboslide/schema/mutations';
import { isTextOp } from '@turboslide/schema/transform';

/** A mutation that landed since an entry's base, as room-core.ts `Landed` carries it. */
export type LandedRow = { mutation: Mutation };

/** The block ids a canvas made of each slide field, by slide id (null: no such canvas). */
type Canvases = ReadonlyMap<string, ReadonlyMap<SlideFieldId, string> | null>;

/** True for a text op on a slide field (`heading`, `lead`, `big`) in the field's own shape. */
export function isFieldRun(mutation: Mutation): mutation is TextOp {
  return (
    isTextOp(mutation) &&
    isSlideFieldPath(mutation.path) &&
    mutation.blockId === mutation.path.slice(1)
  );
}

/**
 * The block each slide field became on a canvas a conversion made (schema canvas.ts `toCanvas`):
 * the title's main slot lists the mark, the heading and the lead in that order, the statement's
 * lists the big line. Null for a slide that is not a canvas made from a title or a statement, or
 * when none of those blocks carries a text. The ids are read the way apps/studio convert-first.ts
 * `canvasFieldBlockId` reads them.
 */
export function canvasFieldBlocks(slide: Slide): ReadonlyMap<SlideFieldId, string> | null {
  if (!isCanvasSlide(slide) || slide.grammar === undefined) return null;
  const main = slide.grammar.slots?.main;
  const ids = new Map<SlideFieldId, string>();
  if (slide.grammar.kind === 'title') {
    ids.set('heading', main?.[1] ?? 'heading');
    ids.set('lead', main?.[2] ?? 'lead');
  } else if (slide.grammar.kind === 'statement') {
    ids.set('big', main?.[0] ?? 'big');
  } else {
    return null;
  }
  const texts = new Set(
    slideBlocks(slide)
      .filter(({ block }) => 'text' in block && typeof block.text === 'string')
      .map(({ block }) => block.id),
  );
  for (const [field, id] of ids) if (!texts.has(id)) ids.delete(field);
  return ids.size === 0 ? null : ids;
}

/**
 * True for an editor's conversion: a `slide.replace` whose slide is a canvas carrying the record
 * of the slide it was made from (`grammar`), in an entry that also writes on that slide (the
 * gesture's writes, the format write, the cover's size and height at Escape; viewer Editor.tsx
 * and apps/studio convert-first.ts put the measured replacement in front of them). A bare
 * `slide.replace` (the source drawer, `slide.toCanvas`, the undo of a restore) is not one.
 */
export function isConversion(mutation: Mutation, mutations: readonly Mutation[]): boolean {
  if (mutation.op !== 'slide.replace') return false;
  if (!isCanvasSlide(mutation.slide) || mutation.slide.grammar === undefined) return false;
  return mutations.some(
    (other) => other !== mutation && 'slideId' in other && other.slideId === mutation.slideId,
  );
}

/**
 * Two tabs converting one slide at once (the realtime round, R1's two process run; the row
 * `realtime.title.two-typers`, and the mechanism behind the standing red
 * `sync.title.concurrent-both-kept`): a title that wraps while two people type into it converts
 * the cover to a canvas in both tabs within the same batch (viewer Editor.tsx 1786, 1812), so
 * each tab posts `slide.replace` with its own copy of the slide beside its writes. The first
 * lands; the second's `slide.replace` would put back a slide without the first's word. The
 * rules, each of which drops the entry's own `slide.replace` and keeps the rest:
 *
 * 1. An entry that carries a `slide.replace` of a slide another `slide.replace` of the same slide
 *    replaced since its base, together with a text op on that slide (the rule since the realtime
 *    round), so the second typist's word rides onto the first conversion through the transform.
 * 2. An editor's conversion (`isConversion`) of a slide another replacement replaced since the
 *    entry's base, or of a slide the document already holds as a canvas made from the same kind
 *    (`document`; the tab measured its copy before it heard of the other's conversion): the
 *    slide is converted already, so the entry's writes land on it as it stands. Fix round 3: an
 *    Escape whose words went out in an earlier entry carries the size writes alone, so rule 1
 *    did not read it and its copy replaced the other person's.
 *
 * A bare `slide.replace` (the source drawer, `slide.toCanvas`) keeps the last writer wins rule as
 * before. Pure.
 */
export function yieldConcurrentConversion(
  mutations: readonly Mutation[],
  landed: ReadonlyArray<LandedRow>,
  document?: DeckDocument,
): Mutation[] {
  const replaced = new Set<string>();
  for (const { mutation } of landed)
    if (mutation.op === 'slide.replace') replaced.add(mutation.slideId);
  const typedOn = new Set<string>();
  for (const mutation of mutations) if (isTextOp(mutation)) typedOn.add(mutation.slideId);
  const convertedAlready = (mutation: Extract<Mutation, { op: 'slide.replace' }>): boolean => {
    if (replaced.has(mutation.slideId)) return true;
    const current = document?.slides[mutation.slideId];
    return (
      current !== undefined &&
      isCanvasSlide(current) &&
      current.grammar?.kind !== undefined &&
      current.grammar.kind === (mutation.slide as ContentSlide).grammar?.kind
    );
  };
  return mutations.filter((mutation) => {
    if (mutation.op !== 'slide.replace') return true;
    if (replaced.has(mutation.slideId) && typedOn.has(mutation.slideId)) return false;
    return !(isConversion(mutation, mutations) && convertedAlready(mutation));
  });
}

/**
 * An editor's conversion of a cover carries the cover's words as the document holds them: the
 * tab measured its copy of the slide when its Escape wrote the shrunk size, and the other
 * person's words that landed after that tab last heard from the room are in the document and not
 * in the copy, so the replacement would remove them. A conversion does not change the text it
 * carries (schema canvas.ts `toCanvas` copies each field's markup into its block), so the text of
 * each field block of the replacement is the document's field text. Only a conversion
 * (`isConversion`) of a slide the document holds as the kind the canvas was made from is
 * touched; a bare replacement keeps its own text. The entry's own words after the replacement are
 * in the copy's frame and move past the landed field runs in room-core.ts `transformEntry`. Pure.
 */
export function carryFieldText(mutations: readonly Mutation[], document: DeckDocument): Mutation[] {
  return mutations.map((mutation) => {
    if (mutation.op !== 'slide.replace' || !isConversion(mutation, mutations)) return mutation;
    const current = document.slides[mutation.slideId];
    const slide = mutation.slide;
    if (current === undefined || !isCanvasSlide(slide)) return mutation;
    if (slide.grammar?.kind !== current.kind) return mutation;
    const blocks = canvasFieldBlocks(slide);
    if (blocks === null) return mutation;
    const texts = new Map<string, string>();
    for (const [field, blockId] of blocks) {
      const text =
        current.kind === 'title' && (field === 'heading' || field === 'lead')
          ? current[field]
          : current.kind === 'statement' && field === 'big'
            ? current.big
            : undefined;
      if (typeof text === 'string') texts.set(blockId, text);
    }
    let changed = false;
    const slots: ContentSlide['slots'] = {};
    for (const [name, list] of Object.entries(slide.slots) as [
      keyof ContentSlide['slots'],
      NonNullable<ContentSlide['slots'][keyof ContentSlide['slots']]>,
    ][]) {
      const next = list.map((block) => {
        const text = texts.get(block.id);
        return text === undefined || !('text' in block) || block.text === text
          ? block
          : { ...block, text };
      });
      if (next.some((block, i) => block !== list[i])) changed = true;
      slots[name] = next;
    }
    return changed ? { ...mutation, slide: { ...slide, slots } } : mutation;
  });
}

/**
 * A cover's field run and the block the field became on its canvas are one text: the conversion
 * copies the field's markup into the block unchanged, so an offset in one is the same offset in
 * the other. The slides whose canvas the transform reads: the entry's own conversion, the last
 * landed replacement of the slide when it is a canvas made from a title or a statement, and the
 * document's slide when it is such a canvas. `read` re-addresses a landed field run to the block,
 * so the entry's words on the block move past the words the other person typed into the field;
 * `retarget` re-addresses the entry's own field runs on a slide that is a canvas already (landed
 * or in the document), which the reducer refused before ("/heading is not a string on block
 * heading", the entry and its word lost). Pure.
 */
export function fieldRunsOnCanvas(
  mutations: readonly Mutation[],
  landed: ReadonlyArray<LandedRow>,
  document?: DeckDocument,
): { read: (mutation: Mutation) => Mutation; retarget: (mutation: Mutation) => Mutation } {
  /* the canvas each slide is on before the entry applies (landed or in the document) */
  const before = new Map<string, ReadonlyMap<SlideFieldId, string> | null>();
  for (const { mutation } of landed)
    if (mutation.op === 'slide.replace')
      before.set(mutation.slideId, canvasFieldBlocks(mutation.slide));
  if (document !== undefined)
    for (const mutation of mutations) {
      if (!('slideId' in mutation) || before.has(mutation.slideId)) continue;
      const slide = document.slides[mutation.slideId];
      if (slide !== undefined) before.set(mutation.slideId, canvasFieldBlocks(slide));
    }
  /* and the canvas the entry's own conversion makes, which the landed field runs are read on */
  const after = new Map(before);
  for (const mutation of mutations)
    if (mutation.op === 'slide.replace') {
      const blocks = canvasFieldBlocks(mutation.slide);
      if (blocks !== null) after.set(mutation.slideId, blocks);
    }
  const onCanvas = (mutation: Mutation, canvases: Canvases): Mutation => {
    if (!isFieldRun(mutation)) return mutation;
    const blockId = canvases.get(mutation.slideId)?.get(mutation.path.slice(1) as SlideFieldId);
    return blockId === undefined ? mutation : { ...mutation, blockId, path: '/text' };
  };
  return {
    read: (mutation) => onCanvas(mutation, after),
    retarget: (mutation) => onCanvas(mutation, before),
  };
}
