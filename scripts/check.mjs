#!/usr/bin/env node
// `pnpm check`: the M1 acceptance chain from MILESTONES.md, run in order from the repo root, plus
// the M2 format gate (step 19), the two steps of the Google Slides parity round (steps 20 and
// 21, docs/gslides-parity/SPEC.md 14.1) and the three of round two (steps 22 to 24,
// docs/gslides-parity/SPEC-2.md 11.1: the export fixture in both modes, the fonts build check,
// the conversion fidelity gate), with the container verification of SPEC-2 11.3 as an optional
// step 25 that runs when Docker is present. Every step is the literal command from the milestone plan,
// with one guard: step 3 first proves the generated files are tracked, because
// `git diff --exit-code` passes trivially on untracked paths. The runner adds only what the plan
// assumes about its environment: it creates .turboslide/, it skips the steps that read Kevin's
// Prototemplate checkout when that path is missing (CI; set TURBOSLIDE_PROTOTEMPLATE_DECK to point
// at one), and for the steps that need the studio it starts the dev server on 4321 and stops it
// afterwards with the server log capped (AGENTS.md, dev-server rules). Nothing is claimed done
// until every step exits 0.
//
//   node scripts/check.mjs                run everything
//   node scripts/check.mjs --list         print the numbered steps
//   node scripts/check.mjs --from 6       start at step 6
//   node scripts/check.mjs --only 4,5     run only those steps
//   node scripts/check.mjs --strict       fail instead of skipping when the Prototemplate deck, the
//                                         fonts venv or Docker is missing
//   node scripts/check.mjs --keep-server  leave a dev server the runner started running
//
// Round three (gslides-parity SPEC-3 0.50, 16.1): step 6 also greps the sources for new
// `dangerouslySetInnerHTML`, `innerHTML` and public `overwrite: true` call sites outside the
// allowlist (8.4, 8.5) and records the studio function bundle's size beside the client's; the new
// two browser specs and the security suite run as their own step 26 (never inside step 21, whose
// finding 28 is a fixer item), the layout shift audit is step 27 against `vite preview` of the
// production build, and `pnpm audit --prod --audit-level=high` with scripts/audit-allow.json is
// step 28. `--list` prints 28 steps. The runner's dev server carries the environment step 26
// names: the memory channel, a checkout auth database under .turboslide/, captured mail, and a
// fake download secret for the tmp store rule of server/tokens.ts.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROTOTEMPLATE_DECK =
  process.env.TURBOSLIDE_PROTOTEMPLATE_DECK ?? '/Users/kevinliu/repos/Prototemplate/deck';
const STUDIO_URL = 'http://localhost:4321';
const SERVER_LOG = '.turboslide/dev-server.log';
const LOG_CAP_BYTES = 2 * 1024 * 1024;
const SERVER_TIMEOUT_MS = 120_000;
// The pages step 18 audits, fetched once the server answers, with the client module graph they
// name, so Vite's SSR transforms and its dependency optimizer have run before a browser opens
// them (measured: `--only 18` on a cold server failed three runs of three with `state "list" did
// not apply` on the first audit, while the same step passed in the full chain after step 17 had
// warmed the server; the shell driver now also waits for hydration, this keeps that wait short).
const WARM_PATHS = ['/deck/gt-brand', '/edit/gt-brand', '/new', '/decks'];
const WARM_TIMEOUT_MS = 120_000;
const WARM_MODULE_CAP = 4000;
const WARM_CONCURRENCY = 8;

