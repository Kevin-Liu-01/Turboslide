import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Locator, Page } from '@playwright/test';
import sharp from 'sharp';

import {
  Scratch,
  clickCard,
  ctl,
  extraHTTPHeaders,
  headingRun,
  invoke,
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
import { chooseOption } from './choose-option';
import { coreTitle, isCoreId } from './core/matrix';
import { contextAt, guardWords, plateFaults, readPlate, ringFault } from './core/auth-plate';

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
// The people round (docs/archive/rounds/PEOPLE.md 6.1, 6.2): the ten local rows of the matrix, each a test
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
 * The server's state folder (docs/archive/rounds/PEOPLE.md 6.2): the overlay's `.turboslide` on a tmp store
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
  /* the auth plate's page host since polish two (docs/POLISH-2.md 4.3, P2-A#3): the code in two
     groups of four, prefilled */
  await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 60_000 });
  await expect(page.locator('[data-auth-plate]')).toHaveAttribute('data-auth-plate', 'device.code');
  await expect(page.getByRole('heading', { name: 'Connect the command line' })).toBeVisible();
  const groups =
    (await page.locator('[data-control="device.code.first"]').inputValue()) +
    (await page.locator('[data-control="device.code.last"]').inputValue());
  expect(groups).toBe(code.user_code.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  await page.locator('[data-control="device.approve"]').click();
  await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
    'data-auth-plate',
    'device.approved',
  );
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
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// the people round's local rows (docs/archive/rounds/PEOPLE.md 6.1, 6.2)

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
 * Advanced tools turned on through the product while `title.account` is parked (docs/archive/rounds/PEOPLE.md
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
/** Names this browser through the account menu's Change name (docs/archive/rounds/PEOPLE.md 3.11). */
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
 * The dialog's second stage (docs/archive/rounds/PRODUCT.md section 2 rank 3): the Add people section and the
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
/** Names a second browser through the first Share's prompt (docs/archive/rounds/PRODUCT.md rank 4), else the own chip's Change name; false when neither names it. */
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
  /* the Share dialog asks no name from Round 1 on (B3b#13, docs/NEXT.md 4.1.3 item 17): the own
     chip's Change name opens the same prompt */
  if (!named) named = (await nameSelf(p, name)).named;
  if (named) await settled(p);
  return named;
}
/** Opens the deck to anyone with the link in the role through the Share dialog; answers the address the dialog shows. */
async function setLinkAccess(p: Page, role: 'viewer' | 'commenter' | 'editor'): Promise<string> {
  await openShare(p);
  const mode = ctl(p, 'dialog.share.mode');
  if ((await mode.getAttribute('value').catch(() => '')) !== 'link') {
    await chooseOption(p, 'dialog.share.mode', 'link');
    await expect(p.locator('[data-control="dialog.share"] [aria-busy="true"]')).toHaveCount(0, {
      timeout: 10_000,
    });
  }
  const roleField = ctl(p, 'dialog.share.linkRole');
  if ((await roleField.getAttribute('value').catch(() => '')) !== role) {
    await chooseOption(p, 'dialog.share.linkRole', role);
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
  await chooseOption(p, 'dialog.share.inviteRole', role);
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
  /* open every closed window and leave an open one open: the newest window is open by default
     (VersionsPanel.tsx, f0e3d449), and a click on it closed it and hid its rows (the realtime
     round's fix round 2, build/r1.md R1-R4f) */
  for (const w of await p.locator('[data-control^="versionHistory.window."]').all())
    if ((await w.getAttribute('aria-expanded').catch(() => null)) === 'false')
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

test.describe('the people round: the local rows (docs/archive/rounds/PEOPLE.md 6.1, 6.2)', () => {
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
      /* the role change back mints a new editor link and revokes the viewer one: the rows after
         this one follow the address it answers (the eighth local run of the integrator sent the
         upload row's second person to the address beforeAll minted, revoked by this row) */
      link = await setLinkAccess(A, 'editor');
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
      /* the plate is not A's: it is keyed by the role word (docs/archive/rounds/PEOPLE.md 3.27, default 6), so
         its letters are the role's and never A's; its Bayer field is two bits of a hash and may
         coincide with A's initials field one time in four (the ninth local run of the
         integrator), so the letters and the field are read together */
      if (initialsRows !== null) {
        const aInitials = NAME_A.split(/\s+/)
          .map((w) => w[0] ?? '')
          .join('')
          .toUpperCase();
        expect(
          facts.rows.join('/') === initialsRows.join('/') && facts.initials === aInitials,
          "a plate that is not A's",
        ).toBe(false);
      }
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

// ---------------------------------------------------------------------------------------------
// the realtime round's Google sign in rows (docs/REALTIME.md 4.4; design-google-login.md 6.2),
// lane R4. Four local rows on a node server with an identity database, captured mail and the
// fake Google pair (GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com,
// GOOGLE_CLIENT_SECRET=fake-secret-for-local-tests: test values for a local server, never a
// client Google knows); the fourth row reads a second server with TURBOSLIDE_MAIL=off from
// TURBOSLIDE_MAIL_OFF_BASE and is not driven without it. The round trip itself (the code
// exchange at Google's token endpoint) cannot run here and is the hand row
// `accounts.google-roundtrip` (docs/gslides-parity/cloudflare/build/google.md).
//
// The second harness mode of the Cloudflare phase (docs/CLOUDFLARE.md 4.3): the same rows against
// a server whose account database is the realtime Worker's D1 (`TURBOSLIDE_ACCOUNTS=d1` with
// `TURBOSLIDE_ROOM_HOST`, `TURBOSLIDE_ROOM_INSECURE` on a checkout and `TURBOSLIDE_ROOM_BEARER` in
// this process's environment; the gate forwards its environment unchanged). Nothing of the rows
// changes: the seed reads the captured code and the alias through the same proxy the server uses
// (identity-seed.mts, the d1 mode; `TURBOSLIDE_SEED_D1=wrangler` reads them through
// `wrangler d1 execute --json` instead), and `AUTH_DB` is then a path the seed ignores. The engine
// the seed selected is annotated on the describe's first row for the ledger.

/** The second server with `TURBOSLIDE_MAIL=off` (REALTIME.md 4.4 row 4), or null when none is named. */
const MAIL_OFF_BASE = (process.env.TURBOSLIDE_MAIL_OFF_BASE ?? '').replace(/\/$/, '') || null;

/**
 * The test title of a local row: `coreTitle(id)` once R5's matrix carries the row, else the same
 * shape (the id first, so `idOfTitle` and the gate map the result back) over the row's
 * interaction as REALTIME.md section 2 states it (build/r4.md request R4-R5a).
 */
function localTitle(id: string, interaction: string): string {
  return isCoreId(id) ? coreTitle(id) : `${id}: ${interaction}`;
}

const GOOGLE_ROWS = {
  button: [
    'accounts.google-button',
    'Local: the Sign in dialog shows dialog.signIn.google above dialog.signIn.github and no passkey row while the deployment offers no passkeys; with the e2e mail mode capture the email field is present',
  ],
  leaves: [
    'accounts.google-leaves',
    "Local: accounts.google.com routes aborted; the button's navigation carries redirect_uri <origin>/api/auth/callback/google, the scopes openid email profile, prompt=select_account, a code_challenge and no access_type",
  ],
  error: [
    'accounts.google-error-sentence',
    'Local: /edit/<deck>?error=account_not_linked opens the sign in window in its account error state with that sentence and Try Again, and the address loses the parameter',
  ],
  hidden: [
    'accounts.email-hidden-without-mail',
    'Local, a second server with TURBOSLIDE_MAIL=off: no email field; the Google button is the first method',
  ],
} as const;

/** Opens the Sign in dialog through the own chip's menu; answers the route, or null when no chip drew. */
async function openSignIn(p: Page): Promise<string | null> {
  const done = await withOwnMenu(p, async (menu) => {
    await menu.locator('[data-control="account.signIn"]').first().click();
    await ctl(p, 'dialog.signIn').waitFor({ timeout: 8000 });
    return true;
  });
  return done === null ? null : done.route;
}

/** The controls of the open window's plate in document order, by their data-control ids. */
async function methodOrder(p: Page): Promise<string[]> {
  return ctl(p, 'dialog.signIn').evaluate((card) =>
    [...card.querySelectorAll('.ts-auth-plate [data-control]')].map(
      (el) => el.getAttribute('data-control') ?? '',
    ),
  );
}

/** The space under the window's last box: the body's 20 px padding and the 1 px frame (P2-A#4). */
async function windowBand(p: Page): Promise<number> {
  return ctl(p, 'dialog.signIn').evaluate((card) => {
    const boxes = [
      ...card.querySelectorAll('.ts-auth-plate button, .ts-auth-plate input, .ts-auth-plate p'),
    ]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getBoundingClientRect().bottom);
    return Math.round(card.getBoundingClientRect().bottom - Math.max(...boxes));
  });
}

/**
 * The open dialog's box, rounded: 400 px wide and as tall as its content since the Round 1
 * follow-up (lane C item 1; SPEC-3 7.3 named one 400 by 320 box, which left an empty band of about
 * 150 px under Continue with Google where Google is the only method).
 */
async function dialogBox(p: Page): Promise<{ width: number; height: number }> {
  const box = await ctl(p, 'dialog.signIn').boundingBox();
  return { width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
}

test.describe('the realtime round: the Google sign in rows (docs/REALTIME.md 4.4)', () => {
  test.use({ actionTimeout: 15_000 });
  test.describe.configure({ mode: 'default' });
  const scratch = new Scratch();
  let aCtx: BrowserContext;
  let A: Page;
  let deck = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    ({ context: aCtx, page: A } = await ownerContext(browser));
    const probe = await A.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
    expect(probe.status(), 'the server has an identity database').toBe(200);
    deck = await newDeck(A, scratch, 'Google rows deck');
  });

  /** The engine the seed reads (sqlite file, or d1 through the proxy or wrangler), for the ledger. */
  function annotateEngine(): void {
    const engine = seedOrError('engine');
    test.info().annotations.push({
      type: 'accounts engine',
      description: engine.out === null ? (engine.error ?? 'unknown') : JSON.stringify(engine.out),
    });
  }
  test.afterAll(async () => {
    test.setTimeout(120_000);
    try {
      await teardownAll(A, scratch);
    } finally {
      await aCtx.close();
    }
  });

  test(localTitle(...GOOGLE_ROWS.button), async () => {
    test.setTimeout(120_000);
    annotateEngine();
    await openEditor(A, deck);
    const route = await openSignIn(A);
    expect(route, 'the own chip menu opens the Sign in dialog').not.toBeNull();
    test.info().annotations.push({ type: 'opened through', description: route ?? '' });
    const order = await methodOrder(A);
    test.info().annotations.push({ type: 'methods', description: order.join(', ') });
    const google = order.indexOf('dialog.signIn.google');
    const github = order.indexOf('dialog.signIn.github');
    const passkey = order.indexOf('dialog.signIn.passkey');
    expect(google, 'the Google button is drawn').toBeGreaterThanOrEqual(0);
    /* no passkey row while the deployment offers no passkeys (docs/NEXT.md 3.2 H4) */
    expect(passkey, 'no passkey row without TURBOSLIDE_PASSKEY_RPID and the plugin').toBe(-1);
    if (github >= 0) expect(github, 'GitHub under Google').toBeGreaterThan(google);
    else
      test.info().annotations.push({
        type: 'github',
        description: 'not configured on this server (no fake GitHub pair); Google is read alone',
      });
    /* the e2e mail mode is capture: the email field and Continue are present */
    await expect(ctl(A, 'dialog.signIn.email')).toHaveCount(1);
    await expect(ctl(A, 'dialog.signIn.continue')).toHaveCount(1);
    /* the window of the auth plate (polish two, P2-A#4): 400 px wide and as tall as its content */
    const box = await dialogBox(A);
    const band = await windowBand(A);
    expect(box.width).toBe(400);
    expect(
      band,
      `at most 24 px under the last box (${band} px, ${box.height} px tall)`,
    ).toBeLessThanOrEqual(25);
    await A.keyboard.press('Escape');
    await expect(ctl(A, 'dialog.signIn')).toHaveCount(0);
  });

  test(localTitle(...GOOGLE_ROWS.error), async () => {
    test.setTimeout(120_000);
    await A.goto(`/edit/${deck}?error=account_not_linked`);
    /* polish two, P2-A#4 (docs/POLISH-2.md 4.3, 6.6): the sign in window opens in the account
       error state with its sentence and Try Again */
    const card = ctl(A, 'dialog.signIn');
    await card.waitFor({ timeout: 60_000 });
    await expect(card.locator('[data-auth-plate]')).toHaveAttribute(
      'data-auth-plate',
      'error.account',
    );
    await expect(card.locator('.ts-dialog-title')).toHaveText('Sign in did not complete');
    await expect(ctl(A, 'dialog.signIn.reason')).toHaveText(
      'That Google account cannot be joined to the account signed in here.',
    );
    await expect(ctl(A, 'dialog.signIn.retry')).toHaveText('Try Again');
    await waitEditor(A);
    await expect.poll(() => A.url(), { timeout: 10_000 }).not.toContain('error=');
    expect(new URL(A.url()).pathname).toBe(`/edit/${deck}`);
    await ctl(A, 'dialog.signIn.retry').click();
    await expect(card.locator('[data-auth-plate]')).toHaveAttribute(
      'data-auth-plate',
      /^methods\./,
    );
    await A.keyboard.press('Escape');
  });

  test(localTitle(...GOOGLE_ROWS.leaves), async () => {
    test.setTimeout(120_000);
    await openEditor(A, deck);
    const seen: { url: string | null } = { url: null };
    const pattern = 'https://accounts.google.com/**';
    await aCtx.route(pattern, async (route) => {
      seen.url = seen.url ?? route.request().url();
      await route.abort('aborted');
    });
    try {
      const route = await openSignIn(A);
      expect(route, 'the own chip menu opens the Sign in dialog').not.toBeNull();
      await ctl(A, 'dialog.signIn.google').click();
      await expect.poll(() => seen.url, { timeout: 20_000 }).not.toBeNull();
    } finally {
      await aCtx.unroute(pattern);
    }
    const url = new URL(seen.url ?? '');
    test.info().annotations.push({
      type: 'navigation',
      description: `${url.origin}${url.pathname} with ${[...url.searchParams.keys()].join(', ')}`,
    });
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(url.searchParams.get('client_id')).toBe('fake-client-id.apps.googleusercontent.com');
    const scope = (url.searchParams.get('scope') ?? '').split(/[\s+]+/);
    expect(scope).toEqual(expect.arrayContaining(['openid', 'email', 'profile']));
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('code_challenge') ?? '').toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(url.searchParams.get('state') ?? '').not.toBe('');
    expect(url.searchParams.has('access_type')).toBe(false);
    /* the page left for an aborted navigation: back to the editor for the rows after */
    await openEditor(A, deck);
  });

  test(localTitle(...GOOGLE_ROWS.hidden), async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(
      MAIL_OFF_BASE === null,
      'no second server with TURBOSLIDE_MAIL=off named by TURBOSLIDE_MAIL_OFF_BASE; the row is not driven',
    );
    const offBase = MAIL_OFF_BASE ?? '';
    const { context, page } = await otherContext(browser);
    try {
      const probe = await page.request.get(`${offBase}/api/auth/get-session`, {
        headers: { origin: offBase, 'sec-fetch-site': 'same-origin' },
      });
      expect(probe.status(), 'the second server has an identity database').toBe(200);
      await page.goto(`${offBase}/new`);
      await waitEditor(page);
      const route = await openSignIn(page);
      expect(route, 'the own chip menu opens the Sign in dialog').not.toBeNull();
      const order = await methodOrder(page);
      test.info().annotations.push({ type: 'methods', description: order.join(', ') });
      await expect(ctl(page, 'dialog.signIn.email')).toHaveCount(0);
      await expect(ctl(page, 'dialog.signIn.continue')).toHaveCount(0);
      expect(order[0], 'Google is the first method').toBe('dialog.signIn.google');
      /* the focus on open, so Enter runs Google */
      const focused = await page.evaluate(
        () => document.activeElement?.getAttribute('data-control') ?? null,
      );
      expect(focused, 'the Google button holds the focus').toBe('dialog.signIn.google');
      /* the title, the lede, Continue with Google and the foot sentence: no band under them */
      const box = await dialogBox(page);
      const band = await windowBand(page);
      expect(box.width).toBe(400);
      expect(band, `at most 24 px under the last box (${band} px)`).toBeLessThanOrEqual(25);
      await page.keyboard.press('Escape');
    } finally {
      await context.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------------
   The next program's hotfixes (docs/NEXT.md 3.2, 4.3.3): the local rows of H2 and H3, each
   titled by `coreTitle(id)` so the gate's `--only accounts` run maps it back to its row. */

/** The data-control ids of the cards /decks draws in its grid, once the listing has landed. */
async function homeCards(p: Page): Promise<string[]> {
  await p.goto('/decks');
  await p.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await expect(
    p
      .locator(
        '[data-control="home.rows"], [data-control="home.cards"], [data-control="home.empty"]',
      )
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(p.locator('[data-control="home.pending"]')).toHaveCount(0, { timeout: 30_000 });
  /* the ruled rows are the default view since Round 1 (docs/NEXT.md 4.1.3 item 10), the cards
     Grid view's */
  return p
    .locator(
      '[data-control="home.rows"] tbody > [data-control^="home.card."], [data-control="home.cards"] > [data-control^="home.card."]',
    )
    .evaluateAll((els) =>
      els.map((el) => (el.getAttribute('data-control') ?? '').slice('home.card.'.length)),
    );
}

/** The ids of a deck.list answer, whatever shape the transport gives them. */
function listedIds(list: unknown): string[] {
  const rows = Array.isArray(list)
    ? (list as { id: string }[])
    : ((list as { decks?: { id: string }[] } | null)?.decks ?? []);
  return rows.map((row) => row.id);
}

test.describe("the next program's hotfixes: the local rows (docs/NEXT.md 3.2, 4.3.3)", () => {
  test.use({ actionTimeout: 15_000 });
  test.describe.configure({ mode: 'default' });

  test(coreTitle('accounts.decks-list-scoped'), async ({ browser }) => {
    test.setTimeout(300_000);
    const scratchA = new Scratch();
    const scratchB = new Scratch();
    const scratchC = new Scratch();
    const { context: aCtx, page: A } = await ownerContext(browser);
    const { context: bCtx, page: B } = await otherContext(browser);
    const { context: cCtx, page: C } = await otherContext(browser);
    try {
      const probe = await A.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
      expect(probe.status(), 'the server has an identity database').toBe(200);
      const stamp = Date.now();
      const emailA = `h2-a-${stamp}@example.test`;
      const emailB = `h2-b-${stamp}@example.test`;
      expect((await signInWithCode(A.request, ORIGIN, emailA)).status).toBe(200);
      expect((await signInWithCode(B.request, ORIGIN, emailB)).status).toBe(200);
      /* A's deck, shared with B by address; B's own deck; C's deck, a stranger's */
      const deckA = await newDeck(A, scratchA, 'H2 owner deck');
      await inviteByEmail(A, emailB, 'viewer');
      const deckB = await newDeck(B, scratchB, 'H2 own deck');
      const deckC = await newDeck(C, scratchC, 'H2 stranger deck');
      expect((await peopleState(B)).account?.signedIn, 'B is signed in').toBe(true);
      /* B's /decks and B's deck.list from B's own editor */
      const bCards = await homeCards(B);
      await openEditor(B, deckB);
      const bList = listedIds(await invoke(B, 'deck.list', {}));
      /* A's /decks: its own deck, and neither B's nor C's */
      const aCards = await homeCards(A);
      await openEditor(A, deckA);
      const aList = listedIds(await invoke(A, 'deck.list', {}));
      test.info().annotations.push({
        type: 'listings',
        description: JSON.stringify({ deckA, deckB, deckC, bCards, bList, aCards, aList }),
      });
      expect([...bCards].sort(), "B's /decks: B's own deck and the one shared with B").toEqual(
        [deckA, deckB].sort(),
      );
      expect([...bList].sort(), "B's deck.list: the same set").toEqual([deckA, deckB].sort());
      expect(aCards, "A's /decks: A's own deck alone").toEqual([deckA]);
      expect(aList, "A's deck.list: A's own deck alone").toEqual([deckA]);
    } finally {
      try {
        await teardownAll(C, scratchC);
        await teardownAll(B, scratchB);
        await teardownAll(A, scratchA);
      } finally {
        await cCtx.close();
        await bCtx.close();
        await aCtx.close();
      }
    }
  });
});

/* ---------------------------------------------------------------------------------------------
   The next program's hotfix H3 (docs/NEXT.md 3.2, 4.3.3): Sign out from the account menu. */

test.describe("the next program's hotfix H3: sign out in one click (docs/NEXT.md 3.2)", () => {
  test.use({ actionTimeout: 15_000 });
  test.describe.configure({ mode: 'default' });

  test(coreTitle('accounts.sign-out-clean'), async ({ browser }) => {
    test.setTimeout(300_000);
    const scratch = new Scratch();
    const { context: aCtx, page: A } = await ownerContext(browser);
    let bCtx: BrowserContext | null = null;
    let B: Page | null = null;
    const stamp = Date.now();
    const emailA = `h3-a-${stamp}@example.test`;
    const emailB = `h3-b-${stamp}@example.test`;
    try {
      const probe = await A.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
      expect(probe.status(), 'the server has an identity database').toBe(200);
      expect((await signInWithCode(A.request, ORIGIN, emailA)).status).toBe(200);
      const deck = await newDeck(A, scratch, 'H3 sign out deck');
      /* B holds an email grant, so B reads A as signed in (a link visitor reads a label) */
      await inviteByEmail(A, emailB, 'editor');
      ({ context: bCtx, page: B } = await otherContext(browser));
      expect((await signInWithCode(B.request, ORIGIN, emailB)).status).toBe(200);
      await B.goto(`/edit/${deck}`);
      await waitEditor(B);
      await openEditor(A, deck);
      const before = (await peopleState(A)).account ?? {};
      const aAccount = before.principalId ?? '';
      const aCookieBefore = await principalOf(A);
      expect(before.signedIn, 'A is signed in').toBe(true);
      expect(aAccount, "A's account principal").toMatch(/^usr_/);
      const verifiedOnB = async (): Promise<boolean> =>
        ((await peopleState(B!)).presence?.others ?? []).some(
          (row) => row.principalId === aAccount && row.trust === 'verified',
        );
      await expect
        .poll(verifiedOnB, { timeout: 30_000, message: "B reads A's chip as signed in" })
        .toBe(true);
      /* one click on the account menu's Sign out row */
      const reloaded = A.waitForEvent('load', { timeout: 30_000 });
      const clicked = await withOwnMenu(A, async (menu) => {
        await menu.locator('[data-control="account.signOut"]').first().click();
        return Date.now();
      });
      expect(clicked, 'the own chip menu draws the Sign out row').not.toBeNull();
      await reloaded;
      const reloadedAt = Date.now();
      /* B reads the badge gone, read every 100 ms from A's reload */
      let goneMs: number | null = null;
      while (Date.now() - reloadedAt < 5_000) {
        if (!(await verifiedOnB())) {
          goneMs = Date.now() - reloadedAt;
          break;
        }
        await B.waitForTimeout(100);
      }
      await waitEditor(A);
      const after = (await peopleState(A)).account ?? {};
      const aCookieAfter = await principalOf(A);
      const session = await A.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
      const sessionBody = (await session.json().catch(() => null)) as { user?: unknown } | null;
      /* the own chip and the account menu's head carry no badge */
      const chipBadge = await badgeIn(ctl(A, 'title.account').first());
      const ownBadge = await withOwnMenu(A, async (menu) =>
        (await menu.locator('.ts-account-head').count()) > 0
          ? badgeIn(menu.locator('.ts-account-head').first())
          : { present: false, label: null, size: null },
      );
      test.info().annotations.push({
        type: 'sign out',
        description: JSON.stringify({
          clickToReloadMs: clicked === null ? null : reloadedAt - clicked.value,
          badgeGoneOnBMs: goneMs,
          before: { principalId: aAccount, label: before.label, trust: before.trust },
          after: { principalId: after.principalId, label: after.label, trust: after.trust },
          cookieChanged: aCookieBefore !== aCookieAfter,
          session: sessionBody === null ? null : sessionBody.user === undefined ? 'none' : 'user',
          chipBadge,
          ownBadge: ownBadge?.value ?? null,
        }),
      });
      expect(after.signedIn, 'the tab reloads signed out').toBe(false);
      expect(after.trust, 'a fresh label').toBe('label');
      expect(after.principalId ?? '', 'a new anonymous principal').toMatch(/^anon_/);
      expect(after.principalId, 'not the account').not.toBe(aAccount);
      expect(aCookieAfter, 'the identity cookie is a new one').not.toBe(aCookieBefore);
      expect(after.principalId, "the cookie's principal").toBe(aCookieAfter);
      expect(after.label ?? '', 'the label of a new visitor').toMatch(LABEL);
      expect(sessionBody?.user, 'the session answers no user').toBeUndefined();
      expect(chipBadge.present, 'no badge on the own chip').toBe(false);
      expect(ownBadge?.value.present ?? false, "no badge on the account menu's head").toBe(false);
      expect(goneMs, "B reads A's badge gone within 2 s of A's reload").not.toBeNull();
      expect(goneMs!).toBeLessThanOrEqual(2_000);
    } finally {
      try {
        /* the deck is the account's: A signs in again to remove it */
        await closeSecond(bCtx, B);
        if (scratch.ids.size > 0) {
          expect((await signInWithCode(A.request, ORIGIN, emailA)).status).toBe(200);
          await teardownAll(A, scratch);
        }
      } finally {
        await aCtx.close();
      }
    }
  });
});

/* ---------------------------------------------------------------------------------------------
   Polish two, lane A (docs/POLISH-2.md 4, 6.4): the auth plate's local rows. They read the
   server's own pages (/signin, /dev/auth, the editor) on a local server with the fake Google pair
   and captured mail; Google is never reached (accounts.google.com is answered by a stub page). */

const POLISH2 = {
  cancel: [
    'accounts.plate.cancel-comes-home',
    "Local, the fake Google pair: Continue with Google from /signin?next=/decks, then Google's Cancel replayed as a cross site navigation to /api/auth/callback/google?error=access_denied&state=<the minted state>: the browser lands on /signin with error=access_denied and next=/decks, status 200, drawing the cancelled sentence; no response on the way answers 403; from the editor's window the same lands on /signin?next=/edit/<deck>",
  ],
  states: [
    'accounts.plate.states',
    'Local: /dev/auth?state=<id>&host=page and host=window with chrome=0, for every state of docs/POLISH-2.md 4.4 at 1440 and 390 in both appearances',
  ],
} as const;

/** Every state of docs/POLISH-2.md 4.4 the gallery draws (the account menu's two are the editor's). */
const PLATE_STATES = [
  'methods.google',
  'methods.google-email',
  'methods.all',
  'methods.email',
  'methods.none',
  'methods.leaving',
  'email.sent',
  'email.code-wrong',
  'email.code-expired',
  'email.code-spent',
  'error.cancelled',
  'error.expired',
  'error.link',
  'error.account',
  'error.other',
  'device.sign-in-first',
  'device.code',
  'device.code-wrong',
  'device.spent',
  'device.expired',
  'device.approved',
  'device.denied',
] as const;

/**
 * Answers accounts.google.com with a stub page whose one link is Google's Cancel: the callback
 * with `error=access_denied` and the state the server minted, followed from Google's origin, so
 * the browser's navigation back is cross site as it is from Google itself.
 */
async function stubGoogleCancel(
  context: BrowserContext,
): Promise<{ authorize: () => string | null }> {
  let seen: string | null = null;
  await context.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url());
    seen = seen ?? url.toString();
    const state = url.searchParams.get('state') ?? '';
    const back = `${url.searchParams.get('redirect_uri') ?? `${ORIGIN}/api/auth/callback/google`}?error=access_denied&state=${encodeURIComponent(state)}`;
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><title>Stub</title><a id="cancel" href="${back.replace(/"/g, '&quot;')}">Cancel</a>`,
    });
  });
  return { authorize: () => seen };
}

