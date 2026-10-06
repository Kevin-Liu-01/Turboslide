import { Suspense, lazy, useState } from 'react';

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { tipProps } from '@turboslide/chrome/Tooltip';

import { useMountEffect } from '../useMountEffect';
import { SIGN_IN_WORDS } from './sign-in-words';

/* the dialog loads on the first click (sign-in-dialog.tsx), so the pages' first paint carries
   neither the chrome's Dialog nor the strings module */
const PageSignInDialog = lazy(() =>
  import('./sign-in-dialog').then((module) => ({ default: module.PageSignInDialog })),
);

/**
 * Sign In on the pages outside the editor (docs/NEXT.md 4.1.2, B's graft: "Sign In" as text in
 * the /home navigation and the /decks bar for an anonymous visitor). The editor's Sign in dialog
 * (`packages/chrome/src/dialogs/SignIn.tsx`) reads the editor shell's context and cannot mount on
 * a page, so this module draws the same methods in the same words (`ACCOUNT.signInDialog`) over
 * the same better-auth routes the editor posts to (`EditorRoot.tsx` `authPost`): Continue with
 * Google and with GitHub when the deployment has their clients, and the email field with its six
 * digit code when it has a mail sender. A deployment with no method draws no Sign In, so the page
 * never offers a control that cannot complete (the rule of docs/NEXT.md 3.2 H4). Sign In opens
 * the one Sign in dialog the editor draws (the design round, DR-D5#2b: one dialog component on
 * every surface), also where the one method is one provider, so /home, /decks and the editor
 * answer Sign In the same way. A signed in visitor sees no Sign In.
 */
export type SignInFacts = {
  google: boolean;
  github: boolean;
  email: boolean;
  /** the request carries a live account session */
  signedIn: boolean;
};

export const NO_SIGN_IN: SignInFacts = {
  google: false,
  github: false,
  email: false,
  signedIn: false,
};

export { SIGN_IN_WORDS } from './sign-in-words';

/** Whether the deployment offers any method a visitor can complete. */
export function offersSignIn(facts: SignInFacts): boolean {
  return facts.google || facts.github || facts.email;
}

/**
 * The deployment's methods and whether the request is signed in, read from the identity runtime
 * (`server/auth/identity.ts`); no store is read. The runtime's import is inside the handler, the
 * way server/decks.ts imports it, so the page's chunk carries none of it.
 */
export const readSignInFacts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SignInFacts> => {
    try {
      const { accountSession, identityRuntime, sessionCacheKey } =
        await import('../../server/auth/identity');
      const runtime = identityRuntime();
      if (runtime.auth === null) return NO_SIGN_IN;
      const request = getRequest();
      const signedIn =
        sessionCacheKey(request) !== null && (await accountSession(runtime, request)) !== null;
      return {
        google: runtime.methods.google,
        github: runtime.methods.github,
        email: runtime.methods.email,
        signedIn,
      };
    } catch {
      return NO_SIGN_IN;
    }
  },
);

/**
 * The Sign In text button. With `facts` (the /decks loader read them) it draws at first paint;
 * without them (/home is prerendered) it asks the server once after hydration and appears then.
 * The slot is the caller's: on /home it sits where its arrival moves nothing (home.css).
 */
export function SignInButton({
  facts: given,
  className,
  control,
}: {
  facts?: SignInFacts;
  className?: string;
  control: string;
}) {
  const [facts, setFacts] = useState<SignInFacts | null>(given ?? null);
  const [open, setOpen] = useState(false);
  useMountEffect(() => {
    if (given !== undefined) return undefined;
    let live = true;
    readSignInFacts()
      .then((answer) => {
        if (live) setFacts(answer);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  });
  if (facts === null || facts.signedIn || !offersSignIn(facts)) return null;
  const onClick = () => setOpen(true);
  return (
    <>
      <button
        type="button"
        className={className ?? 'pt-ib ts-page-sign-in'}
        data-control={control}
        onClick={onClick}
        {...tipProps({ name: SIGN_IN_WORDS.button, doc: SIGN_IN_WORDS.buttonDoc })}
      >
        <span className="pt-lb">{SIGN_IN_WORDS.button}</span>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <PageSignInDialog facts={facts} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
