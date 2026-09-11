#!/usr/bin/env node
// The judge loop harness (SPEC 7.6; MILESTONES M4 item 4; docs/judge-loop.md): render, sheet and
// lint through `turboslide judge bundle`, six judges by lens, a skeptic per slide, the fixers and
// the gate, against one deck, with no human step. Agents run through the Claude Agent SDK when
// `@anthropic-ai/claude-agent-sdk` is installed, else through the `claude` CLI in headless mode
// (`claude -p --output-format json --json-schema ...`), else not at all (`--runner none`): the
// loop then writes the linter's findings, the gate and a judges: skipped note, so the same files
// exist on a machine without an agent runtime. A preflight call decides the runner: when it fails
// (an authentication error, no answer within --timeout-s, a non-zero exit) auto continues as none
// and says why, and an explicit --runner exits 1. Every agent answer is validated against the
// Finding schema; nothing is invented. Fixers write only with --fix.
//
//   node scripts/judge-loop.mjs --deck decks/gt-brand --bundle .turboslide/judge \
//     --out .turboslide/judge/findings.json --gate .turboslide/judge/gate.json \
//     [--lenses layout,copy] [--slides 12-20|a,b] [--runner auto|sdk|cli|none] [--model sonnet] \
//     [--max-slides 24] [--budget-usd 5] [--timeout-s 240] [--fix] [--build] [--fresh]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TURBOSLIDE = join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs');
const AUTHOR = `agent:judge-loop-${Date.now().toString(36)}`;
const LENSES = [
  'layout',
  'visual-consistency',
  'copy',
  'accuracy',
  'completeness',
  'art-direction',
];
const RULE_IDS = new Set(readRuleIds());

// ---------------------------------------------------------------------------------------------
// Arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')
    ? argv[i + 1]
    : fallback;
};

if (flag('help')) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 16)
      .join('\n'),
  );
  process.exit(0);
}

