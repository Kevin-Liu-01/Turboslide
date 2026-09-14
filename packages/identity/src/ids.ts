// Principal id formats (gslides-parity SPEC-3 2.4, 7.1, 7.7; MILESTONES-3 "The seams"):
//
//   anon_<uuid>      an anonymous browser, a v4 UUID minted by the server into the sealed cookie
//   usr_<id>         a signed in account, the identity store's user id
//   agent:<tokenId>  an agent acting through an API key record
//
// Everything that attributes work stores one of these and never a name (SPEC-3 0.17); the name,
// mark and trust state are resolved at render time (resolve.ts). The formats are strict so an id
// found in a record, a log line or a URL can be classified without a lookup.

export type PrincipalKind = 'anonymous' | 'account' | 'agent';

export const ANONYMOUS_PREFIX = 'anon_';
export const ACCOUNT_PREFIX = 'usr_';
export const AGENT_PREFIX = 'agent:';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The identity store's ids and the API key plugin's ids: URL safe, 1 to 64 characters. */
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type ParsedPrincipalId =
  | { kind: 'anonymous'; id: string; uuid: string }
  | { kind: 'account'; id: string; userId: string }
  | { kind: 'agent'; id: string; tokenId: string };

/** `anon_<uuid>` from a v4 UUID string; RangeError when the UUID is not one. */
export function anonymousPrincipalId(uuid: string): string {
  const lower = uuid.toLowerCase();
  if (!UUID_V4.test(lower)) throw new RangeError(`not a v4 UUID: ${JSON.stringify(uuid)}`);
  return `${ANONYMOUS_PREFIX}${lower}`;
}

/** `usr_<id>` from an identity store user id. */
export function accountPrincipalId(userId: string): string {
  if (!OPAQUE_ID.test(userId)) throw new RangeError(`not a user id: ${JSON.stringify(userId)}`);
  return `${ACCOUNT_PREFIX}${userId}`;
}

/** `agent:<tokenId>` from an API key record id. */
export function agentPrincipalId(tokenId: string): string {
  if (!OPAQUE_ID.test(tokenId)) throw new RangeError(`not a token id: ${JSON.stringify(tokenId)}`);
  return `${AGENT_PREFIX}${tokenId}`;
}

/** The parts of a principal id, or null when the string is not one of the three formats. */
export function parsePrincipalId(id: string): ParsedPrincipalId | null {
  if (id.startsWith(ANONYMOUS_PREFIX)) {
    const uuid = id.slice(ANONYMOUS_PREFIX.length);
    return UUID_V4.test(uuid) ? { kind: 'anonymous', id, uuid } : null;
  }
  if (id.startsWith(ACCOUNT_PREFIX)) {
    const userId = id.slice(ACCOUNT_PREFIX.length);
    return OPAQUE_ID.test(userId) ? { kind: 'account', id, userId } : null;
  }
  if (id.startsWith(AGENT_PREFIX)) {
    const tokenId = id.slice(AGENT_PREFIX.length);
    return OPAQUE_ID.test(tokenId) ? { kind: 'agent', id, tokenId } : null;
  }
  return null;
}

export function isPrincipalId(id: string): boolean {
  return parsePrincipalId(id) !== null;
}

/** The kind of a principal id; RangeError when the string is not one. */
export function principalKind(id: string): PrincipalKind {
  const parsed = parsePrincipalId(id);
  if (parsed === null) throw new RangeError(`not a principal id: ${JSON.stringify(id)}`);
  return parsed.kind;
}
