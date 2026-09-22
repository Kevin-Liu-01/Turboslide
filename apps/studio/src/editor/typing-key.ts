// The key the undo grouping compares (SPEC 7.2.15; gslides-parity SPEC-3 3.6): consecutive
// typing bursts on one Text inside TEXT_UNDO_GROUP_MS fold into one Cmd Z. Framework free.
import type { Mutation } from '@turboslide/schema/mutations';

/** The slide fields a title or statement slide's whole value writes name (render/slide.ts pseudo blocks). */
export const SLIDE_TEXT_FIELDS: ReadonlySet<string> = new Set(['/heading', '/lead', '/big']);

/**
 * The Text one typing burst writes, or null for any other write. A burst on a block's run is a
 * `text.splice`, and since the sync and costs round so is a burst on a title or statement
 * slide's field: it travels as `text.splice { blockId: <the field>, path: '/heading' | '/lead' |
 * '/big' }` (docs/SYNC.md 3.4; InlineText textBurstMutation), so it takes the splice key
 * `<slideId>/<field><path>` and the bursts of one word fold into one Cmd Z as a block's do. The
 * `slide.set` form below is the whole value write of a field (a markup change with no flag
 * behind it, the Escape commit, an agent's write), which keys by the field the same way; before
 * that round every burst of a title was a `slide.set` and without this form each 100 ms burst
 * was its own undo step (build-4/hotfix-4.md cause W10: Cmd Z after " undo" removed "do" and
 * left " un").
 */
export function typingKeyOf(mutations: ReadonlyArray<Mutation>): string | null {
  /* a rename appended to a burst is read past, never as the burst's own key, so the bursts of one
     word still fold into one Cmd Z. Since the sync and costs round the reducer derives the deck
     title from a heading burst itself (schema reduce.ts followTitle; docs/SYNC.md 3.4) and the
     controller appends no `deck.set /title` to a text run; the branch stays for the whole value
     writes the rename still rides (auto-title.ts) */
  const last = mutations[mutations.length - 1];
  if (mutations.length > 1 && last?.op === 'deck.set' && last.path === '/title')
    return typingKeyOf(mutations.slice(0, -1));
  const first = mutations[0];
  if (first === undefined) return null;
  if (mutations.length === 2) {
    // the autofit grow of a text box travels with the burst's splice as `block.set /pos/h` on the
    // same block (viewer/text-fit.ts growMutation, docs/FOCUS.md rank 11): the call keeps the
    // splice's key, so a burst that grows its box stays in the typing group and one Cmd Z removes
    // the letters and the growth together
    // Shrink text on overflow steps `typography.size` down the ladder beside the splice the same
    // way (docs/PRODUCT.md section 5; build/b2.md R7), so one Cmd Z removes the letters and the
    // step together
    const second = mutations[1];
    if (
      first.op === 'text.splice' &&
      second !== undefined &&
      second.op === 'block.set' &&
      (second.path === '/pos/h' || second.path === '/typography') &&
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
