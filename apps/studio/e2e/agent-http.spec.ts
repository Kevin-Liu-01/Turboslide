import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  await expect(page.locator('.ts-status')).toContainText(`r${before}`);
  const started = Date.now();
  const written = await post(request, 'slide.update', {
    slideId: SLIDE,
    baseRevision: before,
    mutations: [setHeading('Written by the agent')],
  });
  expect(written.status()).toBe(200);
  const banner = page.locator('.ts-banner[data-state="external"]');
  await expect(banner).toBeVisible({ timeout: 1000 });
  await expect(banner).toContainText(`r${before + 1}`);
  await expect(banner).toContainText('agent:e2e-agent');
  await expect(page.locator('.ts-status')).toContainText(`Saved · r${before + 1}`, {
    timeout: 1000,
  });
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
