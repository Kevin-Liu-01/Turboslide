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
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { NotImplementedError } from '@turboslide/schema/errors';
import { canonicalJson } from '@turboslide/schema/json';
import type { Mutation } from '@turboslide/schema/mutations';
import { isSlideFieldPath } from '@turboslide/schema/mutations';
import { applyMutations } from '@turboslide/schema/reduce';
import { insertTieSide, isTextOp, sameText, transformMutation } from '@turboslide/schema/transform';
import type { Side } from '@turboslide/schema/transform';
import { validateDocument } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';
import { touchedSlides } from '@turboslide/store/store';

import { CAPS } from './admission.ts';
import { entryRun, runTieSide } from './channel.ts';
import type { Entry, NewEntry, RejectReason, RoomEvent, RosterEntry } from './channel.ts';
import { EDITING_TABS_MAX } from './protocol.ts';
import type { OpsPost } from './protocol.ts';

export { entryRun, runTieSide, touchedSlides };

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

/** A slide document after the write is at most 200 KB (report 04 7.5, 10 F27). */
function slideBytes(slide: Slide): number {
  return new TextEncoder().encode(canonicalJson(slide)).byteLength;
}

/**
 * The whole Text rewrites a text op cannot survive (SPEC-3 3.5): a set of its own pointer, its
 * block's removal, its slide's replacement, and a `slide.set` of the slide field the op names
 * (docs/SYNC.md 3.4: the heading, the lead and the big text are text runs whose whole value
 * write is `slide.set /heading` and the like; it rewrites that field's ops alone).
 */
function rewritesText(against: Mutation, op: Mutation): boolean {
  if (!isTextOp(op)) return false;
  switch (against.op) {
    case 'block.set':
      return (
        against.slideId === op.slideId && against.blockId === op.blockId && against.path === op.path
      );
    case 'text.replace':
      return (
        against.slideId === op.slideId && against.blockId === op.blockId && against.path === op.path
      );
    case 'slide.set':
      return (
        against.slideId === op.slideId &&
        isSlideFieldPath(against.path) &&
        op.path === against.path &&
        op.blockId === against.path.slice(1)
      );
    case 'block.remove':
      return against.slideId === op.slideId && against.blockId === op.blockId;
    case 'slide.replace':
      // the slide was rewritten (a canvas conversion, the source drawer): a text op on a block
      // whose id survives is kept and re-anchored, the rest return to their author (SPEC-3 3.5)
      return (
        against.slideId === op.slideId &&
        !slideBlocks(against.slide).some((row) => row.block.id === op.blockId)
      );
    case 'slide.remove':
      return against.slideId === op.slideId;
    case 'version.restore':
      return true;
    default:
      return false;
  }
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
};

