import { AGENTS_SCREEN } from './copy';
import { Frame } from './Frame';
import { InlineCode } from './InlineCode';
import { SiteIcon } from './SiteIcon';

/**
 * Screen 03's figure (docs/SITE.md 9): every caller of `slide.new`, the menu item and the four
 * transports of the table above, joins one rail that runs through the action's two checks to
 * Version history; each check drops its refusal under the rail. Lines are 1 px CSS rules in two
 * solid tokens (the path in --pt-ink-2, a refusal in --pt-titanium), so no junction darkens;
 * markers are 11 px squares, filled for the action and its record, hollow for a check. Text is
 * page text at 14/20 at every width. From 1024 px the drawing sits on the page's 12 columns;
 * under it, one vertical rail with the same objects in the same order. No script, no picture.
 */
export function AgentsFlow() {
  const { flow, table } = AGENTS_SCREEN;
  return (
    <>
      <figure className="site-fig site-flow" aria-labelledby="site-flow-label">
        <figcaption className="site-fig-head">
          <span className="t-label" id="site-flow-label">
            {flow.label}
          </span>
        </figcaption>
        <Frame>
          <div className="site-flow-body" role="img" aria-label={flow.alt}>
            <ul className="site-flow-from" aria-hidden="true">
              <li className="has-group">
                <span className="t-label site-flow-group">{flow.people}</span>
                <SiteIcon name="plus" />
                <span className="site-flow-who">{flow.menu}</span>
                <i className="site-flow-wire" />
              </li>
              {table.rows.map((row, i) => (
                <li key={row.id} className={i === 0 ? 'has-group' : undefined}>
                  <span className="t-label site-flow-group">{i === 0 ? flow.agents : ''}</span>
                  <SiteIcon name={row.icon} />
                  <span className="site-flow-who">{row.transport}</span>
                  <i className="site-flow-wire" />
                </li>
              ))}
            </ul>
            <i className="site-flow-bus" aria-hidden="true" />
            <i className="site-flow-rail" aria-hidden="true" />
            <ol className="site-flow-path" aria-hidden="true">
              {flow.stations.map((station) => (
                <li key={station.id} className={'refusal' in station ? 'is-check' : undefined}>
                  <i className="site-flow-mark" />
                  <span className="site-flow-text">
                    <span className="site-flow-name">
                      {'code' in station ? <code>{station.name}</code> : station.name}
                    </span>
                    <span className="site-flow-sub">
                      <InlineCode text={station.sub} />
                    </span>
                  </span>
                  {'refusal' in station ? (
                    <span className="site-flow-out">{station.refusal}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </Frame>
      </figure>
      <p className="site-note site-flow-note t-small">{AGENTS_SCREEN.note}</p>
    </>
  );
}
