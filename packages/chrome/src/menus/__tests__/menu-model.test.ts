import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@turboslide/schema/actions';

import { finderRows } from '../finder.ts';
import { assignAccessKeys, buildKeyTable } from '../keys.ts';
import type {
  ContextEntry,
  Menu,
  MenuCapability,
  MenuContext,
  MenuItem,
  MenuStatus,
  Presentable,
  ToolbarControl,
} from '../model.ts';
import {
  CONTEXT_MENUS,
  DEFAULT_MENU_CONTEXT,
  DIVIDER,
  GS1_ACTION_IDS,
  GS2_ACTION_IDS,
  GS3_ACTION_IDS,
  MENUS,
  OMITTED_MENUS,
  TITLE_ROW_ITEMS,
  TOOLBAR_HEAD,
  TOOLBAR_TAIL_DEFAULT,
  actionIdsOf,
  advancedToolsOn,
  allItems,
  contextMenuIds,
  contextMenuItems,
  evaluate,
  findItem,
  hasCapability,
  isChecked,
  isEnabled,
  isPresent,
  itemById,
  itemPath,
  presentControls,
  resolveContextEntries,
  resolveLabel,
  shortcut,
  statusOfChildren,
  tooltipDoc,
  visibleItems,
  visibleMenus,
  walkItems,
} from '../model.ts';
import { STUB_PREFIX, forbiddenWordsIn } from '../strings.ts';
import { TOOLBAR_TAILS, TOOLBAR_TAIL_END } from '../toolbar-tails.ts';

// The menu model (SPEC 2.13, 14.2; SPEC-2 section 4; SPEC-3 section 13): every row of SPEC
// sections 2.0 to 2.10 is in the model with its round three status; every Google item R01 names
// (the fixture, with the round three rows report 01 attests) is in the model; every now item has
// an effect, every later item a stub clause from SPEC-2 section 12 or SPEC-3 13.3, every omit
// item none; every action id exists in the actions table or among the ids of SPEC 7.5, SPEC-2
// section 3 and SPEC-3 section 12; the rows SPEC-2 4.1 and SPEC-3 13.1 flip are counted; the
// toolbar of 3.1 and the card menu of 4.2 are in order; the canvas rows (SPEC-2 section 1) are
// enabled on every slide kind; a row a role cannot use is absent, never disabled (SPEC-3 13.4).

type Row = {
  menu: string;
  status: MenuStatus;
  ids: string[];
  omits?: string[];
  /** the round one status the row had before SPEC-2 4.1 flipped it */
  was?: MenuStatus;
  /** the round two status the row had before SPEC-3 section 13 flipped it */
  was3?: MenuStatus;
};

const row = (
  menu: string,
  status: MenuStatus,
  ids: string[],
  extra: { omits?: string[]; was?: MenuStatus; was3?: MenuStatus } = {},
): Row => ({ menu, status, ids, ...extra });

/**
 * The rows of SPEC 2.0 to 2.10 with the statuses of round two, one entry per table row, in table
 * order, with the model ids each row covers. A row with several Google items (Move slide, Order)
 * lists them all; a container that is itself the row lists itself and its children. `omits` holds
 * items a Now row's note omits; `was` names the round one status of a row SPEC-2 4.1 flipped.
 */
const SPEC_ROWS: Row[] = [
  /* 2.0 the title row; SPEC-3 4.2, 13.1, 13.2 add the presence slot, the inbox and the own chip */
  row('title', 'now', ['title.appIcon']),
  row('title', 'now', ['title.name']),
  row('title', 'omit', ['title.star']),
  row('title', 'omit', ['title.move']),
  row('title', 'now', ['title.saveState']),
  row('title', 'now', ['title.lastEdit']),
  row('title', 'now', [
    'title.presence',
    'title.presence.follow',
    'title.presence.goTo',
    'title.presence.me',
  ]),
  row('title', 'later', ['title.presence.joinChat']),
  /* the product round (docs/PRODUCT.md 6.1, section 2 rank 25): the assistant's entry and the side panel toggle */
  row('title', 'now', ['title.assist']),
  row('title', 'now', ['title.comments'], { was3: 'later' }),
  row('title', 'now', ['title.sidePanel']),
  row('title', 'now', ['title.inbox']),
  row('title', 'omit', ['title.meet', 'title.record']),
  row('title', 'now', ['title.slideshow']),
  row('title', 'now', ['title.share']),
  row(
    'title',
    'now',
    [
      'title.account',
      'title.account.changeName',
      'title.account.changeAvatar',
      'title.account.signIn',
      'title.account.signOut',
      'title.account.forget',
      'title.account.sessions',
    ],
    { was3: 'omit' },
  ),
  row('title', 'omit', ['title.gemini']),
  /* 2.1 File */
  row('file', 'now', ['file.new.presentation']),
  row('file', 'now', ['file.new.templateGallery']),
  row('file', 'now', ['file.open']),
  row('file', 'now', ['file.importSlides']),
  row('file', 'now', ['file.makeCopy.entire']),
  row('file', 'now', ['file.makeCopy.selected']),
  /* the product round (docs/PRODUCT.md 4.3): the deck as a template of this deployment */
  row('file', 'now', ['file.saveAsTemplate']),
  row('file', 'now', ['file.share.withOthers']),
  row('file', 'now', ['file.share.publish']),
  /* SPEC-3 0.16, 13.2: the address without a token */
  row('file', 'now', ['file.share.copyLink']),
  row('file', 'omit', ['file.email.thisFile']),
  /* SPEC-3 13.3: Email collaborators is Google's row, present with its clause until round four */
  row('file', 'later', ['file.email', 'file.email.collaborators'], { was3: 'omit' }),
  row('file', 'now', ['file.download.pptx']),
  /* SPEC-2 12: ODP and SVG are present in Google's position with the download clause */
  row('file', 'later', ['file.download.odp'], { was: 'omit' }),
  row('file', 'now', ['file.download.pdf']),
  /* the product round (docs/PRODUCT.md section 2 rank 8): the whole dialog behind one row */
  row('file', 'now', ['file.download.options']),
  row('file', 'now', ['file.download.txt']),
  row('file', 'now', ['file.download.jpg']),
  row('file', 'now', ['file.download.png']),
  row('file', 'later', ['file.download.svg'], { was: 'omit' }),
  row('file', 'now', ['file.download.html']),
  row('file', 'now', ['file.download.zip']),
  row('file', 'now', ['file.rename']),
  row('file', 'omit', ['file.move', 'file.addShortcut']),
  row('file', 'now', ['file.moveToTrash']),
  row('file', 'now', ['file.versionHistory.nameCurrent']),
  row('file', 'now', ['file.versionHistory.see']),
  /* SPEC-3 5.7, 13.2, 13.3: the panel's Show changes checkbox and its two disabled delete rows */
  row('file', 'now', ['file.versionHistory.showChanges']),
  row('file', 'later', ['file.versionHistory.deleteOlder', 'file.versionHistory.deleteHistory']),
  row('file', 'omit', ['file.approvals']),
  row('file', 'omit', ['file.offline']),
  row('file', 'now', ['file.details']),
  row('file', 'omit', ['file.language']),
  row('file', 'later', ['file.pageSetup']),
  row('file', 'now', ['file.printPreview']),
  row('file', 'now', ['file.print']),
  /* 2.2 Edit */
  row('edit', 'now', ['edit.undo']),
  row('edit', 'now', ['edit.redo']),
  row('edit', 'now', ['edit.cut']),
  row('edit', 'now', ['edit.copy']),
  row('edit', 'now', ['edit.paste']),
  row('edit', 'now', ['edit.pasteWithoutFormatting']),
  row('edit', 'now', ['edit.delete']),
  row('edit', 'now', ['edit.duplicate']),
  row('edit', 'now', ['edit.selectAll']),
  row('edit', 'now', ['edit.selectNone'], { was: 'later' }),
  row('edit', 'now', ['edit.findReplace']),
  /* 2.3 View */
  row('view', 'now', ['view.slideshow']),
  row('view', 'omit', ['view.motion']),
  row('view', 'omit', ['view.themeBuilder']),
  row('view', 'now', ['view.gridView']),
  row('view', 'now', [
    'view.zoom',
    'view.zoom.in',
    'view.zoom.out',
    'view.zoom.fit',
    'view.zoom.50',
    'view.zoom.100',
    'view.zoom.200',
  ]),
  /* SPEC-2 0.77: the rulers and the guides come in with the canvas; Edit guides keeps its clause */
  row('view', 'now', ['view.showRuler'], { was: 'later' }),
  row(
    'view',
    'now',
    [
      'view.guides',
      'view.guides.show',
      'view.guides.addVertical',
      'view.guides.addHorizontal',
      'view.guides.clear',
    ],
    { was: 'later' },
  ),
  row('view', 'later', ['view.guides.edit']),
  row('view', 'now', ['view.snapTo.guides']),
  row('view', 'now', ['view.snapTo.grid']),
  /* SPEC-3 5.3, 13.1: the four display modes flip to Now with Show all comments joining them */
  row(
    'view',
    'now',
    [
      'view.comments',
      'view.comments.showAll',
      'view.comments.expand',
      'view.comments.minimize',
      'view.comments.hide',
    ],
    { was3: 'later' },
  ),
  /* SPEC-3 4.6, 13.1: Google's two Live pointers rows */
  row(
    'view',
    'now',
    ['view.livePointers', 'view.livePointers.mine', 'view.livePointers.collaborators'],
    { was3: 'omit' },
  ),
  row('view', 'now', ['view.showSpeakerNotes']),
  row('view', 'now', ['view.showFilmstrip']),
  row('view', 'now', ['view.mode', 'view.mode.editing', 'view.mode.viewing']),
  /* SPEC-3 5.3, 13.1: the third radio */
  row('view', 'now', ['view.mode.commenting'], { was3: 'omit' }),
  row('view', 'now', ['view.fullScreen']),
  row('view', 'now', ['view.showSections']),
  row('view', 'now', [
    'view.appearance',
    'view.appearance.light',
    'view.appearance.dark',
    'view.appearance.match',
  ]),
  /* 2.4 Insert */
  row('insert', 'now', ['insert.image.upload']),
  row('insert', 'omit', [
    'insert.image.stockWeb',
    'insert.image.drivePhotos',
    'insert.image.camera',
  ]),
  row('insert', 'now', ['insert.image.byUrl']),
  row('insert', 'now', ['insert.image.fromThisPresentation']),
  row('insert', 'now', ['insert.textBox']),
  /* SPEC-2 12: Audio and Video are present with the recording clause */
  row('insert', 'later', ['insert.audio', 'insert.video'], { was: 'omit' }),
  row('insert', 'now', [
    'insert.shape.shapes',
    'insert.shape.shapes.rectangle',
    'insert.shape.shapes.rounded',
    'insert.shape.shapes.ellipse',
  ]),
  /* the Shapes gallery as its own row behind the switch (docs/FOCUS.md section 4, cycle 2 fix round) */
  row('insert', 'now', ['insert.shape.gallery']),
  row('insert', 'now', ['insert.shape.arrows', 'insert.shape.arrows.arrow']),
  row('insert', 'now', ['insert.shape.callouts'], { was: 'later' }),
  row('insert', 'now', ['insert.shape.equation'], { was: 'omit' }),
  row('insert', 'now', ['insert.table']),
  row(
    'insert',
    'now',
    [
      'insert.chart',
      'insert.chart.bar',
      'insert.chart.column',
      'insert.chart.line',
      'insert.chart.pie',
    ],
    { was: 'later' },
  ),
  row('insert', 'omit', ['insert.chart.fromSheets']),
  row('insert', 'now', ['insert.diagram'], { was: 'later' }),
  row('insert', 'now', ['insert.wordArt'], { was: 'omit' }),
  row('insert', 'now', ['insert.line.line', 'insert.line.arrow', 'insert.line.rule']),
  row(
    'insert',
    'now',
    [
      'insert.line.elbowConnector',
      'insert.line.curvedConnector',
      'insert.line.curve',
      'insert.line.polyline',
      'insert.line.scribble',
    ],
    { was: 'omit' },
  ),
  row('insert', 'now', ['insert.specialCharacters'], { was: 'omit' }),
  row('insert', 'omit', ['insert.animation']),
  row('insert', 'now', ['insert.link']),
  /* SPEC-3 5.3, 13.1: the card at the selection */
  row('insert', 'now', ['insert.comment'], { was3: 'later' }),
  row('insert', 'now', ['insert.newSlide']),
  row('insert', 'now', ['insert.slideNumbers']),
  row('insert', 'omit', ['insert.placeholder']),
  row('insert', 'later', ['insert.templates']),
  row('insert', 'later', ['insert.buildingBlocks'], { was: 'omit' }),
  row('insert', 'omit', ['insert.speakerSpotlight']),
  row('insert', 'now', ['insert.icon']),
  row('insert', 'now', ['insert.material']),
  /* 2.5 Format */
  row('format', 'now', ['format.text.bold']),
  row('format', 'now', ['format.text.italic'], { was: 'later' }),
  row('format', 'now', ['format.text.underline'], { was: 'later' }),
  row('format', 'now', ['format.text.strikethrough']),
  row('format', 'now', ['format.text.superscript', 'format.text.subscript'], { was: 'omit' }),
  /* the product round (docs/PRODUCT.md 4.2): the Font row opens the toolbar's dropdown */
  row('format', 'now', ['format.text.font']),
  row('format', 'now', [
    'format.text.size',
    'format.text.size.increase',
    'format.text.size.decrease',
  ]),
  row(
    'format',
    'now',
    [
      'format.text.capitalization',
      'format.text.capitalization.lower',
      'format.text.capitalization.upper',
      'format.text.capitalization.title',
    ],
    { was: 'omit' },
  ),
  row('format', 'now', [
    'format.alignIndent.left',
    'format.alignIndent.center',
    'format.alignIndent.right',
  ]),
  row('format', 'now', ['format.alignIndent.justified'], { was: 'omit' }),
  row('format', 'now', ['format.alignIndent.increaseIndent', 'format.alignIndent.decreaseIndent'], {
    was: 'later',
  }),
  row('format', 'later', ['format.alignIndent.indentationOptions'], { was: 'omit' }),
  row('format', 'now', [
    'format.spacing',
    'format.spacing.single',
    'format.spacing.1_15',
    'format.spacing.1_5',
    'format.spacing.double',
    'format.spacing.custom',
  ]),
  /* SPEC-2 4.1: the two paragraph spacing toggles (R05 B3) */
  row('format', 'now', ['format.spacing.addBefore', 'format.spacing.addAfter']),
  row('format', 'now', ['format.bulletsNumbering.bulleted']),
  row('format', 'now', ['format.bulletsNumbering.numbered']),
  row(
    'format',
    'now',
    ['format.bulletsNumbering.listOptions', 'format.bulletsNumbering.listOptions.moreBullets'],
    { was: 'omit' },
  ),
  row(
    'format',
    'later',
    [
      'format.bulletsNumbering.listOptions.restart',
      'format.bulletsNumbering.listOptions.prefixSuffix',
    ],
    { was: 'omit' },
  ),
  row('format', 'now', [
    'format.table.insertRowAbove',
    'format.table.insertRowBelow',
    'format.table.insertColumnLeft',
    'format.table.insertColumnRight',
    'format.table.deleteRow',
    'format.table.deleteColumn',
    'format.table.deleteTable',
    'format.table.distributeRows',
    'format.table.distributeColumns',
  ]),
  row('format', 'now', ['format.table.mergeCells', 'format.table.unmergeCells'], {
    was: 'later',
  }),
  row('format', 'now', ['format.image.cropImage']),
  row('format', 'now', ['format.image.maskImage'], { was: 'omit' }),
  row('format', 'now', [
    'format.image.replaceImage',
    'format.image.replaceImage.upload',
    'format.image.replaceImage.byUrl',
    'format.image.replaceImage.fromThisPresentation',
  ]),
  row('format', 'now', ['format.image.resetImage'], { was: 'later' }),
  /* the product round (docs/PRODUCT.md section 2 rank 10, 4.4): the caption and the kit's logo */
  row('format', 'now', ['format.image.addCaption']),
  row('format', 'now', ['format.image.useOnEverySlide']),
  /* SPEC-3 10.5, 13.2: the picture's Dither toggle */
  row('format', 'now', ['format.image.dither']),
  row('format', 'now', ['format.image.imageOptions']),
  row('format', 'now', ['format.bordersLines.borderColor', 'format.bordersLines.borderWeight']),
  row(
    'format',
    'now',
    [
      'format.bordersLines.borderDash',
      'format.bordersLines.borderDash.solid',
      'format.bordersLines.borderDash.dot',
      'format.bordersLines.borderDash.dash',
      'format.bordersLines.borderDash.dashDot',
      'format.bordersLines.borderDash.longDash',
      'format.bordersLines.borderDash.longDashDot',
    ],
    { was: 'later' },
  ),
  row('format', 'now', [
    'format.bordersLines.lineStart',
    ...LINE_END_IDS('format.bordersLines.lineStart'),
    'format.bordersLines.lineEnd',
    ...LINE_END_IDS('format.bordersLines.lineEnd'),
  ]),
  row('format', 'now', ['format.formatOptions']),
  row('format', 'now', ['format.clearFormatting']),
  /* 2.6 Slide */
  row('slide', 'now', ['slide.newSlide']),
  row('slide', 'now', ['slide.duplicateSlide']),
  row('slide', 'now', ['slide.deleteSlide']),
  row('slide', 'now', ['slide.skipSlide']),
  row('slide', 'now', [
    'slide.moveSlide',
    'slide.moveSlide.up',
    'slide.moveSlide.down',
    'slide.moveSlide.toBeginning',
    'slide.moveSlide.toEnd',
  ]),
  /* SPEC-2 0.74: one Background dialog on every slide kind; the picture sources left the row */
  row('slide', 'now', ['slide.changeBackground']),
  row('slide', 'now', ['slide.applyLayout']),
  row('slide', 'later', ['slide.transition']),
  /* the product round (docs/PRODUCT.md 4.1): Edit theme opens the Brand kit panel */
  row('slide', 'now', ['slide.editTheme']),
  row('slide', 'now', ['slide.changeTheme']),
  /* 2.7 Arrange */
  row('arrange', 'now', [
    'arrange.order',
    'arrange.order.bringToFront',
    'arrange.order.bringForward',
    'arrange.order.sendBackward',
    'arrange.order.sendToBack',
  ]),
  row('arrange', 'now', [
    'arrange.align',
    'arrange.align.left',
    'arrange.align.center',
    'arrange.align.right',
    'arrange.align.top',
    'arrange.align.middle',
    'arrange.align.bottom',
  ]),
  row('arrange', 'now', [
    'arrange.distribute',
    'arrange.distribute.horizontally',
    'arrange.distribute.vertically',
  ]),
  row('arrange', 'now', [
    'arrange.centerOnPage',
    'arrange.centerOnPage.horizontally',
    'arrange.centerOnPage.vertically',
  ]),
  row(
    'arrange',
    'now',
    [
      'arrange.rotate',
      'arrange.rotate.clockwise',
      'arrange.rotate.counterClockwise',
      'arrange.rotate.flipHorizontally',
      'arrange.rotate.flipVertically',
    ],
    { was: 'later' },
  ),
  row('arrange', 'now', ['arrange.group', 'arrange.ungroup'], { was: 'later' }),
  /* 2.8 Tools */
  row('tools', 'later', ['tools.spelling.spellCheck']),
  row('tools', 'now', ['tools.spelling.underlineErrors']),
  row('tools', 'omit', ['tools.spelling.personalDictionary']),
  row('tools', 'omit', ['tools.explore']),
  row('tools', 'omit', [
    'tools.linkedObjects',
    'tools.dictionary',
    'tools.qaHistory',
    'tools.dictateNotes',
  ]),
  /* SPEC-3 5.5, 13.2: Google's per file row */
  row('tools', 'now', ['tools.notificationSettings']),
  /* the product round (docs/PRODUCT.md section 2 rank 9): the one preference, Link detection */
  row('tools', 'now', ['tools.preferences', 'tools.preferences.linkDetection']),
  /* SPEC-3 0.42, 13.1: the submenu with the one row Turboslide can honour */
  row(
    'tools',
    'now',
    ['tools.accessibilitySettings', 'tools.accessibilitySettings.collaboratorAnnouncements'],
    { was3: 'omit' },
  ),
  row('tools', 'omit', [
    'tools.accessibilitySettings.screenReader',
    'tools.accessibilitySettings.braille',
  ]),
  /* SPEC-3 5.7, 13.1, 13.3: the Activity panel and its one Later tab */
  row('tools', 'now', ['tools.activityDashboard'], { was3: 'omit' }),
  row('tools', 'later', ['tools.activityDashboard.viewers']),
  /* the product round (docs/PRODUCT.md sections 5 and 6): Tailor for a customer and Assist */
  row('tools', 'now', ['tools.tailor']),
  row('tools', 'now', ['tools.assist']),
  row('tools', 'now', ['tools.checkSlides']),
  row('tools', 'now', ['tools.advanced.showSource']),
  row('tools', 'now', ['tools.advanced.sideBySide']),
  row('tools', 'now', ['tools.advanced.suggestionMarks']),
  row('tools', 'now', ['tools.advanced.showIds']),
  row('tools', 'now', ['tools.advanced.renderSlide']),
  row('tools', 'now', ['tools.advanced.changeHistory']),
  row('tools', 'now', ['tools.advanced.sectionsTree']),
  row('tools', 'now', ['tools.advanced.readAsBook']),
  row('tools', 'now', ['tools.advanced.picturesMaterials']),
  row('tools', 'now', ['tools.advanced.runAction']),
  /* 2.9 Extensions */
  row('extensions', 'omit', [
    'extensions.addOns',
    'extensions.addOns.get',
    'extensions.addOns.manage',
    'extensions.installedAddOns',
  ]),
  row('extensions', 'omit', ['extensions.appsScript', 'extensions.appSheet']),
  row('extensions', 'now', ['extensions.agentAccess']),
  row('extensions', 'now', ['extensions.embedInSite']),
  /* 2.10 Help */
  row('help', 'now', ['help.searchMenus']),
  row('help', 'now', ['help.help']),
  row('help', 'omit', ['help.training', 'help.updates']),
  row('help', 'now', ['help.improve'], { was: 'later' }),
  row('help', 'omit', ['help.privacyPolicy', 'help.termsOfService']),
  row('help', 'now', ['help.keyboardShortcuts']),
];

