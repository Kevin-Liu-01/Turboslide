// R1's drive of the do tier's channel rows (docs/CLOUDFLARE.md 5.2 R1, 5.4) on the two process
// local run: two node servers on 4471 and 4481 over one tmp overlay with TURBOSLIDE_REALTIME=do,
// one wrangler dev Worker on 8791 between them. Until R2's wsTransport lands no browser opens the
// socket, so this drive is two Node clients over the `ws` package (an Origin header equal to the
// ticket's org, build/r1.md R1-R5e): A is the checkout holder on 4471 (the cookieless localhost
// agent), B the bearer on 4481, two identities with their own client ids minted the way the
// function mints them (the session secret of the lane's servers is its own test value). Every
// reading is the channel's half of the row; the DOM half waits for the transport. The facts land
// beside this file in facts.json; the scratch deck is trashed and removed by id at the end.
//   node docs/gslides-parity/cloudflare/build/r1/drive.mjs [--a http://127.0.0.1:4471] [--b http://127.0.0.1:4481] [--worker http://127.0.0.1:8791] [--rows a,b] [--slice-seconds 180]
import { createHmac, randomBytes } from 'node:crypto';
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
const BASE_A = arg('a', 'http://127.0.0.1:4471');
const BASE_B = arg('b', 'http://127.0.0.1:4481');
const WORKER = arg('worker', 'http://127.0.0.1:8791');
const ROWS = new Set((arg('rows', '') || '').split(',').filter(Boolean));
const SLICE_S = Number(arg('slice-seconds', '180'));
/** `cookie` (an anonymous principal, the route mints the client id; needs the build of 16:27 or later) or `bearer` (the agent identity, two tabs of one person). */
const A_IDENTITY = arg('a-identity', 'cookie');
const wants = (row) => ROWS.size === 0 || ROWS.has(row);
const OUT = dirname(fileURLToPath(import.meta.url));
const R1 = '/Users/kevinliu/repos/Turboslide-realtime/.turboslide/r1';

/** The lane's own test secrets (servers-do.sh, .dev.vars); never printed. */
const SESSION_SECRET = 'r1-two-process-session-secret-0000000000000000';
const AGENT_TOKEN = 'r1-two-process-agent-token-00000000000000000000';
const devVars = Object.fromEntries(
  readFileSync(join(R1, '.dev.vars'), 'utf8')
    .split('\n')
    .map((line) => line.split('='))
    .filter((parts) => parts.length >= 2)
    .map(([k, ...v]) => [k, v.join('=')]),
);
const ROOM_BEARER = devVars.TURBOSLIDE_ROOM_BEARER;

const facts = {
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  worker: WORKER,
  loadAtStart: loadavg(),
  rows: {},
  notes: [],
};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value).slice(0, 400)}`);
};
const row = (id, reading) => {
  facts.rows[id] = { ...reading, load: loadavg() };
  console.log(`row ${id}: ${JSON.stringify(reading).slice(0, 600)}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ms = (from) => Math.round((performance.now() - from) * 10) / 10;

