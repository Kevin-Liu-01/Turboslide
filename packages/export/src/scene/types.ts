// The Scene: what the exporter measured in the rendered page for one slide in one theme, in sheet
// pixels (SPEC 8.1). Text carries the browser's own line breaks and boxes so no office renderer
// rewraps it; rules, rects, plates and chips carry their measured boxes and computed colors; every
// raster names the element the extractor screenshotted at 2x. The scene is JSON so it can be
// written beside the export for inspection.
import type { Box, RasterKind, Theme } from '@turboslide/schema/render';
import type { SlideKind } from '@turboslide/schema/deck';

export type SceneStyle = {
  /** The first family of the computed font-family, quotes removed. */
  family: string;
  /** True when the computed stack is a monospace stack (the code panel). */
  mono: boolean;
  weight: number;
  /** Font size in sheet px. */
  size: number;
  /** Letter spacing in sheet px; 0 for normal. */
  letterSpacing: number;
  /** The line box height in sheet px. */
  lineHeight: number;
  /** The computed color, rgb() or rgba(). */
  color: string;
  strike: boolean;
  /** The href when the run sits inside a link. */
  link?: string;
  /** The computed font-feature-settings ('cv11', 'ss01' on display text). */
  features: string;
  align: 'left' | 'center' | 'right' | 'justify';
  /** The marks of gslides-parity SPEC-2 7.2, read from the run's elements (`<i>`, `<u>`, `<sup>`, `<sub>`, `<mark>`). */
  italic?: boolean;
  underline?: boolean;
  baseline?: 'super' | 'sub';
  /** The computed background of the `<mark>` the run sits in, rgb() or rgba(). */
  highlight?: string;
};

/** The rotation and mirror of a positioned object (gslides-parity SPEC-2 2.1.1, 2.1.2). */
export type SceneTransform = {
  /** Degrees clockwise about the box centre, 0 to 360 exclusive. */
  rotate?: number;
  flip?: 'h' | 'v' | 'hv';
};

/** A drop shadow (SPEC-2 2.3.4), the colour resolved to a hex for the theme. */
export type SceneShadow = {
  colorHex: string;
  opacity: number;
  angle: number;
  /** Sheet px. */
  distance: number;
  blur: number;
};

/** The dash of a stroke or border (SPEC-2 2.3.3), the document's name. */
export type SceneDash = 'solid' | 'dot' | 'dash' | 'dashDot' | 'longDash' | 'longDashDot';

/**
 * The object facts every positioned scene entry may carry (SPEC-2 1.5, 2.1): the transform, the
 * user group tag (written as the `@g:<tag>` object name suffix, the outer grpSp), the shadow, the
 * dash and the alt text.
 */
export type SceneObject = SceneTransform & {
  /** The `pos.group` tag of the block, the outer group of ooxml/groups.ts. */
  userGroup?: string;
  shadow?: SceneShadow;
  dash?: SceneDash;
  alt?: string;
};

/**
 * A bullet or numeral of a Google list item (SPEC-2 2.2.12, 2.2.13): the glyph as drawn, the
 * level 1 to 9, the preset's numeral form for the level and the item's one based count at it.
 */
export type SceneBullet = {
  kind: 'bullet' | 'number';
  glyph: string;
  level: number;
  /** The pptxgenjs numberType of the preset's form at the level, for a numbered item. */
  numberType?: string;
  /** The count the item starts at, for a numbered item. */
  startAt?: number;
  /** True when the preset's form has no OOXML scheme and travels substituted (the `zerodigit` form). */
  substituted?: boolean;
  /** The list's preset as the renderer wrote it (`data-preset`), read in the page. */
  preset?: string;
  /** The item's one based position among the items at its level, read in the page. */
  index?: number;
};

export type SceneRun = {
  text: string;
  /** The union of the run's character rects (the inline box), sheet px. */
  box: Box;
  style: SceneStyle;
  /** The run is the hidden letters under a GT mark; the mark itself is a raster (SPEC 5.2). */
  gt?: true;
  /**
   * The width the letters take in the host font at 1x, measured in the page; the exporter spaces
   * the invisible run down to the mark's box so the text after the mark keeps its position.
   */
  gtLetters?: number;
  /**
   * A horizontal gap after the run in sheet px, left by an inline element that is not text (the
   * external glyph after a link), with the width of a no-break space in the run's font; the
   * exporter fills it with an invisible spaced run so the following text keeps its position.
   */
  gapAfter?: number;
  spaceWidth?: number;
};

