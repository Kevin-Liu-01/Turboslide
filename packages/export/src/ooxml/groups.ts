// Grouping (SPEC 8.2 post-process): pptxgenjs has no grouping
// (https://github.com/gitbrent/PptxGenJS/issues/307), so a ruled row's hairline and its key and
// value boxes are written with object names that share a `@<group>` suffix and wrapped here in one
// `<p:grpSp>` so the row moves as one object. The group's `xfrm` is the union of its children with
// `chOff` and `chExt` equal to `off` and `ext`, so the children keep their page coordinates.
//
// Round two (gslides-parity SPEC-2 2.1.3, 0.67): an object name may carry several keys, read left
// to right: `ts:<slide>#<block>@g:<tag>@<block>/row/<i>` puts the shape in the user group `g:<tag>`
// (the outer grpSp) and, inside it, the row group (a nested grpSp). The shape regex matches
// `p:sp`, `p:pic`, `p:graphicFrame` (tables, charts) and `p:cxnSp` (connectors), so a group can hold
// any of them; a group needs two members at its level (a lone shape with a key stays as it is).

export type ShapeInfo = {
  xml: string;
  start: number;
  end: number;
  id: number;
  name: string;
  off: [number, number];
  ext: [number, number];
};

const SHAPE_RE = /<p:(sp|pic|graphicFrame|cxnSp)>[\s\S]*?<\/p:\1>/g;

/** Every top-level sp, pic, graphicFrame and cxnSp of a slide part with its id, name and xfrm. */
export function listShapes(xml: string): ShapeInfo[] {
  const out: ShapeInfo[] = [];
  for (const match of xml.matchAll(SHAPE_RE)) {
    const shape = match[0];
    const id = Number(/<p:cNvPr id="(\d+)"/.exec(shape)?.[1] ?? 0);
    const name = /<p:cNvPr id="\d+" name="([^"]*)"/.exec(shape)?.[1] ?? '';
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(shape);
    const ext = /<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(shape);
    out.push({
      xml: shape,
      start: match.index ?? 0,
      end: (match.index ?? 0) + shape.length,
      id,
      name: decodeEntities(name),
      off: [Number(off?.[1] ?? 0), Number(off?.[2] ?? 0)],
      ext: [Number(ext?.[1] ?? 0), Number(ext?.[2] ?? 0)],
    });
  }
  return out;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeEntities(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The group keys of an object name, left to right: the parts after the first `@`. */
export function groupKeysOf(name: string): string[] {
  const at = name.indexOf('@');
  return at >= 0
    ? name
        .slice(at + 1)
        .split('@')
        .filter((k) => k.length > 0)
    : [];
}

/** The innermost group key of an object name (the round one reading), or undefined. */
export function groupKeyOf(name: string): string | undefined {
  const keys = groupKeysOf(name);
  return keys.length > 0 ? keys[keys.length - 1] : undefined;
}

export type GroupResult = {
  xml: string;
  /** Every grpSp written, the outer ones first; `ids` are the shape ids it holds at any depth. */
  groups: { key: string; ids: number[]; depth: number }[];
};

type Member = { shape: ShapeInfo; keys: string[] };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function boundsOf(shapes: readonly ShapeInfo[]): Bounds {
  return {
    minX: Math.min(...shapes.map((s) => s.off[0])),
    minY: Math.min(...shapes.map((s) => s.off[1])),
    maxX: Math.max(...shapes.map((s) => s.off[0] + s.ext[0])),
    maxY: Math.max(...shapes.map((s) => s.off[1] + s.ext[1])),
  };
}

/**
 * The grpSp markup of a set of members at one key depth: the members whose next key agrees are
 * nested in their own group when two or more share it, the rest are direct children, in document
 * order of first appearance.
 */
function groupMarkup(
  key: string,
  members: readonly Member[],
  depth: number,
  nextId: () => number,
  report: GroupResult['groups'],
): string {
  const shapes = members.map((m) => m.shape);
  const b = boundsOf(shapes);
  const id = nextId();
  report.push({ key, ids: shapes.map((s) => s.id), depth });
  // the children in order: a nested group at the position of its first member
  const nested = new Map<string, Member[]>();
  for (const member of members) {
    const sub = member.keys[depth + 1];
    if (sub === undefined) continue;
    const list = nested.get(sub) ?? [];
    list.push(member);
    nested.set(sub, list);
  }
  const emitted = new Set<string>();
  let children = '';
  for (const member of members) {
    const sub = member.keys[depth + 1];
    const list = sub !== undefined ? nested.get(sub) : undefined;
    if (sub !== undefined && list !== undefined && list.length >= 2) {
      if (emitted.has(sub)) continue;
      emitted.add(sub);
      children += groupMarkup(sub, list, depth + 1, nextId, report);
      continue;
    }
    children += member.shape.xml;
  }
  return (
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${encodeEntities(key)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="${b.minX}" y="${b.minY}"/><a:ext cx="${b.maxX - b.minX}" cy="${b.maxY - b.minY}"/>` +
    `<a:chOff x="${b.minX}" y="${b.minY}"/><a:chExt cx="${b.maxX - b.minX}" cy="${b.maxY - b.minY}"/></a:xfrm></p:grpSpPr>` +
    children +
    '</p:grpSp>'
  );
}

/**
 * Wraps every set of two or more shapes sharing a group key in one grpSp; a second key on the
 * members nests a group inside the first (0.67). A key shared by one shape only leaves that shape
 * where it is, and its deeper keys are then read as its outer ones (a row group of one item in a
 * user group of one block groups nothing).
 */
export function groupShapes(xml: string): GroupResult {
  const shapes = listShapes(xml);
  const members: Member[] = shapes.map((shape) => ({ shape, keys: groupKeysOf(shape.name) }));
  const byOuter = new Map<string, Member[]>();
  for (const member of members) {
    const key = member.keys[0];
    if (key === undefined) continue;
    const list = byOuter.get(key) ?? [];
    list.push(member);
    byOuter.set(key, list);
  }
  // an outer key on one shape does not group; its inner keys become the outer ones for a retry
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, list] of [...byOuter.entries()]) {
      if (list.length >= 2) continue;
      byOuter.delete(key);
      for (const member of list) {
        member.keys = member.keys.slice(1);
        const next = member.keys[0];
        if (next === undefined) continue;
        const target = byOuter.get(next) ?? [];
        target.push(member);
        byOuter.set(next, target);
        changed = true;
      }
    }
  }
  const groups = [...byOuter.entries()].filter(([, list]) => list.length >= 2);
  if (groups.length === 0) return { xml, groups: [] };
  let idCounter = Math.max(0, ...shapes.map((s) => s.id));
  const nextId = (): number => {
    idCounter += 1;
    return idCounter;
  };
  const removed = new Set<ShapeInfo>();
  const inserts = new Map<ShapeInfo, string>();
  const report: GroupResult['groups'] = [];
  for (const [key, list] of groups) {
    const first = (list[0] as Member).shape;
    inserts.set(first, groupMarkup(key, list, 0, nextId, report));
    for (const member of list) removed.add(member.shape);
  }
  let out = '';
  let cursor = 0;
  for (const shape of shapes) {
    out += xml.slice(cursor, shape.start);
    const insert = inserts.get(shape);
    if (insert !== undefined) out += insert;
    else if (!removed.has(shape)) out += shape.xml;
    cursor = shape.end;
  }
  out += xml.slice(cursor);
  return { xml: out, groups: report };
}

/** The number of grpSp elements in a slide part, for the read-back test. */
export function countGroups(xml: string): number {
  return (xml.match(/<p:grpSp>/g) ?? []).length;
}
