// The canvas conversion from the CLI (gslides-parity SPEC-2 1.3, 1.6, 11.5 canvas.test.ts, 11.8
// item 4): `slide to-canvas` (slide.toCanvas) on one slide of every kind of a temp copy of the GT
// deck writes `pos` equal to the recording under `__fixtures__/canvas-walk/<slideId>.json` (the
// walk's `.turboslide/canvas-walk/<slideId>.json` when it has recorded one), several ids open one
// browser page (0.104), `block set <slide>#<block> /pos` (block.set) on a grammar slide converts
// and moves in one revision, `slide set-layout --type freeform` (slide.setLayout) is the same
// measured conversion, the fresh Title slide of `slide new` converts at the prompts' boxes with no
// height under one line box (0.97), a converted slide validates with no issue (0.99), and
// `deck guides` (deck.guides) adds and clears the guide lines. Runs where the Chrome for Testing
// binary playwright-core installs exists; every canvas write here opens a headless sheet page.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { minLineBox } from '@turboslide/schema/canvas';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Position } from '@turboslide/schema/position';

import { runCli } from '../cli.ts';
import { headlessStats } from '../deps/canvas.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };
type SlideResult = { slide: Slide; revision: number };
type ToCanvasResult = {
  slides: {
    slideId: string;
    converted: boolean;
    template?: string;
    objects: { id: string; pos: Position }[];
  }[];
  revision: number;
};
type Recording = { deck: string; slideId: string; objects: Record<string, Position> };

const REPO = join(import.meta.dirname, '..', '..', '..', '..');
const GT_DECK = join(REPO, 'decks', 'gt-brand');
const COMMITTED = join(import.meta.dirname, '__fixtures__', 'canvas-walk');
const WALK = join(REPO, '.turboslide', 'canvas-walk');
/** One slide of every kind of the GT deck, the six the walk of 11.8 converts. */
const KINDS = ['title', 'thesis', 'opener-brand', 'mood-earth', 'closing', 'content-rule'];

let root: string;
let deckDir: string;

/** A copy of the GT deck without its version log, so the temp deck starts at the committed revision. */
function copyDeck(to: string): void {
  mkdirSync(join(to, 'slides'), { recursive: true });
  mkdirSync(join(to, 'assets'), { recursive: true });
  writeFileSync(join(to, 'deck.json'), readFileSync(join(GT_DECK, 'deck.json')));
  for (const file of readdirSync(join(GT_DECK, 'slides')))
    writeFileSync(join(to, 'slides', file), readFileSync(join(GT_DECK, 'slides', file)));
  for (const file of readdirSync(join(GT_DECK, 'assets')))
    writeFileSync(join(to, 'assets', file), readFileSync(join(GT_DECK, 'assets', file)));
}

