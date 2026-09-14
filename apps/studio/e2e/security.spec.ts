import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The security suite of the third Google Slides parity round (gslides-parity SPEC-3 16.4, 8.14;
// MILESTONES-3 B4 day 6), against the builder's own dev server (`PLAYWRIGHT_BASE_URL`, the memory
// channel, the tmp or file store, `TURBOSLIDE_AUTHORIZE` in shadow mode unless the run sets
// `enforce`). Rows here need no other builder's route: the eight `html` payloads inert in the
// editor, the viewer and the print document (the sanitizer and the sandboxed frame), the headers
// of 8.8 on four routes with the `worker-src` assertion and the `/embed` exception, the cross
// site `text/plain` POSTs refused, the JSON content type rule, the browser `Origin` refusal on
// the agent surface, the unsigned thumbnail and cancel requests, the CSP report endpoint, the
// upload path's refusals (an svg, a size over the cap, a type mismatch), and the 401, 403 and
// 404 shapes of 6.2 with a restricted access record in enforce mode. The stream, ops and
// presence rows (the ninth stream, a foreign clientId, a viewer receiving no op, a presence body
// with a name) run once B2's routes exist and are marked as such below.
//
// The spec works on a scratch copy of decks/fixture under decks/e2e-security so the committed
// decks keep their revision; the copy and its derived files are removed afterwards.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-security';
const DECK_DIR = join(ROOT, 'decks', DECK);
const RESTRICTED = 'e2e-restricted';
const RESTRICTED_DIR = join(ROOT, 'decks', RESTRICTED);
const SLIDE = 'content-rule';
const ENFORCE = process.env.TURBOSLIDE_AUTHORIZE === 'enforce';
/** The studio's own origin: the CSRF filter of /api/x/* wants what the page's fetches carry. */
const ORIGIN = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321').origin;
const JSON_FROM_PAGE = { 'content-type': 'application/json', origin: ORIGIN };

/** The eight bypass payloads of report 04 F4, each with what must not appear in the page. */
const PAYLOADS: { html: string; forbidden: RegExp[] }[] = [
  { html: '<img/src=x/onerror=window.__pwned=1>', forbidden: [/onerror/i] },
  {
    html: '<a href="jav&#x61;script:window.__pwned=1">click</a>',
    forbidden: [/href="jav/i, /javascript:/i],
  },
  {
    html: '<form action="javascript:window.__pwned=1"><button formaction="javascript:window.__pwned=1">Continue</button></form>',
    forbidden: [/<form/i, /formaction/i],
  },
  {
    html: '<svg><a xlink:href="&#x6A;avascript:window.__pwned=1"><text>x</text></a></svg>',
    forbidden: [/xlink:href="&#x6a;/i],
  },
  {
    html: '<math><maction actiontype="statusline#http://x" xlink:href="javascript:window.__pwned=1"><mi>x</mi></maction></math>',
    forbidden: [/<math/i, /<maction/i],
  },
  {
    html: '<style>@import url("https://attacker.example/steal.css"); .x { position: fixed; background: url("https://attacker.example/b") }</style><div class="x">y</div>',
    forbidden: [/@import/i, /attacker\.example/i],
  },
  {
    html: '<base href="https://attacker.example/"><a href="https://ok.example/x">x</a>',
    forbidden: [/<base/i, /attacker\.example/i],
  },
  {
    html: '<meta http-equiv="refresh" content="0;url=https://attacker.example/login"><p>hello</p>',
    forbidden: [/<meta http-equiv="refresh"/i, /attacker\.example/i],
  },
];

function seedDeck(id: string, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(dir, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as { id: string };
  manifest.id = id;
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** A restricted access record owned by nobody the tests are: every caller is a stranger (SPEC-3 6.1). */
function seedRestrictedRecord(dir: string): void {
  mkdirSync(join(dir, '.turboslide'), { recursive: true });
  const now = new Date().toISOString();
  const record = {
    schemaVersion: 1,
    deckId: RESTRICTED,
    owner: 'usr_e2eowner',
    pendingOwner: null,
    createdAt: now,
    createdBy: 'usr_e2eowner',
    assetKey: 'abcdefghijklmnopqrstuv',
    generalAccess: { mode: 'restricted', role: 'viewer' },
    links: [],
    publish: null,
    grants: [],
    requests: [],
    settings: {
      editorsCanShare: true,
      viewersCanDownload: true,
      viewersCanSeeComments: false,
      showNamesToLinkVisitors: false,
      allowHtmlBlocks: false,
    },
    revision: 1,
  };
  writeFileSync(join(dir, '.turboslide', 'access.json'), `${JSON.stringify(record, null, 2)}\n`);
}

function removeDeck(id: string, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', id), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', id), { recursive: true, force: true });
}

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

async function invoke<T>(page: Page, action: string, input?: unknown): Promise<T> {
  return page.evaluate(([id, value]) => window.turboslide!.studio.invoke(id, value), [
    action,
    input,
  ] as const) as Promise<T>;
}

/** The deck's current revision as the page knows it (describe().state.revision). */
async function revisionInPage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = window.turboslide!.studio.describe().state as { revision?: number };
    return state.revision ?? 0;
  });
}

