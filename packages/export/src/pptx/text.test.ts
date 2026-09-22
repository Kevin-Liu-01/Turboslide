// The M5 width gate fixes of the native text emitter (docs/export-verification.md "The width
// gate"): the invisible GT run is spaced to the mark's box, a space beside a hyperlink run becomes
// a no-break space, and the raster scale policy shoots icons and marks at 3x.
import { describe, expect, it } from 'vitest';

import { rasterScaleFor, THREE_X_KINDS } from '../scene/extract.ts';
import type { SceneRun, SceneStyle, SceneText } from '../scene/types.ts';
import { firstBaselineShiftPx } from './baseline.ts';
import {
  WIDTH_SLACK_IN,
  bulletCharacterCode,
  guardLinkSpaces,
  textBoxOptions,
  textRuns,
} from './text.ts';
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
  it('shoots icons, marks and logos at 3x, diagrams at 1x and the rest at 2x under auto, or a fixed scale', () => {
    /* the logo role joined the 3x kinds in the features round (docs/FEATURES.md 4.8) */
    expect([...THREE_X_KINDS].sort()).toEqual(['icon', 'logo', 'mark']);
    expect(rasterScaleFor('icon', 'auto')).toBe(3);
    expect(rasterScaleFor('mark', 'auto')).toBe(3);
    expect(rasterScaleFor('logo', 'auto')).toBe(3);
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

describe('the run marks of gslides-parity SPEC-2 7.2', () => {
  const marked: SceneText = {
    id: 'p1/text',
    blockId: 'p1',
    box: [137, 300, 600, 66],
    textBox: [137, 300, 600, 66],
    style,
    native: true,
    lines: [
      {
        box: [137, 300, 600, 33],
        paragraph: 0,
        runs: [
          run('A run in '),
          run('italic', { style: { ...style, italic: true } }),
          run(', one '),
          run('underlined', { style: { ...style, underline: true } }),
          run(', E = mc'),
          run('2', { style: { ...style, baseline: 'super' } }),
          run(', H'),
          run('2', { style: { ...style, baseline: 'sub' } }),
          run('O, a '),
          run('coloured', { style: { ...style, color: 'rgb(18, 163, 122)' } }),
          run(' and a '),
          run('highlighted', { style: { ...style, highlight: 'rgb(240, 160, 32)' } }),
          run(' run.'),
        ],
      },
      { box: [137, 333, 600, 33], paragraph: 1, runs: [run('The second paragraph.')] },
    ],
    paraSpace: { before: 12, after: 8 },
  };

  it('writes italic, underline, baseline, colour and highlight per run', () => {
    const out = textRuns(marked, options);
    const by = (text: string) => out.find((r) => r.text === text)?.options ?? {};
    expect(by('italic').italic).toBe(true);
    expect(by('underlined').underline).toEqual({ style: 'sng' });
    expect(
      out.filter((r) => r.text === '2').map((r) => [r.options?.superscript, r.options?.subscript]),
    ).toEqual([
      [true, undefined],
      [undefined, true],
    ]);
    expect(by('coloured').color).toBe('12A37A');
    expect(by('highlighted').highlight).toBe('F0A020');
    expect(by('A run in ').italic).toBeUndefined();
  });

  it('puts the paragraph spacing on the paragraphs it applies to (2.2.9)', () => {
    const out = textRuns(marked, options);
    const first = out[0]?.options ?? {};
    const second = out.find((r) => r.text === 'The second paragraph.')?.options ?? {};
    // the first paragraph takes no space before and 8 px (4.8 pt) after; the last no space after
    expect(first.paraSpaceBefore).toBeUndefined();
    expect(first.paraSpaceAfter).toBeCloseTo(4.8, 5);
    expect(second.paraSpaceBefore).toBeCloseTo(7.2, 5);
    expect(second.paraSpaceAfter).toBeUndefined();
    // the paragraph break closes the first paragraph
    expect(out.find((r) => r.text === ' run.')?.options?.breakLine).toBe(true);
  });

  it('writes a list item glyph or numeral as the bullet with its level (2.2.12, 2.2.13)', () => {
    const item: SceneText = {
      ...marked,
      id: 'list/items/3/text',
      blockId: 'list',
      box: [173, 500, 400, 33],
      textBox: [173, 500, 400, 33],
      lines: [{ box: [173, 500, 400, 33], paragraph: 0, runs: [run('Level four')] }],
      paraSpace: undefined,
      bullet: { kind: 'bullet', glyph: '●', level: 4, index: 1 },
    };
    const out = textRuns(item, options);
    expect(out[0]?.options?.bullet).toMatchObject({ characterCode: '25CF' });
    expect((out[0]?.options?.bullet as { indent: number }).indent).toBeCloseTo(21.6, 5);
    expect(out[0]?.options?.indentLevel).toBe(3);
    expect(bulletCharacterCode('○')).toBe('25CB');
    const numbered = textRuns(
      {
        ...item,
        bullet: {
          kind: 'number',
          glyph: 'a.',
          level: 2,
          index: 1,
          numberType: 'alphaLcPeriod',
          startAt: 1,
        },
      },
      options,
    );
    expect(numbered[0]?.options?.bullet).toMatchObject({
      type: 'number',
      numberType: 'alphaLcPeriod',
      numberStartAt: 1,
      // the key pptxgenjs 4.0.1's writer reads (its declaration names numberType)
      style: 'alphaLcPeriod',
    });
    // the text box starts at the key position so the glyph sits in the margin, and for a nested
    // item at the level's indent before it (pptxgenjs writes marL as the indent times the level
    // plus one): a level 4 item starts four indents left of its text
    const box = textBoxOptions(item, options);
    expect(box.x).toBeCloseTo((173 - 36 * 4) / 120, 5);
    expect(box.w).toBeCloseTo(400 / 120 + WIDTH_SLACK_IN + (36 * 4) / 120, 5);
    const top = textBoxOptions({ ...item, bullet: { ...item.bullet!, level: 1 } }, options);
    expect(top.x).toBeCloseTo((173 - 36) / 120, 5);
  });

  it('writes valign and a four number margin on a positioned text box, and the transform (2.2.18, 2.2.19, 2.1)', () => {
    const fitted: SceneText = {
      ...marked,
      box: [700, 640, 420, 80],
      textBox: [716, 656, 388, 33],
      lines: [{ box: [716, 656, 388, 33], paragraph: 0, runs: [run('Padded')] }],
      paraSpace: undefined,
      valign: 'middle',
      padding: [8, 24, 8, 24],
      rotate: 37,
      flip: 'h',
      alt: 'A padded box',
      shadow: { colorHex: '070707', opacity: 0.3, angle: 45, distance: 8, blur: 12 },
      outline: { colorHex: '070707', width: 2 },
    };
    const box = textBoxOptions(fitted, options);
    expect(box.valign).toBe('middle');
    // the first baseline shift moves a centred box up as it does a top aligned one
    const shift = firstBaselineShiftPx(22, 33);
    expect(shift).toBeGreaterThan(0);
    expect(box.y).toBeCloseTo((640 - shift) / 120, 5);
    expect(textBoxOptions({ ...fitted, valign: 'bottom' }, options).y).toBeCloseTo(
      (640 - shift) / 120,
      5,
    );
    const margin = box.margin as [number, number, number, number];
    expect(margin.map((v) => Math.round(v * 100) / 100)).toEqual([14.4, 14.4, 4.8, 4.8]);
    // pptxgenjs reads the array as left, right, bottom, top: an asymmetric padding lands on its sides
    const sides = textBoxOptions({ ...fitted, padding: [8, 24, 12, 32] }, options)
      .margin as number[];
    expect(sides.map((v) => Math.round(v * 100) / 100)).toEqual([19.2, 14.4, 7.2, 4.8]);
    expect(box.x).toBeCloseTo(700 / 120, 5);
    expect(box.h).toBeCloseTo(80 / 120, 5);
    expect(box.rotate).toBe(37);
    expect(box.flipH).toBe(true);
    expect((box as { altText?: string }).altText).toBe('A padded box');
    expect(box.shadow).toMatchObject({ type: 'outer', color: '070707', opacity: 0.3, angle: 45 });
    expect(box.shadow?.offset).toBeCloseTo(4.8, 5);
    expect(box.shadow?.blur).toBeCloseTo(7.2, 5);
    expect(box.outline).toEqual({ color: '070707', size: 1.2 });
    // the invisible layer carries no outline or highlight
    const invisible = textBoxOptions(fitted, { ...options, invisible: true });
    expect(invisible.outline).toBeUndefined();
    expect(invisible.rotate).toBe(37);
  });
});
