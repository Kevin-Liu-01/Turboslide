// Written by scripts/site/capture.mjs --only figures with the pictures in
// apps/studio/public/docs/figures (docs/SITE.md section 6); do not edit by hand. Each docs figure's
// crop in CSS pixels, the phone's narrower crop where it has one, and the leader's place under it
// as a share of each crop's width.

export type FigureSize = {
  width: number;
  height: number;
  phone?: { width: number; height: number };
  leader?: { label: string; at: number; phoneAt?: number };
};

export const FIGURE_SIZES: Record<string, FigureSize> = {
  'editor-top': {
    width: 755,
    height: 112,
    phone: {
      width: 340,
      height: 112,
    },
  },
  'title-row-share': {
    width: 454,
    height: 44,
    leader: {
      label: 'Share',
      at: 73.8,
      phoneAt: 60.9,
    },
    phone: {
      width: 304,
      height: 44,
    },
  },
  'share-dialog': {
    width: 520,
    height: 444,
  },
  'file-download': {
    width: 488,
    height: 389,
  },
  'themes-panel': {
    width: 320,
    height: 416,
  },
  'viewer-bar': {
    width: 634,
    height: 52,
  },
};
