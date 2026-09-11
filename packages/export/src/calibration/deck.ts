// The calibration deck (SPEC 8.5 step 5): one small valid deck with a text block per style of the
// type ladder, ruled lists and rows, a declared diagram with hairlines, a mood picture with a
// plate and a credit, and one image, so an export target and a font set can be measured once
// (first-baseline offset per size, hairline placement, image placement) and the numbers recorded
// in calibration.json with the renderer versions that produced them. The deck is generated, not
// imported: the picture twins and the shot are deterministic PNGs written beside the slides.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BAYER8 } from '@turboslide/effects/bayer';
import { encodePngRgba } from '@turboslide/effects/io';
import type { RgbaImage } from '@turboslide/effects/image';
import type { Asset } from '@turboslide/schema/assets';
import type { ContentSlide, Deck, DeckDocument, MoodSlide, Slide } from '@turboslide/schema/deck';
import { canonicalJson } from '@turboslide/schema/json';

export const CALIBRATION_DECK_ID = 'calibration';

/** A fixed timestamp so two writes produce identical bytes (SPEC 4.1). */
export const CALIBRATION_CREATED_AT = '2026-09-10T00:00:00.000Z';

export const CALIBRATION_SLIDE_IDS = [
  'cal-text',
  'cal-lists',
  'cal-lines',
  'cal-picture',
  'cal-image',
] as const;

const PICTURE: Asset = {
  id: 'cal-picture',
  role: 'mood',
  alt: 'A generated two-tone gradient with the lower right quarter left clear for the plate',
  twins: { light: 'assets/cal-picture-light.png', dark: 'assets/cal-picture-dark.png' },
  size: [1600, 900],
  scale: 1,
  source: { kind: 'file' },
  inline: 'two-color',
};

const SHOT: Asset = {
  id: 'cal-shot',
  role: 'detail',
  alt: 'A generated 50 px grid with one diagonal',
  twins: { neutral: 'assets/cal-shot.png' },
  size: [800, 450],
  scale: 1,
  source: { kind: 'file' },
  inline: 'pass-through',
};

const TEXT: ContentSlide = {
  schemaVersion: 1,
  id: 'cal-text',
  kind: 'content',
  layout: { type: 'stack', gap: 28 },
  notes: 'Calibration: one text block per ladder style on paper.',
  slots: {
    main: [
      { id: 'h1', type: 'heading', level: 'h1', text: 'Calibration deck' },
      { id: 'h2', type: 'heading', level: 'h2', text: 'Heading at 44 px' },
      { id: 'lead', type: 'paragraph', role: 'lead', text: 'Lead paragraph at 26 px on one line.' },
      { id: 'p1', type: 'paragraph', text: 'Body paragraph at 22 px on one line.' },
      { id: 'cap', type: 'paragraph', role: 'cap', text: 'Caption at 15 px on one line.' },
    ],
  },
};

const LISTS: ContentSlide = {
  schemaVersion: 1,
  id: 'cal-lists',
  kind: 'content',
  layout: { type: 'cols', ratio: '1/1' },
  notes: 'Calibration: a ruled list and a ruled table.',
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'Ruled list and table' },
      {
        id: 'list',
        type: 'plain',
        items: [
          { text: 'First ruled item at 24 px.', icon: { name: 'check-circle', color: 'ok' } },
          { text: 'Second ruled item at 24 px.', icon: { name: 'check-circle', color: 'ok' } },
          { text: 'A struck item.', icon: { name: 'x-circle', color: 'no' }, no: true },
        ],
      },
    ],
    right: [
      {
        id: 'rows',
        type: 'rows',
        key: 180,
        items: [
          { key: 'Width', value: 'The value column at 20 px.' },
          { key: 'Pitch', value: 'Rows are 62 px tall with five hairlines.' },
          { key: 'Face', value: 'Keys are medium, values regular.' },
        ],
      },
      {
        id: 'refs',
        type: 'refs',
        items: ['One reference line at 20 px.', 'A second reference line.'],
      },
    ],
  },
};

const LINES: ContentSlide = {
  schemaVersion: 1,
  id: 'cal-lines',
  kind: 'content',
  layout: { type: 'cols', ratio: '1/1' },
  notes: 'Calibration: hairlines at 1 and 1.5 px, a rect, a marker, diagram text, a code panel.',
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'Lines and a panel' },
      {
        id: 'dia',
        type: 'dia',
        fit: 'slot',
        alt: 'Two horizontal hairlines, one 1.5 px line, a plate rectangle, a marker and two labels',
        data: {
          w: 627,
          h: 320,
          lines: [
            { x1: 0.5, y1: 40.5, x2: 626.5, y2: 40.5, stroke: 'ink' },
            { x1: 0.5, y1: 120.5, x2: 626.5, y2: 120.5, stroke: 'hair' },
            { x1: 0.5, y1: 200, x2: 626.5, y2: 200, stroke: 'mid', width: 1.5 },
          ],
          rects: [{ x: 0.5, y: 240.5, w: 300, h: 60, fill: 'plate', stroke: 'hair' }],
          markers: [{ x: 400, y: 270 }],
          texts: [
            { x: 0, y: 18, text: 'Ink hairline', size: 20 },
            { x: 0, y: 98, text: 'Hair', size: 18 },
          ],
          icons: [],
          marks: [],
        },
      },
    ],
    right: [
      {
        id: 'panel',
        type: 'panel',
        code: 'turboslide export pptx --mode flatten --verify\nturboslide fonts build --check',
        pre: true,
      },
      {
        id: 'scales',
        type: 'scales',
        items: [
          { left: 'Left', right: 'Right', value: 0.25 },
          { left: 'Low', right: 'High', value: 0.7 },
        ],
      },
    ],
  },
};

