import type { MenuPredicate, ToolbarControl } from './model.ts';
import { TOOLBAR_TAIL_DEFAULT, shortcut } from './model.ts';

/**
 * The contextual toolbar tails of the Google Slides parity rounds (SPEC 3.2 to 3.8; SPEC-2 4.2;
 * R02 sections 4.2 to 4.6): what replaces positions 8 to 17 of the toolbar while something is
 * selected. One ordered list per selection family, in Google's order, every control a
 * `ToolbarControl` of the menu model so its label, key, status, stub clause and predicate come
 * from the one table. The head (positions 1 to 7) never changes and lives in `model.ts` as
 * `TOOLBAR_HEAD`; the default tail with nothing selected is `TOOLBAR_TAIL_DEFAULT` there.
 * Relative imports carry the `.ts` extension so the parity audit script can load this module
 * under Node.
 *
 * A control with `op` is a toolbar operation that is not a menu item (the colour swatches, the
 * font field, the size field, the dash and line end lists); `ToolbarTail.tsx` implements each op.
 * A control with `item` runs that menu item's effect. A control with `arrow` opens that item's
 * submenu as a dropdown (a list of rows, or the item's dynamic plate: the layout grid, a preset
 * grid, the shape picker). Round two flips the round one stubs: Italic and Underline, Border
 * dash, Highlight color, the indents, Border weight and Reset image on a picture, Line dash; adds
 * Change shape, the merge buttons and the chart and group tails; and enables the text controls
 * on a shape (SPEC-2 0.11).
 */
export type TailKind =
  'default' | 'text' | 'shape' | 'image' | 'line' | 'table' | 'chart' | 'group' | 'other';

export type TailOp =
  | 'fillColor'
  | 'borderColor'
  | 'borderWeight'
  | 'borderDash'
  | 'font'
  | 'fontSize'
  | 'textColor'
  | 'highlightColor'
  | 'align'
  | 'spacing'
  | 'lineColor'
  | 'lineWeight'
  | 'lineDash'
  | 'lineStart'
  | 'lineEnd'
  | 'imageBorder'
  | 'crop'
  | 'changeShape'
  | 'chartType'
  | 'legend'
  | 'numberFormat'
  | 'editData'
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
const NO_FILL_DOC = 'Headings, paragraphs and text boxes have no fill';
const NO_BORDER_DOC = 'Headings, paragraphs and text boxes have no border; word art has an outline';
const SELECT_CELLS_DOC = 'Select two or more cells first';
const SELECT_MERGED_DOC = 'Select a merged cell first';

/**
 * Fill, border colour, border weight and border dash, the first four of every object tail (R02
 * 4.2). On a text block the fill needs a box; the border colour and weight need a box or word art
 * (an outlined text block writes its outline, SPEC-2 0.62); the dash needs a box.
 */
function fillAndBorder(family: 'text' | 'shape' | 'table' | 'group'): TailControl[] {
  const textOnly = family === 'text';
  const gate = (predicate: MenuPredicate, reason: string) =>
    textOnly ? { enabled: predicate, disabledReason: reason } : {};
  const fill: TailControl = {
    control: 'toolbar.fillColor',
    label: 'Fill color',
    icon: 'paint-brush',
    status: 'now',
    op: 'fillColor',
    dropdown: true,
    dividerBefore: true,
    doc:
      family === 'table'
        ? 'The fill of the selected cells, or of the column'
        : 'A theme colour, none, or a hex',
    ...gate('boxSelected', NO_FILL_DOC),
  };
  const border: TailControl = {
    control: 'toolbar.borderColor',
    label: 'Border color',
    icon: 'pencil',
    status: 'now',
    op: 'borderColor',
    dropdown: true,
    ...gate('hasBorderField', NO_BORDER_DOC),
  };
  const weight: TailControl = {
    control: 'toolbar.borderWeight',
    label: 'Border weight',
    icon: 'bars-3',
    status: 'now',
    op: 'borderWeight',
    dropdown: true,
    doc: '0, 1, 1.5 or 2',
    ...gate('hasBorderField', NO_BORDER_DOC),
  };
  const dash: TailControl = {
    control: 'toolbar.borderDash',
    label: 'Border dash',
    icon: 'minus',
    status: 'now',
    op: 'borderDash',
    dropdown: true,
    doc: 'Solid, dot, dash, dash dot, long dash or long dash dot',
    ...gate('boxSelected', NO_BORDER_DOC),
  };
  return family === 'table' ? [border, weight, dash, fill] : [fill, border, weight, dash];
}

