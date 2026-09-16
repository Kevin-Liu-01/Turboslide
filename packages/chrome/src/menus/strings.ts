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

/** The title row (SPEC 12 "Title row"; SPEC-3 4.2, 15 add the fifth save phrase and the slots). */
export const TITLE_ROW = {
  untitled: 'Untitled presentation',
  notSaved: 'Not saved yet',
  saving: 'Saving…',
  saved: 'All changes saved',
  retrying: "Couldn't save, retrying",
  /* SPEC-3 15: the fifth save phrase; the five stack in one fixed cell (9.2 E5) */
  offline: 'Offline. Changes will save when you reconnect',
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

/**
 * The refusals of round three (SPEC-3 6.8, 0.47), verbatim, and the two words of the persisted
 * queue notice. The e2e fixtures of share.spec.ts, comments.spec.ts and accounts.spec.ts read them
 * from here. No sentence names a role the person lacks, an internal noun, or whether another deck
 * or account exists.
 */
export const REFUSALS = {
  nameTaken: 'That name is already in use in this presentation',
  nameReserved: 'That name is reserved',
  /* the shape rule of 0.19 (identity's NAME_REFUSALS.invalid; build-3/b3.md request 5) */
  nameInvalid: 'Use 1 to 40 letters or digits in one script',
  viewOnly: 'You can view this presentation',
  requestEditAccess: 'Request edit access',
  notAvailable: 'This presentation is not available to you, or does not exist.',
  requested: 'If this presentation exists, its owner has been asked.',
  tooManyChanges: 'Too many changes at once. Try again in a minute',
  exportLimit: "You have reached today's export limit",
  presenceNeedsRedis: 'Presence and live cursors need a Redis store on this deployment',
  leaveAnyway: 'Changes are still saving. Leave anyway?',
  unsavedChanges: (count: number) =>
    `${count} unsaved change${count === 1 ? '' : 's'} from this browser`,
  apply: 'Apply',
  discard: 'Discard',
  alreadyChanged: (name: string) => `That change was already changed by ${name}`,
  inviteFromShare: 'Invite them from Share',
  tooManyEditors: 'This presentation has too many editors right now',
  noLongerPublished: 'This presentation is no longer published',
  notSignedInOwner:
    'Not signed in. Sign in, or copy an edit link, to get back to this presentation from another browser',
  signInToUpload: 'Sign in to upload a picture',
} as const;

/**
 * The presence surfaces (SPEC-3 4.2 to 4.9, 15): the roster, the chips, the flags, the Following
 * plate and the announcements. Names are text everywhere (7.2); the trust word beside a typed
 * name is "guest" (15, Kevin's list keeps "visitor" as the alternative).
 */
export const PRESENCE = {
  collaborators: 'Collaborators',
  follow: 'Follow',
  following: (name: string) => `Following ${name}`,
  /* the 240 by 24 plate at the stage's top centre (4.4) */
  followingPlate: (name: string) => `Following ${name} · Stop`,
  stop: 'Stop',
  goToSlide: (n: number) => `Go to slide ${n}`,
  slide: (n: number) => `slide ${n}`,
  /* the chip's tooltip: "Maya · guest · slide 12"; a label carries no trust word */
  chipTip: (name: string, trust: string | null, slide: number | null) =>
    [name, trust, slide === null ? null : `slide ${slide}`]
      .filter((part) => part !== null)
      .join(' · '),
  you: '(you)',
  guest: 'guest',
  byLink: 'by link',
  /* the role word a link visitor sees instead of a name (0.12) */
  anEditor: 'An editor',
  aCommenter: 'A commenter',
  aViewer: 'A viewer',
  roleWord: { owner: 'owner', editor: 'editor', commenter: 'commenter', viewer: 'viewer' },
  presenting: (n: number) => `Presenting slide ${n}`,
  more: (n: number) => `+${n}`,
  joinChat: 'Join chat',
  /* the aria-live region of 4.9, one sentence per 5 s per person */
  joined: (name: string) => `${name} joined`,
  left: (name: string) => `${name} left`,
  editing: (name: string, n: number) => `${name} is editing slide ${n}`,
  showMyPointer: 'Show my pointer',
  showingMyPointer: 'Showing my pointer',
  showCollaboratorPointers: 'Show collaborator pointers',
  announcements: 'Turn on collaborator announcements',
} as const;

/** The comment card, the markers and the Comments panel (SPEC-3 5.3, 15; Google's words). */
export const COMMENTS = {
  panel: 'Comments',
  forYou: 'For you',
  all: 'All',
  open: 'Open',
  resolved: 'Resolved',
  search: 'Search all comments',
  slideOrder: 'Slide order',
  placeholder: 'Comment or add others with @',
  replyPlaceholder: 'Reply or add others with @',
  comment: 'Comment',
  reply: 'Reply',
  resolve: 'Resolve',
  reopen: 'Re-open',
  edit: 'Edit',
  delete: 'Delete',
  getLink: 'Get link to this comment',
  addReaction: 'Add emoji reaction',
  assignTo: (name: string) => `Assign to ${name}`,
  reassign: 'Reassign',
  done: 'Done',
  more: 'More',
  cancel: 'Cancel',
  deleted: 'Comment deleted',
  undo: 'Undo',
  linkCopied: 'Link copied',
  showAll: 'Show all comments',
  expand: 'Expand comments',
  minimize: 'Minimize comments',
  hide: 'Hide comments',
  /* an orphaned thread (5.1): listed under its slide with the quoted text */
  removedObject: 'On an object that is no longer on the slide',
  /* the count chip's accessible name (15): the number with its noun, never a bare digit */
  count: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
  empty: 'No comments yet',
  emptyForYou: 'Nothing for you yet',
  /* a viewer reading a thread under the owner's switch (0.11): every write control is absent */
  readOnly: 'You can read this thread',
} as const;

/** The Notifications panel and the inbox plate (SPEC-3 5.5, 15; Turboslide's own, the levels Google's). */
export const INBOX = {
  panel: 'Notifications',
  markAllRead: 'Mark all read',
  settings: 'Notification settings',
  levels: { all: 'All comments', forYou: 'Comments for you', none: 'None' },
  emailToo: 'Email me too',
  activityForCommenters: 'Commenters can see the activity',
  replied: (name: string, n: number) => `${name} replied on slide ${n}`,
  mentioned: (name: string, n: number) => `${name} mentioned you on slide ${n}`,
  assigned: (name: string, n: number) => `${name} assigned you a comment on slide ${n}`,
  resolved: (name: string, n: number) => `${name} resolved your comment on slide ${n}`,
  reopened: (name: string, n: number) => `${name} re-opened your comment on slide ${n}`,
  reacted: (name: string, n: number) => `${name} reacted to your comment on slide ${n}`,
  commented: (name: string, n: number) => `${name} commented on slide ${n}`,
  accessRequest: (who: string) => `${who} asked for access`,
  granted: (name: string) => `${name} gave you access`,
  versionNamed: (name: string, version: string) => `${name} named a version ${version}`,
  empty: 'Nothing new',
} as const;

/** The Activity panel (SPEC-3 5.7, 15). */
export const ACTIVITY = {
  panel: 'Activity',
  viewers: 'Viewers',
  edits: 'Edits',
  comments: 'Comments',
  sharing: 'Sharing',
  empty: 'No activity yet',
} as const;

/**
 * The own chip's menu, the name prompt, the sign in dialog, the profile and the avatar builder
 * (SPEC-3 7.2 to 7.6, 15). The avatar tab "Glyph" is the spec's word (0.22, 7.6) and the one
 * place the round two engineering word is a label; the default view words test exempts that key
 * and the build notes record it for Kevin.
 */
export const ACCOUNT = {
  account: 'Account',
  signedInAs: (email: string) => `Signed in as ${email}`,
  notSignedIn: 'Not signed in',
  changeName: 'Change name',
  changeAvatar: 'Change avatar',
  signIn: 'Sign in',
  signOut: 'Sign out',
  forget: 'Forget this browser',
  forgetConfirm:
    'Forget this browser? Your name, avatar and unsaved changes here are cleared; earlier edits keep the old name',
  sessions: 'Sessions',
  namePrompt: {
    title: 'How should others see you?',
    name: 'Name',
    continue: 'Continue',
    signIn: 'Sign in',
  },
  signInDialog: {
    title: 'Sign in',
    email: 'Email',
    continue: 'Continue',
    /* the same answer whether or not the address exists (7.3) */
    sent: 'If that address can sign in, a message with a link and a six digit code is on its way',
    code: 'Six digit code',
    verify: 'Verify',
    passkey: 'Use a passkey',
    passkeysLater: 'Passkeys arrive once the address is final',
    github: 'Continue with GitHub',
    back: 'Back',
    failed: 'That code did not match. Try again or request a new one',
  },
  profile: {
    title: 'Profile',
    name: 'Name',
    email: 'Email',
    trust: {
      label: 'You are known by a label',
      guest: 'You are known by the name you typed',
      verified: (email: string) => `Signed in as ${email}, verified`,
    },
    sessions: 'Sessions',
    thisBrowser: 'This browser',
    signOut: 'Sign out',
    signOutEverywhereElse: 'Sign out everywhere else',
    keys: 'API keys',
    keyShownOnce: 'A key is shown once; copy it now',
    revoke: 'Revoke',
    deleteAccount: 'Delete account',
    deleteRefused: 'Other people hold access to presentations you own. Transfer them first',
  },
  avatar: {
    title: 'Change avatar',
    tabs: ['Initials', 'Glyph', 'Dither', 'Picture'],
    another: 'Another',
    initials: 'Initials',
    upload: 'Upload a picture',
    crop: 'Drag to crop',
    apply: 'Apply',
    tooLarge: 'Pictures up to 5 MB',
  },
} as const;

/** The You need access page (SPEC-3 6.5, 6.8, 15). */
export const ACCESS_PAGE = {
  title: 'You need access',
  sentence: REFUSALS.notAvailable,
  role: 'Access',
  message: 'Message',
  email: 'Email',
  requestAccess: 'Request access',
  invited: 'Invited by email? Sign in with the address the invitation went to.',
  asked: REFUSALS.requested,
} as const;

/**
 * The dither surfaces (SPEC-3 10.6, 10.7, 15): B5 draws the Format options section and the
 * Background dialog rows and reads the words here; the Turboslide additions carry
 * `turboslide: true` where they are rows.
 */
export const DITHER = {
  dither: 'Dither',
  help: 'The deck’s two tone screen over the picture; change it under Format options',
  preset: 'Preset',
  neutral: 'Neutral',
  photograph: 'Photograph',
  pattern: 'Pattern',
  tone: 'Tone',
  cell: 'Cell',
  strength: 'Strength',
  inkPoint: 'Ink point',
  paperPoint: 'Paper point',
  midtones: 'Midtones',
  lightTheme: 'Light theme',
  thicken: 'Thicken',
  advanced: 'Advanced',
  reset: 'Reset',
  material: 'Material',
  choose: 'Choose',
  place: 'Place',
  play: 'Play',
  formatOptions: 'Format options',
  lit: (percent: string) => `Lit ${percent} percent`,
  notMeasured: 'Not measured',
  uploading: (mb: string) => `Uploading ${mb} MB`,
} as const;

/**
 * Sentences that reach an agent, the CLI or the deployment admin and never the default view (the
 * refusal of SPEC-3 10.1 on a picture without a continuous source, the standalone build's answer,
 * the roster's word for an agent session of 15). They carry the engineering nouns the default
 * view words list forbids, and the default view words test names this block as its one exemption
 * beside the Agent access dialog.
 */
export const AGENT_SENTENCES = {
  materializeFirst: 'materialize first',
  noContinuousSource:
    'the asset has no continuous source (sourceFile); the committed twins are already dithered',
  /* the trust word of an agent chip in the roster and on its flag (SPEC-3 4.7, 15) */
  agentTrust: (runId: string) => `Agent · ${runId}`,
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
    /* SPEC-3 5.3: under Remove speaker notes, unticked (Google's default) */
    copyComments: 'Copy comments',
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
    /* the round one rows; the dialog rebuilt in round three (SPEC-3 6.5) retires them on day 4 */
    viewLink: 'View link',
    presentLink: 'Present link',
    editLink: 'Edit link',
    copyLink: 'Copy link',
    anyoneCanEdit: 'Anyone with this link can edit',
    noAccounts: 'Turboslide has no accounts yet. Anyone who has a link can open it',
    stripped: 'Skipped slides and speaker notes are not included in the view and present links',
    done: 'Done',
    /* SPEC-3 6.5, 15: Google's two halves in Turboslide's words */
    addPeople: 'Add people by email',
    notifyPeople: 'Notify people',
    message: 'Message',
    send: 'Send',
    roles: { viewer: 'Viewer', commenter: 'Commenter', editor: 'Editor', owner: 'Owner' },
    transferOwnership: 'Transfer ownership',
    addExpiration: 'Add expiration',
    removeAccess: 'Remove access',
    removeNote: 'Anyone who could open the presentation may already hold a copy',
    pending: 'Pending',
    expired: 'Expired',
    pendingOwnership: 'Pending ownership',
    generalAccess: 'General access',
    restricted: 'Restricted',
    restrictedDoc: 'Only people with access can open it',
    anyoneWithLink: 'Anyone with the link',
    legacy: 'Anyone with the address can view (legacy)',
    switchToLink: 'Switch to a link',
    links: { label: 'Label', role: 'Role', created: 'Created', expires: 'Expires' },
    rotate: 'Rotate',
    revoke: 'Revoke',
    stopSharing: 'Stop sharing',
    review: 'Review',
    noPendingRequests: 'No pending requests',
    approveAs: (role: string) => `Approve as ${role}`,
    decline: 'Decline',
    notify: 'Notify',
    settings: {
      editorsCanShare: 'Editors can change permissions and share',
      viewersCanDownload: 'Viewers and commenters can download, print and copy',
      viewersCanSeeComments: 'Viewers can see comments',
      showNamesToLinkVisitors: 'Show names to people with the link',
      allowHtmlBlocks: 'Allow embedded HTML blocks in this shared presentation',
      downloadNote: 'A screenshot or the browser’s own print command cannot be stopped',
    },
    footer: 'Speaker notes and skipped slides never travel with a view or comment link',
    publishToWeb: 'Publish to the web',
    claim: 'This presentation has no owner yet. Claim it to decide who can open and edit it.',
    claimButton: 'Claim',
    expiry: {
      none: 'No expiry',
      days7: '7 days',
      days30: '30 days',
      days90: '90 days',
      date: 'A date',
    },
    emailCollaborators: 'Email collaborators',
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
    /* SPEC-3 6.4, 15 */
    published:
      'Anyone with the published link can view the current version; every edit is published',
    publish: 'Publish',
    stopPublishing: 'Stop publishing',
    notPublished: 'This presentation is not published',
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
    /* SPEC-3 5.7, 0.45: Show changes at the panel's bottom, the window rows and the two disabled delete rows */
    showChanges: 'Show changes',
    nameCurrent: 'Name current version',
    deleteOlder: 'Delete this and older versions',
    deleteHistory: 'Delete history',
    earlierEdits: 'Earlier edits',
    changes: (n: number) => (n === 1 ? '1 change' : `${n} changes`),
    namedCap: (oldest: string) =>
      `This presentation already has 40 named versions. Remove the name from ${oldest} to add one`,
  },
  suggestions: { title: 'Suggestions for this slide', fix: 'Fix' },
  changeHistory: { title: 'Change history' },
  picturesMaterials: { title: 'Pictures and materials' },
  /* round three (SPEC-3 5.3, 5.5, 5.7, 0.27): the three collaboration panels and the Edit HTML panel */
  comments: { title: 'Comments', empty: 'No comments yet' },
  inbox: { title: 'Notifications', empty: 'Nothing new' },
  activity: { title: 'Activity', empty: 'No activity yet' },
  editHtml: {
    title: 'Edit HTML',
    apply: 'Apply',
    note: 'The block shows inside a frame; its HTML is edited here',
  },
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
  /* the Starred view of the home page (gslides-parity SPEC-5 7.7): Google's word, the list filtered to the caller's starred presentations */
  starred: 'Starred',
  starredDoc: 'Shows the presentations you starred. Click again to see every presentation.',
  starredEmpty: 'No starred presentations',
  starredEmptySentence: "Click the star in a presentation's title row to keep it here.",
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

/**
 * The sentences of round five (gslides-parity SPEC-5 15), landed on day 0 so every lane reads one
 * spelling and the copy lints run on them from the start; a lane that needs another sentence
 * adds it here by request. The title row's Star tooltip and the Google labels of the new rows
 * live on their menu items and controls, not here.
 */
export const ROUND_FIVE = {
  /** the first automatic medium that the browser refused to play with sound (SPEC-5 0.21) */
  soundOff: 'Sound is off until you click',
  /** the Chat panel's first line (SPEC-5 0.46) */
  chatNotSaved: 'Messages are not saved. Leave a comment for something that should stay',
  /** the Join chat row for a viewer (SPEC-5 10) */
  chatViewers: 'Commenters and editors can chat',
  /** the Open snackbar and the report card (SPEC-5 0.29) */
  importNotice: 'Some PowerPoint features look different in Turboslide',
  importSummary: (imported: number, substituted: number, dropped: number) =>
    `${imported} objects imported, ${substituted} shown differently, ${dropped} dropped`,
  /** the tmp tier and a missing Blob store (SPEC-5 0.18) */
  mediaNeedsBlob: 'Audio and video need the Blob store on this instance',
  /** the Search YouTube tab (SPEC-5 14.3) */
  youtubeSearchKey: 'Search needs a YouTube Data API key',
  /** the sixth Import theme (SPEC-5 0.28) */
  fiveThemes: 'This presentation already holds five themes',
  /** Dictate speaker notes (SPEC-5 7.3) */
  speechOnDevice: 'Speech stays on this device',
  speechRemote: 'Your browser sends audio to its speech service for recognition',
  speechUnsupported: 'This browser has no speech recognition',
  /** the Accessibility toggle (SPEC-5 7.5) */
  screenReaderOn: 'Screen reader support enabled',
  /** the drawing box's result list (SPEC-5 0.41) */
  bestGuesses: 'Best guesses',
  /** the spell check card (SPEC-5 7.2) */
  noMisspellings: 'No misspellings found',
  /** the presenter's step line (SPEC-5 0.14) */
  stepOf: (step: number, steps: number) => `Step ${step} of ${steps}`,
  /** the Themes panel's third group (SPEC-5 0.28) */
  inThisPresentation: 'In this presentation',
  /** the theme mode's working label for the second theme (SPEC-5 0.45; the label is Kevin's) */
  plate: 'Plate',
};

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

/** Errors and interruptions (SPEC 11.3; SPEC-3 6.8 holds the round three refusals in REFUSALS). */
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
