/**
 * The strings of the default view (SPEC 12, Google Slides parity round). Every builder reads the
 * shared wording from here so the tests can read it too: the stub formula for a control that is
 * present in Google's position but not built yet, the title row words, the prompts, the
 * snackbars, the dialog and panel names, and the engineering words that never reach the default
 * view (R07 "Naming", SPEC 12 first bullet). Labels are Google's words in sentence case; Title
 * Case appears only where Google's own label is Title Case. Relative imports in this folder carry
 * the `.ts` extension so the parity audit script can load the model under Node.
 */

/** The first sentence of every stub tooltip (SPEC "How to read this specification", Later). */
export const STUB_PREFIX = 'Not available in Turboslide yet';

/**
 * The tooltip sentence of a Later item: the prefix, then one clause saying what would make it
 * available. `reason` is the clause without a trailing period.
 */
export function stubClause(reason: string): string {
  return `${STUB_PREFIX}. ${reason}`;
}

/** The toolbar form of the stub (SPEC 3.1 rows 13 and 17): the label, a middle dot, the sentence. */
export function stubTooltip(label: string, reason: string): string {
  return `${label} · ${stubClause(reason)}`;
}

/** The title row (SPEC 12 "Title row"). */
export const TITLE_ROW = {
  untitled: 'Untitled presentation',
  notSaved: 'Not saved yet',
  saving: 'Saving…',
  saved: 'All changes saved',
  retrying: "Couldn't save, retrying",
  lastEdit: (ago: string) => `Last edit ${ago}`,
  slideshow: 'Slideshow',
  share: 'Share',
} as const;

/** The canvas and notes prompts (SPEC 12 "Prompts", 5.4). */
export const PROMPTS = {
  title: 'Click to add title',
  subtitle: 'Click to add subtitle',
  text: 'Click to add text',
  number: 'Click to add a number',
  caption: 'Add a caption',
  picture: 'Click to add a picture',
  notes: 'Click to add speaker notes',
} as const;

/** The snackbar sentences (SPEC 12 "Snackbars", 11.3). The action word follows a middle dot. */
export const SNACKBARS = {
  slideDeleted: 'Slide deleted',
  slidesDeleted: (count: number) => `Deleted ${count} slides`,
  movedToTrash: 'Moved to trash',
  appliedLayout: (layout: string, count: number, things: string) =>
    `Applied ${layout}. ${count} ${things} did not fit this layout`,
  rowAdded: 'Row added',
  linkCopied: 'Link copied',
  autosaved: 'All changes are saved automatically',
  reapplied: 'Someone else changed this slide. Your change was reapplied',
  skipped: (count: number) => `Skipped ${count} slides`,
  retiredLetter: (letter: string, item: string, menu: string) =>
    `${letter} now ${item} from the ${menu} menu`,
  undo: 'Undo',
  pdfUnavailable: 'PDF is not available on this deployment yet. Use Print and Save as PDF',
  audienceTools: 'Audience tools are not available in Turboslide',
  /* an Insert row on a slide whose layout has no place for blocks (a Title slide, a Statement) */
  needsBody: (what: string) =>
    `${what} needs a layout with a body. Apply Title and body or Blank first`,
  /* Upload from computer while the editor has no file picker to open */
  noFilePicker: 'Open a slide in Editing mode to add a picture',
} as const;

/** The dialog titles and their control words (SPEC 12 "Dialogs"). */
export const DIALOGS = {
  makeCopy: {
    title: 'Make a copy',
    name: 'Name',
    removeNotes: 'Remove speaker notes',
    ok: 'Make a copy',
    cancel: 'Cancel',
  },
  importSlides: {
    title: 'Import slides',
    presentations: 'Presentations',
    upload: 'Upload',
    all: 'All',
    none: 'None',
    back: 'Back',
    ok: 'Import slides',
  },
  download: {
    title: 'Download',
    perfect: 'Perfect',
    editable: 'Editable text',
    includeNotes: 'Include speaker notes',
    includeSkipped: 'Include skipped slides',
    more: 'More options',
    ok: 'Download',
    details: 'Details',
  },
  share: {
    title: (name: string) => `Share ${name}`,
    viewLink: 'View link',
    presentLink: 'Present link',
    editLink: 'Edit link',
    copyLink: 'Copy link',
    anyoneCanEdit: 'Anyone with this link can edit',
    noAccounts: 'Turboslide has no accounts yet. Anyone who has a link can open it',
    stripped: 'Skipped slides and speaker notes are not included in the view and present links',
    done: 'Done',
  },
  publish: {
    title: 'Publish to the web',
    link: 'Link',
    embed: 'Embed',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    custom: 'Custom',
    reachable: 'Every Turboslide presentation is reachable by anyone who has its link',
  },
  deleteForever: {
    title: (name: string) => `Delete ${name} forever? This cannot be undone`,
    ok: 'Delete forever',
    cancel: 'Cancel',
  },
  findReplace: {
    title: 'Find and replace',
    find: 'Find',
    replaceWith: 'Replace with',
    matchCase: 'Match case',
    prev: 'Prev',
    next: 'Next',
    replace: 'Replace',
    replaceAll: 'Replace all',
  },
  slideNumbers: {
    title: 'Slide numbers',
    on: 'On',
    off: 'Off',
    skipTitles: 'Skip title slides',
    apply: 'Apply',
  },
  details: {
    title: 'Details',
    name: 'Title',
    slides: 'Slides',
    sections: 'Sections',
    created: 'Created',
    lastEdit: 'Last edit',
  },
  open: {
    title: 'Open',
    search: 'Search presentations',
    presentations: 'Presentations',
    upload: 'Upload',
    ok: 'Open',
  },
  nameVersion: { title: 'Name current version', name: 'Name', ok: 'Save' },
  agentAccess: {
    title: 'Agent access',
    mcp: 'MCP address',
    api: 'API address',
    push: 'Push',
    pull: 'Pull',
    copy: 'Copy',
    token: 'A token is required and is never shown here',
  },
  help: { title: 'Help' },
  keyboardShortcuts: { title: 'Keyboard shortcuts', search: 'Search shortcuts' },
  imageByUrl: { title: 'Image by URL' },
  fromThisPresentation: { title: 'Pictures in this presentation' },
  /* the Insert pickers (SPEC 2.4): Google's Table grid, and the Icon and Material rows of the theme */
  insertTable: {
    title: 'Table',
    lead: 'Point at the size you want and click it. Up to 20 columns by 20 rows',
    grid: 'Table size',
    size: (columns: number, rows: number) => `${columns} × ${rows}`,
    cell: (columns: number, rows: number) =>
      `${columns} column${columns === 1 ? '' : 's'} by ${rows} row${rows === 1 ? '' : 's'}`,
  },
  insertIcon: {
    title: 'Icon',
    lead: 'One of the theme’s symbols; the tone is set in Format options',
  },
  insertMaterial: {
    title: 'Material',
    lead: 'A shader picture from the theme; its recipe is edited in Pictures and materials',
    empty: 'No materials are available on this deployment',
  },
} as const;

