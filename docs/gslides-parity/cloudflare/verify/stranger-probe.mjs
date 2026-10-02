// The verifier's probe of an upgrade that carries no ticket (VERIFICATION.md realtime pass 1
// finding 12; the realtime round's pass 2): against the local Worker, two strangers on two fresh
// deck ids with the room subprotocol and an Origin and no ticket in the subprotocols: the first
// sends nothing, the second sends a join frame whose ticket is not a ticket. Each records whether
// the upgrade answered 101, the close code and reason with the time, and the object's counters
// (`sinceWake.seeds`, `head`) and the Worker's open deck list after, read under the room bearer
// (TURBOSLIDE_ROOM_BEARER from a wrapper; nothing here prints it). No deck is made in any store.
//   node docs/gslides-parity/cloudflare/verify/stranger-probe.mjs --worker http://127.0.0.1:8799 \
//     --origin http://localhost:4479 [--out <file>]
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';

import WebSocket from '../../../../node_modules/.pnpm/ws@8.21.3/node_modules/ws/wrapper.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const WORKER = arg('worker', 'http://127.0.0.1:8799');
const ORIGIN = arg('origin', 'http://localhost:4479');
const OUT = arg('out', null);
const BEARER = process.env.TURBOSLIDE_ROOM_BEARER ?? '';
const facts = {
  startedAt: new Date().toISOString(),
  loadAtStart: loadavg(),
  worker: WORKER,
  cases: [],
};

async function room(path) {
  const r = await fetch(`${WORKER}${path}`, { headers: { authorization: `Bearer ${BEARER}` } });
  const text = await r.text();
  try {
    return { status: r.status, json: JSON.parse(text) };
  } catch {
    return { status: r.status, json: { text: text.slice(0, 200) } };
  }
}

async function stranger(label, frame) {
  const deckId = `verify2-stranger-${label}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const ws = new WebSocket(
    `ws://${new URL(WORKER).host}/rooms/${deckId}?since=0`,
    ['turboslide.v1'],
    {
      headers: { origin: ORIGIN },
    },
  );
  let status = null;
  ws.on('upgrade', (res) => {
    status = res.statusCode;
  });
  ws.on('unexpected-response', (_req, res) => {
    status = res.statusCode;
  });
  const opened = await new Promise((resolve) => {
    ws.once('open', () => resolve(true));
    ws.once('error', () => resolve(false));
  });
  const frames = [];
  ws.on('message', (data) => frames.push(String(data).slice(0, 120)));
  if (opened && frame !== null) ws.send(JSON.stringify(frame));
  const closed = await new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ code: null, reason: 'still open after 60 s' }),
      60_000,
    );
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: String(reason), ms: Date.now() - t0 });
    });
  });
  if (closed.code === null) ws.terminate();
  const after = await room(`/rooms/${deckId}/counters`);
  const open = await room('/control/open');
  const row = {
    label,
    deckId,
    upgraded: opened,
    status,
    sent: frame === null ? 'nothing' : frame.t,
    framesReceived: frames,
    closed,
    seedsAfter: after.json?.sinceWake?.seeds ?? null,
    headAfter: after.json?.head ?? null,
    countersStatus: after.status,
    listedOpen: (open.json?.decks ?? []).some((d) => d.deckId === deckId),
  };
  facts.cases.push(row);
  console.log(JSON.stringify(row));
}

try {
  await stranger('silent', null);
  await stranger('forged-join', { t: 'join', ticket: 'v1.not-a-ticket.not-a-mac' });
} catch (error) {
  facts.error = String(error?.stack ?? error).slice(0, 600);
  console.log(facts.error);
} finally {
  facts.endedAt = new Date().toISOString();
  facts.loadAtEnd = loadavg();
  if (OUT) writeFileSync(OUT, `${JSON.stringify(facts, null, 2)}\n`);
}
