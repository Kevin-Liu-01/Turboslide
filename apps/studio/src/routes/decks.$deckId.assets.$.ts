import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

import { createFileRoute } from '@tanstack/react-router';

import { MEDIA_MIME_BY_EXTENSION } from '@turboslide/schema/blocks/media';

import { assetResponseHeaders } from '../server/headers';
import { storedAssetFile, storedAssetUrl } from '../server/root';
import { rangeHeaders, resolveRange } from './-assets-range';

// GET and HEAD /decks/:deckId/assets/*: the asset twins and the media files of a deck (SPEC 4.1),
// which the rendered slides reference by the assetBase the loader passed to renderSlide. The
// store answers (server/root.ts): a checkout streams decks/<id>/assets/<file>; a hosted instance
// streams the file from its overlay, materializing the bundled seed's twins on the first request,
// and for a deck made on another instance redirects to the file's Blob URL. The path is confined
// to the deck's assets folder by the store. On Vercel the seed deck's twins are also static files
// of the deployment (vite.deploy.config.ts publicAssets), so the CDN answers those before this
// route runs.
//
// Every file goes out with `X-Content-Type-Options: nosniff`, and an `.svg`, a `.json` or any
// file outside the four raster types and the five media types goes out as an attachment under a
// sandboxing policy (gslides-parity SPEC-3 0.28, 11.3, 11.5 R0; report 04 F5: an svg served
// inline here was stored script in the app's origin). server/headers.ts assetResponseHeaders is
// the rule and its test. The media rows (gslides-parity SPEC-5 3.3; R11 1.5, 2 rule 2) read the
// schema's one extension table, so a `.m4v` is `video/mp4` here as in the store; a `Range`
// header answers `206` with `Content-Range` (one range; -assets-range.ts), a range past the end
// `416`, and `HEAD` the same headers with no body, so a `<video>` seeks and the poster capture
// reads metadata without the whole file; a digest named file carries `Cache-Control: public,
// max-age=31536000, immutable` (headers.ts assetCacheControl). Hosted, the renderer's media URL
// is the Blob URL itself and this route's `302` serves the pictures (R11 2 rule 1).
const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.json': 'application/json',
  ...Object.fromEntries(
    Object.entries(MEDIA_MIME_BY_EXTENSION).map(([extension, mime]) => [`.${extension}`, mime]),
  ),
};

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

async function answer(
  params: { deckId: string; _splat?: string },
  request: Request,
  method: 'GET' | 'HEAD',
): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(params.deckId)) return notFound();
  const relative = params._splat ?? '';
  if (relative === '') return notFound();
  const file = await storedAssetFile(params.deckId, relative);
  if (file !== null) {
    const stat = statSync(file);
    if (stat.isFile()) {
      const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const base = assetResponseHeaders(relative, type);
      const resolved = resolveRange(request.headers.get('range'), stat.size);
      const { status, headers } = rangeHeaders(resolved);
      const all = { ...base, ...headers };
      if (method === 'HEAD' || resolved.kind === 'unsatisfiable')
        return new Response(null, { status, headers: all });
      const stream =
        resolved.kind === 'partial'
          ? createReadStream(file, { start: resolved.range.start, end: resolved.range.end })
          : createReadStream(file);
      const body = Readable.toWeb(stream) as ReadableStream;
      return new Response(body, { status, headers: all });
    }
  }
  const url = await storedAssetUrl(params.deckId, relative);
  if (url !== null) {
    return new Response(null, {
      status: 302,
      headers: {
        location: url,
        'cache-control': 'public, max-age=60',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  return notFound();
}

export const Route = createFileRoute('/decks/$deckId/assets/$')({
  server: {
    handlers: {
      GET: ({ params, request }) => answer(params, request, 'GET'),
      HEAD: ({ params, request }) => answer(params, request, 'HEAD'),
    },
  },
});