// The editor shell binds no bare letters (gslides-parity SPEC 10.2), so its chrome lint enters its
// states through what exists at every audited width: grid view from the bottom bar, the File
// menu from the menu bar, the Version history panel from Google's Cmd+Option+Shift+H
// (packages/headless/src/shell.ts SHELL_STATES; the toolbar's Theme button collapses into More at
// 390 px and the bottom bar's panel button sits under the dev server's devtools trigger). The
// home page has no states.
const EDITOR_STATES = 'editorGrid,editorMenu,editorPanel';
// Step 20 (gslides-parity SPEC 14.1): the Google parity audit once the verifier has written it;
// until then the menu model tests stand in, so the step is never a silent pass.
const PARITY_AUDIT = 'scripts/gslides-parity-audit.mjs';
// Step 23 (gslides-parity SPEC-2 11.1): the fonts build check needs the Python venv with fontTools
// that scripts/build-fonts.py documents; without it the step is skipped, never a silent pass.
const FONTS_VENV = '.turboslide/venv';
// Step 25 (SPEC-2 11.3, optional): the container verification in the render worker image runs
// when a Docker daemon answers; the verifier records its numbers in VERIFICATION-2.md.
const CONTAINER_IMAGE = 'turboslide-render-worker';
// The export batch size the dev server the runner starts advertises (SPEC-2 8.1): small, so
// apps/studio/e2e/export-batch.spec.ts drives the plan, the batches and the merge over the 27
// slide fixture deck in a few minutes; the Download dialog of a deck longer than three slides
// takes the batched path on that server too, which is the path the spec proves.
const EXPORT_BATCH = '3';
// Step 26 (SPEC-3 16.1): the round three specs against the runner's own dev server, each with
// two browser contexts on the memory channel; a spec whose builder has not landed the file is
// skipped by name with a line, never a silent pass (the list is the specification's).
const ROUND_THREE_SPECS = [
  'apps/studio/e2e/realtime.spec.ts',
  'apps/studio/e2e/presence.spec.ts',
  'apps/studio/e2e/comments.spec.ts',
  'apps/studio/e2e/share.spec.ts',
  'apps/studio/e2e/versions-by-author.spec.ts',
  'apps/studio/e2e/accounts.spec.ts',
  'apps/studio/e2e/dither.spec.ts',
  'apps/studio/e2e/security.spec.ts',
];
// Step 27 (SPEC-3 9.4, 16.5): the layout shift audit against `vite preview` of the production
// build on its own port (AGENTS.md port table: 4344 is B5's preview); the script is B5's.
const LAYOUT_SHIFT_AUDIT = 'scripts/layout-shift-audit.mjs';
const PREVIEW_PORT = '4344';
// The environment the runner's dev server carries (SPEC-3 16.1 step 26; server/tokens.ts).
const SERVER_ENV = {
  TURBOSLIDE_EXPORT_BATCH: EXPORT_BATCH,
  TURBOSLIDE_REALTIME: 'memory',
  TURBOSLIDE_AUTH_DB: '.turboslide/auth.sqlite',
  TURBOSLIDE_MAIL: 'capture',
  // the same two switches playwright.config.ts gives its own server (b3.md R12): the localhost
  // agent surface stays open for the specs and the library's sign in limiter is off for the run
  TURBOSLIDE_LOCAL_OPEN: '1',
  TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
};
// Step 6's source greps (SPEC-3 16.1, 8.4, 8.5): every `dangerouslySetInnerHTML` and `innerHTML`
// call site outside this list is a failure, and so is `overwrite: true` on a pathname under the
// public asset prefix. The allowlist names the files that render the one renderer's output as
// HTML (SPEC 5.3) and the export parts that rewrite their own job's files.
const INNER_HTML_ALLOW = [
  'apps/studio/src/routes/__root.tsx',
  'apps/studio/src/routes/edit.$deckId.tsx',
  'apps/studio/src/routes/present.$deckId.tsx',
  'apps/studio/src/routes/print.$deckId.tsx',
  'apps/studio/src/components/DeckViewer.tsx',
  'packages/viewer/src/SlideView.tsx',
  'packages/viewer/src/LiveClone.tsx',
  'packages/viewer/src/Editor.tsx',
  'packages/viewer/src/InlineText.tsx',
  'packages/viewer/src/canvas-measure.ts',
  'packages/viewer/src/model.ts',
  'packages/viewer/src/theme.ts',
  'packages/viewer/standalone/runtime.ts',
  'packages/identity/src/names.ts',
  'apps/studio/src/server/decks.ts',
];
const OVERWRITE_ALLOW = [
  'apps/studio/src/server/export-batch.ts',
  'apps/studio/src/server/export-sync.ts',
  'packages/store/src/blob-store.ts',
  // the comment sidecar's thread and author files under decks/<id>/comments/ (records the index
  // commits under ifMatch, SPEC-3 0.52) and the storage migration's meta file on the private
  // documents client (SPEC-3 8.9): record rewrites, never a public asset (the integrator, merge 2)
  'packages/store/src/comments-store.ts',
  'packages/store/src/migrate.ts',
  // the share link hash index `links/<hex>.json` beside the access records (hotfix B, SPEC-3 6.4,
  // VERIFICATION-3 finding 34 F2): a record naming the deck a link hash belongs to, written with
  // an overwriting put so two instances indexing one link never conflict; never a public asset
  'packages/store/src/access-store.ts',
];

