// R1's fix round drive (VERIFICATION.md "Realtime round, pass 1" findings 1, 6, 7, 9 and 12) on
// the lane's two process do run: two vite dev servers on 4471 and 4481 over one tmp overlay with
// TURBOSLIDE_REALTIME=do, the lane's wrangler dev on 8791 between them (.turboslide/r1fix/). The
// tabs are Node clients over the `ws` package with an Origin header (build/r1.md R1-R5e), so no
// browser runs and the e2e lock is not taken; each answers the object's `reauth` the way
// apps/studio/src/editor/transport.ts does (a fresh ticket from the ticket route, sent up as
// `{ t: 'ticket' }`, nothing when the route refuses). The secrets are read from the lane's 600
// files and printed nowhere. Every scratch deck is trashed and removed by its id. Modes:
//   --mode wake --idle <s>    a tab types, idles with heartbeats only, refreshes its ticket and
//                             types again; the object's counters and the store's revision after
//   --mode revoke             (servers.sh do-enforce) a viewer by the link on 4481, the owner sets
//                             Restricted through 4471; the viewer's ticket route answer and close
//   --mode fallback           (worker.sh start <an origin nobody answers>) the opens close 4500,
//                             the Worker's health reads callbacks failing, the ticket route's tier
//   --mode stranger           an upgrade without a ticket and no join frame
//   node docs/gslides-parity/realtime/build/r1/fix/fix-drive.mjs --mode wake --idle 240
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket from '/Users/kevinliu/repos/Turboslide-realtime/node_modules/.pnpm/ws@8.21.3/node_modules/ws/wrapper.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};
const MODE = arg('mode', 'wake');
const BASE_A = arg('a', 'http://127.0.0.1:4471');
const BASE_B = arg('b', 'http://127.0.0.1:4481');
const WORKER = arg('worker', 'http://127.0.0.1:8791');
const IDLE_S = Number(arg('idle', '240'));
const OUT = dirname(fileURLToPath(import.meta.url));
const F = '/Users/kevinliu/repos/Turboslide-realtime/.turboslide/r1fix';
const vars = Object.fromEntries(
  ['.dev.vars', 'server.secrets']
    .flatMap((file) => readFileSync(join(F, file), 'utf8').split('\n'))
    .map((line) => line.split('='))
    .filter((parts) => parts.length >= 2)
    .map(([k, ...v]) => [k, v.join('=')]),
);
const ROOM_BEARER = vars.TURBOSLIDE_ROOM_BEARER;
/** The agent bearer when the servers carry one (`--bearer`); else the cookieless localhost agent the servers' TURBOSLIDE_LOCAL_OPEN admits. */
const AGENT_TOKEN = argv.includes('--bearer') ? vars.TURBOSLIDE_TOKEN : undefined;

const facts = {
  mode: MODE,
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  worker: WORKER,
  loadAtStart: loadavg(),
  readings: {},
};
const t0 = performance.now();
const at = () => Math.round(performance.now() - t0);
const note = (key, value) => {
  facts.readings[key] = { at: at(), ...value };
  console.log(`${key}: ${JSON.stringify(value).slice(0, 500)}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(base, action, deckId, body) {
  const response = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(AGENT_TOKEN === undefined ? {} : { authorization: `Bearer ${AGENT_TOKEN}` }),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text: text.slice(0, 200) };
  }
  return { status: response.status, json };
}

async function room(path, init = {}) {
  const response = await fetch(`${WORKER}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ROOM_BEARER}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  try {
    return { status: response.status, json: JSON.parse(text) };
  } catch {
    return { status: response.status, json: { text: text.slice(0, 200) } };
  }
}

async function cookieFor(base) {
  const response = await fetch(`${base}/decks`, { redirect: 'manual' });
  await response.text();
  return response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
}

