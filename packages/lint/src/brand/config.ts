// The brand lint's configuration (docs/NEXT.md 4.1.3 item 25): the chrome source rules ported
// from the gt-ui plugin of Prototemplate (P:.oxlintrc.json 38 to 50,
// P:scripts/oxlint-plugins/gt-ui.ts), the CSS checks for smooth scrolling, off-token radii,
// monospace outside the code surfaces, eyebrows, faces outside Inter and the retired outer rail,
// and the credits check for mood pictures. This module is the one place a rule is turned off for
// a file, a radius or a monospace surface is named as an exception, or a finding is accepted;
// each entry carries its reason, the way P:.oxlintrc.json carries its overrides.
//
// The rendered one rail check lives in chrome.ts (the audit of `lint --chrome`, check step 18)
// and reads the mode from here. It imports nothing, so chrome.ts stays loadable by the CLI.
//
// The design round (docs/DESIGN.md 2.6, 3.5, 4.2, 4.5, 6.5) adds five CSS checks, the stacking
// scale (`css/z-index`), the drop shadows (`css/no-shadow`), the one scrollbar (`css/scrollbar`),
// the numerals token (`css/numerals`) and the chrome's alternates (`css/chrome-alternates`), and
// widens `css/radius` to the ladder; the source rules read their inline style forms. The five
// reported from DR-D1#1 while the lanes of the round moved their files onto the tokens, and fail
// in enforce mode since DR-D1#5, with `css/radius` and its named exceptions gone.

/**
 * `report` prints every finding and passes; `enforce` fails on any finding that ACCEPTED does not
 * name, and on an acceptance that no longer matches a finding. NEXT.md 4.1.3 item 25: the lint
 * lands in report mode (push 19) and turns to enforce in the round's last code push (push 20).
 */
export type BrandLintMode = 'report' | 'enforce';
export const BRAND_LINT_MODE: BrandLintMode = 'enforce';

/** The thirteen gt-ui rules of P:.oxlintrc.json 38 to 50, under their source names. */
export type SourceRuleId =
  | 'gt-ui/single-rail'
  | 'gt-ui/no-em-dash'
  | 'gt-ui/no-eyebrow'
  | 'gt-ui/no-heading-period'
  | 'gt-ui/cta-title-case'
  | 'gt-ui/mono-is-not-voice'
  | 'gt-ui/no-smooth-scroll'
  | 'gt-ui/no-gif-mark'
  | 'gt-ui/icon-tiers'
  | 'gt-ui/inter-only'
  | 'gt-ui/no-raw-locale-flags'
  | 'gt-ui/typed-text-var'
  | 'gt-ui/no-hex-colors';

/**
 * The CSS checks. The gt-ui rules read js, jsx, ts and tsx files alone (P:.oxlintrc.json 32 to
 * 35), and this tree styles its chrome in plain CSS (AGENTS.md code rules), so each law that a
 * stylesheet can break has its CSS form here. `css/radius` also reads an inline style object's
 * radius in TSX.
 */
export type CssRuleId =
  | 'css/no-smooth-scroll'
  | 'css/radius'
  | 'css/mono-outside-code'
  | 'css/no-eyebrow'
  | 'css/inter-only'
  | 'css/single-rail'
  /* the design round (docs/DESIGN.md 2.6, 3.5, 6.5, 4.5, 4.2) */
  | 'css/z-index'
  | 'css/no-shadow'
  | 'css/scrollbar'
  | 'css/numerals'
  | 'css/chrome-alternates';

export type BrandRuleId = SourceRuleId | CssRuleId | 'brand/credits' | 'brand/parse';

export const SOURCE_RULES: readonly SourceRuleId[] = [
  'gt-ui/single-rail',
  'gt-ui/no-em-dash',
  'gt-ui/no-eyebrow',
  'gt-ui/no-heading-period',
  'gt-ui/cta-title-case',
  'gt-ui/mono-is-not-voice',
  'gt-ui/no-smooth-scroll',
  'gt-ui/no-gif-mark',
  'gt-ui/icon-tiers',
  'gt-ui/inter-only',
  'gt-ui/no-raw-locale-flags',
  'gt-ui/typed-text-var',
  'gt-ui/no-hex-colors',
];

