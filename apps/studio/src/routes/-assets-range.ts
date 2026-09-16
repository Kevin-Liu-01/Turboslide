// The byte range rules of the checkout's asset route (gslides-parity SPEC-5 3.3; R11 2 rule 2;
// RFC 9110 section 14): a `<video>` or `<audio>` element seeks with `Range: bytes=a-b`, so the
// route that streams a stored file answers `206` with `Content-Range`, `Content-Length` and
// `Accept-Ranges: bytes` for one satisfiable range, `416` with `Content-Range: bytes */<size>`
// for one it cannot satisfy, the whole file with `Accept-Ranges` for no range, and `HEAD` with
// the same headers and no body. One range per request: a multipart range answer is never
// written (a media element sends one range at a time), so a header with several ranges is read
// as none and the whole file goes out. Pure, no Node import, so the route and its test share it.

export type ByteRange = { start: number; end: number };

export type RangeAnswer =
  /** no usable Range header: the whole file */
  | { kind: 'whole'; size: number }
  /** one satisfiable range, inclusive ends */
  | { kind: 'partial'; range: ByteRange; size: number }
  /** a range outside the file */
  | { kind: 'unsatisfiable'; size: number };

/**
 * Reads one `bytes=` range against a file size (RFC 9110 14.1.2): `a-b`, `a-` (to the end) and
 * `-n` (the last n bytes); a first byte past the end or an empty file is unsatisfiable; a malformed
 * header, another unit or several ranges answer the whole file.
 */
export function resolveRange(header: string | null, size: number): RangeAnswer {
  if (header === null || header.trim() === '') return { kind: 'whole', size };
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (match === null) return { kind: 'whole', size };
  const [, first, last] = match;
  if (first === '' && last === '') return { kind: 'whole', size };
  if (size <= 0) return { kind: 'unsatisfiable', size };
  if (first === '') {
    // a suffix range: the last n bytes, all of them when n is larger than the file
    const n = Number(last);
    if (!Number.isFinite(n) || n <= 0) return { kind: 'unsatisfiable', size };
    const start = Math.max(0, size - n);
    return { kind: 'partial', range: { start, end: size - 1 }, size };
  }
  const start = Number(first);
  if (!Number.isFinite(start) || start >= size) return { kind: 'unsatisfiable', size };
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (!Number.isFinite(end) || end < start) return { kind: 'unsatisfiable', size };
  return { kind: 'partial', range: { start, end }, size };
}

/** The status and the range headers of an answer; the caller adds the content type and the cache rule. */
export function rangeHeaders(answer: RangeAnswer): {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
} {
  switch (answer.kind) {
    case 'whole':
      return {
        status: 200,
        headers: { 'accept-ranges': 'bytes', 'content-length': String(answer.size) },
      };
    case 'partial':
      return {
        status: 206,
        headers: {
          'accept-ranges': 'bytes',
          'content-range': `bytes ${answer.range.start}-${answer.range.end}/${answer.size}`,
          'content-length': String(answer.range.end - answer.range.start + 1),
        },
      };
    case 'unsatisfiable':
      return {
        status: 416,
        headers: { 'accept-ranges': 'bytes', 'content-range': `bytes */${answer.size}` },
      };
  }
}
