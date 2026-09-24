import { createFileRoute } from '@tanstack/react-router';
import { errorResponse, jsonResponse, refuse } from '@turboslide/agent/http/errors';
import { LOGO_WORDS } from '@turboslide/chrome/logo-model';
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { DEFAULT_BLANK_TITLE } from '@turboslide/store/templates';

import { recordNewDeck } from '../../server/access';
import { deckDispatcher } from '../../server/actions';
import { agentAuth, agentAuthor } from '../../server/auth';
import { authorFor, authorize, denialBody, requestContext } from '../../server/authorize';
import { assertFlag } from '../../server/flags';
import { refuseForeignOrigin } from '../../server/headers';
import { isLogoSlug, isLogoVariantKey } from '../../server/logo-index';
import {
  LOGO_STORE_BUSY_MESSAGE,
  LOGO_STORE_RETRY_AFTER_S,
  LogoUpstreamError,
  isLogoStoreBusy,
  logoInsert,
  logoService,
  refreshCredential,
} from '../../server/logos';
import type { LogoInsertInput } from '../../server/logos';
import { flushRoom, readJsonBody, refuseCrossSite, refuseNonJson } from '../../server/room';
import type { RouteRefusal } from '../../server/room';
import { createStoredDeck, deckDir, isUnsavedDraft, openDeckStore } from '../../server/root';

// /api/logo/* (docs/FEATURES.md 4.2, 4.7, 4.9, 4.11; audit-logos 2, 10; B6): the logo picker's
// route beside the render, export and assist routes, so a WAF rule and a function duration can
// name it; not a `createServerFn`, because every server function posts to `/_serverFn/<id>`.
//
//   GET  /api/logo/mark/<slug>/<variant>.svg   the sanitized file for the tiles: `image/svg+xml`,
//                                              `nosniff`, `cross-origin-resource-policy: same-site`,
//                                              `content-security-policy: sandbox; default-src 'none'`
//                                              and an hour of cache; from the store cache for an
//                                              open licence mark, from a fetch in the function
//                                              otherwise (4.2, 4.7)
//   GET  /api/logo/search?q=&limit=&kind=&collection=&since=
//                                              the `logo.search` answer for the dialog (a read of
//                                              public data; the same origin page or any caller);
//                                              `since` names a refresh's `builtAt` the answering
//                                              instance adopts when its copy is older (4.2)
//   POST /api/logo/refresh { dryRun? }         the index rebuild: the agent bearer or
//                                              `Authorization: Bearer <CRON_SECRET>` (what a Vercel
//                                              cron sends), else 401 (4.2)
//   POST /api/logo/insert?deck=<id> { slug, variant?, slideId?, box?, everySlide?, kit?, blockId?, baseRevision }
//                                              `logo.insert` for the seller's page (its session
//                                              cookie, same origin) and for an agent (the bearer);
//                                              `authorize()` decides `write`, the readOnly switch
//                                              holds; a /new draft is created first as the asset
//                                              actions create it (agent-actions.ts). The same
//                                              handler answers `/api/actions/logo.insert` once the
//                                              dispatcher registers it (build/b6.md R4).
//
// Every refusal is one JSON object in the shape of the agent surface's errors; nothing here prints
// a token. The store budget of docs/SYNC.md 4 holds: a search reads the index this instance holds,
// a tile is one store read for a cached open mark, an insert is the asset's puts and one write.
// A store refusal under any of the four (the index read the public store's edge withholds after
// the refresh wrote it, a 429, the deadline; server/logos.ts `LogoStoreBusyError`) is answered as
// 503 with `retry-after` and the one sentence, never the framework's 500 (build/hotfix.md 2).

export const Route = createFileRoute('/api/logo/$')({
  server: {
    handlers: {
      GET: ({ params, request }) => serve(request, params._splat ?? ''),
      HEAD: ({ params, request }) => serve(request, params._splat ?? ''),
      POST: ({ params, request }) => serve(request, params._splat ?? ''),
    },
  },
});

export const LOGO_BODY_MAX_BYTES = 64 * 1024;
export const MARK_CACHE_CONTROL = 'public, max-age=3600';

const MARK_PATH = /^mark\/([^/]+)\/([^/]+)\.svg$/;

function notFound(message: string): Response {
  return jsonResponse({ error: { name: 'RangeError', status: 404, message } }, 404);
}

