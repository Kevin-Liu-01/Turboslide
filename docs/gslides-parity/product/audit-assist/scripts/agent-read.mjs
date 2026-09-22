// Reads the hosted agent surface of production the way an assist server would: the manifest with
// the bearer, the public guides without it, and the counts per transport. Writes
// agent-surface.json to the evidence folder. The token is read from ~/.config/turboslide/hosts.json
// and never written or printed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const BASE = 'https://turboslide.vercel.app';
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/product/audit-assist';
mkdirSync(OUT, { recursive: true });
const hosts = JSON.parse(
  readFileSync(path.join(homedir(), '.config/turboslide/hosts.json'), 'utf8'),
).hosts;
const token = hosts[BASE].token;
const auth = { authorization: `Bearer ${token}` };

const out = { base: BASE, at: new Date().toISOString(), reads: [] };
const rec = (name, status, note) => {
  out.reads.push({ name, status, note });
  console.log(`${String(status).padEnd(4)} ${name}${note ? `  ${note}` : ''}`);
};

const manifestRes = await fetch(`${BASE}/api/agent`, { headers: auth });
const manifest = await manifestRes.json();
rec('GET /api/agent (bearer)', manifestRes.status, `keys ${Object.keys(manifest).length}`);
const noAuth = await fetch(`${BASE}/api/agent`);
rec('GET /api/agent (no bearer)', noAuth.status);
for (const p of ['/llms.txt', '/llms-full.txt', '/openapi.json']) {
  const r = await fetch(`${BASE}${p}`);
  const t = await r.text();
  rec(`GET ${p} (no bearer)`, r.status, `${t.length} chars`);
}
const contract = await fetch(`${BASE}/api/actions/text.replaceAll`, { headers: auth });
rec('GET /api/actions/text.replaceAll (bearer)', contract.status);
const mcpNoAuth = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
rec('POST /mcp (no bearer)', mcpNoAuth.status);

// counts from the manifest
const actions = manifest.actions ?? {};
const list = Array.isArray(actions) ? actions : Object.values(actions);
const byTransport = { cli: 0, mcp: 0, http: 0, window: 0 };
let mutating = 0;
for (const a of list) {
  for (const t of a.transports ?? []) if (t in byTransport) byTransport[t] += 1;
  if (a.mutates) mutating += 1;
}
out.manifest = {
  actionCount: manifest.actionCount,
  listed: list.length,
  byTransport,
  mutating,
  implemented: (manifest.implemented ?? []).length,
  notImplemented: manifest.notImplemented ?? [],
  groups: Object.fromEntries(
    Object.entries(manifest.actionsByGroup ?? {}).map(([g, ids]) => [g, ids.length]),
  ),
  rules: manifest.rules,
  transports: manifest.transports,
  auth: manifest.auth,
  http: manifest.http,
  skills: (manifest.skills ?? []).map((s) => s.name),
  resources: manifest.resources,
  instance: manifest.instance,
  version: manifest.version,
  window: manifest.window ? Object.keys(manifest.window) : null,
  sessions: manifest.sessions,
};
// any AI or assistant words anywhere in the manifest
const text = JSON.stringify(manifest).toLowerCase();
out.words = Object.fromEntries(
  ['assist', 'gemini', 'model', 'llm', 'anthropic', 'openai', 'prompt', 'summar', 'translat'].map(
    (w) => [w, (text.match(new RegExp(w, 'g')) ?? []).length],
  ),
);
console.log(JSON.stringify({ ...out.manifest, words: out.words }, null, 1).slice(0, 3000));
writeFileSync(path.join(OUT, 'agent-surface.json'), JSON.stringify(out, null, 2));
console.log(`wrote ${path.join(OUT, 'agent-surface.json')}`);
