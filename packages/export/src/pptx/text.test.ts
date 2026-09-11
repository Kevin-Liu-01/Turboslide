// The M5 width gate fixes of the native text emitter (docs/export-verification.md "The width
// gate"): the invisible GT run is spaced to the mark's box, a space beside a hyperlink run becomes
// a no-break space, and the raster scale policy shoots icons and marks at 3x.
import { describe, expect, it } from 'vitest';

import { rasterScaleFor, THREE_X_KINDS } from '../scene/extract.ts';
import type { SceneRun, SceneStyle, SceneText } from '../scene/types.ts';
import { guardLinkSpaces, textRuns } from './text.ts';
import type { TextEmitOptions } from './text.ts';

const style: SceneStyle = {
  family: 'Inter',
  mono: false,
  weight: 400,
  size: 22,
  letterSpacing: 0,
  lineHeight: 33,
  color: 'rgb(7, 7, 7)',
  strike: false,
  features: 'normal',
  align: 'left',
};

function run(text: string, extra: Partial<SceneRun> = {}, link?: string): SceneRun {
  return { text, box: [0, 0, 10, 20], style: link ? { ...style, link } : style, ...extra };
}

const options: TextEmitOptions = {
  fontSet: 'exact',
  invisible: false,
  hairHex: 'D8D8D8',
  families: new Set(),
  namePrefix: 'ts:t',
};

describe('the GT run under the mark', () => {
  it('is spaced to the mark box: (mark width minus letters width) per character, in points', () => {
    // the letters GT measure 29.47 px in the host font, the mark box is 25.59 px wide (avoid#p1)
    const text: SceneText = {
      id: 'p1/text',
      blockId: 'p1',
      box: [137, 477, 522.5, 33],
      textBox: [137, 477, 522.5, 33],
      style,
      native: true,
      lines: [
        {
          box: [137, 477, 420, 33],
          runs: [
            run('None of these appears on any '),
            run('GT', { box: [444.2, 485.59, 25.59, 16.27], gt: true, gtLetters: 29.47 }),
            run(' surface.'),
          ],
        },
      ],
    };
    const out = textRuns(text, options);
    const gt = out[1]?.options;
    expect(gt?.transparency).toBe(100);
    // (25.59 - 29.47) / 2 px = -1.94 px = -1.164 pt, to the hundredth
    expect(gt?.charSpacing).toBe(-1.16);
    expect(out[0]?.options?.charSpacing).toBeUndefined();
  });
});

describe('spaces beside hyperlink runs', () => {
  it('become no-break spaces on the side that touches the link', () => {
    const runs = [
      run('x.com/generaltxn', {}, 'https://x.com/generaltxn'),
      run(', '),
      run('linkedin.com', {}, 'https://linkedin.com'),
      run(','),
      run(' and '),
      run('gt', {}, 'https://gt.dev'),
    ];
    expect(guardLinkSpaces(runs).map((r) => r.text)).toEqual([
      'x.com/generaltxn',
      ',\u00a0',
      'linkedin.com',
      ',',
      ' and\u00a0',
      'gt',
    ]);
  });

  it('leaves runs without a link neighbour alone', () => {
    const runs = [run('one '), run('two'), run(' three')];
    expect(guardLinkSpaces(runs)).toEqual(runs);
  });
});

describe('the raster scale policy', () => {
  it('shoots icons and marks at 3x, diagrams at 1x and the rest at 2x under auto, or a fixed scale', () => {
    expect([...THREE_X_KINDS].sort()).toEqual(['icon', 'mark']);
    expect(rasterScaleFor('icon', 'auto')).toBe(3);
    expect(rasterScaleFor('mark', 'auto')).toBe(3);
    expect(rasterScaleFor('block', 'auto', 'dia')).toBe(1);
    expect(rasterScaleFor('block', 'auto', 'lang')).toBe(1);
    expect(rasterScaleFor('block', 'auto', 'shot')).toBe(2);
    expect(rasterScaleFor('block', 'auto')).toBe(2);
    expect(rasterScaleFor('icon', 2)).toBe(2);
    expect(rasterScaleFor('block', 3, 'dia')).toBe(3);
  });
});

describe('the off-cut face advance', () => {
  it('reads the calibrated excess per family and size and returns 0 elsewhere', async () => {
    const { faceAdvanceExcess } = await import('./face-advance.ts');
    const table = { 'GT Inter Text 26 Medium': { '30': 0.017, '27': 0.0082 } };
    expect(faceAdvanceExcess('GT Inter Text 26 Medium', 30, table)).toBe(0.017);
    expect(faceAdvanceExcess('GT Inter Text 26 Medium', 26, table)).toBe(0);
    expect(faceAdvanceExcess('GT Inter Text 22', 22, table)).toBe(0);
  });

  it('takes the excess back as character spacing over the run', () => {
    // a 30 px medium run 472 px wide over 40 characters: 1.7 percent is 8 px, 0.2 px per character
    const medium: SceneStyle = { ...style, size: 30, weight: 500, letterSpacing: -0.6 };
    const text: SceneText = {
      id: 'h4/text',
      blockId: 'h4',
      box: [208, 471, 531, 75],
      textBox: [208, 471, 531, 75],
      style: medium,
      native: true,
      lines: [
        {
          box: [208, 471, 472, 37.5],
          runs: [
            {
              text: 'gt, gt-next, gt-react, gt-vue, gt-node,,',
              box: [208, 471, 472, 30],
              style: medium,
            },
          ],
        },
      ],
    };
    const out = textRuns(text, options);
    // -0.6 px tracking minus 0.2 px per character is -0.8 px, -0.48 pt
    expect(out[0]?.options?.charSpacing).toBeCloseTo(-0.48, 2);
    expect(options.families.has('GT Inter Text 26 Medium')).toBe(true);
  });
});
