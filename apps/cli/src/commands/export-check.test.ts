// `turboslide export check <file>` (export.check) over a fixture package: the JSON result, the
// human lines and the exit codes. QuickLook is off so the run is the same on every machine.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { encodePngRgba } from '@turboslide/effects/io';
import { buildFixturePptx } from '@turboslide/export/verify/fixture';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string };

async function run(argv: string[], cwd: string): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    env: { USER: 'tester', TURBOSLIDE_NO_QUICKLOOK: '1', TURBOSLIDE_PYTHON: '' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

describe('turboslide export check', () => {
  let root: string;
  let file: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-export-check-'));
    file = join(root, 'deck-light.pptx');
    const data = new Uint8Array(16 * 9 * 4).fill(255);
    const background = await encodePngRgba({ width: 16, height: 9, data });
    await buildFixturePptx({ out: file, pages: [{ background, notes: 'n' }, { paper: 'FFFFFF' }] });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('prints the check and exits 0 on a valid file', async () => {
    const result = await run(['export', 'check', file, '--no-quick-look'], root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('check: deck-light.pptx');
    expect(result.stdout).toContain('2 slide(s)');
    expect(result.stdout).toContain('check: valid');
  });

  test('--json puts the ExportCheck on stdout', async () => {
    const result = await run(['export', 'check', file, '--json'], root);
    expect(result.code).toBe(0);
    const check = JSON.parse(result.stdout) as {
      valid: boolean;
      slides: number;
      formats: Record<string, number>;
    };
    expect(check.valid).toBe(true);
    expect(check.slides).toBe(2);
    expect(check.formats['png-rgba']).toBe(1);
    expect(result.stderr).toContain('check: valid');
  });

  test('a missing file is a usage error', async () => {
    const result = await run(['export', 'check', join(root, 'missing.pptx')], root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('does not exist');
    const noFile = await run(['export', 'check'], root);
    expect(noFile.code).toBe(2);
  });

  test('export gslides is gone', async () => {
    const result = await run(['export', 'gslides', '--dry-run'], root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('removed');
  });
});
