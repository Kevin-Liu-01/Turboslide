import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@turboslide/schema/actions';

import { assignAccessKeys } from '../keys.ts';
import type { MenuItem, MenuStatus } from '../model.ts';
import {
  CONTEXT_MENUS,
  DEFAULT_MENU_CONTEXT,
  DIVIDER,
  GS1_ACTION_IDS,
  MENUS,
  OMITTED_MENUS,
  TITLE_ROW_ITEMS,
  TOOLBAR_HEAD,
  TOOLBAR_TAIL_DEFAULT,
  actionIdsOf,
  allItems,
  contextMenuItems,
  evaluate,
  findItem,
  isChecked,
  itemById,
  itemPath,
  resolveLabel,
  statusOfChildren,
  tooltipDoc,
  walkItems,
} from '../model.ts';
import { STUB_PREFIX } from '../strings.ts';

// The menu model (SPEC 2.13, 14.2): every row of SPEC sections 2.0 to 2.10 is in the model with
// its status; every Google item R01 names (the fixture) is in the model; every now item has an
// effect, every later item a stub clause, every omit item none; every action id exists in the
// actions table or among the fourteen ids of SPEC 7.5; the counts per menu match the rows of the
// SPEC tables; the toolbar of 3.1 and the card menu of 4.2 are in order.

type Row = { menu: string; status: MenuStatus; ids: string[]; omits?: string[] };

const row = (menu: string, status: MenuStatus, ids: string[], omits?: string[]): Row =>
  omits === undefined ? { menu, status, ids } : { menu, status, ids, omits };

/**
 * The rows of SPEC 2.0 to 2.10, one entry per table row, in table order, with the model ids each
 * row covers. A row with several Google items (Move slide, Order) lists them all; a container that
 * is itself the row lists itself and its children. `omits` holds items a Now row's note omits.
 */
