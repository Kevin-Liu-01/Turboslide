import { describe, expect, it, vi } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import { ACTIONS } from '@turboslide/schema/actions';
import type { ActionId } from '@turboslide/schema/actions';

import { DECK_ID_ACTIONS, actionDeck } from './action-deck';

// The share and publish actions name their deck in `id` and act on the dispatcher's deck. A call
// to /api/actions/share.createLink with `id` and no ?deck= opened gt-brand, the default deck, and
// minted an editor link there on production. The route now takes the deck from `id`, and refuses
// a call whose ?deck= and `id` differ before it opens any deck. A write that names its deck
// neither way is 400 `deck_required` before any deck opens (agent-gate.ts writesBoundDeck); a
// read without ?deck= still runs on the default.

const opened: string[] = [];
const gated: string[] = [];
const ran: { action: string; deckId: string }[] = [];

vi.mock('./auth', () => ({
  HTTP_DEFAULT_AUTHOR: 'agent:http',
  agentAuth: () => ({ ok: true, mode: 'token' }),
  requireAgentAuth: () => undefined,
}));

vi.mock('./agent-gate', async (importOriginal) => ({
  // the deck rule (requireNamedDeck, DeckRequiredError) is the real one
  ...(await importOriginal<Record<string, unknown>>()),
  INPUT_DECKS: new Map(),
  agentCaller: () => Promise.resolve({ kind: 'admin' }),
  deckNotFound: (deckId: string) => `No deck ${deckId}`,
  gateDeckRead: (_caller: unknown, deckId: string) => {
    gated.push(deckId);
    return Promise.resolve();
  },
  gateAgentAction: () => Promise.resolve(),
}));

vi.mock('./actions', () => ({
  DEFAULT_DECK: 'gt-brand',
  deckDispatcher: (deckId: string) => {
    opened.push(deckId);
    const dispatcher = createDispatcher();
    for (const action of DECK_ID_ACTIONS)
      dispatcher.register(action as ActionId, () => {
        ran.push({ action, deckId });
        // the handler's own answer is not under test: a 500 with this message says it ran
        return Promise.reject(new Error('reached the handler'));
      });
    return Promise.resolve({ dispatcher, live: undefined });
  },
}));

vi.mock('./room', () => ({ flushRoom: () => Promise.resolve() }));

const { Route } = await import('../routes/api/actions.$action');

type Handler = (ctx: { params: { action: string }; request: Request }) => Promise<Response>;
const handlers = (
  Route.options as unknown as { server: { handlers: Record<'POST' | 'PUT', Handler> } }
).server.handlers;

