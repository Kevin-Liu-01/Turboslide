import type { InterludeBand } from './live/glyphs';

/**
 * An interlude (docs/LANDING.md 2.4; B's dither field interludes): between two bands, a strip of
 * the content width, 128 px tall at 720 px and over and 80 px under, closed by the seam with its
 * crosses. The live core (`live/field.ts`, I1, V4's) prints in it at the deck's 2 px cell a sparse
 * field at 6 percent tone that gathers into the next band's object, holds, thins and rests, while
 * it is in view; under reduced motion, with Pause Motion and before the core starts it holds the
 * gathered glyph, which the core draws once when it starts. Without script the strip is empty.
 * Decorative: `aria-hidden`, no words. V4's component; V1 places one between every two bands from
 * the numbers row to the close (`home.tsx`).
 */
export function HomeInterlude({ next }: { next: InterludeBand }) {
  return (
    <div className="ts-interlude ts-seam" data-interlude={next} aria-hidden="true">
      <div className="ts-col">
        <div className="ts-interlude-box">
          <canvas />
        </div>
      </div>
    </div>
  );
}
