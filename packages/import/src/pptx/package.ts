// The package layer of the PPTX reader (gslides-parity SPEC-5 0.26, 5.1, 5.2; R04 sections 3 and
// 9): the Open Packaging Conventions over an inflated entry list, the content types, the
// relationships of every part with their targets resolved by name (never joined to a path), the
// refusals (a binary `.ppt` by the OLE signature, a macro enabled `.pptm` by content type, an
// `.odp` by its mimetype entry, a package without `ppt/presentation.xml`), the validation the
// export's `validatePackage` runs (a package that fails it is read anyway and the report carries
// the issues, as PowerPoint's repair pass does), and the presentation part's walk (the slide order
// from `p:sldIdLst`, hidden slides, the page size, the sections, the theme parts, the producer).
//
// The bytes come in through the store's `readZip` (`packages/store/src/zip.ts`), the zip bomb
// guard the studio already trusts, with `PPTX_INFLATE_MAX_BYTES` as its cap; the orchestrator
// (`import-pptx.ts`) calls it and hands the entries here, so this module stays a pure reader over
// `{ name, data }` entries (the store's `ZipEntry` shape) and the tests can build a package from
// entries directly. Every part is parsed at most once and cached.
import type { Document, Element } from '@xmldom/xmldom';
import {
  NS,
  attr,
  attrNS,
  child,
  children,
  descendants,
  elementChildren,
  intAttr,
  is,
  ownText,
  parseXml,
  path,
} from './xml.ts';

/** One inflated archive entry: the store's `ZipEntry` shape. */
export type PackageEntry = { name: string; data: Uint8Array };

/** A `.pptx` is capped like a bundle: 200 MB on the wire (SPEC-5 5.2). */
export const PPTX_MAX_BYTES = 200 * 1024 * 1024;

/** The most the entries may inflate to together (SPEC-5 5.2), the store reader's `maxTotalBytes`. */
export const PPTX_INFLATE_MAX_BYTES = 400 * 1024 * 1024;

export const PPTX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** The content types the walk keys on. */
export const CONTENT_TYPES = {
  presentation:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  slideshow: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  template: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  diagramDrawing: 'application/vnd.ms-office.drawingml.diagramDrawing+xml',
  extendedProperties: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  coreProperties: 'application/vnd.openxmlformats-package.core-properties+xml',
} as const;

/** The macro enabled main parts (`.pptm`, `.ppsm`, `.potm`), refused by content type (R04 9). */
export const MACRO_CONTENT_TYPES: readonly string[] = [
  'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml',
  'application/vnd.ms-powerpoint.template.macroEnabled.main+xml',
];

export const ODP_MIMETYPE = 'application/vnd.oasis.opendocument.presentation';

const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MS_REL_2007 = 'http://schemas.microsoft.com/office/2007/relationships';
const PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** The relationship types the reader follows (R04 section 3). */
export const REL = {
  officeDocument: `${OFFICE_REL}/officeDocument`,
  slide: `${OFFICE_REL}/slide`,
  slideLayout: `${OFFICE_REL}/slideLayout`,
  slideMaster: `${OFFICE_REL}/slideMaster`,
  theme: `${OFFICE_REL}/theme`,
  notesSlide: `${OFFICE_REL}/notesSlide`,
  notesMaster: `${OFFICE_REL}/notesMaster`,
  image: `${OFFICE_REL}/image`,
  hyperlink: `${OFFICE_REL}/hyperlink`,
  chart: `${OFFICE_REL}/chart`,
  diagramData: `${OFFICE_REL}/diagramData`,
  diagramLayout: `${OFFICE_REL}/diagramLayout`,
  diagramQuickStyle: `${OFFICE_REL}/diagramQuickStyle`,
  diagramColors: `${OFFICE_REL}/diagramColors`,
  diagramDrawing: `${MS_REL_2007}/diagramDrawing`,
  video: `${OFFICE_REL}/video`,
  audio: `${OFFICE_REL}/audio`,
  media: `${MS_REL_2007}/media`,
  oleObject: `${OFFICE_REL}/oleObject`,
  package: `${OFFICE_REL}/package`,
  comments: `${OFFICE_REL}/comments`,
  commentAuthors: `${OFFICE_REL}/commentAuthors`,
  tableStyles: `${OFFICE_REL}/tableStyles`,
  extendedProperties: `${OFFICE_REL}/extended-properties`,
  coreProperties: `${PACKAGE_REL}/metadata/core-properties`,
} as const;

