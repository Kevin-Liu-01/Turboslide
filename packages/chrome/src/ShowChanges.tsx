import type { CSSProperties } from 'react';

import type { Mutation } from '@turboslide/schema/mutations';
import type { EditorOverlayView } from '@turboslide/viewer/Editor';

import type { IdentityView, VersionDiffView } from './editor-shell';
import { cn } from './lib/cn';
import { IdentityChip } from './presence/IdentityChip';
import { diffBlocksOnSlide, hatchAngle, identityOfAuthor } from './versions-model';

import './ShowChanges.css';

/**
 * Show changes (gslides-parity SPEC-3 0.44, 5.7; research 11 6.9, 8 P13): the overlay of
 * `version.diff` between the selected version and its predecessor. Each changed block gets a
 * hatched plate (1 px hair lines at 45 degrees on a 6 px pitch, a 1 px ink outline) with the
 * author's 16 px chip at the block's top right outside the box; a second author hatches at 135
 * degrees, a third at 0, a fourth at 90, a fifth with a 25 percent Bayer field; an inserted block
 * has the outline at 2 px; a removed block whose box is still measured is a ghost with a strike;
 * a text edit underlines the changed run for an insert (2 px ink at the run box's bottom) and
 * strikes it for a delete. No hue: a version's authors have no session in the room. Everything is
 * absolute inside the overlay.
 */
export type ShowChangesProps = {
  view: EditorOverlayView;
  diff: VersionDiffView;
  identities?: Readonly<Record<string, IdentityView>>;
};

function place(box: readonly [number, number, number, number], k: number): CSSProperties {
  return { left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k };
}

/** The text edits of a diff on one slide: the run key, and whether the edit inserted or deleted. */
export function textEditsOf(
  mutations: ReadonlyArray<Mutation> | undefined,
  slideId: string,
): Array<{ key: string; kind: 'insert' | 'delete' | 'replace' }> {
  const out: Array<{ key: string; kind: 'insert' | 'delete' | 'replace' }> = [];
  for (const mutation of mutations ?? []) {
    if (!('slideId' in mutation) || mutation.slideId !== slideId) continue;
    if (mutation.op === 'text.splice') {
      const path = mutation.path.replace(/^\//, '');
      out.push({
        key: `${mutation.blockId}/${path}`,
        kind: mutation.insert === '' ? 'delete' : mutation.remove === 0 ? 'insert' : 'replace',
      });
    } else if (mutation.op === 'text.replace') {
      const path = mutation.path.replace(/^\//, '');
      out.push({ key: `${mutation.blockId}/${path}`, kind: 'replace' });
    }
  }
  return out;
}

export function ShowChanges({ view, diff, identities }: ShowChangesProps) {
  const { k, boxes } = view;
  const plates = diffBlocksOnSlide(diff, view.slideId);
  const edits = textEditsOf(diff.mutations, view.slideId);
  return (
    <>
      {plates.map(({ author, index, blockId, ops }) => {
        const box = boxes.blocks[blockId];
        const identity = identityOfAuthor(author, identities);
        const angle = hatchAngle(index);
        const removed = ops.includes('block.remove');
        const inserted = ops.includes('block.insert');
        if (!box) return null;
        return (
          <span
            key={`${index}:${blockId}`}
            className="ts-change-group"
            data-block={blockId}
            data-author={identity.principalId}
          >
            <span
              className={cn(
                'ts-change-plate',
                removed && 'is-removed',
                inserted && 'is-inserted',
                angle === 'bayer' && 'is-bayer',
              )}
              style={{
                ...place(box, k),
                ...(angle === 'bayer' ? {} : ({ '--ts-hatch': `${angle}deg` } as CSSProperties)),
              }}
              data-control="versions.change"
              aria-hidden="true"
            />
            <span
              className="ts-change-chip"
              style={{ left: (box[0] + box[2]) * k + 2, top: box[1] * k - 18 }}
            >
              <IdentityChip identity={identity} size={16} />
            </span>
          </span>
        );
      })}
      {edits.map(({ key, kind }) => {
        const box = boxes.runs[key];
        if (!box) return null;
        return (
          <span
            key={`edit:${key}:${kind}`}
            className={cn('ts-change-run', `is-${kind}`)}
            style={place(box, k)}
            data-control="versions.changeRun"
            data-kind={kind}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}
