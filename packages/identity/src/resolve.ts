// resolvePrincipal (gslides-parity SPEC-3 2.4; research 11 3.2, 7.1; research 03 E2): the one
// function that turns a stored `principalId` into what a surface shows. Every record stores the
// id; a name, a trust state and a mark are computed here at render time, so a record written
// before a person signed in renders as the person afterwards (the alias table) and a deleted
// account renders as "Deleted account" without a byte of history changing.
//
// The lookups are synchronous functions the caller fills from the stores it holds (the principal
// records, the alias table, the account profiles, the token records): this module never reads a
// store, so the chrome, the CLI and the server resolve the same way from their own caches.
import type { AgentContext } from './access.ts';
import { parsePrincipalId } from './ids.ts';
import { labelFor } from './labels.ts';
import type { MarkSpec } from './marks.ts';
import type { AvatarChoice, PrincipalRecord } from './principal.ts';
import { DEFAULT_AVATAR } from './principal.ts';

/** The three trust states of a person and the agent (SPEC-3 0.19; research 11 5.2). */
export type Trust = 'label' | 'guest' | 'verified' | 'agent';

/** The words a surface shows beside a name for each trust state (research 11 5.2). */
export const TRUST_WORDS: Readonly<Record<Trust, string>> = {
  label: '',
  guest: 'guest',
  verified: '',
  agent: 'Agent',
};

/** The tooltip sentence per trust state (research 11 5.2). */
export function trustTooltip(trust: Trust, email?: string): string {
  switch (trust) {
    case 'label':
      return 'Not signed in. A generated label for this browser.';
    case 'guest':
      return 'Not signed in. This name was typed, not verified.';
    case 'verified':
      return email ? `Signed in as ${email}` : 'Signed in';
    case 'agent':
      return 'An agent run. Its writes are checkpointed at once.';
  }
}

/** What the identity store holds for a signed in account, as the resolver needs it. */
export type AccountProfile = {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  admin: boolean;
  avatar?: AvatarChoice;
  /** Set after Delete account; the profile renders as "Deleted account" (SPEC-3 7.4). */
  deleted?: boolean;
};

/** What the API key plugin holds for a token, as the resolver needs it. */
export type TokenProfile = {
  tokenId: string;
  ownerId: string;
  name: string;
  revokedAt?: string | null;
};

export type ResolveLookup = {
  /** The principal record of an anonymous or account principal, or null. */
  record: (principalId: string) => PrincipalRecord | null | undefined;
  /** The account an anonymous id was linked to (SPEC-3 7.4), or null. */
  alias: (anonymousId: string) => string | null | undefined;
  /** The account profile for a `usr_` id, or null. */
  account: (userId: string) => AccountProfile | null | undefined;
  /** The token record for an `agent:` id, or null. */
  token?: (tokenId: string) => TokenProfile | null | undefined;
};

export type ResolvedIdentity = {
  principalId: string;
  kind: 'anonymous' | 'account' | 'agent';
  /** The text a surface shows: the label, the typed name, the account's name or the agent's. */
  displayName: string;
  /** The generated label of the id, kept for the tooltip and the version history grouping. */
  label: string;
  trust: Trust;
  email?: string;
  /** The account behind an aliased anonymous id, when one exists. */
  accountId?: string;
  avatar: AvatarChoice;
  /** The sanitized run id of an agent, when the request carried one (research 10 F45). */
  runId?: string;
  deleted: boolean;
  admin: boolean;
};

export const DELETED_ACCOUNT = 'Deleted account';

const RUN_ID = /^[A-Za-z0-9._-]{1,32}$/;

/** A run id is shown only when it is 1 to 32 characters of `[A-Za-z0-9._-]` (research 10 F45). */
export function sanitizeRunId(runId: string | undefined): string | undefined {
  if (runId === undefined) return undefined;
  return RUN_ID.test(runId) ? runId : undefined;
}

function fromAccount(
  principalId: string,
  kind: 'anonymous' | 'account',
  profile: AccountProfile,
  record: PrincipalRecord | null | undefined,
): ResolvedIdentity {
  const label = labelFor(principalId);
  if (profile.deleted === true) {
    return {
      principalId,
      kind,
      displayName: DELETED_ACCOUNT,
      label,
      trust: 'verified',
      accountId: profile.userId,
      avatar: { ...DEFAULT_AVATAR },
      deleted: true,
      admin: false,
    };
  }
  return {
    principalId,
    kind,
    displayName: profile.name.trim() || profile.email,
    label,
    trust: 'verified',
    email: profile.email,
    accountId: profile.userId,
    avatar: profile.avatar ?? record?.avatar ?? { ...DEFAULT_AVATAR },
    deleted: false,
    admin: profile.admin,
  };
}

