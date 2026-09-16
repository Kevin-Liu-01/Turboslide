// The ODF package (gslides-parity SPEC-5 6.3; ODF 1.2 part 3): `mimetype` as the first zip
// entry, stored, with no extra field, so a reader identifies the file from its first bytes; then
// the manifest naming every part with its media type, `content.xml`, `styles.xml`, `meta.xml`,
// `settings.xml`, and the pictures and media stored (their bytes are compressed already). jszip
// writes entries in insertion order and, for ASCII names, no extra field, which
// `odp/package.test.ts` pins by reading the first local header back (check/odf.ts
// `firstEntryFacts`).
import JSZip from 'jszip';

import { ENTRY_DATE } from '../ooxml/zip.ts';
import { esc } from './xml.ts';

export const ODP_MIME = 'application/vnd.oasis.opendocument.presentation';

/** One binary part of the package: pictures under `Pictures/`, media under `Media/`. */
export type OdfBinaryPart = { path: string; bytes: Uint8Array; mime: string };

export type OdfPackageInput = {
  content: string;
  styles: string;
  meta: string;
  settings?: string;
  parts: OdfBinaryPart[];
};

/** The manifest: the root with the package's media type and version, one entry per part. */
export function manifestXml(input: OdfPackageInput): string {
  const entries: [string, string][] = [
    ['/', ODP_MIME],
    ['content.xml', 'text/xml'],
    ['styles.xml', 'text/xml'],
    ['meta.xml', 'text/xml'],
    ...(input.settings !== undefined ? ([['settings.xml', 'text/xml']] as [string, string][]) : []),
    ...input.parts.map((part): [string, string] => [part.path, part.mime]),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
    entries
      .map(([path, mime]) =>
        path === '/'
          ? `<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${esc(mime)}"/>`
          : `<manifest:file-entry manifest:full-path="${esc(path)}" manifest:media-type="${esc(mime)}"/>`,
      )
      .join('') +
    '</manifest:manifest>\n'
  );
}

/** The package bytes: mimetype first and stored, the XML deflated, the binary parts stored. */
export async function writeOdfPackage(input: OdfPackageInput): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', ODP_MIME, { compression: 'STORE', date: ENTRY_DATE });
  zip.file('META-INF/manifest.xml', manifestXml(input), {
    compression: 'DEFLATE',
    date: ENTRY_DATE,
  });
  zip.file('content.xml', input.content, { compression: 'DEFLATE', date: ENTRY_DATE });
  zip.file('styles.xml', input.styles, { compression: 'DEFLATE', date: ENTRY_DATE });
  zip.file('meta.xml', input.meta, { compression: 'DEFLATE', date: ENTRY_DATE });
  if (input.settings !== undefined)
    zip.file('settings.xml', input.settings, { compression: 'DEFLATE', date: ENTRY_DATE });
  for (const part of input.parts)
    zip.file(part.path, part.bytes, { compression: 'STORE', date: ENTRY_DATE });
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: ODP_MIME,
  });
}

/** meta.xml: the generator, the title, the dates and the page count (a reader's File > Properties). */
export function metaXml(input: {
  title: string;
  pages: number;
  revision: number;
  generator?: string;
}): string {
  const now = new Date(0).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2">' +
    '<office:meta>' +
    `<meta:generator>${esc(input.generator ?? 'Turboslide')}</meta:generator>` +
    `<dc:title>${esc(input.title)}</dc:title>` +
    `<dc:description>Revision ${input.revision}</dc:description>` +
    `<meta:creation-date>${now}</meta:creation-date>` +
    `<dc:date>${now}</dc:date>` +
    `<meta:document-statistic meta:object-count="${input.pages}"/>` +
    '</office:meta></office:document-meta>\n'
  );
}

/** settings.xml: the one setting a reader honours at open, the first page shown. */
export function settingsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" office:version="1.2">' +
    '<office:settings><config:config-item-set config:name="ooo:view-settings">' +
    '<config:config-item config:name="PageKind" config:type="short">0</config:config-item>' +
    '</config:config-item-set></office:settings></office:document-settings>\n'
  );
}
