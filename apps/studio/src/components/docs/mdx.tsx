import { Link } from '@tanstack/react-router';
import { Children, isValidElement, useId, useRef, useState } from 'react';
import type { CSSProperties, ComponentProps, ComponentType, ReactElement, ReactNode } from 'react';

import { FIGURE_SIZES } from '../../docs/figures';
import { calloutLabel, countsText, figureSource } from '../../docs/markdown';
import type { CountsProps } from '../../docs/markdown';
import type { DocsPage } from '../../docs/source';
import { KEEP, codeRuns } from '../site/code-runs';
import { Frame } from '../site/Frame';
import { SiteIcon } from '../site/SiteIcon';
import type { SiteIconName } from '../site/SiteIcon';

/**
 * The components a docs page's MDX draws, in the Workbench reference (docs/SITE.md section 6;
 * plan E.4): numbered section heads whose number in the gutter is the anchor, code on the #101010
 * panel with a head row (the language and Copy), inline code with no ground, callouts as a rule
 * with a solid icon and a capital label, steps and index rows on hairlines, tables with capital
 * heads over an edge rule, key chips and links. Each has its markdown form in src/docs/markdown.ts,
 * which the twins print (C27). Plain CSS in docs.css under `.ts-docs`.
 */

type MdxComponents = NonNullable<Parameters<DocsPage['data']['body']>[0]['components']>;

/** The router's `Link` with a plain string path: the docs' links are written in MDX, not typed. */
const UntypedLink = Link as unknown as ComponentType<{
  to: string;
  params?: Record<string, string>;
  hash?: string;
  className?: string;
  children?: ReactNode;
  activeOptions?: { exact: boolean; includeHash: boolean };
  'aria-current'?: 'page';
  'data-control'?: string;
  onClick?: () => void;
}>;

/**
 * A link to a page of this site through the router: active on its own address alone, so a docs
 * page never marks its parents (`/docs` is not current on `/docs/editor`).
 */
export function PathLink(props: Omit<ComponentProps<typeof UntypedLink>, 'activeOptions'>) {
  /* /docs is the front page, which the splat route draws; naming the path alone matched the
     layout route and made the router warn on every render */
  if (props.to === '/docs' || props.to === '/docs/')
    return (
      <UntypedLink
        {...props}
        to="/docs/$"
        params={{ _splat: '' }}
        activeOptions={{ exact: true, includeHash: false }}
      />
    );
  return <UntypedLink {...props} activeOptions={{ exact: true, includeHash: false }} />;
}

const CALLOUT_ICONS: Record<string, SiteIconName> = {
  note: 'information-circle',
  tip: 'light-bulb',
  warning: 'exclamation-triangle',
};

/** A callout: a 2 px ink rule on the left, its solid icon and its capital label, no ground. */
export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <aside className="ts-docs-callout" data-callout={type} role="note">
      <p className="ts-docs-callout-title t-label site-label">
        <SiteIcon name={CALLOUT_ICONS[type] ?? 'information-circle'} />
        {title ?? calloutLabel(type)}
      </p>
      <div className="ts-docs-callout-body">{children}</div>
    </aside>
  );
}

type StepProps = { title: string; children?: ReactNode; n?: number };

/** A step: a ruled row with its number in titanium and its title at 500. */
export function Step({ title, children, n }: StepProps) {
  return (
    <li className="ts-docs-step">
      <span className="ts-docs-step-n pt-num" aria-hidden="true">
        {n}
      </span>
      <div className="ts-docs-step-body">
        <p className="ts-docs-step-title">{title}</p>
        {children}
      </div>
    </li>
  );
}

function elements<P>(children: ReactNode): ReactElement<P>[] {
  return Children.toArray(children).filter((child): child is ReactElement<P> =>
    isValidElement(child),
  );
}

export function Steps({ children }: { children?: ReactNode }) {
  return (
    <ol className="ts-docs-steps">
      {elements<StepProps>(children).map((child, index) => (
        <Step key={index} {...child.props} n={index + 1} />
      ))}
    </ol>
  );
}

type TabProps = { title: string; children?: ReactNode };

/** A tab's content; Tabs reads its title and draws it in the tab list. */
export function Tab({ children }: TabProps) {
  return <>{children}</>;
}

export function Tabs({ children }: { children?: ReactNode }) {
  const tabs = elements<TabProps>(children);
  const [at, setAt] = useState(0);
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const select = (index: number): void => {
    const next = (index + tabs.length) % tabs.length;
    setAt(next);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div className="ts-docs-tabs">
      <div
        ref={list}
        className="ts-docs-tablist"
        role="tablist"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') select(at + 1);
          else if (event.key === 'ArrowLeft') select(at - 1);
          else return;
          event.preventDefault();
        }}
      >
        {tabs.map((tab, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            className="ts-docs-tab"
            aria-selected={index === at}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === at ? 0 : -1}
            onClick={() => setAt(index)}
          >
            {tab.props.title}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          className="ts-docs-tabpanel"
          hidden={index !== at}
        >
          {tab.props.children}
        </div>
      ))}
    </div>
  );
}

