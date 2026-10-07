import { AuthRefusal, errorCallbackURL, safeNext } from '@turboslide/chrome/auth/auth-model';
import type { AuthMethods } from '@turboslide/chrome/auth/auth-model';
import type { AuthActions } from '@turboslide/chrome/auth/AuthPlate';

import type { SignInFacts } from './sign-in';

/**
 * The better-auth exchanges of the pages' sign in (/signin and /device, docs/POLISH-2.md 4.3; the
 * pages' Sign In dialog until P2-A#4): the same routes the editor posts to (`EditorRoot.tsx`
 * `authPost`), same origin, JSON, the library's own cookies. Every social and magic link call
 * names where the provider and the mail link return on success (`callbackURL`, the page's return
 * path) and on failure (`errorCallbackURL`, /signin with the same return path), so Cancel at
 * Google and a used link come home to a sentence instead of the library's error route
 * (docs/POLISH-2.md C14). A refusal throws the library's code with its status, so the plate says
 * which sentence. No dependency, so the page's module stays small.
 */
export async function authPost(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    let code = '';
    let message = `Sign in did not complete (${response.status}).`;
    try {
      const data = (await response.json()) as {
        code?: string;
        message?: string;
        error?: { message?: string } | string;
      };
      code = data.code ?? '';
      message =
        data.message ??
        (typeof data.error === 'string' ? data.error : data.error?.message) ??
        message;
    } catch {
      // no body
    }
    throw new AuthRefusal(response.status, code, message);
  }
  return response.json().catch(() => null);
}

/** The page's own address: the return path when a page signs in where it stands. */
export function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** An absolute address on this origin for a same origin path. */
function absolute(path: string): string {
  return `${window.location.origin}${path}`;
}

/** The two addresses every social and magic link call names (docs/POLISH-2.md C14). */
export function returnAddresses(next: string): { callbackURL: string; errorCallbackURL: string } {
  const path = safeNext(next);
  return { callbackURL: absolute(path), errorCallbackURL: absolute(errorCallbackURL(path)) };
}

/** Leaves for a provider: the library answers its address and the browser goes there. */
export async function socialSignIn(
  provider: 'google' | 'github',
  next: string = currentPath(),
): Promise<void> {
  const answer = await authPost('sign-in/social', { provider, ...returnAddresses(next) });
  const url = (answer as { url?: string } | null)?.url;
  if (typeof url !== 'string') throw new AuthRefusal(0, '', 'Sign in did not complete.');
  window.location.assign(url);
}

/** Asks for the mail with the link and the six digit code; the link returns to `next`. */
export function requestSignInCode(email: string, next: string = currentPath()): Promise<unknown> {
  return authPost('sign-in/magic-link', { email, ...returnAddresses(next) });
}

/** The six digit code's exchange; it resolves once the session cookie is set. */
export function verifySignInCode(email: string, otp: string): Promise<unknown> {
  return authPost('sign-in/email-otp', { email, otp });
}

/** The deployment's methods as the plate reads them, from the facts the server read. */
export function methodsOf(facts: SignInFacts): AuthMethods {
  return {
    available: facts.google || facts.github || facts.email,
    google: facts.google,
    github: facts.github,
    email: facts.email,
  };
}

/** The page host's exchanges for a return path: the better-auth routes with both addresses. */
export function pageActions(methods: AuthMethods, next: string): AuthActions {
  return {
    ...(methods.google || methods.github
      ? { social: (provider: 'google' | 'github') => socialSignIn(provider, next) }
      : {}),
    ...(methods.email
      ? {
          requestCode: (email: string) => requestSignInCode(email, next),
          verifyCode: (email: string, otp: string) => verifySignInCode(email, otp),
        }
      : {}),
  };
}

/** The address passed to the old name, kept for the pages' dialog until P2-A#4. */
export function returnAddress(): string {
  return absolute(currentPath());
}