const deckDir = resolve(ROOT, value('deck', 'decks/gt-brand'));
const bundleDir = resolve(ROOT, value('bundle', '.turboslide/judge'));
const outPath = resolve(ROOT, value('out', join(bundleDir, 'findings.json')));
const gatePath = resolve(ROOT, value('gate', join(bundleDir, 'gate.json')));
const lenses = value('lenses', LENSES.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const slidesArg = value('slides', undefined);
const runnerWanted = value('runner', 'auto');
const model = value('model', undefined);
const maxSlides = Number(value('max-slides', '24'));
const budgetUsd = Number(value('budget-usd', '5'));
const timeoutS = Number(value('timeout-s', '240'));
const applyFixes = flag('fix');
const withBuild = flag('build');
const fresh = flag('fresh');

for (const lens of lenses) {
  if (!LENSES.includes(lens)) {
    console.error(`judge-loop: unknown lens ${lens}; one of ${LENSES.join(', ')}`);
    process.exit(2);
  }
}

const log = (line) => console.error(`judge-loop: ${line}`);
const startedAt = Date.now();
const calls = [];

function readRuleIds() {
  try {
    const text = readFileSync(join(ROOT, 'packages', 'schema', 'src', 'rules.ts'), 'utf8');
    const block = /export const RULE_IDS = \[([\s\S]*?)\] as const;/.exec(text);
    return block ? [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// The CLI

function turboslide(args, { input, allowFailure = false } = {}) {
  const run = spawnSync(process.execPath, [TURBOSLIDE, ...args, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  if (run.status !== 0 && !allowFailure) {
    throw new Error(
      `turboslide ${args.join(' ')} exited ${run.status}\n${(run.stderr ?? '').split('\n').slice(-8).join('\n')}`,
    );
  }
  let json;
  try {
    json = run.stdout.trim() ? JSON.parse(run.stdout) : undefined;
  } catch {
    json = undefined;
  }
  return { code: run.status ?? 1, json, stderr: run.stderr ?? '' };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------------------------------------
// 1. The bundle

const manifest = readJson(join(deckDir, 'deck.json'));
const revision = manifest.revision;
const order = manifest.sections.flatMap((section) => section.slideIds);

function selectSlides(arg) {
  if (!arg || arg === 'all') return [...order];
  const wanted = new Set();
  for (const part of arg
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1)
        if (order[n - 1]) wanted.add(order[n - 1]);
    } else if (/^\d+$/.test(part)) {
      if (order[Number(part) - 1]) wanted.add(order[Number(part) - 1]);
    } else if (order.includes(part)) {
      wanted.add(part);
    } else {
      throw new Error(`no slide "${part}" in ${deckDir}`);
    }
  }
  return order.filter((id) => wanted.has(id));
}

const selected = selectSlides(slidesArg);
const bundleJsonPath = join(bundleDir, 'bundle.json');
let bundle = existsSync(bundleJsonPath) ? readJson(bundleJsonPath) : null;
const bundleCovers =
  bundle && bundle.revision === revision && selected.every((id) => bundle.slideIds.includes(id));
if (!bundleCovers || fresh) {
  log(
    `bundle: ${bundle ? `revision ${bundle.revision} on disk, deck at ${revision}` : 'none'}; running turboslide judge bundle`,
  );
  const args = [
    'judge',
    'bundle',
    ...(selected.length === order.length ? ['all'] : selected),
    '--deck',
    deckDir,
    '--out',
    bundleDir,
  ];
  if (fresh) args.push('--fresh');
  turboslide(args);
  bundle = readJson(bundleJsonPath);
} else {
  log(`bundle: reusing ${bundleDir} at revision ${revision}`);
}

const lintFindings = readJson(join(bundleDir, 'lint.json')).filter((finding) =>
  selected.includes(finding.slideId),
);
const lintGate = readJson(join(bundleDir, 'lint-gate.json'));
const renderRecords = readJson(join(bundleDir, 'render', 'render.json'));
const documentJson = readJson(join(bundleDir, 'document.json'));
const lensesJson = readJson(join(bundleDir, 'lenses.json'));
log(
  `evidence: ${renderRecords.length} render records, ${lintFindings.length} lint findings on ${selected.length} slides`,
);

// The slides a judge sees: the ones with the most lint findings first, capped by --max-slides.
const perSlide = new Map(selected.map((id) => [id, 0]));
for (const finding of lintFindings)
  perSlide.set(finding.slideId, (perSlide.get(finding.slideId) ?? 0) + 1);
const judged = [...perSlide.entries()]
  .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
  .slice(0, Math.max(1, maxSlides))
  .map(([id]) => id)
  .sort((a, b) => order.indexOf(a) - order.indexOf(b));

// ---------------------------------------------------------------------------------------------
// 2. The runner

function onPath(bin) {
  return (process.env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir !== '' && existsSync(join(dir, bin)));
}

async function detectRunner() {
  if (runnerWanted === 'none') return { kind: 'none' };
  if (runnerWanted === 'sdk' || runnerWanted === 'auto') {
    try {
      const sdk = await import('@anthropic-ai/claude-agent-sdk');
      if (typeof sdk.query === 'function') return { kind: 'sdk', sdk };
    } catch {
      if (runnerWanted === 'sdk')
        throw new Error('--runner sdk: @anthropic-ai/claude-agent-sdk is not installed');
    }
  }
  if (runnerWanted === 'cli' || runnerWanted === 'auto') {
    if (onPath('claude')) return { kind: 'cli' };
    if (runnerWanted === 'cli') throw new Error('--runner cli: the claude binary is not on PATH');
  }
  return { kind: 'none' };
}

/** An error from the runner, with the reason the loop reads: auth, timeout, exit or result. */
class RunnerError extends Error {
  constructor(message, reason) {
    super(message);
    this.reason = reason;
  }
}

const AUTH_TEXT =
  /failed to authenticate|api key is invalid|invalid api key|not logged in|unauthorized|authentication_error|\b40[13]\b/i;

/** True when a result envelope (CLI) or result message (SDK) reports an authentication failure. */
function isAuthFailure(envelope, text) {
  const status = envelope && typeof envelope === 'object' ? envelope.api_error_status : undefined;
  return status === 401 || status === 403 || AUTH_TEXT.test(text ?? '');
}

/**
 * Drops the runner. An explicit --runner exits 1 with the message (judge-log.json is written first
 * so the failed call is on disk); auto logs the reason and continues as none, and gate.json carries
 * the reason under judges.
 */
function dropRunner(runner, why) {
  if (runnerWanted !== 'auto') {
    writeJson(join(bundleDir, 'judge-log.json'), {
      runner: runner.kind,
      detected: runner.detected,
      dropped: why,
      model: model ?? null,
      lenses,
      slides: judged,
      calls,
    });
    log(`--runner ${runnerWanted}: ${why}`);
    log('no gate written; use --runner none on a machine without an authenticated runner');
    process.exit(1);
  }
  log(`${why}; judges and skeptics skipped, continuing as none`);
  runner.dropped = why;
  runner.kind = 'none';
}

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rule: { type: 'string' },
          severity: { type: 'integer', enum: [2, 3] },
          kind: { type: 'string', enum: ['defect', 'diagram', 'polish', 'copy', 'accuracy'] },
          slideId: { type: 'string' },
          blockId: { type: 'string' },
          path: { type: 'string' },
          theme: { type: 'string', enum: ['light', 'dark'] },
          evidence: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              box: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
              measured: { type: 'object', additionalProperties: { type: 'number' } },
              image: { type: 'string' },
            },
          },
          proposal: { type: 'string' },
          fix: { type: 'array', items: { type: 'object' } },
          source: { type: 'string' },
        },
        required: ['severity', 'kind', 'slideId', 'evidence', 'proposal', 'source'],
      },
    },
  },
  required: ['findings'],
};