/** The ten decoration rows under Line start and Line end (SPEC-2 2.4.5). */
function LINE_END_IDS(prefix: string): string[] {
  return [
    'none',
    'fillArrow',
    'stealth',
    'fillCircle',
    'fillSquare',
    'fillDiamond',
    'openArrow',
    'openCircle',
    'openSquare',
    'openDiamond',
  ].map((end) => `${prefix}.${end}`);
}

/**
 * Rows outside the SPEC tables: the Slideshow arrow (9.1), the context-only items (4.3, SPEC-2
 * 4.3: Alt text, Drop shadow, Change shape, Edit data, Chart type, Delete guide), Text fitting
 * (SPEC-2 4.3 as a context row; since the focus round a Turboslide row of the Format menu too,
 * docs/FOCUS.md 2.3 and the matrix row `text.format-menu.text-fitting`) and Regroup (R01,
 * unverified; Now since SPEC-2 0.3).
 */
const OTHER_ROWS: Row[] = [
  row('slideshow', 'now', ['title.slideshow.presenterView']),
  row('slideshow', 'now', ['title.slideshow.startFromBeginning']),
  row('slideshow', 'later', ['title.slideshow.presentOnAnotherScreen']),
  row('slideshow', 'omit', ['title.slideshow.displayOptions']),
  row('context', 'now', ['format.altText']),
  row('format', 'now', ['format.textFitting'], { was: 'later' }),
  row('context', 'now', ['format.dropShadow']),
  row('context', 'now', ['format.changeShape']),
  row('context', 'now', ['format.editData']),
  /* SPEC-3 0.27: the Edit HTML panel's row, from the html block's right-click menu */
  row('context', 'now', ['format.editHtml']),
  row('context', 'now', [
    'format.chartType',
    'format.chartType.bar',
    'format.chartType.column',
    'format.chartType.line',
    'format.chartType.pie',
  ]),
  row('context', 'now', ['view.guides.delete']),
  row('arrange', 'now', ['arrange.regroup'], { was: 'omit' }),
  /* the focus round (docs/FOCUS.md 3.1): the one switch that shows the parked set, ours */
  row('tools', 'now', ['tools.advancedTools']),
];

/**
 * The rows per menu as [now, later, omit], counted over the SPEC rows (Regroup included under
 * Arrange as round one did). Round one read [106, 24, 38] over 168 rows (`build/b3a.md` section
 * 3); round two flipped 32 rows (SPEC-2 4.1 and section 12, the View rows included) and added the
 * paragraph spacing row and the split Guides row (Edit guides stays Later on its own), so its
 * tally read [132, 16, 24] over 172 rows. Round three (SPEC-3 section 13) flips nine rows (Show
 * all comments, the own chip, Email collaborators, View > Comments, Live pointers, Commenting,
 * Insert > Comment, Accessibility settings, Activity dashboard) and adds fifteen (the presence
 * slot, Join chat, the inbox, the own chip's menu, Copy link, the Email submenu as Later, Show
 * changes, the two delete rows, Commenting on its own row, Dither, Notification settings, the
 * Accessibility settings submenu's two omitted rows, the Viewers tab), so the tally reads
 * [146, 17, 24] over 187 rows (build-3/b6.md section 2 has the arithmetic per menu).
 */
const COUNTS: Record<string, Counts> = {
  /* twelve since the product round: Assist and the side panel toggle (docs/PRODUCT.md 6.1, section 2 rank 25) */
  title: [12, 1, 4],
  /* the product round adds Save as template and Download options (docs/PRODUCT.md 4.3, section 2 rank 8) */
  file: [26, 5, 5],
  edit: [11, 0, 0],
  view: [16, 1, 2],
  /* 22 with the Shapes gallery as its own row, All shapes (docs/FOCUS.md section 4, cycle 2) */
  insert: [22, 3, 5],
  /* the product round adds Font, Add a caption and Use on every slide (docs/PRODUCT.md 4.2, section 2 rank 10, 4.4) */
  format: [31, 2, 0],
  /* Edit theme opens the Brand kit panel since the product round (docs/PRODUCT.md 4.1) */
  slide: [9, 1, 0],
  arrange: [7, 0, 0],
  /* the product round: Preferences with Link detection, Tailor for a customer and Assist (docs/PRODUCT.md section 2 rank 9, 5, 6) */
  tools: [18, 2, 4],
  extensions: [2, 0, 2],
  help: [4, 0, 2],
};

/**
 * The clauses of SPEC-2 section 12 and SPEC-3 13.3 a Later row may carry after the stub prefix.
 * The comment stub clause of rounds one and two ("Leave a note in the speaker notes instead") is
 * gone: every comment row is Now (SPEC-3 5.3).
 */
const LATER_CLAUSES = new Set<string>([
  'The GT theme presents still slides',
  'Link to a recording instead',
  'Start from the GT brand deck on the home page',
  'The GT theme is 16:9 at 1600 by 900',
  'Drag a guide to move it and right-click it to delete it',
  'Only PowerPoint, PDF, text, pictures and the web page download',
  'Text fitting is set per text box in Format options; the ruler reads inches',
  'Your browser underlines misspellings and offers suggestions on right-click',
  'Numbering starts at 1',
  'Set the indent under Text fitting',
  'Group the members instead',
  'The footer mark, the slide counter and the rails belong to the GT theme',
  'Points are edited by drawing the line again',
  'Border colour applies to the selected cells',
  'Search by name or browse the categories',
  'Presenter view opens a second window you can drag to another screen',
  /* SPEC-3 13.3 */
  'Leave a comment on the slide instead',
  'The invitation carries your message',
  'Named versions are kept; older records thin out after 30 days',
  'Turboslide keeps no record of who viewed a presentation',
]);

/** The comment stub clause of rounds one and two; no row carries it since SPEC-3 5.3. */
const RETIRED_COMMENTS_CLAUSE = 'Leave a note in the speaker notes instead';

/**
 * Rows reachable from a panel rather than a right-click menu (SPEC-3 5.7, 13.2, 13.3): the
 * Version history panel's Show changes checkbox and its two delete rows, and the Activity panel's
 * Viewers tab; they are `contextOnly` so the menu bar never draws them.
 */
const PANEL_ROWS = new Set<string>([
  'file.versionHistory.showChanges',
  'file.versionHistory.deleteOlder',
  'file.versionHistory.deleteHistory',
  'tools.activityDashboard.viewers',
]);

const isContainer = (item: MenuItem): boolean => item.items !== undefined && item.items.length > 0;

type Counts = [number, number, number];
const add = (sum: Counts, [a, b, c]: Counts): Counts => [sum[0] + a, sum[1] + b, sum[2] + c];

/** A context with `count` objects selected on the current slide (a grammar slide unless said). */
function withObjects(
  count: number,
  extra: Partial<MenuContext['selection']> = {},
  slide: Partial<NonNullable<MenuContext['slide']>> = {},
): MenuContext {
  return {
    ...DEFAULT_MENU_CONTEXT,
    focus: 'canvas',
    slide: { ...DEFAULT_MENU_CONTEXT.slide!, ...slide },
    selection: { ...DEFAULT_MENU_CONTEXT.selection, blocks: count, ...extra },
  };
}

/** The capabilities of a role (SPEC-3 6.2), for the role state contexts. */
const CAPABILITIES: Record<'editor' | 'commenter' | 'viewer', MenuCapability[]> = {
  editor: [
    'read',
    'readSkipped',
    'readNotes',
    'readComments',
    'comment',
    'write',
    'history',
    'export',
    'exportNotes',
    'share',
    'rename',
    'copy',
    'trash',
    'restore',
    'publish',
    'presence',
    'follow',
  ],
  commenter: ['read', 'readSkipped', 'readComments', 'comment', 'export', 'copy', 'presence'],
  viewer: ['read', 'export', 'copy', 'presence'],
};

