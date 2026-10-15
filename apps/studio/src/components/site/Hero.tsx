import { HERO } from './copy';
import { Frame } from './Frame';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { ThemePicture } from './ThemePicture';
import { Title } from './Title';

import heroDarkPhone from './pictures/hero-358-dark.webp?url';
import heroLightPhone from './pictures/hero-358-light.webp?url';
import heroDark from './pictures/hero-1280-dark.webp?url';
import heroLight from './pictures/hero-1280-light.webp?url';

/**
 * Screen 01 (docs/SITE.md A.3): the h1 with its two stacks, the lead beside the two buttons and
 * "No account is needed.", then the editor's figure. The figure's head row carries the label and
 * the caption above the frame, so the first screen at 1440 by 900 holds the caption and the top of
 * the editor (the judge's reading of the prototype: its caption sat under the fold). The frame's
 * box has a fixed size, 16:10 above 720 px and the phone's column under it, and holds the poster:
 * a capture of the real editor, the first thing painted in the box (`site-hero-box` keeps the
 * place the live editor takes, so nothing moves when it arrives).
 */
export function Hero() {
  return (
    <section className="site-hero site-wrap" aria-labelledby="site-title">
      <Title />
      <div className="site-hero-row">
        <p className="t-lead">{HERO.lead}</p>
        <div className="site-hero-act">
          <div className="site-btns">
            <SiteLink
              href={HERO.primary.href}
              control={HERO.primary.id}
              className="site-btn site-btn-ink"
            >
              <SiteIcon name="plus" />
              {HERO.primary.label}
            </SiteLink>
            <SiteLink
              href={HERO.secondary.href}
              control={HERO.secondary.id}
              className="site-btn site-btn-line"
            >
              <SiteIcon name="presentation-chart-line" />
              {HERO.secondary.label}
            </SiteLink>
          </div>
          <p className="site-hero-note t-small">{HERO.note}</p>
        </div>
      </div>
      <figure className="site-fig">
        <figcaption className="site-fig-head">
          <span className="t-label site-label">
            <SiteIcon name="pencil-square" />
            <span className="site-num">{HERO.figure.number}</span>
            {HERO.figure.label}
          </span>
          <span id="site-hero-caption" className="site-fig-note t-small">
            {HERO.figure.caption}
          </span>
        </figcaption>
        <Frame>
          <div className="site-hero-box" data-hero-box="">
            <ThemePicture
              light={{ wide: heroLight, phone: heroLightPhone }}
              dark={{ wide: heroDark, phone: heroDarkPhone }}
              wideSize={[2560, 1600]}
              phoneSize={[716, 1120]}
              alt={HERO.figure.alt}
              priority
            />
          </div>
        </Frame>
      </figure>
    </section>
  );
}
