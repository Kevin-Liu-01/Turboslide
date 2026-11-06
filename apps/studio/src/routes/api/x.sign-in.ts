import { createFileRoute } from '@tanstack/react-router';

import { signInFactsOf } from '../../server/auth/sign-in-facts';

// GET /api/x/sign-in: the deployment's sign in methods and whether the request is signed in, as
// JSON, for the site bar's Sign In on a page the server drew without a loader, /home's static load
// among them (components/site/sign-in-slot.ts). The same reading as the loaders' server function
// (server/auth/sign-in-facts.ts), without the merge question the link never reads. Never cached.
export const Route = createFileRoute('/api/x/sign-in')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { google, github, email, signedIn } = await signInFactsOf(request);
        return Response.json(
          { google, github, email, signedIn },
          { headers: { 'cache-control': 'no-store' } },
        );
      },
    },
  },
});
