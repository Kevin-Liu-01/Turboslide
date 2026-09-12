import type { ToolbarControl } from './model.ts';
import { TOOLBAR_TAIL_DEFAULT, shortcut } from './model.ts';

/**
 * The contextual toolbar tails of the Google Slides parity round (SPEC 3.2 to 3.8; R02 sections
 * 4.2 to 4.6): what replaces positions 8 to 17 of the toolbar while something is selected. One
 * ordered list per selection family, in Google's order, every control a `ToolbarControl` of the
 * menu model so its label, key, status, stub clause and predicate come from the one table. The
 * head (positions 1 to 7) never changes and lives in `model.ts` as `TOOLBAR_HEAD`; the default
 * tail with nothing selected is `TOOLBAR_TAIL_DEFAULT` there. Relative imports carry the `.ts`
 * extension so the parity audit script can load this module under Node.
 *
 * A control with `op` is a toolbar operation that is not a menu item (the colour swatches, the
 * font field, the size field); `ToolbarTail.tsx` implements each op. A control with `item` runs
 * that menu item's effect. A control with `arrow` opens that item's submenu as a dropdown.
 */
export type TailKind = 'default' | 'text' | 'shape' | 'image' | 'line' | 'table' | 'other';

export type TailOp =
  | 'fillColor'
  | 'borderColor'
  | 'borderWeight'
  | 'font'
  | 'fontSize'
  | 'textColor'
  | 'align'
  | 'spacing'
  | 'lineColor'
  | 'lineWeight'
  | 'lineStart'
  | 'lineEnd'
  | 'imageBorder'
  | 'crop'
  | 'formatOptions'
  | 'replaceImage'
  /** the pointer (SPEC 3.1 row 8) and Paint format (row 6): the shell runs them by control id */
  | 'select'
  | 'paintFormat';

export type TailControl = ToolbarControl & {
  op?: TailOp;
  /** a chevron follows the glyph: a dropdown */
  dropdown?: true;
};

const FONT_DOC = 'The GT theme sets Inter';
const VALIGN_DOC = 'Vertical alignment is set by the layout';
const SHAPE_TEXT_DOC = 'Use a text box for text over a shape, or insert a box';
const NO_FILL_DOC = 'Headings, paragraphs and text boxes have no fill or border';

/** Fill, border colour and border weight, the first three of every object tail (R02 4.2). */
function fillAndBorder(family: 'text' | 'shape' | 'table'): TailControl[] {
  const textOnly = family === 'text';
  const fill: TailControl = {
    control: 'toolbar.fillColor',
    label: 'Fill color',
    icon: 'paint-brush',
    status: 'now',
    op: 'fillColor',
    dropdown: true,
    dividerBefore: true,
    doc: family === 'table' ? 'The fill of the selected column' : 'A theme colour, none, or a hex',
    ...(textOnly ? { enabled: 'boxSelected' as const, disabledReason: NO_FILL_DOC } : {}),
  };
  const border: TailControl = {
    control: 'toolbar.borderColor',
    label: 'Border color',
    icon: 'pencil',
    status: 'now',
    op: 'borderColor',
    dropdown: true,
    ...(textOnly ? { enabled: 'boxSelected' as const, disabledReason: NO_FILL_DOC } : {}),
  };
  const weight: TailControl = {
    control: 'toolbar.borderWeight',
    label: 'Border weight',
    icon: 'bars-3',
    status: 'now',
    op: 'borderWeight',
    dropdown: true,
    doc: '0, 1, 1.5 or 2',
    ...(textOnly ? { enabled: 'boxSelected' as const, disabledReason: NO_FILL_DOC } : {}),
  };
  const dash: TailControl = {
    control: 'toolbar.borderDash',
    label: 'Border dash',
    icon: 'minus',
    status: 'later',
    stubReason: 'The GT theme draws solid lines',
    item: 'format.bordersLines.borderDash',
  };
  return family === 'table' ? [border, weight, dash, fill] : [fill, border, weight, dash];
}

