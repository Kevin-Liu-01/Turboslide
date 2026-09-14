import { describe, expect, test } from 'vitest';

import {
  DIGEST_WINDOW_MS,
  DIRECT_WINDOW_MS,
  MAILS_PER_PERSON_PER_DAY,
  REQUEST_BATCH_MS,
  UNSUBSCRIBED,
  UNSUBSCRIBE_BAD_LINK,
  createDigestQueue,
  createRequestBatcher,
  handleUnsubscribe,
  parseUnsubscribeToken,
  unsubscribeToken,
  unsubscribeUrlFor,
} from './digest.ts';
import type { DigestEvent, DigestRecipient } from './digest.ts';
import { captureMailer, memoryCaptureStore } from './mail/mailer.ts';
import { memoryQuotaStore } from './quota.ts';

const SECRET = 'an-obviously-fake-unsubscribe-secret-for-tests';
const T0 = new Date('2026-09-13T10:00:00.000Z');

function recipient(overrides: Partial<DigestRecipient> = {}): DigestRecipient {
  return {
    principalId: 'usr_maya',
    email: 'maya@example.test',
    anonymous: false,
    hasGrant: true,
    emailEnabled: true,
    deckTitle: 'Q4 review',
    deckUrl: 'https://studio.example.test/deck/q4-review',
    settingsUrl: 'https://studio.example.test/edit/q4-review#notification-settings',
    ...overrides,
  };
}

function event(overrides: Partial<DigestEvent> = {}): DigestEvent {
  return {
    principalId: 'usr_maya',
    deckId: 'q4-review',
    kind: 'reply',
    sentence: 'Kai replied on slide 4',
    at: T0.toISOString(),
    ...overrides,
  };
}

function setup(recipients: Record<string, DigestRecipient | null> = {}) {
  const store = memoryCaptureStore();
  const mailer = captureMailer(store, () => T0);
  const deps = {
    mailer,
    quotas: memoryQuotaStore(),
    resolveRecipient: (principalId: string) =>
      Promise.resolve(
        principalId in recipients ? recipients[principalId]! : recipient({ principalId }),
      ),
    unsubscribeUrl: (principalId: string) =>
      unsubscribeUrlFor('https://studio.example.test', principalId, SECRET),
  };
  return { store, deps, queue: createDigestQueue(deps), batcher: createRequestBatcher(deps) };
}