/** A context for a role, with the capabilities of 6.2 (a viewer without the owner's comments switch). */
function asRole(
  role: 'editor' | 'commenter' | 'viewer',
  extra: Partial<MenuContext> = {},
): MenuContext {
  return { ...DEFAULT_MENU_CONTEXT, role, capabilities: CAPABILITIES[role], ...extra };
}

describe('the SPEC rows', () => {
  const rows = [...SPEC_ROWS, ...OTHER_ROWS];

  it('names ids that exist, each with the row status', () => {
    for (const each of rows) {
      for (const id of each.ids) {
        const item = itemById(id);
        expect(item.status, `${id} in a ${each.status} row`).toBe(each.status);
      }
      for (const id of each.omits ?? []) expect(itemById(id).status, id).toBe('omit');
    }
  });

  it('cover every item of the model once, containers aside', () => {
    const covered = new Map<string, number>();
    for (const each of rows) {
      for (const id of [...each.ids, ...(each.omits ?? [])])
        covered.set(id, (covered.get(id) ?? 0) + 1);
    }
    for (const item of allItems()) {
      const times = covered.get(item.id) ?? 0;
      if (isContainer(item) && item.id !== 'title.slideshow') {
        expect(times, `${item.id} listed more than once`).toBeLessThanOrEqual(1);
        continue;
      }
      expect(times, `${item.id} is covered by ${times} rows`).toBe(1);
    }
  });

  it('count per menu as the SPEC tables do with the round two statuses', () => {
    const derived: Record<string, Counts> = {};
    const regroup = OTHER_ROWS.find((each) => each.ids[0] === 'arrange.regroup') as Row;
    for (const each of [...SPEC_ROWS, regroup]) {
      const slot = derived[each.menu] ?? [0, 0, 0];
      slot[each.status === 'now' ? 0 : each.status === 'later' ? 1 : 2] += 1;
      derived[each.menu] = slot;
    }
    for (const [menu, expected] of Object.entries(COUNTS)) {
      expect(derived[menu], menu).toEqual(expected);
    }
    const zero: Counts = [0, 0, 0];
    const total = Object.values(derived).reduce(add, zero);
    /* 147 with the Shapes gallery row, All shapes (docs/FOCUS.md section 4, cycle 2) */
    expect(total).toEqual([158, 15, 24]);
    /* 188 with the Shapes gallery row (docs/FOCUS.md section 4, cycle 2); 197 with the product
       round's nine rows (docs/PRODUCT.md sections 2, 4, 5 and 6) */
    expect(total[0] + total[1] + total[2]).toBe(197);
  });

  it('flips the nine rows of SPEC-3 section 13 away from their round two status, each Now row with a live effect', () => {
    const flipped = rows.filter((each) => each.was3 !== undefined);
    for (const each of flipped) {
      expect(each.status, each.ids.join(', ')).not.toBe(each.was3);
      if (each.status === 'now')
        for (const id of each.ids) expect(itemById(id).effect, id).toBeDefined();
    }
    expect(flipped.map((each) => each.ids[0])).toEqual([
      'title.comments',
      'title.account',
      'file.email',
      'view.comments',
      'view.livePointers',
      'view.mode.commenting',
      'insert.comment',
      'tools.accessibilitySettings',
      'tools.activityDashboard',
    ]);
    /* 13.1: the effects and the role predicates of the flipped rows */
    expect(itemById('title.comments').effect).toEqual({ kind: 'panel', title: 'Comments' });
    expect(itemById('title.comments').when).toBe('readComments');
    expect(itemById('insert.comment').effect).toEqual({ kind: 'client', handler: 'comment' });
    expect(itemById('insert.comment').key).toEqual({ mac: 'Cmd+Option+M', win: 'Ctrl+Alt+M' });
    expect(itemById('insert.comment').when).toBe('comment');
    expect(itemById('insert.comment').enabled).toBe('canComment');
    for (const [id, value] of [
      ['view.comments.showAll', 'all'],
      ['view.comments.expand', 'expanded'],
      ['view.comments.minimize', 'minimized'],
      ['view.comments.hide', 'hidden'],
    ] as const)
      expect(itemById(id).effect, id).toEqual({ kind: 'toggle', setting: 'comments', value });
    expect(itemById('view.comments.hide').key).toEqual({
      mac: 'Cmd+Option+Shift+J',
      win: 'Ctrl+Alt+Shift+J',
    });
    expect(itemById('view.comments').when).toBe('readComments');
    expect(itemById('view.livePointers.mine').effect).toEqual({
      kind: 'toggle',
      setting: 'pointerMine',
    });
    expect(itemById('view.livePointers.mine').when).toBe('write');
    expect(itemById('view.livePointers.collaborators').effect).toEqual({
      kind: 'toggle',
      setting: 'pointerOthers',
    });
    expect(itemById('view.livePointers.collaborators').when).toBeUndefined();
    expect(itemById('view.mode.commenting').effect).toEqual({
      kind: 'toggle',
      setting: 'mode',
      value: 'commenting',
    });
    expect(itemById('view.mode.commenting').when).toBe('comment');
    expect(itemById('view.mode').when).toBe('comment');
    expect(itemById('view.mode.editing').when).toBe('write');
    expect(itemById('tools.accessibilitySettings').effect).toEqual({ kind: 'submenu' });
    expect(itemById('tools.accessibilitySettings.collaboratorAnnouncements').effect).toEqual({
      kind: 'toggle',
      setting: 'announce',
    });
    expect(itemById('tools.activityDashboard').effect).toEqual({
      kind: 'panel',
      title: 'Activity',
    });
    expect(itemById('tools.activityDashboard').when).toBe('activity');
    expect(itemById('title.account').google).toBe('Account avatar');
    expect(itemById('title.account').items?.map((item) => item.label)).toEqual([
      'Change name',
      'Change avatar',
      'Sign in',
      'Sign out',
      'Forget this browser',
      'Sessions',
    ]);
    expect(itemById('title.account.signIn').when).toBe('canSignIn');
    expect(itemById('title.account.signOut').when).toBe('signedIn');
    expect(itemById('title.account.signOut').effect).toEqual({
      kind: 'action',
      id: 'account.signOut',
    });
    expect(itemById('title.account.forget').effect).toEqual({
      kind: 'action',
      id: 'account.forget',
    });
    /* the context menus reach the live Comment row on every target that had the stub */
    for (const target of [
      'filmstripCard',
      'emptyCanvas',
      'textBlock',
      'image',
      'shape',
      'line',
      'group',
      'chart',
    ] as const)
      expect(
        contextMenuIds(target).at(-1) === 'insert.comment' ||
          contextMenuIds(target).includes('insert.comment'),
        target,
      ).toBe(true);
  });

  it('adds the rows of SPEC-3 13.2 with their effects', () => {
    expect(itemById('title.inbox').effect).toEqual({ kind: 'panel', title: 'Notifications' });
    expect(itemById('title.inbox').turboslide).toBe(true);
    expect(itemById('title.presence').google).toBe('Avatar row');
    expect(itemById('title.presence').items?.map((item) => item.id)).toEqual([
      'title.presence.follow',
      'title.presence.goTo',
      'title.presence.joinChat',
      'title.presence.me',
    ]);
    expect(itemById('title.presence.follow').effect).toEqual({
      kind: 'action',
      id: 'presence.follow',
    });
    expect(itemById('title.presence.follow').when).toBe('follow');
    expect(itemById('title.presence.goTo').effect).toEqual({
      kind: 'client',
      handler: 'goToClient',
    });
    expect(itemById('title.presence.joinChat').status).toBe('later');
    expect(itemById('title.presence.joinChat').stubReason).toBe(
      'Leave a comment on the slide instead',
    );
    expect(itemById('title.presence.me').effect).toEqual({
      kind: 'client',
      handler: 'accountMenu',
    });
    expect(itemById('tools.notificationSettings').effect).toEqual({
      kind: 'dialog',
      title: 'Notification settings',
    });
    expect(itemById('tools.notificationSettings').when).toBe('comment');
    expect(itemById('file.share.copyLink').effect).toEqual({ kind: 'client', handler: 'copyLink' });
    expect(itemById('file.share.copyLink').turboslide).toBe(true);
    expect(itemById('file.share.publish').when).toBe('publish');
    expect(itemById('format.image.dither').effect).toEqual({
      kind: 'action',
      id: 'picture.dither',
    });
    expect(itemById('format.image.dither').turboslide).toBe(true);
    expect(contextMenuIds('image')).toContain('format.image.dither');
    expect(itemById('file.versionHistory.showChanges').effect).toEqual({
      kind: 'toggle',
      setting: 'showChanges',
    });
    expect(itemById('file.versionHistory.showChanges').contextOnly).toBe(true);
    /* 13.3: the Later rows with their clauses, present and never omitted */
    for (const [id, clause] of [
      ['title.presence.joinChat', 'Leave a comment on the slide instead'],
      ['file.email.collaborators', 'The invitation carries your message'],
      [
        'file.versionHistory.deleteOlder',
        'Named versions are kept; older records thin out after 30 days',
      ],
      [
        'file.versionHistory.deleteHistory',
        'Named versions are kept; older records thin out after 30 days',
      ],
      [
        'tools.activityDashboard.viewers',
        'Turboslide keeps no record of who viewed a presentation',
      ],
    ] as const) {
      expect(itemById(id).status, id).toBe('later');
      expect(itemById(id).stubReason, id).toBe(clause);
      expect(tooltipDoc(itemById(id), DEFAULT_MENU_CONTEXT), id).toBe(`${STUB_PREFIX}. ${clause}`);
    }
  });

  it('keeps no comment row Later and the old comment clause out of every row (SPEC-3 5.3)', () => {
    for (const item of allItems()) {
      expect(item.stubReason, item.id).not.toBe(RETIRED_COMMENTS_CLAUSE);
      if (/comment/i.test(item.id)) expect(item.status, item.id).not.toBe('later');
    }
    for (const control of TOOLBAR_TAIL_DEFAULT)
      expect(control.stubReason).not.toBe(RETIRED_COMMENTS_CLAUSE);
    expect(
      TOOLBAR_TAIL_DEFAULT.find((control) => control.control === 'toolbar.insertComment')?.status,
    ).toBe('now');
  });

  it('flips the rows of SPEC-2 4.1 and section 12, every one away from its round one status', () => {
    const flipped = rows.filter((each) => each.was !== undefined);
    for (const each of flipped) {
      expect(each.status, each.ids.join(', ')).not.toBe(each.was);
      /* a row that was Later or Omit and is Now names Google's item with a live effect */
      if (each.status === 'now')
        for (const id of each.ids) expect(itemById(id).effect, id).toBeDefined();
    }
    expect(flipped).toHaveLength(32);
    /* the canvas rows of SPEC-2 0.77 are among them */
    for (const id of [
      'view.showRuler',
      'view.guides.show',
      'view.guides.addVertical',
      'view.guides.addHorizontal',
      'view.guides.clear',
      'arrange.rotate',
      'arrange.group',
      'arrange.ungroup',
      'arrange.regroup',
      'edit.selectNone',
    ])
      expect(itemById(id).status, id).toBe('now');
  });

  it('gives every remaining Later row a clause of SPEC-2 section 12 or SPEC-3 13.3 with no engineering word', () => {
    const later = allItems().filter((item) => item.status === 'later');
    expect(later.length).toBeGreaterThan(0);
    for (const item of later) {
      expect(LATER_CLAUSES.has(item.stubReason ?? ''), `${item.id}: ${item.stubReason}`).toBe(true);
      expect(forbiddenWordsIn(item.stubReason ?? ''), item.id).toEqual([]);
    }
    expect(itemById('view.guides.edit').stubReason).toBe(
      'Drag a guide to move it and right-click it to delete it',
    );
  });

  it('marks the twenty Turboslide additions of SPEC 2.12 as ours', () => {
    const twenty = [
      'view.showSections',
      'view.appearance',
      'insert.image.fromThisPresentation',
      'insert.icon',
      'insert.material',
      'tools.checkSlides',
      ...(itemById('tools.advanced').items ?? []).map((item) => item.id),
      'extensions.agentAccess',
      'extensions.embedInSite',
      'file.download.html',
      'file.download.zip',
    ];
    expect(twenty).toHaveLength(20);
    for (const id of twenty) {
      const item = itemById(id);
      expect(item.turboslide, id).toBe(true);
      expect(item.status, id).toBe('now');
    }
    /* the round two additions of SPEC-2 section 10 are marked too */
    for (const id of ['format.changeShape', 'format.editData', 'format.chartType'])
      expect(itemById(id).turboslide, id).toBe(true);
    /* the round three additions of SPEC-3 15: the inbox, the roster rows, the own chip's rows, Copy link, Dither */
    for (const id of [
      'title.inbox',
      'title.presence.follow',
      'title.presence.goTo',
      'title.presence.me',
      'title.account.changeName',
      'title.account.changeAvatar',
      'title.account.signIn',
      'title.account.signOut',
      'title.account.forget',
      'title.account.sessions',
      'file.share.copyLink',
      'format.image.dither',
    ]) {
      expect(itemById(id).turboslide, id).toBe(true);
      expect(itemById(id).status, id).toBe('now');
    }
    /* Google's rows of round three carry no mark */
    for (const id of [
      'title.presence',
      'title.presence.joinChat',
      'title.account',
      'tools.notificationSettings',
      'tools.accessibilitySettings.collaboratorAnnouncements',
      'tools.activityDashboard',
      'view.comments.showAll',
      'view.livePointers.mine',
      'view.mode.commenting',
    ])
      expect(itemById(id).turboslide, id).toBeUndefined();
  });
});

