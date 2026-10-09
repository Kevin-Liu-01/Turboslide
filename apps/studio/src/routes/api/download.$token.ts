import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

import { createFileRoute } from '@tanstack/react-router';

import { STORED_TOKEN_PREFIX, storedFileResponse } from '../../server/stored-files';
import { resolveDownload } from '../../server/tokens';

// GET /api/download/:token: streams one file an export or a build produced, named by a signed
// one-time token (server/tokens.ts). The token carries a job id or a deck id and a file's base
// name; the server resolves those against the job's export report or the worker's builds folder,
// so no caller-chosen path is ever opened (SPEC 11). A token that is malformed, forged, expired,
// spent, or names a file the record does not hold is a 404 with no detail. The response is an
// attachment with the file's own name, not cached. A token that starts `s.` names a file in the
// store (an export, a bundle, a web page build) and the principal it was minted for: hardening
// K1#5a, server/stored-files.ts, which answers 410 once it expired and 403 to anyone else.
export const Route = createFileRoute('/api/download/$token')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = params.token;
        if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_.-]+$/.test(token))
          return new Response('Not found', { status: 404 });
        if (token.startsWith(STORED_TOKEN_PREFIX)) return storedFileResponse(token, request);
        const file = await resolveDownload(token);
        if (!file) return new Response('Not found', { status: 404 });
        const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
        return new Response(body, {
          headers: {
            'content-type': file.type,
            'content-length': String(file.bytes),
            'content-disposition': `attachment; filename="${file.name.replace(/"/g, '')}"`,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      },
    },
  },
});
