// @vitest-environment jsdom
// The collaborator marks of a filmstrip card (SPEC-3 4.3; the focus round, b6's fix round R1 and
// SPEC-3 16.5): the three chips stack leftwards from the card's top right corner and the `+N` chip
// is the leftmost, so an arrival never moves a chip already drawn, and the box the marks sit in is
// four fixed slots wide whatever the count, so the box's own edges never move either. The layout
// shift API counted every growth of the content sized box and every push of the chips by a `+N`
// chip that took the right edge as the first child (presence.spec.ts:411, twenty arrivals).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import type { PresenceParticipant } from '../editor-shell';
import { FilmstripMarks } from './FilmstripMarks';

const HERE = dirname(fileURLToPath(import.meta.url));

function participant(n: number, slideId: string): PresenceParticipant {
  return {
    principalId: `p${n}`,
    label: `Person ${n}`,
    trust: 'label',
    kind: 'anonymous',
    clientId: `c${n}`,
    role: 'editor',
    hue: ((n - 1) % 6) + 1,
    slideId,
    lastSeenAt: '2026-09-18T00:00:00.000Z',
  };
}

/** The marks read `input.presence.others` alone; the rest of the shell state is not reached. */
function shell(others: PresenceParticipant[]): EditorShellState {
  return { input: { presence: { others } } } as unknown as EditorShellState;
}

function marksOf(count: number): HTMLElement {
  const others = Array.from({ length: count }, (_, i) => participant(i + 1, 's1'));
  const { container } = render(
    <EditorShellContext value={shell(others)}>
      <FilmstripMarks slideId="s1" />
    </EditorShellContext>,
  );
  const marks = container.querySelector<HTMLElement>('.ts-card-marks');
  if (marks === null) throw new Error('no marks drawn');
  return marks;
}

afterEach(cleanup);

describe('the filmstrip card marks', () => {
  it('draw at most three chips and then the +N chip as the last child, the leftmost of the row-reverse box', () => {
    const marks = marksOf(5);
    const children = [...marks.children];
    expect(children).toHaveLength(4);
    expect(children.slice(0, 3).every((el) => el.classList.contains('ts-chip'))).toBe(true);
    expect(children[3]?.classList.contains('ts-card-marks-more')).toBe(true);
    expect(children[3]?.textContent).toBe('+2');
    expect(marks.getAttribute('data-count')).toBe('5');
  });

  it('draw no +N chip for three people and keep the chip order by arrival', () => {
    const marks = marksOf(3);
    expect(marks.querySelector('.ts-card-marks-more')).toBeNull();
    expect(marks.querySelectorAll('.ts-chip')).toHaveLength(3);
    // the first participant is the first child: the right edge of the row-reverse box
    expect(marks.children[0]?.classList.contains('ts-chip')).toBe(true);
  });

  it('sit in a fixed box of four 16 px slots packed at the right edge, so no arrival moves the box or a chip', () => {
    const css = readFileSync(join(HERE, '..', 'Filmstrip.css'), 'utf8');
    const rule = css.slice(
      css.indexOf('.ts-card-marks {'),
      css.indexOf('}', css.indexOf('.ts-card-marks {')),
    );
    expect(rule).toContain('width: 70px');
    expect(rule).toContain('height: 16px');
    expect(rule).toContain('flex-direction: row-reverse');
    expect(rule).toContain('justify-content: flex-start');
    expect(rule).toContain('right: 4px');
  });
});