/**
 * The identity a principal id renders as. An unknown id of a known format still resolves (to its
 * label or to "Agent"), so a record whose author left long ago still shows something honest.
 */
export function resolvePrincipal(
  principalId: string,
  lookup: ResolveLookup,
  options: { agent?: Pick<AgentContext, 'name' | 'runId'> } = {},
): ResolvedIdentity {
  const parsed = parsePrincipalId(principalId);
  const label = labelFor(principalId);
  if (parsed === null) {
    // Not one of the three formats (a round one or two author name): a label, so it reads as
    // untrusted text rather than as a person.
    return {
      principalId,
      kind: 'anonymous',
      displayName: principalId,
      label,
      trust: 'guest',
      avatar: { ...DEFAULT_AVATAR },
      deleted: false,
      admin: false,
    };
  }
  if (parsed.kind === 'agent') {
    const token = lookup.token?.(parsed.tokenId) ?? null;
    const name = options.agent?.name ?? token?.name ?? 'Agent';
    return {
      principalId,
      kind: 'agent',
      displayName: name,
      label: 'Agent',
      trust: 'agent',
      accountId: token?.ownerId,
      avatar: { ...DEFAULT_AVATAR },
      runId: sanitizeRunId(options.agent?.runId),
      deleted: false,
      admin: false,
    };
  }
  if (parsed.kind === 'account') {
    const profile = lookup.account(parsed.userId) ?? null;
    if (profile !== null)
      return fromAccount(principalId, 'account', profile, lookup.record(principalId));
    return {
      principalId,
      kind: 'account',
      displayName: DELETED_ACCOUNT,
      label,
      trust: 'verified',
      avatar: { ...DEFAULT_AVATAR },
      deleted: true,
      admin: false,
    };
  }
  const aliasOf = lookup.alias(principalId) ?? null;
  if (aliasOf !== null) {
    const aliased = parsePrincipalId(aliasOf);
    const userId = aliased?.kind === 'account' ? aliased.userId : aliasOf;
    const profile = lookup.account(userId) ?? null;
    if (profile !== null)
      return fromAccount(principalId, 'anonymous', profile, lookup.record(principalId));
  }
  const record = lookup.record(principalId) ?? null;
  const name = record?.name?.trim();
  return {
    principalId,
    kind: 'anonymous',
    displayName: name && name.length > 0 ? name : (record?.label ?? label),
    label: record?.label ?? label,
    trust: name && name.length > 0 ? 'guest' : 'label',
    avatar: record?.avatar ?? { ...DEFAULT_AVATAR },
    deleted: false,
    admin: false,
  };
}

/**
 * The identity as the chrome draws it (`IdentityView` of packages/chrome editor-shell.ts; b6.md
 * request R4): the id, the label, the typed or account name when there is one, the trust state,
 * the kind, the address when the caller may see it, the computed mark and an agent's run id.
 * `email` travels only when `options.showEmail` is set: a link visitor sees named people as
 * their role word (SPEC-3 4.8), so the caller decides.
 */
export type IdentityView = {
  principalId: string;
  label: string;
  name?: string;
  trust: Trust;
  kind: 'anonymous' | 'account' | 'agent';
  email?: string;
  mark?: MarkSpec;
  runId?: string;
};

export function toIdentityView(
  identity: ResolvedIdentity,
  options: { mark?: MarkSpec; showEmail?: boolean } = {},
): IdentityView {
  const view: IdentityView = {
    principalId: identity.principalId,
    label: identity.label,
    trust: identity.trust,
    kind: identity.kind,
  };
  if (identity.trust !== 'label' && identity.displayName !== identity.label)
    view.name = identity.displayName;
  if (options.showEmail === true && identity.email !== undefined && !identity.deleted)
    view.email = identity.email;
  if (options.mark !== undefined) view.mark = options.mark;
  if (identity.runId !== undefined) view.runId = identity.runId;
  return view;
}

/** The display form with the trust word, for text surfaces: "Maya · guest", "Agent · run-12". */
export function displayWithTrust(identity: ResolvedIdentity): string {
  if (identity.trust === 'agent')
    return identity.runId ? `Agent · ${identity.runId}` : `Agent · ${identity.displayName}`;
  if (identity.trust === 'guest') return `${identity.displayName} · guest`;
  return identity.displayName;
}
