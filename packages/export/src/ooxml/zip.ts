// The package as a zip (SPEC 8.2 post-process): open the pptxgenjs output with jszip, read and
// rewrite parts, and write it back with media parts stored and XML deflated. PNG and JPEG do not
// compress (deflate ratio 0.934 on a PNG, slides report section 3.3), so storing them saves the
// deflate time and changes nothing else.
import JSZip from 'jszip';

export type Package = JSZip;

export async function openPackage(bytes: Uint8Array): Promise<Package> {
  return JSZip.loadAsync(bytes);
}

export async function readPart(zip: Package, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`ooxml: no part ${path}`);
  return file.async('string');
}

export async function readPartBytes(zip: Package, path: string): Promise<Uint8Array> {
  const file = zip.file(path);
  if (!file) throw new Error(`ooxml: no part ${path}`);
  return file.async('uint8array');
}

export function hasPart(zip: Package, path: string): boolean {
  return zip.file(path) !== null;
}

export function writePart(zip: Package, path: string, content: string | Uint8Array): void {
  zip.file(path, content);
}

export function listParts(zip: Package): string[] {
  return Object.keys(zip.files)
    .filter((path) => !zip.files[path]?.dir)
    .sort();
}

/** ppt/slides/slideN.xml in slide order. */
export function slideParts(zip: Package): string[] {
  return listParts(zip)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
}

export function slideNumber(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0);
}

/**
 * True for a part that is already compressed data and is stored rather than deflated. An svg
 * media part (docs/VECTOR.md 4.6) is text and deflates by about three quarters, so it is the one
 * media part that is deflated.
 */
export function isStoredPart(path: string): boolean {
  if (/\.svg$/i.test(path)) return false;
  return /^ppt\/(media|fonts)\//.test(path) || /\.(png|jpe?g|gif|webp|fntdata)$/i.test(path);
}

/**
 * The zip entry date: the DOS epoch, the earliest date a zip entry can carry. `new Date(0)` (1970)
 * lies below it and jszip wrapped it to 2098 on the stored parts (measured on the M5 files), a
 * date PowerPoint's repair pass has no reason to see.
 */
export const ENTRY_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

/** Writes the package: media and font parts stored, everything else deflated. */
export async function writePackage(zip: Package): Promise<Uint8Array> {
  const out = new JSZip();
  for (const path of listParts(zip)) {
    const file = zip.file(path);
    if (!file) continue;
    const bytes = await file.async('uint8array');
    out.file(path, bytes, {
      compression: isStoredPart(path) ? 'STORE' : 'DEFLATE',
      date: ENTRY_DATE,
    });
  }
  return out.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

/** Compression method per entry, for the store-mode test: 0 is stored, 8 is deflated. */
export async function entryMethods(
  bytes: Uint8Array,
): Promise<Record<string, 'STORE' | 'DEFLATE'>> {
  // jszip does not expose the method after loading, so read the local file headers directly:
  // signature 0x04034b50, method at offset 8, name length at 26, extra length at 28.
  const out: Record<string, 'STORE' | 'DEFLATE'> = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const flags = view.getUint16(offset + 6, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = Buffer.from(bytes.buffer, bytes.byteOffset + offset + 30, nameLength).toString(
      'utf8',
    );
    out[name] = method === 0 ? 'STORE' : 'DEFLATE';
    if (flags & 0x0008) break; // data descriptor: sizes unknown here, stop scanning
    offset += 30 + nameLength + extraLength + compressed;
  }
  return out;
}
