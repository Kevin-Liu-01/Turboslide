// The request builder on the fixture deck and on gt-brand slides 01, 08 and 33 (the scene fixtures
// under __fixtures__, cut from revision 13 by extract-scenes.ts): every request validates against
// the strict shapes, every element stays inside the 9,144,000 by 5,143,500 EMU page, the counts of
// text boxes, rectangles, lines, images and groups follow from the scene, the inserted text is the
// browser's lines joined by newlines with a style range per run that differs, object ids are valid
// and unique, and the units land where SPEC 8.3 says (22 px is 9.9 pt, 33 px pitch is 124.0
// percent, a hairline is 0.45 pt).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { Scene } from '../scene/types.ts';
import { loadSlidesCalibration } from './calibration.ts';
import { IdRegistry, isObjectId, slideObjectId } from './ids.ts';
import {
  compensatedTextBox,
  countKinds,
  lineBox,
  planPresentation,
  textContent,
} from './requests.ts';
import type { PlanOptions, PresentationPlan } from './requests.ts';
import { requestSchema, validateRequests } from './schema.ts';
import type { SlidesRequest } from './schema.ts';
import { SLIDES_PAGE_EMU, lineSpacingPercent, pxToEmu, pxToPt } from './units.ts';

type Fixture = { deckId: string; revision: number; scenes: Scene[] };

function fixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, '__fixtures__', `${name}.json`), 'utf8'),
  ) as Fixture;
}

const resolveUrl: PlanOptions['resolveUrl'] = (file) =>
  `https://example.invalid/${encodeURIComponent(file)}`;

function plan(scenes: Scene[], mode: 'native' | 'flatten'): PresentationPlan {
  return planPresentation(scenes, {
    mode,
    theme: 'light',
    resolveUrl,
    wordmarkFile: 'rasters/wordmark@2x.png',
  });
}

function elements(
  requests: readonly SlidesRequest[],
): { objectId: string; x: number; y: number; w: number; h: number }[] {
  const out: { objectId: string; x: number; y: number; w: number; h: number }[] = [];
  for (const r of requests) {
    const body =
      'createShape' in r
        ? r.createShape
        : 'createLine' in r
          ? r.createLine
          : 'createImage' in r
            ? r.createImage
            : null;
    if (!body) continue;
    const { size, transform } = body.elementProperties;
    out.push({
      objectId: body.objectId,
      x: transform.translateX,
      y: transform.translateY,
      w: size.width.magnitude,
      h: size.height.magnitude,
    });
  }
  return out;
}

function textBoxesOf(requests: readonly SlidesRequest[]): string[] {
  return requests.flatMap((r) =>
    'createShape' in r && r.createShape.shapeType === 'TEXT_BOX' ? [r.createShape.objectId] : [],
  );
}

function insertedText(requests: readonly SlidesRequest[], objectId: string): string | undefined {
  for (const r of requests)
    if ('insertText' in r && r.insertText.objectId === objectId) return r.insertText.text;
  return undefined;
}

