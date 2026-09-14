// The HTTP transport end to end without a server (MILESTONES M4 item 1): the bearer rule, the
// request facts, the one error body, the size cap, the dispatch of a registered action, and the
// GET contract of an action.
import { ConflictError } from '@turboslide/schema/errors';
import { describe, expect, it } from 'vitest';

import { createDispatcher } from '../dispatch.ts';
import {
  authorize,
  isLocalHost,
  requestAuthor,
  requestDeckId,
  requestForce,
  requestHost,
} from './auth.ts';
import {
  effectiveHost,
  handleActionRequest,
  isLocalRequest,
  readJsonBody,
  trustsProxy,
} from './dispatch.ts';
import { errorBodyOf } from './errors.ts';
import { runtimeManifest } from './manifest.ts';

const LOCAL = 'http://localhost:4321';

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  base = LOCAL,
): Request {
  return new Request(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function dispatcher() {
  const d = createDispatcher();
  d.register('deck.info', () => ({
    id: 'fixture',
    title: 'Fixture',
    theme: 'gt-ink-paper',
    revision: 3,
    sections: [],
    counts: { slides: 0, sections: 0, assets: 0, htmlBlocks: 0 },
  }));
  d.register('slide.update', (input, context) => {
    const { baseRevision, slideId } = input as { baseRevision: number; slideId: string };
    if (baseRevision !== 3) {
      throw new ConflictError('stale', { currentRevision: 3, current: { deck: { revision: 3 } } });
    }
    if (slideId === 'leased' && context.force !== true) {
      throw new ConflictError(
        'Slide "leased" is leased by kevin until later; pass force to write anyway',
        {
          currentRevision: 3,
          current: { deck: { revision: 3 } },
          holder: { kind: 'human', name: 'kevin' },
        },
      );
    }
    return {
      slide: { schemaVersion: 1, id: slideId, kind: 'statement', big: 'x' },
      revision: 4,
      findings: [],
    };
  });
  return d;
}

describe('auth', () => {
  it('reads the host from X-Forwarded-Host, then Host, then the URL', () => {
    expect(requestHost(new Request(LOCAL, { headers: { host: 'localhost:4321' } }))).toBe(
      'localhost:4321',
    );
    expect(
      requestHost(
        new Request(LOCAL, {
          headers: { host: 'localhost:4321', 'x-forwarded-host': 'studio.example.com' },
        }),
      ),
    ).toBe('studio.example.com');
    expect(requestHost(new Request('http://studio.example.com/x'))).toBe('studio.example.com');
  });

  it('knows localhost in its forms', () => {
    for (const host of [
      'localhost',
      'localhost:4321',
      '127.0.0.1:4321',
      '[::1]:4321',
      '::1',
      'studio.localhost',
    ])
      expect(isLocalHost(host), host).toBe(true);
    for (const host of ['studio.example.com', '10.0.0.4:4321', 'localhost.example.com'])
      expect(isLocalHost(host), host).toBe(false);
  });

  it('is open on localhost without a token and closed elsewhere', () => {
    const local = new Request(LOCAL, { headers: { host: 'localhost:4321' } });
    expect(authorize(local, {})).toEqual({ ok: true, mode: 'localhost' });
    const remote = new Request(LOCAL, {
      headers: { host: 'localhost:4321', 'x-forwarded-host': 'studio.example.com' },
    });
    const refused = authorize(remote, {});
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/no TURBOSLIDE_TOKEN/);
  });

  it('requires the bearer token everywhere once it is set', () => {
    const env = { TURBOSLIDE_TOKEN: 'secret' };
    const bare = new Request(LOCAL, { headers: { host: 'localhost:4321' } });
    expect(authorize(bare, env).ok).toBe(false);
    const wrong = new Request(LOCAL, {
      headers: { host: 'localhost:4321', authorization: 'Bearer nope' },
    });
    expect(authorize(wrong, env).ok).toBe(false);
    const right = new Request('http://studio.example.com/api/actions/deck.info', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(authorize(right, env)).toEqual({ ok: true, mode: 'token' });
  });

  it('reads the author, the deck and force from the request', () => {
    const request = new Request(`${LOCAL}/api/actions/slide.update?deck=gt-brand&force=1`, {
      headers: { 'x-turboslide-author': 'agent:run-7' },
    });
    expect(requestAuthor(request)).toEqual({ kind: 'agent', name: 'agent', runId: 'run-7' });
    expect(requestDeckId(request, 'fixture')).toBe('gt-brand');
    expect(requestForce(request)).toBe(true);
    const plain = new Request(`${LOCAL}/api/actions/slide.update`);
    expect(requestAuthor(plain)).toEqual({ kind: 'agent', name: 'agent', runId: 'http' });
    expect(requestDeckId(plain, 'fixture')).toBe('fixture');
    expect(requestForce(plain)).toBe(false);
    expect(requestForce(new Request(LOCAL, { headers: { 'x-turboslide-force': 'true' } }))).toBe(
      true,
    );
    expect(() => requestDeckId(new Request(`${LOCAL}/?deck=Not%20A%20Slug`))).toThrow(RangeError);
  });
});

describe('the error body', () => {
  it('maps the error classes to statuses and carries the conflict fields', () => {
    expect(errorBodyOf(new RangeError('no slide'), 'slide.get')).toEqual({
      error: { name: 'RangeError', status: 404, message: 'no slide', action: 'slide.get' },
    });
    const conflict = errorBodyOf(
      new ConflictError('stale', {
        currentRevision: 9,
        current: { deck: {} },
        holder: { kind: 'human', name: 'kevin' },
      }),
    );
    expect(conflict.error).toMatchObject({
      name: 'ConflictError',
      status: 409,
      currentRevision: 9,
      current: { deck: {} },
      holder: { kind: 'human', name: 'kevin' },
    });
  });
});

describe('readJsonBody', () => {
  it('caps the body and wants one JSON object', async () => {
    const big = await readJsonBody(post('/x', `{"a":"${'x'.repeat(2000)}"}`), 1000);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.response.status).toBe(413);
    const declared = await readJsonBody(post('/x', '{}', { 'content-length': '5000000' }), 1000);
    expect(declared.ok).toBe(false);
    const notJson = await readJsonBody(post('/x', '{nope'), 1000);
    expect(notJson.ok).toBe(false);
    if (!notJson.ok)
      expect((await notJson.response.json()) as { error: { code: string } }).toMatchObject({
        error: { code: 'not_json', status: 400 },
      });
    const list = await readJsonBody(post('/x', '[1]'), 1000);
    expect(list.ok).toBe(false);
    const empty = await readJsonBody(post('/x', ''), 1000);
    expect(empty).toEqual({ ok: true, value: {} });
  });
});

describe('handleActionRequest', () => {
  const options = { dispatcher: dispatcher(), env: {}, defaultDeck: 'fixture' };

  it('refuses off localhost without a token, unknown actions and actions not on http', async () => {
    const remote = await handleActionRequest(
      post(
        '/api/actions/deck.info',
        {},
        { host: 'localhost:4321', 'x-forwarded-host': 'studio.example.com' },
      ),
      'deck.info',
      options,
    );
    expect(remote.status).toBe(401);
    expect(((await remote.json()) as { error: { code: string } }).error.code).toBe('unauthorized');
    const unknown = await handleActionRequest(
      post('/api/actions/deck.explode', {}),
      'deck.explode',
      options,
    );
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe(
      'unknown_action',
    );
    const windowOnly = await handleActionRequest(
      post('/api/actions/view.mode', {}),
      'view.mode',
      options,
    );
    expect(windowOnly.status).toBe(404);
    expect(((await windowOnly.json()) as { error: { code: string } }).error.code).toBe(
      'not_on_http',
    );
    const put = await handleActionRequest(
      new Request(`${LOCAL}/api/actions/deck.info`, { method: 'PUT' }),
      'deck.info',
      options,
    );
    expect(put.status).toBe(405);
  });

  it('dispatches, maps 409 with the current document and the holder, and honors force', async () => {
    const ok = await handleActionRequest(post('/api/actions/deck.info', {}), 'deck.info', options);
    expect(ok.status).toBe(200);
    expect((await ok.json()) as { id: string }).toMatchObject({ id: 'fixture', revision: 3 });
    const mutation = { op: 'slide.set', slideId: 'thesis', path: '/big', value: 'y' };
    const stale = await handleActionRequest(
      post('/api/actions/slide.update', {
        slideId: 'thesis',
        baseRevision: 1,
        mutations: [mutation],
      }),
      'slide.update',
      options,
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()) as unknown).toMatchObject({
      error: {
        name: 'ConflictError',
        status: 409,
        currentRevision: 3,
        current: { deck: { revision: 3 } },
      },
    });
    const leased = await handleActionRequest(
      post('/api/actions/slide.update', {
        slideId: 'leased',
        baseRevision: 3,
        mutations: [mutation],
      }),
      'slide.update',
      options,
    );
    expect(leased.status).toBe(409);
    expect((await leased.json()) as unknown).toMatchObject({
      error: { holder: { kind: 'human', name: 'kevin' } },
    });
    const forced = await handleActionRequest(
      post('/api/actions/slide.update?force=1', {
        slideId: 'leased',
        baseRevision: 3,
        mutations: [mutation],
      }),
      'slide.update',
      options,
    );
    expect(forced.status).toBe(200);
    expect((await forced.json()) as unknown).toMatchObject({ revision: 4 });
  });

  it('refuses an unknown field with unknown_field and a pointer, and a missing field with a pointer', async () => {
    const extra = await handleActionRequest(
      post('/api/actions/slide.update', {
        slideId: 'thesis',
        baseRevision: 3,
        mutations: [],
        bogus: 1,
      }),
      'slide.update',
      options,
    );
    expect(extra.status).toBe(400);
    expect((await extra.json()) as unknown).toMatchObject({
      error: { name: 'TypeError', status: 400, code: 'unknown_field', pointer: '/bogus' },
    });
    const missing = await handleActionRequest(
      post('/api/actions/slide.update', { slideId: 'thesis' }),
      'slide.update',
      options,
    );
    expect(missing.status).toBe(400);
    expect((await missing.json()) as unknown).toMatchObject({
      error: { code: 'invalid_input', pointer: '/baseRevision' },
    });
  });

  it('answers 501 for a declared action without a handler and describes an action on GET', async () => {
    const pending = await handleActionRequest(
      post('/api/actions/build.run', { out: 'x.html' }),
      'build.run',
      options,
    );
    expect(pending.status).toBe(501);
    expect((await pending.json()) as unknown).toMatchObject({
      error: { name: 'NotImplementedError', milestone: 'M1' },
    });
    const described = await handleActionRequest(
      new Request(`${LOCAL}/api/actions/slide.update`),
      'slide.update',
      options,
    );
    expect(described.status).toBe(200);
    const body = (await described.json()) as {
      id: string;
      implemented: boolean;
      input: { required: string[] };
    };
    expect(body.id).toBe('slide.update');
    expect(body.implemented).toBe(true);
    expect(body.input.required).toContain('baseRevision');
  });

  it('runtimeManifest lists what the instance implements and the execution rules', () => {
    const manifest = runtimeManifest({ dispatcher: dispatcher(), env: {}, now: () => 'now' });
    expect(manifest.implemented).toEqual(['deck.info', 'slide.update']);
    expect(manifest.http.implemented).toEqual(['deck.info', 'slide.update']);
    expect(
      manifest.notImplemented.some((row) => row.id === 'export.run' && row.milestone === 'M2'),
    ).toBe(true);
    expect(manifest.auth).toEqual({
      required: false,
      env: 'TURBOSLIDE_TOKEN',
      localhostOpen: true,
    });
    expect(manifest.execution.http.path).toBe('/api/actions/<id>');
    expect(manifest.actions).toContain('view.goto');
    expect(manifest.actionsByGroup.view).toContain('view.goto');
  });
});

