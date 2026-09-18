// The key the undo grouping compares (SPEC 7.2.15; gslides-parity SPEC-3 3.6): consecutive
// typing bursts on one Text inside TEXT_UNDO_GROUP_MS fold into one Cmd Z. Framework free.
import type { Mutation } from '@turboslide/schema/mutations';

/** The slide fields a title or statement slide's text runs write (render/slide.ts pseudo blocks). */
export const SLIDE_TEXT_FIELDS: ReadonlySet<string> = new Set(['/heading', '/lead', '/big']);

/**
 * The Text one typing burst writes, or null for any other write. A burst on a block's run is a
 * `text.splice`; a burst on a title or statement slide's text is the `slide.set` of the field,
 * because those runs are slide fields and every burst rewrites the field (InlineText
 * textCommitMutation). Without the second form each 100 ms burst of a title was its own undo
 * step (build-4/hotfix-4.md cause W10: Cmd Z after " undo" removed "do" and left " un").
 */
export function typingKeyOf(mutations: ReadonlyArray<Mutation>): string | null {
  const first = mutations[0];
  if (first === undefined) return null;
  if (mutations.length === 2) {
    // the autofit grow of a text box travels with the burst's splice as `block.set /pos/h` on the
    // same block (viewer/text-fit.ts growMutation, docs/FOCUS.md rank 11): the call keeps the
    // splice's key, so a burst that grows its box stays in the typing group and one Cmd Z removes
    // the letters and the growth together
    const second = mutations[1];
    if (
      first.op === 'text.splice' &&
      second !== undefined &&
      second.op === 'block.set' &&
      second.path === '/pos/h' &&
      second.slideId === first.slideId &&
      second.blockId === first.blockId
    )
      return `${first.slideId}/${first.blockId}${first.path}`;
    return null;
  }
  if (mutations.length !== 1) return null;
  if (first.op === 'text.splice') return `${first.slideId}/${first.blockId}${first.path}`;
  if (
    first.op === 'slide.set' &&
    typeof first.value === 'string' &&
    SLIDE_TEXT_FIELDS.has(first.path)
  )
    return `${first.slideId}${first.path}`;
  return null;
}
