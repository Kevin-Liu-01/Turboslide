/**
 * The presenter view's pending component (gslides-parity SPEC-3 9.2 E1, P1; research-3 05 3.5 P1):
 * /present renders with `ssr: false`, so `pendingComponent: PresenterSkeleton` with `pendingMs: 0`
 * gives first paint the console's grid (PresenterConsole.css: the 52 px head over the body, the
 * body's 3fr and 2fr columns, the current slide's 16:9 frame and the side column with its two
 * small frames), so the console replaces it in place. Static, no state, no measurement; the head
 * groups are empty boxes of the head's own height and nothing here carries the console's marks.
 * The current slide's frame carries `ts-curtain`, the figure twin of gslides-parity SPEC-4 0.15
 * (brand.css), inside the same box.
 */
export function PresenterSkeleton() {
  return (
    <div
      className="ts-presenter ts-skeleton"
      data-skeleton="presenter"
      aria-busy="true"
      aria-label="Loading the presenter view"
    >
      <header className="ts-presenter-head ts-skeleton-row" aria-hidden="true">
        <div className="ts-presenter-timer" />
        <span className="ts-skeleton-title" />
        <div className="ts-presenter-facts" />
      </header>
      <div className="ts-presenter-body" aria-hidden="true">
        <section className="ts-presenter-stage">
          <div className="ts-presenter-row">
            <span />
            <div className="ts-presenter-current">
              <div className="ts-presenter-frame is-current ts-skeleton-frame ts-curtain" />
              <div className="ts-presenter-pick" />
            </div>
            <span />
          </div>
        </section>
        <aside className="ts-presenter-side">
          <div className="ts-presenter-tabs" />
          <div className="ts-presenter-previews">
            <figure className="ts-presenter-preview">
              <div className="ts-presenter-frame is-small ts-skeleton-frame" />
            </figure>
            <figure className="ts-presenter-preview">
              <div className="ts-presenter-frame is-small ts-skeleton-frame" />
            </figure>
          </div>
        </aside>
      </div>
    </div>
  );
}
