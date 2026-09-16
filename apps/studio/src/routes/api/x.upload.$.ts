import { createFileRoute } from '@tanstack/react-router';
import { MEDIA_KINDS } from '@turboslide/schema/blocks/media';

import { requestContext } from '../../server/authorize';
import {
  MEDIA_DATA_URL_THRESHOLD_BYTES,
  MEDIA_UPLOAD_CONTENT_TYPES,
  PRESIGN_THRESHOLD_BYTES,
  UPLOAD_CONTENT_TYPES,
  issueMediaUploadGrant,
  issueUploadGrant,
  mediaUploadBackend,
  receiveUpload,
} from '../../server/upload';
import { storeSelection } from '../../server/root';

// /api/x/upload/* (gslides-parity SPEC-3 0.25, 0.29, 8.5, 11.3; SPEC-5 3.3): the presigned upload
// path behind a prefix the WAF can see (rule R17, 20 per minute per IP). `POST
// /api/x/upload/picture` with `{ deckId, contentType, bytes }` runs authorize(write), the uploads
// switch and the picture quotas and answers the grant (`{ key, token, url, method, expiresAt,
// maxBytes, contentType, backend }`); the page then `PUT`s the bytes to `url`. On the local
// backend (a checkout, the tmp store) that is `PUT /api/x/upload/put/<token>` here, streamed
// under the cap and sniffed before it is kept. `POST /api/x/upload/media` (round five, B2) runs
// the same checks with the media rows and answers the media grant: a presigned `PUT` to the
// private store's `uploads/` prefix hosted (`backend: 'blob'`, the URL the CDN enforces), the
// local route on a checkout, or the tier's refusal (503 with its sentence); the page then runs
// `media.insert { upload: key }`. The `GET` forms tell the editor the thresholds, the accepted
// types and the backend before it picks a path. The page's CSRF headers travel with every request
// (start.ts widens the filter to /api/x/*), and the JSON rule of server/headers.ts leaves the PUT
// of raw bytes alone.

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_input', message: 'the body is not JSON' }, 400);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return json({ error: 'invalid_input', message: 'the body wants one JSON object' }, 400);
  return body as Record<string, unknown>;
}

export const Route = createFileRoute('/api/x/upload/$')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const splat = params._splat ?? '';
        if (splat === 'picture')
          // what the editor reads before it picks the path: the threshold and the accepted types
          return json({ threshold: PRESIGN_THRESHOLD_BYTES, contentTypes: UPLOAD_CONTENT_TYPES });
        if (splat === 'media') {
          const backend = mediaUploadBackend(storeSelection().kind);
          return json({
            threshold: MEDIA_DATA_URL_THRESHOLD_BYTES,
            contentTypes: MEDIA_UPLOAD_CONTENT_TYPES,
            backend: backend.kind,
            ...(backend.kind === 'refused' ? { refusal: backend.sentence } : {}),
          });
        }
        return json({ error: 'not_found' }, 404);
      },
      POST: async ({ params, request }) => {
        const splat = params._splat ?? '';
        if (splat !== 'picture' && splat !== 'media') return json({ error: 'not_found' }, 404);
        const body = await readBody(request);
        if (body instanceof Response) return body;
        const { deckId, contentType, bytes, kind } = body;
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
        if (splat === 'media') {
          if (kind !== undefined && !(MEDIA_KINDS as readonly unknown[]).includes(kind))
            return json({ error: 'invalid_input', message: 'kind wants audio or video' }, 400);
          const result = await issueMediaUploadGrant(ctx, {
            deckId,
            contentType,
            bytes,
            ...(kind === 'audio' || kind === 'video' ? { kind } : {}),
          });
          if ('refused' in result) return result.refused;
          return json(result.grant, 201);
        }
        const result = await issueUploadGrant(ctx, { deckId, contentType, bytes });
        if ('refused' in result) return result.refused;
        return json(result.grant, 201);
      },
      PUT: async ({ params, request }) => {
        const splat = params._splat ?? '';
        const match = /^put\/([A-Za-z0-9_.-]{20,2048})$/.exec(splat);
        if (match === null) return json({ error: 'not_found' }, 404);
        const result = await receiveUpload(match[1] ?? '', request.body);
        if (!result.ok)
          return json({ error: 'upload_refused', message: result.reason }, result.status);
        return json({ key: result.key, bytes: result.bytes, sniffedType: result.sniffedType }, 201);
      },
    },
  },
});
