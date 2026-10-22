import { EXPORT_SCREEN } from './copy';
import { ExportFiles } from './ExportFiles';
import { ExportSeam } from './ExportSeam';
import { ScreenHead } from './ScreenHead';

/**
 * Screen 06, Export (docs/SITE.md 9): the three files File > Download writes from one slide
 * (ExportFiles.tsx) and one slide cut by a seam between the two PowerPoint files with the parts
 * each holds (ExportSeam.tsx).
 */
export function ExportScreen() {
  return (
    <section className="site-screen site-wrap" id="export" aria-labelledby="site-export-title">
      <ScreenHead titleId="site-export-title" sentence={EXPORT_SCREEN.sentence} />
      <ExportFiles />
      <ExportSeam />
    </section>
  );
}