test.describe('polish two: the auth plate (docs/POLISH-2.md 4, 6.4)', () => {
  test.use({ actionTimeout: 15_000 });
  test.describe.configure({ mode: 'default' });

  test(localTitle(...POLISH2.cancel), async ({ browser }) => {
    test.setTimeout(600_000);
    const scratch = new Scratch();
    const { context, page } = await ownerContext(browser);
    const readings: string[] = [];
    try {
      const probe = await page.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
      expect(probe.status(), 'the server has an identity database').toBe(200);
      const google = await stubGoogleCancel(context);
      const answers: { url: string; status: number }[] = [];
      page.on('response', (response) => {
        const url = response.url();
        if (url.startsWith(ORIGIN) && response.request().isNavigationRequest())
          answers.push({ url: url.slice(ORIGIN.length), status: response.status() });
      });
      /* from the sign in page */
      await page.goto('/signin?next=/decks');
      await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
      test.skip(
        (await ctl(page, 'page.signIn.google').count()) === 0,
        'not driven: the server has no Google client (start it with the fake Google pair)',
      );
      await ctl(page, 'page.signIn.google').click();
      await page.waitForURL(/accounts\.google\.com/, { timeout: 60_000 });
      await page.locator('#cancel').click();
      await page.waitForURL(/\/signin\?/, { timeout: 60_000 });
      await page.locator('[data-auth-plate]').waitFor({ timeout: 60_000 });
      let url = new URL(page.url());
      const sentence = await ctl(page, 'page.signIn.reason').textContent();
      readings.push(
        `from /signin: ${answers.map((a) => `${a.status} ${a.url.split('?')[0]}`).join(', ')}; landed ${url.pathname}${url.search}; "${sentence}"`,
      );
      expect(google.authorize(), 'the browser left for the provider').not.toBeNull();
      expect(url.pathname).toBe('/signin');
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('next')).toBe('/decks');
      expect(answers[answers.length - 1]?.status, 'the sign in page answers 200').toBe(200);
      expect(
        answers.filter((a) => a.status === 403),
        'no 403 on the way',
      ).toEqual([]);
      expect(sentence).toBe('The sign in was cancelled at Google.');
      /* from the editor's window, on a stored deck */
      answers.length = 0;
      const deck = await newDeck(page, scratch, 'Cancel at Google');
      await openEditor(page, deck);
      const opener = ctl(page, 'title.signIn');
      await opener.waitFor({ timeout: 60_000 });
      await opener.click();
      await ctl(page, 'dialog.signIn.google').click();
      await page.waitForURL(/accounts\.google\.com/, { timeout: 60_000 });
      await page.locator('#cancel').click();
      await page.waitForURL(/\/signin\?/, { timeout: 60_000 });
      url = new URL(page.url());
      readings.push(
        `from the editor: ${answers.map((a) => `${a.status} ${a.url.split('?')[0]}`).join(', ')}; landed ${url.pathname}${url.search}`,
      );
      expect(url.searchParams.get('next')).toBe(`/edit/${deck}`);
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(
        answers.filter((a) => a.status === 403),
        'no 403 on the way',
      ).toEqual([]);
    } finally {
      test.info().annotations.push({ type: 'cancel at Google', description: readings.join(' | ') });
      try {
        await teardownAll(page, scratch);
      } finally {
        await context.close();
      }
    }
  });

  test(localTitle(...POLISH2.states), async ({ browser }) => {
    test.setTimeout(1_800_000);
    const failures: string[] = [];
    const readings: string[] = [];
    for (const appearance of ['light', 'dark'] as const)
      for (const width of [1440, 390]) {
        const { context, page } = await contextAt(browser, undefined, width, appearance);
        try {
          for (const state of PLATE_STATES)
            for (const host of state.startsWith('device.') ? ['page'] : ['page', 'window']) {
              const where = `${appearance} ${width} ${state} in the ${host}`;
              const response = await page.goto(`/dev/auth?state=${state}&host=${host}&chrome=0`, {
                timeout: 240_000,
              });
              if (response?.status() !== 200) {
                failures.push(`${where}: /dev/auth answered ${response?.status()}`);
                continue;
              }
              await page.locator(`[data-auth-plate="${state}"]`).waitFor({ timeout: 120_000 });
              await page.waitForTimeout(400);
              const read = await readPlate(page);
              const faults = plateFaults(read, where);
              /* the next control by the keyboard draws the same ring */
              await page.keyboard.press('Tab');
              const tabbed = await readPlate(page);
              if (tabbed.focused !== null) {
                const fault = ringFault(tabbed.focused, tabbed.ink, tabbed.paper);
                if (fault !== null) faults.push(`${where}: after Tab, the focus ring ${fault}`);
              }
              for (const word of await guardWords(page))
                faults.push(`${where}: the guard's word "${word}"`);
              failures.push(...faults);
              readings.push(
                `${where}: ${read.boxes.length} boxes, focus ${read.focused?.control ?? 'none'}${faults.length > 0 ? `, ${faults.length} faults` : ''}`,
              );
            }
        } finally {
          await context.close();
        }
      }
    test.info().annotations.push({ type: 'states', description: readings.join(' | ') });
    expect(failures, `${failures.length} faults`).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
   Polish two, P2-A#3 (docs/POLISH-2.md 4.3, C15): /device on the auth plate, driven from the
   terminal's side. The CLI keeps its key in a scratch configuration folder of this run
   (TURBOSLIDE_CONFIG_DIR), never the person's ~/.config/turboslide; no key is printed. */

const DEVICE_ROW = [
  'accounts.device-flow',
  'Local, mail capture: turboslide login against the server prints an address and a code; an anonymous browser at /device?user_code=<code> draws "Connect the command line" with the methods and next back to the device page; signed in by the mailed code it draws the code in two groups of four, prefilled; Approve signs the CLI in and its next deck.list runs as the account within 10 s; Deny draws the denied state; on a second server with TURBOSLIDE_MAIL=off the anonymous page offers Continue with Google and no email form',
] as const;

const CLI = join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs');

/** One `turboslide login --to ORIGIN`: its printed address and code (null when it ended first). */
function startLogin(config: string): {
  printed: Promise<{ url: string; code: string } | null>;
  exit: Promise<{ code: number | null; out: string }>;
  stop: () => void;
} {
  const child = spawn('node', [CLI, 'login', '--to', ORIGIN, '--timeout', '600'], {
    env: { ...process.env, TURBOSLIDE_CONFIG_DIR: config },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let resolvePrinted: (value: { url: string; code: string } | null) => void = () => undefined;
  const printed = new Promise<{ url: string; code: string } | null>((resolve) => {
    resolvePrinted = resolve;
  });
  const read = (chunk: Buffer) => {
    out += chunk.toString('utf8');
    const m = /Open (\S+) and enter the code (\S+)/.exec(out);
    if (m) resolvePrinted({ url: m[1] ?? '', code: m[2] ?? '' });
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  const exit = new Promise<{ code: number | null; out: string }>((resolve) =>
    child.on('close', (code) => {
      resolvePrinted(null);
      resolve({ code, out });
    }),
  );
  return { printed, exit, stop: () => child.kill() };
}

/**
 * The terminal's side of the device flow as `turboslide login` runs it (apps/cli/src/commands/
 * login.ts deviceFlow), with the `Origin` header of a page on the server, so the row reads the
 * grant it answers (the token and its key id) beside the CLI's own run of the same requests with no
 * `Origin`, which the CSRF filter lets through since request A-R2.
 */
async function terminalFlow(request: APIRequestContext): Promise<{
  url: string;
  userCode: string;
  poll: () => Promise<{ token: string | null; tokenId: string | null; error: string | null }>;
}> {
  const started = await request.post('/api/auth/device/code', {
    data: { client_id: 'turboslide-cli', scope: 'read comment write export share' },
    headers: { origin: ORIGIN },
  });
  expect(started.status(), 'the device code').toBe(200);
  const code = (await started.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
  };
  const poll = async () => {
    const answer = await request.post('/api/auth/device/token', {
      data: {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code.device_code,
        client_id: 'turboslide-cli',
      },
      headers: { origin: ORIGIN },
    });
    const body = (await answer.json().catch(() => ({}))) as {
      access_token?: string;
      token_id?: string;
      error?: string;
    };
    return {
      token: body.access_token ?? null,
      tokenId: body.token_id ?? null,
      error: body.error ?? null,
    };
  };
  return {
    url: code.verification_uri_complete ?? code.verification_uri,
    userCode: code.user_code,
    poll,
  };
}

/** A CLI command against the server with a key in its environment (never printed). */
function cliRun(config: string, args: string[], token?: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [CLI, ...args, '--to', ORIGIN, '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TURBOSLIDE_CONFIG_DIR: config,
        ...(token === undefined ? {} : { TURBOSLIDE_TOKEN: token }),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failed.status ?? 1, out: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
  }
}

/** The caller `account me` names: its principal and trust. */
function whoAmI(
  config: string,
  token?: string,
): { principal: string; trust: string; said?: string } | null {
  const run = cliRun(config, ['account', 'me'], token);
  if (run.code !== 0)
    return { principal: '', trust: '', said: `exit ${run.code}: ${run.out.trim().slice(0, 160)}` };
  try {
    /* --json prints the answer, then the human line */
    const json = run.out.slice(run.out.indexOf('{'), run.out.indexOf('\n}\n') + 2);
    const answer = JSON.parse(json) as Record<string, unknown>;
    const me = (answer.result ?? answer) as { principal?: { id?: string }; trust?: string };
    return { principal: me.principal?.id ?? '', trust: me.trust ?? '' };
  } catch {
    return null;
  }
}

/** The plate's controls on the page, by their ids. */
async function plateControls(p: Page): Promise<string[]> {
  return p
    .locator('.ts-auth-plate [data-control]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-control') ?? ''));
}

test.describe('polish two: the device page (docs/POLISH-2.md 4.3, C15)', () => {
  test.use({ actionTimeout: 15_000 });
  test.describe.configure({ mode: 'default' });

  test(localTitle(...DEVICE_ROW), async ({ browser }) => {
    test.setTimeout(1_200_000);
    const readings: string[] = [];
    const config = mkdtempSync(join(tmpdir(), 'ts-device-'));
    const { context, page } = await ownerContext(browser);
    await ownAddress(context);
    let started: ReturnType<typeof startLogin> | null = null;
    try {
      const probe = await page.request.get('/api/auth/get-session', { headers: SAME_ORIGIN });
      expect(probe.status(), 'the server has an identity database').toBe(200);
      /* the terminal: turboslide login itself, then the same requests with a page's Origin */
      const login = startLogin(config);
      started = login;
      const byCli = await login.printed;
      const ended = byCli === null ? await login.exit : null;
      readings.push(
        byCli === null
          ? `turboslide login: exit ${ended?.code}, "${(ended?.out ?? '').trim().slice(0, 120)}"`
          : `turboslide login printed ${new URL(byCli.url).pathname} and a code`,
      );
      expect
        .soft(byCli, 'turboslide login prints an address and a code (request A-R2)')
        .not.toBeNull();
      const terminal = await terminalFlow(page.request);
      const userCode = terminal.userCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      readings.push(
        `the terminal's address ${new URL(terminal.url).pathname}, a code of ${userCode.length} characters`,
      );
      expect(terminal.url.startsWith(`${ORIGIN}/device`), 'the address is the device page').toBe(
        true,
      );
      /* the anonymous browser at the address: sign in first, the methods, next back here */
      const target = `/device?user_code=${userCode}`;
      await page.goto(target);
      await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
      await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
        'data-auth-plate',
        'device.sign-in-first',
      );
      await expect(page.locator('.ts-auth-heading')).toHaveText('Connect the command line');
      const methods = await plateControls(page);
      readings.push(`anonymous: ${methods.join(', ')}`);
      expect(methods).toContain('device.google');
      expect(methods).toContain('device.email');
      /* the sign in returns to the device page: the mail's link names it, and /signin on failure */
      const asked = page.waitForRequest((r) => r.url().endsWith('/api/auth/sign-in/magic-link'));
      const email = `device-${Date.now()}@example.test`;
      await ctl(page, 'device.email').fill(email);
      await ctl(page, 'device.continue').click();
      const body = JSON.parse((await asked).postData() ?? '{}') as {
        callbackURL?: string;
        errorCallbackURL?: string;
      };
      readings.push(
        `the mail's return ${(body.callbackURL ?? '').replace(ORIGIN, '').replace(/=.*/, '=<code>')}`,
      );
      expect(body.callbackURL).toBe(`${ORIGIN}${target}`);
      expect(body.errorCallbackURL).toBe(`${ORIGIN}/signin?next=${encodeURIComponent(target)}`);
      await ctl(page, 'device.code').waitFor({ timeout: 60_000 });
      const mail = seed('mail', AUTH_DB, email) as { code: string | null };
      expect(mail.code).toMatch(/^\d{6}$/);
      await ctl(page, 'device.code').fill(mail.code ?? '');
      await ctl(page, 'device.verify').click();
      /* signed in: the page loads again at the code, in two groups of four, prefilled */
      await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
        'data-auth-plate',
        'device.code',
        { timeout: 120_000 },
      );
      await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
      const groups = [
        await ctl(page, 'device.code.first').inputValue(),
        await ctl(page, 'device.code.last').inputValue(),
      ];
      readings.push(
        `signed in: the code in groups of ${groups.map((g) => g.length).join(' and ')}, prefilled ${groups.join('') === userCode}`,
      );
      expect(groups.join('')).toBe(userCode);
      expect(groups.map((g) => g.length)).toEqual([4, 4]);
      /* Approve: the terminal is signed in and acts as the account */
      const approvedAt = Date.now();
      await ctl(page, 'device.approve').click();
      await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
        'data-auth-plate',
        'device.approved',
        { timeout: 60_000 },
      );
      await expect(ctl(page, 'device.outcome')).toHaveText(
        `It acts as ${email}. You can close this tab.`,
      );
      const granted = await terminal.poll();
      /* the key's first call as the account: `account me` (the CLI's `deck list` reads a decks
         folder and proves nothing about the key) */
      const me = whoAmI(config, granted.token ?? undefined);
      const ms = Date.now() - approvedAt;
      readings.push(
        `approved: a key ${granted.token === null ? `refused (${granted.error})` : 'granted'}; account me ${ms} ms after Approve (load ${(loadavg()[0] ?? 0).toFixed(0)}): ${me?.principal.slice(0, 4) ?? ''} ${me?.trust ?? ''}${me?.said === undefined ? '' : ` (${me.said})`}`,
      );
      expect(granted.token, 'the approved code grants a token').not.toBeNull();
      /* the grant is an API key of the account (request A-R3, server/auth/device-grant.ts): the
         CLI acts as that key's agent with the account's rights, and the key is in the account's
         list under the name `turboslide login` */
      expect
        .soft(me?.principal ?? '', "the CLI acts through the account's key (request A-R3)")
        .toBe(`agent:${granted.tokenId ?? ''}`);
      const keys = await page.request.post('/api/actions/account.tokens.list', {
        data: {},
        headers: { authorization: `Bearer ${granted.token ?? ''}` },
      });
      const listed = JSON.stringify(await keys.json().catch(() => ({})));
      readings.push(
        `the key in the account's list: ${keys.status()} ${listed.includes(granted.tokenId ?? '-') && listed.includes('turboslide login')}`,
      );
      expect
        .soft(listed, "the key is the account's, named turboslide login")
        .toContain(granted.tokenId ?? '-');
      expect.soft(listed).toContain('turboslide login');
      /* the CLI's own code, approved on the signed in page: turboslide login stores the key and
         exits 0, and `account me` with the stored key (no TURBOSLIDE_TOKEN) answers through it */
      if (byCli !== null) {
        const cliCode = byCli.code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        await page.goto(`/device?user_code=${cliCode}`);
        await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
        await ctl(page, 'device.approve').click();
        await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
          'data-auth-plate',
          'device.approved',
          { timeout: 60_000 },
        );
        const loggedIn = await Promise.race([
          login.exit,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
        ]);
        const stored = whoAmI(config);
        readings.push(
          `turboslide login after Approve: exit ${loggedIn?.code ?? 'still polling'}; account me with the stored key: ${stored?.principal.slice(0, 10) ?? ''} ${stored?.trust ?? ''}`,
        );
        expect.soft(loggedIn?.code, 'turboslide login stores the key and exits 0').toBe(0);
        expect
          .soft(stored?.principal ?? '', "the stored key acts as the account's agent")
          .toMatch(/^agent:tok_/);
      }
      if ((loadavg()[0] ?? 0) <= 24) expect.soft(ms, 'within 10 s').toBeLessThanOrEqual(10_000);
      /* Deny: a second code, denied */
      const second = await terminalFlow(page.request);
      const code2 = second.userCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      await page.goto(`/device?user_code=${code2}`);
      await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
      await ctl(page, 'device.deny').click();
      await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
        'data-auth-plate',
        'device.denied',
        { timeout: 60_000 },
      );
      await expect(page.locator('.ts-auth-heading')).toHaveText('The terminal was not signed in');
      const denied = await second.poll();
      readings.push(`denied: the terminal reads ${denied.error}`);
      expect(denied.error, 'the terminal hears the denial').toBe('access_denied');
      /* the mail off server: Continue with Google and no email form */
      if (MAIL_OFF_BASE === null) {
        readings.push('mail off: not read (no second server named by TURBOSLIDE_MAIL_OFF_BASE)');
      } else {
        const { context: off, page: offPage } = await otherContext(browser);
        try {
          await offPage.goto(`${MAIL_OFF_BASE}/device?user_code=ABCDEFGH`);
          await offPage.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
          const offMethods = await plateControls(offPage);
          readings.push(`mail off: ${offMethods.join(', ')}`);
          expect(offMethods).toContain('device.google');
          expect(offMethods).not.toContain('device.email');
        } finally {
          await off.close();
        }
      }
    } finally {
      test.info().annotations.push({ type: 'device', description: readings.join(' | ') });
      started?.stop();
      await context.close();
      rmSync(config, { recursive: true, force: true });
    }
  });
});

