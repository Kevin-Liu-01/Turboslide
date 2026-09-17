import { createFileRoute } from '@tanstack/react-router';

import { identityRuntime, requestIdentity } from '../server/auth/identity';
import {
  COOKIES_NEEDED,
  EXCHANGE_HEADERS,
  NOT_AVAILABLE,
  exchangeShareToken,
  fileLinkLookup,
  notNavigationSentence,
} from '../server/auth/links';
import { noteLinkGrant } from '../server/access';
import { deckDir, ensureDecks } from '../server/root';

// GET /s/:token (gslides-parity SPEC-3 0.13, 0.15, 6.4): the one time exchange of a share link.
// The token never reaches an editor or a viewer page: this route validates it, writes the link
// grant on the session's principal record, and redirects to /deck/<id> or /edit/<id> with no
// token in the address. A fetch (`Sec-Fetch-Mode: cors` or `no-cors`) is refused with 403, a
// dead or unknown token gets the same 404 page as a missing deck, and a browser without a
// cookie to hold the grant is told so. The response sets `Referrer-Policy: no-referrer` and
// `X-Robots-Tag: noindex` and carries no third party content. The link lookup is B2's access
// store index when bound (server/auth/identity.ts hooks); on a checkout it reads the access
// record file of every deck the store lists. The lookup runs with `fresh: true` so a hosted
// binding reads past its record cache (a mint or a revocation seconds old counts on every
// instance). A probe of this route is a navigation, never a Node `fetch`: undici stamps
// `sec-fetch-mode: cors` on every fetch and the rule below refuses it by design (SPEC-3 6.4);
// the 403 body names the metadata it saw. `docs/gslides-parity/build-3/b3-fix/` holds the
// hosted probe that sends the request through `node:https` and curl.

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A small server rendered page in the studio's words; the You need access component is B6's. */
function page(
  title: string,
  sentence: string,
  status: number,
  extra: Record<string, string> = {},
): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="font-family: Inter, system-ui, sans-serif; margin: 0; padding: 48px 24px; color: #070707; background: #ffffff;"><main class="ts-access-page" style="max-width: 520px; margin: 0 auto;"><h1 style="font-size: 20px; font-weight: 500; margin: 0 0 12px;">${escapeHtml(title)}</h1><p style="margin: 0 0 16px;">${escapeHtml(sentence)}</p><p style="margin: 0;"><a href="/decks">Your presentations</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...EXCHANGE_HEADERS,
      ...extra,
    },
  });
}

/**
 * The Present link of the Share dialog (docs/FOCUS.md 2.7, the row `share.copy-present-link`):
 * a viewer link minted with `?present=1` on its address lands on `/deck/<id>?present=1`, the show,
 * instead of the viewer. The flag travels only to a `/deck/` landing; a commenter or an editor
 * link lands in the editor whatever the address carried, and no other query key is forwarded.
 */
export function withPresent(location: string, request: Request): string {
  let present = false;
  try {
    present = new URL(request.url).searchParams.get('present') === '1';
  } catch {
    present = false;
  }
  if (!present || !location.startsWith('/deck/') || location.includes('?')) return location;
  return `${location}?present=1`;
}

async function serve(request: Request, token: string): Promise<Response> {
  const runtime = identityRuntime();
  const identity = await requestIdentity(request, runtime);
  const lookup =
    runtime.hooks.findShareLink !== null
      ? runtime.hooks.findShareLink
      : fileLinkLookup(async () =>
          (await (await ensureDecks()).list({ includeTrashed: true })).map((head) => ({
            deckId: head.id,
            dir: deckDir(head.id),
          })),
        );
  // the grant lands on the principal record (this instance) and on the principal's deck index
  // (the Blob store, every instance): cycle 2, VERIFICATION.md pass 2 F-share-404
  const outcome = await exchangeShareToken(token, request, {
    runtime,
    identity,
    lookup,
    noteGrant: (principalId, grant, now) => noteLinkGrant(principalId, grant, now),
  });
  const cookie: Record<string, string> =
    identity.minted?.setCookie !== undefined ? { 'set-cookie': identity.minted.setCookie } : {};
  switch (outcome.kind) {
    case 'redirect':
      return new Response(null, {
        status: 303,
        headers: {
          location: withPresent(outcome.location, request),
          ...EXCHANGE_HEADERS,
          ...cookie,
        },
      });
    case 'not_navigation':
      return new Response(
        JSON.stringify({
          error: {
            name: 'Error',
            status: 403,
            code: 'forbidden',
            message: notNavigationSentence(request),
          },
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json; charset=utf-8', ...EXCHANGE_HEADERS },
        },
      );
    case 'no_cookie':
      return page('You need access', COOKIES_NEEDED, 403, cookie);
    case 'not_found':
      return page('You need access', NOT_AVAILABLE, 404, cookie);
  }
}

export const Route = createFileRoute('/s/$token')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params.token),
    },
  },
});
