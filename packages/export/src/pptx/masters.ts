// The page and the slide masters (SPEC 8.2): a 13.333333 by 7.5 inch layout; `DECK_PAPER_<theme>`
// carries the paper, the rails, the rules and the crosses as 0.6 pt lines in the composite colors
// and the wordmark as a 2x PNG; `DECK_PICTURE_<theme>` carries the paper only, and a full-picture
// slide draws its chrome as alpha lines over the picture (pptx report section 4.1).
import type PptxGenJS from 'pptxgenjs';

import type { Theme } from '@turboslide/schema/render';

import type { Scene } from '../scene/types.ts';
import { PAGE_IN, parseCssColor, pxToIn, pxToPt } from '../units.ts';
import { dataUri } from './images.ts';
import { lineColor, ruleGeometry } from './lines.ts';

export const LAYOUT_NAME = 'TS_SHEET_16x9';

export function paperMasterName(theme: Theme): string {
  return `DECK_PAPER_${theme.toUpperCase()}`;
}

export function pictureMasterName(theme: Theme): string {
  return `DECK_PICTURE_${theme.toUpperCase()}`;
}

export function defineLayout(pptx: PptxGenJS): void {
  pptx.defineLayout({ name: LAYOUT_NAME, width: PAGE_IN.width, height: PAGE_IN.height });
  pptx.layout = LAYOUT_NAME;
}

export type MasterInput = {
  theme: Theme;
  /** Any scene of the theme: the frame, the paper and the wordmark box are the same on every slide. */
  scene: Scene;
  /** The wordmark PNG at 2x, when the extractor shot it. */
  wordmarkPng?: Uint8Array;
};

/** Defines both masters of a theme. */
export function defineMasters(pptx: PptxGenJS, input: MasterInput): void {
  const paperHex = parseCssColor(input.scene.paper).hex;
  const objects: NonNullable<PptxGenJS.SlideMasterProps['objects']> = [];
  input.scene.frame.rules.forEach((rule, i) => {
    const color = lineColor(rule.color, paperHex);
    objects.push({
      line: {
        ...ruleGeometry(rule.box),
        line: { color: color.color, width: pxToPt(rule.width) },
        objectName: `ts:master#frame/${i}`,
      },
    });
  });
  const crossColor = lineColor(input.scene.frame.crossColor, paperHex);
  input.scene.frame.crosses.forEach((box, i) => {
    const [x, y, w, h] = box;
    objects.push({
      line: {
        x: pxToIn(x + Math.floor(w / 2) + 0.5),
        y: pxToIn(y),
        w: 0,
        h: pxToIn(h),
        line: { color: crossColor.color, width: pxToPt(1) },
        objectName: `ts:master#cross/${i}/v`,
      },
    });
    objects.push({
      line: {
        x: pxToIn(x),
        y: pxToIn(y + Math.floor(h / 2) + 0.5),
        w: pxToIn(w),
        h: 0,
        line: { color: crossColor.color, width: pxToPt(1) },
        objectName: `ts:master#cross/${i}/h`,
      },
    });
  });
  if (input.wordmarkPng && input.scene.wordmark) {
    const [x, y, w, h] = input.scene.wordmark;
    objects.push({
      image: {
        data: dataUri(input.wordmarkPng, 'image/png'),
        x: pxToIn(x),
        y: pxToIn(y),
        w: pxToIn(w),
        h: pxToIn(h),
        altText: 'GT wordmark',
        objectName: 'ts:master#wordmark',
      },
    });
  }
  pptx.defineSlideMaster({
    title: paperMasterName(input.theme),
    background: { color: paperHex },
    objects,
  });
  pptx.defineSlideMaster({
    title: pictureMasterName(input.theme),
    background: { color: paperHex },
    objects: [],
  });
}
