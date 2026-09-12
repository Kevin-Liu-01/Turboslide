import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRef, useState } from 'react';

import { useEditorShell } from './editor-shell-context';
import { GtMark } from './GtMark';
import { Icon } from './icons';
import { cn } from './lib/cn';
import { Menu } from './Menu';
import { tooltipKey } from './menus/keys';
import { itemById } from './menus/model';
import type { MenuItem } from './menus/model';
import { TITLE_ROW } from './menus/strings';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './TitleRow.css';

/**
 * The title row (gslides-parity SPEC 1.1, 2.0; R02 section 2): 44 px, full width. Left: the GT
 * mark as a link to /decks, the title field (click to rename, Enter commits, Esc restores, one
 * deck.rename), the save words with the cloud glyph (aria-live), the Last edit clock that opens
 * Version history. Right: Show all comments (Later, disabled), Slideshow as a split button (the
 * one solid button of the row; the arrow lists Presenter view, Start from beginning and the
 * disabled Present on another screen), Share. No star, folder, avatar, Meet, Record or Gemini
 * (SPEC 2.0). In compact mode a Show the menus chevron sits at the far right. The row draws its
 * bottom edge in --pt-hair (SPEC 1.2). New in Turboslide (no Prototemplate source).
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

/** The save words of SPEC 2.0 for a state. */
export function saveWords(state: string, draft: boolean): string {
  if (draft && state === 'saved') return TITLE_ROW.notSaved;
  switch (state) {
    case 'saving':
    case 'unsaved':
      return TITLE_ROW.saving;
    case 'conflict':
    case 'offline':
      return TITLE_ROW.retrying;
    default:
      return TITLE_ROW.saved;
  }
}

function TitleField() {
  const shell = useEditorShell();
  const { input } = shell;
  const title = input.document.deck.title;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const item = itemById('title.name');
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
      {title === '' ? TITLE_ROW.untitled : title}
    </button>
  );
}

function SaveState() {
  const shell = useEditorShell();
  const save = shell.input.save ?? { state: 'saved' as const };
  const words = saveWords(save.state, save.draft === true);
  const item = itemById('title.saveState');
  const icon = save.state === 'saving' || save.state === 'unsaved' ? 'cloud-arrow-up' : 'cloud';
  return (
    <button
      type="button"
      className={cn('ts-title-save', save.state !== 'saved' && 'is-busy')}
      data-control="deck.saveState"
      data-menu-item={item.id}
      data-state={save.state}
      onClick={() => shell.runItem(item)}
      {...tipProps({ name: words, doc: item.doc })}
    >
      <Icon name={icon} />
      <span aria-live="polite">{words}</span>
    </button>
  );
}

function LastEdit() {
  const shell = useEditorShell();
  const save = shell.input.save;
  const ago = timeAgo(save?.lastEditAt ?? shell.input.document.deck.updatedAt);
  const item = itemById('title.lastEdit');
  const words = ago === null ? 'Last edit' : TITLE_ROW.lastEdit(ago);
  const by =
    save?.lastEditBy !== undefined && save.lastEditBy !== 'studio' ? ` by ${save.lastEditBy}` : '';
  return (
    <ToolButton
      icon="clock"
      title={`${words}${by}`}
      doc={item.doc}
      ariaLabel={`${words}${by}`}
      pressed={shell.panel === 'versionHistory'}
      quiet
      className="ts-title-clock"
      control="deck.lastEdit"
      menuItem={item.id}
      onClick={() => shell.runItem(item)}
    />
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
        <ToolButton
          icon="chat"
          title={comments.label}
          doc={`Not available in Turboslide yet. ${comments.stubReason ?? ''}`}
          ariaDisabled
          className="ts-title-comments"
          control="title.comments"
          menuItem={comments.id}
          onClick={() => undefined}
        />
        <Slideshow />
        <button
          type="button"
          className="pt-ib ts-title-share"
          data-control="share.open"
          data-menu-item={share.id}
          onClick={() => shell.runItem(share)}
          {...tipProps({ name: TITLE_ROW.share, doc: share.doc })}
        >
          <Icon name="lock-closed" />
          <span className="pt-lb">{TITLE_ROW.share}</span>
        </button>
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
