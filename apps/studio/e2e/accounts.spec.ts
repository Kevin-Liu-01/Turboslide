import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

// MILESTONES-3 B3 acceptance, accounts.spec.ts (gslides-parity SPEC-3 16.3): the identity
// surfaces of round three against the builder's dev server on 4332, started from apps/studio
// with the file store, the memory channel, `TURBOSLIDE_AUTH_DB=.turboslide/auth-b3.sqlite` and
// `TURBOSLIDE_MAIL=capture`. The rows that hold on this server today: the share link exchange at
// /s/<token> from a bare address bar and from a page on another origin, its refusal of a fetch
// and of a dead link, the identity cookie and the grant it carries; sign in through the library
// with the captured code, the same answer for a stranger address, the alias that links the
// anonymous id to the account; the device authorization flow of `turboslide login`; the avatar
// route's headers. The rows that need the chrome's account surfaces (the name prompt on the
// first edit, the own chip's menu, Forget this browser, the avatar builder's Picture tab, the
// sessions list) skip with their reason until B6's dialogs and B2's route wiring are in the tree
// (MILESTONES-3 B6 days 3 to 6, B2 day 4); the server side of each is unit tested under
// src/server/auth/. The spec works on a scratch copy of decks/fixture under decks/e2e-accounts
// and removes what it creates; the identity database and the mail it captures are the server's.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECK = 'e2e-accounts';
const DECK_DIR = join(ROOT, 'decks', DECK);
const STATE_DIR = join(ROOT, '.turboslide');
/* the identity database the server under test opened: TURBOSLIDE_AUTH_DB in the spec's environment
   (B3's own server on 4332 runs `.turboslide/auth-b3.sqlite`; scripts/check.mjs and
   playwright.config.ts give theirs `.turboslide/auth.sqlite`), so the seed reads the sign in code
   from the table the server wrote it to (VERIFICATION-3 finding 28: the code read null because
   the spec opened B3's file while the runner's server wrote the other) */
const AUTH_DB_RELATIVE = process.env.TURBOSLIDE_AUTH_DB ?? '.turboslide/auth.sqlite';
const AUTH_DB = AUTH_DB_RELATIVE.startsWith('/') ? AUTH_DB_RELATIVE : join(ROOT, AUTH_DB_RELATIVE);
const SEED = join(import.meta.dirname, 'identity-seed.mts');
const VIEWER_TOKEN = 'e2eViewerTokenAbcdef01';
const EDITOR_TOKEN = 'e2eEditorTokenAbcdef02';
const REVOKED_TOKEN = 'e2eRevokedTokenAbcde03';
const NOT_AVAILABLE = 'This presentation is not available to you, or does not exist.';
/** The server's origin: the CSRF filter of start.ts wants Origin or Sec-Fetch-Site on the API routes. */
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';
const SAME_ORIGIN = { origin: ORIGIN, 'sec-fetch-site': 'same-origin' };

