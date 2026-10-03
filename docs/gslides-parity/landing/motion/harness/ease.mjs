// cubic-bezier fits for GSAP eases, a critically damped spring as linear(), and the share of a
// duration each curve needs to cover 90 percent of the distance.
const bez = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s, dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => { let s = x; for (let i = 0; i < 8; i++) { const e = X(s) - x; const d = dX(s); if (Math.abs(e) < 1e-7) break; if (Math.abs(d) < 1e-6) break; s -= e / d; } let lo = 0, hi = 1; if (Math.abs(X(s) - x) > 1e-5) { s = x; for (let i = 0; i < 40; i++) { if (X(s) < x) lo = s; else hi = s; s = (lo + hi) / 2; } } return Y(s); };
};
const curves = {
  'expo.out': (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  'power3.out (quart)': (t) => 1 - Math.pow(1 - t, 4),
  'power2.out (cubic)': (t) => 1 - Math.pow(1 - t, 3),
  'power2.inOut': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const N = 200;
const err = (f, p) => { const g = bez(...p); let m = 0; for (let i = 0; i <= N; i++) { const t = i / N; m = Math.max(m, Math.abs(f(t) - g(t))); } return m; };
function fit(f, start) {
  let best = start, be = err(f, start), step = 0.1;
  while (step > 1e-4) { let improved = false; for (let k = 0; k < 4; k++) for (const s of [-step, step]) { const p = best.slice(); p[k] += s; p[k] = Math.min(1, Math.max(0, p[k])); const e = err(f, p); if (e < be) { be = e; best = p; improved = true; } } if (!improved) step /= 2; }
  return [best.map((v) => +v.toFixed(3)), be];
}
const t90 = (f) => { for (let i = 0; i <= 10000; i++) if (f(i / 10000) >= 0.9) return i / 10000; return 1; };
for (const [k, f] of Object.entries(curves)) {
  const start = k.includes('inOut') ? [0.65, 0, 0.35, 1] : [0.2, 1, 0.3, 1];
  const [p, e] = fit(f, start);
  console.log(`${k}: cubic-bezier(${p.join(', ')}) max error ${(e * 100).toFixed(2)}% of distance; 90% reached at ${(t90(f) * 100).toFixed(0)}% of duration`);
}
const named = { 'product --pt-ease (0.2,0,0,1)': [0.2, 0, 0, 1], 'CSS ease-out (0,0,0.58,1)': [0, 0, 0.58, 1], 'CSS ease (0.25,0.1,0.25,1)': [0.25, 0.1, 0.25, 1], 'Stripe Express (0.2,1,0.2,1)': [0.2, 1, 0.2, 1], 'Vaul (0.32,0.72,0,1)': [0.32, 0.72, 0, 1], 'easeOutExpo easings.net (0.16,1,0.3,1)': [0.16, 1, 0.3, 1], 'easeOutQuart easings.net (0.25,1,0.5,1)': [0.25, 1, 0.5, 1] };
for (const [k, p] of Object.entries(named)) console.log(`${k}: 90% at ${(t90(bez(...p)) * 100).toFixed(0)}% of duration; 50% at ${(((x) => { const g = bez(...p); for (let i = 0; i <= 10000; i++) if (g(i / 10000) >= 0.5) return i / 100; })())}%`);
// critically damped spring x(t) = 1 - (1 + w t) e^{-w t}; pick w so x(T) = 0.999 at T = 1
let w = 1; while ((1 + w) * Math.exp(-w) > 0.001) w += 0.001;
const spring = (t) => 1 - (1 + w * t) * Math.exp(-w * t);
const pts = [];
for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(+spring(t).toFixed(4)); }
console.log(`critically damped spring, settles to 99.9% at the duration (w*T=${w.toFixed(3)}): linear(${pts.join(', ')})`);
console.log(`spring 90% at ${(t90(spring) * 100).toFixed(0)}% of duration`);
const [sp, se] = fit(spring, [0.2, 1, 0.3, 1]);
console.log(`spring nearest cubic-bezier(${sp.join(', ')}) max error ${(se * 100).toFixed(2)}%`);
// expo.out as linear() for exactness
const ex = []; for (let i = 0; i <= 20; i++) ex.push(+curves['expo.out'](i / 20).toFixed(4));
console.log(`expo.out exact as linear(): linear(${ex.join(', ')})`);
// stiffness/damping equivalents for mass 1: w = sqrt(k/m); critical damping c = 2*sqrt(k*m)
for (const T of [0.4, 0.6, 0.8]) { const ww = w / T; const k = ww * ww; console.log(`spring settling at ${T * 1000} ms: mass 1, stiffness ${k.toFixed(0)}, damping ${(2 * Math.sqrt(k)).toFixed(1)} (critical, no overshoot)`); }
console.log('--- named curves against the GSAP eases');
const pairs = [['expo.out', [0.16, 1, 0.3, 1]], ['power3.out (quart)', [0.25, 1, 0.5, 1]], ['power2.out (cubic)', [0.33, 1, 0.68, 1]], ['power2.inOut', [0.65, 0, 0.35, 1]]];
for (const [k, p] of pairs) console.log(`${k} vs cubic-bezier(${p.join(', ')}): max error ${(err(curves[k], p) * 100).toFixed(2)}%`);
const smooth = (t) => t * t * (3 - 2 * t);
console.log(`smoothstep vs cubic-bezier(0.333, 0, 0.667, 1): max error ${(err(smooth, [1 / 3, 0, 2 / 3, 1]) * 100).toFixed(3)}%`);