describe('the role predicates of SPEC-3 13.4', () => {
  it('reads a context without capabilities as the owner of a checkout: every row present, the Later rows behind Advanced tools', () => {
    for (const predicate of [
      'write',
      'comment',
      'readComments',
      'readNotes',
      'history',
      'share',
      'settings',
      'publish',
      'copy',
      'export',
      'rename',
      'trash',
      'follow',
      'canComment',
      'activity',
    ] as const)
      expect(evaluate(predicate, DEFAULT_MENU_CONTEXT), predicate).toBe(true);
    expect(evaluate('viewOnly', DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(evaluate('signedIn', DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(evaluate('canSignIn', DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(hasCapability(DEFAULT_MENU_CONTEXT, 'write')).toBe(true);
    /* the two identity rows read the account facts, not a role, and wait for them (7.5) */
    const identityRows = new Set(['title.account.signIn', 'title.account.signOut']);
    const on: MenuContext = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
    };
    for (const item of allItems()) {
      if (identityRows.has(item.id)) {
        expect(isPresent(item, DEFAULT_MENU_CONTEXT), item.id).toBe(false);
        expect(isPresent(item, on), item.id).toBe(false);
        continue;
      }
      /* the focus round (docs/FOCUS.md 3.1): a Later row and a parked row are present only while
         Tools > Advanced tools is on; every other row is present with the switch off too */
      const parked = item.status === 'later' || item.advanced === true;
      expect(isPresent(item, DEFAULT_MENU_CONTEXT), item.id).toBe(!parked);
      expect(isPresent(item, on), item.id).toBe(true);
    }
    for (const menu of MENUS) expect(isPresent(menu, DEFAULT_MENU_CONTEXT), menu.id).toBe(true);
  });

  it('hides the write menus and rows from a viewer, never disables them, and shows the View only state', () => {
    const viewer = asRole('viewer');
    expect(visibleMenus(viewer).map((menu) => menu.id)).toEqual(['file', 'view', 'tools', 'help']);
    for (const id of [
      'title.name',
      'title.saveState',
      'title.comments',
      'file.importSlides',
      'file.rename',
      'file.moveToTrash',
      'file.versionHistory',
      'file.share.publish',
      'view.comments',
      'view.mode',
      'view.livePointers.mine',
      'view.showSpeakerNotes',
      'insert.comment',
      'tools.notificationSettings',
      'tools.activityDashboard',
      'tools.checkSlides',
      'tools.advanced',
    ])
      expect(isPresent(itemById(id), viewer), id).toBe(false);
    for (const id of [
      'title.presence',
      'title.slideshow',
      'title.share',
      'file.makeCopy',
      'file.share.withOthers',
      'file.share.copyLink',
      'file.download',
      'view.zoom',
      'help.help',
    ])
      expect(isPresent(itemById(id), viewer), id).toBe(true);
    /* the parked rows a viewer may use are drawn for them behind Tools > Advanced tools alone
       (docs/FOCUS.md 3.1, 3.2); Open, Details and the collaborator pointers returned to the
       default view in the return round (docs/RETURN.md 2.16, 2.17) */
    const viewerOn = asRole('viewer', {
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
    });
    for (const id of ['title.inbox', 'title.account', 'view.livePointers.collaborators']) {
      expect(isPresent(itemById(id), viewer), id).toBe(false);
      expect(isPresent(itemById(id), viewerOn), id).toBe(true);
    }
    for (const id of ['file.open', 'file.details']) {
      expect(isPresent(itemById(id), viewer), id).toBe(true);
      expect(isPresent(itemById(id), viewerOn), id).toBe(true);
    }
    expect(evaluate('viewOnly', viewer)).toBe(true);
    expect(evaluate('follow', viewer)).toBe(false);
    /* a viewer who may read comments under the owner's switch sees the read surfaces alone; the
       View > Comments submenu returned with the view rows (docs/RETURN.md 2.16), so it follows
       the capability and not the switch */
    const reading = asRole('viewer', { capabilities: [...CAPABILITIES.viewer, 'readComments'] });
    const readingOn = {
      ...reading,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
    };
    expect(isPresent(itemById('title.comments'), reading)).toBe(true);
    expect(isPresent(itemById('view.comments'), viewer)).toBe(false);
    expect(isPresent(itemById('view.comments'), reading)).toBe(true);
    expect(isPresent(itemById('view.comments'), readingOn)).toBe(true);
    expect(isPresent(itemById('insert.comment'), reading)).toBe(false);
    expect(isPresent(itemById('view.mode'), reading)).toBe(false);
    expect(isPresent(itemById('view.mode'), readingOn)).toBe(false);
  });

  it('shows a commenter the Insert menu with its Comment row alone, and Mode with Commenting and Viewing', () => {
    const commenter = asRole('commenter');
    expect(visibleMenus(commenter).map((menu) => menu.id)).toEqual([
      'file',
      'view',
      'insert',
      'tools',
      'help',
    ]);
    const insert = MENUS.find((menu) => menu.id === 'insert')!;
    expect(visibleItems(insert.items, { context: commenter }).map((item) => item.id)).toEqual([
      'insert.comment',
    ]);
    expect(isEnabled(itemById('insert.comment'), commenter)).toBe(true);
    /* View > Mode returned with the view rows (docs/RETURN.md 2.16) and follows the role alone;
       Notification settings and the Activity dashboard stay parked (docs/FOCUS.md 3.2; RETURN.md
       2.16, section 8): their role rules are asserted with the switch on, their absence with it off */
    const commenterOn = asRole('commenter', {
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
    });
    const mode = itemById('view.mode');
    expect(isPresent(mode, commenter)).toBe(true);
    expect(isPresent(mode, commenterOn)).toBe(true);
    expect(visibleItems(mode.items ?? [], { context: commenter }).map((item) => item.id)).toEqual([
      'view.mode.commenting',
      'view.mode.viewing',
    ]);
    expect(isPresent(mode, asRole('viewer'))).toBe(false);
    expect(isPresent(itemById('view.showSpeakerNotes'), commenter)).toBe(false);
    expect(isPresent(itemById('tools.notificationSettings'), commenter)).toBe(false);
    expect(isPresent(itemById('tools.notificationSettings'), commenterOn)).toBe(true);
    expect(isPresent(itemById('tools.spelling'), commenter)).toBe(false);
    expect(isPresent(itemById('tools.spelling'), commenterOn)).toBe(false);
    /* the Activity panel opens for a commenter only when the owner allows it (5.7) */
    expect(isPresent(itemById('tools.activityDashboard'), commenterOn)).toBe(false);
    expect(
      isPresent(
        itemById('tools.activityDashboard'),
        asRole('commenter', { access: { activityForCommenters: true } }),
      ),
    ).toBe(false);
    expect(
      isPresent(
        itemById('tools.activityDashboard'),
        asRole('commenter', {
          access: { activityForCommenters: true },
          settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
        }),
      ),
    ).toBe(true);
    /* the context menus drop the rows a commenter cannot use and keep Comment */
    const card = contextMenuItems('filmstripCard', commenter).map((entry) =>
      entry === DIVIDER ? '-' : entry.id,
    );
    expect(card).toEqual(['insert.comment']);
    const text = contextMenuItems('textBlock', commenter).map((entry) =>
      entry === DIVIDER ? '-' : entry.id,
    );
    expect(text).toEqual(['insert.comment']);
    expect(contextMenuItems('textBlock', asRole('viewer'))).toEqual([]);
    /* an editor sees every row as before; the Extensions menu is parked whole (docs/FOCUS.md 3.2) */
    const editor = asRole('editor');
    expect(visibleMenus(editor).map((menu) => menu.id)).toEqual(
      MENUS.filter((menu) => menu.id !== 'extensions').map((menu) => menu.id),
    );
    expect(
      visibleMenus(
        asRole('editor', { settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true } }),
      ).map((menu) => menu.id),
    ).toEqual(MENUS.map((menu) => menu.id));
    expect(contextMenuItems('filmstripCard', editor).length).toBe(
      contextMenuItems('filmstripCard', DEFAULT_MENU_CONTEXT).length,
    );
  });

  it('disables Comment in Viewing mode with the way back, and checks the three Mode radios and the four display modes', () => {
    expect(isChecked(itemById('view.mode.editing'), DEFAULT_MENU_CONTEXT)).toBe(true);
    expect(isChecked(itemById('view.mode.commenting'), DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(isChecked(itemById('view.mode.viewing'), DEFAULT_MENU_CONTEXT)).toBe(false);
    const viewing = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, mode: 'viewing' },
    };
    expect(isChecked(itemById('view.mode.viewing'), viewing)).toBe(true);
    expect(evaluate('canComment', viewing)).toBe(false);
    expect(isEnabled(itemById('insert.comment'), viewing)).toBe(false);
    expect(tooltipDoc(itemById('insert.comment'), viewing)).toBe(
      'Switch to Commenting or Editing under View > Mode to comment',
    );
    const commenting = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, mode: 'commenting' },
    };
    expect(isEnabled(itemById('insert.comment'), commenting)).toBe(true);
    expect(isChecked(itemById('view.comments.showAll'), DEFAULT_MENU_CONTEXT)).toBe(true);
    expect(isChecked(itemById('view.comments.hide'), DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(isChecked(itemById('view.livePointers.collaborators'), DEFAULT_MENU_CONTEXT)).toBe(true);
    expect(isChecked(itemById('view.livePointers.mine'), DEFAULT_MENU_CONTEXT)).toBe(false);
    /* the own chip's rows read the identity facts; the account menu is parked (docs/FOCUS.md
       3.2), so the facts are read with the switch on and the rows are absent with it off */
    const on = { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true };
    const anonymous = {
      ...DEFAULT_MENU_CONTEXT,
      settings: on,
      account: { signedIn: false, signInAvailable: true },
    };
    expect(isPresent(itemById('title.account.signIn'), anonymous)).toBe(true);
    expect(isPresent(itemById('title.account.signOut'), anonymous)).toBe(false);
    expect(
      isPresent(itemById('title.account.signIn'), {
        ...anonymous,
        settings: DEFAULT_MENU_CONTEXT.settings,
      }),
    ).toBe(false);
    const signedIn = {
      ...DEFAULT_MENU_CONTEXT,
      settings: on,
      account: { signedIn: true, signInAvailable: true },
    };
    expect(isPresent(itemById('title.account.signIn'), signedIn)).toBe(false);
    expect(isPresent(itemById('title.account.signOut'), signedIn)).toBe(true);
    /* without DATABASE_URL the Sign in row is absent (7.3) */
    const noSignIn = {
      ...DEFAULT_MENU_CONTEXT,
      settings: on,
      account: { signedIn: false, signInAvailable: false },
    };
    expect(isPresent(itemById('title.account.signIn'), noSignIn)).toBe(false);
    expect(
      visibleItems(itemById('title.account').items ?? [], { context: noSignIn }).map(
        (item) => item.label,
      ),
    ).toEqual(['Change name', 'Change avatar', 'Forget this browser', 'Sessions']);
  });
});

describe('every Google item of R01', () => {
  type FixtureItem = { label: string; path: string[]; unverified?: boolean };
  type Fixture = { menus: Array<{ menu: string; items: FixtureItem[] }> };
  const fixture = JSON.parse(
    readFileSync(new URL('../__fixtures__/google-menus.json', import.meta.url), 'utf8'),
  ) as Fixture;
  const menus = fixture.menus;

  function rootOf(menu: string): ReadonlyArray<MenuItem> | null {
    if (menu === 'Title row') return TITLE_ROW_ITEMS;
    return MENUS.find((each) => each.label === menu)?.items ?? null;
  }

  function findByPath(
    items: ReadonlyArray<MenuItem>,
    path: string[],
    label: string,
  ): MenuItem | undefined {
    let level = items;
    for (const segment of path) {
      const parent = level.find(
        (item) => (item.google ?? item.label).toLowerCase() === segment.toLowerCase(),
      );
      if (parent?.items === undefined) return undefined;
      level = parent.items;
    }
    return level.find((item) => (item.google ?? item.label).toLowerCase() === label.toLowerCase());
  }

  it('is in the model with a status, or its whole menu is omitted with a reason', () => {
    for (const menu of menus) {
      const root = rootOf(menu.menu);
      if (root === null) {
        const omitted = OMITTED_MENUS.find((each) => each.label === menu.menu);
        expect(omitted, `${menu.menu} is neither a menu nor an omitted menu`).toBeDefined();
        expect(omitted?.reason.length ?? 0).toBeGreaterThan(0);
        continue;
      }
      for (const entry of menu.items) {
        const found = findByPath(root, entry.path, entry.label);
        expect(found, `${menu.menu} > ${[...entry.path, entry.label].join(' > ')}`).toBeDefined();
        expect(['now', 'later', 'omit']).toContain(found?.status);
      }
    }
  });

  it('is the source of every Google item in the model: nothing outside R01 and R05 unless marked as ours or from R08', () => {
    const paths = new Set<string>();
    for (const menu of menus)
      for (const entry of menu.items)
        paths.add([menu.menu, ...entry.path, entry.label].join(' > ').toLowerCase());
    /* R01 describes this submenu by reference ("the same sources as Insert > Image"), so its children are checked under Insert > Image */
    const byReference = new Set(['format.image.replaceImage']);
    const check = (
      menuLabel: string,
      items: ReadonlyArray<MenuItem>,
      path: string[],
      ours: boolean,
    ) => {
      for (const item of items) {
        const here = [...path, item.google ?? item.label];
        const own = ours || item.turboslide === true || item.contextOnly === true;
        if (!own) {
          expect(
            paths.has([menuLabel, ...here].join(' > ').toLowerCase()),
            `${item.id} is not in R01`,
          ).toBe(true);
        }
        if (item.items !== undefined) {
          if (byReference.has(item.id)) {
            for (const child of item.items) {
              expect(
                paths.has(
                  ['Insert', 'Image', child.google ?? child.label].join(' > ').toLowerCase(),
                ) || child.turboslide === true,
                `${child.id} is not an Insert > Image source`,
              ).toBe(true);
            }
          } else {
            check(menuLabel, item.items, here, own);
          }
        }
      }
    };
    check('Title row', TITLE_ROW_ITEMS, [], false);
    for (const menu of MENUS) check(menu.label, menu.items, [], false);
  });

  it('keeps the ten menus in Google’s order', () => {
    expect(MENUS.map((menu) => menu.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Insert',
      'Format',
      'Slide',
      'Arrange',
      'Tools',
      'Extensions',
      'Help',
    ]);
    expect(MENUS.map((menu) => menu.accessKey).join('')).toBe('feviosrtxh');
  });
});

describe('statuses and effects', () => {
  const items = allItems();

  it('has unique dotted ids under the menu that holds them', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const menu of MENUS)
      for (const item of walkItems(menu.items))
        expect(item.id.startsWith(`${menu.id}.`), item.id).toBe(true);
    for (const item of walkItems(TITLE_ROW_ITEMS))
      expect(item.id.startsWith('title.'), item.id).toBe(true);
  });

  it('gives every now item an effect, every later item a stub clause and no effect, every omit item a reason and no effect', () => {
    for (const item of items) {
      if (item.status === 'now') {
        expect(item.effect, `${item.id} has no effect`).toBeDefined();
        expect(item.stubReason, item.id).toBeUndefined();
      } else if (item.status === 'later') {
        expect(item.stubReason?.length ?? 0, `${item.id} has no stub clause`).toBeGreaterThan(0);
        expect(item.effect, `${item.id} is later and has an effect`).toBeUndefined();
        expect(
          item.stubReason?.endsWith('.') ?? true,
          `${item.id}: the clause carries its own period`,
        ).toBe(false);
      } else {
        expect(item.omitReason?.length ?? 0, `${item.id} has no omit reason`).toBeGreaterThan(0);
        expect(item.effect, `${item.id} is omitted and has an effect`).toBeUndefined();
      }
    }
  });

  it('gives a container the status of its children and a submenu effect only while something under it is built', () => {
    /* the Slideshow split button runs the show and Activity dashboard opens its panel: their
       status is their own and their children are the arrow's rows and the panel's Later tab */
    const splits = new Set(['title.slideshow', 'tools.activityDashboard']);
    for (const item of items) {
      if (!isContainer(item) || item.items === undefined) continue;
      if (splits.has(item.id)) {
        expect(item.status, item.id).toBe('now');
        expect(item.effect?.kind, item.id).not.toBe('submenu');
        continue;
      }
      expect(item.status, item.id).toBe(statusOfChildren(item.items));
      if (item.status === 'now') expect(item.effect?.kind, item.id).toBe('submenu');
    }
    expect(itemById('tools.activityDashboard').effect).toEqual({
      kind: 'panel',
      title: 'Activity',
    });
    expect(itemById('tools.activityDashboard.viewers').status).toBe('later');
    expect(itemById('slide.applyLayout').effect).toEqual({
      kind: 'submenu',
      dynamic: 'layouts',
      action: 'slide.applyLayout',
    });
    /* SPEC-2 0.26: Insert > Table is the hover grid plate, whose pick inserts the table */
    expect(itemById('insert.table').effect).toEqual({
      kind: 'submenu',
      dynamic: 'tableGrid',
      action: 'block.insert',
    });
    expect(itemById('insert.table').items).toBeUndefined();
  });

  it('names action ids that exist in the actions table or among the ids of SPEC 7.5, SPEC-2 section 3 and SPEC-3 section 12', () => {
    const known = new Set<string>([
      ...ACTION_IDS,
      ...GS1_ACTION_IDS,
      ...GS2_ACTION_IDS,
      ...GS3_ACTION_IDS,
    ]);
    const used = new Set<string>();
    for (const item of items) {
      for (const id of actionIdsOf(item)) {
        expect(known.has(id), `${item.id} names ${id}`).toBe(true);
        used.add(id);
      }
    }
    /* SPEC-3 0.40, 12: the 64 ids in the table's order, counted once */
    expect(GS3_ACTION_IDS).toHaveLength(64);
    expect(new Set(GS3_ACTION_IDS).size).toBe(64);
    expect(
      GS3_ACTION_IDS.filter(
        (id) =>
          id.startsWith('presence.') ||
          id.startsWith('sync.') ||
          id === 'deck.watch' ||
          id === 'deck.follow',
      ),
    ).toHaveLength(7);
    expect(
      GS3_ACTION_IDS.filter(
        (id) =>
          id.startsWith('comment.') ||
          id.startsWith('notification.') ||
          id === 'activity.list' ||
          id === 'version.diff',
      ),
    ).toHaveLength(17);
    expect(
      GS3_ACTION_IDS.filter(
        (id) => id.startsWith('share.') || id === 'deck.publish' || id === 'deck.unpublish',
      ),
    ).toHaveLength(21);
    expect(GS3_ACTION_IDS.filter((id) => id.startsWith('account.'))).toHaveLength(10);
    expect(GS3_ACTION_IDS.filter((id) => id.startsWith('admin.'))).toHaveLength(5);
    expect(
      GS3_ACTION_IDS.filter(
        (id) => id.startsWith('picture.') || id.startsWith('slide.setBackground'),
      ),
    ).toHaveLength(4);
    for (const id of ['presence.follow', 'account.signOut', 'account.forget', 'picture.dither'])
      expect(used.has(id), `${id} is on no menu`).toBe(true);
    for (const id of [
      'slide.new',
      'slide.duplicate',
      'slide.skip',
      'slide.applyLayout',
      'deck.trash',
      'export.text',
      'view.zoom',
      'view.present',
      'deck.rename',
      'block.order',
      'block.align',
      'block.distribute',
      'asset.add',
      'render.slide',
      'build.run',
      'deck.pack',
      /* round two (SPEC-2 4.1) */
      'block.rotate',
      'block.flip',
      'block.group',
      'block.ungroup',
      'block.regroup',
      'block.mask',
      'block.resetImage',
      'text.style',
      'text.case',
      'text.indent',
      'text.spacing',
      'text.list',
      'table.merge',
      'table.unmerge',
      'chart.setKind',
      'shape.set',
      'line.set',
      'deck.guides',
    ]) {
      expect(used.has(id), `${id} is on no menu`).toBe(true);
    }
    expect(GS1_ACTION_IDS).toHaveLength(14);
    /* SPEC-2 0.93: the 36 ids of section 3, in its order; B1 lands them in the actions table and
       the integrator collapses the list at merge 1 */
    expect(GS2_ACTION_IDS).toHaveLength(36);
    expect(GS2_ACTION_IDS).toContain('slide.toCanvas');
    expect(GS2_ACTION_IDS).toContain('deck.guides');
    expect(new Set(GS2_ACTION_IDS).size).toBe(36);
  });

  it('writes labels in Google’s words: no trailing period, no em dash', () => {
    for (const item of items) {
      expect(item.label.endsWith('.'), item.label).toBe(false);
      expect(item.label.includes('—'), item.label).toBe(false);
      for (const text of [item.doc, item.stubReason, item.disabledReason]) {
        if (text !== undefined) expect(text.includes('—'), text).toBe(false);
      }
    }
  });

  it('follows SPEC 2.0 on the title row with the five fixed slots of SPEC-3 0.43, and 9.1 on the Slideshow arrow', () => {
    expect(TITLE_ROW_ITEMS.filter((item) => item.status !== 'omit').map((item) => item.id)).toEqual(
      [
        'title.appIcon',
        'title.name',
        'title.saveState',
        'title.lastEdit',
        /* the right group, left to right: the presence slot, the comments glyph, the inbox plate, Slideshow, Share, then the own chip */
        'title.presence',
        /* the product round (docs/PRODUCT.md 6.1, section 2 rank 25): Assist, then the side panel toggle after the comments glyph */
        'title.assist',
        'title.comments',
        'title.sidePanel',
        'title.inbox',
        'title.slideshow',
        'title.share',
        'title.account',
      ],
    );
    expect(itemById('title.slideshow').items?.map((item) => item.label)).toEqual([
      'Presenter view',
      'Start from beginning',
      'Present on another screen',
      'Presentation display options',
    ]);
    expect(itemById('title.slideshow').key).toEqual({ mac: 'Cmd+Enter', win: 'Ctrl+F5' });
    /* the main part starts the show: view.present takes { on } (the integrator, merge 2) */
    expect(itemById('title.slideshow').effect).toEqual({
      kind: 'action',
      id: 'view.present',
      input: { on: true },
    });
  });
});

describe('the canvas rows of SPEC-2 section 4', () => {
  it('flips View > Show ruler, Guides, Snap to and Zoom to Now with their effects (0.77)', () => {
    expect(itemById('view.showRuler').effect).toEqual({ kind: 'toggle', setting: 'showRuler' });
    expect(itemById('view.guides.show').effect).toEqual({ kind: 'toggle', setting: 'showGuides' });
    expect(itemById('view.guides.addVertical').effect).toEqual({
      kind: 'action',
      id: 'deck.guides',
      input: { add: [{ axis: 'x', at: 800 }] },
    });
    expect(itemById('view.guides.addHorizontal').effect).toEqual({
      kind: 'action',
      id: 'deck.guides',
      input: { add: [{ axis: 'y', at: 450 }] },
    });
    expect(itemById('view.guides.clear').effect).toEqual({
      kind: 'action',
      id: 'deck.guides',
      input: { clear: true },
    });
    expect(itemById('view.guides.delete').effect).toEqual({ kind: 'action', id: 'deck.guides' });
    expect(itemById('view.guides.delete').contextOnly).toBe(true);
    expect(itemById('view.guides.edit').status).toBe('later');
    expect(itemById('view.snapTo.guides').effect).toEqual({
      kind: 'toggle',
      setting: 'snapGuides',
    });
    expect(itemById('view.snapTo.grid').effect).toEqual({ kind: 'toggle', setting: 'snapGrid' });
    expect(itemById('view.zoom.in').effect).toEqual({ kind: 'client', handler: 'zoomIn' });
    expect(itemById('view.zoom.out').effect).toEqual({ kind: 'client', handler: 'zoomOut' });
    expect(itemById('view.zoom.100').key).toEqual({ mac: 'Cmd+0', win: 'Ctrl+0' });
    expect(TOOLBAR_HEAD.find((control) => control.control === 'toolbar.zoom')?.doc).toContain(
      '1600',
    );
  });

  it('relabels Show ruler as Hide ruler without a check mark, and checks Show guides', () => {
    const ruler = itemById('view.showRuler');
    expect(resolveLabel(ruler, DEFAULT_MENU_CONTEXT)).toBe('Show ruler');
    expect(isChecked(ruler, DEFAULT_MENU_CONTEXT)).toBeUndefined();
    const shown = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, showRuler: true, showGuides: true },
    };
    expect(resolveLabel(ruler, shown)).toBe('Hide ruler');
    expect(isChecked(ruler, shown)).toBeUndefined();
    expect(isChecked(itemById('view.guides.show'), DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(isChecked(itemById('view.guides.show'), shown)).toBe(true);
  });

  it('enables Clear guides and Delete guide only while the presentation holds a guide', () => {
    expect(evaluate('hasGuides', DEFAULT_MENU_CONTEXT)).toBe(false);
    expect(tooltipDoc(itemById('view.guides.clear'), DEFAULT_MENU_CONTEXT)).toBe(
      'Add a guide first',
    );
    const guided = { ...DEFAULT_MENU_CONTEXT, guides: 2 };
    expect(evaluate('hasGuides', guided)).toBe(true);
    expect(tooltipDoc(itemById('view.guides.clear'), guided)).toBe(
      'Removes every guide from the presentation',
    );
    /* a context built before the field existed reads as no guides */
    const { guides: _guides, ...without } = DEFAULT_MENU_CONTEXT;
    expect(evaluate('hasGuides', without as MenuContext)).toBe(false);
  });

  it('writes Center on page as block.align against the sheet (0.80)', () => {
    expect(itemById('arrange.centerOnPage.horizontally').effect).toEqual({
      kind: 'action',
      id: 'block.align',
      input: { edge: 'center', to: 'sheet' },
    });
    expect(itemById('arrange.centerOnPage.vertically').effect).toEqual({
      kind: 'action',
      id: 'block.align',
      input: { edge: 'middle', to: 'sheet' },
    });
    /* Align leaves the reference to the action: the slide for one object, the selection for several */
    for (const edge of ['left', 'center', 'right', 'top', 'middle', 'bottom'])
      expect(itemById(`arrange.align.${edge}`).effect).toEqual({
        kind: 'action',
        id: 'block.align',
        input: { edge },
      });
  });

  it('enables the Arrange rows on a grammar slide with an object selected: every top level block is an object (1.1)', () => {
    const one = withObjects(1);
    expect(one.slide?.freeform).toBe(false);
    for (const id of [
      'arrange.order',
      'arrange.align',
      'arrange.align.left',
      'arrange.centerOnPage',
      'arrange.centerOnPage.horizontally',
      'arrange.rotate',
      'arrange.rotate.clockwise',
      'arrange.rotate.flipHorizontally',
    ])
      expect(evaluate(itemById(id).enabled, one), id).toBe(true);
    /* two for Group and three for Distribute, as Google */
    expect(evaluate(itemById('arrange.group').enabled, one)).toBe(false);
    expect(evaluate(itemById('arrange.distribute').enabled, one)).toBe(false);
    const two = withObjects(2);
    expect(evaluate(itemById('arrange.group').enabled, two)).toBe(true);
    expect(evaluate('twoOrMore', two)).toBe(true);
    expect(evaluate('threeOrMore', two)).toBe(false);
    expect(evaluate(itemById('arrange.distribute.horizontally').enabled, two)).toBe(false);
    const three = withObjects(3);
    expect(evaluate(itemById('arrange.distribute.horizontally').enabled, three)).toBe(true);
    /* Ungroup needs a group, Regroup the remembered set */
    expect(evaluate(itemById('arrange.ungroup').enabled, two)).toBe(false);
    expect(evaluate(itemById('arrange.ungroup').enabled, withObjects(2, { group: 'g1' }))).toBe(
      true,
    );
    expect(evaluate(itemById('arrange.regroup').enabled, two)).toBe(false);
    expect(evaluate(itemById('arrange.regroup').enabled, withObjects(2, { regroup: true }))).toBe(
      true,
    );
    /* a converted slide reads the same */
    expect(
      evaluate(itemById('arrange.rotate').enabled, withObjects(1, {}, { freeform: true })),
    ).toBe(true);
  });

  it('disables the Arrange rows with nothing selected, or with a block the route says is nested', () => {
    for (const id of ['arrange.order', 'arrange.align', 'arrange.centerOnPage', 'arrange.rotate'])
      expect(evaluate(itemById(id).enabled, DEFAULT_MENU_CONTEXT), id).toBe(false);
    expect(tooltipDoc(itemById('arrange.align'), DEFAULT_MENU_CONTEXT)).toBe(
      'Select an object on the slide first',
    );
    expect(tooltipDoc(itemById('arrange.distribute'), withObjects(2))).toBe(
      'Select three or more objects on the slide first',
    );
    expect(tooltipDoc(itemById('arrange.group'), withObjects(1))).toBe(
      'Select two or more objects on the slide first',
    );
    const nested = withObjects(1, { object: false });
    expect(evaluate('objectSelected', nested)).toBe(false);
    expect(evaluate('blockSelected', nested)).toBe(true);
    expect(evaluate('rotatable', withObjects(3, { object: false }))).toBe(false);
  });

  it('keeps the line up sentence of round one out: no row is disabled because of the layout', () => {
    for (const item of allItems()) {
      for (const text of [item.disabledReason, item.doc]) {
        if (text === undefined) continue;
        expect(text.includes('Blank layout'), `${item.id}: ${text}`).toBe(false);
        expect(text.includes('line up automatically'), `${item.id}: ${text}`).toBe(false);
      }
    }
    expect(itemById('slide.changeBackground').effect).toEqual({
      kind: 'dialog',
      title: 'Background',
    });
    expect(itemById('slide.changeBackground').altEffect).toBeUndefined();
    expect(tooltipDoc(itemById('slide.changeBackground'), DEFAULT_MENU_CONTEXT)).toBe(
      'A colour or a picture behind the slide',
    );
  });
});

describe('predicates and labels', () => {
  it('reads the fresh presentation as SPEC 11.1 does', () => {
    const ctx = DEFAULT_MENU_CONTEXT;
    expect(evaluate('canMoveUp', ctx)).toBe(false);
    expect(evaluate('canMoveDown', ctx)).toBe(false);
    expect(evaluate('hasSlide', ctx)).toBe(true);
    expect(evaluate('slideSubsetSelected', ctx)).toBe(false);
    expect(evaluate('canUndo', ctx)).toBe(false);
    expect(evaluate('objectSelected', ctx)).toBe(false);
    expect(evaluate('twoOrMore', ctx)).toBe(false);
    expect(evaluate('pictureLayout', ctx)).toBe(false);
    expect(evaluate('hasGuides', ctx)).toBe(false);
    expect(evaluate('rulerShown', ctx)).toBe(false);
    expect(isChecked(itemById('view.snapTo.guides'), ctx)).toBe(true);
    expect(isChecked(itemById('view.snapTo.grid'), ctx)).toBe(false);
    expect(isChecked(itemById('view.guides.show'), ctx)).toBe(false);
    expect(isChecked(itemById('view.zoom.fit'), ctx)).toBe(true);
    expect(isChecked(itemById('view.zoom.100'), ctx)).toBe(false);
    expect(isChecked(itemById('view.mode.editing'), ctx)).toBe(true);
    expect(isChecked(itemById('edit.undo'), ctx)).toBeUndefined();
  });

  it('relabels Skip slide on a skipped card and reads the disabled reasons and the docs', () => {
    const skipped = {
      ...DEFAULT_MENU_CONTEXT,
      slide: { ...DEFAULT_MENU_CONTEXT.slide!, skipped: true },
    };
    expect(resolveLabel(itemById('slide.skipSlide'), DEFAULT_MENU_CONTEXT)).toBe('Skip slide');
    expect(resolveLabel(itemById('slide.skipSlide'), skipped)).toBe('Unskip slide');
    expect(tooltipDoc(itemById('slide.transition'), DEFAULT_MENU_CONTEXT)).toBe(
      `${STUB_PREFIX}. The GT theme presents still slides`,
    );
    expect(tooltipDoc(itemById('format.bulletsNumbering.bulleted'), DEFAULT_MENU_CONTEXT)).toBe(
      'Nine bullet styles; the button and the key apply the first',
    );
    /* SPEC-2 4.1: the paragraph spacing rows read Remove while the space is set */
    const spaced = withObjects(1, { textBlock: true, spaceBefore: true });
    expect(resolveLabel(itemById('format.spacing.addBefore'), spaced)).toBe(
      'Remove space before paragraph',
    );
    expect(resolveLabel(itemById('format.spacing.addAfter'), spaced)).toBe(
      'Add space after paragraph',
    );
  });

  it('reads the selection families of round two', () => {
    const cellRange = withObjects(1, {
      block: 'table',
      textBlock: true,
      tableCell: true,
      cells: { r0: 0, c0: 0, r1: 1, c1: 1 },
    });
    expect(evaluate('cellRangeSelected', cellRange)).toBe(true);
    expect(evaluate('mergedCellSelected', cellRange)).toBe(false);
    expect(evaluate('hasBorderField', cellRange)).toBe(true);
    const picture = withObjects(1, { block: 'image', imageEdited: true });
    expect(evaluate('imageSelected', picture)).toBe(true);
    expect(evaluate('imageEdited', picture)).toBe(true);
    expect(evaluate('coversSheet', picture)).toBe(false);
    expect(evaluate('coversSheet', withObjects(1, { block: 'image', coversSheet: true }))).toBe(
      true,
    );
    expect(evaluate('hasBorderField', withObjects(1, { block: 'text', textBlock: true }))).toBe(
      false,
    );
    expect(
      evaluate(
        'hasBorderField',
        withObjects(1, { block: 'text', textBlock: true, outlined: true }),
      ),
    ).toBe(true);
    expect(evaluate('chartSelected', withObjects(1, { block: 'chart' }))).toBe(true);
    expect(evaluate('linkable', withObjects(3))).toBe(false);
    expect(evaluate('linkable', withObjects(1))).toBe(true);
  });

  it('assigns one access key per sibling', () => {
    for (const menu of MENUS) {
      const check = (items: ReadonlyArray<MenuItem>) => {
        const keys = items.filter((item) => item.status !== 'omit').map((item) => item.accessKey);
        expect(
          keys.every((key) => key !== undefined),
          menu.id,
        ).toBe(true);
        expect(new Set(keys).size, `${menu.id}: ${keys.join('')}`).toBe(keys.length);
        for (const item of items) if (item.items !== undefined) check(item.items);
      };
      check(assignAccessKeys(menu.items));
    }
  });

  it('spells the path of an item from the menu title down', () => {
    expect(itemPath('file.download.pdf')).toEqual(['File', 'Download', 'PDF Document (.pdf)']);
    expect(itemPath('title.slideshow.presenterView')).toEqual([
      'Title row',
      'Slideshow',
      'Presenter view',
    ]);
    expect(itemPath('view.guides.delete')).toEqual(['View', 'Guides', 'Delete guide']);
    expect(findItem('nothing.here')).toBeUndefined();
  });
});

describe('the toolbar of SPEC 3.1 and the right-click menus of 4.2, 4.3 and SPEC-2 4.3', () => {
  it('orders the head and the default tail by control id', () => {
    expect(TOOLBAR_HEAD.map((control) => control.control)).toEqual([
      'toolbar.search',
      'toolbar.newSlide',
      'toolbar.undo',
      'toolbar.redo',
      'toolbar.print',
      'toolbar.paintFormat',
      'toolbar.zoom',
    ]);
    expect(TOOLBAR_TAIL_DEFAULT.map((control) => control.control)).toEqual([
      'toolbar.select',
      'toolbar.textBox',
      'toolbar.insertImage',
      'toolbar.insertShape',
      'toolbar.insertLine',
      'toolbar.insertComment',
      'toolbar.background',
      'toolbar.layout',
      'toolbar.theme',
      'toolbar.transition',
      'toolbar.hideMenus',
    ]);
    for (const control of [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT]) {
      if (control.item !== undefined) expect(findItem(control.item), control.control).toBeDefined();
      if (control.arrow !== undefined)
        expect(findItem(control.arrow), control.control).toBeDefined();
      if (control.status === 'later')
        expect(control.stubReason?.length ?? 0, control.control).toBeGreaterThan(0);
    }
    /* SPEC-3 5.3: Insert comment is live; Transition is the one Later control of the default tail */
    expect(
      TOOLBAR_TAIL_DEFAULT.filter((control) => control.status === 'later').map(
        (control) => control.label,
      ),
    ).toEqual(['Transition']);
  });

  it('lists the card menu in the order of SPEC 4.2', () => {
    /* the Later row Transition is drawn behind Tools > Advanced tools (docs/FOCUS.md 3.1) */
    const on: MenuContext = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
    };
    const labelsOf = (ctx: MenuContext) =>
      contextMenuItems('filmstripCard', ctx).map((entry) =>
        entry === DIVIDER ? '-' : resolveLabel(entry, ctx),
      );
    const order = [
      'Cut',
      'Copy',
      'Paste',
      '-',
      'New slide',
      'Duplicate slide',
      'Delete',
      'Skip slide',
      '-',
      'Change background',
      'Apply layout',
      'Change theme',
      'Transition',
      '-',
      'Move slide',
      '-',
      'Comment',
    ];
    expect(labelsOf(on)).toEqual(order);
    /* with the switch off the Later row leaves (docs/FOCUS.md 3.4); Change theme returned with
       the return round (docs/RETURN.md 2.13) and stays in the card menu */
    expect(labelsOf(DEFAULT_MENU_CONTEXT)).toEqual(order.filter((label) => label !== 'Transition'));
  });

  it('builds every right-click menu from menu bar items, dividers between the groups of 4.3', () => {
    for (const target of Object.keys(CONTEXT_MENUS) as Array<keyof typeof CONTEXT_MENUS>) {
      for (const id of contextMenuIds(target)) {
        expect(findItem(id), `${target}: ${id}`).toBeDefined();
        expect(itemById(id).status, `${target}: ${id} is omitted`).not.toBe('omit');
      }
    }
    /* the parked rows of docs/FOCUS.md 3.4 (Guides, Change theme, superscript, subscript,
       capitalization, the table rows) returned in the return round (docs/RETURN.md 2.4, 2.11,
       2.13, 2.17) and are drawn in both contexts; the Later row Transition and the parked Alt
       text and Drop shadow (RETURN.md section 9, questions 6 and 7) stay behind the switch */
    const on: MenuContext = {
      ...DEFAULT_MENU_CONTEXT,
      settings: { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true },
    };
    /* SPEC-2 0.91: Guides ▸ after Comment, Google's row 7 */
    const empty = contextMenuItems('emptyCanvas', on);
    expect(empty.filter((entry) => entry === DIVIDER)).toHaveLength(4);
    expect(empty.at(-1)).toBe(itemById('view.guides'));
    const emptyOff = contextMenuItems('emptyCanvas', DEFAULT_MENU_CONTEXT);
    expect(emptyOff.filter((entry) => entry === DIVIDER)).toHaveLength(4);
    expect(emptyOff.at(-1)).toBe(itemById('view.guides'));
    expect(emptyOff.some((entry) => entry !== DIVIDER && entry.id === 'slide.transition')).toBe(
      false,
    );
    const textOff = contextMenuItems('textBlock', DEFAULT_MENU_CONTEXT).map((entry) =>
      entry === DIVIDER ? '-' : entry.id,
    );
    /* Alt text returned to the default view in the product round (docs/PRODUCT.md section 5) */
    expect(textOff).toContain('format.altText');
    expect(textOff).not.toContain('format.dropShadow');
    expect(textOff).toContain('arrange.rotate');
    expect(textOff).toContain('arrange.group');
    for (const ctx of [DEFAULT_MENU_CONTEXT, on])
      expect(
        contextMenuItems('textSelection', ctx).map((entry) => (entry === DIVIDER ? '-' : entry.id)),
      ).toEqual([
        'edit.cut',
        'edit.copy',
        'edit.paste',
        'edit.pasteWithoutFormatting',
        '-',
        'format.text.italic',
        'format.text.underline',
        'format.text.strikethrough',
        'format.text.superscript',
        'format.text.subscript',
        'format.text.capitalization',
        '-',
        'insert.link',
        '-',
        'format.formatOptions',
      ]);
    /* the table rows returned with the tables (docs/RETURN.md 2.4): the cell menu lists its 16
       rows (audit-objects row 60), the two merge rows among them in the default view since the
       fix round gave the Editor a cell range (return/build/b5.md "Return round fix round"; the
       integration had re-parked them, return/build/integrator.md section 6) */
    for (const [ctx, tableRows, all] of [
      [DEFAULT_MENU_CONTEXT, 11, 16],
      [on, 11, 16],
    ] as const) {
      const cell = contextMenuItems('tableCell', ctx);
      expect(
        cell.filter((entry) => entry !== DIVIDER && entry.id.startsWith('format.table.')),
      ).toHaveLength(tableRows);
      expect(cell.filter((entry) => entry !== DIVIDER)).toHaveLength(all);
    }
    /* the merge rows lead the range menu in both views since the fix round returned them */
    for (const ctx of [on, DEFAULT_MENU_CONTEXT])
      expect(
        contextMenuItems('cellRange', ctx)
          .slice(0, 4)
          .map((entry) => (entry === DIVIDER ? '-' : entry.id)),
      ).toEqual([
        'format.table.mergeCells',
        'format.table.unmergeCells',
        'format.table.distributeRows',
        'format.table.distributeColumns',
      ]);
  });

  it('draws the object menus of SPEC-2 4.3 with the Arrange rows on every target', () => {
    for (const target of ['textBlock', 'image', 'shape', 'line', 'group', 'chart'] as const) {
      const ids = contextMenuIds(target);
      for (const id of ['edit.cut', 'edit.copy', 'edit.paste', 'arrange.order', 'arrange.rotate'])
        expect(ids, `${target} lacks ${id}`).toContain(id);
      expect(ids, `${target} lacks Format options`).toContain('format.formatOptions');
      expect(ids, `${target} lacks Alt text`).toContain('format.altText');
    }
    expect(contextMenuIds('shape')).toContain('format.changeShape');
    expect(contextMenuIds('line')).toContain('format.bordersLines.lineStart');
    expect(contextMenuIds('line')).not.toContain('format.textFitting');
    expect(contextMenuIds('group')[0]).toBe('arrange.ungroup');
    expect(contextMenuIds('chart')).toContain('format.editData');
    expect(contextMenuIds('chart')).toContain('format.chartType');
    expect(contextMenuIds('image')).toContain('format.image.maskImage');
    /* SPEC-2 4.3: the image menu joins Rotate and Group between Order and Center on page (R08 A9) */
    const image = contextMenuIds('image');
    expect(image.indexOf('arrange.order')).toBeLessThan(image.indexOf('arrange.rotate'));
    expect(image.indexOf('arrange.rotate')).toBeLessThan(image.indexOf('arrange.group'));
    expect(image.indexOf('arrange.group')).toBeLessThan(image.indexOf('arrange.centerOnPage'));
  });

  it('appends Change background and Guides to a picture object that covers the sheet (0.100), and gives a guide its two rows', () => {
    const plain = contextMenuItems('image', withObjects(1, { block: 'image' }));
    expect(plain.some((entry) => entry !== DIVIDER && entry.id === 'slide.changeBackground')).toBe(
      false,
    );
    /* Guides returned with the guides (docs/RETURN.md 2.17): the three appended rows are drawn in
       both contexts */
    const on = { ...DEFAULT_MENU_CONTEXT.settings, advancedTools: true };
    for (const settings of [DEFAULT_MENU_CONTEXT.settings, on]) {
      const covering = contextMenuItems('image', {
        ...withObjects(1, { block: 'image', coversSheet: true }),
        settings,
      });
      const plainCtx = contextMenuItems('image', {
        ...withObjects(1, { block: 'image' }),
        settings,
      });
      const tail = covering.slice(-3).map((entry) => (entry === DIVIDER ? '-' : entry.id));
      expect(tail).toEqual(['-', 'slide.changeBackground', 'view.guides']);
      expect(covering.length).toBe(plainCtx.length + 3);
    }
    /* Edit guides is Later and hides with the switch off (docs/FOCUS.md 3.1); Delete guide
       returned with Guides, so a guide line draws that one row with the switch off and both with
       it on */
    expect(
      contextMenuItems('guide', { ...DEFAULT_MENU_CONTEXT, settings: on }).map((entry) =>
        entry === DIVIDER ? '-' : entry.id,
      ),
    ).toEqual(['view.guides.delete', 'view.guides.edit']);
    expect(
      contextMenuItems('guide', DEFAULT_MENU_CONTEXT).map((entry) =>
        entry === DIVIDER ? '-' : entry.id,
      ),
    ).toEqual(['view.guides.delete']);
    /* the regroup row shows on a group menu only while the editor remembers an ungrouped set;
       Regroup returned with the group rows (docs/RETURN.md 2.12), so the rule reads the same in
       both contexts */
    for (const settings of [DEFAULT_MENU_CONTEXT.settings, on]) {
      expect(
        contextMenuItems('group', { ...withObjects(2, { group: 'g1' }), settings }).some(
          (entry) => entry !== DIVIDER && entry.id === 'arrange.regroup',
        ),
      ).toBe(false);
      expect(
        contextMenuItems('group', { ...withObjects(2, { regroup: true }), settings }).some(
          (entry) => entry !== DIVIDER && entry.id === 'arrange.regroup',
        ),
      ).toBe(true);
    }
  });

  it('reaches the context-only items from a right-click menu or a panel', () => {
    const inContext = new Set<string>();
    for (const target of Object.keys(CONTEXT_MENUS) as Array<keyof typeof CONTEXT_MENUS>)
      for (const id of contextMenuIds(target)) {
        inContext.add(id);
        /* a submenu row on a context menu reaches its children too (Guides ▸ Delete guide is its own target) */
        for (const child of itemById(id).items ?? []) inContext.add(child.id);
      }
    for (const item of allItems().filter((each) => each.contextOnly === true))
      expect(inContext.has(item.id) || PANEL_ROWS.has(item.id), item.id).toBe(true);
    for (const id of PANEL_ROWS) expect(itemById(id).contextOnly, id).toBe(true);
  });
});

describe('Tools > Advanced tools, the switch of the focus round (docs/FOCUS.md 3.1)', () => {
  const OFF: MenuContext = DEFAULT_MENU_CONTEXT;
  const ON: MenuContext = { ...OFF, settings: { ...OFF.settings, advancedTools: true } };
  /** A row or control the switch decides: flagged `advanced`, or a Later stub. */
  const parked = (entry: Presentable): boolean =>
    entry.advanced === true || entry.status === 'later';
  const idOf = (entry: MenuItem | typeof DIVIDER): string => (entry === DIVIDER ? '-' : entry.id);
  const flagged: MenuItem = {
    id: 'x.flagged',
    label: 'Flagged',
    status: 'now',
    advanced: true,
    effect: { kind: 'action', id: 'deck.info' },
  };

  it('is one check row of the Tools menu after Check slides and before Advanced, ours, off by default', () => {
    const item = itemById('tools.advancedTools');
    expect(item.status).toBe('now');
    expect(item.turboslide).toBe(true);
    expect(item.advanced).toBeUndefined();
    expect(item.effect).toEqual({ kind: 'toggle', setting: 'advancedTools' });
    expect(item.label).toBe('Advanced tools');
    expect(forbiddenWordsIn(item.doc ?? '')).toEqual([]);
    const tools = MENUS.find((menu) => menu.id === 'tools');
    const ids = (tools?.items ?? []).map((each) => each.id);
    expect(ids.indexOf('tools.advancedTools')).toBe(ids.indexOf('tools.checkSlides') + 1);
    expect(ids.indexOf('tools.advanced')).toBe(ids.indexOf('tools.advancedTools') + 1);
    expect(DEFAULT_MENU_CONTEXT.settings.advancedTools).toBeUndefined();
    expect(advancedToolsOn(OFF)).toBe(false);
    expect(advancedToolsOn(ON)).toBe(true);
    expect(isChecked(item, OFF)).toBe(false);
    expect(isChecked(item, ON)).toBe(true);
    /* the switch itself is never parked */
    expect(isPresent(item, OFF)).toBe(true);
    expect(isPresent(item, ON)).toBe(true);
  });

  it('draws Text fitting in the Format menu with the switch off, and keeps it on the text block menu (docs/FOCUS.md 2.3; VERIFICATION F18)', () => {
    const item = itemById('format.textFitting');
    expect(item.status).toBe('now');
    expect(item.contextOnly).toBeUndefined();
    expect(item.advanced).toBeUndefined();
    /* Google keeps the section inside Format options alone, so the menu row is ours */
    expect(item.turboslide).toBe(true);
    const format = MENUS.find((menu) => menu.id === 'format');
    const bar = visibleItems(format?.items ?? [], { context: OFF }).map((each) => each.id);
    expect(bar).toContain('format.textFitting');
    expect(contextMenuIds('textBlock')).toContain('format.textFitting');
    expect(finderRows(OFF).some((row) => row.item.id === 'format.textFitting')).toBe(true);
  });

  it('hides a flagged row and a Later row while off, draws both while on, and keeps the action registered', () => {
    expect(isPresent(flagged, OFF)).toBe(false);
    expect(isPresent(flagged, ON)).toBe(true);
    expect(actionIdsOf(flagged)).toEqual(['deck.info']);
    const later = itemById('title.presence.joinChat');
    expect(later.status).toBe('later');
    expect(isPresent(later, OFF)).toBe(false);
    expect(isPresent(later, ON)).toBe(true);
    /* the role predicate still applies with the switch on */
    expect(isPresent({ ...flagged, when: 'viewOnly' }, ON)).toBe(false);
    expect(isPresent({ ...flagged, when: 'write' }, ON)).toBe(true);
    /* a toolbar control reads the same rule */
    const control: ToolbarControl = {
      control: 'toolbar.x',
      label: 'X',
      status: 'now',
      advanced: true,
    };
    expect(presentControls([control], OFF)).toEqual([]);
    expect(presentControls([control], ON)).toEqual([control]);
    expect(presentControls([{ ...control, advanced: undefined }], OFF)).toHaveLength(1);
  });

  it('drops a plain container whose rows are all parked, keeps a split row, and drops a menu with no visible row', () => {
    const later: MenuItem = { id: 'x.later', label: 'Later', status: 'later', stubReason: 'Soon' };
    const items: MenuItem[] = [
      {
        id: 'x.plain',
        label: 'Plain',
        status: 'now',
        effect: { kind: 'submenu' },
        items: [flagged],
      },
      {
        id: 'x.split',
        label: 'Split',
        status: 'now',
        effect: { kind: 'action', id: 'deck.info' },
        items: [later],
      },
      { id: 'x.row', label: 'Row', status: 'now', effect: { kind: 'dialog', title: 'Row' } },
      flagged,
    ];
    expect(visibleItems(items, { context: OFF }).map((each) => each.id)).toEqual([
      'x.split',
      'x.row',
    ]);
    expect(visibleItems(items, { context: ON }).map((each) => each.id)).toEqual([
      'x.plain',
      'x.split',
      'x.row',
      'x.flagged',
    ]);
    /* without a context the filter reads as before the round: nothing is hidden */
    expect(visibleItems(items).map((each) => each.id)).toEqual([
      'x.plain',
      'x.split',
      'x.row',
      'x.flagged',
    ]);
    const menu: Menu = {
      id: 'extensions',
      label: 'X',
      accessKey: 'x',
      key: shortcut('Cmd+Option+X'),
      items: [flagged, later],
    };
    expect(visibleMenus(OFF, [menu])).toEqual([]);
    expect(visibleMenus(ON, [menu])).toEqual([menu]);
    /* the model's own data: Extensions is the one menu whose rows are all parked (3.2) */
    expect(visibleMenus(OFF).map((each) => each.id)).toEqual(
      MENUS.filter((each) => each.id !== 'extensions').map((each) => each.id),
    );
    expect(visibleMenus(ON).map((each) => each.id)).toEqual(MENUS.map((each) => each.id));
  });

  it('parks a right-click entry on one target with `advanced`, and drops a parked item on every target', () => {
    const entries: ContextEntry[] = [
      'edit.cut',
      DIVIDER,
      { id: 'edit.copy', advanced: true },
      DIVIDER,
      'edit.paste',
    ];
    expect(resolveContextEntries(entries, OFF).map(idOf)).toEqual(['edit.cut', '-', 'edit.paste']);
    expect(resolveContextEntries(entries, ON).map(idOf)).toEqual([
      'edit.cut',
      '-',
      'edit.copy',
      '-',
      'edit.paste',
    ]);
    /* the item in the menu bar is untouched by an entry level flag */
    expect(isPresent(itemById('edit.copy'), OFF)).toBe(true);
    /* the model's own data: the guide target's Later row hides with the switch off and Delete
       guide, returned with Guides in the return round (docs/RETURN.md 2.17), stays */
    expect(contextMenuItems('guide', OFF).map(idOf)).toEqual(['view.guides.delete']);
    expect(contextMenuItems('guide', ON).map(idOf)).toEqual([
      'view.guides.delete',
      'view.guides.edit',
    ]);
  });

  it("changes every surface's visible set by exactly the parked rows and controls between the two contexts", () => {
    /* an item absent off and present on is parked, or a plain container whose rows are all absent off */
    const explained = (item: MenuItem): boolean =>
      parked(item) ||
      (item.items !== undefined &&
        item.effect?.kind === 'submenu' &&
        item.effect.dynamic === undefined &&
        visibleItems(item.items, { contextOnly: true, context: OFF }).length === 0);
    const tree = (items: ReadonlyArray<MenuItem>, ctx: MenuContext): MenuItem[] =>
      visibleItems(items, { contextOnly: true, context: ctx }).flatMap((item) => [
        item,
        ...(item.items === undefined ? [] : tree(item.items, ctx)),
      ]);
    let differences = 0;
    const compare = (
      label: string,
      off: ReadonlyArray<string>,
      on: ReadonlyArray<string>,
      isParked: (id: string) => boolean,
    ) => {
      const offSet = new Set(off);
      const onSet = new Set(on);
      for (const id of off)
        expect(onSet.has(id), `${label}: ${id} present off, absent on`).toBe(true);
      for (const id of on)
        if (!offSet.has(id)) {
          differences += 1;
          expect(isParked(id), `${label}: ${id} absent off without a parked reason`).toBe(true);
        }
    };
    /* the menu bar */
    compare(
      'menus',
      visibleMenus(OFF).map((menu) => menu.id),
      visibleMenus(ON).map((menu) => menu.id),
      (id) => {
        const menu = MENUS.find((each) => each.id === id);
        return (
          menu !== undefined && menu.items.filter((each) => each.status !== 'omit').every(parked)
        );
      },
    );
    /* every menu's rows and submenus, and the title row */
    for (const [label, items] of [
      ['title', TITLE_ROW_ITEMS] as const,
      ...MENUS.map((menu) => [menu.id, menu.items] as const),
    ]) {
      const onItems = tree(items, ON);
      const byId = new Map(onItems.map((item) => [item.id, item]));
      compare(
        label,
        tree(items, OFF).map((item) => item.id),
        onItems.map((item) => item.id),
        (id) => {
          const item = byId.get(id);
          if (item === undefined) return false;
          if (explained(item)) return true;
          /* a row under a parked or emptied container is absent with it */
          const parents = itemPath(id).slice(1, -1);
          return walkItems(items).some(
            (each) =>
              parents.includes(each.label) &&
              each.items?.some((child) => child.id === id) &&
              explained(each),
          );
        },
      );
    }
    /* every right-click target */
    for (const target of Object.keys(CONTEXT_MENUS) as Array<keyof typeof CONTEXT_MENUS>) {
      const on = contextMenuItems(target, ON).filter((entry) => entry !== DIVIDER) as MenuItem[];
      const byId = new Map(on.map((item) => [item.id, item]));
      compare(
        `context ${target}`,
        (contextMenuItems(target, OFF).filter((entry) => entry !== DIVIDER) as MenuItem[]).map(
          (item) => item.id,
        ),
        on.map((item) => item.id),
        (id) => {
          const item = byId.get(id);
          return item !== undefined && explained(item);
        },
      );
    }
    /* Search the menus */
    compare(
      'finder',
      finderRows(OFF).map((row) => row.item.id),
      finderRows(ON).map((row) => row.item.id),
      (id) => parked(itemById(id)),
    );
    /* the toolbar: the head, every tail and the tail end */
    for (const [label, controls] of [
      ['head', TOOLBAR_HEAD] as const,
      ['tail end', TOOLBAR_TAIL_END] as const,
      ...Object.entries(TOOLBAR_TAILS).map(([kind, tail]) => [`tail ${kind}`, tail] as const),
    ]) {
      const byId = new Map(controls.map((control) => [control.control, control]));
      compare(
        `toolbar ${label}`,
        presentControls(controls, OFF).map((control) => control.control),
        presentControls(controls, ON).map((control) => control.control),
        (id) => {
          const control = byId.get(id);
          return control !== undefined && parked(control);
        },
      );
    }
    /* the chord table: a binding of a menu item is live only while its item is present */
    const bindings = buildKeyTable().filter((binding) => findItem(binding.id) !== undefined);
    compare(
      'keys',
      bindings.filter((b) => isPresent(itemById(b.id), OFF)).map((b) => b.id),
      bindings.filter((b) => isPresent(itemById(b.id), ON)).map((b) => b.id),
      (id) => parked(itemById(id)),
    );
    /* the switch changes something today: the Later stubs */
    expect(differences).toBeGreaterThan(0);
    expect(finderRows(ON).some((row) => row.item.id === 'title.presence.joinChat')).toBe(true);
    expect(finderRows(OFF).some((row) => row.item.id === 'title.presence.joinChat')).toBe(false);
  });
});

// Cycle 2 of the focus round (docs/gslides-parity/focus/VERIFICATION.md pass 2; build/b1.md
// "Cycle 2") parked Insert > Shape, Insert > Line, Format > Borders & lines and the two toolbar
// buttons under the orchestrator's ruling (1) on FOCUS.md section 9 (b3's R14); the return round
// (docs/RETURN.md 2.2, 2.3, 3.2; return/build/b1.md) brought them back whole, with the tables,
// the charts and the formatting rows, and this block asserts the returned state. Edit > Paste
// stays enabled whatever this page copied, as Google's does (F-slides-paste, b4 FR2).
describe('cycle 2 and the return round: the shapes and lines, the returned rows and the Paste rule', () => {
  const OFF: MenuContext = DEFAULT_MENU_CONTEXT;
  const ON: MenuContext = { ...OFF, settings: { ...OFF.settings, advancedTools: true } };
  const ids = (items: ReadonlyArray<MenuItem>, ctx: MenuContext): string[] =>
    visibleItems(items, { contextOnly: true, context: ctx }).flatMap((item) => [
      item.id,
      ...(item.items === undefined ? [] : ids(item.items, ctx)),
    ]);

  it('keeps Paste and Paste without formatting enabled in every clipboard state (F-slides-paste)', () => {
    for (const clipboard of ['empty', 'slides', 'blocks', 'text', 'image'] as const) {
      const ctx: MenuContext = { ...OFF, clipboard };
      expect(evaluate('canPaste', ctx), clipboard).toBe(true);
      expect(isEnabled(itemById('edit.paste'), ctx), clipboard).toBe(true);
      expect(isEnabled(itemById('edit.pasteWithoutFormatting'), ctx), clipboard).toBe(true);
    }
    /* the card menu's Paste row in a tab that copied nothing: enabled, so a slide envelope another
       tab wrote pastes from the row as it does from Cmd+V */
    const card = (
      contextMenuItems('filmstripCard', { ...OFF, clipboard: 'empty' }).filter(
        (entry) => entry !== DIVIDER,
      ) as MenuItem[]
    ).map((item) => item.id);
    expect(card).toContain('edit.paste');
    expect(isEnabled(itemById('edit.paste'), { ...OFF, clipboard: 'empty' })).toBe(true);
  });

  it('returns Insert > Shape and Insert > Line whole to the default view with the named rows and the two connectors; the galleries and the freehand kinds stay parked (docs/RETURN.md 2.2, 2.3, 2.9, section 8)', () => {
    const insertOff = ids(MENUS.find((m) => m.id === 'insert')!.items, OFF);
    const insertOn = ids(MENUS.find((m) => m.id === 'insert')!.items, ON);
    for (const id of [
      'insert.shape',
      'insert.shape.shapes',
      'insert.shape.shapes.rectangle',
      'insert.shape.shapes.rounded',
      'insert.shape.shapes.ellipse',
      'insert.line',
      'insert.line.line',
      'insert.line.arrow',
      'insert.line.elbowConnector',
      'insert.line.curvedConnector',
      'insert.table',
      'insert.chart',
      'insert.chart.bar',
      'insert.diagram',
      'insert.wordArt',
      'insert.slideNumbers',
    ]) {
      expect(insertOff, `${id} in the default view`).toContain(id);
      expect(insertOn, `${id} with the switch on`).toContain(id);
      expect(isPresent(itemById(id), OFF), `${id} present off`).toBe(true);
      expect(itemById(id).status, `${id} stays a now row`).toBe('now');
    }
    /* what stays parked under Insert (RETURN.md 2.9, 2.10, 3.4, section 8) */
    for (const id of [
      'insert.shape.gallery',
      'insert.shape.arrows',
      'insert.shape.callouts',
      'insert.shape.equation',
      'insert.line.rule',
      'insert.line.curve',
      'insert.line.polyline',
      'insert.line.scribble',
      'insert.specialCharacters',
      'insert.icon',
      'insert.material',
      'insert.image.fromThisPresentation',
    ]) {
      expect(insertOff, `${id} parked`).not.toContain(id);
      expect(insertOn, `${id} behind the switch`).toContain(id);
      expect(isPresent(itemById(id), OFF), `${id} present off`).toBe(false);
      expect(isPresent(itemById(id), ON), `${id} present on`).toBe(true);
    }
    /* the Shapes row lists the three named rows in both contexts (docs/FOCUS.md section 4); the
       gallery plate stands behind the switch as its own row, All shapes */
    const shapesRow = itemById('insert.shape.shapes');
    expect(shapesRow.altEffect).toBeUndefined();
    expect(shapesRow.effect?.kind).toBe('submenu');
    for (const ctx of [OFF, ON])
      expect(visibleItems(shapesRow.items ?? [], { context: ctx }).map((item) => item.id)).toEqual([
        'insert.shape.shapes.rectangle',
        'insert.shape.shapes.rounded',
        'insert.shape.shapes.ellipse',
      ]);
    const gallery = itemById('insert.shape.gallery');
    expect(gallery.advanced).toBe(true);
    expect(gallery.effect).toEqual({
      kind: 'submenu',
      dynamic: 'shapes',
      category: 'shapes',
      action: 'block.insert',
    });
    const shapeRows = (ctx: MenuContext) =>
      visibleItems(itemById('insert.shape').items ?? [], { context: ctx }).map((item) => item.id);
    expect(shapeRows(OFF)).toEqual(['insert.shape.shapes']);
    expect(shapeRows(ON)).toEqual([
      'insert.shape.shapes',
      'insert.shape.gallery',
      'insert.shape.arrows',
      'insert.shape.callouts',
      'insert.shape.equation',
    ]);
    const lineRows = (ctx: MenuContext) =>
      visibleItems(itemById('insert.line').items ?? [], { context: ctx }).map((item) => item.id);
    expect(lineRows(OFF)).toEqual([
      'insert.line.line',
      'insert.line.arrow',
      'insert.line.elbowConnector',
      'insert.line.curvedConnector',
    ]);
    expect(lineRows(ON)).toHaveLength(8);
  });

  it('returns Format > Borders & lines, the Table rows, Edit data and Chart type and keeps the Format menu of docs/RETURN.md 3.3', () => {
    const formatOff = ids(MENUS.find((m) => m.id === 'format')!.items, OFF);
    for (const id of [
      'format.text',
      'format.text.superscript',
      'format.text.subscript',
      'format.text.capitalization',
      'format.text.capitalization.upper',
      'format.alignIndent',
      'format.alignIndent.justified',
      'format.spacing',
      'format.spacing.addBefore',
      'format.spacing.addAfter',
      'format.spacing.custom',
      'format.bulletsNumbering',
      'format.table',
      'format.table.insertRowBelow',
      'format.image',
      'format.bordersLines',
      'format.bordersLines.borderColor',
      'format.bordersLines.borderWeight',
      'format.bordersLines.borderDash',
      'format.bordersLines.lineStart',
      'format.bordersLines.lineEnd',
      'format.formatOptions',
      'format.clearFormatting',
      'format.textFitting',
    ])
      expect(formatOff, id).toContain(id);
    /* the Format rows that stay parked (RETURN.md 2.15, 3.4, section 9 questions 6 and 7); the two
       merge rows returned in the fix round with the Editor's cell range (return/build/b5.md) */
    for (const id of [
      'format.bulletsNumbering.listOptions',
      'format.image.maskImage',
      'format.image.dither',
      'format.dropShadow',
      'format.changeShape',
      'format.editHtml',
    ]) {
      expect(isPresent(itemById(id), OFF), id).toBe(false);
      expect(isPresent(itemById(id), ON), id).toBe(true);
    }
    /* Edit data and Chart type are context only rows: present, drawn on the chart's menu */
    for (const id of ['format.editData', 'format.chartType', 'format.chartType.pie'])
      expect(isPresent(itemById(id), OFF), id).toBe(true);
    const chartOff = resolveContextEntries(CONTEXT_MENUS.chart, OFF)
      .filter((entry) => entry !== DIVIDER)
      .map((entry) => (entry as MenuItem).id);
    expect(chartOff).toContain('format.editData');
    expect(chartOff).toContain('format.chartType');
    expect(chartOff).toContain('format.altText');
    /* the line target's two rows returned with the submenu; the object rows of 3.1 stay */
    const lineOff = resolveContextEntries(CONTEXT_MENUS.line, OFF)
      .filter((entry) => entry !== DIVIDER)
      .map((entry) => (entry as MenuItem).id);
    for (const id of [
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'arrange.order',
      'arrange.rotate',
      'arrange.distribute',
      'arrange.group',
      'format.bordersLines.lineStart',
      'format.bordersLines.lineEnd',
      'format.formatOptions',
      'insert.comment',
    ])
      expect(lineOff, id).toContain(id);
    expect(lineOff).not.toContain('format.dropShadow');
    expect(lineOff).toContain('format.altText');
  });

  it('returns the two toolbar buttons and the shape, line, table, chart and group tails; Change shape and the other tail stay parked', () => {
    const tailOff = presentControls(TOOLBAR_TAIL_DEFAULT, OFF).map((control) => control.control);
    for (const id of [
      'toolbar.select',
      'toolbar.textBox',
      'toolbar.insertImage',
      'toolbar.insertShape',
      'toolbar.insertLine',
      'toolbar.insertComment',
      'toolbar.background',
      'toolbar.layout',
      'toolbar.theme',
      'toolbar.hideMenus',
    ])
      expect(tailOff, id).toContain(id);
    expect(tailOff).not.toContain('toolbar.transition');
    expect(presentControls(TOOLBAR_HEAD, OFF).map((control) => control.control)).toContain(
      'toolbar.paintFormat',
    );
    for (const kind of ['shape', 'line', 'table', 'chart', 'group'] as const) {
      const off = presentControls(TOOLBAR_TAILS[kind], OFF).map((control) => control.control);
      expect(off.length, kind).toBeGreaterThan(0);
      for (const control of TOOLBAR_TAILS[kind])
        if (control.control === 'toolbar.changeShape')
          expect(control.advanced, `${kind} ${control.control}`).toBe(true);
        else expect(control.advanced, `${kind} ${control.control}`).toBeUndefined();
    }
    expect(
      presentControls(TOOLBAR_TAILS.shape, OFF).map((control) => control.control),
    ).not.toContain('toolbar.changeShape');
    expect(presentControls(TOOLBAR_TAILS.shape, ON).map((control) => control.control)).toContain(
      'toolbar.changeShape',
    );
    expect(presentControls(TOOLBAR_TAILS.text, OFF).map((control) => control.control)).toContain(
      'toolbar.highlightColor',
    );
    /* the text tail's fill and border controls wait for question 8; the other tail stays parked */
    for (const id of [
      'toolbar.fillColor',
      'toolbar.borderColor',
      'toolbar.borderWeight',
      'toolbar.borderDash',
    ])
      expect(
        presentControls(TOOLBAR_TAILS.text, OFF).map((control) => control.control),
        id,
      ).not.toContain(id);
    expect(presentControls(TOOLBAR_TAILS.other, OFF)).toEqual([]);
    for (const control of TOOLBAR_TAILS.other) expect(control.advanced, control.control).toBe(true);
    /* the pointer toggle returned with the live pointers (RETURN.md 2.16) */
    expect(presentControls(TOOLBAR_TAIL_END, OFF).map((control) => control.control)).toContain(
      'toolbar.pointer',
    );
  });

  it('lists the returned rows in Search the menus with the switch off, and the parked ones with it on alone', () => {
    const off = new Set(finderRows(OFF).map((row) => row.item.id));
    const on = new Set(finderRows(ON).map((row) => row.item.id));
    for (const id of [
      'insert.shape.shapes.rectangle',
      'insert.shape.shapes.rounded',
      'insert.shape.shapes.ellipse',
      'insert.line.line',
      'insert.line.arrow',
      'insert.line.elbowConnector',
      'format.bordersLines.borderColor',
      'format.text.superscript',
      'format.text.capitalization.title',
      'arrange.group',
      'arrange.distribute.horizontally',
      'slide.changeTheme',
      'view.appearance.dark',
      'view.showRuler',
      'view.fullScreen',
      'file.open',
      'file.details',
      'file.download.zip',
      'file.download.jpg',
      'file.download.html',
      'edit.selectNone',
      'tools.checkSlides',
      'help.improve',
      'insert.textBox',
    ]) {
      expect(off.has(id), `${id} off`).toBe(true);
      expect(on.has(id), `${id} on`).toBe(true);
    }
    for (const id of [
      'insert.shape.gallery',
      'insert.line.rule',
      'insert.specialCharacters',
      'insert.icon',
      'file.download.txt',
      'file.share.publish',
      'title.inbox',
      'title.presence.follow',
      'tools.notificationSettings',
      'view.gridView',
      'view.showSections',
      'format.dropShadow',
      'extensions.agentAccess',
    ]) {
      expect(off.has(id), `${id} off`).toBe(false);
      expect(on.has(id), `${id} on`).toBe(true);
    }
  });

  it('binds the returned chords with the switch off and no parked chord: every present binding names a present row (b4 FR5, the chrome half)', () => {
    const table = buildKeyTable();
    const present = table.filter((binding) => {
      const item = findItem(binding.id);
      return item !== undefined && isPresent(item, OFF);
    });
    for (const binding of present) {
      const item = findItem(binding.id);
      expect(item?.advanced, binding.id).not.toBe(true);
      expect(item?.status, binding.id).not.toBe('later');
    }
    /* the chords the stage's own table used to fire (build/b2.md, the third defect) are live
       again with their rows (docs/RETURN.md 2.11, 2.12) */
    for (const id of [
      'arrange.group',
      'arrange.ungroup',
      'format.alignIndent.justified',
      'format.text.superscript',
      'format.text.subscript',
      'view.fullScreen',
      'file.open',
    ])
      expect(isPresent(itemById(id), OFF), id).toBe(true);
    /* Alt text returned to the default view with its chord (docs/PRODUCT.md section 5); a parked
       row's chord stays unbound (Drop shadow, RETURN.md section 9 question 7) */
    expect(isPresent(itemById('format.altText'), OFF)).toBe(true);
    expect(present.some((binding) => binding.id === 'format.altText')).toBe(true);
    expect(isPresent(itemById('format.dropShadow'), OFF)).toBe(false);
  });
});

// The return round (docs/RETURN.md sections 2 and 3; build/b1.md "Return round"): the ledger of
// what left the parked set and what stays, read from the model, so a flag put back by mistake or
// a parked row unflagged by mistake fails here before the matrix measures it.
describe('the return round: the flags of the returned and the parked rows (docs/RETURN.md 2, 3)', () => {
  const OFF: MenuContext = DEFAULT_MENU_CONTEXT;

  it('draws every returned row in the default view', () => {
    /* file.new.templateGallery came back in the return round and left again with the templates
       feature at the product round's ship (the parked list below) */
    for (const id of [
      'file.open',
      'file.importSlides',
      'file.download.jpg',
      'file.download.png',
      'file.download.zip',
      'file.details',
      'edit.selectNone',
      'view.showRuler',
      'view.guides',
      'view.guides.show',
      'view.guides.addVertical',
      'view.guides.clear',
      'view.guides.delete',
      'view.snapTo',
      'view.snapTo.guides',
      'view.snapTo.grid',
      'view.comments',
      'view.comments.showAll',
      'view.comments.hide',
      'view.showFilmstrip',
      'view.mode',
      'view.mode.editing',
      'view.mode.viewing',
      'view.fullScreen',
      'view.appearance',
      'view.appearance.light',
      'view.appearance.match',
      'insert.shape',
      'insert.table',
      'insert.chart',
      'insert.diagram',
      'insert.wordArt',
      'insert.line',
      'insert.slideNumbers',
      'format.text.superscript',
      'format.text.subscript',
      'format.text.capitalization',
      'format.alignIndent.justified',
      'format.spacing.addBefore',
      'format.spacing.addAfter',
      'format.spacing.custom',
      'format.table',
      'format.bordersLines',
      'format.editData',
      'format.chartType',
      'slide.changeTheme',
      'arrange.distribute',
      'arrange.rotate',
      'arrange.rotate.flipVertically',
      'arrange.group',
      'arrange.ungroup',
      'arrange.regroup',
      'tools.checkSlides',
      'help.improve',
    ]) {
      const item = itemById(id);
      expect(item.advanced, `${id} carries the flag`).toBeUndefined();
      expect(item.status, id).toBe('now');
      expect(isPresent(item, OFF), `${id} present in the default view`).toBe(true);
    }
  });

  it('keeps the flag on every row RETURN.md leaves parked', () => {
    for (const id of [
      'file.versionHistory.showChanges',
      /* re-parked at the return round's ship: collab.roster.go-to-slide carries `parks` naming
         the row and read red in both preview runs (docs/RETURN.md section 1 rule 2;
         VERIFICATION.md R2-F1); the chips stay drawn and a click still jumps */
      'title.presence.goTo',
      /* the return round's integration parked the Live pointers rows again: the matrix row
         view.live-pointers.second-browser carries `parks` naming them and was red on both tiers
         (docs/RETURN.md section 1 rule 2; build/integrator.md) */
      'view.livePointers',
      'view.livePointers.mine',
      'view.livePointers.collaborators',
      'title.presence.follow',
      'title.presence.me',
      'title.account',
      'title.inbox',
      'file.makeCopy.selected',
      'file.share.publish',
      'file.download.txt',
      'view.gridView',
      'view.showSections',
      'insert.image.fromThisPresentation',
      'insert.shape.gallery',
      'insert.shape.arrows',
      'insert.shape.callouts',
      'insert.shape.equation',
      'insert.line.rule',
      'insert.line.curve',
      'insert.line.polyline',
      'insert.line.scribble',
      'insert.specialCharacters',
      'insert.icon',
      'insert.material',
      'format.bulletsNumbering.listOptions',
      'format.image.maskImage',
      'format.image.dither',
      'format.dropShadow',
      'format.changeShape',
      'format.editHtml',
      'tools.notificationSettings',
      'tools.activityDashboard',
      'tools.advanced',
      'extensions.agentAccess',
      'extensions.embedInSite',
      'tools.spelling',
      /* the templates feature, parked at the product round's ship (docs/PRODUCT.md 8.2;
         product/build/ship.md section 7): templates.card.rename-and-delete and
         templates.default.use-for-new read red twice on the enforce preview of record, the
         gallery on another instance keeping the old card, name or default while the public
         store's edge refused the just written index */
      'file.new.templateGallery',
      'file.saveAsTemplate',
    ]) {
      const item = itemById(id);
      expect(item.advanced, `${id} keeps the flag`).toBe(true);
      expect(isPresent(item, OFF), `${id} absent in the default view`).toBe(false);
    }
    /* the replaced picture rows follow the Insert rows: By URL returned in the product round
       (docs/PRODUCT.md section 5), From this presentation stays parked */
    expect(isPresent(itemById('format.image.replaceImage.byUrl'), OFF)).toBe(true);
    expect(isPresent(itemById('format.image.replaceImage.fromThisPresentation'), OFF)).toBe(false);
  });

  it('keeps the Later stubs Later: Transition, Indentation options, Edit guides, Email collaborators', () => {
    for (const id of [
      'slide.transition',
      'format.alignIndent.indentationOptions',
      'view.guides.edit',
      'file.email.collaborators',
      'title.presence.joinChat',
    ]) {
      expect(itemById(id).status, id).toBe('later');
      expect(isPresent(itemById(id), OFF), id).toBe(false);
    }
  });
});
