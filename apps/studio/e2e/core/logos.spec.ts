import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  agentHeaders,
  coverage,
  ctl,
  extraHTTPHeaders,
  invoke,
  isLocalBase,
  menuPath,
  newDeck,
  objectsOf,
  openEditor,
  ownerContext,
  settled,
  state,
  teardownAll,
  title,
  windowActions,
  clickCard,
  download,
  pdfImages,
  pngSize,
  slideOrder,
  zipEntriesRaw,
} from './lib';

// The logo picker's spec rows (docs/FEATURES.md 4.2, 4.7, 4.9, 4.11, 7.1 `logos.*` with the driver
// core/logos.spec.ts): the rows the walk probe cannot drive in one tab. The recents across two
// browser contexts, the mark route's headers and body, the refresh's dry run with the bearer and
// its 401, the fixture upstream (a 404 variant marked unavailable and a slug's takedown), the cache
// during an outage, the open licence cache rule, and the actions on the CLI, over HTTP and over
// MCP. One context for the file; the deck it makes is torn down through the product at the end.
//
// The two upstream rows form the fixture upstream project of FEATURES.md 4.9 and 7.2: they run
// against a deployment whose `TURBOSLIDE_LOGO_UPSTREAM` is `fixture` or `down`, which the spec
// reads from the product itself (the refresh's dry run names the upstream it read), and on any
// other origin they are recorded not driven with the unit tests named
// (apps/studio/src/server/logos.test.ts), the pattern of `assist.quota.429`. No environment
// variable is read here but PLAYWRIGHT_BASE_URL, VERCEL_OIDC_TOKEN and, for the bearer on a
// deployment, TURBOSLIDE_TOKEN (the rule of core/decks.spec.ts's teardown; never printed).
//
// The routes are B6's (`routes/api/logo.$.ts`), the dialog B1's, the menu row the integrator's by
// request; a control or a route that is not on the build skips with its id, which the gate reads
// as not driven with that reason (docs/PRODUCT.md 8.1).
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/logos.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
let browserRef: Browser;
const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  browserRef = browser;
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Logos spec deck');
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  try {
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
});

const base = (): string => new URL(page.url()).origin;
type Counts = {
  icons?: number;
  brands?: number;
  cachedMarks?: number;
  unavailable?: number;
  updatedAt?: string | null;
  lastError?: { at: string; status?: number; message: string };
  progress?: { done: number; total: number };
  upstream?: string;
  dropped?: string[];
  dryRun?: boolean;
  /** the build a refresh made, which a search names as `since` to read an index at least as new */
  builtAt?: string | null;
};
/** The refresh route's answer; `dryRun` reads the counts with no upstream fetch (4.2). */
async function refresh(
  dryRun: boolean,
): Promise<{ status: number; body: Counts | null; ms: number }> {
  const headers = agentHeaders(base());
  if (headers === null) return { status: 0, body: null, ms: 0 };
  const t0 = Date.now();
  const res = await page.request.post('/api/logo/refresh', {
    headers,
    data: { dryRun },
    timeout: 300_000,
    maxRedirects: 0,
  });
  const ms = Date.now() - t0;
  const body = (await res.json().catch(() => null)) as Counts | null;
  return { status: res.status(), body, ms };
}
/** Whether the logo routes are on this build: the dry run answers something other than 404. */
async function routeOnBuild(): Promise<{ on: boolean; status: number; body: Counts | null }> {
  const r = await refresh(true);
  return { on: r.status !== 404 && r.status !== 0, status: r.status, body: r.body };
}
const NOT_BUILT_ROUTE = 'not on this build: /api/logo (docs/FEATURES.md 4.2, B6)';
/**
 * `logo.search` over the dialog's own route. `since` names a refresh's `builtAt`: the answering
 * instance adopts the store's index when its held copy is older (docs/FEATURES.md 4.2; the fix
 * round's R17), so a read after a takedown measures the same day promise through the mechanism
 * the product offers and not the hour long hold of one instance.
 */
async function searchHttp(
  query: string,
  since?: string | null,
): Promise<{
  status: number;
  logos: {
    slug: string;
    title: string;
    licenceSentence?: string;
    variants?: Record<string, unknown>;
  }[];
  body: Record<string, unknown> | null;
}> {
  const res = await page.request.get(
    `/api/logo/search?q=${encodeURIComponent(query)}&limit=10${since ? `&since=${encodeURIComponent(since)}` : ''}`,
    {
      headers: extraHTTPHeaders,
      maxRedirects: 0,
    },
  );
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const logos = (body?.['logos'] as { slug: string; title: string }[] | undefined) ?? [];
  return { status: res.status(), logos, body };
}
/**
 * `logo.insert` for a setup or a driven step: the window transport when it carries the action,
 * else the route with the bearer (4.4, 4.11). Answers the route's status and body.
 */
