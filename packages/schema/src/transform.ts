// Text transformation (gslides-parity SPEC-3 3.4 step 3, 3.5; research-3 02 3.3): the two
// primitive case of client server operational transformation, insert and delete against insert
// and delete inside one Text, with mark ranges shifted and split around concurrent splices. The
// admission (apps/studio/src/server/room.ts, B2) transforms every incoming `text.splice` and
// `text.mark` from its base to the head through these functions; the room client transforms its
// pending ops against incoming ones; undo transforms the inverse splice against later ops before
// it is sent. Every other mutation is last writer wins by server order and passes through
// unchanged; `after` anchors are re-resolved by the admission, not here. Offsets are plain text
// offsets, one character per paragraph break, the system text.ts's range functions use.
//
// The contract every function keeps: `op` and `against` were written against the same Text, and
// the answer is `op` rewritten so that applying `against` and then the answer gives the same Text
// as applying `op` and then `against` rewritten the other way round. `side` breaks the ties two
// concurrent ops at one offset (or two conflicting marks over one range) leave: `left` is the op
// the server admitted first, `right` the later arrival, so server order decides on every client.
//
// A transform may answer several mutations (a deletion split in two around a concurrent
// insertion, a mark split around a pinned insertion). They are written in one frame, the Text
// after `against`, and ordered by descending offset, so applying them in order equals applying
// them all at once and a fold that transforms each of them independently against the next op
// (transformAgainst, room.ts transformEntry) stays correct: no row's offsets depend on another's.
//
// Exact convergence needs the inserted characters' flags to travel on the splice (`flags`, the
// caret's run the room client sends): a splice without them takes the flags of the run beside
// it at apply time (text.ts insertPlain), which differs by order when the neighbour changed
// concurrently, so two clients may show one inserted word in two styles until the server's order
// is applied; the property test in transform.test.ts asserts exact convergence with `flags` and
// character convergence without. One anomaly is accepted and documented (b1.md, stage 2): a case
// change that alters the plain length (a sharp s upper cased) is treated as length preserving
// here.
//
// The tie of two inserts at one offset (the sync round fix round; VERIFICATION.md "Sync and
// costs round, pass 1" F3). By server order alone (`right` for the later arrival) two authors
// typing at one point interleave burst by burst (02 E17): an author's committed burst stands
// while their next pending burst yields to the other's insert at its end, so a word is cut in two
// (the ordering probe read `p pa1b1` from B's " p", A's " pa1" and B's "b1"). The tie is
// therefore by the two authors' client ids (`insertTieSide`): the lower id keeps the left, on
// every client and on the server, so each author's stream of inserts stays contiguous whatever
// the arrival order. Both ends must compute it: the client declares the rule on its ops POST
// (protocol.ts `OpsPost.insertTie`) and the server applies it to that client's incoming ops; a
// POST without the declaration keeps server order, as every client before the round did.
// Marks keep server order (`transformMarkAgainstMark`: the later arrival wins the flag), which
// is what last writer wins means for them.
import type { MarkMutation, Mutation, SpliceMutation, TextOp } from './mutations.ts';
import { isSlideFieldPath } from './mutations.ts';
import type { RunFlagKey, RunFlags } from './text.ts';
import { RUN_FLAG_KEYS } from './text.ts';

/** A splice's shape without its address, for the range arithmetic. */
export type Splice = { at: number; remove: number; insert: string };

/**
 * Which side wins a tie at one offset: `left` keeps its insertion before the other's, `right`
 * lands after it. For marks the admission transforms the incoming op as `right` against every
 * entry since its base, so server order breaks the tie (the later arrival wins the flag) and every
 * client converges (02 3.3). For two inserts at one offset the side is `insertTieSide`'s, by the
 * two authors' client ids, the same on the server and on every client (the header's last
 * paragraph); server order is the fallback for a client that did not declare the rule.
 */
export type Side = 'left' | 'right';

/**
 * The side of an insert in a tie with another author's insert at the same offset, by the two
 * authors' client ids: the lower id keeps the left, and equal ids (one author against their own
 * record, which the transform never meets) land after. Pure and symmetric, so the server (the
 * POST's client against the landed record's) and the client (its own id against the remote
 * entry's) read one answer from one pair; a blob tier record written without an origin travels
 * as `store` (blob.ts `entryOfRecord`) and every client id sorts before it, on both ends alike.
 */
export function insertTieSide(opClientId: string, againstClientId: string): Side {
  return opClientId < againstClientId ? 'left' : 'right';
}

