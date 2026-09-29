import type {
  AvatarChoiceView,
  IdentityView,
  PresenceParticipant,
} from '@turboslide/chrome/editor-shell';

/**
 * The caller's own identity as the editor hands it to the chrome (gslides-parity SPEC-3 7.8;
 * docs/PEOPLE.md 3.11, 4.1, 4.4): one source for the own chip, the account head, the Profile
 * head, the builder and the version rows' "You". The page payload names the caller at load; the
 * roster's own entry carries what the room resolved for everyone else (the server's mark, the
 * trust after a name was typed in another tab); the answer of Change name or Change avatar is
 * the newest fact for the moment between the write and the room's next read of it. The pure
 * half lives here so a test pins the precedence; EditorRoot.tsx holds the state.
 */

/** The `account.setName` and `account.setAvatar` answer (`meOf` of server/auth/actions.ts) as the route reads it back. */
export type MeAnswerFacts = {
  name?: string;
  trust?: IdentityView['trust'];
  mark?: IdentityView['mark'];
  /** null when the answer carried no choice (an agent); undefined when the answer had no field */
  avatar?: AvatarChoiceView | null;
};

const TRUSTS: ReadonlySet<string> = new Set(['label', 'guest', 'verified', 'agent']);
const VARIANTS: ReadonlySet<string> = new Set(['initials', 'glyph', 'dither', 'picture']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The avatar choice of an answer, or null for an absent one; undefined for a shape that is not one. */
export function avatarChoiceOf(value: unknown): AvatarChoiceView | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.variant !== 'string' || !VARIANTS.has(value.variant))
    return undefined;
  const out: AvatarChoiceView = { variant: value.variant as AvatarChoiceView['variant'] };
  if (typeof value.initials === 'string') out.initials = value.initials;
  if (typeof value.salt === 'number' && Number.isFinite(value.salt)) out.salt = value.salt;
  if (typeof value.url === 'string') out.url = value.url;
  return out;
}

/** The facts the route writes back from an answer; an answer of another shape gives none. */
export function meAnswerFacts(answer: unknown): MeAnswerFacts {
  if (!isRecord(answer)) return {};
  const out: MeAnswerFacts = {};
  if (typeof answer.name === 'string' && answer.name.trim() !== '') out.name = answer.name.trim();
  if (typeof answer.trust === 'string' && TRUSTS.has(answer.trust))
    out.trust = answer.trust as IdentityView['trust'];
  if (isRecord(answer.mark) && typeof answer.mark.variant === 'string')
    out.mark = answer.mark as unknown as IdentityView['mark'];
  const avatar = avatarChoiceOf(answer.avatar);
  if (avatar !== undefined) out.avatar = avatar;
  return out;
}

/**
 * The own roster row's name and mark as one key. An answer's facts overlay the row until the row
 * moves past the state it held when the answer arrived (the room re-read the identity after
 * `refreshPresence`, or another tab changed it), so a heartbeat that still carries the old mark
 * from the room's 5 s identity cache never draws the old mark over the new one.
 */
export function rosterKeyOf(
  row: Pick<PresenceParticipant, 'name' | 'mark'> | null | undefined,
): string {
  return JSON.stringify({ name: row?.name ?? null, mark: row?.mark ?? null });
}

/**
 * The caller's view: the payload's identity (id, label, kind, email) under the roster's own
 * row (name, trust, mark) under the last answer (name, trust, mark) while it still applies.
 */
export function ownPrincipalOf(
  payloadIdentity: IdentityView,
  ownRow: PresenceParticipant | null | undefined,
  overlay: MeAnswerFacts | null | undefined,
): IdentityView {
  const out: IdentityView = { ...payloadIdentity };
  if (ownRow !== null && ownRow !== undefined) {
    if (ownRow.name !== undefined) out.name = ownRow.name;
    if (ownRow.trust === 'guest' || ownRow.trust === 'verified' || ownRow.trust === 'label')
      out.trust = ownRow.trust;
    if (ownRow.mark !== undefined) out.mark = ownRow.mark;
  }
  if (overlay !== null && overlay !== undefined) {
    if (overlay.name !== undefined) out.name = overlay.name;
    if (overlay.trust !== undefined && overlay.trust !== 'agent') out.trust = overlay.trust;
    if (overlay.mark !== undefined) out.mark = overlay.mark;
  }
  /* the mark the chrome draws is the own chip's: self set, the hue as the room granted it */
  if (out.mark !== undefined) out.mark = { ...out.mark, self: true };
  return out;
}

/** The 64 px picture URL of the caller (4.4): the choice's file, else the mark's. */
export function ownPictureUrlOf(
  avatar: AvatarChoiceView | null | undefined,
  mark: IdentityView['mark'] | undefined,
): string | undefined {
  if (avatar !== null && avatar !== undefined && avatar.variant === 'picture' && avatar.url)
    return avatar.url;
  if (mark !== undefined && mark.variant === 'picture' && mark.pictureUrl) return mark.pictureUrl;
  return undefined;
}

/**
 * The identities the shell's stored surfaces read (3.8): the payload's resolved map under the
 * roster rows under the caller, keyed by principal id. The controller's merged and
 * disambiguated map replaces this once it lands (build/b3.md R3); a map it carries wins here.
 */
export function shellIdentitiesOf(
  fromController:
    ReadonlyMap<string, IdentityView> | Readonly<Record<string, IdentityView>> | undefined,
  fromPayload: Readonly<Record<string, IdentityView>> | undefined,
  roster: readonly PresenceParticipant[],
  me: IdentityView,
): Readonly<Record<string, IdentityView>> {
  if (fromController !== undefined) {
    return fromController instanceof Map
      ? Object.fromEntries(fromController)
      : (fromController as Readonly<Record<string, IdentityView>>);
  }
  const out: Record<string, IdentityView> = { ...(fromPayload ?? {}) };
  for (const row of roster) out[row.principalId] = { ...out[row.principalId], ...viewOfRow(row) };
  out[me.principalId] = { ...out[me.principalId], ...me };
  return out;
}

/** The identity fields of a roster row, without the room's per client facts. */
export function viewOfRow(row: PresenceParticipant): IdentityView {
  const out: IdentityView = {
    principalId: row.principalId,
    label: row.label,
    trust: row.trust,
    kind: row.kind,
  };
  if (row.name !== undefined) out.name = row.name;
  if (row.email !== undefined) out.email = row.email;
  if (row.mark !== undefined) out.mark = row.mark;
  if (row.runId !== undefined) out.runId = row.runId;
  if (row.deleted !== undefined) out.deleted = row.deleted;
  return out;
}
