import { attachTip } from '@turboslide/chrome/tip';
import { readTheme, setDocumentTheme } from '@turboslide/viewer/theme-state';

import { attachAppearance } from './appearance';
import { attachAvatarStack } from './avatar-stack';
import { CHAPTER_FIELDS } from './chapter-fields';
import { attachField } from './field-canvas';
import type { FieldKind } from './field-canvas';
import { attachChapterBox, attachHeroBox } from './frame-boxes';
import { attachSignInSlot } from './sign-in-slot';

/**
 * /home's own script (docs/SITE.md D13; Kevin, 2026-11-05: the landing ships no client router):
 * the server's render of /home links no module of the app and no React (routes/__root.tsx
 * `PAGE_SCRIPTS`), and this one file, bundled on its own through Vite's worker pipeline, attaches
 * every behaviour the page has to the markup the server drew, through the same functions the
 * components call when /home is reached by a client navigation: the fields, the hero's live editor
 * with the title's presses, the chapters' editors, the avatar rows, the bar's theme button and
 * Sign In, the footer's appearance switch and the tooltips the markup names. Then the root takes
 * `data-hydrated`, as HomePage does under React. Its links are document navigations; the
 * Speculation Rules of home.tsx fetch their pages ahead. It imports no module that imports a
 * stylesheet or React (components/site/graph.test.ts), so the bundle stays plain script.
 */
const root = document.querySelector<HTMLElement>('.ts-site');

const kindOf = (canvas: HTMLElement): FieldKind =>
  canvas.dataset.fieldKind === 'word' ? 'word' : 'slide';

if (root !== null) {
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas.site-field')) {
    const field = Object.values(CHAPTER_FIELDS).find(
      (chapter) => chapter.art === canvas.dataset.fieldArt,
    );
    attachField(canvas, field === undefined ? { kind: kindOf(canvas) } : field);
  }
  const box = root.querySelector<HTMLElement>('[data-hero-box]');
  const hero = box === null ? null : attachHeroBox(box);
  for (const stack of root.querySelectorAll<HTMLElement>('.site-stack'))
    attachAvatarStack(stack, hero?.press);
  for (const chapter of root.querySelectorAll<HTMLElement>('.site-chapter-box'))
    attachChapterBox(chapter);
  for (const button of root.querySelectorAll<HTMLElement>('[data-control="view.theme"]'))
    button.addEventListener('click', () =>
      setDocumentTheme(readTheme() === 'dark' ? 'light' : 'dark'),
    );
  const slot = root.querySelector<HTMLElement>('.site-bar-signin');
  if (slot !== null) attachSignInSlot(slot);
  const appearance = root.querySelector<HTMLElement>('.site-appear');
  if (appearance !== null) attachAppearance(appearance);
  for (const anchor of root.querySelectorAll<HTMLElement>('[data-tip]'))
    attachTip(anchor, anchor.dataset.tip ?? '');
  root.setAttribute('data-hydrated', '');
}
