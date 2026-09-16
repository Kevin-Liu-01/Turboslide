// The report builder (SPEC-5 0.29, 16.3): rows, counts, fonts and the schema parse.
import { describe, expect, it } from 'vitest';

import { importSummarySentence } from '@turboslide/schema/import-report';

import { ImportReportBuilder, ROW_CODES, fidelityOf } from './report.ts';

describe('ImportReportBuilder', () => {
  it('counts kept, substituted and dropped objects and prints the sentence of SPEC-5 15', () => {
    const builder = new ImportReportBuilder();
    builder.keep(39);
    builder.substitute({
      slideIndex: 2,
      object: 'Rectangle 3',
      code: ROW_CODES.shapePreset,
      message: 'flowChartDecision drawn as a diamond',
    });
    builder.substitute({
      slideIndex: 2,
      slideId: 'runs-and-lists',
      object: 'Chart 4',
      code: ROW_CODES.chartKind,
      message: 'a doughnut chart drawn as a pie chart',
    });
    builder.substitute({
      slideIndex: 3,
      object: 'Picture 5',
      code: ROW_CODES.pictureEffect,
      message: 'the soft edge was dropped',
    });
    builder.drop({
      slideIndex: 3,
      object: 'Object 6',
      code: ROW_CODES.ole,
      message: 'an OLE object without a preview',
    });
    expect(builder.fidelity()).toEqual({ objects: 43, kept: 39, substituted: 3, dropped: 1 });
    const summary = builder.summary(3);
    expect(summary).toEqual({ imported: 42, substituted: 3, dropped: 1, slides: 3 });
    expect(importSummarySentence(summary)).toBe(
      '42 objects imported, 3 shown differently, 1 dropped',
    );
    expect(builder.rowsOf(3)).toHaveLength(2);
    expect(builder.list()[0]?.status).toBe('substituted');
  });

  it('lists the fonts by run count then name and marks the substitution', () => {
    const builder = new ImportReportBuilder();
    builder.font('Calibri', 3);
    builder.font('Georgia');
    builder.font('Calibri');
    builder.font('Arial');
    builder.font('  ');
    expect(builder.fonts()).toEqual([
      { family: 'Calibri', runs: 4 },
      { family: 'Arial', runs: 1 },
      { family: 'Georgia', runs: 1 },
    ]);
    expect(builder.fonts('Inter')[0]).toEqual({ family: 'Calibri', runs: 4, substituted: 'Inter' });
  });

  it('builds a report the schema accepts and refuses a malformed one', () => {
    const builder = new ImportReportBuilder();
    builder.keep(2);
    builder.drop({
      slideIndex: 1,
      code: ROW_CODES.placeholderFooter,
      message: 'the footer placeholder is drawn by the frame',
    });
    builder.font('Calibri', 2);
    const report = builder.build({
      deckId: 'fixture-01',
      slides: 3,
      theme: { mode: 'adopt', imported: false },
      source: {
        file: '01-text.pptx',
        slides: 3,
        page: { width: 1600, height: 900 },
        producer: 'python-pptx',
      },
      validation: { ok: true, issues: 0 },
    });
    expect(report.deckId).toBe('fixture-01');
    expect(report.summary).toEqual({ imported: 2, substituted: 0, dropped: 1, slides: 3 });
    expect(report.rows).toHaveLength(1);
    expect(report.fonts).toEqual([{ family: 'Calibri', runs: 2 }]);
    expect(report.theme).toEqual({ mode: 'adopt', imported: false });
    // the producer passes through since the widening of merge 1 (b3.md request B3-2)
    expect(report.source).toEqual({
      file: '01-text.pptx',
      slides: 3,
      page: { width: 1600, height: 900 },
      producer: 'python-pptx',
    });
    expect(fidelityOf(report)).toEqual({ objects: 3, kept: 2, substituted: 0, dropped: 1 });
    const dry = builder.build({
      slides: 3,
      theme: { mode: 'keep', imported: true, index: 0 },
      source: { file: '01-text.pptx', slides: 3, page: { width: 1600, height: 900 } },
      validation: { ok: false, issues: 2 },
    });
    expect(dry.deckId).toBeUndefined();
    expect(dry.theme).toEqual({ mode: 'keep', imported: true, index: 0 });
    expect(() =>
      builder.build({
        slides: 3,
        theme: { mode: 'adopt', imported: false },
        source: { file: '', slides: 3, page: { width: 1600, height: 900 } },
        validation: { ok: true, issues: 0 },
      }),
    ).toThrow();
  });

  it('names every row code once', () => {
    const codes = Object.values(ROW_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z]+(?:\.[a-zA-Z]+)?$/);
  });
});
