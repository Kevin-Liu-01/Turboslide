import { AGENTS_SCREEN } from './copy';
import { SITE_FACTS } from './facts';
import { ScreenHead } from './ScreenHead';
import { SiteIcon } from './SiteIcon';

/**
 * The Agents screen: one action, `slide.new`, as a person calls it from the editor's menu and as
 * an agent calls it on each transport, each with its own spelling and the share of the actions
 * its transport carries (facts.ts), every call wired into the one handler and the one revision
 * Version history records. The table is the data and the wires are the claim: one 1 px line per
 * caller into one bus, then one line through the handler to the record, no junction drawn twice.
 * From 1280 px the path runs to the right of the table; under it, one vertical line on the left
 * joins the callers and runs down to the handler and the record. Static: no script.
 */
export function AgentsScreen() {
  const { table, path } = AGENTS_SCREEN;
  return (
    <section className="site-claim site-ag" id="agents" aria-labelledby="site-agents-title">
      <ScreenHead titleId="site-agents-title" heading={AGENTS_SCREEN.heading} />
      <figure className="site-ag-fig site-wrap">
        <div className="site-ag-from">
          <table className="site-ag-calls" aria-label={table.caption}>
            <tbody>
              <tr className="is-person">
                <th scope="row">
                  <span className="site-label">
                    <SiteIcon name={table.person.icon} />
                    {table.person.transport}
                  </span>
                </th>
                <td className="site-ag-call">{table.person.name}</td>
                <td className="site-ag-n" />
              </tr>
              {table.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="site-label">
                      <SiteIcon name={row.icon} />
                      {row.transport}
                    </span>
                  </th>
                  <td className="site-ag-call">
                    <code>{row.name}</code>
                  </td>
                  <td className="site-ag-n">{table.count(SITE_FACTS[row.id])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol className="site-ag-path" aria-label={path.name}>
          <li className="site-ag-stop">
            <code className="site-ag-name">{path.action}</code>
          </li>
          <li className="site-ag-stop is-end">
            <span className="site-ag-name">{path.history}</span>
            <span className="site-ag-rec">{path.record}</span>
          </li>
        </ol>
      </figure>
    </section>
  );
}
