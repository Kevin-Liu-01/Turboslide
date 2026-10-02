import { describe, expect, it } from 'vitest';

import { NO_SIGN_IN, SIGN_IN_WORDS, offersSignIn, soleProvider } from './sign-in';

// Sign In on the pages outside the editor (sign-in.tsx; docs/NEXT.md 4.1.2): drawn only where the
// deployment offers a method, straight to the provider when it is the one method.

describe('the page Sign In', () => {
  it('offers nothing without a method', () => {
    expect(offersSignIn(NO_SIGN_IN)).toBe(false);
    expect(soleProvider(NO_SIGN_IN)).toBeNull();
  });

  it('goes to the one provider at once', () => {
    expect(soleProvider({ ...NO_SIGN_IN, google: true })).toBe('google');
    expect(soleProvider({ ...NO_SIGN_IN, github: true })).toBe('github');
  });

  it('opens the dialog for the email method or two providers', () => {
    expect(soleProvider({ ...NO_SIGN_IN, google: true, email: true })).toBeNull();
    expect(soleProvider({ ...NO_SIGN_IN, google: true, github: true })).toBeNull();
    expect(offersSignIn({ ...NO_SIGN_IN, email: true })).toBe(true);
  });

  it('labels the button in Title Case and ends its sentences with periods', () => {
    expect(SIGN_IN_WORDS.button).toBe('Sign In');
    for (const sentence of [SIGN_IN_WORDS.buttonDoc, SIGN_IN_WORDS.lead, SIGN_IN_WORDS.noDatabase])
      expect(sentence).toMatch(/^[A-Z].*\.$/);
  });
});
