import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';

import { trustTooltip } from '@turboslide/identity/resolve';

import type {
  EditorAccess,
  EditorAccount,
  EditorCapability,
  EditorPresence,
  IdentityView,
  PresenceParticipant,
} from '../editor-shell';
import { AGENT_SENTENCES, PRESENCE } from '../menus/strings';

/**
 * The presence surfaces' pure rules (gslides-parity SPEC-3 4.2 to 4.8; research 11 sections 3,
 * 6): which chips fill the four slots and what the `+N` chip counts, what name a viewer sees for
 * a participant (0.12, 4.8), who can be followed (4.4), the chip's tooltip (11 6.2), the flag's
 * text inside its fixed width (11 6.5), the slide a participant has open as a number, the flags
 * that stack when two carets meet, and the collaborator announcements of 4.9 coalesced to one
 * sentence per 5 s per person. No React, no DOM: `presence-model.test.ts` runs in Node.
 */

/** How many other chips the slot shows before the `+N` chip counts the rest (4.2). */
export const PRESENCE_SLOTS = 4;
/** The live pointer cap (0.6). */
export const POINTER_CAP = 20;
/** The flag's text capacity in characters after the 14 px chip and its gap (11 6.5: 120 px fixed). */
export const FLAG_CAPACITY = 13;
/** A flag fades this long after its caret last moved (11 6.5). */
export const FLAG_FADE_MS = 3000;
/** A caret dims after this long without a presence update (11 6.5). */
export const CARET_DIM_MS = 30_000;
/** The announcements region says at most one sentence per person per this window (4.9). */
export const ANNOUNCE_WINDOW_MS = 5000;
/**
 * A remote caret's bar keeps its last box this long when the range at its offset cannot be
 * measured (docs/REALTIME.md 3.5; audit-people.md defect 4): the run is mid render or the text
 * has not caught up, and the run's start would read as offset 0.
 */
export const CARET_KEEP_MS = 300;

/**
 * The box of a block another person is moving or resizing, in sheet units (docs/REALTIME.md
 * 3.4 `drag`): present on a participant only while that person's pointer is down. The chrome
 * has no dependency on `@turboslide/realtime`, so the shape is read here.
 */
export type PresenceDragView = { blockId: string; x: number; y: number; w: number; h: number };

/** The drag box a participant carries, or null; read structurally off the participant. */
export function dragOf(participant: unknown): PresenceDragView | null {
  if (typeof participant !== 'object' || participant === null || !('drag' in participant))
    return null;
  const raw = (participant as { drag: unknown }).drag;
  if (typeof raw !== 'object' || raw === null) return null;
  const { blockId, x, y, w, h } = raw as Record<string, unknown>;
  if (typeof blockId !== 'string' || blockId === '') return null;
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { blockId, x: x as number, y: y as number, w: w as number, h: h as number };
}

/**
 * The box a remote caret draws at (3.5): the measured one when the range measured, else the box
 * drawn last while it is younger than CARET_KEEP_MS (`kept` true), else nothing, so the caller
 * falls to the block's box rather than to offset 0 of the run.
 */
export function keptCaretBox<B>(
  measured: B | null,
  kept: { box: B; at: number } | undefined,
  now: number,
): { box: B; kept: boolean } | null {
  if (measured !== null) return { box: measured, kept: false };
  if (kept !== undefined && now - kept.at < CARET_KEEP_MS) return { box: kept.box, kept: true };
  return null;
}

/**
 * Whether this tab publishes its own pointer (docs/REALTIME.md 3.5; Google's rule in
 * audit-people.md section 2): View > Live pointers > Show my pointer on, and a role that may
 * edit. Every access level draws the others' pointers (`pointersDrawn`); only an owner or an
 * editor sends one, and the server strips a pointer from anyone else's row either way.
 */
export function pointerPublished(
  presence: Pick<EditorPresence, 'pointerMine'>,
  role: string | null | undefined,
): boolean {
  return presence.pointerMine === true && (role === 'owner' || role === 'editor');
}

/** The 1 based number of a slide in the deck's order, or null when the deck has no such slide. */
export function slideNumberOf(document: DeckDocument, slideId: string | undefined): number | null {
  if (slideId === undefined) return null;
  const index = slideOrder(document.deck).indexOf(slideId);
  return index < 0 ? null : index + 1;
}

