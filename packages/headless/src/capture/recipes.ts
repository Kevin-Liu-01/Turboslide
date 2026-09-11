// Per-site capture recipes (MILESTONES M5 item 1: "asset.capture with per-site recipes (gt-site:
// theme key, cookie_consent=no, the dark class, reduced motion, settle)"). A recipe is what a
// page needs before it is shot so the twins agree: the init script that seeds the theme before
// the site's own boot script runs, the CSS that stills motion and hides consent banners, and the
// settle that waits for fonts, images and the site's lazy sections. Every function handed to the
// page is self-contained (Playwright serializes it). `plain` is the recipe for any other site:
// color scheme emulation, reduced motion and a settle, nothing site specific.
import type { Page } from 'playwright-core';

export type CaptureTheme = 'light' | 'dark';

export type CaptureRecipe = {
  id: string;
  doc: string;
  /** Runs before any page script in every document of the context, with the theme. */
  init?: (arg: { theme: CaptureTheme }) => void;
  /** Injected after load. */
  css?: string;
  /** A scroll pass down and back up before the settle, so lazy sections mount. */
  scrollPass: boolean;
  /** Milliseconds waited after fonts and images are ready. */
  settleMs: number;
};

/** The wait every recipe ends with: fonts ready, visible images decoded, two frames. */
export async function settlePage(page: Page, settleMs: number, scrollPass: boolean): Promise<void> {
  if (scrollPass) {
    await page.evaluate(async () => {
      const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
      const height = document.documentElement.scrollHeight;
      for (let y = 0; y < height; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      window.scrollTo(0, 0);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.querySelectorAll('img')].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    await Promise.all(
      images.map((img) =>
        Promise.race([
          img.decode().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]),
      ),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))),
    );
  });
  if (settleMs > 0) await page.waitForTimeout(settleMs);
}

/** Motion stilled (animations and transitions end at once) and smooth scrolling off. */
export const STILL_CSS =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}';

export const PLAIN_RECIPE: CaptureRecipe = {
  id: 'plain',
  doc: 'Any site: the color scheme emulated, motion stilled, fonts and images awaited, then a settle.',
  css: STILL_CSS,
  scrollPass: false,
  settleMs: 500,
};

/** The registry; gt-site.ts adds its recipe at import time through registerRecipe. */
const REGISTRY = new Map<string, CaptureRecipe>([[PLAIN_RECIPE.id, PLAIN_RECIPE]]);

export function registerRecipe(recipe: CaptureRecipe): void {
  REGISTRY.set(recipe.id, recipe);
}

export function recipeIds(): string[] {
  return [...REGISTRY.keys()];
}

/** The recipe by id; RangeError names the ids that exist. */
export function recipeFor(id: string): CaptureRecipe {
  const recipe = REGISTRY.get(id);
  if (recipe === undefined)
    throw new RangeError(`unknown capture recipe "${id}"; recipes: ${recipeIds().join(', ')}`);
  return recipe;
}
