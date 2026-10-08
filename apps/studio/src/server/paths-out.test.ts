import { describe, expect, it } from 'vitest';

import { publicDeckAnswer, scrubServerPaths, withoutServerPaths } from './paths-out';

// No answer carries a path of this instance (security hotfix H3, DATA-V6): deck.create and
// deck.copy answered `dir`, the deck's absolute folder, and the worker's job records, render
// records and export reports named its job and cache folders.

const ROOTS = ['/srv/turboslide/.turboslide/overlay', '/srv/turboslide', '/tmp'];

describe('withoutServerPaths', () => {
  it("drops `dir` from a create answer and keeps the deck's facts", () => {
    const created = {
      deckId: 'imuy3qrntxccw6fblghyqfotnq',
      title: 'Q4 review',
      from: 'blank',
      revision: 0,
      dir: '/srv/turboslide/.turboslide/overlay/decks/imuy3qrntxccw6fblghyqfotnq',
      counts: { slides: 1, sections: 1, assets: 0 },
    };
    const answer = withoutServerPaths(created, ROOTS);
    expect(Object.keys(answer).sort()).toEqual(['counts', 'deckId', 'from', 'revision', 'title']);
    expect(answer).toMatchObject({ deckId: created.deckId, title: 'Q4 review' });
  });

  it("answers a new deck's dir as its place in the store, never its folder on the instance", () => {
    const answer = publicDeckAnswer(
      {
        deckId: 'imuy3qrntxccw6fblghyqfotnq',
        title: 'Q4 review',
        dir: '/srv/turboslide/.turboslide/overlay/decks/imuy3qrntxccw6fblghyqfotnq',
      },
      ROOTS,
    );
    expect(answer).toEqual({
      deckId: 'imuy3qrntxccw6fblghyqfotnq',
      title: 'Q4 review',
      dir: 'decks/imuy3qrntxccw6fblghyqfotnq',
    });
  });

  it("cuts a server path to its file's name wherever it sits, and leaves URL paths alone", () => {
    const job = {
      id: 'muzxn2u3-6a1922',
      dir: '/tmp/worker/jobs/muzxn2u3-6a1922',
      log: ['render /srv/turboslide/.turboslide/overlay/decks/q4/slides/title.json ready'],
      result: {
        report: {
          files: [{ path: '/tmp/worker/jobs/muzxn2u3-6a1922/export/Q4.pptx', bytes: 9 }],
          slides: [{ sheet: 'sheets/title.png', verify: { ref: '/tmp/a/ref.png' } }],
        },
        url: '/api/download/abc',
      },
    };
    const out = withoutServerPaths(job, ROOTS);
    expect(out).not.toHaveProperty('dir');
    expect(out.log).toEqual(['render title.json ready']);
    expect(out.result.report.files[0]?.path).toBe('Q4.pptx');
    expect(out.result.report.slides[0]?.sheet).toBe('sheets/title.png');
    expect(out.result.report.slides[0]?.verify.ref).toBe('ref.png');
    expect(out.result.url).toBe('/api/download/abc');
    expect(JSON.stringify(out)).not.toMatch(/\/srv\/|\/tmp\//);
  });

  it('cuts a path inside a message, the longest root first', () => {
    expect(
      scrubServerPaths(
        "ENOENT: no such file or directory, open '/srv/turboslide/.turboslide/overlay/decks/q4/deck.json'",
        ROOTS,
      ),
    ).toBe("ENOENT: no such file or directory, open 'deck.json'");
    expect(scrubServerPaths('No deck q4 under decks/', ROOTS)).toBe('No deck q4 under decks/');
  });
});