/** The chips of the four slots in roster order and the count the `+N` chip shows (0 draws it empty). */
export function slotChips(others: readonly PresenceParticipant[]): {
  shown: PresenceParticipant[];
  more: number;
} {
  const shown = others.slice(0, PRESENCE_SLOTS);
  return { shown, more: Math.max(0, others.length - shown.length) };
}

/** What the caller knows about themselves, for the names they may see (4.8). */
export type ViewerFacts = {
  /** the caller got in by a link (`access.via === 'link'`) or the open mode */
  viaLink: boolean;
  /** the owner's "Show names to people with the link" switch */
  showNames: boolean;
};

export function viewerFactsOf(
  access: EditorAccess | undefined,
  presence: EditorPresence | undefined,
): ViewerFacts {
  return {
    viaLink: access?.via === 'link' || access?.via === 'open',
    showNames: presence?.showNames ?? access?.settings?.showNamesToLinkVisitors ?? false,
  };
}

/** The four role words the server writes into a verified person's entry for a link visitor (room.ts rosterEntryForReader). */
const ROLE_WORD_LABELS: ReadonlySet<string> = new Set([
  PRESENCE.theOwner,
  PRESENCE.anEditor,
  PRESENCE.aCommenter,
  PRESENCE.aViewer,
]);

/**
 * True for an entry the server rewrote for a link visitor (0.12; build/b1.md R2): its label is
 * one of the four role words and its trust reads `label`, so the person behind it is signed in
 * and the label is not a generated one.
 */
export function isRoleWordView(identity: Pick<IdentityView, 'trust' | 'label'>): boolean {
  return identity.trust === 'label' && ROLE_WORD_LABELS.has(identity.label);
}

/** The role word a link visitor sees instead of a verified person's name (0.12). */
export function roleWordFor(role: PresenceParticipant['role']): string {
  switch (role) {
    case 'owner':
    case 'editor':
      return PRESENCE.anEditor;
    case 'commenter':
      return PRESENCE.aCommenter;
    default:
      return PRESENCE.aViewer;
  }
}

/**
 * The name a participant shows this viewer (4.8): a verified account's name only to grant
 * holders or under the switch, else its role word; a label or a typed name to everyone; an agent
 * as "Agent · <runId>".
 */
export function displayNameFor(participant: PresenceParticipant, viewer: ViewerFacts): string {
  if (participant.trust === 'agent')
    return participant.runId === undefined
      ? (participant.name ?? participant.label)
      : AGENT_SENTENCES.agentTrust(participant.runId);
  if (participant.trust === 'verified' && viewer.viaLink && !viewer.showNames)
    return roleWordFor(participant.role);
  return participant.name ?? participant.label;
}

/**
 * The trust word beside a name (15; docs/archive/rounds/PEOPLE.md 2.2 default 3): "guest" for a typed name,
 * "signed in" for a verified account (the accessible word beside the badge), nothing for a label,
 * an agent or a deleted account.
 */
export function trustWordFor(
  identity: Pick<IdentityView, 'trust'> & { deleted?: boolean },
): string | null {
  if (identity.trust === 'guest') return PRESENCE.guest;
  if (identity.trust === 'verified' && identity.deleted !== true) return PRESENCE.signedIn;
  return null;
}

/**
 * The trust sentence of a tooltip's doc line (research 11 5.2; docs/archive/rounds/PEOPLE.md 3.7): "Signed in
 * as <email>" when the view carries an address the reader may see, "Signed in" for a verified
 * person without one, "Not signed in. This name was typed, not verified." for a guest, "Not signed
 * in. A generated label for this browser." for a label, the agent's sentence for an agent.
 */
export function trustSentenceOf(identity: Pick<IdentityView, 'trust' | 'email'>): string {
  return trustTooltip(identity.trust, identity.email);
}

/**
 * The one identity this browser reads as itself on every surface (docs/archive/rounds/PEOPLE.md 3.11; authorship
 * 12): the account's principal when signed in (it carries the address), else the roster's own
 * entry (it carries the server's mark, the typed name and the hue), else the account's principal
 * from the page payload, else nothing. The own chip, the account head, the Profile head, the
 * version rows' You and the Share dialog's You read this and nothing else.
 */
