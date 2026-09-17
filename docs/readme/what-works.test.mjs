// The README section "What works today" (docs/FOCUS.md section 7) against the matrix and the
// specification: every paragraph of what-works-data.mjs is FOCUS.md's text verbatim, every feature of
// the matrix has an entry, every picture exists and is attached to one feature, the render shows a
// paragraph only while every row of its feature passes, and README.md carries what the renderer
// writes. Runs under the root vitest project `scripts` once its include lists docs/readme (b5 R3).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CORE_FEATURES,
  CORE_MATRIX,
  CORE_IDS,
  isManualRow,
  tally,
} from '../../scripts/probes/core-matrix.mjs';
import { FEATURES, LEAD, OUTPUTS_SENTENCE } from './what-works-data.mjs';
import {
  BEGIN,
  END,
  README_PATH,
  ROOT,
  matrixDate,
  renderSection,
  resultsFromToday,
  splice,
} from './what-works.mjs';

const FOCUS = readFileSync(join(ROOT, 'docs', 'FOCUS.md'), 'utf8');

describe('the paragraphs of what-works-data.mjs', () => {
  it('cover every feature of the matrix once', () => {
    const keys = FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...CORE_FEATURES].sort());
  });

  it('are the text of docs/FOCUS.md section 7, verbatim', () => {
    expect(FOCUS).toContain(LEAD);
    for (const f of FEATURES) expect(FOCUS, f.key).toContain(f.paragraph);
    /* FOCUS.md 7 carries the outputs sentence inside a longer sentence, in lower case and without its full stop */
    expect(FOCUS.toLowerCase()).toContain(OUTPUTS_SENTENCE.text.toLowerCase().replace(/\.$/, ''));
  });

  it('name pictures that exist, each attached to one feature, with a full stop on every alt text', () => {
    const seen = new Map();
    for (const f of FEATURES)
      for (const shot of f.shots) {
        expect(existsSync(join(ROOT, 'docs', 'readme', shot.file)), shot.file).toBe(true);
        expect(seen.has(shot.file), `${shot.file} is attached twice`).toBe(false);
        seen.set(shot.file, f.key);
        expect(shot.alt).toMatch(/\.$/);
        expect(shot.caption).toMatch(/\.$/);
      }
    /* every README picture but the first, which sits under the introduction */
    const files = readdirSync(join(ROOT, 'docs', 'readme')).filter((n) => n.endsWith('.jpg'));
    for (const file of files)
      if (file !== '01-new-presentation.jpg') expect(seen.has(file), file).toBe(true);
  });

  it('hold the outputs sentence on core ids', () => {
    for (const id of OUTPUTS_SENTENCE.rows) expect(CORE_IDS).toContain(id);
  });
});

describe('renderSection', () => {
  it("shows a paragraph only while every row of its feature passes, and lists the rest as held with the file's counts", () => {
    const results = resultsFromToday();
    const section = renderSection({ results, date: matrixDate(), fromToday: true });
    for (const f of FEATURES) {
      const rows = CORE_MATRIX.filter((r) => r.feature === f.key);
      /* a manual row (ruling (3)) left not driven holds nothing; it is listed as walked by hand */
      const red = rows.filter(
        (r) => results[r.id] !== 'passed' && !(results[r.id] === 'not driven' && isManualRow(r)),
      );
      if (red.length === 0) {
        expect(section).toContain(f.paragraph);
      } else {
        expect(section).not.toContain(f.paragraph);
        expect(section).toContain(`- ${f.heading}: ${red.length} of ${rows.length} rows hold it: `);
        for (const r of red) expect(section).toContain(`\`${r.id}\` (${r.today})`);
      }
    }
    expect(section).toContain(matrixDate());
    /* the counts of the held list add up to the matrix's failed and not driven rows */
    const t = tally();
    const held = [...section.matchAll(/: (\d+) of (\d+) rows hold it/g)];
    const holding = held.reduce((n, m) => n + Number(m[1]), 0);
    const manualNotDriven = CORE_MATRIX.filter(
      (r) => isManualRow(r) && results[r.id] === 'not driven',
    );
    expect(holding).toBe(t.broken + t.flaky + t['not driven'] - manualNotDriven.length);
    expect(section).toContain('Walked by hand, never counted as passed by a run');
    for (const r of manualNotDriven) expect(section).toContain(`\`${r.id}\``);
  });

  it('prints every paragraph, no held list and the outputs sentence when every row passed', () => {
    const results = Object.fromEntries(CORE_IDS.map((id) => [id, 'passed']));
    const section = renderSection({
      results,
      commit: 'abc1234',
      origin: 'https://example.test',
      date: '2026-09-16',
    });
    for (const f of FEATURES) expect(section).toContain(f.paragraph);
    expect(section).not.toContain('### Held until every row passes');
    expect(section).toContain(OUTPUTS_SENTENCE.text);
    expect(section).toContain('`abc1234`');
    for (const f of FEATURES) for (const shot of f.shots) expect(section).toContain(shot.file);
  });

  it('holds a feature on one failed row and never counts a not driven row as passed', () => {
    const results = Object.fromEntries(CORE_IDS.map((id) => [id, 'passed']));
    /* a row the outputs sentence names, so the sentence is held with the feature */
    const first = CORE_MATRIX.find((r) => r.id === 'export.pdf.file');
    results[first.id] = 'failed';
    const second = CORE_MATRIX.find((r) => r.feature === 'help');
    delete results[second.id];
    const section = renderSection({ results, date: '2026-09-16' });
    expect(section).toContain(
      `- Download and print: 1 of ${CORE_MATRIX.filter((r) => r.feature === 'export').length} rows hold it: \`${first.id}\` (failed).`,
    );
    expect(section).toContain(`\`${second.id}\` (not driven)`);
    expect(section).not.toContain(OUTPUTS_SENTENCE.text);
  });
});

describe('README.md', () => {
  it('carries the markers once and the block the renderer writes', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    expect(readme.split(BEGIN).length).toBe(2);
    expect(readme.split(END).length).toBe(2);
    const section = renderSection({
      results: resultsFromToday(),
      date: matrixDate(),
      fromToday: true,
    });
    expect(splice(readme, section)).toBe(readme);
  });
});
