// Fills the /home template: the mark as inline SVG at three sizes, the Heroicons from the theme sprite, and
// three anonymous author squares (Bayer tiers keyed by a hash), then writes design-4/shader/home.html.
import { readFileSync, writeFileSync } from 'node:fs';
const { geometry, markShapes } = await import('./mark.mjs');
const { bayer8 } = await import('/Users/kevinliu/repos/Turboslide/packages/effects/src/bayer.ts');
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/shader';
const icons = Object.fromEntries(readFileSync('icons.jsonl', 'utf8').trim().split('\n').map((l) => { const o = JSON.parse(l); return [o.id, o]; }));
const icon = (name) => { const o = icons[name]; if (!o) throw new Error(`no icon ${name}`); return `<svg class="ts-ic" viewBox="${o.vb}" aria-hidden="true">${o.body}</svg>`; };
const mark = (S, cls = '') => { const g = geometry(S); return `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${markShapes(g, 1)}</svg>`; };
function fnv(s) { let h = 0x811c9dc5; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function avatar(id) {
  const tier = 8 + (fnv(id) % 48); // 8 to 55 of 64 cells lit
  let d = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) if (bayer8(y, x) < tier) d += `M${x * 3} ${y * 3}h3v3h-3z`;
  return `<svg class="ts-avatar" viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" role="img" aria-label="${id}"><rect width="24" height="24" fill="var(--pt-paper)"/><path d="${d}" fill="var(--pt-ink)"/></svg>`;
}
let html = readFileSync('home.template.html', 'utf8');
html = html.replace(/\{\{icon:([a-z0-9-]+)\}\}/g, (_, n) => icon(n));
html = html.replace(/\{\{mark32\}\}/g, mark(32)).replace(/\{\{mark80\}\}/g, mark(80)).replace(/\{\{mark16\}\}/g, mark(16));
html = html.replace('{{avatars}}', ['agent:run-7f3a', 'studio', 'agent:run-c21d'].map(avatar).join(''));
if (/\{\{/.test(html)) throw new Error('unfilled placeholder ' + html.match(/\{\{[^}]+\}\}/)[0]);
writeFileSync(`${OUT}/home.html`, html);
console.log('home.html', html.length, 'bytes');