export function meOf(input: {
  account?: Pick<EditorAccount, 'principal' | 'signedIn'> | undefined;
  presence?: Pick<EditorPresence, 'self'> | undefined;
}): IdentityView | null {
  if (input.account?.signedIn === true) return input.account.principal;
  /* an anonymous person too reads `account.principal` when it names a real principal: the editor
     builds it from the roster's own row under the last answer of Change name or Change avatar
     (docs/archive/rounds/PEOPLE.md 3.11; own-identity.ts), so the own chip and the two heads change with the
     answer and not with the room's 5 s identity cache, which on the blob tier left the chip on the
     old name for 3 to 5 s (the integrator's preview readings of people.own-chip-follows-name and
     -avatar); the roster row stands in when the payload named nobody */
  const principal = input.account?.principal;
  if (principal !== undefined && /^(anon_|usr_)/.test(principal.principalId)) return principal;
  return input.presence?.self ?? principal ?? null;
}

/** The role word of a roster row (4.5): the role, or "by link" for a person admitted by a link. */
export function rosterRoleWord(participant: PresenceParticipant): string {
  if (participant.role === 'link' || participant.role === 'none') return PRESENCE.byLink;
  return PRESENCE.roleWord[participant.role];
}

/**
 * Follow is offered on editors and owners with a slide selected and refused for viewers,
 * commenters and agents (4.4); the caller needs the `follow` capability (6.2). An anonymous
 * editor can be followed (the polish round, docs/archive/rounds/POLISH.md item 104): every seller on a
 * deployment without sign in is anonymous, and the rule that followed accounts alone offered
 * "Go to slide 3" and never Follow there. Since the realtime round (docs/REALTIME.md 2 row
 * realtime.follow.for-everyone, 7 default 5) the server grants `follow` to every editor and owner,
 * by link included (packages/identity/src/access.ts), and the row `title.presence.follow` is in
 * the default view, so this predicate answers true for every editor and owner with a slide open.
 */
export function canFollow(
  participant: PresenceParticipant,
  capabilities: readonly EditorCapability[] | undefined,
): boolean {
  if (capabilities !== undefined && !capabilities.includes('follow')) return false;
  if (participant.trust === 'agent') return false;
  if (participant.role !== 'editor' && participant.role !== 'owner') return false;
  return participant.slideId !== undefined;
}

/** The chip's tooltip name line: "Maya · guest · slide 12" (11 6.2). */
export function chipTipOf(
  participant: PresenceParticipant,
  viewer: ViewerFacts,
  slide: number | null,
): string {
  return PRESENCE.chipTip(displayNameFor(participant, viewer), trustWordFor(participant), slide);
}

/**
 * The trust sentence a participant's tooltip carries for this viewer (docs/archive/rounds/PEOPLE.md 3.7): a
 * verified person a link visitor sees as a role word (the server's rewrite, or the chrome's under
 * `displayNameFor`) reads the plain "Signed in", never the address and never the generated label
 * sentence (build/b1.md R2); everyone else reads `trustSentenceOf`.
 */
export function trustSentenceFor(participant: PresenceParticipant, viewer: ViewerFacts): string {
  if (isRoleWordView(participant)) return trustSentenceOf({ trust: 'verified' });
  if (participant.trust === 'verified' && viewer.viaLink && !viewer.showNames)
    return trustSentenceOf({ trust: 'verified' });
  return trustSentenceOf(participant);
}

/**
 * The chip's tooltip doc line (docs/archive/rounds/PEOPLE.md 3.7; the row people.chip-tooltip-trust): the trust
 * sentence first, then the action sentence the surface adds ("Go to slide 12", "Click to follow;
 * click again to stop") when it has one.
 */
export function chipTipDocOf(
  participant: PresenceParticipant,
  viewer: ViewerFacts,
  action?: string,
): string {
  const sentence = trustSentenceFor(participant, viewer);
  return action === undefined || action === '' ? sentence : `${sentence} ${action}`;
}

/**
 * The flag's words inside its fixed 120 px (11 6.5): the first name, then " · guest" only when
 * the capacity has room for it; the ellipsis is the stylesheet's.
 */
