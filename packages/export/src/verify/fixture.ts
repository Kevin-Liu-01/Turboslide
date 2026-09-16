// A minimal PPTX writer for the verify loop's own tests and the calibration run (SPEC 8.5 step 5;
// MILESTONES M2 item 4 verify/). It writes the package by hand, the pptx experiment's method
// without pptxgenjs: one slide per page with an optional full-page background picture (the flatten
// archetype), text boxes at sheet-pixel boxes with sz in centipoints, spcPts pitch, zero insets and
// an optional alpha 0 run color (the invisible text layer), hairlines as connectors, pictures, and
// rectangles that may deliberately leave the page so the geometry read-back has something to catch.
// Units: 1 px is 7,620 EMU on the 12,192,000 by 6,858,000 EMU page (units.ts).
import { readFile, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import JSZip from 'jszip';

import type { ThemeId } from '@turboslide/schema/deck';
import type { Box } from '@turboslide/schema/render';
import { tokensFor } from '@turboslide/theme/themes';
import { PANEL, SEMANTIC } from '@turboslide/theme/tokens';

import { PAGE_EMU, pxToEmu, spcOf, spcPtsOf, szOf } from '../units.ts';

export type FixtureText = {
  /** The object name (cNvPr name); the block id by convention. */
  name: string;
  text: string;
  /** Sheet px box of the text box. */
  box: Box;
  sizePx: number;
  lineHeightPx: number;
  family: string;
  /** Six hex digits. */
  color: string;
  /** 0 hides the run (the flatten text layer); 1 draws it. */
  alpha?: number;
  letterSpacingPx?: number;
  bold?: boolean;
  align?: 'l' | 'ctr' | 'r';
};

export type FixtureLine = { name: string; box: Box; color: string; widthPx?: number };

export type FixturePicture = { name: string; box: Box; png: string | Uint8Array };

export type FixtureRect = { name: string; box: Box; fill: string };

export type FixturePage = {
  /** A PNG path or bytes stretched over the whole page. */
  background?: string | Uint8Array;
  /** Paper color when no background picture is given, six hex digits. */
  paper?: string;
  texts?: FixtureText[];
  lines?: FixtureLine[];
  pictures?: FixturePicture[];
  rects?: FixtureRect[];
  notes?: string;
};

export type FixtureOptions = {
  out: string;
  pages: FixturePage[];
  title?: string;
  /** the theme part (SPEC-5 9.3): the GT part when absent */
  themePart?: ThemePartInput;
};

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xfrm(box: Box): string {
  return `<a:xfrm><a:off x="${pxToEmu(box[0])}" y="${pxToEmu(box[1])}"/><a:ext cx="${pxToEmu(box[2])}" cy="${pxToEmu(box[3])}"/></a:xfrm>`;
}

function textShape(id: number, t: FixtureText): string {
  const alpha = t.alpha ?? 1;
  const alphaXml = alpha >= 1 ? '' : `<a:alpha val="${Math.round(alpha * 100000)}"/>`;
  const spc = t.letterSpacingPx ? ` spc="${spcOf(t.letterSpacingPx)}"` : '';
  const bold = t.bold ? ' b="1"' : '';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(t.name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(t.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"/><a:lstStyle/>` +
    `<a:p><a:pPr algn="${t.align ?? 'l'}"><a:lnSpc><a:spcPts val="${spcPtsOf(t.lineHeightPx)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>` +
    `<a:r><a:rPr lang="en-US" sz="${szOf(t.sizePx)}"${bold}${spc} dirty="0"><a:solidFill><a:srgbClr val="${t.color}">${alphaXml}</a:srgbClr></a:solidFill>` +
    `<a:latin typeface="${escapeXml(t.family)}"/><a:cs typeface="${escapeXml(t.family)}"/></a:rPr><a:t>${escapeXml(t.text)}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

function lineShape(id: number, l: FixtureLine): string {
  const width = pxToEmu(l.widthPx ?? 1);
  // a horizontal connector: the box height is the stroke, the offset centers the stroke on it
  const y = l.box[1] + (l.box[3] - (l.widthPx ?? 1)) / 2;
  return (
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${escapeXml(l.name)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${pxToEmu(l.box[0])}" y="${pxToEmu(y)}"/><a:ext cx="${pxToEmu(l.box[2])}" cy="0"/></a:xfrm>` +
    `<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${width}"><a:solidFill><a:srgbClr val="${l.color}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`
  );
}

function rectShape(id: number, r: FixtureRect): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(r.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(r.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${r.fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
  );
}

function picShape(id: number, p: FixturePicture, rId: string): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(p.name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(p.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function slideXml(
  page: FixturePage,
  mediaIds: { background?: string; pictures: string[] },
): string {
  const parts: string[] = [];
  let id = 2;
  for (const r of page.rects ?? []) parts.push(rectShape(id++, r));
  page.pictures?.forEach((p, i) => parts.push(picShape(id++, p, mediaIds.pictures[i] ?? '')));
  for (const l of page.lines ?? []) parts.push(lineShape(id++, l));
  for (const t of page.texts ?? []) parts.push(textShape(id++, t));
  const bg = mediaIds.background
    ? `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${mediaIds.background}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`
    : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${page.paper ?? 'FFFFFF'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${bg}<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    parts.join('') +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

function rels(entries: { id: string; type: string; target: string }[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    entries
      .map((e) => `<Relationship Id="${e.id}" Type="${REL}/${e.type}" Target="${e.target}"/>`)
      .join('') +
    `</Relationships>`
  );
}

/**
 * The theme part per theme (gslides-parity SPEC-5 9.1, 9.3, 9.4; R03 4.2): `clrScheme` over the
 * twelve slots of `THEME_COLOR_SLOTS` in the API order (dk1, lt1, dk2, lt2, accent1 to accent6,
 * hlink, folHlink) from the theme's light tokens, the four semantic hues, the raised panel and the
 * link colour, with an edited deck's `themeEdits.colors.light` written over them; `fontScheme`
 * from the record's faces by their catalog name, the GT fixture names when none. Both built in
 * themes carry the same ten token values (SPEC-5 0.45), so their default parts differ in the name
 * alone; `masters.ts` (B4) reads this function for the Editable text theme part (b6.md request R9).
 */
export type ThemePartInput = {
  theme?: ThemeId;
  /** `themeEdits.colors.light`, `#rrggbb` per slot key */
  colors?: Readonly<Record<string, string>>;
  /** the faces by catalog name; the GT fixture names when absent */
  fonts?: { display?: string; text?: string };
};

const SLOT_ELEMENTS: ReadonlyArray<readonly [element: string, slot: string]> = [
  ['dk1', 'ink'],
  ['lt1', 'paper'],
  ['dk2', 'ink-2'],
  ['lt2', 'plate'],
  ['accent1', 'ok'],
  ['accent2', 'warn'],
  ['accent3', 'no'],
  ['accent4', 'info'],
  ['accent5', 'titanium'],
  ['accent6', 'raised'],
  ['hlink', 'link'],
  ['folHlink', 'titanium'],
];

/** The twelve slot values of a theme's light appearance as six upper case hex digits. */
export function themeSchemeColors(theme: ThemeId = 'gt-ink-paper'): Record<string, string> {
  const tokens = tokensFor(theme).light;
  const hex = (value: string): string => value.replace('#', '').slice(0, 6).toUpperCase();
  return {
    ink: hex(tokens.ink),
    paper: hex(tokens.paper),
    'ink-2': hex(tokens['ink-2']),
    // the plate composited on paper (R03 4.2)
    plate: 'F6F6F6',
    ok: hex(SEMANTIC.ok),
    warn: hex(SEMANTIC.warn),
    no: hex(SEMANTIC.no),
    info: hex(SEMANTIC.info),
    titanium: hex(tokens.titanium),
    raised: hex(PANEL.background),
    link: hex(SEMANTIC.info),
  };
}

export function themePartXml(input: ThemePartInput = {}): string {
  const theme = input.theme ?? 'gt-ink-paper';
  const name = theme === 'ts-plate' ? 'Turboslide Plate' : 'Turboslide';
  const scheme = themeSchemeColors(theme);
  for (const [key, value] of Object.entries(input.colors ?? {}))
    if (/^#[0-9a-fA-F]{6}/.test(value)) scheme[key] = value.slice(1, 7).toUpperCase();
  const colors = SLOT_ELEMENTS.map(
    ([element, slot]) =>
      `<a:${element}><a:srgbClr val="${scheme[slot] ?? '000000'}"/></a:${element}>`,
  ).join('');
  const major = input.fonts?.display ?? 'GT Inter Display';
  const minor = input.fonts?.text ?? 'GT Inter Text 22';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<a:theme xmlns:a="${NS_A}" name="${escapeXml(name)}"><a:themeElements>` +
    `<a:clrScheme name="${escapeXml(name)}">${colors}</a:clrScheme>` +
    `<a:fontScheme name="${escapeXml(name)}"><a:majorFont><a:latin typeface="${escapeXml(major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${escapeXml(minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="${escapeXml(name)}"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln w="7620"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="7620"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="7620"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>` +
    `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

/** The GT theme part as the rounds before five wrote it (the default of `themePartXml`). */
const THEME_XML = themePartXml();

const SP_TREE_EMPTY =
  `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`;

const MASTER_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${SP_TREE_EMPTY}</p:cSld>` +
  `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
  `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
  `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2640"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1320"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1320"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank">${SP_TREE_EMPTY}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

async function bytesOf(source: string | Uint8Array): Promise<Uint8Array> {
  return typeof source === 'string' ? new Uint8Array(await readFile(source)) : source;
}

/** Writes the package and returns its bytes. */
export async function buildFixturePptx(options: FixtureOptions): Promise<Uint8Array> {
  const zip = new JSZip();
  const date = new Date(0);
  const add = (path: string, content: string | Uint8Array, stored = false): void => {
    zip.file(path, content, { date, compression: stored ? 'STORE' : 'DEFLATE' });
  };
  const pages = options.pages;
  const overrides: string[] = [];
  const slideRels: string[] = [];
  let mediaN = 0;
  for (const [i, page] of pages.entries()) {
    const n = i + 1;
    const relEntries: { id: string; type: string; target: string }[] = [
      { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
    ];
    let rId = 2;
    const mediaIds: { background?: string; pictures: string[] } = { pictures: [] };
    if (page.background) {
      mediaN += 1;
      const name = `image${mediaN}.png`;
      add(`ppt/media/${name}`, await bytesOf(page.background), true);
      mediaIds.background = `rId${rId}`;
      relEntries.push({ id: `rId${rId}`, type: 'image', target: `../media/${name}` });
      rId += 1;
    }
    for (const pic of page.pictures ?? []) {
      mediaN += 1;
      const name = `image${mediaN}.png`;
      add(`ppt/media/${name}`, await bytesOf(pic.png), true);
      mediaIds.pictures.push(`rId${rId}`);
      relEntries.push({ id: `rId${rId}`, type: 'image', target: `../media/${name}` });
      rId += 1;
    }
    add(`ppt/slides/slide${n}.xml`, slideXml(page, mediaIds));
    add(`ppt/slides/_rels/slide${n}.xml.rels`, rels(relEntries));
    overrides.push(
      `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
    slideRels.push(
      `<Relationship Id="rId${n + 2}" Type="${REL}/slide" Target="slides/slide${n}.xml"/>`,
    );
  }
  add(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
      `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      overrides.join('') +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  add(
    '_rels/.rels',
    rels([
      { id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' },
      { id: 'rId2', type: 'metadata/core-properties', target: 'docProps/core.xml' },
      { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
    ]).replace(
      `${REL}/metadata/core-properties`,
      'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    ),
  );
  add(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${pages.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst>` +
      `<p:sldSz cx="${PAGE_EMU.width}" cy="${PAGE_EMU.height}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      `<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`,
  );
  add(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>` +
      slideRels.join('') +
      `</Relationships>`,
  );
  add('ppt/slideMasters/slideMaster1.xml', MASTER_XML);
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' },
    ]),
  );
  add('ppt/slideLayouts/slideLayout1.xml', LAYOUT_XML);
  add(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]),
  );
  add(
    'ppt/theme/theme1.xml',
    options.themePart === undefined ? THEME_XML : themePartXml(options.themePart),
  );
  add(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escapeXml(options.title ?? 'Turboslide verify fixture')}</dc:title><dc:creator>Turboslide</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">2026-09-10T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-09-10T00:00:00Z</dcterms:modified></cp:coreProperties>`,
  );
  add(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Turboslide</Application><Slides>${pages.length}</Slides></Properties>`,
  );
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, bytes);
  return bytes;
}
