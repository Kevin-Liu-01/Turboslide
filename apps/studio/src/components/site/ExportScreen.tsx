import { EXPORT_SCREEN } from './copy';
import { EDITABLE_PARTS, PICTURES_PARTS, countParts } from './export-parts';
import { ExportSeam } from './ExportSeam';
import { ScreenHead } from './ScreenHead';
import { SiteIcon } from './SiteIcon';

const EDITABLE = countParts(EDITABLE_PARTS);
const PICTURES = countParts(PICTURES_PARTS);

/**
 * The Export screen (docs/SITE.md 9): one slide cut by a seam between the two PowerPoint files,
 * each file's parts outlined on its side (ExportSeam.tsx), then the three files File > Download
 * writes with what each holds and how close it stays to the browser. The counts are the parts
 * lists' (export-parts.ts), so the words and the outlines agree.
 */
export function ExportScreen() {
  const { files } = EXPORT_SCREEN;
  return (
    <section className="site-claim site-xp" id="export" aria-labelledby="site-export-title">
      <ScreenHead titleId="site-export-title" heading={EXPORT_SCREEN.heading} />
      <ExportSeam />
      <dl className="site-xp-files site-wrap">
        <div>
          <dt>
            <SiteIcon name="photo" />
            {files.pictures.name}
          </dt>
          <dd>{files.pictures.holds(PICTURES)}</dd>
        </div>
        <div>
          <dt>
            <SiteIcon name="document-text" />
            {files.editable.name}
          </dt>
          <dd>{files.editable.holds(EDITABLE)}</dd>
        </div>
        <div>
          <dt>
            <SiteIcon name="arrow-down-tray" />
            {files.pdf.name}
          </dt>
          <dd>{files.pdf.holds}</dd>
        </div>
      </dl>
    </section>
  );
}
