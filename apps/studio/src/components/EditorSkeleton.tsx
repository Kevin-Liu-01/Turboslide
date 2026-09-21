/**
 * The editor's pending component (gslides-parity SPEC-3 9.2 E1, P1; research-3 05 3.2 E1): the
 * routes /new and /edit render with `ssr: 'data-only'`, so the server sends the skeleton where the
 * editor will stand and the client renders the editor once its JavaScript lands. With
 * `pendingComponent: EditorSkeleton` first paint already carries the editor's final rows and
 * columns: the same `.pt-viewer.is-editor` grid EditorShell.css lays out (the title row at 44,
 * the menu bar at 28, the toolbar at 40, the body with the 256 px filmstrip column and the canvas
 * column), so the real chrome replaces it in place and nothing moves. The tree is static: no
 * state, no effect, no measurement; the ten menu titles are the words the menu bar draws so the
 * row's type sits where it will.
 *
 * The product round (docs/PRODUCT.md 3.5; audit-interface 30): the filmstrip holds one numbered
 * frame for the one slide draft of /new (`frames`, the deck's count where a route knows it) instead
 * of three, a quiet paper plate stands where the sheet will be instead of the dither figure, so
 * the editor that replaces it 100 to 250 ms later brings no flash and no layout jump, and the
 * bottom bar row left with the bar (section 2 rank 25). The routes hold the skeleton back for
 * 300 ms on a client side navigation (`pendingMs`), so an editor that is ready inside that time
 * never shows it. Nothing here carries `data-settled`: the specs and the audit wait for the real
 * shell's mark.
 */
const MENU_TITLES = [
  'File',
  'Edit',
  'View',
  'Insert',
  'Format',
  'Slide',
  'Arrange',
  'Tools',
  'Extensions',
  'Help',
] as const;

export type EditorSkeletonProps = {
  /** the filmstrip frames to draw: one for a fresh draft, the deck's slide count where known */
  frames?: number;
};

/** The frames of a route that does not know its count: the editor route before its loader answers. */
export const DEFAULT_FRAMES = 3;

export function EditorSkeleton({ frames = DEFAULT_FRAMES }: EditorSkeletonProps = {}) {
  const count = Math.max(1, Math.min(12, Math.round(frames)));
  const list = Array.from({ length: count }, (_frame, index) => index + 1);
  return (
    <div
      className="pt-viewer is-editor ts-skeleton"
      data-sb="thumbs"
      data-density="thumbs"
      data-skeleton="editor"
      data-frames={count}
      aria-busy="true"
      aria-label="Loading the editor"
      /* the four rows of the editor since the bottom bar left (EditorShell.css); the skeleton
         sheet's literal five row grid (styles.css) is the integrator's to change, and an inline
         value keeps the stage box the height the editor's will be */
      style={{ gridTemplateRows: '44px 28px 40px minmax(0, 1fr)' }}
    >
      <header className="ts-title-row ts-skeleton-row">
        <span className="ts-skeleton-mark" aria-hidden="true" />
        <span className="ts-skeleton-title" aria-hidden="true" />
      </header>
      <nav className="ts-menubar ts-skeleton-row" aria-hidden="true">
        <div className="ts-menubar-titles">
          {MENU_TITLES.map((title) => (
            <span key={title} className="ts-skeleton-menu">
              {title}
            </span>
          ))}
        </div>
      </nav>
      <div className="ts-toolbar ts-skeleton-row" aria-hidden="true" />
      <aside className="pt-sb ts-skeleton-sb" aria-hidden="true">
        <div className="ts-skeleton-film">
          {list.map((n) => (
            <div key={n} className="ts-skeleton-card">
              <span className="ts-skeleton-n">{n}</span>
              <span className="ts-skeleton-frame" />
            </div>
          ))}
        </div>
      </aside>
      <section className="pt-main ts-skeleton-main" aria-hidden="true">
        <div className="pt-stagewrap ts-skeleton-stagewrap">
          <div className="ts-curtain-host">
            <div className="ts-skeleton-sheet" />
          </div>
        </div>
        <div className="ts-notes-slot" />
      </section>
    </div>
  );
}