/* ---------------------------------------------------------------------------------------------
   Polish two, P2-A#4 (docs/POLISH-2.md 4.3, 4.5, 6.4): every surface on the auth plate, read on
   the capture server: the sentences a refusal says, the anonymous deck kept through a sign in, the
   account menu's words. The mails are read from the server's own capture table. */

const POLISH2_A4 = {
  failure: [
    'accounts.failure-says-why',
    'Local, mail capture, from /signin and from the editor\'s window: a wrong code, the fourth code after three wrong tries, a used link and an invalid address each draw their own sentence of docs/POLISH-2.md 4.5 under the control that caused it; Send Another reads "Send another in 0:45" counting down in tabular figures and sends one mail when it ends; the fourth mail to one address in 10 minutes draws the quota sentence; the expired code\'s state is pinned by auth-model.test.ts',
  ],
  kept: [
    'accounts.anonymous-deck-kept',
    "Local, mail capture: an anonymous browser makes and titles a deck; Sign In on /decks goes to /signin?next=/decks; the mailed code signs in and lands on /decks, which lists the deck as the account's, and it opens with Share; the same from the editor's window keeps the deck open with no reload of the draft",
  ],
  words: [
    'accounts.menu.words',
    "Local, signed in by the mailed code: the account menu's rows read Change name, Change avatar, Sign out, Forget this browser and Profile, which opens Profile; the name prompt draws no Sign In; under 480 px More holds Change name and Sign out; Forget this browser's lede is two sentences with periods and its button reads Forget This Browser",
  ],
} as const;

