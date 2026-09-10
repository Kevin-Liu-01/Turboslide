/**
 * The shapes every route feeds ViewerShell. Pure types and a few small
 * helpers; no React, no DOM. Ported from Prototemplate/src/lib/shell-data.ts
 * (PORTED_FROM.json), cut to what Turboslide's viewer routes use: the site
 * map fields (href, url, surface, inPlace, under) are gone, and an item
 * carries the slide's rendered HTML for the live clones (`html`) and its
 * kind for the row glyph (SPEC 6.2).
 */

/** Light and dark captures for a ThumbShot or a book page (M3, the render worker's thumbnails). */
export type ShellShot = { light: string; dark?: string };

export type ShellItem = {
  /** stable id; the hash and the active state track it */
  id: string;
  /** the number column text, already padded (`01`); blank hides it */
  n?: string;
  /** a short mark at the right end of the item's list row */
  mark?: string;
  title: string;
  shot?: ShellShot;
  desc?: string;
  /** the slide kind, for the row glyph (SPEC 6.2) */
  kind?: string;
  /** the slide's rendered HTML (SPEC 5.2 renderSlide output), for the live clones of M1 */
  html?: string;
  /** the lint badge at severity 2 or 3 (SPEC 6.2) */
  lint?: { s3: number; s2: number };
  /** another author holds the slide (SPEC 6.7); the sidebar shows the lease dot */
  leased?: boolean;
};

export type ShellSection = {
  id: string;
  label: string;
  items: readonly ShellItem[];
  /**
   * False for a section whose items can be selected but are not part of the
   * paged sequence. Such items are left out of the count, the progress line
   * and step(); a paged route counts the rest.
   */
  paged?: false;
};

/** Stage modes. A route offers a subset; the first offered is its default (SPEC 2.2, ShellMode). */
export type ShellMode = 'slide' | 'grid' | 'book';

/** The one order the mode segmented control keeps on every route. */
export const MODE_ORDER: readonly ShellMode[] = ['slide', 'grid', 'book'];

/** Key table: paged routes take the arrows and Space; flow routes let them scroll. */
export type ShellKeys = 'paged' | 'flow';

/** A route's key table, fixed or decided by the current mode. */
export type ShellKeysProp = ShellKeys | ((mode: ShellMode) => ShellKeys);

/** The mark in the sidebar head and the toolbar brand. Turboslide only draws the GT mark. */
export type ShellMark = 'gt';

/** The sidebar item renderer for the route's own items: captured or cloned frames, or frameless rows. */
export type ShellThumb = 'shot' | 'row';

/** The sidebar density: an outline of rows, or the strip of 16:9 frames (SPEC 6.2). */
export type ShellDensity = 'outline' | 'thumbs';

/** Every item across sections, in reading order. */
export function flattenShellItems(sections: readonly ShellSection[]): readonly ShellItem[] {
  return sections.flatMap((section) => section.items);
}

/** The items the count and the arrows run over: every item of every paged section. */
export function pagedShellItems(sections: readonly ShellSection[]): readonly ShellItem[] {
  return sections.filter((section) => section.paged !== false).flatMap((section) => section.items);
}

/** The key table a route resolves to for a mode. */
export function resolveShellKeys(keys: ShellKeysProp, mode: ShellMode): ShellKeys {
  return typeof keys === 'function' ? keys(mode) : keys;
}

/** The id an item previews under. Written to data-preview for the preview layer. */
export function previewId(item: ShellItem): string {
  return item.id;
}

/** `1` becomes `01`; `52` stays `52`. Used for counts, thumbs and pages. */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