/** The two merge buttons of the table tail (SPEC-2 4.2): Turboslide additions marked as ours. */
const MERGE_CONTROLS: TailControl[] = [
  {
    control: 'toolbar.mergeCells',
    label: 'Merge cells',
    icon: 'arrows-pointing-in',
    status: 'now',
    item: 'format.table.mergeCells',
    enabled: 'cellRangeSelected',
    disabledReason: SELECT_CELLS_DOC,
    turboslide: true,
  },
  {
    control: 'toolbar.unmergeCells',
    label: 'Unmerge cells',
    icon: 'table-cells',
    status: 'now',
    item: 'format.table.unmergeCells',
    enabled: 'mergedCellSelected',
    disabledReason: SELECT_MERGED_DOC,
    turboslide: true,
  },
];

/** The text controls of SPEC 3.2 rows 12 to 27 with the round two flips (SPEC-2 4.2). */
function textControls(options: { table?: boolean } = {}): TailControl[] {
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
    },
    {
      control: 'toolbar.bold',
      label: 'Bold',
      icon: 'bold',
      key: shortcut('Cmd+B'),
      status: 'now',
      item: 'format.text.bold',
    },
    {
      control: 'toolbar.italic',
      label: 'Italic',
      icon: 'italic',
      key: shortcut('Cmd+I'),
      status: 'now',
      item: 'format.text.italic',
    },
    {
      control: 'toolbar.underline',
      label: 'Underline',
      icon: 'underline',
      key: shortcut('Cmd+U'),
      status: 'now',
      item: 'format.text.underline',
    },
    {
      control: 'toolbar.textColor',
      label: 'Text color',
      icon: 'swatch',
      status: 'now',
      op: 'textColor',
      dropdown: true,
      doc: 'Ink or muted on headings and paragraphs; the theme colours on selected text, text boxes and boxes',
    },
    {
      control: 'toolbar.highlightColor',
      label: 'Highlight color',
      icon: 'paint-brush',
      status: 'now',
      op: 'highlightColor',
      dropdown: true,
      doc: 'A theme colour behind the selected text, or none',
    },
    {
      control: 'toolbar.insertLink',
      label: 'Insert link',
      icon: 'link',
      key: shortcut('Cmd+K'),
      status: 'now',
      item: 'insert.link',
      dividerBefore: true,
    },
    /* SPEC-3 5.3, 13.1: live, absent for a role that cannot comment, disabled in Viewing mode */
    {
      control: 'toolbar.insertComment',
      label: 'Insert comment',
      icon: 'chat',
      key: shortcut('Cmd+Option+M'),
      status: 'now',
      item: 'insert.comment',
      when: 'comment',
      enabled: 'canComment',
      disabledReason: 'Switch to Commenting or Editing under View > Mode to comment',
      doc: 'A comment on the selected object, text or cell, or on the slide',
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
        ? 'Left, Center, Right, Justify, and Top, Middle, Bottom in the cell'
        : 'Left, Center, Right, Justify; Top, Middle, Bottom on a box, shape or text box placed on the slide',
    },
    {
      control: 'toolbar.spacing',
      label: 'Line & paragraph spacing',
      icon: 'bars-arrow-down',
      status: 'now',
      op: 'spacing',
      dropdown: true,
    },
    {
      control: 'toolbar.bulletedList',
      label: 'Bulleted list',
      icon: 'list-bullet',
      key: shortcut('Cmd+Shift+8'),
      status: 'now',
      item: 'format.bulletsNumbering.bulleted',
      arrow: 'format.bulletsNumbering.bulleted',
      doc: 'The first bullet style; the arrow picks another',
    },
    {
      control: 'toolbar.numberedList',
      label: 'Numbered list',
      icon: 'numbered-list',
      key: shortcut('Cmd+Shift+7'),
      status: 'now',
      item: 'format.bulletsNumbering.numbered',
      arrow: 'format.bulletsNumbering.numbered',
      doc: 'The first numbering style; the arrow picks another',
    },
    {
      control: 'toolbar.decreaseIndent',
      label: 'Decrease indent',
      icon: 'bars-arrow-up',
      key: shortcut('Cmd+['),
      status: 'now',
      item: 'format.alignIndent.decreaseIndent',
    },
    {
      control: 'toolbar.increaseIndent',
      label: 'Increase indent',
      icon: 'bars-arrow-down',
      key: shortcut('Cmd+]'),
      status: 'now',
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

/**
 * 3.3 with SPEC-2 0.11: a shape selected; Change shape opens the picker before Fill color (where
 * Google's picker lives for a mask, the nearest place for a shape) and the text controls apply,
 * because a shape holds text now.
 */
const SHAPE_TAIL: TailControl[] = [
  {
    control: 'toolbar.changeShape',
    label: 'Change shape',
    icon: 'square-2-stack',
    status: 'now',
    op: 'changeShape',
    dropdown: true,
    dividerBefore: true,
    turboslide: true,
    doc: 'Another shape, the same size and colours',
  },
  ...fillAndBorder('shape').map((control) => {
    if (control.control !== 'toolbar.fillColor') return control;
    /* Change shape carries the divider; the fill follows it without one */
    const { dividerBefore: _divider, ...rest } = control;
    return rest;
  }),
  ...textControls(),
  FORMAT_OPTIONS,
];

/** 3.4 with SPEC-2 4.2: an image selected; Border weight, Border dash and Reset image apply. */
const IMAGE_TAIL: TailControl[] = [
  {
    control: 'toolbar.borderColor',
    label: 'Border color',
    icon: 'pencil',
    status: 'now',
    op: 'imageBorder',
    dropdown: true,
    dividerBefore: true,
    doc: 'The frame around the picture, a theme colour or none',
  },
  {
    control: 'toolbar.borderWeight',
    label: 'Border weight',
    icon: 'bars-3',
    status: 'now',
    op: 'borderWeight',
    dropdown: true,
    doc: '1, 1.5 or 2',
  },
  {
    control: 'toolbar.borderDash',
    label: 'Border dash',
    icon: 'minus',
    status: 'now',
    op: 'borderDash',
    dropdown: true,
    doc: 'Solid, dot, dash, dash dot, long dash or long dash dot',
  },
  {
    control: 'toolbar.cropImage',
    label: 'Crop image',
    icon: 'viewfinder-circle',
    status: 'now',
    op: 'crop',
    arrow: 'format.image.maskImage',
    doc: 'Drag the handles to crop; the arrow masks the picture with a shape',
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
    status: 'now',
    item: 'format.image.resetImage',
    enabled: 'imageEdited',
    disabledReason: 'The picture is not cropped, masked or adjusted',
  },
  /* SPEC-3 10.5, 13.2: the deck's two tone screen over the picture, on and off, `aria-pressed`
     from the block's field; the Format options Dither section carries the parameters */
  {
    control: 'toolbar.dither',
    label: 'Dither',
    icon: 'squares-2x2',
    status: 'now',
    item: 'format.image.dither',
    turboslide: true,
    doc: 'The deck’s two tone screen over the picture; change it under Format options',
  },
  FORMAT_OPTIONS,
];

/** 3.5 with SPEC-2 4.2: a line or arrow selected; Line dash applies and the ends list ten decorations. */
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
    status: 'now',
    op: 'lineDash',
    dropdown: true,
    doc: 'Solid, dot, dash, dash dot, long dash or long dash dot',
  },
  {
    control: 'toolbar.lineStart',
    label: 'Line start',
    icon: 'arrow-uturn-left',
    status: 'now',
    op: 'lineStart',
    dropdown: true,
    doc: 'None, an arrow, a circle, a square or a diamond, filled or open',
  },
  {
    control: 'toolbar.lineEnd',
    label: 'Line end',
    icon: 'arrow-right',
    status: 'now',
    op: 'lineEnd',
    dropdown: true,
    doc: 'None, an arrow, a circle, a square or a diamond, filled or open',
  },
  FORMAT_OPTIONS,
];

