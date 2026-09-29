import { AGENTS } from './copy';
import { AgentsDiagram } from './diagrams/Agents';
import type { HomeFacts } from './facts';
import { HomeLink } from './HomeLink';
import { HomeSection } from './HomeSection';

/**
 * Agents (docs/POLISH.md 3.2 item 6): the same actions run without the page. One lead with the
 * action count from the facts, one command box (the one monospace on the page, SPEC-4 0.20), the
 * diagram of the action table with its four transports in and the deck out, and one link to the
 * agent documentation. The section keeps the `agents` anchor the earlier rounds' links name.
 */
export function HomeAgents({ facts }: { facts: HomeFacts }) {
  return (
    <HomeSection
      id={AGENTS.anchor}
      icon={AGENTS.icon}
      heading={AGENTS.heading}
      lead={AGENTS.lead(facts)}
      after={
        <>
          <pre className="ts-product-cmd">
            <code>{AGENTS.command}</code>
          </pre>
          <HomeLink
            href={AGENTS.link.href}
            external
            control={AGENTS.link.id}
            className="ts-product-link"
          >
            {AGENTS.link.label}
          </HomeLink>
        </>
      }
    >
      <AgentsDiagram facts={facts} />
    </HomeSection>
  );
}
