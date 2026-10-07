import type { LLMsOptions } from 'fumadocs-core/mdx-plugins/remark-llms';

/**
 * The markdown form of every docs component, for the twins (docs/POLISH-2.md 5.7, C27): fumadocs'
 * `remarkLLMs` writes each page's markdown at compile time and calls `stringify` for every node;
 * a component answers its own form and every other node keeps the default. A callout is a block
 * quote, steps a numbered list, tabs one subheading per tab, cards a list of links. Headings carry
 * no `[#id]` suffix. The function runs in the build alone (fumadocs-mdx evaluates source.ts's
 * options there); nothing here reaches a page's script.
 */
type Stringify = NonNullable<LLMsOptions['stringify']>;
type Args = Parameters<Stringify>;
type AnyNode = Args[0];
type State = Args[2];
type Info = Args[3];

type JsxElement = Extract<AnyNode, { type: 'mdxJsxFlowElement' | 'mdxJsxTextElement' }>;

/** A string attribute of an element, or undefined. */
function attr(node: JsxElement, name: string): string | undefined {
  for (const attribute of node.attributes) {
    if (attribute.type !== 'mdxJsxAttribute' || attribute.name !== name) continue;
    return typeof attribute.value === 'string' ? attribute.value : undefined;
  }
  return undefined;
}

function isElement(node: AnyNode, name?: string): node is JsxElement {
  return (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    (name === undefined || node.name === name)
  );
}

/** The markdown of an element's children, as flow content. */
function inner(node: JsxElement, state: State, info: Info): string {
  return state.containerFlow(node as Parameters<State['containerFlow']>[0], info).trim();
}

/** The markdown of a node list as flow content. */
function flow(children: AnyNode[], state: State, info: Info): string {
  return state
    .containerFlow({ type: 'root', children } as Parameters<State['containerFlow']>[0], info)
    .trim();
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function indent(text: string, by: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '' : `${by}${line}`))
    .join('\n');
}

/** The labels a callout's `type` prints in the twin, and in the page's mark (components/docs). */
export const CALLOUT_LABELS = { note: 'Note', warning: 'Warning', tip: 'Tip' } as const;
export type CalloutType = keyof typeof CALLOUT_LABELS;

export function calloutLabel(type: string | undefined): string {
  return type !== undefined && type in CALLOUT_LABELS
    ? CALLOUT_LABELS[type as CalloutType]
    : CALLOUT_LABELS.note;
}

/** The counts of the action reference (docs/POLISH-2.md 5.4), one sentence on the page and in its twin. */
export type CountsProps = { total: string; cli: string; mcp: string; http: string; window: string };

export function countsText({ total, cli, mcp, http, window }: CountsProps): string {
  const actions = total === '1' ? 'action' : 'actions';
  return `${total} ${actions}: ${cli} on the command line, ${mcp} as MCP tools, ${http} as HTTP endpoints and ${window} in the page.`;
}

/** The depth of the heading before `node` in its parent, for the tabs' subheadings. */
function depthBefore(node: AnyNode, parent: Args[1]): number {
  if (parent === undefined || !('children' in parent)) return 2;
  const siblings = parent.children as AnyNode[];
  const at = siblings.indexOf(node);
  for (let i = at - 1; i >= 0; i -= 1) {
    const sibling = siblings[i];
    if (sibling?.type === 'heading') return sibling.depth;
  }
  return 2;
}

const stringify: Stringify = (node, parent, state, info) => {
  if (!isElement(node)) return undefined;
  switch (node.name) {
    case 'Callout': {
      const label = attr(node, 'title') ?? calloutLabel(attr(node, 'type'));
      const body = inner(node, state, info);
      return quote(`**${label}.** ${body}`);
    }
    case 'Steps': {
      const steps = node.children.filter((child) => isElement(child as AnyNode, 'Step'));
      return steps
        .map((step, index) => {
          const element = step as JsxElement;
          const head = `${index + 1}. **${attr(element, 'title') ?? ''}**`;
          const body = inner(element, state, info);
          return body === '' ? head : `${head}\n\n${indent(body, '   ')}`;
        })
        .join('\n\n');
    }
    case 'Tabs': {
      const depth = Math.min(6, depthBefore(node, parent) + 1);
      const tabs = node.children.filter((child) => isElement(child as AnyNode, 'Tab'));
      return tabs
        .map((tab) => {
          const element = tab as JsxElement;
          return `${'#'.repeat(depth)} ${attr(element, 'title') ?? ''}\n\n${inner(element, state, info)}`;
        })
        .join('\n\n');
    }
    case 'Cards': {
      const cards = node.children.filter((child) => isElement(child as AnyNode, 'Card'));
      return cards.map((card) => cardLine(card as JsxElement, state, info)).join('\n');
    }
    case 'Card':
      return cardLine(node, state, info);
    case 'Step':
    case 'Tab':
      return inner(node, state, info);
    case 'ActionCounts':
      return countsText({
        total: attr(node, 'total') ?? '',
        cli: attr(node, 'cli') ?? '',
        mcp: attr(node, 'mcp') ?? '',
        http: attr(node, 'http') ?? '',
        window: attr(node, 'window') ?? '',
      });
    case 'Kbd':
      return node.children.length > 0
        ? flow(node.children as AnyNode[], state, info)
        : (attr(node, 'k') ?? '');
    default:
      return undefined;
  }
};

function cardLine(card: JsxElement, state: State, info: Info): string {
  const title = attr(card, 'title') ?? '';
  const href = attr(card, 'href') ?? '';
  const body = inner(card, state, info).replace(/\s*\n\s*/g, ' ');
  return `- [${title}](${href})${body === '' ? '' : `: ${body}`}`;
}

/** The options of `includeProcessedMarkdown` (source.ts). */
export const DOCS_MARKDOWN: LLMsOptions = {
  headingIds: false,
  stringify,
};
