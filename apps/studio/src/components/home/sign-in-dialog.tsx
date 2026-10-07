import { SignInView } from '@turboslide/chrome/dialogs/SignIn';
import type { SignInMethods } from '@turboslide/chrome/dialogs/SignIn';

import type { SignInFacts } from './sign-in';
import { SIGN_IN_WORDS } from './sign-in-words';
import { requestSignInCode, socialSignIn, verifySignInCode } from './sign-in-auth';

/**
 * The pages' Sign in dialog (sign-in.tsx): loaded on the first click of Sign In, so /home's and
 * /decks' first paint carry neither the chrome's Dialog nor the strings module. It is the editor's
 * one Sign in dialog (`SignInView`, packages/chrome/src/dialogs/SignIn.tsx; the design round,
 * DR-D5#2) over the page's exchanges: the better-auth routes the editor posts to, with this page as
 * the address the provider and the mail link return to, and a reload once the code signs in. The
 * controls keep the pages' ids (`page.signIn.*`).
 */
export function PageSignInDialog({ facts, onClose }: { facts: SignInFacts; onClose: () => void }) {
  const methods: SignInMethods = {
    available: true,
    ...(facts.email
      ? {
          /* the mail's link returns to this page, and to /signin with this page as its return
             path when the link is used or expired (errorCallbackURL, docs/POLISH-2.md C14) */
          requestCode: (email: string) => requestSignInCode(email),
          verifyCode: (email: string, otp: string) => verifySignInCode(email, otp),
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
