// JSON pointers (RFC 6901). Mutations address fields inside a slide, a block or the manifest with
// pointers ('/slots/right/0/items/3/text'), and validation issues report their location the same
// way (SPEC 4.3 "Addressing", 4.4). The mutating helpers work in place on a document the caller
// has already cloned; the reducer clones once per write (SPEC 4.4).

export type Pointer = string;

export function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** '/a/b/0' becomes ['a', 'b', '0']; '' is the whole document. */
export function parsePointer(pointer: Pointer): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new TypeError(
      `A JSON pointer starts with "/" or is empty, got ${JSON.stringify(pointer)}`,
    );
  }
  return pointer.slice(1).split('/').map(unescapeToken);
}

export function joinPointer(segments: ReadonlyArray<string | number>): Pointer {
  return segments.map((segment) => `/${escapeToken(String(segment))}`).join('');
}

/** Appends segments to a pointer: appendPointer('/items', 3, 'text') is '/items/3/text'. */
export function appendPointer(base: Pointer, ...segments: ReadonlyArray<string | number>): Pointer {
  return base + joinPointer(segments);
}

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

function indexOf(container: unknown[], token: string, allowEnd: boolean): number {
  if (token === '-' && allowEnd) return container.length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    throw new RangeError(`Array index expected, got ${JSON.stringify(token)}`);
  }
  const index = Number(token);
  if (index > container.length || (index === container.length && !allowEnd)) {
    throw new RangeError(`Array index ${index} is out of range (length ${container.length})`);
  }
  return index;
}

/** Reads the value at a pointer; undefined when any segment is missing. */
export function getAt(document: unknown, pointer: Pointer): unknown {
  let current: unknown = document;
  for (const token of parsePointer(pointer)) {
    if (!isContainer(current)) return undefined;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;
      current = current[Number(token)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;
      current = current[token];
    }
  }
  return current;
}

export function hasAt(document: unknown, pointer: Pointer): boolean {
  let current: unknown = document;
  for (const token of parsePointer(pointer)) {
    if (!isContainer(current)) return false;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) >= current.length) return false;
      current = current[Number(token)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return false;
      current = current[token];
    }
  }
  return true;
}

function parentOf(document: unknown, pointer: Pointer): { parent: Container; token: string } {
  const segments = parsePointer(pointer);
  const token = segments.pop();
  if (token === undefined) throw new RangeError('The empty pointer has no parent');
  const parent = getAt(document, joinPointer(segments));
  if (!isContainer(parent)) {
    throw new RangeError(`Nothing to write into at ${joinPointer(segments) || '/'}`);
  }
  return { parent, token };
}

/**
 * Writes a value at a pointer. On an array the token may be an existing index, the length (append)
 * or '-' (append). Passing undefined removes the key or element (SPEC 4.2 slide.set: a missing
 * value deletes, since JSON cannot carry undefined).
 */
export function setAt(document: unknown, pointer: Pointer, value: unknown): void {
  if (value === undefined) {
    if (hasAt(document, pointer)) removeAt(document, pointer);
    return;
  }
  const { parent, token } = parentOf(document, pointer);
  if (Array.isArray(parent)) {
    const index = indexOf(parent, token, true);
    if (index === parent.length) parent.push(value);
    else parent[index] = value;
  } else {
    parent[token] = value;
  }
}

/** Removes the value at a pointer and returns it; throws when it is missing. */
export function removeAt(document: unknown, pointer: Pointer): unknown {
  const { parent, token } = parentOf(document, pointer);
  if (Array.isArray(parent)) {
    const index = indexOf(parent, token, false);
    const [removed] = parent.splice(index, 1);
    return removed;
  }
  if (!Object.prototype.hasOwnProperty.call(parent, token)) {
    throw new RangeError(`Nothing to remove at ${pointer}`);
  }
  const removed = parent[token];
  delete parent[token];
  return removed;
}

/** Structured clone for plain JSON data; the reducer and the diff never share references. */
export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Deep equality for plain JSON data with key order ignored. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).filter((k) => left[k] !== undefined);
  const rightKeys = Object.keys(right).filter((k) => right[k] !== undefined);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && jsonEqual(left[key], right[key]),
  );
}
