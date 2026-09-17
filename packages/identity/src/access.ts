// The capability matrix (gslides-parity SPEC-3 6.1, 6.2; research 09 2.1 and 8.1): the access
// record's shape, the caller's context and `decide()`, the pure function `authorize()` in
// apps/studio/src/server/authorize.ts (B4) calls after loading the record. Table tested with one
// assertion per cell in access.test.ts.
//
// The rules: deny by default; a caller who may not read a deck gets 404 whether the deck exists
// or not (one page for a missing and a restricted deck); a caller who may read but lacks the
// capability gets 403 naming the capability; a request with no principal and no agent gets 401;
// a revoked publish token gets 410. The owner may do everything; a grant its role; a link
// visitor its link's stored role today, attributed to the anonymous label, and never the sharing,
// trash, publish, transfer or follow cells; the legacy `open` mode behaves as a link at its role;
// an agent its owner's role intersected with its scopes, and never transfer or follow; the
// deployment admin everything with `via: 'admin'`. Notes are read by editors and owners only,
// skipped slides by commenters and above; comments are read by viewers only under the owner's
// switch (SPEC-3 0.11).
//
// A deck without a record is today's deck: `owner: null, generalAccess: { mode: 'open', role:
// 'editor' }` in memory until someone claims it (SPEC-3 6.1; research 09 1.4). After R8 a missing
// record is a 404; `decide()` takes that as an option so the signature does not change.
import type {
  AccessMode,
  AccessRecord as SchemaAccessRecord,
  AccessRequest,
  AccessSettings,
  Capability,
  Grant,
  GrantRole,
  PendingOwner,
  Publish,
  Role,
  Scope,
  ShareLink,
  Via,
} from '@turboslide/schema/access';
import {
  CAPABILITIES,
  DEFAULT_ACCESS_SETTINGS,
  ROLES,
  SCOPES,
  synthesizeLegacyRecord as synthesizeSchemaLegacyRecord,
} from '@turboslide/schema/access';

import { sha256Hex } from './sha256.ts';

// The record's shape is the schema package's (`@turboslide/schema/access`, B1); this module
// re-exports the names round one of this package used so every importer keeps compiling, and
// keeps `Principal`, `AuthContext`, `Decision` and `decide()` as its own (b3.md request R4).
export type { AccessMode, AccessRequest, AccessSettings, Capability, PendingOwner, Role, Scope };
export type LinkRole = GrantRole;
export type GeneralAccessMode = AccessMode;
export type AccessLink = ShareLink;
export type AccessGrant = Grant;
export type PublishRecord = Publish;
export { CAPABILITIES, DEFAULT_ACCESS_SETTINGS, ROLES, SCOPES };

/** Who is asking: an anonymous browser (the sealed cookie) or a signed in account. */
export type Principal = {
  id: string;
  kind: 'anonymous' | 'account';
  email?: string;
  admin: boolean;
};

/** An API key record acting for its owner (SPEC-3 7.7). */
export type AgentContext = {
  tokenId: string;
  ownerId: string;
  scopes: Scope[];
  name: string;
  runId?: string;
};

/** A share link exchanged at /s/<token> and written on the session (SPEC-3 6.4). */
export type LinkGrant = { linkId: string; deckId: string; role: LinkRole };

/**
 * The caller's context. On the browser transports `principal` comes from the cookie or the
 * account session; on the agent routes the bearer resolver sets `principal` to the key's owner
 * and `agent` to the key record; `linkGrants` are the session's exchanged links; `publishToken`
 * is `?p=` on the published player.
 */
export type AuthContext = {
  principal: Principal | null;
  agent?: AgentContext;
  linkGrants: LinkGrant[];
  publishToken?: string;
};

/**
 * `access.json` (SPEC-3 6.1) as `decide()` reads it: the schema's record with `assetKey`
 * optional, because a record synthesized in memory before the storage migration carries none in
 * some callers and the decision never reads it. A record `accessRecordSchema` parsed is
 * assignable as is.
 */
export type AccessRecord = Omit<SchemaAccessRecord, 'assetKey'> & { assetKey?: string };

export type { Via };

