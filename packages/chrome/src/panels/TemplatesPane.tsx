import { useEffect, useMemo, useState } from 'react';

import type { TemplateIndexEntry } from '@turboslide/schema/building-blocks';
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABELS } from '@turboslide/schema/building-blocks';
import type { SlideKind } from '@turboslide/schema/deck';
import { sectionOfSlide } from '@turboslide/schema/deck';

import type { EditorDispatch } from '../dispatch';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { Panel } from '../Panel';
import { tipProps } from '../Tooltip';

import '../dialogs/import-dialogs.css';

/**
 * The Templates pane (gslides-parity SPEC-5 0.22, 4.4; MILESTONES-5 B3 day 7): Insert > Templates
 * and the sidebar strip open it in the right slot. Step 1 lists the template index by the
 * gallery's three headings (`template.list`); step 2 lists one template's slides with All, None
 * and Back (`template.slides`), and Insert runs one `slide.import` with `sourceTemplateId` and the
 * chosen ids after the current slide, so the copies land in one write with their assets. The
 * pane stays open after an insert, as Google's does. The labels are Google's (`unverified: true`
 * per R02 b.1); the actions run on the CLI and the MCP server alike.
 */
export type TemplatesPaneProps = {
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  /** the deck, for the current slide's section */
  deck: Parameters<typeof sectionOfSlide>[0];
  onClose: () => void;
  onNotice?: (message: string) => void;
  busy?: boolean;
};

type TemplateSlideRow = { index: number; slideId: string; title: string; kind: SlideKind };

export const TEMPLATES_PANE_TITLE = 'Templates';

const KIND_ICONS: Record<SlideKind, 'slide' | 'photo' | 'document' | 'text'> = {
  title: 'slide',
  statement: 'text',
  content: 'document',
  opener: 'photo',
  mood: 'photo',
  closing: 'photo',
};

export function TemplatesPane({
  slideId,
  revision,
  dispatch,
  deck,
  onClose,
  onNotice,
  busy = false,
}: TemplatesPaneProps) {
  const [rows, setRows] = useState<ReadonlyArray<TemplateIndexEntry> | null>(null);
  const [current, setCurrent] = useState<{ id: string; slides: TemplateSlideRow[] } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    dispatch('template.list', {})
      .then((answer) => {
        if (live) setRows((answer as { templates: TemplateIndexEntry[] }).templates);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [dispatch]);

  const groups = useMemo(
    () =>
      TEMPLATE_CATEGORIES.map((category) => ({
        category,
        rows: (rows ?? []).filter((row) => row.category === category),
      })).filter((group) => group.rows.length > 0),
    [rows],
  );

  const open = (id: string) => {
    setPending(true);
    setError(null);
    dispatch('template.slides', { id })
      .then((answer) => {
        const slides = (answer as { slides: TemplateSlideRow[] }).slides;
        setCurrent({ id, slides });
        setPicked(new Set(slides.map((row) => row.slideId)));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPending(false));
  };

  const insert = () => {
    if (current === null || picked.size === 0 || pending || busy) return;
    const slideIds = current.slides
      .filter((row) => picked.has(row.slideId))
      .map((row) => row.slideId);
    const section = sectionOfSlide(deck, slideId);
    setPending(true);
    setError(null);
    dispatch('slide.import', {
      sourceTemplateId: current.id,
      slideIds,
      after: slideId,
      ...(section === undefined ? {} : { sectionId: section.id }),
      baseRevision: revision,
    })
      .then(() =>
        onNotice?.(
          `Inserted ${slideIds.length} slide${slideIds.length === 1 ? '' : 's'} from ${rows?.find((row) => row.id === current.id)?.name ?? current.id}`,
        ),
      )
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPending(false));
  };

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const control = 'panel.templates';
  return (
    <Panel
      title={TEMPLATES_PANE_TITLE}
      onClose={onClose}
      control={control}
      className="ts-templates-pane"
    >
      {current === null ? (
        <>
          <p className="ts-pane-lead">Slides from a template, inserted after the current slide.</p>
          {rows === null && error === null ? <p className="ts-pane-empty">Loading…</p> : null}
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`${control}-${group.category}`}>
              <h3 id={`${control}-${group.category}`} className="ts-pane-category">
                {TEMPLATE_CATEGORY_LABELS[group.category]}
              </h3>
              <ul className="ts-pane-list">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="ts-pane-row"
                      data-control={`${control}.template.${row.id}`}
                      disabled={pending}
                      onClick={() => open(row.id)}
                      {...tipProps({
                        name: row.name,
                        doc:
                          row.description ??
                          `${row.slides} slides; click to pick the slides to insert`,
                      })}
                    >
                      <span className="ts-pane-row-name">{row.name}</span>
                      <span className="ts-pane-row-count">{row.slides}</span>
                      {row.useCases !== undefined && row.useCases.length > 0 ? (
                        <span className="ts-pane-row-meta">{row.useCases.join(', ')}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <>
          <div className="ts-pane-head">
            <h3>{rows?.find((row) => row.id === current.id)?.name ?? current.id}</h3>
            <span>
              <button
                type="button"
                className="pt-ib is-text"
                data-control={`${control}.all`}
                onClick={() => setPicked(new Set(current.slides.map((row) => row.slideId)))}
                {...tipProps({ name: 'All', doc: 'Selects every slide' })}
              >
                <span className="pt-lb">All</span>
              </button>
              <button
                type="button"
                className="pt-ib is-text"
                data-control={`${control}.none`}
                onClick={() => setPicked(new Set())}
                {...tipProps({ name: 'None', doc: 'Clears the selection' })}
              >
                <span className="pt-lb">None</span>
              </button>
            </span>
          </div>
          <div
            className="ts-pane-slides"
            role="listbox"
            aria-label="Slides"
            aria-multiselectable="true"
          >
            {current.slides.map((row) => (
              <button
                key={row.slideId}
                type="button"
                role="option"
                aria-selected={picked.has(row.slideId)}
                className={cn('ts-pane-slide', picked.has(row.slideId) && 'is-on')}
                data-control={`${control}.slide.${row.slideId}`}
                onClick={() => toggle(row.slideId)}
                {...tipProps({
                  name: row.title,
                  doc: picked.has(row.slideId)
                    ? 'Selected; click to leave it out'
                    : 'Click to select',
                })}
              >
                <span className="ts-pane-slide-n">{row.index}</span>
                <span>
                  <Icon name={KIND_ICONS[row.kind]} size={14} /> {row.title}
                </span>
              </button>
            ))}
          </div>
          <div className="ts-pane-actions">
            <button
              type="button"
              className="pt-ib is-text"
              data-control={`${control}.back`}
              onClick={() => setCurrent(null)}
              {...tipProps({ name: 'Back', doc: 'Back to the template list' })}
            >
              <span className="pt-lb">Back</span>
            </button>
            <button
              type="button"
              className="pt-ib is-primary"
              data-control={`${control}.insert`}
              disabled={pending || busy || picked.size === 0}
              onClick={insert}
              {...tipProps({
                name: 'Insert',
                doc: 'Copies the selected slides after the current slide',
              })}
            >
              <span className="pt-lb">Insert</span>
            </button>
          </div>
        </>
      )}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