// MILESTONES.md, M1 acceptance, in order. `needs` marks the environment a step depends on.
const steps = [
  { cmd: 'pnpm install --frozen-lockfile' },
  { cmd: 'pnpm exec tsr generate --config apps/studio/tsr.config.json' },
  {
    // `git ls-files --error-unmatch` exits 1 when a pathspec matches no tracked file, so an
    // uncommitted generated tree fails here instead of passing the diff by having nothing to diff.
    // The plan writes the route as apps/studio/src/routes/openapi.json.ts; on disk it is
    // openapi[.]json.ts because TanStack Router's file routing escapes a dot in a segment with
    // [.], and the :(literal) pathspec magic stops git from reading the brackets as a glob class.
    cmd: "git ls-files --error-unmatch packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts' > /dev/null && pnpm generate:contracts && git diff --exit-code -- packages/agent/generated skills/*/references docs/grammar.md packages/schema/src/rules.json packages/lint/fixtures/index.json ':(literal)apps/studio/src/routes/openapi[.]json.ts'",
  },
  { cmd: 'pnpm exec tsc -b' },
  { cmd: 'pnpm test' },
  {
    cmd: 'pnpm build && node scripts/check-client-bundle.mjs apps/studio/dist && node scripts/check.mjs --greps',
  },
  {
    cmd: `pnpm exec turboslide import ${PROTOTEMPLATE_DECK} --into gt-brand --json > .turboslide/import.json`,
    needs: 'prototemplate',
  },
  {
    cmd: `node -e "const r=require('./.turboslide/import.json'); if(r.slides!==85||r.sections!==8||r.htmlBlocks!==0) process.exit(1)"`,
    needs: 'prototemplate',
  },
  { cmd: 'pnpm exec turboslide validate decks/gt-brand' },
  {
    cmd: 'pnpm exec turboslide render all --theme light,dark --scale 1 --out .turboslide/render --json',
  },
  {
    cmd: `node -e "const r=require('./.turboslide/render/render.json'); if(r.length!==170||r.some(x=>x.pageErrors.length)) process.exit(1)"`,
  },
  {
    cmd: `node scripts/compare-to-shoot.mjs --deck decks/gt-brand --render .turboslide/render --shoot ${PROTOTEMPLATE_DECK} --max-mismatch 0.005`,
    needs: 'prototemplate',
  },
  { cmd: 'pnpm exec turboslide sheet all --cols 4 --thumb 480 --numbered --out .turboslide/sheet' },
  {
    cmd: `node -e "const fs=require('fs'); for (const t of ['light','dark']) { fs.statSync('.turboslide/sheet/sheet-'+t+'.png'); const m=JSON.parse(fs.readFileSync('.turboslide/sheet/sheet-'+t+'.json')); if(m.cells.length!==85) process.exit(1) }"`,
  },
  { cmd: 'pnpm exec turboslide lint all --json > .turboslide/lint.json' },
  { cmd: 'pnpm exec turboslide build --out .turboslide/brand-deck.html --budget 16' },
  { cmd: 'pnpm exec playwright test apps/studio/e2e/viewer.spec.ts', needs: 'server' },
  {
    // the viewer, then the editor: the editor's toolbar carries the deck name, the status chip,
    // Search and the Export menu, and the M5 verification found its chip drawn under Search at
    // 1280 while only /deck was audited here
    // gslides-parity SPEC 14.1: the editor, the draft and the home page join the audit
    cmd: `pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/deck/gt-brand --widths 1440,1280,390 --themes light,dark && pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/edit/gt-brand --widths 1440,1280,390 --themes light,dark --states ${EDITOR_STATES} && pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/new --widths 1440,1280,390 --themes light,dark --states ${EDITOR_STATES} && pnpm exec turboslide lint --chrome --url ${STUDIO_URL}/decks --widths 1440,1280,390 --themes light,dark --states ''`,
    needs: 'server',
  },
  // MILESTONES.md M2 acceptance, added after the M2 review found 41 files that `pnpm format` had
  // not touched: the tree is prettier-clean (AGENTS.md code rules). Last, so the M1 step numbers
  // that AGENTS.md and the status documents cite stay valid.
  { cmd: 'pnpm format:check' },
  // gslides-parity SPEC 14.1, steps 20 and 21: the Google parity audit (the verifier's script;
  // the menu model tests until it exists) and the parity round's end to end specs, the ten tasks
  // of SPEC 11.2 first. The report lands in the current round's folder (SPEC-3 16.2 names
  // `verification-3/parity-audit.json`); round two's report under `verification-2/` is a record
  // and is never rewritten (VERIFICATION-3 finding 20).
  existsSync(PARITY_AUDIT)
    ? {
        cmd: `node ${PARITY_AUDIT} --base ${STUDIO_URL} --out docs/gslides-parity/verification-3/parity-audit.json`,
        needs: 'server',
      }
    : {
        cmd: 'pnpm exec vitest run --dir packages/chrome menus/__tests__',
      },
  {
    // round two (SPEC-2 11.1 step 21): the canvas walk of 11.8, the objects, the text styles, the
    // tables, the charts, the hygiene rows and the batched export join the list
    cmd: 'pnpm exec playwright test apps/studio/e2e/ten-tasks.spec.ts apps/studio/e2e/text-editing.spec.ts apps/studio/e2e/filmstrip.spec.ts apps/studio/e2e/home.spec.ts apps/studio/e2e/present.spec.ts apps/studio/e2e/landing.spec.ts apps/studio/e2e/gslides-actions.spec.ts apps/studio/e2e/deck-transfer.spec.ts apps/studio/e2e/canvas.spec.ts apps/studio/e2e/objects.spec.ts apps/studio/e2e/text-styles.spec.ts apps/studio/e2e/tables.spec.ts apps/studio/e2e/charts.spec.ts apps/studio/e2e/hygiene.spec.ts apps/studio/e2e/export-batch.spec.ts',
    needs: 'server',
  },
  // gslides-parity SPEC-2 11.1, steps 22 to 24: the fixture deck exported in both modes with the
  // flatten report perfect, the fonts build check, the conversion fidelity gate (0.95)
  {
    cmd: `pnpm exec turboslide export decks/fixture/gslides --mode native --out .turboslide/gs-native && pnpm exec turboslide export check .turboslide/gs-native && pnpm exec turboslide export decks/fixture/gslides --mode flatten --out .turboslide/gs-flatten && pnpm exec turboslide export check .turboslide/gs-flatten && node -e "const fs=require('fs'); const dir='.turboslide/gs-flatten'; const reports=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.endsWith('.check.json')); if(reports.length===0) process.exit(1); for (const f of reports) { const r=JSON.parse(fs.readFileSync(dir+'/'+f)); const perfect = r.perfect ?? (r.themes ?? r.reports ?? []).every(t=>t.perfect); if(perfect!==true){ console.error(f+': flatten report is not perfect'); process.exit(1) } }"`,
  },
  { cmd: 'pnpm exec turboslide fonts build --check', needs: 'python' },
  {
    cmd: 'node scripts/canvas-fidelity.mjs --deck decks/gt-brand --deck decks/templates/gt-brand --deck decks/templates/blank --max-mismatch 0.005',
  },
  // SPEC-2 11.3, optional: the container verification in the rebuilt render worker image
  {
    cmd: `docker build -f docker/render-worker.Dockerfile -t ${CONTAINER_IMAGE} . && docker run --rm -v "$PWD/.turboslide/container:/work" ${CONTAINER_IMAGE} turboslide export decks/fixture/gslides --mode native --verify --out /work/gs-native`,
    needs: 'docker',
  },
  // gslides-parity SPEC-3 16.1, steps 26 to 28 (0.50): the round three specs as their own step,
  // the layout shift audit against the production preview, the dependency audit
  {
    // never a bare `playwright test` (which would run every spec): the present ones by name, or a
    // named failure when none has landed
    cmd: ROUND_THREE_SPECS.some((spec) => existsSync(resolve(ROOT, spec)))
      ? `pnpm exec playwright test ${ROUND_THREE_SPECS.filter((spec) => existsSync(resolve(ROOT, spec))).join(' ')}`
      : `node -e "console.error('check 26: no round three spec is in the tree yet (SPEC-3 16.1)'); process.exit(1)"`,
    needs: 'server',
    // the specs another builder has not landed yet are named, so the step is never a silent pass
    missing: ROUND_THREE_SPECS.filter((spec) => !existsSync(resolve(ROOT, spec))),
  },
  existsSync(resolve(ROOT, LAYOUT_SHIFT_AUDIT))
    ? {
        cmd: `node ${LAYOUT_SHIFT_AUDIT} --base http://localhost:${PREVIEW_PORT} --out docs/gslides-parity/verification-3/layout-shift.json`,
        needs: 'preview',
      }
    : {
        // until B5's script lands: the renderer's img size and collab class pins stand in
        cmd: 'pnpm exec vitest run --dir packages/render __tests__/img-size __tests__/collab',
      },
  { cmd: 'node scripts/check.mjs --audit' },
];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('list')) {
  steps.forEach((step, i) =>
    console.log(`${String(i + 1).padStart(2)}  ${step.needs ? `[${step.needs}] ` : ''}${step.cmd}`),
  );
  process.exit(0);
}

