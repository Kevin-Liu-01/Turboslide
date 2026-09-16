// The XML layer of the PPTX reader (gslides-parity SPEC-5 5.1; R04 sections 3 and 8): @xmldom/xmldom
// 0.9.12 parses every part namespace aware, the reader walks elements by `namespaceURI` and
// `localName` and never by prefix (a producer may bind `p14` or `dsp` to any prefix), and two
// rules hold on every part before it is read: a part carrying a `DOCTYPE` or an entity
// declaration is refused (SPEC-5 1.1 rule 6: no external entities in XML; xmldom expands none,
// and the refusal makes the rule visible), and a part that is not well formed is refused with the
// parser's own sentence. `mc:AlternateContent` is read as R04 3 says: the first `mc:Choice` whose
// `Requires` prefixes all name namespaces the reader understands, else `mc:Fallback`.
import { DOMParser } from '@xmldom/xmldom';
import type { Document, Element, Node } from '@xmldom/xmldom';

/** The namespaces the reader knows, by the prefix the documentation uses (R04 section 3). */
export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  dgm: 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  dsp: 'http://schemas.microsoft.com/office/drawing/2008/diagram',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  asvg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  /** the package relationships part (`.rels`) */
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  /** `[Content_Types].xml` */
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  /** `docProps/app.xml` */
  ep: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  /** `docProps/core.xml` */
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
} as const;

export type NsKey = keyof typeof NS;

/** The namespaces an `mc:Choice` may require and still be taken (R04 3): the ones the reader maps. */
export const UNDERSTOOD_NAMESPACES: ReadonlySet<string> = new Set<string>([
  NS.p,
  NS.a,
  NS.r,
  NS.c,
  NS.dgm,
  NS.p14,
  NS.a14,
  NS.m,
]);

export type XmlWarning = { level: 'warning' | 'error'; message: string };

export type ParsedPart = { document: Document; root: Element; warnings: XmlWarning[] };

const DOCTYPE_RE = /<!(?:DOCTYPE|ENTITY)\b/i;

/**
 * Parses one part. A `DOCTYPE` or an entity declaration is refused before the parser runs, a
 * part that is not well formed is refused with the parser's sentence, and recoverable warnings
 * are returned so the report can carry them.
 */
export function parseXml(text: string, partName: string): ParsedPart {
  if (DOCTYPE_RE.test(text)) {
    throw new TypeError(
      `${partName} carries a DOCTYPE or an entity declaration, which the reader refuses`,
    );
  }
  const warnings: XmlWarning[] = [];
  const parser = new DOMParser({
    locator: false,
    onError: (level, message) => {
      if (level === 'fatalError') throw new TypeError(`${partName} is not well formed: ${message}`);
      warnings.push({ level, message });
    },
  });
  let document: Document;
  try {
    document = parser.parseFromString(text, 'application/xml');
  } catch (error) {
    if (error instanceof TypeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new TypeError(`${partName} is not well formed: ${message}`);
  }
  const root = document.documentElement;
  if (root === null) throw new TypeError(`${partName} has no root element`);
  // an `error` level report (an unclosed tag the parser repaired) is a refusal too: the reader
  // maps what a producer wrote, never what a repair guessed
  const errors = warnings.filter((w) => w.level === 'error');
  if (errors.length > 0) {
    throw new TypeError(`${partName} is not well formed: ${errors[0]?.message ?? 'parse error'}`);
  }
  return { document, root, warnings };
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

export function isElement(node: Node | null | undefined): node is Element {
  return node !== null && node !== undefined && node.nodeType === ELEMENT_NODE;
}

/** True when the element is `<ns:local>` by namespace, whatever prefix the producer bound. */
export function is(node: Node | null | undefined, ns: NsKey, local: string): boolean {
  return isElement(node) && node.namespaceURI === NS[ns] && node.localName === local;
}

/** The element children in document order. */
export function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (isElement(node)) out.push(node);
  }
  return out;
}

/** The direct children named `<ns:local>`. */
export function children(el: Element, ns: NsKey, local: string): Element[] {
  return elementChildren(el).filter((node) => is(node, ns, local));
}

/** The first direct child named `<ns:local>`, or undefined. */
export function child(el: Element, ns: NsKey, local: string): Element | undefined {
  return elementChildren(el).find((node) => is(node, ns, local));
}