/** The text controls of SPEC 3.2 rows 12 to 27; `disabledDoc` greys them all (a shape holds no text). */
function textControls(options: { table?: boolean; disabledDoc?: string } = {}): TailControl[] {
  const off =
    options.disabledDoc === undefined
      ? {}
      : { enabled: 'never' as const, disabledReason: options.disabledDoc };
  return [
    {
      control: 'toolbar.font',
      label: 'Font',
      text: true,
      status: 'now',
      op: 'font',
      enabled: 'never',
      disabledReason: FONT_DOC,
      dividerBefore: true,
    },
    {
      control: 'toolbar.fontSize',
      label: 'Font size',
      status: 'now',
      op: 'fontSize',
      doc: 'A step of the type ladder; a typed value snaps to the nearest step',
      ...off,
    },
    {
      control: 'toolbar.bold',
      label: 'Bold',
      icon: 'bold',
      key: shortcut('Cmd+B'),
      status: 'now',
      item: 'format.text.bold',
      ...off,
    },
    {
      control: 'toolbar.italic',
      label: 'Italic',
      icon: 'italic',
      key: shortcut('Cmd+I'),
      status: 'later',
      stubReason: 'The GT theme sets Inter in one style',
      item: 'format.text.italic',
    },
    {
      control: 'toolbar.underline',
      label: 'Underline',
      icon: 'underline',
      key: shortcut('Cmd+U'),
      status: 'later',
      stubReason: 'The GT theme sets Inter in one style',
      item: 'format.text.underline',
    },
    {
      control: 'toolbar.textColor',
      label: 'Text color',
      icon: 'swatch',
      status: 'now',
      op: 'textColor',
      dropdown: true,
      doc: 'Ink or muted on headings and paragraphs; the theme colours on text and boxes',
      ...off,
    },
    {
      control: 'toolbar.insertLink',
      label: 'Insert link',
      icon: 'link',
      key: shortcut('Cmd+K'),
      status: 'now',
      item: 'insert.link',
      dividerBefore: true,
      ...off,
    },
    {
      control: 'toolbar.insertComment',
      label: 'Insert comment',
      icon: 'chat',
      key: shortcut('Cmd+Option+M'),
      status: 'later',
      stubReason: 'Comments arrive in the next round',
      item: 'insert.comment',
    },
    {
      control: 'toolbar.align',
      label: 'Align',
      icon: 'bars-3-center-left',
      status: 'now',
      op: 'align',
      dropdown: true,
      dividerBefore: true,
      doc: options.table
        ? 'Left, Center, Right, and Top, Middle, Bottom in the cell'
        : `Left, Center, Right; ${VALIGN_DOC}`,
      ...off,
    },
    {
      control: 'toolbar.spacing',
      label: 'Line & paragraph spacing',
      icon: 'bars-arrow-down',
      status: 'now',
      op: 'spacing',
      dropdown: true,
      ...off,
    },
    {
      control: 'toolbar.bulletedList',
      label: 'Bulleted list',
      icon: 'list-bullet',
      key: shortcut('Cmd+Shift+8'),
      status: 'now',
      item: 'format.bulletsNumbering.bulleted',
      ...off,
    },
    {
      control: 'toolbar.numberedList',
      label: 'Numbered list',
      icon: 'numbered-list',
      key: shortcut('Cmd+Shift+7'),
      status: 'now',
      item: 'format.bulletsNumbering.numbered',
      ...off,
    },
    {
      control: 'toolbar.decreaseIndent',
      label: 'Decrease indent',
      icon: 'bars-arrow-up',
      key: shortcut('Cmd+['),
      status: 'later',
      stubReason: 'Indents arrive with list levels',
      item: 'format.alignIndent.decreaseIndent',
    },
    {
      control: 'toolbar.increaseIndent',
      label: 'Increase indent',
      icon: 'bars-arrow-down',
      key: shortcut('Cmd+]'),
      status: 'later',
      stubReason: 'Indents arrive with list levels',
      item: 'format.alignIndent.increaseIndent',
    },
    {
      control: 'toolbar.clearFormatting',
      label: 'Clear formatting',
      icon: 'strikethrough',
      key: shortcut('Cmd+\\', 'Ctrl+\\ or Ctrl+Space'),
      status: 'now',
      item: 'format.clearFormatting',
      dividerBefore: true,
      ...off,
    },
  ];
}

const FORMAT_OPTIONS: TailControl = {
  control: 'toolbar.formatOptions',
  label: 'Format options',
  text: true,
  status: 'now',
  item: 'format.formatOptions',
  op: 'formatOptions',
  dividerBefore: true,
};

/** 3.2: a text box, heading, paragraph or box selected, or the caret in text. */
const TEXT_TAIL: TailControl[] = [...fillAndBorder('text'), ...textControls(), FORMAT_OPTIONS];

/** 3.3: a shape selected; the text controls grey out because a shape holds no text this round. */
const SHAPE_TAIL: TailControl[] = [
  ...fillAndBorder('shape'),
  ...textControls({ disabledDoc: SHAPE_TEXT_DOC }),
  FORMAT_OPTIONS,
];