async function post(base, action, deckId, body, _auth) {
  // the servers run with TURBOSLIDE_TOKEN set, so every agent call carries the bearer
  const response = await fetch(`${base}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT_TOKEN}` },
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

async function bearer(path, init = {}) {
  const response = await fetch(`${WORKER}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ROOM_BEARER}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
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

/** A client id as room.ts mints it: 16 hex nonce plus 16 hex of the HMAC under the session secret. */
function mintClientId(deckId, identity) {
  const nonce = randomBytes(8).toString('hex');
  const mac = createHmac('sha256', SESSION_SECRET)
    .update(`client\n${deckId}\n${identity}\n${nonce}`)
    .digest('hex')
    .slice(0, 16);
  return `${nonce}${mac}`;
}

/** The anonymous principal cookie a browser would hold: one GET to the server mints it. */
async function cookieFor(base) {
  const response = await fetch(`${base}/decks`, { redirect: 'manual' });
  const pairs = response.headers.getSetCookie().map((line) => line.split(';')[0]);
  return pairs.join('; ');
}

/**
 * A link exchange on `base` with the cookie: the /s/<token> route refuses a `fetch` (undici stamps
 * `sec-fetch-mode: cors` and the route takes navigations alone), so the request goes through
 * node:http with the cookie and no Sec-Fetch metadata, as the hosted probe of build-3 does.
 * Answers the status, the location, the time and the merged cookie.
 */
function exchangeLink(base, linkPath, cookie) {
  const started = performance.now();
  const url = new URL(linkPath, base);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { cookie },
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          const more = (response.headers['set-cookie'] ?? []).map((line) => line.split(';')[0]);
          const jar = new Map(
            cookie
              .split('; ')
              .filter(Boolean)
              .map((pair) => pair.split('=')),
          );
          for (const pair of more) {
            const [k, ...v] = pair.split('=');
            jar.set(k, v.join('='));
          }
          resolve({
            status: response.statusCode,
            location: response.headers.location ?? null,
            ms: ms(started),
            cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/**
 * A tab's socket: the ticket from the server's route (the route mints the client id when none is
 * given, R2-C3), the upgrade with the two subprotocols and the Origin. `who` is `{ cookie }` for
 * an anonymous principal (A) or `{ bearer: true }` for the agent (B).
 */
async function openTab(name, base, deckId, who, since = 0) {
  const ticketStarted = performance.now();
  // the bearer's identity is `agent:bootstrap` (authorize.ts bootstrapAgentContext), so its client
  // id can be minted here the way the function mints it; a cookie principal's id is sealed and the
  // route mints the id for it (R2-C3)
  const minted = who.cookie ? null : mintClientId(deckId, 'agent:bootstrap');
  const query = minted === null ? '' : `?client=${minted}`;
  const ticketResponse = await fetch(
    `${base}/api/decks/${encodeURIComponent(deckId)}/ticket${query}`,
    { headers: who.cookie ? { cookie: who.cookie } : { authorization: `Bearer ${AGENT_TOKEN}` } },
  );
  const ticket = await ticketResponse.json();
  if (ticketResponse.status !== 200 || !ticket.ticket) {
    throw new Error(
      `${name}: the ticket route answered ${ticketResponse.status} ${JSON.stringify(ticket).slice(0, 200)}`,
    );
  }
  const cid = ticket.clientId ?? minted;
  if (typeof cid !== 'string') throw new Error(`${name}: the ticket answer names no client id`);
  const ticketMs = ms(ticketStarted);
  const tab = randomBytes(16).toString('hex');
  const frames = [];
  const waiters = [];
  const opened = performance.now();
  const ws = new WebSocket(
    `${ticket.url}?since=${since}&tab=${tab}`,
    ['turboslide.v1', `ticket.${ticket.ticket}`],
    { headers: { origin: base } },
  );
  const closed = new Promise((resolve) =>
    ws.on('close', (code, reason) => resolve({ code, reason: String(reason) })),
  );
  ws.on('message', (data) => {
    let frame;
    try {
      frame = JSON.parse(String(data));
    } catch {
      return;
    }
    frame.__at = performance.now();
    const at = waiters.findIndex((waiter) => waiter.pick(frame));
    if (at >= 0) {
      const [waiter] = waiters.splice(at, 1);
      waiter.resolve(frame);
      return;
    }
    frames.push(frame);
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const next = (pick, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const at = frames.findIndex(pick);
      if (at >= 0) {
        const [frame] = frames.splice(at, 1);
        resolve(frame);
        return;
      }
      const waiter = { pick, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const i = waiters.indexOf(waiter);
        if (i >= 0) {
          waiters.splice(i, 1);
          reject(
            new Error(
              `${name}: no frame within ${timeoutMs} ms; seen ${JSON.stringify(frames.map((f) => f.type ?? f.t))}`,
            ),
          );
        }
      }, timeoutMs);
    });
  const hello = await next((frame) => frame.type === 'hello');
  const helloMs = ms(opened);
  const room = await next((frame) => frame.t === 'room', 2000).catch(() => null);
  const replay = await next((frame) => frame.type === 'ops' || frame.type === 'resync', 2000).catch(
    () => null,
  );
  let req = 0;
  let clock = 0;
  let opCounter = 0;
  return {
    name,
    base,
    cid,
    tab,
    ws,
    frames,
    next,
    closed,
    hello,
    room,
    replay,
    ticketMs,
    helloMs,
    protocol: ws.protocol,
    send: (frame) => ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame)),
    ops: async (base, mutationLists) => {
      req += 1;
      const mine = req;
      const started = performance.now();
      // `<clientId>:<counter>`, at most 12 digits (protocol.ts OP_ID_PATTERN)
      const opIds = mutationLists.map(() => `${cid}:${(opCounter += 1)}`);
      ws.send(
        JSON.stringify({
          t: 'ops',
          req: mine,
          clientId: cid,
          base: { seq: base },
          entries: mutationLists.map((mutations, i) => ({
            opId: opIds[i],
            kind: 'edit',
            mutations,
          })),
        }),
      );
      const ack = await next((frame) => frame.t === 'ack' && frame.req === mine);
      return { ack, ackMs: ms(started), opIds, sentAt: started };
    },
    presence: (extra = {}) => {
      clock += 1;
      ws.send(
        JSON.stringify({
          t: 'presence',
          clientId: cid,
          clock,
          pointerOn: false,
          presenting: false,
          ...extra,
        }),
      );
      return { clock, sentAt: performance.now() };
    },
    close: () => ws.close(1000, 'drive'),
  };
}

const SLIDE = 'content-rule';
const BLOCK = 'p1';
const splice = (at, remove, insert) => ({
  op: 'text.splice',
  slideId: SLIDE,
  blockId: BLOCK,
  path: '/text',
  at,
  remove,
  insert,
});

async function textOf(base, deckId, auth) {
  const got = await post(base, 'slide.get', deckId, { slideId: SLIDE }, auth);
  const blocks = Object.values(got.json?.slide?.slots ?? {}).flat();
  const block = blocks.find((b) => b.id === BLOCK);
  const text = block?.text;
  const plain =
    typeof text === 'string'
      ? text
      : Array.isArray(text?.runs)
        ? text.runs.map((r) => r.text ?? '').join('')
        : JSON.stringify(text);
  return { status: got.status, plain, revision: got.json?.revision ?? null };
}

async function main() {
  // setup.worker.health
  const healthStarted = performance.now();
  const health = await fetch(`${WORKER}/health`).then((r) => r.json());
  row('setup.worker.health', {
    body: health,
    ms: ms(healthStarted),
    ok: health.ok === true && health.realtime === 'on' && health.protocol === 1,
  });

  // the scratch deck through A: a copy of the seeded gt-brand deck
  const src = await post(BASE_A, 'deck.info', 'gt-brand', {});
  const deckId = `r1-do-${Date.now().toString(36)}`;
  const copy = await post(BASE_A, 'deck.copy', 'gt-brand', {
    id: 'gt-brand',
    name: 'R1 do drive',
    newId: deckId,
    baseRevision: src.json.revision,
  });
  say('deck', { id: deckId, copy: copy.status, revision: copy.json?.revision });
  if (copy.status !== 200)
    throw new Error(
      `deck.copy answered ${copy.status}: ${JSON.stringify(copy.json).slice(0, 200)}`,
    );
  const infoB = await post(BASE_B, 'deck.info', deckId, {}, true);
  say('deckInfoThroughB', { status: infoB.status, revision: infoB.json?.revision });
  // the owner (the bearer) opens the deck to anyone with the link as an editor, and the
  // anonymous tabs exchange the link on the other instance (realtime.share-link.every-instance's
  // mechanism: the grant written on one instance, the ticket minted on the next)
  const shareGet = await post(BASE_B, 'share.get', deckId, { id: deckId }, true);
  const opened = await post(
    BASE_B,
    'share.setGeneralAccess',
    deckId,
    {
      id: deckId,
      mode: 'link',
      role: 'editor',
      baseRevision: shareGet.json?.record?.revision ?? 0,
    },
    true,
  );
  const linkPath =
    typeof opened.json?.url === 'string' ? new URL(opened.json.url, BASE_B).pathname : null;
  say('link', {
    shareGet: shareGet.status,
    opened: opened.status,
    path: linkPath === null ? null : linkPath.replace(/\/s\/.*/, '/s/<token>'),
  });
  if (linkPath === null)
    throw new Error(
      `share.setGeneralAccess answered ${opened.status}: ${JSON.stringify(opened.json).slice(0, 200)}`,
    );
  const workerCountersBefore = (await bearer('/control/counters')).json;

  try {
    // the two tabs: A the checkout holder on 4471, B the bearer on 4481
    let cookieA = null;
    if (A_IDENTITY === 'cookie') {
      cookieA = await cookieFor(BASE_A);
      const exchange = await exchangeLink(BASE_B, linkPath, cookieA);
      cookieA = exchange.cookie;
      say('exchangeA', {
        status: exchange.status,
        location: exchange.location,
        ms: exchange.ms,
        on: BASE_B,
      });
    }
    const a = await openTab(
      'A',
      BASE_A,
      deckId,
      cookieA === null ? { bearer: true } : { cookie: cookieA },
    );
    facts.aIdentity = A_IDENTITY;
    say('tabA', {
      hello: {
        seq: a.hello.seq,
        revision: a.hello.revision,
        role: a.hello.role,
        tier: a.hello.tier,
        covered: a.hello.covered,
        clients: a.hello.clients.length,
      },
      room: a.room,
      replay: a.replay?.type,
      ticketMs: a.ticketMs,
      helloMs: a.helloMs,
      protocol: a.protocol,
    });
    const bOpened = performance.now();
    const b = await openTab('B', BASE_B, deckId, { bearer: true });
    say('tabB', {
      hello: {
        seq: b.hello.seq,
        revision: b.hello.revision,
        role: b.hello.role,
        tier: b.hello.tier,
        covered: b.hello.covered,
        clients: b.hello.clients.length,
      },
      room: b.room,
      ticketMs: b.ticketMs,
      helloMs: b.helloMs,
    });

    // realtime.join.chip-within-1s (the channel's half): B's first presence frame reaches A
    if (wants('join')) {
      const joins = [];
      const first = b.presence({ slideId: SLIDE });
      const seen = await a.next((frame) => frame.type === 'presence' && frame.clientId === b.cid);
      joins.push({
        fromBOpenMs: Math.round(seen.__at - bOpened),
        fromPresenceMs: Math.round(seen.__at - first.sentAt),
        label: seen.state.label,
        hueSlot: seen.state.hueSlot,
      });
      for (let i = 0; i < 2; i += 1) {
        let cookieC = null;
        if (A_IDENTITY === 'cookie') {
          cookieC = (await exchangeLink(BASE_A, linkPath, await cookieFor(BASE_B))).cookie;
        }
        const c = await openTab(
          `C${i}`,
          BASE_B,
          deckId,
          cookieC === null ? { bearer: true } : { cookie: cookieC },
        );
        const opened = performance.now();
        const sent = c.presence({ slideId: SLIDE });
        const inA = await a.next((frame) => frame.type === 'presence' && frame.clientId === c.cid);
        joins.push({
          fromBOpenMs: Math.round(inA.__at - opened),
          fromPresenceMs: Math.round(inA.__at - sent.sentAt),
          helloMs: c.helloMs,
          ticketMs: c.ticketMs,
        });
        c.close();
        await a
          .next((frame) => frame.type === 'leave' && frame.clientId === c.cid, 3000)
          .catch(() => null);
      }
      row('realtime.join.chip-within-1s', {
        half: 'channel',
        rounds: joins,
        ok: joins.every((j) => j.fromBOpenMs <= 1000),
        bound: '1 s from the join to the frame in A',
      });
    }

    // realtime.share-link.every-instance (the mechanism): a link exchanged on one instance and
    // the ticket minted on the other within a second, five of five, fresh cookies
    if (wants('link') && A_IDENTITY === 'cookie') {
      const tries = [];
      for (let i = 0; i < 5; i += 1) {
        const [mintOn, exchangeOn] = i % 2 === 0 ? [BASE_A, BASE_B] : [BASE_B, BASE_A];
        const jar = await cookieFor(mintOn);
        const exchange = await exchangeLink(exchangeOn, linkPath, jar);
        const started = performance.now();
        const response = await fetch(`${mintOn}/api/decks/${encodeURIComponent(deckId)}/ticket`, {
          headers: { cookie: exchange.cookie },
        });
        const body = await response.json();
        tries.push({
          exchangeOn,
          mintOn,
          exchange: exchange.status,
          ticket: response.status,
          ticketMs: ms(started),
          afterExchangeMs: Math.round(performance.now() - started + exchange.ms),
          role: body.ticket ? 'minted' : body.error,
        });
      }
      row('realtime.share-link.every-instance', {
        tries,
        ok: tries.every((t) => t.ticket === 200 && t.afterExchangeMs <= 1000),
        bound:
          '1 s from the mint to the editor on the other instance; here the ticket route stands for the editor loader',
      });
    }

    // realtime.keystroke.within-300ms (the channel's half): ten characters one per second
    let head = a.hello.seq;
    if (wants('keystroke')) {
      const arrivals = [];
      const aPresence = a.presence({ slideId: SLIDE, selection: { blockIds: [BLOCK] } });
      void aPresence;
      for (let i = 0; i < 10; i += 1) {
        const letter = String.fromCharCode(65 + i);
        const sentAt = performance.now();
        const sent = await a.ops(head, [[splice(i, 0, letter)]]);
        const inB = await b.next(
          (frame) => frame.type === 'op' && frame.entry.opId === sent.opIds[0],
        );
        head = sent.ack.head;
        arrivals.push({
          letter,
          ackMs: sent.ackMs,
          inBMs: Math.round(inB.__at - sentAt),
          seq: inB.entry.seq,
          ok: sent.ack.ok,
        });
        await sleep(1000);
      }
      const texts = await Promise.all([
        textOf(BASE_A, deckId, false),
        textOf(BASE_B, deckId, true),
      ]);
      row('realtime.keystroke.within-300ms', {
        half: 'channel',
        arrivals,
        meanInBMs: Math.round(arrivals.reduce((n, x) => n + x.inBMs, 0) / arrivals.length),
        maxInBMs: Math.max(...arrivals.map((x) => x.inBMs)),
        textThroughA: texts[0].plain?.slice(0, 40),
        textThroughB: texts[1].plain?.slice(0, 40),
        ok: arrivals.every((x) => x.inBMs <= 300 && x.ok) && texts[0].plain === texts[1].plain,
      });
    }

    // realtime.selection.outline-within-300ms and realtime.caret.within-300ms (the channel's halves)
    if (wants('presence')) {
      const outlines = [];
      for (let i = 0; i < 8; i += 1) {
        const block = i % 2 === 0 ? BLOCK : 'h';
        const sent = b.presence({ slideId: SLIDE, selection: { blockIds: [block] } });
        const inA = await a.next(
          (frame) =>
            frame.type === 'presence' && frame.clientId === b.cid && frame.clock === sent.clock,
        );
        outlines.push({
          block,
          inAMs: Math.round(inA.__at - sent.sentAt),
          blockIds: inA.state.selection?.blockIds,
        });
        await sleep(150);
      }
      row('realtime.selection.outline-within-300ms', {
        half: 'channel',
        outlines,
        ok: outlines.every((x) => x.inAMs <= 300 && x.blockIds?.[0] === x.block),
      });
      const carets = [];
      for (let i = 0; i < 10; i += 1) {
        const sent = b.presence({
          slideId: SLIDE,
          selection: {
            blockIds: [BLOCK],
            caret: { blockId: BLOCK, path: '/text', offset: i, range: [i, i] },
          },
        });
        const inA = await a.next(
          (frame) =>
            frame.type === 'presence' && frame.clientId === b.cid && frame.clock === sent.clock,
        );
        carets.push({
          offset: i,
          inAMs: Math.round(inA.__at - sent.sentAt),
          got: inA.state.selection?.caret?.offset,
        });
        await sleep(100);
      }
      row('realtime.caret.within-300ms', {
        half: 'channel',
        carets,
        ok: carets.every((x) => x.inAMs <= 300 && x.got === x.offset),
      });
    }

    // realtime.title.two-typers (the channel's half): a word each at one base within 200 ms, three rounds
    if (wants('title')) {
      const rounds = [];
      for (let round = 0; round < 3; round += 1) {
        const before = await textOf(BASE_A, deckId, false);
        const base = head;
        const at = before.plain.length;
        const wordA = ` alpha${round}`;
        const wordB = ` bravo${round}`;
        const [sentA, sentB] = await Promise.all([
          a.ops(base, [[splice(at, 0, wordA)]]),
          b.ops(base, [[splice(at, 0, wordB)]]),
        ]);
        const [aSeesB, bSeesA] = await Promise.all([
          a.next((frame) => frame.type === 'op' && frame.entry.opId === sentB.opIds[0]),
          b.next((frame) => frame.type === 'op' && frame.entry.opId === sentA.opIds[0]),
        ]);
        head = Math.max(sentA.ack.head, sentB.ack.head);
        await sleep(300);
        const [textA, textB] = await Promise.all([
          textOf(BASE_A, deckId, false),
          textOf(BASE_B, deckId, true),
        ]);
        const doc = (await bearer(`/rooms/${deckId}/document`)).json;
        const objectBlocks = Object.values(doc.document?.slides?.[SLIDE]?.slots ?? {}).flat();
        const objectText = objectBlocks.find((x) => x.id === BLOCK)?.text;
        const objectPlain =
          typeof objectText === 'string'
            ? objectText
            : objectText?.runs?.map((r) => r.text ?? '').join('');
        rounds.push({
          ackA: sentA.ack.ok
            ? {
                seq: sentA.ack.entries[0]?.seq,
                rejected: sentA.ack.rejected.length,
                ms: sentA.ackMs,
                between: sentA.ack.between?.length ?? 0,
              }
            : sentA.ack,
          ackB: sentB.ack.ok
            ? {
                seq: sentB.ack.entries[0]?.seq,
                rejected: sentB.ack.rejected.length,
                ms: sentB.ackMs,
                between: sentB.ack.between?.length ?? 0,
              }
            : sentB.ack,
          bWordInAMs: Math.round(aSeesB.__at - sentB.sentAt),
          aWordInBMs: Math.round(bSeesA.__at - sentA.sentAt),
          bothWordsA: textA.plain.includes(wordA) && textA.plain.includes(wordB),
          bothWordsB: textB.plain.includes(wordA) && textB.plain.includes(wordB),
          byteEqual: textA.plain === textB.plain && textA.plain === objectPlain,
          objectHasBoth:
            typeof objectPlain === 'string' &&
            objectPlain.includes(wordA) &&
            objectPlain.includes(wordB),
          textA: textA.plain.slice(-40),
        });
      }
      row('realtime.title.two-typers', {
        half: 'channel',
        rounds,
        ok: rounds.every(
          (r) =>
            r.ackA.rejected === 0 &&
            r.ackB.rejected === 0 &&
            r.objectHasBoth &&
            r.bWordInAMs <= 500 &&
            r.aWordInBMs <= 500,
        ),
        note: "textB is the agent surface's read of the dispatcher's plain store on the other instance (R1-INTg); the object's document carries both words",
      });
    }

    // the reload between an ack and a checkpoint on two instances (docs/CLOUDFLARE.md 5.2 R1)
    if (wants('reload')) {
      const roundsOut = [];
      for (let round = 0; round < 3; round += 1) {
        const before = await textOf(BASE_A, deckId, false);
        const at = before.plain.length;
        const letters = `${'xyz'[round]}${round}`;
        const burstStarted = performance.now();
        const sent = await a.ops(
          head,
          letters.split('').map((ch, i) => [splice(at + i, 0, ch)]),
        );
        head = sent.ack.head;
        // read through the other instance at once, before the 2 s alarm: the editor loader
        // (GET /edit/<id> with A's cookie; the SSR page carries the loader's document) and the
        // agent surface's slide.get (the dispatcher's plain store until R1-INTg)
        const readStarted = performance.now();
        const page = await fetch(`${BASE_B}/edit/${encodeURIComponent(deckId)}`, {
          headers: { cookie: cookieA ?? '' },
        });
        const html = await page.text();
        const loaderMs = ms(readStarted);
        const loaderHadBurst = page.status === 200 && html.includes(letters);
        const throughB = await textOf(BASE_B, deckId, true);
        const readMs = ms(readStarted);
        const beforeAlarm = ms(burstStarted) < 1900;
        await sleep(3000);
        const objectDoc = (await bearer(`/rooms/${deckId}/document`)).json;
        const objectBlocks = Object.values(objectDoc.document?.slides?.[SLIDE]?.slots ?? {}).flat();
        const objectText = objectBlocks.find((x) => x.id === BLOCK)?.text;
        const objectPlain =
          typeof objectText === 'string'
            ? objectText
            : objectText?.runs?.map((r) => r.text ?? '').join('');
        const [textA, textB] = await Promise.all([
          textOf(BASE_A, deckId, false),
          textOf(BASE_B, deckId, true),
        ]);
        const [infoA, infoB2] = await Promise.all([
          post(BASE_A, 'deck.info', deckId, {}, false),
          post(BASE_B, 'deck.info', deckId, {}, true),
        ]);
        roundsOut.push({
          acked: sent.ack.ok && sent.ack.entries.length === letters.length,
          ack: sent.ack.ok
            ? { entries: sent.ack.entries.length, rejected: sent.ack.rejected }
            : sent.ack,
          ackMs: sent.ackMs,
          loaderOnB: { status: page.status, ms: loaderMs, hadBurst: loaderHadBurst },
          readThroughBMs: readMs,
          readBeforeAlarm: beforeAlarm,
          throughBHadBurst: throughB.plain.endsWith(letters),
          after3sObjectHasBurst: typeof objectPlain === 'string' && objectPlain.includes(letters),
          after3sObjectLength: typeof objectPlain === 'string' ? objectPlain.length : null,
          after3s: {
            equal: textA.plain === textB.plain,
            revisionA: infoA.json?.revision,
            revisionB: infoB2.json?.revision,
            records: infoA.json?.counts?.records ?? infoA.json?.versions ?? null,
          },
        });
      }
      row('realtime.reload.loses-nothing', {
        half: 'server (the loader reads the object between the ack and the checkpoint)',
        rounds: roundsOut,
        ok: roundsOut.every((r) => r.acked && r.loaderOnB.hadBurst && r.after3s.equal),
        note: "the editor loader on the other instance is the row's mechanism and reads the object; slide.get through the agent surface reads the dispatcher's plain store until R1-INTg lands",
      });
    }

    // realtime.agent.write-announced: a bearer write through B's server while A's socket is open
    if (wants('agent')) {
      const before = await textOf(BASE_A, deckId, false, 'h');
      // the base is the deck's revision (slide.get answers none)
      const infoBefore = await post(BASE_B, 'deck.info', deckId, {}, true);
      before.revision = infoBefore.json?.revision ?? 0;
      const started = performance.now();
      const write = await post(
        BASE_B,
        'block.set',
        deckId,
        {
          slideId: SLIDE,
          blockId: 'h',
          path: '/text',
          value: `${before.plain} Written by the agent`,
          baseRevision: before.revision,
        },
        true,
      );
      const writeMs = ms(started);
      const inA = await a
        .next(
          (frame) =>
            frame.type === 'op' &&
            frame.entry.clientId === 'agent:bootstrap' &&
            frame.__at >= started,
          5000,
        )
        .catch(() => null);
      const checkpoint = await a
        .next((frame) => frame.type === 'checkpoint', 5000)
        .catch(() => null);
      const after = await textOf(BASE_A, deckId, false, 'h');
      head = inA?.entry.seq ?? head;
      row('realtime.agent.write-announced', {
        half: 'channel',
        write: {
          status: write.status,
          revision: write.json?.revision,
          ms: writeMs,
          body: write.status === 200 ? undefined : write.json,
        },
        opInA:
          inA === null
            ? null
            : {
                ms: Math.round(inA.__at - started),
                clientId: inA.entry.clientId,
                author: inA.entry.author,
                seq: inA.entry.seq,
              },
        checkpointInA:
          checkpoint === null
            ? null
            : { revision: checkpoint.revision, ms: Math.round(checkpoint.__at - started) },
        textAfterThroughA: after.plain.slice(-30),
        ok:
          write.status === 200 &&
          inA !== null &&
          inA.entry.clientId === 'agent:bootstrap' &&
          Math.round(inA.__at - started) <= 1000,
      });
    }

    // setup.do.two-instances: both documents byte equal at the live revision through the two ports
    if (wants('two')) {
      const [textA, textB] = await Promise.all([
        textOf(BASE_A, deckId, false),
        textOf(BASE_B, deckId, true),
      ]);
      const [infoA, infoB2] = await Promise.all([
        post(BASE_A, 'deck.info', deckId, {}, false),
        post(BASE_B, 'deck.info', deckId, {}, true),
      ]);
      const counters = (await bearer(`/rooms/${deckId}/counters`)).json;
      row('setup.do.two-instances', {
        instances: { a: 'port-4471 (TURBOSLIDE_INSTANCE_NAME)', b: 'port-4481' },
        byteEqual: textA.plain === textB.plain,
        revisionA: infoA.json?.revision,
        revisionB: infoB2.json?.revision,
        hello: {
          a: { seq: a.hello.seq, covered: a.hello.covered },
          b: { seq: b.hello.seq, covered: b.hello.covered },
        },
        object: {
          colo: counters.colo,
          id: counters.object,
          head: counters.head,
          covered: counters.covered,
          revision: counters.revision,
        },
        roomFrame: a.room,
        ok: textA.plain === textB.plain && infoA.json?.revision === infoB2.json?.revision,
        note: 'sync.status is not read: its output table refuses the tier word until R1-INTd lands; deck.info names the revision on each instance instead',
      });
    }

    // the wake after a pause: no timer stands, so after 10 s idle the object may hibernate; the
    // next frame is answered from a constructor that rebuilt the roster (counters.sinceWake.wakes)
    if (wants('wake')) {
      const before = (await bearer(`/rooms/${deckId}/counters`)).json;
      await sleep(16_000);
      const sent = b.presence({ slideId: SLIDE });
      const inA = await a
        .next(
          (frame) =>
            frame.type === 'presence' && frame.clientId === b.cid && frame.clock === sent.clock,
          5000,
        )
        .catch(() => null);
      const resend = a.frames.find((frame) => frame.type === 'resend') ?? null;
      const after = (await bearer(`/rooms/${deckId}/counters`)).json;
      row('wake.after-pause', {
        awakeSinceBefore: before.awakeSince,
        awakeSinceAfter: after.awakeSince,
        woke: before.awakeSince !== after.awakeSince,
        totalWakes: after.total?.wakes,
        resendSeen: resend !== null,
        presenceAfterPauseMs: inA === null ? null : Math.round(inA.__at - sent.sentAt),
        note: 'wrangler dev hibernates a Durable Object after 10 s idle only if the local runtime does; a changed awakeSince is the proof, an unchanged one means no hibernation locally',
      });
    }

    // cost.do.* and cost.worker.requests on a scaled slice: one op per 5 s, heartbeats every 5 s
    if (wants('cost') && SLICE_S > 0) {
      const editSeconds = Math.round(SLICE_S * 0.2);
      const idleSeconds = SLICE_S - editSeconds;
      const c0 = (await bearer(`/rooms/${deckId}/counters`)).json;
      const w0 = (await bearer('/control/counters')).json;
      const t0 = Date.now();
      let ops = 0;
      while (Date.now() - t0 < editSeconds * 1000) {
        const before = await textOf(BASE_A, deckId, false);
        const sent = await a.ops(head, [[splice(before.plain.length, 0, '.')]]);
        head = sent.ack.head;
        ops += 1;
        b.presence({
          slideId: SLIDE,
          selection: { blockIds: [BLOCK], caret: { blockId: BLOCK, path: '/text', offset: ops } },
        });
        await sleep(5000);
      }
      const t1 = Date.now();
      let pings = 0;
      while (Date.now() - t1 < idleSeconds * 1000) {
        a.send('ping');
        b.send('ping');
        pings += 2;
        await sleep(5000);
      }
      const c1 = (await bearer(`/rooms/${deckId}/counters`)).json;
      const w1 = (await bearer('/control/counters')).json;
      const delta = (key) => (c1.total?.[key] ?? 0) - (c0.total?.[key] ?? 0);
      const scale = 3600 / SLICE_S;
      const reading = {
        sliceSeconds: SLICE_S,
        editSeconds,
        idleSeconds,
        ops,
        pings,
        object: {
          requests: delta('requests'),
          messages: delta('messages'),
          opsFrames: delta('opsFrames'),
          presenceFrames: delta('presenceFrames'),
          alarms: delta('alarms'),
          checkpoints: delta('checkpoints'),
          rowsWritten: delta('rowsWritten'),
          rowsRead: delta('rowsRead'),
        },
        worker: Object.fromEntries(
          Object.keys(w1)
            .filter((k) => k !== 'startedAt')
            .map((k) => [k, (w1[k] ?? 0) - (w0[k] ?? 0)]),
        ),
        scaledToOneHour: {
          requestUnits: Math.round(
            (delta('requests') + delta('alarms') + Math.ceil(delta('messages') / 20)) * scale,
          ),
          rowsWritten: Math.round(delta('rowsWritten') * scale),
          alarms: Math.round(delta('alarms') * scale),
        },
        ceilings: {
          'cost.do.requests': 300,
          'cost.do.rows-written': 800,
          'cost.worker.requests': 90,
        },
        note: "a scaled slice on wrangler dev, read from the object's own counters; the account's figures and the Free plan caps are the preview's and the dashboard's (docs/CLOUDFLARE.md 2.2); the heartbeat pings are answered by the runtime and do not count as messages",
      };
      row('cost.do.requests', {
        ...reading,
        scaledRequestUnits: reading.scaledToOneHour.requestUnits,
        ok: reading.scaledToOneHour.requestUnits <= 300,
      });
      row('cost.do.rows-written', {
        scaledRowsWritten: reading.scaledToOneHour.rowsWritten,
        perOp: ops > 0 ? Math.round((delta('rowsWritten') / ops) * 10) / 10 : null,
        ok: reading.scaledToOneHour.rowsWritten <= 800,
      });
      row('cost.do.duration', {
        note: "the dashboard's duration metric is the only reading; not readable locally",
        ok: null,
      });
      row('cost.worker.requests', {
        worker: reading.worker,
        scaled: Math.round(Object.values(reading.worker).reduce((n, x) => n + x, 0) * scale),
        ok: null,
        note: "per isolate counts of the lane's wrangler dev, two tabs; the dashboard is the figure of record",
      });
    }

    // the day 0 probes: DROP TABLE's cursor and a 50 ms spin inside the object (the local runtime's accounting)
    if (wants('probes')) {
      const probe = (await bearer(`/rooms/${deckId}/counters?probe=drop&spin=50`)).json;
      row('probe.drop-table', {
        probe: probe.probe,
        spinMs: probe.spinMs,
        note: "miniflare's cursor counts; the preview Worker's reading is the one that bills (W1 open 1)",
      });
    }

    a.close();
    b.close();
    await Promise.all([a.closed, b.closed]).catch(() => null);
    await sleep(500);
    const openAfter = (await bearer('/control/open')).json;
    say('rtOpenAfterClose', openAfter);
    const workerCountersAfter = (await bearer('/control/counters')).json;
    say('workerCounters', { before: workerCountersBefore, after: workerCountersAfter });
  } finally {
    // the scratch deck goes by id (never a sweep by date or name)
    const info = await post(BASE_A, 'deck.info', deckId, {}, false);
    const rev = info.json?.revision ?? 0;
    const trash = await post(
      BASE_A,
      'deck.trash',
      deckId,
      { id: deckId, baseRevision: rev },
      false,
    );
    const rev2 = (await post(BASE_A, 'deck.info', deckId, {}, false)).json?.revision ?? rev;
    const remove = await post(
      BASE_B,
      'deck.remove',
      deckId,
      { id: deckId, confirm: true, baseRevision: rev2 },
      true,
    );
    const gone = await post(BASE_A, 'deck.info', deckId, {}, false);
    say('teardown', { trash: trash.status, remove: remove.status, after: gone.status });
    facts.endedAt = new Date().toISOString();
    facts.loadAtEnd = loadavg();
    writeFileSync(join(OUT, 'facts-do.json'), `${JSON.stringify(facts, null, 2)}\n`);
    console.log(`facts written to ${join(OUT, 'facts-do.json')}`);
  }
}

main().catch((error) => {
  console.error(error);
  facts.error = error instanceof Error ? error.message : String(error);
  writeFileSync(join(OUT, 'facts-do.json'), `${JSON.stringify(facts, null, 2)}\n`);
  process.exit(1);
});
