// parse5 helpers for the importer (SPEC 9): typed access to the default tree adapter's nodes.
import { parseFragment, serialize, serializeOuter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

export type Node = DefaultTreeAdapterMap['node'];
export type Element = DefaultTreeAdapterMap['element'];
export type TextNode = DefaultTreeAdapterMap['textNode'];
export type ChildNode = DefaultTreeAdapterMap['childNode'];
export type ParentNode = DefaultTreeAdapterMap['parentNode'];

export function parseHtmlFragment(html: string): DefaultTreeAdapterMap['documentFragment'] {
  return parseFragment(html);
}

export function isElement(node: Node | null | undefined): node is Element {
  return !!node && 'tagName' in node && typeof node.tagName === 'string';
}

export function isText(node: Node | null | undefined): node is TextNode {
  return !!node && node.nodeName === '#text';
}

export function isComment(
  node: Node | null | undefined,
): node is DefaultTreeAdapterMap['commentNode'] {
  return !!node && node.nodeName === '#comment';
}

export function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function classList(el: Element): string[] {
  return (attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
}

export function hasClass(el: Element, name: string): boolean {
  return classList(el).includes(name);
}

/** Element children only. */
export function children(node: ParentNode): Element[] {
  return node.childNodes.filter(isElement);
}

/** Children that are elements or non-blank text, in order. */
export function contentChildren(node: ParentNode): ChildNode[] {
  return node.childNodes.filter(
    (child) => isElement(child) || (isText(child) && child.value.trim().length > 0),
  );
}

export function firstChildElement(node: ParentNode, tag?: string): Element | undefined {
  return children(node).find((el) => tag === undefined || el.tagName === tag);
}

/** Depth-first search for the first element matching a predicate. */
export function find(node: ParentNode, test: (el: Element) => boolean): Element | undefined {
  for (const child of node.childNodes) {
    if (!isElement(child)) continue;
    if (test(child)) return child;
    const inner = find(child, test);
    if (inner) return inner;
  }
  return undefined;
}

export function findAll(
  node: ParentNode,
  test: (el: Element) => boolean,
  out: Element[] = [],
): Element[] {
  for (const child of node.childNodes) {
    if (!isElement(child)) continue;
    if (test(child)) out.push(child);
    findAll(child, test, out);
  }
  return out;
}

/** The text content of a node with white space collapsed the way HTML renders it. */
export function textOf(node: Node): string {
  if (isText(node)) return node.value;
  if (!('childNodes' in node)) return '';
  return node.childNodes.map(textOf).join('');
}

export function collapse(text: string): string {
  return text.replace(/[ \t\n\r]+/g, ' ').trim();
}

/** Inner HTML of an element, as parse5 serializes it. */
export function innerHtml(el: ParentNode): string {
  return serialize(el);
}

export function outerHtml(node: Node): string {
  return serializeOuter(node);
}

/** Parses an inline `style` attribute into declarations, in order. */
export function parseStyle(value: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!value) return out;
  for (const part of value.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const prop = part.slice(0, at).trim().toLowerCase();
    const val = part.slice(at + 1).trim();
    if (prop) out.set(prop, val);
  }
  return out;
}

/** Serializes declarations back to a `style` value (`prop:value;...`). */
export function serializeStyle(declarations: Map<string, string>): string | undefined {
  if (declarations.size === 0) return undefined;
  return [...declarations.entries()].map(([prop, val]) => `${prop}:${val}`).join(';');
}

/** Removes an attribute from an element in place. */
export function removeAttr(el: Element, name: string): void {
  el.attrs = el.attrs.filter((a) => a.name !== name);
}

/** A pixel value (`22px`) as a number, or undefined. */
export function pxNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^-?0+(\.0+)?$/.test(trimmed)) return 0;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  return match ? Number(match[1]) : undefined;
}
