import type { ReactNode } from 'react';

/**
 * The frame of the site's figures (docs/SITE.md A.3): a hairline box around a capture, square
 * corners. The corner crosses and the column's seams left on 2026-10-30 (Kevin: no rails).
 */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className === undefined ? 'site-frame' : `site-frame ${className}`}>
      {children}
    </div>
  );
}
