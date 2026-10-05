// The slides area's reading of the Import slides picker (lane A's request of the Round 1
// follow-up): since lane A item 1 the picker's empty sentence is "You have no other presentations
// yet" above the example deck's row, and the step's settle read waited for "No other
// presentations" alone. The driver's words are pinned against the dialog's own constant, so a
// change of the sentence fails here before a walk reads the list as never settling.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { IMPORT_EMPTY_WORDS } from './areas/slides.mjs';

const DIALOG = readFileSync(
  new URL('../../../packages/chrome/src/dialogs/ImportSlides.tsx', import.meta.url),
  'utf8',
);

describe('the Import slides empty sentence', () => {
  it('reads the dialog constant of this build', () => {
    const sentence = DIALOG.match(/export const IMPORT_NONE_OF_YOURS = '([^']+)'/)?.[1];
    expect(sentence).toBeDefined();
    expect(IMPORT_EMPTY_WORDS.test(sentence ?? '')).toBe(true);
  });

  it('still reads the sentence of the build before it', () => {
    expect(IMPORT_EMPTY_WORDS.test('No other presentations on this Turboslide')).toBe(true);
    expect(IMPORT_EMPTY_WORDS.test('Loading…')).toBe(false);
  });
});
