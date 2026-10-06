# Requests of the design round

Each lane's requests for a file outside its list (docs/DESIGN.md 10), under the lane's key, for the
integrator or the owning lane to make. A request names the file, the change, the reason and the row
it serves.

## D2

1. **D1 or the integrator, `packages/chrome/src/place.ts`** (DR-D2#1; `chrome.layers.follows-anchor`,
   DESIGN.md 2.4): in `middlewareOf`, push `size` before `shift` when `fit` is set (or shift with
   `crossAxis: false` then). floating-ui's `size` gives the whole clipping height when `shift` is
   enabled on that axis, so a fitted plate taller than the room under its anchor is shifted over
   the anchor (read on 4662: the font picker at 884 px from top 8, over its control). D2 passes
   `fit` for the menus alone until then (the old `placeMenu` did the same), and the other plates
   bound their own height in their sheets.
2. **D1 or the integrator, `packages/chrome/src/ExportMenu.tsx`** (DR-D2#1): the export menu is
   mounted nowhere today; if it returns, its card takes `usePlate(card, { layer: 'popover',
   anchor: button })` (`packages/chrome/src/usePlate.ts`) and `.pt-float`. Its sheet already reads
   the scale.
3. **The integrator, `packages/viewer/src/InlineText.tsx` and `InlineText.css`** (DR-D2#1; no
   lane owns them): the link popover over a slide (`.ts-link-pop`) is a small floating plate at
   radius 0 on `--pt-hair`; under the ladder (DESIGN.md 3.1, 3.4) it takes `.pt-float` (6 px,
   `--pt-edge`, the ring) and keeps the stage's local order.
