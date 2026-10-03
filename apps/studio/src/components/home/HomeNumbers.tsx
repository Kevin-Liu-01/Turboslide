import { NUMBERS } from './copy';
import { HOME_FACTS } from './facts';

/**
 * The numbers row (docs/LANDING.md 2.3, Kevin's pick "B: The numbers row"): directly under the
 * hero, four ruled cells of 244 px, each a figure with its noun at 32 px, weight 500, tabular, and
 * one sentence under it; two by two under 720 px. Every figure is a function of `HomeFacts`.
 * Nothing in the band moves, on purpose (OpenAI rule 6). It has no h2, so the section is named.
 */
export function HomeNumbers() {
  return (
    <section
      className="ts-band ts-band-numbers ts-seam"
      id="numbers"
      data-band="numbers"
      aria-label={NUMBERS.label}
    >
      <div className="ts-col">
        <ul className="ts-numbers">
          {NUMBERS.cells.map((cell) => (
            <li key={cell.id} className="ts-number" data-number={cell.id}>
              <p className="ts-number-figure">{cell.figure(HOME_FACTS)}</p>
              <p className="ts-number-sentence">{cell.sentence}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
