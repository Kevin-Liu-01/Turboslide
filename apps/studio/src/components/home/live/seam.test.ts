// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { LiveContext } from './index';
import { startSeam } from './seam';

/*
 * Download the PDF names the shown appearance's file from the export band's start and after every
 * change of the appearance (verify-landing.md finding 4: in the dark appearance the link carried
 * the light file until a click rewrote it, so a copied link or a new tab took the light PDF).
 */

const dark = { matches: false };
const changes: (() => void)[] = [];

vi.hoisted(() => {
  // jsdom has no matchMedia; the motion module reads it when it loads
  const query = (media: string): MediaQueryList =>
    ({
      media,
      get matches() {
        return media.includes('prefers-color-scheme: dark') ? dark.matches : false;
      },
      onchange: null,
      addEventListener: (_type: string, fn: () => void) => {
        if (media.includes('prefers-color-scheme')) changes.push(fn);
      },
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { value: query, configurable: true });
});

const LIGHT = '/home/pdf-light-1.pdf';
const DARK = '/home/pdf-dark-2.pdf';

function band(): { ctx: LiveContext; link: HTMLAnchorElement } {
  document.body.innerHTML = `<section data-band="export"><div data-seam-root style="--seam-cut: 50%"><div><button data-seam role="slider"></button></div></div><a data-pdf download href="${LIGHT}" data-href-light="${LIGHT}" data-href-dark="${DARK}">Download the PDF</a></section>`;
  const section = document.querySelector<HTMLElement>('[data-band="export"]');
  const link = document.querySelector<HTMLAnchorElement>('a[data-pdf]');
  if (section === null || link === null) throw new Error('no band');
  const ctx = {
    root: document.body,
    band: section,
    reserve: null,
    announce: () => undefined,
  } as unknown as LiveContext;
  return { ctx, link };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('Download the PDF', () => {
  it('names the dark file from the start in the dark appearance', () => {
    document.documentElement.dataset['theme'] = 'dark';
    const { ctx, link } = band();
    startSeam(ctx);
    expect(link.getAttribute('href')).toBe(DARK);
  });

  it('follows the nav: Light then Dark', async () => {
    document.documentElement.dataset['theme'] = 'dark';
    const { ctx, link } = band();
    startSeam(ctx);
    document.documentElement.dataset['theme'] = 'light';
    await settle();
    expect(link.getAttribute('href')).toBe(LIGHT);
    document.documentElement.dataset['theme'] = 'dark';
    await settle();
    expect(link.getAttribute('href')).toBe(DARK);
  });

  it('follows the system appearance while no choice is drawn', () => {
    delete document.documentElement.dataset['theme'];
    dark.matches = false;
    const { ctx, link } = band();
    startSeam(ctx);
    expect(link.getAttribute('href')).toBe(LIGHT);
    dark.matches = true;
    for (const fn of changes) fn();
    expect(link.getAttribute('href')).toBe(DARK);
  });
});