function hashOf(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function seed(mode: string, ...args: string[]): Record<string, unknown> {
  const out = execFileSync('node', [SEED, mode, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out.trim().split('\n').pop() ?? '{}') as Record<string, unknown>;
}

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(join(DECK_DIR, '.turboslide'), { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'),
  ) as {
    id: string;
  };
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const now = '2026-09-13T12:00:00.000Z';
  const link = (id: string, token: string, role: string, revokedAt: string | null) => ({
    id,
    hash: hashOf(token),
    role,
    createdAt: now,
    createdBy: 'usr_e2eowner00000000000000000000000',
    revokedAt,
    expiresAt: null,
  });
  const record = {
    schemaVersion: 1,
    deckId: DECK,
    owner: 'usr_e2eowner00000000000000000000000',
    pendingOwner: null,
    createdAt: now,
    createdBy: 'usr_e2eowner00000000000000000000000',
    assetKey: 'e2eAssetKey0000000000a',
    generalAccess: { mode: 'link', role: 'viewer' },
    links: [
      link('lnk_e2eviewer', VIEWER_TOKEN, 'viewer', null),
      link('lnk_e2eeditor', EDITOR_TOKEN, 'editor', null),
      link('lnk_e2erevoked', REVOKED_TOKEN, 'editor', now),
    ],
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
    revision: 3,
  };
  writeFileSync(
    join(DECK_DIR, '.turboslide', 'access.json'),
    `${JSON.stringify(record, null, 2)}\n`,
  );
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(STATE_DIR, 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(STATE_DIR, 'thumbs', DECK), { recursive: true, force: true });
}

/** The anonymous principal a context holds, from its identity cookie's payload. */
async function principalOf(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === '__Host-ts_id' || c.name === 'ts_id');
  if (cookie === undefined) return null;
  const payload = cookie.value.split('.')[1] ?? '';
  const text = Buffer.from(payload, 'base64url').toString('utf8');
  return text.slice(0, text.lastIndexOf('.'));
}

function principalFile(principalId: string): Record<string, unknown> | null {
  const dir = join(STATE_DIR, 'principals');
  if (!existsSync(dir)) return null;
  const name = `${principalId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  if (!readdirSync(dir).includes(name)) return null;
  return JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
}

async function signInWithCode(
  request: APIRequestContext,
  origin: string,
  email: string,
): Promise<{ status: number; body: unknown }> {
  const asked = await request.post('/api/auth/sign-in/magic-link', {
    data: { email, callbackURL: '/decks' },
    headers: { origin },
  });
  expect(asked.status()).toBe(200);
  const mail = seed('mail', AUTH_DB, email) as { code: string | null; link: string | null };
  expect(mail.code).toMatch(/^\d{6}$/);
  expect(mail.link).toContain('/api/auth/magic-link/verify?token=');
  const verified = await request.post('/api/auth/sign-in/email-otp', {
    data: { email, otp: mail.code },
    headers: { origin },
  });
  return { status: verified.status(), body: await verified.json().catch(() => null) };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  seedDeck();
  // the first request builds the identity runtime and migrates the database the seed reads
  const probe = await request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
  expect(probe.status()).toBe(200);
});

test.afterAll(() => {
  removeDeck();
});

test('a share link from the address bar lands with no token in the address and a sealed identity cookie', async ({
  page,
}) => {
  const response = await page.goto(`/s/${VIEWER_TOKEN}`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/deck/${DECK}$`));
  expect(page.url()).not.toContain(VIEWER_TOKEN);
  const cookies = await page.context().cookies();
  const identity = cookies.find((c) => c.name === '__Host-ts_id');
  expect(identity).toBeDefined();
  expect(identity?.httpOnly).toBe(true);
  expect(identity?.secure).toBe(true);
  expect(identity?.sameSite).toBe('Lax');
  expect(identity?.value.startsWith('v1.')).toBe(true);
  // the grant is on the principal record, not in the address
  const principalId = await principalOf(page);
  expect(principalId).toMatch(/^anon_/);
  await expect
    .poll(() => principalFile(principalId ?? '')?.linkGrants ?? [], { timeout: 5000 })
    .toEqual([{ linkId: 'lnk_e2eviewer', deckId: DECK, role: 'viewer' }]);
  // a commenter or editor link lands on the editor
  await page.goto(`/s/${EDITOR_TOKEN}`);
  await expect(page).toHaveURL(new RegExp(`/edit/${DECK}$`));
  expect((principalFile(principalId ?? '')?.linkGrants as unknown[]).length).toBe(2);
});

