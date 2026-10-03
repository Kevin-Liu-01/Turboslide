// Digest a capture: per phase, the declared animation timings (grouped), the stagger ladder,
// and the pixel-measured motion window (frames that differ from the previous one inside a clip).
// usage: node digest.mjs <report.json> [clip x,y,w,h]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
const sharp = require('sharp');
const rep = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clipArg = process.argv[3]?.split(',').map(Number);
console.log('#', rep.key, rep.reduced ? '(reduced)' : '', rep.url, rep.date);
console.log('LCP', JSON.stringify(rep.page.m?.lcp), 'CLS', rep.page.m?.cls?.toFixed(3), 'ctx', JSON.stringify(rep.page.m?.ctx), 'longtasks', rep.page.m?.longtasks?.length, 'sum', rep.page.m?.longtasks?.reduce((s, x) => s + x[1], 0));
console.log('scroll-behavior', rep.page.scrollBehavior, rep.page.bodyScrollBehavior, 'lenis', rep.page.lenis, 'locomotive', rep.page.locomotive, 'docH', rep.page.docH, 'fonts', JSON.stringify(rep.page.fonts));
console.log('bytes', JSON.stringify(rep.bytes));
console.log('bigJs', JSON.stringify(rep.bigJs));
console.log('media', JSON.stringify(rep.media));
console.log('videos', JSON.stringify(rep.page.vids));
console.log('canvases', JSON.stringify(rep.page.canv));
for (const ph of rep.phases) {
  console.log(`\n## phase ${ph.name} (${ph.kind}) ${ph.secs}s frames ${ph.frames} main ${JSON.stringify(ph.mainThreadMs)} rafTotal ${ph.rafTotal}`);
  const as = rep.anims.filter((a) => a.phase === ph.name);
  const groups = new Map();
  for (const a of as) {
    const ease = a.kfEasing?.[0] || a.timingEasing || a.easing;
    const k = `${a.type}|${a.name || a.transitionProperty || a.animationName}|${Math.round(a.duration)}|${ease}|it${a.iterations}|${(a.props || []).join('+')}`;
    const g = groups.get(k) || { n: 0, delays: [], starts: [], targets: new Set(), from: a.from, to: a.to };
    g.n++; g.delays.push(Math.round(a.delay || 0)); g.starts.push(a.phaseRelMs); if (a.target) g.targets.add(a.target);
    groups.set(k, g);
  }
  for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, rep.sampled ? 8 : 40)) {
    const ds = [...new Set(g.delays)].sort((a, b) => a - b);
    console.log(`  ${g.n}x ${k} delays[${ds.slice(0, 12).join(',')}${ds.length > 12 ? '...' : ''}] start@${Math.min(...g.starts)}..${Math.max(...g.starts)} tgt ${[...g.targets].slice(0, 3).join(' ; ')} from ${g.from} to ${g.to}`);
  }
  const ss = (rep.sampled || []).filter((a) => a.phase === ph.name);
  const sg = new Map();
  for (const a of ss) {
    const ease = a.kfEasing || a.easing;
    const k = `${a.type}|${a.name}|${a.duration}|${ease}|it${a.iterations}|${a.props}|${a.timeline}`;
    const g = sg.get(k) || { n: 0, delays: [], starts: [], targets: new Set(), from: a.from, to: a.to };
    g.n++; g.delays.push(a.delay); g.starts.push(a.phaseRelMs); if (a.target) g.targets.add(a.target);
    sg.set(k, g);
  }
  if (ss.length) console.log('  -- sampled (with targets) --');
  for (const [k, g] of [...sg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30)) {
    const ds = [...new Set(g.delays)].sort((a, b) => a - b);
    console.log(`  S ${g.n}x ${k.slice(0, 220)} delays[${ds.slice(0, 14).join(',')}${ds.length > 14 ? '...' : ''}] seen@${Math.min(...g.starts)}..${Math.max(...g.starts)} tgt ${[...g.targets].slice(0, 3).join(' ; ')} from ${g.from} to ${g.to}`);
  }
  // pixel motion window
  const fr = rep.frames.filter((f) => f.phase === ph.name).sort((a, b) => a.t - b.t);
  if (fr.length > 1) {
    let prev = null; const changes = [];
    for (const f of fr) {
      let img = sharp(f.file);
      if (clipArg) img = img.extract({ left: clipArg[0], top: clipArg[1], width: clipArg[2], height: clipArg[3] });
      const buf = await img.resize(96, 60, { fit: 'fill' }).greyscale().raw().toBuffer();
      if (prev) { let s = 0; for (let i = 0; i < buf.length; i++) s += Math.abs(buf[i] - prev[i]); changes.push([f.t - ph.trigger, +(s / buf.length).toFixed(2)]); }
      prev = buf;
    }
    const moving = changes.filter((c) => c[1] > 0.15);
    console.log(`  pixel change: first ${moving[0]?.[0]} last ${moving.at(-1)?.[0]} frames>0.15: ${moving.length}/${changes.length}`);
    console.log('  series', changes.filter((_, i) => i % Math.max(1, Math.floor(changes.length / 40)) === 0).map((c) => c.join(':')).join(' '));
  }
}
