// The styles of the ODP (gslides-parity SPEC-5 6.3; R09 2.4): `styles.xml` with the font face
// declarations, the default style carrying the deck's language (`fo:language`, `fo:country`;
// SPEC-5 7.1, b5.md R17), the page layout at the deck's page (`fo:page-width`, `fo:page-height`
// from `pageEmu`'s sheet pixels as centimetres; SPEC-5 6.1), the master page and its drawing page
// style, the arrow marker the line writer references; and the automatic style allocator of
// `content.xml`, one entry per distinct property set (graphic, paragraph, text, drawing page,
// presentation), so a deck with a thousand runs in ten looks carries ten text styles.
import { el } from './xml.ts';

/** The namespaces every ODF document of the writer declares, on the root element. */
export const ODF_NAMESPACES: Readonly<Record<string, string>> = {
  'xmlns:office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  'xmlns:style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  'xmlns:text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  'xmlns:table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  'xmlns:draw': 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  'xmlns:fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  'xmlns:xlink': 'http://www.w3.org/1999/xlink',
  'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
  'xmlns:meta': 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  'xmlns:number': 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
  'xmlns:presentation': 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  'xmlns:svg': 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  'xmlns:smil': 'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0',
  'xmlns:anim': 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
  'xmlns:loext': 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
  'xmlns:xml': 'http://www.w3.org/XML/1998/namespace',
  'office:version': '1.2',
};

/** The namespace attributes as one string for a root start tag. */
export function namespaceAttrs(): string {
  return Object.entries(ODF_NAMESPACES)
    .filter(([key]) => key !== 'xmlns:xml')
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
}

/** The deck's language tag split for `fo:language` and `fo:country`: `en-US` gives `en` and `US`. */
export function languageParts(tag: string | undefined): { language: string; country: string } {
  const [language = 'en', region] = (tag ?? 'en-US').split(/[-_]/);
  const country =
    region !== undefined && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : 'US';
  return { language: language.toLowerCase(), country };
}

export type StyleFamily =
  | 'graphic'
  | 'paragraph'
  | 'text'
  | 'drawing-page'
  | 'presentation'
  | 'table-column'
  | 'table-row'
  | 'table-cell';

const PREFIX: Readonly<Record<StyleFamily, string>> = {
  graphic: 'gr',
  paragraph: 'P',
  text: 'T',
  'drawing-page': 'dp',
  presentation: 'pr',
  'table-column': 'co',
  'table-row': 'ro',
  'table-cell': 'ce',
};

/**
 * The automatic styles of `content.xml`, deduplicated by content: `add(family, body)` answers the
 * name of a style whose body (the property elements) equals one seen before, else a new name.
 */
export class StyleAllocator {
  private readonly byBody = new Map<string, string>();
  private readonly entries: { name: string; family: StyleFamily; body: string; parent?: string }[] =
    [];
  private readonly counts: Record<StyleFamily, number> = {
    graphic: 0,
    paragraph: 0,
    text: 0,
    'drawing-page': 0,
    presentation: 0,
    'table-column': 0,
    'table-row': 0,
    'table-cell': 0,
  };

  add(family: StyleFamily, body: string, parent?: string): string {
    const key = `${family}|${parent ?? ''}|${body}`;
    const seen = this.byBody.get(key);
    if (seen !== undefined) return seen;
    this.counts[family] += 1;
    const name = `${PREFIX[family]}${this.counts[family]}`;
    this.byBody.set(key, name);
    this.entries.push({ name, family, body, parent });
    return name;
  }

  get size(): number {
    return this.entries.length;
  }

  /** The `office:automatic-styles` element with every style in creation order. */
  xml(extra = ''): string {
    const styles = this.entries
      .map((entry) =>
        el(
          'style:style',
          {
            'style:name': entry.name,
            'style:family': entry.family,
            ...(entry.parent !== undefined ? { 'style:parent-style-name': entry.parent } : {}),
          },
          entry.body,
        ),
      )
      .join('');
    return `<office:automatic-styles>${styles}${extra}</office:automatic-styles>`;
  }
}

/** The font face declarations: one per family the document names, generic sans or mono. */
export function fontFaceDecls(families: ReadonlySet<string>): string {
  const decls = [...families]
    .sort()
    .map((family) =>
      el('style:font-face', {
        'style:name': family,
        'svg:font-family': family.includes(' ') ? `'${family}'` : family,
        'style:font-family-generic': /mono|menlo|consolas|courier/i.test(family)
          ? 'modern'
          : 'swiss',
        'style:font-pitch': /mono|menlo|consolas|courier/i.test(family) ? 'fixed' : 'variable',
      }),
    )
    .join('');
  return `<office:font-face-decls>${decls}</office:font-face-decls>`;
}

export type StylesInput = {
  /** The deck's page in sheet pixels. */
  page: { width: number; height: number };
  /** The deck's BCP 47 tag; en-US when absent. */
  language?: string;
  /** Every font family the content names. */
  families: ReadonlySet<string>;
  /** The paper colour of the theme as `#rrggbb`: the master page's fill. */
  paperHex: string;
  /** The default text face (Inter). */
  defaultFamily: string;
};

