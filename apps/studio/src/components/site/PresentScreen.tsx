import { PRESENT_SCREEN } from './copy';
import { Frame } from './Frame';
import { PresentWindows } from './PresentWindows';
import { ThemePicture } from './ThemePicture';

import viewerDarkPhone from './pictures/viewer-390-dark.webp?url';
import viewerLightPhone from './pictures/viewer-390-light.webp?url';
import viewerDark from './pictures/viewer-1440-dark.webp?url';
import viewerLight from './pictures/viewer-1440-light.webp?url';

/**
 * Screen 04 (docs/SITE.md A.5): the title, the viewer captured on slide 2 of the
 * example deck the hero's second button opens (slide 1 draws a defect, V1 of the brief), the six
 * slideshow keys as key chips, and the slideshow beside presenter view (PresentWindows.tsx).
 */
export function PresentScreen() {
  const { figure } = PRESENT_SCREEN;
  return (
    <section className="site-screen site-wrap" id="present" aria-labelledby="site-present-title">
      <header className="site-screen-head">
        <h2 id="site-present-title" className="t-title">
          {PRESENT_SCREEN.sentence}
        </h2>
      </header>
      <figure className="site-fig">
        <Frame>
          <div className="site-viewer-box">
            <ThemePicture
              light={{ wide: viewerLight, phone: viewerLightPhone }}
              dark={{ wide: viewerDark, phone: viewerDarkPhone }}
              wideSize={[2360, 1784]}
              phoneSize={[780, 1120]}
              alt={figure.alt}
            />
          </div>
        </Frame>
      </figure>
      <dl className="site-keys t-small" aria-label={PRESENT_SCREEN.keysName}>
        {PRESENT_SCREEN.keys.map((entry) => (
          <div key={entry.label}>
            <dt>
              <kbd className="pt-kbd site-kbd">{entry.key}</kbd>
            </dt>
            <dd>{entry.label}</dd>
          </div>
        ))}
      </dl>
      <PresentWindows />
    </section>
  );
}
