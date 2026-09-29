import { describe, expect, it } from 'vitest';

import type { ExportReport } from '@turboslide/schema/export';

import { runKindWord, runSentence } from '../ExportReportCard';
import type { ArtifactRun } from '../ExportReportCard';

// The download's Details is a seller's card (docs/POLISH.md item 80; the row
// export.details.seller-card): the head names the format from the run, never PPTX for a PDF, and
// the sentence under the files is one plain statement.

function report(
  format: 'pptx' | 'pdf',
  slides: number,
  themes: ('light' | 'dark')[],
): ExportReport {
  return {
    deckId: 'q4-review',
    revision: 4,
    format,
    mode: 'flatten',
    theme: themes[0] ?? 'light',
    fontSet: 'exact',
    fontSetVersion: '1',
    files: [],
    fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
    slides: themes.flatMap((theme) =>
      Array.from({ length: slides }, (_, i) => ({
        slideId: `s${i + 1}`,
        theme,
        native: [],
        raster: [],
      })),
    ),
    perfect: false,
    passed: true,
    geometryInBounds: true,
    residual: ['renderer: chrome-headless-shell, SwiftShader'],
  } as unknown as ExportReport;
}

function exportRun(
  format: 'pptx' | 'pdf',
  slides: number,
  themes: ('light' | 'dark')[],
): ArtifactRun {
  return {
    kind: 'export',
    input: { format: 'pptx', mode: 'flatten', theme: themes, fonts: 'exact', verify: false },
    report: report(format, slides, themes),
    downloads: [{ name: 'Pipeline review.pdf', bytes: 59_997 }],
    jobId: 'job',
    ms: 4300,
  };
}

describe('the export report card', () => {
  it('names the format from the run', () => {
    expect(runKindWord(exportRun('pdf', 2, ['light']))).toBe('PDF');
    expect(runKindWord(exportRun('pptx', 2, ['light']))).toBe('PowerPoint file');
    expect(
      runKindWord({
        kind: 'build',
        path: 'a.html',
        bytes: 1,
        assertions: [],
        downloads: [],
        ms: 1,
      }),
    ).toBe('web page');
  });

  it('says what the file holds in one sentence, with no gate word', () => {
    expect(runSentence(exportRun('pdf', 2, ['light']))).toBe('2 pages, made in 4.3 s');
    expect(runSentence(exportRun('pptx', 1, ['light']))).toBe('1 slide, made in 4.3 s');
    expect(runSentence(exportRun('pptx', 3, ['light', 'dark']))).toBe(
      '3 slides in 2 appearances, made in 4.3 s',
    );
    for (const run of [exportRun('pdf', 2, ['light']), exportRun('pptx', 2, ['light'])]) {
      const words = `${runKindWord(run)} ${runSentence(run)}`;
      expect(words).not.toMatch(/Perfect|SwiftShader|fraction|PPTX/);
    }
  });
});