export type Decision =
  | { ok: true; role: Role; via: Via }
  | { ok: false; status: 401; code: 'unauthorized' }
  | { ok: false; status: 403; code: 'forbidden'; capability: Capability }
  | { ok: false; status: 404; code: 'not_found' }
  | { ok: false; status: 410; code: 'gone' };

export type DecideOptions = {
  /** The clock for expiry checks; defaults to `Date.now()`. */
  now?: Date | string | number;
  /** What a null record means: today's open editor deck (default) or, after R8, nothing. */
  missingRecord?: 'open' | 'notFound';
};

/** The in memory record of a deck nobody has claimed (SPEC-3 6.1; research 09 1.4). */
export function synthesizeLegacyRecord(deckId: string, now: Date = new Date()): AccessRecord {
  return synthesizeSchemaLegacyRecord(deckId, now.toISOString());
}

const ROLE_RANK: Readonly<Record<Role, number>> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export function roleAtLeast(role: Role, floor: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[floor];
}

/**
 * The scopes that let an agent token use a capability, any one of them; empty for a capability
 * no token has (transfer and follow). The same table as `SCOPE_CAPABILITIES` in
 * `@turboslide/schema/access`, read the other way round.
 */
export const SCOPES_FOR: Readonly<Record<Capability, readonly Scope[]>> = {
  read: ['read'],
  readSkipped: ['read'],
  readNotes: ['read'],
  readComments: ['read', 'comment'],
  history: ['read'],
  presence: ['read'],
  comment: ['comment'],
  write: ['write'],
  rename: ['write'],
  trash: ['write'],
  restore: ['write'],
  export: ['export'],
  exportNotes: ['export'],
  copy: ['export'],
  share: ['share'],
  publish: ['share'],
  settings: ['admin'],
  remove: ['admin'],
  transfer: [],
  follow: [],
};

/** The cells a link visitor (and the legacy open mode) never gets, whatever the link's role. */
const NOT_BY_LINK: ReadonlySet<Capability> = new Set<Capability>([
  'share',
  'settings',
  'trash',
  'restore',
  'remove',
  'publish',
  'transfer',
  'follow',
]);

/** The matrix of research 09 2.1 for a role holding a grant (or the owner). */
export function roleAllows(role: Role, capability: Capability, settings: AccessSettings): boolean {
  const download = settings.viewersCanDownload;
  switch (capability) {
    case 'read':
    case 'presence':
      return true;
    case 'readSkipped':
    case 'comment':
      return roleAtLeast(role, 'commenter');
    case 'readComments':
      return roleAtLeast(role, 'commenter') || settings.viewersCanSeeComments;
    case 'readNotes':
    case 'write':
    case 'history':
    case 'exportNotes':
    case 'rename':
    case 'trash':
    case 'restore':
    case 'publish':
    case 'follow':
      return roleAtLeast(role, 'editor');
    case 'export':
    case 'copy':
      return roleAtLeast(role, 'editor') || download;
    case 'share':
      return role === 'owner' || (role === 'editor' && settings.editorsCanShare);
    case 'settings':
    case 'remove':
    case 'transfer':
      return role === 'owner';
  }
}

