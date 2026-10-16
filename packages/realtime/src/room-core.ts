// The pure half of the room's admission (the Cloudflare move, docs/CLOUDFLARE.md 3.3 and 3.6.1;
// the integrator's seam commit of the realtime round): the transform of an entry past what landed
// since its base, the placement through the reducer and the validator, the reader's projection of
// a roster entry and an event, the hue slot grant and the editing ceiling. Everything here was in
// apps/studio/src/server/room.ts, which imports node:crypto and ioredis and so cannot be bundled
// into the Worker; this module imports no node: module and nothing of the function's state, so the
// Durable Object (apps/realtime-worker) and the function run one admission. room.ts re-exports
// every name, so its callers and tests did not move. What a function needs from its host (the
// instance's email memory on the function, the ticket's claim in the object) arrives as `ReaderDeps`.
import type { Role } from '@turboslide/identity/access';
import { assignHueSlot, preferredHueSlot } from '@turboslide/identity/hues';
import type { HueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import { commentOpWithStandIns, standInsWith } from '@turboslide/identity/stand-in';
import type { StandIns } from '@turboslide/identity/stand-in';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { NotImplementedError } from '@turboslide/schema/errors';
import { canonicalJson } from '@turboslide/schema/json';
import type { Mutation } from '@turboslide/schema/mutations';
import {
  applyMutations,
  applyMutationsTouched,
  slideLevelTargets,
} from '@turboslide/schema/reduce';
import {
  insertTieSide,
  isTextOp,
  rewritesText,
  sameText,
  transformMutation,
} from '@turboslide/schema/transform';
import type { Side } from '@turboslide/schema/transform';
import { validateDocument, validateTouched } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { touchedSlides } from '@turboslide/store/store';

import { CAPS, MB } from './admission.ts';
import { entryRun, runTieSide } from './channel.ts';
import type { Entry, NewEntry, RejectReason, RoomEvent, RosterEntry } from './channel.ts';
import {
  canvasFieldBlocks,
  carryFieldText,
  fieldRunsOnCanvas,
  isFieldRun,
  yieldConcurrentConversion,
} from './conversion.ts';
import { EDITING_TABS_MAX } from './protocol.ts';
import type { OpsPost } from './protocol.ts';

export {
  canvasFieldBlocks,
  carryFieldText,
  entryRun,
  fieldRunsOnCanvas,
  runTieSide,
  touchedSlides,
  yieldConcurrentConversion,
};

// ---------------------------------------------------------------------------------------------
// The answer's `between` (SPEC-3 3.4; the focus round, cycle 3 stream fix round two)

/** The most entries an ops answer carries under the admitted ones (`between`); a longer run is the reopen's. */
export const BETWEEN_MAX_ENTRIES = 256;
/** The most bytes of `between` an ops answer carries, the ops body cap. */
export const BETWEEN_MAX_BYTES = 256 * 1024;

/**
 * The entries strictly between a POST's base and the first admitted seq, for the answer's
 * `between` (C3S-F8): the given entries filtered to that window and bounded; undefined when the
 * window is empty or the run is over the bound, so the client falls back to the stream and its
 * gap watch. Exported for its test.
 */
export function betweenEntries(
  entries: readonly Entry[],
  base: number,
  upTo: number,
): Entry[] | undefined {
  const out: Entry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    if (entry.seq <= base || entry.seq >= upTo) continue;
    bytes += JSON.stringify(entry).length;
    if (out.length >= BETWEEN_MAX_ENTRIES || bytes > BETWEEN_MAX_BYTES) return undefined;
    out.push(entry);
  }
  out.sort((a, b) => a.seq - b.seq);
  return out.length === 0 ? undefined : out;
}

// ---------------------------------------------------------------------------------------------
// The transform (SPEC-3 3.4 step 3, 3.5)

export type Rejected = { opId: string; reason: RejectReason; message?: string };

/**
 * A slide document after the write is at most 200 KB (report 04 7.5, 10 F27). Exported for the
 * room client, which checks a change against the same measure before it queues it (hardening
 * HR-RC#4, RELIABILITY-7).
 */