export function flagText(name: string, trust: IdentityView['trust']): string {
  const first = name.trim().split(/\s+/u)[0] ?? name;
  if (trust !== 'guest') return first;
  const suffix = ` · ${PRESENCE.guest}`;
  return first.length + suffix.length <= FLAG_CAPACITY ? `${first}${suffix}` : first;
}

/** The participants with a live entry on a slide, in roster order (4.3). */
export function participantsOnSlide(
  others: readonly PresenceParticipant[],
  slideId: string,
): PresenceParticipant[] {
  return others.filter((each) => each.slideId === slideId);
}

/** The participants whose selection names a block, in roster order (4.4, "being edited by"). */
export function participantsOnBlock(
  others: readonly PresenceParticipant[],
  blockId: string,
): PresenceParticipant[] {
  return others.filter((each) => each.selection?.blockIds.includes(blockId) === true);
}

/**
 * True while the others' pointers are drawn (4.4; docs/REALTIME.md 3.5): View > Live pointers >
 * Show collaborator pointers on (the default), not in present mode, and no more than the cap of
 * participants in the room (Google stops pointers past 20 collaborators). Drawn for every access
 * level; `pointerPublished` is the sending side's rule.
 */
export function pointersDrawn(
  presence: EditorPresence,
  participants: number,
  present: boolean,
): boolean {
  return (
    (presence.pointersVisible ?? true) && !present && participants <= (presence.cap ?? POINTER_CAP)
  );
}

/**
 * Two carets whose flags would overlap stack the later one 20 px higher (11 6.5): the flags in
 * order, each with its top left in CSS pixels, moved up by 20 px per earlier flag it overlaps.
 */
export function stackFlags<T extends { x: number; y: number }>(
  flags: readonly T[],
  width = 120,
  height = 18,
): T[] {
  const placed: T[] = [];
  for (const flag of flags) {
    let y = flag.y;
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        const overlaps =
          Math.abs(other.x - flag.x) < width && y < other.y + height && other.y < y + height;
        if (overlaps) {
          y = other.y - 20;
          moved = true;
        }
      }
    }
    placed.push(y === flag.y ? flag : { ...flag, y });
  }
  return placed;
}

// ---------------------------------------------------------------------------------------------
// The collaborator announcements (4.9)

export type AnnouncementKind = 'joined' | 'left' | 'editing';

/**
 * The sentences the `aria-live` region speaks between two roster snapshots: who joined, who left,
 * who moved to which slide; coalesced to one sentence per person per 5 s (the newest wins).
 */
export class Announcer {
  private readonly lastSpoken = new Map<string, number>();
  private readonly lastSlide = new Map<string, string | undefined>();
  private readonly names = new Map<string, string>();
  private known = new Set<string>();
  private readonly windowMs: number;

  constructor(windowMs: number = ANNOUNCE_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  /** The sentences for the roster `next` at time `now`, against the roster last seen. */
  update(
    next: readonly PresenceParticipant[],
    viewer: ViewerFacts,
    document: DeckDocument,
    now: number,
  ): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const say = (id: string, sentence: string): void => {
      const last = this.lastSpoken.get(id);
      if (last !== undefined && now - last < this.windowMs) return;
      this.lastSpoken.set(id, now);
      out.push(sentence);
    };
    for (const each of next) {
      seen.add(each.clientId);
      const name = displayNameFor(each, viewer);
      if (!this.known.has(each.clientId)) {
        say(each.clientId, PRESENCE.joined(name));
      } else if (this.lastSlide.get(each.clientId) !== each.slideId && each.slideId !== undefined) {
        const n = slideNumberOf(document, each.slideId);
        if (n !== null) say(each.clientId, PRESENCE.editing(name, n));
      }
      this.lastSlide.set(each.clientId, each.slideId);
    }
    for (const id of this.known) {
      if (seen.has(id)) continue;
      const name = this.names.get(id) ?? '';
      if (name !== '') say(id, PRESENCE.left(name));
      this.lastSlide.delete(id);
      this.names.delete(id);
    }
    for (const each of next) this.names.set(each.clientId, displayNameFor(each, viewer));
    this.known = seen;
    return out;
  }
}
