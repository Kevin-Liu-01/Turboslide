import type { ReactNode } from 'react';

/**
 * The band shell every band of /home uses (docs/LANDING.md 2.0 "The column"; 6.1): a
 * `section[data-band]` labelled by its h2, 96 px of padding above and below at 1,024 px and over
 * (64 px under 720 px), the 1,104 px column inside it, and the band closed by `.ts-seam` with its
 * 9 px crosses where the seam meets the rails. The band's own layout is its children.
 */
export type HomeSectionProps = {
  id: 'agents' | 'tailor' | 'canvas' | 'present' | 'export' | 'parts' | 'close';
  children: ReactNode;
  className?: string;
};

export function bandHeadingId(id: HomeSectionProps['id']): string {
  return `ts-h-${id}`;
}

export function HomeSection({ id, children, className }: HomeSectionProps) {
  return (
    <section
      className={className ? `ts-band ts-seam ${className}` : 'ts-band ts-seam'}
      id={id}
      aria-labelledby={bandHeadingId(id)}
      data-band={id}
    >
      <div className="ts-col">{children}</div>
    </section>
  );
}

/**
 * A band's heading and lead (docs/LANDING.md 2.0 "Type"): the h2 at 54 px (30 px at 390), weight
 * 500, -0.034 em, and the 19 px lead in ink 2, in the left 7 or 5 of the 12 columns.
 */
export function BandHead({
  id,
  heading,
  lead,
  span = 7,
  children,
}: {
  id: HomeSectionProps['id'];
  heading: string;
  lead?: string;
  span?: 5 | 7 | 12;
  children?: ReactNode;
}) {
  return (
    <div className={`ts-band-head is-${span}`}>
      <h2 id={bandHeadingId(id)} className="ts-h2">
        {heading}
      </h2>
      {lead !== undefined ? <p className="ts-lead">{lead}</p> : null}
      {children}
    </div>
  );
}
