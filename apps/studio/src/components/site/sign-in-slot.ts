import { signInHref } from '@turboslide/chrome/auth/auth-model';
import { attachTip } from '@turboslide/chrome/tip';

import { SIGN_IN_WORDS, fetchSignInFacts, offersSignIn } from '../home/sign-in-facts';

/**
 * The site bar's Sign In (SiteBar.tsx draws the slot; docs/SITE.md A.1): a plain link to the sign
 * in page with this page as its return path, `/signin?next=<page>`, added once the deployment
 * answers that it offers a method and the visitor is not signed in. The slot holds its width from
 * the first paint (site.css), so the link's arrival moves nothing. The bar calls this on mount; on
 * /home's static load the page's script does (home-entry.ts).
 */
export function attachSignInSlot(slot: HTMLElement): () => void {
  let live = true;
  let stopTip: (() => void) | null = null;
  void fetchSignInFacts().then((facts) => {
    if (!live || facts.signedIn || !offersSignIn(facts)) return;
    const link = document.createElement('a');
    link.href = signInHref(`${window.location.pathname}${window.location.search}`);
    link.className = 'site-btn site-btn-quiet site-btn-sm';
    link.dataset.control = 'site.nav.signIn';
    const word = document.createElement('span');
    word.className = 'pt-lb';
    word.textContent = SIGN_IN_WORDS.button;
    link.append(word);
    stopTip = attachTip(link, { name: SIGN_IN_WORDS.button, doc: SIGN_IN_WORDS.buttonDoc });
    slot.replaceChildren(link);
  });
  return () => {
    live = false;
    stopTip?.();
  };
}
