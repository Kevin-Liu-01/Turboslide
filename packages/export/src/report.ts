// The typed ExportReport (SPEC 4.2 export, 8.5): files with sizes and hashes, the fonts embedded,
// required on the viewer and known to substitute, the per-slide native and raster split, the
// geometry re-check, `passed`, and the residual in prose. "Identical" is a measured claim per
// revision, so the report names the revision it was made from. One report per theme; a two-theme
// run also writes a merged report whose `slides` list both themes in order.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

import type { ExportMode, ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import type { FontSet } from './pptx/fonts-map.ts';

export type ReportInput = {
  deckId: string;
  revision: number;
  mode: ExportMode;
  theme: Theme;
  fontSet: FontSet;
  fontSetVersion: string;
  files: string[];
  families: string[];
  embedded: string[];
  slides: ExportReport['slides'];
  geometryInBounds: boolean;
  residual: string[];
  warnings: string[];
};

/** Viewers known to ignore or bypass embedded fonts (SPEC 8.4). */
export const SUBSTITUTING_VIEWERS = ['Keynote', 'PowerPoint for the web', 'Google Slides'];

export function fileEntry(path: string): ExportReport['files'][number] {
  const bytes = readFileSync(path);
  return {
    path,
    bytes: statSync(path).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function buildReport(input: ReportInput): ExportReport {
  const required = input.families.filter((f) => !input.embedded.includes(f));
  const residual = [...input.residual];
  if (required.length > 0)
    residual.push(
      `fonts not embedded: ${required.join(', ')}; every viewer without them installed substitutes (SPEC 8.4)`,
    );
  for (const w of input.warnings) residual.push(`warning: ${w}`);
  const report: ExportReport = {
    deckId: input.deckId,
    revision: input.revision,
    format: 'pptx',
    mode: input.mode,
    theme: input.theme,
    fontSet: input.fontSet,
    fontSetVersion: input.fontSetVersion,
    files: input.files.map(fileEntry),
    fonts: {
      embedded: [...input.embedded],
      requiredOnViewer: required,
      substitutedIn: input.embedded.length > 0 ? [...SUBSTITUTING_VIEWERS] : ['every viewer'],
    },
    slides: input.slides,
    geometryInBounds: input.geometryInBounds,
    passed: input.geometryInBounds && input.warnings.length === 0,
    residual,
  };
  return exportReportSchema.parse(report);
}

/**
 * One report over several themes: the first theme's header, every file, the union of fonts and
 * residual, the slides of every theme in order, passed when every part passed. The per-theme
 * reports stay beside it.
 */
export function mergeReports(reports: ExportReport[]): ExportReport {
  const first = reports[0];
  if (!first) throw new RangeError('mergeReports: no reports');
  if (reports.length === 1) return first;
  const union = (pick: (r: ExportReport) => string[]): string[] => [
    ...new Set(reports.flatMap(pick)),
  ];
  const merged: ExportReport = {
    ...first,
    files: reports.flatMap((r) => r.files),
    fonts: {
      embedded: union((r) => r.fonts.embedded),
      requiredOnViewer: union((r) => r.fonts.requiredOnViewer),
      substitutedIn: union((r) => r.fonts.substitutedIn),
    },
    slides: reports.flatMap((r) => r.slides),
    geometryInBounds: reports.every((r) => r.geometryInBounds),
    passed: reports.every((r) => r.passed),
    residual: [
      `merged report over ${reports.map((r) => r.theme).join(' and ')}; theme names the first, per-theme reports are beside this file`,
      ...union((r) => r.residual),
    ],
  };
  return exportReportSchema.parse(merged);
}
