/**
 * The editor's pending component (gslides-parity SPEC-3 9.2 E1, P1; research-3 05 3.2 E1): the
 * routes /new and /edit render with `ssr: false`, so the server sends the document shell alone and
 * the page was blank paper until the route chunk, the loader round trip and the first client
 * render landed. With `pendingComponent: EditorSkeleton` and `pendingMs: 0` first paint already
 * carries the editor's final rows and columns: the same `.pt-viewer.is-editor` grid EditorShell.css
 * lays out (the title row at 44, the menu bar at 28, the toolbar at 40, the body with the 256 px
 * filmstrip column and the canvas column, the bottom bar at 32), so the real chrome replaces it in
 * place and nothing moves. The tree is static: no state, no effect, no measurement; the ten menu
 * titles are the words the menu bar draws so the row's type sits where it will; the filmstrip
 * holds numbered 16:9 frames for the first slides (the count is not known before the loader
 * answers, so three frames stand in and the real filmstrip lays its cards over the same column).
 * Nothing here carries `data-settled`: the specs and the audit wait for the real shell's mark.
 * The curtain picture (gslides-parity SPEC-4 0.15): the stage box holds a `ts-curtain-host` laid
 * over it and, inside, the `ts-curtain`, the empty state's figure twin at integer cells in a 16:9
 * box centred where the sheet will be (brand.css); the skeleton's own boxes are unchanged so the
 * layout shift gate stays at zero, and the sheet replaces the picture in place.
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

const FRAMES = [1, 2, 3] as const;

export function EditorSkeleton() {
  return (
    <div
      className="pt-viewer is-editor ts-skeleton"
      data-sb="thumbs"
      data-density="thumbs"
      data-skeleton="editor"
      aria-busy="true"
      aria-label="Loading the editor"
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
          {FRAMES.map((n) => (
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
            <div className="ts-curtain" />
          </div>
        </div>
        <div className="ts-notes-slot" />
      </section>
      <footer className="ts-bottombar ts-skeleton-row" aria-hidden="true" />
    </div>
  );
}