// `--greps`: step 6's source rules (SPEC-3 16.1, 8.4, 8.5), runnable alone.
if (flag('greps')) {
  process.exit(runGreps());
}

// `--audit`: step 28, `pnpm audit --prod --audit-level=high` filtered by scripts/audit-allow.json.
if (flag('audit')) {
  process.exit(await runAudit());
}

const from = Number(value('from') ?? 1);
const only = value('only') ? new Set(value('only').split(',').map(Number)) : null;
const strict = flag('strict');
const keepServer = flag('keep-server');
const hasPrototemplate = existsSync(PROTOTEMPLATE_DECK);
const hasFontsVenv = existsSync(FONTS_VENV);
const hasDocker = (() => {
  const probe = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return probe.status === 0;
})();

process.chdir(ROOT);
mkdirSync('.turboslide', { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The source files a grep walks: TypeScript and TSX under apps/ and packages/, no tests, no output (the scripts read a page's innerHTML in a browser evaluation and are not app sources). */
function sourceFiles() {
  const out = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'apps', 'packages'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out.stdout
    .split('\n')
    .filter((file) => /\.(?:ts|tsx|mjs)$/.test(file))
    .filter((file) => !/\.test\.|__tests__|\/e2e\/|\/dist\/|\.gen\.ts$/.test(file))
    .filter((file) => existsSync(resolve(ROOT, file)));
}

/**
 * Step 6's greps (SPEC-3 16.1; 8.4: a new `innerHTML` call site is a review item, 8.5: nothing on
 * the public store is ever overwritten). The allowlists are the files named above; a hit anywhere
 * else fails the step and names the file and line.
 */
function runGreps() {
  const { readFileSync } = require('node:fs');
  const failures = [];
  let innerHits = 0;
  let overwriteHits = 0;
  for (const file of sourceFiles()) {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (/dangerouslySetInnerHTML|\.innerHTML\b/.test(line) && !/^\s*(?:\/\/|\*)/.test(line)) {
        innerHits += 1;
        if (!INNER_HTML_ALLOW.includes(file))
          failures.push(`${file}:${index + 1}: innerHTML outside the allowlist (SPEC-3 8.4)`);
      }
      if (/overwrite:\s*true/.test(line) && !/^\s*(?:\/\/|\*)/.test(line)) {
        overwriteHits += 1;
        if (!OVERWRITE_ALLOW.includes(file))
          failures.push(`${file}:${index + 1}: overwrite: true outside the allowlist (SPEC-3 8.5)`);
      }
    });
  }
  // the studio function bundle's size beside the client's (SPEC-3 16.1 step 6, 8.4)
  const sizes = [];
  for (const dir of ['apps/studio/dist/server', 'apps/studio/dist/client']) {
    const du = spawnSync('du', ['-sk', dir], { cwd: ROOT, encoding: 'utf8' });
    const kb = Number(du.stdout.split(/\s+/)[0]);
    if (Number.isFinite(kb)) sizes.push(`${dir} ${(kb / 1024).toFixed(1)} MB`);
  }
  console.log(
    `check greps: innerHTML ${innerHits} call site(s) in the allowlist, overwrite: true ${overwriteHits} in the allowlist${sizes.length ? `; ${sizes.join(', ')}` : ''}`,
  );
  for (const failure of failures) console.error(`check greps: FAIL ${failure}`);
  return failures.length === 0 ? 0 : 1;
}

/**
 * Step 28 (SPEC-3 8.10, 16.1): `pnpm audit --prod --audit-level=high --json`, with the
 * advisories scripts/audit-allow.json accepts (each with a reason and an expiry) removed; an
 * expired acceptance fails the step like a new advisory.
 */
async function runAudit() {
  const { readFileSync } = require('node:fs');
  const allowPath = resolve(ROOT, 'scripts/audit-allow.json');
  const allow = existsSync(allowPath)
    ? JSON.parse(readFileSync(allowPath, 'utf8'))
    : { accepted: [] };
  const today = new Date().toISOString().slice(0, 10);
  const expired = (allow.accepted ?? []).filter((entry) => entry.expires < today);
  const audit = spawnSync('pnpm', ['audit', '--prod', '--audit-level=high', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error(
      `check audit: FAIL pnpm audit answered no JSON (exit ${audit.status}): ${audit.stderr.slice(0, 400)}`,
    );
    return 1;
  }
  const accepted = new Set((allow.accepted ?? []).map((entry) => entry.id));
  const advisories = Object.values(report.advisories ?? {});
  const open = advisories.filter(
    (advisory) =>
      ['high', 'critical'].includes(advisory.severity) &&
      !accepted.has(advisory.github_advisory_id ?? advisory.id) &&
      !accepted.has(String(advisory.id)),
  );
  console.log(
    `check audit: ${advisories.length} advisory(ies) at high or above, ${advisories.length - open.length} accepted in scripts/audit-allow.json, ${open.length} open, ${expired.length} acceptance(s) expired`,
  );
  for (const advisory of open)
    console.error(
      `check audit: FAIL ${advisory.github_advisory_id ?? advisory.id} ${advisory.module_name} ${advisory.severity}: ${advisory.title}`,
    );
  for (const entry of expired)
    console.error(`check audit: FAIL acceptance of ${entry.id} expired on ${entry.expires}`);
  return open.length === 0 && expired.length === 0 ? 0 : 1;
}

async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function cappedLog(path) {
  const stream = createWriteStream(path, { flags: 'w' });
  let written = 0;
  let capped = false;
  return {
    write(chunk) {
      if (capped) return;
      written += chunk.length;
      if (written > LOG_CAP_BYTES) {
        capped = true;
        stream.write(
          `\n[check.mjs] log capped at ${LOG_CAP_BYTES} bytes; further output dropped\n`,
        );
        return;
      }
      stream.write(chunk);
    },
    close() {
      stream.end();
    },
  };
}

let server = null;
let serverLog = null;

async function fetchText(path) {
  const response = await fetch(`${STUDIO_URL}${path}`, {
    signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
  });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    text: await response.text(),
  };
}

// the module URLs a dev page or a transformed module names: script and modulepreload tags,
// static and dynamic imports; Vite rewrites every import to a root-relative URL in dev
function moduleUrls(text) {
  const urls = new Set();
  for (const m of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(\/[^"]+)"/g))
    urls.add(m[1]);
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\/[^"'\s]+)["']/g))
    urls.add(m[1]);
  return urls;
}

async function warmServer() {
  const t = Date.now();
  const seen = new Set();
  const queue = [];
  for (const path of WARM_PATHS) {
    const { status, text } = await fetchText(path);
    if (status >= 400) throw new Error(`warm-up: ${STUDIO_URL}${path} answered ${status}`);
    for (const url of moduleUrls(text)) {
      if (seen.has(url)) continue;
      seen.add(url);
      queue.push(url);
    }
  }
  // the client module graph, crawled breadth first: each request transforms one module and lets
  // the optimizer discover the dependencies it imports; a module that fails is left to the browser
  let fetched = 0;
  let inflight = 0;
  const worker = async () => {
    while (queue.length > 0 || inflight > 0) {
      const url = queue.shift();
      if (url === undefined) {
        await sleep(20);
        continue;
      }
      if (fetched >= WARM_MODULE_CAP) continue;
      fetched += 1;
      inflight += 1;
      try {
        const { status, type, text } = await fetchText(url);
        if (status < 400 && /javascript|ecmascript/.test(type)) {
          for (const next of moduleUrls(text)) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
          }
        }
      } catch {
        // a module the browser will report if it matters
      } finally {
        inflight -= 1;
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
  console.log(
    `check: warmed ${WARM_PATHS.join(' and ')} with ${fetched} client module(s) in ${((Date.now() - t) / 1000).toFixed(1)} s`,
  );
}

async function ensureServer() {
  if (server) return;
  if (await isUp(STUDIO_URL)) {
    console.log(
      `check: reusing the server already listening on ${STUDIO_URL} (it is not stopped afterwards)`,
    );
    await warmServer();
    return;
  }
  // A kept server outlives this process, so its output is discarded rather than piped: a pipe to
  // an exited parent kills the server on its next log line (measured: the server left by
  // `--keep-server` answered one more lint run and then refused connections). Never an unbounded
  // file (AGENTS.md, dev-server rules).
  if (!keepServer) serverLog = cappedLog(SERVER_LOG);
  const child = spawn(
    'pnpm',
    ['--filter', '@turboslide/studio', 'exec', 'vite', 'dev', '--port', '4321', '--strictPort'],
    {
      cwd: ROOT,
      detached: true,
      stdio: keepServer ? ['ignore', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...SERVER_ENV },
    },
  );
  child.stdout?.on('data', (chunk) => serverLog.write(chunk));
  child.stderr?.on('data', (chunk) => serverLog.write(chunk));
  if (keepServer) child.unref();
  server = child;
  console.log(
    keepServer
      ? 'check: starting the studio dev server on 4321 (output discarded, it stays up after --keep-server)'
      : `check: starting the studio dev server on 4321 (log capped in ${SERVER_LOG})`,
  );
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(STUDIO_URL)) {
      await warmServer();
      return;
    }
    if (child.exitCode !== null)
      throw new Error(
        `dev server exited with ${child.exitCode} before answering; see ${SERVER_LOG}`,
      );
    await sleep(500);
  }
  throw new Error(
    `dev server did not answer on 4321 within ${SERVER_TIMEOUT_MS / 1000} s; see ${SERVER_LOG}`,
  );
}

async function stopServer() {
  if (!server) return;
  if (keepServer) {
    console.log(
      `check: leaving the dev server running (pid ${server.pid}) because of --keep-server`,
    );
    return;
  }
  const child = server;
  server = null;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && Date.now() < deadline) await sleep(100);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  serverLog?.close();
  console.log('check: dev server stopped');
}

process.on('SIGINT', async () => {
  await stopServer();
  process.exit(130);
});

let selected = steps.map((step, i) => ({ ...step, n: i + 1 })).filter((s) => s.n >= from);
if (only) selected = selected.filter((s) => only.has(s.n));
const lastServerStep = selected.filter((s) => s.needs === 'server').at(-1)?.n;

const startedAt = Date.now();
let exitCode = 0;
for (const step of selected) {
  const label = `check ${String(step.n).padStart(2)}/${steps.length}`;
  const missing =
    step.needs === 'prototemplate' && !hasPrototemplate
      ? `Prototemplate deck missing at ${PROTOTEMPLATE_DECK}; set TURBOSLIDE_PROTOTEMPLATE_DECK`
      : step.needs === 'python' && !hasFontsVenv
        ? `fonts venv missing at ${FONTS_VENV}; see scripts/build-fonts.py`
        : step.needs === 'docker' && !hasDocker
          ? 'no Docker daemon answers; the verifier runs the container verification (SPEC-2 11.3)'
          : step.needs === 'preview' && !(await isUp(`http://localhost:${PREVIEW_PORT}`))
            ? `no production preview answers on ${PREVIEW_PORT}; start \`vite preview --port ${PREVIEW_PORT}\` from apps/studio over \`pnpm build\` (SPEC-3 16.1 step 27)`
            : null;
  if (step.missing !== undefined && step.missing.length > 0)
    console.log(
      `${label}: ${step.missing.length} spec(s) not in the tree yet: ${step.missing.join(', ')}`,
    );
  if (missing !== null) {
    if (strict) {
      console.error(`${label}: FAIL ${missing} (--strict)`);
      exitCode = 1;
      break;
    }
    console.log(`${label}: skip (${missing})\n    ${step.cmd}`);
    continue;
  }
  if (step.needs === 'server') {
    try {
      await ensureServer();
    } catch (error) {
      console.error(`${label}: FAIL ${error instanceof Error ? error.message : String(error)}`);
      exitCode = 1;
      break;
    }
  }
  console.log(`${label}: ${step.cmd}`);
  const t = Date.now();
  const result = spawnSync(step.cmd, {
    shell: '/bin/sh',
    stdio: 'inherit',
    cwd: ROOT,
    // the batch size the runner's dev server advertises, for export-batch.spec.ts (step 21), and
    // the round three environment of step 26
    env: { ...process.env, ...SERVER_ENV },
  });
  const seconds = ((Date.now() - t) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`${label}: FAIL exit ${result.status ?? result.signal} after ${seconds} s`);
    exitCode = result.status ?? 1;
    break;
  }
  console.log(`${label}: ok in ${seconds} s`);
  if (step.n === lastServerStep) await stopServer();
}

await stopServer();
const total = ((Date.now() - startedAt) / 1000).toFixed(1);
if (exitCode === 0)
  console.log(`check: all ${selected.length} selected step(s) passed in ${total} s`);
else console.error(`check: stopped after a failure (${total} s)`);
process.exit(exitCode);
