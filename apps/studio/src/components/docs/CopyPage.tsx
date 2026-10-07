import { Suspense, lazy, useRef, useState } from 'react';

import { Icon } from '@turboslide/chrome/icons';
import { tipProps } from '@turboslide/chrome/Tooltip';

const CopyPageMenu = lazy(() => import('./CopyPageMenu'));

/**
 * Copy Page (docs/POLISH-2.md 5.6, 5.7): a split button in the page's header. The button writes
 * the page's markdown twin to the clipboard through a `ClipboardItem` that holds the pending
 * fetch, so Safari accepts the write inside the click (General Translation's DocsPageActions.tsx
 * 145 to 155); the chevron opens the menu of the agents' addresses, a chunk loaded on its first
 * use. Both are 6 px controls.
 */
export function CopyPage({ twin, reference }: { twin: string; reference: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [open, setOpen] = useState(false);
  const chevron = useRef<HTMLButtonElement>(null);
  const copy = async (): Promise<void> => {
    const text = (): Promise<string> =>
      fetch(twin).then((response) => {
        if (!response.ok) throw new Error(`${twin} answered ${response.status}`);
        return response.text();
      });
    try {
      if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function')
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': text().then((value) => new Blob([value], { type: 'text/plain' })),
          }),
        ]);
      else await navigator.clipboard.writeText(await text());
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 2000);
  };
  return (
    <div className="ts-docs-copy" role="group" aria-label="Copy Page">
      <button
        type="button"
        className="pt-ib ts-docs-copy-main"
        data-control="docs.copyPage"
        onClick={() => void copy()}
        {...tipProps({ name: 'Copy Page', doc: 'Copies this page as markdown for an agent.' })}
      >
        <Icon name="clipboard" />
        <span className="ts-docs-swap" data-state={state}>
          <span className="is-idle">Copy Page</span>
          <span className="is-copied">Copied</span>
          <span className="is-failed">Copy Failed</span>
        </span>
      </button>
      <button
        ref={chevron}
        type="button"
        className="pt-ib pt-icon ts-docs-copy-more"
        data-control="docs.copyPage.menu"
        aria-label="More ways to read this page"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        {...tipProps({ name: 'More ways to read this page' })}
      >
        <Icon name="chevron-down" />
      </button>
      {open ? (
        <Suspense fallback={null}>
          <CopyPageMenu
            anchor={chevron}
            twin={twin}
            reference={reference}
            onClose={(refocus) => {
              setOpen(false);
              if (refocus) chevron.current?.focus();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