/**
 * An index row: a page's title and its description on a hairline (the front page's lists and
 * the agents page's ways in). `sub` indents a folder's page under its parent.
 */
export function Card({
  title,
  href,
  sub = false,
  children,
}: {
  title: string;
  href: string;
  sub?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className={sub ? 'is-sub' : undefined}>
      <DocsLink href={href} className="ts-docs-index-row">
        <span className="ts-docs-index-title">{title}</span>
        {children === undefined ? null : <div className="ts-docs-index-text">{children}</div>}
      </DocsLink>
    </li>
  );
}

export function Cards({ children }: { children?: ReactNode }) {
  return <ul className="ts-docs-index">{children}</ul>;
}

/**
 * A figure cut from a capture of the product (plan E.5): `<Figure name alt caption />` draws
 * /docs/figures/<name>-light.webp or -dark.webp after the page's appearance (one `<picture>` per
 * appearance, the other never fetched), the -390- cut at 720 px and under where one exists, at
 * its native size at most, in the square frame with corner crosses; a leader under it where the
 * capture names one; and "Figure N" (a CSS counter) before the caption. Its markdown form is the
 * light picture and the caption (src/docs/markdown.ts).
 */
export function Figure({ name, alt, caption }: { name: string; alt: string; caption: string }) {
  const size = FIGURE_SIZES[name];
  if (size === undefined) return null;
  const vars = {
    '--fig-w': `${size.width}px`,
    ...(size.phone === undefined ? {} : { '--fig-phone-w': `${size.phone.width}px` }),
    ...(size.leader === undefined
      ? {}
      : {
          '--fig-at': `${size.leader.at}%`,
          '--fig-phone-at': `${size.leader.phoneAt ?? size.leader.at}%`,
        }),
  } as CSSProperties;
  return (
    <figure className="ts-docs-fig" data-figure={name} style={vars}>
      <Frame className="ts-docs-fig-frame">
        {(['light', 'dark'] as const).map((appearance) => (
          <picture key={appearance} className={`site-pic is-${appearance}`}>
            {size.phone === undefined ? null : (
              <source
                media="(max-width: 720px)"
                srcSet={figureSource(name, appearance, true)}
                width={size.phone.width}
                height={size.phone.height}
              />
            )}
            <img
              src={figureSource(name, appearance, false)}
              width={size.width}
              height={size.height}
              alt={alt}
              loading="lazy"
              decoding="async"
            />
          </picture>
        ))}
      </Frame>
      {size.leader === undefined ? null : (
        <div className="ts-docs-leader" aria-hidden="true">
          <i />
          <span className="t-label">{size.leader.label}</span>
        </div>
      )}
      <figcaption className="t-small">
        <span className="t-label">
          Figure <span className="ts-docs-fig-n" />
        </span>
        {caption}
      </figcaption>
    </figure>
  );
}

/** The action reference's counts per transport, read from the contracts at generation (5.4). */
export function ActionCounts(props: CountsProps) {
  return (
    <p className="ts-docs-counts pt-num" data-control="docs.reference.counts">
      {countsText(props)}
    </p>
  );
}

/** A key chip: `<Kbd>Cmd</Kbd>`. */
export function Kbd({ children }: { children?: ReactNode }) {
  return <kbd className="pt-kbd">{children}</kbd>;
}

