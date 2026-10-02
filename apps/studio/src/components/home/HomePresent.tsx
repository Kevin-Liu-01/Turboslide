import { PRESENT } from './copy';
import { PresentDiagram } from './diagrams/Present';
import { HomeSection } from './HomeSection';

/**
 * Present and share (docs/POLISH.md 3.2 item 4): the pitch is delivered from the browser, beside
 * the diagram of the editor window, the presenter window and a phone with the show.
 */
export function HomePresent() {
  return (
    <HomeSection id={PRESENT.id} heading={PRESENT.heading} lead={PRESENT.lead}>
      <PresentDiagram />
    </HomeSection>
  );
}
