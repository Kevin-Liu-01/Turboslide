import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

// MILESTONES M4 acceptance, agent-http.spec.ts: the hosted agent surface against a running studio.
// It posts a slide.update with a stale baseRevision and receives 409 with the current document,
// posts with a held lease and receives 409 with the holder's name, posts with force and succeeds,
// posts an unknown field and receives unknown_field with a pointer, posts without a token to a
// non-localhost host (X-Forwarded-Host) and receives 401, reads the manifest and the action
// contract, and asserts the open editor shows the agent's write with the agent as author within
// one second (the store's watch channel, SPEC 6.7). The spec works on a scratch copy of
// decks/fixture under decks/e2e-agent so the committed decks keep their revision.
//
// Round three (gslides-parity SPEC-3 0.23, 7.7, 8.2; MILESTONES-3 B3 day 6): the identity rows
// at the end run against the builder's server on 4332 with `TURBOSLIDE_AUTH_DB` set: an API key
// minted through the identity database (e2e/identity-seed.mts) is accepted as the bearer, its
// writes are attributed to the key's registered name under `agent:<tokenId>` with the header's
// run id and `?author=` ignored, an unknown key and a revoked key answer 401 with no detail.
// The rows that need B4's day three wiring (the author derived from the session on the window
// transport, a key's scopes refusing `deck.remove` in enforce mode) are the round's `share.spec.ts`
// and `security.spec.ts`; `authorize()` runs in shadow mode on every server this round.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-agent';
const DECK_DIR = join(ROOT, 'decks', DECK);
const SLIDE = 'content-rule';
const AGENT = 'agent:e2e-agent';
const OTHER = 'agent:e2e-other';

type Conflict = {
  error: {
    name: string;
    status: number;
    code?: string;
    pointer?: string;
    currentRevision?: number;
    current?: { deck: { revision: number }; slides: Record<string, unknown> };
    holder?: { kind: string; name: string; runId?: string };
    message: string;
  };
};

type SlideResult = {
  slide: { id: string; slots: { left: { id: string; text?: string }[] } };
  revision: number;
};

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as { id: string };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), { recursive: true, force: true });
}

function revisionOnDisk(): number {
  return (JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as { revision: number })
    .revision;
}

async function post(
  request: APIRequestContext,
  action: string,
  body: unknown,
  options: { author?: string; query?: string; headers?: Record<string, string> } = {},
) {
  return request.post(`/api/actions/${action}?deck=${DECK}${options.query ?? ''}`, {
    data: body,
    headers: { 'x-turboslide-author': options.author ?? AGENT, ...(options.headers ?? {}) },
  });
}

function setHeading(text: string) {
  return { op: 'block.set', slideId: SLIDE, blockId: 'h', path: '/text', value: text };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  seedDeck();
});

test.afterAll(() => {
  removeDeck();
});

test('the manifest and the action contract describe this instance', async ({ request }) => {
  const manifest = (await (await request.get(`/api/agent?deck=${DECK}`)).json()) as {
    actions: string[];
    implemented: string[];
    execution: { http: { path: string } };
    auth: { required: boolean };
    http: { implemented: string[] };
  };
  expect(manifest.execution.http.path).toBe('/api/actions/<id>');
  expect(manifest.auth.required).toBe(false);
  for (const id of [
    'deck.info',
    'slide.list',
    'slide.get',
    'slide.update',
    'slide.replace',
    'block.set',
    'slide.lease',
    'lint.run',
    'fix.run',
    'version.save',
    'version.list',
    'render.slide',
    'validate.run',
  ])
    expect(manifest.http.implemented, id).toContain(id);
  expect(manifest.actions).toContain('view.goto');
  const contract = (await (await request.get(`/api/actions/slide.update?deck=${DECK}`)).json()) as {
    id: string;
    implemented: boolean;
    input: { required: string[] };
  };
  expect(contract.id).toBe('slide.update');
  expect(contract.implemented).toBe(true);
  expect(contract.input.required).toContain('baseRevision');
  const info = (await (await post(request, 'deck.info', {})).json()) as {
    id: string;
    revision: number;
  };
  expect(info.id).toBe(DECK);
  expect(info.revision).toBe(revisionOnDisk());
});

test('a stale baseRevision is 409 with the current document', async ({ request }) => {
  const current = revisionOnDisk();
  const response = await post(request, 'slide.update', {
    slideId: SLIDE,
    baseRevision: current + 5,
    mutations: [setHeading('Stale')],
  });
  expect(response.status()).toBe(409);
  const body = (await response.json()) as Conflict;
  expect(body.error.name).toBe('ConflictError');
  expect(body.error.currentRevision).toBe(current);
  expect(body.error.current?.deck.revision).toBe(current);
  expect(body.error.current?.slides[SLIDE]).toBeDefined();
  expect(revisionOnDisk()).toBe(current);
});