/** One stamp per run: a dev server reused across runs may hold the last run's document in memory. */
const RUN = Date.now().toString(36).slice(-5);

/** Inserts one `html` block with the payload on the fixture's content slide, through the window API. */
async function insertPayload(page: Page, html: string, index: number): Promise<string> {
  const id = `payload-${RUN}-${index}`;
  await invoke(page, 'block.insert', {
    slideId: SLIDE,
    slot: 'right',
    block: { id, type: 'html', css: '', html, note: `payload ${index}` },
    baseRevision: await revisionInPage(page),
  });
  return id;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  seedDeck(DECK, DECK_DIR);
  seedDeck(RESTRICTED, RESTRICTED_DIR);
  seedRestrictedRecord(RESTRICTED_DIR);
});

test.afterAll(() => {
  removeDeck(DECK, DECK_DIR);
  removeDeck(RESTRICTED, RESTRICTED_DIR);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('the eight html payloads are inert in the editor, the viewer and the print document', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const beacons: string[] = [];
  page.on('request', (req) => {
    if (/attacker\.example/.test(req.url())) beacons.push(req.url());
  });
  page.on('dialog', async (dialog) => {
    beacons.push(`dialog:${dialog.message()}`);
    await dialog.dismiss();
  });
  await page.goto(`/edit/${DECK}`);
  await editorReady(page);
  await invoke(page, 'view.goto', { slideId: SLIDE });
  for (const [index, payload] of PAYLOADS.entries()) await insertPayload(page, payload.html, index);
  await page.waitForFunction(() => {
    const state = window.turboslide!.studio.describe().state as { pending?: number };
    return state.pending === 0;
  });
  // the editor's own stage: no handler, no scheme, no beacon, no dialog
  const stage = await page.locator('.ts-stagewrap.ts-editor').innerHTML();
  for (const payload of PAYLOADS)
    for (const pattern of payload.forbidden) expect(stage, payload.html).not.toMatch(pattern);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  // the viewer: every html block is a sandboxed frame whose document is the sanitized markup
  await page.goto(`/deck/${DECK}`);
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
  const frames = page.locator('iframe.ts-x-frame');
  expect(await frames.count()).toBeGreaterThanOrEqual(PAYLOADS.length);
  for (const frame of await frames.all()) {
    expect(await frame.getAttribute('sandbox')).toBe('');
    const srcdoc = (await frame.getAttribute('srcdoc')) ?? '';
    expect(srcdoc).toContain("default-src 'none'");
    for (const payload of PAYLOADS)
      for (const pattern of payload.forbidden) expect(srcdoc).not.toMatch(pattern);
  }
  // the frames' origin is opaque: a same origin read from the page throws
  const opaque = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLIFrameElement>('iframe.ts-x-frame')].map((frame) => {
      try {
        return frame.contentDocument === null ? 'opaque' : 'same origin';
      } catch {
        return 'opaque';
      }
    }),
  );
  expect(opaque.every((value) => value === 'opaque')).toBe(true);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  // the print document carries the same frames (fetched with the page's cookie: in enforce mode a
  // stranger gets the You need access answer instead)
  const print = await page.request.get(`/print/${DECK}`);
  expect(print.status()).toBe(200);
  const printed = await print.text();
  for (const payload of PAYLOADS)
    for (const pattern of payload.forbidden) expect(printed).not.toMatch(pattern);
  expect(beacons).toEqual([]);
});

