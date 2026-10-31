/**
 * The head of a landing screen after the hero: the screen's claim as its h2, a short Title Case
 * phrase, and at most one plain sentence under it where the demonstration needs words. The head
 * keeps the page's column while the screen's demonstration takes the width it needs; a screen
 * that sets its head beside its demonstration places it in its own column (`wrap={false}`).
 */
export function ScreenHead({
  titleId,
  heading,
  lead,
  wrap = true,
}: {
  titleId: string;
  heading: string;
  lead?: string;
  wrap?: boolean;
}) {
  return (
    <header className={wrap ? 'site-claim-head site-wrap' : 'site-claim-head'}>
      <h2 id={titleId} className="t-title">
        {heading}
      </h2>
      {lead === undefined ? null : <p className="t-lead">{lead}</p>}
    </header>
  );
}
