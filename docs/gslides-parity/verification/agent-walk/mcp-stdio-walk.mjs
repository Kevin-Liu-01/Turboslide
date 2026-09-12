// The verifier's MCP stdio walk: every new action of the Google Slides parity round through the
// tools of `turboslide mcp` on the temp deck the CLI walk made (apps/cli/e2e/mcp-stdio.mjs is the
// model). Prints one JSON line per step; exit 1 when a step that should work fails.
import { Client } from '/Users/kevinliu/repos/Turboslide/apps/cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '/Users/kevinliu/repos/Turboslide/apps/cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/kevinliu/repos/Turboslide';
const W = process.argv[2];
const DECK_DIR = join(W, 'decks', 'agent-walk');
const GT_SLIDE = JSON.parse(readFileSync(join(ROOT, 'decks/gt-brand/deck.json'), 'utf8'))
  .sections[0].slideIds[2];
const stderr = [];
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    join(ROOT, 'apps/cli/bin/turboslide.mjs'),
    'mcp',
    '--deck',
    DECK_DIR,
    '--derived',
    join(W, 'derived'),
    '--author',
    'agent:verifier-mcp',
  ],
  cwd: ROOT,
  stderr: 'pipe',
});
transport.stderr?.on('data', (c) => stderr.push(String(c)));
const client = new Client({ name: 'verifier-walk', version: '0.0.0' });
const out = (o) => console.log(JSON.stringify(o));
let failures = 0;
const textOf = (r) => r.content?.find((c) => c.type === 'text')?.text ?? '';
async function call(name, args, { expectError = false } = {}) {
  const t = Date.now();
  try {
    const r = await client.callTool({ name, arguments: args });
    const ok = expectError ? Boolean(r.isError) : !r.isError;
    if (!ok) failures += 1;
    const summary = r.structuredContent ?? textOf(r).slice(0, 300);
    out({
      tool: name,
      ok,
      ms: Date.now() - t,
      isError: Boolean(r.isError),
      result: typeof summary === 'string' ? summary : JSON.stringify(summary).slice(0, 300),
    });
    return r.structuredContent ?? null;
  } catch (e) {
    if (!expectError) failures += 1;
    out({ tool: name, ok: expectError, ms: Date.now() - t, thrown: String(e).slice(0, 300) });
    return null;
  }
}
await client.connect(transport);
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
const wanted = [
  'deck_new_slide',
  'deck_duplicate_slide',
  'deck_skip_slide',
  'deck_apply_layout',
  'deck_import_slides',
  'deck_duplicate_block',
  'deck_replace_text',
  'deck_list',
  'deck_copy',
  'deck_trash',
  'deck_restore',
  'deck_export_text',
  'deck_set_zoom',
  'deck_set',
];
out({
  step: 'tools/list',
  count: tools.length,
  present: wanted.filter((n) => names.includes(n)),
  absent: wanted.filter((n) => !names.includes(n)),
});
const rev = async () =>
  (await client.callTool({ name: 'deck_get_info', arguments: {} })).structuredContent.revision;
const info = await call('deck_get_info', {});
const created = await call('deck_new_slide', {
  layout: 'split',
  after: 'title',
  baseRevision: info.revision,
});
const NEW = created?.slide?.id;
const dup = await call('deck_duplicate_slide', { slideIds: [NEW], baseRevision: await rev() });
const DUP = dup?.slides?.[0]?.id;
await call('deck_skip_slide', { slideIds: [DUP], skip: true, baseRevision: await rev() });
await call('deck_apply_layout', {
  slideIds: [NEW],
  layout: 'title-only',
  baseRevision: await rev(),
});
await call('deck_import_slides', {
  sourceDeckId: 'gt-brand',
  slideIds: [GT_SLIDE],
  after: 'title',
  baseRevision: await rev(),
});
const slideNow = (await client.callTool({ name: 'deck_get_slide', arguments: { slideId: NEW } }))
  .structuredContent?.slide;
const firstBlock = Object.values(slideNow?.slots ?? {}).flat()[0]?.id;
await call('deck_duplicate_block', {
  slideId: NEW,
  blockIds: [firstBlock],
  baseRevision: await rev(),
});
await call('deck_replace_text', { find: 'Globex', replace: 'Initech', baseRevision: await rev() });
await call('deck_export_text', { slideIds: 'all', includeSkipped: true });
await call('deck_list', {});
const copy = await call('deck_copy', {
  id: 'agent-walk',
  name: 'MCP copy',
  baseRevision: await rev(),
});
const COPY = copy?.deckId ?? 'mcp-copy';
await call('deck_trash', { id: COPY, baseRevision: copy?.revision ?? 0 });
await call('deck_list', { includeTrashed: true });
await call('deck_restore', { id: COPY, baseRevision: copy?.revision ?? 0 });
if (names.includes('deck_set'))
  await call('deck_set', {
    path: '/defaults/appearance',
    value: 'light',
    baseRevision: await rev(),
  });
if (names.includes('deck_set_zoom')) await call('deck_set_zoom', { zoom: 'fit' });
await call('deck_list_slides', {});
await client.close();
out({ step: 'done', failures, copyId: COPY, stderrTail: stderr.join('').slice(-400) });
process.exit(failures > 0 ? 1 : 0);