/**
 * A plain text range moved by a splice that happened before it was read (08 1.2): an insert at or
 * before the start moves both ends, inside grows the range, a delete before shrinks the offsets,
 * overlapping trims, covering collapses the range to [start, start]. The insertion of a
 * replacement (remove and insert together) lands outside the range when it begins at or before
 * the trimmed start, inside when it begins within it.
 */
export function shiftRange(range: readonly [number, number], splice: Splice): [number, number] {
  const { at, remove } = splice;
  const insert = splice.insert.length;
  const deleteEnd = at + remove;
  let [start, end] = range;
  if (remove > 0) {
    start = start < at ? start : start < deleteEnd ? at : start - remove;
    end = end <= at ? end : end <= deleteEnd ? at : end - remove;
  }
  if (insert > 0) {
    if (at <= start) {
      start += insert;
      end += insert;
    } else if (at < end) {
      end += insert;
    }
  }
  return [start, end];
}

/** A plain range moved by a deletion alone: the part of the range the deletion left, in the new offsets. */
function deleteShift(
  range: readonly [number, number],
  at: number,
  remove: number,
): [number, number] {
  if (remove === 0) return [range[0], range[1]];
  const end = at + remove;
  const s = range[0] <= at ? range[0] : range[0] < end ? at : range[0] - remove;
  const e = range[1] <= at ? range[1] : range[1] <= end ? at : range[1] - remove;
  return [s, e];
}

/** The interval [a, b) minus [c, d): zero, one or two pieces, in order. */
function subtract(a: number, b: number, c: number, d: number): [number, number][] {
  if (d <= a || c >= b || c >= d) return [[a, b]];
  const out: [number, number][] = [];
  if (a < c) out.push([a, c]);
  if (d < b) out.push([d, b]);
  return out;
}

function withAddress<T extends TextOp>(op: T, fields: Partial<T>): T {
  return { ...op, ...fields };
}

/** Descending offset order: the order the answers of every transform are written in. */
function descending<T extends { at: number } | { range: [number, number] }>(rows: T[]): T[] {
  const at = (row: T): number => ('at' in row ? row.at : row.range[0]);
  return [...rows].sort((x, y) => at(y) - at(x));
}

/**
 * `op` rewritten to apply after `against` did, both written against the same text. The deletion
 * of `op` loses what `against` removed and splits in two around what `against` inserted inside
 * it, so an admitted insertion is never deleted by a concurrent range; the insertion of `op`
 * lands where its offset moved, before or after a concurrent insertion at the same offset by
 * `side`. Zero splices when `op` removed characters `against` removed entirely and inserted
 * nothing; one in the common case; two when a concurrent insertion split the deletion. The
 * answers share one frame and are ordered by descending offset (the header's rule).
 */
export function transformSplice(
  op: SpliceMutation,
  against: SpliceMutation,
  side: Side,
): SpliceMutation[] {
  const a = op.at;
  const r = op.remove;
  const b = against.at;
  const s = against.remove;
  const L = against.insert.length;
  // 1. the deletion of `op` minus the deletion of `against`, in the post deletion offsets
  const pieces: [number, number][] =
    r === 0 ? [] : subtract(a, a + r, b, b + s).map((piece) => deleteShift(piece, b, s));
  // 2. the insertion of `against` at b in those offsets: a piece strictly around b splits, a piece
  //    at or after b moves right
  const shifted: [number, number][] = [];
  const push = (piece: [number, number]): void => {
    const last = shifted[shifted.length - 1];
    // two pieces left adjacent by a deletion between them are one deletion again
    if (last !== undefined && last[1] === piece[0]) last[1] = piece[1];
    else shifted.push(piece);
  };
  for (const [ps, pe] of pieces) {
    if (L === 0 || pe <= b) push([ps, pe]);
    else if (ps >= b) push([ps + L, pe + L]);
    else {
      push([ps, b]);
      push([b + L, pe + L]);
    }
  }
  // 3. where the insertion of `op` lands: its offset through the deletion, then the tie at b
  let p: number;
  if (a < b) p = a;
  else if (a > b + s) p = a - s + L;
  else if (a === b) p = side === 'left' ? b : b + L;
  else p = b + L; // strictly inside the removed range, or at its end: after the replacement
  const out: SpliceMutation[] = [];
  let attached = op.insert === '';
  for (const [ps, pe] of shifted) {
    if (!attached && ps === p) {
      out.push(withAddress(op, { at: ps, remove: pe - ps, insert: op.insert }));
      attached = true;
    } else {
      out.push(withAddress(op, { at: ps, remove: pe - ps, insert: '' }));
    }
  }
  if (!attached) {
    // the insertion stands alone: nothing of the deletion survived at its offset
    out.push(withAddress(op, { at: p, remove: 0, insert: op.insert }));
  }
  return descending(out.filter((row) => row.remove > 0 || row.insert !== ''));
}

