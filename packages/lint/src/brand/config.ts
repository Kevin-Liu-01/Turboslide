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

/**
 * `report` prints every finding and passes; `enforce` fails on any finding that ACCEPTED does not
 * name, and on an acceptance that no longer matches a finding. NEXT.md 4.1.3 item 25: the lint
 * lands in report mode (push 19) and turns to enforce in the round's last code push (push 20).
 */
export type BrandLintMode = 'report' | 'enforce';
export const BRAND_LINT_MODE: BrandLintMode = 'report';

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
  | 'css/single-rail';

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
 * 4.1.2 "Corners"): square, a circle, the one token, the token less the border inside a segmented
 * control, and the keywords that take the parent's value.
 */
export const RADIUS_VALUES: readonly RegExp[] = [
  /^0(?:px)?$/,
  /^50%$/,
  /^(?:inherit|initial|unset|revert)$/,
  /^var\(--pt-radius(?:,6px)?\)$/,
  /^calc\(var\(--pt-radius(?:,6px)?\)-\d+(?:\.\d+)?px\)$/,
];

/** A named corner outside RADIUS_VALUES: the file, the rule's selector as written, the value. */
export type RadiusException = { file: string; selector: string; value: string; reason: string };

export const RADIUS_EXCEPTIONS: readonly RadiusException[] = [
  {
    file: 'packages/chrome/src/TitleRow.css',
    selector: '.ts-title-slideshow',
    value: '8px',
    reason:
      'NEXT.md 4.1.2 "Corners": 8 px on Slideshow with its label first (P:DESIGN.md section 15, Present).',
  },
  {
    file: 'packages/chrome/src/Toolbar.css',
    selector: '.pt-search-kbd',
    value: '4px',
    reason:
      'The search key chip, an exception P:DESIGN.md section 15 names; audit-brand-source 308 counts it as sanctioned and NEXT.md 4.1.3 item 14 leaves it out of the thirteen radii it squares.',
  },
];

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
    selector: '.ts-product-cmd',
    reason:
      'The /home command, the code on the #101010 panel (DECK-GRAMMAR.md:31; brand-c 88 item 13).',
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
 * draws the column's pair twice. `ts-product-rail` is the /home column today; B2 names the class
 * of the 1104 px column (build/b5.md request 3).
 */
export const RAIL_WRAPPER_CLASSES: readonly string[] = ['tc-rail', 'ts-rail', 'ts-product-rail'];

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

export const ACCEPTED: readonly Acceptance[] = [];
