import { createFileRoute } from '@tanstack/react-router';

import { refuse } from '@turboslide/agent/http/errors';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { BUNDLE_MEDIA_TYPE } from '@turboslide/store/bundle';

import {
  DOWNLOAD_PURPOSE,
  bundleRouteAuth,
  exportDeckBundle,
  storeBundleCopy,
} from '../../server/bundle-core';
import { VERCEL_BODY_CAP, contentDisposition } from '../../server/export-sync';

// GET /api/decks/:deckId/bundle (docs/deck-transfer.md): the deck as one bundle zip, packed from
// the store (synced first, so the blob backend answers the current revision from any instance,
// with the twins pulled to disk) and sent as an attachment named `<deckId>-r<revision>.zip`, with
// the manifest facts in X-Turboslide-Bundle. Inside a function a body over 4.5 MB cannot leave, so
// on the blob backend such a bundle is stored under `bundles/<deckId>/` and the answer is a 302 to
// that copy (the CLI's `deck pull` follows it); on the tmp backend it is 413 with the reason.
//
// Authentication (SPEC 11): the bearer token when TURBOSLIDE_TOKEN is set, or the short-lived
// ticket the studio's own page gets from the bundleDownloadTicket server function (`?t=`), which
// is how the /decks row and the Export menu download without the browser holding the token; open
// in a checkout, like the export route.

function inFunction(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export const Route = createFileRoute('/api/decks/$deckId/bundle')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!SLUG_PATTERN.test(params.deckId))
          return refuse(400, 'invalid_input', 'deckId must be a slug');
        const denied = bundleRouteAuth(request, DOWNLOAD_PURPOSE, params.deckId);
        if (denied) return denied;
        let packed;
        try {
          packed = await exportDeckBundle(params.deckId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof RangeError) return refuse(404, 'unknown_deck', message);
          if (error instanceof TypeError) return refuse(400, 'invalid_input', message);
          return Response.json({ error: { name: 'Error', message, status: 500 } }, { status: 500 });
        }
        const summary = {
          deckId: packed.manifest.deckId,
          revision: packed.manifest.revision,
          bytes: packed.zip.byteLength,
          counts: packed.counts,
        };
        const common: Record<string, string> = {
          'cache-control': 'no-store',
          'x-turboslide-bundle': JSON.stringify(summary),
        };
        if (inFunction() && packed.zip.byteLength > VERCEL_BODY_CAP) {
          const stored = await storeBundleCopy(packed.manifest.deckId, packed.fileName, packed.zip);
          if (stored !== null) {
            return new Response(null, { status: 302, headers: { ...common, location: stored } });
          }
          return Response.json(
            {
              error: {
                name: 'Error',
                status: 413,
                code: 'response_too_large',
                message: `the bundle is ${packed.zip.byteLength} bytes and a function answers at most ${VERCEL_BODY_CAP}; this store cannot hold a copy, so pack the deck from a checkout instead`,
              },
              ...summary,
            },
            { status: 413, headers: common },
          );
        }
        return new Response(packed.zip, {
          headers: {
            ...common,
            'content-type': BUNDLE_MEDIA_TYPE,
            'content-length': String(packed.zip.byteLength),
            'content-disposition': contentDisposition(packed.fileName),
            'x-content-type-options': 'nosniff',
          },
        });
      },
    },
  },
});
