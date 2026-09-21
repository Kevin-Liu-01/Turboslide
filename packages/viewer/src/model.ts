/**
 * The shape the viewer draws from. Pure types and small helpers; no React.
 * The studio's loader builds a ViewerDeck from the document (@turboslide/schema
 * Deck and Slide files) by rendering every slide once through renderSlide
 * (SPEC 5.2), so the viewer never sees the block model, only ids, titles,
 * kinds and the HTML string it sets as innerHTML (SPEC 5.3).
 */

import type { FrameBand } from '@turboslide/render/stage';

/** The sheet (SPEC 2.1): 1600 by 900 sheet pixels. */
export const SHEET_W = 1600;
export const SHEET_H = 900;

export type ViewerTheme = 'light' | 'dark';

/** A full-picture slide's twins, for the backdrop the stage paints across the stage area in slide mode (head:249-254). */
export type ViewerPicture = { light: string; dark: string };

export type ViewerSlide = {
  /** the slide id: a slug, never a number (SPEC 4.2) */
  id: string;
  /** 1-based position across the deck's sections (SPEC 4.2: derived, never stored) */
  n: number;
  /** the derived or overriding title (first heading, big or plate title; SPEC 4.2 title) */
  title: string;
  /** the slide kind: content, opener, mood, closing, title, statement */
  kind: string;
  sectionId: string;
  /** renderSlide output for the slide: `<section class="slide" data-slide="...">...</section>` */
  html: string;
  /** present on opener, mood and closing slides */
  picture?: ViewerPicture;
  /** speaker notes (SPEC 4.2) */
  notes?: string;
  /** the lint counts the sidebar badge shows (SPEC 6.2) */
  lint?: { s3: number; s2: number };
  /** the render worker's static capture twins, shown over the live clone once decoded (M3 item 5) */
  shot?: { light: string; dark?: string };
  /** Skip slide (gslides-parity SPEC 7.2.1): the filmstrip and the grid dim the card */
  skip?: boolean;
  /**
   * whether the frame draws this slide's counter under the deck's Slide numbers and the slide's own
   * word (render/deck.ts slideCounter; docs/RETURN.md section 5 slides.numbers.apply); true when absent
   */
  counter?: boolean;
  /** the layout the slide was made from (gslides-parity SPEC 7.2.2), for the Apply layout check */
  template?: string;
};

export type ViewerSection = { id: string; name: string; slideIds: readonly string[] };

export type ViewerDeck = {
  id: string;
  title: string;
  revision: number;
  sections: readonly ViewerSection[];
  /** every slide in section order */
  slides: readonly ViewerSlide[];
  /** the deck id that was actually served when the requested one was missing (the studio's fixture fallback) */
  fallback?: string;
  /** the brand kit's frame band (docs/PRODUCT.md 4.1): the footer logo, the footer text and the counter's format; the GT band when absent */
  band?: FrameBand;
};

/** The deck's title trim for rows and captions (tail.html titleOf): 72 characters, cut at a word. */
export function trimTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  return t.length > 72 ? `${t.slice(0, 69).replace(/\s+\S*$/, '')}...` : t;
}

/** `1` becomes `01`; `52` stays `52` (tail.html pad). */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The slide at a 1-based number, or undefined. */
export function slideAt(deck: ViewerDeck, n: number): ViewerSlide | undefined {
  return deck.slides[n - 1];
}

/** The section a slide belongs to. */
export function sectionOf(deck: ViewerDeck, slideId: string): ViewerSection | undefined {
  return deck.sections.find((section) => section.slideIds.includes(slideId));
}

/** True for the kinds that paint a picture across the stage (SPEC 2.1 plates over full-bleed pictures). */
export function isPictureKind(kind: string): boolean {
  return kind === 'opener' || kind === 'mood' || kind === 'closing';
}
