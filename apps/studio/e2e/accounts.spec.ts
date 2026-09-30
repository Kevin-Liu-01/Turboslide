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
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Locator, Page } from '@playwright/test';
import sharp from 'sharp';

import {
  Scratch,
  clickCard,
  ctl,
  headingRun,
  newDeck,
  openEditor,
  otherContext,
  ownerContext,
  sameCookiesContext,
  settled,
  slideOrder,
  state,
  teardownAll,
  typeInto,
  waitEditor,
} from './core/lib';
import { coreTitle } from './core/matrix';

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
//
// The people round (docs/PEOPLE.md 6.1, 6.2): the ten local rows of the matrix, each a test
// titled by `coreTitle(id)` the way the core specs are, so the gate's `--only accounts` run maps
// the report back to the rows and judges them alone. They run on a node server with an identity
// database and captured mail (`TURBOSLIDE_AUTH_DB`, `TURBOSLIDE_MAIL=capture`; the tmp store with
// `TURBOSLIDE_OVERLAY_DIR` naming the server's overlay, so the spec finds the server's state
// folder for the picture files and the seeded principals) and never on a deployment. Every deck
// of these rows is made from /new through the product and torn down through it. The rows read
// the chrome as the lanes land it: the badge is `.ts-trust-mark` (build/b2.md), the email line
// `dialog.share.row.<i>.email`, the merged identities map `describe().state.identities` (build/b1.md).
// The seeded deck rows above need the file store (the checkout's decks/ folder); on a tmp store
// the server does not read it, and they skip with that reason.

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
/**
 * The server's state folder (docs/PEOPLE.md 6.2): the overlay's `.turboslide` on a tmp store
 * (`TURBOSLIDE_OVERLAY_DIR`, the round's dev server environment), else the checkout's on the file
 * store; the picture files live under `users/u/<key>/` and the seeded principals under
 * `principals/`. A tmp server started without the variable keeps its overlay under the system's
 * temp folder, which is read as the second choice.
 */
const OVERLAY = process.env.TURBOSLIDE_OVERLAY_DIR;
const SERVER_STATE_CANDIDATES = [
  ...(OVERLAY ? [join(OVERLAY, '.turboslide')] : []),
  join(tmpdir(), 'turboslide', '.turboslide'),
  STATE_DIR,
];
const SERVER_STATE = OVERLAY ? join(OVERLAY, '.turboslide') : STATE_DIR;
const SEED = join(import.meta.dirname, 'identity-seed.mts');
const FIXTURE = join(import.meta.dirname, 'fixtures', 'portrait-1200x900.jpg');
const VIEWER_TOKEN = 'e2eViewerTokenAbcdef01';
const EDITOR_TOKEN = 'e2eEditorTokenAbcdef02';
const REVOKED_TOKEN = 'e2eRevokedTokenAbcde03';
const NOT_AVAILABLE = 'This presentation is not available to you, or does not exist.';
/** The server's origin: the CSRF filter of start.ts wants Origin or Sec-Fetch-Site on the API routes. */
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';
const SAME_ORIGIN = { origin: ORIGIN, 'sec-fetch-site': 'same-origin' };
const PICTURE_URL = /\/u\/[A-Za-z0-9_-]{22}\/[0-9a-f]{64}-64\.webp$/;
const LABEL = /^[A-Z][a-z]+ [1-9][0-9]{2}$/;
const CAP_SENTENCE_CLIENT = 'The resized picture is over 512 KB. Choose another picture';
const CAP_SENTENCE_SERVER = 'Pictures up to 512 KB';