export type SceneLine = {
  /** The line box: the inline box centered in the computed line height. */
  box: Box;
  runs: SceneRun[];
  /**
   * The paragraph the line belongs to (gslides-parity SPEC 7.4): the index of the `.para` span
   * it sits in, 0 for a one paragraph Text. A line whose index differs from the previous line's
   * starts a new paragraph in the file (`breakLine`), else a soft break.
   */
  paragraph?: number;
};

export type SceneText = SceneObject & {
  /** `<blockId>/<pointer>` from data-run, or 'counter'. */
  id: string;
  blockId: string;
  /** The border box of the element that carries the text. */
  box: Box;
  /** The box the text box is written at: the lines' union widened to the element's right edge. */
  textBox: Box;
  style: SceneStyle;
  lines: SceneLine[];
  /** True when the owning block's type is in NATIVE_BLOCK_TYPES (SPEC 4.2 export). */
  native: boolean;
  /** Shapes that share a group key are wrapped in one grpSp (a ruled row and its two boxes). */
  group?: string;
  /** The owning block's link (gslides-parity SPEC 7.2.7), as the href the renderer wrote. */
  link?: string;
  /** The vertical alignment of a positioned text box or shape text (SPEC-2 2.2.18); top when absent. */
  valign?: 'top' | 'middle' | 'bottom';
  /** The padding of a positioned text box in sheet px: top, right, bottom, left (SPEC-2 2.2.19). */
  padding?: [number, number, number, number];
  /** Paragraph spacing in sheet px (SPEC-2 2.2.9). */
  paraSpace?: { before?: number; after?: number };
  /** Text columns inside the box (SPEC-2 2.2.10), written by the post-process as `numCol`. */
  columns?: number;
  /** Word art's outline (SPEC-2 2.2.16), the colour as a hex. */
  outline?: { colorHex: string; width: number };
  /** The list glyph or numeral the item carries (SPEC-2 2.2.12). */
  bullet?: SceneBullet;
  /**
   * The shape this text sits in (SPEC-2 2.2.17): the block id of a shape with text, whose
   * SceneRect the builder merges with this text into one `addText` with `shape`.
   */
  inShape?: string;
};

export type SceneRule = {
  box: Box;
  /** The computed border color, rgb() or rgba(). */
  color: string;
  /** Stroke width in sheet px (1 for the deck's hairlines). */
  width: number;
  blockId?: string;
  /** Shapes that share a group key are wrapped in one grpSp (SPEC 8.2: a ruled row moves as one). */
  group?: string;
  /** `rule` is the rule block of the freeform round (docs/freeform.md), measured from its own box. */
  role: 'frame' | 'cross' | 'rows' | 'plain' | 'panel' | 'border' | 'rule';
};

/** The native geometry a rect travels as: a rectangle, a rounded rectangle or an ellipse (prstGeom). */
export type SceneShapeKind = 'rect' | 'roundRect' | 'ellipse';

export type SceneRect = SceneObject & {
  box: Box;
  /** The computed fill; `rgba(0, 0, 0, 0)` for a shape with no fill, which the builder writes as no fill. */
  fill: string;
  blockId?: string;
  /** `box` and `shape` are the freeform round's box and closed shape blocks (docs/freeform.md). */
  role: 'plate' | 'chip' | 'panel' | 'other' | 'box' | 'shape';
  group?: string;
  /** An outline, when the element draws a border on every side (the code panel in dark). */
  line?: { color: string; width: number };
  /** The geometry; a plain rectangle when absent. */
  shape?: SceneShapeKind;
  /** The corner radius of a rounded rectangle in sheet px. */
  radius?: number;
  /** A preset of shapes.ts by its ECMA `prstGeom` name (SPEC-2 2.3.1), when the shape is not one of the three above. */
  preset?: string;
  /** The preset's adjust values as fractions of 100000, in the definitions file's guide order (SPEC-2 2.3.2). */
  adjust?: number[];
  /** The vertical alignment and padding of a text carrying box or shape (SPEC-2 2.2.18, 2.2.19). */
  valign?: 'top' | 'middle' | 'bottom';
  padding?: [number, number, number, number];
};

