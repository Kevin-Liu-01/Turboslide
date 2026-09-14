// The dither and background commands over a scratch copy of the fixture deck (gslides-parity
// SPEC-3 10.5, 10.6, 12, 16.6 cli row): `block dither` writes the field with the Photograph
// numbers or every flag, refuses a value outside its range, removes the field with --off and
// answers the variant key with a warning until a variant is materialized; `picture materialize
// --dry-run` names the missing variants and the write path refuses with the pipeline named until
// it is bound; `slide background-picture --asset ... --dither` puts a covering picture at the back
// of each named slide in one write and replaces it on a second call; `version diff` groups the
// writes by author; `slide background-material` needs the materials pipeline. The deck validates
// after every write. Ids named for the coverage test: picture.dither, picture.materialize,
// slide.setBackgroundPicture, slide.setBackgroundMaterial, version.diff.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { DITHER_PHOTOGRAPH_VALUE, DITHER_TOGGLE_VALUE } from '@turboslide/schema/blocks/dither';

import { runCli } from '../cli.ts';

const FIXTURE = join(import.meta.dirname, '..', '..', '..', '..', 'decks', 'fixture', 'gslides');

type Run = { code: number; stdout: string; stderr: string; json: unknown };
type Slide = {
  slots: Record<
    string,
    {
      id: string;
      type: string;
      pos?: { x: number; y: number; w: number; h: number; z?: number };
      dither?: Record<string, unknown>;
      asset?: string;
    }[]
  >;
};

let root: string;
let deckDir: string;

