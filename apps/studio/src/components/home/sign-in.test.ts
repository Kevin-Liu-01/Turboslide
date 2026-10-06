import { describe, expect, it } from 'vitest';

import { NO_SIGN_IN, SIGN_IN_WORDS, offersSignIn } from './sign-in';

// Sign In on the pages outside the editor (sign-in.tsx; docs/NEXT.md 4.1.2): drawn only where the
// deployment offers a method; it opens the one Sign in dialog (the design round, DR-D5#2b).

describe('the page Sign In', () => {
  it('offers nothing without a method, and something with any one', () => {
    expect(offersSignIn(NO_SIGN_IN)).toBe(false);
    expect(offersSignIn({ ...NO_SIGN_IN, google: true })).toBe(true);
    expect(offersSignIn({ ...NO_SIGN_IN, github: true })).toBe(true);
    expect(offersSignIn({ ...NO_SIGN_IN, email: true })).toBe(true);
  });

  it('labels the button in Title Case and ends its sentences with periods', () => {
    expect(SIGN_IN_WORDS.button).toBe('Sign In');
    for (const sentence of [SIGN_IN_WORDS.buttonDoc, SIGN_IN_WORDS.lead, SIGN_IN_WORDS.noDatabase])
      expect(sentence).toMatch(/^[A-Z].*\.$/);
  });
});
