import type { DeckDocument } from '@turboslide/schema/deck';

import type { InboxItemView } from '../editor-shell';
import { INBOX } from '../menus/strings';
import { nameOf } from '../presence/IdentityChip';
import { slideNumberOf } from '../presence/presence-model';

/**
 * The inbox's pure rules (gslides-parity SPEC-3 5.5; research 08 5.2, 5.3): one sentence per
 * record from its kind, its actors and its slide ("Maya replied on slide 4"; two actors read
 * "Maya and Kai"; three or more "Maya and 2 others"), the unread count, and the order (newest
 * first). No React, no DOM.
 */
export function actorsWords(item: Pick<InboxItemView, 'actors'>): string {
  const names = item.actors.map(nameOf);
  if (names.length === 0) return 'Someone';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/** The one sentence of a row. */
export function inboxSentence(item: InboxItemView, document: DeckDocument): string {
  const who = actorsWords(item);
  const n = slideNumberOf(document, item.slideId) ?? 0;
  switch (item.kind) {
    case 'mention':
      return INBOX.mentioned(who, n);
    case 'reply':
      return INBOX.replied(who, n);
    case 'assigned':
      return INBOX.assigned(who, n);
    case 'resolved':
      return INBOX.resolved(who, n);
    case 'reopened':
      return INBOX.reopened(who, n);
    case 'reaction':
      return INBOX.reacted(who, n);
    case 'comment':
      return INBOX.commented(who, n);
    case 'accessRequest':
      return INBOX.accessRequest(who);
    case 'granted':
      return INBOX.granted(who);
    case 'versionNamed':
      return INBOX.versionNamed(who, '');
  }
}

/** The rows newest first by their last update. */
export function sortInbox(items: readonly InboxItemView[]): InboxItemView[] {
  return [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** The unread rows. */
export function unreadOf(items: readonly InboxItemView[]): InboxItemView[] {
  return items.filter((item) => item.readAt === undefined);
}