export const CSS_RULES: readonly CssRuleId[] = [
  'css/no-smooth-scroll',
  'css/radius',
  'css/mono-outside-code',
  'css/no-eyebrow',
  'css/inter-only',
  'css/single-rail',
  'css/z-index',
  'css/no-shadow',
  'css/scrollbar',
  'css/numerals',
  'css/chrome-alternates',
];

/**
 * The rules that print their findings and never fail a run, whatever the mode; the run lists their
 * findings apart as `reported`. Empty since DR-D1#5 (docs/DESIGN.md 10.1, 12 item 3): the design
 * round's five checks reported from DR-D1#1 and fail in enforce mode after every other lane's last
 * push. A rule that lands before the tree is clean of it is named here until the push that clears
 * the tree.
 */
export const REPORT_RULES: readonly BrandRuleId[] = [];

/**
 * The stacking scale (docs/DESIGN.md 2.2, 2.6; packages/theme/src/scale.ts LAYERS): the layer
 * names a `var(--ts-layer-<name>)` may read, the file whose layers block declares them, and the
 * limit under which a z-index is local order inside one stacking context.
 */
export const Z_INDEX = {
  layers: [
    'stage',
    'docked',
    'bar',
    'show',
    'dialog',
    'popover',
    'toast',
    'tooltip',
    'preview',
    'skip',
  ] as readonly string[],
  tokensFile: 'packages/chrome/src/tokens.css',
  localLimit: 5,
};

/**
 * The files that own the one scrollbar (docs/DESIGN.md 6.1, 6.5): the rule in tokens.css and the
 * standalone deck's copy over its own token names. Anywhere else a `::-webkit-scrollbar` rule may
 * only hide the bar (`display: none`) and `scrollbar-width` may only be `none`.
 */
export const SCROLLBAR_OWNERS: readonly string[] = [
  'packages/chrome/src/tokens.css',
  'packages/viewer/standalone/chrome.ts',
];

/**
 * The files that declare the numerals token (docs/DESIGN.md 4.5): tokens.css with --pt-numerals
 * and .pt-num, and the standalone deck's copy, which declares its own --numerals once in its
 * :root and reads it in its rules, as it owns its scrollbar copy (build/d5.md request 2).
 */
export const NUMERALS_OWNERS: readonly string[] = [
  'packages/chrome/src/tokens.css',
  'packages/viewer/standalone/chrome.ts',
];

/**
 * Where General Translation's alternates may be written (docs/DESIGN.md 4.2): the General
 * Translation theme's sheet and the theme records. A file path from the tree's root, or a folder
 * ending in `/`.
 */
export const ALTERNATES_OWNERS: readonly string[] = [
  'packages/theme/src/gt-ink-paper/',
  'packages/theme/src/tokens.ts',
  'packages/theme/src/themes.ts',
];

/** One finding: the rule, the file from the tree's root, a 1-based line and column, the text. */
export type BrandFinding = {
  rule: BrandRuleId;
  file: string;
  line: number;
  column: number;
  message: string;
  /** the offending text or selector, at most 160 characters */
  text: string;
};

/**
 * The trees the source and CSS rules read (NEXT.md 4.1.3 item 25: packages/chrome, packages/viewer
 * and apps/studio/src). packages/viewer/standalone is the viewer's runtime for the exported web
 * page, so it is the viewer's too.
 */
export const LINT_ROOTS: readonly string[] = [
  'packages/chrome/src',
  'packages/viewer/src',
  'packages/viewer/standalone',
  'apps/studio/src',
];

/**
 * Files no rule reads: tests and their fixtures (they assert the laws, so they spell the
 * forbidden strings), browser specs, generated files and build output.
 */
export const EXCLUDED_FILES: readonly RegExp[] = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)e2e\//,
  /(^|\/)dist\//,
  /\.gen\.ts$/,
  /\.d\.ts$/,
];

/**
 * A rule turned off for named files, with the reason (P:.oxlintrc.json `overrides`). A file entry
 * is a path from the tree's root, or a folder ending in `/`.
 */
export type Override = { files: readonly string[]; rules: readonly BrandRuleId[]; reason: string };

