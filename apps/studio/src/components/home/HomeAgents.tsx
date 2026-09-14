import { AGENTS, resolveText } from './copy';
import type { HomeFacts } from './facts';
import { HomeLink } from './HomeLink';

/**
 * For agents (gslides-parity SPEC-4 2.2 item 8; R05 6.7): six rows with a label, one sentence and
 * one real command in `--pt-mono` inside a hairline box on `--pt-plate`, the bearer sentence and
 * the `deck push` sentence. Monospace is an instrument here and nowhere else on the page apart
 * from the source lines (0.20). The OpenAPI row points at the committed file on GitHub until the
 * hosted studio serves the generated files from its bundle (2.2 item 8; R05 8.4).
 */
export function HomeAgents({ facts }: { facts: HomeFacts | null }) {
  return (
    <section
      className="ts-product-band"
      id={AGENTS.anchor}
      aria-labelledby="ts-product-h-agents"
      data-band="agents"
    >
      <div className="ts-product-rail">
        <div className="ts-product-band-head">
          <h2 id="ts-product-h-agents" className="ts-product-h2">
            {AGENTS.heading}
          </h2>
          <p className="ts-product-lead">{resolveText(AGENTS.lead, facts) ?? ''}</p>
        </div>
        <div className="ts-product-agents">
          {AGENTS.rows.map((row) => (
            <div key={row.id} className="ts-product-agent" data-transport={row.id}>
              <b className="ts-product-agent-label">{row.label}</b>
              <div>
                <p className="ts-product-agent-sentence">{row.sentence}</p>
                <pre className="ts-product-cmd">
                  <code>{row.command.join('\n')}</code>
                </pre>
                {row.href !== undefined ? (
                  <HomeLink
                    href={row.href}
                    external
                    tip={{ name: row.label, doc: 'The committed file, on GitHub.' }}
                    control={`home.agents.${row.id}`}
                    className="ts-product-agent-link"
                  >
                    Read the file on GitHub
                  </HomeLink>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="ts-product-closing">{AGENTS.closing}</p>
        <pre className="ts-product-cmd ts-product-cmd-push">
          <code>{AGENTS.push}</code>
        </pre>
      </div>
    </section>
  );
}