/** The first JSON value in a text: a fenced block, then the outermost object or array. */
function extractJson(text) {
  if (typeof text !== 'string') return undefined;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    for (const opener of ['{', '[']) {
      const start = trimmed.indexOf(opener);
      const end = trimmed.lastIndexOf(opener === '{' ? '}' : ']');
      if (start < 0 || end <= start) continue;
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // try the next shape
      }
    }
  }
  return undefined;
}

/**
 * Runs one prompt through the runner and returns the parsed JSON answer (or undefined). A decisive
 * call (the preflight) drops the runner when it gets no answer; an authentication failure drops it
 * at any call, since a key does not become valid mid-run. Any other failed call is dropped alone.
 */
async function ask(runner, { name, prompt, decisive = false }) {
  if (runner.kind === 'none') return undefined;
  const t = Date.now();
  let raw;
  let error;
  let reason;
  try {
    if (runner.kind === 'sdk') raw = await askSdk(runner.sdk, prompt);
    else if (runner.kind === 'cli') raw = await askCli(prompt);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    reason = e instanceof RunnerError ? e.reason : 'exit';
  }
  const parsed = extractJson(raw);
  calls.push({
    name,
    runner: runner.kind,
    ms: Date.now() - t,
    ok: parsed !== undefined,
    error,
    ...(reason ? { reason } : {}),
    // the first characters of an answer that did not parse, so judge-log.json shows why
    ...(parsed === undefined && typeof raw === 'string' ? { raw: raw.slice(0, 600) } : {}),
  });
  if (parsed === undefined) log(`${name}: no JSON answer${error ? ` (${error})` : ''}`);
  if (reason === 'auth' || (decisive && parsed === undefined))
    dropRunner(
      runner,
      `${runner.kind} runner ${reason === 'auth' ? 'failed authentication' : `failed ${name}`} (${error ?? 'no JSON answer'})`,
    );
  return parsed;
}

