import { EDITOR } from './copy';
import { Shot } from './Shot';

/** The slot of the full width shots: the rail less its gutters, capped at the rail. */
export const FULL_SIZES = '(max-width: 1168px) calc(100vw - 48px), 1120px';
/** The slot of the seven twelfths column. */
export const WIDE_SIZES =
  '(max-width: 760px) calc(100vw - 48px), (max-width: 1168px) calc((100vw - 120px) * 0.58), 612px';

/**
 * The editor in one picture (gslides-parity SPEC-4 2.2 item 4, 0.24; R05 6.3): the editor pair
 * above the fold at 1440, the fresh presentation in the dark appearance and the light editor, one
 * shown per stored theme by `home.css` (`:root[data-theme]`), then the heading, the rotation
 * shot and the three claims. A `<picture>` element cannot follow `data-theme` (its `media`
 * queries reach `prefers-color-scheme`, which the product never consults), so the pair is two
 * `<img>` elements under one figure: the dark one eager (the default theme's LCP candidate), the
 * light one lazy so it is not fetched while hidden.
 */
export function HomeEditor() {
  return (
    <section className="ts-product-band" aria-labelledby="ts-product-h-editor">
      <div className="ts-product-rail">
        <figure className="ts-product-shot ts-product-picture" data-picture="editor">
          <Shot
            name="01-new-presentation"
            sizes={FULL_SIZES}
            loading="eager"
            fetchPriority="high"
            className="ts-product-only-dark"
          />
          <Shot name="13-editor-light" sizes={FULL_SIZES} className="ts-product-only-light" />
        </figure>
        <div className="ts-product-two ts-product-editor">
          <div>
            <h2 id="ts-product-h-editor" className="ts-product-h2">
              {EDITOR.heading}
            </h2>
            <figure className="ts-product-shot ts-product-editor-shot">
              <Shot name="06-canvas-rotation" sizes={WIDE_SIZES} />
            </figure>
          </div>
          <div className="ts-product-claims ts-product-lead">
            {EDITOR.claims.map((claim) => (
              <p key={claim}>{claim}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
