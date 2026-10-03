import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { toCanvas } from '@turboslide/schema/canvas';
import type { DeckDocument, TitleSlide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import {
  canvasFieldBlocks,
  carryFieldText,
  fieldRunsOnCanvas,
  isConversion,
  isFieldRun,
  yieldConcurrentConversion,
} from './conversion.ts';

// The cover conversion rules of the realtime round's fix round 3 (VERIFICATION.md "Realtime
// round, pass 3" finding 3). The admission's sequences live in apps/studio
// concurrent-conversion.test.ts and the object's in apps/realtime-worker test/conversion.test.ts;
// this file pins the module's own contract: nothing but the schema under it, so the room client
// can import it, and each rule on one entry.

const here = dirname(fileURLToPath(import.meta.url));
const COVER = 'title';
const SIZE: Mutation = {
  op: 'block.set',
  slideId: COVER,
  blockId: 'heading',
  path: '/typography',
  value: { size: 72 },
};

function withCover(heading: string): DeckDocument {
  const document = workedDocument();
  document.slides[COVER] = { ...(document.slides[COVER] as TitleSlide), heading };
  return document;
}
function conversionOf(heading: string): Extract<Mutation, { op: 'slide.replace' }> {
  const copy = { ...(workedDocument().slides[COVER] as TitleSlide), heading };
  const converted = toCanvas(copy, {
    blocks: { heading: [137, 300, 1646, 180], lead: [137, 520, 1200, 80] },
    mark: [137, 137, 132, 84],
    prompted: [],
  });
  if (converted === null) throw new Error('the cover did not convert');
  return { op: 'slide.replace', slideId: COVER, slide: converted.slide };
}
const field = (at: number, insert: string): Mutation => ({
  op: 'text.splice',
  slideId: COVER,
  blockId: 'heading',
  path: '/heading',
  at,
  remove: 0,
  insert,
});

describe('conversion', () => {
  it('imports the schema and nothing else, so the room client can import it', () => {
    const source = readFileSync(join(here, 'conversion.ts'), 'utf8');
    const from = source
      .split('\n')
      .filter((line) => /^import\b/.test(line))
      .map((line) => /from '([^']+)'/.exec(line)?.[1]);
    expect(from.length).toBeGreaterThan(0);
    expect(from.filter((path) => !path?.startsWith('@turboslide/schema/'))).toEqual([]);
  });

  it('tells an editor conversion from a bare replacement and a field run from a block run', () => {
    const replace = conversionOf('Title');
    expect(isConversion(replace, [replace, SIZE])).toBe(true);
    expect(isConversion(replace, [replace])).toBe(false);
    expect(isFieldRun(field(0, 'x'))).toBe(true);
    expect(isFieldRun({ ...field(0, 'x'), path: '/text' } as Mutation)).toBe(false);
    expect(canvasFieldBlocks(replace.slide)?.get('heading')).toBe('heading');
  });

  it('yields a conversion of a cover the document holds as a canvas, keeps one of a title', () => {
    const converted = withCover('Title');
    converted.slides[COVER] = conversionOf('Title').slide;
    const mine = conversionOf('Title mine');
    expect(yieldConcurrentConversion([mine, SIZE], [], converted)).toEqual([SIZE]);
    expect(yieldConcurrentConversion([mine, SIZE], [], withCover('Title'))).toEqual([mine, SIZE]);
    // a bare replacement keeps last writer wins
    expect(yieldConcurrentConversion([mine], [], converted)).toEqual([mine]);
  });

  it("carries the document's field text into a conversion and reads a field run on its canvas", () => {
    const document = withCover('Title theirs');
    const [carried] = carryFieldText([conversionOf('Title'), SIZE], document);
    expect(
      carried?.op === 'slide.replace' && canvasFieldBlocks(carried.slide)
        ? (carried.slide as { slots: { main: { id: string; text?: string }[] } }).slots.main.find(
            (block) => block.id === 'heading',
          )?.text
        : null,
    ).toBe('Title theirs');
    const canvas = fieldRunsOnCanvas([conversionOf('Title'), SIZE], [], document);
    expect(canvas.read(field(5, ' theirs'))).toMatchObject({ blockId: 'heading', path: '/text' });
    // the cover is a title before the entry: the entry's own field run stays a field run
    expect(canvas.retarget(field(5, ' mine'))).toEqual(field(5, ' mine'));
    const converted = withCover('Title');
    converted.slides[COVER] = conversionOf('Title').slide;
    expect(
      fieldRunsOnCanvas([field(5, ' mine')], [], converted).retarget(field(5, ' mine')),
    ).toEqual({ ...field(5, ' mine'), path: '/text' });
  });
});
