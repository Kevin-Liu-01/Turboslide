// Geometry read-back (SPEC 8.5 step 4): every shape and picture offset and extent of every slide
// part, asserted against the 12,192,000 by 6,858,000 EMU page; plus the run and line attributes
// the acceptance reads back (`sz`, `spc`, `spcPts`, `<a:ln w>`), so a test can check the XML
// carries the expected values without a renderer.
import { PAGE_EMU, pageEmu } from '../units.ts';
import type { PageSize } from '../units.ts';
import { listShapes } from './groups.ts';
import { readPart, slideParts } from './zip.ts';
import type { Package } from './zip.ts';

export type ShapeBounds = {
  part: string;
  id: number;
  name: string;
  off: [number, number];
  ext: [number, number];
  /** The shape shows on the page: inside it, or crossing its edge (gslides-parity SPEC-2 0.96). */
  inBounds: boolean;
  /** The shape crosses a page edge: part of it is past the edge, which the show clips (0.96). */
  crossing?: boolean;
};

/** A shape is in bounds when its box lies inside the page with a one-pixel (7,620 EMU) tolerance; the default page when none is given (gslides-parity SPEC-5 6.1). */
export function inPage(
  off: [number, number],
  ext: [number, number],
  tolerance = 7620,
  page?: PageSize,
): boolean {
  const emu = page ? pageEmu(page) : PAGE_EMU;
  return (
    off[0] >= -tolerance &&
    off[1] >= -tolerance &&
    off[0] + ext[0] <= emu.width + tolerance &&
    off[1] + ext[1] <= emu.height + tolerance
  );
}

/**
 * A shape shows when some of it lies on the page (gslides-parity SPEC-2 0.96): an object a person
 * dragged past the sheet's edge is written at its box and the show clips it, so it is not out of
 * bounds; a shape wholly off the page is.
 */
export function showsOnPage(
  off: [number, number],
  ext: [number, number],
  tolerance = 7620,
  page?: PageSize,
): boolean {
  const emu = page ? pageEmu(page) : PAGE_EMU;
  return (
    off[0] + ext[0] > -tolerance &&
    off[1] + ext[1] > -tolerance &&
    off[0] < emu.width + tolerance &&
    off[1] < emu.height + tolerance
  );
}

/** Every shape of every slide part, bounded by the page (the default when none is given). Group children are read through their own xfrm. */
export async function readGeometry(zip: Package, page?: PageSize): Promise<ShapeBounds[]> {
  const out: ShapeBounds[] = [];
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    for (const shape of listShapes(xml)) {
      const inside = inPage(shape.off, shape.ext, 7620, page);
      const shows = showsOnPage(shape.off, shape.ext, 7620, page);
      out.push({
        part,
        id: shape.id,
        name: shape.name,
        off: shape.off,
        ext: shape.ext,
        inBounds: shows,
        ...(shows && !inside ? { crossing: true } : {}),
      });
    }
  }
  return out;
}

export type PartAttributes = {
  sz: number[];
  spc: number[];
  spcPts: number[];
  lineWidths: number[];
  kernZero: number;
  alphaValues: number[];
  softBreaks: number;
  typefaces: string[];
};

/** The attribute values of one slide part. */
export function readAttributes(xml: string): PartAttributes {
  const numbers = (re: RegExp): number[] => [...xml.matchAll(re)].map((m) => Number(m[1]));
  return {
    sz: numbers(/<a:rPr[^>]*\ssz="(-?\d+)"/g),
    spc: numbers(/<a:rPr[^>]*\sspc="(-?\d+)"/g),
    spcPts: numbers(/<a:spcPts val="(\d+)"\/>/g),
    lineWidths: numbers(/<a:ln w="(\d+)"/g),
    kernZero: (xml.match(/\skern="0"/g) ?? []).length,
    alphaValues: numbers(/<a:alpha val="(\d+)"\/>/g),
    softBreaks: (xml.match(/<a:br\/>/g) ?? []).length,
    typefaces: [
      ...new Set([...xml.matchAll(/<a:latin typeface="([^"]+)"/g)].map((m) => m[1] ?? '')),
    ],
  };
}

/** Attributes per slide part, in slide order. */
export async function readAllAttributes(zip: Package): Promise<Record<string, PartAttributes>> {
  const out: Record<string, PartAttributes> = {};
  for (const part of slideParts(zip)) out[part] = readAttributes(await readPart(zip, part));
  return out;
}

/** The page size written in presentation.xml. */
export async function readPageSize(zip: Package): Promise<{ cx: number; cy: number }> {
  const xml = await readPart(zip, 'ppt/presentation.xml');
  const m = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(xml);
  return { cx: Number(m?.[1] ?? 0), cy: Number(m?.[2] ?? 0) };
}
