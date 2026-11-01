import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';

import { AGENT_BRANDS, AgentMark } from '@turboslide/chrome/presence/agent-marks';
import { hueFor } from '@turboslide/identity/hues';
import { COLLAB_GEOMETRY } from '@turboslide/render/collab';

import { AGENTS, AVATAR_PRESS, PEOPLE } from './copy';
import type { TryPressed } from './try-frame';

/** What the title does with a press: the hero hands it to the live editor (HeroBox.tsx). */
export type OnPress = (who: TryPressed) => void;

/** How long a pressed figure shows its flag, so a touch reads the name too. */
const PRESSED_MS = 1200;

/**
 * Where each person's pointer rests in its row, in em of the title: the left edge, then the offset
 * from the row's middle. The five sit at different heights, as five people's pointers do.
 */
export const POINTER_AT: ReadonlyArray<readonly [number, number]> = [
  [0, -0.12],
  [0.4, 0.1],
  [0.8, -0.14],
  [1.2, 0.12],
  [1.6, -0.02],
];

const { width: POINTER_W, height: POINTER_H, points: POINTER_POINTS } = COLLAB_GEOMETRY.pointer;

/**
 * A person's pointer as the editor draws another person's (RemoteCursors.tsx, presence.css): the
 * 12 by 16 polygon of COLLAB_GEOMETRY in the person's live hue, inside the paper and ink halo that
 * keeps it legible on any ground. The tip is at the box's top left, 2 units in.
 */
export function Pointer() {
  return (
    <svg
      className="site-pointer"
      viewBox={`-2 -2 ${POINTER_W + 4} ${POINTER_H + 4}`}
      aria-hidden="true"
      focusable="false"
    >
      <polygon className="site-pointer-out" points={POINTER_POINTS} />
      <polygon className="site-pointer-in" points={POINTER_POINTS} />
      <polygon className="site-pointer-fill" points={POINTER_POINTS} />
    </svg>
  );
}

/**
 * One row of the title (docs/SITE.md B), each figure drawn as the editor draws it, with no disc and
 * no plate (Kevin, 2026-10-31): after "people" the five people's pointers in their live hues
 * (packages/identity/src/hues.ts), resting at different heights; after "agents" the four tools'
 * own marks. A pointer over a figure or the keyboard's focus on it lifts it and shows its flag,
 * ink with the name in paper at the side the editor's flag takes (site.css).
 *
 * Each figure is a button named by its person or tool, with what pressing does as its
 * description; pressing hands the person or the agent to the live editor below (`onPress`), where
 * the same pointer or mark appears. The row is one tab stop: the arrow keys move along it, Home and
 * End go to its ends, and Enter and Space press.
 */
export function AvatarStack({ kind, onPress }: { kind: 'people' | 'agents'; onPress?: OnPress }) {
  const rows =
    kind === 'people'
      ? PEOPLE.map((person, i) => {
          const [x, y] = POINTER_AT[i] ?? [0, 0];
          return {
            key: person.name,
            name: person.name,
            who: { kind: 'person', name: person.name, hue: person.hue } as TryPressed,
            brand: null,
            style: {
              '--ts-hue': hueFor(person.hue),
              '--i': i,
              '--x': `${x}em`,
              '--y': `${y}em`,
            } as CSSProperties,
          };
        })
      : AGENTS.map((agent, i) => ({
          key: agent.brand,
          name: AGENT_BRANDS[agent.brand].name,
          who: { kind: 'agent', brand: agent.brand } as TryPressed,
          brand: agent.brand,
          style: { '--i': i } as CSSProperties,
        }));
  /* the figure that takes the row's one tab stop: the last one focused */
  const [current, setCurrent] = useState(0);
  const press = (event: MouseEvent<HTMLButtonElement>, who: TryPressed): void => {
    const button = event.currentTarget;
    /* the figure clicks once (site.css); a second press restarts it */
    delete button.dataset.pressed;
    void button.offsetWidth;
    button.dataset.pressed = '';
    window.setTimeout(() => {
      delete button.dataset.pressed;
    }, PRESSED_MS);
    onPress?.(who);
  };
  const move = (event: KeyboardEvent<HTMLSpanElement>): void => {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: -rows.length,
      End: rows.length,
    };
    const by = step[event.key];
    if (by === undefined) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.site-av')];
    const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = Math.min(rows.length - 1, Math.max(0, (from < 0 ? current : from) + by));
    event.preventDefault();
    setCurrent(next);
    buttons[next]?.focus();
  };
  const describedBy = kind === 'people' ? AVATAR_PRESS.person.id : AVATAR_PRESS.agent.id;
  return (
    <span
      className="site-stack"
      data-stack={kind}
      role="group"
      aria-label={kind === 'people' ? 'People' : 'Agents'}
      onKeyDown={move}
    >
      {rows.map((row, i) => (
        <button
          key={row.key}
          type="button"
          className={`site-av ${row.brand === null ? 'is-person' : 'is-agent'}`}
          aria-label={row.name}
          aria-describedby={describedBy}
          tabIndex={i === current ? 0 : -1}
          data-name={row.name}
          {...(row.brand === null ? {} : { 'data-brand': row.brand })}
          style={row.style}
          onFocus={() => setCurrent(i)}
          onClick={(event) => press(event, row.who)}
        >
          {row.brand === null ? <Pointer /> : <AgentMark brand={row.brand} size={24} />}
        </button>
      ))}
    </span>
  );
}
