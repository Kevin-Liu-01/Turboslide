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
  if (mutations.length !== 1 || first === undefined) return null;
  if (first.op === 'text.splice') return `${first.slideId}/${first.blockId}${first.path}`;
  if (
    first.op === 'slide.set' &&
    typeof first.value === 'string' &&
    SLIDE_TEXT_FIELDS.has(first.path)
  )
    return `${first.slideId}${first.path}`;
  return null;
}