/**
 * A forwarded address of its own for a context: the library's limiter keys the sign in mails by
 * `x-forwarded-for` (better-auth.ts `ipAddressHeaders`), ten per address an hour, and a lane's
 * server on a tmp store counts as hosted, so the switch that turns the limiter off does not apply.
 * Each row's browsers then count apart, as different people do.
 */
async function ownAddress(context: BrowserContext): Promise<void> {
  const n = Math.floor(Math.random() * 250) + 1;
  const m = Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ ...extraHTTPHeaders, 'x-forwarded-for': `10.77.${n}.${m}` });
}

/** The sign in mails the server captured for an address, newest first. */
function signInMails(email: string): { subject: string; text: string; html: string | null }[] {
  const db = new DatabaseSync(AUTH_DB, { readOnly: true });
  try {
    return db
      .prepare(
        "select subject, text, html from ts_mail where toAddress = ? and kind = 'sign-in' order by createdAt desc",
      )
      .all(email.toLowerCase()) as { subject: string; text: string; html: string | null }[];
  } finally {
    db.close();
  }
}

/** The six digit code of the newest sign in mail to an address. */
function newestCode(email: string): string {
  const text = signInMails(email)[0]?.text ?? '';
  return /Code: (\d{6})/.exec(text)?.[1] ?? '';
}