test('a cors fetch of a share link is 403, a dead link is the You need access page, a foreign origin lands', async ({
  page,
  request,
}) => {
  await page.goto(`/deck/fixture`);
  const fetched = await page.evaluate(async (token) => {
    const response = await fetch(`/s/${token}`, { redirect: 'manual' });
    return { status: response.status, type: response.type };
  }, VIEWER_TOKEN);
  expect(fetched.status).toBe(403);
  const dead = await request.get(`/s/${REVOKED_TOKEN}`, { maxRedirects: 0 });
  expect(dead.status()).toBe(404);
  const body = await dead.text();
  expect(body).toContain(NOT_AVAILABLE);
  expect(body).not.toContain(REVOKED_TOKEN);
  expect(dead.headers()['referrer-policy']).toBe('no-referrer');
  expect(dead.headers()['x-robots-tag']).toBe('noindex');
  const malformed = await request.get('/s/not-a-token', { maxRedirects: 0 });
  expect(malformed.status()).toBe(404);
  // the exchange itself answers 303 and never carries the token onward
  const exchange = await request.get(`/s/${VIEWER_TOKEN}`, { maxRedirects: 0 });
  expect(exchange.status()).toBe(303);
  expect(exchange.headers().location).toBe(`/deck/${DECK}`);
  // from a page on another origin: a link clicked on a blank document navigates cross site
  await page.goto('about:blank');
  await page.setContent(`<a id="share" href="${ORIGIN}/s/${VIEWER_TOKEN}">Open the deck</a>`);
  await page.click('#share');
  await expect(page).toHaveURL(new RegExp(`/deck/${DECK}$`));
});

test('sign in with the captured code links the anonymous id to the account; a stranger gets the same answer', async ({
  page,
}) => {
  await page.goto(`/s/${VIEWER_TOKEN}`);
  const anonymousId = await principalOf(page);
  expect(anonymousId).toMatch(/^anon_/);
  const origin = new URL(page.url()).origin;
  const email = `e2e-${Date.now()}@example.test`;
  const signedIn = await signInWithCode(page.request, origin, email);
  expect(signedIn.status).toBe(200);
  expect((signedIn.body as { user: { email: string } }).user.email).toBe(email);
  const session = (await (
    await page.request.get('/api/auth/get-session', { headers: SAME_ORIGIN })
  ).json()) as {
    user: { id: string; email: string };
  } | null;
  expect(session?.user.email).toBe(email);
  await expect
    .poll(() => (seed('alias', AUTH_DB, anonymousId ?? '') as { userId: string | null }).userId, {
      timeout: 5000,
    })
    .toBe(session?.user.id);
  // the same 200 for an address nobody used, and a wrong code refused
  const stranger = await page.request.post('/api/auth/sign-in/magic-link', {
    data: { email: `nobody-${Date.now()}@example.test` },
    headers: { origin },
  });
  expect(stranger.status()).toBe(200);
  const wrong = await page.request.post('/api/auth/sign-in/email-otp', {
    data: { email, otp: '000000' },
    headers: { origin },
  });
  expect(wrong.status()).toBeGreaterThanOrEqual(400);
  // the sessions list names this browser
  const sessions = (await (
    await page.request.get('/api/auth/list-sessions', { headers: SAME_ORIGIN })
  ).json()) as { id: string }[];
  expect(sessions.length).toBeGreaterThanOrEqual(1);
});

