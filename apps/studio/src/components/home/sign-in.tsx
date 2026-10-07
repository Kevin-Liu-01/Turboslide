import { useState } from 'react';

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { signInHref } from '@turboslide/chrome/auth/auth-model';
import { AUTH_WORDS } from '@turboslide/chrome/auth/auth-words';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { useMountEffect } from '../useMountEffect';

/**
 * Sign In on the pages outside the editor (docs/NEXT.md 4.1.2; docs/POLISH-2.md 4.3, C13): a plain
 * link to the sign in page with the page to return to, `/signin?next=<page>`, on /home's bar and
 * /decks' bar. The link is a document navigation, so /signin renders on the server with the
 * deployment's methods and the session read once, and the pages carry no dialog code at all (the
 * lazy dialog chunk of the design round left with P2-A#4). A deployment with no method draws no
 * Sign In, so the page never offers a control that cannot complete (docs/NEXT.md 3.2 H4); a signed
 * in visitor sees none. The editor's Sign In opens the plate's window instead, so an unsaved
 * draft and the live session stay (packages/chrome/src/dialogs/SignIn.tsx).
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

/** The link's words, from the plate's (Title Case on the button, DECK-GRAMMAR 22). */
export const SIGN_IN_WORDS = {
  button: AUTH_WORDS.link.label,
  buttonDoc: AUTH_WORDS.link.doc,
  lead: AUTH_WORDS.lede,
  noDatabase: AUTH_WORDS.none,
} as const;

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
 * The Sign In link. With `facts` (the /decks loader read them) it draws at first paint; without
 * them (/home is prerendered) it asks the server once after hydration and appears then, with this
 * page as its return path. The slot is the caller's: on /home it sits where its arrival moves
 * nothing (home.css).
 */
export function SignInButton({
  facts: given,
  className,
  control,
  next,
}: {
  facts?: SignInFacts;
  className?: string;
  control: string;
  /** the page to return to; this page's path when absent (read in the browser) */
  next?: string;
}) {
  const [facts, setFacts] = useState<SignInFacts | null>(given ?? null);
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
  const back = next ?? `${window.location.pathname}${window.location.search}`;
  return (
    <a
      href={signInHref(back)}
      className={className ?? 'pt-ib ts-page-sign-in'}
      data-control={control}
      {...tipProps({ name: SIGN_IN_WORDS.button, doc: SIGN_IN_WORDS.buttonDoc })}
    >
      <span className="pt-lb">{SIGN_IN_WORDS.button}</span>
    </a>
  );
}
