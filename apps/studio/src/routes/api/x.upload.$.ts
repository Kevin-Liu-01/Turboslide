import { createFileRoute } from '@tanstack/react-router';

import { requestContext } from '../../server/authorize';
import {
  PRESIGN_THRESHOLD_BYTES,
  UPLOAD_CONTENT_TYPES,
  issueUploadGrant,
  receiveUpload,
} from '../../server/upload';

// /api/x/upload/* (gslides-parity SPEC-3 0.25, 0.29, 8.5, 11.3): the presigned upload path behind
// a prefix the WAF can see (rule R17, 20 per minute per IP). `POST /api/x/upload/picture` with
// `{ deckId, contentType, bytes }` runs authorize(write), the uploads switch and the picture
// quotas and answers the grant (`{ key, token, url, method, expiresAt, maxBytes, contentType,
// backend }`); the page then `PUT`s the bytes to `url`. On the local backend (a checkout, the tmp
// store) that is `PUT /api/x/upload/put/<token>` here, streamed under the cap and sniffed before
// it is kept; the private store's client upload takes the same grant shape when it exists
// (docs/hosting.md). The page's CSRF headers travel with both requests (start.ts widens the
// filter to /api/x/*), and the JSON rule of server/headers.ts leaves the PUT of raw bytes alone.

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

export const Route = createFileRoute('/api/x/upload/$')({
  server: {
    handlers: {
      GET: ({ params }) => {
        if ((params._splat ?? '') !== 'picture') return json({ error: 'not_found' }, 404);
        // what the editor reads before it picks the path: the threshold and the accepted types
        return json({ threshold: PRESIGN_THRESHOLD_BYTES, contentTypes: UPLOAD_CONTENT_TYPES });
      },
      POST: async ({ params, request }) => {
        if ((params._splat ?? '') !== 'picture') return json({ error: 'not_found' }, 404);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'invalid_input', message: 'the body is not JSON' }, 400);
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body))
          return json({ error: 'invalid_input', message: 'the body wants one JSON object' }, 400);
        const { deckId, contentType, bytes } = body as Record<string, unknown>;
        if (
          typeof deckId !== 'string' ||
          typeof contentType !== 'string' ||
          typeof bytes !== 'number'
        )
          return json(
            { error: 'invalid_input', message: 'deckId, contentType and bytes are required' },
            400,
          );
        const ctx = await requestContext(request);
        const result = await issueUploadGrant(ctx, { deckId, contentType, bytes });
        if ('refused' in result) return result.refused;
        return json(result.grant, 201);
      },
      PUT: async ({ params, request }) => {
        const splat = params._splat ?? '';
        const match = /^put\/([A-Za-z0-9_.-]{20,2048})$/.exec(splat);
        if (match === null) return json({ error: 'not_found' }, 404);
        const result = await receiveUpload(match[1] ?? '', request.body);
        // `reason` is the seller's sentence (server/upload.ts UPLOAD_REASONS): the chrome shows
        // "The picture could not be uploaded: <reason>" and never the API's line or a code
        if (!result.ok)
          return json(
            { error: 'upload_refused', message: result.reason, reason: result.sellerReason },
            result.status,
          );
        return json({ key: result.key, bytes: result.bytes, sniffedType: result.sniffedType }, 201);
      },
    },
  },
});