async function call(action: string, query: string, input: object, method: 'POST' | 'PUT' = 'POST') {
  opened.length = 0;
  gated.length = 0;
  ran.length = 0;
  const request = new Request(`https://studio.test/api/actions/${action}${query}`, {
    method,
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const response = await handlers[method]({ params: { action }, request });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('the deck of a share or publish call (server/action-deck.ts)', () => {
  it('lists every share action, deck.publish, deck.unpublish and admin.assignOwner, each with an id in its input', () => {
    for (const action of [
      'share.get',
      'share.createLink',
      'share.setGeneralAccess',
      'deck.publish',
      'deck.unpublish',
      'admin.assignOwner',
    ])
      expect(DECK_ID_ACTIONS.has(action)).toBe(true);
    expect(DECK_ID_ACTIONS.has('deck.info')).toBe(false);
    for (const action of DECK_ID_ACTIONS) {
      const input = ACTIONS[action as ActionId].input as unknown as { shape?: object };
      expect(input.shape !== undefined && 'id' in input.shape, action).toBe(true);
    }
  });

  it('takes the deck from id without ?deck=, refuses two different decks, and leaves other actions on ?deck=', () => {
    expect(actionDeck('share.createLink', null, { id: 'q4' }, 'gt-brand')).toEqual({
      ok: true,
      deckId: 'q4',
      named: true,
    });
    expect(actionDeck('share.createLink', 'q4', { id: 'q4' }, 'gt-brand')).toEqual({
      ok: true,
      deckId: 'q4',
      named: true,
    });
    expect(actionDeck('share.createLink', 'gt-brand', { id: 'q4' }, 'gt-brand').ok).toBe(false);
    expect(actionDeck('deck.info', null, { id: 'q4' }, 'gt-brand')).toEqual({
      ok: true,
      deckId: 'gt-brand',
      named: false,
    });
    expect(actionDeck('deck.info', 'q4', {}, 'gt-brand')).toEqual({
      ok: true,
      deckId: 'q4',
      named: true,
    });
    // no id, or an id that is not a slug: the default, not named, which a write may not run on
    expect(actionDeck('share.createLink', null, {}, 'gt-brand')).toEqual({
      ok: true,
      deckId: 'gt-brand',
      named: false,
    });
    // an id that is not a slug: the schema's own words at /id, whatever ?deck= says
    for (const query of [null, 'q4'])
      expect(actionDeck('share.createLink', query, { id: '../x' }, 'gt-brand')).toEqual({
        ok: false,
        message:
          'share.createLink: invalid input at /id: a slug: lower-case letters and digits joined by single hyphens',
        pointer: '/id',
      });
  });

  it('refuses a write that names no deck with 400 deck_required before it opens one', async () => {
    for (const [action, input] of [
      ['share.createLink', { role: 'editor', baseRevision: 0 }],
      ['slide.update', { slideId: 'thesis', mutations: [], baseRevision: 0 }],
    ] as const) {
      const result = await call(action, '', input);
      expect(result.status, action).toBe(400);
      expect(result.body, action).toMatchObject({ error: { code: 'deck_required', action } });
      expect(String((result.body.error as { message: string }).message)).toContain('?deck=<id>');
      expect(gated).toEqual([]);
      expect(opened).toEqual([]);
      expect(ran).toEqual([]);
    }
  });

  it('leaves a write the route does not take to its own refusal: off http 404, a PUT 405, a bad id invalid_input', async () => {
    const unpack = await call('deck.unpack', '', { file: 'x.zip' });
    expect(unpack).toMatchObject({ status: 404, body: { error: { code: 'not_on_http' } } });
    const source = await call('source.apply', '', {});
    expect(source).toMatchObject({ status: 404, body: { error: { code: 'not_on_http' } } });
    const put = await call('slide.update', '', { slideId: 'thesis', mutations: [] }, 'PUT');
    expect(put).toMatchObject({ status: 405, body: { error: { code: 'method_not_allowed' } } });
    const bad = await call('share.createLink', '', { id: '../x', role: 'editor', baseRevision: 0 });
    expect(bad).toMatchObject({
      status: 400,
      body: { error: { code: 'invalid_input', pointer: '/id', action: 'share.createLink' } },
    });
    expect(gated).toEqual([]);
    expect(opened).toEqual([]);
    expect(ran).toEqual([]);
  });

  it('runs a read that names no deck on the default deck', async () => {
    const result = await call('deck.info', '', {});
    expect(result.status).not.toBe(400);
    expect(gated).toEqual(['gt-brand']);
    expect(opened).toEqual(['gt-brand']);
  });

  it('runs share.createLink with id x and no ?deck= on deck x, never on gt-brand', async () => {
    const result = await call('share.createLink', '', {
      id: 'x',
      role: 'editor',
      baseRevision: 0,
    });
    expect(result).toMatchObject({
      status: 500,
      body: { error: { message: 'reached the handler' } },
    });
    expect(gated).toEqual(['x']);
    expect(opened).toEqual(['x']);
    expect(ran).toEqual([{ action: 'share.createLink', deckId: 'x' }]);
  });

  it('refuses a share write whose ?deck= and id differ before it opens a deck', async () => {
    const result = await call('share.setGeneralAccess', '?deck=gt-brand', {
      id: 'x',
      mode: 'link',
      role: 'editor',
      baseRevision: 0,
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'invalid_input' } });
    expect(gated).toEqual([]);
    expect(opened).toEqual([]);
    expect(ran).toEqual([]);
  });

  it('runs deck.publish on the deck both name when they agree', async () => {
    const result = await call('deck.publish', '?deck=x', { id: 'x', baseRevision: 0 });
    expect(result).toMatchObject({
      status: 500,
      body: { error: { message: 'reached the handler' } },
    });
    expect(opened).toEqual(['x']);
    expect(ran).toEqual([{ action: 'deck.publish', deckId: 'x' }]);
  });
});