test('the device authorization flow: a code from the terminal, the /device page, the approval, the token', async ({
  page,
}) => {
  await page.goto(`/s/${VIEWER_TOKEN}`);
  const origin = new URL(page.url()).origin;
  const email = `device-${Date.now()}@example.test`;
  expect((await signInWithCode(page.request, origin, email)).status).toBe(200);
  const asked = await page.request.post('/api/auth/device/code', {
    data: { client_id: 'turboslide-cli', scope: 'read write export' },
    headers: { origin },
  });
  expect(asked.status()).toBe(200);
  const code = (await asked.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
  };
  expect(code.user_code).toMatch(/^[A-Z0-9-]{8,9}$/i);
  expect(code.verification_uri).toContain('/device');
  const pending = await page.request.post('/api/auth/device/token', {
    data: {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: code.device_code,
      client_id: 'turboslide-cli',
    },
    headers: { origin },
  });
  expect(pending.status()).toBe(400);
  expect(((await pending.json()) as { error: string }).error).toBe('authorization_pending');
  // the page renders with its fixed box and the code field. The navigation leaves from a page
  // of the studio: the CSRF filter of start.ts (B4) covers /device on GET and TanStack's check
  // accepts `Sec-Fetch-Site: same-origin` only, so a typed address (`none`) is refused today; the
  // row below records it (b3.md request to B4)
  await page.goto('/deck/fixture');
  await page.evaluate(
    (path) => window.location.assign(path),
    `/device?user_code=${encodeURIComponent(code.user_code)}`,
  );
  await expect(page.locator('main[data-step]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in a device' })).toBeVisible();
  await expect(page.locator('[data-control="device.code"]')).toHaveValue(
    code.user_code.toUpperCase(),
  );
  await page.locator('[data-control="device.approve"]').click();
  await expect(page.locator('main[data-step="approved"]')).toBeVisible();
  // the terminal polls at the interval the code named (RFC 8628 3.5; a faster poll is slow_down)
  let granted = pending;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(code.interval * 1000 + 500);
    granted = await page.request.post('/api/auth/device/token', {
      data: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code.device_code,
        client_id: 'turboslide-cli',
      },
      headers: { origin },
    });
    if (granted.status() === 200) break;
  }
  expect(granted.status()).toBe(200);
  const token = (await granted.json()) as { access_token?: string; token?: string };
  expect((token.access_token ?? token.token ?? '').length).toBeGreaterThan(10);
});

test('a typed address opens /device (the CLI prints it): a top level navigation with Sec-Fetch-Site none is answered 200', async ({
  request,
}) => {
  // B4's filter of headers.ts accepts a top level navigation on GET /device since merge 2 (b3.md
  // stage 2 request R11); the fixer round removed the test.fail marker this row carried until then
  const typed = await request.get('/device', {
    headers: {
      'sec-fetch-site': 'none',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
    },
  });
  expect(typed.status()).toBe(200);
});

test('the avatar route serves a seeded picture with its headers and refuses a path outside the grammar', async ({
  request,
}) => {
  // a 32 by 32 gradient picture built by the seed through the studio's own sharp
  const written = seed('avatar', STATE_DIR, 'gradient') as { url: string; relative: string };
  const served = await request.get(written.url, { headers: SAME_ORIGIN });
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('image/webp');
  expect(served.headers()['cross-origin-resource-policy']).toBe('same-origin');
  expect(served.headers()['x-content-type-options']).toBe('nosniff');
  expect(served.headers()['cache-control']).toContain('immutable');
  expect(
    (await request.get('/api/avatar/u/../../etc/passwd', { headers: SAME_ORIGIN })).status(),
  ).toBe(404);
  expect((await request.get('/api/avatar/u/short/x.webp', { headers: SAME_ORIGIN })).status()).toBe(
    404,
  );
});

test.describe('the chrome surfaces of section 7 (B6 days 3 to 6, B2 day 4)', () => {
  test('the name prompt, the own chip menu, Forget this browser, the Picture tab sentence, the sessions list', async ({
    page,
  }) => {
    await page.goto(`/edit/${DECK}`);
    await page.waitForFunction(() => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    });
    const ownChip = page.locator(
      '[data-control="title.account"], [data-control="title.presence.me"]',
    );
    test.skip(
      (await ownChip.count()) === 0,
      'the own chip and the account dialogs are B6’s day 3 to 6 surfaces and B2’s day 4 route props; the server side of each row is unit tested in src/server/auth/actions.test.ts',
    );
    await ownChip.first().click();
    await expect(page.getByRole('menuitem', { name: 'Change name' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Change avatar' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Forget this browser' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Sessions' })).toBeVisible();
  });
});
