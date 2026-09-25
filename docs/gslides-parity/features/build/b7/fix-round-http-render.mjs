// B7 fix round: the full error of shader.render on the HTTP transport of a deployment. The OIDC
// token and the bearer are read from the environment and never printed; the body is written whole.
import { writeFileSync } from 'node:fs';
const BASE = process.argv[2].replace(/\/$/, '');
const OUT = process.argv[3];
const DECK = process.argv[4] ?? 'gt-brand';
const headers = {
  'content-type': 'application/json',
  authorization: `Bearer ${process.env.TURBOSLIDE_TOKEN}`,
  ...(process.env.VERCEL_OIDC_TOKEN
    ? { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN }
    : {}),
};
const t = Date.now();
const res = await fetch(`${BASE}/api/actions/shader.render?deck=${encodeURIComponent(DECK)}`, {
  method: 'POST',
  headers,
  redirect: 'manual',
  body: JSON.stringify({
    materialId: 'paper:liquid-metal',
    preset: 'diamond',
    size: [3200, 1800],
    timeMs: 5500,
  }),
  signal: AbortSignal.timeout(120_000),
});
const ms = Date.now() - t;
const type = res.headers.get('content-type') ?? '';
const buf = Buffer.from(await res.arrayBuffer());
const out = { base: BASE, deck: DECK, status: res.status, type, ms, bytes: buf.length };
if (/image\/png/.test(type)) {
  out.png = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
} else {
  const text = buf.toString('utf8');
  try {
    const j = JSON.parse(text);
    if (typeof j.png === 'string') {
      const p = Buffer.from(j.png, 'base64');
      out.png = { bytes: p.length, width: p.readUInt32BE(16), height: p.readUInt32BE(20) };
      out.answer = { ...j, png: `<${p.length} bytes>` };
    } else out.body = j;
  } catch {
    out.body = text.slice(0, 4000);
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify({ status: out.status, type, ms, bytes: buf.length, png: out.png ?? null }),
);
if (out.body)
  console.log(
    typeof out.body === 'string'
      ? out.body
      : (out.body.error?.message ?? JSON.stringify(out.body)).slice(0, 6000),
  );