const MOOD: MoodSlide = {
  schemaVersion: 1,
  id: 'cal-picture',
  kind: 'mood',
  notes:
    'Calibration: a full picture with the lower right plate, a title, a sentence and a credit.',
  picture: { asset: 'cal-picture', fit: 'cover' },
  plate: {
    side: 'lower-right',
    maxWidth: 560,
    blocks: [
      { id: 'title', type: 'heading', level: 'title', text: 'Plate title at 44 px' },
      { id: 'p', type: 'paragraph', text: 'One sentence on the plate at 22 px.' },
      { id: 'credit', type: 'credit', text: 'Picture: a generated pattern, no license needed.' },
    ],
  },
};

const IMAGE: ContentSlide = {
  schemaVersion: 1,
  id: 'cal-image',
  kind: 'content',
  layout: { type: 'center' },
  notes: 'Calibration: one image at its natural aspect with a border and a caption.',
  slots: {
    main: [
      {
        id: 'shot',
        type: 'shot',
        asset: 'cal-shot',
        fit: 'fit',
        border: true,
        caption: 'A generated 50 px grid with one diagonal.',
        width: 800,
      },
    ],
  },
};

/** The deck and its slides; pure, so a test can validate it without the file system. */
export function calibrationDeck(): DeckDocument {
  const deck: Deck = {
    schemaVersion: 1,
    id: CALIBRATION_DECK_ID,
    title: 'Turboslide calibration deck',
    theme: 'gt-ink-paper',
    sections: [{ id: 'calibration', name: 'Calibration', slideIds: [...CALIBRATION_SLIDE_IDS] }],
    assets: { [PICTURE.id]: PICTURE, [SHOT.id]: SHOT },
    revision: 1,
    createdAt: CALIBRATION_CREATED_AT,
    updatedAt: CALIBRATION_CREATED_AT,
  };
  const slides: Record<string, Slide> = {};
  for (const slide of [TEXT, LISTS, LINES, MOOD, IMAGE]) slides[slide.id] = slide;
  return { deck, slides };
}

type Rgb = [number, number, number];

function fill(image: RgbaImage, x: number, y: number, rgb: Rgb): void {
  const p = (y * image.width + x) * 4;
  image.data[p] = rgb[0];
  image.data[p + 1] = rgb[1];
  image.data[p + 2] = rgb[2];
  image.data[p + 3] = 255;
}

/**
 * The picture twin: a diagonal gradient dithered with the 8 by 8 Bayer table at 2 px cells, the
 * deck's two-tone look, with the lower right quarter left on the paper so the mood plate sits
 * clear of the picture (OPENERS.md:105).
 */
export function calibrationPicture(theme: 'light' | 'dark'): RgbaImage {
  const width = 1600;
  const height = 900;
  const paper: Rgb = theme === 'light' ? [255, 255, 255] : [7, 7, 7];
  const ink: Rgb = theme === 'light' ? [7, 7, 7] : [242, 242, 240];
  const image: RgbaImage = { width, height, data: new Uint8Array(width * height * 4) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cx = Math.floor(x / 2);
      const cy = Math.floor(y / 2);
      const clear = x >= 760 && y >= 440;
      const value = clear ? 1 : Math.min(1, (cx / 800) * 0.7 + (cy / 450) * 0.5);
      const threshold = ((BAYER8[cy % 8]?.[cx % 8] ?? 0) + 0.5) / 64;
      fill(image, x, y, value > threshold ? paper : ink);
    }
  }
  return image;
}

/** The shot: paper with a hair-soft 50 px grid and one ink diagonal. */
export function calibrationShot(): RgbaImage {
  const width = 800;
  const height = 450;
  const image: RgbaImage = { width, height, data: new Uint8Array(width * height * 4) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const grid = x % 50 === 0 || y % 50 === 0;
      const diagonal = Math.abs(y - (x * height) / width) < 1;
      fill(image, x, y, diagonal ? [7, 7, 7] : grid ? [210, 210, 210] : [255, 255, 255]);
    }
  }
  return image;
}

export type WrittenCalibrationDeck = { dir: string; files: string[]; document: DeckDocument };

/** Writes deck.json, the slide files and the asset PNGs into `dir` (SPEC 4.1 layout). */
export async function writeCalibrationDeck(dir: string): Promise<WrittenCalibrationDeck> {
  const document = calibrationDeck();
  await mkdir(join(dir, 'slides'), { recursive: true });
  await mkdir(join(dir, 'assets'), { recursive: true });
  const files: string[] = [];
  const write = async (relativePath: string, content: string | Uint8Array): Promise<void> => {
    const path = join(dir, relativePath);
    await writeFile(path, content);
    files.push(path);
  };
  await write('deck.json', canonicalJson(document.deck));
  for (const slide of Object.values(document.slides)) {
    await write(join('slides', `${slide.id}.json`), canonicalJson(slide));
  }
  await write('assets/cal-picture-light.png', await encodePngRgba(calibrationPicture('light')));
  await write('assets/cal-picture-dark.png', await encodePngRgba(calibrationPicture('dark')));
  await write('assets/cal-shot.png', await encodePngRgba(calibrationShot()));
  return { dir, files, document };
}