async function askSdk(sdk, prompt) {
  const options = {
    cwd: bundleDir,
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'bypassPermissions',
    maxTurns: 40,
    ...(model ? { model } : {}),
  };
  const query = sdk.query({ prompt, options });
  const consume = (async () => {
    let text = '';
    for await (const message of query) {
      if (message.type !== 'result') continue;
      if (message.subtype === 'success' && message.is_error !== true) {
        text = typeof message.result === 'string' ? message.result : JSON.stringify(message.result);
      } else {
        const detail = String(
          message.result ?? (Array.isArray(message.errors) ? message.errors.join(' ') : ''),
        ).slice(0, 200);
        throw new RunnerError(
          `sdk ${message.subtype}: ${detail}`,
          isAuthFailure(message, detail) ? 'auth' : 'result',
        );
      }
    }
    return text;
  })();
  // The timer settles the call itself (the query may not honor interrupt), as askCli does.
  let timer;
  const timeout = new Promise((_, rejectTimeout) => {
    timer = setTimeout(() => {
      if (typeof query.interrupt === 'function') query.interrupt().catch(() => {});
      rejectTimeout(
        new RunnerError(
          `sdk gave no answer in ${timeoutS} s (raise --timeout-s for longer calls)`,
          'timeout',
        ),
      );
    }, timeoutS * 1000);
  });
  try {
    return await Promise.race([consume, timeout]);
  } finally {
    clearTimeout(timer);
    consume.catch(() => {});
  }
}

function askCli(prompt) {
  return new Promise((resolvePromise, reject) => {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(FINDING_SCHEMA),
      '--allowedTools',
      'Read',
      'Glob',
      'Grep',
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--max-budget-usd',
      String(budgetUsd),
      '--add-dir',
      bundleDir,
      ...(model ? ['--model', model] : []),
    ];
    const child = spawn('claude', args, {
      cwd: bundleDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // The timer settles the promise itself: a killed claude can leave a child of its own holding
    // the stdio pipes, and 'close' then waits for that child, not for the kill.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
      reject(
        new RunnerError(
          `claude gave no answer in ${timeoutS} s (killed; raise --timeout-s for longer calls)`,
          'timeout',
        ),
      );
    }, timeoutS * 1000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {}); // a child that exits before reading the prompt (EPIPE)
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new RunnerError(`claude did not start: ${e.message}`, 'exit'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0 && !stdout.trim())
        return reject(
          new RunnerError(
            `claude exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`,
            'exit',
          ),
        );
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch {
        return resolvePromise(stdout);
      }
      if (envelope && typeof envelope === 'object') {
        if (envelope.structured_output !== undefined)
          return resolvePromise(JSON.stringify(envelope.structured_output));
        if (
          envelope.is_error === true ||
          (typeof envelope.subtype === 'string' && envelope.subtype !== 'success')
        ) {
          // The CLI reports an API failure as subtype success with is_error, terminal_reason and
          // api_error_status set, and exits 0 (a refused key surfaces as 401 after about three
          // minutes of internal retries), so the reason reads terminal_reason and the status.
          const text = String(envelope.result ?? '').slice(0, 200);
          return reject(
            new RunnerError(
              `claude ${envelope.terminal_reason ?? envelope.subtype ?? 'error'}: ${text}`,
              isAuthFailure(envelope, text) ? 'auth' : 'result',
            ),
          );
        }
        if (typeof envelope.result === 'string') return resolvePromise(envelope.result);
      }
      resolvePromise(stdout);
    });
    child.stdin.end(prompt);
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Judges

