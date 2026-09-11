// The QuickLook smoke check (docs/pptx.md): skipped where qlmanage is absent (Linux, the render
// worker image, TURBOSLIDE_NO_QUICKLOOK=1); on a Mac it renders the first page of a fixture file
// at 1600 px and the thumbnail decodes as a 16:9 PNG.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { encodePngRgba } from '@turboslide/effects/io';

import { buildFixturePptx } from './fixture.ts';
import { quickLookBinary, quickLookThumbnail } from './quicklook.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-quicklook-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('quickLookBinary', () => {
  test('honours the switch and the override', () => {
    expect(quickLookBinary({ TURBOSLIDE_NO_QUICKLOOK: '1' }, 'darwin')).toBeNull();
    expect(quickLookBinary({}, 'linux')).toBeNull();
    expect(quickLookBinary({ TURBOSLIDE_QLMANAGE: join(tmp, 'missing') }, 'darwin')).toBeNull();
  });
});

describe.skipIf(quickLookBinary(process.env) === null)('quickLookThumbnail', () => {
  test('renders the first page of a fixture file', async () => {
    const data = new Uint8Array(16 * 9 * 4).fill(255);
    const background = await encodePngRgba({ width: 16, height: 9, data });
    const out = join(tmp, 'ql.pptx');
    await buildFixturePptx({ out, pages: [{ background }, { paper: '070707' }] });
    const thumb = await quickLookThumbnail(out, join(tmp, 'thumbs'), { size: 1600 });
    // a headless session without the window server yields null; that is a skip, not a failure
    if (!thumb) return;
    expect(thumb.png.endsWith('.quicklook.png')).toBe(true);
    // QuickLook renders the 960.009 pt page at 1600 by 902 on this machine (its own rounding)
    expect(thumb.width).toBe(1600);
    expect(Math.abs(thumb.height - 900)).toBeLessThanOrEqual(4);
  }, 120_000);
});
