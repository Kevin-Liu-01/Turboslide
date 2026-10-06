// The chrome's three scales of the design round (docs/DESIGN.md 2.2, 3.1, 6.1): the stacking
// layers every floating surface takes, the corner ladder, and the scrollbar's numbers. Data only,
// framework free. `packages/chrome/src/tokens.css` declares each value as a custom property on
// `:root` (the layers as `--ts-layer-<name>`, the corners as `--pt-radius-sm`, `--pt-radius` and
// `--pt-radius-lg`, the scrollbar as `--pt-scroll-*`), and `scale.test.ts` parses that file and
// asserts the two agree, the parity pattern of `tokens.ts` and `tokens.test.ts`.

/**
 * The ten named layers, bottom to top (DESIGN.md 2.2). The `Layer` primitive
 * (`packages/chrome/src/Layer.ts`) writes the value as the surface's z-index and keeps this order
 * among the surfaces open in the browser's top layer. A z-index under `LOCAL_Z_LIMIT` is local
 * order inside one stacking context and is not part of the scale.
 */
export const LAYERS = Object.freeze({
  /** the stage and everything in its own context: the overlay, chips, guides, cursors, cards */
  stage: 0,
  /** the notes slot, the narrow right panel and its drawer, the sidebar overlay, the banners */
  docked: 10,
  /** the name prompt bar, the conflict banner, the edit banner */
  bar: 20,
  /** the slideshow window and the presenter view over the editor */
  show: 30,
  /** every dialog with its scrim, the float dialog, the search card, the help card, the report */
  dialog: 40,
  /** menus, context menus, plate menus, pickers, the layout and swatch plates */
  popover: 50,
  /** toasts and snackbars */
  toast: 60,
  /** the tooltip */
  tooltip: 70,
  /** the hover preview of a slide */
  preview: 80,
  /** the keyboard skip link on /home and /decks */
  skip: 90,
});

export type LayerName = keyof typeof LAYERS;

/** The layer names in ascending order. */
export const LAYER_NAMES: readonly LayerName[] = Object.freeze(
  (Object.keys(LAYERS) as LayerName[]).sort((a, b) => LAYERS[a] - LAYERS[b]),
);

/** A z-index under this value is local order inside a stacking context (DESIGN.md 2.6). */
export const LOCAL_Z_LIMIT = 5;

/** The custom property that carries a layer's value: `--ts-layer-<name>`. */
export function layerProperty(name: LayerName): string {
  return `--ts-layer-${name}`;
}

/** True when a name is one of the ten layers. */
export function isLayerName(name: string): name is LayerName {
  return Object.prototype.hasOwnProperty.call(LAYERS, name);
}

/**
 * The radius ladder of General Translation's UI (DESIGN.md 3.1, decision C4), in px; `round` is a
 * percentage. 0 for structure, slides and anything on a slide; 4 px chips; 6 px controls and small
 * floating plates; 8 px windows; 50% round marks.
 */
export const RADII = Object.freeze({
  square: 0,
  chip: 4,
  control: 6,
  window: 8,
  round: '50%',
});

export type RadiusName = keyof typeof RADII;

/** The custom property of each rung that has one; square and round are written as values. */
export const RADIUS_TOKENS = Object.freeze({
  chip: '--pt-radius-sm',
  control: '--pt-radius',
  window: '--pt-radius-lg',
} as const satisfies Partial<Record<RadiusName, string>>);

/**
 * The one scrollbar (DESIGN.md 6.1, 6.2; decision C11), in px: the gutter, the thumb's inset from
 * each edge at rest and under the pointer (so the thumb is 4 px at rest and 6 px under the pointer
 * or while dragged), the thumb's shortest length, and the alpha of the thumb's ink at rest, which
 * holds 3:1 on the paper of both appearances (WCAG 2.2 SC 1.4.11).
 */
export const SCROLLBAR = Object.freeze({
  gutter: 8,
  inset: 2,
  insetOn: 1,
  min: 32,
  thumbAlpha: 0.44,
});

/** The thumb's drawn width at rest and under the pointer. */
export function thumbWidth(state: 'rest' | 'pointer'): number {
  return SCROLLBAR.gutter - 2 * (state === 'rest' ? SCROLLBAR.inset : SCROLLBAR.insetOn);
}
