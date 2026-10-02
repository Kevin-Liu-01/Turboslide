import type { ReactNode } from 'react';

/**
 * One section of /home (docs/POLISH.md 3.2; the page grammar of docs/NEXT.md 4.1.2): one
 * purpose, one heading with no icon before it (DECK-GRAMMAR 40: an icon sits only in a key cell),
 * one lead at the 560 px measure, at most one action or note under the lead (`after`), and one
 * picture or one diagram beside the text (`children`) in the two column block of 3.4 (text 5 of
 * 12, picture 7 of 12, a 72 px gap, `align-items: start`; one column with the text first under
 * the layout's one breakpoint, 1023 px). The section is a band of the 1104 px column with its
 * seam under it and a cross where the seam meets each rail (`.ts-seam`). A section without a
 * picture (`single`) takes no picture box.
 */
export type HomeSectionProps = {
  id: string;
  heading: string;
  lead: string;
  after?: ReactNode;
  children?: ReactNode;
  single?: boolean;
};

export function HomeSection({
  id,
  heading,
  lead,
  after,
  children,
  single = false,
}: HomeSectionProps) {
  const headingId = `ts-product-h-${id}`;
  return (
    <section className="ts-product-band ts-seam" id={id} aria-labelledby={headingId} data-band={id}>
      <div className={single ? 'ts-col' : 'ts-col ts-product-two'}>
        <div className="ts-product-text">
          <h2 id={headingId} className="ts-product-h2">
            {heading}
          </h2>
          <p className="ts-product-lead">{lead}</p>
          {after}
        </div>
        {children}
      </div>
    </section>
  );
}
