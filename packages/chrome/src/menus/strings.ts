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
  /* the Insert pickers (SPEC 2.4): the Icon and Material rows of the theme; Insert > Table is the
     hover grid inside the menu (PICKERS.tableGrid, SPEC-2 0.26) */
  insertIcon: {
    title: 'Icon',
    lead: 'One of the theme’s symbols; the tone is set in Format options',
  },
  insertMaterial: {
    title: 'Material',
    lead: 'A shader picture from the theme; its recipe is edited in Pictures and materials',
    empty: 'No materials are available on this deployment',
  },
  /* round two (SPEC-2 section 10): the dialogs of Custom spacing, Background and Special characters */
  customSpacing: {
    title: 'Custom spacing',
    lineSpacing: 'Line spacing',
    paragraphSpacing: 'Paragraph spacing',
    before: 'Before (px)',
    after: 'After (px)',
    apply: 'Apply',
    cancel: 'Cancel',
  },
  background: {
    title: 'Background',
    color: 'Color',
    image: 'Image',
    choose: 'Choose',
    resetToTheme: 'Reset to theme',
    addToTheme: 'Add to theme',
    done: 'Done',
  },
  specialCharacters: {
    title: 'Insert special characters',
    search: 'Search by name',
    recent: 'Recent',
    categories: ['Arrows', 'Punctuation', 'Currency', 'Math', 'Symbols', 'Emoji'],
    inserted: (name: string) => `Inserted ${name}`,
    empty: 'No character matches that name',
  },
} as const;

/** The in-menu pickers (SPEC-2 4.1, 6): the Insert > Table hover grid and the preset grids. */
export const PICKERS = {
  tableGrid: {
    grid: 'Table size',
    doc: 'Point at the size and click it; the arrow keys move the highlight',
    /* Google's caption: "4 x 3" with a plain x */
    size: (columns: number, rows: number) => `${columns} x ${rows}`,
    cell: (columns: number, rows: number) =>
      `${columns} column${columns === 1 ? '' : 's'} by ${rows} row${rows === 1 ? '' : 's'}`,
  },
  bullets: {
    title: 'Bulleted list',
    grid: 'Bullet styles',
    doc: 'Nine bullet styles; the arrows move, Enter picks',
  },
  numbering: {
    title: 'Numbered list',
    grid: 'Numbering styles',
    doc: 'Six numbering styles; the arrows move, Enter picks',
  },
  shapes: {
    grid: 'Shapes',
    doc: 'The arrows move, Enter picks; Esc closes',
    categories: ['Shapes', 'Arrows', 'Callouts', 'Equation'],
  },
  lineEnds: { grid: 'Line decorations', doc: 'None, an arrow, a circle, a square or a diamond' },
  dashes: { list: 'Dashes', doc: 'Solid, dot, dash, dash dot, long dash or long dash dot' },
  colors: { plate: 'Colors', none: 'None', custom: 'Custom', hex: 'Six hex digits; Enter applies' },
  weights: { list: 'Weights', none: 'None', px: (weight: number) => `${weight} px` },
} as const;

/** The canvas chips, readouts and bars of round two (SPEC-2 section 10, 0.86). */
export const CANVAS = {
  crop: 'Drag the handles to crop. Press Enter to finish',
  wordArt: 'Type your text and press Enter',
  group: 'Group',
  /* the multi selection chip: "3 objects" */
  objects: (count: number) => `${count} objects`,
  /* the rotation chip: "37°" */
  rotation: (degrees: number) => `${degrees}°`,
  /* the size chip while a handle is down, in sheet pixels: "480 × 64" */
  size: (width: number, height: number) => `${width} × ${height}`,
} as const;

/**
 * The rulers and the guides (SPEC-2 0.77, 0.82, 6.1 rows 29 and 30): the View menu's labels and
 * the readout while a guide drags, in inches (120 px per inch on the 1600 by 900 sheet).
 */
export const GUIDES = {
  showRuler: 'Show ruler',
  hideRuler: 'Hide ruler',
  showGuides: 'Show guides',
  addVertical: 'Add vertical guide',
  addHorizontal: 'Add horizontal guide',
  clear: 'Clear guides',
  deleteGuide: 'Delete guide',
  /* "6.67 in": the guide's position while it drags */
  inches: (px: number) => `${(px / 120).toFixed(2)} in`,
} as const;

/**
 * The sentences Check slides prints for the canvas rules (SPEC-2 0.76, 0.96): the one note on a
 * slide arranged by hand and the two off-sheet findings. The rules live in the lint package; the
 * default view words test holds the sentences here.
 */
export const CHECKS = {
  arrangedByHand: 'This slide is arranged by hand; Apply layout re-flows it',
  offSheet:
    'This object is outside the slide and will not show. Move it onto the slide or delete it',
  pastEdge: "Part of this object is past the slide's edge and will not show",
} as const;