export const OVERRIDES: readonly Override[] = [
  {
    files: ['packages/chrome/src/dialogs/special-characters-data.ts'],
    rules: ['gt-ui/no-em-dash'],
    reason:
      'The Special characters dialog lists the em dash as a character a seller inserts into a slide; the string is the character, never chrome copy.',
  },
];

/**
 * The radius values every rule may draw (DECK-GRAMMAR.md:39, P:DESIGN.md section 15, NEXT.md
 * 4.1.2 "Corners"; the ladder of docs/DESIGN.md 3.1 since the design round): square, a circle,
 * the three rungs' tokens (4 px chips, 6 px controls and plates, 8 px windows), a rung less the
 * inset of a box inside a rounded box, and the keywords that take the parent's value.
 */
export const RADIUS_VALUES: readonly RegExp[] = [
  /^0(?:px)?$/,
  /^50%$/,
  /^(?:inherit|initial|unset|revert)$/,
  /^var\(--pt-radius(?:-sm|-lg)?(?:,\d+px)?\)$/,
  /^calc\(var\(--pt-radius(?:-sm|-lg)?(?:,\d+px)?\)-\d+(?:\.\d+)?px\)$/,
];

/** A named corner outside RADIUS_VALUES: the file, the rule's selector as written, the value. */
export type RadiusException = { file: string; selector: string; value: string; reason: string };

/* Empty since DR-D1#5 (docs/DESIGN.md 3.5). The two literal corners named here until then draw
   the ladder since DR-D2#2: the Slideshow box (8 px) reads --pt-radius, and the search key chip
   (4 px) takes .pt-kbd, which reads --pt-radius-sm. */
export const RADIUS_EXCEPTIONS: readonly RadiusException[] = [];

/**
 * The code surfaces where monospace is the instrument voice (DECK-GRAMMAR.md:31 "Code sits on the
 * #101010 panel in white monospace"; P:BRAND.md section 6: code artifacts, tokens, terminals and
 * file paths). A rule whose subject is a `code`, `pre`, `kbd` or `samp` element is one without an
 * entry; every other monospace rule is named here by its file and selector with its reason.
 */
export type CodeSurface = { file: string; selector: string; reason: string };

export const CODE_SURFACES: readonly CodeSurface[] = [
  {
    file: 'apps/studio/src/routes/home.css',
    selector: '.ts-home-panel',
    reason:
      "The /home terminals: the hero's agent terminal and the agents band's console, the page's only code surfaces (LANDING.md 2.0 \"The two panels\"; DECK-GRAMMAR.md:31, Kevin's pick of the hero's terminal, question 18).",
  },
  {
    file: 'packages/chrome/src/EditHtmlPanel.css',
    selector: '.ts-edit-html-field textarea',
    reason: "The HTML block's source field: code.",
  },
  {
    file: 'packages/chrome/src/inspector/json.css',
    selector: '.ts-ctl-json-field',
    reason: 'The JSON field of the inspector: code.',
  },
  {
    file: 'packages/chrome/src/Dialog.css',
    selector: '.ts-dialog-code textarea',
    reason:
      'The code fields of the Agent access, Publish and Import slides dialogs (a token, an embed snippet, a selection list): code.',
  },
  {
    file: 'packages/chrome/src/SourceDrawer.css',
    selector: '.ts-drawer-title',
    reason: "The source drawer's head names the slide's file, `slides/<id>.json`: a file path.",
  },
  {
    file: 'packages/chrome/src/EditorToolbar.css',
    selector: '.ts-tb-hex input',
    reason: 'A hex colour field: a token.',
  },
  {
    file: 'packages/chrome/src/ThemesPanel.css',
    selector: '.ts-brand-hex',
    reason: 'A hex colour field: a token.',
  },
  {
    file: 'packages/chrome/src/inspector/palette.css',
    selector: '.ts-ctl-hexfield',
    reason: 'A hex colour field: a token.',
  },
  {
    file: 'packages/chrome/src/inspector/fields.css',
    selector: '.ts-fo-hex',
    reason: 'A hex colour field: a token.',
  },
  {
    file: 'packages/chrome/src/pickers/Pickers.css',
    selector: '.ts-color-hex input',
    reason: 'A hex colour field: a token.',
  },
  {
    file: 'packages/chrome/src/inspector/shader.css',
    selector: '.ts-shader-text',
    reason: "A shader uniform's raw value (a number or a colour): a token.",
  },
  {
    file: 'packages/chrome/src/InspectorControl.css',
    selector: '.ts-insp-value',
    reason: "The inspector's read-only value of a field (a slide kind, a token's value): a token.",
  },
  {
    file: 'packages/chrome/src/Inspector.css',
    selector: '.ts-insp-rename',
    reason: "The block id field: an id, a token of the document's source.",
  },
  {
    file: 'packages/chrome/src/Inspector.css',
    selector: '.ts-insp-block-id',
    reason: "A block's id: a token of the document's source.",
  },
  {
    file: 'packages/chrome/src/AssetPicker.css',
    selector: '.ts-asset-picker-id',
    reason: "An asset's id: a token of the document's source.",
  },
  {
    file: 'packages/chrome/src/inspector/asset.css',
    selector: '.ts-asset-mono',
    reason: "An asset's id and source file: a token and a file path.",
  },
  {
    file: 'packages/chrome/src/inspector/icon.css',
    selector: '.ts-ctl-icon-name',
    reason: "An icon's sprite id: a token.",
  },
  {
    file: 'packages/chrome/src/LintPanel.css',
    selector: '.ts-lint-rule',
    reason: "A finding's rule id (`copy/no-em-dash`): a token.",
  },
  {
    file: 'packages/chrome/src/ExportReportCard.css',
    selector: '.ts-report-file',
    reason: "An exported file's name: a file path.",
  },
];

