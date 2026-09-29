import type { ReactNode } from 'react';

import type { SectionIconName } from './copy';
import { SectionIcon } from './SectionIcon';

/**
 * One section of /home (docs/POLISH.md 3.2): one purpose, one heading with its 20 px Heroicon
 * before it, one lead at the 560 px measure, at most one action or note under the lead
 * (`after`), and one picture or one diagram beside the text (`children`) in the two column block
 * of 3.4 (text 5 of 12, picture 7 of 12, a 72 px gap, `align-items: start`; one column with the
 * text first under 760). A section without a picture (`single`) takes no picture box.
 */
export type HomeSectionProps = {
  id: string;
  icon: SectionIconName;
  heading: string;
  lead: string;
  after?: ReactNode;
  children?: ReactNode;
  single?: boolean;
};

export function HomeSection({
  id,
  icon,
  heading,
  lead,
  after,
  children,
  single = false,
}: HomeSectionProps) {
  const headingId = `ts-product-h-${id}`;
  return (
    <section className="ts-product-band" id={id} aria-labelledby={headingId} data-band={id}>
      <div className={single ? 'ts-product-rail' : 'ts-product-rail ts-product-two'}>
        <div className="ts-product-text">
          <h2 id={headingId} className="ts-product-h2">
            <SectionIcon name={icon} />
            <span>{heading}</span>
          </h2>
          <p className="ts-product-lead">{lead}</p>
          {after}
        </div>
        {children}
      </div>
    </section>
  );
}
