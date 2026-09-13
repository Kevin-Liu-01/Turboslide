#!/usr/bin/env node
// The verifier's local agent walk (docs/gslides-parity/MILESTONES-2.md "Verifier" item 3 and
// B1's acceptance list; SPEC-2 section 3): every round two action through `turboslide <command>
// --json` on a temp copy of decks/fixture/gslides with `turboslide validate` after each write,
// then the same actions as MCP tools over a stdio server on a second copy.
//
//   node docs/gslides-parity/verification-2/agent-walk.mjs [--out <json>]
//
// Every canvas write here opens a headless sheet page (SPEC-2 1.3), so the run takes a few
// minutes; the per command time is recorded as the measured cost of a canvas write on the CLI
// transport. Nothing under decks/ is written: the copies live in a temp directory. Exit 1 on any
// failed step.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/* the MCP SDK is a dependency of apps/cli, not of the repository root: resolve it from there */
const SDK = join(ROOT, 'apps/cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client');
const { Client } = await import(join(SDK, 'index.js'));
const { StdioClientTransport } = await import(join(SDK, 'stdio.js'));
const argv = process.argv.slice(2);
const OUT = join(
  ROOT,
  argv.includes('--out')
    ? argv[argv.indexOf('--out') + 1]
    : 'docs/gslides-parity/verification-2/agent-walk.json',
);
const CLI = join(ROOT, 'apps/cli/bin/turboslide.mjs');
const FIXTURE = join(ROOT, 'decks', 'fixture', 'gslides');
const log = (line) => process.stderr.write(`${line}\n`);

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-verifier-agent-'));
const cliDeck = join(tmp, 'decks', 'gslides');
const mcpDeck = join(tmp, 'decks', 'gslides-mcp');
const derived = join(tmp, 'derived');
for (const dir of [cliDeck, mcpDeck]) {
  mkdirSync(dir, { recursive: true });
  cpSync(join(FIXTURE, 'deck.json'), join(dir, 'deck.json'));
  cpSync(join(FIXTURE, 'slides'), join(dir, 'slides'), { recursive: true });
  cpSync(join(FIXTURE, 'assets'), join(dir, 'assets'), { recursive: true });
}
writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'packages: []\n');
writeFileSync(
  join(tmp, 'text.json'),
  JSON.stringify({ id: 'note', type: 'text', text: 'A text box placed by the CLI' }),
);
writeFileSync(
  join(tmp, 'data.json'),
  JSON.stringify({
    categories: ['North', 'South'],
    series: [{ name: 'Seats', values: [12, 7] }],
  }),
);

const steps = [];
const slide = (dir, id) => JSON.parse(readFileSync(join(dir, 'slides', `${id}.json`), 'utf8'));
const objects = (dir, id) => Object.values(slide(dir, id).slots ?? {}).flat();
const block = (dir, s, b) => objects(dir, s).find((x) => x.id === b);
const manifest = (dir) => JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8'));

function run(args, { deck = cliDeck } = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [CLI, ...args, '--deck', deck], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, USER: 'verifier' },
  });
  let json = null;
  if (args.includes('--json') && r.stdout.trim()) {
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = null;
    }
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json, ms: Date.now() - t0 };
}

/** One CLI step: the command, its exit, the deck validating after, and a verify over the files. */
function step(name, args, verify) {
  const before = manifest(cliDeck).revision;
  const r = run(args);
  let evidence = `exit ${r.code} in ${r.ms} ms; revision ${before} -> ${manifest(cliDeck).revision}`;
  let ok = r.code === 0;
  if (ok && verify) {
    try {
      const v = verify(r);
      ok = v.ok;
      evidence += `; ${v.evidence}`;
    } catch (e) {
      ok = false;
      evidence += `; verify threw ${String(e).slice(0, 160)}`;
    }
  }
  if (!ok && r.stderr)
    evidence += `; stderr ${r.stderr.trim().split('\n').slice(-2).join(' | ').slice(0, 240)}`;
  const validated = run(['validate', cliDeck]);
  if (validated.code !== 0) {
    ok = false;
    evidence += `; validate exit ${validated.code}: ${validated.stderr.slice(0, 160)}`;
  }
  steps.push({
    transport: 'cli',
    name,
    command: `turboslide ${args.join(' ')}`,
    ok,
    ms: r.ms,
    evidence,
  });
  log(`${ok ? 'ok  ' : 'FAIL'} cli ${name}: ${evidence}`);
  return r;
}

const near = (a, b, tol = 1.01) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------------------------
// A. The CLI on the fixture copy