/**
 * True when a concurrent insertion without pinned flags takes the flags this mark sets (the rule
 * of text.ts insertPlain, which the reducer applies to `text.splice`): a replacement whose first
 * replaced character sits inside the range, or a pure insertion strictly inside or at the range's
 * end, or at offset 0 when the range starts there (the run starting there is the marked one).
 */
function insertionTakesMarks(range: readonly [number, number], splice: Splice): boolean {
  const [s, e] = range;
  const { at, remove } = splice;
  if (remove > 0) return s <= at && at < e;
  if (s < at && at <= e) return true;
  return at === s && s === 0;
}

/**
 * A mark rewritten to apply after a splice did: the range loses what the splice removed and, for
 * the marks kind against an insertion without pinned flags, grows over a concurrent insertion
 * that takes the marks (inside the range or at its end, the reducer's rule for the inserted
 * characters). A case change, and any mark against an insertion whose flags are pinned, is split
 * in two around a concurrent insertion inside it so the inserted characters keep their case and
 * their flags on every client. Empty when the splice removed the whole range.
 */
export function transformMark(op: MarkMutation, against: SpliceMutation): MarkMutation[] {
  const [s, e] = op.range;
  if (s >= e) return [];
  const b = against.at;
  const L = against.insert.length;
  const [s1, e1] = deleteShift(op.range, b, against.remove);
  if (s1 >= e1) return [];
  if (L === 0) return [withAddress(op, { range: [s1, e1] })];
  const takes =
    op.edit.kind === 'marks' &&
    against.flags === undefined &&
    insertionTakesMarks(op.range, against);
  if (takes) {
    const start = b <= s1 ? b : s1;
    return [withAddress(op, { range: [start, e1 + L] })];
  }
  if (b <= s1) return [withAddress(op, { range: [s1 + L, e1 + L] })];
  if (b >= e1) return [withAddress(op, { range: [s1, e1] })];
  return [withAddress(op, { range: [b + L, e1 + L] }), withAddress(op, { range: [s1, b] })];
}

type MarksEdit = Extract<MarkMutation['edit'], { kind: 'marks' }>;

/** The value a marks edit writes for a flag key: the value set, `null` for a clear, undefined when untouched. */
function writes(edit: MarksEdit, key: RunFlagKey): unknown {
  const value = edit.set?.[key];
  if (value !== undefined) return value;
  return (edit.clear ?? []).includes(key) ? null : undefined;
}

/**
 * The flag keys two marks edits write differently over one span, as text.ts markRange applies
 * them: the same key set to two values or set against cleared, and `sup` set against `sub` set
 * (the two are exclusive, the later set removes the other). Two case modes conflict as one
 * `case` key.
 */
function conflicting(
  op: MarkMutation['edit'],
  against: MarkMutation['edit'],
): Set<RunFlagKey | 'case'> {
  const out = new Set<RunFlagKey | 'case'>();
  if (op.kind === 'case' || against.kind === 'case') {
    if (op.kind === 'case' && against.kind === 'case' && op.mode !== against.mode) out.add('case');
    return out;
  }
  for (const key of RUN_FLAG_KEYS) {
    const mine = writes(op, key);
    const theirs = writes(against, key);
    if (mine === undefined || theirs === undefined) continue;
    if (mine !== theirs) out.add(key);
  }
  if (op.set?.sup && against.set?.sub) out.add('sup');
  if (op.set?.sub && against.set?.sup) out.add('sub');
  return out;
}

/** A marks edit without the given keys; undefined when nothing is left. */
function withoutKeys(
  edit: MarksEdit,
  keys: ReadonlySet<RunFlagKey | 'case'>,
): MarkMutation['edit'] | undefined {
  const set: RunFlags = {};
  let any = false;
  for (const key of RUN_FLAG_KEYS) {
    const value = edit.set?.[key];
    if (value === undefined || keys.has(key)) continue;
    (set as Record<RunFlagKey, unknown>)[key] = value;
    any = true;
  }
  const clear = (edit.clear ?? []).filter((key) => !keys.has(key));
  if (clear.length > 0) any = true;
  if (!any) return undefined;
  return {
    kind: 'marks',
    ...(Object.keys(set).length > 0 ? { set } : {}),
    ...(clear.length > 0 ? { clear } : {}),
  };
}

/**
 * A mark against a concurrent mark on one Text: ranges never move, so the op is unchanged unless
 * both write one flag (or one case) differently over an overlap, where the later arrival wins
 * (SPEC-3 3.5 last writer wins by server order): the `right` side applies unchanged and the
 * `left` side drops the conflicting keys over the overlap, keeping its other keys and its
 * non overlapping pieces.
 */