export function slideBytes(slide: Slide): number {
  return utf8Bytes(canonicalJson(slide));
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

// ---------------------------------------------------------------------------------------------
// The deck cap (RUST-4; hardening HR-RT#10)

/** The refusal's sentence when an entry would take the deck past `CAPS.deckMaxBytes`. */
export const DECK_OVERSIZE_SENTENCE = `This presentation would pass ${CAPS.deckMaxBytes / MB} MB. Remove slides to make room.`;

/**
 * The canonical bytes of the documents the admission measured, by object: a slide (`slideBytes`)
 * and a whole document (`deckBytes`). The admission never writes through a document or a slide it
 * placed (`applyMutations` copies, `applyMutationsTouched` clones what it writes; CRIT-M17), so
 * an object's bytes do not change once read. Weak, so a document the room let go takes its
 * entry with it.
 */
const slideSizes = new WeakMap<Slide, number>();
const deckSizes = new WeakMap<DeckDocument, number>();

function sizeOfSlide(slide: Slide): number {
  let bytes = slideSizes.get(slide);
  if (bytes === undefined) {
    bytes = slideBytes(slide);
    slideSizes.set(slide, bytes);
  }
  return bytes;
}

/**
 * A deck's bytes as the cap reads them (RUST-4): every slide's canonical JSON and the manifest's,
 * in UTF-8, the files the store writes for the document. Counted in full once per document
 * object; the admission carries the count from a document to the next (`deckBytesAfter`), so
 * the object and the function's rooms keep a running total. Pure.
 */
export function deckBytes(document: DeckDocument): number {
  const known = deckSizes.get(document);
  if (known !== undefined) return known;
  let total = utf8Bytes(canonicalJson(document.deck));
  for (const slide of Object.values(document.slides)) total += sizeOfSlide(slide);
  deckSizes.set(document, total);
  return total;
}

/**
 * The bytes of `after`, the document `mutations` made of `before`. A write of slides alone
 * (`slideLevelTargets`) changes those slides and, through the title rule, the manifest's title
 * and nothing else of the manifest (reduce.ts `applyMutationsTouched`), so the total moves by
 * those slides' bytes and the title's. Any other write is counted in full, as it validates the
 * whole document too.
 */
function deckBytesAfter(
  before: DeckDocument,
  after: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
): number {
  const known = deckSizes.get(after);
  if (known !== undefined) return known;
  const targets = slideLevelTargets(mutations);
  if (targets === null) return deckBytes(after);
  let total = deckBytes(before);
  for (const slideId of targets) {
    const was = before.slides[slideId];
    const now = after.slides[slideId];
    if (was !== undefined) total -= sizeOfSlide(was);
    if (now !== undefined) total += sizeOfSlide(now);
  }
  if (before.deck.title !== after.deck.title)
    total +=
      utf8Bytes(JSON.stringify(after.deck.title)) - utf8Bytes(JSON.stringify(before.deck.title));
  deckSizes.set(after, total);
  return total;
}

/**
 * A mutation that landed since a POST's base, with the side the POST's inserts take against it
 * in a tie at one offset (`@turboslide/schema/transform` `insertTieSide`; the sync round fix
 * round, VERIFICATION.md sync pass 1 F3): by the two client ids when the POST declares the rule
 * (`OpsPost.insertTie`), server order (`right`) when it does not, so the server places an
 * incoming insert exactly where the client that sent it moved its own copy.
 */
export type Landed = {
  mutation: Mutation;
  insertTie: Side;
  /** the POST's own making (the undo of a refused sibling): the run rule does not apply to it */
  own?: true;
  /** the seq of the entry the row came from (`landedOf`), so `landedPastAnswered` finds its rows */
  seq?: number;
};

/** The landed entries' mutations in order, each with the tie the POST's inserts take against it. */
export function landedOf(entries: ReadonlyArray<Entry>, post: OpsPost): Landed[] {
  const out: Landed[] = [];
  for (const entry of entries) {
    const insertTie: Side =
      post.insertTie === 'client-id' ? insertTieSide(post.clientId, entry.clientId) : 'right';
    for (const mutation of entry.mutations ?? []) out.push({ mutation, insertTie, seq: entry.seq });
  }
  return out;
}

/** Mutations of this POST's own making (the undo of a refused entry) that the later entries move past by server order. */
export function landedOwn(mutations: ReadonlyArray<Mutation>): Landed[] {
  return mutations.map((mutation) => ({ mutation, insertTie: 'right', own: true }));
}

/**
 * Transforms one entry's mutations against the mutations that landed since its base (SPEC-3
 * 3.4 step 3): text ops through the schema's transform (identity while B1's functions throw
 * NotImplementedError, which keeps a non concurrent keystroke flowing), a text op against a whole
 * Text rewrite returned to its author, `after` anchors re-resolved by the reducer at apply time,
 * everything else unchanged. Null when nothing survives. Two inserts at one offset tie by each
 * landed row's `insertTie` (`landedOf`), and an entry that declares the run rule (`run`,
 * channel.ts `runTieSide`) keeps the left of every landed insert but its own POST's undo rows.
 *
 * `document` is the document the entry will be placed on (the admission's running document).
 * With it a conversion that travels with its writes follows the slide as it stands
 * (conversion.ts `yieldConcurrentConversion`, `carryFieldText`), and a cover's field run and the
 * block the field became on its canvas are one text (`fieldRunsOnCanvas`; the realtime round, fix
 * round 3). Without it the transform reads the landed rows alone.
 */
export function transformEntry(
  mutations: readonly Mutation[],
  landed: ReadonlyArray<Landed>,
  run = false,
  document?: DeckDocument,
): Mutation[] | null {
  let out: Mutation[] = yieldConcurrentConversion(mutations, landed, document);
  if (out.length === 0) return null;
  if (document !== undefined) out = carryFieldText(out, document);
  const canvas = fieldRunsOnCanvas(out, landed, document);
  out = out.map((mutation) => canvas.retarget(mutation));
  for (const row of landed) {
    const onCanvas = canvas.read(row.mutation);
    const insertTie = row.own === true ? row.insertTie : runTieSide(run, row.insertTie);
    const next: Mutation[] = [];
    for (const mutation of out)
      // a field run the entry still carries is on a cover that is not a canvas before it
      next.push(
        ...movedPast(mutation, isFieldRun(mutation) ? row.mutation : onCanvas, 'right', insertTie),
      );
    out = next;
    if (out.length === 0) return null;
  }
  return out;
}

/** One mutation moved past one that landed before it in the same frame: dropped when that rewrote its Text. */
function movedPast(mutation: Mutation, against: Mutation, side: Side, insertTie: Side): Mutation[] {
  // the one rule of a whole Text rewrite (@turboslide/schema/transform, hardening HR-RT#3)
  if (isTextOp(mutation) && rewritesText(against, mutation)) return [];
  if (!isTextOp(mutation) || !isTextOp(against) || !sameText(mutation, against)) return [mutation];
  try {
    return transformMutation(mutation, against, side, insertTie);
  } catch (error) {
    if (error instanceof NotImplementedError) return [mutation];
    throw error;
  }
}

/**
 * What landed since a POST's base, moved past one entry of that POST (`mutations` as its client
 * wrote them, `run` its declaration), so the next entry of the POST meets it in the frame it was
 * written in. A client writes each entry after the entries before it, so the second entry's
 * offsets count the first entry's characters. Before this every entry of a POST was moved past
 * what landed as the other writers wrote it: A's " t" and "a1" in one POST after B's " tb1"
 * landed at A's point, " t" kept the left by the run rule, "a1" was pushed past B's word, and
 * both browsers read " t tb1a1" (realtime.title.two-typers; request R2-F3a of the realtime
 * round). Each landed row meets the entry as it stands after the rows before it and takes the
 * other side of the entry's tie against it; a text op the entry rewrote away leaves the frame. A
 * cover's field run and the block its canvas made of the field are one text (`fieldRunsOnCanvas`),
 * so both sides are read on the canvas when there is one. `document` is the one `transformEntry`
 * placed the entry on. Pure.
 */
export function landedPast(
  landed: ReadonlyArray<Landed>,
  mutations: readonly Mutation[],
  run = false,
  document?: DeckDocument,
): Landed[] {
  const canvas = fieldRunsOnCanvas(mutations, landed, document);
  let written = mutations.map((mutation) => canvas.read(mutation));
  const out: Landed[] = [];
  for (const row of landed) {
    const tie = row.own === true ? row.insertTie : runTieSide(run, row.insertTie);
    const against = canvas.read(row.mutation);
    let moved = [against];
    for (const mutation of written)
      moved = moved.flatMap((m) =>
        movedPast(m, mutation, 'left', tie === 'left' ? 'right' : 'left'),
      );
    for (const mutation of moved) out.push({ ...row, mutation });
    written = written.flatMap((mutation) => movedPast(mutation, against, 'right', tie));
  }
  return out;
}

/**
 * What landed, once an entry of the POST is answered from the log (RELIABILITY-2, F1; hardening
 * HR-RT#2). A retried POST carries the op ids of its first attempt, and an id the log already
 * holds is answered with its entry and never appended twice. That entry sits in the log above the
 * POST's base, so its rows are among what landed, and the next entry of the POST, written on top
 * of it, was moved past its own author's letters: A's " t" answered from the log, A's "a1"
 * pushed past " t" and refused as outside the text (the two typers verifier, word-fix.md F1).
 * Here the answered entry's rows leave the set, and the rows that landed before it are moved past
 * the entry as its client wrote it (`landedPast`), so the next entry meets them in the frame it
 * was written in. The rows that landed after it were placed past it already and stay. `seq` is
 * the seq the log answered the entry with; an entry at or under the POST's base (`base`) left no
 * rows here and changes nothing. One record of the blob tier can answer several entries of one
 * POST: the first takes the record's rows out, and each one moves the rows before it. The three
 * admissions call this (apps/studio room.ts `admitOps` and `admitOnBlob`, the object's `admit`).
 * Pure.
 */
export function landedPastAnswered(
  landed: ReadonlyArray<Landed>,
  answered: { seq: number; base: number },
  mutations: readonly Mutation[],
  run = false,
  document?: DeckDocument,
): Landed[] {
  if (answered.seq <= answered.base) return [...landed];
  const before: Landed[] = [];
  const after: Landed[] = [];
  for (const row of landed) {
    if (row.seq === answered.seq) continue;
    if (row.seq !== undefined && row.seq < answered.seq) before.push(row);
    else after.push(row);
  }
  return [...landedPast(before, mutations, run, document), ...after];
}

/** `after` anchors of inserts and moves re-resolve to the end of the slot or section when the anchor left (SPEC-3 3.5). */
export function reanchor(document: DeckDocument, mutation: Mutation): Mutation {
  switch (mutation.op) {
    case 'slide.insert':
    case 'slide.move': {
      if (mutation.after === undefined) return mutation;
      const section = document.deck.sections.find((row) => row.id === mutation.sectionId);
      if (section === undefined || section.slideIds.includes(mutation.after)) return mutation;
      const last = section.slideIds[section.slideIds.length - 1];
      const { after: _after, ...rest } = mutation;
      return last === undefined ? rest : { ...rest, after: last };
    }
    case 'block.insert':
    case 'block.move': {
      if (mutation.after === undefined) return mutation;
      const slide = document.slides[mutation.slideId];
      if (slide === undefined) return mutation;
      const inSlot = slideBlocks(slide).filter((row) => row.slot === mutation.slot);
      if (inSlot.some((row) => row.block.id === mutation.after)) return mutation;
      const last = inSlot[inSlot.length - 1]?.block.id;
      const { after: _after, ...rest } = mutation;
      return last === undefined ? rest : { ...rest, after: last };
    }
    default:
      return mutation;
  }
}

/**
 * Re-anchors and applies an entry's mutations in order, each against the document the mutations
 * before it made. An anchor a mutation of the same entry introduces stays: the undo of a
 * `version.restore` inserts the slides the restore removed, the second after the first, and a
 * paste of several slides anchors each on the one before. Before this every mutation was checked
 * against the document from before the entry, so the second insert's anchor read as gone and it
 * was sent to the end of the section: the undo of a restore wrote and the slide order came back
 * wrong on both tiers (VERIFICATION.md "Product round, pass 1" finding 4, `versions.undo-restore`;
 * the product round fix round). One mutation is placed and applied as before. Throws what the
 * reducer throws; the caller answers the reject.
 */
export function reanchorAll(
  document: DeckDocument,
  mutations: readonly Mutation[],
  apply: ApplyFn = applyMutations,
): { mutations: Mutation[]; document: DeckDocument } {
  if (mutations.length <= 1) {
    const placed = mutations.map((mutation) => reanchor(document, mutation));
    return { mutations: placed, document: apply(document, placed).document };
  }
  const placed: Mutation[] = [];
  let running = document;
  for (const mutation of mutations) {
    const next = reanchor(running, mutation);
    placed.push(next);
    running = apply(running, [next]).document;
  }
  return { mutations: placed, document: running };
}

/** The reducer `reanchorAll` applies with: `applyMutations`, or the admission's `applyMutationsTouched`. */
type ApplyFn = (
  document: DeckDocument,
  mutations: ReadonlyArray<Mutation>,
) => { document: DeckDocument };

/** One entry of a POST as the admission judges it: its op id, its kind and its content. */
export type Candidate = {
  opId: string;
  kind: 'edit' | 'comment';
  mutations?: Mutation[];
  comment?: NewEntry['comment'];
};

/**
 * The splices that undo a refused entry's text splices, by length alone (docs/FOCUS.md rank
 * 13): the entries after a refused one in the same POST were written on a text that carried its
 * insertion, so they are transformed past this undo before they are judged, the way they are
 * transformed past what landed since their base. Before this the later splices of a burst met
 * "text.splice: 10 plus 0 is outside a text of 7 characters" one after another (audit-text row
 * 21). The characters a splice removed are not known here and do not matter to a transform,
 * which reads lengths and offsets; a placeholder of the removed length stands in.
 */
export function undoOfSplices(mutations: readonly Mutation[]): Mutation[] {
  const out: Mutation[] = [];
  for (let i = mutations.length - 1; i >= 0; i -= 1) {
    const mutation = mutations[i];
    if (mutation === undefined || mutation.op !== 'text.splice') continue;
    const { flags: _flags, ...rest } = mutation;
    out.push({ ...rest, remove: mutation.insert.length, insert: 'x'.repeat(mutation.remove) });
  }
  return out;
}

/**
 * How the admission places and judges an entry (hardening HR-RT#5a, RUST-1; the variable
 * `TURBOSLIDE_ADMISSION`, `admissionModeOf`). `full`: the whole document is cloned and validated
 * for every entry, 13.5 to 16.3 ms of CPU on GT and 122 ms on 850 slides. `incremental`: a write
 * of slides clones and validates the slides it writes (`applyMutationsTouched`,
 * `validateTouched`), and the whole document only for the writes of the deck (`slide.insert`,
 * `slide.remove`, `slide.move`, sections, assets, `deck.set`, `version.restore`). `shadow`:
 * decides with `full`, runs `incremental` beside it on every entry and reports a disagreement.
 */
export type AdmissionMode = 'full' | 'incremental' | 'shadow';

/** The mode a variable names; `full` for anything else, the default of every host until HR-RT#5b. */
export function admissionModeOf(value: string | undefined): AdmissionMode {
  return value === 'incremental' || value === 'shadow' ? value : 'full';
}

/** What `shadow` reports when the two placements of an entry differ: the op kinds, and how. */
export type AdmissionDisagreement = {
  opId: string;
  ops: Mutation['op'][];
  /** `ok`, `reason`, `message`, `document`, or `threw` when the incremental placement threw */
  field: 'ok' | 'reason' | 'message' | 'document' | 'threw';
};

export type LandOptions = {
  mode?: AdmissionMode;
  onDisagree?: (disagreement: AdmissionDisagreement) => void;
};

type Landing =
  { ok: true; document: DeckDocument; mutations: Mutation[] } | { ok: false; rejected: Rejected };

/**
 * Applies one candidate to the running document and validates; the reject reason when it cannot
 * land. `options.mode` picks the placement (`AdmissionMode`); the answer is the same in every
 * mode, which the parity test holds over 2,000 seeded sequences (admission-parity.test.ts).
 */
export function landCandidate(
  document: DeckDocument,
  candidate: Candidate,
  canReadSlide: (slideId: string) => boolean,
  options: LandOptions = {},
): Landing {
  const mode = options.mode ?? 'full';
  if (mode === 'full') return landWith(document, candidate, canReadSlide, false);
  if (mode === 'incremental') return landWith(document, candidate, canReadSlide, true);
  const decided = landWith(document, candidate, canReadSlide, false);
  let field: AdmissionDisagreement['field'] | null;
  try {
    field = landingDiffers(decided, landWith(document, candidate, canReadSlide, true));
  } catch {
    field = 'threw';
  }
  if (field !== null)
    options.onDisagree?.({
      opId: candidate.opId,
      ops: (candidate.mutations ?? []).map((mutation) => mutation.op),
      field,
    });
  return decided;
}

/** The first field two landings of one entry differ in; null when they agree. */
function landingDiffers(a: Landing, b: Landing): AdmissionDisagreement['field'] | null {
  if (a.ok !== b.ok) return 'ok';
  if (!a.ok && !b.ok) {
    if (a.rejected.reason !== b.rejected.reason) return 'reason';
    if (a.rejected.message !== b.rejected.message) return 'message';
    return null;
  }
  if (a.ok && b.ok) {
    if (canonicalJson(a.mutations) !== canonicalJson(b.mutations)) return 'document';
    if (canonicalJson(a.document.deck) !== canonicalJson(b.document.deck)) return 'document';
    const ids = Object.keys(a.document.slides);
    if (ids.length !== Object.keys(b.document.slides).length) return 'document';
    for (const id of ids) {
      const left = a.document.slides[id];
      const right = b.document.slides[id];
      // a slide both placements share by reference is the same slide; the rest are compared
      if (left === right) continue;
      if (right === undefined || canonicalJson(left) !== canonicalJson(right)) return 'document';
    }
  }
  return null;
}

function landWith(
  document: DeckDocument,
  candidate: Candidate,
  canReadSlide: (slideId: string) => boolean,
  incremental: boolean,
): Landing {
  if (candidate.kind !== 'edit' || candidate.mutations === undefined) {
    return { ok: true, document, mutations: [] };
  }
  let placed: { mutations: Mutation[]; document: DeckDocument };
  try {
    placed = reanchorAll(
      document,
      candidate.mutations,
      incremental ? applyMutationsTouched : applyMutations,
    );
  } catch (error) {
    const touched = touchedSlides(candidate.mutations);
    const readable = touched.every(canReadSlide);
    return {
      ok: false,
      rejected: {
        opId: candidate.opId,
        reason: 'invalid',
        ...(readable && error instanceof Error ? { message: error.message } : {}),
      },
    };
  }
  const { mutations, document: next } = placed;
  for (const slideId of touchedSlides(mutations)) {
    const slide = next.slides[slideId];
    if (slide !== undefined && sizeOfSlide(slide) > CAPS.slideMaxBytes) {
      return { ok: false, rejected: { opId: candidate.opId, reason: 'too-large' } };
    }
  }
  // the deck cap (RUST-4, HR-RT#10): an entry that would take the deck past it is refused; one
  // that keeps or lowers the bytes of a deck already past it lands, so that deck can be trimmed
  const bytes = deckBytesAfter(document, next, mutations);
  if (bytes > CAPS.deckMaxBytes && bytes > deckBytes(document)) {
    return {
      ok: false,
      rejected: { opId: candidate.opId, reason: 'too-large', message: DECK_OVERSIZE_SENTENCE },
    };
  }
  // a write of slides is judged on those slides and, when the title followed a heading, the
  // manifest; a write of the deck on the whole document (HR-RT#5a)
  const slidesOnly = incremental ? slideLevelTargets(mutations) : null;
  const validation =
    slidesOnly === null
      ? validateDocument(next)
      : validateTouched(next, slidesOnly, manifestMoved(document.deck, next.deck));
  if (!validation.ok) {
    const touched = touchedSlides(mutations);
    const first = refusalIssue(validation.issues, touched);
    return {
      ok: false,
      rejected: {
        opId: candidate.opId,
        reason: 'invalid',
        ...(touched.every(canReadSlide) && first !== undefined
          ? { message: refusalMessage(first) }
          : {}),
      },
    };
  }
  return { ok: true, document: next, mutations };
}

/** True when a slide level write changed a field of the manifest (the title rule writes `title`). */
function manifestMoved(before: DeckDocument['deck'], after: DeckDocument['deck']): boolean {
  if (before === after) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys)
    if ((before as Record<string, unknown>)[key] !== (after as Record<string, unknown>)[key])
      return true;
  return false;
}

