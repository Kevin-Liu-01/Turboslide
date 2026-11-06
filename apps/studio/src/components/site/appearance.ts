import {
  isTheme,
  readTheme,
  setDocumentTheme,
  subscribeTheme,
} from '@turboslide/viewer/theme-state';

/**
 * The footer's appearance switch (SiteFooter.tsx draws it): Light and Dark, each a button with its
 * `data-value`. The pressed one is drawn from `html[data-theme]` (site.css), so the first paint is
 * right before any script runs; `aria-pressed` follows the same attribute from here on, and a press
 * sets the document's theme the way the bar's theme button and the D key do. A site page draws no
 * twin and no dither of its own, so the press goes through `setDocumentTheme`. The component calls
 * this on mount; on /home's static load the page's script does (home-entry.ts).
 */
export function attachAppearance(group: HTMLElement): () => void {
  const options = [...group.querySelectorAll<HTMLButtonElement>('[data-value]')];
  const sync = (): void => {
    const theme = readTheme();
    for (const option of options)
      option.setAttribute('aria-pressed', String(option.dataset.value === theme));
  };
  const onClick = (event: MouseEvent): void => {
    const option = event.target instanceof Element ? event.target.closest('[data-value]') : null;
    const value = option instanceof HTMLElement ? option.dataset.value : undefined;
    if (isTheme(value)) setDocumentTheme(value);
  };
  sync();
  const stop = subscribeTheme(sync);
  group.addEventListener('click', onClick);
  return () => {
    stop();
    group.removeEventListener('click', onClick);
  };
}
