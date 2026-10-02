// times the arrival of each body chunk of a document (is the shell streamed before the list?)
const url = process.argv[2];
const t0 = performance.now();
const r = await fetch(url, { headers: { 'accept-encoding': 'identity', accept: 'text/html' } });
const th = performance.now() - t0;
const chunks = [];
const reader = r.body.getReader();
let total = 0;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  total += value.length;
  chunks.push([Math.round(performance.now() - t0), value.length, total]);
}
console.log(new Date().toISOString(), url.replace('https://www.turboslide.com', ''), r.status, 'headers', Math.round(th), 'ms', r.headers.get('x-vercel-id'), r.headers.get('x-vercel-cache'), r.headers.get('content-encoding'), r.headers.get('transfer-encoding'));
const groups = [];
for (const c of chunks) { const g = groups.at(-1); if (g && c[0] - g[1] < 15) { g[1] = c[0]; g[2] += c[1]; } else groups.push([c[0], c[0], c[1]]); }
console.log(' chunk groups [first ms, last ms, bytes]:', JSON.stringify(groups.slice(0, 12)), 'total', total);
