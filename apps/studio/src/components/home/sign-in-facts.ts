import { AUTH_WORDS } from '@turboslide/chrome/auth/auth-words';

/**
 * What a page needs to draw Sign In (docs/NEXT.md 4.1.2; docs/POLISH-2.md 4.3, C13): the
 * deployment's methods and whether the request is signed in. A deployment with no method draws no
 * Sign In, so the page never offers a control that cannot complete (docs/NEXT.md 3.2 H4); a signed
 * in visitor sees none. Plain data and one fetch, with no framework, so the site bar's slot draws
 * the link on /home's static load as it does under React (site/sign-in-slot.ts); the loaders read
 * the same facts through the server function of sign-in.tsx.
 */
export type SignInFacts = {
  google: boolean;
  github: boolean;
  email: boolean;
  /** the request carries a live account session */
  signedIn: boolean;
  /** signed in, with decks this browser made before that wait for the person's answer (HR-SA#2b) */
  merge?: { email: string; decks: number } | null;
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

/** The route that answers the facts as JSON for the request (routes/api/x.sign-in.ts). */
const SIGN_IN_FACTS_PATH = '/api/x/sign-in';

/** The facts for this browser, read once from the route; none when it fails or answers oddly. */
export async function fetchSignInFacts(): Promise<SignInFacts> {
  try {
    const answer = await fetch(SIGN_IN_FACTS_PATH, { credentials: 'same-origin' });
    if (!answer.ok) return NO_SIGN_IN;
    const body: unknown = await answer.json();
    if (typeof body !== 'object' || body === null) return NO_SIGN_IN;
    const row = body as Record<string, unknown>;
    return {
      google: row.google === true,
      github: row.github === true,
      email: row.email === true,
      signedIn: row.signedIn === true,
    };
  } catch {
    return NO_SIGN_IN;
  }
}