/** The right panel titles and their words (SPEC 12 "Panels"). */
export const PANELS = {
  themes: {
    title: 'Themes',
    gt: 'GT',
    light: 'Light',
    dark: 'Dark',
    inThisPresentation: 'In this presentation',
    importTheme: 'Import theme',
    importStub: 'Turboslide has one theme, GT',
  },
  formatOptions: {
    title: 'Format options',
    sections: [
      'Size & rotation',
      'Position',
      'Layout',
      'Text',
      'Colour',
      'Picture',
      'Table',
      'List',
      'Alt text',
    ],
    empty: 'Select something on the slide to see its options',
  },
  versionHistory: {
    title: 'Version history',
    onlyNamed: 'Only show named versions',
    restore: 'Restore this version',
    name: 'Name this version',
    copy: 'Make a copy',
  },
  suggestions: { title: 'Suggestions for this slide', fix: 'Fix' },
  changeHistory: { title: 'Change history' },
  picturesMaterials: { title: 'Pictures and materials' },
} as const;

/** The filmstrip (SPEC 12 "Filmstrip"). */
export const FILMSTRIP = {
  skipped: 'Skipped: not shown when presenting or in downloads',
  empty: 'Click + to add a slide',
  gtLayouts: 'GT layouts',
} as const;

/** The home page and the trash (SPEC 12 "Home"). */
export const HOME = {
  startNew: 'Start a new presentation',
  blank: 'Blank presentation',
  gtBrand: 'GT brand deck',
  gallery: 'Template gallery',
  recent: 'Recent presentations',
  search: 'Search presentations',
  opened: (ago: string) => `Opened ${ago}`,
  edited: (date: string) => `Edited ${date}`,
  sortOpened: 'Last opened by me',
  sortModified: 'Last modified',
  sortTitle: 'Title',
  listed: 'Every presentation on this Turboslide is listed here',
  trash: 'Trash',
  empty: 'No presentations yet. Start one above',
  trashEmpty: 'Trash is empty',
  restore: 'Restore',
  deleteForever: 'Delete forever',
  emptyTrash: 'Empty trash',
  inTrash: 'This presentation is in the trash · Restore',
} as const;

/** The PowerPoint import refusal (SPEC 12 "Import"). */
export const IMPORT_PPTX =
  'PowerPoint import is not available in Turboslide yet. Import a Turboslide bundle (.zip), or open the file in Google Slides and paste the text';

/** Present mode and Presenter view (SPEC 12 "Present mode"). */
export const PRESENT = {
  counter: (index: number, total: number) => `${index} of ${total}`,
  openNotes: 'Open speaker notes',
  laser: 'Turn on the laser pointer',
  exit: 'Exit',
  pause: 'Pause',
  reset: 'Reset',
  notes: 'Speaker notes',
  noNotes: 'No speaker notes for this slide',
  audienceTools: `Audience tools · ${STUB_PREFIX}`,
} as const;

/** Errors and interruptions (SPEC 11.3). */
export const ERRORS = {
  keepOrTheirs: 'This slide changed while you were editing. Keep mine or Use theirs',
  pictureSize: 'Pictures up to 25 MB',
} as const;

/**
 * The engineering words that never reach the default view (SPEC 12, R07 rule 22). The default
 * view words test greps every label, tooltip and stub clause in the menu model for them, outside
 * Tools > Advanced and Extensions > Agent access. Matched as whole words, case insensitive;
 * `block id` and `JSON pointer` are phrases.
 */
export const FORBIDDEN_DEFAULT_VIEW_WORDS: ReadonlyArray<string> = [
  'lint',
  'source',
  'lease',
  'revision',
  'grammar',
  'freeform',
  'kind',
  'toolchain',
  'agent',
  'block id',
  'JSON pointer',
  'flatten',
  'native',
  'twin',
  'mutation',
  'reducer',
  'palette',
  'MCP',
];

/** The forbidden words a text contains, as written in the list; empty when it is clean. */
export function forbiddenWordsIn(text: string): string[] {
  return FORBIDDEN_DEFAULT_VIEW_WORDS.filter((word) =>
    new RegExp(`(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i').test(
      text,
    ),
  );
}
