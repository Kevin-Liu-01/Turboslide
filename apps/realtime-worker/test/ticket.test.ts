import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { encodeTicket, splitTicket } from '@turboslide/realtime/frames';

import {
  authorizationToken,
  secretsMatch,
  secretsMatchAny,
  verifyTicket,
  verifyTicketRotating,
} from '../src/ticket.ts';
import { CID_A, ORIGIN, mint } from './lib.ts';

// The ticket's checks (docs/CLOUDFLARE.md 3.3): the MAC first, then the shape of the claims, the
// version window, the deck, the origin and the expiry with its grace; the bearer compare.
describe('verifyTicket', () => {
  const secret = env.TURBOSLIDE_ROOM_SECRET;
  const now = 1_800_000_000_000;

  it('accepts a ticket the function minted and answers its claims', async () => {
    const token = await mint({ deck: 'gt-brand', cid: CID_A }, { now });
    const verdict = await verifyTicket(token, secret, {
      deck: 'gt-brand',
      origin: ORIGIN,
      now: now + 1000,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.claims.cid).toBe(CID_A);
      expect(verdict.claims.deck).toBe('gt-brand');
      expect(verdict.claims.role).toBe('editor');
    }
  });

  it('refuses a wrong secret, a tampered claim, a wrong deck, a wrong origin and a bad shape', async () => {
    const token = await mint({ deck: 'gt-brand', cid: CID_A }, { now });
    expect(
      await verifyTicket(token, `${secret}x`, { deck: 'gt-brand', origin: ORIGIN, now }),
    ).toEqual({
      ok: false,
      reason: 'signature',
    });
    const split = splitTicket(token);
    const tampered = encodeTicket(split!.claimsText.replace('"editor"', '"owner"'), split!.mac);
    expect(tampered).not.toBe(token);
    expect(await verifyTicket(tampered, secret, { deck: 'gt-brand', origin: ORIGIN, now })).toEqual(
      {
        ok: false,
        reason: 'signature',
      },
    );
    expect(await verifyTicket(token, secret, { deck: 'other', origin: ORIGIN, now })).toEqual({
      ok: false,
      reason: 'deck',
    });
    expect(
      await verifyTicket(token, secret, { deck: 'gt-brand', origin: 'https://evil.example', now }),
    ).toEqual({
      ok: false,
      reason: 'origin',
    });
    expect(await verifyTicket('nodot', secret, { deck: 'gt-brand', origin: ORIGIN, now })).toEqual({
      ok: false,
      reason: 'shape',
    });
    expect(
      await verifyTicket(`${token}.extra`, secret, { deck: 'gt-brand', origin: ORIGIN, now }),
    ).toEqual({
      ok: false,
      reason: 'shape',
    });
  });

  it('refuses an expired ticket past its grace and the version outside the two version window', async () => {
    const token = await mint({ deck: 'gt-brand', cid: CID_A }, { now, ttlMs: 1000 });
    expect(
      (await verifyTicket(token, secret, { deck: 'gt-brand', origin: ORIGIN, now: now + 500 })).ok,
    ).toBe(true);
    expect(
      await verifyTicket(token, secret, { deck: 'gt-brand', origin: ORIGIN, now: now + 2000 }),
    ).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(
      (
        await verifyTicket(token, secret, {
          deck: 'gt-brand',
          origin: ORIGIN,
          now: now + 2000,
          graceMs: 30_000,
        })
      ).ok,
    ).toBe(true);
    const old = await mint({ deck: 'gt-brand', cid: CID_A }, { now, v: 0 });
    expect((await verifyTicket(old, secret, { deck: 'gt-brand', origin: ORIGIN, now })).ok).toBe(
      true,
    );
    const older = await mint({ deck: 'gt-brand', cid: CID_A }, { now, v: 3 });
    expect(await verifyTicket(older, secret, { deck: 'gt-brand', origin: ORIGIN, now })).toEqual({
      ok: false,
      reason: 'version',
    });
  });

  it('refuses claims the schema does not accept', async () => {
    const token = await mint({ deck: 'gt-brand', cid: 'not-a-client-id' as never }, { now });
    expect(await verifyTicket(token, secret, { deck: 'gt-brand', origin: ORIGIN, now })).toEqual({
      ok: false,
      reason: 'claims',
    });
  });

  it('reads an authorization header by scheme and compares secrets in constant time', async () => {
    expect(authorizationToken('Bearer abc', 'Bearer')).toBe('abc');
    expect(authorizationToken('bearer abc', 'Bearer')).toBe('abc');
    expect(authorizationToken('Ticket x.y', 'Bearer')).toBeNull();
    expect(authorizationToken('Ticket x.y', 'Ticket')).toBe('x.y');
    expect(authorizationToken(null, 'Bearer')).toBeNull();
    expect(authorizationToken('Bearer ', 'Bearer')).toBeNull();
    expect(await secretsMatch('abc', 'abc')).toBe(true);
    expect(await secretsMatch('abc', 'abd')).toBe(false);
    expect(await secretsMatch('ab', 'abc')).toBe(false);
    expect(await secretsMatch(null, 'abc')).toBe(false);
    expect(await secretsMatch('', '')).toBe(false);
    // 32 é and 32 hex characters: the same length, other bytes, no throw (HR-SA#1)
    expect(await secretsMatch('é'.repeat(32), '0123456789abcdef0123456789abcdef')).toBe(false);
  });
});

// A rotation in flight (docs/hosting.md 13.8): the previous secret verifies a ticket the current
// refused for its signature alone, and the previous bearer is taken beside the current one.
describe('the rotation partners', () => {
  const now = 1_800_000_000_000;
  const check = { deck: 'gt-brand', origin: ORIGIN, now: now + 1000 };

  it('verifies a ticket signed with the previous secret only while the previous secret is set', async () => {
    const old = env.TURBOSLIDE_ROOM_SECRET;
    const next = 'test-room-secret-next-0000000000000000000000000000000000000000';
    const token = await mint({ deck: 'gt-brand', cid: CID_A }, { now });
    expect((await verifyTicketRotating(token, { current: next, previous: old }, check)).ok).toBe(
      true,
    );
    expect(await verifyTicketRotating(token, { current: next }, check)).toEqual({
      ok: false,
      reason: 'signature',
    });
    expect(await verifyTicketRotating(token, { current: next, previous: '' }, check)).toEqual({
      ok: false,
      reason: 'signature',
    });
    // a refusal for anything but the signature is the current secret's answer
    expect(
      await verifyTicketRotating(token, { current: old, previous: next }, { ...check, deck: 'x' }),
    ).toEqual({ ok: false, reason: 'deck' });
  });

  it('takes any set expected bearer and nothing else', async () => {
    expect(await secretsMatchAny('a1', ['a1', 'b2'])).toBe(true);
    expect(await secretsMatchAny('b2', ['a1', 'b2'])).toBe(true);
    expect(await secretsMatchAny('c3', ['a1', 'b2'])).toBe(false);
    expect(await secretsMatchAny('', ['', undefined])).toBe(false);
    expect(await secretsMatchAny(null, ['a1'])).toBe(false);
    expect(await secretsMatchAny('a1', [undefined, 'a1'])).toBe(true);
  });
});