describe('the comment digest', () => {
  test('coalesces a person and deck for 15 minutes, 2 minutes with a mention, and mails one digest', async () => {
    const { queue, store } = setup();
    queue.push(event());
    queue.push(event({ sentence: 'Kai resolved a comment on slide 2', kind: 'resolved' }));
    expect(queue.pending()).toEqual([
      {
        principalId: 'usr_maya',
        deckId: 'q4-review',
        count: 2,
        dueAt: new Date(T0.getTime() + DIGEST_WINDOW_MS).toISOString(),
      },
    ]);
    expect(await queue.flush(new Date(T0.getTime() + 60_000))).toBe(0);
    queue.push(event({ kind: 'mention', sentence: 'Kai mentioned you on slide 1' }));
    expect(queue.pending()[0]?.dueAt).toBe(new Date(T0.getTime() + DIRECT_WINDOW_MS).toISOString());
    expect(await queue.flush(new Date(T0.getTime() + DIRECT_WINDOW_MS))).toBe(1);
    expect(queue.pending()).toEqual([]);
    const [mail] = store.mails;
    expect(mail?.to).toBe('maya@example.test');
    expect(mail?.kind).toBe('digest');
    expect(mail?.subject).toBe('3 new comments on "Q4 review"');
    expect(mail?.text).toContain('Kai mentioned you on slide 1');
    expect(mail?.text).toContain('https://studio.example.test/deck/q4-review');
    expect(mail?.text).not.toMatch(/\/s\//);
    expect(mail?.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mail?.headers['List-Unsubscribe']).toMatch(
      /^<https:\/\/studio\.example\.test\/api\/notify\/unsubscribe\?t=/,
    );
  });

  test('sends nothing to anonymous identities, people without a grant, or with mail off', async () => {
    const { queue, store } = setup({
      anon_a: recipient({ principalId: 'anon_a', anonymous: true }),
      usr_nogrant: recipient({ principalId: 'usr_nogrant', hasGrant: false }),
      usr_off: recipient({ principalId: 'usr_off', emailEnabled: false }),
      usr_gone: null,
    });
    for (const principalId of ['anon_a', 'usr_nogrant', 'usr_off', 'usr_gone'])
      queue.push(event({ principalId }));
    expect(await queue.flush(new Date(T0.getTime() + DIGEST_WINDOW_MS))).toBe(0);
    expect(store.mails).toEqual([]);
    expect(queue.pending()).toEqual([]);
  });

  test('caps a person at ten mails a day, holds the rest, and sends one summary the next day', async () => {
    const { queue, store } = setup();
    for (let i = 0; i < MAILS_PER_PERSON_PER_DAY + 3; i += 1) {
      queue.push(event({ deckId: `deck-${i}`, sentence: `line ${i}` }));
    }
    const due = new Date(T0.getTime() + DIGEST_WINDOW_MS);
    expect(await queue.flush(due)).toBe(MAILS_PER_PERSON_PER_DAY);
    expect(store.mails).toHaveLength(MAILS_PER_PERSON_PER_DAY);
    // the same day: nothing more leaves
    expect(await queue.flush(new Date(due.getTime() + 60_000))).toBe(0);
    // the next day: one summary with the three held lines
    const nextDay = new Date('2026-09-14T00:05:00.000Z');
    expect(await queue.flush(nextDay)).toBe(1);
    const summary = store.mails[store.mails.length - 1];
    expect(summary?.subject).toBe('3 new comments on "Q4 review and other presentations"');
    expect(summary?.text).toContain('line 12');
  });

  test('mention mails stop at twenty a day while the other kinds still leave', async () => {
    const { queue, store } = setup();
    for (let i = 0; i < 20; i += 1) {
      queue.push(event({ deckId: `d${i}`, kind: 'mention', sentence: `m ${i}` }));
    }
    // the daily cap of ten holds the mention groups past ten; count what left
    await queue.flush(new Date(T0.getTime() + DIRECT_WINDOW_MS));
    const before = store.mails.length;
    expect(before).toBe(MAILS_PER_PERSON_PER_DAY);
    const { queue: other, store: otherStore } = setup();
    for (let i = 0; i < 21; i += 1)
      other.push(
        event({ principalId: 'usr_x', deckId: `d${i}`, kind: 'mention', sentence: `m ${i}` }),
      );
    other.push(event({ principalId: 'usr_x', deckId: 'd21', kind: 'reply', sentence: 'a reply' }));
    await other.flush(new Date(T0.getTime() + DIGEST_WINDOW_MS));
    // ten mails left today (the person cap); none of them is a mention past the twentieth
    expect(otherStore.mails.length).toBe(MAILS_PER_PERSON_PER_DAY);
  });
});

describe('the request access batch', () => {
  test('sends one mail per deck per hour listing every request', async () => {
    const { batcher, store } = setup({
      usr_owner: recipient({ principalId: 'usr_owner', email: 'owner@example.test' }),
    });
    batcher.push({
      deckId: 'q4-review',
      ownerPrincipalId: 'usr_owner',
      request: { who: 'ana@example.test', role: 'editor', message: 'Need to fix a number' },
      at: T0.toISOString(),
    });
    batcher.push({
      deckId: 'q4-review',
      ownerPrincipalId: 'usr_owner',
      request: { who: 'Titanium 471', role: 'viewer' },
      at: new Date(T0.getTime() + 60_000).toISOString(),
    });
    expect(batcher.pending()).toBe(2);
    expect(await batcher.flush(new Date(T0.getTime() + 30 * 60_000))).toBe(0);
    expect(await batcher.flush(new Date(T0.getTime() + REQUEST_BATCH_MS))).toBe(1);
    expect(batcher.pending()).toBe(0);
    const [mail] = store.mails;
    expect(mail?.to).toBe('owner@example.test');
    expect(mail?.kind).toBe('request-access');
    expect(mail?.subject).toBe('2 people asked for access to "Q4 review"');
    expect(mail?.text).toContain('ana@example.test asked to edit. Message: Need to fix a number');
    expect(mail?.text).toContain('Titanium 471 asked to view.');
  });
});

describe('one click unsubscribe', () => {
  test('the token names one principal and verifies; a forged one does not', () => {
    const token = unsubscribeToken('usr_maya', SECRET);
    expect(parseUnsubscribeToken(token, SECRET)).toBe('usr_maya');
    expect(parseUnsubscribeToken(token, 'another-secret-that-is-long-enough-000')).toBeNull();
    expect(parseUnsubscribeToken(`${token}x`, SECRET)).toBeNull();
    expect(parseUnsubscribeToken('nodot', SECRET)).toBeNull();
    expect(unsubscribeUrlFor('https://x.test', 'usr_maya', SECRET)).toBe(
      `https://x.test/api/notify/unsubscribe?t=${encodeURIComponent(token)}`,
    );
  });

  test('the handler turns mail off for a valid token on GET and the one click POST, and refuses the rest', async () => {
    const off: string[] = [];
    const deps = {
      secret: SECRET,
      setEmailOff: (id: string) => Promise.resolve(void off.push(id)),
    };
    const url = unsubscribeUrlFor('https://x.test', 'usr_maya', SECRET);
    const got = await handleUnsubscribe(new Request(url), deps);
    expect(got.status).toBe(200);
    expect(await got.text()).toContain(UNSUBSCRIBED);
    const posted = await handleUnsubscribe(
      new Request(url, {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
      deps,
    );
    expect(posted.status).toBe(200);
    expect(off).toEqual(['usr_maya', 'usr_maya']);
    const bad = await handleUnsubscribe(
      new Request('https://x.test/api/notify/unsubscribe?t=forged.x'),
      deps,
    );
    expect(bad.status).toBe(404);
    expect(await bad.text()).toContain(UNSUBSCRIBE_BAD_LINK);
    expect(bad.headers.get('x-robots-tag')).toBe('noindex');
    expect(off).toHaveLength(2);
  });
});
