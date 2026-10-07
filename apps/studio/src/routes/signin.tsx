import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';

import { AuthPage } from '@turboslide/chrome/auth/AuthPage';
import { errorState, safeNext } from '@turboslide/chrome/auth/auth-model';

import { MoodFigure } from '../components/home/MoodFigure';
import { readSignInFacts } from '../components/home/sign-in';
import { methodsOf, pageActions } from '../components/home/sign-in-auth';
import { RouterLinkSlot } from './-link-slot';

/**
 * /signin (docs/POLISH-2.md 4.3, C12 to C14, C18): the auth plate's page host. Sign In on /home,
 * /decks and You need access is a plain link here with the page to return to (`next`), so the
 * page is a document navigation and renders on the server: the loader reads the deployment's
 * methods and the session once (`readSignInFacts`, the one function a view runs), a signed in
 * visitor is sent to `next`, and `error` (the code better-auth or Google sent back through
 * `errorCallbackURL`) draws its sentence with Try Again, which returns to the methods with the
 * same `next`. Never prerendered: the methods and the session belong to the deployment and the
 * request. Every social and magic link call names `/signin?next=<next>` as its error address, so
 * Cancel at Google and a used link come back here (C14).
 */
type SignInSearch = { next?: string; error?: string };

export const Route = createFileRoute('/signin')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    ...(typeof search.next === 'string' ? { next: search.next } : {}),
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
  }),
  loaderDeps: ({ search }) => ({ next: safeNext(search.next) }),
  loader: async ({ deps, location }) => {
    const facts = await readSignInFacts();
    /* a signed in visitor goes where the page was asked to return, unless the address carries
       an error to read (a failed link of a provider while signed in) */
    const error = (location.search as SignInSearch).error;
    if (facts.signedIn && error === undefined) throw redirect({ href: deps.next });
    return { facts };
  },
  /* Try Again drops `error` from the address without asking the server again */
  staleTime: Infinity,
  head: () => ({
    meta: [{ title: 'Sign in, Turboslide' }, { name: 'robots', content: 'noindex' }],
  }),
  component: SignInPage,
});

function SignInPage() {
  const { facts } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const next = safeNext(search.next);
  const methods = methodsOf(facts);
  const initial = errorState(search.error) ?? { step: 'methods' as const };
  return (
    <AuthPage
      methods={methods}
      actions={pageActions(methods, next)}
      initial={initial}
      control="page.signIn"
      linkComponent={RouterLinkSlot}
      figure={<MoodFigure size="page" control="signin.figure" />}
      /* a document navigation, so the page it lands on reads the new session on the server */
      onSignedIn={() => window.location.assign(next)}
      onTryAgain={() => {
        void navigate({ to: '/signin', search: { next }, replace: true });
      }}
    />
  );
}
