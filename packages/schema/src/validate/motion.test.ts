// The `motion` validator family (gslides-parity SPEC-5 1.2): a repeated id, an unknown block and
// Play on a non media block refuse the deck; a direction on a non fly effect, a fly without a
// direction and By paragraph on a block without paragraphs are reported at severity 2 and kept;
// a second YouTube video set to Play (automatically) on one slide is refused; the motion fixture
// deck under decks/fixture/motion validates with no issue (MILESTONES-5 B1 day 1).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Block } from '../blocks.ts';
import type { ContentSlide, Deck, DeckDocument, Slide } from '../deck.ts';
import { freeformDocument } from '../fixtures.ts';
import type { Animation } from '../motion.ts';
import { validateDeck, validateDocument } from '../validate.ts';
import type { Issue } from '../validate.ts';
import { validateMotion } from './motion.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE_DIR = join(REPO, 'decks/fixture/motion');

const row = (extra: Partial<Animation> = {}): Animation => ({
  id: 'a1',
  blockId: 'p1',
  effect: 'appear',
  trigger: 'click',
  durationMs: 500,
  ...extra,
});

/** The worked deck with the freeform slide carrying the given rows. */
function withRows(animations: Animation[], blocks?: Block[]): DeckDocument {
  const document = freeformDocument();
  const free = document.slides['free'] as ContentSlide;
  if (blocks !== undefined) free.slots.main = [...(free.slots.main ?? []), ...blocks];
  free.animations = animations;
  return document;
}

function motionIssues(document: DeckDocument): Issue[] {
  return validateMotion(document);
}

/** A positioned video block with Play (automatically), the source and overrides spread over it. */
const media = (id: string, extra: Record<string, unknown>): Block =>
  ({
    id,
    type: 'media',
    kind: 'video',
    playback: { start: 'auto' },
    pos: { x: 137, y: 400, w: 320, h: 180, z: 9 },
    ...extra,
  }) as Block;

describe('validateMotion (SPEC-5 1.2)', () => {
  it('answers nothing for a slide without rows and for rows that name existing blocks', () => {
    expect(motionIssues(freeformDocument())).toEqual([]);
    expect(
      motionIssues(
        withRows([
          row(),
          row({ id: 'a2', blockId: 'box', effect: 'flyIn', direction: 'left' }),
          row({ id: 'a3', blockId: 'p1', effect: 'fadeIn', byParagraph: true }),
        ]),
      ),
    ).toEqual([]);
  });

  it('refuses a repeated animation id', () => {
    const issues = motionIssues(withRows([row(), row({ blockId: 'box' })]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'motion',
      severity: 3,
      file: 'slides/free.json',
      pointer: '/animations/1/id',
    });
    expect(issues[0]?.message).toMatch(/repeated/);
  });

  it('refuses a row naming a block that is not a top level block of the slide', () => {
    const issues = motionIssues(withRows([row({ blockId: 'nope' })]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 3, pointer: '/animations/0/blockId' });
    expect(issues[0]?.message).toMatch(/"nope"/);
  });

  it('reports a direction on a non fly effect and a fly without one at severity 2', () => {
    const issues = motionIssues(
      withRows([
        row({ effect: 'fadeIn', direction: 'left' }),
        row({ id: 'a2', blockId: 'box', effect: 'flyOut' }),
      ]),
    );
    expect(issues.map((issue) => [issue.severity, issue.pointer])).toEqual([
      [2, '/animations/0/direction'],
      [2, '/animations/1/direction'],
    ]);
    expect(issues[1]?.message).toMatch(/to the left/);
  });

  it('reports By paragraph on a block without paragraphs at severity 2', () => {
    const issues = motionIssues(
      withRows([
        row({ blockId: 'ic', byParagraph: true }),
        row({ id: 'a2', blockId: 'arrow', byParagraph: true }),
        row({ id: 'a3', blockId: 'box', byParagraph: true }),
      ]),
    );
    expect(issues.map((issue) => [issue.severity, issue.pointer])).toEqual([
      [2, '/animations/0/byParagraph'],
      [2, '/animations/1/byParagraph'],
    ]);
  });

  it('refuses Play on a block that is not a media block and admits it on one', () => {
    const refused = motionIssues(withRows([row({ effect: 'playMedia' })]));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ severity: 3, pointer: '/animations/0/effect' });
    const admitted = motionIssues(
      withRows(
        [row({ blockId: 'clip', effect: 'playMedia', trigger: 'withPrevious' })],
        [media('clip', { source: { asset: 'bars' } })],
      ),
    );
    expect(admitted).toEqual([]);
  });

  it('refuses a second YouTube video set to Play (automatically) on one slide', () => {
    const one = motionIssues(withRows([], [media('v1', { source: { youtube: 'dQw4w9WgXcQ' } })]));
    expect(one).toEqual([]);
    const two = motionIssues(
      withRows(
        [],
        [
          media('v1', { source: { youtube: 'dQw4w9WgXcQ' } }),
          media('v2', { source: { youtube: 'dQw4w9WgXcQ' } }),
          media('v3', { source: { youtube: 'dQw4w9WgXcQ' }, playback: { start: 'click' } }),
        ],
      ),
    );
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ severity: 3, pointer: '/slots/main/7/playback/start' });
    expect(two[0]?.message).toMatch(/"v2".*"v1"/);
  });

  it('reaches validateDocument with the family code and the ok flag', () => {
    const result = validateDocument(withRows([row({ blockId: 'nope' })]));
    expect(result.ok).toBe(false);
    expect(result.issues.filter((issue) => issue.code === 'motion')).toHaveLength(1);
    const kept = validateDocument(withRows([row({ effect: 'fadeIn', direction: 'top' })]));
    expect(kept.ok).toBe(true);
    expect(kept.issues.filter((issue) => issue.code === 'motion')).toHaveLength(1);
  });
});

describe('the motion fixture deck (SPEC-5 2.6)', () => {
  it('validates at schemaVersion 1 with no issue', () => {
    const deck = JSON.parse(readFileSync(join(FIXTURE_DIR, 'deck.json'), 'utf8')) as Deck;
    const slides = readdirSync(join(FIXTURE_DIR, 'slides')).map(
      (file) => JSON.parse(readFileSync(join(FIXTURE_DIR, 'slides', file), 'utf8')) as Slide,
    );
    const result = validateDeck({ deck, slides });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(slides).toHaveLength(11);
    const kinds = slides
      .map((slide) => slide.transition?.kind)
      .filter((kind): kind is NonNullable<typeof kind> => kind !== undefined)
      .sort();
    expect(kinds).toEqual(
      ['none', 'dissolve', 'fade', 'slideRight', 'slideLeft', 'flip', 'cube', 'gallery'].sort(),
    );
    expect(slides.filter((slide) => (slide.animations?.length ?? 0) > 0)).toHaveLength(11);
  });
});