/** The landed entries' mutations in order, each with the tie the POST's inserts take against it. */
export function landedOf(entries: ReadonlyArray<Entry>, post: OpsPost): Landed[] {
  const out: Landed[] = [];
  for (const entry of entries) {
    const insertTie: Side =
      post.insertTie === 'client-id' ? insertTieSide(post.clientId, entry.clientId) : 'right';
    for (const mutation of entry.mutations ?? []) out.push({ mutation, insertTie });
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
 */
export function transformEntry(
  mutations: readonly Mutation[],
  landed: ReadonlyArray<Landed>,
  run = false,
): Mutation[] | null {
  let out: Mutation[] = yieldConcurrentConversion(mutations, landed);
  if (out.length === 0) return null;
  for (const row of landed) {
    const against = row.mutation;
    const insertTie = row.own === true ? row.insertTie : runTieSide(run, row.insertTie);
    const next: Mutation[] = [];
    for (const mutation of out) {
      if (rewritesText(against, mutation)) continue;
      if (isTextOp(mutation) && isTextOp(against) && sameText(mutation, against)) {
        try {
          next.push(...transformMutation(mutation, against, 'right', insertTie));
        } catch (error) {
          if (error instanceof NotImplementedError) next.push(mutation);
          else throw error;
        }
        continue;
      }
      next.push(mutation);
    }
    out = next;
    if (out.length === 0) return null;
  }
  return out;
}

/**
 * Two tabs converting one slide at once (the realtime round, R1's two process run; the row
 * `realtime.title.two-typers`, and the mechanism behind the standing red
 * `sync.title.concurrent-both-kept`): a title that wraps while two people type into it converts
 * the cover to a canvas in both tabs within the same batch (viewer Editor.tsx 1786, 1812), so
 * each tab posts `slide.replace` with its own copy of the slide beside its `text.splice`. The
 * first lands; the second's `slide.replace` would put back a slide without the first's word and
 * its splice, moved past the first's by the transform, then falls outside its own copy's text
 * ("text.splice: 40 plus 0 is outside a text of 32 characters", the whole entry refused, the
 * second word lost). The rule: an entry that carries a `slide.replace` of a slide another
 * `slide.replace` of the same slide replaced since its base, together with a text op on that
 * slide, yields its own replacement and keeps the rest, so the first conversion stands and the
 * second typist's word rides onto it through the ordinary transform. A bare `slide.replace`
 * (the source drawer, `slide.toCanvas`) keeps the last writer wins rule as before. Pure.
 */
export function yieldConcurrentConversion(
  mutations: readonly Mutation[],
  landed: ReadonlyArray<Landed>,
): Mutation[] {
  const replaced = new Set<string>();
  for (const { mutation } of landed)
    if (mutation.op === 'slide.replace') replaced.add(mutation.slideId);
  if (replaced.size === 0) return [...mutations];
  const typedOn = new Set<string>();
  for (const mutation of mutations) if (isTextOp(mutation)) typedOn.add(mutation.slideId);
  return mutations.filter(
    (mutation) =>
      !(
        mutation.op === 'slide.replace' &&
        replaced.has(mutation.slideId) &&
        typedOn.has(mutation.slideId)
      ),
  );
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
): { mutations: Mutation[]; document: DeckDocument } {
  if (mutations.length <= 1) {
    const placed = mutations.map((mutation) => reanchor(document, mutation));
    return { mutations: placed, document: applyMutations(document, placed).document };
  }
  const placed: Mutation[] = [];
  let running = document;
  for (const mutation of mutations) {
    const next = reanchor(running, mutation);
    placed.push(next);
    running = applyMutations(running, [next]).document;
  }
  return { mutations: placed, document: running };
}

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

/** Applies one candidate to the running document and validates; the reject reason when it cannot land. */
export function landCandidate(
  document: DeckDocument,
  candidate: Candidate,
  canReadSlide: (slideId: string) => boolean,
): { ok: true; document: DeckDocument; mutations: Mutation[] } | { ok: false; rejected: Rejected } {
  if (candidate.kind !== 'edit' || candidate.mutations === undefined) {
    return { ok: true, document, mutations: [] };
  }
  let placed: { mutations: Mutation[]; document: DeckDocument };
  try {
    placed = reanchorAll(document, candidate.mutations);
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
    if (slide !== undefined && slideBytes(slide) > CAPS.slideMaxBytes) {
      return { ok: false, rejected: { opId: candidate.opId, reason: 'too-large' } };
    }
  }
  const validation = validateDocument(next);
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

/** The mark of a role word (docs/PEOPLE.md 3.27): a plate keyed by the role, never the person's, the room's hue kept. */
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
};

/**
 * What the reader's projection takes from its host (docs/CLOUDFLARE.md 3.3): the address of a
 * verified person the host resolved lately, for the entry a grant holder or the owner reads
 * (docs/PEOPLE.md 3.7). On the function it is the instance's email memory (room.ts
 * `rememberedEmail`); in the object it is the ticket's `email` claim; a host with neither
 * answers nothing and the entry carries no address.
 */
export type ReaderDeps = { rememberedEmail: (principalId: string) => string | undefined };

/** The host that remembers no address: a test, a reader with no verified people. */
export const NO_READER_MEMORY: ReaderDeps = { rememberedEmail: () => undefined };

/**
 * A roster entry as one reader may see it (SPEC-3 4.8): people with a grant see every named
 * person; a person admitted by link sees named people as their role word unless the owner turned
 * the switch on; anonymous labels and agents are shown to everyone as they are.
 */
export function rosterEntryForReader(
  entry: RosterEntry,
  reader: ViewerFacts,
  deps: ReaderDeps = NO_READER_MEMORY,
): RosterEntry {
  const byLink = reader.via === 'link' || reader.via === 'open';
  /* the address is never the shared entry's (docs/PEOPLE.md 3.7): whatever a stored entry
     carries is dropped and the reader's own view decides below */
  const { email: _email, ...bare } = entry;
  if (!byLink || reader.showNames) {
    const email =
      bare.trust === 'verified' && (reader.via === 'owner' || reader.via === 'grant')
        ? deps.rememberedEmail(bare.principalId)
        : undefined;
    return email === undefined ? bare : { ...bare, email };
  }
  /* a generated label, a typed name and an agent's name pass through (b1.md R16; docs/PRODUCT.md
     section 2 rank 4: the typed name is what the presence chips show to collaborators, and the
     prompt's own words are "Your name, shown to collaborators"); the role word stays for a
     verified account's name while the owner's switch is off (SPEC-3 0.12) */
  if (bare.trust === 'label' || bare.trust === 'guest' || bare.trust === 'agent') return bare;
  const word = roleWord(bare.role);
  /* the whole mark is the role's (docs/PEOPLE.md 3.27; default 6): a plate keyed by the role
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
 * The events one stream forwards (SPEC-3 3.3, report 10 F25): an owner and an editor receive
 * every operation; a commenter and a viewer receive operations with the notes stripped
 * (docs/SYNC.md 3.7, invariant 6: before the sync round a viewer received checkpoints alone, so
 * its revision climbed while its document stood still and it read nothing without a reload,
 * audit-ordering item 2); everyone receives checkpoints, presence and the deck level notices;
 * comment entries only a reader with `readComments`.
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
  const filterEntry = (entry: Entry): Entry | null => {
    if (entry.kind === 'comment') return reader.readComments ? entry : null;
    if (!canSeeOps) return null;
    return fullOps ? entry : stripNotes(entry);
  };
  switch (event.type) {
    case 'op': {
      const entry = filterEntry(event.entry);
      return entry === null ? null : { type: 'op', entry };
    }
    case 'ops': {
      const entries = event.entries
        .map(filterEntry)
        .filter((entry): entry is Entry => entry !== null);
      return { type: 'ops', entries };
    }
    case 'presence':
      return { ...event, state: rosterEntryForReader(event.state, reader, deps) };
    case 'reject':
      return event;
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