/** Signs in on /signin by the mailed code and waits for the return path. */
async function signInOnPage(p: Page, email: string, next: string): Promise<void> {
  await p.goto(`/signin?next=${encodeURIComponent(next)}`);
  await p.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
  await ctl(p, 'page.signIn.email').fill(email);
  await ctl(p, 'page.signIn.continue').click();
  await ctl(p, 'page.signIn.code').waitFor({ timeout: 60_000 });
  await ctl(p, 'page.signIn.code').fill(newestCode(email));
  await ctl(p, 'page.signIn.verify').click();
  await p.waitForURL((url) => url.pathname === next.split('?')[0], { timeout: 120_000 });
}

test.describe('polish two: every surface on the plate (docs/POLISH-2.md 4.3, 6.4)', () => {
  test.use({ actionTimeout: 15_000 });
  test.describe.configure({ mode: 'default' });

  test(localTitle(...POLISH2_A4.failure), async ({ browser }) => {
    test.setTimeout(1_200_000);
    const readings: string[] = [];
    const scratch = new Scratch();
    const { context, page } = await ownerContext(browser);
    await ownAddress(context);
    try {
      const stamp = Date.now();
      await page.goto('/signin?next=/decks');
      await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
      /* an invalid address: its sentence under Continue */
      await ctl(page, 'page.signIn.email').fill('not-an-address');
      await ctl(page, 'page.signIn.continue').click();
      await expect(ctl(page, 'page.signIn.error')).toHaveText(
        'That is not an email address. Check it and try again.',
      );
      readings.push('invalid address: its sentence under Continue');
      /* a wrong code three times, then the right one: the three tries' sentence, then the spent one */
      const e1 = `failure-a-${stamp}@example.test`;
      await ctl(page, 'page.signIn.email').fill(e1);
      await ctl(page, 'page.signIn.continue').click();
      await ctl(page, 'page.signIn.code').waitFor({ timeout: 60_000 });
      const right = newestCode(e1);
      const wrong = right === '000000' ? '111111' : '000000';
      for (let i = 0; i < 3; i += 1) {
        await ctl(page, 'page.signIn.code').fill(wrong);
        await ctl(page, 'page.signIn.verify').click();
        await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
          'data-auth-plate',
          'email.code-wrong',
          { timeout: 60_000 },
        );
        await expect(ctl(page, 'page.signIn.error')).toHaveText(
          'That code does not match. Check the newest message and try again.',
        );
      }
      await ctl(page, 'page.signIn.code').fill(right);
      await ctl(page, 'page.signIn.verify').click();
      await expect(page.locator('[data-auth-plate]')).toHaveAttribute(
        'data-auth-plate',
        'email.code-spent',
        { timeout: 60_000 },
      );
      await expect(ctl(page, 'page.signIn.error')).toHaveText(
        'That code had three wrong tries. Send another to get a new one.',
      );
      readings.push(
        'three wrong codes, then the right one: code-wrong three times, then code-spent',
      );
      /* Send Another: the countdown in tabular figures, then one mail when it ends */
      const resend = ctl(page, 'page.signIn.resend');
      const first = (await resend.textContent()) ?? '';
      const numerals = await resend.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
      expect(first).toMatch(/^Send another in 0:[0-4]\d$/);
      expect(numerals).toContain('tabular-nums');
      await page.waitForTimeout(2_000);
      const later = (await resend.textContent()) ?? '';
      expect(later, 'the countdown runs').not.toBe(first);
      await expect(resend).toHaveText('Send Another', { timeout: 90_000 });
      const before = signInMails(e1).length;
      await resend.click();
      await expect(resend).toHaveText(/^Send another in 0:4\d$/, { timeout: 60_000 });
      await expect.poll(() => signInMails(e1).length, { timeout: 30_000 }).toBe(before + 1);
      readings.push(
        `Send Another: "${first}" then "${later}" in ${numerals}, then one mail (${before} to ${before + 1})`,
      );
      /* the fourth mail to one address in 10 minutes: the quota sentence, and no fourth mail */
      const e2 = `failure-b-${stamp}@example.test`;
      for (let i = 0; i < 3; i += 1) {
        await ctl(page, 'page.signIn.back')
          .click()
          .catch(() => undefined);
        await ctl(page, 'page.signIn.email').fill(e2);
        await ctl(page, 'page.signIn.continue').click();
        await ctl(page, 'page.signIn.code').waitFor({ timeout: 60_000 });
      }
      await ctl(page, 'page.signIn.back').click();
      await ctl(page, 'page.signIn.email').fill(e2);
      await ctl(page, 'page.signIn.continue').click();
      await expect(ctl(page, 'page.signIn.error')).toHaveText(
        'That address had three messages in the last 10 minutes. Wait, then send another.',
      );
      expect(signInMails(e2).length, 'three mails reached the address').toBe(3);
      readings.push('the fourth mail in 10 minutes: the quota sentence, three mails sent');
      /* a used link: the second visit lands on /signin with its sentence */
      const e3 = `failure-c-${stamp}@example.test`;
      const { context: other, page: second } = await otherContext(browser);
      await ownAddress(other);
      try {
        await second.goto('/signin?next=/decks');
        await second.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
        await ctl(second, 'page.signIn.email').fill(e3);
        await ctl(second, 'page.signIn.continue').click();
        await ctl(second, 'page.signIn.code').waitFor({ timeout: 60_000 });
        const link =
          /(https?:\/\/\S+magic-link\/verify\S+)/.exec(signInMails(e3)[0]?.text ?? '')?.[1] ?? '';
        expect(link).not.toBe('');
        await second.goto(link);
        await second.waitForURL((url) => url.pathname === '/decks', { timeout: 120_000 });
        await second.goto(link);
        await second.waitForURL((url) => url.pathname === '/signin', { timeout: 120_000 });
        await expect(second.locator('[data-auth-plate]')).toHaveAttribute(
          'data-auth-plate',
          'error.link',
        );
        await expect(ctl(second, 'page.signIn.reason')).toHaveText(
          'That link was used or has expired. Ask for a new one.',
        );
        const url = new URL(second.url());
        readings.push(
          `a used link: ${url.pathname}?error=${url.searchParams.get('error')}&next=${url.searchParams.get('next')}`,
        );
      } finally {
        await other.close();
      }
      /* from the editor's window: a wrong code and an invalid address */
      const deck = await newDeck(page, scratch, 'Failure sentences');
      await openEditor(page, deck);
      await ctl(page, 'title.signIn').click();
      await ctl(page, 'dialog.signIn.email').fill('not-an-address');
      await ctl(page, 'dialog.signIn.continue').click();
      await expect(ctl(page, 'dialog.signIn.error')).toHaveText(
        'That is not an email address. Check it and try again.',
      );
      const e4 = `failure-d-${stamp}@example.test`;
      await ctl(page, 'dialog.signIn.email').fill(e4);
      await ctl(page, 'dialog.signIn.continue').click();
      await ctl(page, 'dialog.signIn.code').waitFor({ timeout: 60_000 });
      const right4 = newestCode(e4);
      await ctl(page, 'dialog.signIn.code').fill(right4 === '000000' ? '111111' : '000000');
      await ctl(page, 'dialog.signIn.verify').click();
      await expect(ctl(page, 'dialog.signIn.error')).toHaveText(
        'That code does not match. Check the newest message and try again.',
        { timeout: 60_000 },
      );
      readings.push("the editor's window: the invalid address and the wrong code sentences");
      await page.keyboard.press('Escape');
    } finally {
      test
        .info()
        .annotations.push({ type: 'failure sentences', description: readings.join(' | ') });
      try {
        await teardownAll(page, scratch);
      } finally {
        await context.close();
      }
    }
  });

  test(localTitle(...POLISH2_A4.kept), async ({ browser }) => {
    test.setTimeout(1_200_000);
    const readings: string[] = [];
    const scratchA = new Scratch();
    const scratchB = new Scratch();
    const { context: aCtx, page: A } = await ownerContext(browser);
    const { context: bCtx, page: B } = await otherContext(browser);
    await ownAddress(aCtx);
    await ownAddress(bCtx);
    const stamp = Date.now();
    try {
      /* from /decks: the page's Sign In link, the mailed code, back on /decks with the deck */
      const deck = await newDeck(A, scratchA, `Kept deck ${stamp}`);
      await A.goto('/decks');
      await A.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 60_000 });
      const href = await ctl(A, 'home.signIn').getAttribute('href');
      expect(href).toBe('/signin?next=%2Fdecks');
      await ctl(A, 'home.signIn').click();
      await A.waitForURL((url) => url.pathname === '/signin', { timeout: 60_000 });
      const email = `kept-a-${stamp}@example.test`;
      await A.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
      await ctl(A, 'page.signIn.email').fill(email);
      await ctl(A, 'page.signIn.continue').click();
      await ctl(A, 'page.signIn.code').waitFor({ timeout: 60_000 });
      await ctl(A, 'page.signIn.code').fill(newestCode(email));
      await ctl(A, 'page.signIn.verify').click();
      await A.waitForURL((url) => url.pathname === '/decks', { timeout: 120_000 });
      const cards = await homeCards(A);
      readings.push(
        `/decks: signed in, the deck ${cards.includes(deck) ? 'listed' : 'missing'} among ${cards.length}`,
      );
      expect(cards, "the anonymous deck is the account's").toContain(deck);
      await openEditor(A, deck);
      await openShare(A);
      readings.push('the deck opens with Share');
      await closeShare(A);
      /* from the editor's window: the deck stays open at its address with its title */
      const deckB = await newDeck(B, scratchB, `Kept window ${stamp}`);
      await openEditor(B, deckB);
      const titleBefore = ((await ctl(B, 'deck.name').first().textContent()) ?? '').trim();
      await ctl(B, 'title.signIn').click();
      const emailB = `kept-b-${stamp}@example.test`;
      await ctl(B, 'dialog.signIn.email').fill(emailB);
      await ctl(B, 'dialog.signIn.continue').click();
      await ctl(B, 'dialog.signIn.code').waitFor({ timeout: 60_000 });
      await ctl(B, 'dialog.signIn.code').fill(newestCode(emailB));
      /* the code signs the tab in and the editor loads the deck again as the account (EditorRoot's
         exchange, unchanged by the plate): the same address, the same title */
      const reloaded = B.waitForEvent('load', { timeout: 120_000 });
      await ctl(B, 'dialog.signIn.verify').click();
      await reloaded;
      await waitEditor(B);
      await expect
        .poll(
          async () => {
            try {
              return (await peopleState(B)).account?.signedIn ?? false;
            } catch {
              return false;
            }
          },
          { timeout: 60_000 },
        )
        .toBe(true);
      const after = { title: ((await ctl(B, 'deck.name').first().textContent()) ?? '').trim() };
      readings.push(
        `the window: ${new URL(B.url()).pathname} signed in, the title "${after.title}" (was "${titleBefore}")`,
      );
      expect(new URL(B.url()).pathname).toBe(`/edit/${deckB}`);
      expect(after.title).toBe(titleBefore);
      expect(await homeCards(B), "the deck is the account's").toContain(deckB);
    } finally {
      test.info().annotations.push({ type: 'deck kept', description: readings.join(' | ') });
      try {
        await teardownAll(A, scratchA);
        await teardownAll(B, scratchB);
      } finally {
        await aCtx.close();
        await bCtx.close();
      }
    }
  });

  test(localTitle(...POLISH2_A4.words), async ({ browser }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const scratch = new Scratch();
    const { context, page } = await ownerContext(browser);
    await ownAddress(context);
    try {
      const email = `words-${Date.now()}@example.test`;
      await signInOnPage(page, email, '/decks');
      const deck = await newDeck(page, scratch, 'Menu words');
      await openEditor(page, deck);
      /* the account menu's rows */
      await ctl(page, 'title.account').first().click();
      const menu = page.locator('#ts-menu-account');
      await menu.waitFor({ timeout: 15_000 });
      const rows = await menu
        .locator('[role="menuitem"]')
        .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
      readings.push(`menu: ${rows.join(', ')}`);
      expect(rows).toEqual([
        'Change name',
        'Change avatar',
        'Sign out',
        'Forget this browser',
        'Profile',
      ]);
      await menu.locator('[data-control="account.sessions"]').click();
      await ctl(page, 'dialog.profile').waitFor({ timeout: 15_000 });
      readings.push('Profile opens the Profile dialog');
      await page.keyboard.press('Escape');
      /* the name prompt draws no Sign In for a signed in person */
      await ctl(page, 'title.account').first().click();
      await page.locator('#ts-menu-account [data-control="account.changeName"]').click();
      await ctl(page, 'dialog.namePrompt').waitFor({ timeout: 15_000 });
      await expect(ctl(page, 'dialog.namePrompt.signIn')).toHaveCount(0);
      readings.push('the name prompt: no Sign In');
      await page.keyboard.press('Escape');
      /* Forget this browser's words, read and closed */
      await ctl(page, 'title.account').first().click();
      await page.locator('#ts-menu-account [data-control="account.forget"]').click();
      await ctl(page, 'dialog.forgetBrowser').waitFor({ timeout: 15_000 });
      const lede =
        (await page
          .locator('[data-control="dialog.forgetBrowser"] .ts-dialog-lead')
          .textContent()) ?? '';
      const button = (await ctl(page, 'dialog.forgetBrowser.confirm').textContent()) ?? '';
      readings.push(`Forget: "${lede}" with "${button}"`);
      expect(lede).toBe(
        'Your name, avatar and unsaved changes in this browser are cleared. Earlier edits keep the old name.',
      );
      expect(button.trim()).toBe('Forget This Browser');
      await page.keyboard.press('Escape');
      await expect(ctl(page, 'dialog.forgetBrowser')).toHaveCount(0);
      /* under 480 px More holds Change name and Sign out */
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await ctl(page, 'title.more').click();
      const more = page.locator('#ts-menu-title-more');
      await more.waitFor({ timeout: 15_000 });
      const moreRows = await more
        .locator('[role="menuitem"]')
        .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
      readings.push(`More at 390: ${moreRows.join(', ')}`);
      expect(moreRows.some((r) => r.startsWith('Change name'))).toBe(true);
      expect(moreRows.some((r) => r.startsWith('Sign out'))).toBe(true);
      expect(moreRows.some((r) => r.startsWith('Sign in'))).toBe(false);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });
    } finally {
      test.info().annotations.push({ type: 'menu words', description: readings.join(' | ') });
      try {
        await teardownAll(page, scratch);
      } finally {
        await context.close();
      }
    }
  });
});

