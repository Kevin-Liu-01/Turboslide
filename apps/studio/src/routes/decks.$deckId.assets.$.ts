import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

import { createFileRoute } from '@tanstack/react-router';

import { deckDir } from '../server/root';

// GET /decks/:deckId/assets/*: the asset twins under decks/<id>/assets (SPEC 4.1),
// which the rendered slides reference by the assetBase the loader passed to
// renderSlide. The path is confined to the deck's assets folder.
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
        const base = resolve(join(deckDir(params.deckId), 'assets'));
        const file = resolve(join(base, normalize(params._splat ?? '')));
        if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile())
          return new Response('Not found', { status: 404 });
        const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
        const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
        return new Response(body, {
          headers: { 'content-type': type, 'cache-control': 'public, max-age=60' },
        });
      },
    },
  },
});
