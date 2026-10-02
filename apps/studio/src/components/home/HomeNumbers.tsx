import { NUMBERS } from './copy';
import type { HomeFacts } from './facts';
import { HomeLink } from './HomeLink';

/**
 * The numbers row (docs/NEXT.md 4.1.2, A's graft; brand-judge-3 graft 3): three figures of
 * `packages/theme/brand/facts.json` through `HomeFacts`, each at `--ts-figure` in tabular
 * figures with one sentence under it, in three cells of the column parted by hairlines, with the
 * seam under the row and the hatch strip after it (slide 49: a hatch strip separates rows where
 * the topic changes). The third figure links to the export record. The counts are functions of
 * the facts (SPEC-4 0.25), so no digit of the tree is written here.
 */
export function HomeNumbers({ facts }: { facts: HomeFacts }) {
  return (
    <>
      <div
        className="ts-product-numbers ts-seam"
        role="group"
        aria-label={NUMBERS.label}
        data-strip="numbers"
      >
        <div className="ts-col-bare ts-product-numbers-row">
          {NUMBERS.cells.map((cell) => (
            <div key={cell.id} className="ts-product-number" data-number={cell.id}>
              <p className="ts-product-figure">
                {'href' in cell ? (
                  <HomeLink
                    href={cell.href}
                    external
                    control="home.export.record"
                    className="ts-product-inline-link"
                  >
                    {cell.figure(facts)}
                  </HomeLink>
                ) : (
                  cell.figure(facts)
                )}
              </p>
              <p className="ts-product-number-sentence">{cell.sentence}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="ts-product-hatch ts-seam" aria-hidden="true">
        <div className="ts-col-bare ts-hatch" />
      </div>
    </>
  );
}
