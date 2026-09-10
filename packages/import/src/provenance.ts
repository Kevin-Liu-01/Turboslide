// Asset provenance from shots/OPENERS.md and shots/DETAILS.md (SPEC 9): source, license, credit,
// crop and tone parameters for the full-picture images, source page and region for the detail
// crops. The files are prose with a regular skeleton (tables, then `### Name` sections with
// `- Key: value` bullets); this reader takes the regular parts and leaves the rest as notes.
import type { AssetSource, AssetTreatment } from '@turboslide/schema/assets';

export type PictureRecord = {
  /** The dark file name (`opener-brand.jpg`) and the light file name. */
  dark: string;
  light: string;
  kind: 'opener' | 'mood';
  /** The section or mood heading the entry sits under. */
  heading: string;
  bullets: Record<string, string>;
  /** Whether the file pair is a two-tone dither (the color openers are not). */
  twoTone: boolean;
  description: string;
};

export type DetailRecord = {
  name: string;
  page: string;
  region: [number, number, number, number];
  size: [number, number];
  caption: string;
};

function tableRows(markdown: string, firstHeader: string): string[][] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`| ${firstHeader}`));
  if (start < 0) return [];
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

function code(cell: string): string {
  const match = /`([^`]+)`/.exec(cell);
  return match?.[1] ?? cell;
}

/** `### Heading` sections with their `- Key: value` bullets. */
function sections(markdown: string): { heading: string; bullets: Record<string, string> }[] {
  const out: { heading: string; bullets: Record<string, string> }[] = [];
  let current: { heading: string; bullets: Record<string, string> } | undefined;
  for (const line of markdown.split('\n')) {
    const h = /^###\s+(.*)$/.exec(line);
    if (h) {
      current = { heading: (h[1] ?? '').trim(), bullets: {} };
      out.push(current);
      continue;
    }
    if (/^##\s/.test(line)) {
      current = undefined;
      continue;
    }
    const b = /^-\s+([A-Z][\w ]*?):\s+(.*)$/.exec(line);
    if (b && current) current.bullets[(b[1] ?? '').trim()] = (b[2] ?? '').trim();
  }
  return out;
}

export function parseOpeners(markdown: string): PictureRecord[] {
  const all = sections(markdown);
  const records: PictureRecord[] = [];
  for (const row of tableRows(markdown, 'Section')) {
    const [section, , dark, light, image] = row;
    if (!section || !dark || !light) continue;
    const entry = all.find((s) => s.heading === section);
    records.push({
      dark: code(dark),
      light: code(light).replace(/\s*\(same image\)/, ''),
      kind: 'opener',
      heading: section,
      bullets: entry?.bullets ?? {},
      twoTone: /two-tone/i.test(image ?? ''),
      description: image ?? '',
    });
  }
  for (const row of tableRows(markdown, 'Slide')) {
    const [slide, , dark, light, image] = row;
    if (!slide || !dark || !light) continue;
    const slug = code(slide).replace(/^\d+-mood-/, '');
    const entry = all.find(
      (s) => /^[^,]+, mood-/.test(s.heading) && s.heading.endsWith(`mood-${slug}`),
    );
    records.push({
      dark: code(dark),
      light: code(light),
      kind: 'mood',
      heading: entry?.heading ?? code(slide),
      bullets: entry?.bullets ?? {},
      twoTone: true,
      description: image ?? '',
    });
  }
  return records;
}

export function parseDetails(markdown: string): DetailRecord[] {
  const out: DetailRecord[] = [];
  for (const row of tableRows(markdown, 'Crop')) {
    const [name, page, region, size, caption] = row;
    if (!name || !page || !region || !size) continue;
    const box = region.split(',').map((n) => Number(n.trim()));
    const dims = size.split('x').map((n) => Number(n.trim()));
    out.push({
      name: code(name),
      page,
      region: [box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0],
      size: [dims[0] ?? 0, dims[1] ?? 0],
      caption: caption ?? '',
    });
  }
  return out;
}