/** 3.6 with SPEC-2 4.2: a table cell selected; the merge buttons follow Fill color. */
const TABLE_TAIL: TailControl[] = [
  ...fillAndBorder('table'),
  ...MERGE_CONTROLS,
  ...textControls({ table: true }),
  FORMAT_OPTIONS,
];

/** SPEC-2 4.2: a chart selected; every control is a Turboslide addition (Google edits charts in Sheets). */
const CHART_TAIL: TailControl[] = [
  {
    control: 'toolbar.chartType',
    label: 'Chart type',
    icon: 'chart-bar',
    status: 'now',
    op: 'chartType',
    dropdown: true,
    dividerBefore: true,
    turboslide: true,
    doc: 'Bar, Column, Line or Pie',
  },
  {
    control: 'toolbar.legend',
    label: 'Legend',
    icon: 'queue-list',
    status: 'now',
    op: 'legend',
    dropdown: true,
    turboslide: true,
    doc: 'None, Right, Bottom, Top or Left',
  },
  {
    control: 'toolbar.numberFormat',
    label: 'Number format',
    icon: 'hashtag',
    status: 'now',
    op: 'numberFormat',
    dropdown: true,
    turboslide: true,
    doc: 'Plain, Thousands, Percent or Currency',
  },
  {
    control: 'toolbar.editData',
    label: 'Edit data',
    text: true,
    status: 'now',
    op: 'editData',
    item: 'format.editData',
    turboslide: true,
    doc: 'The categories and series, in Format options',
  },
  FORMAT_OPTIONS,
];

