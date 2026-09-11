import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

import { createFileRoute } from '@tanstack/react-router';

import { storedAssetFile, storedAssetUrl } from '../server/root';

// GET /decks/:deckId/assets/*: the asset twins of a deck (SPEC 4.1), which the rendered slides
// reference by the assetBase the loader passed to renderSlide. The store answers (server/root.ts):
// a checkout streams decks/<id>/assets/<file>; a hosted instance streams the twin from its
// overlay, materializing the bundled seed's twins on the first request, and for a deck made on
// another instance redirects to the twin's Blob URL. The path is confined to the deck's assets
// folder by the store. On Vercel the seed deck's twins are also static files of the deployment
// (vite.deploy.config.ts publicAssets), so the CDN answers those before this route runs.
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
      GET: async ({ params }) => {
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(params.deckId))
          return new Response('Not found', { status: 404 });
        const relative = params._splat ?? '';
        if (relative === '') return new Response('Not found', { status: 404 });
        const file = await storedAssetFile(params.deckId, relative);
        if (file !== null && statSync(file).isFile()) {
          const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
          const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
          return new Response(body, {
            headers: { 'content-type': type, 'cache-control': 'public, max-age=60' },
          });
        }
        const url = await storedAssetUrl(params.deckId, relative);
        if (url !== null) {
          return new Response(null, {
            status: 302,
            headers: { location: url, 'cache-control': 'public, max-age=60' },
          });
        }
        return new Response('Not found', { status: 404 });
      },
    },
  },
});
