// Reads the agent surface of a deployment with the bearer from TURBOSLIDE_TOKEN (the wrapper):
// the manifest, the OpenAPI document, llms.txt, and the MCP endpoint's initialize, tools/list,
// prompts/list and resources/list. Writes the facts (never the token) to --out.
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', 'https://www.turboslide.com').replace(/\/$/, '');
const OUT = arg('out', 'agent-surface.json');
const TOKEN = process.env.TURBOSLIDE_TOKEN ?? null;
const auth = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
const facts = { base: BASE, at: new Date().toISOString(), bearer: Boolean(TOKEN) };

const timed = async (label, fn) => {
  const t0 = Date.now();
  try {
    const v = await fn();
    facts[label] = { ...v, ms: Date.now() - t0 };
  } catch (e) {
    facts[label] = { error: String(e).slice(0, 200), ms: Date.now() - t0 };
  }
  console.log(label, JSON.stringify(facts[label]).slice(0, 400));
};

await timed('manifestNoBearer', async () => {
  const r = await fetch(`${BASE}/api/agent`);
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});
await timed('manifest', async () => {
  const r = await fetch(`${BASE}/api/agent`, { headers: auth });
  const j = await r.json();
  const actions = j.actions ?? j.manifest?.actions ?? [];
  const list = Array.isArray(actions) ? actions : Object.values(actions);
  const implemented = j.implemented ?? j.instance?.implemented ?? null;
  return {
    status: r.status,
    keys: Object.keys(j).slice(0, 20),
    actionCount: list.length,
    implemented: Array.isArray(implemented) ? implemented.length : implemented,
    notImplemented: Array.isArray(j.notImplemented) ? j.notImplemented.slice(0, 20) : (j.instance?.notImplemented ?? null),
    instance: j.instance ? Object.fromEntries(Object.entries(j.instance).filter(([k]) => !/token|secret/i.test(k)).map(([k, v]) => [k, typeof v === 'object' && v !== null ? (Array.isArray(v) ? `${v.length} items` : Object.keys(v).slice(0, 10)) : v])) : null,
    assistActions: list.filter((a) => /^assist\.|^deck\.tailor|^template\.|^notification\./.test(a.id ?? a)).map((a) => a.id ?? a),
  };
});
await timed('openapi', async () => {
  const r = await fetch(`${BASE}/openapi.json`);
  const j = await r.json();
  return { status: r.status, paths: Object.keys(j.paths ?? {}).length, title: j.info?.title, version: j.info?.version };
});
await timed('llms', async () => {
  const r = await fetch(`${BASE}/llms.txt`);
  const t = await r.text();
  return { status: r.status, bytes: t.length, head: t.split('\n').slice(0, 6).join(' / ').slice(0, 300) };
});
await timed('mcpNoBearer', async () => {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'polish-audit', version: '0' } } }),
  });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});

const rpc = async (session, id, method, params) => {
  const r = await fetch(`${BASE}/mcp?deck=gt-brand`, {
    method: 'POST',
    headers: {
      ...auth,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session } : {}),
      'x-turboslide-author': 'agent:polish-audit-read',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const sid = r.headers.get('mcp-session-id');
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    if (line) json = JSON.parse(line.slice(5));
  }
  return { status: r.status, sid, json, raw: text.slice(0, 200) };
};
let session = null;
await timed('mcpInitialize', async () => {
  const r = await rpc(null, 1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'polish-audit', version: '0' } });
  session = r.sid;
  return { status: r.status, session: Boolean(r.sid), server: r.json?.result?.serverInfo ?? null, instructions: (r.json?.result?.instructions ?? '').slice(0, 300), capabilities: Object.keys(r.json?.result?.capabilities ?? {}) };
});
if (session) {
  await fetch(`${BASE}/mcp?deck=gt-brand`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': session }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }).catch(() => undefined);
  await timed('mcpTools', async () => {
    const r = await rpc(session, 2, 'tools/list', {});
    const tools = r.json?.result?.tools ?? [];
    const names = tools.map((t) => t.name);
    return { status: r.status, count: names.length, names: names.slice(0, 400), assist: names.filter((n) => /assist|tailor|template|notification|logo/.test(n)), destructive: tools.filter((t) => t.annotations?.destructiveHint).length, sample: tools.slice(0, 2).map((t) => ({ name: t.name, title: t.title, description: (t.description ?? '').slice(0, 160) })) };
  });
  await timed('mcpPrompts', async () => {
    const r = await rpc(session, 3, 'prompts/list', {});
    return { status: r.status, prompts: (r.json?.result?.prompts ?? []).map((p) => p.name) };
  });
  await timed('mcpResources', async () => {
    const r = await rpc(session, 4, 'resources/list', {});
    const t = await rpc(session, 5, 'resources/templates/list', {});
    return { status: r.status, resources: (r.json?.result?.resources ?? []).map((p) => p.uri), templates: (t.json?.result?.resourceTemplates ?? []).map((p) => p.uriTemplate) };
  });
  await timed('mcpDeckInfo', async () => {
    const r = await rpc(session, 6, 'tools/call', { name: 'deck_info', arguments: {} });
    const c = r.json?.result;
    return { status: r.status, isError: c?.isError ?? null, text: (c?.content?.[0]?.text ?? '').slice(0, 300), structured: c?.structuredContent ? Object.keys(c.structuredContent) : null };
  });
  await timed('mcpAssistPropose', async () => {
    const r = await rpc(session, 7, 'tools/call', { name: 'deck_assist_propose', arguments: { intent: 'shorter', prompt: '', slideIds: ['content-rule'], baseRevision: 0 } });
    const c = r.json?.result ?? r.json?.error;
    return { status: r.status, isError: c?.isError ?? null, text: (c?.content?.[0]?.text ?? c?.message ?? '').slice(0, 300) };
  });
  await fetch(`${BASE}/mcp`, { method: 'DELETE', headers: { ...auth, 'mcp-session-id': session } }).catch(() => undefined);
}
writeFileSync(OUT, JSON.stringify(facts, null, 2));
console.log('written', OUT);