async function run(argv: string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir, '--json', '--author', 'tester'], {
    cwd: root,
    env: { USER: 'tester' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function slide(id: string): Slide {
  return JSON.parse(readFileSync(join(deckDir, 'slides', `${id}.json`), 'utf8')) as Slide;
}

function blocks(id: string): Slide['slots'][string] {
  return Object.values(slide(id).slots).flat();
}

async function validates(): Promise<void> {
  const result = await run(['validate', deckDir]);
  expect(result.code, result.stderr).toBe(0);
}

describe('turboslide block dither, picture materialize and slide background-picture', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-dither-'));
    mkdirSync(join(root, 'decks'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    deckDir = join(root, 'decks', 'gslides');
    cpSync(FIXTURE, deckDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('block dither with the Photograph numbers writes the field and answers the key with the materialize warning', async () => {
    const result = await run([
      'block',
      'dither',
      'rotated#photo',
      '--pattern',
      'bayer8',
      '--black',
      '120',
      '--white',
      '230',
      '--gamma',
      '0.9',
    ]);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as {
      revision: number;
      key?: string;
      warnings: string[];
      metrics?: unknown;
    };
    expect(answer.key).toMatch(/^[0-9a-f]{12,}$/);
    expect(answer.metrics).toBeUndefined();
    expect(answer.warnings.some((line) => /materialize/.test(line))).toBe(true);
    const photo = blocks('rotated').find((block) => block.id === 'photo');
    expect(photo?.dither).toEqual({
      ...DITHER_TOGGLE_VALUE,
      pattern: 'bayer8',
      black: 120,
      white: 230,
      gamma: 0.9,
    });
    await validates();
  }, 30_000);

  test('--photograph is the dialog preset, no flag the identity, a value outside its range is refused, --off removes the field', async () => {
    const preset = await run(['block', 'dither', 'shadow#photo', '--photograph']);
    expect(preset.code, preset.stderr).toBe(0);
    expect(blocks('shadow').find((block) => block.id === 'photo')?.dither).toEqual(
      DITHER_PHOTOGRAPH_VALUE,
    );
    const identity = await run(['block', 'dither', 'shadow#photo']);
    expect(identity.code, identity.stderr).toBe(0);
    expect(blocks('shadow').find((block) => block.id === 'photo')?.dither).toEqual(
      DITHER_TOGGLE_VALUE,
    );
    const strength = await run(['block', 'dither', 'shadow#photo', '--strength', '1.5']);
    expect(strength.code).toBe(2);
    const cell = await run(['block', 'dither', 'shadow#photo', '--cell', '5']);
    expect(cell.code).toBe(2);
    const pattern = await run(['block', 'dither', 'shadow#photo', '--pattern', 'ordered']);
    expect(pattern.code).toBe(2);
    const partial = await run([
      'block',
      'dither',
      'shadow#photo',
      '--strength',
      '0.6',
      '--tone',
      'three',
      '--steps',
      '3',
    ]);
    expect(partial.code, partial.stderr).toBe(0);
    expect(blocks('shadow').find((block) => block.id === 'photo')?.dither).toMatchObject({
      strength: 0.6,
      tone: 'three',
      steps: 3,
    });
    const off = await run(['block', 'dither', 'shadow#photo', '--off']);
    expect(off.code, off.stderr).toBe(0);
    expect(blocks('shadow').find((block) => block.id === 'photo')?.dither).toBeUndefined();
    const notAPicture = await run(['block', 'dither', 'title#h', '--photograph']);
    expect(notAPicture.code).toBe(2);
    await validates();
  }, 30_000);

  test('picture materialize --dry-run names the missing variant; the write path renders the variants through the dither pipeline', async () => {
    const dry = await run(['picture', 'materialize', '--dry-run']);
    expect(dry.code, dry.stderr).toBe(0);
    const answer = dry.json as {
      written: unknown[];
      pruned: unknown[];
      missing: { slideId: string; blockId: string; assetId: string; key: string }[];
    };
    expect(answer.written).toEqual([]);
    // the fixture's two dither slides (SPEC-3 16) carry their variants since merge 2; the picture
    // dithered above is the one missing
    expect(answer.missing.map((row) => `${row.slideId}#${row.blockId}`).sort()).toEqual([
      'rotated#photo',
    ]);
    expect(answer.missing.every((row) => row.assetId === 'fixture-photo')).toBe(true);
    const one = await run(['picture', 'materialize', 'rotated', '--dry-run']);
    expect((one.json as { missing: unknown[] }).missing).toHaveLength(1);
    const none = await run(['picture', 'materialize', 'title', '--dry-run']);
    expect((none.json as { missing: unknown[] }).missing).toEqual([]);
    const scale = await run(['picture', 'materialize', '--scale', '3', '--dry-run']);
    expect(scale.code).toBe(2);
    // the write path runs the materials package's pipeline (bound at merge 2, b5.md request 3):
    // one variant per missing key, the files under the deck, nothing missing afterwards
    const write = await run(['picture', 'materialize']);
    expect(write.code, write.stderr).toBe(0);
    const written = write.json as {
      written: { assetId: string; key: string; files: string[] }[];
      missing: unknown[];
    };
    expect(written.missing).toEqual([]);
    expect(written.written.length).toBeGreaterThanOrEqual(1);
    expect(written.written.every((row) => row.assetId === 'fixture-photo')).toBe(true);
    for (const row of written.written) {
      expect(row.files.length).toBeGreaterThan(0);
      for (const file of row.files) expect(existsSync(join(deckDir, file))).toBe(true);
    }
    const after = await run(['picture', 'materialize', '--dry-run']);
    expect((after.json as { missing: unknown[] }).missing).toEqual([]);
    await validates();
  }, 60_000);

  test('slide background-picture --asset --dither puts a covering picture at the back of each slide in one write and replaces it', async () => {
    const before = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
      revision: number;
    };
    const result = await run([
      'slide',
      'background-picture',
      'title,breaks',
      '--asset',
      'fixture-photo',
      '--dither',
    ]);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as {
      revision: number;
      assetId: string;
      slides: { slideId: string; blockId: string }[];
      findings: unknown[];
    };
    expect(answer.assetId).toBe('fixture-photo');
    expect(answer.slides.map((row) => row.slideId)).toEqual(['title', 'breaks']);
    expect(answer.revision).toBe(before.revision + 1);
    for (const row of answer.slides) {
      const rows = blocks(row.slideId);
      const picture = rows.find((block) => block.id === row.blockId);
      expect(picture?.type).toBe('picture');
      expect(picture?.asset).toBe('fixture-photo');
      expect(picture?.pos).toMatchObject({ x: 0, y: 0, w: 1600, h: 900 });
      expect(picture?.dither).toEqual(DITHER_PHOTOGRAPH_VALUE);
      // at the back of the stack: the lowest z on the slide
      const lowest = Math.min(...rows.map((block) => block.pos?.z ?? 0));
      expect(picture?.pos?.z ?? 0).toBe(lowest);
    }
    const neutral = await run([
      'slide',
      'background-picture',
      'title',
      '--asset',
      'fixture-photo',
      '--dither=neutral',
    ]);
    expect(neutral.code, neutral.stderr).toBe(0);
    const covering = blocks('title').filter(
      (block) => block.type === 'picture' && block.pos?.x === 0 && block.pos.w === 1600,
    );
    expect(covering).toHaveLength(1);
    expect(covering[0]?.dither).toEqual(DITHER_TOGGLE_VALUE);
    const kept = await run([
      'slide',
      'background-picture',
      'title',
      '--asset',
      'fixture-photo',
      '--no-replace',
    ]);
    expect(kept.code, kept.stderr).toBe(0);
    expect(
      blocks('title').filter((block) => block.type === 'picture' && block.pos?.w === 1600),
    ).toHaveLength(2);
    const missing = await run(['slide', 'background-picture', 'title', '--asset', 'nowhere']);
    expect(missing.code).toBe(2);
    const two = await run([
      'slide',
      'background-picture',
      'title',
      '--asset',
      'fixture-photo',
      '--url',
      'https://example.com/x.jpg',
    ]);
    expect(two.code).toBe(2);
    const badDither = await run([
      'slide',
      'background-picture',
      'title',
      '--asset',
      'fixture-photo',
      '--dither=loud',
    ]);
    expect(badDither.code).toBe(2);
    await validates();
  }, 30_000);

  test('version diff groups the mutations of a revision window by author and slide', async () => {
    const manifest = JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
      revision: number;
    };
    const result = await run([
      'version',
      'diff',
      String(manifest.revision - 2),
      String(manifest.revision),
    ]);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as {
      from: number;
      to: number;
      mutations: { op: string }[];
      byAuthor: { author: { name: string }; blocks: { slideId: string }[] }[];
    };
    expect(answer.from).toBe(manifest.revision - 2);
    expect(answer.to).toBe(manifest.revision);
    expect(answer.mutations.length).toBeGreaterThan(0);
    expect(answer.byAuthor).toHaveLength(1);
    expect(answer.byAuthor[0]?.author.name).toBe('tester');
    expect(answer.byAuthor[0]?.blocks.some((row) => row.slideId === 'title')).toBe(true);
    const backwards = await run(['version', 'diff', String(manifest.revision), '1']);
    expect(backwards.code).toBe(2);
  });

  test('slide background-material captures a frame through the materials pipeline or names it', async () => {
    const result = await run([
      'slide',
      'background-material',
      'title',
      'paper:liquid-metal',
      '--preset',
      'diamond',
      '--anchor',
      '5500',
      '--dither',
    ]);
    // the capture needs the headless renderer; a scratch tree without it says so with exit 2,
    // a full one writes the covering picture with the material recipe on its asset
    if (result.code === 0) {
      const answer = result.json as {
        assetId: string;
        slides: { slideId: string; blockId: string }[];
      };
      expect(answer.slides.map((row) => row.slideId)).toEqual(['title']);
      expect(
        blocks('title').find((block) => block.id === answer.slides[0]?.blockId)?.dither,
      ).toEqual(DITHER_PHOTOGRAPH_VALUE);
      await validates();
    } else {
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/material/i);
    }
    const noMaterial = await run(['slide', 'background-material', 'title']);
    expect(noMaterial.code).toBe(2);
  }, 60_000);
});
