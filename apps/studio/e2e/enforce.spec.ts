import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';

import { Scratch, newDeck, ownerContext, teardownAll } from './core/lib';

// Security hotfix H3 (docs/hardening/research/data-verify.md DATA-1, DATA-V1, DATA-V3, DATA-V4):
// the enforce rows the verifier named, against a node server of the branch with production's
// settings, TURBOSLIDE_AUTHORIZE=shadow included (it must weaken nothing), an identity database
// and captured mail. A signed in creator opens /deck/<id> and moves it to trash; a stranger is
// refused read, rename, copy, trash and remove with the answer a missing deck gets; a link grant
// opens what it grants for viewer, commenter and editor; an anonymous creator keeps their deck;
// the realtime ticket route admits each person at the role the record gives and refuses the
// stranger; no answer names a deck the caller cannot read.
//
// The server functions are called the way the pages call them (`POST /_serverFn/<id>` with the
// TanStack client's serialized body), by the ids the node-server build's manifest names
// (`TURBOSLIDE_SERVER_OUTPUT`, else apps/studio/.output/server), so the row reads the functions
// themselves and not a route that happens to share their decision.
//
//   TURBOSLIDE_AUTH_DB=<the server's database> PLAYWRIGHT_BASE_URL=http://localhost:4853 \
//     node_modules/.bin/playwright test apps/studio/e2e/enforce.spec.ts

const ROOT = join(import.meta.dirname, '..', '..', '..');
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';
const SAME_ORIGIN = { origin: BASE, 'sec-fetch-site': 'same-origin' };
const OUTPUT =
  process.env.TURBOSLIDE_SERVER_OUTPUT ?? join(ROOT, 'apps', 'studio', '.output', 'server');
const AUTH_DB_RELATIVE = process.env.TURBOSLIDE_AUTH_DB ?? '.turboslide/auth.sqlite';
const AUTH_DB = AUTH_DB_RELATIVE.startsWith('/') ? AUTH_DB_RELATIVE : join(ROOT, AUTH_DB_RELATIVE);
const SEED = join(import.meta.dirname, 'identity-seed.mts');
/** A deck id nobody made: 26 base32 characters, the shape of a new deck's id. */
const MISSING = 'zzzzzzzzzzzzzzzzzzzzzzzzzq';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

// ---------------------------------------------------------------------------------------------
// the server functions, as the TanStack client sends them

function serverFnIds(): Map<string, string> | null {
  if (!existsSync(OUTPUT)) return null;
  const file = readdirSync(OUTPUT).find((name) =>
    name.startsWith('__23tanstack-start-server-fn-resolver'),
  );
  if (file === undefined) return null;
  const text = readFileSync(join(OUTPUT, file), 'utf8');
  const ids = new Map<string, string>();
  for (const match of text.matchAll(
    /"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([A-Za-z0-9]+)_createServerFn_handler"/g,
  ))
    ids.set(match[2]!, match[1]!);
  return ids;
}

const IDS = serverFnIds();
const NO_IDS = `no server function manifest under ${OUTPUT}: run the spec against a node-server build`;

type Plain = string | number;

/** The serialized `{ data }` the client posts, for an object of plain strings and numbers. */
function payload(data: Record<string, Plain>): string {
  const keys = Object.keys(data);
  const values = keys.map((key) => {
    const value = data[key]!;
    return typeof value === 'number' ? { t: 0, s: value } : { t: 1, s: value };
  });
  return JSON.stringify({
    t: {
      t: 10,
      i: 0,
      p: { k: ['data'], v: [{ t: 10, i: 1, p: { k: keys, v: values }, o: 0 }] },
      o: 0,
    },
    f: 127,
    m: [],
  });
}

type Node = { t: number; s?: unknown; p?: { k: string[]; v: Node[] }; a?: Node[] };