/**
 * `styles.xml`: the font faces, the default style with the language, the page layout at the
 * deck's page, the arrow marker, the master page `Default` with the paper as its fill and the
 * notes layout under it.
 */
export function stylesXml(input: StylesInput): string {
  const { language, country } = languageParts(input.language);
  // four decimals (a micrometre): 1600 px reads 33.8667cm, 12,192,012 EMU, within a sheet pixel of the page's 12,192,000
  const cmOf = (px: number): string => `${((px * 2.54) / 120).toFixed(4)}cm`;
  const landscape = input.page.width >= input.page.height;
  const defaults =
    el(
      'style:default-style',
      { 'style:family': 'graphic' },
      el('style:graphic-properties', {
        'draw:stroke': 'none',
        'draw:fill': 'none',
        'draw:textarea-horizontal-align': 'left',
        'draw:textarea-vertical-align': 'top',
        'fo:padding-top': '0cm',
        'fo:padding-bottom': '0cm',
        'fo:padding-left': '0cm',
        'fo:padding-right': '0cm',
        'fo:wrap-option': 'wrap',
      }) +
        el('style:paragraph-properties', { 'fo:margin-top': '0cm', 'fo:margin-bottom': '0cm' }) +
        el('style:text-properties', {
          'style:font-name': input.defaultFamily,
          'fo:font-size': '18pt',
          'fo:language': language,
          'fo:country': country,
          'style:language-asian': 'zxx',
          'style:country-asian': 'none',
          'style:language-complex': 'zxx',
          'style:country-complex': 'none',
        }),
    ) +
    el(
      'style:style',
      { 'style:name': 'standard', 'style:family': 'graphic' },
      el('style:graphic-properties', { 'draw:stroke': 'none', 'draw:fill': 'none' }),
    ) +
    el('draw:marker', {
      'draw:name': 'Arrow',
      'svg:viewBox': '0 0 20 30',
      'svg:d': 'M10 0l-10 30h20z',
    }) +
    el('draw:marker', {
      'draw:name': 'Circle',
      'svg:viewBox': '0 0 1131 1131',
      'svg:d':
        'M462 1118l-102-29-102-51-93-72-72-93-51-102-29-102-13-105 13-102 29-106 51-102 72-89 93-72 102-50 102-34 106-9 101 9 106 34 98 50 93 72 72 89 51 102 29 106 13 102-13 105-29 102-51 102-72 93-93 72-98 51-106 29-101 13z',
    }) +
    el('draw:marker', {
      'draw:name': 'Square',
      'svg:viewBox': '0 0 10 10',
      'svg:d': 'M0 0h10v10h-10z',
    });
  const pageLayout = el(
    'style:page-layout',
    { 'style:name': 'PM1' },
    el('style:page-layout-properties', {
      'fo:margin-top': '0cm',
      'fo:margin-bottom': '0cm',
      'fo:margin-left': '0cm',
      'fo:margin-right': '0cm',
      'fo:page-width': cmOf(input.page.width),
      'fo:page-height': cmOf(input.page.height),
      'style:print-orientation': landscape ? 'landscape' : 'portrait',
    }),
  );
  const notesLayout = el(
    'style:page-layout',
    { 'style:name': 'PM2' },
    el('style:page-layout-properties', {
      'fo:margin-top': '1cm',
      'fo:margin-bottom': '1cm',
      'fo:margin-left': '1cm',
      'fo:margin-right': '1cm',
      'fo:page-width': '21cm',
      'fo:page-height': '29.7cm',
      'style:print-orientation': 'portrait',
    }),
  );
  const masterDrawingPage = el(
    'style:style',
    { 'style:name': 'Mdp1', 'style:family': 'drawing-page' },
    el('style:drawing-page-properties', {
      'draw:background-size': 'border',
      'draw:fill': 'solid',
      'draw:fill-color': input.paperHex,
    }),
  );
  const notesDrawingPage = el(
    'style:style',
    { 'style:name': 'Mdp2', 'style:family': 'drawing-page' },
    el('style:drawing-page-properties', { 'draw:fill': 'none' }),
  );
  const master = el(
    'style:master-page',
    {
      'style:name': 'Default',
      'style:page-layout-name': 'PM1',
      'draw:style-name': 'Mdp1',
    },
    el(
      'presentation:notes',
      { 'style:page-layout-name': 'PM2', 'draw:style-name': 'Mdp2' },
      el('draw:page-thumbnail', {
        'presentation:class': 'page',
        'svg:width': '13.968cm',
        'svg:height': '7.857cm',
        'svg:x': '2.516cm',
        'svg:y': '2.257cm',
      }) +
        el(
          'draw:frame',
          {
            'presentation:class': 'notes',
            'svg:width': '16.799cm',
            'svg:height': '13.364cm',
            'svg:x': '2.1cm',
            'svg:y': '12.4cm',
          },
          '<draw:text-box/>',
        ),
    ),
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-styles${namespaceAttrs()}>` +
    fontFaceDecls(input.families) +
    `<office:styles>${defaults}</office:styles>` +
    `<office:automatic-styles>${pageLayout}${notesLayout}${masterDrawingPage}${notesDrawingPage}</office:automatic-styles>` +
    `<office:master-styles>${master}</office:master-styles>` +
    '</office:document-styles>\n'
  );
}
