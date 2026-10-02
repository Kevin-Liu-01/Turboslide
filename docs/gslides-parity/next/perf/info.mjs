// deck.info for the two scratch decks (read only); the bearer comes from the environment and is printed nowhere
import { readFileSync } from 'node:fs';
const ids = JSON.parse(readFileSync(new URL('./state/ids.json', import.meta.url), 'utf8'));
for (const id of [ids.a, ids.b]) {
  const r = await fetch(`https://www.turboslide.com/api/actions/deck.info?deck=${encodeURIComponent(id)}`, { method: 'POST', headers: { authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}`, 'content-type': 'application/json' }, body: '{}' });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  console.log(id, r.status, JSON.stringify(typeof j === 'object' ? Object.fromEntries(Object.entries(j).filter(([k]) => /revision|trash|title|id|slides|deck/i.test(k)).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : v])) : j).slice(0, 300));
}
