import type { ReactNode } from 'react';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import type { LinkComponent } from '@turboslide/chrome/editor-shell';

import './grammar.css';
import './page-frame.css';

/**
 * The frame of the plain pages outside the editor: Not found, the refused page and You need access
 * (docs/NEXT.md 4.1.3 item 11; the page grammar of 4.1.2). The 1104 px column with one rail on
 * each side drawn once (`.ts-rails`), a 58 px bar with the lockup (the mark to the files page, the
 * word to the product page; AppBarBrand.tsx, brand.css `.ts-brand-lockup`) and the seam under it
 * with a cross at each rail, then the page's content in the column. The caller names the root's
 * classes (`.ts-notfound` for Not found and the refused page, the root the brand lint's one rail
 * check reads) and its element: a `main` for the pages that own the document, a `div` around a
 * component that draws its own `main` (YouNeedAccess.tsx).
 */
export function PageFrame({
  as = 'main',
  className,
  control,
  linkComponent,
  children,
}: {
  as?: 'main' | 'div';
  className?: string;
  control?: string;
  linkComponent?: LinkComponent;
  children: ReactNode;
}) {
  const Root = as;
  return (
    <Root
      className={className === undefined ? 'ts-page-frame' : `ts-page-frame ${className}`}
      data-control={control}
    >
      <div className="ts-rails" aria-hidden="true" />
      <header className="ts-page-frame-bar ts-seam">
        <div className="ts-col ts-page-frame-row">
          <AppBarBrand
            {...(linkComponent === undefined ? {} : { linkComponent })}
            homeTo="/decks"
            aboutTo="/home"
          />
        </div>
      </header>
      <div className="ts-col ts-page-frame-body">{children}</div>
    </Root>
  );
}