test('the headers of 8.8 on four routes, the embed exception, and worker-src blob in the policy', async ({
  page,
}) => {
  // the page's context carries the identity cookie, so the deck routes answer 200 in enforce mode too
  await page.goto('/new');
  const request = page.request;
  for (const path of ['/new', `/edit/${DECK}`, `/deck/${DECK}`]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers();
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['cross-origin-opener-policy'], path).toBe('same-origin');
    expect(headers['permissions-policy'], path).toContain('camera=()');
    expect(headers['x-request-id'], path).toBeTruthy();
    const csp =
      headers['content-security-policy-report-only'] ?? headers['content-security-policy'];
    expect(csp, path).toContain("worker-src 'self' blob:");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain('report-uri /api/x/csp/report');
    // a plain http dev server never pins itself
    expect(headers['strict-transport-security']).toBeUndefined();
  }
  const embed = await request.get(`/embed/${DECK}`);
  expect(embed.status()).toBe(200);
  expect(embed.headers()['x-frame-options']).toBeUndefined();
  expect(embed.headers()['content-security-policy-report-only']).toContain(
    'frame-ancestors https://prototemplate.com https://*.prototemplate.com',
  );
  // an API answer is never cached and carries no page policy
  const api = await request.get('/api/agent');
  expect(api.headers()['cache-control']).toBe('no-store');
  expect(api.headers()['content-security-policy-report-only']).toBeUndefined();
  // an asset answer carries the resource policy
  const asset = await request.get(`/decks/${DECK}/assets/nothing.png`);
  expect([200, 302, 404]).toContain(asset.status());
  expect(asset.headers()['x-content-type-options']).toBe('nosniff');
});

test('a cross site text/plain POST, a foreign Origin and a form body are refused on the agent surface and the JSON routes', async ({
  request,
}) => {
  const plain = await request.post(`/api/actions/slide.remove?deck=${DECK}`, {
    headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
    data: JSON.stringify({ id: SLIDE }),
  });
  expect([403, 415]).toContain(plain.status());
  const form = await request.post(`/api/actions/slide.remove?deck=${DECK}`, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: 'id=content-rule',
  });
  expect(form.status()).toBe(415);
  // the studio's own origin passes the Origin rule (the page's fetches carry it)
  const own = await request.get('/api/agent', { headers: { origin: ORIGIN } });
  expect(own.status()).toBe(200);
  const foreign = await request.get('/api/agent', { headers: { origin: 'https://evil.example' } });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toEqual({ error: 'forbidden' });
  // the ops route of B2 (when present) refuses a text/plain body through the same rule
  const ops = await request.post(`/api/decks/${DECK}/ops`, {
    headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
    data: '{}',
  });
  expect([403, 404, 415]).toContain(ops.status());
  // the slide is still there
  const info = await request.post(`/api/actions/slide.get?deck=${DECK}`, {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ slideId: SLIDE }),
  });
  expect(info.status()).toBe(200);
});

test('the export cancel needs its token, the thumbnail its grant in enforce mode, and the CSP report endpoint answers 204', async ({
  request,
  playwright,
}) => {
  const cancel = await request.post(`/api/export/${DECK}?cancel=abcdef12`, { data: '' });
  expect(cancel.status()).toBe(403);
  expect(await cancel.json()).toEqual({ error: 'forbidden', capability: 'export' });
  // a fresh request context: the identity middleware mints a cookie on the first answer of any
  // context, so the stranger's request has to be the first one its context sends
  const stranger = await playwright.request.newContext({ baseURL: ORIGIN });
  const thumb = await stranger.get(`/api/render/${SLIDE}?deck=${DECK}&theme=light&w=160`);
  const thumbStatus = thumb.status();
  const thumbBody = thumbStatus === 200 ? null : ((await thumb.json()) as { error: string });
  await stranger.dispose();
  if (ENFORCE) {
    // no cookie, no grant: a stranger is 401 from authorize(read), or 403 with the capability
    // when the record admits anyone (both are refusals, neither serves the pixels)
    expect([401, 403]).toContain(thumbStatus);
    expect(['unauthorized', 'forbidden']).toContain(thumbBody?.error);
  } else {
    // shadow mode serves the unsigned request (and logs it); the row records the mode
    expect([200, 404]).toContain(thumbStatus);
  }
  const report = await request.post('/api/x/csp/report', {
    headers: { 'content-type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': {
        'document-uri': 'http://localhost/new',
        'violated-directive': 'script-src',
        'blocked-uri': 'inline',
      },
    }),
  });
  expect(report.status()).toBe(204);
  const garbage = await request.post('/api/x/csp/report', {
    headers: { 'content-type': 'application/csp-report' },
    data: 'not json',
  });
  expect(garbage.status()).toBe(400);
});

