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

/**
 * The address's hash without its `#`, for a router navigation that keeps the slide
 * (`navigate({ search, hash: addressHash })`). The shell writes the slide hash past the router
 * (`writeSlideHash`), so the router's own copy of the hash is the one it last navigated to, and
 * `hash: true` would put a slide the reader has left back in the address.
 */
export function addressHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');
}

/** `#12` or `#s/why-the-redesign`. */
export function formatSlideHash(form: SlideHashForm, slide: { id: string; n: number }): string {
  return form === 'n' ? `#${slide.n}` : `#s/${encodeURIComponent(slide.id)}`;
}

/**
 * The fewest milliseconds between two hash writes. Safari refuses a page more than 100
 * `replaceState` calls in 30 s and Chrome ignores them past 200 in 10 s, and a held arrow or a run
 * of presenter moves selects a slide every frame (the presenter audit of a95d4097d, item 2). A
 * write after a quiet gap goes at once; one inside the gap waits for its end, the latest standing
 * for the ones before it, so a run writes its first slide at once and its last one when it ends.
 */
export const HASH_WRITE_GAP_MS = 350;

let lastWrite = Number.NEGATIVE_INFINITY;
let trailing = 0;

/** Writes the hash with replaceState, never assign: the viewer's moves are not history entries (tail.html show). */
export function writeSlideHash(form: SlideHashForm, slide: { id: string; n: number }): void {
  const next = formatSlideHash(form, slide);
  if (trailing !== 0) {
    window.clearTimeout(trailing);
    trailing = 0;
  }
  if (window.location.hash === next) return;
  const wait = lastWrite + HASH_WRITE_GAP_MS - Date.now();
  if (wait <= 0) {
    replaceHash(next);
    return;
  }
  const { pathname, search } = window.location;
  trailing = window.setTimeout(() => {
    trailing = 0;
    const here = window.location;
    /* the page moved on (another route, another query) while the write waited: it is dropped */
    if (here.pathname !== pathname || here.search !== search || here.hash === next) return;
    replaceHash(next);
  }, wait);
}

/**
 * The document's own `replaceState`, read from the prototype. A client router patches the method
 * on `window.history` to hear every address change (TanStack's `createBrowserHistory`), and a
 * slide move is view state the shell owns, not a navigation: through the patched method every
 * move ran a router load, which rendered the root and the head again and fetched the tab icon
 * again (measured on /deck/gt-brand in a show: two of the advance's six commits). The router's
 * history state (its index and key) is kept, so its back and forward bookkeeping holds.
 */
function replaceHash(next: string): void {
  lastWrite = Date.now();
  try {
    const history = window.history;
    const replace =
      typeof History === 'undefined' ? history.replaceState : History.prototype.replaceState;
    replace.call(
      history,
      history.state,
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
