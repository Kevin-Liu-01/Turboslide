import type { ReactNode } from 'react';

import type { PageHeadCopy } from './pages-copy';

/**
 * The head of a site page (/features, /faq, /about): the page's name as the h1 in the display size
 * and its lead, on the 12 column grid with the lead under the name; `children` follow the lead
 * (the counts of /features).
 */
export function PageHead({ copy, children }: { copy: PageHeadCopy; children?: ReactNode }) {
  return (
    <header className="site-page-head site-wrap">
      <h1 className="t-display">{copy.title}</h1>
      <p className="t-lead">{copy.lead}</p>
      {children}
    </header>
  );
}