/**
 * The store refuses a read for now (server/logos.ts `isLogoStoreBusy`): 503 with `retry-after`,
 * the product's sentence and the action, so the dialog and an agent ask again instead of reading
 * a 500; null for every other error, which stays the caller's to answer.
 */
function storeBusy(error: unknown, action: string): Response | null {
  if (!isLogoStoreBusy(error)) return null;
  return jsonResponse(
    {
      error: {
        name: 'Error',
        status: 503,
        message: LOGO_STORE_BUSY_MESSAGE,
        code: 'store_busy',
        action,
      },
    },
    503,
    { 'retry-after': String(LOGO_STORE_RETRY_AFTER_S) },
  );
}

/** A refusal of the room routes' rules as the agent surface's error body. */
function refused(refusal: RouteRefusal): Response {
  return jsonResponse(
    {
      error: {
        name: 'Error',
        status: refusal.status,
        message: refusal.message,
        code: refusal.code,
      },
    },
    refusal.status,
  );
}

async function serve(request: Request, splat: string): Promise<Response> {
  const method = request.method.toUpperCase();
  const foreign = refuseForeignOrigin(request);
  if (foreign !== null) return foreign;
  const mark = MARK_PATH.exec(splat);
  if (mark !== null) {
    if (method !== 'GET' && method !== 'HEAD')
      return refuse(405, 'method_not_allowed', 'GET the mark');
    return serveMark(request, decodeURIComponent(mark[1] ?? ''), decodeURIComponent(mark[2] ?? ''));
  }
  if (splat === 'search') {
    if (method !== 'GET' && method !== 'HEAD')
      return refuse(405, 'method_not_allowed', 'GET the search');
    return serveSearch(request);
  }
  if (splat === 'refresh') {
    if (method !== 'POST') return refuse(405, 'method_not_allowed', 'POST the refresh');
    return serveRefresh(request);
  }
  if (splat === 'insert') {
    if (method !== 'POST') return refuse(405, 'method_not_allowed', 'POST the insert');
    return serveInsert(request);
  }
  return notFound('No such logo route');
}

/** The tile route (4.7). */
async function serveMark(request: Request, slug: string, variant: string): Promise<Response> {
  if (!isLogoSlug(slug) || !isLogoVariantKey(variant)) return notFound(LOGO_WORDS.unknown(slug));
  let answer;
  try {
    answer = await (await logoService()).mark(slug, variant);
  } catch (error) {
    return storeBusy(error, 'logo.mark') ?? errorResponse(error, 'logo.mark');
  }
  if (!answer.ok) {
    return jsonResponse(
      {
        error: {
          name: answer.status === 503 ? 'Error' : 'RangeError',
          status: answer.status,
          message: answer.message,
        },
      },
      answer.status,
      answer.status === 503 ? { 'retry-after': '60' } : {},
    );
  }
  const bytes = new TextEncoder().encode(answer.svg);
  return new Response(request.method.toUpperCase() === 'HEAD' ? null : bytes, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'content-length': String(bytes.byteLength),
      'cache-control': MARK_CACHE_CONTROL,
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-site',
      'content-security-policy': "sandbox; default-src 'none'",
      'x-turboslide-logo-cached': answer.cached ? '1' : '0',
      'x-turboslide-logo-licence': encodeURIComponent(answer.row.license).slice(0, 200),
    },
  });
}