/** A serialized string as it was: the serializer escapes it the way a JavaScript literal does. */
function unescaped(text: string): string {
  const hex = text.replace(/\\x([0-9a-fA-F]{2})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
  try {
    return JSON.parse(`"${hex}"`) as string;
  } catch {
    return hex;
  }
}

/** The value of a serialized answer, for the plain shapes these functions answer. */
function decode(node: Node | undefined): unknown {
  if (node === undefined) return undefined;
  switch (node.t) {
    case 0:
      return node.s;
    case 1:
      return unescaped(String(node.s));
    case 2:
      return ([null, undefined, true, false] as unknown[])[node.s as number];
    case 9:
      return (node.a ?? []).map(decode);
    case 10: {
      const out: Record<string, unknown> = {};
      node.p?.k.forEach((key, i) => {
        out[key] = decode(node.p?.v[i]);
      });
      return out;
    }
    default:
      return undefined;
  }
}

type FnAnswer = { status: number; error: string | null; result: unknown; raw: string };

/** The server functions of these rows that the client calls with GET (`createServerFn({ method: 'GET' })`). */
const GET_FUNCTIONS = new Set(['readDeckCardFn']);

/** One server function call over the context's cookies, with the method the client uses. */
async function callFn(
  request: APIRequestContext,
  name: string,
  data: Record<string, Plain>,
): Promise<FnAnswer> {
  const id = IDS?.get(name);
  if (id === undefined) throw new Error(`no server function ${name} in the manifest`);
  const headers = {
    ...SAME_ORIGIN,
    'x-tsr-serverFn': 'true',
    accept: 'application/x-tss-framed, application/x-ndjson, application/json',
  };
  const response = GET_FUNCTIONS.has(name)
    ? await request.get(`/_serverFn/${id}?payload=${encodeURIComponent(payload(data))}`, {
        headers,
      })
    : await request.post(`/_serverFn/${id}`, {
        headers: { ...headers, 'content-type': 'application/json' },
        data: payload(data),
      });
  const raw = await response.text();
  let error: string | null = null;
  let result: unknown;
  try {
    const parsed = JSON.parse(raw) as Node;
    const fields = parsed.p;
    const errorNode = fields?.v[fields.k.indexOf('error')] as
      (Node & { s?: { message?: Node } }) | undefined;
    if (errorNode !== undefined && errorNode.t === 25)
      error = String(decode(errorNode.s?.message) ?? '');
    result = decode(fields?.v[fields.k.indexOf('result')]);
  } catch {
    error = raw.slice(0, 200);
  }
  return { status: response.status(), error, result, raw };
}

/** An answer with the deck's id replaced, to compare a restricted deck's with a missing one's. */
function shapeOf(answer: FnAnswer, deckId: string): string {
  return `${answer.status} ${answer.raw.split(deckId).join('<id>')}`;
}

// ---------------------------------------------------------------------------------------------
// people

async function signIn(context: BrowserContext, email: string): Promise<void> {
  const asked = await context.request.post('/api/auth/sign-in/magic-link', {
    data: { email, callbackURL: '/decks' },
    headers: SAME_ORIGIN,
  });
  expect(asked.status(), 'the sign in mail is asked for').toBe(200);
  const out = execFileSync('node', [SEED, 'mail', AUTH_DB, email], { encoding: 'utf8' });
  const mail = JSON.parse(out.trim().split('\n').pop() ?? '{}') as { code: string | null };
  expect(mail.code, 'the captured code').toMatch(/^\d{6}$/);
  const verified = await context.request.post('/api/auth/sign-in/email-otp', {
    data: { email, otp: mail.code },
    headers: SAME_ORIGIN,
  });
  expect(verified.status(), 'the code signs in').toBe(200);
}

type Access = {
  role: string | null;
  capabilities: string[];
  record: { owner: string | null; revision: number; generalAccess: { mode: string } };
};

async function accessOf(
  request: APIRequestContext,
  deckId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await request.get(`/api/access/${deckId}`, { headers: SAME_ORIGIN });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function person(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const made = await ownerContext(browser);
  // the first request mints the identity cookie, as a browser's first page does
  await made.page.goto('/decks');
  return made;
}

// ---------------------------------------------------------------------------------------------

const scratch = new Scratch();
let owner: { context: BrowserContext; page: Page };
let stranger: { context: BrowserContext; page: Page };
let deck = '';

test.beforeAll(async ({ browser }) => {
  owner = await person(browser);
  stranger = await person(browser);
  deck = await newDeck(owner.page, scratch, 'Board plan for the stranger rows');
});

test.afterAll(async () => {
  await teardownAll(owner.page, scratch).catch(() => undefined);
  await owner.context.close();
  await stranger.context.close();
});

test('authz.new-deck-id: a deck from /new has 128 random bits in its id, and its record names its creator as owner', async () => {
  expect(deck).toMatch(/^untitled-\d{8}-[a-z2-7]{26}$/);
  const own = await accessOf(owner.context.request, deck);
  expect(own.status).toBe(200);
  expect((own.body as Access).role).toBe('owner');
  expect((own.body as Access).record.generalAccess.mode).toBe('restricted');
});

test('authz.stranger-refused: a stranger is refused read, rename, copy, trash, restore and remove with the answer a missing deck gets', async () => {
  test.skip(IDS === null, NO_IDS);
  const s = stranger.context.request;
  // read: the page and the access route
  expect((await s.get(`/deck/${deck}`)).status()).toBe(404);
  expect((await s.get(`/edit/${deck}`)).status()).toBe(404);
  expect((await s.get(`/deck/${MISSING}`)).status()).toBe(404);
  const restrictedAccess = await accessOf(s, deck);
  const missingAccess = await accessOf(s, MISSING);
  expect(restrictedAccess).toEqual({ status: 404, body: { error: 'not_found' } });
  expect(missingAccess).toEqual(restrictedAccess);
  // the server functions the home page and the editor call
  const calls: [string, Record<string, Plain>][] = [
    ['renameDeckFn', { name: 'Changed by a stranger' }],
    ['copyDeckFn', { name: 'Stolen copy' }],
    ['trashDeckFn', {}],
    ['restoreDeckFn', {}],
    ['removeDeckFn', {}],
  ];
  for (const [name, extra] of calls) {
    const restricted = await callFn(s, name, { deckId: deck, ...extra });
    const missing = await callFn(s, name, { deckId: MISSING, ...extra });
    expect(restricted.error, `${name} on the owner's deck`).toBe('{"error":"not_found"}');
    expect(shapeOf(restricted, deck), `${name}: restricted and missing answer alike`).toBe(
      shapeOf(missing, MISSING),
    );
  }
  // the owner's deck is as it was: its title, outside the trash
  const details = await callFn(owner.context.request, 'readDeckCardFn', { deckId: deck });
  expect(details.error).toBeNull();
  expect((details.result as { title: string } | null)?.title).toBe(
    'Board plan for the stranger rows',
  );
  // a stranger's create naming the owner's id gets a fresh id and no word of the other
  const created = await callFn(s, 'createDeckFn', { name: 'Mine', from: 'blank', id: deck });
  expect(created.error).toBeNull();
  const made = created.result as { deckId: string; dir: string };
  expect(made.deckId).toMatch(/^[a-z2-7]{26}$/);
  expect(made.deckId).not.toBe(deck);
  expect(made.dir, "no server path in the answer: the store's place").toBe(`decks/${made.deckId}`);
  expect(created.raw).not.toContain(ROOT);
  const removed = await callFn(s, 'trashDeckFn', { deckId: made.deckId });
  expect(removed.error).toBeNull();
  expect((await callFn(s, 'removeDeckFn', { deckId: made.deckId })).error).toBeNull();
});

test('authz.signed-in-creator: a signed in creator opens /deck/<id>, moves it to trash and restores it through the server functions', async ({
  browser,
}) => {
  test.skip(IDS === null, NO_IDS);
  const me = await person(browser);
  try {
    await signIn(me.context, `h3-creator-${Date.now()}@example.test`);
    const mine = await newDeck(me.page, scratch, 'Signed in creator deck');
    const access = await accessOf(me.context.request, mine);
    expect((access.body as Access).role).toBe('owner');
    expect((access.body as Access).record.owner).toMatch(/^usr_/);
    const view = await me.page.goto(`/deck/${mine}`);
    expect(view?.status()).toBe(200);
    await expect(me.page.locator('body')).toContainText('Signed in creator deck');
    const r = me.context.request;
    expect(
      (await callFn(r, 'renameDeckFn', { deckId: mine, name: 'Renamed by its owner' })).error,
    ).toBeNull();
    expect((await callFn(r, 'trashDeckFn', { deckId: mine })).error).toBeNull();
    expect((await r.get(`/deck/${mine}`)).status(), 'a deck in the trash').toBe(404);
    expect((await callFn(r, 'restoreDeckFn', { deckId: mine })).error).toBeNull();
    expect((await r.get(`/deck/${mine}`)).status()).toBe(200);
    expect((await callFn(r, 'trashDeckFn', { deckId: mine })).error).toBeNull();
    expect((await callFn(r, 'removeDeckFn', { deckId: mine })).error).toBeNull();
    scratch.ids.delete(mine);
    expect((await r.get(`/edit/${mine}`)).status()).toBe(404);
  } finally {
    await me.context.close();
  }
});

test('authz.link-grants: a link opens what it grants for viewer, commenter and editor, and nothing more', async ({
  browser,
}) => {
  test.skip(IDS === null, NO_IDS);
  const o = owner.context.request;
  for (const role of ['viewer', 'commenter', 'editor'] as const) {
    const current = (await accessOf(o, deck)).body as Access;
    const minted = await o.post(`/api/share/${deck}/share.createLink`, {
      headers: { ...SAME_ORIGIN, 'content-type': 'application/json' },
      data: { role, baseRevision: current.record.revision },
    });
    expect(minted.status(), `the ${role} link is minted`).toBe(200);
    const { url } = (await minted.json()) as { url: string };
    const visitor = await person(browser);
    try {
      await visitor.page.goto(new URL(url).pathname);
      await expect(visitor.page).toHaveURL(new RegExp(`/(deck|edit)/${deck}$`));
      const v = visitor.context.request;
      const access = (await accessOf(v, deck)).body as Access;
      expect(access.role, `the ${role} link's role`).toBe(role);
      expect(access.capabilities.includes('comment'), `${role} comments`).toBe(role !== 'viewer');
      expect(access.capabilities.includes('write'), `${role} writes`).toBe(role === 'editor');
      expect((await v.get(`/deck/${deck}`)).status(), `${role} reads the deck`).toBe(200);
      // the server functions see the grant too (DATA-V4): the card reads, a rename writes
      const card = await callFn(v, 'readDeckCardFn', { deckId: deck });
      expect(card.error).toBeNull();
      expect(card.result, `${role} reads the card`).not.toBeNull();
      const renamed = await callFn(v, 'renameDeckFn', {
        deckId: deck,
        name: 'Board plan for the stranger rows',
      });
      if (role === 'editor') expect(renamed.error, 'an editor renames').toBeNull();
      else expect(renamed.error, `a ${role} does not rename`).toMatch(/"error":"forbidden"/);
      // nothing by link trashes, shares or removes (SPEC-3 6.2)
      expect((await callFn(v, 'trashDeckFn', { deckId: deck })).error).toMatch(/forbidden/);
      // the realtime ticket route admits the link visitor (on the do tier its ticket's role is
      // the link's); the stranger is refused with the missing deck's answer
      const ticket = await v.get(`/api/decks/${deck}/ticket`, { headers: SAME_ORIGIN });
      expect(ticket.status(), `${role} gets a ticket answer`).toBe(200);
      const body = (await ticket.json()) as { tier?: string; ticket?: string };
      if (body.ticket !== undefined) {
        const claims = JSON.parse(
          Buffer.from(body.ticket.split('.')[0] ?? '', 'base64url').toString('utf8'),
        ) as { role?: string };
        expect(claims.role, `the ${role} ticket's role`).toBe(role);
      }
    } finally {
      await visitor.context.close();
    }
  }
});

test('authz.ticket-role: the ticket route answers the owner, refuses the stranger as a missing deck', async () => {
  const own = await owner.context.request.get(`/api/decks/${deck}/ticket`, {
    headers: SAME_ORIGIN,
  });
  expect(own.status()).toBe(200);
  const body = (await own.json()) as { ticket?: string; tier?: string };
  if (body.ticket !== undefined) {
    const claims = JSON.parse(
      Buffer.from(body.ticket.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { role?: string };
    expect(claims.role).toBe('owner');
  }
  const s = stranger.context.request;
  const refused = await s.get(`/api/decks/${deck}/ticket`, { headers: SAME_ORIGIN });
  const missing = await s.get(`/api/decks/${MISSING}/ticket`, { headers: SAME_ORIGIN });
  expect(refused.status()).toBe(404);
  expect(await refused.json()).toEqual({ error: 'not_found' });
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: 'not_found' });
});

test('authz.anonymous-creator: an anonymous creator keeps their deck across a reload, a trash and a restore', async () => {
  test.skip(IDS === null, NO_IDS);
  const o = owner.context.request;
  await owner.page.goto(`/deck/${deck}`);
  await expect(owner.page.locator('body')).toContainText('Board plan for the stranger rows');
  expect(((await accessOf(o, deck)).body as Access).record.owner).toMatch(/^anon_/);
  expect((await callFn(o, 'trashDeckFn', { deckId: deck })).error).toBeNull();
  expect((await callFn(o, 'restoreDeckFn', { deckId: deck })).error).toBeNull();
  expect((await o.get(`/edit/${deck}`)).status()).toBe(200);
});

test('authz.no-record: the seed deck reads as open to viewers, nobody but the admin claims it, and no identity creates nothing', async ({
  browser,
  request,
}) => {
  const s = stranger.context.request;
  const seed = (await accessOf(s, 'gt-brand')).body as Access;
  expect(seed.role).toBe('viewer');
  expect(seed.capabilities).not.toContain('write');
  expect(seed.record.owner).toBeNull();
  const someone = await person(browser);
  try {
    await signIn(someone.context, `h3-claimer-${Date.now()}@example.test`);
    const claim = await someone.context.request.post('/api/share/gt-brand/share.claim', {
      headers: { ...SAME_ORIGIN, 'content-type': 'application/json' },
      data: { baseRevision: seed.record.revision },
    });
    expect(claim.status(), 'a signed in stranger claims nothing').toBe(403);
    expect(((await accessOf(s, 'gt-brand')).body as Access).record.owner).toBeNull();
    // a request with no identity creates nothing (DATA-V3): no cookie, and a bearer that is no
    // key, so the middleware mints no principal for it either
    test.skip(IDS === null, NO_IDS);
    const id = IDS!.get('createDeckFn')!;
    const refused = await request.post(`/_serverFn/${id}`, {
      headers: {
        ...SAME_ORIGIN,
        authorization: 'Bearer not-a-key-of-this-deployment',
        'x-tsr-serverFn': 'true',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      data: payload({ name: 'Nobody made this', from: 'blank' }),
    });
    expect(await refused.text()).toContain('unauthorized');
  } finally {
    await someone.context.close();
  }
});
