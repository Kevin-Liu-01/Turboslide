// A rotated table and a rotated chart in the Editable text file (Round 1 verification finding 12:
// a table and a chart rotated 45 degrees in the editor and the PDF opened upright in PowerPoint).
// pptxgenjs 4.0.1 writes `rot`, `flipH` and `flipV` on a shape's `a:xfrm` and nothing on a graphic
// frame's `p:xfrm`; the builder's post-process writes them on the frame in the shape's units. The
// file is opened and the slide part's XML read back: each frame's `p:xfrm` carries what the shape
// beside it carries for the same angle, an upright table carries none, and the package validates.
import { describe, expect, test } from 'vitest';

import { openPackage, readPart } from '../ooxml/zip.ts';
import type {
  Scene,
  SceneChart,
  SceneRect,
  SceneStyle,
  SceneTable,
  SceneText,
} from '../scene/types.ts';
import { buildPptx } from './build.ts';
import { loadFontsCatalog } from './fonts-map.ts';

const style: SceneStyle = {
  family: 'Inter',
  mono: false,
  weight: 400,
  size: 16,
  letterSpacing: 0,
  lineHeight: 23.2,
  color: 'rgb(7, 7, 7)',
  strike: false,
  features: 'normal',
  align: 'left',
};

function cellText(blockId: string, r: number, c: number, x: number, y: number): SceneText {
  const box: [number, number, number, number] = [x, y, 200, 54];
  const line: [number, number, number, number] = [x + 16, y + 15, 60, 23.2];
  return {
    id: `${blockId}/rows/${r}/cells/${c}`,
    blockId,
    box,
    textBox: line,
    style,
    native: true,
    lines: [{ box: line, paragraph: 0, runs: [{ text: `R${r}C${c}`, box: line, style }] }],
  };
}

/** A two by two table at `x, y`, its cells' texts, and the transform the scene records. */
function table(
  blockId: string,
  x: number,
  y: number,
  transform: Pick<SceneTable, 'rotate' | 'flip'> = {},
): { table: SceneTable; texts: SceneText[] } {
  const texts: SceneText[] = [];
  const rows = [0, 1].map((r) => ({
    y: y + r * 54,
    h: 54,
    header: r === 0,
    cells: [0, 1].map((c) => {
      const text = cellText(blockId, r, c, x + c * 200, y + r * 54);
      texts.push(text);
      return {
        box: text.box,
        textId: text.id,
        align: 'left' as const,
        margin: [12, 16, 12, 16] as [number, number, number, number],
      };
    }),
  }));
  return {
    table: {
      blockId,
      box: [x, y, 400, 108],
      columns: [
        { x, w: 200 },
        { x: x + 200, w: 200 },
      ],
      rows,
      rule: { color: 'rgb(210, 210, 210)', width: 1 },
      headerRule: { color: 'rgb(7, 7, 7)', width: 1 },
      valign: 'top',
      size: 16,
      ...transform,
    },
    texts,
  };
}

function chart(blockId: string, transform: Pick<SceneChart, 'rotate' | 'flip'>): SceneChart {
  return {
    blockId,
    box: [900, 420, 560, 320],
    kind: 'bar',
    categories: ['Q1', 'Q2', 'Q3'],
    series: [{ name: 'Revenue', values: [12, 18, 9], colorHex: '070707' }],
    legend: 'none',
    numberFormat: 'plain',
    labels: false,
    labelColor: 'rgb(7, 7, 7)',
    titleColor: 'rgb(7, 7, 7)',
    ...transform,
  };
}

