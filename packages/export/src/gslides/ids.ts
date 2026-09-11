// Object ids of the presentation (SPEC 8.3: `objectId` from the slide id). The API accepts ids of
// 5 to 50 characters that start with a letter, digit or underscore and continue with those plus
// hyphen and colon, unique within the presentation. Slide ids are slugs (`opener-brand`, `why`),
// so a slide's page id is `ts_<slug>` (short slugs are padded), and every element under it is
// `ts_<slug>:<code><n>` with a two-letter code per kind and a running number, truncated with a
// hash when a long slug would push it past 50. The registry guarantees uniqueness across the run.
import { createHash } from 'node:crypto';

export const OBJECT_ID_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_:-]{4,49}$/;

export const OBJECT_ID_MAX = 50;
export const OBJECT_ID_MIN = 5;

/** Element kinds and their id codes. */
export const ID_CODES = {
  text: 'tx',
  line: 'ln',
  image: 'im',
  rect: 'rc',
  group: 'gr',
  picture: 'pc',
  sheet: 'sh',
} as const;

export type IdKind = keyof typeof ID_CODES;

function sanitize(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_:-]+/g, '-').replace(/^[^a-zA-Z0-9_]+/, '');
  return cleaned.length > 0 ? cleaned : 'x';
}

/** The page id of a slide: `ts_<slug>`, padded to five characters. */
export function slideObjectId(slideId: string): string {
  let id = `ts_${sanitize(slideId)}`;
  while (id.length < OBJECT_ID_MIN) id += '_';
  if (id.length > OBJECT_ID_MAX) id = `${id.slice(0, OBJECT_ID_MAX - 9)}-${shortHash(slideId)}`;
  return id;
}

export function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 8);
}

export function isObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value);
}

/** Hands out unique element ids under a slide's page id and remembers every id of the run. */
export class IdRegistry {
  private readonly used = new Set<string>();
  private readonly counters = new Map<string, number>();

  /** Registers a fixed id (a page id); throws on a collision, which would mean two slides share a slug. */
  claim(id: string): string {
    if (!isObjectId(id)) throw new RangeError(`gslides: "${id}" is not a valid object id`);
    if (this.used.has(id)) throw new RangeError(`gslides: object id "${id}" is already used`);
    this.used.add(id);
    return id;
  }

  /** The next id of a kind under a page: `ts_<slug>:tx3`. */
  next(pageObjectId: string, kind: IdKind): string {
    const key = `${pageObjectId}:${ID_CODES[kind]}`;
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    let id = `${key}${n}`;
    if (id.length > OBJECT_ID_MAX)
      id = `${pageObjectId.slice(0, OBJECT_ID_MAX - 16)}-${shortHash(pageObjectId)}:${ID_CODES[kind]}${n}`;
    let candidate = id;
    let bump = 1;
    while (this.used.has(candidate)) {
      bump += 1;
      candidate = `${id}-${bump}`;
    }
    this.used.add(candidate);
    return candidate;
  }

  has(id: string): boolean {
    return this.used.has(id);
  }

  get size(): number {
    return this.used.size;
  }
}
