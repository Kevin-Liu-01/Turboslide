import { cn } from './lib/cn';

import './StatusChip.css';

/**
 * The status chip left of Search (SPEC 6.1): `Saved · r412`, `Unsaved`, `Saving`, `Conflict`,
 * with the lease holder and the lint count after it when the studio passes them. A button, so
 * it opens the versions list; conflict is the one state that draws the ink frame (SPEC 2.2:
 * --pt-ink on a border only as a state). Presentational: the editor owns the autosave state.
 */
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'offline';

export type StatusChipProps = {
  revision: number;
  state: SaveState;
  /** another author's lease on the current slide */
  lease?: { holder: string; until: string } | null;
  /** the current slide's finding counts */
  lint?: { s3: number; s2: number; s1: number } | null;
  onClick?: () => void;
  className?: string;
};

const WORD: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  saving: 'Saving',
  conflict: 'Conflict',
  offline: 'Offline',
};

export function statusText(props: Pick<StatusChipProps, 'revision' | 'state'>): string {
  return props.state === 'saved' || props.state === 'conflict'
    ? `${WORD[props.state]} · r${props.revision}`
    : WORD[props.state];
}

export function StatusChip({ revision, state, lease, lint, onClick, className }: StatusChipProps) {
  const lintTotal = lint ? lint.s3 + lint.s2 + lint.s1 : 0;
  const parts = [statusText({ revision, state })];
  if (lease) parts.push(`lease ${lease.holder}`);
  if (lint && lintTotal > 0) parts.push(`${lintTotal} lint`);
  const description = [
    `${WORD[state]} at revision ${revision}`,
    lease ? `slide leased by ${lease.holder}` : null,
    lint && lintTotal > 0 ? `${lint.s3} must fix, ${lint.s2} should fix, ${lint.s1} polish` : null,
    'opens the versions list',
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <button
      type="button"
      className={cn('pt-ib ts-status', className)}
      data-state={state}
      title={description}
      aria-label={`Status: ${description}`}
      data-control="edit.status"
      onClick={onClick}
    >
      <i className="ts-status-dot" aria-hidden="true" />
      {parts.map((part, index) => (
        <span key={part} className={index === 0 ? 'ts-status-main' : 'ts-status-part'}>
          {index > 0 ? (
            <span className="ts-status-sep" aria-hidden="true">
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </button>
  );
}
