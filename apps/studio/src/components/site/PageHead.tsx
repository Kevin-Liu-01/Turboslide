import type { ReactNode } from 'react';

import { Keyed } from './Keyed';
import type { PageHeadCopy } from './pages-copy';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';

/**
 * The head of a site page (/features, /faq, /about), drawn as /home draws its first screen: the
 * h1 at the display step with its key words in the accent (Keyed.tsx), then the lead beside the
 * page's two buttons, then `children`, the first screen's figure of the real product. `stack`
 * is the column's width with the figure under the head, as /home draws it; `side` is the head
 * alone, the lead over the buttons, in a column its page lays out (/faq puts it over the list on
 * seven columns, beside the shot on the other five).
 */
export function PageHead({
  copy,
  layout = 'stack',
  children,
}: {
  copy: PageHeadCopy;
  layout?: 'stack' | 'side';
  children?: ReactNode;
}) {
  const [primary, secondary] = copy.actions;
  return (
    <header
      className={layout === 'stack' ? 'site-page-head site-wrap' : 'site-page-head'}
      data-layout={layout}
    >
      <div className="site-page-intro">
        <h1 className="t-display">
          <Keyed text={copy.title} keys={copy.keys} />
        </h1>
        <div className="site-page-row">
          <p className="t-lead">{copy.lead}</p>
          <div className="site-btns">
            {[primary, secondary].map((action, i) =>
              action === undefined ? null : (
                <SiteLink
                  key={action.id}
                  href={action.href}
                  external={action.external ?? false}
                  control={action.id}
                  className={i === 0 ? 'site-btn site-btn-ink' : 'site-btn site-btn-line'}
                >
                  <SiteIcon name={action.icon} />
                  {action.label}
                </SiteLink>
              ),
            )}
          </div>
        </div>
      </div>
      {children}
    </header>
  );
}
