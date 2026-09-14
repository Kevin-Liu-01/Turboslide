#!/usr/bin/env node
// The verifier's preview measurements of SPEC-3 16.7 on the degraded tiers (MILESTONES-3
// "Verifier" item 9), the rows curl can drive: the SSE stream's lifetime against the 300 s rule
// and its `retry` field; one write and one full commit timed through the bearer; a small load
// test as far as the blob tier allows (five concurrent writers, ten writes each, on a scratch
// copy: the statuses, the latency percentiles, whether another deck's reads keep answering).
// The scratch copy is trashed and removed at the end. Usage:
//   VERCEL_OIDC_TOKEN=<pulled> TURBOSLIDE_TOKEN=<bearer> node load-and-stream.mjs --base <origin> [--writers 5] [--writes 10] [--stream-seconds 320]
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = value('base', 'https://turboslide-igavfcg2x-kl01s-projects.vercel.app').replace(
  /\/$/,
  '',
);
const WRITERS = Number(value('writers', '5'));
const WRITES = Number(value('writes', '10'));
const STREAM_SECONDS = Number(value('stream-seconds', '320'));
const P = { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN ?? '' };
const bearer = {
  ...P,
  'content-type': 'application/json',
  authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN ?? ''}`,
};
const post = (path, body, h = bearer) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
    redirect: 'manual',
  });
const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? null;
};
const out = {};
const log = (k, v) => {
  out[k] = v;
  console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
};
const info = await (await post('/api/actions/deck.info?deck=gt-brand', {})).json();
const list = await (await post('/api/actions/slide.list?deck=gt-brand', {})).json();
const firstId = Array.isArray(list) ? list[0].id : list.slides[0].id;
const scratch = `verifier-load-${Date.now().toString(36)}`;
let t = performance.now();
const copy = await post('/api/actions/deck.copy?deck=gt-brand', {
  id: 'gt-brand',
  name: 'Verifier load',
  newId: scratch,
  slideIds: [firstId],
  baseRevision: info.revision,
});
log('deck.copy (one slide) ms', Math.round(performance.now() - t) + ` status ${copy.status}`);
// the SSE stream: open with the bearer, count events, record the close time and the retry field
const streamPromise = (async () => {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_SECONDS * 1000);
  let events = 0;
  let hello = null;
  let retry = null;
  let firstByteMs = null;
  let comments = 0;
  let lastEventId = null;
  let closedBy = 'timeout';
  try {
    const res = await fetch(`${BASE}/api/decks/${scratch}/stream`, {
      headers: { ...P, authorization: bearer.authorization, accept: 'text/event-stream' },
      signal: controller.signal,
    });
    const status = res.status;
    if (!res.body) return { status, note: 'no body' };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        closedBy = 'server';
        break;
      }
      if (firstByteMs === null) firstByteMs = Math.round(performance.now() - started);
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (chunk.startsWith(':')) {
          comments += 1;
          continue;
        }
        events += 1;
        const ev = /^event: (.*)$/m.exec(chunk)?.[1];
        const id = /^id: (.*)$/m.exec(chunk)?.[1];
        if (id) lastEventId = id;
        const r = /^retry: (\d+)$/m.exec(chunk)?.[1];
        if (r) retry = Number(r);
        if (ev === 'hello' && hello === null)
          hello = /^data: (.*)$/m.exec(chunk)?.[1]?.slice(0, 200) ?? '';
      }
    }
    return {
      status,
      firstByteMs,
      events,
      comments,
      hello,
      retry,
      lastEventId,
      lifetimeS: Math.round((performance.now() - started) / 1000),
      closedBy,
    };
  } catch (error) {
    return {
      firstByteMs,
      events,
      comments,
      hello,
      retry,
      lastEventId,
      lifetimeS: Math.round((performance.now() - started) / 1000),
      closedBy:
        error?.name === 'AbortError'
          ? `client abort at ${STREAM_SECONDS} s (the server had not closed)`
          : String(error).slice(0, 120),
    };
  } finally {
    clearTimeout(timer);
  }
})();
// one write and one full commit timed
let rev = (await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json()).revision;
t = performance.now();
const w1 = await post(`/api/actions/slide.update?deck=${scratch}`, {
  slideId: firstId,
  baseRevision: rev,
  mutations: [{ op: 'slide.set', slideId: firstId, path: '/notes', value: 'one write' }],
});
const w1ms = Math.round(performance.now() - t);
t = performance.now();
let saved = null;
for (let i = 0; i < 60; i += 1) {
  const again = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json();
  if (again.revision > rev) {
    saved = Math.round(performance.now() - t);
    rev = again.revision;
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}
log(
  'one write: slide.update ms / revision visible after ms',
  `${w1.status} in ${w1ms} ms; visible in deck.info after ${saved} ms`,
);
t = performance.now();
const named = await post(`/api/actions/version.save?deck=${scratch}`, {
  name: 'Verifier commit',
  baseRevision: rev,
}).catch(() => null);
log(
  'one full commit (version.save) ms',
  `${named?.status} in ${Math.round(performance.now() - t)} ms`,
);
// the load test: WRITERS concurrent writers, WRITES each, each write against the latest revision it knows
const statuses = {};
const latencies = [];
const t0 = performance.now();
await Promise.all(
  Array.from({ length: WRITERS }, async (_, w) => {
    let base = (await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json()).revision;
    for (let i = 0; i < WRITES; i += 1) {
      const t1 = performance.now();
      const r = await post(`/api/actions/slide.update?deck=${scratch}`, {
        slideId: firstId,
        baseRevision: base,
        mutations: [{ op: 'slide.set', slideId: firstId, path: '/notes', value: `w${w} i${i}` }],
      });
      latencies.push(Math.round(performance.now() - t1));
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      const body = await r.json().catch(() => null);
      if (r.status === 200) base = body?.revision ?? base + 1;
      else if (r.status === 409)
        base = Number(/at revision (\d+)/.exec(body?.error?.message ?? '')?.[1] ?? base + 1);
      else if (r.status === 429) await new Promise((res) => setTimeout(res, 1000));
    }
  }),
);
const loadMs = Math.round(performance.now() - t0);
log('load test', {
  writers: WRITERS,
  writesEach: WRITES,
  seconds: Math.round(loadMs / 100) / 10,
  statuses,
  p50: pct(latencies, 0.5),
  p95: pct(latencies, 0.95),
  max: Math.max(...latencies),
  writesPerSecond: Math.round(((WRITERS * WRITES) / loadMs) * 1000 * 10) / 10,
});
// another deck's reads during and after
t = performance.now();
const other = await post('/api/actions/deck.info?deck=gt-brand', {});
log(
  "another deck's read after the burst",
  `${other.status} in ${Math.round(performance.now() - t)} ms`,
);
const finalInfo = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json();
log('scratch revision after the burst', finalInfo.revision);
console.log(`waiting for the stream (up to ${STREAM_SECONDS} s)…`);
log('stream', await streamPromise);
const i2 = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json();
const tr = await post(`/api/actions/deck.trash?deck=${scratch}`, {
  id: scratch,
  baseRevision: i2.revision,
});
const i3 = await (await post(`/api/actions/deck.info?deck=${scratch}`, {})).json().catch(() => i2);
const rm = await post(`/api/actions/deck.remove?deck=${scratch}`, {
  id: scratch,
  confirm: true,
  baseRevision: i3.revision ?? i2.revision,
});
log('cleanup', `trash ${tr.status} remove ${rm.status}`);
import('node:fs').then(({ writeFileSync }) =>
  writeFileSync(
    new URL('./load-and-stream.json', import.meta.url),
    `${JSON.stringify({ base: BASE, at: new Date().toISOString(), ...out }, null, 2)}\n`,
  ),
);