/**
 * The issue a refusal names (the focus round, cycle 2; VERIFICATION C2-F1). The validator sorts
 * its issues by severity, then by file name, so on a document whose slide fails its own schema
 * after the write the manifest's `reference` issue ("No slide file for X": a slide that does not
 * validate is left out of the slide map, and the manifest still lists it) comes before the
 * slide's own issue (`Unknown field "typography"` on a list block, the cause). The seller and
 * the probe need the cause: the first severity 3 issue on a slide the write touched, else the
 * first that is not a reference, else the first. Before this the reject card of a `block.set
 * /typography` on a plain block read "No slide file for blank-1 (slides/blank-1.json)" and three
 * passes read it as a store that had lost a slide body. Pure.
 */
export function refusalIssue(
  issues: ReadonlyArray<Issue>,
  touched: ReadonlyArray<string>,
): Issue | undefined {
  const blocking = issues.filter((issue) => issue.severity === 3);
  const files = new Set(touched.map((slideId) => `slides/${slideId}.json`));
  return (
    blocking.find((issue) => files.has(issue.file)) ??
    blocking.find((issue) => issue.code !== 'reference') ??
    blocking[0]
  );
}

/** The refusal's sentence: the slide file first when the issue is a slide's, then the pointer and the message. */
export function refusalMessage(issue: Issue): string {
  const file = issue.file.startsWith('slides/') ? `${issue.file} ` : '';
  return `${file}${issue.pointer}: ${issue.message}`;
}

