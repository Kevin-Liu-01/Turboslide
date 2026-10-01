// Who is who on a deck, as the editor's controller hands it to the chrome (docs/PEOPLE.md 3.8,
// 3.9, 3.11, 3.15, 3.16, 3.17; gslides-parity SPEC-3 4.11, 7.8): the payload's resolved people
// (the version authors, the comment authors, the record's people, resolved by the server at load)
// under the room's live roster and the caller, with two people of one text told apart by the
// "(2)" suffix in order of first appearance. Pure functions over the controller's state; the
// controller re-exports the two the editor root reads.
import type { IdentityView, PresenceParticipant } from '@turboslide/chrome/editor-shell';
import { disambiguateLabels, labelFor } from '@turboslide/identity/labels';
import type { RosterEntry } from '@turboslide/realtime/channel';
import { receivedAtOf } from '@turboslide/realtime/client/room-client';
import { dragOf } from '@turboslide/realtime/protocol';
import type { PresenceDrag } from '@turboslide/realtime/protocol';
import type { Thread } from '@turboslide/schema/comments';
import type { Author, Version } from '@turboslide/schema/mutations';

import type { EditorIdentity } from '../server/write';

/** The identity as the chrome draws it (SPEC-3 7.8), with the server's mark (docs/PEOPLE.md 3.11). */
export function identityView(identity: EditorIdentity | undefined, author: Author): IdentityView {
  if (identity === undefined) {
    return { principalId: author.name, label: author.name, trust: 'guest', kind: 'anonymous' };
  }
  return {
    principalId: identity.principalId,
    label: identity.label,
    ...(identity.name !== undefined ? { name: identity.name } : {}),
    trust: identity.trust,
    kind: identity.kind,
    ...(identity.email !== undefined ? { email: identity.email } : {}),
    ...(identity.mark !== undefined ? { mark: identity.mark } : {}),
    ...(identity.runId !== undefined ? { runId: identity.runId } : {}),
    ...(identity.deleted === true ? { deleted: true } : {}),
  };
}

/**
 * A participant with the round's drag box (docs/REALTIME.md 3.4, 3.5): the chrome's
 * `PresenceParticipant` plus `drag`, the box of the block the person is moving or resizing while
 * their pointer is down, read structurally off the roster entry. Assignable to the chrome's type
 * wherever a participant is expected; `RemoteCursors` reads the box through `dragOf`.
 */
export type ParticipantView = PresenceParticipant & { drag?: PresenceDrag };

/**
 * A roster entry as the presence surfaces read it (SPEC-3 4.11 Participant; the chrome's
 * PresenceParticipant). The wire's hue slot is 0 to 5 and the chrome's `HueSlot` is 1 to 6
 * (docs/PEOPLE.md 3.15), so the slot moves up by one here and the caret, the outline, the flag
 * and the stripe draw the hue the room granted (`mark.hue.slot` on the same entry agrees).
 * `lastSeenAt` is the room client's stamp of when the row's state last changed
 * (`receivedAtOf`; docs/REALTIME.md 3.5, audit-people.md defect 8) and the mapping time only for
 * a row the client did not stamp, so the caret dims after CARET_DIM_MS without a change.
 */
export function participantOf(entry: RosterEntry, now: string): ParticipantView {
  const named = entry.trust === 'guest' || entry.trust === 'verified';
  const drag = dragOf(entry);
  return {
    principalId: entry.principalId,
    label: entry.label,
    ...(named ? { name: entry.label } : {}),
    trust: entry.trust,
    kind:
      entry.kind === 'agent'
        ? 'agent'
        : entry.principalId.startsWith('usr_')
          ? 'account'
          : 'anonymous',
    ...(entry.email !== undefined ? { email: entry.email } : {}),
    mark: entry.mark as PresenceParticipant['mark'],
    clientId: entry.clientId,
    role: entry.role,
    ...(entry.kind === 'agent' ? {} : { hue: entry.hueSlot + 1 }),
    ...(entry.slideId !== undefined ? { slideId: entry.slideId } : {}),
    ...(entry.selection !== undefined
      ? {
          selection: {
            blockIds: entry.selection.blockIds,
            ...(entry.selection.caret !== undefined
              ? {
                  caret: {
                    blockId: entry.selection.caret.blockId,
                    path: entry.selection.caret.path,
                    offset: entry.selection.caret.offset ?? entry.selection.caret.range?.[0] ?? 0,
                  },
                }
              : {}),
          },
        }
      : {}),
    pointer: entry.pointer ?? null,
    ...(drag === null ? {} : { drag }),
    following: entry.follow ?? null,
    presenting: entry.presenting,
    idle: false,
    lastSeenAt: receivedAtOf(entry) ?? now,
  };
}

/**
 * An identity the chrome can draw for a principal nothing resolved (a past commenter the payload
 * did not name, a mention): the stored label with the trust the id prefix implies.
 */
export function identityOfPrincipal(
  principalId: string,
  label?: string,
  kind?: 'human' | 'agent',
): IdentityView {
  const agent = kind === 'agent' || principalId.startsWith('agent:');
  const account = principalId.startsWith('usr_');
  return {
    principalId,
    label: label ?? labelFor(principalId),
    trust: agent ? 'agent' : account ? 'verified' : 'label',
    kind: agent ? 'agent' : account ? 'account' : 'anonymous',
  };
}

