import { describe, expect, it } from 'vitest';

import {
  AuthRefusal,
  NO_METHODS,
  addressProblemOf,
  canSend,
  cleanCode,
  cleanDeviceCode,
  clock,
  codeProblemOf,
  deviceGroups,
  errorCallbackURL,
  errorState,
  nextState,
  reasonOf,
  resendWait,
  safeNext,
  signInHref,
  stateId,
} from './auth-model';
import type { AuthMethods, AuthState } from './auth-model';
import { AUTH_WORDS } from './auth-words';

// The auth plate's model (docs/POLISH-2.md 4.2 to 4.5): the return address rule, the reasons a
// library code names, the state ids the gallery and the rows read, the events between them, and
// the words' grammar.

const GOOGLE: AuthMethods = { available: true, google: true, github: false, email: false };
const ALL: AuthMethods = { available: true, google: true, github: true, email: true };

describe('safeNext: a same origin path or /decks', () => {
  it('keeps a path on this origin with its search', () => {
    expect(safeNext('/decks')).toBe('/decks');
    expect(safeNext('/edit/q3-plan?mode=book')).toBe('/edit/q3-plan?mode=book');
    expect(safeNext('/device?user_code=WDJBMJHT')).toBe('/device?user_code=WDJBMJHT');
  });

  it('refuses another origin, a scheme, a backslash, a control character and the sign in page', () => {
    for (const bad of [
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      'decks',
      '',
      '/decks\nx',
      '/signin?next=/decks',
      '/signin',
      '/api/auth/sign-out',
      `/${'a'.repeat(600)}`,
      null,
      undefined,
    ])
      expect(safeNext(bad as string | null | undefined), String(bad)).toBe('/decks');
  });

  it('writes the sign in link and the error address with the return path encoded', () => {
    expect(signInHref('/home')).toBe('/signin?next=%2Fhome');
    expect(errorCallbackURL('/edit/q3-plan')).toBe('/signin?next=%2Fedit%2Fq3-plan');
    expect(signInHref('https://evil.example')).toBe('/signin?next=%2Fdecks');
  });
});