function firstNumber(text: string | undefined, re: RegExp): number | undefined {
  if (!text) return undefined;
  const match = re.exec(text);
  return match ? Number(match[1]) : undefined;
}

/** The crop box: the first four comma-separated numbers of the Crop bullet. */
function cropBox(text: string | undefined): [number, number, number, number] | undefined {
  if (!text) return undefined;
  const match = /(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)/.exec(text);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

/** The two-tone treatment recorded in prose (OPENERS.md:31-39, 141-149 and the per-image bullets). */
export function treatmentOf(record: PictureRecord): AssetTreatment | undefined {
  if (!record.twoTone) {
    return { kind: 'continuous', quality: 92 };
  }
  const text = `${record.bullets.Crop ?? ''} ${record.bullets.Processing ?? ''} ${record.bullets.Tone ?? ''}`;
  const positiveLight = /positive is the light file/i.test(text);
  const treatment: AssetTreatment = {
    kind: 'two-tone',
    crop: cropBox(record.bullets.Crop) ?? [0, 0, 0, 0],
    autocontrast: 0.5,
    polarity: positiveLight ? 'light-ground' : 'dark-ground',
    cell: 2,
    bayer: 8,
    resampler: 'lanczos3',
  };
  if (/red channel/i.test(text)) treatment.channel = 'r';
  if (/source inverted|invert first/i.test(text)) treatment.invert = true;
  const blur = firstNumber(text, /blur\s+(\d+(?:\.\d+)?)/i);
  if (blur !== undefined) treatment.blur = blur;
  const black = firstNumber(text, /black(?: point)?\s+(\d+)/i);
  if (black !== undefined) treatment.black = black;
  const white = firstNumber(text, /white\s+(\d+)/i);
  if (white !== undefined) treatment.white = white;
  const gamma = firstNumber(text, /gamma\s+(\d+(?:\.\d+)?)/i);
  if (gamma !== undefined) treatment.gamma = gamma;
  const minFilter = firstNumber(text, /(\d+) pixel minimum filter/i);
  if (minFilter !== undefined) treatment.minFilter = minFilter;
  const unsharp =
    /unsharp mask \(radius \d+, (\d+) percent, threshold \d+\) on rows (\d+) to (\d+)/i.exec(text);
  if (unsharp) {
    treatment.unsharp = {
      rows: [Number(unsharp[2]), Number(unsharp[3])],
      amount: Number(unsharp[1]),
    };
  }
  return treatment;
}

/** The recorded source: a photograph with its license, a material render, or a file. */
export function sourceOf(record: PictureRecord): AssetSource {
  const b = record.bullets;
  if (record.kind === 'mood') {
    const license = (b.License ?? '').replace(/\.$/, '');
    const shareAlike = /BY-SA/i.test(license);
    return {
      kind: 'photo',
      origin: b.Source ?? record.description,
      artist: b.Artist?.replace(/\.$/, ''),
      license: /public domain/i.test(license) ? 'public domain' : license || 'unknown',
      shareAlike,
    };
  }
  const source = b.Source ?? b.Image ?? '';
  const material = /materialId=paper-([a-z-]+)/i.exec(source);
  if (material) {
    const family = (material[1] ?? '').replace(/-fire$/, '');
    const uniforms: Record<string, number | number[] | string> = {};
    for (const m of source.matchAll(/`(u_[A-Za-z]+)\s+([^`]+)`/g)) {
      const value = (m[2] ?? '').trim();
      uniforms[m[1] ?? ''] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
    }
    const timeMs = firstNumber(b.Frame ?? '', /about (\d+(?:\.\d+)?) seconds/i);
    return {
      kind: 'material',
      materialId: `paper:${family}`,
      uniforms,
      size: [3200, 1800],
      timeMs: timeMs !== undefined ? Math.round(timeMs * 1000) : 0,
      backend: 'angle-metal',
      renderer: 'Chrome for Testing, ANGLE Metal (Playwright), recorded in OPENERS.md',
      recipeKey: '',
    };
  }
  return { kind: 'file' };
}