describe.each([
  ['fixture-native-light', 'native'],
  ['fixture-flatten-light', 'flatten'],
  ['gt-brand-native-light', 'native'],
  ['gt-brand-flatten-light', 'flatten'],
] as const)('%s', (name, mode) => {
  const { scenes } = fixture(name);
  const built = plan(scenes, mode);

  test('every request validates and every object id is valid and unique', () => {
    expect(validateRequests(built.requests)).toEqual([]);
    const ids = new Set<string>();
    for (const r of built.requests) {
      const body = Object.values(r)[0] as { objectId?: string; groupObjectId?: string };
      const id = body.objectId ?? body.groupObjectId;
      if (!id) continue;
      expect(isObjectId(id)).toBe(true);
      if (
        'createSlide' in r ||
        'createShape' in r ||
        'createLine' in r ||
        'createImage' in r ||
        'groupObjects' in r
      ) {
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    }
    expect(built.ids.size).toBe(ids.size);
  });

  test('every EMU value lies inside the page', () => {
    for (const el of elements(built.requests)) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.w).toBeGreaterThanOrEqual(0);
      expect(el.h).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w).toBeLessThanOrEqual(SLIDES_PAGE_EMU.width);
      expect(el.y + el.h).toBeLessThanOrEqual(SLIDES_PAGE_EMU.height);
    }
    expect(built.geometryInBounds).toBe(true);
    expect(built.geometry.every((g) => g.inBounds)).toBe(true);
    expect(built.warnings).toEqual([]);
  });

  test('one BLANK slide per scene in deck order with the page id from the slide id', () => {
    const slides = built.requests.filter((r) => 'createSlide' in r);
    expect(slides).toHaveLength(scenes.length);
    slides.forEach((r, i) => {
      if (!('createSlide' in r)) return;
      expect(r.createSlide.insertionIndex).toBe(i);
      expect(r.createSlide.slideLayoutReference.predefinedLayout).toBe('BLANK');
      expect(r.createSlide.objectId).toBe(slideObjectId(scenes[i]?.slideId ?? ''));
    });
  });

  test('counts of text boxes, lines, images, rects and groups follow from the scene', () => {
    built.slides.forEach((slide, i) => {
      const scene = scenes[i] as Scene;
      const kinds = countKinds(slide.requests);
      const texts = mode === 'flatten' ? scene.texts : scene.texts.filter((t) => t.native);
      const withText = texts.filter((t) =>
        t.lines.some((l) => l.runs.some((r) => r.text.length > 0)),
      );
      const expectedTexts = withText.length + (scene.counter ? 1 : 0);
      expect(slide.counts.textBoxes).toBe(expectedTexts);
      expect(textBoxesOf(slide.requests)).toHaveLength(expectedTexts);
      expect(kinds.insertText).toBe(expectedTexts);
      expect(kinds.updateParagraphStyle).toBe(expectedTexts);
      if (mode === 'flatten') {
        expect(slide.counts.images).toBe(scene.sheetImage ? 1 : 0);
        expect(slide.counts.lines).toBe(0);
        expect(slide.counts.rects).toBe(0);
        expect(slide.counts.groups).toBe(0);
        // the sheet raster is the last request, over the text layer
        const last = slide.requests[slide.requests.length - 1];
        expect(last && 'createImage' in last).toBe(true);
        return;
      }
      const frameLines = scene.frame.rules.length + scene.frame.crosses.length * 2;
      expect(slide.counts.lines).toBe(frameLines + scene.rules.length);
      expect(kinds.createLine).toBe(slide.counts.lines);
      expect(kinds.updateLineProperties).toBe(slide.counts.lines);
      const rasters = scene.rasters.filter(
        (r) => r.blockId !== 'wordmark' && r.file && r.box[2] > 0 && r.box[3] > 0,
      );
      const pictureImage =
        scene.picture &&
        scene.pictureFile &&
        !(scene.picture.box[2] >= 1599.5 && scene.picture.box[3] >= 899.5)
          ? 1
          : 0;
      const pictureFill = scene.picture && scene.pictureFile && !pictureImage ? 1 : 0;
      expect(slide.counts.images).toBe(
        rasters.length + (scene.wordmark ? 1 : 0) + pictureImage + pictureFill,
      );
      expect(kinds.createImage ?? 0).toBe(rasters.length + (scene.wordmark ? 1 : 0) + pictureImage);
      expect(slide.counts.rects).toBe(
        scene.plates.length + scene.chips.length + scene.rects.length,
      );
      const groupKeys = new Map<string, number>();
      for (const key of [...scene.rules.map((r) => r.group), ...texts.map((t) => t.group)])
        if (key) groupKeys.set(key, (groupKeys.get(key) ?? 0) + 1);
      const rowGroups = [...groupKeys.values()].filter((n) => n >= 2).length;
      expect(slide.counts.groups).toBe(1 + rowGroups);
      // the full-picture background when the picture covers the sheet
      const fills = slide.requests.filter((r) => 'updatePageProperties' in r);
      expect(fills.length).toBeGreaterThanOrEqual(1);
      if (pictureFill) {
        const fill = fills[0];
        expect(
          fill &&
            'updatePageProperties' in fill &&
            'stretchedPictureFill' in fill.updatePageProperties.pageProperties.pageBackgroundFill,
        ).toBe(true);
      }
    });
  });

  test('the inserted text is the browser lines joined by newlines, with a range per run that differs', () => {
    built.slides.forEach((slide, i) => {
      const scene = scenes[i] as Scene;
      const texts = (mode === 'flatten' ? scene.texts : scene.texts.filter((t) => t.native)).filter(
        (t) => t.lines.some((l) => l.runs.some((r) => r.text.length > 0)),
      );
      const boxes = textBoxesOf(slide.requests);
      // the counter is last; the texts come in scene order before it
      texts.forEach((text, ti) => {
        const objectId = boxes[ti] as string;
        const { content, runs } = textContent(text);
        expect(insertedText(slide.requests, objectId)).toBe(content);
        expect(content.split('\n')).toHaveLength(text.lines.length);
        const styles = slide.requests.filter(
          (r) => 'updateTextStyle' in r && r.updateTextStyle.objectId === objectId,
        );
        const all = styles[0];
        expect(
          all && 'updateTextStyle' in all && all.updateTextStyle.textRange.type === 'ALL',
        ).toBe(true);
        for (const s of styles.slice(1)) {
          if (!('updateTextStyle' in s)) continue;
          const range = s.updateTextStyle.textRange;
          expect(range.type).toBe('FIXED_RANGE');
          if (range.type !== 'FIXED_RANGE') continue;
          const run = runs.find((r) => r.start === range.startIndex && r.end === range.endIndex);
          expect(run).toBeDefined();
          expect(content.slice(range.startIndex, range.endIndex)).toBe(run?.run.text);
        }
        // the base style is the first run's: family, weight and size in PT
        if (all && 'updateTextStyle' in all) {
          const first = runs[0]?.run.style;
          expect(all.updateTextStyle.style.fontSize?.magnitude).toBe(pxToPt(first?.size ?? 0));
          expect(all.updateTextStyle.style.weightedFontFamily?.weight).toBe(first?.weight);
          expect(all.updateTextStyle.style.fontFamily).toBe(first?.mono ? 'Roboto Mono' : 'Inter');
        }
      });
    });
  });
});

