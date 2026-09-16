// The shape id renumber of the post process (gslides-parity SPEC-5 2.4; R05 6.4): after every
// insertion (the hidden title, the groups, the media pictures, the equation wrappers) and before
// the timing tree is written, every `p:cNvPr id` of a slide part is renumbered from 1 in document
// order (the `p:spTree` root keeps 1, the shapes take 2 onwards, a group before its members), the
// connectors' `a:stCxn` and `a:endCxn` ids follow their targets, and the name to id map is
// returned so `ooxml/timing.ts` targets a block's shape, group, picture or frame by the id the
// file finally carries. Duplicate ids are one of the repair risks R05 10 names; PowerPoint's own
// files number the ids this way.

export type RenumberResult = {
  xml: string;
  /** every `p:cNvPr name` to the id it now carries; the first shape of a repeated name wins */
  ids: Map<string, number>;
  /** the ids rewritten */
  count: number;
  /** ids that appeared more than once before the renumber */
  duplicates: number;
};

const CNVPR_RE = /<p:cNvPr\b([^>]*?)\sid="(\d+)"([^>]*)>/g;
const NAME_RE = /\sname="([^"]*)"/;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Renumbers every `p:cNvPr id` from 1 in document order and rewrites the connector ends to the
 * new numbers. A part with no `p:cNvPr` is returned as it is.
 */
export function renumberShapeIds(xml: string): RenumberResult {
  const ids = new Map<string, number>();
  /** old id to new id; the first occurrence of a repeated old id wins for the connector ends */
  const renamed = new Map<number, number>();
  const seen = new Set<number>();
  let duplicates = 0;
  let next = 0;
  const out = xml.replace(CNVPR_RE, (_match, before: string, oldId: string, after: string) => {
    next += 1;
    const old = Number(oldId);
    if (seen.has(old)) duplicates += 1;
    seen.add(old);
    if (!renamed.has(old)) renamed.set(old, next);
    const name = NAME_RE.exec(before + after)?.[1];
    if (name !== undefined && name !== '') {
      const decoded = decodeEntities(name);
      if (!ids.has(decoded)) ids.set(decoded, next);
    }
    return `<p:cNvPr${before} id="${next}"${after}>`;
  });
  if (next === 0) return { xml, ids, count: 0, duplicates: 0 };
  const rewired = out.replace(
    /<a:(stCxn|endCxn)\b([^>]*?)\sid="(\d+)"/g,
    (match, tag: string, attrs: string, id: string) => {
      const mapped = renamed.get(Number(id));
      return mapped === undefined ? match : `<a:${tag}${attrs} id="${mapped}"`;
    },
  );
  return { xml: rewired, ids, count: next, duplicates };
}

/** Every `p:cNvPr id` of a part, in document order (the read back of the check). */
export function shapeIdsOf(xml: string): number[] {
  return [...xml.matchAll(/<p:cNvPr\b[^>]*?\sid="(\d+)"/g)].map((m) => Number(m[1]));
}
