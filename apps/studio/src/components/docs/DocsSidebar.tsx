import type * as PageTree from 'fumadocs-core/page-tree';

import { SITE_FACTS } from '../site/facts';
import { SiteIcon } from '../site/SiteIcon';
import type { SiteIconName } from '../site/SiteIcon';
import { PathLink } from './mdx';

/**
 * The docs navigation (docs/SITE.md section 6; the Workbench reference, plan E.2): the page tree
 * of `meta.json` as three groups (Use Turboslide, Agents, Reference), each under a capital label
 * with its solid icon, on one hairline rail. A folder's index page is a row and its pages follow
 * it, indented 32 px and a step lighter, while the reader is inside the folder or when its
 * `meta.json` opens it by default. The current page is in ink at weight 500 with a 2 px ink rule
 * on the rail and `aria-current="page"`. Action reference carries the count of actions from the
 * site's counts (components/site/facts.ts, pinned to the action table), never typed. The same
 * list draws the Contents disclosure under 1024 px.
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
          {group.label === undefined ? null : (
            <p className="ts-docs-nav-label t-label site-label">
              <SiteIcon name={GROUP_ICONS[group.label] ?? 'book-open'} />
              {group.label}
            </p>
          )}
          <ul className="ts-docs-nav-list">
            {group.nodes.map((node, at) => (
              <Row key={at} node={node} current={current} onNavigate={onNavigate} sub={false} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The solid icon of each navigation group (docs/SITE.md D11). */
const GROUP_ICONS: Record<string, SiteIconName> = {
  'Use Turboslide': 'book-open',
  Agents: 'command-line',
  Reference: 'queue-list',
};

/**
 * The navigation's name for a page whose title is written for its own heading: the docs' front
 * page is titled "Turboslide documentation" and is Overview in the navigation and the pager.
 */
const NAV_NAMES: Record<string, string> = { '/docs': 'Overview' };

export function navName(url: string, title: string): string {
  return NAV_NAMES[url] ?? title;
}

/** The count a row carries after its name: the action reference's actions. */
const ROW_COUNTS: Record<string, number> = { '/docs/reference': SITE_FACTS.actions };

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

/** Where a page sits: its navigation name and its group's label, for the Contents disclosure. */
export function placeOf(
  tree: PageTree.Root,
  current: string,
): { name: string; group?: string } | null {
  for (const group of groupsOf(tree.children)) {
    const found = findIn(group.nodes, current);
    if (found !== null)
      return group.label === undefined ? { name: found } : { name: found, group: group.label };
  }
  return null;
}

function findIn(nodes: PageTree.Node[], current: string): string | null {
  for (const node of nodes) {
    if (node.type === 'page' && node.url === current) return navName(node.url, textOf(node.name));
    if (node.type === 'folder') {
      if (node.index?.url === current) return navName(current, textOf(node.name));
      const inner = findIn(node.children, current);
      if (inner !== null) return inner;
    }
  }
  return null;
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
  sub,
}: {
  node: PageTree.Node;
  current: string;
  onNavigate: (() => void) | undefined;
  sub: boolean;
}) {
  if (node.type === 'separator') return null;
  if (node.type === 'page')
    return (
      <li className={sub ? 'is-sub' : undefined}>
        <PageLink url={node.url} name={node.name} current={current} onNavigate={onNavigate} />
      </li>
    );
  const open = node.defaultOpen === true || inside(node, current);
  return (
    <>
      <li className={sub ? 'is-sub' : undefined}>
        {node.index === undefined ? (
          <p className="ts-docs-nav-folder">{textOf(node.name)}</p>
        ) : (
          <PageLink
            url={node.index.url}
            name={node.name}
            current={current}
            onNavigate={onNavigate}
          />
        )}
      </li>
      {open
        ? node.children.map((child, at) => (
            <Row key={at} node={child} current={current} onNavigate={onNavigate} sub />
          ))
        : null}
    </>
  );
}

function PageLink({
  url,
  name,
  current,
  onNavigate,
}: {
  url: string;
  name: PageTree.Item['name'];
  current: string;
  onNavigate: (() => void) | undefined;
}) {
  const here = url === current;
  const count = ROW_COUNTS[url];
  return (
    <PathLink
      to={url}
      className="ts-docs-nav-link"
      {...(here ? { 'aria-current': 'page' as const } : {})}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
    >
      <span className="ts-docs-nav-name">{navName(url, textOf(name))}</span>
      {count === undefined ? null : (
        <>
          {' '}
          <span className="ts-docs-nav-count pt-num">{count}</span>
        </>
      )}
    </PathLink>
  );
}