const SPEC_ROWS: Row[] = [
  /* 2.0 the title row */
  row('title', 'now', ['title.appIcon']),
  row('title', 'now', ['title.name']),
  row('title', 'omit', ['title.star']),
  row('title', 'omit', ['title.move']),
  row('title', 'now', ['title.saveState']),
  row('title', 'now', ['title.lastEdit']),
  row('title', 'later', ['title.comments']),
  row('title', 'omit', ['title.meet', 'title.record']),
  row('title', 'now', ['title.slideshow']),
  row('title', 'now', ['title.share']),
  row('title', 'omit', ['title.account', 'title.gemini']),
  /* 2.1 File */
  row('file', 'now', ['file.new.presentation']),
  row('file', 'now', ['file.new.templateGallery']),
  row('file', 'now', ['file.open']),
  row('file', 'now', ['file.importSlides']),
  row('file', 'now', ['file.makeCopy.entire']),
  row('file', 'now', ['file.makeCopy.selected']),
  row('file', 'now', ['file.share.withOthers']),
  row('file', 'now', ['file.share.publish']),
  row('file', 'omit', ['file.email', 'file.email.thisFile', 'file.email.collaborators']),
  row('file', 'now', ['file.download.pptx']),
  row('file', 'omit', ['file.download.odp']),
  row('file', 'now', ['file.download.pdf']),
  row('file', 'now', ['file.download.txt']),
  row('file', 'now', ['file.download.jpg']),
  row('file', 'now', ['file.download.png']),
  row('file', 'omit', ['file.download.svg']),
  row('file', 'now', ['file.download.html']),
  row('file', 'now', ['file.download.zip']),
  row('file', 'now', ['file.rename']),
  row('file', 'omit', ['file.move', 'file.addShortcut']),
  row('file', 'now', ['file.moveToTrash']),
  row('file', 'now', ['file.versionHistory.nameCurrent']),
  row('file', 'now', ['file.versionHistory.see']),
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
  row('edit', 'later', ['edit.selectNone']),
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
  row('view', 'later', ['view.showRuler']),
  row('view', 'later', [
    'view.guides',
    'view.guides.show',
    'view.guides.addVertical',
    'view.guides.addHorizontal',
    'view.guides.edit',
    'view.guides.clear',
  ]),
  row('view', 'now', ['view.snapTo.guides']),
  row('view', 'now', ['view.snapTo.grid']),
  row('view', 'later', [
    'view.comments',
    'view.comments.hide',
    'view.comments.minimize',
    'view.comments.expand',
  ]),
  row('view', 'omit', [
    'view.livePointers',
    'view.livePointers.mine',
    'view.livePointers.collaborators',
  ]),
  row('view', 'now', ['view.showSpeakerNotes']),
  row('view', 'now', ['view.showFilmstrip']),
  row(
    'view',
    'now',
    ['view.mode', 'view.mode.editing', 'view.mode.viewing'],
    ['view.mode.commenting'],
  ),
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
  row('insert', 'omit', ['insert.audio', 'insert.video']),
  row('insert', 'now', [
    'insert.shape.shapes',
    'insert.shape.shapes.rectangle',
    'insert.shape.shapes.rounded',
    'insert.shape.shapes.ellipse',
  ]),
  row('insert', 'now', ['insert.shape.arrows', 'insert.shape.arrows.arrow']),
  row('insert', 'later', ['insert.shape.callouts']),
  row('insert', 'omit', ['insert.shape.equation']),
  row('insert', 'now', ['insert.table']),
  row('insert', 'later', [
    'insert.chart',
    'insert.chart.bar',
    'insert.chart.column',
    'insert.chart.line',
    'insert.chart.pie',
  ]),
  row('insert', 'omit', ['insert.chart.fromSheets']),
  row('insert', 'later', ['insert.diagram']),
  row('insert', 'omit', ['insert.wordArt']),
  row('insert', 'now', ['insert.line.line', 'insert.line.arrow', 'insert.line.rule']),
  row('insert', 'omit', [
    'insert.line.elbowConnector',
    'insert.line.curvedConnector',
    'insert.line.curve',
    'insert.line.polyline',
    'insert.line.scribble',
  ]),
  row('insert', 'omit', ['insert.specialCharacters']),
  row('insert', 'omit', ['insert.animation']),
  row('insert', 'now', ['insert.link']),
  row('insert', 'later', ['insert.comment']),
  row('insert', 'now', ['insert.newSlide']),
  row('insert', 'now', ['insert.slideNumbers']),
  row('insert', 'omit', ['insert.placeholder']),
  row('insert', 'later', ['insert.templates']),
  row('insert', 'omit', ['insert.buildingBlocks', 'insert.speakerSpotlight']),
  row('insert', 'now', ['insert.icon']),
  row('insert', 'now', ['insert.material']),
  /* 2.5 Format */
  row('format', 'now', ['format.text.bold']),
  row('format', 'later', ['format.text.italic']),
  row('format', 'later', ['format.text.underline']),
  row('format', 'now', ['format.text.strikethrough']),
  row('format', 'omit', ['format.text.superscript', 'format.text.subscript']),
  row('format', 'now', [
    'format.text.size',
    'format.text.size.increase',
    'format.text.size.decrease',
  ]),
  row('format', 'omit', ['format.text.capitalization']),
  row('format', 'now', [
    'format.alignIndent.left',
    'format.alignIndent.center',
    'format.alignIndent.right',
  ]),
  row('format', 'omit', ['format.alignIndent.justified']),
  row('format', 'later', [
    'format.alignIndent.increaseIndent',
    'format.alignIndent.decreaseIndent',
  ]),
  row('format', 'omit', ['format.alignIndent.indentationOptions']),
  row('format', 'now', [
    'format.spacing',
    'format.spacing.single',
    'format.spacing.1_15',
    'format.spacing.1_5',
    'format.spacing.double',
    'format.spacing.custom',
  ]),
  row('format', 'now', ['format.bulletsNumbering.bulleted']),
  row('format', 'now', ['format.bulletsNumbering.numbered']),
  row('format', 'omit', [
    'format.bulletsNumbering.listOptions',
    'format.bulletsNumbering.listOptions.restart',
    'format.bulletsNumbering.listOptions.prefixSuffix',
    'format.bulletsNumbering.listOptions.moreBullets',
  ]),
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
  row('format', 'later', ['format.table.mergeCells', 'format.table.unmergeCells']),
  row('format', 'now', ['format.image.cropImage']),
  row('format', 'omit', ['format.image.maskImage']),
  row('format', 'now', [
    'format.image.replaceImage',
    'format.image.replaceImage.upload',
    'format.image.replaceImage.byUrl',
    'format.image.replaceImage.fromThisPresentation',
  ]),
  row('format', 'later', ['format.image.resetImage']),
  row('format', 'now', ['format.image.imageOptions']),
  row('format', 'now', ['format.bordersLines.borderColor', 'format.bordersLines.borderWeight']),
  row('format', 'later', ['format.bordersLines.borderDash']),
  row('format', 'now', ['format.bordersLines.lineStart', 'format.bordersLines.lineEnd']),
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
  row('slide', 'now', [
    'slide.changeBackground',
    'slide.changeBackground.upload',
    'slide.changeBackground.byUrl',
    'slide.changeBackground.fromThisPresentation',
  ]),
  row('slide', 'now', ['slide.applyLayout']),
  row('slide', 'later', ['slide.transition']),
  row('slide', 'later', ['slide.editTheme']),
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
  row('arrange', 'later', [
    'arrange.rotate',
    'arrange.rotate.clockwise',
    'arrange.rotate.counterClockwise',
    'arrange.rotate.flipHorizontally',
    'arrange.rotate.flipVertically',
  ]),
  row('arrange', 'later', ['arrange.group', 'arrange.ungroup']),
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
    'tools.accessibilitySettings',
    'tools.activityDashboard',
  ]),
  row('tools', 'later', ['tools.preferences']),
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
  row('help', 'later', ['help.improve']),
  row('help', 'omit', ['help.privacyPolicy', 'help.termsOfService']),
  row('help', 'now', ['help.keyboardShortcuts']),
];

