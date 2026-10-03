import { CANVAS } from './copy';
import { CanvasDiagram } from './diagrams/Canvas';
import { HomeSection } from './HomeSection';

/**
 * The canvas (docs/archive/rounds/POLISH.md 3.2 item 2): Kevin's rule that anything moves, beside the diagram of
 * one picture dragged, resized and rotated on a slide. Round 1 drew the diagram in place of the
 * capture, whose blue selection ring, chip and handle put the accent on lines and fills
 * (DECK-GRAMMAR 29; audit-brand-surfaces rank 13; the row `decks.home.capture-plain`).
 */
export function HomeCanvas() {
  return (
    <HomeSection id={CANVAS.id} heading={CANVAS.heading} lead={CANVAS.lead}>
      <CanvasDiagram />
    </HomeSection>
  );
}