/**
 * The classes of a rail wrapper in TSX (gt-ui single-rail `.tc-rail`): a wrapper inside a wrapper
 * draws the column's pair twice. `ts-rails` is the element that draws the 1104 px column's pair
 * on /home, /decks and Not found (`apps/studio/src/components/home/grammar.css`, B2a#15).
 */
export const RAIL_WRAPPER_CLASSES: readonly string[] = ['tc-rail', 'ts-rail', 'ts-rails'];

/**
 * The tree's button elements and the attribute that carries a visible label (gt-ui cta-title-case
 * reads `<Cta>` children; DECK-GRAMMAR.md:22 "Title Case only on buttons"). A ToolButton's
 * `label` is its text, the `title` its tooltip, which stays sentence case.
 */
export const BUTTON_ELEMENTS: readonly string[] = ['Cta', 'button'];
export const BUTTON_LABEL_PROPS: Readonly<Record<string, string>> = { ToolButton: 'label' };

/** The credits check (NEXT.md 4.1.2 "The pictures' licences"; 4.1.3 item 25). */
export const CREDITS = {
  /** the record a credit line lives in */
  record: 'docs/brand.md',
  /** where a mood picture can sit */
  roots: ['decks', 'apps/studio/public'] as readonly string[],
  /** the picture formats */
  pictures: /\.(?:jpe?g|png|webp|avif|gif)$/i,
  /** the words that state a licence on the credit row */
  licence: /public domain|\bCC0\b|\bCC BY(?:-(?:SA|ND|NC))*\b|\bno copyright\b|\blicen[cs]e\b/i,
  /** the words of a row that records a licence not read: such a row credits nothing */
  unread:
    /\bnone stated\b|\bno licen[cs]e\b|\blicen[cs]e unknown\b|\bunknown licen[cs]e\b|\bnot read\b|\bkept out\b/i,
};

/**
 * An accepted finding in enforce mode: the rule, the file, a substring of the finding's text, the
 * reason, and who owns the fix. An acceptance that matches no finding fails enforce mode, so the
 * list cannot outlive the defect it names.
 */
export type Acceptance = {
  rule: BrandRuleId;
  file: string;
  match: string;
  reason: string;
  owner: string;
};

/**
 * The findings enforce mode accepts (B5b#20, 2026-10-02): the 22 the lint read on `next/round1`
 * after every Round 1 lane's last commit, each from before Round 1 and outside every item of
 * NEXT.md 4.1.3. No Round 1 commit added a finding (build/b5.md, the reading per commit). Each
 * entry leaves this list in the push that fixes it; one left behind fails enforce mode as stale.
 */