function evidenceList(slideIds) {
  const lines = [
    `Bundle directory: ${bundleDir}`,
    `- sheet/sheet-light.json and sheet/sheet-dark.json: the cell maps (cell box to slide id); sheet/sheet-<theme>.png the sheets`,
    `- render/render.json: RenderRecord[] with block boxes, line counts, font sizes and weights, page errors, overflow; the PNG named by image is beside it`,
    `- lint.json: the linter's findings (source lint); do not repeat them`,
    `- document.json: the normalized document; outline.json: the numbered outline; numbers.json: the numerals per slide with their nouns`,
    '',
    `Slides to judge (${slideIds.length}), by id:`,
  ];
  for (const id of slideIds) {
    const n = order.indexOf(id) + 1;
    const light = renderRecords.find((r) => r.slideId === id && r.theme === 'light');
    const dark = renderRecords.find((r) => r.slideId === id && r.theme === 'dark');
    lines.push(
      `- ${id} (slide ${n}): render/${light?.image ?? '?'} and render/${dark?.image ?? '?'}`,
    );
  }
  return lines.join('\n');
}

function judgePrompt(lens, slideIds) {
  const entry = lensesJson.find((row) => row.id === lens);
  return [
    `You are the ${entry.name} judge of the Turboslide judge loop (docs/judge-loop.md) for deck ${documentJson.deck.id} at revision ${revision}.`,
    '',
    entry.prompt,
    '',
    evidenceList(slideIds),
    '',
    `Return only JSON: { "findings": Finding[] } with severity 2 and 3 only, source "judge:${lens}", slideId one of the ids above, blockId where one exists, evidence with the text or the measurement and a pixel box in sheet pixels (1600 by 900) where one exists, and one concrete proposal per finding. Report what you measured, not what you suspect. An empty list is a valid answer.`,
  ].join('\n');
}

function skepticPrompt(slideId, findings) {
  const n = order.indexOf(slideId) + 1;
  const slide = documentJson.slides[slideId];
  return [
    `You are the skeptic of the Turboslide judge loop (docs/judge-loop.md step 4) for slide ${slideId} (slide ${n}) of deck ${documentJson.deck.id} at revision ${revision}.`,
    '',
    'Keep or drop each judge finding below by checking it against the evidence in the bundle; drop what you cannot verify. Sharpen every kept finding whose change is one property into fix mutations (block.set or slide.set with slideId, blockId, path and value). Do not add findings the judges did not make.',
    '',
    evidenceList([slideId]),
    '',
    'The slide document:',
    '```json',
    JSON.stringify(slide, null, 2),
    '```',
    '',
    'The judge findings:',
    '```json',
    JSON.stringify(findings, null, 2),
    '```',
    '',
    'Return only JSON: { "findings": Finding[] } holding the kept findings, each with its original id and source kept when unchanged, or source "skeptic" when you sharpened it (proposal or fix changed). Severity 2 or 3 only.',
  ].join('\n');
}

