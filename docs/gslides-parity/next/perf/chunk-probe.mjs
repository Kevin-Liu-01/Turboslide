// Downloads production's largest chunks and reports what the entry chunk holds (section 4 item 6 of
// audit-performance.md). Read only. node chunk-probe.mjs
import { brotliDecompressSync } from 'node:zlib';

const BASE = 'https://www.turboslide.com/assets/';
const CHUNKS = ['index-BFThf855.js', 'Slideshow-gZjcclX8.js', 'EditorRoot-uqwe7lvt.js', 'SlideList-BenQPH8w.js', 'Frame-gfe57f6a.js'];
for (const name of CHUNKS) {
  const r = await fetch(BASE + name, { headers: { 'accept-encoding': 'br' } });
  const raw = Buffer.from(await r.arrayBuffer());
  let s;
  try { s = brotliDecompressSync(raw).toString(); } catch { s = raw.toString(); }
  const at = (needle) => s.indexOf(needle);
  const describes = [...s.matchAll(/\.describe\(/g)].map((m) => m.index);
  console.log(JSON.stringify({
    name,
    status: r.status,
    cache: r.headers.get('x-vercel-cache'),
    bodyBytes: raw.length,
    decoded: Buffer.byteLength(s),
    zodDescribeCalls: describes.length,
    describeSpan: describes.length ? [describes[0], describes.at(-1)] : null,
    shapeTableAt: at('{"rect":{"avLst"'),
    actionTableDoc: at('Exports the deck to PPTX'),
    jsonSchemaOpenapi: at('openapi-3.0'),
    reactDom: at('rendererPackageName:`react-dom`'),
  }));
}
