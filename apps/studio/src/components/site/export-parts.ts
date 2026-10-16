/**
 * The parts of one slide in the two PowerPoint files (docs/SITE.md 9), as the files hold them:
 * read from `ppt/slides/slide1.xml` of the two files the Turboslide CLI (built at b01cb984)
 * wrote for the opener field slide, `turboslide export pptx field --mode native` (Editable text)
 * and `--mode flatten` (Pictures), each box in the slide's 1600 by 900 px from the part's
 * `a:off` and `a:ext`. The hidden title each file carries for screen readers is left out. Screen
 * 06 draws the slide once from the Editable text file's parts and outlines each file's parts on
 * its side of the seam, so the counts the page states are these lists' (`countParts`).
 */
export type PartKind = 'text' | 'rect' | 'line' | 'picture';

export type ExportPart = {
  id: string;
  kind: PartKind;
  /** x, y, width and height in slide px */
  box: readonly [number, number, number, number];
  /** a text whose runs are drawn with alpha 0: there to search and copy, never seen */
  invisible?: true;
  text?: readonly string[];
};

/** Editable text: the slide's parts over its background picture (the field, 1600 by 900). */
export const EDITABLE_PARTS: readonly ExportPart[] = [
  { id: 'frame/0', kind: 'line', box: [56.5, 0, 0, 900] },
  { id: 'frame/1', kind: 'line', box: [1543.5, 0, 0, 900] },
  { id: 'frame/2', kind: 'line', box: [0, 56.5, 1600, 0] },
  { id: 'frame/3', kind: 'line', box: [0, 843.5, 1600, 0] },
  { id: 'cross/0/v', kind: 'line', box: [56.5, 51, 0, 11] },
  { id: 'cross/0/h', kind: 'line', box: [51, 56.5, 11, 0] },
  { id: 'cross/1/v', kind: 'line', box: [1543.5, 51, 0, 11] },
  { id: 'cross/1/h', kind: 'line', box: [1538, 56.5, 11, 0] },
  { id: 'cross/2/v', kind: 'line', box: [56.5, 838, 0, 11] },
  { id: 'cross/2/h', kind: 'line', box: [51, 843.5, 11, 0] },
  { id: 'cross/3/v', kind: 'line', box: [1543.5, 838, 0, 11] },
  { id: 'cross/3/h', kind: 'line', box: [1538, 843.5, 11, 0] },
  { id: 'chip/0', kind: 'rect', box: [66, 858, 40, 30] },
  { id: 'chip/1', kind: 'rect', box: [1474, 856, 60, 28] },
  { id: 'plate/0', kind: 'rect', box: [903, 569.73, 560, 201.27] },
  { id: 'h/text', kind: 'text', box: [929, 590.97, 510.4, 47.52], text: ['The opener field'] },
  {
    id: 'p1/text',
    kind: 'text',
    box: [929, 650.75, 510.4, 66],
    text: [
      'A lit sphere drawn from a formula and printed',
      'through an 8 by 8 screen at 2 px cells.',
    ],
  },
  {
    id: 'credit/text',
    kind: 'text',
    box: [929, 728.88, 510.4, 21.75],
    text: ['Drawn in Turboslide'],
  },
  { id: 'counter', kind: 'text', box: [1480.78, 862.14, 49.62, 15.73], text: ['06 / 08'] },
  { id: 'footer-logo:1', kind: 'picture', box: [72, 864, 18, 18] },
];

/** Pictures: one picture of the slide, the logo laid over it again, and the invisible text. */
export const PICTURES_PARTS: readonly ExportPart[] = [
  {
    id: 'h/text',
    kind: 'text',
    box: [929, 590.97, 510.4, 47.52],
    invisible: true,
    text: ['The opener field'],
  },
  {
    id: 'p1/text',
    kind: 'text',
    box: [929, 650.75, 510.4, 66],
    invisible: true,
    text: [
      'A lit sphere drawn from a formula and printed',
      'through an 8 by 8 screen at 2 px cells.',
    ],
  },
  {
    id: 'credit/text',
    kind: 'text',
    box: [929, 728.88, 510.4, 21.75],
    invisible: true,
    text: ['Drawn in Turboslide'],
  },
  {
    id: 'counter',
    kind: 'text',
    box: [1480.78, 862.14, 49.62, 15.73],
    invisible: true,
    text: ['06 / 08'],
  },
  { id: 'sheet', kind: 'picture', box: [0, 0.05, 1600, 899.95] },
  { id: 'footer-logo:1', kind: 'picture', box: [72, 864, 18, 18] },
];

export type PartCounts = Record<PartKind, number>;

/** How many parts of each kind a file holds. */
export function countParts(parts: readonly ExportPart[]): PartCounts {
  const counts: PartCounts = { text: 0, rect: 0, line: 0, picture: 0 };
  for (const part of parts) counts[part.kind] += 1;
  return counts;
}