async function insertLogo(
  input: Record<string, unknown>,
): Promise<{ how: string; status: number; body: Record<string, unknown> | null }> {
  const actions = await windowActions(page);
  const s = await settled(page);
  if (actions.has('logo.insert')) {
    try {
      const out = (await invoke(
        page,
        'logo.insert',
        { ...input, baseRevision: s.revision },
        90_000,
      )) as Record<string, unknown>;
      await settled(page);
      return { how: 'the window API', status: 200, body: out };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/NotImplemented|not implemented|lands in P1/i.test(message))
        return { how: 'the window API', status: 500, body: { error: message.split('\n')[0] } };
    }
  }
  const headers = agentHeaders(base());
  if (headers === null) return { how: 'no bearer for this origin', status: 0, body: null };
  const res = await page.request.post(`/api/logo/insert?deck=${encodeURIComponent(deck)}`, {
    headers,
    data: { ...input, baseRevision: s.revision },
    timeout: 90_000,
    maxRedirects: 0,
  });
  await settled(page).catch(() => undefined);
  return {
    how: 'POST /api/logo/insert',
    status: res.status(),
    body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
  };
}
/** Reaches Insert > Logo (the switch on when the row is parked); answers whether the dialog is drawn. */
async function openLogo(p: Page): Promise<{ open: boolean; switched: boolean }> {
  const present = async (): Promise<boolean> => {
    await ctl(p, 'menubar.insert').click();
    await p.locator('#ts-menu-insert').waitFor({ timeout: 8000 });
    const there = await ctl(p, 'menu.insert.logo')
      .isVisible()
      .catch(() => false);
    if (!there) {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(150);
      return false;
    }
    await ctl(p, 'menu.insert.logo').click();
    return ctl(p, 'dialog.logo')
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
  };
  if (await present()) return { open: true, switched: false };
  if ((await state(p)).settings?.['advancedTools'] !== true) {
    await menuPath(p, 'tools', 'tools.advancedTools');
    await p.waitForTimeout(300);
    const there = await present();
    if (!there) await menuPath(p, 'tools', 'tools.advancedTools').catch(() => undefined);
    return { open: there, switched: there };
  }
  return { open: false, switched: false };
}
/** Types a query into the open dialog and waits for its results; answers the result tiles' slugs. */
async function searchInDialog(p: Page, query: string): Promise<string[]> {
  await ctl(p, 'dialog.logo.search').click();
  await p.keyboard.press('Meta+a');
  await p.keyboard.type(query, { delay: 60 });
  await expect
    .poll(
      async () =>
        (await tilesOf(p)).some((tile) => tile.group === 'results') ||
        (await ctl(p, 'dialog.logo.empty')
          .isVisible()
          .catch(() => false)),
      { timeout: 15_000 },
    )
    .toBe(true);
  return (await tilesOf(p)).filter((tile) => tile.group === 'results').map((tile) => tile.slug);
}
async function tilesOf(p: Page): Promise<{ slug: string; group: string | null }[]> {
  return p.evaluate(() =>
    [...document.querySelectorAll('[data-control^="dialog.logo.tile."]')]
      .filter((e) => e.getClientRects().length > 0 && e.matches('button, [role="option"]'))
      .filter((e) => !/\.(paper|ink|pair|variants)$/.test(e.getAttribute('data-control') ?? ''))
      .map((e) => ({
        slug: (e.getAttribute('data-slug') ?? e.getAttribute('data-control') ?? '').replace(
          'dialog.logo.tile.',
          '',
        ),
        group:
          e
            .closest('[data-control^="dialog.logo.group."]')
            ?.getAttribute('data-control')
            ?.replace('dialog.logo.group.', '') ?? null,
      })),
  );
}
/** The pictures of a slide. */
async function pictures(p: Page, slideId: string) {
  return (await objectsOf(p, slideId)).filter((o) => o.type === 'shot' || o.type === 'picture');
}

test(title('logos.picker.recents'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  const opened = await openLogo(page);
  if (!opened.open)
    test.skip(
      true,
      'not on this build: insert.logo (docs/FEATURES.md 4.3, B1 by request in model.ts)',
    );
  const inserted: string[] = [];
  for (const slug of ['figma', 'vercel']) {
    if (inserted.length > 0) {
      const again = await openLogo(page);
      expect(again.open, 'the dialog opens again').toBe(true);
    }
    const results = await searchInDialog(page, slug);
    expect(results, `${slug} is a result`).toContain(slug);
    const before = (await pictures(page, slideId)).length;
    await ctl(page, `dialog.logo.tile.${slug}`).click();
    await expect
      .poll(async () => (await pictures(page, slideId)).length, { timeout: 30_000 })
      .toBe(before + 1);
    await expect(ctl(page, 'dialog.logo')).toHaveCount(0, { timeout: 10_000 });
    await settled(page);
    inserted.push(slug);
  }
  const third = await openLogo(page);
  expect(third.open).toBe(true);
  await page.waitForTimeout(400);
  const tiles = await tilesOf(page);
  const recent = tiles.filter((tile) => tile.group === 'recent').map((tile) => tile.slug);
  const firstGroup = tiles[0]?.group ?? null;
  await page.keyboard.press('Escape');
  await expect(ctl(page, 'dialog.logo')).toHaveCount(0, { timeout: 5000 });
  test.info().annotations.push({
    type: 'recent',
    description: `recent tiles ${recent.join(', ') || 'none'}; the first group drawn ${firstGroup ?? 'none'}`,
  });
  expect(recent.slice(0, 2).sort(), 'the Recent group lists the two inserts').toEqual([
    'figma',
    'vercel',
  ]);
  expect(firstGroup === 'recent' || firstGroup === 'brand', 'Recent comes before the results').toBe(
    true,
  );
  /* a new browser context: the cookie alone (the deck is this person's), no localStorage */
  const storage = await context.storageState();
  const fresh = await browserRef.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: storage.cookies, origins: [] },
  });
  try {
    const p2 = await fresh.newPage();
    await openEditor(p2, deck);
    const o2 = await openLogo(p2);
    expect(o2.open, 'the dialog opens in the new context').toBe(true);
    await p2.waitForTimeout(400);
    const recent2 = (await tilesOf(p2)).filter((tile) => tile.group === 'recent');
    const groupDrawn = await ctl(p2, 'dialog.logo.group.recent')
      .isVisible()
      .catch(() => false);
    await p2.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'new context',
      description: `recent tiles ${recent2.length}; group drawn ${groupDrawn}`,
    });
    expect(recent2.length, 'a new browser context lists no recent').toBe(0);
    if (opened.switched)
      await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
  } finally {
    await fresh.close();
  }
});