/**
 * A line or arrow of a shape block (docs/freeform.md), measured from the svg's ends in sheet px;
 * the builder writes a native line with a triangle head at the headed ends. (`SceneLine` above is
 * a line of text; this is a drawn segment.)
 */
export type SceneSegment = SceneObject & {
  blockId: string;
  from: [number, number];
  to: [number, number];
  /** The computed stroke color, rgb() or rgba(). */
  color: string;
  /** Stroke width in sheet px. */
  width: number;
  heads: 'none' | 'start' | 'end' | 'both';
  /** The line kind (SPEC-2 2.4): a straight line or arrow when absent. */
  kind?: 'line' | 'arrow' | 'elbow' | 'curved' | 'curve' | 'polyline' | 'scribble';
  /** The points of an elbow (four), a curve, polyline or scribble, in sheet px. */
  points?: [number, number][];
  /** Where a connector bends, 0 to 1 along the box (SPEC-2 2.4.1). */
  bend?: number;
  /** The decorations of SPEC-2 2.4.5 at the ends; `none` when absent. */
  startEnd?: string;
  endEnd?: string;
  /** A closed path (SPEC-2 2.4.3) and the fill it takes. */
  closed?: boolean;
  fill?: string;
  /** The shapes the ends are attached to (SPEC-2 2.4.7): the target's object name and site. */
  connect?: { start?: { name: string; site: number }; end?: { name: string; site: number } };
};

export type ScenePicture = {
  assetId?: string;
  src: string;
  /** The image element's box (the full sheet for a full-picture slide). */
  box: Box;
  naturalWidth: number;
  naturalHeight: number;
  objectFit: string;
  objectPosition: string;
  alt: string;
};

export type SceneRaster = SceneObject & {
  /** Unique within the slide. */
  id: string;
  blockId: string;
  kind: RasterKind | 'block';
  /** The selector the extractor screenshots. */
  selector: string;
  box: Box;
  alpha: boolean;
  /** The PNG path, filled in by the extractor. */
  file?: string;
  /**
   * Device pixels per sheet pixel of the PNG: 3 for icons and marks, 1 for diagrams and the
   * language specimen, 2 for everything else under the `auto` policy (SPEC 8.6; extract.ts).
   */
  scale: 1 | 2 | 3;
  /**
   * The element itself has no box (an escape root whose markup is absolutely positioned), so the
   * box is the union of its descendants and the extractor screenshots that clip of the page.
   */
  clip?: true;
};

export type SceneBlock = {
  blockId: string;
  type: string;
  box: Box;
  native: boolean;
  /**
   * The block's link (gslides-parity SPEC 7.2.7): a URL, or a slide link (`#s/<id>`, `#next`,
   * `#previous`, `#first`, `#last`) the builder resolves to a slide number in the file.
   */
  link?: string;
};

/** One cell of a measured table (gslides-parity SPEC 7.3): its box, alignment, fill and margins. */
export type SceneTableCell = {
  box: Box;
  /** The data-run id of the cell's text carrier (`<blockId>/rows/<r>/cells/<c>`). */
  textId: string;
  align: 'left' | 'center' | 'right';
  /** The cell's computed background when the column or the cell sets a fill. */
  fill?: string;
  /** The cell padding in sheet px: top, right, bottom, left. */
  margin: [number, number, number, number];
  /** A merged cell's extent (SPEC-2 2.7.1); 1 when absent. The covered cells are not listed. */
  rowspan?: number;
  colspan?: number;
  /** The cell's own rule under it (SPEC-2 2.7.2): none at weight 0, else the colour, width and dash. */
  border?: { color: string; width: number; dash?: SceneDash } | 'none';
};

export type SceneTableRow = {
  y: number;
  h: number;
  header: boolean;
  cells: SceneTableCell[];
};

/**
 * A table block as the grid the renderer drew (gslides-parity SPEC 7.3): the column and row
 * geometry `addTable` takes as `colW` and `rowH`, the rules from the computed borders, the
 * vertical alignment and the font size. The cells' texts are the scene's `texts` entries named
 * by `textId`, grouped per row like a ruled row so the fallback construction needs nothing more.
 */