export type RelationshipMode = 'Internal' | 'External';

export type Relationship = {
  id: string;
  type: string;
  /** the `Target` attribute as written */
  target: string;
  mode: RelationshipMode;
  /** the part the target names, resolved against the source part's folder; External targets have none */
  part?: string;
};

/** The refusal codes of SPEC-5 5.2 and R04 9; each is one sentence in the dialog and a TypeError in the CLI. */
export type PackageRefusalCode =
  'binary' | 'not-zip' | 'too-large' | 'macro' | 'odp' | 'no-presentation' | 'encrypted';

export class PackageRefusal extends TypeError {
  readonly code: PackageRefusalCode;
  constructor(code: PackageRefusalCode, message: string) {
    super(message);
    this.name = 'PackageRefusal';
    this.code = code;
  }
}

/** The OLE compound file signature: a binary `.ppt`, `.pps`, `.pot` or an encrypted package (R04 9). */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];

export type PackageSniff = 'zip' | 'ole' | 'unknown';

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** What the first bytes say the file is. */
export function sniffPackage(bytes: Uint8Array): PackageSniff {
  if (startsWith(bytes, ZIP_LOCAL) || startsWith(bytes, ZIP_EMPTY)) return 'zip';
  if (startsWith(bytes, OLE_SIGNATURE)) return 'ole';
  return 'unknown';
}

/**
 * The refusals a file earns before it is inflated (R04 9): the OLE signature (a `.ppt` family
 * file or an encrypted package, which is an OLE container), a file that is not a zip, and the
 * size cap. Throws a `PackageRefusal`; returns when the bytes may go to `readZip`.
 */
export function refuseBySignature(bytes: Uint8Array, fileName = 'the file'): void {
  if (bytes.byteLength > PPTX_MAX_BYTES) {
    throw new PackageRefusal(
      'too-large',
      `${fileName} is ${bytes.byteLength} bytes; a PowerPoint file is imported up to ${PPTX_MAX_BYTES} bytes`,
    );
  }
  const kind = sniffPackage(bytes);
  if (kind === 'ole') {
    throw new PackageRefusal(
      'binary',
      `${fileName} is a binary PowerPoint file (.ppt, .pps, .pot) or an encrypted package; save it as .pptx without a password and import that`,
    );
  }
  if (kind === 'unknown') {
    throw new PackageRefusal('not-zip', `${fileName} is not a PowerPoint file (.pptx)`);
  }
}

/** The part a `.rels` part describes: `ppt/slides/_rels/slide1.xml.rels` names `ppt/slides/slide1.xml`; `_rels/.rels` names the package (''). */
export function sourceOfRels(relsPath: string): string {
  const match = /^(.*?)_rels\/(.*)\.rels$/.exec(relsPath);
  if (!match) return '';
  const dir = match[1] ?? '';
  const name = match[2] ?? '';
  return name === '' ? '' : `${dir}${name}`;
}

/** The `.rels` part of a part: `ppt/slides/slide1.xml` has `ppt/slides/_rels/slide1.xml.rels`; the package has `_rels/.rels`. */
export function relsPathOf(part: string): string {
  if (part === '') return '_rels/.rels';
  const slash = part.lastIndexOf('/');
  const dir = slash >= 0 ? part.slice(0, slash + 1) : '';
  const name = slash >= 0 ? part.slice(slash + 1) : part;
  return `${dir}_rels/${name}.rels`;
}