// ---------------------------------------------------------------------------------------------
// The roster's hue slot and the reader's projection (SPEC-3 3.8, 4.8; report 10 F21, F25)

/** The hue slot the room grants a principal (SPEC-3 3.8; research 11 3.1): its preferred slot, else the least used, held for the entry's life. */
export function grantHueSlot(principalId: string, roster: readonly RosterEntry[]): HueSlot {
  const own = roster.find((row) => row.principalId === principalId);
  if (own !== undefined) return (own.hueSlot + 1) as HueSlot;
  const held = roster.map((row) => (row.hueSlot + 1) as HueSlot);
  return assignHueSlot(preferredHueSlot(principalId), held);
}

/** The word a link visitor sees instead of a named person (SPEC-3 0.12, 4.8). */
export function roleWord(role: Role): string {
  switch (role) {
    case 'owner':
      return 'The owner';
    case 'editor':
      return 'An editor';
    case 'commenter':
      return 'A commenter';
    case 'viewer':
      return 'A viewer';
  }
}

/** The mark of a role word (docs/archive/rounds/PEOPLE.md 3.27): a plate keyed by the role, never the person's, the room's hue kept. */
export function roleMark(role: Role, hueSlot: HueSlot | null): MarkSpec {
  const word = roleWord(role);
  const synthetic: ResolvedIdentity = {
    principalId: `role:${role}`,
    kind: 'anonymous',
    displayName: word,
    label: word,
    trust: 'label',
    avatar: { variant: 'initials' },
    deleted: false,
    admin: false,
  };
  const spec = markSpec(synthetic, { hueSlot });
  return { ...spec, initials: word.split(' ').pop()?.[0]?.toUpperCase() ?? '', label: word };
}

