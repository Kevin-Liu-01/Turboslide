// The EMU read-back of the verify loop (SPEC 8.5 step 4): every shape of every slide part is read
// out of the exported package and asserted inside the 12,192,000 by 6,858,000 EMU page, the
// overflow assertion re-run on the file itself. The same pass counts what the manual PowerPoint
// checklist looks at (docs/export-verification.md): custGeom paths, normAutofit elements, kern="0"
// attributes the post-process should have stripped, and the embedded font list. Built on the
// package readers of ooxml/ so the exporter and the verifier read one shape list.
import { readFile } from 'node:fs/promises';

import { readGeometry, readPageSize } from '../ooxml/geometry.ts';
import type { ShapeBounds } from '../ooxml/geometry.ts';
import { listParts, openPackage, readPart, slideParts } from '../ooxml/zip.ts';
import { PAGE_EMU } from '../units.ts';

export type GeometryCheck = {
  pageSize: { cx: number; cy: number };
  pageSizeOk: boolean;
  slideParts: number;
  shapes: number;
  outOfBounds: ShapeBounds[];
  /** geometryInBounds of the ExportReport: page size right and no shape outside it. */
  inBounds: boolean;
  custGeomCount: number;
  normAutofitCount: number;
  kernZeroCount: number;
  /** Typefaces listed in <p:embeddedFontLst>. */
  embeddedFonts: string[];
  fontParts: number;
  mediaParts: number;
};

/** Reads the package (a path or bytes) and runs every geometry and checklist count. */
export async function checkGeometry(pptx: string | Uint8Array): Promise<GeometryCheck> {
  const bytes = typeof pptx === 'string' ? new Uint8Array(await readFile(pptx)) : pptx;
  const zip = await openPackage(bytes);
  const pageSize = await readPageSize(zip);
  const shapes = await readGeometry(zip);
  const parts = slideParts(zip);
  let custGeomCount = 0;
  let normAutofitCount = 0;
  let kernZeroCount = 0;
  for (const part of parts) {
    const xml = await readPart(zip, part);
    custGeomCount += (xml.match(/<a:custGeom>/g) ?? []).length;
    normAutofitCount += (xml.match(/<a:normAutofit/g) ?? []).length;
    kernZeroCount += (xml.match(/\skern="0"/g) ?? []).length;
  }
  const presentation = await readPart(zip, 'ppt/presentation.xml');
  const embeddedFonts = [...presentation.matchAll(/<p:font typeface="([^"]+)"/g)].map(
    (m) => m[1] ?? '',
  );
  const all = listParts(zip);
  const pageSizeOk = pageSize.cx === PAGE_EMU.width && pageSize.cy === PAGE_EMU.height;
  const outOfBounds = shapes.filter((s) => !s.inBounds);
  return {
    pageSize,
    pageSizeOk,
    slideParts: parts.length,
    shapes: shapes.length,
    outOfBounds,
    inBounds: pageSizeOk && outOfBounds.length === 0,
    custGeomCount,
    normAutofitCount,
    kernZeroCount,
    embeddedFonts,
    fontParts: all.filter((p) => /^ppt\/fonts\//.test(p)).length,
    mediaParts: all.filter((p) => /^ppt\/media\//.test(p)).length,
  };
}

/** Residual lines for the report: one per out-of-bounds shape and one per checklist deviation. */
export function geometryResidual(check: GeometryCheck): string[] {
  const out: string[] = [];
  if (!check.pageSizeOk) {
    out.push(
      `page size is ${check.pageSize.cx} by ${check.pageSize.cy} EMU, expected ${PAGE_EMU.width} by ${PAGE_EMU.height}`,
    );
  }
  for (const shape of check.outOfBounds) {
    out.push(
      `${shape.part}: shape ${shape.id} "${shape.name}" leaves the page at ${shape.off[0]},${shape.off[1]} ${shape.ext[0]}x${shape.ext[1]} EMU`,
    );
  }
  if (check.normAutofitCount > 0)
    out.push(
      `${check.normAutofitCount} normAutofit element(s) present; the exporter never sets fit`,
    );
  if (check.kernZeroCount > 0)
    out.push(`${check.kernZeroCount} kern="0" attribute(s) survive; the kern strip did not run`);
  return out;
}
