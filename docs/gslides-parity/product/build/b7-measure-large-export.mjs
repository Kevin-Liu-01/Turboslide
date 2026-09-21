// B7 product round: the large deck export measurement on production (PRODUCT.md section 2 rank 21,
// 8.2 the measurement rows). Copies the GT brand deck over the agent surface with the bearer,
// runs the PDF and the Editable text PowerPoint through POST /api/export/<id>?sync=1&format=json,
// records the seconds per slide, then trashes and deletes the copy forever. Never prints the token.
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://turboslide.vercel.app';
const OUT = process.argv[3] ?? 'measure.json';
const hosts = JSON.parse(readFileSync(`${process.env.HOME}/.config/turboslide/hosts.json`, 'utf8'));
const entry = hosts.hosts[BASE];
const token = entry?.token ?? entry?.bearer;
if (!token) throw new Error(`no bearer for ${BASE} in hosts.json`);
const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-turboslide-author': 'agent:b7-measure',
  'user-agent': 'turboslide/b7-measure',
};
const stamp = Date.now().toString(36);
const id = `b7-measure-${stamp}`;
const log = [];
const note = (line) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
};
const post = async (path, body, timeoutMs = 300_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      status: res.status,
      ms: Date.now() - t,
      json,
      text: json === null ? text.slice(0, 300) : null,
      headers: Object.fromEntries(res.headers),
    };
  } catch (error) {
    return {
      status: 0,
      ms: Date.now() - t,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
};
const result = {
  base: BASE,
  id,
  startedAt: new Date().toISOString(),
  copy: null,
  pdf: null,
  pptx: null,
  trash: null,
  remove: null,
  gone: null,
};
const save = () => writeFileSync(OUT, JSON.stringify({ ...result, log }, null, 2));

note(`copy gt-brand -> ${id}`);
const info = await post(`/api/actions/deck.info?deck=gt-brand`, {});
const baseRevision = info.json?.revision ?? info.json?.deck?.revision ?? null;
note(`deck.info ${info.status} revision ${baseRevision}`);
result.copy = await post(`/api/actions/deck.copy?deck=gt-brand`, {
  id: 'gt-brand',
  name: `B7 export measurement ${stamp}`,
  newId: id,
  baseRevision,
});
note(`copy ${result.copy.status} in ${result.copy.ms} ms ${result.copy.error ?? ''}`);
save();
if (result.copy.status !== 200) {
  note('the copy failed; nothing to export or clean');
  process.exit(1);
}
const slides = result.copy.json?.slides ?? result.copy.json?.output?.slides ?? null;
note(`copy answered slides=${JSON.stringify(slides)}`);

for (const [key, body] of [
  ['pdf', { format: 'pdf' }],
  ['pptx', { format: 'pptx', mode: 'native', embedFonts: true }],
]) {
  note(`export ${key} start`);
  const r = await post(`/api/export/${id}?sync=1&format=json`, body, 620_000);
  const pages = r.json?.summary?.pages ?? null;
  const ms = r.json?.summary?.ms ?? null;
  result[key] = {
    status: r.status,
    wallMs: r.ms,
    error: r.error ?? null,
    pages,
    exportMs: ms,
    files: r.json?.files?.map((f) => ({ name: f.name, bytes: f.bytes, stored: f.stored })) ?? null,
    secondsPerSlide: pages ? Math.round(r.ms / pages / 10) / 100 : null,
    exec: r.headers?.['x-turboslide-exec'] ?? null,
    worker: r.headers?.['x-turboslide-worker'] ?? null,
    text: r.text ?? null,
    logTail: r.json?.log?.slice(-6) ?? null,
  };
  note(
    `export ${key} ${r.status} in ${r.ms} ms, pages ${pages}, ${result[key].secondsPerSlide} s per slide ${r.error ?? r.text ?? ''}`,
  );
  save();
}

note('trash and delete forever');
result.trash = await post(`/api/actions/deck.trash?deck=${id}`, { id });
note(`trash ${result.trash.status} ${result.trash.text ?? ''}`);
result.remove = await post(`/api/actions/deck.remove?deck=${id}`, { id, confirm: true });
note(`remove ${result.remove.status} ${result.remove.text ?? ''}`);
const gone = await fetch(`${BASE}/edit/${id}`, { redirect: 'manual' });
result.gone = gone.status;
note(`GET /edit/${id} -> ${gone.status}`);
result.finishedAt = new Date().toISOString();
save();