export type ViewerFacts = {
  role: Role;
  via: string;
  /** the record's switch: names shown to people admitted by link (0.12) */
  showNames: boolean;
  readComments: boolean;
  /** the reader's principal id, so an `inbox` event reaches its principal's connections only (SPEC-3 3.3) */
  principalId?: string;
  /**
   * Whether the reader holds the deck's `share` capability (hardening HR-SD#1, DATA-V2; the fix
   * round after verifier pass 2, F2). False: every other principal's id in what the reader is
   * sent (the roster, the entries' authors, the comment ops, a checkpoint's author) is its
   * stand-in on the deck, as in the studio's answers. Absent, as on a ticket an older app minted:
   * ids pass as they did.
   */
  share?: boolean;
  /** the deck the reader reads, the stand-ins' deck */
  deckId?: string;
  /** the reader's own ids beside `principalId` (the identity, the account's aliases): they pass as they are */
  ownIds?: readonly string[];
  /**
   * The lowest stream position this reader may replay from (hardening HR-SD#1e): the position of
   * the document the server handed the reader, which that server signed (the loader's floor
   * token, the room ticket's `fl`). Null: no floor, the reader holds `history`. Absent: the
   * host signed nothing it can trust (a ticket an older app minted, a floor token that does not
   * verify), and `replayFloorFor` decides by the role.
   */
  floor?: number | null;
};

