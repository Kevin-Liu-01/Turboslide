// `turboslide export pptx` (export.run) argument handling without a browser: the valued flags the
// render worker passes (`--headings raster --raster-scale 2 --picture-scale 3`,
// apps/render-worker/src/jobs/export.ts) reach exportPptx as options instead of leaking into the
// slide selection, and `turboslide --help` names `export check` and every flag the generated CLI
// contract lists for export.run and export.check. exportPptx is mocked so no Chromium runs here;
// the real export is covered in packages/export and by the worker gate (docs/pptx.md).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { generateCli } from '@turboslide/agent/generate/cli';
import { exportPptx } from '@turboslide/export/export-pptx';
import type { ExportPptxOptions, ExportPptxResult } from '@turboslide/export/export-pptx';
import type { ExportReport } from '@turboslide/schema/export';

import { flagString, parseArgs } from '../args.ts';
import { USAGE, runCli } from '../cli.ts';

vi.mock('@turboslide/export/export-pptx', () => ({ exportPptx: vi.fn() }));

/** The repository's two-slide fixture deck (decks/fixture/README.md): `title` and `content-rule`. */
const FIXTURE_DECK = fileURLToPath(new URL('../../../../decks/fixture/', import.meta.url));

type Run = { code: number; stdout: string; stderr: string };

async function run(argv: string[], cwd: string): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    env: { USER: 'tester' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

/** A passing report with no files, enough for the command's summary line and its exit code. */
function reportFor(options: ExportPptxOptions): ExportReport {
  return {
    deckId: options.document.deck.id,
    revision: options.document.deck.revision,
    format: 'pptx',
    mode: options.mode ?? 'flatten',
    theme: options.themes?.[0] ?? 'light',
    fontSet: options.fonts ?? 'exact',
    fontSetVersion: 'test',
    files: [],
    fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
    slides: [],
    geometryInBounds: true,
    perfect: false,
    passed: true,
    residual: [],
  };
}

/** The render worker's argument list for export.run with every valued flag set. */
const WORKER_ARGV = [
  'export',
  'pptx',
  '--deck',
  '/decks/x',
  '--mode',
  'native',
  '--theme',
  'light',
  '--fonts',
  'exact',
  '--headings',
  'raster',
  '--raster-scale',
  '2',
  '--picture-scale',
  '3',
  '--baseline-target',
  'libreoffice',
  '--verify',
  '--embed-fonts',
  '--exclude-share-alike',
  '--out',
  '/out',
  '--json',
];

describe('turboslide export pptx arguments', () => {
  let root: string;
  const calls: ExportPptxOptions[] = [];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-export-'));
    vi.mocked(exportPptx).mockImplementation(async (options) => {
      calls.push(options);
      const merged = reportFor(options);
      const result: ExportPptxResult = {
        reports: [merged],
        merged,
        reportPath: join(options.outDir, 'export-report.json'),
        reportPaths: { [merged.theme]: join(options.outDir, `export-report-${merged.theme}.json`) },
        files: [],
        renderer: 'mock',
        scenes: [],
      };
      return result;
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('the scale and headings flags take a value instead of adding a positional', () => {
    const parsed = parseArgs(WORKER_ARGV);
    expect(parsed.positionals).toEqual(['export', 'pptx']);
    expect(flagString(parsed, 'headings')).toBe('raster');
    expect(flagString(parsed, 'raster-scale')).toBe('2');
    expect(flagString(parsed, 'picture-scale')).toBe('3');
    const shell = parseArgs([
      'export',
      'pptx',
      'thesis',
      '--theme',
      'light',
      '--raster-scale',
      '2',
    ]);
    expect(shell.positionals).toEqual(['export', 'pptx', 'thesis']);
    expect(flagString(shell, 'raster-scale')).toBe('2');
    expect(() => parseArgs(['export', 'pptx', '--raster-scale'])).toThrow(/needs a value/);
    expect(() => parseArgs(['export', 'pptx', '--picture-scale', '--json'])).toThrow(
      /needs a value/,
    );
  });

  test('export pptx <id> --raster-scale 2 exports one slide at the policy', async () => {
    calls.length = 0;
    const out = join(root, 'one');
    const result = await run(
      [
        'export',
        'pptx',
        'title',
        '--deck',
        FIXTURE_DECK,
        '--mode',
        'native',
        '--theme',
        'light',
        '--headings',
        'raster',
        '--raster-scale',
        '2',
        '--picture-scale',
        '3',
        '--out',
        out,
        '--json',
      ],
      root,
    );
    expect(result.stderr).toContain('1 slide(s) x light');
    expect(result.code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      outDir: out,
      mode: 'native',
      themes: ['light'],
      slideIds: ['title'],
      headings: 'raster',
      rasterScale: 2,
      pictureScale: 3,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: true, mode: 'native' });
  });

  test('the defaults are auto and 2 over every slide, and a bad value is a usage error', async () => {
    calls.length = 0;
    const all = await run(
      ['export', 'pptx', '--deck', FIXTURE_DECK, '--theme', 'light', '--out', join(root, 'all')],
      root,
    );
    expect(all.code).toBe(0);
    expect(all.stdout).toContain('2 slide(s) x light');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.slideIds).toBeUndefined();
    expect(calls[0]?.rasterScale).toBe('auto');
    expect(calls[0]?.pictureScale).toBe(2);
    expect(calls[0]?.headings).toBeUndefined();
    const bad = await run(
      ['export', 'pptx', '--deck', FIXTURE_DECK, '--raster-scale', '4', '--out', join(root, 'bad')],
      root,
    );
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('--raster-scale wants auto, 2 or 3');
    expect(calls).toHaveLength(1);
  });

  test('--help names export check and every flag of the generated export contracts', () => {
    // Two options are spelled differently on the command line: the subset is the `[ids|all]`
    // positionals of every slide command, and quickLook is the `--no-quick-look` switch.
    const spelled: Record<string, string> = {
      '--slide-ids': '[ids|all]',
      '--quick-look': '--no-quick-look',
    };
    const cli = generateCli();
    for (const id of ['export.run', 'export.check']) {
      const action = cli.actions.find((a) => a.action === id);
      expect(action, id).toBeDefined();
      for (const option of action?.options ?? [])
        expect(USAGE, `${id} ${option.flag}`).toContain(spelled[option.flag] ?? option.flag);
    }
    expect(USAGE).toContain('export check <file.pptx>');
    for (const flag of ['--embed-fonts', '--headings raster', '--raster-scale', '--picture-scale'])
      expect(USAGE).toContain(flag);
    expect(USAGE).not.toContain('gslides');
  });
});
