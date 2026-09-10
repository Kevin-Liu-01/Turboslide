import { describe, expect, it } from 'vitest';

import { formatSlideHash, parseSlideHash, resolveSlideHash } from '../hash';

const ids = ['opener-brand', 'title', 'thesis'];

// #NN and #s/<slideId> (SPEC 5.3): both are read, the studio writes the stable form.
describe('slide hash', () => {
  it('parses the deck number form', () => {
    expect(parseSlideHash('#12')).toEqual({ n: 12 });
    expect(parseSlideHash('12')).toEqual({ n: 12 });
    expect(parseSlideHash('#0')).toBeNull();
  });

  it('parses the stable id form with escapes', () => {
    expect(parseSlideHash('#s/why-the-redesign')).toEqual({ id: 'why-the-redesign' });
    expect(parseSlideHash('#s/a%20b')).toEqual({ id: 'a b' });
    expect(parseSlideHash('#s/')).toBeNull();
  });

  it('ignores other hashes', () => {
    expect(parseSlideHash('')).toBeNull();
    expect(parseSlideHash('#foo')).toBeNull();
  });

  it('resolves to an id in deck order', () => {
    expect(resolveSlideHash('#2', ids)).toBe('title');
    expect(resolveSlideHash('#s/thesis', ids)).toBe('thesis');
    expect(resolveSlideHash('#9', ids)).toBeNull();
    expect(resolveSlideHash('#s/missing', ids)).toBeNull();
  });

  it('formats both forms', () => {
    expect(formatSlideHash('n', { id: 'title', n: 2 })).toBe('#2');
    expect(formatSlideHash('id', { id: 'a b', n: 2 })).toBe('#s/a%20b');
  });
});
