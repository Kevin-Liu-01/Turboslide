import { createFileRoute } from '@tanstack/react-router';

import { refuse } from '@turboslide/agent/http/errors';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { BUNDLE_MAX_BYTES } from '@turboslide/store/bundle';

import {
  authorize,
  contextForIdentity,
  denialBody,
  identityLabel,
  requestContext,
} from '../../server/authorize';
import type { AuthContext } from '../../server/authorize';
import {
  ANY_SUBJECT,
  UPLOAD_PURPOSE,
  bundleRouteAdmission,
  fetchBundleFromUrl,
  importDeckBundle,
} from '../../server/bundle-core';
import { assertFlag } from '../../server/flags';
import { RateLimitedError, checkQuota, rateLimitedResponse, tierOf } from '../../server/ratelimit';
import { ensureDecks } from '../../server/root';

// POST /api/decks/bundle (docs/deck-transfer.md): uploads a deck bundle and creates the deck it
// holds on this studio, or replaces one. The body is the zip itself (`application/zip` or
// `application/octet-stream`), a multipart form with the zip as its first file part (the /decks
// page's form), or `{ "url": "<stored copy>" }` as JSON, in which case the studio fetches the zip
// from the deck store's Blob host (the way past a function's 4.5 MB request body cap). `?as=<id>`
// names the deck id to write under and `?replace=1` removes the deck that holds it first; without
// it a taken id gets a free sibling (`<id>-2`). The bundle is validated with validateDeck, every
// digest is checked and every asset is scanned for its image type before a byte is written
// (@turboslide/store/unpack); bodies are capped at 200 MB. The answer is the unpack result with
// `editUrl`, 201 for a new deck and 200 for a replaced one, or the one error body of the agent
// surface (400 for a refused bundle, 413 over the cap, 401 without the bearer).
//
// Authentication (SPEC 11): the bearer token when TURBOSLIDE_TOKEN is set, or the short-lived
// ticket the studio's own page gets from the bundleUploadTicket server function (`?t=`), so the
// browser never holds the token; open in a checkout, like the export route.

const MULTIPART_FIELDS = ['file', 'bundle'];

function badRequest(message: string): Response {
  return refuse(400, 'invalid_input', message);
}

function tooLarge(bytes: number): Response {
  return refuse(
    413,
    'payload_too_large',
    `the bundle is ${bytes} bytes; a bundle is at most ${BUNDLE_MAX_BYTES} bytes, and a function accepts a 4.5 MB body: store the zip on the deck store's Blob host and post { "url" } instead`,
  );
}

type Options = { as?: string; replace: boolean };

function optionsOf(url: URL, body: Record<string, unknown> = {}): Options | Response {
  const as = url.searchParams.get('as') ?? (typeof body.as === 'string' ? body.as : undefined);
  if (as !== undefined && !SLUG_PATTERN.test(as)) return badRequest('as must be a slug');
  const replaceParam = url.searchParams.get('replace');
  const replace =
    replaceParam !== null ? replaceParam === '1' || replaceParam === 'true' : body.replace === true;
  return { ...(as !== undefined ? { as } : {}), replace };
}