/** The /s/<token> exchange through node:http with the cookie (the route takes navigations alone). */
function exchangeLink(base, linkPath, cookie) {
  const url = new URL(linkPath, base);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: { cookie },
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          const jar = new Map(
            cookie
              .split('; ')
              .filter(Boolean)
              .map((pair) => {
                const [k, ...v] = pair.split('=');
                return [k, v.join('=')];
              }),
          );
          for (const line of response.headers['set-cookie'] ?? []) {
            const [k, ...v] = line.split(';')[0].split('=');
            jar.set(k, v.join('='));
          }
          resolve({
            status: response.statusCode,
            location: response.headers.location ?? null,
            cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function ticketFor(base, deckId, cookie, cid) {
  const started = performance.now();
  const response = await fetch(
    `${base}/api/decks/${encodeURIComponent(deckId)}/ticket${cid ? `?client=${cid}` : ''}`,
    { headers: { cookie } },
  );
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, ms: Math.round(performance.now() - started) };
}

/** A tab: the ticket route, the upgrade with the two subprotocols and the Origin, the reauth answered as transport.ts answers it. */
async function openTab(name, base, deckId, cookie, { since = 0, expectHello = true } = {}) {
  const ticket = await ticketFor(base, deckId, cookie);
  if (ticket.status !== 200 || typeof ticket.json.ticket !== 'string')
    return { refused: true, ticket };
  const cid = ticket.json.clientId;
  const frames = [];
  const waiters = [];
  const events = [];
  const ws = new WebSocket(
    `${ticket.json.url}?since=${since}&tab=${randomBytes(16).toString('hex')}`,
    ['turboslide.v1', `ticket.${ticket.json.ticket}`],
    { headers: { origin: base } },
  );
  const closed = new Promise((resolve) =>
    ws.on('close', (code, reason) => {
      const close = { code, reason: String(reason), at: at() };
      events.push({ kind: 'close', ...close });
      resolve(close);
    }),
  );
  const tab = { name, base, cid, ws, frames, events, closed, cookie, req: 0, ops: 0 };
  ws.on('message', async (data) => {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }
    if (frame.t === 'reauth') {
      events.push({ kind: 'reauth', at: at() });
      const fresh = await ticketFor(base, deckId, cookie, cid);
      events.push({ kind: 'reauth-ticket', status: fresh.status, ms: fresh.ms, at: at() });
      if (fresh.status === 200 && typeof fresh.json.ticket === 'string')
        ws.send(JSON.stringify({ t: 'ticket', ticket: fresh.json.ticket }));
      return;
    }
    const i = waiters.findIndex((w) => w.pick(frame));
    if (i >= 0) {
      const [w] = waiters.splice(i, 1);
      w.resolve(frame);
      return;
    }
    frames.push(frame);
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  tab.next = (pick, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const i = frames.findIndex(pick);
      if (i >= 0) {
        resolve(frames.splice(i, 1)[0]);
        return;
      }
      const w = { pick, resolve };
      waiters.push(w);
      setTimeout(() => {
        const j = waiters.indexOf(w);
        if (j >= 0) {
          waiters.splice(j, 1);
          reject(new Error(`${name}: no frame within ${timeoutMs} ms`));
        }
      }, timeoutMs);
    });
  if (expectHello) {
    const first = await Promise.race([
      tab.next((f) => f.type === 'hello', 15_000),
      closed.then((c) => ({ closedFirst: c })),
    ]);
    if (first.closedFirst) return { closedBeforeHello: first.closedFirst, ticket };
    tab.hello = first;
  }
  tab.sendOps = async (base, insert, offset = 0) => {
    tab.req += 1;
    tab.ops += 1;
    const req = tab.req;
    ws.send(
      JSON.stringify({
        t: 'ops',
        req,
        clientId: cid,
        base: { seq: base },
        entries: [
          {
            opId: `${cid}:${tab.ops}`,
            kind: 'edit',
            mutations: [
              {
                op: 'text.splice',
                slideId: 'content-rule',
                blockId: 'p1',
                path: '/text',
                at: offset,
                remove: 0,
                insert,
              },
            ],
          },
        ],
      }),
    );
    return tab.next((f) => f.t === 'ack' && f.req === req, 10_000);
  };
  tab.refresh = async () => {
    const fresh = await ticketFor(base, deckId, cookie, cid);
    if (fresh.status === 200) ws.send(JSON.stringify({ t: 'ticket', ticket: fresh.json.ticket }));
    return fresh.status;
  };
  return tab;
}

async function scratchDeck(label, linkRole) {
  const src = await post(BASE_A, 'deck.info', 'gt-brand', {});
  const deckId = `r1fix-${label}-${Date.now().toString(36)}`;
  const copy = await post(BASE_A, 'deck.copy', 'gt-brand', {
    id: 'gt-brand',
    name: `R1 fix ${label}`,
    newId: deckId,
    baseRevision: src.json?.revision ?? 0,
  });
  if (copy.status !== 200) throw new Error(`deck.copy ${copy.status} ${JSON.stringify(copy.json)}`);
  const shareGet = await post(BASE_B, 'share.get', deckId, { id: deckId });
  const opened = await post(BASE_B, 'share.setGeneralAccess', deckId, {
    id: deckId,
    mode: 'link',
    role: linkRole,
    baseRevision: shareGet.json?.record?.revision ?? 0,
  });
  if (typeof opened.json?.url !== 'string')
    throw new Error(`share.setGeneralAccess ${opened.status} ${JSON.stringify(opened.json)}`);
  note('deck', { id: deckId, copy: copy.status, link: opened.status });
  return { deckId, linkPath: new URL(opened.json.url, BASE_B).pathname };
}

async function teardown(deckId) {
  const rev = (await post(BASE_A, 'deck.info', deckId, {})).json?.revision ?? 0;
  const trash = await post(BASE_A, 'deck.trash', deckId, { id: deckId, baseRevision: rev });
  const rev2 = (await post(BASE_A, 'deck.info', deckId, {})).json?.revision ?? rev;
  const remove = await post(BASE_B, 'deck.remove', deckId, {
    id: deckId,
    confirm: true,
    baseRevision: rev2,
  });
  const gone = await post(BASE_A, 'deck.info', deckId, {});
  note('teardown', { deckId, trash: trash.status, remove: remove.status, after: gone.status });
}

async function viewerCookie(linkPath, on) {
  const exchange = await exchangeLink(on, linkPath, await cookieFor(on));
  note('exchange', { on, status: exchange.status, location: exchange.location });
  return exchange.cookie;
}

async function wake() {
  const { deckId, linkPath } = await scratchDeck('wake', 'editor');
  try {
    const cookie = await viewerCookie(linkPath, BASE_B);
    const a = await openTab('A', BASE_A, deckId, cookie);
    if (a.hello === undefined) throw new Error(`no hello: ${JSON.stringify(a)}`);
    const ack1 = await a.sendOps(a.hello.seq, 'w1 ');
    note('firstEdit', { ok: ack1.ok, head: ack1.head });
    await sleep(3500);
    const before = await room(`/rooms/${deckId}/counters`);
    note('countersBeforeIdle', {
      awakeSince: before.json.awakeSince,
      head: before.json.head,
      covered: before.json.covered,
      total: before.json.total,
    });
    // the idle: the heartbeat a quiet tab sends (`ping`, answered by the runtime), nothing else
    const until = performance.now() + IDLE_S * 1000;
    while (performance.now() < until) {
      a.ws.send('ping');
      await sleep(10_000);
    }
    const revBefore = (await post(BASE_B, 'deck.info', deckId, {})).json?.revision ?? null;
    // the refresh and an edit after the idle, through the socket alone (no fetch names the deck)
    const refresh = await a.refresh();
    const ack2 = await a.sendOps(ack1.head, 'w2 ');
    await sleep(1000);
    const openAfterRefresh = a.ws.readyState === WebSocket.OPEN;
    note('afterIdle', {
      ticketRoute: refresh,
      editOk: ack2.ok,
      head: ack2.head,
      socketOpen: openAfterRefresh,
      events: a.events,
    });
    // the alarm's checkpoint lands before any fetch reaches the object
    await sleep(4000);
    const revAfter = (await post(BASE_B, 'deck.info', deckId, {})).json?.revision ?? null;
    const after = await room(`/rooms/${deckId}/counters`);
    note('countersAfter', {
      awakeSince: after.json.awakeSince,
      woke: after.json.awakeSince !== before.json.awakeSince,
      head: after.json.head,
      covered: after.json.covered,
      revisionBefore: revBefore,
      revisionAfter: revAfter,
      total: after.json.total,
      sinceWake: after.json.sinceWake,
    });
    const fields = ['requests', 'messages', 'alarms', 'checkpoints', 'rowsWritten', 'rowsRead'];
    note('countersMonotonic', {
      wentBack: fields.filter((k) => (after.json.total?.[k] ?? 0) < (before.json.total?.[k] ?? 0)),
      delta: Object.fromEntries(
        fields.map((k) => [k, (after.json.total?.[k] ?? 0) - (before.json.total?.[k] ?? 0)]),
      ),
    });
    a.ws.close(1000, 'drive');
    await a.closed;
  } finally {
    await sleep(1500);
    await teardown(deckId);
  }
}

async function revoke() {
  const { deckId, linkPath } = await scratchDeck('revoke', 'viewer');
  try {
    const cookie = await viewerCookie(linkPath, BASE_B);
    const c = await openTab('C', BASE_B, deckId, cookie);
    if (c.hello === undefined) throw new Error(`no hello: ${JSON.stringify(c)}`);
    note('viewerJoined', { role: c.hello.role, on: BASE_B });
    // C's instance reads the record once more, so its cache holds the open record
    const warm = await ticketFor(BASE_B, deckId, cookie, c.cid);
    note('warmTicket', { status: warm.status });
    const shareGet = await post(BASE_A, 'share.get', deckId, { id: deckId });
    const writeAt = at();
    const restricted = await post(BASE_A, 'share.setGeneralAccess', deckId, {
      id: deckId,
      mode: 'restricted',
      baseRevision: shareGet.json?.record?.revision ?? 0,
    });
    note('restricted', { status: restricted.status, through: BASE_A, at: writeAt });
    // `--probe`: a counters read 2 s after the write, which is a fetch and keeps the object awake
    // through the grace; without it the object may hibernate inside the grace (the case the
    // attachment's `reauthAt` covers)
    if (argv.includes('--probe')) {
      await sleep(2000);
      const probe = await room(`/rooms/${deckId}/counters`);
      note('objectAfterReauth', {
        alarmAt: probe.json.alarmAt,
        alarmInMs: probe.json.alarmAt === null ? null : probe.json.alarmAt - Date.now(),
        sockets: probe.json.sockets,
        members: probe.json.members,
      });
    }
    const close = await Promise.race([c.closed, sleep(45_000).then(() => null)]);
    note('viewer', {
      closed: close,
      closedMsAfterWrite: close === null ? null : close.at - writeAt,
      events: c.events,
    });
    const reload = await ticketFor(BASE_B, deckId, cookie, null);
    note('viewerTicketAfter', { status: reload.status, error: reload.json?.error ?? null });
    if (close === null) c.ws.close(1000, 'drive');
  } finally {
    await teardown(deckId);
  }
}

async function fallback() {
  const health0 = await fetch(`${WORKER}/health`).then((r) => r.json());
  note('health0', health0);
  const { deckId, linkPath } = await scratchDeck('fallback', 'editor');
  try {
    const cookie = await viewerCookie(linkPath, BASE_B);
    for (let i = 1; i <= 2; i += 1) {
      const t = await openTab(`T${i}`, BASE_B, deckId, cookie);
      note(`open${i}`, {
        closedBeforeHello: t.closedBeforeHello ?? null,
        hello: t.hello !== undefined,
        refused: t.refused ?? false,
      });
      if (t.hello !== undefined) t.ws.close(1000, 'drive');
    }
    const started = at();
    let health = null;
    for (let i = 0; i < 40; i += 1) {
      health = await fetch(`${WORKER}/health`).then((r) => r.json());
      if (health.callbacks === 'failing') break;
      await sleep(1000);
    }
    note('healthFailing', { callbacks: health?.callbacks, msAfterOpens: at() - started });
    for (const base of [BASE_B, BASE_A]) {
      let tier = null;
      const from = at();
      for (let i = 0; i < 30; i += 1) {
        const ticket = await ticketFor(base, deckId, cookie, null);
        tier = ticket.json?.tier ?? null;
        if (tier === 'blob') break;
        await sleep(5000);
      }
      note(`ticketTier ${base}`, { tier, msToBlob: tier === 'blob' ? at() - from : null });
    }
  } finally {
    await teardown(deckId);
  }
}

async function stranger() {
  const deckId = `r1fix-stranger-${Date.now().toString(36)}`;
  const before = await room(`/rooms/${deckId}/counters`);
  note('before', { status: before.status, seeds: before.json?.sinceWake?.seeds ?? null });
  const ws = new WebSocket(
    `ws://${new URL(WORKER).host}/rooms/${deckId}?since=0`,
    ['turboslide.v1'],
    {
      headers: { origin: BASE_A },
    },
  );
  const opened = await new Promise((resolve) => {
    ws.once('open', () => resolve(true));
    ws.once('error', () => resolve(false));
  });
  const closed = await new Promise((resolve) =>
    ws.on('close', (code, reason) => resolve({ code, reason: String(reason), at: at() })),
  );
  const after = await room(`/rooms/${deckId}/counters`);
  const open = await room('/control/open');
  note('stranger', {
    upgraded: opened,
    closed,
    seedsAfter: after.json?.sinceWake?.seeds ?? null,
    head: after.json?.head ?? null,
    listedOpen: (open.json?.decks ?? []).some((d) => d.deckId === deckId),
  });
}

try {
  if (MODE === 'wake') await wake();
  else if (MODE === 'revoke') await revoke();
  else if (MODE === 'fallback') await fallback();
  else if (MODE === 'stranger') await stranger();
  else throw new Error(`unknown mode ${MODE}`);
} catch (error) {
  facts.error = error instanceof Error ? error.message : String(error);
  console.error(error);
} finally {
  facts.endedAt = new Date().toISOString();
  facts.loadAtEnd = loadavg();
  const file = join(OUT, `facts-${MODE}-${Date.now().toString(36)}.json`);
  writeFileSync(file, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`facts written to ${file}`);
  process.exit(0);
}
