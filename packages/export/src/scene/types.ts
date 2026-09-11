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
  align: 'left' | 'center' | 'right';
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
};

export type SceneText = {
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
  role: 'frame' | 'cross' | 'rows' | 'plain' | 'panel' | 'border';
};

export type SceneRect = {
  box: Box;
  fill: string;
  blockId?: string;
  role: 'plate' | 'chip' | 'panel' | 'other';
  group?: string;
  /** An outline, when the element draws a border on every side (the code panel in dark). */
  line?: { color: string; width: number };
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

export type SceneRaster = {
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
};

export type Scene = {
  slideId: string;
  n: number;
  total: number;
  theme: Theme;
  kind: SlideKind;
  sheet: Box;
  paper: string;
  ink: string;
  /** The frame the stage draws: rails, rules and crosses (SPEC 2.1). */
  frame: { rules: SceneRule[]; crosses: Box[]; crossColor: string };
  /** The full-picture image of an opener, mood or closing slide. */
  picture?: ScenePicture;
  /** True when the picture is excluded from the export (a share-alike source, SPEC 11). */
  pictureExcluded?: boolean;
  plates: SceneRect[];
  chips: Box[];
  wordmark?: Box;
  counter?: SceneText;
  texts: SceneText[];
  rules: SceneRule[];
  rects: SceneRect[];
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
