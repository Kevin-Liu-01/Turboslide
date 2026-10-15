import type { CSSProperties } from 'react';

import { AGENT_BRANDS, AgentMark } from '@turboslide/chrome/presence/agent-marks';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { hueFor } from '@turboslide/identity/hues';

import { AGENTS, AVATAR_DOCS, PEOPLE } from './copy';

/**
 * One stack of the title (docs/SITE.md B): round avatars in the product's presence style, a 1 px
 * ring in a live hue (packages/identity/src/hues.ts), a 1 px paper gap, then the field, each
 * overlapping the one before by 30 percent with a 2 px paper cut, the first on top. People draw
 * the initial of a generated name (from `data-initial` through CSS, so the h1's text stays the
 * sentence); agents draw the tool's own mark inside the dashed ring, the product's agent sign.
 *
 * Each avatar is `role="img"` with its name, takes the focus, and carries the product's Tooltip
 * (the name, then one sentence), so it names itself to a screen reader and to a pointer. The
 * stack itself has no role, so the heading reads its words and the names in order.
 */
const hue = (slot: number): CSSProperties => ({ '--ts-hue': hueFor(slot) }) as CSSProperties;

export function AvatarStack({ kind }: { kind: 'people' | 'agents' }) {
  if (kind === 'people')
    return (
      <span className="site-stack" data-stack="people">
        {PEOPLE.map((person) => (
          <span
            key={person.name}
            className="site-av is-person"
            role="img"
            aria-label={person.name}
            tabIndex={0}
            data-initial={person.name.charAt(0)}
            style={hue(person.hue)}
            {...tipProps({ name: person.name, doc: AVATAR_DOCS.person })}
          />
        ))}
      </span>
    );
  return (
    <span className="site-stack" data-stack="agents">
      {AGENTS.map((agent) => {
        const name = AGENT_BRANDS[agent.brand].name;
        return (
          <span
            key={agent.brand}
            className="site-av is-agent"
            role="img"
            aria-label={name}
            tabIndex={0}
            data-brand={agent.brand}
            style={hue(agent.hue)}
            {...tipProps({ name, doc: AVATAR_DOCS.agent })}
          >
            <AgentMark brand={agent.brand} size={16} />
          </span>
        );
      })}
    </span>
  );
}