/** A link inside the docs: the router's for a page of this site, a new tab for another site. */
export function DocsLink({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children?: ReactNode;
}) {
  if (href === undefined) return <a className={className}>{children}</a>;
  if (href.startsWith('/') && !/\.(?:md|txt|json|xml)(?:$|[?#])/.test(href)) {
    const [path = '', hash] = href.split('#');
    return (
      <PathLink to={path} {...(hash === undefined ? {} : { hash })} className={className}>
        {children}
      </PathLink>
    );
  }
  if (/^https?:/.test(href))
    return (
      <a href={href} className={className} target="_blank" rel="noopener">
        {children}
      </a>
    );
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

/** The head row's name of a fence's language; a fence without one is Code. */
const LANGUAGES: Record<string, string> = {
  sh: 'Shell',
  bash: 'Shell',
  shell: 'Shell',
  js: 'JavaScript',
  ts: 'TypeScript',
  json: 'JSON',
};

/** The language a code block's fence names (`language-sh`), from the `code` inside its `pre`. */
function languageOf(children: ReactNode): string | undefined {
  if (!isValidElement<{ className?: string }>(children)) return undefined;
  return /(?:^|\s)language-([\w-]+)/.exec(children.props.className ?? '')?.[1];
}

/** The text of a code block as it was written, for Copy (the drawn lines carry no newline). */
function codeText(children: ReactNode): string {
  if (!isValidElement<{ children?: ReactNode }>(children)) return '';
  const inner = children.props.children;
  return typeof inner === 'string' ? inner.replace(/\n$/, '') : '';
}

/**
 * A code block: the #101010 panel in both appearances, square, with a 40 px head row that names
 * the language in capitals and holds Copy (4 px). Copy writes the code as written.
 */
function Pre(props: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const language = languageOf(props.children);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(codeText(props.children));
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
    window.setTimeout(() => setCopied('idle'), 2000);
  };
  return (
    <div className="ts-docs-code" data-language={language}>
      <div className="ts-docs-code-head">
        <span className="t-label">{LANGUAGES[language ?? ''] ?? 'Code'}</span>
        <button
          type="button"
          className="ts-docs-code-copy"
          data-control="docs.code.copy"
          aria-label="Copy the code"
          onClick={() => void copy()}
        >
          <span className="ts-docs-swap" data-state={copied}>
            <span className="is-idle">Copy</span>
            <span className="is-copied">Copied</span>
            <span className="is-failed">Copy Failed</span>
          </span>
        </button>
      </div>
      <pre {...props} className="pt-scroll-x" />
    </div>
  );
}

/**
 * Inline code (docs.css): no ground, in the platform monospace. Code of 24 characters or fewer, a
 * flag such as `--deck <dir>`, stays on one line; in longer code a flag stays with its value and
 * each other word of 24 characters or fewer stays whole (`codeRuns`), so a line never ends after
 * a flag's hyphens. A code block (its text ends in a newline) is drawn one line to a block, so a
 * narrow screen wraps a line under its own indent, between the same runs; a shell line that is
 * not the continuation of the line before it starts with the prompt, drawn by docs.css and never
 * copied.
 */
function Code(props: ComponentProps<'code'>) {
  const text = props.children;
  if (typeof text !== 'string') return <code {...props} />;
  if (text.includes('\n')) {
    const shell = /(?:^|\s)language-(?:sh|bash|shell)(?:\s|$)/.test(props.className ?? '');
    const lines = text.replace(/\n$/, '').split('\n');
    return (
      <code {...props}>
        {lines.map((line, at) => (
          <span
            key={at}
            className="ts-docs-ln"
            {...(shell && !(lines[at - 1] ?? '').endsWith('\\') ? { 'data-prompt': '' } : {})}
          >
            {line === ''
              ? '\u00a0'
              : codeRuns(line).map((run, i) =>
                  run.keep ? (
                    <span key={i} className="ts-docs-keep">
                      {run.text}
                    </span>
                  ) : (
                    run.text
                  ),
                )}
          </span>
        ))}
      </code>
    );
  }
  if (text.length <= KEEP)
    return <code {...props} className={`${props.className ?? ''} is-short`.trim()} />;
  return (
    <code {...props}>
      {codeRuns(text).map((run, at) =>
        run.keep ? (
          <span key={at} className="ts-docs-keep">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      )}
    </code>
  );
}

function Table(props: ComponentProps<'table'>) {
  return (
    <div className="ts-docs-table pt-scroll-x">
      <table {...props} />
    </div>
  );
}

/** A table's head cell: a capital label over the table's edge rule. */
function Th(props: ComponentProps<'th'>) {
  return <th {...props} className={`${props.className ?? ''} t-label`.trim()} />;
}

/** The text of a heading's children, for its anchor's name. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/**
 * A numbered section head (plan E.4): the h2 at the Head step, and after it its anchor, a link
 * whose number (a CSS counter, so the heading's text stays its title) sits in the gutter 16 px left
 * of the article, inline before the title under 1024 px.
 */
function H2({ id, children, ...rest }: ComponentProps<'h2'>) {
  return (
    <div className="ts-docs-sec">
      <h2 id={id} className="t-head" {...rest}>
        {children}
      </h2>
      {id === undefined ? null : (
        <a
          className="ts-docs-anchor pt-num"
          href={`#${id}`}
          aria-label={`Link to ${textOf(children)}`}
        />
      )}
    </div>
  );
}

function Anchor(props: ComponentProps<'a'>) {
  return (
    <DocsLink {...(props.href === undefined ? {} : { href: props.href })}>
      {props.children}
    </DocsLink>
  );
}

export const DOCS_COMPONENTS: MdxComponents = {
  a: Anchor as ComponentType<ComponentProps<'a'>>,
  h2: H2,
  pre: Pre,
  code: Code,
  table: Table,
  th: Th,
  Callout,
  Steps,
  Step,
  Tabs,
  Tab,
  Cards,
  Card,
  Kbd,
  ActionCounts,
  Figure,
};
