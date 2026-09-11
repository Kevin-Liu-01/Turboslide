// Inline HTML to the four-rule Text markup of SPEC 4.2: `<b>` becomes `*x*`, `<a>` becomes
// `[x](url)`, `.gt-word` becomes `GT`, a literal standalone GT is escaped, `*` and `[` are escaped,
// `&nbsp;` stays U+00A0. A nowrap span becomes its text with word joiners at its break
// opportunities (U+2060, zero width), the document's nowrap device beside U+00A0.
import { collapse, hasClass, isElement, isText } from './dom.ts';
import type { ChildNode, Element } from './dom.ts';

/** Matches the render package's GT word rule (the gt-mark-in-text.js exclusion list). */
const GT_WORD = /(?<![\w./-])GT(?![\w./-])/g;

export function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(GT_WORD, '\\GT');
}

export type TextOptions = {
  /** Keep `<br>` as `\n` (panel code, swatch values); otherwise a `<br>` is a space. */
  breaks?: boolean;
  /** Collect elements the serializer could not express, for the report. */
  unhandled?: string[];
  /**
   * True for a span a scoped rule sets to `white-space: nowrap` (s83:14 `.names span`), so the
   * mapper's rule matcher can hand the nowrap device to the text the same way an inline style does.
   */
  nowrap?: (el: Element) => boolean;
};

/** Serializes the inline content of an element to Text markup. */
export function textOfElement(el: Element, options: TextOptions = {}): string {
  return finish(el.childNodes.map((child) => serializeNode(child, options)).join(''), options);
}

/** Serializes a list of nodes (a slice of an element's children). */
export function textOfNodes(nodes: ChildNode[], options: TextOptions = {}): string {
  return finish(nodes.map((child) => serializeNode(child, options)).join(''), options);
}

function finish(raw: string, options: TextOptions): string {
  // Collapse white space the way the browser does, keeping U+00A0 and U+2060 and, when asked, \n.
  let out = raw;
  if (options.breaks) {
    out = out
      .split('\n')
      .map((line) => line.replace(/[ \t\r]+/g, ' ').trim())
      .join('\n')
      .replace(/^\n+|\n+$/g, '');
  } else {
    out = collapse(out.replace(/\n/g, ' '));
  }
  // Escaped display stars around a whole run become the run markup again.
  return out;
}

function serializeNode(node: ChildNode, options: TextOptions): string {
  if (isText(node)) return escapeLiteral(node.value);
  if (!isElement(node)) return '';
  const tag = node.tagName;
  if (tag === 'br') return options.breaks ? '\n' : ' ';
  if (hasClass(node, 'gt-word')) return 'GT';
  if (tag === 'b' || tag === 'strong') {
    const inner = node.childNodes.map((child) => serializeNode(child, options)).join('');
    return inner.length > 0 ? `*${inner}*` : '';
  }
  if (tag === 'a') {
    const href = node.attrs.find((a) => a.name === 'href')?.value ?? '';
    const inner = node.childNodes.map((child) => serializeNode(child, options)).join('');
    return `[${inner}](${href})`;
  }
  if (tag === 'svg') {
    // An inline icon inside copy (the external glyph after a link) is the renderer's, not the text's.
    return '';
  }
  if (tag === 'span' || tag === 'small' || tag === 'em' || tag === 'i') {
    const style = node.attrs.find((a) => a.name === 'style')?.value ?? '';
    const inner = node.childNodes.map((child) => serializeNode(child, options)).join('');
    if (hasClass(node, 'lk')) return inner;
    if (
      /white-space\s*:\s*nowrap/.test(style) ||
      hasClass(node, 'nb') ||
      options.nowrap?.(node) === true
    ) {
      return joinNoBreak(inner);
    }
    const otherAttrs = node.attrs.filter((a) => a.name !== 'class' && a.name !== 'style');
    if (otherAttrs.length > 0 || style) options.unhandled?.push(`<${tag}${describeAttrs(node)}>`);
    return inner;
  }
  options.unhandled?.push(`<${tag}${describeAttrs(node)}>`);
  return node.childNodes.map((child) => serializeNode(child, options)).join('');
}

function describeAttrs(el: Element): string {
  return el.attrs.map((a) => ` ${a.name}="${a.value}"`).join('');
}

/** Word joiners after hyphens and in place of spaces so the run never breaks (s28:5, s14:30). */
export function joinNoBreak(text: string): string {
  return text.replace(/ /g, '\u00a0').replace(/-(?=\S)/g, '-\u2060');
}

/** Whether an element's inline content is only text the four rules can express. */
export function isInlineOnly(el: Element): boolean {
  return el.childNodes.every((child) => {
    if (isText(child)) return true;
    if (!isElement(child)) return true;
    if (hasClass(child, 'gt-word')) return true;
    if (
      child.tagName === 'b' ||
      child.tagName === 'a' ||
      child.tagName === 'span' ||
      child.tagName === 'small' ||
      child.tagName === 'br'
    ) {
      return isInlineOnly(child);
    }
    if (child.tagName === 'svg' && hasClass(child, 'ic')) return true;
    return false;
  });
}
