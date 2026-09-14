// The collaborator layer's constants against the studio's CSS hooks (gslides-parity SPEC-3 4.4,
// 9.3; research-3 11 sections 6 and 8): every class name has a rule in apps/studio/src/styles.css
// (the page level sheet the chrome's overlay and title row live under; the theme's sheet.css and
// stage.css are scoped to `.ts-sheet` and never carry chrome rules) with the fixed box the audit
// measures, the tokens are declared, and the numbers agree.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  COLLAB_CLASSES,
  COLLAB_GEOMETRY,
  COLLAB_TOKENS,
  DITHER_DOM,
  FRAME_DOM,
} from '../collab.ts';
import { BLOCK_CSS } from '../block-css.ts';

const REPO = resolve(import.meta.dirname, '../../../..');

function studioCss(): string {
  return readFileSync(join(REPO, 'apps/studio/src/styles.css'), 'utf8');
}

/** The declarations of the first rule whose selector list contains the selector, as a map. */
function declarations(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no rule for ${selector}`);
  const out: Record<string, string> = {};
  for (const declaration of (match[1] ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    out[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
  }
  return out;
}

describe('the collaborator layer', () => {
  const css = studioCss();

  it('declares a rule for every class name', () => {
    for (const name of Object.values(COLLAB_CLASSES)) expect(css).toContain(`.${name} {`);
  });

  it('declares the tokens with the geometry', () => {
    const root = declarations(css, ':root');
    expect(root[COLLAB_TOKENS.haloInner]).toBe(COLLAB_GEOMETRY.halo.inner);
    expect(root[COLLAB_TOKENS.haloOuter]).toBe(COLLAB_GEOMETRY.halo.outer);
    expect(root[COLLAB_TOKENS.flagWidth]).toBe(`${COLLAB_GEOMETRY.flag.width}px`);
    expect(root[COLLAB_TOKENS.flagHeight]).toBe(`${COLLAB_GEOMETRY.flag.height}px`);
    expect(root[COLLAB_TOKENS.followingWidth]).toBe(`${COLLAB_GEOMETRY.following.width}px`);
    expect(root[COLLAB_TOKENS.followingHeight]).toBe(`${COLLAB_GEOMETRY.following.height}px`);
    expect(root[COLLAB_TOKENS.markerSize]).toBe(`${COLLAB_GEOMETRY.commentMarker.size}px`);
    expect(root[COLLAB_TOKENS.countMinWidth]).toBe(`${COLLAB_GEOMETRY.commentCount.minWidth}px`);
    expect(root[COLLAB_TOKENS.presenceTracks]).toBe(
      COLLAB_GEOMETRY.presence.tracks.map((track) => `${track}px`).join(' '),
    );
    expect(root[COLLAB_TOKENS.pointerMotion]).toBe(`${COLLAB_GEOMETRY.pointer.motionMs}ms`);
  });

  it('reserves the presence slot at 184 px, the sum of its tracks', () => {
    const sum = COLLAB_GEOMETRY.presence.tracks.reduce((a, b) => a + b, 0);
    expect(sum).toBe(COLLAB_GEOMETRY.presence.width);
    const slot = declarations(css, `.${COLLAB_CLASSES.presence}`);
    expect(slot.width).toBe(`var(--pt-presence-w, ${COLLAB_GEOMETRY.presence.width}px)`);
    expect(slot.height).toBe(`${COLLAB_GEOMETRY.presence.height}px`);
  });

  it('fixes the flag, the pointer, the plate and the marker boxes and keeps them out of flow', () => {
    const flag = declarations(css, `.${COLLAB_CLASSES.flag}`);
    expect(flag.position).toBe('absolute');
    expect(flag.width).toBe(`var(${COLLAB_TOKENS.flagWidth})`);
    expect(flag['text-overflow']).toBe('ellipsis');
    const pointer = declarations(css, `.${COLLAB_CLASSES.remotePointer}`);
    expect(pointer.position).toBe('absolute');
    expect(pointer.width).toBe(`${COLLAB_GEOMETRY.pointer.width}px`);
    expect(pointer.height).toBe(`${COLLAB_GEOMETRY.pointer.height}px`);
    expect(pointer.transition).toBe(`transform var(${COLLAB_TOKENS.pointerMotion}) linear`);
    const following = declarations(css, `.${COLLAB_CLASSES.following}`);
    expect(following.position).toBe('absolute');
    expect(following.top).toBe(`${COLLAB_GEOMETRY.following.top}px`);
    const marker = declarations(css, `.${COLLAB_CLASSES.commentMarker}`);
    expect(marker.position).toBe('absolute');
    const count = declarations(css, `.${COLLAB_CLASSES.commentCount}`);
    expect(count['min-width']).toBe(`var(${COLLAB_TOKENS.countMinWidth})`);
    expect(count['font-variant-numeric']).toBe('tabular-nums');
    expect(declarations(css, `.${COLLAB_CLASSES.remoteOutline}`).position).toBe('absolute');
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.ts-remote-pointer\s*\{\s*transition: none;/,
    );
  });

  it('draws the pointer polygon inside its box', () => {
    const points = COLLAB_GEOMETRY.pointer.points
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(COLLAB_GEOMETRY.pointer.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(COLLAB_GEOMETRY.pointer.height);
    }
    expect(points[0]).toEqual([0, 0]);
  });

  it('names the dither and frame DOM the block CSS styles', () => {
    expect(BLOCK_CSS).toContain(`.ts-sheet .${DITHER_DOM.root} > canvas.${DITHER_DOM.canvas}`);
    expect(BLOCK_CSS).toContain(`canvas.${DITHER_DOM.canvas}[hidden] { display: none; }`);
    expect(BLOCK_CSS).toContain(`.ts-sheet .${FRAME_DOM.host} > iframe.${FRAME_DOM.frame}`);
    expect(BLOCK_CSS).toContain('image-rendering: pixelated');
  });
});