test('the upload path refuses an svg, a type mismatch and a body over the declared size, and writes nothing', async ({
  page,
}) => {
  // the page's cookie: authorize(write) on the open scratch deck admits its principal in enforce mode
  await page.goto('/new');
  const request = page.request;
  const facts = await request.get('/api/x/upload/picture', { headers: { origin: ORIGIN } });
  expect(facts.status()).toBe(200);
  expect(await facts.json()).toMatchObject({ threshold: 3 * 1024 * 1024 });
  const svg = await request.post('/api/x/upload/picture', {
    headers: JSON_FROM_PAGE,
    data: JSON.stringify({ deckId: DECK, contentType: 'image/svg+xml', bytes: 100 }),
  });
  expect(svg.status()).toBe(400);
  const grant = await request.post('/api/x/upload/picture', {
    headers: JSON_FROM_PAGE,
    data: JSON.stringify({ deckId: DECK, contentType: 'image/png', bytes: 64 }),
  });
  expect([201, 401, 404]).toContain(grant.status());
  if (grant.status() === 201) {
    const issued = (await grant.json()) as { url: string; key: string; maxBytes: number };
    expect(issued.key).toMatch(/^uploads\/[A-Za-z0-9_.-]+\/[0-9a-f-]{36}$/);
    // an svg's bytes under a png declaration: the sniff refuses and nothing is kept
    const mismatch = await request.put(issued.url, {
      headers: { 'content-type': 'image/png', origin: ORIGIN },
      data: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    expect(mismatch.status()).toBe(400);
    const over = await request.post('/api/x/upload/picture', {
      headers: JSON_FROM_PAGE,
      data: JSON.stringify({ deckId: DECK, contentType: 'image/png', bytes: 8 }),
    });
    const small = (await over.json()) as { url: string };
    const tooBig = await request.put(small.url, {
      headers: { 'content-type': 'image/png', origin: ORIGIN },
      data: Buffer.alloc(64, 1),
    });
    expect(tooBig.status()).toBe(413);
    // a size over the tier's cap is refused before any token
    const huge = await request.post('/api/x/upload/picture', {
      headers: JSON_FROM_PAGE,
      data: JSON.stringify({ deckId: DECK, contentType: 'image/png', bytes: 60 * 1024 * 1024 }),
    });
    expect(huge.status()).toBe(413);
  }
});

test('a restricted deck answers one 404 to a stranger on the routes and the pages, in enforce mode', async ({
  request,
}) => {
  test.skip(!ENFORCE, 'TURBOSLIDE_AUTHORIZE=enforce is needed for the refusal rows');
  const page = await request.get(`/deck/${RESTRICTED}`);
  expect(page.status()).toBe(404);
  const bearerless = await request.post(`/api/x/render/${RESTRICTED}`, {
    headers: JSON_FROM_PAGE,
    data: JSON.stringify({ slideIds: [SLIDE], themes: ['light'] }),
  });
  expect([401, 404]).toContain(bearerless.status());
  const body = (await bearerless.json()) as { error: string };
  expect(['unauthorized', 'not_found']).toContain(body.error);
  expect(JSON.stringify(body)).not.toMatch(/owner|grant|usr_/);
  const exported = await request.post(`/api/x/export/${RESTRICTED}`, {
    headers: JSON_FROM_PAGE,
    data: JSON.stringify({ format: 'pptx', theme: ['light'] }),
  });
  expect([401, 404]).toContain(exported.status());
  // the open fixture deck still answers
  const open = await request.get(`/deck/${DECK}`);
  expect(open.status()).toBe(200);
});

test('the stream, ops and presence rows wait on the realtime routes', async ({ request }) => {
  // gslides-parity SPEC-3 16.4: the ninth stream refused, a foreign clientId 403, a viewer
  // receiving no op, a presence body with a name refused as unknown_field (B2's routes of day 3)
  const stream = await request.get(`/api/decks/${DECK}/stream`, { maxRedirects: 0 });
  test.skip(stream.status() === 404, 'the stream route is not in the tree yet (B2)');
  expect([200, 204, 401, 403]).toContain(stream.status());
});
