import { COMPARE, resolveText } from './copy';
import type { HomeFacts } from './facts';

/**
 * Compared with Google Slides (gslides-parity SPEC-4 2.2 item 9, section 8 decision 13; R05
 * 6.8): the twelve factual rows including the rows where Turboslide has less (ODP and SVG,
 * PowerPoint import, transitions), with the Account, Editing together, Import and Export rows
 * rewritten for the round three ship tree, and the affiliation sentence. The table scrolls inside
 * its own box under 760 px so the page never scrolls sideways.
 */
export function HomeCompare({ facts }: { facts: HomeFacts | null }) {
  return (
    <section className="ts-product-band" aria-labelledby="ts-product-h-compare">
      <div className="ts-product-rail">
        <div className="ts-product-band-head">
          <h2 id="ts-product-h-compare" className="ts-product-h2">
            {COMPARE.heading}
          </h2>
          <p className="ts-product-lead">{COMPARE.lead}</p>
        </div>
        <div className="ts-product-table-scroll">
          <table className="ts-product-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="ts-product-visually-hidden">Row</span>
                </th>
                <th scope="col">{COMPARE.columns.google}</th>
                <th scope="col">{COMPARE.columns.turboslide}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.rows.map((row) => (
                <tr key={row.id} data-compare={row.id}>
                  <th scope="row">{row.row}</th>
                  <td>{row.google}</td>
                  <td>{resolveText(row.turboslide, facts) ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
