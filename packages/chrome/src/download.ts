// A file download that begins on the page (the return round fix round; docs/RETURN.md 2.17 and
// 2.19; VERIFICATION.md R1-F5). File > Download > Turboslide bundle, Web page, JPEG image and PNG
// image name a same origin address the server signed (a bundle ticket, a one time download token,
// a render grant). Until this module they were an anchor click with `download=""`: the browser's
// own download request, which carries none of the page's request headers, and which, when the
// address answers a redirect to another origin, loses its `download` attribute and navigates the
// tab (a preview behind Vercel Authentication took the editor to the sign in page; the
// integrator's hand probe, return/build/integrator.md section 8), while a refused address (401,
// 404, 429) ends as a cancelled download the page never hears of (return-drive.md rows 13 to 16;
// b7.md B7-R5). Here the page fetches the address itself, with its cookies and whatever headers
// the browser attaches to the page's requests, reads the bytes, and saves them from a blob
// address with the file name the server put in `content-disposition`: the tab never leaves the
// editor, a refusal is the server's own sentence in the snackbar, and the download event the
// seller (and a driver) sees is the file's own bytes. An address on another origin (the public
// Blob host's stored copies) keeps the anchor click, which needs no CORS. Nothing here touches a
// document or a store.

/** What a page download saved: the file's name, its size and its media type. */
export type PageDownload = { name: string; bytes: number; type: string };

/** The I/O a page download uses; every field has the window's default, a test hands fakes. */
export type PageDownloadIo = {
  fetch: typeof fetch;
  doc: Document;
  origin: string;
  objectUrl: (blob: Blob) => string;
  revoke: (url: string) => void;
};

/** How long a blob address stays valid after the click that saves it. */
export const REVOKE_MS = 30_000;

/** The sentence a refused download shows when the server's body carries none. */
export function refusalSentence(status: number, body: string): string {
  const text = body.trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
      const message = parsed.error?.message ?? parsed.message;
      if (typeof message === 'string' && message.trim() !== '') return message.trim();
    } catch {
      /* not JSON after all: the plain form below */
    }
  }
  const plain = text !== '' && text.length <= 120 && !text.includes('<') ? `: ${text}` : '';
  return `The file could not be downloaded (HTTP ${status}${plain})`;
}

/** True for an address the page's own origin answers: a path of ours, or an absolute URL on `origin`. */
export function sameOriginAddress(url: string, origin: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//');
  return origin !== '' && (url === origin || url.startsWith(`${origin}/`));
}

/**
 * The file name a download saves as: `content-disposition`'s `filename*` or `filename`, else the
 * address's last path segment when it carries an extension, else `fallback`. Path separators and
 * quotes never reach the name.
 */
export function attachmentName(
  disposition: string | null | undefined,
  url: string,
  fallback: string,
): string {
  const clean = (raw: string): string =>
    raw
      .trim()
      .replace(/^"|"$/g, '')
      .replace(/[\\/]/g, '')
      .replace(/["\r\n]/g, '')
      .trim();
  if (disposition) {
    const star = /filename\*\s*=\s*(?:utf-8|iso-8859-1)?''([^;]+)/i.exec(disposition);
    if (star?.[1] !== undefined) {
      try {
        const decoded = clean(decodeURIComponent(star[1]));
        if (decoded !== '') return decoded;
      } catch {
        /* a malformed percent encoding: the plain filename below */
      }
    }
    const plain = /filename\s*=\s*("[^"]*"|[^;]+)/i.exec(disposition);
    if (plain?.[1] !== undefined) {
      const name = clean(plain[1]);
      if (name !== '') return name;
    }
  }
  const path = url.replace(/[?#].*$/, '');
  const last = clean(path.slice(path.lastIndexOf('/') + 1));
  if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
  return fallback;
}

/** One anchor click: `href` saved as `name` (an empty name lets the server's header name it). */
export function clickDownloadAnchor(href: string, name: string, doc: Document): void {
  const anchor = doc.createElement('a');
  anchor.href = href;
  anchor.download = name;
  anchor.rel = 'noopener';
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function windowIo(): PageDownloadIo {
  return {
    fetch: (input, init) => fetch(input, init),
    doc: document,
    origin: window.location.origin,
    objectUrl: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url),
  };
}

/**
 * Downloads `url`. A same origin address is fetched by the page and saved from its bytes; the
 * answer is the file saved, or the promise rejects with the server's sentence when the address
 * refused (a quota, a spent token, a missing bearer), so the caller's snackbar names the refusal.
 * When the page's request itself fails (the network, or a redirect the fetch may not read) the
 * browser's own anchor download stands in and the answer is null, as it is for an address on
 * another origin. `name` is the file name when the server sends none.
 */
export async function downloadFromPage(
  url: string,
  options: { name?: string; io?: Partial<PageDownloadIo> } = {},
): Promise<PageDownload | null> {
  const io: PageDownloadIo = { ...windowIo(), ...options.io };
  if (!sameOriginAddress(url, io.origin)) {
    clickDownloadAnchor(url, '', io.doc);
    return null;
  }
  let response: Response;
  try {
    response = await io.fetch(url, { credentials: 'same-origin' });
  } catch {
    clickDownloadAnchor(url, '', io.doc);
    return null;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(refusalSentence(response.status, body));
  }
  const blob = await response.blob();
  const name = attachmentName(
    response.headers.get('content-disposition'),
    url,
    options.name ?? 'download',
  );
  const href = io.objectUrl(blob);
  clickDownloadAnchor(href, name, io.doc);
  setTimeout(() => io.revoke(href), REVOKE_MS);
  return { name, bytes: blob.size, type: blob.type };
}
