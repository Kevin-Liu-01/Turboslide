import { HOME_SPRITE } from '../sprite.generated';

/**
 * A glyph below the first screen (docs/DESIGN.md 8.0 "Icons"; DR-D4#4): an `<svg>` holding one
 * `<use>` of the landing's sprite (`sprite.generated.ts`, the editor's icons.tsx symbols) by the
 * symbol's id (`HOME_GLYPHS` for the glyphs a band names, `g<index>` for a menu row's), drawn in
 * the text's colour, which a screen reader passes over. The sprite is requested with the first
 * band chunk that draws one.
 */
export function glyph(id: string, className = 'ts-glyph'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `${HOME_SPRITE}#${id}`);
  svg.append(use);
  return svg;
}
