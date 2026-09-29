import { EXPORT } from './copy';
import { ExportDiagram } from './diagrams/Export';
import type { HomeFacts } from './facts';
import { HomeLink } from './HomeLink';
import { HomeSection } from './HomeSection';

/**
 * Export (docs/POLISH.md 3.2 item 5): the file leaves with the pixels the seller saw, beside the
 * diagram of one slide and its two files. Under the lead the one measured sentence of the page,
 * its figure a function of the facts and a link to the export record.
 */
export function HomeExport({ facts }: { facts: HomeFacts }) {
  return (
    <HomeSection
      id={EXPORT.id}
      icon={EXPORT.icon}
      heading={EXPORT.heading}
      lead={EXPORT.lead}
      after={
        <p className="ts-product-note" data-note="measured">
          {EXPORT.measured.before}{' '}
          <HomeLink
            href={EXPORT.measured.href}
            external
            control="home.export.record"
            className="ts-product-inline-link"
          >
            {EXPORT.measured.figure(facts)}
          </HomeLink>
          {EXPORT.measured.after}
        </p>
      }
    >
      <ExportDiagram />
    </HomeSection>
  );
}
