import { Link } from '@tanstack/react-router';
import { Children, isValidElement, useId, useRef, useState } from 'react';
import type { ComponentProps, ComponentType, ReactElement, ReactNode } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import type { IconName } from '@turboslide/chrome/icons';

import { calloutLabel, countsText } from '../../docs/markdown';
import type { CountsProps } from '../../docs/markdown';
import type { DocsPage } from '../../docs/source';

/**
 * The components a docs page's MDX draws (docs/POLISH-2.md 5.6): Callout, Steps, Tabs, Cards,
 * code with Copy, tables, key chips and links, on the chrome's tokens and the corner ladder. Each
 * has its markdown form in src/docs/markdown.ts, which the twins print (C27). Plain CSS in
 * docs.css under `.ts-docs`.
 */

type MdxComponents = NonNullable<Parameters<DocsPage['data']['body']>[0]['components']>;

/** The router's `Link` with a plain string path: the docs' links are written in MDX, not typed. */
const UntypedLink = Link as unknown as ComponentType<{
  to: string;
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
  return <UntypedLink {...props} activeOptions={{ exact: true, includeHash: false }} />;
}

const CALLOUT_ICONS: Record<string, IconName> = {
  note: 'information-circle',
  tip: 'light-bulb',
  warning: 'exclamation',
};

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
    <aside className="ts-docs-callout pt-window" data-callout={type} role="note">
      <span className="ts-docs-callout-mark" aria-hidden="true">
        <Icon name={CALLOUT_ICONS[type] ?? 'information-circle'} />
      </span>
      <div className="ts-docs-callout-body">
        <p className="ts-docs-callout-title">{title ?? calloutLabel(type)}</p>
        {children}
      </div>
    </aside>
  );
}

type StepProps = { title: string; children?: ReactNode; n?: number };

export function Step({ title, children, n }: StepProps) {
  return (
    <li className="ts-docs-step">
      <span className="ts-docs-step-n pt-kbd pt-num" aria-hidden="true">
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
            className={index === at ? 'pt-ib is-on' : 'pt-ib'}
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

export function Card({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children?: ReactNode;
}) {
  return (
    <li>
      <DocsLink href={href} className="ts-docs-card pt-window">
        <span className="ts-docs-card-title">{title}</span>
        {children === undefined ? null : <span className="ts-docs-card-text">{children}</span>}
      </DocsLink>
    </li>
  );
}

export function Cards({ children }: { children?: ReactNode }) {
  return <ul className="ts-docs-cards">{children}</ul>;
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

/** A code block with its Copy button (the pattern of ConnectCard.tsx). */
function Pre(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? '');
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
    window.setTimeout(() => setCopied('idle'), 2000);
  };
  return (
    <div className="ts-docs-code pt-window">
      <pre ref={ref} {...props} className="pt-scroll-x" />
      <button
        type="button"
        className="pt-ib ts-docs-code-copy"
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
  );
}

/**
 * Inline code (docs.css): code of 24 characters or fewer, a flag such as `--deck <dir>`, stays on
 * one line; in longer code each word of 24 characters or fewer stays whole, so a line never ends
 * after a flag's hyphens. A code block (its text ends in a newline) is left as it is.
 */
const KEEP = 24;

function Code(props: ComponentProps<'code'>) {
  const text = props.children;
  if (typeof text !== 'string' || text.includes('\n')) return <code {...props} />;
  if (text.length <= KEEP)
    return <code {...props} className={`${props.className ?? ''} is-short`.trim()} />;
  return (
    <code {...props}>
      {text.split(/(\s+)/).map((part, at) =>
        part !== '' && part.length <= KEEP && !/\s/.test(part) ? (
          <span key={at} className="ts-docs-keep">
            {part}
          </span>
        ) : (
          part
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

function Anchor(props: ComponentProps<'a'>) {
  return (
    <DocsLink {...(props.href === undefined ? {} : { href: props.href })}>
      {props.children}
    </DocsLink>
  );
}

export const DOCS_COMPONENTS: MdxComponents = {
  a: Anchor as ComponentType<ComponentProps<'a'>>,
  pre: Pre,
  code: Code,
  table: Table,
  Callout,
  Steps,
  Step,
  Tabs,
  Tab,
  Cards,
  Card,
  Kbd,
  ActionCounts,
};