/** Rows outside the 2.12 count: the Slideshow arrow (9.1), the context-only items (4.3), the unverified Regroup (R01). */
const OTHER_ROWS: Row[] = [
  row('slideshow', 'now', ['title.slideshow.presenterView']),
  row('slideshow', 'now', ['title.slideshow.startFromBeginning']),
  row('slideshow', 'later', ['title.slideshow.presentOnAnotherScreen']),
  row('slideshow', 'omit', ['title.slideshow.displayOptions']),
  row('context', 'now', ['format.altText']),
  row('context', 'later', ['format.textFitting']),
  row('arrange', 'omit', ['arrange.regroup']),
];

/**
 * The counts of SPEC 2.12 as printed (`spec`) beside the counts of the SPEC tables' rows
 * (`rows`), which the model is held to. The two differ where the SPEC's tally is off its own
 * tables: File prints 24 Now over 22 rows and 9 Omit over 7 rows, Edit 9 Now over 10 rows, View
 * 12 Now over 11, Insert 11 Omit over 10, Format 16 Now over 15 and 7 Omit over 6, Tools 4 Omit
 * over 3, Help 3 Omit over 2, and the title row 6 Omit over 4 rows. Arrange gains one Omit row
 * for Regroup, which R01 names and the SPEC does not. docs/gslides-parity/build/b3a.md asks the
 * integrator to correct the table.
 */
const COUNTS: Record<string, { spec: Counts; rows: Counts }> = {
  title: { spec: [6, 1, 6], rows: [6, 1, 4] },
  file: { spec: [24, 1, 9], rows: [22, 1, 7] },
  edit: { spec: [9, 1, 0], rows: [10, 1, 0] },
  view: { spec: [12, 3, 3], rows: [11, 3, 3] },
  insert: { spec: [13, 5, 11], rows: [13, 5, 10] },
  format: { spec: [16, 6, 7], rows: [15, 6, 6] },
  slide: { spec: [8, 2, 0], rows: [8, 2, 0] },
  arrange: { spec: [4, 2, 0], rows: [4, 2, 1] },
  tools: { spec: [12, 2, 4], rows: [12, 2, 3] },
  extensions: { spec: [2, 0, 2], rows: [2, 0, 2] },
  help: { spec: [3, 1, 3], rows: [3, 1, 2] },
};

const isContainer = (item: MenuItem): boolean => item.items !== undefined && item.items.length > 0;

