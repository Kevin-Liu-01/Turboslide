// The room ticket the function mints (the Cloudflare move, docs/CLOUDFLARE.md 3.3, 3.6.1): what a
// tab proves its right to join the deck's Durable Object with. The editor loader (write.ts) mints
// one into the page's `room` payload and `GET /api/decks/:id/ticket` mints the refresh; the Worker
// verifies the MAC with `crypto.subtle` before the socket reaches the object (apps/realtime-worker
// src/ticket.ts). The claims are the decision the function made (`role`, `via`), the reader's two
// facts, the client id it minted (so the MAC rule of `mintClientId` stays the function's) and the
// roster entry's identity fields, under `TURBOSLIDE_ROOM_SECRET` with `node:crypto`, as
// `clientIdMac` signs client ids. The codec is `@turboslide/realtime/frames`, shared with the
// Worker byte for byte. Nothing here is logged: a ticket is a credential for ten minutes.
import { createHmac } from 'node:crypto';

import { ROOM_PROTOCOL, encodeTicket } from '@turboslide/realtime/frames';
import type { TicketClaims } from '@turboslide/realtime/frames';
import type { ViewerFacts } from '@turboslide/realtime/room-core';
import {
  ROOM_HOST_VARIABLE,
  ROOM_INSECURE_VARIABLE,
  ROOM_SECRET_VARIABLE,
} from '@turboslide/realtime/select';
import type { IdentityKind } from '@turboslide/realtime/admission';
import type { Role } from '@turboslide/identity/access';
import { markSpec } from '@turboslide/identity/marks';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import { canonicalJson } from '@turboslide/schema/json';

import { buildCommit } from './build-commit';

/** A ticket lives ten minutes (3.3). */
export const ROOM_TICKET_TTL_MS = 600_000;
/** The client refreshes at `exp` minus this (3.3). */
export const ROOM_TICKET_REFRESH_MS = 120_000;

type Env = Readonly<Record<string, string | undefined>>;

/** The Worker's host as the variable names it (no scheme, no path), or null. */
export function roomHost(env: Env = process.env): string | null {
  const raw = env[ROOM_HOST_VARIABLE]?.trim();
  if (!raw) return null;
  const host = raw
    .replace(/^(?:https?|wss?):\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
  return host === '' ? null : host;
}

/** `TURBOSLIDE_ROOM_INSECURE=1`: `ws://` and `http://` for a checkout against `wrangler dev`. */
export function roomInsecure(env: Env = process.env): boolean {
  return env[ROOM_INSECURE_VARIABLE] === '1';
}

/** The socket URL of a deck's room, `wss://<host>/rooms/<id>` (3.6.1), or null without a host. */
export function roomUrlFor(deckId: string, env: Env = process.env): string | null {
  const host = roomHost(env);
  if (host === null) return null;
  return `${roomInsecure(env) ? 'ws' : 'wss'}://${host}/rooms/${encodeURIComponent(deckId)}`;
}

/** The HTTP origin of the Worker for the belt and the CSP, or null without a host. */
export function roomHttpOrigin(env: Env = process.env): string | null {
  const host = roomHost(env);
  if (host === null) return null;
  return `${roomInsecure(env) ? 'http' : 'https'}://${host}`;
}

export type TicketFacts = {
  deckId: string;
  clientId: string;
  /** what the budgets key on: the principal id or `agent:<tokenId>` (room.ts `RequestIdentity.identity`) */
  identity: string;
  kind: IdentityKind;
  principalId: string | null;
  role: Role;
  reader: ViewerFacts;
  resolved: ResolvedIdentity;
  /** the origin the function served the page from; the Worker compares the upgrade's `Origin` to it */
  origin: string;
  tab?: string;
};

/** The claims of a ticket from the facts a route holds, before the times (3.3). */
export function ticketClaimsFor(
  facts: TicketFacts,
  env: Env = process.env,
): Omit<TicketClaims, 'iat' | 'exp'> {
  const email =
    facts.resolved.trust === 'verified' && facts.resolved.email !== undefined
      ? facts.resolved.email
      : undefined;
  return {
    v: ROOM_PROTOCOL,
    deck: facts.deckId,
    cid: facts.clientId,
    id: facts.identity,
    kind: facts.kind,
    ...(facts.principalId === null ? {} : { pid: facts.principalId }),
    role: facts.role,
    via: facts.reader.via,
    names: facts.reader.showNames,
    rc: facts.reader.readComments,
    label: facts.resolved.displayName,
    trust: facts.resolved.trust,
    // the hue is the object's grant (3.3); the mark travels without one
    mark: markSpec(facts.resolved) as unknown as Record<string, unknown>,
    ...(email === undefined ? {} : { email }),
    org: facts.origin,
    ...(facts.tab === undefined ? {} : { tab: facts.tab }),
    ...(buildCommit(env) === null ? {} : { dpl: buildCommit(env) ?? '' }),
  };
}

export type MintedTicket = { ticket: string; expiresAt: number; claims: TicketClaims };

/**
 * Signs the claims under the room secret (3.3): canonical JSON of the claims with the times, the
 * HMAC-SHA256 over its bytes, the two halves base64url. A TypeError when the secret is absent, so
 * a deployment on the `do` tier without it fails at the first page instead of minting nothing.
 */
export function mintRoomTicket(
  claims: Omit<TicketClaims, 'iat' | 'exp'>,
  options: { now?: number; ttlMs?: number; env?: Env } = {},
): MintedTicket {
  const env = options.env ?? process.env;
  const secret = env[ROOM_SECRET_VARIABLE];
  if (secret === undefined || secret === '') {
    throw new TypeError(
      `${ROOM_SECRET_VARIABLE} is not set; the do tier cannot mint a room ticket`,
    );
  }
  const now = options.now ?? Date.now();
  const expiresAt = now + (options.ttlMs ?? ROOM_TICKET_TTL_MS);
  const full: TicketClaims = { ...claims, iat: now, exp: expiresAt };
  const text = canonicalJson(full);
  const mac = createHmac('sha256', secret).update(text).digest();
  return { ticket: encodeTicket(text, new Uint8Array(mac)), expiresAt, claims: full };
}
