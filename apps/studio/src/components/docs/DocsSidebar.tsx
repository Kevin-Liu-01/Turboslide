import type * as PageTree from 'fumadocs-core/page-tree';

import { PathLink } from './mdx';

/**
 * The docs sidebar (docs/POLISH-2.md 5.3, 5.6): the page tree of `meta.json` as three groups (Use
 * Turboslide, Agents, Reference), each a label and its pages, with one level of nesting: a
 * folder's index page is a row and its pages follow it, shown while the reader is inside the
 * folder or when its `meta.json` opens it by default. The current page is marked with
 * `aria-current`. Rows are square (DESIGN.md 3.1). The same list draws the Menu sheet on a phone.
 */
export function DocsSidebar({
  tree,
  current,
  onNavigate,
  control = 'docs.nav',
}: {
  tree: PageTree.Root;
  current: string;
  onNavigate?: () => void;
  control?: string;
}) {
  const groups = groupsOf(tree.children);
  return (
    <nav className="ts-docs-nav" aria-label="Documentation" data-control={control}>
      {groups.map((group, index) => (
        <div className="ts-docs-nav-group" key={index}>
          {group.label === undefined ? null : <p className="ts-docs-nav-label">{group.label}</p>}
          <ul>
            {group.nodes.map((node, at) => (
              <Row key={at} node={node} current={current} onNavigate={onNavigate} depth={0} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type Group = { label?: string; nodes: PageTree.Node[] };

/** The tree's top level cut at its separators. */
export function groupsOf(nodes: PageTree.Node[]): Group[] {
  const groups: Group[] = [];
  for (const node of nodes) {
    if (node.type === 'separator') {
      groups.push({ label: textOf(node.name), nodes: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ nodes: [] });
    groups[groups.length - 1]?.nodes.push(node);
  }
  return groups.filter((group) => group.nodes.length > 0);
}

function textOf(name: unknown): string {
  return typeof name === 'string' ? name : String(name ?? '');
}

function inside(node: PageTree.Node, current: string): boolean {
  if (node.type === 'page') return node.url === current;
  if (node.type === 'folder')
    return node.index?.url === current || node.children.some((child) => inside(child, current));
  return false;
}

function Row({
  node,
  current,
  onNavigate,
  depth,
}: {
  node: PageTree.Node;
  current: string;
  onNavigate: (() => void) | undefined;
  depth: number;
}) {
  if (node.type === 'separator') return null;
  if (node.type === 'page')
    return <PageRow url={node.url} name={node.name} {...{ current, onNavigate, depth }} />;
  const open = node.defaultOpen === true || inside(node, current);
  return (
    <li>
      {node.index === undefined ? (
        <p className="ts-docs-nav-folder">{textOf(node.name)}</p>
      ) : (
        <PageRowLink url={node.index.url} name={node.name} {...{ current, onNavigate, depth }} />
      )}
      {open ? (
        <ul className="ts-docs-nav-sub">
          {node.children.map((child, at) => (
            <Row
              key={at}
              node={child}
              current={current}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PageRow(props: {
  url: string;
  name: PageTree.Item['name'];
  current: string;
  onNavigate: (() => void) | undefined;
  depth: number;
}) {
  return (
    <li>
      <PageRowLink {...props} />
    </li>
  );
}

function PageRowLink({
  url,
  name,
  current,
  onNavigate,
}: {
  url: string;
  name: PageTree.Item['name'];
  current: string;
  onNavigate: (() => void) | undefined;
  depth: number;
}) {
  const here = url === current;
  return (
    <PathLink
      to={url}
      className="ts-docs-nav-link"
      {...(here ? { 'aria-current': 'page' as const } : {})}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
    >
      {textOf(name)}
    </PathLink>
  );
}
