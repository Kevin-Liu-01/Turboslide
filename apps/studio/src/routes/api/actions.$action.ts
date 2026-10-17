import { createFileRoute } from '@tanstack/react-router';
import type { Dispatcher } from '@turboslide/agent/dispatch';
import {
  WRITE_BODY_LIMIT,
  bodyLimitFor,
  handleActionRequest,
  idempotencyFingerprint,
  readJsonBody,
  refuseSpoofedLocalhost,
  requestIdempotencyKey,
  takesIdempotencyKey,
} from '@turboslide/agent/http/dispatch';
import { errorResponse, jsonResponse, refuse } from '@turboslide/agent/http/errors';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import { ForbiddenError } from '@turboslide/schema/errors';

import { DECK_ID_ACTIONS, actionDeck } from '../../server/action-deck';
import { DEFAULT_DECK, deckDispatcher } from '../../server/actions';
import {
  DeckRequiredError,
  INPUT_DECKS,
  agentCaller,
  deckNotFound,
  gateAgentAction,
  gateDeckRead,
  requireNamedDeck,
} from '../../server/agent-gate';
import type { AgentCaller } from '../../server/agent-gate';
import { agentAuth, HTTP_DEFAULT_AUTHOR, requireAgentAuth } from '../../server/auth';
import { capabilityForAction } from '../../server/authorize';
import { FlagOffError } from '../../server/flags';
import { refuseForeignOrigin } from '../../server/headers';
import type { EarlierAttempt, Idempotency } from '../../server/idempotency';
import {
  idempotencyCaller,
  replayedRecord,
  replayedResponse,
  withReplayedHeader,
} from '../../server/idempotency';
import { RateLimitedError, rateLimitedResponse } from '../../server/ratelimit';
import { flushRoom } from '../../server/room';
import { deckDir } from '../../server/root';

// /api/actions/:action (SPEC 3.4, 7.1, 11; MILESTONES M4 item 1): POST runs one action of the
// table through the studio's dispatcher (server/actions.ts), GET returns its contract. The
// request rules live in @turboslide/agent/http/dispatch (framework free, unit tested): the bearer
// token off localhost, the 1 MB body cap, one JSON object as the input, the author from
// x-turboslide-author, ?deck= for the deck, ?force=1 to write past another author's lease, and
// the one error body with the status of the error class (409 with the current document and the
// holder). The share and publish actions take their deck from the input's `id` when ?deck= is
// absent and refuse a call whose two differ (server/action-deck.ts). A write that lands on a deck
// and names none is 400 `deck_required` before any deck opens; a read without ?deck= runs on the
// instance default (server/agent-gate.ts writesBoundDeck). The dispatcher is built per
// request over the deck named, so a deck created a moment ago is served and a removed one is a
// 404; the store, the worker client and the session registry behind it are per process.
//
// Round three (gslides-parity SPEC-3 6.2, 8.8, 11.5 R3): the localhost rule holds only when every
// host the request names is local (TURBOSLIDE_TRUST_PROXY, server/headers.ts), and authorize()
// runs before the deck is opened, in shadow mode this round: the bootstrap bearer and a
// checkout's localhost surface act as the admin (SPEC-3 0.23) until B3's key resolver binds
// API key records (day four).
//
// Hardening H2 (AUTH-1, AV-1): the caller is the identity the bearer resolves to, an API key
// acting for its owner with its scopes, and every call goes through the gate /mcp uses
// (server/agent-gate.ts), which enforces in shadow mode too: the deck read before it is opened, the
// action's capability on it and on the decks its input names, the read only switch and the write
// quota. The handler takes the studio's bearer rule, so an API key reaches this route under that
// gate (before H2 the agent package's token only rule answered every key 401). A deck the caller
// cannot see and a deck that does not exist answer the same 404.
//
// Hardening HR-O#6 (RELIABILITY-21): a POST of a writing action that takes it
// (`takesIdempotencyKey`; a key on any other writing action is 400 `idempotency_not_supported`)
// may carry `Idempotency-Key`. The key, scoped to the caller and fingerprinted with the action and
// the body, becomes the op id of each write the action makes (the room's entry and the record's
// origin, server/idempotency.ts). Once the gate admitted the call, a resend whose first attempt is
// in the log runs the action over the records that attempt made and answers what the action
// answers, with `idempotent-replayed: true`, so a retried write is never applied twice; the same
// key with another action or body is 422 `idempotency_key_reused` (the wave 3b verify's findings
// 3 to 5).