/**
 * The floor of a reader's replay (hardening HR-SD#1e): what the replay of a stream open or a
 * socket's hello never goes below for this reader. A reader with `history` (an owner, an editor:
 * `roleAllows` in @turboslide/identity/access) reads the op log in Version history anyway and
 * keeps the replay it had. A reader without it (a viewer, a commenter) replays from the position
 * its document was loaded at, signed by the server that loaded it; when the host holds no signed
 * position for the reader, the floor is the head at the open, so the reader gets no entry it did
 * not see live and a reconnect after a gap is answered `resync` (the current document).
 */
export function replayFloorFor(reader: ViewerFacts, head: number): number | null {
  if (reader.floor !== undefined) return reader.floor;
  return reader.role === 'owner' || reader.role === 'editor' ? null : head;
}

/**
 * What the reader's projection takes from its host (docs/CLOUDFLARE.md 3.3): the address of a
 * verified person the host resolved lately, for the entry a grant holder or the owner reads
 * (docs/archive/rounds/PEOPLE.md 3.7). On the function it is the instance's email memory (room.ts
 * `rememberedEmail`); in the object it is the ticket's `email` claim; a host with neither
 * answers nothing and the entry carries no address.
 */
export type ReaderDeps = {
  rememberedEmail: (principalId: string) => string | undefined;
  /**
   * The stand-in of a principal on a deck under the host's key (@turboslide/identity/stand-in):
   * the studio's stand-ins.ts on the function, the room secret's key in the object. A host
   * without one sends ids to every reader.
   */
  standIn?: (deckId: string, principalId: string) => string;
};

