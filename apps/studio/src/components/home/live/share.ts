import { PEOPLE } from '../copy';
import { PEOPLE_ROUND } from '../design-copy';
import type { LiveContext } from './index';
import type { SlideKey } from './state';

/**
 * The two people band's Share dialog (docs/DESIGN.md 8.9; row home.people.share-dialog), drawn by
 * the band's chunk into the box the document reserves (`[data-share]`, HomePeople.tsx), in the
 * editor's own words (`PEOPLE_ROUND.share`, pinned to the editor's strings by copy.test.ts): the
 * title with the deck's name, General access with Anyone with the link and its sentence, the link
 * of this page with Copy Link, the people with their roles (You the owner, Maya and Sam editors,
 * each with the slide their screen shows), and Done. Copy Link writes the link to the clipboard and
 * reads "Link copied" for a moment; Done says that it closes the dialog in the editor, as a menu row
 * the page does not run says what it does.
 */

type Who = 'maya' | 'sam';

export type ShareDialog = {
  /** the slide a person's screen shows, by its key in the deck */
  slide(who: Who, key: SlideKey): void;
};

const W = PEOPLE_ROUND.share;
/** How long Copy Link reads "Link copied". */
const COPIED_MS = 1600;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  node.append(...children);
  return node;
}

const glyph = (name: string): HTMLElement => {
  const icon = el('i', 'ts-icon');
  icon.dataset['icon'] = name;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
};

export function startShare(ctx: LiveContext, title: string): ShareDialog | null {
  const box = ctx.band.querySelector<HTMLElement>('[data-share]');
  if (box === null) return null;
  const link = `${location.origin}${location.pathname}`;

  const field = el('input', 'ts-field ts-share-field');
  field.readOnly = true;
  field.value = link;
  field.setAttribute('aria-label', W.linkLabel);
  const copyWords = el('span', '', W.copyLink);
  const copy = el('button', 'pt-ib ts-button ts-share-copy', glyph('link'), copyWords);
  copy.type = 'button';
  let copied = 0;
  copy.addEventListener('click', () => {
    const done = (): void => {
      copyWords.textContent = W.linkCopied;
      ctx.announce(W.linkCopied);
      window.clearTimeout(copied);
      copied = window.setTimeout(() => (copyWords.textContent = W.copyLink), COPIED_MS);
    };
    // the clipboard may be missing or refuse (no permission, an insecure origin): the field is
    // selected instead, for the person's own copy
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) return field.select();
    void clipboard.writeText(link).then(done, () => field.select());
  });

  const slideLine: Record<Who, HTMLElement> = {
    maya: el('span', 'ts-share-sub'),
    sam: el('span', 'ts-share-sub'),
  };
  const person = (chip: HTMLElement, name: string, role: string, sub?: HTMLElement): HTMLElement =>
    el(
      'li',
      'ts-share-person',
      chip,
      el('span', 'ts-share-who', el('span', 'ts-share-name', name), ...(sub ? [sub] : [])),
      el('span', 'ts-share-role', role),
    );
  const you = el('span', 'ts-share-chip is-you', glyph('user-circle'));
  const people = el(
    'ul',
    'ts-share-people',
    person(you, W.you, W.roles.owner),
    ...(['maya', 'sam'] as const).map((who) => {
      const item = person(
        el('span', 'ts-share-chip', PEOPLE.flags[who].slice(0, 1)),
        PEOPLE.flags[who],
        W.roles.editor,
        slideLine[who],
      );
      item.dataset['sharePerson'] = who;
      return item;
    }),
  );

  const note = el('p', 'ts-share-note');
  note.setAttribute('aria-live', 'polite');
  const doneButton = el('button', 'pt-ib is-solid ts-button ts-share-done', W.done);
  doneButton.type = 'button';
  doneButton.addEventListener('click', () => {
    note.textContent = W.doneSays;
  });

  const heading = el('p', 'ts-share-title', W.title(title));
  heading.id = 'ts-people-share-title';
  box.replaceChildren(
    heading,
    el('p', 'ts-share-label', W.generalAccess),
    el(
      'div',
      'ts-share-access',
      el('span', 'ts-share-chip is-access', glyph('link')),
      el(
        'span',
        'ts-share-who',
        el('span', 'ts-share-name', W.anyoneWithLink),
        el('span', 'ts-share-sub', W.anyoneCanEdit),
      ),
      el('span', 'ts-share-role', W.roles.editor),
    ),
    el('div', 'ts-share-address', field, copy),
    people,
    el('div', 'ts-share-foot', note, doneButton),
  );
  box.setAttribute('aria-labelledby', heading.id);

  const order = (): readonly SlideKey[] => ctx.store.get().order;
  const api: ShareDialog = {
    slide(who, key) {
      const n = order().indexOf(key) + 1;
      const words = n > 0 ? W.editing(n) : '';
      if (slideLine[who].textContent !== words) slideLine[who].textContent = words;
    },
  };
  api.slide('maya', 'plan' as SlideKey);
  api.slide('sam', 'plan' as SlideKey);
  return api;
}
