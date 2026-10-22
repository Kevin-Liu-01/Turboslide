/**
 * The ruled head of a landing screen (docs/SITE.md A.4): the hairline seam and the screen's one
 * sentence as its h2.
 */
export function ScreenHead({ titleId, sentence }: { titleId: string; sentence: string }) {
  return (
    <header className="site-screen-head">
      <h2 id={titleId} className="t-title">
        {sentence}
      </h2>
    </header>
  );
}