/* ---------------------------------------------------------------------------------------------
   Polish two, P2-A#5 (docs/POLISH-2.md 4.3, 4.5, C21): the sign in mail, read from the server's
   capture table. */

const MAIL_ROW = [
  'accounts.mail-branded',
  'Local, mail capture: the sign in mail\'s subject is "Sign in to Turboslide" and holds no digit; its HTML body starts with the Turboslide wordmark and its links are ink; its text body carries the link and the code',
] as const;

test.describe('polish two: the sign in mail (docs/POLISH-2.md C21)', () => {
  test(localTitle(...MAIL_ROW), async ({ request }) => {
    test.setTimeout(300_000);
    const email = `mail-${Date.now()}@example.test`;
    const asked = await request.post('/api/auth/sign-in/magic-link', {
      data: { email, callbackURL: '/decks' },
      /* a forwarded address of the row's own: the library counts ten mails an hour per address */
      headers: {
        ...SAME_ORIGIN,
        'x-forwarded-for': `10.80.${Math.floor(Math.random() * 250) + 1}.9`,
      },
    });
    expect(asked.status()).toBe(200);
    await expect.poll(() => signInMails(email).length, { timeout: 60_000 }).toBe(1);
    const mail = signInMails(email)[0]!;
    const html = mail.html ?? '';
    const body = html.slice(html.indexOf('<body'));
    const first = body.slice(body.indexOf('>') + 1).trimStart();
    const links = [...html.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    test.info().annotations.push({
      type: 'mail',
      description: `subject "${mail.subject}"; the body opens ${first.slice(0, 60).replace(/</g, '[')}; ${links.length} link(s) ${links.map((a) => /style="([^"]*)"/.exec(a)?.[1] ?? 'no style').join(', ')}; the text has the link ${/magic-link\/verify/.test(mail.text)} and the code ${/Code: \d{6}/.test(mail.text)}`,
    });
    expect(mail.subject).toBe('Sign in to Turboslide');
    expect(mail.subject).not.toMatch(/\d/);
    expect(first).toMatch(/^<p data-wordmark="turboslide"[^>]*>Turboslide<\/p>/);
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a, 'the link is ink').toMatch(/color: #070707/);
    expect(mail.text).toMatch(/https?:\/\/\S+magic-link\/verify\S+/);
    expect(mail.text).toMatch(/Code: \d{6}/);
  });
});
