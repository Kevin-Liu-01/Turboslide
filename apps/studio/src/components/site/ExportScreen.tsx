import { EXPORT_SCREEN } from './copy';
import { ExportFiles } from './ExportFiles';
import { ExportSeam } from './ExportSeam';
import { InlineCode } from './InlineCode';
import { ScreenHead } from './ScreenHead';

/**
 * Screen 06, Export (docs/SITE.md 9): the three files File > Download writes from one slide
 * (ExportFiles.tsx), the note that an agent runs the same export, and one slide cut by a seam
 * between the two PowerPoint files with the parts each holds (ExportSeam.tsx).
 */
export function ExportScreen() {
  return (
    <section className="site-screen site-wrap" id="export" aria-labelledby="site-export-title">
      <ScreenHead
        titleId="site-export-title"
        icon="arrow-down-tray"
        number={EXPORT_SCREEN.number}
        label={EXPORT_SCREEN.label}
        sentence={EXPORT_SCREEN.sentence}
      />
      <ExportFiles />
      <p className="site-note site-ex-note t-small">
        <InlineCode text={EXPORT_SCREEN.note} />
      </p>
      <ExportSeam />
    </section>
  );
}
