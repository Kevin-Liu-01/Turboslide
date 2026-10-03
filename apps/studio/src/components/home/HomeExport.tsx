import { EXPORT } from './copy';
import { ExportDiagram } from './diagrams/Export';
import { HomeSection } from './HomeSection';

/**
 * Export (docs/archive/rounds/POLISH.md 3.2 item 5): the file leaves with the pixels the seller saw, beside the
 * diagram of one slide and its two files. The measured figure and its link to the export record
 * moved to the numbers row in Round 1 (HomeNumbers.tsx), so the page states it once.
 */
export function HomeExport() {
  return (
    <HomeSection id={EXPORT.id} heading={EXPORT.heading} lead={EXPORT.lead}>
      <ExportDiagram />
    </HomeSection>
  );
}