describe('gt-brand slides 01, 08 and 33 in native mode', () => {
  const { scenes, revision } = fixture('gt-brand-native-light');
  const built = plan(scenes, 'native');
  const [opener, audience, site] = built.slides;

  test('the fixture is revision 13 and the three slides', () => {
    expect(revision).toBe(13);
    expect(scenes.map((s) => s.slideId)).toEqual(['opener-brand', 'audience', 'site']);
    expect(built.slides.map((s) => s.objectId)).toEqual([
      'ts_opener-brand',
      'ts_audience',
      'ts_site',
    ]);
  });

  test('slide 01: the two-tone picture as the page fill, a plate, two chips, the frame group, three texts and the counter', () => {
    expect(opener?.counts).toMatchObject({
      textBoxes: 4,
      rects: 3,
      lines: 12,
      images: 2,
      groups: 1,
    });
    const kinds = countKinds(opener?.requests ?? []);
    expect(kinds.updatePageProperties).toBe(1);
    expect(kinds.createImage).toBe(1);
    expect(kinds.groupObjects).toBe(1);
  });

  test('slide 08: ten texts, five row hairlines, seven rasters plus the wordmark, four row groups', () => {
    expect(audience?.counts).toMatchObject({
      textBoxes: 11,
      rects: 0,
      lines: 17,
      images: 8,
      groups: 5,
    });
    const groups = (audience?.requests ?? []).filter((r) => 'groupObjects' in r);
    // the frame group first with the twelve frame lines, then a row group of a rule and two boxes
    const frame = groups[0];
    expect(frame && 'groupObjects' in frame && frame.groupObjects.childrenObjectIds.length).toBe(
      12,
    );
    const row = groups[1];
    expect(row && 'groupObjects' in row && row.groupObjects.childrenObjectIds.length).toBe(3);
    // the GT letters are a run in the paper color
    const paper = (audience?.requests ?? []).filter(
      (r) =>
        'updateTextStyle' in r &&
        r.updateTextStyle.textRange.type === 'FIXED_RANGE' &&
        r.updateTextStyle.style.foregroundColor?.opaqueColor.rgbColor.red === 1,
    );
    expect(paper.length).toBeGreaterThanOrEqual(2);
    expect(built.residual.some((line) => line.includes('GT letters'))).toBe(true);
  });

  test('slide 33: the screenshot block as one image, two native texts and the counter', () => {
    expect(site?.counts).toMatchObject({ textBoxes: 3, rects: 0, lines: 12, images: 2, groups: 1 });
    expect(site?.native).toEqual(['h', 'p1']);
    expect(site?.raster).toEqual(['fig']);
  });

  test('units: 22 px is 9.9 pt, a 33 px pitch is 124.0 percent, a hairline is 0.45 pt at 5,715 EMU per px', () => {
    expect(pxToPt(22)).toBe(9.9);
    expect(pxToPt(44)).toBe(19.8);
    expect(lineSpacingPercent(33, 22, 1.21)).toBe(124);
    expect(lineSpacingPercent(48.4, 44, 1.21)).toBe(90.9);
    expect(pxToEmu(1600)).toBe(SLIDES_PAGE_EMU.width);
    expect(pxToEmu(900)).toBe(SLIDES_PAGE_EMU.height);
    const line = (audience?.requests ?? []).find((r) => 'updateLineProperties' in r);
    expect(
      line && 'updateLineProperties' in line && line.updateLineProperties.lineProperties.weight,
    ).toEqual({ magnitude: 0.45, unit: 'PT' });
    const lines = (audience?.requests ?? []).filter((r) => 'createLine' in r);
    // the first frame line is the left rail (vertical: zero width, the page height), the third the top rule
    const rail = lines[0];
    expect(
      rail && 'createLine' in rail && rail.createLine.elementProperties.size.width.magnitude,
    ).toBe(0);
    expect(
      rail && 'createLine' in rail && rail.createLine.elementProperties.size.height.magnitude,
    ).toBe(SLIDES_PAGE_EMU.height);
    const rule = lines[2];
    expect(
      rule && 'createLine' in rule && rule.createLine.elementProperties.size.height.magnitude,
    ).toBe(0);
    expect(
      rule && 'createLine' in rule && rule.createLine.elementProperties.size.width.magnitude,
    ).toBe(SLIDES_PAGE_EMU.width);
    const paragraph = (audience?.requests ?? []).find((r) => 'updateParagraphStyle' in r);
    expect(
      paragraph &&
        'updateParagraphStyle' in paragraph &&
        paragraph.updateParagraphStyle.style.lineSpacing,
    ).toBe(90.9);
  });

  test('the text box is widened by the default inset and the slack and moved up and left by the inset', () => {
    const cal = loadSlidesCalibration();
    const heading = scenes[1]?.texts[0] as Scene['texts'][number];
    const [x, y, w] = heading.textBox;
    const box = compensatedTextBox(heading, cal);
    expect(box[0]).toBeCloseTo(x - 16, 5);
    expect(box[1]).toBeCloseTo(y - 8, 5);
    // a 44 px heading gets 2.5 percent slack
    expect(box[2]).toBeCloseTo(w + 32 + Math.max(2, w * 0.025), 5);
    const body = scenes[1]?.texts[1] as Scene['texts'][number];
    expect(compensatedTextBox(body, cal)[2]).toBeCloseTo(body.textBox[2] + 32 + 2, 5);
  });

  test('a horizontal rule is a zero-height line through the strip; the fallback thickness applies when asked', () => {
    const cal = loadSlidesCalibration();
    expect(lineBox([0, 56, 1600, 1], cal)).toEqual([0, 56.5, 1600, 0]);
    expect(lineBox([56, 0, 1, 900], cal)).toEqual([56.5, 0, 0, 900]);
    const fallback = { ...cal, lines: { ...cal.lines, zeroHeightAccepted: false } };
    expect(lineBox([0, 56, 1600, 1], fallback)).toEqual([0, 56, 1600, 1]);
  });

  test('a request with a misspelled field fails validation', () => {
    const bad = {
      createShape: { objectId: 'ts_x_1', shapeType: 'TEXT_BOX', elementProperties: {} },
    };
    expect(requestSchema.safeParse(bad).success).toBe(false);
    const wrong = {
      createLine: { objectId: 'ts_x_1', lineCategory: 'STRAIGHT', elementProperties: {} },
    };
    expect(validateRequests([wrong])).toHaveLength(1);
  });

  test('ids: short and long slugs land inside the 5 to 50 character rule and stay unique', () => {
    expect(slideObjectId('why')).toBe('ts_why');
    expect(slideObjectId('a')).toBe('ts_a_');
    const long = 'a'.repeat(80);
    expect(slideObjectId(long).length).toBeLessThanOrEqual(50);
    expect(isObjectId(slideObjectId(long))).toBe(true);
    const ids = new IdRegistry();
    const page = ids.claim(slideObjectId(long));
    const a = ids.next(page, 'text');
    const b = ids.next(page, 'text');
    expect(a).not.toBe(b);
    expect(isObjectId(a) && isObjectId(b)).toBe(true);
    expect(() => ids.claim(page)).toThrow(/already used/);
  });
});
