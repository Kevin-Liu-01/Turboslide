import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { createFileRoute } from '@tanstack/react-router';

import { repoRoot } from '../../server/root';

// GET /api/assets/:token: the local static image host of the Google Slides exporter (SPEC 8.3;
// packages/export/src/gslides/images.ts createLocalStaticHost). The exporter stages every raster it
// will hand to createImage under <root>/.turboslide/gslides-assets/<sha256>.<ext>, content
// addressed, and the Slides API fetches it from here at write time. The token is the file's sha256
// (64 hex digits), so nothing else under the folder or the root is reachable; the response is
// public and carries no bearer check because Google's fetcher cannot send TURBOSLIDE_TOKEN, and
// Google can only reach this route when the studio has a public origin (a tunnel in dev,
// TURBOSLIDE_ASSET_BASE_URL; docs/google-slides.md). The cache lifetime matches the signed URL TTL
// of the Cloud Storage host.

/** The staging folder, relative to the workspace root; the exporter writes the same constant. */
const LOCAL_ASSET_DIR = '.turboslide/gslides-assets';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const Route = createFileRoute('/api/assets/$token')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!TOKEN_PATTERN.test(token)) return new Response('Not found', { status: 404 });
        const dir = join(repoRoot(), LOCAL_ASSET_DIR);
        for (const [ext, type] of Object.entries(TYPES)) {
          const file = join(dir, `${token}.${ext}`);
          if (!existsSync(file) || !statSync(file).isFile()) continue;
          const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
          return new Response(body, {
            headers: {
              'content-type': type,
              'content-length': String(statSync(file).size),
              'cache-control': 'public, max-age=900, immutable',
              'x-turboslide-asset': token,
            },
          });
        }
        return new Response('Not found', { status: 404 });
      },
    },
  },
});
