#!/usr/bin/env node
// The hotfix ship step's deployment poll (VERIFICATION-3 section 17.4). The round three markers
// (`ts-presence` and the like) are already live, so this poll records the set of stylesheets and
// module scripts the /new shell links on the deployment that answers first, then every 20 s GETs
// `/` (the 307) and `/new` again and stops when the asset set differs from the first reading and
// `/new` answers 200, or after the minutes given (default 15). Prints one line per poll with the
// `x-vercel-id` of the instance that answered; exit 0 when the new build answered.
//   node poll-deploy-assets.mjs [base] [minutes]
const BASE = (process.argv[2] ?? 'https://turboslide.vercel.app').replace(/\/$/, '');
const MINUTES = Number(process.argv[3] ?? 15);

async function fetchOnce(url) {
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'turboslide-hotfix-ship-poll', 'cache-control': 'no-cache' },
  });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body };
}

function assetsOf(html) {
  const hrefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set([...hrefs, ...srcs])].sort();
}

const deadline = Date.now() + MINUTES * 60_000;
let first = null;
let poll = 0;
for (;;) {
  poll += 1;
  const now = new Date().toTimeString().slice(0, 8);
  const root = await fetchOnce(`${BASE}/`).catch(() => ({ status: 0, headers: new Headers() }));
  const page = await fetchOnce(`${BASE}/new`).catch(() => null);
  let line = `${now} poll ${poll}: / ${root.status} -> ${root.headers.get('location') ?? ''}`;
  if (page !== null) {
    const assets = assetsOf(page.body.toString('utf8'));
    const key = assets.join('|');
    if (first === null) first = key;
    const changed = key !== first;
    line += `; /new ${page.status} ${page.body.length} B, ${assets.length} asset(s)${changed ? ' CHANGED' : ''}; x-vercel-id ${page.headers.get('x-vercel-id') ?? ''}`;
    console.log(line);
    if (changed && page.status === 200) {
      console.log(
        `${now}: a new build answers on /new after ${poll} poll(s); assets: ${assets.join(' ')}`,
      );
      process.exit(0);
    }
  } else {
    console.log(`${line}; /new unreachable`);
  }
  if (Date.now() >= deadline) {
    console.log(`${now}: no new build after ${MINUTES} minutes`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
