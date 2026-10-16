// The scrubber of the error reporter (hardening HR-O#2a, RELIABILITY-14; docs/hardening/HARDENING.md
// 4.8). A report carries what a person needs to find the fault, and nothing a reader of the log
// should not hold: no deck text, no address (mail or network), no token and no cookie. The browser
// scrubs before it posts and the server scrubs again what it receives, so a line the server logs
// never depends on the client's honesty.
//
// What each rule replaces:
//   - a URL keeps its scheme, its host and its path with every id segment as `$`; the query and
//     the fragment go (a grant, a download token or a magic link travels there)
//   - `Bearer`, `Basic`, `Ticket` and `Token` followed by a value: the value
//   - `name=value` with a value of 12 characters or more (a cookie pair, a form field): the value
//   - a mail address, an IPv4 or IPv6 address
//   - a quoted string that is not a code name (a property, a module, a field; isCodeName): its
//     content, so `Unexpected token 'H', "Hello worl"... is not valid JSON` loses the words
//   - a run of 20 or more letters, digits, `-` and `_` that holds a digit and a letter (an id, a
//     digest, a session token, a part of a signed token)
//   - a run of 7 or more digits (a time stamp, a revision far past the first)
//
// Browser and Worker safe: no Node import.

/** The longest message a line keeps, in characters. */
export const MESSAGE_MAX = 300;
/** The stack frames a line keeps: the head of the stack. */
export const STACK_FRAMES_MAX = 8;
/** The longest stack frame a line keeps, in characters. */
export const FRAME_MAX = 200;
/** The longest route a line keeps, in characters. */
export const ROUTE_MAX = 80;

/**
 * The path segments after which the next segment names a deck, a slide, a link, a token or a
 * person, so a scrubbed path writes it as `$`: `/deck/<id>`, `/api/decks/<id>/stream`,
 * `/api/download/<token>`, `/s/<link>`.
 */
const ID_BEFORE: ReadonlySet<string> = new Set([
  'deck',
  'decks',
  'edit',
  'present',
  'view',
  's',
  'share',
  'download',
  'render',
  'access',
  'comments',
  'avatar',
  'logo',
  'export',
  'notify',
  'actions',
  'device',
  'users',
  'links',
  'versions',
  'slides',
  'snapshots',
  'assets',
]);

/** A segment that is an id by its form wherever it stands. */
const ID_SEGMENT = /^(?=[A-Za-z_-]*\d)[A-Za-z0-9_.-]{20,}$|^\d{3,}$/;

/** Folders whose files are the app's own built chunks: their names are kept for the stack. */
const CHUNK_FOLDERS: ReadonlySet<string> = new Set(['assets', '_build', 'node_modules', 'src']);

/**
 * A path with every id segment written `$` (see ID_BEFORE and ID_SEGMENT). The file name of a
 * built chunk under `/assets/` stays, so a stack frame still names its chunk.
 */
export function scrubPath(pathname: string): string {
  const segments = pathname.split('/');
  const out: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] ?? '';
    const before = i > 0 ? (segments[i - 1] ?? '') : '';
    const isLast = i === segments.length - 1;
    const chunkFile =
      isLast && CHUNK_FOLDERS.has(before) && /^[\w.-]{1,80}\.(?:m?js|tsx?|css)$/.test(segment);
    if (segment === '') out.push(segment);
    else if (chunkFile) out.push(segment);
    else if (ID_BEFORE.has(before.toLowerCase()) || ID_SEGMENT.test(segment)) out.push('$');
    else if (/^[A-Za-z0-9_.$-]{1,40}$/.test(segment)) out.push(segment);
    else out.push('$');
  }
  return out.join('/');
}

/** A URL as `scheme://host/path` with the path scrubbed and no query or fragment. */
export function scrubUrl(raw: string): string {
  // a frame's `:line:col` tail rides after the path; keep it apart so the parser does not read it
  const tail = /(:\d+){1,2}$/.exec(raw)?.[0] ?? '';
  const body = tail === '' ? raw : raw.slice(0, -tail.length);
  try {
    const url = new URL(body);
    if (url.protocol === 'blob:' || url.protocol === 'data:') return `${url.protocol}…`;
    return `${url.protocol}//${url.host}${scrubPath(url.pathname)}${tail}`;
  } catch {
    return '<url>';
  }
}

