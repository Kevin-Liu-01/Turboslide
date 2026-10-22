import { SITE } from '@turboslide/theme/brand/site';

import { Frame } from './Frame';
import { InlineCode } from './InlineCode';
import { JsonLd } from './JsonLd';
import { ABOUT_META } from './meta';
import { PageHead } from './PageHead';
import {
  ABOUT_BLOCKS,
  ABOUT_FIGURE,
  ABOUT_HEAD,
  ABOUT_ISSUE,
  GENERAL_TRANSLATION,
  PAGES,
} from './pages-copy';
import { SiteBlock } from './SiteBlock';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { softwareData, webPageData } from './structured-data';
import { ThemePicture } from './ThemePicture';

import heroDarkPhone from './pictures/hero-358-dark.webp?url';
import heroLightPhone from './pictures/hero-358-light.webp?url';
import heroDark from './pictures/hero-1280-dark.webp?url';
import heroLight from './pictures/hero-1280-light.webp?url';
import viewerDarkPhone from './pictures/viewer-390-dark.webp?url';
import viewerLightPhone from './pictures/viewer-390-light.webp?url';

/**
 * The first screen's figure of /about: the editor with both agents at work (the poster /home
 * shows until its live editor is ready) on eight columns, and the viewer on a phone on the other
 * four, cut to the editor's height from its top. Both are captures of the real product
 * (scripts/site/capture.mjs). Under 1024 px they stack, the phone's capture held to a phone's
 * width.
 */
function AboutFigure() {
  const { editor, viewer } = ABOUT_FIGURE;
  return (
    <div className="site-shots site-about-shots" role="group" aria-label={PAGES.aboutShotsName}>
      <figure className="site-shot" data-shot="editor">
        <Frame className="site-shot-frame">
          <div className="site-about-editor">
            <ThemePicture
              light={{ wide: heroLight, phone: heroLightPhone }}
              dark={{ wide: heroDark, phone: heroDarkPhone }}
              wideSize={[2560, 1280]}
              phoneSize={[716, 1120]}
              alt={editor.alt}
              priority
            />
          </div>
        </Frame>
      </figure>
      <figure className="site-shot" data-shot="viewer">
        <Frame className="site-shot-frame">
          <div className="site-about-phone">
            {/* the phone's capture at every width: the box is a phone's at every width */}
            <ThemePicture
              light={{ wide: viewerLightPhone, phone: viewerLightPhone }}
              dark={{ wide: viewerDarkPhone, phone: viewerDarkPhone }}
              wideSize={[780, 1120]}
              phoneSize={[780, 1120]}
              alt={viewer.alt}
            />
          </div>
        </Frame>
      </figure>
    </div>
  );
}

/**
 * /about (the pages step): the head as /home draws its first screen (the h1 with "Turboslide" in
 * the accent, the lead beside New Presentation and Read the Source) over the editor and the viewer
 * (AboutFigure), then six ruled blocks: what
 * Turboslide is, why it is agent native, its principles, the source and its license, who makes
 * it, and how to reach the project (GitHub issues, with Open an Issue).
 */
export function AboutPage() {
  const origin = SITE.origin();
  return (
    <main id="main">
      <JsonLd
        data={webPageData(origin, ABOUT_META, 'AboutPage', {
          about: softwareData(origin),
          publisher: {
            '@type': 'Organization',
            name: 'General Translation',
            url: GENERAL_TRANSLATION,
          },
        })}
      />
      <PageHead copy={ABOUT_HEAD}>
        <AboutFigure />
      </PageHead>
      {ABOUT_BLOCKS.map((block) => (
        <SiteBlock key={block.id} id={block.id} sentence={block.sentence} keys={block.keys}>
          {block.body.map((paragraph) => (
            <p key={paragraph} className="site-block-text">
              <InlineCode text={paragraph} />
            </p>
          ))}
          {block.points === undefined ? null : (
            <ul className="site-feats">
              {block.points.map((point) => (
                <li key={point.name}>
                  <h3 className="site-feat-name">{point.name}</h3>
                  <p>
                    <InlineCode text={point.sentence} />
                  </p>
                </li>
              ))}
            </ul>
          )}
          {block.links === undefined ? null : (
            <ul className="site-block-links t-small">
              {block.links.map((link) => (
                <li key={link.href}>
                  <SiteLink
                    href={link.href}
                    external={link.external}
                    control={`site.about.${block.id}.${link.label.toLowerCase().replace(/\W+/g, '-')}`}
                  >
                    {link.label}
                    <SiteIcon name="arrow-right" />
                  </SiteLink>
                </li>
              ))}
            </ul>
          )}
          {block.id === 'contact' ? (
            <p className="site-btns">
              <SiteLink
                href={ABOUT_ISSUE.href}
                external
                control="site.about.issue"
                className="site-btn site-btn-ink"
              >
                <SiteIcon name="chat-bubble-left-right" />
                {ABOUT_ISSUE.label}
              </SiteLink>
            </p>
          ) : null}
        </SiteBlock>
      ))}
    </main>
  );
}