test('a held lease is 409 with the holder, and force writes past it', async ({ request }) => {
  const lease = await post(
    request,
    'slide.lease',
    { slideId: SLIDE, minutes: 5 },
    { author: OTHER },
  );
  expect(lease.status()).toBe(200);
  expect((await lease.json()) as { holder: { runId: string } }).toMatchObject({
    holder: { kind: 'agent', runId: 'e2e-other' },
  });
  const current = revisionOnDisk();
  const refused = await post(request, 'slide.update', {
    slideId: SLIDE,
    baseRevision: current,
    mutations: [setHeading('Leased')],
  });
  expect(refused.status()).toBe(409);
  const body = (await refused.json()) as Conflict;
  expect(body.error.holder).toMatchObject({ kind: 'agent', runId: 'e2e-other' });
  expect(body.error.message).toContain('agent:e2e-other');
  expect(body.error.current?.deck.revision).toBe(current);
  expect(revisionOnDisk()).toBe(current);
  const forced = await post(
    request,
    'slide.update',
    { slideId: SLIDE, baseRevision: current, mutations: [setHeading('Forced through')] },
    { query: '&force=1' },
  );
  expect(forced.status()).toBe(200);
  const result = (await forced.json()) as SlideResult;
  expect(result.revision).toBe(current + 1);
  expect(result.slide.slots.left.find((block) => block.id === 'h')?.text).toBe('Forced through');
  expect(revisionOnDisk()).toBe(current + 1);
  const released = await post(
    request,
    'slide.lease',
    { slideId: SLIDE, release: true },
    { author: OTHER },
  );
  expect(released.status()).toBe(200);
});

