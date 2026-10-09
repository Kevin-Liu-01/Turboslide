import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

import { createFileRoute } from '@tanstack/react-router';

import { assetResponseHeaders } from '../server/headers';
import { storedAssetFile, storedAssetUrl } from '../server/root';
import { defaultTwinAccessDeps, twinRequest } from '../server/twin-access';

// GET /decks/:deckId/assets/*: the asset twins of a deck (SPEC 4.1), which the rendered slides
// reference by the assetBase the loader passed to renderSlide. The store answers (server/root.ts):
// a checkout streams decks/<id>/assets/<file>; a hosted instance streams the twin from its
// overlay, materializing the bundled seed's twins on the first request, and for a deck made on
// another instance redirects to the twin's Blob URL. The path is confined to the deck's assets
// folder by the store. On Vercel the seed deck's twins are also static files of the deployment
// (vite.deploy.config.ts publicAssets), so the CDN answers those before this route runs.
//
// Every file goes out with `X-Content-Type-Options: nosniff`, and an `.svg`, a `.json` or any
// file outside the four raster types goes out as an attachment under a sandboxing policy
// (gslides-parity SPEC-3 0.28, 11.3, 11.5 R0; report 04 F5: an svg served inline here was stored
// script in the app's origin). server/headers.ts assetResponseHeaders is the rule and its test.
//
// Which twin a request names and who may keep it (hardening HR-SD#6, CRIT-M3): server/twin-access.ts.
// A keyed deck's twin is served at `/decks/<id>/assets/<assetKey>/<file>` by the key alone; by
// its name on the blob store only to a reader the deck admits, with a private answer; a stranger
// gets the answer a missing file gets.
const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.json': 'application/json',
};

export const Route = createFileRoute('/decks/$deckId/assets/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(params.deckId))
          return new Response('Not found', { status: 404 });
        const asked = params._splat ?? '';
        if (asked === '') return new Response('Not found', { status: 404 });
        const twin = await twinRequest(params.deckId, asked, request, defaultTwinAccessDeps());
        if ('refuse' in twin) return new Response('Not found', { status: 404 });
        const relative = twin.serve;
        // a twin by name of a keyed deck goes to its reader alone: no shared cache keeps it
        const cacheControl =
          twin.cache === 'private' ? 'private, max-age=60' : 'public, max-age=60';
        const file = await storedAssetFile(params.deckId, relative);
        if (file !== null && statSync(file).isFile()) {
          const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
          const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
          return new Response(body, {
            headers: assetResponseHeaders(relative, type, cacheControl),
          });
        }
        const url = await storedAssetUrl(params.deckId, relative);
        if (url !== null) {
          return new Response(null, {
            status: 302,
            headers: {
              location: url,
              'cache-control': cacheControl,
              'x-content-type-options': 'nosniff',
            },
          });
        }
        return new Response('Not found', { status: 404 });
      },
    },
  },
});
