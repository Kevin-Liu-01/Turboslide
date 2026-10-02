import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useEditorShell } from './editor-shell-context';
import type {
  EditorPresence,
  IdentityView,
  LinkComponent,
  PresenceParticipant,
} from './editor-shell';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { tooltipKey } from './menus/keys';
import { findItem, isPresent, itemById } from './menus/model';
import type { MenuItem } from './menus/model';
import { TITLE_ROW } from './menus/strings';
import { NamePromptPlate } from './dialogs/NamePrompt';
import { AccountMenu } from './presence/AccountMenu';
import { nameOf } from './presence/IdentityChip';
import { meOf, viewerFactsOf } from './presence/presence-model';
import { PresenceSlot } from './presence/PresenceSlot';
import { RosterMenu } from './presence/RosterMenu';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';
import { TurboslideMark } from './TurboslideMark';

import './TitleRow.css';

/**
 * The title row (gslides-parity SPEC 1.1, 2.0; SPEC-3 4.2, 0.43, 9.3; SPEC-4 0.16, 1.10): 44 px,
 * full width. Left: the Turboslide mark (24 px, solid) as a link to /decks through the router's
 * `Link` the studio passes as `linkComponent` (a plain anchor when the input has none), with the
 * `title.appIcon` label and tooltip and `data-control="title.home"` so the parity audit and the
 * perf check find it; the title field (click to rename, Enter commits, Esc restores,
 * one deck.rename), the save words with the cloud glyph in one fixed cell (five phrases,
 * aria-live), the Last edit clock that opens Version history and names the newest record's author
 * through the identity the route resolved, with a 6 px dot when a record landed since this tab
 * loaded. Right, in fixed slots that exist from the first paint (0.43): the presence slot (184 px:
 * four chips, the `+N` chip drawn empty, a hair rule, the own chip), the Show all comments glyph
 * (a toggle), the inbox plate (a glyph and a two digit count, present at zero; its slot collapses
 * while the plate is parked, docs/RETURN.md 4.3), the Slideshow split button as one control (the
 * one solid button of the row, RETURN.md 4.1), Share with a 6 px dot when an access request is
 * pending. No star, folder, Meet, Record or Gemini (SPEC 2.0). In compact mode a Show the menus
 * chevron sits at the far right. The row's width never changes when a person joins or a count
 * moves (05 rule 4). New in Turboslide (no Prototemplate source).
 *
 * The product round (docs/PRODUCT.md section 2 ranks 25 and 30, section 3.6): the side panel
 * toggle the bottom bar held sits beside the comments glyph (`title.sidePanel`, the bar itself
 * left and the stage gained its 32 px); the save words stay hidden on a fresh draft until the
 * first edit, so a seller never reads Not saved yet before typing; the presence slot carries a
 * tooltip (PresenceSlot.tsx).
 *
 * Round 1 of the next program (docs/NEXT.md 4.1.3 item 13; audit-brand-surfaces ranks 3 and 4;
 * audit-clutter 80 to 82): one status phrase. A draft nobody edited shows no Last edit words; after
 * a write the words read "Last edit 2 minutes ago" with the author in their tooltip, and the save
 * words show only while they differ from All changes saved (they stay in the cell for screen
 * readers and the walk's readers). The name prompt floats under the row (TitleRow.css), so the
 * deck name keeps its width while it shows. Sign In is a text button after Share for a visitor
 * the deployment can sign in. Under 480 px the deck name keeps 96 px and the presence slot,
 * Assist, the comments and side panel glyphs, the inbox, Sign In and the Slideshow arrow fold into
 * one More key, whose Collaborators row opens the roster at the key.
 */

/** "2 minutes ago" from an ISO time and now. */
export function timeAgo(iso: string | undefined, now: number = Date.now()): string | null {
  if (iso === undefined) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The save words of SPEC 2.0 and SPEC-3 15 for a state: six phrases in one cell. `offline` is
 * the room client's word and wins (b1 R46); `reconnecting` is the stream's or the store's
 * (EditorSync.streamDown, EditorSync.storeDegraded) and shows once every write is acknowledged:
 * a write in flight keeps Saving, its refusal keeps the retry word, and the word replaces "All
 * changes saved" alone (the focus round, cycle 3 stream fix round, C3-F1: a seller never reads
 * Saving for a stream problem, and never reads All changes saved while the tab is cut off).
 */
