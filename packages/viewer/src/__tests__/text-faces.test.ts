// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { loadTextFaces } from '../text-fit';

// The font wait of the design round (docs/DESIGN.md 4.4): Inter loads as unicode-range subsets,
// so the measuring code asks `document.fonts.load(font, text)` with each node's own characters and
// the subsets those characters touch resolve before a box is read. jsdom has no FontFaceSet, so
// the test stands one in and reads the questions asked.

type Call = { font: string; text: string };

function standIn(answer: (call: Call) => Promise<FontFace[]>): Call[] {
  const calls: Call[] = [];
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      load: (font: string, text: string) => {
        const call = { font, text };
        calls.push(call);
        return answer(call);
      },
    },
  });
  return calls;
}

afterEach(() => {
  document.body.innerHTML = '';
  Reflect.deleteProperty(document, 'fonts');
});

describe('loadTextFaces', () => {
  it('asks for each computed font with the distinct characters of its own text', async () => {
    const calls = standIn(async () => []);
    document.body.innerHTML = `
      <div id="root">
        <h1 style="font-family: Inter; font-weight: 500; font-size: 44px">Привет, мир</h1>
        <p style="font-family: Inter; font-weight: 400; font-size: 22px">Quarterly review</p>
        <p style="font-family: Inter; font-style: italic; font-weight: 400; font-size: 22px">aaaa bbbb</p>
        <p style="font-family: Inter; font-size: 22px">   </p>
      </div>`;
    const asked = await loadTextFaces(document.getElementById('root') as Element);
    expect(asked).toBe(3);
    const cyrillic = calls.find((c) => c.font.includes('44px'));
    expect(cyrillic?.text).toBe(
      'Привет,мир'
        .split('')
        .filter((c, i, a) => a.indexOf(c) === i)
        .join(''),
    );
    expect(calls.find((c) => c.font.startsWith('italic'))?.text).toBe('ab');
    expect(calls.every((c) => /Inter/.test(c.font))).toBe(true);
  });

  it('returns at its bound when a face never answers, and does nothing without a font set', async () => {
    standIn(() => new Promise<FontFace[]>(() => undefined));
    document.body.innerHTML =
      '<div id="root"><p style="font-family: Inter; font-size: 16px">Text</p></div>';
    const started = Date.now();
    expect(await loadTextFaces(document.getElementById('root') as Element, 50)).toBe(1);
    expect(Date.now() - started).toBeLessThan(2000);
    Reflect.deleteProperty(document, 'fonts');
    expect(await loadTextFaces(document.getElementById('root') as Element)).toBe(0);
  });
});