/** 3.4: an image selected. */
const IMAGE_TAIL: TailControl[] = [
  {
    control: 'toolbar.borderColor',
    label: 'Border color',
    icon: 'pencil',
    status: 'now',
    op: 'imageBorder',
    dropdown: true,
    dividerBefore: true,
    doc: 'The hairline frame, on or off',
  },
  {
    control: 'toolbar.borderWeight',
    label: 'Border weight',
    icon: 'bars-3',
    status: 'later',
    stubReason: 'A picture frame is the sheet hairline',
    item: 'format.bordersLines.borderWeight',
  },
  {
    control: 'toolbar.borderDash',
    label: 'Border dash',
    icon: 'minus',
    status: 'later',
    stubReason: 'The GT theme draws solid lines',
    item: 'format.bordersLines.borderDash',
  },
  {
    control: 'toolbar.cropImage',
    label: 'Crop image',
    icon: 'viewfinder-circle',
    status: 'now',
    op: 'crop',
    dropdown: true,
    doc: 'Crop to the top or the centre',
  },
  {
    control: 'toolbar.replaceImage',
    label: 'Replace image',
    icon: 'arrow-path',
    status: 'now',
    item: 'format.image.replaceImage',
    arrow: 'format.image.replaceImage',
    op: 'replaceImage',
  },
  {
    control: 'toolbar.imageOptions',
    label: 'Image options',
    text: true,
    status: 'now',
    item: 'format.image.imageOptions',
  },
  {
    control: 'toolbar.resetImage',
    label: 'Reset image',
    icon: 'arrow-uturn-left',
    status: 'later',
    stubReason: 'Free cropping arrives first',
    item: 'format.image.resetImage',
  },
  FORMAT_OPTIONS,
];

/** 3.5: a line or arrow selected. */
const LINE_TAIL: TailControl[] = [
  {
    control: 'toolbar.lineColor',
    label: 'Line color',
    icon: 'pencil',
    status: 'now',
    op: 'lineColor',
    dropdown: true,
    dividerBefore: true,
  },
  {
    control: 'toolbar.lineWeight',
    label: 'Line weight',
    icon: 'bars-3',
    status: 'now',
    op: 'lineWeight',
    dropdown: true,
    doc: '1 to 4',
  },
  {
    control: 'toolbar.lineDash',
    label: 'Line dash',
    icon: 'minus',
    status: 'later',
    stubReason: 'The GT theme draws solid lines',
    item: 'format.bordersLines.borderDash',
  },
  {
    control: 'toolbar.lineStart',
    label: 'Line start',
    icon: 'arrow-uturn-left',
    status: 'now',
    op: 'lineStart',
    dropdown: true,
    doc: 'None or Arrow',
  },
  {
    control: 'toolbar.lineEnd',
    label: 'Line end',
    icon: 'arrow-right',
    status: 'now',
    op: 'lineEnd',
    dropdown: true,
    doc: 'None or Arrow',
  },
  FORMAT_OPTIONS,
];

/** 3.6: a table cell selected. */
const TABLE_TAIL: TailControl[] = [
  ...fillAndBorder('table'),
  ...textControls({ table: true }),
  FORMAT_OPTIONS,
];

/** 3.8: icons, materials and the other blocks. */
const OTHER_TAIL: TailControl[] = [
  { ...FORMAT_OPTIONS, dividerBefore: true },
  {
    control: 'toolbar.replaceImage',
    label: 'Replace image',
    icon: 'arrow-path',
    status: 'now',
    item: 'format.image.replaceImage',
    arrow: 'format.image.replaceImage',
    op: 'replaceImage',
    enabled: 'pictureBlockSelected',
    disabledReason: 'This block holds no picture',
  },
];

export const TOOLBAR_TAILS: Readonly<Record<TailKind, ReadonlyArray<TailControl>>> = {
  default: TOOLBAR_TAIL_DEFAULT.map((control) =>
    control.control === 'toolbar.select' ? { ...control, op: 'select' as const } : control,
  ),
  text: TEXT_TAIL,
  shape: SHAPE_TAIL,
  image: IMAGE_TAIL,
  line: LINE_TAIL,
  table: TABLE_TAIL,
  other: OTHER_TAIL,
};

/** The Hide the menus chevron: the last control of every tail (SPEC 3.1 row 18). */
export const HIDE_MENUS_CONTROL = 'toolbar.hideMenus';

/** The tail for a selection family; the Hide the menus chevron is drawn apart at the far right. */
export function tailFor(kind: TailKind): TailControl[] {
  return TOOLBAR_TAILS[kind].filter((control) => control.control !== HIDE_MENUS_CONTROL);
}

/** The labels of a tail in order, for the tests and the parity audit (SPEC 14.4 item 4). */
export function tailLabels(kind: TailKind): string[] {
  return tailFor(kind).map((control) => control.label);
}

/** At or below this width the tail collapses into the More button (SPEC 0.6, 1.3). */
export const MORE_BREAKPOINT_PX = 1100;
