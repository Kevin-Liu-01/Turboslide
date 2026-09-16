import { useEffect, useMemo, useState } from 'react';

import type { BuildingBlock, BuildingBlockCategory } from '@turboslide/schema/building-blocks';
import {
  BUILDING_BLOCK_BOX,
  BUILDING_BLOCK_CATEGORIES,
  BUILDING_BLOCK_CATEGORY_LABELS,
} from '@turboslide/schema/building-blocks';
import type { ContentSlide, Deck } from '@turboslide/schema/deck';
import { LiveClone } from '@turboslide/viewer/LiveClone';
import type { Theme } from '@turboslide/viewer/theme';

import type { EditorDispatch } from '../dispatch';
import type { SlideRenderer } from '../LayoutGrid';
import { Panel } from '../Panel';
import { tipProps } from '../Tooltip';

import '../dialogs/import-dialogs.css';

/**
 * The Building blocks pane (gslides-parity SPEC-5 0.25, 4.5; MILESTONES-5 B3 day 7): Insert >
 * Building blocks and the sidebar strip open it. The nine categories in Google's order, each a
 * grid of tiles (`buildingBlock.list`); a tile draws the block's objects on a blank slide through
 * the route's renderer when the answer carries the blocks (b3.md request B3-14), the label on a
 * plate until then. A click runs one `buildingBlock.insert`, which lands the objects as one group
 * at the content box of the current slide, scaled with the page, and converts a slide that is not
 * a canvas first. The pane stays open, as Google's does.
 */
export type BuildingBlocksPaneProps = {
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  deck: Deck;
  render?: SlideRenderer;
  theme: Theme;
  onClose: () => void;
  onNotice?: (message: string) => void;
  busy?: boolean;
};

export const BUILDING_BLOCKS_PANE_TITLE = 'Building blocks';

type Row = Omit<BuildingBlock, 'blocks'> & { blocks?: BuildingBlock['blocks'] };

/** A blank canvas slide carrying one block's objects at the content box, for the tile. */
function previewSlide(row: Row): ContentSlide | null {
  if (row.blocks === undefined) return null;
  return {
    schemaVersion: 1,
    id: `preview-${row.id.replace('/', '-')}`,
    kind: 'content',
    layout: { type: 'freeform' },
    template: 'blank',
    slots: {
      main: row.blocks.map((block) => ({
        ...block,
        pos:
          block.pos === undefined
            ? undefined
            : { ...block.pos, x: 137 + block.pos.x, y: 129 + block.pos.y },
      })),
    },
  } as ContentSlide;
}

export function BuildingBlocksPane({
  slideId,
  revision,
  dispatch,
  deck,
  render,
  theme,
  onClose,
  onNotice,
  busy = false,
}: BuildingBlocksPaneProps) {
  const [rows, setRows] = useState<ReadonlyArray<Row> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    dispatch('buildingBlock.list', {})
      .then((answer) => {
        if (live) setRows((answer as { blocks: Row[] }).blocks);
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
      BUILDING_BLOCK_CATEGORIES.map((category: BuildingBlockCategory) => ({
        category,
        rows: (rows ?? []).filter((row) => row.category === category),
      })).filter((group) => group.rows.length > 0),
    [rows],
  );

  const thumbs = useMemo(() => {
    const out = new Map<string, string>();
    if (render === undefined || rows === null) return out;
    for (const row of rows) {
      const slide = previewSlide(row);
      if (slide === null) continue;
      try {
        out.set(row.id, render(slide, theme));
      } catch {
        // a block the renderer refuses draws as its label
      }
    }
    return out;
  }, [render, rows, theme]);
  void deck;

  const insert = (row: Row) => {
    if (pending !== null || busy) return;
    setPending(row.id);
    setError(null);
    dispatch('buildingBlock.insert', { slideId, id: row.id, baseRevision: revision })
      .then(() => onNotice?.(`${row.label} added`))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPending(null));
  };

  const control = 'panel.buildingBlocks';
  return (
    <Panel
      title={BUILDING_BLOCKS_PANE_TITLE}
      onClose={onClose}
      control={control}
      className="ts-building-blocks-pane"
    >
      <p className="ts-pane-lead">
        Ready made groups of objects, placed on the current slide. Drag them where you want after.
      </p>
      {rows === null && error === null ? <p className="ts-pane-empty">Loading…</p> : null}
      {groups.map((group) => (
        <section key={group.category} aria-labelledby={`${control}-${group.category}`}>
          <h3 id={`${control}-${group.category}`} className="ts-pane-category">
            {BUILDING_BLOCK_CATEGORY_LABELS[group.category]}
          </h3>
          <div className="ts-pane-tiles">
            {group.rows.map((row) => {
              const html = thumbs.get(row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  className="ts-pane-tile"
                  data-control={`${control}.block.${row.id.replace('/', '.')}`}
                  disabled={pending !== null || busy}
                  onClick={() => insert(row)}
                  {...tipProps({
                    name: row.label,
                    doc: `${Math.round(row.box[0])} by ${Math.round(row.box[1])} px of the ${BUILDING_BLOCK_BOX[0]} by ${BUILDING_BLOCK_BOX[1]} content box; click to add it to the slide`,
                  })}
                >
                  <span className="ts-pane-tile-frame" aria-hidden="true" data-theme={theme}>
                    {html === undefined ? (
                      <span className="ts-pane-tile-plate">{row.label}</span>
                    ) : (
                      <LiveClone html={html} theme={theme} frame={false} />
                    )}
                  </span>
                  <span className="ts-pane-tile-name">
                    {pending === row.id ? 'Adding' : row.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
