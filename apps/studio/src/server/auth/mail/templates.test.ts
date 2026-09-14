import { describe, expect, test } from 'vitest';

import {
  digestHeaders,
  digestMail,
  escapeHtml,
  invitationMail,
  requestAccessMail,
  requestOutcomeMail,
  roleSentence,
  signInMail,
  transferMail,
  transferOutcomeMail,
} from './templates.ts';

describe('the mail templates', () => {
  test('the sign in mail carries the link and the code in one message', () => {
    const mail = signInMail({
      url: 'https://studio.example.test/api/auth/magic-link/verify?token=t',
      code: '482913',
      minutes: 5,
    });
    expect(mail.subject).toBe('Your Turboslide sign in code is 482913');
    expect(mail.text).toContain('Code: 482913');
    expect(mail.text).toContain('https://studio.example.test/api/auth/magic-link/verify?token=t');
    expect(mail.text).toContain('expire in 5 minutes');
    expect(mail.html).toContain(
      '<a href="https://studio.example.test/api/auth/magic-link/verify?token=t" rel="noreferrer">Sign in</a>',
    );
    expect(mail.html.startsWith('<!doctype html>')).toBe(true);
  });

  test('names are escaped in the HTML and left as text in the plain body', () => {
    const mail = invitationMail({
      inviterName: 'Maya <script>alert(1)</script>',
      title: 'Q4 "review" & plan',
      role: 'commenter',
      message: 'Please look at slide 4',
      url: 'https://studio.example.test/deck/q4-review',
    });
    expect(mail.subject).toBe(
      'Maya <script>alert(1)</script> shared "Q4 "review" & plan" with you',
    );
    expect(mail.text).toContain('You can comment.');
    expect(mail.text).toContain('Message: Please look at slide 4');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&amp; plan');
    expect(escapeHtml('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  test('the role sentences are Google’s three, and the deck link is the plain address', () => {
    expect(roleSentence('viewer')).toBe('You can view.');
    expect(roleSentence('commenter')).toBe('You can comment.');
    expect(roleSentence('editor')).toBe('You can edit.');
    const mail = invitationMail({
      inviterName: 'Kai',
      title: 'Deck',
      role: 'viewer',
      url: 'https://studio.example.test/deck/deck-1',
    });
    expect(mail.text).not.toMatch(/\/s\//);
    expect(mail.text).not.toMatch(/[?&]k=/);
  });

  test('the request access mail batches every request and counts them in the subject', () => {
    const one = requestAccessMail({
      title: 'Pricing',
      url: 'https://studio.example.test/edit/pricing',
      requests: [{ who: 'ana@example.test', role: 'editor', message: 'Need to fix a number' }],
    });
    expect(one.subject).toBe('ana@example.test asked for access to "Pricing"');
    expect(one.text).toContain('ana@example.test asked to edit. Message: Need to fix a number');
    const many = requestAccessMail({
      title: 'Pricing',
      url: 'https://studio.example.test/edit/pricing',
      requests: [
        { who: 'Titanium 471', role: 'viewer' },
        { who: 'ana@example.test', role: 'commenter' },
        { who: 'bo@example.test', role: 'editor' },
      ],
    });
    expect(many.subject).toBe('3 people asked for access to "Pricing"');
    expect(many.text).toContain('Titanium 471 asked to view.');
    expect(many.text).toContain('ana@example.test asked to comment.');
    expect(many.html.match(/<p>/g)?.length).toBeGreaterThan(3);
  });

  test('the transfer and outcome mails say who and what happened, never a capability', () => {
    const ask = transferMail({
      fromName: 'Kevin',
      title: 'Board deck',
      url: 'https://x.test/deck/b',
    });
    expect(ask.subject).toBe('Kevin wants to make you the owner of "Board deck"');
    expect(ask.text).toContain('Accept or decline from Share');
    expect(
      transferOutcomeMail({ toName: 'Ana', title: 'Board deck', accepted: true, url: 'u' }).text,
    ).toContain('Ana is now the owner');
    expect(
      transferOutcomeMail({ toName: 'Ana', title: 'Board deck', accepted: false, url: 'u' })
        .subject,
    ).toBe('The transfer of "Board deck" was declined');
    expect(
      requestOutcomeMail({ title: 'D', granted: 'commenter', url: 'https://x.test/deck/d' }).text,
    ).toBe('You can comment "D" now.\n\nhttps://x.test/deck/d');
    expect(
      requestOutcomeMail({ title: 'D', granted: null, url: 'https://x.test/deck/d' }).text,
    ).toBe('The owner declined your request for "D".');
  });

  test('the digest lists one sentence per event and carries the one click unsubscribe headers', () => {
    const mail = digestMail({
      title: 'Q4',
      url: 'https://x.test/deck/q4',
      lines: ['Maya replied on slide 4', 'Kai mentioned you on slide 2'],
      settingsUrl: 'https://x.test/edit/q4#notification-settings',
      unsubscribeUrl: 'https://x.test/api/notify/unsubscribe?t=abc',
    });
    expect(mail.subject).toBe('2 new comments on "Q4"');
    expect(mail.text).toContain('Maya replied on slide 4');
    expect(mail.html).toContain('<li>Kai mentioned you on slide 2</li>');
    expect(mail.text).toContain('https://x.test/api/notify/unsubscribe?t=abc');
    expect(digestHeaders('https://x.test/api/notify/unsubscribe?t=abc')).toEqual({
      'List-Unsubscribe': '<https://x.test/api/notify/unsubscribe?t=abc>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(
      digestMail({ title: 'Q4', url: 'u', lines: ['one'], settingsUrl: 's', unsubscribeUrl: 'x' })
        .subject,
    ).toBe('One new comment on "Q4"');
  });
});
