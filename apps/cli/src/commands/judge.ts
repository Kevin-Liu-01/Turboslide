// `turboslide judge bundle [ids|all] --out <dir> [--render <dir>] [--fresh] [--json]` (SPEC 7.2,
// 7.6 step 1; MILESTONES M4 item 4): packages the evidence a judge run reads into one directory,
// so the harness (scripts/judge-loop.mjs) and a person open the same files. The bundle holds the
// renders of every selected slide in both themes with render.json, the contact sheets with their
// cell maps and the lint overlay, the mechanical findings (lint.json) with the gate against
// known-findings.json, the normalized document, the outline, the numerals per slide with their
// nouns (SPEC 7.6 step 3), the six lens instructions as the deck_review prompt states them, and
// bundle.json naming every file and the revision. Renders are reused from the last `turboslide
// render` when they are at the current revision and cover the selection; otherwise, or with
// --fresh, the render command runs into the bundle. The action output is { dir, files, revision }.
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import { blockTexts, slideTexts } from '@turboslide/lint/context';
import { gate, lintDeck } from '@turboslide/lint/run';
import { JUDGE_LENSES, deckReviewPrompt } from '@turboslide/mcp/prompts';
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideTitle } from '@turboslide/schema/deck';
import type { Finding } from '@turboslide/schema/findings';
import type { RenderRecord } from '@turboslide/schema/render';
import { openFileStore } from '@turboslide/store/file-store';

import { flagBoolean, flagString, parseArgs } from '../args.ts';
import type { CommandContext } from '../context.ts';
import {
  derivedDir,
  findDeckDir,
  loadDeck,
  readKnownFindings,
  readRenderRecords,
  resolveOut,
  writeJson,
} from '../deck-files.ts';
import { lintLists } from '../deps/theme.ts';
import { EXIT, UsageError } from '../exit.ts';
import type { Output } from '../output.ts';
import { selectSlides } from '../select.ts';
import { render } from './render.ts';
import { sheet } from './sheet.ts';

const USAGE = `usage: turboslide judge bundle [ids|all] --out <dir> [--render <dir>] [--fresh] [--json]
  bundle   renders (both themes), sheets with cell maps and the lint overlay, lint.json with the gate,
           the document, the outline, the numerals per slide and the six lens instructions in one directory`;

export type JudgeBundleInput = {
  slideIds: 'all' | string[];
  out: string;
  /** Where the last render's records are; the derived render directory by default. */
  render?: string;
  /** Render again even when the last render is current. */
  fresh?: boolean;
};

export type JudgeBundleResult = { dir: string; files: string[]; revision: number };

type Command = (ctx: CommandContext) => Promise<number>;

/** Runs a sibling command with its --json result captured and its human lines on this run's stderr. */
async function runCommand(
  ctx: CommandContext,
  command: Command,
  argv: string[],
): Promise<{ code: number; result: unknown }> {
  let result: unknown;
  const args = parseArgs(argv);
  const out: Output = {
    json: true,
    human: (line) => ctx.out.warn(line),
    warn: (line) => ctx.out.warn(line),
    result: (value) => {
      result = value;
    },
  };
  const code = await command({
    args,
    out,
    cwd: ctx.cwd,
    env: ctx.env,
    author: ctx.author,
    rest: args.positionals,
    readStdin: async () => '',
  });
  return { code, result };
}

/** The numerals of a slide with the noun that follows each, for the accuracy judge (SPEC 7.6 step 3). */
export function numeralsOf(
  slide: Slide,
): { text: string; value: number; noun: string; path: string }[] {
  const out: { text: string; value: number; noun: string; path: string }[] = [];
  const pattern = /(\d[\d,]*(?:\.\d+)?)\s*(%|percent|[A-Za-z][A-Za-z-]*)/g;
  const push = (path: string, text: string): void => {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] ?? '';
      const noun = (match[2] ?? '').toLowerCase();
      out.push({ text: match[0], value: Number(raw.replace(/,/g, '')), noun, path });
    }
  };
  for (const ref of slideTexts(slide)) push(ref.path, ref.text);
  for (const { block } of slideBlocks(slide)) {
    for (const ref of blockTexts(block)) push(`${block.id}${ref.path}`, ref.text);
  }
  return out;
}

/** True when the records cover every selected slide in both themes at this revision. */
function recordsCurrent(
  records: readonly RenderRecord[],
  ids: readonly string[],
  revision: number,
): boolean {
  return ids.every((id) =>
    (['light', 'dark'] as const).every((theme) =>
      records.some(
        (record) => record.slideId === id && record.theme === theme && record.revision === revision,
      ),
    ),
  );
}

