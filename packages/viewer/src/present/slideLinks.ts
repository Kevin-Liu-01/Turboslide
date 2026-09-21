// A click on a slide link in the show (docs/PRODUCT.md section 2 rank 19; gslides-parity SPEC
// 7.2.8): a run or block link whose address is `#s/<id>`, `#next`, `#previous`, `#first` or
// `#last` moves the show to that slide instead of leaving the page or advancing. The `#s/<id>`
// form already reaches the shell through the hash (chrome/ViewerShell.tsx onHash); the four
// positions name no slide until they are read against the play list and the current slide, which
// this module does. Pure resolver plus a listener the show mounts on its root.
import { slideLinkTarget } from '@turboslide/schema/text';

/** The slide a slide link names among the play list, from the current index; null for a URL or an unknown slide. */
export function slideLinkDestination(
  href: string,
  play: ReadonlyArray<{ id: string }>,
  index: number,
): string | null {
  const target = slideLinkTarget(href);
  if (target === null) return null;
  const ids = play.map((slide) => slide.id);
  switch (target.slide) {
    case 'next':
      return ids[Math.min(ids.length - 1, index + 1)] ?? null;
    case 'previous':
      return ids[Math.max(0, index - 1)] ?? null;
    case 'first':
      return ids[0] ?? null;
    case 'last':
      return ids[ids.length - 1] ?? null;
    default:
      return ids.includes(target.slide) ? target.slide : null;
  }
}

/** The anchor a click landed on inside `root`, or null. */
export function anchorOfClick(target: EventTarget | null, root: Element): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (anchor === null || !root.contains(anchor) || !(anchor instanceof HTMLAnchorElement))
    return null;
  return anchor;
}

/**
 * Mounts the click listener on the show's root: a slide link moves the show through `goto` and
 * never reaches the browser or the sheet's paging click; every other click is left alone. Answers
 * the remover. `read` answers the play list and the current index at the click.
 */
export function mountSlideLinkClicks(
  root: HTMLElement,
  read: () => { play: ReadonlyArray<{ id: string }>; index: number },
  goto: (slideId: string) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    const anchor = anchorOfClick(event.target, root);
    if (anchor === null) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('#')) return;
    const { play, index } = read();
    const destination = slideLinkDestination(href, play, index);
    event.preventDefault();
    event.stopPropagation();
    if (destination !== null) goto(destination);
  };
  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