describe('forwarded host trust (gslides-parity SPEC-3 8.8, TURBOSLIDE_TRUST_PROXY)', () => {
  it('reads the forwarded host only under trust, and lets a public forwarded name refuse either way', () => {
    const spoof = new Request(LOCAL, {
      headers: { host: 'studio.example.com', 'x-forwarded-host': 'localhost' },
    });
    expect(trustsProxy({})).toBe(false);
    expect(effectiveHost(spoof, {})).toBe('studio.example.com');
    expect(isLocalRequest(spoof, {})).toBe(false);
    expect(isLocalRequest(spoof, { TURBOSLIDE_TRUST_PROXY: '1' })).toBe(true);
    const narrowed = new Request(LOCAL, {
      headers: { host: 'localhost:4321', 'x-forwarded-host': 'studio.example.com' },
    });
    expect(isLocalRequest(narrowed, {})).toBe(false);
    expect(isLocalRequest(new Request(LOCAL, { headers: { host: 'localhost:4321' } }), {})).toBe(
      true,
    );
  });

  it('refuses a spoofed localhost on the action route without a token, and serves it once trusted', async () => {
    const d = dispatcher();
    const spoofed = post(
      '/api/actions/deck.info',
      {},
      {
        host: 'studio.example.com',
        'x-forwarded-host': 'localhost',
      },
    );
    const refused = await handleActionRequest(spoofed, 'deck.info', { dispatcher: d, env: {} });
    expect(refused.status).toBe(401);
    const body = (await refused.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).toMatch(/studio\.example\.com/);
    const trusted = await handleActionRequest(
      post(
        '/api/actions/deck.info',
        {},
        {
          host: 'studio.example.com',
          'x-forwarded-host': 'localhost',
        },
      ),
      'deck.info',
      { dispatcher: d, env: { TURBOSLIDE_TRUST_PROXY: '1' } },
    );
    expect(trusted.status).toBe(200);
    // a plain localhost request is unchanged
    const plain = await handleActionRequest(
      post('/api/actions/deck.info', {}, { host: 'localhost:4321' }),
      'deck.info',
      { dispatcher: d, env: {} },
    );
    expect(plain.status).toBe(200);
    // with a token the bearer decides and the forwarded host is not consulted
    const tokened = await handleActionRequest(
      post(
        '/api/actions/deck.info',
        {},
        {
          host: 'studio.example.com',
          'x-forwarded-host': 'localhost',
          authorization: 'Bearer secret',
        },
      ),
      'deck.info',
      { dispatcher: d, env: { TURBOSLIDE_TOKEN: 'secret' } },
    );
    expect(tokened.status).toBe(200);
  });
});
