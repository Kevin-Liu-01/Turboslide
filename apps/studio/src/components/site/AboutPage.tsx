import { SITE } from '@turboslide/theme/brand/site';

import { InlineCode } from './InlineCode';
import { JsonLd } from './JsonLd';
import { ABOUT_META } from './meta';
import { PageHead } from './PageHead';
import { ABOUT_BLOCKS, ABOUT_HEAD, ABOUT_ISSUE, GENERAL_TRANSLATION } from './pages-copy';
import { SiteBlock } from './SiteBlock';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { softwareData, webPageData } from './structured-data';

/**
 * /about (the pages step): the page's name and lead, then six numbered ruled blocks: what
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
      <PageHead copy={ABOUT_HEAD} />
      {ABOUT_BLOCKS.map((block) => (
        <SiteBlock
          key={block.id}
          id={block.id}
          number={block.number}
          label={block.label}
          icon={block.icon}
          sentence={block.sentence}
        >
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
