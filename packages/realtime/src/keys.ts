// The key builder (gslides-parity SPEC-3 3.2; report 10 F34): every Redis key is built here from
// a slug validated deck id, a validated identifier and a fixed suffix list, so no client supplied
// string reaches a key by another path and a deck id that is a prefix of another (`gt`,
// `gt-brand`) shares no key. A value outside its grammar is a TypeError. The memory and blob
// channels use the same names for their in process maps, so a test reads one vocabulary.
import { SLUG_PATTERN } from '@turboslide/schema/ids';

/** 32 hex characters, the server issued client id of SPEC-3 3.3. */
const CLIENT_ID = /^[0-9a-f]{32}$/;

/**
 * The principal id formats of SPEC-3 0.17 (`anon_<uuid>`, `usr_<id>`, `agent:<tokenId>`), plus
 * the hashed address an IP scoped counter uses (`ip:<hex>`, report 10 F24: streams per IP).
 */
const IDENTITY =
  /^(?:anon_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|usr_[A-Za-z0-9_-]{1,64}|agent:[A-Za-z0-9_-]{1,64}|ip:[0-9a-f]{16,64})$/;

/** A principal id: an identity that is not an address. */
const PRINCIPAL =
  /^(?:anon_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|usr_[A-Za-z0-9_-]{1,64}|agent:[A-Za-z0-9_-]{1,64})$/;

/** A budget name: `ops`, `bytes`, `streams`, `redisCmds`, `materialize`... */
const BUDGET_NAME = /^[a-z][A-Za-z0-9]{0,31}$/;

/** A budget window: a number (the window index) or a date (`2026-09-13`). */
const BUDGET_WINDOW = /^[A-Za-z0-9-]{1,32}$/;

/** A download token: base64url, as tokens.ts mints them. */
const DOWNLOAD_TOKEN = /^[A-Za-z0-9_-]{16,256}$/;

/** The kill switches of SPEC-3 0.33, in the order of the defaults table. */
export const FLAG_NAMES = [
  'realtime',
  'presence',
  'comments',
  'invites',
  'email',
  'exports',
  'uploads',
  'renderThumbs',
  'materialize',
  'htmlBlocks',
  'signup',
  'readOnly',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

export function isFlagName(value: string): value is FlagName {
  return (FLAG_NAMES as ReadonlyArray<string>).includes(value);
}

function check(pattern: RegExp, value: string, what: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${JSON.stringify(value)} is not ${what}`);
  }
  return value;
}

/** A deck id is a slug (SPEC 4.2); anything else never reaches a key. */
export function checkDeckId(deckId: string): string {
  return check(SLUG_PATTERN, deckId, 'a deck id (a slug)');
}

export function checkClientId(clientId: string): string {
  return check(CLIENT_ID, clientId, 'a client id (32 hex characters)');
}

export function checkIdentity(identity: string): string {
  return check(
    IDENTITY,
    identity,
    'an identity (anon_<uuid>, usr_<id>, agent:<tokenId>, ip:<hex>)',
  );
}

export function checkPrincipalId(principalId: string): string {
  return check(PRINCIPAL, principalId, 'a principal id (anon_<uuid>, usr_<id>, agent:<tokenId>)');
}

/** The per deck keys of the room (SPEC-3 3.2). */
export type DeckKeys = {
  /** the operation stream, `XADD` with `<seq>-0` ids */
  ops: string;
  /** the head counter, the compare and append's compare */
  head: string;
  /** the checkpoint lock (SPEC-3 0.8) */
  ckpt: string;
  /** the short append lock an instance takes after two compare and append misses (SPEC-3 3.4 step 5) */
  append: string;
  /** the lock the store follower takes while it appends a record written outside the room (room.ts) */
  follow: string;
  /** the presence expiry set, score = expiry time */
  presence: string;
  /** the roster hash, client id to state */
  roster: string;
  /** the pub/sub channel every instance with an open stream subscribes to */
  events: string;
  /** the client id binding to its session (report 10 F26) */
  client: (clientId: string) => string;
  /** the open stream counter per identity (report 10 F24) */
  streams: (identity: string) => string;
  /** a fixed window counter per client (the 60 operations per second of SPEC-3 3.9) */
  clientBudget: (clientId: string, name: string, window: string | number) => string;
};

export function deckKeys(deckId: string): DeckKeys {
  const id = checkDeckId(deckId);
  return {
    ops: `deck:${id}:ops`,
    head: `deck:${id}:head`,
    ckpt: `deck:${id}:ckpt`,
    append: `deck:${id}:append`,
    follow: `deck:${id}:follow`,
    presence: `deck:${id}:presence`,
    roster: `deck:${id}:roster`,
    events: `deck:${id}:events`,
    client: (clientId) => `deck:${id}:client:${checkClientId(clientId)}`,
    streams: (identity) => `deck:${id}:streams:${checkIdentity(identity)}`,
    clientBudget: (clientId, name, window) =>
      `deck:${id}:client:${checkClientId(clientId)}:q:${check(BUDGET_NAME, name, 'a budget name')}:${check(BUDGET_WINDOW, String(window), 'a budget window')}`,
  };
}

/** `q:<identity>:<name>:<window>`, a fixed window counter (SPEC-3 8.3; report 10 F33). */
export function budgetKey(identity: string, name: string, window: string | number): string {
  const slot = check(BUDGET_WINDOW, String(window), 'a budget window');
  return `q:${checkIdentity(identity)}:${check(BUDGET_NAME, name, 'a budget name')}:${slot}`;
}

/** The access record cache (SPEC-3 6.1: 60 s, dropped by a PUBLISH on every write). */
export function accessKey(deckId: string): string {
  return `access:${checkDeckId(deckId)}`;
}

/** The deck head cache the home page reads (SPEC-3 6.7). */
export function headKey(deckId: string): string {
  return `head:${checkDeckId(deckId)}`;
}

/** The anonymous principal record with its 90 day sliding TTL (SPEC-3 0.17). */
export function principalKey(principalId: string): string {
  return `principal:${checkPrincipalId(principalId)}`;
}

/** The inbox sorted set of an anonymous principal (SPEC-3 5.5). */
export function inboxKey(principalId: string): string {
  return `inbox:${checkPrincipalId(principalId)}`;
}

/** A kill switch (SPEC-3 0.33). */
export function flagKey(name: string): string {
  if (!isFlagName(name)) throw new TypeError(`${JSON.stringify(name)} is not a flag name`);
  return `flag:${name}`;
}

/** The spent set of one time download tokens (report 04 F9). */
export function downloadSpentKey(token: string): string {
  return `dl:spent:${check(DOWNLOAD_TOKEN, token, 'a download token')}`;
}