export type IdentityIndexInput = {
  /** the room's roster in join order */
  roster: readonly RosterEntry[];
  /** the caller as the payload names it */
  identity: EditorIdentity | undefined;
  /** the page's author, the fallback when the payload names nobody */
  author: Author;
  /** the threads the sidecar holds */
  threads: readonly Thread[];
  /** the payload's resolved people (docs/PEOPLE.md 3.8), keyed by principal id */
  resolved?: Readonly<Record<string, EditorIdentity>> | undefined;
  /** the version log the payload carries, oldest first, for the order of first appearance */
  versions?: readonly Version[] | undefined;
};

/** The text a surface shows for a view: the typed or account name, else the label. */
function textOf(view: IdentityView): string {
  return view.name ?? view.label;
}

/**
 * Who is who on this deck: the payload's resolved people (the version authors, the comment
 * authors, the record's people, with their marks and, for a reader who may see them, their
 * addresses), then the authors the threads name that the payload did not (the stored label they
 * wrote as), then the roster's rows (the live mark, the hue, the trust the room read) and the
 * caller, which override by id. Two people of one text are told apart by " (2)" and " (3)" in
 * order of first appearance (the log oldest first, then the comment authors, then the roster in
 * join order, then the caller; docs/PEOPLE.md default 4): the suffix reaches the text alone, the
 * plate's initial is the mark's and never changes, and nothing is stored.
 */
export function identityIndex(input: IdentityIndexInput): ReadonlyMap<string, IdentityView> {
  const out = new Map<string, IdentityView>();
  const order: string[] = [];
  const note = (id: string): void => {
    if (!order.includes(id)) order.push(id);
  };
  /* one person behind two ids (an anonymous id the alias table links to an account, and the
     account's own id; SPEC-3 7.4): the payload names the account on the aliased view, so the
     suffix counts people, never ids */
  const personOf = new Map<string, string>();
  for (const [id, identity] of Object.entries(input.resolved ?? {})) {
    const { avatar: _avatar, accountId, ...view } = identity;
    /* the account id stays on the view (build/b5.md R9): the version panel reads an aliased
       row as the reader's own when the account is the reader */
    out.set(id, {
      ...identityView(view, input.author),
      ...(accountId === undefined ? {} : { accountId }),
    });
    if (accountId !== undefined) personOf.set(id, accountId);
  }
  for (const version of input.versions ?? []) {
    if (version.author.principalId !== undefined && out.has(version.author.principalId))
      note(version.author.principalId);
  }
  for (const thread of input.threads) {
    for (const comment of [thread.comment, ...thread.replies]) {
      const { principalId, label, kind } = comment.author;
      if (!out.has(principalId))
        out.set(principalId, identityOfPrincipal(principalId, label, kind));
      note(principalId);
    }
  }
  const now = new Date().toISOString();
  for (const entry of input.roster) {
    /* a roster row of an aliased anonymous id keeps the account the payload named for it */
    const accountId = personOf.get(entry.principalId);
    out.set(entry.principalId, {
      ...participantOf(entry, now),
      ...(accountId === undefined ? {} : { accountId }),
    });
    note(entry.principalId);
  }
  /* the caller: the payload's own identity is the boot's reading, so once the room holds the
     caller's row that row's live facts win (the name typed in this session, its trust and mark;
     the integrator's preview pictures read the version rows with the label's plate and no guest
     word after Change name, the boot's stale view overriding the roster); the payload supplies
     what the row lacks (the run id, the deleted flag, the account behind an alias) */
  const me = identityView(input.identity, input.author);
  const own = out.get(me.principalId);
  out.set(me.principalId, own === undefined ? me : { ...me, ...own });
  note(me.principalId);
  for (const id of out.keys()) note(id);
  const person = (id: string): string => personOf.get(id) ?? id;
  const representative = new Map<string, string>();
  for (const id of order) if (!representative.has(person(id))) representative.set(person(id), id);
  const texts = disambiguateLabels([...representative.values()], (id) => {
    const view = out.get(id);
    return view === undefined ? labelFor(id) : textOf(view);
  });
  for (const id of order) {
    const view = out.get(id);
    const text = texts.get(representative.get(person(id)) ?? id);
    if (view === undefined || text === undefined || textOf(view) === text) continue;
    out.set(id, view.name !== undefined ? { ...view, name: text } : { ...view, label: text });
  }
  return out;
}

/**
 * The roster after a `presence` event (docs/PEOPLE.md 3.16): the updated client's row replaced
 * where it stands, so the roster, the four slots and the filmstrip keep join order; a client the
 * roster does not hold yet joins at the end.
 */
export function replaceRosterRow(
  roster: readonly RosterEntry[],
  state: RosterEntry,
): RosterEntry[] {
  const at = roster.findIndex((row) => row.clientId === state.clientId);
  if (at < 0) return [...roster, state];
  const next = [...roster];
  next[at] = state;
  return next;
}