export type SceneTable = SceneObject & {
  blockId: string;
  box: Box;
  columns: { x: number; w: number }[];
  rows: SceneTableRow[];
  /** The rule under an ordinary row (and the hairline above the table). */
  rule: { color: string; width: number };
  /** The rule under a header row (the ink), when the table has one. */
  headerRule?: { color: string; width: number };
  valign: 'top' | 'middle' | 'bottom';
  /** The computed font size in sheet px. */
  size: number;
  /** The table border's dash (SPEC-2 2.7.3); solid when absent. */
  border?: { dash?: SceneDash; weight: number };
  /** True when the table holds merged cells (the grid form of the renderer). */
  merged?: boolean;
};

/**
 * A chart block (gslides-parity SPEC-2 2.8.1): the data from the document and the series colours
 * as the theme resolved them in the page, for `addChart` in Editable text; the svg is a raster in
 * Perfect. The chart's box is a picture region in the verify loop.
 */
export type SceneChart = SceneObject & {
  blockId: string;
  box: Box;
  kind: 'bar' | 'column' | 'line' | 'pie';
  categories: string[];
  series: { name: string; values: number[]; colorHex: string }[];
  /** A pie's slice colours per category as the theme resolved them, hex (SPEC-2 2.8.1). */
  sliceColorsHex?: string[];
  title?: string;
  legend: 'none' | 'right' | 'bottom' | 'top' | 'left';
  numberFormat: 'plain' | 'thousands' | 'percent' | 'currency';
  labels: boolean;
  /** The computed label and title colours. */
  labelColor: string;
  titleColor: string;
};

/**
 * The slide background of SPEC-2 2.6 (1.5): a colour (the slide's own or the deck default), or
 * the picture object that covers the sheet at the bottom of the stack, whose raster the builder
 * writes as `slide.background = { data }`, the form the picture kinds export.
 */
export type SceneBackground = {
  /** The computed colour of the `.slide-bg` layer, rgb() or rgba(). */
  color?: string;
  /** The raster id of the covering picture object. */
  pictureRasterId?: string;
  pictureBlockId?: string;
  /**
   * The materialized variant of a dithered covering picture (gslides-parity SPEC-3 10.4): the
   * absolute path of the theme's variant file, which Editable text writes as the background's
   * bytes instead of the raster shot, when the picture is a plain two tone plane (strength 1, no
   * trim, mask, adjustments or frame).
   */
  pictureVariantFile?: string;
};

/** A dithered picture of the slide as the page read it (SPEC-3 10.4 residual `dither:`). */
export type SceneDither = {
  blockId: string;
  assetId: string;
  key12: string;
  state: 'variant' | 'live';
};

export type Scene = {
  slideId: string;
  n: number;
  total: number;
  theme: Theme;
  kind: SlideKind;
  /** The slide title every surface shows (schema slideTitle): the slide name and the hidden title in the file. */
  title?: string;
  sheet: Box;
  paper: string;
  ink: string;
  /** The frame the stage draws: rails, rules and crosses (SPEC 2.1). */
  frame: { rules: SceneRule[]; crosses: Box[]; crossColor: string };
  /** The full-picture image of an opener, mood or closing slide. */
  picture?: ScenePicture;
  /** True when the picture is excluded from the export (a share-alike source, SPEC 11). */
  pictureExcluded?: boolean;
  /** The dithered pictures of the slide with the state each was shot in (SPEC-3 10.4). */
  dithers?: SceneDither[];
  plates: SceneRect[];
  chips: Box[];
  wordmark?: Box;
  counter?: SceneText;
  texts: SceneText[];
  rules: SceneRule[];
  rects: SceneRect[];
  /** Lines and arrows of shape blocks; absent on a scene measured before the freeform round. */
  lines?: SceneSegment[];
  /** Table blocks as grids (gslides-parity SPEC 7.3); absent on a scene measured before them. */
  tables?: SceneTable[];
  /** Chart blocks (gslides-parity SPEC-2 2.8.1); absent on a scene measured before them. */
  charts?: SceneChart[];
  /** The slide background of SPEC-2 2.6, when the slide has one. */
  background?: SceneBackground;
  rasters: SceneRaster[];
  blocks: SceneBlock[];
  notes?: string;
  /** Font faces the page reported loaded. */
  fonts: string[];
  /** The 2x sheet screenshot, when the extractor took one (flatten mode). */
  sheetImage?: string;
  /** Regenerated 2x two-tone twin bytes as a PNG path, when the picture has a two-tone treatment. */
  pictureFile?: string;
  /** True when the page showed the regenerated 2x twin instead of the deck's twin file. */
  pictureRegenerated?: boolean;
  warnings: string[];
};