/** SPEC-2 4.2: a group selected; the object controls that apply to every member at once. */
const GROUP_TAIL: TailControl[] = [...fillAndBorder('group'), FORMAT_OPTIONS];

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
  chart: CHART_TAIL,
  group: GROUP_TAIL,
  other: OTHER_TAIL,
};

/** The Hide the menus chevron: the last control of every tail (SPEC 3.1 row 18). */
export const HIDE_MENUS_CONTROL = 'toolbar.hideMenus';

/**
 * The right end of every tail (SPEC-3 4.4, 6.3, 13.2), drawn apart beside the Hide the menus
 * chevron whatever the selection: the own pointer toggle for editors (`aria-pressed`, the tooltips
 * "Show my pointer" and "Showing my pointer"), and the View only button a viewer sees on the
 * editor route, whose click asks for edit access. Both are present from first paint for their
 * role and absent for the others (`when`), so nothing moves when a role is known.
 */
export const TOOLBAR_TAIL_END: ReadonlyArray<TailControl> = [
  {
    control: 'toolbar.pointer',
    label: 'Show my pointer',
    icon: 'cursor-arrow-rays',
    status: 'now',
    item: 'view.livePointers.mine',
    when: 'write',
    turboslide: true,
    doc: 'Others see where your pointer is on the slide, with your name',
  },
  {
    control: 'toolbar.viewOnly',
    label: 'View only',
    text: true,
    status: 'now',
    effect: { kind: 'action', id: 'share.requestAccess', input: { role: 'editor' } },
    when: 'viewOnly',
    doc: 'You can view this presentation. Click to request edit access',
  },
];

/** The tail for a selection family; the Hide the menus chevron and the tail's end are drawn apart at the far right. */
export function tailFor(kind: TailKind): TailControl[] {
  return TOOLBAR_TAILS[kind].filter((control) => control.control !== HIDE_MENUS_CONTROL);
}

/** The labels of a tail in order, for the tests and the parity audit (SPEC 14.4 item 4). */
export function tailLabels(kind: TailKind): string[] {
  return tailFor(kind).map((control) => control.label);
}

/** At or below this width the tail collapses into the More button (SPEC 0.6, 1.3). */
export const MORE_BREAKPOINT_PX = 1100;