/**
 * The ids one reader reads (HR-SD#1): another principal's id as its stand-in for a reader who may
 * not share, null when every id passes (a reader who may share, an older ticket, a host with no key).
 */
export function readerStandIns(reader: ViewerFacts, deps: ReaderDeps): StandIns | null {
  const standIn = deps.standIn;
  const deckId = reader.deckId;
  if (reader.share !== false || standIn === undefined || deckId === undefined) return null;
  return standInsWith(
    (principalId) => standIn(deckId, principalId),
    [reader.principalId, ...(reader.ownIds ?? [])],
  );
}

function authorFor<T extends { principalId?: string }>(author: T, people: StandIns | null): T {
  return people === null || author.principalId === undefined
    ? author
    : { ...author, principalId: people(author.principalId) };
}

/** An entry as a reader reads it: the author and a comment op's people as stand-ins (HR-SD#1). */
export function entryForReader(entry: Entry, people: StandIns | null): Entry {
  if (people === null) return entry;
  return {
    ...entry,
    author: authorFor(entry.author, people),
    ...(entry.comment === undefined
      ? {}
      : { comment: commentOpWithStandIns(entry.comment, people) }),
  };
}

/** The host that remembers no address: a test, a reader with no verified people. */
export const NO_READER_MEMORY: ReaderDeps = { rememberedEmail: () => undefined };

/**
 * A roster entry as one reader may see it (SPEC-3 4.8): people with a grant see every named
 * person; a person admitted by link sees named people as their role word unless the owner turned
 * the switch on; anonymous labels and agents are shown to everyone as they are. A reader who may
 * not share reads another person's entry under the person's stand-in (HR-SD#1).
 */
export function rosterEntryForReader(
  entry: RosterEntry,
  reader: ViewerFacts,
  deps: ReaderDeps = NO_READER_MEMORY,
): RosterEntry {
  return authorFor(rosterEntryShown(entry, reader, deps), readerStandIns(reader, deps));
}

function rosterEntryShown(entry: RosterEntry, reader: ViewerFacts, deps: ReaderDeps): RosterEntry {
  const byLink = reader.via === 'link' || reader.via === 'open';
  /* the address is never the shared entry's (docs/archive/rounds/PEOPLE.md 3.7): whatever a stored entry
     carries is dropped and the reader's own view decides below */
  const { email: _email, ...bare } = entry;
  if (!byLink || reader.showNames) {
    const email =
      bare.trust === 'verified' && (reader.via === 'owner' || reader.via === 'grant')
        ? deps.rememberedEmail(bare.principalId)
        : undefined;
    return email === undefined ? bare : { ...bare, email };
  }
  /* a generated label, a typed name and an agent's name pass through (b1.md R16; docs/archive/rounds/PRODUCT.md
     section 2 rank 4: the typed name is what the presence chips show to collaborators, and the
     prompt's own words are "Your name, shown to collaborators"); the role word stays for a
     verified account's name while the owner's switch is off (SPEC-3 0.12) */
  if (bare.trust === 'label' || bare.trust === 'guest' || bare.trust === 'agent') return bare;
  const word = roleWord(bare.role);
  /* the whole mark is the role's (docs/archive/rounds/PEOPLE.md 3.27; default 6): a plate keyed by the role
     word, no picture, no glyph seed of the person's, the hue kept because it is the room's grant
     and not the person's, so a visitor who later gains a grant cannot pair the plates */
  const slot = bare.hueSlot + 1;
  const mark = roleMark(bare.role, slot >= 1 && slot <= 6 ? (slot as HueSlot) : null);
  return {
    ...bare,
    label: word,
    trust: 'label',
    mark: mark as unknown as Record<string, unknown>,
  };
}

