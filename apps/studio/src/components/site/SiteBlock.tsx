import type { ReactNode } from 'react';

import { Keyed } from './Keyed';
import { SiteIcon } from './SiteIcon';
import type { SiteIconName } from './SiteIcon';

/**
 * A numbered ruled block of the site pages, the landing's screen head (site.css `.site-screen`):
 * a hairline, the solid icon, the number and the label in the first three columns, the block's
 * one sentence as its h2 in the other nine with its key words in the accent (Keyed.tsx), then
 * `children` on the same nine columns.
 */
export function SiteBlock({
  id,
  number,
  label,
  icon,
  sentence,
  keys = [],
  children,
}: {
  id: string;
  number: string;
  label: string;
  icon: SiteIconName;
  sentence: string;
  keys?: readonly string[];
  children: ReactNode;
}) {
  const title = `site-block-${id}`;
  return (
    <section className="site-screen site-block site-wrap" id={id} aria-labelledby={title}>
      <header className="site-screen-head">
        <p className="t-label site-label">
          <SiteIcon name={icon} />
          <span className="site-num">{number}</span>
          {label}
        </p>
        <h2 id={title} className="t-title">
          <Keyed text={sentence} keys={keys} />
        </h2>
      </header>
      <div className="site-block-body">{children}</div>
    </section>
  );
}
