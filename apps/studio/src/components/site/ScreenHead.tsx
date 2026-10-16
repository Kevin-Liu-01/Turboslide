import { SiteIcon } from './SiteIcon';
import type { SiteIconName } from './SiteIcon';

/**
 * The ruled head of a landing screen (docs/SITE.md A.4): the hairline seam, the solid icon, the
 * screen's number and label in the first three columns, and its one sentence as the h2 in the
 * other nine.
 */
export function ScreenHead({
  titleId,
  icon,
  number,
  label,
  sentence,
}: {
  titleId: string;
  icon: SiteIconName;
  number: string;
  label: string;
  sentence: string;
}) {
  return (
    <header className="site-screen-head">
      <p className="t-label site-label">
        <SiteIcon name={icon} />
        <span className="site-num">{number}</span>
        {label}
      </p>
      <h2 id={titleId} className="t-title">
        {sentence}
      </h2>
    </header>
  );
}
