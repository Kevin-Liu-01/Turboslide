import { useEffect } from 'react';

import type { Theme } from './theme';

/**
 * The slides a stage will most likely show next have their pictures fetched and decoded before
 * the move (the slide motion round). A picture used to be requested when its slide went up and
 * decoded on the frame that first drew it, so the arriving slide's first frame waited for both:
 * on /deck/gt-brand at 1440 by 900 a move onto a slide with a large picture held the screen for
 * up to 440 ms while the GPU process decoded and uploaded it, and the transition started after.
 * `HTMLImageElement.decode()` on a detached image of the same address puts the decode in the
 * browser's image cache, which the stage's own image of that address draws from.
 */

/**
 * The slides of `list` beside `activeId`, the way the last move went first: the next and the
 * previous one for a move forward, the previous and the next for a move back.
 */
export function slidesAhead<T extends { id: string }>(
  list: readonly T[],
  activeId: string,
  dir: 'next' | 'prev',
): T[] {
  const at = list.findIndex((slide) => slide.id === activeId);
  if (at < 0) return [];
  const next = list[at + 1];
  const previous = list[at - 1];
  const order = dir === 'next' ? [next, previous] : [previous, next];
  return order.filter((slide): slide is T => slide !== undefined);
}

/** Pictures decoded ahead, kept referenced so their decode stays cached; the oldest go first. */
const KEEP = 24;
const kept = new Map<string, HTMLImageElement>();

const IMG = /<img\b[^>]*>/gi;
const URL_IN_STYLE = /url\(\s*(?:&quot;|["'])?([^"')&]+)(?:&quot;|["'])?\s*\)/gi;

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag);
  return match?.[1] === undefined ? undefined : unescape(match[1]);
}

function unescape(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * The addresses of the pictures a slide's markup draws in a theme: each image's twin for the
 * theme (the renderer writes the twin that differs from `src` as `data-light` or `data-dark`;
 * theme.ts `applyThemeToTree` swaps it in), and every `url()` of a style that is not inline data.
 * Pure over the markup, so a slide never shown costs no DOM.
 */
export function slidePictures(html: string, theme: Theme): string[] {
  const out = new Set<string>();
  for (const [tag] of html.matchAll(IMG)) {
    const src = attribute(tag, 'src');
    const twin = attribute(tag, theme === 'dark' ? 'data-dark' : 'data-light');
    const want = twin !== undefined && twin !== '' ? twin : src;
    if (want !== undefined && want !== '' && !want.startsWith('data:')) out.add(want);
  }
  for (const [, url] of html.matchAll(URL_IN_STYLE)) {
    if (url !== undefined && url !== '' && !url.startsWith('data:') && !url.startsWith('#'))
      out.add(unescape(url.trim()));
  }
  return [...out];
}

/** Fetches and decodes each address once and keeps the last few decoded; errors are ignored. */
export function decodeAhead(urls: readonly string[]): void {
  if (typeof Image === 'undefined') return;
  for (const url of urls) {
    const known = kept.get(url);
    if (known !== undefined) {
      /* recently wanted: it moves to the young end */
      kept.delete(url);
      kept.set(url, known);
      continue;
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    kept.set(url, img);
    void img.decode().catch(() => undefined);
    while (kept.size > KEEP) {
      const oldest = kept.keys().next().value;
      if (oldest === undefined) break;
      kept.delete(oldest);
    }
  }
}

/** For the tests: the addresses held decoded, oldest first. */
export function keptPictures(): string[] {
  return [...kept.keys()];
}

/**
 * Runs `work` once the page is idle (or after `fallbackMs` where the browser has no idle
 * callback); returns the cancel. Preparing the next slide waits for the current move's frames.
 */
export function whenIdle(work: () => void, fallbackMs = 200): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: 1000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, fallbackMs);
  return () => window.clearTimeout(id);
}

/** How long after a move a surface waits before it prepares the next one: past the move's frames. */
export const AHEAD_AFTER_MS = 400;

/** A slide to prepare: its markup, and the stage-wide picture a full-picture slide shows. */
export type AheadSlide = { id: string; html: string; backdrop?: string | undefined };

/**
 * Decodes the pictures of `slides` once the surface has settled after its last change: 400 ms
 * after it, at idle. A held key changes the slides again before the wait ends, so a run of moves
 * prepares nothing it passes. Stage passes the slides beside the one shown; the presenter console
 * passes the next slide, whose full size pictures its current frame draws after the next move.
 */
export function usePicturesAhead(
  slides: readonly AheadSlide[],
  theme: Theme,
  enabled = true,
): void {
  const key = slides
    .map((slide) => `${slide.id}:${slide.html.length}:${slide.backdrop ?? ''}`)
    .join(' ');
  useEffect(() => {
    if (!enabled || slides.length === 0) return undefined;
    let cancelIdle: () => void = () => undefined;
    const wait = window.setTimeout(() => {
      cancelIdle = whenIdle(() => {
        for (const slide of slides)
          decodeAhead([
            ...(slide.backdrop === undefined ? [] : [slide.backdrop]),
            ...slidePictures(slide.html, theme),
          ]);
      });
    }, AHEAD_AFTER_MS);
    return () => {
      window.clearTimeout(wait);
      cancelIdle();
    };
    // the slides by id and markup: the array is new on every render of the caller
  }, [key, theme, enabled]);
}