function scene(): Scene {
  const turned = table('turned', 137, 160, { rotate: 45 });
  const upright = table('upright', 137, 520);
  const shape: SceneRect = {
    blockId: 'shape',
    box: [700, 160, 160, 100],
    fill: 'rgb(170, 51, 102)',
    role: 'shape',
    rotate: 45,
  };
  const charts = [chart('chart', { rotate: 45 }), chart('mirrored', { rotate: 30, flip: 'h' })];
  return {
    slideId: 's1',
    n: 1,
    total: 1,
    theme: 'light',
    kind: 'content',
    title: 'The rotated frames',
    sheet: [0, 0, 1600, 900],
    paper: 'rgb(255, 255, 255)',
    ink: 'rgb(7, 7, 7)',
    frame: { rules: [], crosses: [], crossColor: 'rgb(0, 0, 0)' },
    plates: [],
    chips: [],
    texts: [...turned.texts, ...upright.texts],
    rules: [],
    rects: [shape],
    rasters: [],
    tables: [turned.table, upright.table],
    charts,
    blocks: [
      { blockId: 'turned', type: 'table', box: turned.table.box, native: true },
      { blockId: 'upright', type: 'table', box: upright.table.box, native: true },
      { blockId: 'shape', type: 'shape', box: shape.box, native: true },
      ...charts.map((c) => ({ blockId: c.blockId, type: 'chart', box: c.box, native: true })),
    ],
    fonts: [],
    warnings: [],
  };
}

/** The element named `name` in a slide part, from its `p:cNvPr` to the end of its element. */
function element(xml: string, tag: 'graphicFrame' | 'sp', name: string): string {
  const at = xml.indexOf(`name="${name}"`);
  expect(at, `${name} is in the slide`).toBeGreaterThan(0);
  const start = xml.lastIndexOf(`<p:${tag}>`, at);
  const end = xml.indexOf(`</p:${tag}>`, at);
  return xml.slice(start, end);
}

describe('the rotation of a graphic frame in the Editable text file', () => {
  test('a rotated table and chart carry rot on p:xfrm in the units a rotated shape carries it', async () => {
    const built = await buildPptx([scene()], {
      deckId: 'fixture',
      deckTitle: 'The fixture',
      revision: 1,
      theme: 'light',
      mode: 'native',
      fontSet: 'exact',
      fontsCatalog: loadFontsCatalog(),
      tableMode: 'table',
    });
    expect(built.validation.issues).toEqual([]);
    const zip = await openPackage(built.bytes);
    const xml = await readPart(zip, 'ppt/slides/slide1.xml');
    const shapeRot = /<a:xfrm\b[^>]*\srot="(\d+)"/.exec(element(xml, 'sp', 'ts:s1#shape'))?.[1];
    expect(shapeRot).toBe('2700000');

    const turned = element(xml, 'graphicFrame', 'ts:s1#turned');
    expect(turned).toContain('<a:tbl>');
    expect(/<p:xfrm\b[^>]*>/.exec(turned)?.[0]).toBe(`<p:xfrm rot="${shapeRot}">`);
    const upright = element(xml, 'graphicFrame', 'ts:s1#upright');
    expect(/<p:xfrm\b[^>]*>/.exec(upright)?.[0]).toBe('<p:xfrm>');

    const rotatedChart = element(xml, 'graphicFrame', 'ts:s1#chart');
    expect(rotatedChart).toContain('<c:chart ');
    expect(/<p:xfrm\b[^>]*>/.exec(rotatedChart)?.[0]).toBe(`<p:xfrm rot="${shapeRot}">`);
    const mirrored = element(xml, 'graphicFrame', 'ts:s1#mirrored');
    expect(/<p:xfrm\b[^>]*>/.exec(mirrored)?.[0]).toBe('<p:xfrm flipH="1" rot="1800000">');

    /* the frame keeps its place and size: the rotation turns it about its centre as a shape's does */
    expect(turned).toMatch(/<a:off x="\d+" y="\d+"\/><a:ext cx="\d+" cy="\d+"\/><\/p:xfrm>/);
    expect(built.counts?.rotated).toBe(4);
    expect(
      built.residual.some((line) =>
        /turned is rotated on the sheet; its graphic frame carries the rotation/.test(line),
      ),
    ).toBe(true);
    expect(built.warnings.filter((w) => /graphic frame was not found/.test(w))).toEqual([]);
  });
});
