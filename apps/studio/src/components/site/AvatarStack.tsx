import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';

import { AGENT_BRANDS, AgentMark } from '@turboslide/chrome/presence/agent-marks';
import { hueFor } from '@turboslide/identity/hues';

import { AGENTS, AVATAR_PRESS, PEOPLE } from './copy';
import { Portrait } from './Portrait';
import type { TryPressed } from './try-frame';

/** What the title does with a press: the hero hands it to the live editor (HeroBox.tsx). */
export type OnPress = (who: TryPressed) => void;

/** How long a pressed avatar's ring pulses. */
const PRESSED_MS = 1200;

/**
 * One stack of the title (docs/SITE.md B): the avatars fan along a circular arc that rises from
 * the top right of the stack's word. The stack is positioned out of the line's flow, so it takes
 * no width and the sentence keeps its word spacing; site.css places each avatar on the arc from
 * its index (`--i`) and opens the fan on hover and focus. People are generated portraits
 * (Portrait.tsx) and agents the tools' own marks on a plate of their own, each in a solid ring of
 * its live hue (packages/identity/src/hues.ts).
 *
 * Each avatar is a button named by its person or tool, with what pressing does as its
 * description; pressing hands the person or the agent to the live editor below (`onPress`). The
 * stack is one tab stop: the arrow keys move along the arc, Home and End go to its ends, and Enter
 * and Space press.
 */
export function AvatarStack({ kind, onPress }: { kind: 'people' | 'agents'; onPress?: OnPress }) {
  const rows =
    kind === 'people'
      ? PEOPLE.map((person) => ({
          key: person.name,
          name: person.name,
          hue: person.hue,
          who: { kind: 'person', name: person.name, hue: person.hue } as TryPressed,
          brand: null,
        }))
      : AGENTS.map((agent) => ({
          key: agent.brand,
          name: AGENT_BRANDS[agent.brand].name,
          hue: agent.hue,
          who: { kind: 'agent', brand: agent.brand } as TryPressed,
          brand: agent.brand,
        }));
  /* the avatar that takes the stack's one tab stop: the last one focused */
  const [current, setCurrent] = useState(0);
  const press = (event: MouseEvent<HTMLButtonElement>, who: TryPressed): void => {
    const button = event.currentTarget;
    /* the ring pulses once (site.css); a second press restarts it */
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
      style={{ '--n': rows.length } as CSSProperties}
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
          style={{ '--ts-hue': hueFor(row.hue), '--i': i } as CSSProperties}
          onFocus={() => setCurrent(i)}
          onClick={(event) => press(event, row.who)}
        >
          {row.brand === null ? (
            <Portrait name={row.name} index={i} />
          ) : (
            <span className="site-av-plate">
              <AgentMark brand={row.brand} size={24} />
            </span>
          )}
        </button>
      ))}
    </span>
  );
}