function normalizePartName(pathName: string): string {
  const out: string[] = [];
  for (const segment of pathName.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

/** A relationship target resolved against the source part's folder; `/x/y` is package absolute. The result is a name looked up in the part map, never a file path. */
export function resolveTarget(sourcePart: string, target: string): string {
  const decoded = safeDecode(target);
  if (decoded.startsWith('/')) return normalizePartName(decoded.slice(1));
  const dir = sourcePart.includes('/') ? sourcePart.slice(0, sourcePart.lastIndexOf('/') + 1) : '';
  return normalizePartName(`${dir}${decoded}`);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type PackageValidation = {
  parts: number;
  relationships: number;
  /** `<rels part>: <Id> -> <Target>` for every relationship whose target is not in the package */
  invalidRelationships: string[];
  /** parts with neither an Override nor a Default content type */
  undeclaredParts: string[];
  /** Override PartNames naming parts the package does not hold */
  missingOverrides: string[];
  issues: string[];
  valid: boolean;
};

const decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * A `.pptx` as parts (R04 3): the entries by name with the content types and the relationships
 * read on demand and cached.
 */
export class PptxPackage {
  readonly fileName: string;
  private readonly entries = new Map<string, Uint8Array>();
  private readonly texts = new Map<string, string>();
  private readonly documents = new Map<string, Document>();
  private readonly rels = new Map<string, Relationship[]>();
  private readonly defaults = new Map<string, string>();
  private readonly overrides = new Map<string, string>();

  constructor(entries: readonly PackageEntry[], fileName = 'presentation.pptx') {
    this.fileName = fileName;
    for (const entry of entries) {
      // a leading slash or a Finder folder entry never reaches the map by that name
      const name = entry.name.replace(/^\/+/, '');
      if (name === '' || name.endsWith('/')) continue;
      this.entries.set(name, entry.data);
    }
    this.readContentTypes();
  }

  private readContentTypes(): void {
    if (!this.has('[Content_Types].xml')) return;
    const root = this.xml('[Content_Types].xml').documentElement;
    if (root === null) return;
    for (const node of elementChildren(root)) {
      if (is(node, 'ct', 'Default')) {
        const ext = attr(node, 'Extension');
        const type = attr(node, 'ContentType');
        if (ext !== undefined && type !== undefined) this.defaults.set(ext.toLowerCase(), type);
      } else if (is(node, 'ct', 'Override')) {
        const name = attr(node, 'PartName');
        const type = attr(node, 'ContentType');
        if (name !== undefined && type !== undefined)
          this.overrides.set(name.replace(/^\//, ''), type);
      }
    }
  }

  /** Every part name, sorted. */
  parts(): string[] {
    return [...this.entries.keys()].sort();
  }

  has(part: string): boolean {
    return this.entries.has(part);
  }

  /** The bytes of a part; a TypeError names a missing part. */
  bytes(part: string): Uint8Array {
    const data = this.entries.get(part);
    if (data === undefined) throw new TypeError(`${this.fileName} has no part ${part}`);
    return data;
  }

  /** The text of a part, decoded once. */
  text(part: string): string {
    const cached = this.texts.get(part);
    if (cached !== undefined) return cached;
    const text = decoder.decode(this.bytes(part)).replace(/^﻿/, '');
    this.texts.set(part, text);
    return text;
  }

  /** The parsed document of an XML part, parsed once (a DOCTYPE or a malformed part refuses). */
  xml(part: string): Document {
    const cached = this.documents.get(part);
    if (cached !== undefined) return cached;
    const parsed = parseXml(this.text(part), `${this.fileName}: ${part}`);
    this.documents.set(part, parsed.document);
    return parsed.document;
  }

  /** The root element of an XML part. */
  root(part: string): Element {
    const root = this.xml(part).documentElement;
    if (root === null) throw new TypeError(`${this.fileName}: ${part} has no root element`);
    return root;
  }

  /** The content type of a part through its Override, else the Default for its extension. */
  contentTypeOf(part: string): string | undefined {
    const override = this.overrides.get(part);
    if (override !== undefined) return override;
    const dot = part.lastIndexOf('.');
    const ext = dot >= 0 ? part.slice(dot + 1).toLowerCase() : '';
    return this.defaults.get(ext);
  }

  /** Every part carrying the content type, sorted by name. */
  partsOfType(contentType: string): string[] {
    return this.parts().filter((part) => this.contentTypeOf(part) === contentType);
  }

  /** The Default content types by extension and the Overrides by part name (for the validation). */
  contentTypes(): {
    defaults: ReadonlyMap<string, string>;
    overrides: ReadonlyMap<string, string>;
  } {
    return { defaults: this.defaults, overrides: this.overrides };
  }

  /** The relationships of a part (`''` for the package), each Internal target resolved to a part name. */
  relationships(part: string): Relationship[] {
    const cached = this.rels.get(part);
    if (cached !== undefined) return cached;
    const relsPart = relsPathOf(part);
    const out: Relationship[] = [];
    if (this.has(relsPart)) {
      const root = this.xml(relsPart).documentElement;
      if (root !== null) {
        for (const node of children(root, 'rel', 'Relationship')) {
          const id = attr(node, 'Id') ?? '';
          const type = attr(node, 'Type') ?? '';
          const target = attr(node, 'Target') ?? '';
          const mode: RelationshipMode =
            attr(node, 'TargetMode') === 'External' ? 'External' : 'Internal';
          out.push(
            mode === 'External'
              ? { id, type, target, mode }
              : { id, type, target, mode, part: resolveTarget(part, target) },
          );
        }
      }
    }
    this.rels.set(part, out);
    return out;
  }

  /** The relationship of a part by id, or undefined. */
  relationship(part: string, id: string): Relationship | undefined {
    return this.relationships(part).find((rel) => rel.id === id);
  }

  /** The Internal part a relationship id names, when it exists in the package. */
  target(part: string, id: string): string | undefined {
    const rel = this.relationship(part, id);
    if (rel === undefined || rel.part === undefined || !this.has(rel.part)) return undefined;
    return rel.part;
  }

  /** The relationships of a part with the given type. */
  related(part: string, type: string): Relationship[] {
    return this.relationships(part).filter((rel) => rel.type === type);
  }

  /** The first Internal part related to `part` by `type` that the package holds. */
  firstRelated(part: string, type: string): string | undefined {
    for (const rel of this.related(part, type)) {
      if (rel.part !== undefined && this.has(rel.part)) return rel.part;
    }
    return undefined;
  }

  /** The main presentation part named by the package relationships, else `ppt/presentation.xml`. */
  presentationPart(): string {
    return this.firstRelated('', REL.officeDocument) ?? 'ppt/presentation.xml';
  }
}

export type OpenPackageOptions = { fileName?: string };

/**
 * Opens inflated entries as a package (R04 9): refuses an `.odp`, a macro enabled main part and
 * a package without a presentation part; everything else is read, and `validatePackage` says
 * what the Open Packaging Conventions would have refused.
 */
export function openPackage(
  entries: readonly PackageEntry[],
  options: OpenPackageOptions = {},
): PptxPackage {
  const fileName = options.fileName ?? 'presentation.pptx';
  const pkg = new PptxPackage(entries, fileName);
  if (pkg.has('mimetype')) {
    const mimetype = pkg.text('mimetype').trim();
    if (mimetype === ODP_MIMETYPE) {
      throw new PackageRefusal(
        'odp',
        `${fileName} is an OpenDocument presentation (.odp); Turboslide writes .odp and reads .pptx, so save it as .pptx first`,
      );
    }
  }
  const main = pkg.presentationPart();
  const mainType = pkg.has(main) ? pkg.contentTypeOf(main) : undefined;
  if (mainType !== undefined && MACRO_CONTENT_TYPES.includes(mainType)) {
    throw new PackageRefusal(
      'macro',
      `${fileName} is macro enabled (.pptm, .ppsm or .potm); save it as .pptx without macros and import that`,
    );
  }
  if (pkg.has('EncryptedPackage') || pkg.has('EncryptionInfo')) {
    throw new PackageRefusal(
      'encrypted',
      `${fileName} is encrypted; remove the password in PowerPoint and import the saved file`,
    );
  }
  if (!pkg.has(main)) {
    throw new PackageRefusal(
      'no-presentation',
      `${fileName} holds no ppt/presentation.xml, so it is not a PowerPoint presentation`,
    );
  }
  return pkg;
}

/**
 * The Open Packaging Conventions checks of the export's `validatePackage`
 * (`packages/export/src/ooxml/validate.ts`), over the part map: every part has a content type,
 * every Override names a part the package holds, `_rels/.rels` names the office document, every
 * Internal relationship resolves to a part and no relationship id repeats inside one part. A
 * package that fails is still read; the report carries the issues (R04 1 decision 4).
 */
export function validatePackage(pkg: PptxPackage): PackageValidation {
  const parts = pkg.parts();
  const partSet = new Set(parts);
  const issues: string[] = [];
  const undeclaredParts: string[] = [];
  const missingOverrides: string[] = [];
  const invalidRelationships: string[] = [];
  let relationships = 0;

  if (!partSet.has('[Content_Types].xml')) {
    issues.push('[Content_Types].xml is missing');
  } else {
    const { overrides } = pkg.contentTypes();
    for (const name of overrides.keys()) {
      if (!partSet.has(name)) missingOverrides.push(`/${name}`);
    }
    for (const part of parts) {
      if (part === '[Content_Types].xml') continue;
      if (pkg.contentTypeOf(part) === undefined) undeclaredParts.push(part);
    }
  }

  if (!partSet.has('_rels/.rels')) {
    issues.push('_rels/.rels is missing');
  } else if (pkg.related('', REL.officeDocument).length === 0) {
    issues.push('_rels/.rels names no officeDocument relationship');
  }

  for (const rels of parts.filter((p) => p.endsWith('.rels'))) {
    const source = sourceOfRels(rels);
    if (source !== '' && !partSet.has(source)) {
      issues.push(`${rels} describes ${source}, which is not in the package`);
    }
    const ids = new Set<string>();
    for (const rel of pkg.relationships(source)) {
      relationships += 1;
      if (ids.has(rel.id)) issues.push(`${rels}: relationship id ${rel.id} repeats`);
      ids.add(rel.id);
      if (rel.mode === 'External') continue;
      if (rel.part === undefined || !partSet.has(rel.part)) {
        invalidRelationships.push(`${rels}: ${rel.id} -> ${rel.target}`);
      }
    }
  }

  for (const line of undeclaredParts) issues.push(`no content type for ${line}`);
  for (const line of missingOverrides)
    issues.push(`content type override for missing part ${line}`);
  for (const line of invalidRelationships) issues.push(`relationship target missing: ${line}`);
  return {
    parts: parts.length,
    relationships,
    invalidRelationships,
    undeclaredParts,
    missingOverrides,
    issues,
    valid: issues.length === 0,
  };
}

export type SlideRef = {
  /** the slide part, `ppt/slides/slide3.xml` */
  part: string;
  /** one based position in `p:sldIdLst`, the order the reader keeps (never the file number) */
  index: number;
  /** the `p:sldId id` */
  id: number;
  rId: string;
  /** `show="0"`: a hidden slide, imported as `skip: true` (R04 5.1) */
  hidden: boolean;
};

export type SectionRef = { id: string; name: string; slideIds: number[] };

export type PresentationInfo = {
  part: string;
  slides: SlideRef[];
  /** `p:sldSz` in EMU; the 16:9 page when absent */
  size: { cx: number; cy: number; type?: string };
  notesSize?: { cx: number; cy: number };
  /** `p14:sectionLst` in order; empty when the file has none */
  sections: SectionRef[];
  /** the master parts in `p:sldMasterIdLst` order */
  masters: string[];
  /** every `ppt/theme/themeN.xml` the package holds, sorted by number (SPEC-5 0.28) */
  themes: string[];
  /** `p:defaultTextStyle`, the last fallback of the text style walk */
  defaultTextStyle?: Element;
  /** `p:embeddedFontLst` typefaces, named in the report's source block (R04 5.10) */
  embeddedFonts: string[];
  /** `p:modifyVerifier` present: a password to modify, named in the report (R04 5.10) */
  modifyVerifier: boolean;
  producer: { application?: string; version?: string };
  title?: string;
};

function themeNumber(part: string): number {
  return Number(/theme(\d+)\.xml$/.exec(part)?.[1] ?? 0);
}

/** The presentation part's walk (R04 section 3, the first three rows). */
export function readPresentation(pkg: PptxPackage): PresentationInfo {
  const part = pkg.presentationPart();
  const root = pkg.root(part);
  const slides: SlideRef[] = [];
  const idList = child(root, 'p', 'sldIdLst');
  if (idList !== undefined) {
    let index = 0;
    for (const sldId of children(idList, 'p', 'sldId')) {
      const rId = attrNS(sldId, 'r', 'id') ?? '';
      const target = pkg.target(part, rId);
      if (target === undefined) continue;
      index += 1;
      slides.push({
        part: target,
        index,
        id: intAttr(sldId, 'id') ?? index,
        rId,
        hidden: attr(sldId, 'show') === '0',
      });
    }
  }
  const sldSz = child(root, 'p', 'sldSz');
  const size = {
    cx: (sldSz && intAttr(sldSz, 'cx')) || 12_192_000,
    cy: (sldSz && intAttr(sldSz, 'cy')) || 6_858_000,
    ...(sldSz && attr(sldSz, 'type') !== undefined ? { type: attr(sldSz, 'type') } : {}),
  };
  const notesSz = child(root, 'p', 'notesSz');
  const notesSize =
    notesSz && intAttr(notesSz, 'cx') !== undefined && intAttr(notesSz, 'cy') !== undefined
      ? { cx: intAttr(notesSz, 'cx') ?? 0, cy: intAttr(notesSz, 'cy') ?? 0 }
      : undefined;

  const sections: SectionRef[] = [];
  for (const section of descendants(root, 'p14', 'section')) {
    const ids: number[] = [];
    const list = child(section, 'p14', 'sldIdLst');
    if (list !== undefined) {
      for (const sldId of children(list, 'p14', 'sldId')) {
        const id = intAttr(sldId, 'id');
        if (id !== undefined) ids.push(id);
      }
    }
    sections.push({
      id: attr(section, 'id') ?? '',
      name: attr(section, 'name') ?? '',
      slideIds: ids,
    });
  }

  const masters: string[] = [];
  const masterList = child(root, 'p', 'sldMasterIdLst');
  if (masterList !== undefined) {
    for (const masterId of children(masterList, 'p', 'sldMasterId')) {
      const target = pkg.target(part, attrNS(masterId, 'r', 'id') ?? '');
      if (target !== undefined) masters.push(target);
    }
  }
  const themes = pkg
    .parts()
    .filter((p) => /^ppt\/theme\/theme\d+\.xml$/.test(p))
    .sort((a, b) => themeNumber(a) - themeNumber(b));

  const embeddedFonts: string[] = [];
  const fontList = child(root, 'p', 'embeddedFontLst');
  if (fontList !== undefined) {
    for (const embedded of children(fontList, 'p', 'embeddedFont')) {
      const font = child(embedded, 'p', 'font');
      const typeface = font && attr(font, 'typeface');
      if (typeface !== undefined && typeface !== '') embeddedFonts.push(typeface);
    }
  }

  const info: PresentationInfo = {
    part,
    slides,
    size,
    ...(notesSize ? { notesSize } : {}),
    sections,
    masters,
    themes,
    embeddedFonts,
    modifyVerifier: child(root, 'p', 'modifyVerifier') !== undefined,
    producer: readProducer(pkg),
  };
  const defaultTextStyle = child(root, 'p', 'defaultTextStyle');
  if (defaultTextStyle !== undefined) info.defaultTextStyle = defaultTextStyle;
  const title = readTitle(pkg);
  if (title !== undefined) info.title = title;
  return info;
}

/** `docProps/app.xml`'s Application and AppVersion (R04 3, the producer the report names). */
export function readProducer(pkg: PptxPackage): { application?: string; version?: string } {
  const part = pkg.firstRelated('', REL.extendedProperties) ?? 'docProps/app.xml';
  if (!pkg.has(part)) return {};
  let root: Element;
  try {
    root = pkg.root(part);
  } catch {
    return {};
  }
  const out: { application?: string; version?: string } = {};
  const application = child(root, 'ep', 'Application');
  const version = child(root, 'ep', 'AppVersion');
  const app = application && ownText(application).trim();
  const ver = version && ownText(version).trim();
  if (app !== undefined && app !== '') out.application = app;
  if (ver !== undefined && ver !== '') out.version = ver;
  return out;
}

/** `docProps/core.xml`'s `dc:title`, when the package has one. */
export function readTitle(pkg: PptxPackage): string | undefined {
  const part = pkg.firstRelated('', REL.coreProperties) ?? 'docProps/core.xml';
  if (!pkg.has(part)) return undefined;
  let root: Element;
  try {
    root = pkg.root(part);
  } catch {
    return undefined;
  }
  const title = child(root, 'dc', 'title');
  const text = title && ownText(title).trim();
  return text !== undefined && text !== '' ? text : undefined;
}

/** The `p:spTree` of a slide, layout or master part. */
export function shapeTree(root: Element): Element | undefined {
  return path(root, ['p', 'cSld'], ['p', 'spTree']);
}

export { NS };
