#!/usr/bin/env node
// The ship step's deployment poll (docs/gslides-parity/MILESTONES-3.md "Ship step" item 4):
//
//   node docs/gslides-parity/verification-3/ship/poll-deploy.mjs [base] [minutes] [marker]
//
// Every 30 s: GET base/ (the 307 to /new) and base/new (the SSR shell), collect the stylesheets
// and module scripts the shell links, fetch them, and count the bytes of a round three class
// marker in them (default `ts-presence`, the title row's presence slot of SPEC-3 4.2, which no
// round two deploy served; `ts-comment-marker` and `ts-remote-caret` are counted too). Stops when
// the marker count is above zero on /new, or after the minutes given (default 15). Prints one line
// per poll and a final summary; exit 0 when the round three chrome answered. Nothing here needs a
// token; the x-vercel-id header names the instance that answered.
const BASE = (process.argv[2] ?? 'https://turboslide.vercel.app').replace(/\/$/, '');
const MINUTES = Number(process.argv[3] ?? 15);
const STOP_MARKER = process.argv[4] ?? 'ts-presence';
const MARKERS = [STOP_MARKER, 'ts-comment-marker', 'ts-remote-caret'];

async function fetchOnce(url, follow = false) {
  const response = await fetch(url, {
    redirect: follow ? 'follow' : 'manual',
    headers: { 'user-agent': 'turboslide-ship-poll' },
  });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body };
}

function assetsOf(html) {
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  hrefs.push(
    ...[...html.matchAll(/<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/g)].map((m) => m[1]),
  );
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  return { sheets: [...new Set(hrefs)].sort(), scripts: [...new Set(srcs)].sort() };
}

async function countMarkers(paths) {
  const counts = Object.fromEntries(MARKERS.map((m) => [m, 0]));
  let fetched = 0;
  for (const path of paths) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const { status, body } = await fetchOnce(url, true).catch(() => ({
      status: 0,
      body: Buffer.alloc(0),
    }));
    if (status !== 200) continue;
    fetched += 1;
    const text = body.toString('utf8');
    for (const m of MARKERS) counts[m] += text.split(m).length - 1;
  }
  return { fetched, counts };
}

const deadline = Date.now() + MINUTES * 60_000;
let poll = 0;
for (;;) {
  poll += 1;
  const now = new Date().toTimeString().slice(0, 8);
  const root = await fetchOnce(`${BASE}/`).catch((error) => ({
    status: 0,
    headers: new Headers(),
    body: Buffer.alloc(0),
    error,
  }));
  const lines = [`${now} poll ${poll}: / ${root.status} -> ${root.headers.get('location') ?? ''}`];
  let hit = false;
  const page = await fetchOnce(`${BASE}/new`).catch(() => null);
  if (page !== null) {
    const html = page.body.toString('utf8');
    const { sheets, scripts } = assetsOf(html);
    const { fetched, counts } = await countMarkers([...sheets, ...scripts]);
    lines.push(
      `  /new ${page.status} ${page.body.length} B; ${sheets.length} stylesheet(s), ${scripts.length} script(s), ${fetched} fetched; markers ${MARKERS.map((m) => `${m} ${counts[m]}`).join(', ')}; x-vercel-id ${page.headers.get('x-vercel-id') ?? ''}`,
    );
    if (counts[STOP_MARKER] > 0) hit = true;
  } else {
    lines.push('  /new unreachable');
  }
  console.log(lines.join('\n'));
  if (hit) {
    console.log(`${now}: the round three chrome answers on /new after ${poll} poll(s)`);
    process.exit(0);
  }
  if (Date.now() >= deadline) {
    console.log(`${now}: no marker after ${MINUTES} minutes`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 30_000));
}
