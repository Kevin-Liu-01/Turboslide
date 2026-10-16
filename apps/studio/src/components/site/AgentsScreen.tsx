import { Fragment } from 'react';

import { AGENTS_SCREEN } from './copy';
import { SITE_FACTS } from './facts';
import { RECORDED_RUN, commandParts } from './run';
import { SiteIcon } from './SiteIcon';

/**
 * Screen 02 (docs/SITE.md A.4): the ruled title block, then the run recorded from the CLI on the
 * #101010 panel beside the one action, slide.new, on each transport with the reference's counts
 * (facts.ts). Static text: no replay and no motion.
 */
export function AgentsScreen() {
  const { table } = AGENTS_SCREEN;
  return (
    <section className="site-screen site-wrap" id="agents" aria-labelledby="site-agents-title">
      <header className="site-screen-head">
        <p className="t-label site-label">
          <SiteIcon name="command-line" />
          <span className="site-num">{AGENTS_SCREEN.number}</span>
          {AGENTS_SCREEN.label}
        </p>
        <h2 id="site-agents-title" className="t-title">
          {AGENTS_SCREEN.sentence}
        </h2>
      </header>
      <div className="site-agents">
        <figure className="site-term">
          <figcaption className="site-term-head">
            <span className="t-label">{AGENTS_SCREEN.terminal.label}</span>
            <span className="t-label">{AGENTS_SCREEN.terminal.count(RECORDED_RUN.length)}</span>
          </figcaption>
          <pre>
            <code>
              {RECORDED_RUN.map((step) => (
                <Fragment key={step.answer}>
                  <span className="site-ln is-cmd">
                    <span className="site-ps" aria-hidden="true">
                      ${' '}
                    </span>
                    {commandParts(step.argv).map((part, i) => (
                      <Fragment key={`${i}-${part}`}>
                        {i === 0 ? '' : ' '}
                        <span className={part.startsWith('--') ? 'site-nw' : undefined}>
                          {part}
                        </span>
                      </Fragment>
                    ))}
                  </span>
                  <span className="site-ln is-out">{step.answer}</span>
                </Fragment>
              ))}
            </code>
          </pre>
        </figure>
        <div className="site-transports">
          <table className="site-spec">
            <caption className="t-label">{table.caption}</caption>
            <thead>
              <tr>
                <th className="t-label" scope="col">
                  {table.heads.transport}
                </th>
                <th className="t-label" scope="col">
                  {table.heads.name}
                </th>
                <th className="t-label" scope="col">
                  {table.heads.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="site-label">
                      <SiteIcon name={row.icon} />
                      {row.transport}
                    </span>
                  </th>
                  <td>
                    <code>{row.name}</code>
                  </td>
                  <td>{SITE_FACTS[row.id]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{table.total}</th>
                <td />
                <td>{SITE_FACTS.actions}</td>
              </tr>
            </tfoot>
          </table>
          <p className="site-note t-small">{AGENTS_SCREEN.note}</p>
        </div>
      </div>
    </section>
  );
}