/** The zip bytes of the request: from JSON `{ url }`, a multipart file part, or the raw body. */
async function bundleBytes(
  request: Request,
): Promise<{ zip: Uint8Array; body: Record<string, unknown> } | Response> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (type.includes('application/json')) {
    const text = await request.text();
    if (text.length > 64 * 1024) return badRequest('a JSON body names a url and is small');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return badRequest('body is not JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return badRequest('body wants one JSON object');
    const body = parsed as Record<string, unknown>;
    if (typeof body.url !== 'string')
      return badRequest('a JSON body names the bundle as { "url": "<stored copy>" }');
    try {
      return { zip: await fetchBundleFromUrl(body.url), body };
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : String(error));
    }
  }
  if (type.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      return badRequest(
        `the multipart body could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let file: File | null = null;
    for (const field of MULTIPART_FIELDS) {
      const value = form.get(field);
      if (value instanceof File) {
        file = value;
        break;
      }
    }
    if (file === null) {
      for (const value of form.values()) {
        if (value instanceof File) {
          file = value;
          break;
        }
      }
    }
    if (file === null) return badRequest('the multipart body carries no file part');
    if (file.size > BUNDLE_MAX_BYTES) return tooLarge(file.size);
    const body: Record<string, unknown> = {};
    const as = form.get('as');
    if (typeof as === 'string' && as !== '') body.as = as;
    const replace = form.get('replace');
    if (typeof replace === 'string')
      body.replace = replace === '1' || replace === 'true' || replace === 'on';
    return { zip: new Uint8Array(await file.arrayBuffer()), body };
  }
  const zip = new Uint8Array(await request.arrayBuffer());
  if (zip.byteLength > BUNDLE_MAX_BYTES) return tooLarge(zip.byteLength);
  return { zip, body: {} };
}

export const Route = createFileRoute('/api/decks/bundle')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admission = bundleRouteAdmission(request, UPLOAD_PURPOSE, ANY_SUBJECT);
        if (admission instanceof Response) return admission;
        // the identity behind the request (gslides-parity SPEC-3 8.2: a ticket carries the identity
        // it was minted for and is checked against `write` on the target): the ticket's, the
        // bearer's admin, or a checkout's open localhost holder
        const ctx: AuthContext =
          admission.kind === 'ticket'
            ? contextForIdentity(admission.identity)
            : await requestContext(request);
        const identity = identityLabel(ctx) ?? 'anonymous';
        try {
          await assertFlag('readOnly', { identity, action: 'deck.unpack' });
        } catch (error) {
          return Response.json(
            { error: 'unavailable', message: error instanceof Error ? error.message : 'read only' },
            { status: 503, headers: { 'retry-after': '60' } },
          );
        }
        const length = Number(request.headers.get('content-length') ?? 0);
        if (length > BUNDLE_MAX_BYTES) return tooLarge(length);
        if (admission.kind !== 'ticket') {
          // the ticket paid the bundles per day quota when it was minted; the others pay here
          const refused = await checkQuota('bundlesPerDay', {
            identity,
            tier: tierOf(ctx),
            action: 'deck.unpack',
            transport: 'route',
          });
          if (refused instanceof RateLimitedError) return rateLimitedResponse(refused);
        }
        const read = await bundleBytes(request);
        if (read instanceof Response) return read;
        if (read.zip.byteLength === 0) return badRequest('the body is empty; post the bundle zip');
        const bytesRefused = await checkQuota(
          'bundleBytesPerDay',
          { identity, tier: tierOf(ctx), action: 'deck.unpack', transport: 'route' },
          read.zip.byteLength,
        );
        if (bytesRefused instanceof RateLimitedError) return rateLimitedResponse(bytesRefused);
        const url = new URL(request.url);
        const options = optionsOf(url, read.body);
        if (options instanceof Response) return options;
        // replacing a deck that exists needs `write` on it for the identity behind the ticket
        if (
          options.as !== undefined &&
          options.replace &&
          (await (await ensureDecks()).has(options.as))
        ) {
          const decision = await authorize(ctx, options.as, 'write', {
            action: 'deck.unpack',
            transport: 'route',
          });
          if (!decision.ok)
            return Response.json(denialBody(decision, 'write'), { status: decision.status });
        }
        try {
          const result = await importDeckBundle(read.zip, options);
          return Response.json(result, {
            status: result.replaced ? 200 : 201,
            headers: { location: result.editUrl, 'cache-control': 'no-store' },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof TypeError) return badRequest(message);
          if (error instanceof RangeError) return refuse(404, 'unknown_deck', message);
          return Response.json({ error: { name: 'Error', message, status: 500 } }, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        const admission = bundleRouteAdmission(request, UPLOAD_PURPOSE, ANY_SUBJECT);
        if (admission instanceof Response) return admission;
        return refuse(
          405,
          'method_not_allowed',
          'POST a bundle zip here (or { "url" } as JSON); GET /api/decks/<id>/bundle downloads one',
        );
      },
    },
  },
});