test('an unknown field is 400 with unknown_field and a pointer; off localhost without a token is 401', async ({
  request,
}) => {
  const current = revisionOnDisk();
  const extra = await post(request, 'slide.update', {
    slideId: SLIDE,
    baseRevision: current,
    mutations: [setHeading('Extra')],
    bogus: true,
  });
  expect(extra.status()).toBe(400);
  const body = (await extra.json()) as Conflict;
  expect(body.error).toMatchObject({
    name: 'TypeError',
    status: 400,
    code: 'unknown_field',
    pointer: '/bogus',
  });
  expect(revisionOnDisk()).toBe(current);
  const remote = await post(
    request,
    'deck.info',
    {},
    { headers: { 'x-forwarded-host': 'studio.example.com' } },
  );
  expect(remote.status()).toBe(401);
  expect(((await remote.json()) as Conflict).error.code).toBe('unauthorized');
  const remoteManifest = await request.get(`/api/agent?deck=${DECK}`, {
    headers: { 'x-forwarded-host': 'studio.example.com' },
  });
  expect(remoteManifest.status()).toBe(401);
  const windowOnly = await post(request, 'view.mode', { mode: 'grid' });
  expect(windowOnly.status()).toBe(404);
  expect(((await windowOnly.json()) as Conflict).error.code).toBe('not_on_http');
});

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=studio-e2e`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

test('the open editor shows the agent write with the agent as author within one second', async ({
  page,
  request,
}) => {
  await openEditor(page);
  // the editor sits on the first slide and holds its lease as studio-e2e; the agent writes to
  // another slide, so the lease rule stays intact and the change arrives over the watch channel
  const before = revisionOnDisk();
  /* the parity shell prints no revision (gslides-parity SPEC 1.1): describe().state carries it */
  await expect
    .poll(() => page.evaluate(() => window.turboslide!.studio.describe().state.revision as number))
    .toBe(before);
  const started = Date.now();
  const written = await post(request, 'slide.update', {
    slideId: SLIDE,
    baseRevision: before,
    mutations: [setHeading('Written by the agent')],
  });
  expect(written.status()).toBe(200);
  // Round three (gslides-parity SPEC-3 11.5 R4; MILESTONES-3 B2 day 4): the agent's write reaches
  // the open editor through the room, so the external revision banner of round one retires for an
  // edit that arrives live and stays for a resync; the budget of one second holds on the document
  // itself (the revision below) and the author is read from the version log
  await expect
    .poll(
      () => page.evaluate(() => window.turboslide!.studio.describe().state.revision as number),
      { timeout: 1000 },
    )
    .toBe(before + 1);
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(2000);
  // the document in the page is the server's: the window API reads the agent's heading back
  const heading = await page.evaluate(async (slideId) => {
    const result = (await window.turboslide!.studio.invoke('slide.get', { slideId })) as {
      slide: { slots: { left: { id: string; text?: string }[] } };
    };
    return result.slide.slots.left.find((block) => block.id === 'h')?.text;
  }, SLIDE);
  expect(heading).toBe('Written by the agent');
  // and the version log the editor shows names the agent
  const authors = await page.evaluate(async () => {
    const versions = (await window.turboslide!.studio.invoke('version.list')) as {
      author: { runId?: string };
    }[];
    return versions.map((version) => version.author.runId ?? '');
  });
  expect(authors).toContain('e2e-agent');
  // the view actions answer with the view state (SPEC 7.4): the theme and present mode round trip
  const view = await page.evaluate(async () => {
    const studio = window.turboslide!.studio;
    const themed = (await studio.invoke('view.theme', { theme: 'light' })) as { theme: string };
    const presenting = (await studio.invoke('view.present', { on: false })) as { present: boolean };
    const back = (await studio.invoke('view.theme', { theme: 'dark' })) as { theme: string };
    return { themed: themed.theme, presenting: presenting.present, back: back.theme };
  });
  expect(view).toEqual({ themed: 'light', presenting: false, back: 'dark' });
});

test.describe('API keys as the bearer (gslides-parity SPEC-3 0.23, 7.7, 8.2)', () => {
  // the database the server under test opened (TURBOSLIDE_AUTH_DB in the spec's environment; B3's
  // server on 4332 names `.turboslide/auth-b3.sqlite`, the check runner and playwright.config.ts
  // `.turboslide/auth.sqlite`), so the seed writes the key where the server reads it
  const AUTH_DB_RELATIVE = process.env.TURBOSLIDE_AUTH_DB ?? '.turboslide/auth.sqlite';
  const AUTH_DB = AUTH_DB_RELATIVE.startsWith('/')
    ? AUTH_DB_RELATIVE
    : join(ROOT, AUTH_DB_RELATIVE);
  const SEED = join(import.meta.dirname, 'identity-seed.mts');
  let key: { userId: string; tokenId: string; secret: string } | null = null;

  function seed(mode: string, ...args: string[]): Record<string, unknown> {
    const out = execFileSync('node', [SEED, mode, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out.trim().split('\n').pop() ?? '{}') as Record<string, unknown>;
  }

  test.beforeAll(async ({ request }) => {
    // the first request builds the identity runtime and migrates the database the seed writes
    const probe = await request.get('/api/auth/get-session', {
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    test.skip(
      probe.status() !== 200 || !existsSync(AUTH_DB),
      `the identity rows run against a server started with TURBOSLIDE_AUTH_DB=${AUTH_DB_RELATIVE} (MILESTONES-3 B3, port 4332; the check runner's server names .turboslide/auth.sqlite)`,
    );
    key = seed(
      'key',
      AUTH_DB,
      `e2e-agent-${Date.now()}@example.test`,
      'e2e-key',
      'read,write,export',
    ) as {
      userId: string;
      tokenId: string;
      secret: string;
    };
  });

  test('a key is accepted, its writes carry the registered name and the run id, and ?author= is ignored', async ({
    request,
  }) => {
    if (key === null) throw new Error('no key');
    const current = revisionOnDisk();
    const written = await request.post(`/api/actions/slide.update?deck=${DECK}&author=kevin`, {
      data: { slideId: SLIDE, baseRevision: current, mutations: [setHeading('Written by a key')] },
      headers: { authorization: `Bearer ${key.secret}`, 'x-turboslide-author': 'agent:run-9' },
    });
    expect(written.status()).toBe(200);
    expect(revisionOnDisk()).toBe(current + 1);
    const versions = (await (
      await request.post(`/api/actions/version.list?deck=${DECK}`, {
        data: {},
        headers: { authorization: `Bearer ${key.secret}` },
      })
    ).json()) as { author: { kind: string; name: string; runId?: string; principalId?: string } }[];
    const last = versions[versions.length - 1];
    expect(last?.author).toEqual({
      kind: 'agent',
      name: 'e2e-key',
      runId: 'run-9',
      principalId: `agent:${key.tokenId}`,
    });
    expect(JSON.stringify(versions)).not.toContain('"kevin"');
    // the manifest answers the key holder too
    const manifest = await request.get(`/api/agent?deck=${DECK}`, {
      headers: { authorization: `Bearer ${key.secret}` },
    });
    expect(manifest.status()).toBe(200);
  });

  test('an unknown key and a revoked key answer 401 with no detail; the header alone still names a run id on localhost', async ({
    request,
  }) => {
    if (key === null) throw new Error('no key');
    const unknown = await request.post(`/api/actions/deck.info?deck=${DECK}`, {
      data: {},
      headers: { authorization: 'Bearer ts_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    });
    expect(unknown.status()).toBe(401);
    const body = (await unknown.json()) as Conflict;
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.message).not.toContain('ts_AAAA');
    expect((seed('revoke', AUTH_DB, key.tokenId) as { revoked: boolean }).revoked).toBe(true);
    const revoked = await request.post(`/api/actions/deck.info?deck=${DECK}`, {
      data: {},
      headers: { authorization: `Bearer ${key.secret}` },
    });
    expect(revoked.status()).toBe(401);
    expect(((await revoked.json()) as Conflict).error.message).toMatch(/unknown or revoked/);
    // the round one form on a checkout: no bearer, the header names the run id
    const open = await post(request, 'deck.info', {}, { author: 'agent:e2e-agent' });
    expect(open.status()).toBe(200);
  });
});
