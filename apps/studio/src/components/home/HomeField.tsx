/**
 * The field strip (docs/LANDING.md 2.3): between the hero and band 2, a sparse field at 6 percent
 * tone gathered into the selection frame drawn in ink, its top edge in the first screen. The
 * gathered state is the markup: a 1 bit still of the cell grid inlined as a CSS mask over a box
 * filled with the sheet's ink (`--ts-still` from the hero's server only stylesheet), so one still
 * serves both appearances and every kit. F1 (the gather, L4's `live/field.ts`, push 7) prints on
 * the canvas, which is hidden until it does. Decorative: `aria-hidden`.
 */
export function HomeField() {
  return (
    <div className="ts-home-strip ts-seam" data-band="field" aria-hidden="true">
      <div className="ts-col">
        <div className="ts-home-strip-box ts-home-field" data-field="strip">
          <i className="ts-field-still" />
          <canvas aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