/** The dialog's search (4.3): the `logo.search` input read from the query string, its answer as JSON. */
async function serveSearch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw: Record<string, unknown> = {
    query: url.searchParams.get('q') ?? url.searchParams.get('query') ?? '',
  };
  const limit = url.searchParams.get('limit');
  if (limit !== null && limit !== '') raw.limit = Number(limit);
  const kind = url.searchParams.get('kind');
  if (kind !== null && kind !== '') raw.kind = kind;
  const collection = url.searchParams.get('collection');
  if (collection !== null && collection !== '') raw.collection = collection;
  const parsed = ACTIONS['logo.search'].input.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return refuse(
      400,
      'invalid_input',
      `logo.search: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const { query, ...options } = parsed.data as {
    query: string;
    limit?: number;
    kind?: 'symbol' | 'wordmark';
    collection?: 'brands' | 'all';
  };
  // `since`, the build a refresh answered (`builtAt`): the instance answering adopts that build
  // when its copy is older (server/logos.ts `SEARCH_REVALIDATE_MS`); read beside the table's
  // input, so the route carries it before the table names it
  const since = url.searchParams.get('since');
  try {
    const answer = await (
      await logoService()
    ).search(query, options, since === null || since === '' ? {} : { since });
    return jsonResponse(answer);
  } catch (error) {
    return storeBusy(error, 'logo.search') ?? errorResponse(error, 'logo.search');
  }
}

/** The refresh (4.2): two credentials, a dry run answers the counts with no fetch. */
async function serveRefresh(request: Request): Promise<Response> {
  const credential = refreshCredential(request);
  if (credential === null)
    return refuse(
      401,
      'unauthorized',
      'the logo refresh takes the agent bearer or the cron secret',
    );
  let dryRun = false;
  const type = request.headers.get('content-type') ?? '';
  if (/^application\/json/i.test(type)) {
    const body = await readJsonBody(request, LOGO_BODY_MAX_BYTES);
    if (!body.ok) return refused(body.refusal);
    const parsed = ACTIONS['logo.refresh'].input.safeParse(body.value ?? {});
    if (!parsed.success)
      return refuse(400, 'invalid_input', 'logo.refresh takes { dryRun?: boolean }');
    dryRun = (parsed.data as { dryRun?: boolean }).dryRun === true;
  }
  try {
    const counts = await (await logoService()).refresh({ dryRun });
    return jsonResponse({ ...counts, credential });
  } catch (error) {
    return storeBusy(error, 'logo.refresh') ?? errorResponse(error, 'logo.refresh');
  }
}

/**
 * The insert for the page and for an agent (4.4, 4.11): the bearer, else the same origin session;
 * `authorize()` with the request's identity for `write`; the readOnly switch; the draft created
 * first; the handler over the deck's store with the dispatcher for the canvas conversion.
 */
async function serveInsert(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const deckId = url.searchParams.get('deck') ?? '';
  if (!SLUG_PATTERN.test(deckId))
    return refuse(400, 'invalid_input', 'name the deck as ?deck=<id>');
  const hasBearer = request.headers.get('authorization') !== null;
  if (!hasBearer) {
    const cross = refuseCrossSite(request);
    if (cross !== null) return refused(cross);
  } else if (!agentAuth(request).ok) {
    return refuse(401, 'unauthorized', 'the bearer is not accepted here');
  }
  const nonJson = refuseNonJson(request);
  if (nonJson !== null) return refused(nonJson);
  const body = await readJsonBody(request, LOGO_BODY_MAX_BYTES);
  if (!body.ok) return refused(body.refusal);
  const parsed = ACTIONS['logo.insert'].input.safeParse(body.value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return refuse(
      400,
      'invalid_input',
      `logo.insert: invalid input at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
    );
  }
  const input = parsed.data as LogoInsertInput;
  try {
    const ctx = await requestContext(request);
    // the draft's first write may be a logo (docs/FOCUS.md rank 6; agent-actions.ts createsDraft)
    if (await isUnsavedDraft(deckId)) {
      await createStoredDeck({ name: DEFAULT_BLANK_TITLE, from: 'blank', id: deckId });
      await recordNewDeck(deckId, ctx);
    }
    const decision = await authorize(ctx, deckId, 'write', {
      action: 'logo.insert',
      transport: 'route',
    });
    if (!decision.ok) return jsonResponse(denialBody(decision, 'write'), decision.status);
    await assertFlag('readOnly', { deckId, action: 'logo.insert' });
    const author = hasBearer
      ? agentAuthor(request)
      : authorFor(ctx, { kind: 'human', name: 'Editor' });
    await flushRoom(deckId);
    const { dispatcher } = await deckDispatcher(deckId);
    const context = { author, deckDir: deckDir(deckId) };
    const output = dispatcher.has('logo.insert')
      ? await dispatcher.dispatch('logo.insert', input, context)
      : await logoInsert(
          {
            service: await logoService(),
            store: await openDeckStore(deckId),
            deckId,
            dispatch: (id, value, c) => dispatcher.dispatch(id, value, c),
          },
          context,
          input,
        );
    return jsonResponse(output);
  } catch (error) {
    // the source did not answer (4.9): 503 with the sentence and a retry, never a stack
    if (error instanceof LogoUpstreamError)
      return jsonResponse(
        { error: { name: 'Error', status: 503, message: error.message, action: 'logo.insert' } },
        503,
        { 'retry-after': '60' },
      );
    return storeBusy(error, 'logo.insert') ?? errorResponse(error, 'logo.insert');
  }
}