function sanitizeFinding(raw, source, lens) {
  if (!raw || typeof raw !== 'object') return undefined;
  const slideId = typeof raw.slideId === 'string' ? raw.slideId : undefined;
  if (!slideId || !order.includes(slideId)) return undefined;
  const severity = Number(raw.severity);
  if (severity !== 2 && severity !== 3) return undefined;
  const proposal = typeof raw.proposal === 'string' ? raw.proposal.trim() : '';
  if (!proposal) return undefined;
  const kinds = ['defect', 'diagram', 'polish', 'copy', 'accuracy'];
  const kind = kinds.includes(raw.kind)
    ? raw.kind
    : lens === 'copy'
      ? 'copy'
      : lens === 'accuracy'
        ? 'accuracy'
        : 'defect';
  const rule =
    typeof raw.rule === 'string' && RULE_IDS.has(raw.rule)
      ? raw.rule
      : lens === 'copy'
        ? 'copy/metaphor-candidate'
        : lens === 'accuracy'
          ? 'numbers/contradiction'
          : 'lines/law';
  const evidence = {};
  const rawEvidence = raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {};
  if (typeof rawEvidence.text === 'string') evidence.text = rawEvidence.text;
  if (
    Array.isArray(rawEvidence.box) &&
    rawEvidence.box.length === 4 &&
    rawEvidence.box.every((v) => typeof v === 'number')
  )
    evidence.box = rawEvidence.box;
  if (rawEvidence.measured && typeof rawEvidence.measured === 'object') {
    const measured = Object.fromEntries(
      Object.entries(rawEvidence.measured).filter(([, v]) => typeof v === 'number'),
    );
    if (Object.keys(measured).length) evidence.measured = measured;
  }
  if (typeof rawEvidence.image === 'string') evidence.image = rawEvidence.image;
  const blockId =
    typeof raw.blockId === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(raw.blockId)
      ? raw.blockId
      : undefined;
  const finding = {
    id: `${source}|${slideId}|${blockId ?? ''}|${rule}|${typeof raw.id === 'string' ? raw.id.slice(0, 40) : ''}`,
    rule,
    severity,
    kind,
    slideId,
    ...(blockId ? { blockId } : {}),
    ...(typeof raw.path === 'string' ? { path: raw.path } : {}),
    ...(raw.theme === 'light' || raw.theme === 'dark' ? { theme: raw.theme } : {}),
    evidence,
    proposal,
    source,
  };
  if (
    Array.isArray(raw.fix) &&
    raw.fix.length > 0 &&
    raw.fix.every((m) => m && typeof m === 'object' && typeof m.op === 'string')
  )
    finding.fix = raw.fix;
  return finding;
}

function findingsOf(answer, source, lens) {
  const list = Array.isArray(answer)
    ? answer
    : answer && Array.isArray(answer.findings)
      ? answer.findings
      : [];
  const out = [];
  for (const raw of list) {
    const finding = sanitizeFinding(raw, source, lens);
    if (finding) out.push(finding);
  }
  return out;
}

const runner = await detectRunner();
runner.detected = runner.kind;
log(
  `runner: ${runner.kind}${runner.kind === 'none' ? ' (judges and skeptics skipped)' : ''}; judging ${judged.length} slide(s) with ${lenses.length} lens(es)`,
);