/** The first child along a path of `<ns:local>` names, or undefined when a step is missing. */
export function path(el: Element, ...steps: [NsKey, string][]): Element | undefined {
  let current: Element | undefined = el;
  for (const [ns, local] of steps) {
    if (current === undefined) return undefined;
    current = child(current, ns, local);
  }
  return current;
}

/** Every descendant named `<ns:local>` in document order (the element itself excluded). */
export function descendants(el: Element, ns: NsKey, local: string): Element[] {
  const out: Element[] = [];
  const list = el.getElementsByTagNameNS(NS[ns], local);
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    if (isElement(node) && node !== el) out.push(node);
  }
  return out;
}

/** An attribute without a namespace (`cx`, `val`, `type`), or undefined when absent. */
export function attr(el: Element, name: string): string | undefined {
  const value = el.getAttribute(name);
  return value === null ? undefined : value;
}

/** A namespaced attribute (`r:id`, `r:embed`), or undefined when absent. */
export function attrNS(el: Element, ns: NsKey, local: string): string | undefined {
  const value = el.getAttributeNS(NS[ns], local);
  return value === null ? undefined : value;
}

/** An integer attribute; undefined when absent or not a finite integer string. */
export function intAttr(el: Element, name: string): number | undefined {
  const value = attr(el, name);
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value.trim())) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** A number attribute (integers and decimals); undefined when absent or not finite. */
export function numberAttr(el: Element, name: string): number | undefined {
  const value = attr(el, name);
  if (value === undefined) return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** An OOXML boolean attribute: `1`, `true`, `on` are true; `0`, `false`, `off` are false. */
export function boolAttr(el: Element, name: string): boolean | undefined {
  const value = attr(el, name);
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'off') return false;
  return undefined;
}

/** The concatenated text of the element's direct text and CDATA children (not its descendants). */
export function ownText(el: Element): string {
  let out = '';
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node !== undefined && (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE)) {
      out += node.nodeValue ?? '';
    }
  }
  return out;
}

/** Every text descendant concatenated. */
export function allText(el: Element): string {
  return el.textContent ?? '';
}

/** The namespace bound to a prefix at an element, walking its ancestors. */
export function namespaceOfPrefix(el: Element, prefix: string): string | undefined {
  let current: Node | null = el;
  while (current !== null && isElement(current)) {
    const value = current.getAttribute(prefix === '' ? 'xmlns' : `xmlns:${prefix}`);
    if (value !== null) return value;
    current = current.parentNode;
  }
  return undefined;
}

/**
 * The branch of an `mc:AlternateContent` the reader takes (R04 3): the first `mc:Choice` whose
 * `Requires` prefixes all resolve to understood namespaces, else the `mc:Fallback`; undefined
 * when neither exists. The result's element children are what the producer meant.
 */
export function alternateBranch(
  alternate: Element,
  understood: ReadonlySet<string> = UNDERSTOOD_NAMESPACES,
): Element | undefined {
  for (const choice of children(alternate, 'mc', 'Choice')) {
    const requires = (attr(choice, 'Requires') ?? '').split(/\s+/).filter((p) => p.length > 0);
    const ok = requires.every((prefix) => {
      const ns = namespaceOfPrefix(choice, prefix);
      return ns !== undefined && understood.has(ns);
    });
    if (ok) return choice;
  }
  return child(alternate, 'mc', 'Fallback');
}

/**
 * The element children of `el` with every `mc:AlternateContent` replaced by the children of its
 * chosen branch (recursively, for a Choice that wraps another), so a shape tree reads as one list.
 */
export function effectiveChildren(
  el: Element,
  understood: ReadonlySet<string> = UNDERSTOOD_NAMESPACES,
): Element[] {
  const out: Element[] = [];
  for (const node of elementChildren(el)) {
    if (is(node, 'mc', 'AlternateContent')) {
      const branch = alternateBranch(node, understood);
      if (branch !== undefined) out.push(...effectiveChildren(branch, understood));
      continue;
    }
    out.push(node);
  }
  return out;
}

/** `<ns:local>` as the documentation spells it, for messages and report rows. */
export function qualifiedName(el: Element): string {
  const entry = (Object.entries(NS) as [NsKey, string][]).find(
    ([, uri]) => uri === el.namespaceURI,
  );
  return entry ? `${entry[0]}:${el.localName ?? ''}` : (el.localName ?? el.nodeName);
}
