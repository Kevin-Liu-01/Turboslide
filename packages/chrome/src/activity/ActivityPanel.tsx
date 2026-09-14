import { useEffect } from 'react';

import type { ActivityEventView, EditorActivity } from '../editor-shell';
import { cn } from '../lib/cn';
import { itemById } from '../menus/model';
import { ACTIVITY, stubClause } from '../menus/strings';
import { Panel } from '../Panel';
import { IdentityChip } from '../presence/IdentityChip';
import { shortTime } from '../comments/comments-model';
import { tipProps } from '../Tooltip';

import '../inbox/inbox.css';

/**
 * The Activity panel (gslides-parity SPEC-3 5.7, 0.45, 13.3; research 08 6.5): Tools > Activity
 * dashboard opens it over `activity.list`: version windows, comment events, share events,
 * requests, role changes, renames, restores, named versions, exports, imports and trash, merged
 * by time, one plain sentence per row with the actor's mark and a tabular time. Editors and the
 * owner read it, commenters when the owner allows. The Viewers tab is present and disabled with
 * its clause (Turboslide keeps no record of who viewed a presentation); the comment trend bar
 * does not ship this round.
 */
export type ActivityPanelProps = {
  activity: EditorActivity | undefined;
  onOpen?: (event: ActivityEventView) => void;
  onClose: () => void;
};

export function ActivityPanel({ activity, onOpen, onClose }: ActivityPanelProps) {
  const viewers = itemById('tools.activityDashboard.viewers');
  const events = activity?.events ?? [];
  const load = activity?.load;
  useEffect(() => {
    void load?.();
  }, [load]);
  return (
    <Panel
      title={ACTIVITY.panel}
      onClose={onClose}
      control="panel.activity"
      className="ts-activity-panel"
    >
      <div className="ts-activity-tabs" role="tablist" aria-label={ACTIVITY.panel}>
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="ts-dialog-tab is-on"
          data-control="panel.activity.tab.all"
          {...tipProps({
            name: ACTIVITY.panel,
            doc: 'Edits, comments, sharing, names and restores, by time',
          })}
        >
          {ACTIVITY.panel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          className="ts-dialog-tab is-stub"
          data-control="panel.activity.tab.viewers"
          data-menu-item={viewers.id}
          data-status="later"
          {...tipProps({ name: viewers.label, doc: stubClause(viewers.stubReason ?? '') })}
        >
          {viewers.label}
        </button>
      </div>
      {events.length === 0 ? (
        <p className="ts-panel-empty">{activity?.loading === true ? '' : ACTIVITY.empty}</p>
      ) : (
        <ul
          className="ts-activity-list"
          data-control="panel.activity.list"
          data-count={events.length}
        >
          {events.map((event) => (
            <li
              key={event.id}
              className={cn('ts-activity-row')}
              data-control={`panel.activity.event.${event.id}`}
              data-kind={event.kind}
            >
              <div
                className="ts-activity-row-in"
                role={
                  onOpen && (event.threadId !== undefined || event.slideId !== undefined)
                    ? 'button'
                    : undefined
                }
                tabIndex={
                  onOpen && (event.threadId !== undefined || event.slideId !== undefined)
                    ? 0
                    : undefined
                }
                {...tipProps({ name: event.summary, doc: `${ACTIVITY.panel}: ${event.kind}` })}
                onClick={onOpen ? () => onOpen(event) : undefined}
                onKeyDown={
                  onOpen
                    ? (keyEvent) => {
                        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                          keyEvent.preventDefault();
                          onOpen(event);
                        }
                      }
                    : undefined
                }
              >
                {event.actor ? (
                  <IdentityChip identity={event.actor} size={24} />
                ) : (
                  <span className="ts-chip is-blank" />
                )}
                <span className="ts-activity-sentence">{event.summary}</span>
                <time className="ts-activity-time" dateTime={event.at}>
                  {shortTime(event.at)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
