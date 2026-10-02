// medians and worst values of the probe's samples: node summarize.mjs <file.jsonl> [filter]
import { readFileSync } from 'node:fs';

const [file, filter] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => !r.error);
const med = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const worst = (xs, low = false) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (v.length === 0) return null;
  return low ? Math.min(...v) : Math.max(...v);
};
const fmt = (x, d = 0) => (x === null ? 'n/a' : Number(x).toFixed(d));
const groups = new Map();
for (const r of rows) {
  const route = r.url ? r.url.replace(/\/edit\/[^/?#]+/, '/edit/<id>').replace(/\/present\/[^/?#]+/, '/present/<id>').replace(/presentation\/d\/[^/]+/, 'presentation/d/<id>') : r.deck ?? '';
  const key = `${route} ${r.kind ?? r.how ?? ''}`;
  if (filter && !key.includes(filter)) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
for (const [key, list] of groups) {
  const f = (fn) => list.map((r) => { try { return fn(r); } catch { return null; } });
  const metrics = {
    n: { scalar: list.length },
    readyOk: { scalar: list.filter((r) => r.readyOk !== false).length },
    status: { scalar: list.map((r) => r.doc?.status).join(',') },
    'ttfb (responseStart)': f((r) => r.facts.ttfb),
    'final headers': f((r) => r.facts.finalHeaders),
    'doc end': f((r) => r.facts.docEnd),
    fcp: f((r) => r.facts.fcp),
    lcp: f((r) => r.facts.lcp),
    cls: f((r) => r.facts.cls),
    ready: f((r) => (r.readyOk === false ? null : r.readyPoll)),
    caret: f((r) => r.extra?.caretAt),
    'click to caret': f((r) => r.extra?.clickToCaret),
    'key to raf': f((r) => r.extra?.keyToRaf),
    'key to frame': f((r) => r.extra?.keyToFrame),
    'js transfer KB': f((r) => r.facts.jsTransfer / 1000),
    'js decoded KB': f((r) => r.facts.jsDecoded / 1000),
    'js files': f((r) => r.facts.jsCount),
    'css decoded KB': f((r) => r.facts.cssDecoded / 1000),
    'font KB': f((r) => r.facts.fonts.reduce((a, x) => a + x.t, 0) / 1000),
    requests: f((r) => r.requests),
    'body KB': f((r) => r.bodyBytes / 1000),
    'script ms (CDP)': f((r) => r.cdp?.scriptMs),
    'task ms (CDP)': f((r) => r.cdp?.taskMs),
    'longest frame': f((r) => r.facts.loafMax),
    'serverFn before ready': f((r) => r.facts.api.filter((a) => a.n.startsWith('/_serverFn') && a.s < (r.readyPoll ?? 1e9)).length),
    'filled (visible cards)': f((r) => r.extra?.filledAt),
    'refill after jump': f((r) => r.extra?.refillMs),
    cards: f((r) => r.facts.cards || r.facts.homeCards),
  };
  console.log(`== ${key}`);
  for (const [name, values] of Object.entries(metrics)) {
    if (!Array.isArray(values)) {
      console.log(`  ${name}: ${values.scalar}`);
      continue;
    }
    const m = med(values);
    if (m === null) continue;
    console.log(`  ${name}: median ${fmt(m, name === 'cls' ? 4 : 0)} worst ${fmt(worst(values), name === 'cls' ? 4 : 0)}`);
  }
}
