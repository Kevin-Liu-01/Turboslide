import { describeMutation } from '@turboslide/schema/diff';
import type { Version } from '@turboslide/schema/mutations';

import { authorName } from './dispatch';
import { cn } from './lib/cn';
import { ToolButton } from './ToolButton';
import { formatWhen } from './VersionsPanel';

import './HistoryPanel.css';

/**
 * The mutation log (SPEC 6.5): every write entry newest first, each mutation in the prose of
 * `turboslide diff` (describeMutation), with author and time. Undo to here hands the entry to
 * the editor, which performs one forward write carrying the inverse mutations of every later
 * entry (SPEC 6.7: undo is a forward write, so the server log stays linear). The panel holds no
 * log of its own.
 */
export type HistoryPanelProps = {
  /** the log, oldest first, as the store returns it */
  entries: ReadonlyArray<Version>;
  onUndoTo?: (entry: Version) => void;
  /** how many mutations a row lists before folding the rest into a count */
  shown?: number;
  embedded?: boolean;
  className?: string;
};

export function HistoryPanel({
  entries,
  onUndoTo,
  shown = 3,
  embedded = false,
  className,
}: HistoryPanelProps) {
  const rows = [...entries].reverse();
  return (
    <div
      className={cn('ts-history', embedded && 'is-embedded', className)}
      data-count={entries.length}
    >
      {!embedded ? (
        <div className="ts-history-head">
          <b>History</b>
          <span>{entries.length} entries</span>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="ts-history-empty">No writes yet.</p>
      ) : (
        <ol className="ts-history-list">
          {rows.map((entry, index) => {
            const listed = entry.mutations.slice(0, shown);
            const more = entry.mutations.length - listed.length;
            return (
              <li key={entry.n} className="ts-history-row" data-revision={entry.revision}>
                <span className="ts-history-meta">
                  <span className="ts-history-rev">r{entry.revision}</span>
                  <span>{authorName(entry.author)}</span>
                  <span>{formatWhen(entry.createdAt)}</span>
                  {entry.note !== '' ? <span className="ts-history-note">{entry.note}</span> : null}
                </span>
                <ul className="ts-history-mutations">
                  {listed.map((mutation, i) => (
                    <li key={i}>{describeMutation(mutation)}</li>
                  ))}
                  {more > 0 ? <li className="ts-history-more">and {more} more</li> : null}
                  {entry.mutations.length === 0 ? (
                    <li className="ts-history-more">a named version, no change</li>
                  ) : null}
                </ul>
                {onUndoTo && index > 0 && entry.mutations.length > 0 ? (
                  <ToolButton
                    label="Undo to here"
                    title="Undo to here"
                    doc={`Undoes every write after revision ${entry.revision} as one forward write carrying the inverse mutations.`}
                    ariaLabel={`Undo to revision ${entry.revision}`}
                    className="ts-history-undo"
                    control={`history.undo.${entry.n}`}
                    onClick={() => onUndoTo(entry)}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