// The preflight: one small call before the judges. A binary on PATH is not a working runner (the
// claude CLI answers 401 API key is invalid after about three minutes of retries when the key it
// inherits is refused, and a call can hang), so a runner that cannot answer this is dropped after
// one call instead of failing every judge and skeptic call at --timeout-s each.
if (runner.kind !== 'none') {
  const t = Date.now();
  const answer = await ask(runner, {
    name: 'preflight',
    prompt:
      'This is the preflight of the Turboslide judge loop. Do not read any file. Return only JSON: { "findings": [] }',
    decisive: true,
  });
  if (answer !== undefined)
    log(`preflight: ${runner.kind} answered in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

const judgeFindings = [];
if (runner.kind !== 'none') {
  const batches = [];
  for (let i = 0; i < judged.length; i += 12) batches.push(judged.slice(i, i + 12));
  judges: for (const lens of lenses) {
    for (const batch of batches) {
      const answer = await ask(runner, {
        name: `judge:${lens} (${batch[0]}..${batch[batch.length - 1]})`,
        prompt: judgePrompt(lens, batch),
      });
      if (runner.kind === 'none') break judges; // dropped on an authentication failure
      const found = findingsOf(answer, `judge:${lens}`, lens);
      log(`judge:${lens}: ${found.length} finding(s) on ${batch.length} slide(s)`);
      judgeFindings.push(...found);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Skeptics

const skepticFindings = [];
const verdicts = [];
if (runner.kind !== 'none' && judgeFindings.length > 0) {
  const bySlide = new Map();
  for (const finding of judgeFindings)
    bySlide.set(finding.slideId, [...(bySlide.get(finding.slideId) ?? []), finding]);
  for (const [slideId, findings] of bySlide) {
    const answer = await ask(runner, {
      name: `skeptic (${slideId})`,
      prompt: skepticPrompt(slideId, findings),
    });
    if (answer === undefined) {
      // no verdict: every judge finding on the slide stands as the judge left it
      for (const finding of findings)
        verdicts.push({ id: finding.id, slideId, verdict: 'unreviewed' });
      skepticFindings.push(...findings);
      continue;
    }
    const kept = findingsOf(answer, 'skeptic').map((finding) => {
      const original = findings.find(
        (row) =>
          row.id === finding.id || (row.blockId === finding.blockId && row.rule === finding.rule),
      );
      const unchanged =
        original && original.proposal === finding.proposal && finding.fix === undefined;
      return unchanged ? original : { ...finding, source: 'skeptic' };
    });
    for (const finding of findings) {
      const keptRow = kept.find(
        (row) =>
          row.id === finding.id || (row.blockId === finding.blockId && row.rule === finding.rule),
      );
      verdicts.push({
        id: finding.id,
        slideId,
        verdict: keptRow ? (keptRow.source === 'skeptic' ? 'sharpened' : 'kept') : 'dropped',
      });
    }
    skepticFindings.push(...kept);
    log(`skeptic (${slideId}): ${kept.length} of ${findings.length} kept`);
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Fixers

const fixPlan = { applied: [], dryRun: !applyFixes, mechanical: null, patched: [] };
const mechanical = turboslide(
  [
    'fix',
    ...(selected.length === order.length ? ['all'] : selected),
    '--deck',
    deckDir,
    ...(applyFixes ? [] : ['--dry-run']),
    '--author',
    AUTHOR,
  ],
  { allowFailure: true },
);
fixPlan.mechanical = mechanical.json ?? { error: mechanical.stderr.trim().split('\n').pop() };
if (mechanical.json)
  log(
    `fix: ${mechanical.json.applied.length} mechanical fix(es) ${applyFixes ? 'applied' : 'planned'}, ${mechanical.json.remaining.length} finding(s) remain`,
  );

const withFix = skepticFindings.filter(
  (finding) => Array.isArray(finding.fix) && finding.fix.length > 0,
);
if (withFix.length > 0) {
  const bySlide = new Map();
  for (const finding of withFix)
    bySlide.set(finding.slideId, [...(bySlide.get(finding.slideId) ?? []), ...finding.fix]);
  for (const [slideId, mutations] of bySlide) {
    if (!applyFixes) {
      fixPlan.patched.push({ slideId, mutations, applied: false });
      continue;
    }
    const leased = turboslide(
      ['lease', slideId, '--deck', deckDir, '--author', AUTHOR, '--minutes', '10'],
      { allowFailure: true },
    );
    if (leased.code !== 0) {
      fixPlan.patched.push({
        slideId,
        mutations,
        applied: false,
        reason: leased.json?.message ?? 'lease refused',
      });
      continue;
    }
    const patched = turboslide(
      ['slide', 'patch', slideId, '--deck', deckDir, '--author', AUTHOR, '--mutations'],
      { input: JSON.stringify(mutations), allowFailure: true },
    );
    fixPlan.patched.push({
      slideId,
      mutations,
      applied: patched.code === 0,
      ...(patched.code === 0
        ? {}
        : { reason: patched.json?.message ?? patched.stderr.trim().split('\n').pop() }),
    });
    turboslide(['lease', slideId, '--deck', deckDir, '--author', AUTHOR, '--release'], {
      allowFailure: true,
    });
  }
}
if (
  applyFixes &&
  (fixPlan.patched.some((row) => row.applied) || (mechanical.json?.applied.length ?? 0) > 0)
) {
  const touched = [
    ...new Set([
      ...fixPlan.patched.filter((row) => row.applied).map((row) => row.slideId),
      ...(mechanical.json?.applied ?? []).map((f) => f.slideId),
    ]),
  ];
  log(`fix: re-rendering and re-linting ${touched.length} slide(s)`);
  turboslide(
    [
      'render',
      ...touched,
      '--deck',
      deckDir,
      '--theme',
      'light,dark',
      '--scale',
      '1',
      '--out',
      join(bundleDir, 'render-after-fix'),
    ],
    { allowFailure: true },
  );
}
writeJson(join(bundleDir, 'fixes.json'), fixPlan);

// ---------------------------------------------------------------------------------------------
// 6. The gate

const finalRevision = readJson(join(deckDir, 'deck.json')).revision;
const checks = [];
const lintRun = turboslide(['lint', 'all', '--deck', deckDir], { allowFailure: true });
const blocking = Array.isArray(lintRun.json)
  ? lintRun.json.filter((f) => f.severity === 3).length
  : null;
checks.push({
  name: 'lint',
  passed: lintRun.code === 0,
  detail:
    lintRun.code === 0
      ? `clean at severity 3 beyond the baseline (${blocking ?? '?'} known)`
      : `turboslide lint exited ${lintRun.code}`,
});
const pageErrors = renderRecords.filter(
  (record) => record.pageErrors && record.pageErrors.length > 0,
).length;
checks.push({
  name: 'render',
  passed: pageErrors === 0,
  detail: `${renderRecords.length} records, ${pageErrors} with page errors`,
});
if (withBuild) {
  const build = turboslide(
    ['build', '--deck', deckDir, '--out', join(bundleDir, 'deck.html'), '--budget', '16'],
    { allowFailure: true },
  );
  checks.push({
    name: 'build',
    passed: build.code === 0,
    detail: build.json ? `${build.json.bytes} bytes` : `exit ${build.code}`,
  });
}
const agentFindings =
  skepticFindings.length > 0 || judgeFindings.length === 0 ? skepticFindings : judgeFindings;
const severe = agentFindings.filter((finding) => finding.severity === 3).length;
checks.push({
  name: 'judges',
  passed: runner.kind === 'none' ? true : severe === 0,
  detail:
    runner.kind !== 'none'
      ? `${agentFindings.length} finding(s) kept, ${severe} at severity 3`
      : runner.dropped
        ? `skipped: ${runner.dropped}`
        : runnerWanted === 'none'
          ? 'skipped: --runner none'
          : 'skipped: no agent runner (install @anthropic-ai/claude-agent-sdk or put claude on PATH)',
  skipped: runner.kind === 'none',
});
const verdict = checks.every((check) => check.passed) ? 'ship' : 'hold';

const findings = [...lintFindings, ...agentFindings];
writeJson(outPath, findings);
writeJson(join(bundleDir, 'skeptics.json'), verdicts);
writeJson(join(bundleDir, 'judge-log.json'), {
  runner: runner.kind,
  detected: runner.detected,
  dropped: runner.dropped ?? null,
  model: model ?? null,
  lenses,
  slides: judged,
  calls,
});
writeJson(gatePath, {
  verdict,
  deckId: manifest.id,
  revision: finalRevision,
  judgedAtRevision: revision,
  checks,
  counts: {
    lint: lintFindings.length,
    judge: judgeFindings.length,
    skeptic: agentFindings.filter((f) => f.source === 'skeptic').length,
    kept: agentFindings.length,
    severity3: findings.filter((f) => f.severity === 3).length,
    severity2: findings.filter((f) => f.severity === 2).length,
    blockingLint: lintGate.blocking.length,
    knownLint: lintGate.known.length,
  },
  runner: runner.kind,
  runnerDetected: runner.detected,
  runnerDropped: runner.dropped ?? null,
  fixesApplied: applyFixes,
  ms: Date.now() - startedAt,
  generatedAt: new Date().toISOString(),
});
log(
  `gate: ${verdict} at revision ${finalRevision}; ${findings.length} finding(s) in ${outPath}; ${checks.map((c) => `${c.name} ${c.passed ? 'ok' : 'fail'}`).join(', ')}; ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
);
process.exit(0);
