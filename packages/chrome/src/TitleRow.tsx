import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRef, useState } from 'react';

import { useEditorShell } from './editor-shell-context';
import type { IdentityView } from './editor-shell';
import { GtMark } from './GtMark';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { tooltipKey } from './menus/keys';
import { isPresent, itemById } from './menus/model';
import type { MenuItem } from './menus/model';
import { TITLE_ROW } from './menus/strings';
import { nameOf } from './presence/IdentityChip';
import { PresenceSlot } from './presence/PresenceSlot';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './TitleRow.css';

/**
 * The title row (gslides-parity SPEC 1.1, 2.0; SPEC-3 4.2, 0.43, 9.3): 44 px, full width. Left:
 * the GT mark as a link to /decks, the title field (click to rename, Enter commits, Esc restores,
 * one deck.rename), the save words with the cloud glyph in one fixed cell (five phrases,
 * aria-live), the Last edit clock that opens Version history and names the newest record's author
 * through the identity the route resolved, with a 6 px dot when a record landed since this tab
 * loaded. Right, in fixed slots that exist from the first paint (0.43): the presence slot (184 px:
 * four chips, the `+N` chip drawn empty, a hair rule, the own chip), the Show all comments glyph
 * (live), the inbox plate (a glyph and a two digit count, present at zero), the Slideshow split
 * button (the one solid button of the row), Share with a 6 px dot when an access request is
 * pending. No star, folder, Meet, Record or Gemini (SPEC 2.0). In compact mode a Show the menus
 * chevron sits at the far right. The row's width never changes when a person joins or a count
 * moves (05 rule 4). New in Turboslide (no Prototemplate source).
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

/** The save words of SPEC 2.0 and SPEC-3 15 for a state: five phrases in one cell. */
export function saveWords(state: string, draft: boolean, offline = false): string {
  if (draft && state === 'saved') return TITLE_ROW.notSaved;
  if (offline || state === 'offline') return TITLE_ROW.offline;
  switch (state) {
    case 'saving':
    case 'unsaved':
      return TITLE_ROW.saving;
    case 'conflict':
      return TITLE_ROW.retrying;
    default:
      return TITLE_ROW.saved;
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

/** The longest of the five phrases: the cell is as wide as this one so the clock never moves (05 rule 4). */
const LONGEST_SAVE_WORDS = [
  TITLE_ROW.saved,
  TITLE_ROW.saving,
  TITLE_ROW.retrying,
  TITLE_ROW.offline,
  TITLE_ROW.notSaved,
].reduce((a, b) => (b.length > a.length ? b : a));

function SaveState() {
  const shell = useEditorShell();
  const save = shell.input.save ?? { state: 'saved' as const };
  /* offline is the room client's word (it sets `offline` after a failed reconnect); a stream that
     has not connected yet (the server render, the first frames after hydration) is not offline,
     or the server would paint the long sentence and the row would move when the stream connects
     (VERIFICATION-3 finding 26: the clock slot moved 158 px left after hydration) */
  const offline = shell.input.sync?.offline === true;
  const words = saveWords(save.state, save.draft === true, offline);
  const item = itemById('title.saveState');
  /* Google shows a viewer and a commenter no save words: the cell is absent below `write`
     (SPEC-3 13.4; VERIFICATION-3 finding 10) */
  if (!isPresent(item, shell.menuContext)) return null;
  const busy = save.state === 'saving' || save.state === 'unsaved';
  const icon = busy ? 'cloud-arrow-up' : 'cloud';
  return (
    <button
      type="button"
      className={cn('ts-title-save', save.state !== 'saved' && 'is-busy', offline && 'is-offline')}
      data-control="deck.saveState"
      data-menu-item={item.id}
      data-state={offline ? 'offline' : save.state}
      onClick={() => shell.runItem(item)}
      {...tipProps({ name: words, doc: item.doc })}
    >
      <Icon name={icon} />
      <span className="ts-title-save-words" data-longest={LONGEST_SAVE_WORDS}>
        <span className="ts-title-save-live" aria-live="polite">
          {words}
        </span>
      </span>
    </button>
  );
}

function LastEdit() {
  const shell = useEditorShell();
  const save = shell.input.save;
  const ago = timeAgo(save?.lastEditAt ?? shell.input.document.deck.updatedAt);
  const item = itemById('title.lastEdit');
  const words = lastEditWords(ago, save?.lastEditor, save?.lastEditBy);
  const changed = save?.changedSinceOpen === true;
  return (
    <span
      className={cn('ts-title-clock-slot', changed && 'has-dot')}
      data-control="deck.lastEdit.slot"
    >
      <ToolButton
        icon="clock"
        title={words}
        doc={
          changed ? `${item.doc ?? ''}. Changed since you opened it`.replace(/^\. /, '') : item.doc
        }
        ariaLabel={words}
        pressed={shell.panel === 'versionHistory'}
        quiet
        className="ts-title-clock"
        control="deck.lastEdit"
        menuItem={item.id}
        onClick={() => shell.runItem(item)}
      />
      <i className="ts-title-dot" aria-hidden="true" />
    </span>
  );
}

function Slideshow() {
  const shell = useEditorShell();
  const item = itemById('title.slideshow');
  const [open, setOpen] = useState(false);
  const arrow = useRef<HTMLButtonElement>(null);
  const key = tooltipKey(item.key, shell.platform);
  const children: ReadonlyArray<MenuItem> = item.items ?? [];
  return (
    <span className="ts-title-slideshow" data-control="present.split">
      <button
        type="button"
        className="pt-ib is-solid ts-title-present"
        data-control="present.open"
        data-menu-item={item.id}
        onClick={() => shell.runItem(item)}
        {...tipProps({
          name: TITLE_ROW.slideshow,
          doc: 'Presents from the current slide',
          ...(key === undefined ? {} : { key }),
        })}
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
        data-control="present.arrow"
        onClick={() => setOpen((on) => !on)}
        {...tipProps({
          name: 'Presentation options',
          doc: 'Presenter view and Start from beginning',
        })}
      >
        <Icon name="chevron-down" />
      </button>
      {open && arrow.current ? (
        <Menu
          items={children}
          context={shell.menuContext}
          label="Presentation options"
          anchor={{ kind: 'element', element: arrow.current }}
          placement="below"
          returnFocusTo={arrow.current}
          onSelect={(chosen) => shell.runItem(chosen)}
          onClose={() => setOpen(false)}
          id="ts-menu-slideshow"
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

export type TitleRowProps = {
  /** compact mode: the Show the menus chevron at the far right */
  compact: boolean;
  onShowMenus: () => void;
};

export function TitleRow({ compact, onShowMenus }: TitleRowProps) {
  const shell = useEditorShell();
  const home = itemById('title.appIcon');
  const comments = itemById('title.comments');
  const share = itemById('title.share');
  const homePath = home.effect?.kind === 'route' ? home.effect.path : '/decks';
  const pending = shell.input.access?.requests?.length ?? 0;
  const commentsPresent = isPresent(comments, shell.menuContext);
  return (
    <header className="ts-title-row" data-control="title.row">
      <div className="ts-title-l">
        <a
          className="ts-title-home"
          href={homePath}
          data-control="title.home"
          data-menu-item={home.id}
          aria-label={home.label}
          {...tipProps({ name: home.label, doc: home.doc })}
        >
          <GtMark width={31} height={20} />
        </a>
        <TitleField />
        <SaveState />
        <LastEdit />
      </div>
      <div className="ts-title-r">
        {/* SPEC-3 0.43: five fixed slots from the first paint, left to right */}
        <PresenceSlot />
        <span className="ts-title-slot ts-title-comments-slot" data-control="title.comments.slot">
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
              onClick={() => shell.runItem(comments)}
            />
          ) : null}
        </span>
        <span className="ts-title-slot ts-title-inbox-slot" data-control="title.inbox.slot">
          <InboxPlate />
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
