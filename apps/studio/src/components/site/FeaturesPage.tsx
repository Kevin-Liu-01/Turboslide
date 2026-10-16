import { SITE } from '@turboslide/theme/brand/site';

import { CodePanel } from './CodePanel';
import { InlineCode } from './InlineCode';
import { JsonLd } from './JsonLd';
import { FEATURES_META } from './meta';
import { PageHead } from './PageHead';
import { FEATURES_HEAD, FEATURE_COUNTS, FEATURE_GROUPS, PAGES } from './pages-copy';
import { ProductCrop } from './ProductCrop';
import { SiteBlock } from './SiteBlock';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { softwareData, webPageData } from './structured-data';

/**
 * /features (the pages step): the page's name and lead with the counts read from facts.ts, then
 * one numbered ruled block per group (make, present, share and work together, export, agents, run
 * it yourself), each with a crop of the product or a code panel and one sentence per feature
 * linked to its chapter of the documentation.
 */
export function FeaturesPage() {
  const origin = SITE.origin();
  return (
    <main id="main">
      <JsonLd
        data={webPageData(origin, FEATURES_META, 'WebPage', {
          about: softwareData(
            origin,
            FEATURE_GROUPS.flatMap((group) => group.features.map((feature) => feature.name)),
          ),
        })}
      />
      <PageHead copy={FEATURES_HEAD}>
        <dl className="site-counts" aria-label={PAGES.countsName}>
          {FEATURE_COUNTS.map((count) => (
            <div key={count.id}>
              <dt className="t-label">{count.label}</dt>
              <dd>
                <SiteLink href={count.href} control={`site.features.count.${count.id}`}>
                  {count.value}
                </SiteLink>
              </dd>
            </div>
          ))}
        </dl>
      </PageHead>
      {FEATURE_GROUPS.map((group) => (
        <SiteBlock
          key={group.id}
          id={group.id}
          number={group.number}
          label={group.label}
          icon={group.icon}
          sentence={group.sentence}
        >
          {group.figure.kind === 'crop' ? (
            <ProductCrop
              name={group.figure.name}
              alt={group.figure.alt}
              caption={group.figure.caption}
            />
          ) : (
            <CodePanel
              label={group.figure.label}
              lines={group.figure.lines}
              caption={group.figure.caption}
            />
          )}
          <ul className="site-feats">
            {group.features.map((feature) => (
              <li key={feature.name}>
                <h3 className="site-feat-name">
                  <SiteLink
                    href={feature.href}
                    control={`site.features.${group.id}.${feature.name.toLowerCase().replace(/\W+/g, '-')}`}
                  >
                    {feature.name}
                  </SiteLink>
                </h3>
                <p>
                  <InlineCode text={feature.sentence} />
                </p>
              </li>
            ))}
          </ul>
          <p className="site-block-more t-small">
            <SiteLink href={group.docs.href} control={`site.features.${group.id}.docs`}>
              {PAGES.docsLink}: {group.docs.label}
              <SiteIcon name="arrow-right" />
            </SiteLink>
          </p>
        </SiteBlock>
      ))}
    </main>
  );
}