function toTime(value: Date | string | number | undefined): number {
  if (value === undefined) return Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

function isPast(stamp: string | null, now: number): boolean {
  if (stamp === null) return false;
  const t = Date.parse(stamp);
  return Number.isFinite(t) && t <= now;
}

export function isLinkLive(link: AccessLink, now: number): boolean {
  return link.revokedAt === null && !isPast(link.expiresAt, now);
}

export function isGrantLive(grant: AccessGrant, now: number): boolean {
  return grant.principalId !== null && !isPast(grant.expiresAt, now);
}

type Standing = { role: Role; via: Via };

const VIA_RANK: Readonly<Record<Via, number>> = {
  admin: 7,
  owner: 6,
  grant: 5,
  agent: 4,
  link: 3,
  open: 2,
  publish: 1,
};

function better(a: Standing | null, b: Standing): Standing {
  if (a === null) return b;
  if (ROLE_RANK[b.role] > ROLE_RANK[a.role]) return b;
  if (ROLE_RANK[b.role] === ROLE_RANK[a.role] && VIA_RANK[b.via] > VIA_RANK[a.via]) return b;
  return a;
}

/** The highest standing the record gives the principal, before the agent scopes and the cell. */
export function standingOf(
  record: AccessRecord,
  principal: Principal,
  linkGrants: readonly LinkGrant[],
  now: number,
): Standing | null {
  let standing: Standing | null = null;
  if (principal.admin) standing = better(standing, { role: 'owner', via: 'admin' });
  if (record.owner !== null && record.owner === principal.id)
    standing = better(standing, { role: 'owner', via: 'owner' });
  for (const grant of record.grants) {
    if (grant.principalId === principal.id && isGrantLive(grant, now))
      standing = better(standing, { role: grant.role, via: 'grant' });
  }
  for (const held of linkGrants) {
    if (held.deckId !== record.deckId) continue;
    const link = record.links.find((l) => l.id === held.linkId);
    if (link !== undefined && isLinkLive(link, now))
      standing = better(standing, { role: link.role, via: 'link' });
  }
  if (record.generalAccess.mode === 'open')
    standing = better(standing, { role: record.generalAccess.role, via: 'open' });
  return standing;
}

/** `sha256:<hex>` of a token, the form links and the publish record store. */
export function tokenHash(token: string): string {
  return `sha256:${sha256Hex(token)}`;
}

/**
 * The pure decision (SPEC-3 6.2). `record` is the deck's access record or null when none is
 * stored. Three arguments are the seam `authorize()` calls; the options are for tests and R8.
 */
export function decide(
  record: AccessRecord | null,
  ctx: AuthContext,
  capability: Capability,
  options: DecideOptions = {},
): Decision {
  const now = toTime(options.now);
  const principal: Principal | null =
    ctx.principal ?? (ctx.agent ? { id: ctx.agent.ownerId, kind: 'account', admin: false } : null);
  const rec =
    record ??
    ((options.missingRecord ?? 'open') === 'open'
      ? synthesizeLegacyRecord('', new Date(now))
      : null);
  if (principal === null) {
    // A caller with no identity at all (a browser's very first request, before the anonymous
    // cookie the same response mints; a curl; a link preview) may read a deck whose general access
    // is open, as the same caller could with a cookie one request later: in enforce mode the
    // first visit to /deck/<id> of an open deck answered You need access and the reload answered
    // the deck (the focus round's enforce preview, hosted-smoke row `/deck/gt-brand`). Every other
    // capability, and every read of a restricted or link mode deck, still needs an identity.
    if (
      rec !== null &&
      rec.generalAccess.mode === 'open' &&
      capability === 'read' &&
      roleAllows(rec.generalAccess.role, capability, rec.settings)
    )
      return { ok: true, role: rec.generalAccess.role, via: 'open' };
    return { ok: false, status: 401, code: 'unauthorized' };
  }
  if (rec === null) return { ok: false, status: 404, code: 'not_found' };

  const standing = standingOf(rec, principal, ctx.linkGrants, now);

  if (standing === null) {
    // The published player: read only, in present mode or the embed, whatever is asked.
    if (ctx.publishToken !== undefined && rec.publish !== null) {
      if (tokenHash(ctx.publishToken) === rec.publish.hash) {
        if (rec.publish.revokedAt !== null) return { ok: false, status: 410, code: 'gone' };
        if (capability === 'read') return { ok: true, role: 'viewer', via: 'publish' };
        return { ok: false, status: 403, code: 'forbidden', capability };
      }
    }
    return { ok: false, status: 404, code: 'not_found' };
  }

  const forbidden: Decision = { ok: false, status: 403, code: 'forbidden', capability };
  let { role, via } = standing;

  if (ctx.agent !== undefined && via !== 'admin') {
    const scopes = ctx.agent.scopes;
    if (!SCOPES_FOR[capability].some((scope) => scopes.includes(scope))) return forbidden;
    via = 'agent';
  }

  if (via === 'admin') return { ok: true, role: 'owner', via: 'admin' };

  if ((via === 'link' || via === 'open') && NOT_BY_LINK.has(capability)) return forbidden;
  if (capability === 'follow') {
    if (ctx.agent !== undefined || principal.kind !== 'account') return forbidden;
    if (via !== 'owner' && via !== 'grant') return forbidden;
  }
  if (!roleAllows(role, capability, rec.settings)) return forbidden;
  return { ok: true, role, via };
}
