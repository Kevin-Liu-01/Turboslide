import { SignInView } from '@turboslide/chrome/dialogs/SignIn';
import type { SignInMethods } from '@turboslide/chrome/dialogs/SignIn';

import type { SignInFacts } from './sign-in';
import { SIGN_IN_WORDS } from './sign-in-words';
import { authPost, returnAddress, socialSignIn } from './sign-in-auth';

/**
 * The pages' Sign in dialog (sign-in.tsx): loaded on the first click of Sign In, so /home's and
 * /decks' first paint carry neither the chrome's Dialog nor the strings module. It is the editor's
 * one Sign in dialog (`SignInView`, packages/chrome/src/dialogs/SignIn.tsx; the design round,
 * DR-D5#2) over the page's exchanges: the better-auth routes the editor posts to, with this page as
 * the address the provider and the mail link return to, and a reload once the code signs in. The
 * controls keep the pages' ids (`page.signIn.*`).
 */
export function PageSignInDialog({
  facts,
  onClose,
}: {
  facts: SignInFacts;
  onClose: () => void;
}) {
  const methods: SignInMethods = {
    available: true,
    ...(facts.email
      ? {
          requestCode: (email: string) =>
            authPost('sign-in/magic-link', { email, callbackURL: returnAddress() }),
          verifyCode: (email: string, otp: string) => authPost('sign-in/email-otp', { email, otp }),
        }
      : {}),
    ...(facts.google ? { google: () => socialSignIn('google') } : {}),
    ...(facts.github ? { github: () => socialSignIn('github') } : {}),
  };
  return (
    <SignInView
      methods={methods}
      onClose={onClose}
      onSignedIn={() => window.location.reload()}
      control="page.signIn"
      lead={SIGN_IN_WORDS.lead}
    />
  );
}
