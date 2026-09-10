// The render record types the driver fills, named from @turboslide/schema/render (SPEC 4.2
// "render") so the driver and the linter read one definition. The part types below are indexed
// out of RenderRecord rather than restated, so a schema change reaches every call site.
import type { RenderRecord } from '@turboslide/schema/render';

export type {
  Box,
  RasterKind,
  RenderRecord,
  Theme as RenderTheme,
} from '@turboslide/schema/render';
export type { AssetId, BlockId, SlideId } from '@turboslide/schema/ids';

export type RenderScale = RenderRecord['scale'];

export type RenderOverflow = RenderRecord['overflow'][number];

/**
 * One measured block. `fontSize` is the smallest computed font size of any text node in the
 * block and `fontWeight` the largest, which is what type/floor-15 and type/weight-cap check;
 * `lines` counts distinct line boxes. Row values of a `rows` block are measured under the key
 * `<blockId>/<index>` with type `row` so rows/two-lines can name the row.
 */
export type RenderBlock = RenderRecord['blocks'][string];

export type RenderRaster = RenderRecord['rasters'][number];
