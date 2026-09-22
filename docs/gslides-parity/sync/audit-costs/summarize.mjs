// Prints the per phase, per route table of one measure.mjs run file, plus the timing of the
// long lived requests (the room stream) and a list of every request in the window when --all.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const all = process.argv.includes('--all');
const j = JSON.parse(readFileSync(file, 'utf8'));
console.log(
  `# ${j.mode} against ${j.base}, ${j.startedAt} to ${j.endedAt}${j.deck ? `, deck ${j.deck.id}` : ''}`,
);
if (j.edits !== undefined)
  console.log(
    `edits made: ${j.edits}, revision after: ${j.revisionAfter}, save state: ${j.saveState}`,
  );
if (j.download !== undefined)
  console.log(`download: ${JSON.stringify(j.download)}, save state: ${j.saveState}`);
if (j.error) console.log(`error: ${j.error}`);
for (const [name, phase] of Object.entries(j.phases)) {
  console.log(`\n## ${name}: ${phase.note} (${phase.minutes} min, ${phase.requests} requests)`);
  console.log('| route | requests | per minute | bytes | statuses | cache | methods |');
  console.log('| --- | ---: | ---: | ---: | --- | --- | --- |');
  for (const r of phase.rows) {
    const s = Object.entries(r.statuses)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const c = Object.entries(r.cache)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const m = Object.entries(r.methods)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    console.log(
      `| ${r.route} | ${r.requests} | ${r.perMinute} | ${r.bytes} | ${s} | ${c} | ${m} |`,
    );
  }
}
const streams = j.requests.filter((r) => /\/stream$/.test(r.route));
if (streams.length) {
  console.log('\n## stream requests');
  for (const s of streams)
    console.log(
      `- ${new Date(s.t).toISOString().slice(11, 19)} ${s.status ?? 'pending'} ${s.tEnd ? `held ${Math.round((s.tEnd - s.t) / 1000)} s` : 'still open at the end'} ${s.url.replace(/^https:\/\/turboslide\.vercel\.app/, '')}`,
    );
}
if (j.cleanup) console.log(`\ncleanup: ${JSON.stringify(j.cleanup)}`);
if (all) {
  console.log('\n## every request');
  for (const r of j.requests)
    console.log(
      `${new Date(r.t).toISOString().slice(11, 23)} ${r.method} ${r.status ?? (r.failed ? 'failed' : 'pending')} ${r.cache ?? '-'} ${r.bytes ?? '-'} ${r.url.replace(/^https:\/\/turboslide\.vercel\.app/, '')}`,
    );
}