type Counts = [number, number, number];
const add = (sum: Counts, [a, b, c]: Counts): Counts => [sum[0] + a, sum[1] + b, sum[2] + c];

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

  it('count per menu as the SPEC tables do, and the delta to SPEC 2.12 is the one recorded', () => {
    const derived: Record<string, Counts> = {};
    for (const each of [...SPEC_ROWS, OTHER_ROWS[6] as Row]) {
      const slot = derived[each.menu] ?? [0, 0, 0];
      slot[each.status === 'now' ? 0 : each.status === 'later' ? 1 : 2] += 1;
      derived[each.menu] = slot;
    }
    for (const [menu, { rows: expected }] of Object.entries(COUNTS)) {
      expect(derived[menu], menu).toEqual(expected);
    }
    const zero: Counts = [0, 0, 0];
    const total = Object.values(derived).reduce(add, zero);
    expect(total).toEqual([106, 24, 38]);
    const spec = Object.values(COUNTS).reduce((sum, each) => add(sum, each.spec), zero);
    expect(spec).toEqual([109, 24, 45]);
    /* the Later column agrees everywhere; Now and Omit drift by the recorded amounts */
    expect(total[1]).toBe(spec[1]);
    expect(spec[0] - total[0]).toBe(3);
    expect(spec[2] - total[2]).toBe(7);
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

  it('is the source of every Google item in the model: nothing outside R01 unless marked as ours or from R08', () => {
    const paths = new Set<string>();
    for (const menu of menus)
      for (const entry of menu.items)
        paths.add([menu.menu, ...entry.path, entry.label].join(' > ').toLowerCase());
    /* R01 describes these submenus by reference ("the same sources as Insert > Image"), so their children are checked under Insert > Image */
    const byReference = new Set(['format.image.replaceImage', 'slide.changeBackground']);
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
    for (const item of items) {
      if (!isContainer(item) || item.items === undefined) continue;
      expect(item.status, item.id).toBe(statusOfChildren(item.items));
      if (item.status === 'now' && item.id !== 'title.slideshow')
        expect(item.effect?.kind, item.id).toBe('submenu');
    }
    expect(itemById('slide.applyLayout').effect).toEqual({
      kind: 'submenu',
      dynamic: 'layouts',
      action: 'slide.applyLayout',
    });
  });

  it('names action ids that exist in the actions table or among the fourteen of SPEC 7.5', () => {
    const known = new Set<string>([...ACTION_IDS, ...GS1_ACTION_IDS]);
    const used = new Set<string>();
    for (const item of items) {
      for (const id of actionIdsOf(item)) {
        expect(known.has(id), `${item.id} names ${id}`).toBe(true);
        used.add(id);
      }
    }
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
    ]) {
      expect(used.has(id), `${id} is on no menu`).toBe(true);
    }
    expect(GS1_ACTION_IDS).toHaveLength(14);
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

  it('follows SPEC 2.0 on the title row and 9.1 on the Slideshow arrow', () => {
    expect(TITLE_ROW_ITEMS.filter((item) => item.status !== 'omit').map((item) => item.id)).toEqual(
      [
        'title.appIcon',
        'title.name',
        'title.saveState',
        'title.lastEdit',
        'title.comments',
        'title.slideshow',
        'title.share',
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

describe('predicates and labels', () => {
  it('reads the fresh presentation as SPEC 11.1 does', () => {
    const ctx = DEFAULT_MENU_CONTEXT;
    expect(evaluate('canMoveUp', ctx)).toBe(false);
    expect(evaluate('canMoveDown', ctx)).toBe(false);
    expect(evaluate('hasSlide', ctx)).toBe(true);
    expect(evaluate('slideSubsetSelected', ctx)).toBe(false);
    expect(evaluate('canUndo', ctx)).toBe(false);
    expect(evaluate('twoOrMoreFreeform', ctx)).toBe(false);
    expect(evaluate('pictureLayout', ctx)).toBe(false);
    expect(isChecked(itemById('view.snapTo.guides'), ctx)).toBe(true);
    expect(isChecked(itemById('view.snapTo.grid'), ctx)).toBe(false);
    expect(isChecked(itemById('view.zoom.fit'), ctx)).toBe(true);
    expect(isChecked(itemById('view.zoom.100'), ctx)).toBe(false);
    expect(isChecked(itemById('view.mode.editing'), ctx)).toBe(true);
    expect(isChecked(itemById('edit.undo'), ctx)).toBeUndefined();
  });

  it('relabels Skip slide on a skipped card and reads the disabled reasons', () => {
    const skipped = {
      ...DEFAULT_MENU_CONTEXT,
      slide: { ...DEFAULT_MENU_CONTEXT.slide!, skipped: true },
    };
    expect(resolveLabel(itemById('slide.skipSlide'), DEFAULT_MENU_CONTEXT)).toBe('Skip slide');
    expect(resolveLabel(itemById('slide.skipSlide'), skipped)).toBe('Unskip slide');
    expect(tooltipDoc(itemById('slide.changeBackground'), DEFAULT_MENU_CONTEXT)).toBe(
      'This layout has no background. Use Section header, Caption or Closing for a full picture',
    );
    expect(tooltipDoc(itemById('arrange.align'), DEFAULT_MENU_CONTEXT)).toBe(
      'Blocks on this layout line up automatically. Choose the Blank layout to place them by hand',
    );
    expect(tooltipDoc(itemById('slide.transition'), DEFAULT_MENU_CONTEXT)).toBe(
      `${STUB_PREFIX}. The GT theme presents still slides`,
    );
    expect(tooltipDoc(itemById('format.bulletsNumbering.bulleted'), DEFAULT_MENU_CONTEXT)).toBe(
      'The GT theme draws list bullets as ruled rows',
    );
  });

  it('enables the Arrange items on a freeform slide with enough blocks', () => {
    const free = {
      ...DEFAULT_MENU_CONTEXT,
      focus: 'canvas' as const,
      slide: { ...DEFAULT_MENU_CONTEXT.slide!, freeform: true },
      selection: {
        ...DEFAULT_MENU_CONTEXT.selection,
        blocks: 3,
        order: { forward: true, backward: false, front: true, back: false },
      },
    };
    expect(evaluate('twoOrMoreFreeform', free)).toBe(true);
    expect(evaluate('threeOrMoreFreeform', free)).toBe(true);
    expect(evaluate('canBringForward', free)).toBe(true);
    expect(evaluate('canSendBackward', free)).toBe(false);
    expect(evaluate('linkable', free)).toBe(false);
    expect(evaluate('linkable', { ...free, selection: { ...free.selection, blocks: 1 } })).toBe(
      true,
    );
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
    expect(findItem('nothing.here')).toBeUndefined();
  });
});

describe('the toolbar of SPEC 3.1 and the right-click menus of 4.2 and 4.3', () => {
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
    expect(
      TOOLBAR_TAIL_DEFAULT.filter((control) => control.status === 'later').map(
        (control) => control.label,
      ),
    ).toEqual(['Insert comment', 'Transition']);
  });

  it('lists the card menu in the order of SPEC 4.2', () => {
    const labels = contextMenuItems('filmstripCard', DEFAULT_MENU_CONTEXT).map((entry) =>
      entry === DIVIDER ? '-' : resolveLabel(entry, DEFAULT_MENU_CONTEXT),
    );
    expect(labels).toEqual([
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
    ]);
  });

  it('builds every right-click menu from menu bar items, dividers between the groups of 4.3', () => {
    for (const [target, entries] of Object.entries(CONTEXT_MENUS)) {
      for (const entry of entries) {
        if (entry === DIVIDER) continue;
        const id = typeof entry === 'string' ? entry : entry.id;
        expect(findItem(id), `${target}: ${id}`).toBeDefined();
        expect(itemById(id).status, `${target}: ${id} is omitted`).not.toBe('omit');
      }
    }
    expect(
      contextMenuItems('emptyCanvas', DEFAULT_MENU_CONTEXT).filter((entry) => entry === DIVIDER),
    ).toHaveLength(3);
    expect(
      contextMenuItems('textSelection', DEFAULT_MENU_CONTEXT).map((entry) =>
        entry === DIVIDER ? '-' : entry.id,
      ),
    ).toEqual([
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.pasteWithoutFormatting',
      '-',
      'insert.link',
      '-',
      'format.formatOptions',
    ]);
    const shape = {
      ...DEFAULT_MENU_CONTEXT,
      selection: { ...DEFAULT_MENU_CONTEXT.selection, blocks: 1, block: 'shape' as const },
    };
    const text = {
      ...DEFAULT_MENU_CONTEXT,
      selection: { ...DEFAULT_MENU_CONTEXT.selection, blocks: 1, block: 'text' as const },
    };
    expect(
      contextMenuItems('textBlock', shape).some(
        (entry) => entry !== DIVIDER && entry.id === 'format.altText',
      ),
    ).toBe(true);
    expect(
      contextMenuItems('textBlock', text).some(
        (entry) => entry !== DIVIDER && entry.id === 'format.altText',
      ),
    ).toBe(false);
    expect(
      contextMenuItems('tableCell', DEFAULT_MENU_CONTEXT).filter(
        (entry) => entry !== DIVIDER && entry.id.startsWith('format.table.'),
      ),
    ).toHaveLength(10);
  });

  it('reaches the context-only items from a right-click menu', () => {
    const inContext = new Set<string>();
    for (const entries of Object.values(CONTEXT_MENUS))
      for (const entry of entries)
        if (entry !== DIVIDER) inContext.add(typeof entry === 'string' ? entry : entry.id);
    for (const item of allItems().filter((each) => each.contextOnly === true))
      expect(inContext.has(item.id), item.id).toBe(true);
  });
});
