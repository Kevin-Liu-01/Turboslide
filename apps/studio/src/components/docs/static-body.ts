import type { DocsTocEntry } from '../../docs/paths';

/**
 * A docs article's body as static HTML in the browser (hardening HR-PC#5, PERF-11). The server
 * draws the body from the page's compiled MDX; the browser never loads that chunk and never
 * hydrates the body. A move to another docs page reads the body and its on this page entries
 * from that page's prerendered document (a file on the CDN, no server function), and the body's
 * three controls run from one click and one key handler on the body's element: Copy on a code
 * block, the tabs of a Tabs block, and a link to another page of this site, which the router
 * follows.
 */

/** The body's element in a docs document, and the on this page entries beside it. */
const BODY_SELECTOR = '[data-control="docs.page"] .ts-docs-body-text';
const TOC_SELECTOR = '[data-control="docs.toc"] li';

/** The body and the entries of the page at `url`, read from its document. */
export async function fetchArticle(url: string): Promise<{ html: string; toc: DocsTocEntry[] }> {
  const response = await fetch(url, { headers: { accept: 'text/html' } });
  if (!response.ok) throw new Error(`The page ${url} could not be loaded (${response.status}).`);
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const body = page.querySelector(BODY_SELECTOR);
  if (body === null) throw new Error(`The page ${url} has no article.`);
  const toc = [...page.querySelectorAll<HTMLLIElement>(TOC_SELECTOR)].flatMap((item) => {
    const link = item.querySelector('a');
    const href = link?.getAttribute('href');
    if (link === null || href === null || href === undefined) return [];
    return [{ url: href, title: link.textContent ?? '', depth: Number(item.dataset.depth ?? 2) }];
  });
  return { html: body.innerHTML, toc };
}

/** A path of this site the router draws: not a twin, the agents' text or another file. */
const ROUTER_PATH = /^\/(?!\/)/;
const FILE_PATH = /\.(?:md|txt|json|xml)(?:$|[?#])/;

/** The code a block's Copy writes: its lines as written, without the drawn prompt. */
function codeText(block: Element): string {
  const code = block.querySelector('pre code');
  if (code === null) return '';
  const lines = [...code.querySelectorAll('.ts-docs-ln')];
  if (lines.length === 0) return (code.textContent ?? '').replace(/\n$/, '');
  return lines.map((line) => (line.textContent === ' ' ? '' : line.textContent)).join('\n');
}

async function copyCode(button: HTMLElement): Promise<void> {
  const swap = button.querySelector<HTMLElement>('.ts-docs-swap');
  const block = button.closest('.ts-docs-code');
  if (block === null) return;
  try {
    await navigator.clipboard.writeText(codeText(block));
    swap?.setAttribute('data-state', 'copied');
  } catch {
    swap?.setAttribute('data-state', 'failed');
  }
  window.setTimeout(() => swap?.setAttribute('data-state', 'idle'), 2000);
}

/** Selects the tab at `index` of a Tabs block (wrapping), and focuses it when asked. */
function selectTab(tabs: Element, index: number, focus: boolean): void {
  const buttons = [
    ...tabs.querySelectorAll<HTMLButtonElement>(':scope > [role="tablist"] > [role="tab"]'),
  ];
  const panels = [...tabs.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]')];
  if (buttons.length === 0) return;
  const at = (index + buttons.length) % buttons.length;
  buttons.forEach((button, n) => {
    button.setAttribute('aria-selected', String(n === at));
    button.tabIndex = n === at ? 0 : -1;
  });
  panels.forEach((panel, n) => {
    panel.hidden = n !== at;
  });
  if (focus) buttons[at]?.focus();
}

/** The index of a tab among its list's tabs. */
function tabIndex(tab: Element): number {
  const list = tab.parentElement;
  return list === null ? -1 : [...list.children].indexOf(tab);
}

/**
 * The body's click handler: Copy, a tab, or a link to a page of this site, which `navigate`
 * follows. A link with a modifier key, another button, a new tab target or a file keeps the
 * browser's own behaviour.
 */
export function onBodyClick(event: MouseEvent, navigate: (href: string) => void): void {
  const target = event.target instanceof Element ? event.target : null;
  if (target === null) return;
  const copy = target.closest<HTMLElement>('[data-control="docs.code.copy"]');
  if (copy !== null) {
    void copyCode(copy);
    return;
  }
  const tab = target.closest('.ts-docs-tabs [role="tab"]');
  const tabs = tab?.closest('.ts-docs-tabs');
  if (tab !== null && tab !== undefined && tabs !== null && tabs !== undefined) {
    selectTab(tabs, tabIndex(tab), false);
    return;
  }
  const link = target.closest<HTMLAnchorElement>('a[href]');
  if (link === null) return;
  const href = link.getAttribute('href') ?? '';
  if (!ROUTER_PATH.test(href) || FILE_PATH.test(href)) return;
  if (link.target !== '' || link.hasAttribute('download')) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigate(href);
}

/** A docs table's scroll box (mdx.tsx `Table`), which carries the table's name in `data-label`. */
const TABLE_SELECTOR = '.ts-docs-table';

/**
 * A table wider than its column, one that scrolls, is a region that Tab reaches, named by its
 * columns, so the keyboard scrolls it too; a table that fits is neither, so a reference page's
 * 43 tables are not 43 Tab stops and 43 landmarks of one name.
 */
export function markTable(box: HTMLElement): void {
  if (box.scrollWidth > box.clientWidth) {
    box.setAttribute('role', 'region');
    box.setAttribute('tabindex', '0');
    box.setAttribute('aria-label', box.dataset.label ?? 'Table');
    return;
  }
  box.removeAttribute('role');
  box.removeAttribute('tabindex');
  box.removeAttribute('aria-label');
}

/**
 * Marks each table of a body (`markTable`) and marks it again whenever its box or the table
 * changes size: a window resize, a font that loads. Returns the function that stops watching.
 */
export function watchTables(body: Element): () => void {
  const boxes = [...body.querySelectorAll<HTMLElement>(TABLE_SELECTOR)];
  if (typeof ResizeObserver === 'undefined') {
    boxes.forEach(markTable);
    return () => {};
  }
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.target.closest<HTMLElement>(TABLE_SELECTOR);
      if (box !== null) markTable(box);
    }
  });
  for (const box of boxes) {
    observer.observe(box);
    const table = box.querySelector('table');
    if (table !== null) observer.observe(table);
  }
  return () => observer.disconnect();
}

/** The body's key handler: the arrow keys move between the tabs of a Tabs block. */
export function onBodyKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
  const tabs = tab?.closest('.ts-docs-tabs');
  if (tab === null || tab === undefined || tabs === null || tabs === undefined) return;
  event.preventDefault();
  selectTab(tabs, tabIndex(tab) + (event.key === 'ArrowRight' ? 1 : -1), true);
}