describe('reasonOf: the sentence a code names', () => {
  it('maps each code of docs/POLISH-2.md 4.4 to its reason', () => {
    expect(reasonOf('access_denied')).toBe('cancelled');
    for (const code of ['state_not_found', 'state_mismatch', 'invalid_callback_request'])
      expect(reasonOf(code), code).toBe('expired');
    for (const code of ['INVALID_TOKEN', 'EXPIRED_TOKEN', 'ATTEMPTS_EXCEEDED'])
      expect(reasonOf(code), code).toBe('link');
    for (const code of [
      'account_not_linked',
      'unable_to_link_account',
      'email_not_found',
      "email_doesn't_match",
    ])
      expect(reasonOf(code), code).toBe('account');
    expect(reasonOf('invalid_code')).toBe('other');
  });

  it('prints a code as letters, digits and underscores, at most 64 characters', () => {
    expect(cleanCode('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(cleanCode('x'.repeat(100))).toHaveLength(64);
    expect(errorState('')).toBeNull();
    expect(errorState(null)).toBeNull();
    expect(errorState('access_denied')).toEqual({
      step: 'error',
      reason: 'cancelled',
      code: 'access_denied',
    });
  });
});

describe('stateId: the gallery and the rows name a state the same way', () => {
  it('names the methods by the deployment', () => {
    const methods: AuthState = { step: 'methods' };
    expect(stateId(methods, GOOGLE, 'sign-in')).toBe('methods.google');
    expect(stateId(methods, { ...GOOGLE, email: true }, 'sign-in')).toBe('methods.google-email');
    expect(stateId(methods, ALL, 'sign-in')).toBe('methods.all');
    expect(stateId(methods, { ...NO_METHODS, available: true, email: true }, 'sign-in')).toBe(
      'methods.email',
    );
    expect(stateId(methods, NO_METHODS, 'sign-in')).toBe('methods.none');
    expect(stateId({ step: 'methods', leaving: 'google' }, GOOGLE, 'sign-in')).toBe(
      'methods.leaving',
    );
    expect(stateId(methods, GOOGLE, 'device')).toBe('device.sign-in-first');
  });

  it('names the sent, error and device states', () => {
    expect(stateId({ step: 'sent', email: 'a@b.c' }, ALL, 'sign-in')).toBe('email.sent');
    expect(stateId({ step: 'sent', email: 'a@b.c', problem: 'code-spent' }, ALL, 'sign-in')).toBe(
      'email.code-spent',
    );
    expect(stateId({ step: 'error', reason: 'link', code: 'INVALID_TOKEN' }, ALL, 'sign-in')).toBe(
      'error.link',
    );
    expect(stateId({ step: 'device' }, GOOGLE, 'device')).toBe('device.code');
    expect(stateId({ step: 'device', problem: 'expired' }, GOOGLE, 'device')).toBe(
      'device.expired',
    );
    expect(stateId({ step: 'approved', email: 'a@b.c' }, GOOGLE, 'device')).toBe('device.approved');
    expect(stateId({ step: 'denied' }, GOOGLE, 'device')).toBe('device.denied');
  });
});

describe('nextState: the events between the states', () => {
  it('walks the email method: sent, a wrong code, an expired one, another address', () => {
    let state: AuthState = { step: 'methods' };
    state = nextState(state, { type: 'sent', email: 'ada@example.com' });
    expect(state).toEqual({ step: 'sent', email: 'ada@example.com' });
    state = nextState(state, { type: 'code-refused', problem: 'code-wrong' });
    expect(state).toEqual({ step: 'sent', email: 'ada@example.com', problem: 'code-wrong' });
    state = nextState(state, { type: 'code-refused', problem: 'code-expired' });
    expect(stateId(state, ALL, 'sign-in')).toBe('email.code-expired');
    state = nextState(state, { type: 'sent', email: 'ada@example.com' });
    expect(stateId(state, ALL, 'sign-in')).toBe('email.sent');
    state = nextState(state, { type: 'another-address' });
    expect(state).toEqual({ step: 'methods' });
  });

  it('comes back from an error to the methods, and from a provider that failed', () => {
    expect(
      nextState(
        { step: 'error', reason: 'cancelled', code: 'access_denied' },
        { type: 'try-again' },
      ),
    ).toEqual({ step: 'methods' });
    expect(nextState({ step: 'methods', leaving: 'google' }, { type: 'left-failed' })).toEqual({
      step: 'methods',
      problem: 'request-failed',
    });
  });

  it('walks the device code: wrong, spent, approved, denied', () => {
    let state: AuthState = { step: 'device' };
    state = nextState(state, { type: 'device-refused', problem: 'code-wrong' });
    expect(stateId(state, GOOGLE, 'device')).toBe('device.code-wrong');
    state = nextState(state, { type: 'device-refused', problem: 'spent' });
    expect(stateId(state, GOOGLE, 'device')).toBe('device.spent');
    expect(nextState(state, { type: 'approved', email: 'a@b.c' })).toEqual({
      step: 'approved',
      email: 'a@b.c',
    });
    expect(nextState(state, { type: 'denied' })).toEqual({ step: 'denied' });
  });
});

describe('the refusals: which sentence a refused exchange says', () => {
  it('reads the email OTP codes and their messages, so an expired code is its own state', () => {
    expect(codeProblemOf('INVALID_OTP', 'Invalid OTP')).toBe('code-wrong');
    expect(codeProblemOf('OTP_EXPIRED', 'OTP expired')).toBe('code-expired');
    expect(codeProblemOf(undefined, 'OTP expired')).toBe('code-expired');
    expect(codeProblemOf('TOO_MANY_ATTEMPTS', 'Too many attempts')).toBe('code-spent');
    expect(codeProblemOf(undefined, 'Too many attempts')).toBe('code-spent');
  });

  it('reads an address the library refused, its limit and anything else', () => {
    expect(addressProblemOf(new AuthRefusal(400, 'VALIDATION_ERROR', 'Invalid email'))).toBe(
      'address-invalid',
    );
    expect(addressProblemOf(new AuthRefusal(429, '', 'Too many requests'))).toBe('address-quota');
    expect(addressProblemOf(new Error('offline'))).toBe('request-failed');
  });
});

describe('Send Another: three mails per address per 10 minutes, 45 s apart', () => {
  it('counts the mails in the window', () => {
    const t = 1_000_000_000;
    expect(canSend([], t)).toBe(true);
    expect(canSend([t - 1000, t - 2000], t)).toBe(true);
    expect(canSend([t - 1000, t - 2000, t - 3000], t)).toBe(false);
    expect(canSend([t - 11 * 60_000, t - 2000, t - 3000], t)).toBe(true);
  });

  it('waits 45 s after a mail and prints the wait as m:ss', () => {
    expect(resendWait(null, 0)).toBe(0);
    expect(resendWait(1000, 1000)).toBe(45_000);
    expect(resendWait(1000, 47_000)).toBe(0);
    expect(clock(45_000)).toBe('0:45');
    expect(clock(4_100)).toBe('0:05');
    expect(clock(61_000)).toBe('1:01');
  });
});

describe('the device code', () => {
  it('keeps letters and digits in upper case, eight at most, in two groups of four', () => {
    expect(cleanDeviceCode('wdjb-mjht')).toBe('WDJBMJHT');
    expect(cleanDeviceCode('WDJBMJHTX')).toBe('WDJBMJHT');
    expect(deviceGroups('wdjb mjht')).toEqual(['WDJB', 'MJHT']);
  });
});

describe('the words (docs/POLISH-2.md 4.5)', () => {
  const sentences: string[] = [
    AUTH_WORDS.lede,
    AUTH_WORDS.foot,
    AUTH_WORDS.none,
    AUTH_WORDS.sent.lede('ada@example.com'),
    ...Object.values(AUTH_WORDS.code),
    ...Object.values(AUTH_WORDS.address),
    ...Object.values(AUTH_WORDS.error.reasons),
    AUTH_WORDS.device.first,
    AUTH_WORDS.device.lede,
    AUTH_WORDS.device.foot,
    ...Object.values(AUTH_WORDS.device.problems),
    AUTH_WORDS.device.approved('ada@example.com'),
    AUTH_WORDS.device.denied,
    AUTH_WORDS.link.doc,
  ];
  const buttons: string[] = [
    AUTH_WORDS.continue,
    AUTH_WORDS.sent.verify,
    AUTH_WORDS.sent.another,
    AUTH_WORDS.sent.resend,
    AUTH_WORDS.error.tryAgain,
    AUTH_WORDS.device.approve,
    AUTH_WORDS.device.deny,
    AUTH_WORDS.link.label,
  ];
  const headings: string[] = [
    AUTH_WORDS.heading,
    AUTH_WORDS.windowTitle,
    AUTH_WORDS.sent.heading,
    AUTH_WORDS.error.heading,
    AUTH_WORDS.device.heading,
    AUTH_WORDS.device.approvedHeading,
    AUTH_WORDS.device.deniedHeading,
  ];

  it('ends every sentence with a period and uses no dash for a pause', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).toMatch(/^[A-Z].*\.$/);
      expect(sentence, sentence).not.toMatch(/[–—]/);
    }
  });

  it('writes buttons in Title Case and headings in sentence case with no period', () => {
    for (const label of buttons)
      for (const word of label.split(' ')) expect(word[0], label).toBe(word[0]?.toUpperCase());
    for (const heading of headings) {
      expect(heading, heading).not.toMatch(/\.$/);
      const rest = heading.split(' ').slice(1);
      for (const word of rest)
        if (word !== 'Turboslide') expect(word, heading).toBe(word.toLowerCase());
    }
  });

  it('keeps the provider label and names no other slides product', () => {
    expect(AUTH_WORDS.google).toBe('Continue with Google');
    const all = JSON.stringify(AUTH_WORDS);
    expect(all).not.toMatch(/Google (Slides|Docs|Drive)/);
    expect(all).not.toMatch(/Google's/);
  });
});
