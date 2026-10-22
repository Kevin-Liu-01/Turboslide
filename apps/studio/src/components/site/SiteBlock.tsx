import type { ReactNode } from 'react';

import { Keyed } from './Keyed';

/**
 * A ruled block of the site pages, the landing's screen head (site.css `.site-screen`): a
 * hairline, the block's one sentence as its h2 with its key words in the accent (Keyed.tsx), then
 * `children`.
 */
export function SiteBlock({
  id,
  sentence,
  keys = [],
  children,
}: {
  id: string;
  sentence: string;
  keys?: readonly string[];
  children: ReactNode;
}) {
  const title = `site-block-${id}`;
  return (
    <section className="site-screen site-block site-wrap" id={id} aria-labelledby={title}>
      <header className="site-screen-head">
        <h2 id={title} className="t-title">
          <Keyed text={sentence} keys={keys} />
        </h2>
      </header>
      <div className="site-block-body">{children}</div>
    </section>
  );
}
