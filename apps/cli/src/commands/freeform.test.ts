// The freeform commands over a fixture deck in a temp directory (docs/freeform.md): slide
// set-layout (slide.setLayout) both ways, block align (block.align), block distribute
// (block.distribute), block order (block.order) and the z target of block move (block.move), each
// through runCli with --json, so the CLI, the store actions and the schema arithmetic are
// exercised together and every write lands in the version log like any other.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { FREEFORM_SLIDE, WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };
type SlideResult = { slide: Slide; revision: number; findings: { rule: string }[] };

let deckDir: string;
let root: string;

async function run(argv: string[], stdin = ''): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir], {
    cwd: root,
    env: { USER: 'kevin' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => stdin,
  });
  let json: unknown;
  if (argv.includes('--json') && stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function slideFile(id: string): Slide {
  return JSON.parse(readFileSync(join(deckDir, 'slides', `${id}.json`), 'utf8')) as Slide;
}

function mainBlocks(slide: Slide): Block[] {
  return slide.kind === 'content' ? (slide.slots.main ?? []) : [];
}

function posOf(
  slide: Slide,
  id: string,
): { x: number; y: number; w: number; h: number; z?: number } {
  const pos = mainBlocks(slide).find((block) => block.id === id)?.pos;
  if (pos === undefined) throw new Error(`no pos on ${id}`);
  return pos;
}

describe('turboslide freeform commands', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-freeform-'));
    deckDir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(deckDir, 'slides'), { recursive: true });
    const deck = {
      ...WORKED_DECK,
      sections: WORKED_DECK.sections.map((section) =>
        section.id === 'website'
          ? { ...section, slideIds: [...section.slideIds, FREEFORM_SLIDE.id] }
          : section,
      ),
    };
    writeFileSync(join(deckDir, 'deck.json'), canonicalJson(deck));
    for (const slide of [...WORKED_SLIDES, FREEFORM_SLIDE])
      writeFileSync(join(deckDir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('the fixture validates and lints with the freeform rules only where planted', async () => {
    const ok = await run(['validate', '--json']);
    expect(ok.code).toBe(0);
    const lint = await run(['lint', 'free', '--json', '--layers', 'static']);
    expect(lint.code).toBe(0);
    const rules = (lint.json as { rule: string }[]).map((f) => f.rule);
    expect(rules).toContain('layout/freeform');
    expect(rules).not.toContain('freeform/off-sheet');
  });

  test('block align moves the named blocks to one snapped edge and writes a version', async () => {
    const r = await run([
      'block',
      'align',
      'free',
      '--blocks',
      'p1,box',
      '--edge',
      'top',
      '--json',
    ]);
    expect(r.code).toBe(0);
    const result = r.json as SlideResult;
    expect(result.revision).toBe(413);
    expect(posOf(result.slide, 'p1').y).toBe(129);
    expect(posOf(result.slide, 'box').y).toBe(129);
    expect(posOf(slideFile('free'), 'p1')).toMatchObject({ x: 137, y: 129, w: 480, h: 72 });
    const missing = await run(['block', 'align', 'free', '--blocks', 'nope', '--edge', 'left']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('No positioned block "nope"');
    const badEdge = await run(['block', 'align', 'free', '--blocks', 'p1', '--edge', 'diagonal']);
    expect(badEdge.code).toBe(2);
    const grammar = await run([
      'block',
      'align',
      'content-rule',
      '--blocks',
      'h',
      '--edge',
      'left',
    ]);
    expect(grammar.code).toBe(2);
    expect(grammar.stderr).toContain('not on the freeform layout');
  });

  test('block align with nothing to move writes no version but still checks the base', async () => {
    const before = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
      revision: number;
    };
    const r = await run([
      'block',
      'align',
      'free',
      '--blocks',
      'p1,box',
      '--edge',
      'top',
      '--json',
    ]);
    expect(r.code).toBe(0);
    expect((r.json as SlideResult).revision).toBe(before.revision);
    const stale = await run([
      'block',
      'align',
      'free',
      '--blocks',
      'p1,box',
      '--edge',
      'top',
      '--base-revision',
      '1',
      '--json',
    ]);
    expect(stale.code).toBe(1);
    expect(stale.json).toMatchObject({ error: 'ConflictError', status: 409 });
  });

  test('block distribute spreads three blocks with equal gaps', async () => {
    // p1 at y 129 (h 72), ic at 320 (h 32), rule at 760 (h 8): the span holds 112 px of blocks
    const r = await run([
      'block',
      'distribute',
      'free',
      '--blocks',
      'p1,ic,rule',
      '--axis',
      'vertical',
      '--json',
    ]);
    expect(r.code).toBe(0);
    const slide = (r.json as SlideResult).slide;
    const gap = (768 - 129 - 112) / 2;
    expect(posOf(slide, 'p1').y).toBe(129);
    expect(posOf(slide, 'ic').y).toBe(129 + 72 + gap);
    expect(posOf(slide, 'rule').y).toBe(760);
    const fixed = await run([
      'block',
      'distribute',
      'free',
      '--blocks',
      'p1,ic',
      '--axis',
      'vertical',
      '--gap',
      '16',
      '--json',
    ]);
    expect(fixed.code).toBe(0);
    expect(posOf((fixed.json as SlideResult).slide, 'ic').y).toBe(129 + 72 + 16);
    expect(
      (await run(['block', 'distribute', 'free', '--blocks', 'p1', '--axis', 'vertical'])).code,
    ).toBe(2);
  });

  test('block order and block move --z change the stack and renumber it densely', async () => {
    const front = await run(['block', 'order', 'free#h', '--move', 'front', '--json']);
    expect(front.code).toBe(0);
    const slide = (front.json as SlideResult).slide;
    expect(mainBlocks(slide).map((b) => [b.id, b.pos?.z])).toEqual([
      ['h', 5],
      ['p1', 0],
      ['box', 1],
      ['arrow', 2],
      ['rule', 3],
      ['ic', 4],
    ]);
    const rank = await run(['block', 'order', 'free#rule', '--z', '0', '--json']);
    expect(rank.code).toBe(0);
    expect(posOf((rank.json as SlideResult).slide, 'rule').z).toBe(0);
    expect(posOf((rank.json as SlideResult).slide, 'p1').z).toBe(1);
    const both = await run(['block', 'order', 'free#rule', '--move', 'back', '--z', '2']);
    expect(both.code).toBe(2);
    const moved = await run([
      'block',
      'move',
      'free#ic',
      '--slot',
      'main',
      '--after',
      'h',
      '--z',
      '9',
      '--json',
    ]);
    expect(moved.code).toBe(0);
    const after = (moved.json as SlideResult).slide;
    expect(mainBlocks(after).map((b) => b.id)).toEqual(['h', 'ic', 'p1', 'box', 'arrow', 'rule']);
    expect(posOf(after, 'ic').z).toBe(9);
  });

  test('slide set-layout moves a grammar slide to freeform and back with the blocks refiled', async () => {
    const free = await run(['slide', 'set-layout', 'content-rule', '--type', 'freeform', '--json']);
    expect(free.code).toBe(0);
    const slide = (free.json as SlideResult).slide;
    expect(slide.kind === 'content' && slide.layout).toEqual({ type: 'freeform' });
    expect(mainBlocks(slide).map((b) => b.id)).toEqual(['h', 'p1', 'list']);
    expect(posOf(slide, 'list')).toEqual({ x: 836, y: 129, w: 627, h: 642, z: 2 });
    expect((free.json as SlideResult).findings.some((f) => f.rule === 'layout/freeform')).toBe(
      true,
    );
    const back = await run([
      'slide',
      'set-layout',
      'content-rule',
      '--type',
      'cols',
      '--ratio',
      '1/1',
      '--json',
    ]);
    expect(back.code).toBe(0);
    const cols = (back.json as SlideResult).slide;
    expect(cols.kind === 'content' && cols.layout).toEqual({
      type: 'cols',
      ratio: '1/1',
      gap: 72,
      align: 'center',
    });
    expect(cols.kind === 'content' && cols.slots.left?.map((b) => b.id)).toEqual(['h', 'p1']);
    expect(cols.kind === 'content' && cols.slots.right?.map((b) => b.id)).toEqual(['list']);
    expect(cols.kind === 'content' && cols.slots.right?.[0]?.pos).toBeUndefined();
    const json = await run([
      'slide',
      'set-layout',
      'content-rule',
      '--layout',
      '{"type":"split","gap":44,"head":{"cols":"4/8"}}',
      '--json',
    ]);
    expect(json.code).toBe(0);
    // between grammar layouts the slots map by index: left to headLeft, right to headRight
    const split = (json.json as SlideResult).slide;
    expect(split.kind === 'content' && Object.keys(split.slots).sort()).toEqual([
      'headLeft',
      'headRight',
    ]);
    expect((await run(['slide', 'set-layout', 'content-rule', '--type', 'nope'])).code).toBe(2);
    expect((await run(['slide', 'set-layout', 'thesis', '--type', 'freeform'])).code).toBe(2);
    expect((await run(['slide', 'set-layout', 'content-rule'])).code).toBe(2);
  });
});
