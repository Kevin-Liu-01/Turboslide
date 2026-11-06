import { createServerFn } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';

import { signInHref } from '@turboslide/chrome/auth/auth-model';
import { tipProps } from '@turboslide/chrome/Tooltip';

import { SIGN_IN_WORDS, offersSignIn } from './sign-in-facts';
import type { SignInFacts } from './sign-in-facts';

/**
 * The deployment's methods and whether the request is signed in, for a loader
 * (server/auth/sign-in-facts.ts reads them). The reading's import is inside the handler, the way
 * server/decks.ts imports the runtime, so the page's chunk carries none of it.
 */
export const readSignInFacts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SignInFacts> => {
    const { signInFactsOf } = await import('../../server/auth/sign-in-facts');
    return signInFactsOf(getRequest());
  },
);

/**
 * The answer to the merge question on /signin (HR-SA#2b): Add Them links this browser's anonymous
 * id to the account; Keep Them Separate sets the cookie that keeps the browser from being asked
 * again. A server function, so the request middleware's CSRF check covers it.
 */
export const answerSignInMerge = createServerFn({ method: 'POST' })
  .validator((input: { add: boolean }): { add: boolean } => ({ add: input.add === true }))
  .handler(async ({ data }): Promise<{ linked: boolean }> => {
    const { answerMerge, identityRuntime } = await import('../../server/auth/identity');
    const answer = await answerMerge(identityRuntime(), getRequest(), data.add);
    if (answer?.setCookie !== undefined) setResponseHeader('set-cookie', answer.setCookie);
    return { linked: answer?.linked ?? false };
  });

/**
 * Sign In on the pages outside the editor (docs/NEXT.md 4.1.2; docs/POLISH-2.md 4.3, C13): a plain
 * link to the sign in page with the page to return to, `/signin?next=<page>`, here on /decks' bar,
 * whose loader read the facts, so it draws at first paint; the site bar draws the same link
 * through site/sign-in-slot.ts. The link is a document navigation, so /signin renders on the
 * server with the deployment's methods and the session read once, and the pages carry no dialog
 * code at all (the lazy dialog chunk of the design round left with P2-A#4). A deployment with no
 * method draws no Sign In, so the page never offers a control that cannot complete (docs/NEXT.md
 * 3.2 H4); a signed in visitor sees none. The editor's Sign In opens the plate's window instead, so
 * an unsaved draft and the live session stay (packages/chrome/src/dialogs/SignIn.tsx).
 */
export function SignInButton({
  facts,
  className,
  control,
  next,
}: {
  facts: SignInFacts;
  className?: string;
  control: string;
  /** the page to return to; this page's path when absent (read in the browser) */
  next?: string;
}) {
  if (facts.signedIn || !offersSignIn(facts)) return null;
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