export function transformMarkAgainstMark(
  op: MarkMutation,
  against: MarkMutation,
  side: Side,
): MarkMutation[] {
  const [s, e] = op.range;
  if (s >= e) return [];
  const [as, ae] = against.range;
  const os = Math.max(s, as);
  const oe = Math.min(e, ae);
  if (os >= oe || side === 'right') return [op];
  const keys = conflicting(op.edit, against.edit);
  if (keys.size === 0) return [op];
  const out: MarkMutation[] = [];
  if (oe < e) out.push(withAddress(op, { range: [oe, e] }));
  if (op.edit.kind === 'marks') {
    const kept = withoutKeys(op.edit, keys);
    if (kept !== undefined) out.push(withAddress(op, { range: [os, oe], edit: kept }));
  }
  if (s < os) out.push(withAddress(op, { range: [s, os] }));
  return out;
}

/** True for the two ops the admission transforms (SPEC-3 3.4). */
export function isTextOp(mutation: Mutation): mutation is TextOp {
  return mutation.op === 'text.splice' || mutation.op === 'text.mark';
}

/** True when two text ops name the same Text. */
export function sameText(a: TextOp, b: TextOp): boolean {
  return a.slideId === b.slideId && a.blockId === b.blockId && a.path === b.path;
}

/**
 * True when `against` rewrites or removes the Text `op` names as a whole (SPEC-3 3.5): a
 * `text.replace` of the pointer, a `block.set` of the pointer or a parent of it, a
 * `slide.replace` of the slide, a `slide.set` of one of the three slide fields when the op names
 * that field (docs/SYNC.md 3.4: `slide.set /heading` rewrites the heading's ops alone, never the
 * lead's or a block's) and of any other slide pointer as before, the removal of the block or the
 * slide, or a restore. The string is last writer wins, so the text op cannot be placed and
 * returns to its author.
 */
export function rewritesText(against: Mutation, op: TextOp): boolean {
  switch (against.op) {
    case 'text.replace':
      return (
        against.slideId === op.slideId && against.blockId === op.blockId && against.path === op.path
      );
    case 'block.set':
      return (
        against.slideId === op.slideId &&
        against.blockId === op.blockId &&
        (against.path === '' || op.path === against.path || op.path.startsWith(`${against.path}/`))
      );
    case 'block.remove':
      return against.slideId === op.slideId && against.blockId === op.blockId;
    case 'slide.set':
      if (against.slideId !== op.slideId) return false;
      // a whole value write of a slide field is a rewrite of that field's Text alone: the op
      // names the field as its blockId and the field's pointer as its path (mutations.ts)
      if (isSlideFieldPath(against.path))
        return op.path === against.path && op.blockId === against.path.slice(1);
      return true;
    case 'slide.replace':
    case 'slide.remove':
      return against.slideId === op.slideId;
    case 'version.restore':
      return true;
    default:
      return false;
  }
}

/**
 * The general step of the admission: a text op is transformed against a text op on the same Text;
 * a text op against a whole Text rewrite of its Text is returned to its author (an empty list, the
 * caller answers with the content, SPEC-3 3.5); every other mutation passes through unchanged.
 * `side` is the tie of two marks (server order); `insertTie` the tie of two inserts at one offset
 * (`insertTieSide` when the caller knows both authors' client ids), `side` when not given.
 */
export function transformMutation(
  mutation: Mutation,
  against: Mutation,
  side: Side,
  insertTie: Side = side,
): Mutation[] {
  if (!isTextOp(mutation)) return [mutation];
  if (rewritesText(against, mutation)) return [];
  if (!isTextOp(against) || !sameText(mutation, against)) return [mutation];
  if (mutation.op === 'text.splice') {
    return against.op === 'text.splice'
      ? transformSplice(mutation, against, insertTie)
      : [mutation];
  }
  if (against.op === 'text.splice') return transformMark(mutation, against);
  return transformMarkAgainstMark(mutation, against, side);
}

/**
 * `mutation` transformed against every mutation of `history` in order, as the later arrival. The
 * rows an earlier step produced share one frame (the header's rule), so each is transformed
 * against the next op on its own and the list stays applicable in order.
 */
export function transformAgainst(mutation: Mutation, history: ReadonlyArray<Mutation>): Mutation[] {
  let out: Mutation[] = [mutation];
  for (const against of history) {
    const next: Mutation[] = [];
    for (const row of out) next.push(...transformMutation(row, against, 'right'));
    if (next.length === 0) return [];
    out = next;
  }
  return out;
}