log(`agent walk: temp ${tmp}`);
const committedTitle = Object.fromEntries(
  objects(FIXTURE, 'canvas-title')
    .filter((b) => ['mark', 'heading', 'lead'].includes(b.id))
    .map((b) => [b.id, b.pos]),
);
step('slide to-canvas title', ['slide', 'to-canvas', 'title', '--json'], (r) => {
  const row = r.json.slides.find((s) => s.slideId === 'title');
  const got = Object.fromEntries(row.objects.map((o) => [o.id, o.pos]));
  const s = slide(cliDeck, 'title');
  const within = ['mark', 'heading', 'lead'].every((id) =>
    ['x', 'y', 'w', 'h'].every((k) => near(got[id]?.[k], committedTitle[id]?.[k])),
  );
  const exact = ['mark', 'heading', 'lead'].every(
    (id) => JSON.stringify(got[id]) === JSON.stringify(committedTitle[id]),
  );
  return {
    ok:
      row.converted &&
      s.kind === 'content' &&
      s.layout.type === 'freeform' &&
      s.grammar?.kind === 'title' &&
      within,
    evidence: `converted ${row.converted}; template ${s.template}; grammar ${s.grammar?.kind}; pos within 1 px of the committed canvas-title ${within}, exact ${exact} (the fixture keeps the integer pos the CLI wrote before R2); heading ${JSON.stringify(got.heading)}`,
  };
});
step('slide measure styles (a read)', ['slide', 'measure', 'styles', '--json'], (r) => {
  const m = r.json.styles ?? r.json[Object.keys(r.json)[0]];
  return {
    ok: m !== undefined && m.canvas !== undefined && m.fit !== undefined,
    evidence: `boxes for ${Object.keys(m?.canvas?.blocks ?? {}).join(', ')}; fit for ${Object.keys(m?.fit ?? {}).length} blocks; revision unchanged ${manifest(cliDeck).revision === 2}`,
  };
});
step(
  'block insert --pos',
  [
    'block',
    'insert',
    'title',
    '--slot',
    'main',
    '--pos',
    '200,200,480,64',
    '--file',
    join(tmp, 'text.json'),
    '--json',
  ],
  () => {
    const b = block(cliDeck, 'title', 'note');
    const zs = objects(cliDeck, 'title').map((x) => x.pos?.z ?? 0);
    return {
      ok: b?.pos?.x === 200 && b.pos.w === 480 && b.pos.z === Math.max(...zs),
      evidence: `note at ${JSON.stringify(b?.pos)} (z one above the highest)`,
    };
  },
);
step(
  'block set /pos on a grammar slide',
  ['block', 'set', 'styles#h', '/pos', '{"x":137,"y":129,"w":600,"h":80}', '--json'],
  (r) => {
    const s = slide(cliDeck, 'styles');
    return {
      ok:
        s.layout.type === 'freeform' &&
        r.json.revision === manifest(cliDeck).revision &&
        objects(cliDeck, 'styles').every((b) => b.pos),
      evidence: `styles converted in one revision (${r.json.revision}); h at ${JSON.stringify(block(cliDeck, 'styles', 'h').pos)}; every object positioned`,
    };
  },
);
step('block rotate --by 90', ['block', 'rotate', 'rotated#tilted', '--by', '90', '--json'], () => ({
  ok: block(cliDeck, 'rotated', 'tilted').pos.rotate === 127,
  evidence: `tilted rotate 37 -> ${block(cliDeck, 'rotated', 'tilted').pos.rotate}`,
}));
step('block flip --axis h', ['block', 'flip', 'rotated#arrow', '--axis', 'h', '--json'], () => ({
  ok:
    (block(cliDeck, 'rotated', 'arrow').pos.flip ?? '').includes('h') !==
    (slide(FIXTURE, 'rotated').slots.main.find((b) => b.id === 'arrow').pos.flip ?? '').includes(
      'h',
    ),
  evidence: `arrow flip ${slide(FIXTURE, 'rotated').slots.main.find((b) => b.id === 'arrow').pos.flip ?? 'none'} -> ${block(cliDeck, 'rotated', 'arrow').pos.flip ?? 'none'}`,
}));
step(
  'block group',
  ['block', 'group', 'shapes', '--blocks', 'hex,right', '--as', 'pair', '--json'],
  () => ({
    ok:
      block(cliDeck, 'shapes', 'hex').pos.group === 'pair' &&
      block(cliDeck, 'shapes', 'right').pos.group === 'pair',
    evidence: `hex and right carry group ${block(cliDeck, 'shapes', 'hex').pos.group}`,
  }),
);
step('block ungroup', ['block', 'ungroup', 'shapes', '--group', 'pair', '--json'], () => ({
  ok: !block(cliDeck, 'shapes', 'hex').pos.group && !block(cliDeck, 'shapes', 'right').pos.group,
  evidence: `groups left: ${objects(cliDeck, 'shapes').filter((b) => b.pos.group === 'pair').length}`,
}));
step(
  'block regroup',
  ['block', 'regroup', 'shapes', '--blocks', 'hex,right', '--as', 'pair', '--json'],
  () => ({
    ok: block(cliDeck, 'shapes', 'hex').pos.group === 'pair',
    evidence: `hex group ${block(cliDeck, 'shapes', 'hex').pos.group}`,
  }),
);
step(
  'block order --move back',
  ['block', 'order', 'rotated#photo', '--move', 'back', '--json'],
  () => {
    const zs = objects(cliDeck, 'rotated').map((b) => b.pos.z);
    return {
      ok: block(cliDeck, 'rotated', 'photo').pos.z === Math.min(...zs),
      evidence: `photo z ${block(cliDeck, 'rotated', 'photo').pos.z} (lowest ${Math.min(...zs)})`,
    };
  },
);
step(
  'deck guides --add-vertical 400',
  ['deck', 'guides', '--add-vertical', '400', '--json'],
  () => ({
    ok: JSON.stringify(manifest(cliDeck).guides.x) === JSON.stringify([400, 800]),
    evidence: `guides ${JSON.stringify(manifest(cliDeck).guides)}`,
  }),
);
step('deck guides --clear', ['deck', 'guides', '--clear', '--json'], () => ({
  ok:
    !manifest(cliDeck).guides ||
    ((manifest(cliDeck).guides.x?.length ?? 0) === 0 &&
      (manifest(cliDeck).guides.y?.length ?? 0) === 0),
  evidence: `guides ${JSON.stringify(manifest(cliDeck).guides ?? null)}`,
}));
step(
  'text style --italic --color red',
  ['text', 'style', 'styles#p1', '/text', '--range', '0:4', '--italic', '--color', 'red', '--json'],
  () => ({
    ok:
      /\]\{[^}]*\bi\b[^}]*\}/.test(block(cliDeck, 'styles', 'p1').text) &&
      /c:red/.test(block(cliDeck, 'styles', 'p1').text),
    evidence: `text "${String(block(cliDeck, 'styles', 'p1').text).slice(0, 60)}"`,
  }),
);
step(
  'text list --marker bullet --level 4',
  [
    'text',
    'list',
    'bullets#bullets',
    '--marker',
    'bullet',
    '--items',
    '0',
    '--level',
    '4',
    '--json',
  ],
  () => ({
    ok:
      block(cliDeck, 'bullets', 'bullets').marker === 'bullet' &&
      block(cliDeck, 'bullets', 'bullets').items[0].level === 4,
    evidence: `marker ${block(cliDeck, 'bullets', 'bullets').marker}; item 0 level ${block(cliDeck, 'bullets', 'bullets').items[0].level}`,
  }),
);
step(
  'text spacing --line 1.5',
  ['text', 'spacing', 'styles#p1', '--line', '1.5', '--json'],
  () => ({
    ok:
      block(cliDeck, 'styles', 'p1').typography?.leading === 1.5 ||
      block(cliDeck, 'styles', 'p1').typography?.lineSpacing === 1.5 ||
      JSON.stringify(block(cliDeck, 'styles', 'p1').typography).includes('1.5'),
    evidence: `typography ${JSON.stringify(block(cliDeck, 'styles', 'p1').typography)}`,
  }),
);
step('text columns 2', ['text', 'columns', 'styles#p1', '2', '--json'], () => ({
  ok: block(cliDeck, 'styles', 'p1').typography?.columns === 2,
  evidence: `columns ${block(cliDeck, 'styles', 'p1').typography?.columns}`,
}));
step('text indent --in', ['text', 'indent', 'styles#p1', '--in', '--json'], () => ({
  ok: (block(cliDeck, 'styles', 'p1').typography?.indent ?? 0) > 0,
  evidence: `indent ${block(cliDeck, 'styles', 'p1').typography?.indent}`,
}));
step(
  'text case upper',
  ['text', 'case', 'styles#p1', '/text', '--range', '0:5', 'upper', '--json'],
  () => ({
    ok: /^[^a-z]{1,}/.test(String(block(cliDeck, 'styles', 'p1').text).replace(/^\[/, '')),
    evidence: `text "${String(block(cliDeck, 'styles', 'p1').text).slice(0, 40)}"`,
  }),
);
step(
  'text insert --at 2 "→"',
  ['text', 'insert', 'styles#p1', '/text', '--at', '2', '→', '--json'],
  () => ({
    ok: String(block(cliDeck, 'styles', 'p1').text).includes('→'),
    evidence: `text "${String(block(cliDeck, 'styles', 'p1').text).slice(0, 40)}"`,
  }),
);
step(
  'chart set-data',
  ['chart', 'set-data', 'chart-bar#chart', '--file', join(tmp, 'data.json'), '--json'],
  () => ({
    ok:
      JSON.stringify(block(cliDeck, 'chart-bar', 'chart').categories) ===
      JSON.stringify(['North', 'South']),
    evidence: `categories ${JSON.stringify(block(cliDeck, 'chart-bar', 'chart').categories)}; series ${block(cliDeck, 'chart-bar', 'chart').series.length}`,
  }),
);
step('chart set-kind pie', ['chart', 'set-kind', 'chart-bar#chart', 'pie', '--json'], () => ({
  ok: block(cliDeck, 'chart-bar', 'chart').kind === 'pie',
  evidence: `kind ${block(cliDeck, 'chart-bar', 'chart').kind}`,
}));
step(
  'table merge',
  ['table', 'merge', 'table#table', '--from', '1,1', '--to', '2,2', '--json'],
  () => ({
    ok: (block(cliDeck, 'table', 'table').spans ?? []).some((s) => s.row === 1 && s.column === 1),
    evidence: `spans ${JSON.stringify(block(cliDeck, 'table', 'table').spans)}`,
  }),
);
step('table unmerge', ['table', 'unmerge', 'table#table', '--at', '1,1', '--json'], () => ({
  ok: (block(cliDeck, 'table', 'table').spans ?? []).length === 0,
  evidence: `spans ${JSON.stringify(block(cliDeck, 'table', 'table').spans ?? [])}`,
}));
step(
  'table insert-rows --below --count 2',
  ['table', 'insert-rows', 'table#table', '--at', '1', '--count', '2', '--below', '--json'],
  () => ({
    ok: block(cliDeck, 'table', 'table').rows.length === 6,
    evidence: `rows ${block(cliDeck, 'table', 'table').rows.length}`,
  }),
);
step(
  'table delete-columns',
  ['table', 'delete-columns', 'table#table', '--from', '3', '--to', '3', '--json'],
  () => ({
    ok: block(cliDeck, 'table', 'table').columns.length === 3,
    evidence: `columns ${block(cliDeck, 'table', 'table').columns.length}`,
  }),
);
/* without --total the heights clear, a no-op on rows that carry none: the total makes it a write */
step(
  'table distribute rows --total 320',
  ['table', 'distribute', 'table#table', 'rows', '--total', '320', '--json'],
  () => ({
    ok: block(cliDeck, 'table', 'table').rows.every(
      (r) => r.height !== undefined && r.height === block(cliDeck, 'table', 'table').rows[0].height,
    ),
    evidence: `row heights ${JSON.stringify(block(cliDeck, 'table', 'table').rows.map((r) => r.height ?? null))}`,
  }),
);
step(
  'table cell-style --border-weight 0',
  ['table', 'cell-style', 'table#table', '--at', '0,0', '--border-weight', '0', '--json'],
  () => ({
    ok: (block(cliDeck, 'table', 'table').cells ?? []).some(
      (c) => c.row === 0 && c.column === 0 && c.border?.weight === 0,
    ),
    evidence: `cells ${JSON.stringify(block(cliDeck, 'table', 'table').cells).slice(0, 120)}`,
  }),
);
step(
  'shape set --kind hexagon --dash dot',
  ['shape', 'set', 'shapes#hex', '--kind', 'hexagon', '--dash', 'dot', '--json'],
  () => ({
    ok:
      block(cliDeck, 'shapes', 'hex').shape === 'hexagon' &&
      block(cliDeck, 'shapes', 'hex').dash === 'dot',
    evidence: `shape ${block(cliDeck, 'shapes', 'hex').shape} dash ${block(cliDeck, 'shapes', 'hex').dash}`,
  }),
);
step(
  'line set --end fillArrow',
  ['line', 'set', 'lines#decorated', '--end', 'fillArrow', '--json'],
  () => ({
    ok: block(cliDeck, 'lines', 'decorated').lineEnd === 'fillArrow',
    evidence: `lineEnd ${block(cliDeck, 'lines', 'decorated').lineEnd}`,
  }),
);
const endBefore = block(cliDeck, 'lines', 'decorated').pos;
step(
  'line set --connect-end b:2',
  ['line', 'set', 'lines#decorated', '--connect-end', 'b:2', '--json'],
  () => ({
    ok:
      block(cliDeck, 'lines', 'decorated').connect?.end?.block === 'b' &&
      block(cliDeck, 'lines', 'decorated').connect.end.site === 2,
    evidence: `connect ${JSON.stringify(block(cliDeck, 'lines', 'decorated').connect)}; pos ${JSON.stringify(endBefore)} -> ${JSON.stringify(block(cliDeck, 'lines', 'decorated').pos)}`,
  }),
);
const attached = block(cliDeck, 'lines', 'decorated').pos;
step(
  'block set b /pos moves the attached connector',
  ['block', 'set', 'lines#b', '/pos', '{"x":760,"y":540,"w":240,"h":120,"z":3}', '--json'],
  () => {
    const after = block(cliDeck, 'lines', 'decorated').pos;
    const elbow = block(cliDeck, 'lines', 'elbow').pos;
    return {
      ok: JSON.stringify(after) !== JSON.stringify(attached),
      evidence: `decorated ${JSON.stringify(attached)} -> ${JSON.stringify(after)}; the fixture's elbow (attached to a and b) ${JSON.stringify(elbow)}`,
    };
  },
);
step(
  'block crop',
  [
    'block',
    'crop',
    'image-tools#trimmed',
    '--left',
    '0.1',
    '--right',
    '0',
    '--top',
    '0',
    '--bottom',
    '0',
    '--json',
  ],
  () => ({
    ok: block(cliDeck, 'image-tools', 'trimmed').trim?.left === 0.1,
    evidence: `trim ${JSON.stringify(block(cliDeck, 'image-tools', 'trimmed').trim)}`,
  }),
);
step('block mask ellipse', ['block', 'mask', 'image-tools#adjusted', 'ellipse', '--json'], () => ({
  ok: block(cliDeck, 'image-tools', 'adjusted').mask === 'ellipse',
  evidence: `mask ${block(cliDeck, 'image-tools', 'adjusted').mask}`,
}));
step(
  'block adjust --brightness 0.2',
  ['block', 'adjust', 'image-tools#masked', '--brightness', '0.2', '--json'],
  () => ({
    ok: block(cliDeck, 'image-tools', 'masked').adjust?.brightness === 0.2,
    evidence: `adjust ${JSON.stringify(block(cliDeck, 'image-tools', 'masked').adjust)}`,
  }),
);
step('block reset-image', ['block', 'reset-image', 'image-tools#trimmed', '--json'], () => ({
  ok:
    block(cliDeck, 'image-tools', 'trimmed').trim === undefined &&
    block(cliDeck, 'image-tools', 'trimmed').mask === undefined,
  evidence: `trim ${JSON.stringify(block(cliDeck, 'image-tools', 'trimmed').trim ?? null)} mask ${block(cliDeck, 'image-tools', 'trimmed').mask ?? 'none'}`,
}));
step('block alt', ['block', 'alt', 'shapes#hex', 'A hexagon', '--json'], () => ({
  ok: block(cliDeck, 'shapes', 'hex').alt === 'A hexagon',
  evidence: `alt "${block(cliDeck, 'shapes', 'hex').alt}"`,
}));
step('block shadow --on', ['block', 'shadow', 'shapes#hex', '--on', '--json'], () => ({
  ok: block(cliDeck, 'shapes', 'hex').shadow !== undefined,
  evidence: `shadow ${JSON.stringify(block(cliDeck, 'shapes', 'hex').shadow)}`,
}));
const sizeBefore = block(cliDeck, 'canvas-title', 'shrink').typography?.size ?? null;
step(
  'block autofit shrink --apply',
  ['block', 'autofit', 'canvas-title#shrink', 'shrink', '--apply', '--json'],
  () => {
    const b = block(cliDeck, 'canvas-title', 'shrink');
    return {
      ok: b.autofit === 'shrink' && (b.typography?.size ?? null) !== sizeBefore,
      evidence: `autofit ${b.autofit}; size ${sizeBefore} -> ${b.typography?.size ?? 'unset'} (the ladder stepped down in the same revision)`,
    };
  },
);
step(
  'block set /valign middle',
  ['block', 'set', 'canvas-title#padded', '/valign', 'middle', '--json'],
  () => ({
    ok: block(cliDeck, 'canvas-title', 'padded').valign === 'middle',
    evidence: `valign ${block(cliDeck, 'canvas-title', 'padded').valign}`,
  }),
);
step(
  'block set /padding',
  [
    'block',
    'set',
    'canvas-title#padded',
    '/padding',
    '{"top":8,"right":16,"bottom":8,"left":16}',
    '--json',
  ],
  () => ({
    ok: block(cliDeck, 'canvas-title', 'padded').padding?.left === 16,
    evidence: `padding ${JSON.stringify(block(cliDeck, 'canvas-title', 'padded').padding)}`,
  }),
);
step(
  'slide background --color plate',
  ['slide', 'background', 'styles', '--color', 'plate', '--json'],
  () => ({
    /* SPEC-2 2.6.1: the slide background is the fill { color } */
    ok: slide(cliDeck, 'styles').background?.color === 'plate',
    evidence: `background ${JSON.stringify(slide(cliDeck, 'styles').background)}`,
  }),
);
step('deck background --color plate', ['deck', 'background', '--color', 'plate', '--json'], () => ({
  /* SPEC-2 2.6.2: Add to theme writes Deck.defaults.background as { color } */
  ok: manifest(cliDeck).defaults?.background?.color === 'plate',
  evidence: `defaults.background ${JSON.stringify(manifest(cliDeck).defaults?.background)}`,
}));
step(
  'diagram insert on a grammar slide',
  ['diagram', 'insert', 'autofit', '--kind', 'process', '--count', '4', '--json'],
  () => {
    const s = slide(cliDeck, 'autofit');
    const groups = new Set(
      objects(cliDeck, 'autofit')
        .filter((b) => b.pos?.group)
        .map((b) => b.pos.group),
    );
    return {
      ok:
        s.layout.type === 'freeform' &&
        groups.size === 1 &&
        objects(cliDeck, 'autofit').length >= 9,
      evidence: `autofit converted (${s.layout.type}); ${objects(cliDeck, 'autofit').length} objects; groups ${[...groups].join(', ')}`,
    };
  },
);
step(
  'slide set-layout --type freeform',
  ['slide', 'set-layout', 'background-color', '--type', 'freeform', '--json'],
  () => {
    const s = slide(cliDeck, 'background-color');
    return {
      ok:
        s.layout.type === 'freeform' &&
        objects(cliDeck, 'background-color').every((b) => b.pos) &&
        s.grammar?.layout?.type === 'stack',
      evidence: `layout ${s.layout.type}; grammar ${JSON.stringify(s.grammar?.layout)}; ${objects(cliDeck, 'background-color').length} objects positioned`,
    };
  },
);
step('deck info --json carries canvas, charts and guides', ['info', '--json'], (r) => ({
  ok:
    r.json.counts?.canvas !== undefined &&
    r.json.counts?.charts !== undefined &&
    /* SPEC-2 0.93: the counts carry guides; the deck's own guides key travels only while the deck holds one (info.ts) */
    r.json.counts?.guides !== undefined &&
    'guides' in r.json === (manifest(cliDeck).guides !== undefined),
  evidence: `counts ${JSON.stringify(r.json.counts)}; guides ${JSON.stringify(r.json.guides ?? null)}`,
}));
step('slide list --json marks canvas slides with object counts', ['slides', '--json'], (r) => {
  const rows = Array.isArray(r.json) ? r.json : (r.json.slides ?? []);
  const canvas = rows.filter((x) => x.canvas === true);
  return {
    ok: canvas.length >= 15 && canvas.every((x) => typeof x.objects === 'number'),
    evidence: `${canvas.length} canvas slides of ${rows.length}; e.g. ${JSON.stringify(canvas[0]).slice(0, 100)}`,
  };
});
step('lint all --json after the walk', ['lint', 'all', '--json'], (r) => {
  const findings = Array.isArray(r.json) ? r.json : (r.json.findings ?? []);
  const severe = findings.filter((f) => f.severity >= 3);
  return {
    ok: severe.length === 0,
    evidence: `${findings.length} findings, ${severe.length} at severity 3${
      severe.length
        ? `: ${severe
            .slice(0, 3)
            .map((f) => `${f.slideId} ${f.rule}`)
            .join(', ')}`
        : ''
    }`,
  };
});

// ---------------------------------------------------------------------------------------------
// B. The MCP stdio server on the second copy

const GS2_TOOLS = [
  'deck_group_blocks',
  'deck_ungroup_blocks',
  'deck_regroup_blocks',
  'deck_rotate_block',
  'deck_flip_block',
  'deck_crop_image',
  'deck_mask_image',
  'deck_reset_image',
  'deck_adjust_image',
  'deck_set_alt_text',
  'deck_set_shadow',
  'deck_set_autofit',
  'deck_set_slide_background',
  'deck_set_background',
  'deck_style_text',
  'deck_set_list',
  'deck_set_spacing',
  'deck_set_columns',
  'deck_indent_text',
  'deck_set_case',
  'deck_set_chart_data',
  'deck_set_chart_kind',
  'deck_merge_cells',
  'deck_unmerge_cells',
  'deck_insert_rows',
  'deck_insert_columns',
  'deck_delete_rows',
  'deck_delete_columns',
  'deck_distribute_table',
  'deck_style_cells',
  'deck_set_shape',
  'deck_set_line',
  'deck_insert_diagram',
  'deck_insert_text',
  'deck_slide_to_canvas',
  'deck_set_guides',
];
const mcpStderr = [];
/**
 * The SDK's stdio client reads a message into a buffer capped at STDIO_DEFAULT_MAX_BUFFER_SIZE
 * (10 MB in @modelcontextprotocol/sdk 1.30.0). The first connection uses that default, which is
 * what every stock MCP client does, and records what happens to tools/list; when the list does
 * not fit, the walk reconnects with a 64 MB buffer so the tools themselves are still exercised.
 */
const makeTransport = (maxBufferSize) =>
  new StdioClientTransport({
    command: process.execPath,
    args: [CLI, 'mcp', '--deck', mcpDeck, '--derived', derived],
    cwd: tmp,
    env: { ...process.env, USER: 'verifier' },
    stderr: 'pipe',
    ...(maxBufferSize ? { maxBufferSize } : {}),
  });
let transport = makeTransport(undefined);
transport.stderr?.on('data', (chunk) => mcpStderr.push(String(chunk)));
let client = new Client({ name: 'verifier-agent-walk', version: '0.0.0' });
const mcpStep = (name, ok, evidence) => {
  steps.push({ transport: 'mcp', name, ok, evidence });
  log(`${ok ? 'ok  ' : 'FAIL'} mcp ${name}: ${evidence}`);
};
try {
  let tools;
  const errors = [];
  transport.onerror = (e) => errors.push(String(e?.message ?? e));
  try {
    await client.connect(transport);
    tools = (await client.listTools()).tools.map((t) => t.name);
    mcpStep(
      'tools/list fits the stock client buffer (10 MB)',
      true,
      `${tools.length} tools listed over the SDK client with its default buffer`,
    );
  } catch (e) {
    mcpStep(
      'tools/list fits the stock client buffer (10 MB)',
      false,
      `${String(e).slice(0, 120)}; transport errors: ${errors.slice(0, 2).join(' | ').slice(0, 200)}`,
    );
    await client.close().catch(() => null);
    transport = makeTransport(64 * 1024 * 1024);
    transport.stderr?.on('data', (chunk) => mcpStderr.push(String(chunk)));
    client = new Client({ name: 'verifier-agent-walk', version: '0.0.0' });
    await client.connect(transport);
    const listed = await client.listTools();
    tools = listed.tools.map((t) => t.name);
    mcpStep(
      'tools/list over a 64 MB buffer (the walk continues on it)',
      true,
      `${tools.length} tools; the JSON of the list is ${(Buffer.byteLength(JSON.stringify(listed)) / 1048576).toFixed(1)} MB`,
    );
  }
  const missing = GS2_TOOLS.filter((n) => !tools.includes(n));
  mcpStep(
    'the 36 round two tools are served',
    missing.length === 0,
    `${tools.length} tools; missing ${missing.join(', ') || 'none'}`,
  );
  const revision = () => manifest(mcpDeck).revision;
  const call = async (name, input, verify) => {
    const before = revision();
    const t0 = Date.now();
    let result;
    let text = '';
    try {
      result = await client.callTool({ name, arguments: { ...input, baseRevision: before } });
      text = (result.content ?? []).map((c) => c.text ?? '').join(' ');
    } catch (e) {
      mcpStep(name, false, `threw ${String(e).slice(0, 200)}`);
      return;
    }
    const ms = Date.now() - t0;
    let ok = result.isError !== true && revision() === before + 1;
    let evidence = `${ms} ms; isError ${result.isError === true}; revision ${before} -> ${revision()}`;
    if (ok && verify) {
      const v = verify(JSON.parse(text || '{}'));
      ok = v.ok;
      evidence += `; ${v.evidence}`;
    }
    if (!ok) evidence += `; ${text.slice(0, 200)}`;
    mcpStep(name, ok, evidence);
  };
  await call('deck_slide_to_canvas', { slideIds: ['title'] }, () => ({
    ok: slide(mcpDeck, 'title').layout?.type === 'freeform',
    evidence: `title converted; heading ${JSON.stringify(block(mcpDeck, 'title', 'heading')?.pos)}`,
  }));
  await call('deck_set_guides', { add: [{ axis: 'x', at: 400 }] }, () => ({
    ok: manifest(mcpDeck).guides.x.includes(400),
    evidence: `guides ${JSON.stringify(manifest(mcpDeck).guides)}`,
  }));
  await call('deck_rotate_block', { slideId: 'rotated', blockIds: ['tilted'], by: 15 }, () => ({
    ok: block(mcpDeck, 'rotated', 'tilted').pos.rotate === 52,
    evidence: `rotate ${block(mcpDeck, 'rotated', 'tilted').pos.rotate}`,
  }));
  await call('deck_flip_block', { slideId: 'rotated', blockIds: ['arrow'], axis: 'v' }, () => ({
    ok:
      (block(mcpDeck, 'rotated', 'arrow').pos.flip ?? '').includes('v') !==
      (slide(FIXTURE, 'rotated').slots.main.find((b) => b.id === 'arrow').pos.flip ?? '').includes(
        'v',
      ),
    evidence: `flip ${block(mcpDeck, 'rotated', 'arrow').pos.flip}`,
  }));
  await call(
    'deck_group_blocks',
    { slideId: 'shapes', blockIds: ['hex', 'right'], group: 'pair' },
    () => ({
      ok: block(mcpDeck, 'shapes', 'hex').pos.group === 'pair',
      evidence: `group ${block(mcpDeck, 'shapes', 'hex').pos.group}`,
    }),
  );
  await call('deck_ungroup_blocks', { slideId: 'shapes', group: 'pair' }, () => ({
    ok: !block(mcpDeck, 'shapes', 'hex').pos.group,
    evidence: `group ${block(mcpDeck, 'shapes', 'hex').pos.group ?? 'none'}`,
  }));
  await call(
    'deck_regroup_blocks',
    { slideId: 'shapes', blockIds: ['hex', 'right'], group: 'pair' },
    () => ({
      ok: block(mcpDeck, 'shapes', 'hex').pos.group === 'pair',
      evidence: `group ${block(mcpDeck, 'shapes', 'hex').pos.group}`,
    }),
  );
  await call(
    'deck_style_text',
    { slideId: 'styles', blockId: 'p1', path: '/text', range: [0, 4], marks: { u: true } },
    () => ({
      ok: /\]\{[^}]*\bu\b[^}]*\}/.test(block(mcpDeck, 'styles', 'p1').text),
      evidence: `text "${String(block(mcpDeck, 'styles', 'p1').text).slice(0, 50)}"`,
    }),
  );
  await call(
    'deck_set_case',
    { slideId: 'styles', blockId: 'p1', path: '/text', range: [0, 5], mode: 'upper' },
    () => ({
      ok: true,
      evidence: `text "${String(block(mcpDeck, 'styles', 'p1').text).slice(0, 30)}"`,
    }),
  );
  await call(
    'deck_insert_text',
    { slideId: 'styles', blockId: 'p1', path: '/text', at: 1, text: '→' },
    () => ({
      ok: String(block(mcpDeck, 'styles', 'p1').text).includes('→'),
      evidence: `text "${String(block(mcpDeck, 'styles', 'p1').text).slice(0, 30)}"`,
    }),
  );
  await call(
    'deck_set_list',
    { slideId: 'bullets', blockId: 'bullets', marker: 'number', preset: 'digit-alpha-roman' },
    () => ({
      ok: block(mcpDeck, 'bullets', 'bullets').marker === 'number',
      evidence: `marker ${block(mcpDeck, 'bullets', 'bullets').marker} preset ${block(mcpDeck, 'bullets', 'bullets').preset}`,
    }),
  );
  await call('deck_set_spacing', { slideId: 'styles', blockIds: ['p1'], before: 8 }, () => ({
    ok: block(mcpDeck, 'styles', 'p1').typography?.spaceBefore === 8,
    evidence: `typography ${JSON.stringify(block(mcpDeck, 'styles', 'p1').typography)}`,
  }));
  await call('deck_set_columns', { slideId: 'styles', blockIds: ['p1'], columns: 2 }, () => ({
    ok: block(mcpDeck, 'styles', 'p1').typography?.columns === 2,
    evidence: `columns ${block(mcpDeck, 'styles', 'p1').typography?.columns}`,
  }));
  await call('deck_indent_text', { slideId: 'styles', blockIds: ['p1'], by: 1 }, () => ({
    ok: (block(mcpDeck, 'styles', 'p1').typography?.indent ?? 0) > 0,
    evidence: `indent ${block(mcpDeck, 'styles', 'p1').typography?.indent}`,
  }));
  await call(
    'deck_set_chart_data',
    {
      slideId: 'chart-bar',
      blockId: 'chart',
      categories: ['A', 'B'],
      series: [{ name: 'S', values: [1, 2] }],
    },
    () => ({
      ok: block(mcpDeck, 'chart-bar', 'chart').categories.length === 2,
      evidence: `categories ${JSON.stringify(block(mcpDeck, 'chart-bar', 'chart').categories)}`,
    }),
  );
  await call(
    'deck_set_chart_kind',
    { slideId: 'chart-bar', blockId: 'chart', kind: 'line' },
    () => ({
      ok: block(mcpDeck, 'chart-bar', 'chart').kind === 'line',
      evidence: `kind ${block(mcpDeck, 'chart-bar', 'chart').kind}`,
    }),
  );
  await call(
    'deck_merge_cells',
    { slideId: 'table', blockId: 'table', from: [1, 1], to: [2, 2] },
    () => ({
      ok: (block(mcpDeck, 'table', 'table').spans ?? []).length === 1,
      evidence: `spans ${JSON.stringify(block(mcpDeck, 'table', 'table').spans)}`,
    }),
  );
  await call('deck_unmerge_cells', { slideId: 'table', blockId: 'table', at: [1, 1] }, () => ({
    ok: (block(mcpDeck, 'table', 'table').spans ?? []).length === 0,
    evidence: `spans ${(block(mcpDeck, 'table', 'table').spans ?? []).length}`,
  }));
  await call(
    'deck_insert_rows',
    { slideId: 'table', blockId: 'table', at: 1, count: 1, where: 'below' },
    () => ({
      ok: block(mcpDeck, 'table', 'table').rows.length === 5,
      evidence: `rows ${block(mcpDeck, 'table', 'table').rows.length}`,
    }),
  );
  await call(
    'deck_insert_columns',
    { slideId: 'table', blockId: 'table', at: 1, count: 1, where: 'right' },
    () => ({
      ok: block(mcpDeck, 'table', 'table').columns.length === 5,
      evidence: `columns ${block(mcpDeck, 'table', 'table').columns.length}`,
    }),
  );
  await call('deck_delete_rows', { slideId: 'table', blockId: 'table', from: 4, to: 4 }, () => ({
    ok: block(mcpDeck, 'table', 'table').rows.length === 4,
    evidence: `rows ${block(mcpDeck, 'table', 'table').rows.length}`,
  }));
  await call('deck_delete_columns', { slideId: 'table', blockId: 'table', from: 4, to: 4 }, () => ({
    ok: block(mcpDeck, 'table', 'table').columns.length === 4,
    evidence: `columns ${block(mcpDeck, 'table', 'table').columns.length}`,
  }));
  await call(
    'deck_distribute_table',
    { slideId: 'table', blockId: 'table', axis: 'rows', total: 320 },
    () => ({
      ok: block(mcpDeck, 'table', 'table').rows.every((r) => r.height === 80),
      evidence: `row heights ${JSON.stringify(block(mcpDeck, 'table', 'table').rows.map((r) => r.height ?? null))}`,
    }),
  );
  await call(
    'deck_style_cells',
    { slideId: 'table', blockId: 'table', cells: [[0, 0]], fill: 'plate' },
    () => ({
      ok: (block(mcpDeck, 'table', 'table').cells ?? []).some(
        (c) => c.row === 0 && c.column === 0 && c.fill === 'plate',
      ),
      evidence: `cells ${JSON.stringify(block(mcpDeck, 'table', 'table').cells).slice(0, 100)}`,
    }),
  );
  await call('deck_set_shape', { slideId: 'shapes', blockIds: ['hex'], dash: 'dash' }, () => ({
    ok: block(mcpDeck, 'shapes', 'hex').dash === 'dash',
    evidence: `dash ${block(mcpDeck, 'shapes', 'hex').dash}`,
  }));
  await call(
    'deck_set_line',
    { slideId: 'lines', blockIds: ['decorated'], end: 'openDiamond' },
    () => ({
      ok: block(mcpDeck, 'lines', 'decorated').lineEnd === 'openDiamond',
      evidence: `lineEnd ${block(mcpDeck, 'lines', 'decorated').lineEnd}`,
    }),
  );
  await call(
    'deck_crop_image',
    {
      slideId: 'image-tools',
      blockId: 'trimmed',
      trim: { left: 0.2, right: 0, top: 0, bottom: 0 },
    },
    () => ({
      ok: block(mcpDeck, 'image-tools', 'trimmed').trim?.left === 0.2,
      evidence: `trim ${JSON.stringify(block(mcpDeck, 'image-tools', 'trimmed').trim)}`,
    }),
  );
  await call(
    'deck_mask_image',
    { slideId: 'image-tools', blockId: 'adjusted', mask: 'hexagon' },
    () => ({
      ok: block(mcpDeck, 'image-tools', 'adjusted').mask === 'hexagon',
      evidence: `mask ${block(mcpDeck, 'image-tools', 'adjusted').mask}`,
    }),
  );
  await call(
    'deck_adjust_image',
    { slideId: 'image-tools', blockId: 'masked', contrast: 0.3 },
    () => ({
      ok: block(mcpDeck, 'image-tools', 'masked').adjust?.contrast === 0.3,
      evidence: `adjust ${JSON.stringify(block(mcpDeck, 'image-tools', 'masked').adjust)}`,
    }),
  );
  await call('deck_reset_image', { slideId: 'image-tools', blockId: 'trimmed' }, () => ({
    ok: block(mcpDeck, 'image-tools', 'trimmed').trim === undefined,
    evidence: `trim ${JSON.stringify(block(mcpDeck, 'image-tools', 'trimmed').trim ?? null)}`,
  }));
  await call('deck_set_alt_text', { slideId: 'shapes', blockId: 'right', alt: 'An arrow' }, () => ({
    ok: block(mcpDeck, 'shapes', 'right').alt === 'An arrow',
    evidence: `alt "${block(mcpDeck, 'shapes', 'right').alt}"`,
  }));
  await call(
    'deck_set_shadow',
    { slideId: 'shapes', blockIds: ['right'], shadow: { opacity: 0.3, angle: 45 } },
    () => ({
      ok: block(mcpDeck, 'shapes', 'right').shadow !== undefined,
      evidence: `shadow ${JSON.stringify(block(mcpDeck, 'shapes', 'right').shadow)}`,
    }),
  );
  await call(
    'deck_set_autofit',
    { slideId: 'canvas-title', blockId: 'shrink', autofit: 'shrink', apply: true },
    () => ({
      /* the ladder steps the 26 px size down in the same revision, as the CLI's --apply did */
      ok:
        block(mcpDeck, 'canvas-title', 'shrink').autofit === 'shrink' &&
        (block(mcpDeck, 'canvas-title', 'shrink').typography?.size ?? 26) < 26,
      evidence: `autofit ${block(mcpDeck, 'canvas-title', 'shrink').autofit}; size 26 -> ${block(mcpDeck, 'canvas-title', 'shrink').typography?.size}`,
    }),
  );
  await call(
    'deck_set_slide_background',
    { slideIds: ['styles'], background: { color: 'plate' } },
    () => ({
      ok: slide(mcpDeck, 'styles').background?.color === 'plate',
      evidence: `background ${JSON.stringify(slide(mcpDeck, 'styles').background)}`,
    }),
  );
  await call('deck_set_background', { background: { color: 'ink' } }, () => ({
    ok: manifest(mcpDeck).defaults?.background?.color === 'ink',
    evidence: `defaults.background ${JSON.stringify(manifest(mcpDeck).defaults?.background)}`,
  }));
  await call(
    'deck_insert_diagram',
    { slideId: 'autofit', kind: 'cycle', count: 3, style: 'ink' },
    () => ({
      ok:
        slide(mcpDeck, 'autofit').layout.type === 'freeform' &&
        objects(mcpDeck, 'autofit').length >= 5,
      evidence: `autofit converted; ${objects(mcpDeck, 'autofit').length} objects`,
    }),
  );
  const validated = run(['validate', mcpDeck], { deck: mcpDeck });
  mcpStep(
    'the MCP copy validates after every tool',
    validated.code === 0,
    `validate exit ${validated.code}; revision ${revision()}`,
  );
} catch (error) {
  mcpStep(
    'stdio session',
    false,
    `${String(error).slice(0, 300)}; server stderr ${mcpStderr.join('').slice(-300)}`,
  );
} finally {
  await client.close().catch(() => null);
}

rmSync(tmp, { recursive: true, force: true });
const report = {
  at: new Date().toISOString(),
  steps,
  summary: {
    cli: {
      pass: steps.filter((s) => s.transport === 'cli' && s.ok).length,
      fail: steps.filter((s) => s.transport === 'cli' && !s.ok).length,
    },
    mcp: {
      pass: steps.filter((s) => s.transport === 'mcp' && s.ok).length,
      fail: steps.filter((s) => s.transport === 'mcp' && !s.ok).length,
    },
  },
  canvasWriteMs: Object.fromEntries(
    steps
      .filter((s) =>
        /to-canvas|\/pos on a grammar|diagram insert|set-layout|insert --pos/.test(s.name),
      )
      .map((s) => [s.name, s.ms]),
  ),
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
log(
  `agent walk: cli ${report.summary.cli.pass} pass ${report.summary.cli.fail} fail; mcp ${report.summary.mcp.pass} pass ${report.summary.mcp.fail} fail; report ${OUT}`,
);
process.exit(report.summary.cli.fail + report.summary.mcp.fail > 0 ? 1 : 0);