const URL_PATTERN = /\b(?:https?|wss?|blob|file):\/\/[^\s'"`<>()[\]{}]+/gi;
const DATA_URL = /\bdata:[^\s'"`<>()]+/gi;
const AUTH_VALUE = /\b(Bearer|Basic|Ticket|Token)\s+[^\s'",;)]+/gi;
const PAIR_VALUE = /\b([A-Za-z][\w.-]{0,40})=([^\s&'";,)]{12,})/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_FULL = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
const IPV6_SHORT =
  /(?:\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6}\b)?/gi;
const QUOTED = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`|‘([^’\n]*)’|“([^”\n]*)”/g;
const LONG_ID = /(?<![\w-])(?=[A-Za-z_-]*\d)(?=[\d_-]*[A-Za-z])[A-Za-z0-9_-]{20,}(?![\w-])/g;
const LONG_DIGITS = /\b\d{7,}\b/g;
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/** The characters of a code name: no space, no slash. */
const CODE_NAME = /^[A-Za-z_$][\w$.-]{0,39}$/;

/**
 * A quoted string that names code (a property, a module, a field, a class) and stays: one
 * character (V8's `Unexpected token 'Q'`), or a name with a code shape: a lowercase, `_` or `$`
 * start (`length`, `deckId`), a `.`, `-`, `_`, `$` or digit inside (`chart.bar`), or an inner
 * capital (`TypeError`). A capitalized word such as "Board" has none and goes as deck text; a
 * single lowercase word stays, the residual of this rule.
 */
function isCodeName(content: string): boolean {
  if (!CODE_NAME.test(content)) return false;
  if (content.length === 1) return true;
  return /^[a-z_$]/.test(content) || /[.\-_$\d]/.test(content) || /[a-z][A-Z]/.test(content);
}

/** One quoted run: kept when it is a code name, else its content written `…`. */
function scrubQuoted(match: string, ...groups: (string | undefined)[]): string {
  const content = groups.slice(0, 5).find((group) => group !== undefined) ?? '';
  if (content === '' || isCodeName(content)) return match;
  return `${match[0]}…${match[match.length - 1]}`;
}

/**
 * Applies every rule of the header to one text and caps it at `max` characters. Pure; the order
 * matters: URLs first (they hold `=` pairs and ids), then the secrets, then the words.
 */
export function scrubText(text: string, max: number = MESSAGE_MAX): string {
  let out = text.replace(CONTROL, ' ');
  out = out.replace(DATA_URL, 'data:…');
  out = out.replace(URL_PATTERN, (url) => scrubUrl(url));
  out = out.replace(AUTH_VALUE, (_match, word: string) => `${word} <token>`);
  out = out.replace(PAIR_VALUE, (_match, name: string) => `${name}=<value>`);
  out = out.replace(EMAIL, '<address>');
  out = out.replace(IPV4, '<ip>');
  out = out.replace(IPV6_FULL, '<ip>');
  // a short form needs two hex groups beside its `::`, so a CSS `::before` or a lone `::` stays
  out = out.replace(IPV6_SHORT, (match) =>
    (match.match(/[0-9a-f]{1,4}/gi)?.length ?? 0) >= 2 ? '<ip>' : match,
  );
  out = out.replace(QUOTED, scrubQuoted);
  out = out.replace(LONG_ID, '<id>');
  out = out.replace(LONG_DIGITS, '<n>');
  out = out.trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/**
 * The head of a stack: at most STACK_FRAMES_MAX frame lines (V8's `at …` and the `name@url`
 * form of the other engines), each scrubbed and capped. The first line of a V8 stack repeats
 * the message, which the line carries apart, so it is left out.
 */
export function scrubStack(stack: string | undefined | null): string[] {
  if (typeof stack !== 'string' || stack === '') return [];
  const frames: string[] = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (!line.startsWith('at ') && !/^[^\s@]*@\S+:\d+/.test(line)) continue;
    frames.push(scrubText(line, FRAME_MAX));
    if (frames.length === STACK_FRAMES_MAX) break;
  }
  return frames;
}

/**
 * A route for a line: a route id the router names (`/deck/$deckId`) stays as it is; a pathname
 * is scrubbed. Anything else, or a value that is not a path, reads `/`.
 */
export function scrubRoute(route: string | undefined | null): string {
  if (typeof route !== 'string' || !route.startsWith('/')) return '/';
  const path = route.split(/[?#]/)[0] ?? '/';
  const scrubbed = path.includes('$') ? path : scrubPath(path);
  const clean = scrubbed.replace(/[^A-Za-z0-9_$./-]/g, '');
  return clean.slice(0, ROUTE_MAX) || '/';
}
