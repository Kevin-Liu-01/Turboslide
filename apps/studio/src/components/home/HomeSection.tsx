import type { ReactNode } from 'react';

/**
 * The band shell every band of /home below the first screen uses (docs/LANDING.md 2.0 "The
 * column"; 6.1): a `section[data-band]` labelled by its h2, 96 px of padding above and below at
 * 1,024 px and over (48 px under 720 px, docs/DESIGN.md 8.16), the 1,104 px column inside it, and
 * the band closed by `.ts-seam` with its 9 px crosses where the seam meets the rails. The band's
 * own layout is its
 * children; its instrument sits in one `Reserve` box at its final size (4.2).
 */
export type HomeSectionProps = {
  id:
    | 'menus'
    | 'canvas'
    | 'tailor'
    | 'kits'
    | 'agents'
    | 'people'
    | 'present'
    | 'export'
    | 'patterns'
    | 'features'
    | 'close';
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
 * 500, -0.034 em, and the 19 px lead in ink 2, in the left 7 or 5 of the 12 columns; `split`
 * (docs/DESIGN.md 8.4 to 8.6, the round's mocks) sets the h2 in the left half and the lead beside
 * it in the right, one row over the band's figure (stacked under 1,024 px).
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
  span?: 5 | 7 | 12 | 'split';
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

/**
 * A band's reserved instrument box (docs/LANDING.md 2.0 "At rest", 4.2, 6.3): `[data-reserve]` at
 * its final size in the document, so the chunk that fills it after \`load\` moves nothing. The
 * band loader sets `data-filled` once it wrote the box's placeholders (`[data-fill]`) or markup.
 */
export function Reserve({
  band,
  className,
  children,
}: {
  band: HomeSectionProps['id'];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className ? `ts-reserve ${className}` : 'ts-reserve'} data-reserve={band}>
      {children}
    </div>
  );
}
