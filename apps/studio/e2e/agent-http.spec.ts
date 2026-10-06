import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, request, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import {
  Scratch,
  agentHeaders,
  ctl,
  headingRun,
  invoke,
  isLocalBase,
  newDeck,
  ownerContext,
  placeBlock,
  settled,
  slideJson,
  slideOrder,
  state,
  teardownAll,
  typeInto,
} from './core/lib';
import { coreTitle } from './core/matrix';
import { THEME_IDS } from '@turboslide/schema/brand';
import { THEME_RECORDS } from '@turboslide/theme/themes';

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
//
// The realtime round (docs/REALTIME.md section 2, 5.1 R5): the matrix row
// realtime.agent.write-announced lives at the end of this file in its own describe, made from /new
// and run on every base the gate names; the seeded rows above skip off a checkout (a deployment's
// store is not the checkout's decks/ folder) with that reason, so a gate run on a preview or on
// production reads the one row and nothing else here fails for want of decks/e2e-agent.

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

/** The seeded rows run on a checkout alone: the deck under decks/e2e-agent is the file store's. */
const SEEDED_BASE = (process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321').replace(/\/$/, '');
const SEEDED = isLocalBase(SEEDED_BASE);
const SEEDED_SKIP = `the seeded rows run on a checkout's file store (decks/e2e-agent), not against ${SEEDED_BASE}`;

test.beforeAll(() => {
  if (SEEDED) seedDeck();
});

test.afterAll(() => {
  if (SEEDED) removeDeck();
});

test('the manifest and the action contract describe this instance', async ({ request }) => {
  test.skip(!SEEDED, SEEDED_SKIP);
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
  test.skip(!SEEDED, SEEDED_SKIP);
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
  test.skip(!SEEDED, SEEDED_SKIP);
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
  test.skip(!SEEDED, SEEDED_SKIP);
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
  test.skip(!SEEDED, SEEDED_SKIP);
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
    test.skip(!SEEDED, SEEDED_SKIP);
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

// ---------------------------------------------------------------------------------------------
// the realtime round (docs/REALTIME.md section 2, 3.3; the matrix row realtime.agent.write-announced,
// driver e2e/agent-http.spec.ts): a bearer write through POST /api/actions/text.set?deck=<id> while
// A's tab is open (REALTIME.md names text.set, which is not an action of the surface; the write is
// block.set with the path /text, the HTTP write the surface has); A's tab draws the agent banner within 1 s, Cmd+Z does not take the agent's
// write back, and the version row names the agent. A core row by its rules: the deck is made from
// /new by the test and torn down through the product, the bearer is the deployment's
// (~/.config/turboslide/hosts.json through lib's agentHeaders; none on localhost, whose surface is
// open) and nothing is seeded from disk. The describe runs in the default mode, apart from the
// serial seeded rows above, so a seeded row's failure off a checkout never skips it.

/** The heading of the first slide through the window API (the cover's field, or its heading block once converted). */
async function headingOf(p: Page): Promise<string> {
  const first = (await slideOrder(p))[0]!;
  const got = await slideJson(p, first);
  if (got['kind'] === 'title') return String(got['heading'] ?? '').replace(/\u00a0/g, ' ');
  const grammar = got['grammar'] as { slots?: { main?: string[] } } | undefined;
  const id = grammar?.slots?.main?.[1] ?? 'heading';
  const main = ((got['slots'] as { main?: { id: string; text?: unknown }[] } | undefined)?.main ??
    []) as { id: string; text?: unknown }[];
  return String(main.find((b) => b.id === id)?.text ?? '').replace(/\u00a0/g, ' ');
}

test.describe('the realtime round: the agent write announced in the open tab', () => {
  test.describe.configure({ mode: 'default' });

  test(coreTitle('realtime.agent.write-announced'), async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const base = (baseURL ?? 'http://localhost:4321').replace(/\/$/, '');
    const headers = agentHeaders(base, { 'x-turboslide-author': 'agent:realtime-row' });
    test.skip(
      headers === null,
      `not driven: no bearer for ${base} (TURBOSLIDE_TOKEN or the origin's row of ~/.config/turboslide/hosts.json), so the agent surface cannot write`,
    );
    if (headers === null) return;
    const scratch = new Scratch();
    const { context, page: A } = await ownerContext(browser);
    try {
      const deckId = await newDeck(A, scratch, 'Realtime agent write');
      await expect
        .poll(async () => (await state(A)).sync?.connected ?? false, { timeout: 45_000 })
        .toBe(true);
      const slideId = (await slideOrder(A))[0]!;
      /* the block the agent writes into, placed as the row's setup write */
      await placeBlock(A, slideId, {
        id: 'agent-target',
        type: 'text',
        text: 'Before the agent',
        pos: { x: 160, y: 520, w: 1280, h: 160 },
      });
      await settled(A);
      /* the seller's own last edit, so Cmd+Z has something of the seller's to take back: a word
         typed into the heading after the setup write (the first run's Cmd+Z undid the test's own
         block.insert and the block left the slide with the agent's text in it, the right
         behaviour read as the wrong one) */
      const heading = await headingRun(A);
      await typeInto(A, heading, 'Realtime agent write own');
      await settled(A);
      const api = await request.newContext();
      let status = 0;
      let answered = '';
      const before = (await state(A)).revision;
      const written = Date.now();
      try {
        const res = await api.post(
          `${base}/api/actions/block.set?deck=${encodeURIComponent(deckId)}`,
          {
            headers,
            data: {
              slideId,
              blockId: 'agent-target',
              path: '/text',
              value: 'Written by the agent',
              baseRevision: before,
            },
            timeout: 30_000,
            maxRedirects: 0,
          },
        );
        status = res.status();
        answered = (await res.text().catch(() => '')).slice(0, 200);
      } finally {
        await api.dispose().catch(() => undefined);
      }
      expect(status, `the agent's block.set /text is admitted (${answered})`).toBe(200);
      /* the banner: the snackbar's sentence names the agent within 1 s of the write */
      let bannerMs: number | null = null;
      let bannerText = '';
      await expect
        .poll(
          async () => {
            const text =
              (await ctl(A, 'snackbar')
                .textContent()
                .catch(() => '')) ?? '';
            if (/changed/.test(text) && bannerMs === null) {
              bannerMs = Date.now() - written;
              bannerText = text.trim();
            }
            return /changed/.test(text);
          },
          { timeout: 10_000, intervals: [50] },
        )
        .toBe(true)
        .catch(() => undefined);
      const textMs = await expect
        .poll(
          async () => JSON.stringify(await slideJson(A, slideId)).includes('Written by the agent'),
          { timeout: 5000 },
        )
        .toBe(true)
        .then(() => Date.now() - written)
        .catch(() => null);
      /* Cmd+Z on A's stage takes the seller's own last edit back (the heading's word) and never
         the agent's write: the block's text stays */
      await A.keyboard.press('Escape');
      await A.locator('.ts-stagewrap.ts-editor').click({ position: { x: 30, y: 30 } });
      await A.keyboard.press('Meta+z');
      await A.waitForTimeout(1500);
      const afterUndo = JSON.stringify(await slideJson(A, slideId)).includes(
        'Written by the agent',
      );
      const headingAfterUndo = await headingOf(A);
      /* the version row names the agent */
      await expect
        .poll(async () => (await state(A)).sync?.pending ?? 0, { timeout: 10_000 })
        .toBe(0);
      await A.waitForTimeout(2500);
      const versions = await invoke<{ author: { kind?: string; name?: string; runId?: string } }[]>(
        A,
        'version.list',
        {},
      );
      const agentRows = versions.filter((v) => v.author?.kind === 'agent');
      test.info().annotations.push({
        type: 'measure',
        description: `block.set /text answered ${status}; the text in A's document ${textMs ?? 'not within 5 s'} ms after the write; the banner ${bannerMs === null ? 'not drawn within 10 s' : `"${bannerText}" at ${bannerMs} ms`}; after Cmd+Z the agent's text ${afterUndo ? 'stays' : 'was taken back'} and the heading reads "${headingAfterUndo}" (the seller's own word ${/own/.test(headingAfterUndo) ? 'stays' : 'left'}); version rows by an agent ${agentRows.length} (${agentRows.map((v) => `${v.author.name ?? '?'}${v.author.runId ? ` run ${v.author.runId}` : ''}`).join(', ') || 'none'}) of ${versions.length}`,
      });
      expect(textMs, "the agent's text reaches A's document").not.toBeNull();
      expect(bannerMs, "A's tab draws the agent banner").not.toBeNull();
      expect(bannerMs!, 'within 1 s of the write').toBeLessThanOrEqual(1000);
      expect(afterUndo, "Cmd+Z does not take the agent's write back").toBe(true);
      expect(agentRows.length, 'the version row names the agent').toBeGreaterThan(0);
    } finally {
      try {
        await teardownAll(A, scratch);
      } finally {
        await context.close().catch(() => undefined);
      }
    }
  });
});

/*
 * The design round's theme library on the agent surface (docs/DESIGN.md 7.8, 11; lane D3): the
 * nine themes through `theme.list`, and `deck.set /theme` over HTTP with each id and the legacy
 * one, on a deck made from /new and torn down through the product. Runs on every base the gate
 * names, with the bearer off localhost.
 */
test.describe('the design round: the theme library on the agent surface', () => {
  test.describe.configure({ mode: 'default' });

  /** One POST to the surface: the status and the answer's own fields (bare or under `output`). */
  async function post(
    api: APIRequestContext,
    url: string,
    headers: Record<string, string>,
    data: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await api.post(url, { headers, data, timeout: 30_000, maxRedirects: 0 });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const body = (raw['output'] as Record<string, unknown> | undefined) ?? raw;
    return { status: res.status(), body };
  }

  test(coreTitle('themes.agent.theme-list'), async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const base = (baseURL ?? 'http://localhost:4321').replace(/\/$/, '');
    const headers = agentHeaders(base, { 'x-turboslide-author': 'agent:theme-row' });
    test.skip(
      headers === null,
      `not driven: no bearer for ${base} (TURBOSLIDE_TOKEN or the origin's row of ~/.config/turboslide/hosts.json)`,
    );
    if (headers === null) return;
    const scratch = new Scratch();
    const { context, page } = await ownerContext(browser);
    const api = await request.newContext();
    try {
      const listed = await post(api, `${base}/api/actions/theme.list`, headers, {});
      const themes = (listed.body['themes'] ?? []) as {
        id: string;
        name: string;
        defaultAppearance: string;
        tokens: { light: Record<string, string>; dark: Record<string, string> };
      }[];
      const deckId = await newDeck(page, scratch, 'Theme agent deck');
      await settled(page);
      const writes: string[] = [];
      for (const id of [...THEME_IDS, 'gt-ink-paper']) {
        const info = await post(
          api,
          `${base}/api/actions/deck.info?deck=${encodeURIComponent(deckId)}`,
          headers,
          {},
        );
        const set = await post(
          api,
          `${base}/api/actions/deck.set?deck=${encodeURIComponent(deckId)}`,
          headers,
          { path: '/theme', value: id, baseRevision: info.body['revision'] },
        );
        writes.push(`${id} ${set.status} ${String(set.body['value'])}`);
      }
      const after = await post(
        api,
        `${base}/api/actions/deck.info?deck=${encodeURIComponent(deckId)}`,
        headers,
        {},
      );
      test.info().annotations.push({
        type: 'themes',
        description: `theme.list ${listed.status}: ${themes.map((t) => `${t.id} (${t.name}, ${t.defaultAppearance}, light paper ${t.tokens?.light?.['paper']}, dark paper ${t.tokens?.dark?.['paper']}, ${Object.keys(t.tokens?.light ?? {}).length} tokens)`).join('; ')}; deck.set /theme ${writes.join('; ')}; deck.info theme ${String(after.body['theme'])}`,
      });
      expect(listed.status).toBe(200);
      expect(themes.map((t) => t.id)).toEqual([...THEME_IDS]);
      for (const record of THEME_RECORDS) {
        const row = themes.find((t) => t.id === record.id);
        expect(row?.name, record.id).toBe(record.name);
        expect(row?.defaultAppearance, record.id).toBe(record.defaultAppearance);
        expect(row?.tokens.light, record.id).toEqual(record.tokens.light);
        expect(row?.tokens.dark, record.id).toEqual(record.tokens.dark);
      }
      expect(writes).toEqual([
        ...THEME_IDS.map((id) => `${id} 200 ${id}`),
        'gt-ink-paper 200 general-translation',
      ]);
      expect(after.body['theme']).toBe('general-translation');
    } finally {
      await api.dispose().catch(() => undefined);
      try {
        await teardownAll(page, scratch);
      } finally {
        await context.close().catch(() => undefined);
      }
    }
  });
  /* DESIGN.md 7.3 (G9, G10): deck.create with a name and no `from` makes a deck from the
     deployment default in Simple, light; the contract's example and the `from` description lead
     with blank */
  test(coreTitle('themes.agent.create-default'), async ({ baseURL }) => {
    test.setTimeout(240_000);
    const base = (baseURL ?? 'http://localhost:4321').replace(/\/$/, '');
    const headers = agentHeaders(base, { 'x-turboslide-author': 'agent:theme-row' });
    test.skip(
      headers === null,
      `not driven: no bearer for ${base} (TURBOSLIDE_TOKEN or the origin's row of ~/.config/turboslide/hosts.json)`,
    );
    if (headers === null) return;
    const api = await request.newContext();
    const name = `Theme default deck ${Date.now().toString(36)}`;
    let made = '';
    try {
      const contract = (await (
        await api.get(`${base}/api/actions/deck.create`, { headers })
      ).json()) as {
        example?: { from?: string };
        input?: { required?: string[]; properties?: { from?: { description?: string } } };
      };
      const created = await post(api, `${base}/api/actions/deck.create`, headers, { name });
      made = String(created.body['deckId'] ?? '');
      const info = await post(
        api,
        `${base}/api/actions/deck.info?deck=${encodeURIComponent(made)}`,
        headers,
        {},
      );
      const defaults = info.body['defaults'] as { appearance?: string } | undefined;
      const description = contract.input?.properties?.from?.description ?? '';
      test.info().annotations.push({
        type: 'themes',
        description: `deck.create without from ${created.status} (${made}, from ${String(created.body['from'])}); deck.info theme ${String(info.body['theme'])}, appearance ${defaults?.appearance ?? 'none'}; the contract's example from ${contract.example?.from ?? 'none'}, from required ${String(contract.input?.required?.includes('from'))}, the description begins "${description.slice(0, 70)}"`,
      });
      expect(created.status).toBe(200);
      expect(created.body['from']).toBe('blank');
      expect(info.body['theme']).toBe('simple');
      expect(defaults?.appearance).toBe('light');
      expect(contract.example?.from).toBe('blank');
      expect(contract.input?.required ?? []).not.toContain('from');
      expect(description.indexOf("'blank'")).toBeGreaterThanOrEqual(0);
      expect(description.indexOf("'blank'")).toBeLessThan(description.indexOf("'gt-brand'"));
    } finally {
      if (made !== '') {
        const info = await post(
          api,
          `${base}/api/actions/deck.info?deck=${encodeURIComponent(made)}`,
          headers,
          {},
        ).catch(() => null);
        const revision = Number(info?.body['revision'] ?? 0);
        await post(api, `${base}/api/actions/deck.trash`, headers, {
          id: made,
          baseRevision: revision,
        }).catch(() => undefined);
        const after = await post(
          api,
          `${base}/api/actions/deck.info?deck=${encodeURIComponent(made)}`,
          headers,
          {},
        ).catch(() => null);
        await post(api, `${base}/api/actions/deck.remove`, headers, {
          id: made,
          confirm: true,
          baseRevision: Number(after?.body['revision'] ?? revision),
        }).catch(() => undefined);
      }
      await api.dispose().catch(() => undefined);
    }
  });
});