export function saveWords(
  state: string,
  draft: boolean,
  offline = false,
  reconnecting = false,
): string {
  if (draft && state === 'saved') return TITLE_ROW.notSaved;
  if (offline || state === 'offline') return TITLE_ROW.offline;
  switch (state) {
    case 'saving':
    case 'unsaved':
      return TITLE_ROW.saving;
    case 'conflict':
      return TITLE_ROW.retrying;
    default:
      return reconnecting ? TITLE_ROW.reconnecting : TITLE_ROW.saved;
  }
}

/**
 * The Last edit words (SPEC-3 4.2): the newest record's author through the resolved identity,
 * never the tab's own author; the round one label when the route passed no identity.
 */
export function lastEditWords(
  ago: string | null,
  editor: IdentityView | undefined,
  legacyName: string | undefined,
): string {
  if (ago === null) return 'Last edit';
  if (editor !== undefined) return TITLE_ROW.lastEditBy(ago, nameOf(editor));
  if (legacyName !== undefined && legacyName !== 'studio')
    return TITLE_ROW.lastEditBy(ago, legacyName);
  return TITLE_ROW.lastEdit(ago);
}

function TitleField() {
  const shell = useEditorShell();
  const { input } = shell;
  const title = input.document.deck.title;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const item = itemById('title.name');
  const canRename = isPresent(item, shell.menuContext);
  /* the field mounted last: the whole name is selected once, when the input appears, and never
     again on a re-render, or every keystroke would replace the selected text (VERIFICATION 9.5) */
  const mounted = useRef<HTMLInputElement | null>(null);
  const registerField = (el: HTMLInputElement | null) => {
    shell.registerTitleField(el);
    if (el === null || el === mounted.current) return;
    mounted.current = el;
    el.focus();
    el.select();
  };

  const open = () => {
    if (!canRename) return;
    setValue(title);
    setEditing(true);
  };
  const close = () => setEditing(false);
  const commit = () => {
    const name = value.trim();
    close();
    if (name === '' || name === title) return;
    input
      .dispatch('deck.rename', { name, baseRevision: input.revision })
      .catch((error: unknown) => shell.say(error instanceof Error ? error.message : String(error)));
  };
  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  const fieldTip = tipProps({
    name: 'Rename',
    doc: 'Enter keeps the name and Esc restores it',
    key: 'Enter',
  });

  if (editing) {
    return (
      <input
        ref={registerField}
        className="ts-title-field"
        type="text"
        value={value}
        aria-label="Presentation title"
        data-control="deck.name"
        spellCheck={false}
        autoComplete="off"
        {...fieldTip}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          fieldTip.onKeyDown(event);
          onKey(event);
        }}
        onBlur={(event) => {
          fieldTip.onBlur(event);
          commit();
        }}
      />
    );
  }
  const shown = title === '' ? TITLE_ROW.untitled : title;
  /* a role without `rename` (SPEC-3 13.4: a commenter, a viewer) reads the name as text, the way
     Google shows it: no button, no Rename row, nothing registered as the title field
     (VERIFICATION-3 finding 10) */
  if (!canRename) {
    return (
      <span
        className="ts-title-name is-readonly"
        data-control="deck.name"
        {...tipProps({ name: shown, doc: 'The title of this presentation' })}
      >
        {shown}
      </span>
    );
  }
  return (
    <button
      ref={shell.registerTitleField}
      type="button"
      className="ts-title-name"
      aria-label="Presentation title"
      data-control="deck.name"
      data-menu-item={item.id}
      onClick={open}
      {...tipProps({ name: item.label, doc: item.doc })}
    >
      {shown}
    </button>
  );
}

