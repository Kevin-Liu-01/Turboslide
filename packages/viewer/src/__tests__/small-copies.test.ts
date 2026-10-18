import { describe, expect, it } from 'vitest';

import { chooseSmallCopies } from '../small-copies';

// Hardening HR-PC#6: a clone offers a picture's 400 px copy beside its twin through srcset, with
// sizes from the width the clone draws it at, so a filmstrip frame fetches the copy and a large
// preview the twin. The viewer's tests run in Node, so the pictures are stand-ins with the four
// members the function reads and writes.

type Picture = {
  attributes: Map<string, string>;
  offsetWidth: number;
  offsetHeight: number;
  writes: number;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
};

function picture(attributes: Record<string, string>, box: [number, number]): Picture {
  const made: Picture = {
    attributes: new Map(Object.entries(attributes)),
    offsetWidth: box[0],
    offsetHeight: box[1],
    writes: 0,
    getAttribute: (name) => made.attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      made.writes += 1;
      made.attributes.set(name, value);
    },
  };
  return made;
}

function rootOf(pictures: Picture[]): ParentNode {
  return {
    querySelectorAll: (selector: string) => {
      expect(selector).toBe('img[data-thumb][data-thumb-w]');
      return pictures;
    },
  } as unknown as ParentNode;
}

const TWIN = {
  src: '/decks/d/assets/field.1a2b3c4d.jpg',
  width: '1600',
  height: '900',
  'data-thumb': '/decks/d/assets/field.5e6f7a8b-w400.webp',
  'data-thumb-w': '400',
};

describe('chooseSmallCopies', () => {
  it('offers the copy beside the twin, sized at the width the filmstrip frame draws', () => {
    const full = picture(TWIN, [1600, 900]);
    // a 193 px frame: k = 193 / 1600
    chooseSmallCopies(rootOf([full]), 193 / 1600);
    expect(full.attributes.get('srcset')).toBe(
      '/decks/d/assets/field.5e6f7a8b-w400.webp 400w, /decks/d/assets/field.1a2b3c4d.jpg 1600w',
    );
    expect(full.attributes.get('sizes')).toBe('193px');
    // the same frame again writes nothing, so the browser's selection is not restarted
    const writes = full.writes;
    chooseSmallCopies(rootOf([full]), 193 / 1600);
    expect(full.writes).toBe(writes);
    // a 640 px preview asks for more than the copy holds
    chooseSmallCopies(rootOf([full]), 640 / 1600);
    expect(full.attributes.get('sizes')).toBe('640px');
  });

  it('sizes a covering picture by the side it overflows, and a box with no layout by its twin', () => {
    // a tall narrow box covered by a 16:9 twin draws the twin 1600 sheet px wide
    const covering = picture(TWIN, [200, 900]);
    // a box that has no layout yet (a detached tree) falls back to the twin's width
    const unlaid = picture(TWIN, [0, 0]);
    chooseSmallCopies(rootOf([covering, unlaid]), 0.1);
    expect(covering.attributes.get('sizes')).toBe('160px');
    expect(unlaid.attributes.get('sizes')).toBe('160px');
  });

  it('leaves a picture alone when its twin is not wider than the copy or a field is missing', () => {
    const narrow = picture({ ...TWIN, width: '400', height: '300' }, [400, 300]);
    const noSrc = picture({ ...TWIN, src: '' }, [1600, 900]);
    const badWidth = picture({ ...TWIN, 'data-thumb-w': 'wide' }, [1600, 900]);
    chooseSmallCopies(rootOf([narrow, noSrc, badWidth]), 0.12);
    for (const untouched of [narrow, noSrc, badWidth]) {
      expect(untouched.writes).toBe(0);
      expect(untouched.attributes.has('srcset')).toBe(false);
    }
  });
});