function hashOf(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function seed(mode: string, ...args: string[]): Record<string, unknown> {
  const out = execFileSync('node', [SEED, mode, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    /* the noise picture of the cap row is a 1.5 MB base64 line; the default 1 MB pipe answers ENOBUFS */
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.trim().split('\n').pop() ?? '{}') as Record<string, unknown>;
}

/** The seed's answer, or the error's first line when the mode is not on the tree (the lane's request). */
function seedOrError(
  mode: string,
  ...args: string[]
): { out: Record<string, unknown> | null; error: string | null } {
  try {
    return { out: seed(mode, ...args), error: null };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const stderr = (error as { stderr?: string }).stderr ?? '';
    return { out: null, error: `${stderr}\n${text}`.trim().split('\n')[0] ?? 'the seed failed' };
  }
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

/* the file ran in the serial mode until the people round: with one worker the rows run in the
   file's order anyway, and the serial mode's one effect, the rows after a red one skipped, kept
   a nested describe from judging its rows one by one (the fourth local run of build/b5.md) */

/** Whether the server reads the checkout's decks/ folder (the file store), read once after the seed. */
let fileStore = false;
const NOT_FILE_STORE =
  "the server does not read the checkout's decks/ folder (a tmp store), so the seeded deck e2e-accounts is not served; the people rows below make their decks through the product";

test.beforeAll(async ({ request }) => {
  seedDeck();
  // the first request builds the identity runtime and migrates the database the seed reads
  const probe = await request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
  expect(probe.status()).toBe(200);
  const seeded = await request.get(`/edit/${DECK}`, { headers: SAME_ORIGIN, maxRedirects: 0 });
  fileStore = seeded.status() !== 404;
});

test.afterAll(() => {
  removeDeck();
});

test('a share link from the address bar lands with no token in the address and a sealed identity cookie', async ({
  page,
}) => {
  test.skip(!fileStore, NOT_FILE_STORE);
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
  test.skip(!fileStore, NOT_FILE_STORE);
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
  test.skip(!fileStore, NOT_FILE_STORE);
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
  test.skip(!fileStore, NOT_FILE_STORE);
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
  // a 32 by 32 gradient picture built by the seed through the studio's own sharp, written under
  // the server's state folder (the overlay's on a tmp store)
  const written = seed('avatar', SERVER_STATE, 'gradient') as { url: string; relative: string };
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
    test.skip(!fileStore, NOT_FILE_STORE);
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
    /* the own chip's menu is parked whole since the focus round (docs/FOCUS.md 3.2:
       `parked(sub('title.account', ...))` in menus/model.ts; AccountMenu.tsx filters its rows by
       `isPresent`), so the rows are asserted behind Tools > Advanced tools, flipped through the
       product's own row (3.1) and read back from describe().state.settings */
    const advancedTools = () =>
      page.evaluate(
        () =>
          (window.turboslide!.studio.describe().state as { settings?: Record<string, unknown> })
            .settings?.['advancedTools'] === true,
      );
    await page.locator('[data-control="menubar.tools"]').click();
    await page.locator('[data-control="menu.tools.advancedTools"]').click();
    await expect.poll(advancedTools, { timeout: 5000 }).toBe(true);
    if ((await page.locator('#ts-menu-tools').count()) > 0) await page.keyboard.press('Escape');
    await expect(page.locator('#ts-menu-tools')).toHaveCount(0);
    await ownChip.first().click();
    await expect(page.getByRole('menuitem', { name: 'Change name' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Change avatar' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Forget this browser' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Sessions' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// the people round's local rows (docs/PEOPLE.md 6.1, 6.2)

type PeopleRow = {
  clientId: string;
  principalId?: string;
  label?: string;
  name?: string;
  trust?: string;
  role?: string;
  slideId?: string;
  mark?: { variant?: string; initials?: string; pictureUrl?: string };
};
type PeopleState = {
  slideId?: string;
  account?: {
    principalId?: string | null;
    label?: string;
    name?: string;
    trust?: string;
    signedIn?: boolean;
  };
  presence?: { clientId?: string | null; self?: PeopleRow; others?: PeopleRow[] };
  identities?: Record<string, { name?: string; label?: string; trust?: string }>;
  comments?: { threads?: unknown[] };
};
const peopleState = async (p: Page): Promise<PeopleState> =>
  (await state(p)) as unknown as PeopleState;
const CLIENT_ID = /^[0-9a-f]{32}$/;
/** The tab's own client id once the stream's hello has minted it. */
async function clientIdOf(p: Page): Promise<string> {
  await expect
    .poll(async () => (await peopleState(p)).presence?.clientId ?? '', { timeout: 15_000 })
    .toMatch(CLIENT_ID);
  return (await peopleState(p)).presence?.clientId ?? '';
}
const chipOf = (p: Page, clientId: string): Locator =>
  p.locator(`[data-control="presence.chip.${clientId}"]`);
const rosterRowOf = (p: Page, clientId: string): Locator =>
  p.locator(`#ts-menu-roster [data-control="presence.roster.${clientId}"]`);
/** The badge of an account (build/b2.md: `.ts-trust-mark[aria-label="signed in"]`), where a driver reads it. */
const BADGE = '.ts-trust-mark, [data-trust-mark], [data-badge="check-badge"]';
type BadgeFacts = { present: boolean; label: string | null; size: number | null };
const badgeIn = (scope: Locator): Promise<BadgeFacts> =>
  scope.evaluate((el, sel) => {
    const badge = el.querySelector(sel);
    if (!badge) return { present: false, label: null, size: null };
    return {
      present: true,
      label: badge.getAttribute('aria-label') ?? badge.getAttribute('data-trust-mark'),
      size: Math.round(badge.getBoundingClientRect().width),
    };
  }, BADGE);
/** The tooltip plate's name and doc lines after a hover from a neutral point; null when none shows. */
async function tipOf(
  p: Page,
  target: Locator,
): Promise<{ name: string | null; doc: string | null } | null> {
  await p.mouse.move(720, 520);
  await p.waitForTimeout(300);
  await target.hover();
  await p.waitForTimeout(650);
  return p.evaluate(() => {
    const tip = document.querySelector('.pt-tip');
    if (!tip || tip.getClientRects().length === 0) return null;
    return {
      name: tip.querySelector('.pt-tip-name')?.textContent?.trim() ?? null,
      doc: tip.querySelector('.pt-tip-doc')?.textContent?.trim() ?? null,
    };
  });
}
/** Tools > Advanced tools as describe().state.settings reports it. */
async function advancedToolsOn(p: Page): Promise<boolean> {
  return p.evaluate(
    () =>
      (window.turboslide!.studio.describe().state as { settings?: Record<string, unknown> })
        .settings?.['advancedTools'] === true,
  );
}
async function setAdvancedTools(p: Page, on: boolean): Promise<void> {
  if ((await advancedToolsOn(p)) === on) return;
  await p.keyboard.press('Escape');
  await p.locator('[data-control="menubar.tools"]').click();
  const item = p.locator('[data-control="menu.tools.advancedTools"]');
  await item.waitFor({ timeout: 5000 }).catch(() => undefined);
  if ((await item.count()) === 0) {
    const ids = await p
      .locator('[role="menu"] [data-control]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-control')));
    throw new Error(
      `Tools > Advanced tools is not in the open menu (${ids.join(', ') || 'no menu open'})`,
    );
  }
  await item.click();
  await expect.poll(() => advancedToolsOn(p), { timeout: 5000 }).toBe(on);
  if ((await p.locator('#ts-menu-tools').count()) > 0) await p.keyboard.press('Escape');
}
/** Runs `fn` with Tools > Advanced tools on (the own chip is parked on the tree) and puts the switch back. */
async function withSwitchOn<T>(p: Page, fn: () => Promise<T>): Promise<T> {
  const wasOn = await advancedToolsOn(p);
  if (!wasOn) await setAdvancedTools(p, true);
  try {
    return await fn();
  } finally {
    if (!wasOn) await setAdvancedTools(p, false).catch(() => undefined);
  }
}
/**
 * Runs `fn` with the own chip's menu open: the chip with the switch off, else with Tools >
 * Advanced tools turned on through the product while `title.account` is parked (docs/PEOPLE.md
 * 3.14) and off again after. Answers fn's value and the route, or null when no route drew the chip.
 */
async function withOwnMenu<T>(
  p: Page,
  fn: (menu: Locator) => Promise<T>,
): Promise<{ value: T; route: string } | null> {
  await p.keyboard.press('Escape');
  let route = 'title.account';
  let switched = false;
  if ((await ctl(p, 'title.account').count()) === 0) {
    await setAdvancedTools(p, true);
    switched = true;
    route = 'title.account with the switch on';
    if ((await ctl(p, 'title.account').count()) === 0) {
      await setAdvancedTools(p, false);
      return null;
    }
  }
  try {
    await ctl(p, 'title.account').click();
    const menu = p.locator('#ts-menu-account');
    await menu.waitFor({ timeout: 5000 });
    const value = await fn(menu);
    if (await menu.isVisible().catch(() => false)) await p.keyboard.press('Escape');
    return { value, route };
  } finally {
    if (switched) await setAdvancedTools(p, false);
  }
}
/** Names this browser through the account menu's Change name (docs/PEOPLE.md 3.11). */
async function nameSelf(p: Page, name: string): Promise<{ named: boolean; route: string }> {
  const done = await withOwnMenu(p, async (menu) => {
    await menu.locator('[data-control="account.changeName"]').first().click();
    await ctl(p, 'dialog.namePrompt').waitFor({ timeout: 6000 });
    await ctl(p, 'dialog.namePrompt.name').click();
    await p.keyboard.press('Meta+a');
    await p.keyboard.type(name, { delay: 40 });
    const cont = p.locator('[data-control="dialog.namePrompt.continue"]').first();
    if ((await cont.count()) > 0) await cont.click();
    else await p.keyboard.press('Enter');
    await expect(ctl(p, 'dialog.namePrompt')).toHaveCount(0, { timeout: 8000 });
    await settled(p);
    return true;
  });
  return done === null
    ? { named: false, route: 'no title.account' }
    : { named: true, route: done.route };
}
/** Sets a display name through the name prompt when it shows (the first Share on a browser with no name). */
async function setDisplayName(p: Page, name: string): Promise<boolean> {
  const prompt = ctl(p, 'dialog.namePrompt');
  const shown = await prompt
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return false;
  await ctl(p, 'dialog.namePrompt.name').click();
  await p.keyboard.press('Meta+a');
  await p.keyboard.type(name, { delay: 40 });
  const cont = p
    .locator('[data-control="dialog.namePrompt.continue"], [data-control="dialog.namePrompt.save"]')
    .first();
  if ((await cont.count()) > 0) await cont.click();
  else await p.keyboard.press('Enter');
  await expect(prompt).toHaveCount(0, { timeout: 8000 });
  return true;
}
async function skipNamePrompt(p: Page): Promise<void> {
  const skip = ctl(p, 'dialog.namePrompt.skip');
  const there = await skip
    .waitFor({ timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (there) await skip.click({ timeout: 2000 }).catch(() => undefined);
}
async function openShare(p: Page): Promise<void> {
  await p.keyboard.press('Escape');
  await ctl(p, 'share.open').click();
  await skipNamePrompt(p);
  await ctl(p, 'dialog.share').waitFor({ timeout: 10_000 });
  await expect(ctl(p, 'dialog.share.loading')).toHaveCount(0, { timeout: 10_000 });
  await expect(p.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
}
/**
 * The dialog's second stage (docs/PRODUCT.md section 2 rank 3): the Add people section and the
 * Permissions gear sit behind the More row (Share.tsx `more`), so a driver opens it first; the
 * mode and link role selects and the people rows are on the first stage.
 */
async function openMore(p: Page): Promise<void> {
  const more = ctl(p, 'dialog.share.more');
  if ((await more.count()) > 0 && (await more.getAttribute('aria-expanded')) !== 'true')
    await more.click({ timeout: 5000 });
  await p
    .locator('[data-control="dialog.share.emails"], [data-control="dialog.share.gear"]')
    .first()
    .waitFor({ timeout: 8000 });
}
async function closeShare(p: Page): Promise<void> {
  const done = ctl(p, 'dialog.share.done');
  if ((await done.count()) > 0) await done.click();
  else await ctl(p, 'dialog.share.close').click();
  await expect(ctl(p, 'dialog.share')).toHaveCount(0, { timeout: 5000 });
}
/** Names a second browser through the first Share's prompt (docs/PRODUCT.md rank 4); false when no prompt came. */
async function nameByPrompt(p: Page, name: string): Promise<boolean> {
  let named = await setDisplayName(p, name);
  if (!named) {
    await p.keyboard.press('Escape');
    await ctl(p, 'share.open').click();
    named = await setDisplayName(p, name);
    if (
      await ctl(p, 'dialog.share')
        .isVisible()
        .catch(() => false)
    )
      await closeShare(p);
  }
  if (named) await settled(p);
  return named;
}
/** Opens the deck to anyone with the link in the role through the Share dialog; answers the address the dialog shows. */
async function setLinkAccess(p: Page, role: 'viewer' | 'commenter' | 'editor'): Promise<string> {
  await openShare(p);
  const mode = ctl(p, 'dialog.share.mode');
  if ((await mode.inputValue().catch(() => '')) !== 'link') {
    await mode.selectOption('link');
    await expect(p.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
      timeout: 10_000,
    });
  }
  const roleSelect = ctl(p, 'dialog.share.linkRole');
  if ((await roleSelect.inputValue().catch(() => '')) !== role) {
    await roleSelect.selectOption(role);
    await expect(p.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
      timeout: 10_000,
    });
  }
  await expect
    .poll(
      () =>
        ctl(p, 'dialog.share.address')
          .inputValue()
          .catch(() => ''),
      { timeout: 8000 },
    )
    .toMatch(/^https?:\/\//);
  const address = await ctl(p, 'dialog.share.address').inputValue();
  await closeShare(p);
  await settled(p);
  return address;
}
/** The owner's "Show names to people with the link" switch through the Share dialog's Permissions. */
async function setNamesSwitch(p: Page, on: boolean): Promise<void> {
  await openShare(p);
  await openMore(p);
  const gear = ctl(p, 'dialog.share.gear');
  if ((await gear.getAttribute('aria-expanded')) !== 'true') await gear.click();
  const check = ctl(p, 'dialog.share.settings.showNamesToLinkVisitors');
  await check.waitFor({ timeout: 5000 });
  const checkedNow = async (): Promise<boolean> => {
    const aria = await check.getAttribute('aria-checked');
    if (aria !== null) return aria === 'true';
    const input = check.locator('input[type="checkbox"]').first();
    if ((await input.count()) > 0) return input.isChecked();
    return check.isChecked().catch(() => false);
  };
  if ((await checkedNow()) !== on) {
    /* the input is the 1 px hidden one of DialogCheck (Dialog.css 224); the label is what a person clicks */
    await check.locator('xpath=ancestor::label[1]').click();
    await expect.poll(checkedNow, { timeout: 8000 }).toBe(on);
    await expect(p.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
      timeout: 10_000,
    });
  }
  await closeShare(p);
  await settled(p);
}
/** Invites an address in a role through the Share dialog. */
async function inviteByEmail(
  p: Page,
  email: string,
  role: 'viewer' | 'commenter' | 'editor',
): Promise<void> {
  await openShare(p);
  await openMore(p);
  await ctl(p, 'dialog.share.emails').click();
  await p.keyboard.type(email, { delay: 30 });
  await ctl(p, 'dialog.share.inviteRole').selectOption(role);
  await ctl(p, 'dialog.share.send').click();
  await expect(p.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect.poll(() => ctl(p, 'dialog.share').textContent(), { timeout: 8000 }).toContain(email);
  await closeShare(p);
  await settled(p);
}
/** Opens the roster from its opener (drawn from the first other person). */
async function openRoster(p: Page): Promise<void> {
  await p.keyboard.press('Escape');
  await ctl(p, 'presence.more').click();
  await p.locator('#ts-menu-roster').waitFor({ timeout: 6000 });
}
/** Version history through the Last edit words; answers the panel's history list. */
async function openHistory(p: Page): Promise<Locator | null> {
  await p.keyboard.press('Escape');
  if ((await p.locator('.ts-versions.is-history').count()) === 0) {
    /* the Last edit words need the history capability (`enabled: 'history'`): disabled for a
       viewer, so a click that opens nothing answers null and the caller records it */
    const opener = ctl(p, 'deck.lastEdit');
    if ((await opener.count()) === 0 || (await opener.isDisabled().catch(() => false))) return null;
    await opener.click();
    const opened = await p
      .locator('.ts-versions.is-history')
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) return null;
  }
  for (const w of await p.locator('[data-control^="versionHistory.window."]').all())
    await w.click().catch(() => undefined);
  await p.waitForTimeout(300);
  return p.locator('.ts-versions.is-history').first();
}
async function closeHistory(p: Page): Promise<void> {
  if (
    await ctl(p, 'panel.versionHistory.close')
      .isVisible()
      .catch(() => false)
  )
    await ctl(p, 'panel.versionHistory.close').click();
  await p.waitForTimeout(200);
}
type VersionRow = {
  author: string | null;
  word: string | null;
  meta: string | null;
  badge: BadgeFacts;
  chip: string | null;
  rows: string[] | null;
};
/** Every visible version row: its author id, the author word, the badge and the chip's cells. */
async function versionRows(p: Page): Promise<VersionRow[]> {
  return p.evaluate((sel) => {
    const visible = (el: Element) => el.getClientRects().length > 0;
    const bitsOf = (chip: Element | null): string[] | null => {
      if (!chip) return null;
      const box = chip.getBoundingClientRect();
      const size = Math.round(box.width);
      const grid = Array.from({ length: size }, () => new Array<number>(size).fill(0));
      for (const rect of chip.querySelectorAll('svg.ts-chip-plate rect')) {
        const r = rect.getBoundingClientRect();
        for (let y = Math.round(r.top - box.top); y < Math.round(r.bottom - box.top); y += 1)
          for (let x = Math.round(r.left - box.left); x < Math.round(r.right - box.left); x += 1)
            if (x >= 0 && y >= 0 && x < size && y < size) grid[y]![x] = 1;
      }
      return grid.map((row) => row.join(''));
    };
    return [...document.querySelectorAll('.ts-versions.is-history li.ts-version')]
      .filter(visible)
      .map((row) => {
        const badge = row.querySelector(sel);
        const chip = row.querySelector('.ts-chip');
        return {
          author: row.getAttribute('data-author'),
          word: row.querySelector('.ts-version-author')?.textContent?.trim() ?? null,
          meta: row.querySelector('.ts-version-meta')?.textContent?.trim() ?? null,
          badge: badge
            ? {
                present: true,
                label: badge.getAttribute('aria-label') ?? badge.getAttribute('data-trust-mark'),
                size: Math.round(badge.getBoundingClientRect().width),
              }
            : { present: false, label: null, size: null },
          chip: chip?.getAttribute('aria-label') ?? null,
          rows: bitsOf(chip),
        };
      });
  }, BADGE);
}
type OwnChip = {
  present: boolean;
  variant: string | null;
  label: string | null;
  img: { src: string; srcset: string | null } | null;
  svg: boolean;
  rects: number;
  initials: string | null;
  rows: string[] | null;
  /** the chip's data-picture: "loaded" while a picture URL is drawn */
  picture: string | null;
};
/** The own chip's facts: its variant, its picture or its plate. */
async function ownChip(p: Page): Promise<OwnChip> {
  return p.evaluate(() => {
    const chip = document.querySelector('[data-control="title.account"] .ts-chip');
    if (!chip)
      return {
        present: false,
        variant: null,
        picture: null,
        label: null,
        img: null,
        svg: false,
        rects: 0,
        initials: null,
        rows: null,
      };
    const img = chip.querySelector('img');
    const box = chip.getBoundingClientRect();
    const size = Math.round(box.width);
    const grid = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const rects = [...chip.querySelectorAll('svg.ts-chip-plate rect')];
    for (const rect of rects) {
      const r = rect.getBoundingClientRect();
      for (let y = Math.round(r.top - box.top); y < Math.round(r.bottom - box.top); y += 1)
        for (let x = Math.round(r.left - box.left); x < Math.round(r.right - box.left); x += 1)
          if (x >= 0 && y >= 0 && x < size && y < size) grid[y]![x] = 1;
    }
    return {
      present: true,
      variant: chip.getAttribute('data-variant'),
      picture: chip.getAttribute('data-picture'),
      label: chip.getAttribute('aria-label'),
      img: img ? { src: img.getAttribute('src') ?? '', srcset: img.getAttribute('srcset') } : null,
      svg: chip.querySelector('svg.ts-chip-plate') !== null,
      rects: rects.length,
      initials: chip.querySelector('.ts-chip-initials')?.textContent?.trim() ?? null,
      rows: grid.map((row) => row.join('')),
    };
  });
}
/** The key's folder under the server's users folder, wherever the server keeps it. */
function keyFolder(key: string): string | null {
  for (const base of SERVER_STATE_CANDIDATES) {
    const folder = join(base, 'users', 'u', key);
    if (existsSync(folder)) return folder;
  }
  return null;
}
/** The keys under the server's users folder now. */
function keysUnderUsers(): string[] {
  for (const base of SERVER_STATE_CANDIDATES) {
    const folder = join(base, 'users', 'u');
    if (existsSync(folder)) return readdirSync(folder).sort();
  }
  return [];
}
const keyOf = (src: string): string | null => /\/u\/([A-Za-z0-9_-]{22})\//.exec(src)?.[1] ?? null;
type Upload = {
  route: string | null;
  loaded: boolean;
  error: string | null;
  closed: boolean;
  src: string | null;
  srcset: string | null;
  requests: number[];
  /** the status and the identity fields of each answer, for the reason when the chip draws nothing */
  answers: string[];
};
/** An answer's identity fields (variant, pictureUrl, url, message, trust, label) by path, without the picture bytes. */
function answerSummary(text: string): string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return text.slice(0, 200);
  }
  const found: Record<string, unknown> = {};
  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > 4 || typeof value !== 'object' || value === null) return;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const at = path === '' ? key : `${path}.${key}`;
      if (
        /^(variant|pictureUrl|url|message|trust|label|ok|status|principalId|initials)$/.test(key) &&
        (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number')
      )
        found[at] = typeof v === 'string' ? v.slice(0, 120) : v;
      else walk(v, at, depth + 1);
    }
  };
  walk(json, '', 0);
  return JSON.stringify(found).slice(0, 700);
}
/**
 * Change avatar > Picture with a file through the builder's file input: the crop box's loaded
 * flag (build/b3.md R12), Apply, the dialog closing, the own chip's picture within 5 s, and the
 * bodies of the requests that carried `account.setAvatar` (the window transport's server
 * function), so the row reads the request's size.
 */
async function uploadPicture(p: Page, file: string): Promise<Upload> {
  const requests: number[] = [];
  const answers: Promise<string>[] = [];
  const onRequest = (r: {
    method: () => string;
    postDataBuffer: () => Buffer | null;
    response: () => Promise<{ status: () => number; text: () => Promise<string> } | null>;
  }) => {
    if (r.method() !== 'POST') return;
    const body = r.postDataBuffer();
    if (!body || !body.includes('account.setAvatar')) return;
    requests.push(body.length);
    answers.push(
      r.response().then(
        async (res) =>
          res === null
            ? 'no answer'
            : `${res.status()} ${answerSummary(await res.text().catch(() => ''))}`,
        (error: unknown) => `no answer: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  };
  p.on('request', onRequest);
  /* the own chip is parked on the tree (title.account, title.presence.me), so the switch stays
     on from the menu to the chip's reading and goes back off after */
  const wasOn = await advancedToolsOn(p);
  if (!wasOn) await setAdvancedTools(p, true);
  try {
    const opened = await withOwnMenu(p, async (menu) => {
      await menu.locator('[data-control="account.changeAvatar"]').first().click();
      await ctl(p, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
      await ctl(p, 'dialog.avatarBuilder.tab.picture').click();
      await ctl(p, 'dialog.avatarBuilder.file').setInputFiles(file);
      const loaded = await p
        .locator('[data-control="dialog.avatarBuilder.crop"][data-loaded="true"]')
        .waitFor({ timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      await ctl(p, 'dialog.avatarBuilder.apply').click();
      const closed = await ctl(p, 'dialog.avatarBuilder')
        .waitFor({ state: 'detached', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      const error = closed
        ? null
        : (
            (await ctl(p, 'dialog.avatarBuilder.error')
              .textContent()
              .catch(() => '')) ?? ''
          ).trim() || null;
      if (!closed) {
        if (
          await ctl(p, 'dialog.avatarBuilder.cancel')
            .isVisible()
            .catch(() => false)
        )
          await ctl(p, 'dialog.avatarBuilder.cancel').click();
        else await p.keyboard.press('Escape');
        await expect(ctl(p, 'dialog.avatarBuilder')).toHaveCount(0, { timeout: 5000 });
      }
      return { loaded, closed, error };
    });
    if (opened === null)
      return {
        route: null,
        loaded: false,
        error: null,
        closed: false,
        src: null,
        srcset: null,
        requests,
        answers: await Promise.all(answers),
      };
    let src: string | null = null;
    let srcset: string | null = null;
    if (opened.value.closed) {
      const before = Date.now();
      await expect
        .poll(async () => (await ownChip(p)).img?.src ?? null, { timeout: 5000 })
        .toMatch(PICTURE_URL)
        .catch(() => undefined);
      const chip = await ownChip(p);
      src = chip.img?.src ?? null;
      srcset = chip.img?.srcset ?? null;
      test.info().annotations.push({
        type: 'picture on the own chip',
        description: `${Date.now() - before} ms after the dialog closed: ${src ?? 'none'}`,
      });
    }
    return {
      route: wasOn ? opened.route : `${opened.route} with the switch on`,
      ...opened.value,
      src,
      srcset,
      requests,
      answers: await Promise.all(answers),
    };
  } finally {
    if (!wasOn) await setAdvancedTools(p, false).catch(() => undefined);
    p.off('request', onRequest);
  }
}
/** Closes a second person's context the way their tab closes (a navigation first, so the leave posts). */
async function closeSecond(other: BrowserContext | null, p: Page | null): Promise<void> {
  if (other === null || p === null) return;
  try {
    if (!p.isClosed() && /^https?:/.test(p.url())) {
      p.once('dialog', (dialog) => void dialog.accept().catch(() => undefined));
      await p.goto('about:blank', { timeout: 10_000 }).catch(() => undefined);
    }
  } finally {
    await other.close();
  }
}

test.describe('the people round: the local rows (docs/PEOPLE.md 6.1, 6.2)', () => {
  /* every action of these rows is bounded: a click on a control the tree does not draw fails in
     15 s with the control's name, never at the test's own timeout (the first local run held the
     invite field's click for 240 s behind the dialog's More row) */
  test.use({ actionTimeout: 15_000 });
  /* the rows judge themselves: a red row never skips the rows after it (the file's serial mode
     left with the people round; the mode is named here so a later configure above cannot bring
     the skip back to these rows) */
  test.describe.configure({ mode: 'default' });
  const scratch = new Scratch();
  let aCtx: BrowserContext;
  let A: Page;
  let bCtx: BrowserContext | null = null;
  let B: Page | null = null;
  let dCtx: BrowserContext | null = null;
  let D: Page | null = null;
  let deck = '';
  let link = '';
  let emailA = '';
  let emailB = '';
  let aPrincipal = '';
  let aClient = '';
  let bClient = '';
  let dClient = '';
  let pictureUrl: string | null = null;
  let initialsRows: string[] | null = null;
  const NAME_A = 'Ada Lovelace';
  const NAME_D = 'Kai Okafor';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    ({ context: aCtx, page: A } = await ownerContext(browser));
    const probe = await A.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
    expect(probe.status()).toBe(200);
    /* A signs in first, so the deck A makes is the account's own: ownership does not follow a
       sign in yet (build/b1.md R3 to the integrator), and the Share rows need A as the owner */
    emailA = `people-a-${Date.now()}@example.test`;
    const signedIn = await signInWithCode(A.request, ORIGIN, emailA);
    expect(signedIn.status).toBe(200);
    deck = await newDeck(A, scratch, 'People round deck');
    await expect
      .poll(async () => (await peopleState(A)).account?.signedIn ?? false, { timeout: 15_000 })
      .toBe(true);
    aPrincipal = (await peopleState(A)).account?.principalId ?? '';
    expect(aPrincipal, "A's account principal").toMatch(/^usr_/);
    /* the deck open to anyone with the link as editor, through the dialog */
    link = await setLinkAccess(A, 'editor');
  });
  test.afterAll(async () => {
    test.setTimeout(240_000);
    try {
      await closeSecond(dCtx, D);
      await closeSecond(bCtx, B);
      await teardownAll(A, scratch);
    } finally {
      await aCtx.close();
    }
  });

  test(coreTitle('people.verified-badge'), async ({ browser }) => {
    test.setTimeout(240_000);
    await openEditor(A, deck);
    const named = await nameSelf(A, NAME_A);
    test.info().annotations.push({ type: 'A named through', description: named.route });
    expect(named.named, 'A names itself through the account menu').toBe(true);
    aClient = await clientIdOf(A);
    /* B: an editor by email grant, signed in with the invited address */
    emailB = `people-b-${Date.now()}@example.test`;
    await inviteByEmail(A, emailB, 'editor');
    ({ context: bCtx, page: B } = await otherContext(browser));
    expect((await signInWithCode(B.request, ORIGIN, emailB)).status).toBe(200);
    const landed = await B.goto(`/edit/${deck}`);
    expect(landed?.status() ?? 0, 'B opens the deck as the grant holder').toBeLessThan(400);
    await waitEditor(B);
    /* the invitation binds to the address when a session with it arrives (SPEC-3 552;
       identity.ts `bindInvitations`): the page load is the product's path; when the grant stays
       pending the agent surface is tried with B's own cookies (its caller facts run the same
       hook) and the page loaded again, and the row records which path bound it, or that none did */
    const grantOf = async (p: Page) => {
      const s = (await peopleState(p)) as PeopleState & {
        access?: {
          role?: string;
          via?: string;
          grants?: Array<{
            email?: string | null;
            principalId?: string | null;
            acceptedAt?: string | null;
          }>;
        };
      };
      const grant =
        s.access?.grants?.find(
          (g) => g.email === emailB || g.principalId === s.account?.principalId,
        ) ?? null;
      return { role: s.access?.role ?? null, via: s.access?.via ?? null, grant };
    };
    let bStanding = await grantOf(B);
    let bound = bStanding.grant?.acceptedAt != null ? 'the page load' : null;
    if (bound === null) {
      const me = await B.request.post(`/api/actions/account.me?deck=${encodeURIComponent(deck)}`, {
        data: {},
        headers: SAME_ORIGIN,
      });
      await openEditor(B, deck);
      bStanding = await grantOf(B);
      if (bStanding.grant?.acceptedAt != null)
        bound = `the agent surface (account.me ${me.status()}) and a reload`;
    }
    test.info().annotations.push({
      type: "B's grant",
      description: `${bound ?? 'not bound'}; ${JSON.stringify(bStanding)}`,
    });
    expect
      .soft(
        bound,
        `B's email grant activates on B's sign in (nothing on the tree binds hooks.bindInvitations, identity.ts 164; build/b5.md R7): ${JSON.stringify(bStanding)}`,
      )
      .not.toBeNull();
    bClient = await clientIdOf(B);
    /* D: anonymous by the link, with a typed name */
    ({ context: dCtx, page: D } = await otherContext(browser));
    await D.goto(link);
    await D.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 90_000 });
    await waitEditor(D);
    expect(await nameByPrompt(D, NAME_D), 'D types a name').toBe(true);
    dClient = await clientIdOf(D);
    /* A comments on slide 1 */
    const first = (await slideOrder(A))[0]!;
    await clickCard(A, first);
    await A.keyboard.press('Escape');
    await A.keyboard.press('Meta+Alt+m');
    await ctl(A, 'comment.card').waitFor({ timeout: 8000 });
    await ctl(A, 'comment.card.new.field').click();
    await A.keyboard.type('Signed in and commenting.', { delay: 40 });
    await ctl(A, 'comment.card.new.submit').click();
    await settled(A);
    /* B reads A's roster row and D's */
    await expect(chipOf(B, aClient), "A's chip on B's tab").toHaveCount(1, { timeout: 15_000 });
    await expect(chipOf(B, dClient), "D's chip on B's tab").toHaveCount(1, { timeout: 15_000 });
    await openRoster(B);
    const rowA = rosterRowOf(B, aClient);
    await expect(rowA).toHaveCount(1);
    const rosterA = {
      name: (await rowA.locator('.ts-roster-name').textContent())?.trim() ?? null,
      chip: await rowA.locator('.ts-chip').getAttribute('aria-label'),
      badge: await badgeIn(rowA),
    };
    const rowD = rosterRowOf(B, dClient);
    const rosterD = {
      name: (await rowD.locator('.ts-roster-name').textContent())?.trim() ?? null,
      chip: await rowD.locator('.ts-chip').getAttribute('aria-label'),
      badge: await badgeIn(rowD),
    };
    await B.keyboard.press('Escape');
    const tip = await tipOf(B, chipOf(B, aClient));
    /* B's Comments panel: A's thread row and the opened card. The opener (`title.comments`, the
       button in `title.comments.slot`) draws for a role at or above commenter (readComments); B's
       standing is read first, so an absent opener names the mechanism (the second local run: B,
       signed in with the invited address on a link editor deck, had no opener) */
    await B.keyboard.press('Escape');
    const standing = await B.evaluate(() => {
      const s = window.turboslide!.studio.describe().state as {
        access?: { role?: unknown; via?: unknown; capabilities?: unknown; mode?: unknown };
        account?: unknown;
      };
      return { access: s.access ?? null, account: s.account ?? null };
    });
    test.info().annotations.push({ type: "B's standing", description: JSON.stringify(standing) });
    const opener = B.locator(
      '[data-control="title.comments.slot"] button, [data-control="title.comments"]',
    ).first();
    const openerCount = await opener.count();
    expect
      .soft(
        openerCount,
        `B's title row draws the Comments opener (readComments needs a role at or above commenter; B's standing ${JSON.stringify(standing.access)})`,
      )
      .toBeGreaterThan(0);
    let panelBadge: BadgeFacts = { present: false, label: null, size: null };
    let cardBadge: BadgeFacts = { present: false, label: null, size: null };
    let cardChip: string | null = null;
    if (openerCount > 0) {
      await opener.click();
      await ctl(B, 'panel.comments').waitFor({ timeout: 8000 });
      const threadRow = B.locator('[data-control^="panel.comments.thread."]')
        .filter({ has: B.locator(`.ts-chip[data-principal="${aPrincipal}"]`) })
        .first();
      await expect(threadRow, "A's thread on B's panel").toHaveCount(1, { timeout: 15_000 });
      panelBadge = await badgeIn(threadRow);
      const threadId =
        (await threadRow.getAttribute('data-control'))?.slice('panel.comments.thread.'.length) ??
        '';
      await ctl(B, `panel.comments.open.${threadId}`).click();
      const card = B.locator('.ts-comment')
        .filter({ has: B.locator(`.ts-chip[data-principal="${aPrincipal}"]`) })
        .first();
      await expect(card).toBeVisible({ timeout: 8000 });
      cardBadge = await badgeIn(card.locator('.ts-comment-head'));
      cardChip = await card.locator('.ts-chip').first().getAttribute('aria-label');
      if (
        await ctl(B, 'panel.comments.close')
          .isVisible()
          .catch(() => false)
      )
        await ctl(B, 'panel.comments.close').click();
    }
    /* B's Version history: A's row (the panel needs the history capability, which a viewer lacks;
       a panel that does not open is a finding, read with the standing above) */
    const history = await openHistory(B);
    expect
      .soft(
        history,
        `Version history opens for B (B's standing ${JSON.stringify(standing.access)})`,
      )
      .not.toBeNull();
    const rows = history === null ? [] : await versionRows(B);
    const versionA = rows.find((r) => r.author === aPrincipal) ?? null;
    await closeHistory(B);
    /* A's own tab: the account head */
    const head = await withOwnMenu(A, async (menu) => ({
      name: (await menu.locator('.ts-account-name').textContent())?.trim() ?? null,
      badge: await badgeIn(menu.locator('.ts-account-head')),
      sentence: (await menu.locator('.ts-account-sentence').textContent())?.trim() ?? null,
    }));
    /* A reads B, an account with no typed name: the label with the badge, never the address */
    await expect(chipOf(A, bClient), "B's chip on A's tab").toHaveCount(1, { timeout: 15_000 });
    await openRoster(A);
    const rowB = rosterRowOf(A, bClient);
    const rosterB = {
      name: (await rowB.locator('.ts-roster-name').textContent())?.trim() ?? null,
      chip: await rowB.locator('.ts-chip').getAttribute('aria-label'),
      badge: await badgeIn(rowB),
    };
    await A.keyboard.press('Escape');
    test.info().annotations.push({
      type: 'readings',
      description: JSON.stringify({
        rosterA,
        rosterD,
        tip,
        panelBadge,
        cardBadge,
        cardChip,
        versionA: versionA && { word: versionA.word, badge: versionA.badge, chip: versionA.chip },
        head,
        rosterB,
      }),
    });
    /* the badge after the name, 14 px, and the accessible word */
    expect(rosterA.name ?? '').toContain(NAME_A);
    expect(rosterA.badge.present, "the badge on A's roster row").toBe(true);
    expect(rosterA.badge.size).toBe(14);
    expect(rosterA.chip ?? '', "A's chip's accessible name").toContain('signed in');
    expect(tip?.doc ?? '', "the tooltip of A's chip for a grant holder").toContain(
      `Signed in as ${emailA}`,
    );
    expect(panelBadge.present, "the badge on A's thread row").toBe(true);
    expect(cardBadge.present, "the badge on A's comment head").toBe(true);
    expect(cardChip ?? '').toContain('signed in');
    expect(versionA, "A's version row on B's panel").not.toBeNull();
    expect(versionA?.badge.present, "the badge on A's version row").toBe(true);
    expect(versionA?.word ?? '').toBe(NAME_A);
    expect(head, "A's account menu").not.toBeNull();
    expect(head?.value.badge.present, "the badge on A's account head").toBe(true);
    expect(head?.value.name).toBe(NAME_A);
    /* a guest row: the word and no badge */
    expect(rosterD.name ?? '').toContain(NAME_D);
    expect(rosterD.chip ?? '').toContain('guest');
    expect(rosterD.badge.present, "no badge on D's row").toBe(false);
    /* an account without a typed name: its label with the badge, never the address */
    expect(rosterB.name ?? '').not.toContain('@');
    expect((rosterB.name ?? '').replace(/\s*\(you\)$/, '')).toMatch(LABEL);
    expect(rosterB.badge.present, "the badge on B's row").toBe(true);
  });

  test(coreTitle('people.versions-author-account'), async ({ browser }) => {
    test.setTimeout(240_000);
    /* a second deck made anonymously, its first record before the sign in and a second after */
    const { context: a2Ctx, page: A2 } = await otherContext(browser);
    const scratch2 = new Scratch();
    let eCtx: BrowserContext | null = null;
    let E: Page | null = null;
    try {
      const deck2 = await newDeck(A2, scratch2, 'Alias deck');
      const anon = (await peopleState(A2)).account?.principalId ?? '';
      expect(anon, 'the anonymous author of the first record').toMatch(/^anon_/);
      const link2 = await setLinkAccess(A2, 'editor');
      /* the names switch on while A2 still owns the deck, so a link visitor reads the account's name */
      await setNamesSwitch(A2, true);
      const email = `people-alias-${Date.now()}@example.test`;
      expect((await signInWithCode(A2.request, ORIGIN, email)).status).toBe(200);
      /* the account is not the owner (build/b1.md R3): A2 comes back through the link like E;
         by the id alone it would stand as a viewer ("You can view this presentation") */
      await A2.goto(link2);
      await A2.waitForURL(new RegExp(`/edit/${deck2}`), { timeout: 90_000 });
      await waitEditor(A2);
      await expect
        .poll(async () => (await peopleState(A2)).account?.signedIn ?? false, { timeout: 15_000 })
        .toBe(true);
      const usr = (await peopleState(A2)).account?.principalId ?? '';
      expect(usr).toMatch(/^usr_/);
      const named = await nameSelf(A2, 'Grace Hopper');
      expect(named.named, `A2 names itself (${named.route})`).toBe(true);
      await typeInto(A2, await headingRun(A2), 'Alias deck after the sign in');
      await settled(A2);
      /* the reload through the link: A2's own rows read You */
      await A2.goto(link2);
      await A2.waitForURL(new RegExp(`/edit/${deck2}`), { timeout: 90_000 });
      await waitEditor(A2);
      await openHistory(A2);
      const own = await versionRows(A2);
      await closeHistory(A2);
      const ownAnon = own.filter((r) => r.author === anon);
      const ownUsr = own.filter((r) => r.author === usr);
      /* E by the link reads both rows as the account's name with one mark */
      ({ context: eCtx, page: E } = await otherContext(browser));
      await E.goto(link2);
      await E.waitForURL(new RegExp(`/edit/${deck2}`), { timeout: 90_000 });
      await waitEditor(E);
      await openHistory(E);
      const seen = await versionRows(E);
      await closeHistory(E);
      const seenAnon = seen.filter((r) => r.author === anon);
      const seenUsr = seen.filter((r) => r.author === usr);
      test.info().annotations.push({
        type: 'rows',
        description: JSON.stringify({
          own: own.map((r) => ({ author: r.author, word: r.word })),
          seen: seen.map((r) => ({ author: r.author, word: r.word, chip: r.chip })),
        }),
      });
      expect(ownAnon.length, 'a record by the anonymous id').toBeGreaterThan(0);
      expect(ownUsr.length, 'a record by the account').toBeGreaterThan(0);
      for (const r of [...ownAnon, ...ownUsr])
        expect(
          r.word,
          `You on A2's own row by ${r.author} (the panel's You reads the row's principalId against the own id alone, VersionsPanel.tsx 176; the alias row resolves to the account's name for everyone)`,
        ).toBe('You');
      expect(seenAnon.length).toBeGreaterThan(0);
      expect(seenUsr.length).toBeGreaterThan(0);
      for (const r of [...seenAnon, ...seenUsr]) {
        expect(r.word, `the account's name on the row by ${r.author}`).toBe('Grace Hopper');
        expect(r.meta ?? '').not.toContain('guest');
      }
      const marks = new Set([...seenAnon, ...seenUsr].map((r) => (r.rows ?? []).join('/')));
      expect(marks.size, 'one mark for the two ids (the alias)').toBe(1);
    } finally {
      await closeSecond(eCtx, E);
      try {
        await teardownAll(A2, scratch2);
      } catch (error) {
        test.info().annotations.push({
          type: 'teardown',
          description: `the alias deck could not be torn down through the product by its signed in creator (build/b1.md R3): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        });
      }
      await a2Ctx.close();
    }
  });

  test(coreTitle('people.labels-disambiguated'), async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedOrError('principals', SERVER_STATE);
    expect(seeded.error, 'the seed minted two records whose ids share a label').toBeNull();
    const { ids, label } = seeded.out as { ids: string[]; label: string };
    expect(ids).toHaveLength(2);
    const cookies = ids.map((id) => seedOrError('cookie', id, ORIGIN));
    const missing = cookies.find((c) => c.error !== null);
    test.skip(
      missing !== undefined,
      `the seed has no cookie mode yet (build/b5.md, the request to B4): ${missing?.error ?? ''}`,
    );
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    try {
      for (const [i, id] of ids.entries()) {
        const cookie = cookies[i]!.out as { name: string; value: string };
        const { context, page } = await otherContext(browser);
        await context.addCookies([{ name: cookie.name, value: cookie.value, url: ORIGIN }]);
        contexts.push(context);
        pages.push(page);
        await page.goto(link);
        await page.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 90_000 });
        await waitEditor(page);
        expect(
          (await peopleState(page)).account?.principalId,
          `the seeded record ${i + 1} is the caller`,
        ).toBe(id);
        await typeInto(page, await headingRun(page), `Collision ${i + 1}`);
        await settled(page);
      }
      /* the first leaves, the second stays present */
      await closeSecond(contexts[0]!, pages[0]!);
      contexts.shift();
      const present = pages[1]!;
      const presentClient = await clientIdOf(present);
      await openEditor(A, deck);
      await expect(chipOf(A, presentClient)).toHaveCount(1, { timeout: 15_000 });
      await openHistory(A);
      const rows = await versionRows(A);
      await closeHistory(A);
      const wordOf = (id: string) => rows.filter((r) => r.author === id).map((r) => r.word);
      const first = wordOf(ids[0]!);
      const second = wordOf(ids[1]!);
      await openRoster(A);
      const row = rosterRowOf(A, presentClient);
      const rosterName = (await row.locator('.ts-roster-name').textContent())?.trim() ?? null;
      await A.keyboard.press('Escape');
      const tip = await tipOf(A, chipOf(A, presentClient));
      const plates = new Set(
        rows.filter((r) => ids.includes(r.author ?? '')).map((r) => (r.rows ?? []).join('/')),
      );
      test.info().annotations.push({
        type: 'labels',
        description: JSON.stringify({
          label,
          ids,
          first,
          second,
          rosterName,
          tip,
          plates: plates.size,
        }),
      });
      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBeGreaterThan(0);
      for (const w of first) expect(w).toBe(label);
      for (const w of second) expect(w).toBe(`${label} (2)`);
      expect(rosterName ?? '').toContain(`${label} (2)`);
      expect(tip?.name ?? '').toContain(`${label} (2)`);
      expect(plates.size, 'the two plates differ').toBe(2);
    } finally {
      for (const [i, context] of contexts.entries())
        await closeSecond(context, pages[pages.length - contexts.length + i] ?? null);
    }
  });

  test(coreTitle('share.dialog.grant-email-line'), async ({ browser }) => {
    test.setTimeout(180_000);
    await openEditor(A, deck);
    /* the grant: the badge row's, or this row's own when a failed row before it restarted the
       worker (Playwright starts a new worker after a failure, so the describe's variables reset) */
    if (emailB === '') {
      emailB = `people-b-${Date.now()}@example.test`;
      await inviteByEmail(A, emailB, 'editor');
      /* the grant binds at the invitee's first read of the deck (server/access.ts
         bindEmailGrants): a B of this row's own signs in with the address and opens the deck
         once, so the row stands on its own after a restart cleared the badge row's B */
      const { context: ownCtx, page: ownB } = await otherContext(browser);
      try {
        expect((await signInWithCode(ownB.request, ORIGIN, emailB)).status).toBe(200);
        await ownB.goto(`/edit/${deck}`);
        await waitEditor(ownB);
      } finally {
        await closeSecond(ownCtx, ownB);
      }
      await openEditor(A, deck);
    }
    await openShare(A);
    /* the grant row by its address: the name, the email line (drawn for a sharer when the name is
       not the address itself, Share.tsx 1638) and any title on the row */
    const row = A.locator('.ts-share-row').filter({ hasText: emailB }).first();
    await expect(row, "the grant row for B's address").toHaveCount(1, { timeout: 8000 });
    const facts = await row.evaluate((el) => {
      const name = el.querySelector('.ts-share-row-name');
      const line = el.querySelector('[data-control^="dialog.share.row."][data-control$=".email"]');
      return {
        status: el.getAttribute('data-status'),
        name: name?.textContent?.trim() ?? null,
        chip: el.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
        control: line?.getAttribute('data-control') ?? null,
        text: line?.textContent?.trim() ?? null,
        below:
          line && name
            ? line.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1
            : null,
        title: el.querySelector('[title]')?.getAttribute('title') ?? null,
      };
    });
    await closeShare(A);
    test.info().annotations.push({ type: 'grant row', description: JSON.stringify(facts) });
    expect(facts.title, 'no title on the row').toBeNull();
    expect(
      facts.text,
      facts.name === emailB && facts.text === null
        ? `the row's name is the address itself and no email line is drawn: the grant is unbound (status ${facts.status}; hooks.bindInvitations is null on the tree, build/b5.md R7)`
        : "the grant row's email line",
    ).toBe(emailB);
    expect(facts.below, 'the line under the name').not.toBe(false);
    /* C, a viewer by link, sees no email; the role change mints a new link and revokes the
       editor link of beforeAll, so C follows the address the change answered (the six local
       runs of the integrator read C's landing red on the revoked address) */
    const viewerLink = await setLinkAccess(A, 'viewer');
    const { context: cCtx, page: C } = await otherContext(browser);
    try {
      await C.goto(viewerLink);
      await C.waitForURL(new RegExp(`/(edit|deck)/${deck}`), { timeout: 90_000 });
      /* a viewer link lands on the reader page (/deck/<id>), which carries no Share control; the
         dialog the row reads is the editor chrome's, which a viewer opens read only */
      if (!/\/edit\//.test(C.url())) await C.goto(`/edit/${deck}`);
      await waitEditor(C);
      expect(
        await ctl(C, 'share.open').count(),
        'Share opens for a viewer by link',
      ).toBeGreaterThan(0);
      await openShare(C);
      const text = (await ctl(C, 'dialog.share').textContent()) ?? '';
      const lines = await C.locator(
        '[data-control^="dialog.share.row."][data-control$=".email"]',
      ).count();
      await closeShare(C);
      expect(text).not.toContain('@');
      expect(lines).toBe(0);
    } finally {
      await closeSecond(cCtx, C);
      await setLinkAccess(A, 'editor');
    }
  });

  test(coreTitle('people.avatar-upload'), async ({ browser }) => {
    test.setTimeout(180_000);
    await openEditor(A, deck);
    aClient = await clientIdOf(A);
    const keysBefore = keysUnderUsers();
    const up = await uploadPicture(A, FIXTURE);
    test.info().annotations.push({
      type: 'upload',
      description: JSON.stringify({ ...up, requests: up.requests }),
    });
    /* where the picture stopped when the chip drew none: the store, account.me and the chip */
    if (up.src === null) {
      const me = await A.request.post(`/api/actions/account.me?deck=${encodeURIComponent(deck)}`, {
        data: {},
        headers: SAME_ORIGIN,
      });
      test.info().annotations.push({
        type: 'after Apply',
        description: `${keysUnderUsers().filter((k) => !keysBefore.includes(k)).length} new key(s) under u/; account.me ${me.status()} ${answerSummary(await me.text())}; chip ${JSON.stringify(await ownChip(A))}`,
      });
    }
    expect(up.route, 'the builder opened').not.toBeNull();
    expect(up.loaded, 'the crop box shows the picture').toBe(true);
    expect(up.error).toBeNull();
    expect(up.closed, 'Apply closes the dialog').toBe(true);
    expect(up.src ?? '').toMatch(PICTURE_URL);
    expect(up.srcset ?? '').toMatch(/-32\.webp 1x/);
    expect(up.srcset ?? '').toMatch(/-64\.webp 2x/);
    expect(up.requests.length, 'the request left').toBeGreaterThan(0);
    for (const bytes of up.requests) expect(bytes).toBeLessThan(700 * 1024);
    pictureUrl = up.src;
    /* the Profile head reads the 128 px file */
    const head = await withOwnMenu(A, async (menu) => {
      await menu.locator('[data-control="account.sessions"]').first().click();
      await ctl(A, 'dialog.profile').waitFor({ timeout: 8000 });
      const src = await A.locator('[data-control="dialog.profile.head"] img')
        .first()
        .getAttribute('src')
        .catch(() => null);
      await ctl(A, 'dialog.profile.close')
        .click()
        .catch(() => A.keyboard.press('Escape'));
      await expect(ctl(A, 'dialog.profile')).toHaveCount(0, { timeout: 5000 });
      return src;
    });
    expect(head?.value ?? '', "the Profile head's picture").toContain('-128.webp');
    /* another person's chip for A draws the same URL within 10 s. The row's B is the grant
       holder; the grant never binds on the tree (R7) and a red row before this one restarts the
       worker, so a second context comes through the link and stands as a link visitor, who reads
       role words while the names switch is off (people.avatar-link-visitor): the switch is on for
       this reading and off after */
    const { context: sCtx, page: S } = await otherContext(browser);
    try {
      await setNamesSwitch(A, true);
      await S.goto(link);
      await S.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 90_000 });
      await waitEditor(S);
      const standing = (await peopleState(S)) as PeopleState & {
        access?: { role?: string; via?: string };
      };
      const t2 = Date.now();
      await expect
        .poll(
          () =>
            chipOf(S, aClient)
              .locator('img')
              .first()
              .getAttribute('src')
              .catch(() => null),
          { timeout: 10_000 },
        )
        .toBe(up.src);
      test.info().annotations.push({
        type: "A's picture on the second person's chip",
        description: `${Date.now() - t2} ms after the second person's page settled (${standing.access?.role ?? '?'} via ${standing.access?.via ?? '?'}, the names switch on)`,
      });
    } finally {
      await closeSecond(sCtx, S);
      await setNamesSwitch(A, false);
    }
  });

  test(coreTitle('people.avatar-cap-refusal'), async () => {
    test.setTimeout(180_000);
    /* the client half: toBlob answers a 600 KB blob */
    const stubbed = await aCtx.newPage();
    await stubbed.addInitScript(() => {
      const big = new Blob([new Uint8Array(600 * 1024)], { type: 'image/webp' });
      HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
        setTimeout(() => cb(big), 0);
      };
    });
    let up: Upload;
    try {
      await openEditor(stubbed, deck);
      up = await uploadPicture(stubbed, FIXTURE);
    } finally {
      await stubbed.close();
    }
    test.info().annotations.push({ type: 'client half', description: JSON.stringify(up) });
    expect(up.route).not.toBeNull();
    expect(up.error, "the dialog's error row").toBe(CAP_SENTENCE_CLIENT);
    expect(up.requests, 'no account.setAvatar request leaves').toEqual([]);
    /* the server half: a data URL just over 512 KB of bytes (524,600: 699,467 base64 characters
       plus the header, under the schema's 700,000) through the localhost agent surface, which
       the window transport's nonce guard refuses to a driver (docs/security.md section 9) */
    const noise = seed('picture', 'webp', '1024', '1024', 'noise') as {
      base64: string;
      bytes: number;
    };
    const bytes = Buffer.from(noise.base64, 'base64').subarray(0, 524_600);
    expect(bytes.length).toBe(524_600);
    const dataUrl = `data:image/webp;base64,${bytes.toString('base64')}`;
    expect(dataUrl.length).toBeLessThanOrEqual(700_000);
    const before = keysUnderUsers();
    const res = await A.request.post(
      `/api/actions/account.setAvatar?deck=${encodeURIComponent(deck)}`,
      {
        data: { variant: 'picture', picture: dataUrl },
        headers: SAME_ORIGIN,
      },
    );
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    test.info().annotations.push({
      type: 'server half',
      description: `${res.status()} ${JSON.stringify(body).slice(0, 200)}`,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(body?.error?.message ?? '').toContain(CAP_SENTENCE_SERVER);
    expect(keysUnderUsers(), 'nothing written under u/').toEqual(before);
  });

  test(coreTitle('people.avatar-rotation'), async () => {
    test.setTimeout(180_000);
    await openEditor(A, deck);
    /* the first picture: the upload row's, or this row's own after a worker restart */
    if (pictureUrl === null) {
      const one = await uploadPicture(A, FIXTURE);
      expect(one.src ?? '', 'a first picture').toMatch(PICTURE_URL);
      pictureUrl = one.src;
    }
    const first = pictureUrl!;
    const up = await uploadPicture(A, FIXTURE);
    expect(up.closed).toBe(true);
    const second = await withSwitchOn(A, async () => {
      await expect
        .poll(async () => (await ownChip(A)).img?.src ?? null, { timeout: 5000 })
        .not.toBe(first);
      return (await ownChip(A)).img?.src ?? '';
    });
    expect(second).toMatch(PICTURE_URL);
    expect(keyOf(second), 'a new key').not.toBe(keyOf(first));
    await expect
      .poll(async () => (await A.request.get(first, { headers: SAME_ORIGIN })).status(), {
        timeout: 5000,
      })
      .toBe(404);
    pictureUrl = second;
  });

  test(coreTitle('people.avatar-fallback-plate'), async ({ browser }) => {
    test.setTimeout(120_000);
    if (pictureUrl === null) {
      await openEditor(A, deck);
      const one = await uploadPicture(A, FIXTURE);
      expect(one.src ?? '', 'a picture to fall back from').toMatch(PICTURE_URL);
      pictureUrl = one.src;
    }
    const key = keyOf(pictureUrl!) ?? '';
    const folder = keyFolder(key);
    expect(
      folder,
      `the key's folder under the server's users folder (${SERVER_STATE_CANDIDATES.join(', ')})`,
    ).not.toBeNull();
    rmSync(folder!, { recursive: true, force: true });
    /* A's own browser keeps the file: the route serves it as immutable for a year
       (routes/api/avatar.$.ts 34), so a reload in A draws the cached picture; the reload that
       reads the fallback is a fresh context with A's cookies and an empty cache */
    await openEditor(A, deck);
    const cached = await withSwitchOn(A, () => ownChip(A));
    const { context: fCtx, page: F } = await sameCookiesContext(browser, aCtx);
    let chip: OwnChip;
    let seenAt = 0;
    const t = Date.now();
    try {
      await F.goto(`/edit/${deck}`);
      await waitEditor(F);
      chip = await withSwitchOn(F, async () => {
        await expect
          .poll(
            async () => {
              const own = await ownChip(F);
              const ok =
                own.present &&
                own.img === null &&
                own.svg &&
                (own.rects > 0 || own.initials !== null);
              if (ok && seenAt === 0) seenAt = Date.now();
              return ok;
            },
            { timeout: 5000 },
          )
          .toBe(true)
          .catch(() => undefined);
        return ownChip(F);
      });
    } finally {
      await closeSecond(fCtx, F);
    }
    initialsRows = chip.img === null ? chip.rows : null;
    test.info().annotations.push({
      type: 'fallback',
      description: `${(seenAt === 0 ? Date.now() : seenAt) - t} ms after the fresh context's load: ${JSON.stringify({ ...chip, rows: chip.rows?.length ?? null })}; A's own reload kept the cached picture: ${cached.img !== null}`,
    });
    expect(chip.present, 'the own chip is drawn').toBe(true);
    expect(chip.img, 'no <img> after the key is gone').toBeNull();
    expect(
      chip.svg && (chip.rects > 0 || chip.initials !== null),
      `the initials plate, not an empty box (variant ${chip.variant}, picture ${chip.picture}, ${chip.rects} rects, initials ${chip.initials})`,
    ).toBe(true);
    pictureUrl = null;
  });

  test(coreTitle('people.avatar-link-visitor'), async ({ browser }) => {
    test.setTimeout(240_000);
    await openEditor(A, deck);
    aClient = await clientIdOf(A);
    /* A's name: the badge row's, or this row's own after a worker restart (the second half reads it) */
    if ((await peopleState(A)).account?.name !== NAME_A) {
      const named = await nameSelf(A, NAME_A);
      expect(named.named, `A names itself (${named.route})`).toBe(true);
    }
    const up = await uploadPicture(A, FIXTURE);
    expect(up.src ?? '').toMatch(PICTURE_URL);
    pictureUrl = up.src;
    await setNamesSwitch(A, false);
    const ROLE_WORDS: Record<string, string> = {
      owner: 'The owner',
      editor: 'An editor',
      commenter: 'A commenter',
      viewer: 'A viewer',
    };
    const { context: cCtx, page: C } = await otherContext(browser);
    try {
      await C.goto(link);
      await C.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 90_000 });
      await waitEditor(C);
      await expect(chipOf(C, aClient), "A's chip on C's tab").toHaveCount(1, { timeout: 15_000 });
      const entry =
        (await peopleState(C)).presence?.others?.find((r) => r.clientId === aClient) ?? null;
      const role = entry?.role ?? 'owner';
      const word = ROLE_WORDS[role] ?? 'An editor';
      const initial = (word.split(' ').pop()?.[0] ?? '').toUpperCase();
      const facts = await chipOf(C, aClient)
        .locator('.ts-chip')
        .first()
        .evaluate((chip) => {
          const box = chip.getBoundingClientRect();
          const size = Math.round(box.width);
          const grid = Array.from({ length: size }, () => new Array<number>(size).fill(0));
          for (const rect of chip.querySelectorAll('svg.ts-chip-plate rect')) {
            const r = rect.getBoundingClientRect();
            for (let y = Math.round(r.top - box.top); y < Math.round(r.bottom - box.top); y += 1)
              for (
                let x = Math.round(r.left - box.left);
                x < Math.round(r.right - box.left);
                x += 1
              )
                if (x >= 0 && y >= 0 && x < size && y < size) grid[y]![x] = 1;
          }
          return {
            img: chip.querySelector('img') !== null,
            initials: chip.querySelector('.ts-chip-initials')?.textContent?.trim() ?? null,
            label: chip.getAttribute('aria-label'),
            rows: grid.map((row) => row.join('')),
          };
        });
      const tip = await tipOf(C, chipOf(C, aClient));
      test.info().annotations.push({
        type: 'link visitor',
        description: JSON.stringify({
          role,
          word,
          initial,
          initials: facts.initials,
          label: facts.label,
          img: facts.img,
          tip,
        }),
      });
      expect(facts.img, 'no picture for a link visitor').toBe(false);
      expect(facts.initials).toBe(initial);
      expect(facts.label ?? '').not.toContain(NAME_A);
      expect(tip?.name ?? '').toMatch(new RegExp(`^${word} · slide \\d+$`));
      if (initialsRows !== null)
        expect(facts.rows.join('/'), "a plate that is not A's").not.toBe(initialsRows.join('/'));
      /* the switch on: A's name and picture */
      await setNamesSwitch(A, true);
      await openEditor(C, deck);
      await expect(chipOf(C, aClient)).toHaveCount(1, { timeout: 15_000 });
      await expect
        .poll(() => chipOf(C, aClient).locator('img').count(), { timeout: 10_000 })
        .toBe(1);
      const tipOn = await tipOf(C, chipOf(C, aClient));
      expect(tipOn?.name ?? '').toContain(NAME_A);
    } finally {
      await closeSecond(cCtx, C);
      await setNamesSwitch(A, false);
    }
  });

  test(coreTitle('people.avatar-metadata-stripped'), async () => {
    test.setTimeout(180_000);
    const oriented = seed('oriented') as {
      base64: string;
      width: number;
      height: number;
      orientation: number;
    };
    const file = test.info().outputPath('oriented.jpg');
    writeFileSync(file, Buffer.from(oriented.base64, 'base64'));
    await openEditor(A, deck);
    const up = await uploadPicture(A, file);
    expect(up.closed, 'the oriented picture uploads').toBe(true);
    expect(up.src ?? '').toMatch(PICTURE_URL);
    const src = up.src!;
    const base = src.slice(0, src.lastIndexOf('/'));
    const digest = /([0-9a-f]{64})-64\.webp$/.exec(src)?.[1] ?? '';
    const png = await A.request.get(`${base}/${digest}-256.png`, { headers: SAME_ORIGIN });
    const webp = await A.request.get(`${base}/${digest}-64.webp`, { headers: SAME_ORIGIN });
    expect(png.status()).toBe(200);
    expect(webp.status()).toBe(200);
    const pngBytes = await png.body();
    const webpBytes = await webp.body();
    expect(pngBytes.includes(Buffer.from('Exif')), 'no Exif bytes in the PNG').toBe(false);
    expect(webpBytes.includes(Buffer.from('Exif')), 'no Exif bytes in the WebP').toBe(false);
    expect((await sharp(pngBytes).metadata()).exif).toBeUndefined();
    expect((await sharp(webpBytes).metadata()).exif).toBeUndefined();
    /* upright: the source is a red ramp along its width and a blue ramp along its height, tagged
       to rotate 90 degrees clockwise; the served picture's first row is then one of the source's
       columns, so red holds one value across it while blue spans the ramp */
    const { data, info } = await sharp(pngBytes).raw().toBuffer({ resolveWithObject: true });
    const reds: number[] = [];
    const blues: number[] = [];
    for (let x = 0; x < info.width; x += 1) {
      reds.push(data[x * info.channels]!);
      blues.push(data[x * info.channels + 2]!);
    }
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    test.info().annotations.push({
      type: 'first row',
      description: `${info.width} px, red spread ${spread(reds)}, blue spread ${spread(blues)}`,
    });
    expect(spread(reds), 'red holds along the first row').toBeLessThan(48);
    expect(spread(blues), 'blue spans the ramp along the first row').toBeGreaterThan(120);
    pictureUrl = src;
  });
});