/** The longest of the six phrases: the cell is as wide as this one so nothing to its right moves (05 rule 4); the clock sits to its left since 2026-09-25. */
/** How long a stream stays down before the row says Reconnecting (item 100). */
export const RECONNECTING_GRACE_MS = 3000;

const LONGEST_SAVE_WORDS = [
  TITLE_ROW.saved,
  TITLE_ROW.saving,
  TITLE_ROW.retrying,
  TITLE_ROW.offline,
  TITLE_ROW.notSaved,
  TITLE_ROW.reconnecting,
].reduce((a, b) => (b.length > a.length ? b : a));

function SaveState() {
  const shell = useEditorShell();
  const save = shell.input.save ?? { state: 'saved' as const };
  /* offline is the room client's word (it sets `offline` after a failed reconnect); a stream that
     has not connected yet (the server render, the first frames after hydration) is not offline,
     or the server would paint the long sentence and the row would move when the stream connects
     (VERIFICATION-3 finding 26: the clock slot moved 158 px left after hydration) */
  const offline = shell.input.sync?.offline === true;
  /* the stream is down and the client is reopening it (C3-F1; R46): Reconnecting once every
     write is acknowledged and the stream has been down for a few seconds (docs/POLISH.md item
     100: a busy store on a connected tab shows no word, its pulse backs off silently; a stream
     that reopens within the grace shows none either) */
  const streamDown = shell.input.sync?.streamDown === true;
  const [downForAWhile, setDownForAWhile] = useState(false);
  useEffect(() => {
    if (!streamDown) {
      setDownForAWhile(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setDownForAWhile(true), RECONNECTING_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [streamDown]);
  const reconnecting = !offline && streamDown && downForAWhile;
  const words = saveWords(save.state, save.draft === true, offline, reconnecting);
  const item = itemById('title.saveState');
  /* Google shows a viewer and a commenter no save words: the cell is absent below `write`
     (SPEC-3 13.4; VERIFICATION-3 finding 10) */
  if (!isPresent(item, shell.menuContext)) return null;
  const busy = save.state === 'saving' || save.state === 'unsaved';
  const icon = busy ? 'cloud-arrow-up' : 'cloud';
  /* a fresh draft that nothing has written yet (docs/PRODUCT.md section 2 rank 30; audit-seller
     32): the cell keeps its width so the clock never moves, and its words wait for the first edit */
  const untouched = save.draft === true && save.state === 'saved' && !offline && !reconnecting;
  return (
    <button
      type="button"
      className={cn(
        'ts-title-save',
        save.state !== 'saved' && 'is-busy',
        offline && 'is-offline',
        words === TITLE_ROW.reconnecting && 'is-reconnecting',
        untouched && 'is-untouched',
      )}
      data-control="deck.saveState"
      data-menu-item={item.id}
      data-state={
        offline ? 'offline' : words === TITLE_ROW.reconnecting ? 'reconnecting' : save.state
      }
      aria-hidden={untouched ? true : undefined}
      tabIndex={untouched ? -1 : undefined}
      onClick={() => shell.runItem(item)}
      {...tipProps({ name: words, doc: item.doc })}
    >
      <Icon name={icon} />
      <span className="ts-title-save-words" data-longest={LONGEST_SAVE_WORDS}>
        <span className="ts-title-save-live" aria-live="polite">
          {untouched ? '' : words}
        </span>
      </span>
    </button>
  );
}

function LastEdit() {
  const shell = useEditorShell();
  const save = shell.input.save;
  /* a draft is a deck nobody edited yet (/new before its first write; the route passes the
     draft's `updatedAt`, the time /new built it, as `lastEditAt`, which read "Last edit just now"
     on a fresh /new: audit-clutter 80): no words until the first write */
  const ago =
    save?.draft === true ? null : timeAgo(save?.lastEditAt ?? shell.input.document.deck.updatedAt);
  const item = itemById('title.lastEdit');
  /* the tooltip and the accessible name name the author; the words beside the clock do not, so
     the row reads one short phrase (NEXT.md 4.1.3 item 13) */
  const full = lastEditWords(ago, save?.lastEditor, save?.lastEditBy);
  const words = ago === null ? '' : TITLE_ROW.lastEdit(ago);
  const changed = save?.changedSinceOpen === true;
  return (
    <span
      className={cn('ts-title-clock-slot', changed && 'has-dot')}
      data-control="deck.lastEdit.slot"
    >
      <ToolButton
        icon="clock"
        title={full}
        doc={
          changed ? `${item.doc ?? ''}. Changed since you opened it`.replace(/^\. /, '') : item.doc
        }
        ariaLabel={full}
        pressed={shell.panel === 'versionHistory'}
        quiet
        className="ts-title-clock"
        control="deck.lastEdit"
        menuItem={item.id}
        onClick={() => shell.runItem(item)}
      />
      {/* the words beside the clock from 1280 px up (docs/POLISH.md item 92): a seller read
          them in the tooltip alone. A click on the words opens Version history as the clock does
          (Google's "Last edit was 2 minutes ago" is the link): the polish round's fix round read
          a click on the words opening nothing */}
      <span
        className="ts-title-clock-words"
        data-control="deck.lastEdit.words"
        aria-hidden="true"
        onClick={() => shell.runItem(item)}
        {...(words === '' ? {} : tipProps({ name: full, doc: item.doc }))}
      >
        {words}
      </span>
      <i className="ts-title-dot" aria-hidden="true" />
    </span>
  );
}

/** The id of the Presentation options menu; the chevron names it in `aria-controls` while it is mounted. */
export const SLIDESHOW_MENU_ID = 'ts-menu-slideshow';

/**
 * The Slideshow split button as one control (docs/RETURN.md 4.1; return/audit-chrome.md 5a): a
 * `group` labelled Slideshow around two buttons. The label half presents from the current slide
 * and ArrowDown on it opens the options menu with the first row focused, as on the chevron; the
 * chevron half is the menu button of the ARIA pattern (`aria-haspopup`, `aria-expanded`, and
 * `aria-controls` only while the menu is mounted, because a closed chevron would otherwise name
 * an id that is not in the document). The menu hangs under the whole control, its right edge on
 * the control's right edge (Google drops it under the control's right edge; `align="end"`), and
 * Escape or Tab returns focus to the half that opened it. Enter and Space on each half do what
 * the click does: the shell's `key.commit` binding swallows a bare Enter only while a crop is
 * open (EditorShell.tsx), so the browser's activation reaches the focused button.
 */
function Slideshow() {
  const shell = useEditorShell();
  const item = itemById('title.slideshow');
  const [openedBy, setOpenedBy] = useState<'label' | 'arrow' | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLButtonElement>(null);
  const arrow = useRef<HTMLButtonElement>(null);
  const key = tooltipKey(item.key, shell.platform);
  const children: ReadonlyArray<MenuItem> = item.items ?? [];
  const open = openedBy !== null;
  const labelTip = tipProps({
    name: TITLE_ROW.slideshow,
    doc: 'Presents from the current slide; the Down arrow opens the options',
    ...(key === undefined ? {} : { key }),
  });
  return (
    <span
      ref={box}
      className="ts-title-slideshow"
      role="group"
      aria-label={TITLE_ROW.slideshow}
      data-control="present.split"
    >
      <button
        ref={label}
        type="button"
        className="pt-ib is-solid ts-title-present"
        data-control="present.open"
        data-menu-item={item.id}
        onClick={() => shell.runItem(item)}
        {...labelTip}
        onKeyDown={(event) => {
          labelTip.onKeyDown(event);
          if (event.key !== 'ArrowDown' || event.altKey || event.metaKey || event.ctrlKey) return;
          event.preventDefault();
          setOpenedBy('label');
        }}
      >
        <Icon name="play" />
        <span className="pt-lb">{TITLE_ROW.slideshow}</span>
      </button>
      <button
        ref={arrow}
        type="button"
        className="pt-ib is-solid ts-title-present-arrow"
        aria-label="Presentation options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? SLIDESHOW_MENU_ID : undefined}
        data-control="present.arrow"
        onClick={() => setOpenedBy((on) => (on === null ? 'arrow' : null))}
        {...tipProps({
          name: 'Presentation options',
          doc: 'Presenter view and Start from beginning',
        })}
      >
        <Icon name="chevron-down" />
      </button>
      {open && box.current ? (
        <Menu
          items={children}
          context={shell.menuContext}
          label="Presentation options"
          anchor={{ kind: 'element', element: box.current }}
          placement="below"
          align="end"
          returnFocusTo={openedBy === 'label' ? label.current : arrow.current}
          onSelect={(chosen) => shell.runItem(chosen)}
          onClose={() => setOpenedBy(null)}
          id={SLIDESHOW_MENU_ID}
        />
      ) : null}
    </span>
  );
}

/** The inbox plate (SPEC-3 5.5, 9.3): a glyph and a two digit tabular count, present at zero, "99+" beyond. */
function InboxPlate() {
  const shell = useEditorShell();
  const item = itemById('title.inbox');
  const unread = shell.input.inbox?.unread ?? 0;
  const count = TITLE_ROW.unread(unread);
  const name =
    unread === 0
      ? TITLE_ROW.notifications
      : `${TITLE_ROW.notifications}, ${unread === 1 ? '1 unread' : `${count} unread`}`;
  return (
    <button
      type="button"
      className={cn(
        'ts-title-inbox',
        shell.panel === 'inbox' && 'is-on',
        unread > 0 && 'has-unread',
      )}
      data-control="title.inbox"
      data-menu-item={item.id}
      data-unread={unread}
      aria-label={name}
      aria-pressed={shell.panel === 'inbox'}
      onClick={() => shell.runItem(item)}
      {...tipProps({ name: TITLE_ROW.notifications, doc: item.doc ?? '' })}
    >
      <Icon name="bell" />
      <span className="ts-title-inbox-count" aria-hidden="true">
        {unread > 0 ? count : ''}
      </span>
    </button>
  );
}

/**
 * Sign In as text (NEXT.md 4.1.2, B's graft; 4.1.3 item 13): a quiet text button after Share for
 * a visitor the deployment can sign in (`title.account.signIn`'s `canSignIn`), Title Case as every
 * button is (DECK-GRAMMAR 22). It opens the dialog the account menu's Sign in row opens. Absent
 * on a deployment that offers no method and for a signed in person. Under 480 px it leaves the
 * row and its row is in More.
 */
/**
 * The title row's Sign In item: B3a's `title.signIn` (round1/build/b3a.md request 5, landed with
 * B3a#8) once the model holds it, else the account menu's own Sign in row, which opens the same
 * dialog under the same `canSignIn` predicate.
 */
export function titleSignInItem(): MenuItem {
  return findItem('title.signIn') ?? itemById('title.account.signIn');
}

function TitleSignIn() {
  const shell = useEditorShell();
  const item = titleSignInItem();
  if (!isPresent(item, shell.menuContext)) return null;
  return (
    <button
      type="button"
      className="pt-ib is-text ts-title-signin"
      data-control="title.signIn"
      data-menu-item={item.id}
      onClick={() => shell.runItem(item)}
      {...tipProps({ name: 'Sign In', doc: item.doc ?? '' })}
    >
      <span className="pt-lb">Sign In</span>
    </button>
  );
}

/** The id of the More key's menu; the key names it in `aria-controls` while it is mounted. */
export const TITLE_MORE_MENU_ID = 'ts-menu-title-more';

/** The roster's row in More: the presence slot's label, opening the roster at the key. */
const ROSTER_ROW_ID = 'title.presence';

/**
 * The rows the More key holds under 480 px, in the order they read: the controls the row folds
 * (Assist, Show all comments, the side panel toggle, Collaborators, Notifications), the two rows of
 * the Slideshow arrow, then Sign in. Each is the model's own item, so the labels, the keys, the
 * tooltips and the `when` predicates are the ones the row's controls read; a row the context does
 * not offer is absent (`Menu` filters with `isPresent`).
 */
export function titleMoreItems(panel: string | null): MenuItem[] {
  const side = itemById('title.sidePanel');
  const rows: MenuItem[] = [
    itemById('title.assist'),
    itemById('title.comments'),
    panel === null ? side : { ...side, label: 'Hide side panel', doc: 'Closes the panel' },
    { ...itemById(ROSTER_ROW_ID), items: undefined, dividerBefore: true },
    itemById('title.inbox'),
    { ...itemById('title.slideshow.presenterView'), dividerBefore: true },
    itemById('title.slideshow.startFromBeginning'),
    { ...titleSignInItem(), label: 'Sign in', dividerBefore: true },
  ];
  return rows;
}

const NO_PRESENCE: EditorPresence = { others: [] };

/**
 * The More key (NEXT.md 4.1.3 item 13; audit-brand-surfaces proposal 3): drawn under 480 px only
 * (TitleRow.css), a 32 px quiet key with the horizontal ellipsis. Its menu runs each row as the
 * folded control does; Collaborators opens the roster plate at the key, and the roster's own row
 * opens the account menu there, so Change name, Sign in and Forget this browser stay one tap away
 * while the presence slot is folded.
 */
function TitleMore() {
  const shell = useEditorShell();
  const { input } = shell;
  const key = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<'menu' | 'roster' | 'account' | null>(null);
  const presence = input.presence ?? NO_PRESENCE;
  const viewer = viewerFactsOf(input.access, presence);
  const self = meOf({ account: input.account, presence });
  const goTo = (participant: PresenceParticipant) => {
    if (presence.onGoTo) presence.onGoTo(participant.clientId);
    else if (input.editor?.goToClient) input.editor.goToClient(participant.clientId);
    else if (participant.slideId !== undefined) input.navigate?.(`#${participant.slideId}`);
  };
  const follow = (participant: PresenceParticipant) => {
    if (presence.following === participant.clientId) presence.onUnfollow?.();
    else if (presence.onFollow) presence.onFollow(participant.clientId);
    else if (input.editor?.followClient) input.editor.followClient(participant.clientId);
    else goTo(participant);
  };
  const run = (chosen: MenuItem) => {
    if (chosen.id === ROSTER_ROW_ID) {
      setOpen('roster');
      return;
    }
    setOpen(null);
    if (chosen.id === 'title.sidePanel') {
      if (shell.panel === null) shell.reopenPanel();
      else shell.closePanel();
      return;
    }
    if (chosen.id === 'title.assist' && shell.panel === 'assist') {
      shell.closePanel();
      return;
    }
    if (chosen.id === 'title.comments' && shell.panel === 'comments') {
      shell.closePanel();
      return;
    }
    shell.runItem(chosen);
  };
  const anchor = key.current;
  return (
    <>
      <button
        ref={key}
        type="button"
        className="pt-ib pt-icon ts-title-more"
        data-control="title.more"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open === 'menu' ? TITLE_MORE_MENU_ID : undefined}
        onClick={() => setOpen((on) => (on === null ? 'menu' : null))}
        {...tipProps({
          name: 'More',
          doc: 'Assist, comments, the side panel, collaborators and the slideshow options',
        })}
      >
        <Icon name="ellipsis-horizontal" />
      </button>
      {open === 'menu' && anchor ? (
        <Menu
          items={titleMoreItems(shell.panel)}
          context={shell.menuContext}
          label="More"
          anchor={{ kind: 'element', element: anchor }}
          placement="below"
          align="end"
          returnFocusTo={anchor}
          onSelect={run}
          onClose={() => setOpen((on) => (on === 'menu' ? null : on))}
          id={TITLE_MORE_MENU_ID}
        />
      ) : null}
      {open === 'roster' && anchor ? (
        <RosterMenu
          anchor={anchor}
          presence={presence}
          document={input.document}
          viewer={viewer}
          capabilities={input.capabilities}
          context={shell.menuContext}
          onFollow={(participant) => {
            setOpen(null);
            follow(participant);
          }}
          onGoTo={(participant) => {
            setOpen(null);
            goTo(participant);
          }}
          onAccount={() => setOpen('account')}
          onClose={() => setOpen((on) => (on === 'roster' ? null : on))}
          returnFocusTo={anchor}
        />
      ) : null}
      {open === 'account' && anchor && self !== null ? (
        <AccountMenu
          anchor={anchor}
          identity={self}
          account={input.account}
          context={shell.menuContext}
          runItem={shell.runItem}
          onClose={() => setOpen((on) => (on === 'account' ? null : on))}
          returnFocusTo={anchor}
        />
      ) : null}
    </>
  );
}

export type TitleRowProps = {
  /** compact mode: the Show the menus chevron at the far right */
  compact: boolean;
  onShowMenus: () => void;
};

/**
 * The mark's link (SPEC-4 0.16, 1.10): the `linkComponent` the studio passes, so the click is a
 * same document transition with `preload: 'intent'`, else a plain anchor to the same path. The
 * label, the tooltip and `data-control="title.home"` are the same on both.
 */
export function TitleHomeLink({
  to,
  link,
  label,
  doc,
  menuItem,
}: {
  to: string;
  link: LinkComponent | undefined;
  label: string;
  doc: string | undefined;
  menuItem: string;
}) {
  const shared = {
    className: 'ts-title-home',
    'data-control': 'title.home',
    'data-menu-item': menuItem,
    'aria-label': label,
    ...tipProps({ name: label, doc }),
  };
  const mark = <TurboslideMark size={24} aria-hidden="true" />;
  if (link === undefined)
    return (
      <a href={to} {...shared}>
        {mark}
      </a>
    );
  const Link = link;
  return (
    <Link to={to} preload="intent" {...shared}>
      {mark}
    </Link>
  );
}

export function TitleRow({ compact, onShowMenus }: TitleRowProps) {
  const shell = useEditorShell();
  const home = itemById('title.appIcon');
  const comments = itemById('title.comments');
  const share = itemById('title.share');
  const homePath = home.effect?.kind === 'route' ? home.effect.path : '/decks';
  const pending = shell.input.access?.requests?.length ?? 0;
  const commentsPresent = isPresent(comments, shell.menuContext);
  /* the assistant's entry (docs/PRODUCT.md 6.1): drawn for a writer, where Google draws Ask Gemini */
  const assist = itemById('title.assist');
  const assistPresent = isPresent(assist, shell.menuContext);
  /* the tooltip names the key as the toolbar's do ("Assist, Cmd J"; docs/PRODUCT.md 6.1; pass 2
     finding 13): tipOf reads the parenthesised chord off the title */
  const assistKey = tooltipKey(assist.key, shell.platform);
  return (
    <header className="ts-title-row" data-control="title.row">
      <div className="ts-title-l">
        <TitleHomeLink
          to={homePath}
          link={shell.input.linkComponent}
          label={home.label}
          doc={home.doc}
          menuItem={home.id}
        />
        <TitleField />
        {/* the clock right after the name, the save words after it, so no reserved cell stands
            between the name and the clock (Kevin, 2026-09-25: the clock sat 200 px from the words) */}
        <LastEdit />
        <SaveState />
      </div>
      <div className="ts-title-r">
        {/* the name prompt the route opens on the first write or at the join (docs/POLISH.md 2.8
            item 103): a plate that floats under the row's right end (TitleRow.css, NEXT.md 4.1.3
            item 13), never over the sheet and never inside the row, so the deck name keeps its
            width while it shows; a dialog a person opened covers it while open */}
        {shell.input.account?.namePrompt?.open === true && shell.dialog === null ? (
          <NamePromptPlate />
        ) : null}
        {/* SPEC-3 0.43: five fixed slots from the first paint, left to right */}
        <PresenceSlot />
        {/* the Assist button (docs/PRODUCT.md 6.1): the sparkle glyph with the word, a toggle of the
            Assist panel like the comments glyph; absent for a reader */}
        <span className="ts-title-slot ts-title-assist-slot" data-control="title.assist.slot">
          {assistPresent ? (
            <ToolButton
              icon="sparkles"
              title={assistKey === undefined ? assist.label : `${assist.label} (${assistKey})`}
              label={assist.label}
              doc={assist.doc ?? ''}
              pressed={shell.panel === 'assist'}
              quiet
              className="ts-title-assist"
              control="title.assist"
              menuItem={assist.id}
              onClick={() =>
                shell.panel === 'assist' ? shell.closePanel() : shell.runItem(assist)
              }
            />
          ) : null}
        </span>
        <span className="ts-title-slot ts-title-comments-slot" data-control="title.comments.slot">
          {/* the glyph is a toggle (docs/RETURN.md 4.3; audit-chrome row 24): the first click opens
              the Comments panel with aria-pressed true, the second closes it, as Google's icon does */}
          {commentsPresent ? (
            <ToolButton
              icon="chat"
              title={comments.label}
              doc={comments.doc ?? ''}
              pressed={shell.panel === 'comments'}
              quiet
              className="ts-title-comments"
              control="title.comments"
              menuItem={comments.id}
              onClick={() =>
                shell.panel === 'comments' ? shell.closePanel() : shell.runItem(comments)
              }
            />
          ) : null}
        </span>
        {/* the side panel toggle (docs/PRODUCT.md section 2 rank 25): reopens the last right
            panel or closes the open one; the bottom bar that held it left */}
        <span className="ts-title-slot ts-title-panel-slot" data-control="title.sidePanel.slot">
          <ToolButton
            icon={shell.panel === null ? 'sidebar' : 'next'}
            title={shell.panel === null ? 'Show side panel' : 'Hide side panel'}
            doc={
              shell.panel === null
                ? 'Reopens the last panel: Format options, Themes, Comments or Version history'
                : 'Closes the panel'
            }
            pressed={shell.panel !== null}
            quiet
            className="ts-title-panel"
            control="title.sidePanel"
            onClick={() => (shell.panel === null ? shell.reopenPanel() : shell.closePanel())}
          />
        </span>
        {/* docs/FOCUS.md 3.2 parks title.inbox: the plate is drawn only while Tools > Advanced tools
            is on. The slot carries `is-empty` while the plate is absent and TitleRow.css collapses
            it (docs/RETURN.md 4.3, 2.16), so the parked plate leaves no 60 px hole; the slot keeps
            its width whenever the plate is present (SPEC-3 4.2, 9.2) */}
        <span
          className={cn(
            'ts-title-slot ts-title-inbox-slot',
            !isPresent(itemById('title.inbox'), shell.menuContext) && 'is-empty',
          )}
          data-control="title.inbox.slot"
        >
          {isPresent(itemById('title.inbox'), shell.menuContext) ? <InboxPlate /> : null}
        </span>
        <Slideshow />
        <span
          className={cn('ts-title-share-slot', pending > 0 && 'has-dot')}
          data-control="share.slot"
        >
          <button
            type="button"
            className="pt-ib ts-title-share"
            data-control="share.open"
            data-menu-item={share.id}
            data-pending={pending > 0 ? pending : undefined}
            onClick={() => shell.runItem(share)}
            {...tipProps({
              name: TITLE_ROW.share,
              doc:
                pending > 0
                  ? `${pending === 1 ? 'One person asked' : `${pending} people asked`} for access; ${share.doc ?? ''}`
                  : share.doc,
            })}
          >
            <Icon name="lock-closed" />
            <span className="pt-lb">{TITLE_ROW.share}</span>
          </button>
          <i className="ts-title-dot" aria-hidden="true" />
        </span>
        <TitleSignIn />
        <TitleMore />
        {compact ? (
          <ToolButton
            icon="chevron-down"
            title="Show the menus (Ctrl Shift F)"
            doc="Brings the menu bar and the toolbar back; Esc does the same"
            className="ts-title-showmenus"
            control="toolbar.showMenus"
            onClick={onShowMenus}
          />
        ) : null}
      </div>
    </header>
  );
}