test(title('logos.route.mark-headers'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const route = await routeOnBuild();
  if (!route.on) test.skip(true, `${NOT_BUILT_ROUTE}; the dry run answered ${route.status}`);
  const res = await page.request.get('/api/logo/mark/figma/default.svg', {
    headers: extraHTTPHeaders,
    maxRedirects: 0,
  });
  const headers = res.headers();
  const body = await res.text();
  test.info().annotations.push({
    type: 'route',
    description: `${res.status()} ${headers['content-type'] ?? ''}; nosniff ${headers['x-content-type-options'] ?? 'none'}; corp ${headers['cross-origin-resource-policy'] ?? 'none'}; csp ${headers['content-security-policy'] ?? 'none'}; cache ${headers['cache-control'] ?? 'none'}; ${body.length} bytes`,
  });
  if (res.status() === 404 && /not in the index|no logo named|unknown/i.test(body))
    test.skip(
      true,
      `not driven: the index holds no figma on this base (${body.slice(0, 120)}); the unit tests of docs/FEATURES.md 7.3 cover the sanitizer (apps/studio/src/server/logos.test.ts)`,
    );
  expect(res.status(), 'the mark is served').toBe(200);
  expect(headers['content-type'] ?? '', 'image/svg+xml').toMatch(/^image\/svg\+xml/);
  expect(headers['x-content-type-options'], 'nosniff').toBe('nosniff');
  expect(headers['cross-origin-resource-policy'], 'same-site').toBe('same-site');
  expect(headers['content-security-policy'] ?? '', 'a sandbox policy').toMatch(/sandbox/);
  expect(body, 'no script').not.toMatch(/<script/i);
  expect(body, 'no on* attribute').not.toMatch(/\son[a-z]+\s*=/i);
  expect(body, 'no external href').not.toMatch(/(xlink:)?href\s*=\s*["'](?!#)/i);
});

test(title('logos.index.refresh-dry-run'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const local = isLocalBase(base());
  const headers = agentHeaders(base());
  if (headers === null)
    test.skip(
      true,
      'not driven: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json)',
    );
  const first = await refresh(true);
  if (first.status === 404)
    test.skip(true, `${NOT_BUILT_ROUTE}; POST /api/logo/refresh answered 404`);
  test.info().annotations.push({
    type: 'dry run',
    description: `${first.status} in ${first.ms} ms: ${JSON.stringify(first.body).slice(0, 300)}`,
  });
  expect(first.status, 'the dry run answers with the bearer').toBe(200);
  expect(first.ms, 'under 2 s').toBeLessThan(2000);
  const body = first.body ?? {};
  for (const key of ['icons', 'brands', 'cachedMarks', 'unavailable'])
    expect(typeof body[key as keyof Counts], key).toBe('number');
  expect('updatedAt' in body, 'updatedAt').toBe(true);
  expect(body.dryRun === undefined || body.dryRun === true, 'a dry run').toBe(true);
  /* no upstream fetch: a second dry run reads the same updatedAt and the same builtAt within 2 s */
  const second = await refresh(true);
  expect(second.status).toBe(200);
  expect(second.body?.updatedAt ?? null, 'the dry run rebuilt nothing').toBe(
    body.updatedAt ?? null,
  );
  expect(second.ms).toBeLessThan(2000);
  /* without a credential */
  const bare = await page.request.post('/api/logo/refresh', {
    headers: { ...extraHTTPHeaders, 'content-type': 'application/json' },
    data: { dryRun: true },
    maxRedirects: 0,
  });
  test.info().annotations.push({
    type: 'no credential',
    description: `${bare.status()} on ${local ? 'localhost (the checkout is an agent credential, agentAuth)' : 'the deployment'}`,
  });
  if (local)
    expect(
      [200, 401],
      'the localhost rule admits the checkout holder; a deployment answers 401',
    ).toContain(bare.status());
  else expect(bare.status(), 'without a credential the refresh answers 401').toBe(401);
  const wrong = await page.request.post('/api/logo/refresh', {
    headers: {
      ...extraHTTPHeaders,
      'content-type': 'application/json',
      authorization: 'Bearer not-the-secret-000000000000000000',
    },
    data: { dryRun: true },
    maxRedirects: 0,
  });
  expect(wrong.status(), 'a wrong secret answers 401').toBe(401);
});

test.describe('the fixture upstream project (docs/FEATURES.md 4.9, 7.2)', () => {
  test(title('logos.index.refresh-fixture'), async () => {
    test.setTimeout(300_000);
    await openEditor(page, deck);
    if (agentHeaders(base()) === null) test.skip(true, 'not driven: no bearer for this origin');
    const probe = await refresh(true);
    if (probe.status === 404)
      test.skip(true, `${NOT_BUILT_ROUTE}; POST /api/logo/refresh answered 404`);
    const upstream = probe.body?.upstream ?? null;
    if (upstream !== 'fixture')
      test.skip(
        true,
        `not driven: the index reads ${upstream ?? 'an upstream the dry run does not name'}, not the ten mark fixture (TURBOSLIDE_LOGO_UPSTREAM=fixture on a preview); the unit tests apps/studio/src/server/logos.test.ts cover the 404 marking and the takedown (docs/FEATURES.md 7.3)`,
      );
    const first = await refresh(false);
    test.info().annotations.push({
      type: 'refresh 1',
      description: `${first.status} in ${first.ms} ms: ${JSON.stringify(first.body).slice(0, 300)}`,
    });
    expect(first.status).toBe(200);
    /* the variant answering 404 (acme's wordmark): the mark route's fetch meets the 404 and the
       index marks it `unavailable`, so the tile's menu drops it (`variantAvailable`); the row reads
       the route, then the search answer's `unavailable` beside its `variants` */
    const wordmark = await page.request.get('/api/logo/mark/acme/wordmark.svg', {
      headers: extraHTTPHeaders,
      maxRedirects: 0,
    });
    const acme = await searchHttp('acme');
    const row = acme.logos.find((r) => r.slug === 'acme') as
      | {
          slug: string;
          variants?: Record<string, string>;
          unavailable?: Record<string, { reason?: string; status?: number }>;
        }
      | undefined;
    test.info().annotations.push({
      type: 'acme',
      description: `wordmark route ${wordmark.status()}; row ${JSON.stringify(row).slice(0, 400)}`,
    });
    expect(row, 'acme is in the index').toBeDefined();
    expect(wordmark.status(), 'the 404 variant is not served').not.toBe(200);
    const variantDropped =
      row?.variants?.['wordmark'] === undefined || row?.unavailable?.['wordmark'] !== undefined;
    expect(variantDropped, "the 404 variant is marked unavailable and out of the tile's menu").toBe(
      true,
    );
    const counted = await refresh(true);
    expect(counted.body?.unavailable ?? 0, 'the dry run counts it').toBeGreaterThan(0);
    /* the takedown: the fixture's manifest drops the slug once the index holds it (logo-index.ts
       fixtureUpstream), so the refresh that follows one that listed it takes it down; the first
       refresh of this row may already be that one when an earlier search built the index */
    const dropped = (first.body?.dropped ?? []).includes('northwind');
    let second: Awaited<ReturnType<typeof refresh>> | null = null;
    if (!dropped) {
      second = await refresh(false);
      test.info().annotations.push({
        type: 'refresh 2',
        description: `${second.status} in ${second.ms} ms: dropped ${JSON.stringify(second.body?.dropped ?? [])}`,
      });
      expect(second.status).toBe(200);
    }
    const takenDown = dropped || (second?.body?.dropped ?? []).includes('northwind');
    expect(takenDown, 'a refresh after the fixture dropped the slug reports it dropped').toBe(true);
    /* the read names the takedown's build, so an instance holding an older copy adopts it (R17) */
    const after = await searchHttp('northwind', (second ?? first).body?.builtAt ?? null);
    test.info().annotations.push({
      type: 'northwind',
      description: `after the takedown: ${after.logos.map((r) => r.slug).join(', ') || 'no row'}`,
    });
    expect(
      after.logos.map((r) => r.slug),
      'the dropped slug left the index',
    ).not.toContain('northwind');
    const file = await page.request.get('/api/logo/mark/northwind/default.svg', {
      headers: extraHTTPHeaders,
      maxRedirects: 0,
    });
    expect(file.status(), 'its cached file is gone from the route').not.toBe(200);
  });

  test(title('logos.index.cached-offline'), async () => {
    test.setTimeout(180_000);
    await openEditor(page, deck);
    if (agentHeaders(base()) === null) test.skip(true, 'not driven: no bearer for this origin');
    const probe = await refresh(true);
    if (probe.status === 404)
      test.skip(true, `${NOT_BUILT_ROUTE}; POST /api/logo/refresh answered 404`);
    const upstream = probe.body?.upstream ?? null;
    if (upstream !== 'down')
      test.skip(
        true,
        `not driven: the index reads ${upstream ?? 'an upstream the dry run does not name'}, not the outage (TURBOSLIDE_LOGO_UPSTREAM=down on a preview); the unit test apps/studio/src/server/logos.test.ts covers the cache during an outage (docs/FEATURES.md 7.3)`,
      );
    const search = await searchHttp('figma');
    test.info().annotations.push({
      type: 'offline',
      description: `${search.status}: ${search.logos.length} rows; updatedAt ${String(search.body?.['updatedAt'])}; lastError ${JSON.stringify(search.body?.['lastError'] ?? null)}`,
    });
    expect(search.status, 'logo.search answers from the cache').toBe(200);
    expect(
      search.logos.map((r) => r.slug),
      'figma from the cache',
    ).toContain('figma');
    expect(search.body?.['lastError'], 'the failure is recorded').toBeDefined();
    /* a cached mark inserts (read before the foot, so the outage's core claim is driven whatever the
       foot says) */
    const slideId = (await state(page)).slideId;
    const before = (await pictures(page, slideId)).length;
    const insert = await insertLogo({ slug: 'figma', slideId });
    test.info().annotations.push({
      type: 'insert',
      description: `${insert.how} ${insert.status}: ${JSON.stringify(insert.body).slice(0, 200)}`,
    });
    expect(insert.status, 'a cached mark inserts during the outage').toBe(200);
    await expect
      .poll(async () => (await pictures(page, slideId)).length, { timeout: 30_000 })
      .toBe(before + 1);
    /* the foot names the date and the failure once a search has brought the index facts (the
       dialog reads updatedAt and lastError from logo.search's answer; at the open it names the
       source alone: the outage preview's first run read "Logos from thesvg.org. Brand marks
       belong to their owners" before any search, the integrator, ship one) */
    const opened = await openLogo(page);
    if (opened.open) {
      await searchInDialog(page, 'figma').catch(() => undefined);
      const foot = await ctl(page, 'dialog.logo.source')
        .textContent()
        .catch(() => null);
      await page.keyboard.press('Escape');
      test.info().annotations.push({ type: 'foot', description: foot ?? 'none' });
      expect(foot ?? '', 'the foot names thesvg.org').toMatch(/thesvg\.org/);
      expect(foot ?? '', 'the foot names the failure').toMatch(/did not answer/);
      if (opened.switched)
        await menuPath(page, 'tools', 'tools.advancedTools').catch(() => undefined);
    }
  });
});

test(title('logos.cache.open-licence-only'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  if (agentHeaders(base()) === null) test.skip(true, 'not driven: no bearer for this origin');
  const probe = await refresh(true);
  if (probe.status === 404)
    test.skip(true, `${NOT_BUILT_ROUTE}; POST /api/logo/refresh answered 404`);
  const slideId = (await state(page)).slideId;
  const figmaBefore = await page.request.get('/api/logo/mark/figma/default.svg', {
    headers: extraHTTPHeaders,
    maxRedirects: 0,
  });
  const cachedBefore = probe.body?.cachedMarks ?? 0;
  const figma = await insertLogo({ slug: 'figma', slideId });
  test.info().annotations.push({
    type: 'figma',
    description: `${figma.how} ${figma.status}: ${JSON.stringify(figma.body).slice(0, 200)}; the mark route before ${figmaBefore.status()}`,
  });
  if (figma.status === 501 || /NotImplemented/i.test(JSON.stringify(figma.body ?? {})))
    test.skip(
      true,
      'not on this build: logo.insert on the window transport and the route (docs/FEATURES.md 4.4, B6 with B7)',
    );
  expect(figma.status, 'the Figma insert').toBe(200);
  const afterFigma = await refresh(true);
  const cachedAfter = afterFigma.body?.cachedMarks ?? 0;
  const file = await page.request.get('/api/logo/mark/figma/default.svg', {
    headers: extraHTTPHeaders,
    maxRedirects: 0,
  });
  const svg = await file.text();
  test.info().annotations.push({
    type: 'cache',
    description: `cachedMarks ${cachedBefore} -> ${cachedAfter}; the mark route ${file.status()}, desc ${/<desc>/.test(svg)}`,
  });
  expect(file.status()).toBe(200);
  expect(svg, 'the attribution desc').toMatch(/<desc>[^<]*thesvg\.org[^<]*<\/desc>/);
  /* the Figma mark may have been cached before this insert by an earlier insert on the shared store: the count rose, or the file was already cached */
  expect(
    cachedAfter >= cachedBefore + 1 || figmaBefore.status() === 200,
    'the CC0 mark is cached once',
  ).toBe(true);
  /* an AWS mark (CC BY-ND): fetched, never cached */
  const aws = await searchHttp('aws');
  const slug = aws.logos.find((r) => /^aws/.test(r.slug))?.slug ?? null;
  if (slug === null) {
    const all = await page.request.get('/api/logo/search?q=aws&collection=all&limit=5', {
      headers: extraHTTPHeaders,
      maxRedirects: 0,
    });
    const body = (await all.json().catch(() => null)) as { logos?: { slug: string }[] } | null;
    const cloud = body?.logos?.find((r) => /^aws/.test(r.slug))?.slug ?? null;
    if (cloud === null)
      test.skip(
        true,
        'not driven: no AWS mark in this index (the fixture carries aws-amazon-ec2 under the cloud collection)',
      );
    const inserted = await insertLogo({ slug: cloud, slideId });
    test.info().annotations.push({
      type: 'aws',
      description: `${cloud}: ${inserted.how} ${inserted.status}: ${JSON.stringify(inserted.body).slice(0, 300)}`,
    });
    expect(inserted.status).toBe(200);
    const afterAws = await refresh(true);
    expect(afterAws.body?.cachedMarks ?? 0, 'the CC BY-ND mark is not cached').toBe(cachedAfter);
    const route = await page.request.get(`/api/logo/mark/${cloud}/default.svg`, {
      headers: extraHTTPHeaders,
      maxRedirects: 0,
    });
    expect(route.status(), 'the route still serves it from a fetch').toBe(200);
  } else {
    const inserted = await insertLogo({ slug, slideId });
    test.info().annotations.push({
      type: 'aws',
      description: `${slug}: ${inserted.how} ${inserted.status}: ${JSON.stringify(inserted.body).slice(0, 300)}`,
    });
    expect(inserted.status).toBe(200);
    const afterAws = await refresh(true);
    expect(afterAws.body?.cachedMarks ?? 0, 'the CC BY-ND mark is not cached').toBe(cachedAfter);
    const route = await page.request.get(`/api/logo/mark/${slug}/default.svg`, {
      headers: extraHTTPHeaders,
      maxRedirects: 0,
    });
    expect(route.status()).toBe(200);
  }
});

test(title('logos.agent.search-insert'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  const maybeHeaders = agentHeaders(base());
  if (maybeHeaders === null) test.skip(true, 'not driven: no bearer for this origin');
  const headers = maybeHeaders as Record<string, string>;
  const probe = await refresh(true);
  if (probe.status === 404)
    test.skip(true, `${NOT_BUILT_ROUTE}; POST /api/logo/refresh answered 404`);
  const slideId = (await state(page)).slideId;
  /* the CLI: turboslide logo search figma against this origin */
  const cli = spawnSync(
    'node',
    ['apps/cli/bin/turboslide.mjs', 'logo', 'search', 'figma', '--host', base(), '--json'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        ...(headers.authorization
          ? { TURBOSLIDE_TOKEN: headers.authorization.replace(/^Bearer /, '') }
          : {}),
      },
    },
  );
  const cliOut = `${cli.stdout ?? ''}${cli.stderr ?? ''}`;
  test.info().annotations.push({
    type: 'cli',
    description: `exit ${cli.status}: ${cliOut.replace(/\s+/g, ' ').slice(0, 300)}`,
  });
  if (
    cli.status !== 0 &&
    /unknown command|Unknown command|not a command|Usage|usage/i.test(cliOut) &&
    !/figma/i.test(cliOut)
  )
    test.skip(
      true,
      'not on this build: the CLI command turboslide logo search (docs/FEATURES.md 4.11, B6)',
    );
  expect(cli.status, 'the CLI lists the row').toBe(0);
  expect(cliOut, 'Figma with its licence sentence').toMatch(/figma/i);
  expect(cliOut).toMatch(/Free to use/);
  /* HTTP: logo.insert with the bearer */
  const info0 = (await invoke(page, 'deck.info')) as {
    counts: { assets: number };
    revision: number;
  };
  const http = await page.request.post(
    `/api/actions/logo.insert?deck=${encodeURIComponent(deck)}`,
    {
      headers,
      data: { slug: 'figma', slideId, baseRevision: info0.revision },
      timeout: 90_000,
      maxRedirects: 0,
    },
  );
  const httpBody = (await http.json().catch(() => null)) as Record<string, unknown> | null;
  test.info().annotations.push({
    type: 'http',
    description: `${http.status()}: ${JSON.stringify(httpBody).slice(0, 200)}`,
  });
  if (http.status() === 501)
    test.skip(
      true,
      'not on this build: logo.insert on the HTTP transport (docs/FEATURES.md 4.11, B7 registers it)',
    );
  expect(http.status(), 'logo.insert over HTTP').toBe(200);
  await expect
    .poll(
      async () =>
        ((await invoke(page, 'deck.info')) as { counts: { assets: number } }).counts.assets,
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(info0.counts.assets + 1);
  /* MCP: deck_logo_insert over the streamable HTTP transport */
  const info1 = (await invoke(page, 'deck.info')) as {
    counts: { assets: number };
    revision: number;
  };
  const mcpHeaders = { ...headers, accept: 'application/json, text/event-stream' };
  const init = await page.request.post(`/mcp?deck=${encodeURIComponent(deck)}`, {
    headers: mcpHeaders,
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'core-spec', version: '1' },
      },
    },
    maxRedirects: 0,
  });
  const session = init.headers()['mcp-session-id'];
  test.info().annotations.push({
    type: 'mcp init',
    description: `${init.status()} session ${session ? 'given' : 'none'}`,
  });
  expect(init.status(), 'MCP initialize').toBe(200);
  expect(session, 'an mcp-session-id').toBeDefined();
  await page.request.post(`/mcp?deck=${encodeURIComponent(deck)}`, {
    headers: { ...mcpHeaders, 'mcp-session-id': session! },
    data: { jsonrpc: '2.0', method: 'notifications/initialized' },
    maxRedirects: 0,
  });
  const call = await page.request.post(`/mcp?deck=${encodeURIComponent(deck)}`, {
    headers: { ...mcpHeaders, 'mcp-session-id': session! },
    data: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'deck_logo_insert',
        arguments: { slug: 'vercel', slideId, baseRevision: info1.revision },
      },
    },
    timeout: 90_000,
    maxRedirects: 0,
  });
  const text = await call.text();
  const payload =
    text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n') || text;
  test.info().annotations.push({
    type: 'mcp call',
    description: `${call.status()}: ${payload.replace(/\s+/g, ' ').slice(0, 300)}`,
  });
  expect(call.status(), 'tools/call').toBe(200);
  expect(payload, 'no tool error').not.toMatch(/"isError":\s*true|Unknown tool|not implemented/i);
  await expect
    .poll(
      async () =>
        ((await invoke(page, 'deck.info')) as { counts: { assets: number } }).counts.assets,
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(info1.counts.assets + 1);
  await page.request
    .delete(`/mcp`, { headers: { ...mcpHeaders, 'mcp-session-id': session! }, maxRedirects: 0 })
    .catch(() => undefined);
});