/** Format options words of round two (SPEC-2 section 5, 10). */
export const FORMAT = {
  autofit: {
    title: 'Autofit',
    none: 'Do not autofit',
    shrink: 'Shrink text on overflow',
    grow: 'Resize shape to fit text',
    growNote: 'Available on a text box placed on the slide',
  },
  size: {
    width: 'Width',
    height: 'Height',
    lockAspect: 'Lock aspect ratio',
    rotate: 'Rotate',
    flipH: 'Flip horizontally',
    flipV: 'Flip vertically',
    /* a grammar slide's block before its first edit: the stage's box is not on hand */
    unplaced: 'Move or resize the object once to see its size here',
  },
  position: { from: 'From', topLeft: 'Top-left', center: 'Center', x: 'X', y: 'Y' },
  fitting: {
    indentation: 'Indentation',
    left: 'Left',
    padding: 'Padding',
    top: 'Top',
    bottom: 'Bottom',
    right: 'Right',
    valign: 'Vertical alignment',
    middle: 'Middle',
    paddingNote:
      'Padding and vertical alignment apply to a box, shape or text box placed on the slide',
  },
  text: {
    lineSpacing: 'Line spacing',
    single: 'Single',
    double: 'Double',
    custom: 'Custom',
    spaceBefore: 'Space before',
    spaceAfter: 'Space after',
    columns: 'Columns',
    textColor: 'Text color',
    highlightColor: 'Highlight color',
  },
  colour: {
    outlineColor: 'Outline color',
    outlineWeight: 'Outline weight',
  },
  picture: {
    replace: 'Replace image',
    crop: 'Crop image',
    mask: 'Mask',
    none: 'None',
    reset: 'Reset image',
    frame: 'Frame',
    weight: 'Weight',
    color: 'Color',
    dash: 'Dash',
    anchor: 'Crop anchor',
    top: 'Top',
    centre: 'Centre',
  },
  adjustments: {
    transparency: 'Transparency',
    brightness: 'Brightness',
    contrast: 'Contrast',
    reset: 'Reset',
  },
  shadow: {
    enable: 'Drop shadow',
    color: 'Color',
    transparency: 'Transparency',
    angle: 'Angle',
    distance: 'Distance',
    blur: 'Blur radius',
  },
  line: {
    kind: 'Line type',
    start: 'Line start',
    end: 'Line end',
    weight: 'Weight',
    dash: 'Dash',
    bend: 'Bend',
    points: 'Points',
    pointsNote: 'Points are edited by drawing the line again',
    attached: (end: string, target: string) => `${end} is attached to ${target}`,
  },
  shape: { shape: 'Shape', adjust: 'Adjust' },
  list: {
    marker: 'Marker',
    bulleted: 'Bulleted',
    numbered: 'Numbered',
    preset: 'Preset',
    level: 'Level',
  },
  alt: { description: 'Description', doc: 'The description a screen reader reads for this object' },
  chartSlot: 'The chart data grid opens here once it is wired',
  detach: 'Detach',
  ruled: 'Ruled',
  changeShape: 'Change shape',
} as const;

/** The word art bar over the canvas (SPEC-2 0.14, 6.2). */
export const WORD_ART = {
  label: 'Word art',
  placeholder: 'Type your text and press Enter',
  insert: 'Insert',
  cancel: 'Cancel',
} as const;

/** What the shell says when the stage has not wired a canvas gesture yet (a snackbar, never a crash). */
export const CANVAS_NOTICES = {
  noEditor: (what: string) => `${what} works on the slide once it is focused`,
  noGuide: 'Right-click a guide to delete it',
  noCaret: 'Click inside a text box first',
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
  /* round two (SPEC-2 section 5, 10): the Diagram panel and the Chart data section */
  diagram: {
    title: 'Diagram',
    types: ['Grid', 'Hierarchy', 'Timeline', 'Process', 'Relationship', 'Cycle'],
    insert: 'Insert',
  },
  chart: {
    title: 'Chart data',
    type: 'Chart type',
    legend: 'Legend',
    numberFormat: 'Number format',
    showValues: 'Show values',
    addSeries: 'Add series',
    addCategory: 'Add category',
    remove: 'Remove',
    series: (n: number) => `Series ${n}`,
    category: (n: number) => `Category ${n}`,
  },
} as const;

/** The Download dialog's progress sentences of the batched export (SPEC-2 0.31, 8.1). */
export const DOWNLOAD_PROGRESS = {
  preparing: (slide: number, total: number, left: string) =>
    `Preparing slide ${slide} of ${total}, about ${left} left`,
  merging: 'Merging your file',
  ready: 'Your file is ready',
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
 * The engineering words that never reach the default view (SPEC 12, R07 rule 22; SPEC-2 section
 * 10 adds the words of the canvas work, the marks and the process words `round`, `convert`,
 * `conversion` and `measure`). The default view words test greps every label, tooltip and stub
 * clause in the menu model for them, outside Tools > Advanced and Extensions > Agent access.
 * Matched as whole words, case insensitive; `block id`, `JSON pointer`, `mark span` and
 * `preset id` are phrases. The nouns "canvas", "object", "guide" and "ruler" are Google's words
 * and allowed.
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
  /* round two (SPEC-2 section 10) */
  'layer',
  'overlay',
  'trim',
  'span',
  'avLst',
  'prstGeom',
  'custGeom',
  'snapshot',
  'batch',
  'mark span',
  'run',
  'glyph',
  'preset id',
  'numCol',
  'round',
  /* the canvas (SPEC-2 section 10): the first write's change of layout is never named to a person */
  'convert',
  'conversion',
  'measure',
];

/** The forbidden words a text contains, as written in the list; empty when it is clean. */
export function forbiddenWordsIn(text: string): string[] {
  return FORBIDDEN_DEFAULT_VIEW_WORDS.filter((word) =>
    new RegExp(`(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i').test(
      text,
    ),
  );
}
