// Grouping (SPEC 8.2 post-process): pptxgenjs has no grouping
// (https://github.com/gitbrent/PptxGenJS/issues/307), so a ruled row's hairline and its key and
// value boxes are written with object names that share a `@<group>` suffix and wrapped here in one
// `<p:grpSp>` so the row moves as one object. The group's `xfrm` is the union of its children with
// `chOff` and `chExt` equal to `off` and `ext`, so the children keep their page coordinates.

export type ShapeInfo = {
  xml: string;
  start: number;
  end: number;
  id: number;
  name: string;
  off: [number, number];
  ext: [number, number];
};

const SHAPE_RE = /<p:(sp|pic)>[\s\S]*?<\/p:\1>/g;

/** Every top-level sp and pic of a slide part with its id, name and xfrm. */
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

/** The group key of an object name: the part after the last `@`, or undefined. */
export function groupKeyOf(name: string): string | undefined {
  const at = name.lastIndexOf('@');
  return at >= 0 ? name.slice(at + 1) : undefined;
}

export type GroupResult = { xml: string; groups: { key: string; ids: number[] }[] };

/** Wraps every set of two or more shapes sharing a group key in one grpSp. */
export function groupShapes(xml: string): GroupResult {
  const shapes = listShapes(xml);
  const byKey = new Map<string, ShapeInfo[]>();
  for (const shape of shapes) {
    const key = groupKeyOf(shape.name);
    if (key === undefined) continue;
    const list = byKey.get(key) ?? [];
    list.push(shape);
    byKey.set(key, list);
  }
  const groups = [...byKey.entries()].filter(([, list]) => list.length >= 2);
  if (groups.length === 0) return { xml, groups: [] };
  let nextId = Math.max(0, ...shapes.map((s) => s.id)) + 1;
  const removed = new Set<ShapeInfo>();
  const inserts = new Map<ShapeInfo, string>();
  const report: GroupResult['groups'] = [];
  for (const [key, list] of groups) {
    const minX = Math.min(...list.map((s) => s.off[0]));
    const minY = Math.min(...list.map((s) => s.off[1]));
    const maxX = Math.max(...list.map((s) => s.off[0] + s.ext[0]));
    const maxY = Math.max(...list.map((s) => s.off[1] + s.ext[1]));
    const id = nextId;
    nextId += 1;
    const group =
      `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${encodeEntities(key)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr><a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${maxX - minX}" cy="${maxY - minY}"/>` +
      `<a:chOff x="${minX}" y="${minY}"/><a:chExt cx="${maxX - minX}" cy="${maxY - minY}"/></a:xfrm></p:grpSpPr>` +
      list.map((s) => s.xml).join('') +
      '</p:grpSp>';
    const first = list[0] as ShapeInfo;
    inserts.set(first, group);
    for (const s of list) removed.add(s);
    report.push({ key, ids: list.map((s) => s.id) });
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
