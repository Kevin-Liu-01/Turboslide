import { createFileRoute } from '@tanstack/react-router';

import { jsonResponse } from '@turboslide/agent/http/errors';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import { coveredSeq } from '../../server/checkpoint';
import { publicStoreOrigin } from '../../server/headers';
import { roomBearerMatches } from '../../server/room-bearer';
import { hasStoredDeck, openDeckStore } from '../../server/root';

/**
 * GET /api/decks/:id/seed (the Cloudflare move, docs/CLOUDFLARE.md 3.2, 3.4 item 7, 3.6.1): the
 * store's document at the last checkpoint for the deck's Durable Object, under the room bearer,
 * after a forced sync of this instance's mirror: `{ document, revision, covered }` where `covered`
 * is the last seq the records cover. `?since=<revision>` adds the records above it with their
 * mutations for the re-admission path of 3.5. A document over 4 MB answers
 * `{ snapshotUrl, revision, covered }` with the immutable public snapshot's URL under layout v1,
 * since the function's response cap is 4.5 MB; this arm retires with layout v2 in stage 2.
 */

/** The response cap a document answer stays under (Vercel's 4.5 MB, with room for the envelope). */
export const SEED_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

export const Route = createFileRoute('/api/decks/$deckId/seed')({
  server: {
    handlers: {
      GET: ({ request, params }) => serve(request, params.deckId),
    },
  },
});

async function serve(request: Request, deckId: string): Promise<Response> {
  if (!SLUG_PATTERN.test(deckId)) return jsonResponse({ error: 'not_found' }, 404);
  if (!roomBearerMatches(request)) return jsonResponse({ error: 'bearer' }, 401);
  if (!(await hasStoredDeck(deckId))) return jsonResponse({ error: 'not_found' }, 404);
  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw === null ? undefined : Number(sinceRaw);
  if (since !== undefined && (!Number.isInteger(since) || since < 0))
    return jsonResponse({ error: 'invalid', message: 'since is a non negative integer' }, 400);
  const store = await openDeckStore(deckId);
  const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
  const [read, records] = await Promise.all([store.read(), store.records()]);
  const revision = read.document.deck.revision;
  const covered = coveredSeq(records);
  const above =
    since === undefined
      ? undefined
      : records
          .filter((record) => record.revision > since)
          .map((record) => recordForObject(record));
  const text = JSON.stringify(read.document);
  if (text.length > SEED_DOCUMENT_MAX_BYTES) {
    const origin = publicStoreOrigin();
    const newest = [...records].reverse().find((record) => record.snapshot !== undefined);
    if (origin !== null && newest?.snapshot !== undefined && newest.revision === revision) {
      return jsonResponse({
        snapshotUrl: `${origin}/decks/${encodeURIComponent(deckId)}/snapshots/${newest.snapshot}.json`,
        revision,
        covered,
        ...(above === undefined ? {} : { records: above }),
      });
    }
    console.error(
      `turboslide seed route: ${deckId} is ${text.length} bytes with no public snapshot to point at; the answer may pass the function's cap`,
    );
  }
  return jsonResponse({
    document: read.document,
    revision,
    covered,
    ...(above === undefined ? {} : { records: above }),
  });
}

/** A record as the object reads it for the re-admission: the mutations and the facts, never the inverse. */
function recordForObject(record: VersionRecord): Record<string, unknown> {
  return {
    n: record.n,
    revision: record.revision,
    author: record.author,
    note: record.note,
    mutations: record.mutations,
    ...(record.ops === undefined ? {} : { ops: record.ops }),
    ...(record.origin === undefined ? {} : { origin: record.origin }),
    ...(record.snapshot === undefined ? {} : { snapshot: record.snapshot }),
  };
}
