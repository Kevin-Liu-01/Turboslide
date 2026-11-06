import { NO_SIGN_IN } from '../../components/home/sign-in-facts';
import type { SignInFacts } from '../../components/home/sign-in-facts';
import { accountSession, identityRuntime, mergeQuestion, sessionCacheKey } from './identity';

/**
 * The deployment's methods and whether the request is signed in, read from the identity runtime;
 * no store is read. The one reading behind the loaders' server function (`readSignInFacts`,
 * components/home/sign-in.tsx) and the page's JSON route (routes/api/x.sign-in.ts).
 */
export async function signInFactsOf(request: Request): Promise<SignInFacts> {
  try {
    const runtime = identityRuntime();
    if (runtime.auth === null) return NO_SIGN_IN;
    const signedIn =
      sessionCacheKey(request) !== null && (await accountSession(runtime, request)) !== null;
    const question = signedIn ? await mergeQuestion(runtime, request) : null;
    return {
      google: runtime.methods.google,
      github: runtime.methods.github,
      email: runtime.methods.email,
      signedIn,
      merge: question === null ? null : { email: question.email, decks: question.decks },
    };
  } catch {
    return NO_SIGN_IN;
  }
}