export const Route = createFileRoute('/api/actions/$action')({
  server: {
    handlers: {
      GET: ({ params, request }) => serve(request, params.action),
      POST: ({ params, request }) => serve(request, params.action),
      PUT: ({ params, request }) => serve(request, params.action),
      DELETE: ({ params, request }) => serve(request, params.action),
    },
  },
});

/** The answer for a refusal of the gate: the 503 and 429 bodies the route always gave, else the error body. */
function gateRefusal(error: unknown, action: string): Response {
  if (error instanceof DeckRequiredError) return refuse(400, error.code, error.message, { action });
  if (error instanceof FlagOffError)
    return jsonResponse({ error: 'unavailable', message: error.message }, 503, {
      'retry-after': '60',
    });
  if (error instanceof RateLimitedError) return rateLimitedResponse(error);
  if (error instanceof RangeError) return refuse(404, 'unknown_deck', error.message, { action });
  if (error instanceof ForbiddenError)
    return jsonResponse(
      {
        error: {
          name: error.name,
          status: 403,
          message: error.message,
          action,
          ...(error.capability !== undefined ? { capability: error.capability } : {}),
        },
      },
      403,
    );
  return errorResponse(error, action);
}

async function serve(request: Request, action: string): Promise<Response> {
  // the token check runs before the deck is looked up, so a probe off localhost learns nothing
  const denied = requireAgentAuth(request);
  if (denied) return denied;
  const auth = agentAuth(request);
  if (auth.ok && auth.mode === 'localhost') {
    const spoofed = refuseSpoofedLocalhost(request);
    if (spoofed !== null) return spoofed;
  }
  // a browser page may call the agent surface from the studio's own origin only (SPEC-3 8.7)
  const foreign = refuseForeignOrigin(request);
  if (foreign !== null) return foreign;
  const url = new URL(request.url);
  // the share and publish actions name their deck in the input's `id` too (server/action-deck.ts);
  // their body is read from a copy, and one that does not parse is the handler's 400 below
  let named: unknown;
  if (request.method === 'POST' && DECK_ID_ACTIONS.has(action)) {
    const read = await readJsonBody(request.clone(), WRITE_BODY_LIMIT);
    named = read.ok ? read.value : undefined;
  }
  const deck = actionDeck(action, url.searchParams.get('deck'), named, DEFAULT_DECK);
  if (!deck.ok)
    return refuse(400, 'invalid_input', deck.message, {
      action,
      ...(deck.pointer === undefined ? {} : { pointer: deck.pointer }),
    });
  const deckId = deck.deckId;
  const keyed = requestIdempotencyKey(request);
  if (!keyed.ok) return keyed.response;
  let caller: AgentCaller;
  try {
    // a write that names no deck is refused before the default deck is read or opened
    if (request.method === 'POST')
      requireNamedDeck({ action, deckNamed: deck.named, transport: 'http' });
    caller = await agentCaller(request);
    await gateDeckRead(caller, deckId, 'http', action);
  } catch (error) {
    return gateRefusal(error, action);
  }
  let idempotency: Idempotency | undefined;
  if (
    keyed.key !== undefined &&
    request.method === 'POST' &&
    isActionId(action) &&
    ACTIONS[action].mutates
  ) {
    const spec = ACTIONS[action];
    if (!takesIdempotencyKey(spec))
      return refuse(
        400,
        'idempotency_not_supported',
        `${action} does not take Idempotency-Key: its effects are outside the version log a key is found in. Send it without the key`,
        { action },
      );
    // the fingerprint reads a copy of the body; a body that does not parse is the handler's 400
    // below, before anything is written
    const body = await readJsonBody(request.clone(), bodyLimitFor(spec));
    if (body.ok)
      idempotency = {
        caller: idempotencyCaller(caller),
        key: keyed.key,
        fingerprint: idempotencyFingerprint(action, body.value),
      };
  }
  const open = async (replay?: EarlierAttempt) =>
    deckDispatcher(deckId, {
      request,
      ...(idempotency === undefined ? {} : { idempotency }),
      ...(replay === undefined ? {} : { replay }),
    });
  const run = (over: Dispatcher): Promise<Response> =>
    handleActionRequest(request, action, {
      dispatcher: over,
      defaultDeck: deckId,
      deckDir: (id) => deckDir(id),
      defaultAuthor: HTTP_DEFAULT_AUTHOR,
      authorize: (req) => agentAuth(req),
      onDispatch: (event) => {
        if (process.env.TURBOSLIDE_AGENT_LOG === '1') {
          console.error(
            `agent http: ${event.action} ${event.status} ${event.ms} ms deck=${event.deckId ?? '-'} author=${event.author.kind === 'agent' ? `agent:${event.author.runId ?? ''}` : event.author.name}${event.force ? ' force' : ''}`,
          );
        }
      },
    });
  let dispatcher;
  let live;
  try {
    ({ dispatcher, live } = await open());
  } catch (error) {
    if (error instanceof RangeError)
      return refuse(404, 'unknown_deck', deckNotFound(deckId), { action });
    return errorResponse(error, action);
  }
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    // the decks an input names (deck.copy, deck.trash, slide.import, ...) are read from a copy of
    // the body; a body that does not parse is the handler's 400 below
    let input: unknown;
    if (INPUT_DECKS.has(action)) {
      const read = await readJsonBody(request.clone(), WRITE_BODY_LIMIT);
      input = read.ok ? read.value : undefined;
    }
    try {
      await gateAgentAction(caller, { action, deckId, input, transport: 'http' });
    } catch (error) {
      return gateRefusal(error, action);
    }
    if (idempotency !== undefined) {
      const earlier = await replayedRecord(live, idempotency);
      if (earlier !== undefined && !earlier.sameRequest)
        return refuse(
          422,
          'idempotency_key_reused',
          'This Idempotency-Key came with another action or body; send a new key for a new write',
          { action },
        );
      if (earlier !== undefined) {
        // the action once more over the first attempt's records: its own answer, nothing written
        let replayed: Response;
        try {
          replayed = await run((await open(earlier)).dispatcher);
        } catch {
          return replayedResponse(action, earlier.record);
        }
        return replayed.ok
          ? withReplayedHeader(replayed)
          : replayedResponse(action, earlier.record);
      }
    }
  }
  // what the open editor wrote a moment ago reaches the store before an agent reads it (room.ts
  // flushRoom; the product round fix round, pass 1 finding 12: deck.tailor planned over a store
  // without the texts the tab had typed and answered zero replacements), so the revision and
  // the texts `deck.info` answers are the ones the write that follows is judged against. A
  // write is not flushed ahead of: a writer that took its base from the tab's own revision (the
  // core walk's rows) would meet the flush's commit as a stale base, where before it landed
  // (the drive of build/b7.md "Product round fix round" F6); the durable seam is
  // `roomBackedStore` (FR6)
  const reads = capabilityForAction(action);
  if (
    request.method !== 'GET' &&
    (reads === 'read' || reads === 'readComments' || reads === 'history')
  )
    await flushRoom(deckId);
  return run(dispatcher);
}
