import { describe, expect, it } from 'vitest';

import { ConflictError, ForbiddenError, NotImplementedError } from '@turboslide/schema/errors';
import type { Author } from '@turboslide/schema/mutations';

import { RateLimitedError } from './ratelimit';
import type { QuotaContext } from './ratelimit';
import { anonymousContext } from './authorize';
import type { ShadowedDecision } from './authorize';
import {
  ASSIST_BODY_MAX_BYTES,
  assistCapability,
  assistErrorResponse,
  handleAssistRequest,
  isAssistAction,
} from './assist-route';
import type { AssistRouteDeps } from './assist-route';
import type { RequestIdentity } from './room';

// The assist route (docs/PRODUCT.md 6.3, 6.4; the rows assist.quota.429, assist.viewer.disabled,
// assist.agent.propose-accept's server half): every refusal in one shape and one sentence, the
// switches, the quotas on a propose alone, the action under the caller's author, and the errors
// the module throws mapped to a status and never a stack. Over fakes; the route file binds the
// runtime seams.

const HUMAN: Author = { kind: 'human', name: 'Copper', principalId: 'anon_copper' };
const identity: RequestIdentity = {
  ctx: anonymousContext(),
  principalId: 'anon_copper',
  identity: 'anon_copper',
  kind: 'anonymous',
  record: null,
};
const ok: ShadowedDecision = {
  ok: true,
  role: 'editor',
  via: 'open',
  status: 200,
} as ShadowedDecision;
const denied: ShadowedDecision = { ok: false, code: 'forbidden', status: 403 } as ShadowedDecision;

type Call = { deckId: string; action: string; input: unknown; author: Author };

function deps(
  over: Partial<AssistRouteDeps> & { calls?: Call[]; lines?: string[] } = {},
): AssistRouteDeps {
  const calls = over.calls ?? [];
  return {
    identity: async () => identity,
    decide: async () => ok,
    flagOn: async () => true,
    quotas: async () => null,
    tierOf: () => 'anonymous',
    authorOf: () => HUMAN,
    dispatch: async (deckId, action, input, author) => {
      calls.push({ deckId, action, input, author });
      return { cards: [] };
    },
    refuseCrossSite: () => null,
    refuseNonJson: () => null,
    readJsonBody: async (request) => {
      const text = await request.text();
      try {
        return { ok: true, value: JSON.parse(text) as unknown, bytes: text.length };
      } catch {
        return {
          ok: false,
          refusal: { status: 400, code: 'invalid_json', message: 'The body is not JSON' },
        };
      }
    },
    log: (line) => over.lines?.push(line),
    now: () => 1_000,
    ...over,
  };
}

