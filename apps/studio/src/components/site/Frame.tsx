import type { ReactNode } from 'react';

/**
 * The square frame of the Workbench figures (docs/SITE.md A.3): a hairline box with a 9 px cross
 * at each corner, drawn in `--pt-cross`. Square corners: a frame is structure.
 */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className === undefined ? 'site-frame' : `site-frame ${className}`}>
      <i className="site-x is-tl" aria-hidden="true" />
      <i className="site-x is-tr" aria-hidden="true" />
      <i className="site-x is-bl" aria-hidden="true" />
      <i className="site-x is-br" aria-hidden="true" />
      {children}
    </div>
  );
}
