/**
 * The slide hash (SPEC 5.3, 6.1): `#NN` is the deck's 1-based number, kept
 * for existing links and for Prototemplate's DeckFrame, which forwards the
 * page hash into the frame and mirrors `#NN` back out; `#s/<slideId>` is the
 * stable form the studio writes. Both are read everywhere.
 */

export type SlideHashForm = 'n' | 'id';

export type SlideHash = { n: number } | { id: string };

/** Parses a location hash (with or without the `#`); null for none or an unknown shape. */
export function parseSlideHash(hash: string): SlideHash | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  if (raw.startsWith('s/')) {
    const id = safeDecode(raw.slice(2));
    return id ? { id } : null;
  }
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n > 0 ? { n } : null;
  }
  return null;
}

/** The slide id a hash names among `ids` (in deck order), or null. */
export function resolveSlideHash(hash: string, ids: readonly string[]): string | null {
  const parsed = parseSlideHash(hash);
  if (!parsed) return null;
  if ('id' in parsed) return ids.includes(parsed.id) ? parsed.id : null;
  return ids[parsed.n - 1] ?? null;
}

/** `#12` or `#s/why-the-redesign`. */
export function formatSlideHash(form: SlideHashForm, slide: { id: string; n: number }): string {
  return form === 'n' ? `#${slide.n}` : `#s/${encodeURIComponent(slide.id)}`;
}

/** Writes the hash with replaceState, never assign: the viewer's moves are not history entries (tail.html show). */
export function writeSlideHash(form: SlideHashForm, slide: { id: string; n: number }): void {
  const next = formatSlideHash(form, slide);
  if (window.location.hash === next) return;
  try {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${next}`,
    );
  } catch {
    // a sandboxed document: the state still moves, the address does not
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