export async function judgeBundle(
  ctx: CommandContext,
  input: JudgeBundleInput,
): Promise<JudgeBundleResult> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = input.slideIds === 'all' ? [...loaded.order] : input.slideIds;
  for (const id of ids)
    if (!loaded.order.includes(id)) throw new UsageError(`no slide "${id}" in deck.json sections`);
  const { document } = await openFileStore({ dir }).read();
  const revision = document.deck.revision;
  const derived = derivedDir(dir, ctx.cwd);
  const outDir = resolveOut(ctx.cwd, input.out, join(derived, 'judge'));
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const add = (path: string): string => {
    files.push(relative(outDir, path) || basename(path));
    return path;
  };

  // 1. Renders: reuse the last render when it is current, else render into the bundle.
  const renderDir = join(outDir, 'render');
  const sourceDir = resolveOut(ctx.cwd, input.render, join(derived, 'render'));
  const sourceRecords = readRenderRecords(join(sourceDir, 'render.json'));
  let records: RenderRecord[] = [];
  if (input.fresh === true) rmSync(renderDir, { recursive: true, force: true });
  if (input.fresh !== true && recordsCurrent(sourceRecords, ids, revision)) {
    mkdirSync(renderDir, { recursive: true });
    for (const record of sourceRecords) {
      if (!ids.includes(record.slideId)) continue;
      const image = isAbsolute(record.image) ? record.image : resolve(sourceDir, record.image);
      if (!existsSync(image)) continue;
      const target = join(renderDir, basename(image));
      if (resolve(target) !== resolve(image)) copyFileSync(image, target);
      records.push({ ...record, image: basename(image) });
      add(target);
    }
    ctx.out.human(
      `judge: reused ${records.length} render record(s) at revision ${revision} from ${sourceDir}`,
    );
  } else {
    const run = await runCommand(ctx, render, [
      ...(ids.length === loaded.order.length ? ['all'] : ids),
      '--deck',
      dir,
      '--theme',
      'light,dark',
      '--scale',
      '1',
      '--out',
      renderDir,
    ]);
    if (!Array.isArray(run.result))
      throw new UsageError('judge: the render command produced no records');
    records = run.result as RenderRecord[];
    for (const record of records)
      add(isAbsolute(record.image) ? record.image : resolve(renderDir, record.image));
    if (run.code !== EXIT.ok)
      ctx.out.warn(`judge: render exited ${run.code} (page errors are in render.json)`);
  }
  await writeJson(add(join(renderDir, 'render.json')), records);

  // 2. Lint with the gate, then the sheets with the lint overlay.
  const findings: Finding[] = lintDeck(document, records, {
    layers: 'both',
    ...(ids.length === loaded.order.length ? {} : { slideIds: ids }),
    ...lintLists(),
  });
  const known = readKnownFindings(dir);
  const gated = gate(findings, known);
  await writeJson(add(join(outDir, 'lint.json')), findings);
  await writeJson(add(join(outDir, 'lint-gate.json')), {
    revision,
    blocking: gated.blocking,
    known: gated.known,
    counts: gated.counts,
    passed: gated.blocking.length === 0,
  });
  await writeJson(add(join(outDir, 'known-findings.json')), known);
  const sheetDir = join(outDir, 'sheet');
  const sheetRun = await runCommand(ctx, sheet, [
    ...(ids.length === loaded.order.length ? ['all'] : ids),
    '--deck',
    dir,
    '--render',
    renderDir,
    '--out',
    sheetDir,
    '--cols',
    '4',
    '--thumb',
    '480',
    '--numbered',
    '--overlay',
    'lint',
    '--findings',
    join(outDir, 'lint.json'),
  ]);
  const written =
    (sheetRun.result as { sheets?: { theme: string; png: string; map: string }[] } | undefined)
      ?.sheets ?? [];
  for (const row of written) {
    add(row.png);
    add(row.map);
  }

  // 3. The document, the outline, the numerals and the lens instructions.
  await writeJson(add(join(outDir, 'document.json')), document);
  let n = 0;
  const outline = document.deck.sections.map((section) => ({
    id: section.id,
    name: section.name,
    slides: section.slideIds.flatMap((id) => {
      const slide = document.slides[id];
      if (slide === undefined) return [];
      n += 1;
      return [{ id, n, title: slideTitle(slide, n), kind: slide.kind, selected: ids.includes(id) }];
    }),
  }));
  await writeJson(add(join(outDir, 'outline.json')), outline);
  const numbers = ids.map((id) => {
    const slide = document.slides[id];
    return { slideId: id, numerals: slide === undefined ? [] : numeralsOf(slide) };
  });
  await writeJson(add(join(outDir, 'numbers.json')), numbers);
  const lenses = JUDGE_LENSES.map((lens) => {
    const prompt = deckReviewPrompt(
      { lens: lens.id, ...(ids.length === loaded.order.length ? {} : { slideIds: ids.join(',') }) },
      { id: document.deck.id, revision },
    );
    const first = prompt.messages[0]?.content;
    return {
      id: lens.id,
      name: lens.name,
      instructions: lens.instructions,
      source: `judge:${lens.id}`,
      prompt: first !== undefined && first.type === 'text' ? first.text : '',
    };
  });
  await writeJson(add(join(outDir, 'lenses.json')), lenses);
  writeFileSync(
    add(join(outDir, 'lenses.md')),
    [
      `# Judge lenses for ${document.deck.id} at revision ${revision}`,
      '',
      'One lens at a time (SPEC 7.6 step 3). Read sheet/sheet-<theme>.json first, then the renders under render/, beside render.json (boxes, line counts, font sizes and weights), lint.json (do not repeat a mechanical finding) and numbers.json (the numerals per slide). Return Finding[] at severity 2 and 3 only, each with slideId, blockId where one exists, evidence, a concrete proposal and source judge:<lens>.',
      '',
      ...lenses.flatMap((lens) => [`## ${lens.name} (\`${lens.id}\`)`, '', lens.instructions, '']),
    ].join('\n'),
  );
  writeFileSync(
    add(join(outDir, 'README.md')),
    [
      `# Judge bundle: ${document.deck.id} at revision ${revision}`,
      '',
      `Written by \`turboslide judge bundle\` on ${new Date().toISOString()} for ${ids.length} of ${loaded.order.length} slides.`,
      '',
      '| File | What it is |',
      '| --- | --- |',
      '| `render/render.json` | RenderRecord[] for every selected slide in both themes; `image` is the PNG beside it |',
      '| `sheet/sheet-<theme>.png`, `sheet/sheet-<theme>.json` | the contact sheets with the lint overlay and their cell maps (cell box to slide id) |',
      '| `lint.json` | Finding[] from the grammar linter, source `lint` |',
      '| `lint-gate.json` | the severity 3 findings split into blocking and known, with the counts |',
      "| `known-findings.json` | the deck's baseline of accepted severity 3 findings |",
      '| `document.json` | the normalized document (deck.json plus every slide) |',
      '| `outline.json` | sections and slides with numbers and titles; `selected` marks the slides in this bundle |',
      '| `numbers.json` | the numerals of every selected slide with the noun each precedes, for the accuracy judge |',
      '| `lenses.json`, `lenses.md` | the six judge lenses with the deck_review prompt text per lens |',
      '| `bundle.json` | this list with the revision, the slide ids and the counts |',
      '',
      'The harness is `node scripts/judge-loop.mjs --deck <dir> --bundle <this dir> --out findings.json --gate gate.json` (docs/judge-loop.md).',
      '',
    ].join('\n'),
  );
  const bundleJson = join(outDir, 'bundle.json');
  files.push(basename(bundleJson));
  const sortedFiles = [...new Set(files)].sort();
  await writeJson(bundleJson, {
    deckId: document.deck.id,
    revision,
    generatedAt: new Date().toISOString(),
    slideIds: ids,
    counts: {
      slides: ids.length,
      records: records.length,
      findings: findings.length,
      blocking: gated.blocking.length,
      known: gated.known.length,
      lenses: lenses.length,
    },
    lenses: lenses.map((lens) => lens.id),
    files: sortedFiles,
  });
  ctx.out.human(
    `judge: bundle at ${outDir}: ${records.length} render record(s), ${written.length} sheet(s), ${findings.length} finding(s) (${gated.blocking.length} blocking, ${gated.known.length} known), ${lenses.length} lenses, revision ${revision}`,
  );
  return { dir: outDir, files: sortedFiles, revision };
}

export async function judge(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  if (sub !== 'bundle') throw new UsageError(`unknown subcommand "judge ${sub ?? ''}"\n${USAGE}`);
  const out = flagString(ctx.args, 'out');
  if (out === undefined) throw new UsageError(`judge bundle needs --out <dir>\n${USAGE}`);
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, rest);
  const all = rest.length === 0 || rest.includes('all');
  const renderFlag = flagString(ctx.args, 'render');
  const result = await judgeBundle(ctx, {
    slideIds: all ? 'all' : ids,
    out,
    ...(renderFlag !== undefined ? { render: renderFlag } : {}),
    fresh: flagBoolean(ctx.args, 'fresh'),
  });
  ctx.out.result(result);
  return EXIT.ok;
}
