import { NUMBERS, resolveText } from './copy';
import type { HomeFacts as Facts } from './facts';

/**
 * The numbers strip (gslides-parity SPEC-4 2.2 item 3, 0.20, 0.25): six figures with one line
 * and a source line each. The counts come from `facts.json` through `HOME_FACTS` (never a
 * literal), the mismatch figure from `docs/pptx.md` with its date, MIT from the licence file. The
 * strip is a grid with a 1 px gap over a `--pt-hair-soft` ground, so the seams are drawn once
 * (P1 4.4); while the facts file is absent a count cell shows its line without a figure.
 */
export function HomeFacts({ facts }: { facts: Facts | null }) {
  return (
    <section className="ts-product-numbers-band" aria-label="Numbers">
      <div className="ts-product-rail">
        <dl className="ts-product-numbers">
          {NUMBERS.map((entry) => {
            const figure = resolveText(entry.figure, facts);
            return (
              <div key={entry.id} className="ts-product-number" data-figure={entry.id}>
                <dt className="ts-product-figure" data-empty={figure === null ? '' : undefined}>
                  {figure ?? ''}
                </dt>
                <dd className="ts-product-number-line">{entry.line}</dd>
                <dd className="ts-product-source">{entry.source}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