/** A slide field the reader may not see: the notes below editor (report 10 F21). */
export function stripNotes(entry: Entry): Entry | null {
  if (entry.kind !== 'edit' || entry.mutations === undefined) return entry;
  const mutations: Mutation[] = [];
  for (const mutation of entry.mutations) {
    if (mutation.op === 'slide.set' && mutation.path === '/notes') continue;
    if (mutation.op === 'slide.insert' || mutation.op === 'slide.replace') {
      const { notes: _notes, ...slide } = mutation.slide as Slide & { notes?: string };
      mutations.push({ ...mutation, slide: slide as Slide });
      continue;
    }
    mutations.push(mutation);
  }
  if (mutations.length === 0) return null;
  return { ...entry, mutations };
}

/**
 * An entry a reader may not read, as that reader's stream carries it (hardening HR-RC#10): the
 * seq, the revision, the writer's ids and the time, with no content. A tab moves its position
 * one seq at a time, so an entry left out of a reader's stream was a gap the tab waited on for
 * good: a viewer without the comments switch, after anyone's comment, and a viewer or a
 * commenter, after an editor's speaker notes, applied no later edit until a reload, the reopen
 * of the gap watch replaying the same gap. The entry is an edit with no mutations that names its
 * own op id in `covers`, the shape every client's schema reads (protocol.ts `hasPayload`), so a
 * tab of an older build moves past it as well; the client applies nothing for it.
 */
export function hiddenEntry(entry: Entry): Entry {
  return {
    seq: entry.seq,
    rev: entry.rev,
    kind: 'edit',
    author: entry.author,
    clientId: entry.clientId,
    opId: entry.opId,
    mutations: [],
    covers: entry.covers !== undefined && entry.covers.length > 0 ? entry.covers : [entry.opId],
    at: entry.at,
  };
}

/**
 * The events one stream forwards (SPEC-3 3.3, report 10 F25): an owner and an editor receive
 * every operation; a commenter and a viewer receive operations with the notes stripped
 * (docs/archive/rounds/SYNC.md 3.7, invariant 6: before the sync round a viewer received checkpoints alone, so
 * its revision climbed while its document stood still and it read nothing without a reload,
 * audit-ordering item 2); everyone receives checkpoints, presence and the deck level notices;
 * comment entries only a reader with `readComments`. Every entry keeps its seq: one the reader
 * may not read (a comment without `readComments`, an edit of the notes alone) arrives as
 * `hiddenEntry` (HR-RC#10). A reader who may not share reads every other principal's id as its
 * stand-in (HR-SD#1; `readerStandIns`).
 */
export function filterEventForReader(
  event: RoomEvent,
  reader: ViewerFacts,
  deps: ReaderDeps = NO_READER_MEMORY,
): RoomEvent | null {
  const canSeeOps =
    reader.role === 'owner' ||
    reader.role === 'editor' ||
    reader.role === 'commenter' ||
    reader.role === 'viewer';
  const fullOps = reader.role === 'owner' || reader.role === 'editor';
  const people = readerStandIns(reader, deps);
  const filterEntry = (entry: Entry): Entry => {
    if (entry.kind === 'comment')
      return entryForReader(reader.readComments ? entry : hiddenEntry(entry), people);
    if (!canSeeOps) return entryForReader(hiddenEntry(entry), people);
    const shown = fullOps ? entry : stripNotes(entry);
    return entryForReader(shown ?? hiddenEntry(entry), people);
  };
  switch (event.type) {
    case 'op':
      return { type: 'op', entry: filterEntry(event.entry) };
    case 'ops':
      return { type: 'ops', entries: event.entries.map(filterEntry) };
    case 'presence':
      return { ...event, state: rosterEntryForReader(event.state, reader, deps) };
    case 'checkpoint':
      return people === null ? event : { ...event, author: authorFor(event.author, people) };
    case 'reject':
      return people === null || event.comment === undefined
        ? event
        : { ...event, comment: commentOpWithStandIns(event.comment, people) };
    case 'inbox':
      if (event.principalId !== undefined && event.principalId !== reader.principalId) return null;
      return { type: 'inbox', unread: event.unread };
    default:
      return event;
  }
}

// ---------------------------------------------------------------------------------------------
// The editing ceiling (SPEC-3 0.9)

/** The count of editing connections in a roster (SPEC-3 0.9). */
export function editingCount(roster: readonly RosterEntry[]): number {
  return roster.filter((row) => row.role === 'owner' || row.role === 'editor').length;
}

/** True when a new editing tab must open in Viewing mode (SPEC-3 0.9). */
export function overEditingCeiling(roster: readonly RosterEntry[], role: Role): boolean {
  return (role === 'owner' || role === 'editor') && editingCount(roster) >= EDITING_TABS_MAX;
}
