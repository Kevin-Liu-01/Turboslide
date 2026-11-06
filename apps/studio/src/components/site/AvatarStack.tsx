import type { CSSProperties } from 'react';
import { useRef } from 'react';

import { AGENT_BRANDS, AgentMark } from '@turboslide/chrome/presence/agent-marks';
import { hueFor } from '@turboslide/identity/hues';
import { COLLAB_GEOMETRY } from '@turboslide/render/collab';

import { useMountEffect } from '../useMountEffect';
import { attachAvatarStack } from './avatar-stack';
import { AGENTS, AVATAR_PRESS, PEOPLE } from './copy';
import type { OnPress } from './frame-boxes';

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
function Pointer() {
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
 * description; `attachAvatarStack` (avatar-stack.ts) hands a pressed person or agent to the live
 * editor below (`onPress`) and moves the row's one tab stop with the arrow keys. This component
 * calls it on mount; on /home's static load the page's script does (home-entry.ts).
 */
export function AvatarStack({ kind, onPress }: { kind: 'people' | 'agents'; onPress?: OnPress }) {
  const stack = useRef<HTMLSpanElement>(null);
  useMountEffect(() =>
    stack.current === null ? undefined : attachAvatarStack(stack.current, onPress),
  );
  const rows =
    kind === 'people'
      ? PEOPLE.map((person, i) => {
          const [x, y] = POINTER_AT[i] ?? [0, 0];
          return {
            key: person.name,
            name: person.name,
            data: { 'data-hue': person.hue },
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
          data: { 'data-brand': agent.brand },
          brand: agent.brand,
          style: { '--i': i } as CSSProperties,
        }));
  const describedBy = kind === 'people' ? AVATAR_PRESS.person.id : AVATAR_PRESS.agent.id;
  return (
    <span
      ref={stack}
      className="site-stack"
      data-stack={kind}
      role="group"
      aria-label={kind === 'people' ? 'People' : 'Agents'}
    >
      {rows.map((row, i) => (
        <button
          key={row.key}
          type="button"
          className={`site-av ${row.brand === null ? 'is-person' : 'is-agent'}`}
          aria-label={row.name}
          aria-describedby={describedBy}
          tabIndex={i === 0 ? 0 : -1}
          data-name={row.name}
          {...row.data}
          style={row.style}
        >
          {row.brand === null ? <Pointer /> : <AgentMark brand={row.brand} size={24} />}
        </button>
      ))}
    </span>
  );
}
