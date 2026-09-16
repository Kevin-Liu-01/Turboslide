import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';

import type {
  EditorAccess,
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

/** The 1 based number of a slide in the deck's order, or null when the deck has no such slide. */
export function slideNumberOf(document: DeckDocument, slideId: string | undefined): number | null {
  if (slideId === undefined) return null;
  const index = slideOrder(document.deck).indexOf(slideId);
  return index < 0 ? null : index + 1;
}

/**
 * The self filter on every presence surface (gslides-parity SPEC-5-amendments A3 item 5): a row
 * is this tab when its client id is the self row's or any id this tab held before, and this
 * person when its principal id is the self row's, and neither is ever drawn as a collaborator (a
 * chip, a roster row, a filmstrip mark, an outline, a caret, a flag, a pointer, a follow target,
 * an announcement). The editor partitions its roster before the surfaces read it
 * (client-ids.ts `partitionRoster`); the surfaces apply the rule again here so it holds whatever
 * roster a caller passed, and a route that knows only its account passes it as `self`.
 */
export function withoutSelf<T extends { clientId: string; principalId?: string }>(
  others: readonly T[],
  self: { clientId?: string | null; principalId?: string | null } | null | undefined,
  ownClientIds: ReadonlySet<string> = new Set(),
): T[] {
  const clientId = self?.clientId ?? null;
  const principalId = self?.principalId ?? null;
  return others.filter(
    (row) =>
      row.clientId !== clientId &&
      !ownClientIds.has(row.clientId) &&
      (principalId === null || row.principalId !== principalId),
  );
}

/** The collaborators of a presence record: `others` without this tab and this person (`withoutSelf`). */
export function othersOf(presence: EditorPresence | undefined): PresenceParticipant[] {
  if (presence === undefined) return [];
  return withoutSelf(presence.others, presence.self ?? null);
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

/** The trust word beside a name: "guest" for a typed name alone (15). */
export function trustWordFor(identity: Pick<IdentityView, 'trust'>): string | null {
  return identity.trust === 'guest' ? PRESENCE.guest : null;
}

/** The role word of a roster row (4.5): the role, or "by link" for a person admitted by a link. */
export function rosterRoleWord(participant: PresenceParticipant): string {
  if (participant.role === 'link' || participant.role === 'none') return PRESENCE.byLink;
  return PRESENCE.roleWord[participant.role];
}

/**
 * Follow is offered on editors and owners with a slide selected and refused for viewers,
 * commenters, anonymous people and agents (4.4); the caller needs the `follow` capability (6.2).
 */
export function canFollow(
  participant: PresenceParticipant,
  capabilities: readonly EditorCapability[] | undefined,
): boolean {
  if (capabilities !== undefined && !capabilities.includes('follow')) return false;
  if (participant.trust === 'agent' || participant.kind !== 'account') return false;
  if (participant.role !== 'editor' && participant.role !== 'owner') return false;
  return participant.slideId !== undefined;
}

/** The chip's tooltip: "Maya · guest · slide 12" (11 6.2). */
export function chipTipOf(
  participant: PresenceParticipant,
  viewer: ViewerFacts,
  slide: number | null,
): string {
  return PRESENCE.chipTip(displayNameFor(participant, viewer), trustWordFor(participant), slide);
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

/** True while pointers are drawn: under the cap and not in present mode (4.4). */
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