/**
 * The vector round (docs/VECTOR.md 4.6; the row `logos.export.svgblip`): a logo inserted from the
 * picker is an svg asset, so the Editable text file's logo `p:pic` carries `asvg:svgBlip` beside
 * its 3x PNG blip, the Perfect file's title and footer logo objects carry it too once the kit's
 * mark is that logo (`logo.insert { everySlide: true }` writes the kit's slots, the setup write),
 * and the PDF page holds no image XObject for the logo. The insert is B6's action of ship one; a
 * build without it on the window transport skips.
 */
test(title('logos.export.svgblip'), async () => {
  test.setTimeout(420_000);
  await openEditor(page, deck);
  const first = (await slideOrder(page))[0]!;
  await clickCard(page, first);
  const actions = await windowActions(page);
  if (!actions.has('logo.insert'))
    test.skip(
      true,
      'not on this build: logo.insert on the window transport (docs/FEATURES.md 4.4, 4.11)',
    );
  const s = await settled(page);
  const countsBefore = ((await invoke(page, 'deck.info')) as { counts: { assets: number } }).counts
    .assets;
  try {
    await invoke(
      page,
      'logo.insert',
      { slug: 'figma', everySlide: true, baseRevision: s.revision },
      120_000,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NotImplemented|not implemented|lands in P1/i.test(message))
      test.skip(
        true,
        `not on this build: logo.insert (docs/FEATURES.md 4.4): ${message.slice(0, 100)}`,
      );
    if (/did not answer|thesvg\.org|upstream|index/i.test(message))
      test.skip(
        true,
        `not driven: the logo index answered "${message.slice(0, 120)}" on this base`,
      );
    throw error;
  }
  await settled(page);
  /* the kit's slots take the asset (everySlide writes the mark and the footer, no picture block),
     so the deck's asset count is what grows; a slide's referenced assets list only its blocks' */
  const countsAfter = ((await invoke(page, 'deck.info')) as { counts: { assets: number } }).counts
    .assets;
  const logoAssets = countsAfter - countsBefore;
  /** The download dialog with PowerPoint picked; File > Download > Download options, the type by default. */
  const openPptxDialog = async () => {
    await menuPath(page, 'file', 'file.download', 'file.download.options');
    await ctl(page, 'dialog.download.pptx').waitFor({ timeout: 8000 });
  };
  const closeDialog = async () => {
    for (let i = 0; i < 3; i += 1) {
      if ((await page.locator('.ts-dialog-scrim [role="dialog"]').count()) === 0) break;
      const done = page.locator(
        '[data-control="dialog.download.done"], [data-control="dialog.download.close"], [data-control="dialog.download.cancel"]',
      );
      if ((await done.count()) > 0)
        await done
          .first()
          .click({ timeout: 3000 })
          .catch(() => undefined);
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  };
  /** The inner .pptx of a download bundle and its slide parts with their rels. */
  const partsOf = (bytes: Buffer, mode: 'editable' | 'perfect') => {
    let entries = zipEntriesRaw(bytes);
    const names = [...entries.keys()];
    const inner =
      names.find((n) => new RegExp(`\\(light, ${mode}\\)\\.pptx$`).test(n)) ??
      names.find((n) => n.endsWith('.pptx'));
    if (inner !== undefined) entries = zipEntriesRaw(entries.get(inner)!());
    const parts = [...entries.keys()]
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort()
      .map((name) => ({
        name,
        xml: entries.get(name)!().toString('utf8'),
        rels:
          entries
            .get(name.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'))?.()
            .toString('utf8') ?? '',
      }));
    return { entries, parts };
  };
  const target = (rels: string, rId: string) =>
    new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ??
    new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rId}"`).exec(rels)?.[1] ??
    null;
  /** Every p:pic of a file with its blip and svgBlip targets and the PNG blip's size. */
  const picsOf = (bytes: Buffer, mode: 'editable' | 'perfect') => {
    const { entries, parts } = partsOf(bytes, mode);
    const out: {
      part: string;
      name: string;
      blip: string | null;
      svg: string | null;
      png: { width: number; height: number } | null;
    }[] = [];
    for (const part of parts)
      for (const pic of part.xml.match(/<p:pic>[\s\S]*?<\/p:pic>|<p:pic [\s\S]*?<\/p:pic>/g) ??
        []) {
        const blipId = /<a:blip[^>]*r:embed="([^"]+)"/.exec(pic)?.[1] ?? null;
        const svgId = /<asvg:svgBlip[^>]*r:embed="([^"]+)"/.exec(pic)?.[1] ?? null;
        const blip = blipId ? target(part.rels, blipId) : null;
        const svg = svgId ? target(part.rels, svgId) : null;
        const pngBytes = blip ? entries.get(`ppt/${blip.replace(/^\.\.\//, '')}`)?.() : undefined;
        out.push({
          part: part.name,
          name: /<p:cNvPr[^>]*name="([^"]*)"/.exec(pic)?.[1] ?? '',
          blip,
          svg,
          png: pngBytes ? pngSize(pngBytes) : null,
        });
      }
    return out;
  };
  /* the logo objects by name (b4.md R5): the kit's `#title-logo:` and `#footer-logo:` and a logo
     block's `#<blockId>:` (logo.insert names them logo, logo-2, …); the GT sprite mark of a deck
     without a picture mark is `#mark:`, a raster of the sheet's own svg and no asset */
  const isLogo = (p: { name: string }) => /#(title-logo|footer-logo|logo(-\d+)?):/.test(p.name);
  /* the Editable text file */
  await openPptxDialog();
  await ctl(page, 'dialog.download.mode.native').click({ force: true });
  const editable = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
  await closeDialog();
  const editablePics = picsOf(editable.bytes, 'editable').filter(isLogo);
  /* the Perfect file: the title and footer logo objects over the sheet raster */
  await openPptxDialog();
  await ctl(page, 'dialog.download.mode.flatten').click({ force: true });
  const perfect = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
  await closeDialog();
  const perfectPics = picsOf(perfect.bytes, 'perfect').filter((p) =>
    /#(title-logo|footer-logo):/.test(p.name),
  );
  /* the PDF: no image XObject for the logo */
  await menuPath(page, 'file', 'file.download', 'file.download.options');
  await ctl(page, 'dialog.download.type.pdf').waitFor({ timeout: 8000 });
  await ctl(page, 'dialog.download.type.pdf').click();
  await ctl(page, 'dialog.download.pdf').waitFor({ timeout: 8000 });
  const pdf = await download(page, () => ctl(page, 'dialog.download.ok').click(), 120_000);
  await closeDialog();
  const images = pdfImages(pdf.bytes);
  test.info().annotations.push({
    type: 'svgBlip',
    description: `logo assets added ${logoAssets} (${countsBefore} -> ${countsAfter}); Editable logo pics ${JSON.stringify(editablePics).slice(0, 400)}; Perfect small pics ${JSON.stringify(perfectPics).slice(0, 400)}; PDF image XObjects ${images}`,
  });
  expect(logoAssets, 'the insert added the logo asset').toBeGreaterThan(0);
  expect(editablePics.length, 'the Editable text file carries the logo picture').toBeGreaterThan(0);
  for (const p of editablePics) {
    expect(p.blip ?? '', `${p.name}: a PNG blip`).toMatch(/\.png$/i);
    /* the PNG blip is the object's own 3x shot (the footer's snapped box is 13 by 18, so 39 by 54;
       the title slot's 57 by 85, so 171 by 255); its size is the crisp row's claim
       (logos.export.pdf-pptx-crisp), this row's is that the vector sits beside a real PNG */
    expect(p.png !== null && p.png.width > 0, `${p.name}: a PNG blip beside the vector`).toBe(true);
    expect(p.svg ?? '', `${p.name}: asvg:svgBlip beside it`).toMatch(/\.svg$/i);
  }
  /* the title slot draws the mark on a title slide and the footer on every slide: at least the footer's object */
  expect(perfectPics.length, "the Perfect file's kit logo objects").toBeGreaterThanOrEqual(1);
  for (const p of perfectPics)
    expect(p.svg ?? '', `${p.name}: asvg:svgBlip on the kit's logo object`).toMatch(/\.svg$/i);
  expect(images, 'the PDF holds no image XObject for the logo').toBe(0);
});

coverage(import.meta.filename, [
  'logos.picker.recents',
  'logos.route.mark-headers',
  'logos.index.refresh-dry-run',
  'logos.index.refresh-fixture',
  'logos.index.cached-offline',
  'logos.cache.open-licence-only',
  'logos.agent.search-insert',
  /* the vector round (docs/VECTOR.md 4.6, 6.1): the logo's vector export */
  'logos.export.svgblip',
]);
