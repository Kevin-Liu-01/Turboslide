// times a document's body chunks with a person's Chrome user agent and counts the deck cards
const url = process.argv[2];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const t0 = performance.now();
const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
const th = performance.now() - t0;
let body = '';
const groups = [];
const dec = new TextDecoder();
for await (const chunk of r.body) {
  const t = Math.round(performance.now() - t0);
  body += dec.decode(chunk, { stream: true });
  const g = groups.at(-1);
  if (g && t - g[1] < 15) { g[1] = t; g[2] += chunk.length; } else groups.push([t, t, chunk.length]);
}
const ids = new Set([...body.matchAll(/data-control="home\.open\.([^"]+)"/g)].map((m) => m[1]));
console.log(new Date().toISOString(), url.replace('https://www.turboslide.com', ''), r.status, 'headers', Math.round(th), 'ms', r.headers.get('x-vercel-id'), 'groups [first,last,bytes]', JSON.stringify(groups.slice(0, 8)), 'cards', ids.size, 'scratch', [...ids].filter((i) => /^untitled-/.test(i)).length);
