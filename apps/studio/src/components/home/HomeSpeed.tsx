import { SPEED, resolveText } from './copy';
import type { HomeFacts } from './facts';

/**
 * Why it is fast (gslides-parity SPEC-4 2.2 item 7, 0.20, 0.26; PP section 4): the lead, eight
 * rows with a title, two sentences, the number and its source line in `--pt-mono` at 13 px, and
 * the closing sentence that names what is still slow with the verifier's day 0 numbers. Every
 * figure is a measurement of a named document and date (`copy.ts` MEASURED) or a count of the
 * tree from `facts.json`; the tense is the ship tree's (the Rust row ends with the TypeScript
 * sentence, the preload row says the editor still leaves by a document load).
 */
export function HomeSpeed({ facts }: { facts: HomeFacts | null }) {
  return (
    <section className="ts-product-band" aria-labelledby="ts-product-h-fast">
      <div className="ts-product-rail">
        <div className="ts-product-band-head">
          <h2 id="ts-product-h-fast" className="ts-product-h2">
            {SPEED.heading}
          </h2>
          <p className="ts-product-lead">{SPEED.lead}</p>
        </div>
        <div className="ts-product-rows">
          {SPEED.rows.map((row) => (
            <div key={row.id} className="ts-product-row" data-row={row.id}>
              <h3 className="ts-product-h3 ts-product-row-title">{row.title}</h3>
              <p className="ts-product-row-body">{row.body}</p>
              <div className="ts-product-row-figure">
                <span className="ts-product-row-number">
                  {resolveText(row.figure, facts) ?? ''}
                </span>
                <span className="ts-product-source">{row.source}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="ts-product-closing" data-row="closing">
          {SPEED.closing.text}
          <span className="ts-product-source">{SPEED.closing.source}</span>
        </p>
      </div>
    </section>
  );
}
