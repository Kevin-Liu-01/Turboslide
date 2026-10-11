import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseTicketClaims, splitTicket, viewerFactsOfClaims } from '@turboslide/realtime/frames';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';

import {
  ROOM_TICKET_TTL_MS,
  mintRoomTicket,
  roomHost,
  roomHttpOrigin,
  roomUrlFor,
  ticketClaimsFor,
} from './room-ticket';

// The ticket the function mints (docs/CLOUDFLARE.md 3.3): the claims from the route's facts, the
// MAC over the canonical claims text, the base64url halves the Worker's verifier splits, and the
// room URL from the host variable.
const resolved: ResolvedIdentity = {
  principalId: 'anon_00000000-0000-4000-8000-000000000001',
  kind: 'anonymous',
  displayName: 'Quiet Fox',
  label: 'Quiet Fox',
  trust: 'label',
  avatar: { variant: 'initials' },
  deleted: false,
  admin: false,
};

const env = {
  TURBOSLIDE_ROOM_HOST: 'turboslide-realtime-preview.fake.workers.dev',
  TURBOSLIDE_ROOM_SECRET: 'secret-0000000000000000000000000000000000000000000000000000',
  TURBOSLIDE_BUILD_COMMIT: 'abcdef1234',
};

describe('the room ticket', () => {
  it('mints claims the verifier parses, signed over the canonical text', () => {
    const claims = ticketClaimsFor(
      {
        deckId: 'gt-brand',
        clientId: 'a'.repeat(32),
        identity: resolved.principalId,
        kind: 'anonymous',
        principalId: resolved.principalId,
        role: 'editor',
        reader: {
          role: 'editor',
          via: 'owner',
          showNames: false,
          readComments: true,
          principalId: resolved.principalId,
        },
        resolved,
        origin: 'http://localhost:4471',
        tab: 'f'.repeat(32),
      },
      env,
    );
    expect(claims).toMatchObject({
      v: 1,
      deck: 'gt-brand',
      cid: 'a'.repeat(32),
      id: resolved.principalId,
      pid: resolved.principalId,
      kind: 'anonymous',
      role: 'editor',
      via: 'owner',
      names: false,
      rc: true,
      label: 'Quiet Fox',
      trust: 'label',
      org: 'http://localhost:4471',
      tab: 'f'.repeat(32),
      dpl: 'abcdef1234',
    });
    expect(claims.mark).toMatchObject({ variant: 'initials', hue: null });
    expect('email' in claims).toBe(false);
    const minted = mintRoomTicket(claims, { now: 1_000_000, env });
    expect(minted.expiresAt).toBe(1_000_000 + ROOM_TICKET_TTL_MS);
    const split = splitTicket(minted.ticket);
    expect(split).not.toBeNull();
    const parsed = parseTicketClaims(split!.claimsText);
    expect(parsed).toEqual(minted.claims);
    const expected = createHmac('sha256', env.TURBOSLIDE_ROOM_SECRET)
      .update(split!.claimsText)
      .digest();
    expect(Buffer.from(split!.mac)).toEqual(expected);
    expect(minted.ticket).not.toContain(env.TURBOSLIDE_ROOM_SECRET);
  });

  it('carries whether the reader may share, which the Worker reads back with the deck (HR-SD#1; verifier pass 2, F2)', () => {
    const facts = {
      deckId: 'gt-brand',
      clientId: 'c'.repeat(32),
      identity: resolved.principalId,
      kind: 'anonymous' as const,
      principalId: resolved.principalId,
      role: 'viewer' as const,
      resolved,
      origin: 'https://www.turboslide.com',
    };
    const reader = {
      role: 'viewer' as const,
      via: 'link',
      showNames: false,
      readComments: false,
      principalId: resolved.principalId,
      deckId: 'gt-brand',
    };
    const viewer = ticketClaimsFor({ ...facts, reader: { ...reader, share: false } }, env);
    expect(viewer.sh).toBe(false);
    const minted = mintRoomTicket(viewer, { now: 1_000_000, env });
    const parsed = parseTicketClaims(splitTicket(minted.ticket)!.claimsText);
    expect(parsed).not.toBeNull();
    expect(viewerFactsOfClaims(parsed!)).toMatchObject({
      share: false,
      deckId: 'gt-brand',
      principalId: resolved.principalId,
    });
    expect(ticketClaimsFor({ ...facts, reader: { ...reader, share: true } }, env).sh).toBe(true);
    // a reader whose facts carry no answer mints no claim, and such a ticket still parses
    const older = ticketClaimsFor({ ...facts, reader }, env);
    expect('sh' in older).toBe(false);
    const olderParsed = parseTicketClaims(
      splitTicket(mintRoomTicket(older, { now: 1_000_000, env }).ticket)!.claimsText,
    );
    expect(olderParsed).not.toBeNull();
    expect('share' in viewerFactsOfClaims(olderParsed!)).toBe(false);
  });

  it('carries the replay floor of a reader without history, which the Worker reads back (HR-SD#1e)', () => {
    const facts = {
      deckId: 'gt-brand',
      clientId: 'd'.repeat(32),
      identity: resolved.principalId,
      kind: 'anonymous' as const,
      principalId: resolved.principalId,
      role: 'viewer' as const,
      resolved,
      origin: 'https://www.turboslide.com',
    };
    const reader = {
      role: 'viewer' as const,
      via: 'link',
      showNames: false,
      readComments: false,
      principalId: resolved.principalId,
      deckId: 'gt-brand',
    };
    const floored = ticketClaimsFor({ ...facts, reader: { ...reader, floor: 37 } }, env);
    expect(floored.fl).toBe(37);
    const parsed = parseTicketClaims(
      splitTicket(mintRoomTicket(floored, { now: 1_000_000, env }).ticket)!.claimsText,
    );
    expect(viewerFactsOfClaims(parsed!).floor).toBe(37);
    // a reader with history (floor null) and a reader with nothing signed mint no claim
    expect('fl' in ticketClaimsFor({ ...facts, reader: { ...reader, floor: null } }, env)).toBe(
      false,
    );
    expect('fl' in ticketClaimsFor({ ...facts, reader }, env)).toBe(false);
  });

  it('carries a verified address and refuses to mint without the secret', () => {
    const claims = ticketClaimsFor(
      {
        deckId: 'gt-brand',
        clientId: 'b'.repeat(32),
        identity: 'usr_1',
        kind: 'signedIn',
        principalId: 'usr_1',
        role: 'owner',
        reader: { role: 'owner', via: 'owner', showNames: true, readComments: true },
        resolved: {
          ...resolved,
          principalId: 'usr_1',
          kind: 'account',
          trust: 'verified',
          email: 'k@example.com',
          displayName: 'Kevin',
        },
        origin: 'https://www.turboslide.com',
      },
      {},
    );
    expect(claims.email).toBe('k@example.com');
    expect('dpl' in claims).toBe(false);
    expect(() => mintRoomTicket(claims, { env: {} })).toThrow(/TURBOSLIDE_ROOM_SECRET is not set/);
  });

  it('builds the room URL from the host, secure by default and ws:// on an insecure checkout', () => {
    expect(roomHost(env)).toBe('turboslide-realtime-preview.fake.workers.dev');
    expect(roomHost({ TURBOSLIDE_ROOM_HOST: 'https://x.workers.dev/' })).toBe('x.workers.dev');
    expect(roomHost({})).toBeNull();
    expect(roomUrlFor('gt-brand', env)).toBe(
      'wss://turboslide-realtime-preview.fake.workers.dev/rooms/gt-brand',
    );
    expect(
      roomUrlFor('gt-brand', {
        TURBOSLIDE_ROOM_HOST: '127.0.0.1:8791',
        TURBOSLIDE_ROOM_INSECURE: '1',
      }),
    ).toBe('ws://127.0.0.1:8791/rooms/gt-brand');
    expect(
      roomHttpOrigin({ TURBOSLIDE_ROOM_HOST: '127.0.0.1:8791', TURBOSLIDE_ROOM_INSECURE: '1' }),
    ).toBe('http://127.0.0.1:8791');
    expect(roomUrlFor('gt-brand', {})).toBeNull();
  });
});
