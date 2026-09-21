import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { tipProps } from '@turboslide/chrome/Tooltip';
// the chrome package's `./YouNeedAccess` export landed at merge 2 (build-4/b3.md R6, applied by
// the integrator with the one line change B3 named)
import { YouNeedAccess } from '@turboslide/chrome/YouNeedAccess';

import { useMountEffect } from '../components/useMountEffect';
import { RouterLinkSlot } from './-link-slot';

/**
 * The You need access page as the `notFoundComponent` of the deck, edit and present routes
 * (gslides-parity SPEC-3 6.5, 6.8, 9.3; VERIFICATION-3 finding 53; the round four orchestrator's
 * ruling 3). The loaders answer null for a missing and a restricted deck alike (`getDeck`,
 * `readEditorDeck`: one answer, so a stranger learns nothing), the routes throw `notFound()` and
 * the server's status is 404, and this page is the body in both cases. The request goes through
 * the share route the WAF sees (`POST /api/share/<deckId>/requestAccess`, routes/api/share.$.ts):
 * a same origin JSON post with the role, the message and the requester's email, which the route
 * answers with the one sentence whatever the deck's state. The requester is drawn as anonymous
 * because a page that has no payload has no identity either; a signed in requester's email field
 * is one field too many and nothing worse. The sign in region holds the sentence of SPEC-3 6.5
 * and a link to the files page, where the account chip's Sign in row lives (the chrome's
 * SignInDialog reads the editor shell's context and cannot mount outside an editor). A dash
 * prefixed file under routes/ is not a route (the convention of -edit-search.ts).
 *
 * The product round (docs/PRODUCT.md 3.3; audit-interface 33): the page leads with the links a
 * stranger can use and hides the request form while the deployment has no sign in provider,
 * which it learns from the access route's `authorize` field after hydration (`GET
 * /api/access/<id>` names the mode whatever the deck's state); the server's HTML keeps the form,
 * so a browser without scripts still has a way to ask.
 */
export function AccessPage({ deckId }: { deckId: string }) {
  /* the deployment's mode: undefined until read, then whether the form has someone to reach */
  const [requestForm, setRequestForm] = useState<boolean | undefined>(undefined);
  useMountEffect(() => {
    let live = true;
    fetch(`/api/access/${encodeURIComponent(deckId)}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { authorize?: string } | null;
        if (!live) return;
        setRequestForm(body?.authorize !== 'shadow');
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  });
  const onRequest = async (input: { role: string; message: string; email?: string }) => {
    const response = await fetch(`/api/share/${encodeURIComponent(deckId)}/requestAccess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        id: deckId,
        role: input.role,
        ...(input.message === '' ? {} : { message: input.message }),
        ...(input.email === undefined || input.email === '' ? {} : { email: input.email }),
      }),
    });
    // the page reads the same sentence whatever the answer (SPEC-3 6.8); a refusal is not shown
    if (!response.ok) throw new Error(`request access answered ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  return (
    <YouNeedAccess
      anonymous
      action={`/api/share/${encodeURIComponent(deckId)}/requestAccess`}
      onRequest={onRequest}
      requestForm={requestForm ?? true}
      linkComponent={RouterLinkSlot}
      signIn={
        <p className="ts-access-signin-line" data-control="access.signin.line">
          <Link
            to="/decks"
            data-control="access.signin.decks"
            {...tipProps({
              name: 'Your presentations',
              doc: 'Sign in from the account chip on your presentations, then open the link again',
            })}
          >
            Sign in from your presentations
          </Link>
          , then open this address again.
        </p>
      }
    />
  );
}
