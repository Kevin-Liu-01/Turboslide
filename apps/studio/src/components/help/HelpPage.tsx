import { useRef } from 'react';
import type { ReactNode } from 'react';

import { buildKeyTable, tooltipKey } from '@turboslide/chrome/menus/keys';
import type { KeyBinding } from '@turboslide/chrome/menus/keys';

import { HomeFooter } from '../home/HomeFooter';
import { HomeNav } from '../home/HomeNav';
import { useMountEffect } from '../useMountEffect';
import { parseMarkdown, renderMarkdown } from './markdown';

import './help.css';

/**
 * The two help pages (gslides-parity SPEC-5 7.6, 0.40; P3 6.10; P1 5.12): `/help/training`
 * renders `docs/training.md` with the keyboard shortcuts generated from `keys.ts` appended,
 * `/help/updates` renders `docs/updates.md`. Both sit in the `/home` shell (its nav, its footer,
 * its tokens on the 1120 px rail), are prerendered at build and indexable, render a `main`
 * landmark with `data-page` and stamp `data-hydrated` once mounted, the marks the layout shift
 * audit and the perf check read. The documents carry no number without its source line (the
 * copy lints run on them in check step 35); the shortcuts table is data from the key table, so no
 * count is typed by hand.
 */
export type HelpPageProps = {
  /** `training` or `updates` */
  page: 'training' | 'updates';
  /** the markdown source, read at build through Vite's `?raw` import */
  source: string;
  /** append the keyboard shortcuts generated from keys.ts (the Training page) */
  shortcuts?: boolean;
};

/** The rows of the shortcuts table: the bound rows by group, Mac and Windows chords as words. */
export function shortcutRows(
  table: ReadonlyArray<KeyBinding> = buildKeyTable(),
): { group: string; label: string; mac: string; win: string }[] {
  return table
    .filter((binding) => binding.status === 'now' && binding.alias === undefined)
    .map((binding) => ({
      group: binding.group,
      label: binding.label,
      mac: tooltipKey(binding.key, 'mac') ?? binding.key.mac,
      win: tooltipKey(binding.key, 'win') ?? binding.key.win,
    }))
    .sort((a, b) => (a.group === b.group ? 0 : a.group < b.group ? -1 : 1));
}

function ShortcutsTable({ rows }: { rows: ReturnType<typeof shortcutRows> }) {
  const groups = [...new Set(rows.map((row) => row.group))];
  return (
    <section
      className="ts-help-shortcuts"
      data-control="help.shortcuts"
      aria-labelledby="keyboard-shortcuts"
    >
      <h2 id="keyboard-shortcuts" className="ts-help-h2">
        Keyboard shortcuts
      </h2>
      <p className="ts-help-p">
        The {rows.length} bound shortcuts of the editor, read from the key table
        (packages/chrome/src/menus/keys.ts) at build, grouped as the Keyboard shortcuts dialog
        groups them.
      </p>
      {groups.map((group) => (
        <div key={group} className="ts-help-table-wrap">
          <h3 className="ts-help-h3">{group}</h3>
          <table className="ts-help-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Mac</th>
                <th>Windows</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((row) => row.group === group)
                .map((row) => (
                  <tr key={`${group}:${row.label}`}>
                    <td>{row.label}</td>
                    <td>
                      <kbd>{row.mac}</kbd>
                    </td>
                    <td>
                      <kbd>{row.win}</kbd>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

export function HelpPage({ page, source, shortcuts = false }: HelpPageProps) {
  const root = useRef<HTMLElement>(null);
  useMountEffect(() => {
    root.current?.setAttribute('data-hydrated', '');
  });
  const blocks = parseMarkdown(source);
  const body: ReactNode[] = renderMarkdown(blocks);
  return (
    <main ref={root} className="ts-product ts-help" data-page={`help-${page}`}>
      <HomeNav />
      <article className="ts-product-rail ts-help-article" data-control={`help.${page}`}>
        {body}
        {shortcuts ? <ShortcutsTable rows={shortcutRows()} /> : null}
      </article>
      <HomeFooter />
    </main>
  );
}
