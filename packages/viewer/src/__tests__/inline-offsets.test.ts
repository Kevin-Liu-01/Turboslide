// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { plainLengthOf, plainOffsetOf } from '../InlineText';

// The plain offsets of a DOM position inside a run's editable (SPEC-2 0.54, 6.2 Lists). A list
// item's run starts with its icon svg, which counts nothing; the browser puts the caret before it
// after a click on the icon or Home, as the element position (span, 0), and that position is the
// start of the text, not its end (text-styles.spec.ts: Tab there raises the item's level).
function run(html: string): HTMLElement {
  const el = document.createElement('span');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('the plain offset of an element position', () => {
  it('counts from the first segment at or after the child, so before a leading icon is 0', () => {
    const el = run(
      '<svg class="ic ok" aria-hidden="true"><use href="#i"></use></svg>With GT: one.',
    );
    expect(plainOffsetOf(el, el, 0, false)).toBe(0);
    expect(plainOffsetOf(el, el, 1, false)).toBe(0);
    expect(plainOffsetOf(el, el, 2, false)).toBe('With GT: one.'.length);
    expect(plainLengthOf(el, false)).toBe('With GT: one.'.length);
  });

  it('reads a text node position as its segment start plus the offset', () => {
    const el = run('ab<i>cd</i>ef');
    const italic = el.querySelector('i')!;
    expect(plainOffsetOf(el, italic.firstChild!, 1, false)).toBe(3);
    expect(plainOffsetOf(el, el.lastChild!, 2, false)).toBe(6);
    expect(plainOffsetOf(el, italic, 1, false)).toBe(4);
  });

  it('is null outside the editable', () => {
    const el = run('abc');
    const other = run('zzz');
    expect(plainOffsetOf(el, other.firstChild!, 1, false)).toBeNull();
  });
});
