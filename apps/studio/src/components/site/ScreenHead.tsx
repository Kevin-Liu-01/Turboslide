/**
 * The head of a landing screen (docs/SITE.md A.4): the screen's heading as its h2.
 */
export function ScreenHead({ titleId, heading }: { titleId: string; heading: string }) {
  return (
    <header className="site-screen-head">
      <h2 id={titleId} className="t-title">
        {heading}
      </h2>
    </header>
  );
}
