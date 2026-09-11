// export check over a fixture package (docs/pptx.md): the zip walk, the media formats read from
// their bytes, the slide names, python-pptx when the workspace venv exists, and the verdict. The
// QuickLook step is off here (its own test covers it) so the test runs the same everywhere.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { encodePng1 } from '@turboslide/effects/png1';
import { encodePngRgba } from '@turboslide/effects/io';

import { checkPptx, describeCheck, mediaFormatOf, resolvePython } from './check.ts';
import { buildFixturePptx } from './verify/fixture.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-check-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function paper(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4).fill(255);
  return data;
}

describe('mediaFormatOf', () => {
  test('classes PNG color types and JPEG markers', async () => {
    const bits = { width: 8, height: 8, bits: new Uint8Array(64).map((_, i) => i % 2) };
    expect(mediaFormatOf(encodePng1(bits))).toBe('png-gray');
    expect(
      mediaFormatOf(
        encodePng1(bits, {
          palette: [
            [0, 0, 0],
            [255, 255, 255],
          ],
        }),
      ),
    ).toBe('png-1bit');
    const rgba = await encodePngRgba({ width: 2, height: 2, data: paper(2, 2) });
    expect(mediaFormatOf(rgba)).toBe('png-rgba');
    expect(mediaFormatOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(mediaFormatOf(new Uint8Array([1, 2, 3]))).toBe('other');
  });
});

describe('checkPptx', () => {
  test('reads a fixture file back and prints its lines', async () => {
    const background = await encodePngRgba({ width: 16, height: 9, data: paper(16, 9) });
    const out = join(tmp, 'fixture.pptx');
    await buildFixturePptx({
      out,
      title: 'Check fixture',
      pages: [
        { background },
        {
          paper: 'FFFFFF',
          texts: [
            {
              name: 'h',
              text: 'Hello',
              box: [137, 137, 600, 60],
              sizePx: 44,
              lineHeightPx: 48,
              family: 'GT Inter Display',
              color: '070707',
            },
          ],
        },
      ],
    });
    const check = await checkPptx(out, {
      quickLook: false,
      env: { ...process.env, TURBOSLIDE_PYTHON: '' },
    });
    expect(check.file).toBe('fixture.pptx');
    expect(check.slides).toBe(2);
    // the fixture writer carries no notes parts; the deck export test covers them
    expect(check.notes).toBe(0);
    expect(check.pageSizeOk).toBe(true);
    expect(check.formats['png-rgba']).toBe(1);
    expect(check.relationships.invalid).toEqual([]);
    expect(check.contentTypes.undeclared).toEqual([]);
    expect(check.quickLook.ran).toBe(false);
    expect(check.issues).toEqual([]);
    expect(check.valid).toBe(true);
    const lines = describeCheck(check);
    expect(lines[0]).toContain('fixture.pptx');
    expect(lines[lines.length - 1]).toBe('valid');
    // python-pptx runs only where the workspace venv (or TURBOSLIDE_PYTHON) exists
    const python = resolvePython(process.env);
    if (python && existsSync(python)) {
      const withPython = await checkPptx(out, { quickLook: false, python });
      expect(withPython.pythonPptx.ran, withPython.pythonPptx.error).toBe(true);
      expect(withPython.pythonPptx.slides).toBe(2);
      expect(withPython.valid).toBe(true);
    }
  });

  test('a missing file is a RangeError', async () => {
    await expect(checkPptx(join(tmp, 'nope.pptx'), { quickLook: false })).rejects.toThrow(
      RangeError,
    );
  });
});
