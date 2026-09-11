// The asset and material commands over a fixture deck in a temp directory (MILESTONES M5 items
// 1 to 3): `asset add --two-tone` writes the twins, the source and one asset.set; `asset dither
// --all-two-tone --from-recorded --verify-cells --json` reports every two-tone asset (the M5
// acceptance shape); `material list --json` prints the catalog; `material capture` freezes a
// frame with its recipe key (a browser; skipped under TURBOSLIDE_SKIP_BROWSER); `asset capture`
// refuses a host outside the allowlist with exit 2.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };

let deckDir: string;
let root: string;
const skipBrowser = process.env.TURBOSLIDE_SKIP_BROWSER !== undefined;

async function run(argv: string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir], {
    cwd: root,
    env: { USER: 'kevin' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (argv.includes('--json') && stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function manifest(): { revision: number; assets: Record<string, Asset> } {
  return JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
    revision: number;
    assets: Record<string, Asset>;
  };
}

describe('turboslide asset and material', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-assets-'));
    deckDir = join(root, 'decks', 'fixture');
    mkdirSync(join(deckDir, 'slides'), { recursive: true });
    mkdirSync(join(deckDir, 'assets'), { recursive: true });
    writeFileSync(join(deckDir, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(deckDir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    // a 1800 by 1200 photograph stand-in: an ink ground, a paper square at the upper left
    const width = 1800;
    const height = 1200;
    const data = new Uint8Array(width * height * 3).fill(10);
    for (let y = 100; y < 600; y += 1)
      for (let x = 100; x < 700; x += 1)
        data.fill(235, (y * width + x) * 3, (y * width + x) * 3 + 3);
    await sharp(Buffer.from(data), { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95 })
      .toFile(join(root, 'square.jpg'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('asset add --two-tone writes the twins, keeps the source and commits one asset.set', async () => {
    const before = manifest().revision;
    const r = await run([
      'asset',
      'add',
      'square.jpg',
      '--role',
      'mood',
      '--alt',
      'A paper square on ink',
      '--title',
      'The square',
      '--artist',
      'A test',
      '--license',
      'CC BY-SA 4.0',
      '--two-tone',
      '--black',
      '40',
      '--plate',
      'lower-right',
      '--json',
    ]);
    expect(r.code, r.stderr).toBe(0);
    const asset = r.json as Asset;
    expect(asset.id).toBe('square');
    expect(asset.twins).toEqual({
      light: 'assets/square-light.png',
      dark: 'assets/square-dark.png',
    });
    expect(asset.sourceFile).toBe('assets/square.source.jpg');
    expect(asset.credit).toBe('Photograph: A test, CC BY-SA 4.0');
    expect(asset.metrics?.plateClear?.litUnder).toBe(0);
    expect(existsSync(join(deckDir, 'assets/square-dark.png'))).toBe(true);
    const after = manifest();
    expect(after.revision).toBe(before + 1);
    expect(after.assets.square?.source).toMatchObject({
      kind: 'photo',
      shareAlike: true,
      title: 'The square',
    });
  });

  test('asset dither --all-two-tone --from-recorded --verify-cells reports every two-tone asset', async () => {
    const r = await run([
      'asset',
      'dither',
      '--all-two-tone',
      '--from-recorded',
      '--verify-cells',
      '--json',
    ]);
    expect(r.code, r.stderr).toBe(0);
    const rows = r.json as {
      assetId: string;
      mismatchedCells?: number;
      missingParameter?: boolean;
      missingSource?: boolean;
      twinInverseMismatch?: number;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    const square = rows.find((row) => row.assetId === 'square');
    expect(square).toMatchObject({ mismatchedCells: 0, twinInverseMismatch: 0 });
    // the worked deck's fixtures have no twins on disk beyond the one added here
    const bad = rows.filter((row) => (row.mismatchedCells ?? 0) > 0 && !row.missingParameter);
    expect(bad).toEqual([]);
  });

  test('asset dither <id> --gamma re-runs from the kept source', async () => {
    const r = await run(['asset', 'dither', 'square', '--gamma', '0.8', '--json']);
    expect(r.code, r.stderr).toBe(0);
    const report = r.json as { assetId: string; written: string[] };
    expect(report.written).toHaveLength(2);
    expect(manifest().assets.square?.treatment).toMatchObject({
      kind: 'two-tone',
      gamma: 0.8,
      black: 40,
    });
  });

  test('material list --json prints the catalog with presets and the proto engines unavailable', async () => {
    const r = await run(['material', 'list', '--json']);
    expect(r.code, r.stderr).toBe(0);
    const entries = r.json as { id: string; available: boolean; presets: { name: string }[] }[];
    const liquid = entries.find((entry) => entry.id === 'paper:liquid-metal');
    expect(liquid?.available).toBe(true);
    expect(liquid?.presets.map((p) => p.name)).toEqual(
      expect.arrayContaining(['diamond', 'sphere', 'ink-paper', 'brand-blue']),
    );
    expect(entries.find((entry) => entry.id === 'proto:singularity')?.available).toBe(false);
    const one = await run(['material', 'list', 'paper:gem-smoke', '--json']);
    expect((one.json as unknown[]).length).toBe(1);
  });

  test('asset capture refuses a host outside the allowlist with exit 2', async () => {
    const r = await run(['asset', 'capture', 'https://example.com/', '--theme', 'both', '--json']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('allowlist');
  });

  test.skipIf(skipBrowser)(
    'material capture freezes a frame with its recipe key and commits it',
    async () => {
      const before = manifest().revision;
      const r = await run([
        'material',
        'capture',
        'paper:liquid-metal',
        '--preset',
        'diamond',
        '--anchor',
        '5500',
        '--two-tone',
        '--crop',
        '-1325,105,2709,2374',
        '--black',
        '20',
        '--plate',
        'lower-left',
        '--id',
        'liquid-metal-diamond',
        '--role',
        'opener',
        '--json',
      ]);
      expect(r.code, r.stderr).toBe(0);
      const asset = r.json as Asset;
      expect(asset.id).toBe('liquid-metal-diamond');
      if (asset.source.kind !== 'material') throw new Error('not a material source');
      expect(asset.source.recipeKey).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(asset.source.timeMs).toBe(5500);
      expect(asset.metrics?.plateClear?.litUnder).toBe(0);
      expect(manifest().revision).toBe(before + 1);
      expect(manifest().assets['liquid-metal-diamond']?.source).toMatchObject({
        recipeKey: asset.source.recipeKey,
      });
      expect(existsSync(join(deckDir, 'assets/liquid-metal-diamond.recipe.json'))).toBe(true);
    },
  );
});
