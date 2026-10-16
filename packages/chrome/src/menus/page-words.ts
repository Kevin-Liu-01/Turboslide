/**
 * The words of the title row and of the home page (SPEC 12 "Title row" and "Home"), in a module
 * that imports nothing: the route files' page titles read `HOME` and `TITLE_ROW` in the chunk every
 * route loads, and `./strings.ts`, which re-exports both, is about 25 KB of JavaScript with the
 * auth words behind it (hardening HR-PC#2, PERF-9).
 */

/** The title row (SPEC 12 "Title row"; SPEC-3 4.2, 15 add the fifth save phrase and the slots). */
export const TITLE_ROW = {
  untitled: 'Untitled presentation',
  notSaved: 'Not saved yet',
  saving: 'Saving…',
  saved: 'All changes saved',
  retrying: "Couldn't save, retrying",
  /* SPEC-3 15: the fifth save phrase; the five stack in one fixed cell (9.2 E5) */
  offline: 'Offline. Changes will save when you reconnect',
  /* the focus round's blob tier budget (cycle 3 fix round, build/b7.md FR3-R5): the store refused
     the room's poll (a 429, a 5xx) and the poll backs off; the word stands until a poll succeeds.
     The ellipsis as `saving` carries it; the sixth phrase in the same cell, shorter than `offline` */
  reconnecting: 'Reconnecting…',
  lastEdit: (ago: string) => `Last edit ${ago}`,
  /* SPEC-3 4.2: the newest record's author through resolvePrincipal, never the tab's own */
  lastEditBy: (ago: string, name: string) => `Last edit ${ago} by ${name}`,
  showAllComments: 'Show all comments',
  notifications: 'Notifications',
  /* the inbox plate's count: two tabular digits, "99+" beyond (SPEC-3 4.2) */
  unread: (count: number) => (count > 99 ? '99+' : String(count)),
  slideshow: 'Slideshow',
  share: 'Share',
  viewOnly: 'View only',
} as const;

/** The home page and the trash (SPEC 12 "Home"). */
export const HOME = {
  startNew: 'Start a new presentation',
  blank: 'Blank presentation',
  gtBrand: 'GT brand deck',
  gallery: 'Template gallery',
  /* the list's heading and the page title; the button back to the list is `back` */
  recent: 'Recent presentations',
  /* the trash's and the gallery's button back to the list: Title Case, as every button is
     (DECK-GRAMMAR 22; design round pass 2 finding 6, request 7) */
  back: 'Recent Presentations',
  search: 'Search presentations',
  opened: (ago: string) => `Opened ${ago}`,
  edited: (date: string) => `Edited ${date}`,
  sortOpened: 'Last opened by me',
  sortModified: 'Last modified',
  sortTitle: 'Title',
  /* the admin's filter on /decks (docs/NEXT.md 3.2 H2, question 8): the viewer's own and shared
     presentations by default, every presentation on the deployment on request */
  showOwn: 'Yours and shared with you',
  showAll: 'Every presentation',
  trash: 'Trash',
  empty: 'No presentations yet. Start one above',
  trashEmpty: 'Trash is empty',
  restore: 'Restore',
  deleteForever: 'Delete Forever',
  /* the snackbar that names the act when the store refuses it keeps a sentence's case */
  deleteForeverRefused: (reason: string) => `Delete forever: ${reason}`,
  emptyTrash: 'Empty Trash',
  inTrash: 'This presentation is in the trash · Restore',
} as const;