function post(body: unknown, deck = 'q4-review', headers: Record<string, string> = {}): Request {
  return new Request(`https://studio.local/api/assist?deck=${deck}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const propose = { action: 'assist.propose', input: { intent: 'shorter', slideIds: ['title'] } };

describe('the request rules', () => {
  it('names the two actions and their capabilities', () => {
    expect(isAssistAction('assist.propose')).toBe(true);
    expect(isAssistAction('deck.trash')).toBe(false);
    expect(assistCapability('assist.propose')).toBe('comment');
    expect(assistCapability('assist.accept')).toBe('write');
    expect(ASSIST_BODY_MAX_BYTES).toBe(1024 * 1024);
  });

  it('takes POST alone, same origin without a bearer, JSON, one object with an action and an input, and a deck slug', async () => {
    const get = await handleAssistRequest(
      new Request('https://studio.local/api/assist?deck=q4-review'),
      deps(),
    );
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    const cross = await handleAssistRequest(
      post(propose),
      deps({
        refuseCrossSite: () => ({
          status: 403,
          code: 'cross_site',
          message: 'This route takes same origin requests only',
        }),
      }),
    );
    expect(cross.status).toBe(403);
    // a bearer agent sends no Sec-Fetch-Site: the cross site rule is not asked
    const bearer = await handleAssistRequest(
      post(propose, 'q4-review', { authorization: 'Bearer x' }),
      deps({ refuseCrossSite: () => ({ status: 403, code: 'cross_site', message: 'no' }) }),
    );
    expect(bearer.status).toBe(200);
    const type = await handleAssistRequest(
      post(propose),
      deps({
        refuseNonJson: () => ({
          status: 415,
          code: 'content_type',
          message: 'This route takes application/json',
        }),
      }),
    );
    expect(type.status).toBe(415);
    expect((await handleAssistRequest(post('not json'), deps())).status).toBe(400);
    expect((await handleAssistRequest(post([1, 2]), deps())).status).toBe(400);
    const unknown = await handleAssistRequest(post({ action: 'deck.trash', input: {} }), deps());
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({
      error: 'invalid_input',
      message: 'action must be assist.propose or assist.accept',
    });
    expect(
      (await handleAssistRequest(post({ action: 'assist.propose', input: 'x' }), deps())).status,
    ).toBe(400);
    const badDeck = await handleAssistRequest(post(propose, '../x'), deps());
    expect(badDeck.status).toBe(404);
  });
});

describe('authorize, the switches and the quotas', () => {
  it('answers the denial as authorize shaped it, before any switch or quota is read', async () => {
    const reads: string[] = [];
    const response = await handleAssistRequest(
      post(propose),
      deps({
        decide: async () => denied,
        flagOn: async (name) => {
          reads.push(name);
          return true;
        },
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden', capability: 'comment' });
    expect(reads).toEqual([]);
  });

  it('asks comment to propose and write to accept', async () => {
    const asked: string[] = [];
    const d = deps({
      decide: async (_identity, _deckId, capability) => {
        asked.push(capability);
        return ok;
      },
    });
    await handleAssistRequest(post(propose), d);
    await handleAssistRequest(post({ action: 'assist.accept', input: { card: {} } }), d);
    expect(asked).toEqual(['comment', 'write']);
  });

  it('answers 503 with the assistant’s sentence when the switch is off, and the read only sentence on an accept', async () => {
    const off = await handleAssistRequest(
      post(propose),
      deps({ flagOn: async (name) => name !== 'assist' }),
    );
    expect(off.status).toBe(503);
    expect(off.headers.get('retry-after')).toBe('60');
    expect(await off.json()).toEqual({
      error: 'unavailable',
      message: 'The assistant is off on this Turboslide',
      flag: 'assist',
    });
    const readOnly = await handleAssistRequest(
      post({ action: 'assist.accept', input: { card: {} } }),
      deps({ flagOn: async (name) => name !== 'readOnly' }),
    );
    expect(readOnly.status).toBe(503);
    expect((await readOnly.json()).message).toBe('This presentation is read only right now');
    // a propose is not a write: the read only switch is not read for it
    const reads: string[] = [];
    await handleAssistRequest(
      post(propose),
      deps({
        flagOn: async (name) => {
          reads.push(name);
          return true;
        },
      }),
    );
    expect(reads).toEqual(['assist']);
  });

  it('counts the two assist quotas on a propose alone and answers 429 with the sentence and retry-after', async () => {
    const counted: QuotaContext[] = [];
    const d = deps({
      quotas: async (ctx) => {
        counted.push(ctx);
        return counted.length >= 2 ? new RateLimitedError('assistCallsPerMinutePerDeck', 42) : null;
      },
    });
    expect((await handleAssistRequest(post(propose), d)).status).toBe(200);
    expect(counted[0]).toEqual({
      identity: 'anon_copper',
      tier: 'anonymous',
      deckId: 'q4-review',
      action: 'assist.propose',
      transport: 'route',
    });
    const refused = await handleAssistRequest(post(propose), d);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('42');
    expect(await refused.json()).toEqual({
      error: 'rate_limited',
      message: 'Too many assistant requests. Try again in a minute',
      quota: 'assistCallsPerMinutePerDeck',
    });
    // an accept spends no assist quota: its write is the card's one write
    await handleAssistRequest(post({ action: 'assist.accept', input: { card: {} } }), d);
    expect(counted).toHaveLength(2);
  });
});

describe('the dispatch and the errors', () => {
  it('runs the action on the deck under the caller’s author and answers its result, logging one line without the text', async () => {
    const calls: Call[] = [];
    const lines: string[] = [];
    const response = await handleAssistRequest(post(propose), deps({ calls, lines }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cards: [] });
    expect(calls).toEqual([
      { deckId: 'q4-review', action: 'assist.propose', input: propose.input, author: HUMAN },
    ]);
    expect(lines).toEqual(['assist.propose 200 0 ms deck=q4-review identity=anon_copper']);
    expect(lines[0]).not.toContain('shorter');
  });

  it('maps every error the module or the dispatcher throws to a status, a code and a sentence', async () => {
    const unavailable = Object.assign(new Error('The assistant is off on this Turboslide'), {
      name: 'AssistUnavailableError',
      status: 503,
    });
    const model = Object.assign(new Error('The assistant’s model answered 529'), {
      name: 'ModelCallError',
      status: 529,
    });
    const conflict = new ConflictError('the slide is held', {
      currentRevision: 9,
      holder: { kind: 'agent', name: 'other', runId: 'x' },
    });
    const cases: Array<[unknown, number, string]> = [
      [unavailable, 503, 'unavailable'],
      [model, 502, 'model'],
      [conflict, 409, 'conflict'],
      [
        new ForbiddenError('This proposal is not one the assistant made for this presentation'),
        403,
        'forbidden',
      ],
      [new NotImplementedError('assist.propose', 'GS6'), 501, 'not_implemented'],
      [new RangeError('No deck q4-review'), 404, 'unknown_deck'],
      [new TypeError('assist.propose: invalid input at /intent'), 400, 'invalid_input'],
      [new Error('ECONNRESET'), 500, 'error'],
    ];
    for (const [error, status, code] of cases) {
      const response = await handleAssistRequest(
        post(propose),
        deps({
          dispatch: async () => {
            throw error;
          },
        }),
      );
      expect(response.status).toBe(status);
      const body = (await response.json()) as {
        error: string;
        message: string;
        currentRevision?: number;
      };
      expect(body.error).toBe(code);
      expect(body.message).not.toMatch(/\n    at /);
      if (code === 'conflict') expect(body.currentRevision).toBe(9);
      if (code === 'error') expect(body.message).toBe('The assistant could not answer; try again');
    }
    expect(assistErrorResponse(unavailable).headers.get('retry-after')).toBe('60');
    expect(assistErrorResponse(model).headers.get('retry-after')).toBe('5');
  });
});
