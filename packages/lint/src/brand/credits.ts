// The credits check (docs/NEXT.md 4.1.2 "The pictures' licences", 4.1.3 item 25): a mood picture
// under decks/ or apps/studio/public/ fails without its credit row in docs/brand.md. A picture is a
// mood picture when a slide of kind "mood" names it as its picture, or when its file name starts
// with `mood-` or it sits in a `mood/` folder. A row credits it when the row names the picture's
// asset id or its path in backticks and states a licence (CREDITS.licence); a row with no stated
// licence, or one that records the licence as not read ("None stated", "kept out"), does not
// count, since NEXT.md 4.1.2 keeps a picture with no licence read out of the product.
import { CREDITS } from './config.ts';
import type { BrandFinding } from './config.ts';

/** The asset id of a picture file: its base name without the extension and the appearance. */
export function assetIdOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/-(?:light|dark)$/, '');
}

/** The folder a deck's assets live in, for a file under `<deck>/assets/`; null elsewhere. */
function deckOf(path: string): string | null {
  const m = /^(.*)\/assets\/[^/]+$/.exec(path);
  return m?.[1] ?? null;
}

export type MoodSlide = { deck: string; asset: string };

/**
 * The mood slides of the decks: every `<deck>/slides/*.json` whose kind is "mood" names its
 * picture's asset id in `picture.asset`. `read` returns a file's text or null.
 */
export function moodSlides(
  files: readonly string[],
  read: (file: string) => string | null,
): MoodSlide[] {
  const out: MoodSlide[] = [];
  for (const file of files) {
    const m = /^(.*)\/slides\/[^/]+\.json$/.exec(file);
    if (!m?.[1]) continue;
    const text = read(file);
    if (text === null || !text.includes('"mood"')) continue;
    try {
      const slide = JSON.parse(text) as { kind?: unknown; picture?: { asset?: unknown } };
      if (slide.kind === 'mood' && typeof slide.picture?.asset === 'string')
        out.push({ deck: m[1], asset: slide.picture.asset });
    } catch {
      // a slide that does not parse is the validator's finding, not this check's
    }
  }
  return out;
}

/** The mood pictures among `files` (paths from the tree's root under CREDITS.roots). */
export function moodPictures(files: readonly string[], slides: readonly MoodSlide[]): string[] {
  const named = new Set(slides.map((s) => `${s.deck}\u0000${s.asset}`));
  return files.filter((file) => {
    if (!CREDITS.pictures.test(file)) return false;
    if (!CREDITS.roots.some((root) => file.startsWith(`${root}/`))) return false;
    const base = file.split('/').pop() ?? '';
    if (base.startsWith('mood-') || file.includes('/mood/')) return true;
    const deck = deckOf(file);
    return deck !== null && named.has(`${deck}\u0000${assetIdOf(file)}`);
  });
}

/** The names the credit rows of a record credit: the backticked names of rows that state a licence. */
export function creditedNames(record: string): Set<string> {
  const out = new Set<string>();
  for (const line of record.split('\n')) {
    if (!line.trimStart().startsWith('|') || !CREDITS.licence.test(line)) continue;
    if (CREDITS.unread.test(line)) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) if (m[1]) out.add(m[1].trim());
  }
  return out;
}

/** One finding per mood picture without a credit row. `record` is docs/brand.md's text or null. */
export function checkCredits(
  files: readonly string[],
  read: (file: string) => string | null,
  record: string | null,
): { pictures: string[]; findings: BrandFinding[] } {
  const pictures = moodPictures(files, moodSlides(files, read));
  const credited = record === null ? new Set<string>() : creditedNames(record);
  const findings: BrandFinding[] = [];
  for (const file of pictures) {
    const id = assetIdOf(file);
    const base = file.split('/').pop() ?? file;
    if (credited.has(id) || credited.has(file) || credited.has(base)) continue;
    findings.push({
      rule: 'brand/credits',
      file,
      line: 1,
      column: 1,
      message:
        record === null
          ? `${CREDITS.record} is missing, so no mood picture has its credit and licence.`
          : `No credit row in ${CREDITS.record} names \`${id}\` with its licence (NEXT.md 4.1.2: a picture with no licence read stays out of the product).`,
      text: id,
    });
  }
  return { pictures, findings };
}