export const ACCEPTED: readonly Acceptance[] = [
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/Toolbar.tsx',
    match: 'Exit fullscreen',
    reason:
      'A sentence case button label in the /deck viewer toolbar, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 5.',
    owner: 'B3b',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/inspector/table.tsx',
    match: 'Distribute rows',
    reason:
      'A sentence case button label in the table inspector, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 5.',
    owner: 'B3b',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/inspector/table.tsx',
    match: 'Distribute columns',
    reason:
      'A sentence case button label in the table inspector, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 5.',
    owner: 'B3b',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/inspector/table.tsx',
    match: 'Merge cells',
    reason:
      'A sentence case button label in the table inspector, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 5.',
    owner: 'B3b',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/inspector/table.tsx',
    match: 'Unmerge cells',
    reason:
      'A sentence case button label in the table inspector, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 5.',
    owner: 'B3b',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/inspector/asset.tsx',
    match: 'Add asset',
    reason:
      'A sentence case button label in the asset inspector, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 5.',
    owner: 'B3b',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'apps/studio/src/editor/EditorRoot.tsx',
    match: 'Copy text',
    reason:
      'A sentence case button label in the editor root, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/ExportMenu.tsx',
    match: 'Build and download',
    reason:
      'A sentence case button label in the Download menu, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/ExportMenu.tsx',
    match: 'Download deck bundle',
    reason:
      'A sentence case button label in the Download menu, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/HistoryPanel.tsx',
    match: 'Undo to here',
    reason:
      'A sentence case button label in the history panel, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/Inspector.tsx',
    match: 'Add item',
    reason:
      'A sentence case button label in the inspector, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/SourceDrawer.tsx',
    match: 'Copy as command',
    reason:
      'A sentence case button label in the source drawer, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/dialogs/ImportSlides.tsx',
    match: 'Select a file from your device',
    reason:
      'A sentence case button label in the Import slides dialog, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/dialogs/Open.tsx',
    match: 'Select a file from your device',
    reason:
      'A sentence case button label in the Open dialog, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/cta-title-case',
    file: 'packages/chrome/src/dialogs/Publish.tsx',
    match: 'Copy link',
    reason:
      'A sentence case button label in the Publish dialog, from before Round 1 and outside every item of NEXT.md 4.1.3; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'css/mono-outside-code',
    file: 'apps/studio/src/styles.css',
    match: '.ts-deck-id',
    reason:
      'No element renders .ts-deck-id, so the rule can go. From before Round 1, outside every item; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'css/mono-outside-code',
    file: 'packages/chrome/src/ExportMenu.css',
    match: '.ts-export-line',
    reason:
      'The export progress line is set in monospace. From before Round 1, outside every item; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'css/mono-outside-code',
    file: 'packages/chrome/src/ExportReportCard.css',
    match: '.ts-report-residual',
    reason:
      'The residual list of the export report is set in monospace. From before Round 1, outside every item; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'gt-ui/no-smooth-scroll',
    file: 'packages/viewer/standalone/runtime.ts',
    match: 'smooth',
    reason:
      'The book view of the exported web page scrolls a page into view smoothly; B3b#10 removed the same in the studio. From before Round 1, outside every item; build/b5.md request 6.',
    owner: 'the integrator',
  },
  {
    rule: 'css/z-index',
    file: 'apps/studio/src/components/home/live/paint.ts',
    match: 'el.style.zIndex = z',
    reason:
      "A block of the landing's live slide brought to front (20) or sent to back (0) over the renderer's order + 1: local order inside the slide sheet's own stacking context, never a floating surface. The design round, DR-D4#4; build/d4.md request to D1.",
    owner: 'the integrator',
  },
  {
    rule: 'css/z-index',
    file: 'apps/studio/src/components/home/live/theme.ts',
    match: "zIndex: '10'",
    reason:
      "The printed field's canvas over the slide's own blocks (10): local order inside the slide sheet's stacking context, never a floating surface. The design round, DR-D4#4; build/d4.md request to D1.",
    owner: 'the integrator',
  },
  {
    rule: 'css/z-index',
    file: 'packages/viewer/src/MaterialMount.tsx',
    match: 'host.style.zIndex = style.zIndex',
    reason:
      "A live material's host copies the z-index of the material block it covers (the block's order on its slide): local order inside the slide's stacking context, never a floating surface. Read by the integrator of the design round.",
    owner: 'the integrator',
  },
];
