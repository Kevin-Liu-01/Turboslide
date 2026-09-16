// The autocorrect step of an InlineText session, pure (gslides-parity SPEC-5 7.1; R10 1.4): the
// markup of the run at the moment a trigger key is about to land, the caret as a plain offset,
// the key and the record's rules in; the corrected markup with the caret moved out, or null. The
// session applies the answer with `rewriteEditable`, flushes it as its own burst (one
// `text.splice` in the operation stream) and remembers it so the first Cmd Z and a Backspace
// within two seconds revert the correction alone. A list correction is handed to the Editor
// (`onList`), which converts the block; a link correction marks the token without a text change.
import type { Correction, Preferences } from '@turboslide/schema/preferences';
import { autocorrect, isTriggerKey } from '@turboslide/schema/preferences';
import { markRange, plainOf, spliceText } from '@turboslide/schema/text';
import type { Text as Markup } from '@turboslide/schema/text';

/** How long after a correction a Backspace reverts it alone (R10 1.4; G11). */
export const AUTOCORRECT_REVERT_MS = 2000;

/** What a session knows about its run when the key lands. */
export type InlineAutocorrectContext = {
  preferences: Preferences;
  language: string;
  /** the personal dictionary and the product tokens */
  exceptions?: ReadonlyArray<string>;
  /** the caret sits inside a link's text */
  inLink?: boolean;
  /** the pointer takes paragraph breaks and may become a list */
  listable?: boolean;
  /** the block is already a list */
  isList?: boolean;
};

export type InlineCorrection = {
  /** the markup after the correction; the same as before for a list correction */
  next: Markup;
  /** the caret after the correction, a plain offset */
  caret: number;
  correction: Correction;
  /** the plain characters the correction replaced (empty for a quote or a link) */
  from: string;
  /** the plain offset of the correction in the whole text */
  at: number;
};

/** The key a keyboard event hands the engine: Enter as the paragraph break, the rest as typed. */
export function triggerKeyOf(key: string): string | null {
  if (key === 'Enter') return '\n';
  return isTriggerKey(key) ? key : null;
}

/**
 * The correction for a key at a caret of a markup text, or null: the paragraph around the caret
 * is read from the plain text (one character per paragraph break, the offsets of
 * `selectionOffsets`), the engine answers, and the answer is applied to the markup with
 * `spliceText` (the run flags stay) or `markRange` (a link).
 */
export function inlineCorrection(
  text: Markup,
  caret: number,
  key: string,
  context: InlineAutocorrectContext,
): InlineCorrection | null {
  const trigger = triggerKeyOf(key);
  if (trigger === null) return null;
  const plain = plainOf(text);
  const at = Math.max(0, Math.min(caret, plain.length));
  const start = plain.lastIndexOf('\n', at - 1) + 1;
  const endBreak = plain.indexOf('\n', at);
  const paragraph = plain.slice(start, endBreak < 0 ? plain.length : endBreak);
  const correction = autocorrect(
    paragraph,
    at - start,
    trigger,
    context.preferences,
    context.language,
    {
      ...(context.exceptions === undefined ? {} : { exceptions: context.exceptions }),
      ...(context.inLink === undefined ? {} : { inLink: context.inLink }),
      ...(context.listable === undefined ? {} : { listable: context.listable }),
      ...(context.isList === undefined ? {} : { isList: context.isList }),
    },
  );
  if (correction === null) return null;
  const absolute = start + correction.at;
  const from = plain.slice(absolute, absolute + correction.remove);
  if (correction.list !== undefined)
    return { next: text, caret: at, correction, from, at: absolute };
  if (correction.link !== undefined) {
    const next = markRange(text, [absolute, absolute + correction.remove], {
      set: { link: correction.link },
    });
    return { next, caret: at, correction, from: '', at: absolute };
  }
  const next = spliceText(text, absolute, correction.remove, correction.insert);
  const shift = correction.insert.length - correction.remove;
  return { next, caret: at + shift, correction, from, at: absolute };
}

/** The markup with a correction taken back: the inserted characters leave and the typed ones return. */
export function revertCorrection(
  current: Markup,
  applied: InlineCorrection,
): { text: Markup; caret: number } | null {
  if (applied.correction.link !== undefined) {
    const text = markRange(current, [applied.at, applied.at + applied.correction.remove], {
      clear: ['link'],
    });
    return { text, caret: applied.caret };
  }
  const length = plainOf(current).length;
  const end = applied.at + applied.correction.insert.length;
  if (end > length) return null;
  const text = spliceText(current, applied.at, applied.correction.insert.length, applied.from);
  return { text, caret: applied.at + applied.from.length };
}

/** True when a Backspace should revert the last correction: within the window and the text unchanged since. */
export function shouldRevert(
  last: (InlineCorrection & { time: number }) | null,
  current: Markup,
  now: number,
): last is InlineCorrection & { time: number } {
  return last !== null && now - last.time <= AUTOCORRECT_REVERT_MS && last.next === current;
}
