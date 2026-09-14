import { REFUSALS } from '@turboslide/chrome/menus/strings';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { authorize, requestContext } from './authorize';

/**
 * The published player's gate (gslides-parity SPEC-3 6.4; VERIFICATION-3 finding 48 and hotfix B
 * request R1). `/deck/<id>?p=<token>` and `/embed/<id>?p=<token>` are page routes, and a page
 * route's loader can answer 200, 404 or 500 alone (the router maps a thrown error to 500 and
 * `notFound()` to 404), so the 410 the specification pins after `deck.unpublish` is answered
 * here, by the route's server GET handler before the document renders: the token is checked with
 * `authorize(read)` on the request's own identity, a revoked token is the 410 page with the
 * sentence "This presentation is no longer published" and the player's `noindex`, and every
 * other outcome defers to the loader (`next()`), where `getDeck` reads the token again and shapes
 * the payload by role. Server only: imported by the route files inside their `server` block,
 * which the client build strips.
 */

/** The published token's grammar, the one `getDeck` validates (`publishToken`). */
export const PUBLISH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** The headers every answer reached through the token carries (SPEC-3 6.4). */
export const PUBLISHED_HEADERS: Readonly<Record<string, string>> = {
  'x-robots-tag': 'noindex',
  'cache-control': 'no-store',
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The 410 page: the sentence of 6.4, no third party content, noindex. */
export function noLongerPublishedResponse(): Response {
  const sentence = REFUSALS.noLongerPublished;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(sentence)}</title></head><body style="font-family: Inter, system-ui, sans-serif; margin: 0; padding: 48px 24px; color: #070707; background: #ffffff;"><main class="ts-access-page" style="max-width: 520px; margin: 0 auto;"><h1 style="font-size: 20px; font-weight: 500; margin: 0 0 12px;">${escapeHtml(sentence)}</h1><p style="margin: 0;"><a href="/decks">Your presentations</a></p></main></body></html>`;
  return new Response(html, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8', ...PUBLISHED_HEADERS },
  });
}

/**
 * The route's GET gate: the 410 page for a revoked publish token on the address, or null when
 * the document request may go on to the loader (no token, a token that opens the deck, any other
 * denial, which shadow mode admits and enforce mode turns into the loader's 404).
 */
export async function publishedPlayerGate(
  request: Request,
  deckId: string,
): Promise<Response | null> {
  const token = new URL(request.url).searchParams.get('p');
  if (token === null || !PUBLISH_TOKEN_PATTERN.test(token) || !SLUG_PATTERN.test(deckId))
    return null;
  const ctx = await requestContext(request);
  ctx.publishToken = token;
  const decision = await authorize(ctx, deckId, 'read', {
    transport: 'route',
    action: 'deck.view',
  });
  if (!decision.ok && decision.status === 410) return noLongerPublishedResponse();
  return null;
}
