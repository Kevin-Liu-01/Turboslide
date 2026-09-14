// The collaborator layer's class names and geometry (gslides-parity SPEC-3 4.2 to 4.4, 9.3;
// research-3 11 section 6 and section 8): the names the chrome draws remote carets, flags,
// outlines, pointers, the Following plate, the comment markers and the presence slot with, and the
// fixed boxes the layout shift audit measures. The theme's stage.css carries the same numbers as
// CSS hooks (position, fixed sizes, transform only motion); the hues, the marks and the type are the
// chrome's (packages/chrome, packages/identity). collab.test.ts keeps the two in step. Nothing here
// reaches an export: the classes are drawn by the chrome over the stage and never by the renderer.

/** The class names (SPEC-3 "The seams every builder types against", the renderer's DOM). */
export const COLLAB_CLASSES = {
  /** A remote caret's or pointer's name flag, 120 by 18, ellipsized (11 6.5). */
  flag: 'ts-flag',
  /** The "being edited by" outline at a block's box edge (11 6.7). */
  remoteOutline: 'ts-remote-outline',
  /** A remote pointer, a 12 by 16 polygon moved by transform (11 6.6). */
  remotePointer: 'ts-remote-pointer',
  /** The Following plate, absolute over the stage at the top centre, 240 by 24 (11 6.3). */
  following: 'ts-following',
  /** A comment marker, a 20 by 20 plate outside the anchored box (11 6.8). */
  commentMarker: 'ts-comment-marker',
  /** The count chip beside a marker, 16 high, at least 20 wide, tabular figures. */
  commentCount: 'ts-comment-count',
  /** The presence slot in the title row, reserved at 184 px from first paint (11 6.2). */
  presence: 'ts-presence',
} as const;

export type CollabClass = (typeof COLLAB_CLASSES)[keyof typeof COLLAB_CLASSES];

/** The fixed boxes, in CSS pixels at 1x. */
export const COLLAB_GEOMETRY = {
  flag: { width: 120, height: 18 },
  pointer: {
    width: 12,
    height: 16,
    /** The polygon's points in the 12 by 16 box, the tip at the pointer position. */
    points: '0,0 12,10 7,11 10,16 8,16 5,12 0,16',
    /** The interpolation from the last received position, linear. */
    motionMs: 80,
    /** The flag's top left from the tip. */
    flagOffset: { x: 14, y: 16 },
  },
  following: { width: 240, height: 24, top: 8 },
  commentMarker: { size: 20 },
  commentCount: { minWidth: 20, height: 16 },
  /** The chip sizes: the title row and cards, the filmstrip and version list, the flags. */
  chip: { row: 24, list: 16, flag: 14 },
  presence: {
    width: 184,
    height: 32,
    /**
     * The slot's tracks: four other chips at 24 with 4 px gaps, a 4 px gap, the `+N` chip at 32,
     * an 8 px gap, the 1 px hair rule, a 7 px gap, the own chip at 24 (11 6.2). The sum is 184.
     */
    tracks: [24, 4, 24, 4, 24, 4, 24, 4, 32, 8, 1, 7, 24],
  },
  /** The two ring halo over a picture: 1 px ink inside, 1 px paper outside, never themed. */
  halo: { inner: '#070707', outer: '#ffffff' },
} as const;

/** The custom properties stage.css declares for the chrome to read. */
export const COLLAB_TOKENS = {
  haloInner: '--ts-halo-in',
  haloOuter: '--ts-halo-out',
  flagWidth: '--ts-flag-w',
  flagHeight: '--ts-flag-h',
  followingWidth: '--ts-following-w',
  followingHeight: '--ts-following-h',
  markerSize: '--ts-marker',
  countMinWidth: '--ts-count-min-w',
  presenceTracks: '--ts-presence-tracks',
  pointerMotion: '--ts-pointer-ms',
} as const;

/** The dithered picture's DOM (SPEC-3 10.3), for the runtime and the chrome. */
export const DITHER_DOM = {
  root: 'picture',
  canvas: 'picture-dither',
  field: 'data-dither',
  key: 'data-dither-key',
  state: 'data-dither-state',
} as const;

/** The `html` block's sandboxed frame (SPEC-3 8.4), for the frame module and the chrome. */
export const FRAME_DOM = {
  host: 'ts-x-host',
  frame: 'ts-x-frame',
} as const;
