// sequential document requests with the owner's cookie (read from the saved state, printed nowhere)
import { readFileSync } from 'node:fs';
const st = JSON.parse(readFileSync(new URL('./state/storage.json', import.meta.url)));
const cookie = st.cookies.filter((c) => /turboslide\.com$/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const [path, n = '10', gap = '0'] = process.argv.slice(2);
const rows = [];
for (let i = 0; i < Number(n); i += 1) {
  const t0 = performance.now();
  const r = await fetch(`https://www.turboslide.com${path}`, { headers: { 'user-agent': UA, cookie, accept: 'text/html' } });
  const th = performance.now() - t0;
  const body = await r.text();
  const te = performance.now() - t0;
  const err = r.status >= 400 ? (body.match(/<h1[^>]*>([^<]{0,120})/)?.[1] ?? body.slice(0, 80)) : '';
  rows.push({ i, at: new Date().toISOString().slice(11, 19), status: r.status, headersMs: Math.round(th), endMs: Math.round(te), bytes: body.length, id: r.headers.get('x-vercel-id'), err });
  if (Number(gap) > 0) await new Promise((res) => setTimeout(res, Number(gap)));
}
for (const r of rows) console.log(JSON.stringify(r));
const ok = rows.map((r) => r.endMs).sort((a, b) => a - b);
console.log('median', ok[Math.floor(ok.length / 2)], 'worst', ok.at(-1), 'statuses', JSON.stringify(rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {})));