async function run(argv: string[], dir = deckDir): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', dir], {
    cwd: root,
    env: { USER: 'kevin' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (argv.includes('--json') && stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

/** The recording the CLI's pos must equal: the walk's when it ran, else the committed one. */
function recording(slideId: string): Recording {
  const walked = join(WALK, `${slideId}.json`);
  const file = existsSync(walked) ? walked : join(COMMITTED, `${slideId}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Recording;
}

function slideFile(id: string, dir = deckDir): Slide {
  return JSON.parse(readFileSync(join(dir, 'slides', `${id}.json`), 'utf8')) as Slide;
}

function manifest(dir = deckDir): Deck {
  return JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
}

function mainBlocks(slide: Slide): Block[] {
  return slide.kind === 'content' ? (slide.slots.main ?? []) : [];
}

describe('turboslide slide to-canvas', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-canvas-'));
    deckDir = join(root, 'decks', 'gt-brand');
    copyDeck(deckDir);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('converts one slide of every kind at the recorded pos, six ids on one browser page', async () => {
    const launches = headlessStats.launches;
    const before = manifest().revision;
    const r = await run(['slide', 'to-canvas', KINDS.join(','), '--json']);
    expect(r.code, r.stderr).toBe(0);
    // one browser, one sheet page for the call (SPEC-2 0.104)
    expect(headlessStats.launches).toBe(launches + 1);
    const result = r.json as ToCanvasResult;
    expect(result.revision).toBe(before + 1);
    // the rows come in deck order, whatever the order of the ids
    expect([...result.slides.map((row) => row.slideId)].sort()).toEqual([...KINDS].sort());
    for (const row of result.slides) {
      const recorded = recording(row.slideId);
      expect(row.converted, row.slideId).toBe(true);
      const got = Object.fromEntries(row.objects.map((object) => [object.id, object.pos]));
      expect(got, row.slideId).toEqual(recorded.objects);
      // the file holds the same objects with the record of what the slide was
      const stored = slideFile(row.slideId);
      expect(stored.kind).toBe('content');
      expect(stored.kind === 'content' && stored.layout).toEqual({ type: 'freeform' });
      expect(stored.grammar).toBeDefined();
      expect(Object.fromEntries(mainBlocks(stored).map((b) => [b.id, b.pos]))).toEqual(
        recorded.objects,
      );
      expect(stored.template).toBe(row.template);
    }
    // the opener's photograph is the picture object at the bottom of the stack with its side
    const opener = slideFile('opener-brand');
    expect(mainBlocks(opener)[0]).toMatchObject({
      type: 'picture',
      asset: 'opener-brand',
      side: 'lower-left',
      pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
    });
    // every converted slide validates with no issue (0.99)
    const ok = await run(['validate', deckDir, '--json']);
    expect(ok.code, ok.stderr).toBe(0);
    // a second call on converted slides writes nothing and opens no browser
    const again = await run(['slide', 'to-canvas', 'title,thesis', '--json']);
    expect(again.code).toBe(0);
    expect((again.json as ToCanvasResult).revision).toBe(before + 1);
    expect(headlessStats.launches).toBe(launches + 1);
  });

  test('block set /pos on a grammar slide converts and moves in one revision', async () => {
    const before = manifest().revision;
    const grammar = slideFile('audience');
    expect(grammar.kind === 'content' && grammar.layout.type).not.toBe('freeform');
    const r = await run([
      'block',
      'set',
      'audience#h',
      '/pos',
      '{"x":137,"y":129,"w":600,"h":80,"z":0}',
      '--json',
    ]);
    expect(r.code, r.stderr).toBe(0);
    const result = r.json as SlideResult;
    expect(result.revision).toBe(before + 1);
    expect(result.slide.kind === 'content' && result.slide.layout).toEqual({ type: 'freeform' });
    expect(mainBlocks(result.slide).find((b) => b.id === 'h')?.pos).toEqual({
      x: 137,
      y: 129,
      w: 600,
      h: 80,
      z: 0,
    });
    expect(mainBlocks(result.slide).every((b) => b.pos !== undefined)).toBe(true);
    expect(result.slide.grammar?.kind).toBe('content');
    // the version log holds one entry for the write
    expect(readdirSync(join(deckDir, 'versions')).filter((f) => f.endsWith('.json'))).toHaveLength(
      2,
    );
  });

  test('slide set-layout --type freeform is the same measured conversion', async () => {
    const other = join(root, 'decks', 'gt-copy');
    copyDeck(other);
    const r = await run(
      ['slide', 'set-layout', 'content-rule', '--type', 'freeform', '--json'],
      other,
    );
    expect(r.code, r.stderr).toBe(0);
    const slide = (r.json as SlideResult).slide;
    expect(Object.fromEntries(mainBlocks(slide).map((b) => [b.id, b.pos]))).toEqual(
      recording('content-rule').objects,
    );
    expect(slide.grammar).toMatchObject({
      kind: 'content',
      layout: { type: 'cols', ratio: '1/1' },
    });
  });

  test('the fresh Title slide converts at the prompts’ boxes with no height under one line box', async () => {
    const made = await run(['slide', 'new', '--layout', 'title', '--id', 'fresh-title', '--json']);
    expect(made.code, made.stderr).toBe(0);
    const r = await run(['slide', 'to-canvas', 'fresh-title', '--json']);
    expect(r.code, r.stderr).toBe(0);
    const slide = slideFile('fresh-title');
    const blocks = mainBlocks(slide);
    expect(blocks.map((b) => b.id)).toEqual(['mark', 'heading', 'lead']);
    for (const block of blocks) {
      expect(block.pos?.h, block.id).toBeGreaterThanOrEqual(1);
      expect(block.pos?.w, block.id).toBeGreaterThan(0);
    }
    const heading = blocks[1]!;
    const lead = blocks[2]!;
    expect(heading.pos?.h).toBeGreaterThanOrEqual(minLineBox(heading));
    expect(lead.pos?.h).toBeGreaterThanOrEqual(minLineBox(lead));
    // the prompts' boxes are what the stage draws: at the rail, the heading under the mark, the lead under the heading
    expect(heading.pos).toMatchObject({ x: 137 });
    expect(lead.pos).toMatchObject({ x: 137 });
    expect(heading.pos!.y).toBeGreaterThan(blocks[0]!.pos!.y);
    expect(lead.pos!.y).toBeGreaterThan(heading.pos!.y);
    const ok = await run(['validate', deckDir, '--json']);
    expect(ok.code, ok.stderr).toBe(0);
  });

  test('deck guides adds a vertical guide at 800 and clears the field', async () => {
    const added = await run(['deck', 'guides', '--add-vertical', '800', '--json']);
    expect(added.code, added.stderr).toBe(0);
    expect(manifest().guides).toEqual({ x: [800], y: [] });
    const horizontal = await run(['deck', 'guides', '--add-horizontal', '450', '--json']);
    expect(horizontal.code).toBe(0);
    expect(manifest().guides).toEqual({ x: [800], y: [450] });
    const cleared = await run(['deck', 'guides', '--clear', '--json']);
    expect(cleared.code, cleared.stderr).toBe(0);
    expect(manifest().guides).toBeUndefined();
    const bad = await run(['deck', 'guides', '--json']);
    expect(bad.code).toBe(2);
  });
});
