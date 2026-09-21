import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRef, useState } from 'react';

import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import { Dialog } from '@turboslide/chrome/Dialog';
import { Menu } from '@turboslide/chrome/Menu';
import type { MenuCloseReason } from '@turboslide/chrome/Menu';
import { DEFAULT_MENU_CONTEXT } from '@turboslide/chrome/menus/model';
import type { MenuItem } from '@turboslide/chrome/menus/model';
import { HOME, TITLE_ROW } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import { useMountEffect } from '../components/useMountEffect';
import {
  createFromTemplate,
  deleteStoredTemplate,
  listTemplateGallery,
  renameStoredTemplate,
  useTemplateForNew,
} from '../server/templates';
import type { TemplateCard } from '../server/templates';
import { RouterLinkSlot } from './-link-slot';
import { recordDeckOpened } from './-recent';

import './decks.css';
import './decks.templates.css';

/**
 * The template gallery, /decks/templates (docs/PRODUCT.md 4.3; audit-seller 12, audit-brand 3
 * and 13, judge-seller additions 3 and 4): the heading "Template gallery", then Your organisation
 * (the templates saved on this deployment, with the template new presentations start from first
 * and marked "Used for new presentations"), then Turboslide's (Blank alone this round), each card
 * the cover slide as a live clone in the template's appearance, the name, the slide count and one
 * sentence. A click on a card runs `deck.create { from }` through `createFromTemplate` and opens
 * the editor; the Blank card opens /new while blank is the deployment default, since /new is the
 * draft nothing writes until the first edit. The card menu under Your organisation carries Rename
 * (in place, `template.rename`), Use for new presentations (`template.setDefault`) and Delete (a
 * confirm dialog, `template.delete`, refused for the default until another is chosen); Turboslide's
 * Blank carries Use for new presentations alone, which restores today's draft. On General
 * Translation's deployment the 85 slide GT brand deck is listed under Your organisation under its
 * own name, "General Translation brand deck", never as a Turboslide template. The /decks strip's
 * link, `/decks#templates` and File > New > From template gallery point here (the requests to B1
 * and the integrator in build/b5b.md). The loader awaits the gallery: the covers render on the
 * server, a few kilobytes each. The page announces hydration (`data-hydrated`) like the home page,
 * so the drivers wait for it. Every string a person reads is in sentence case with no trailing
 * period on a heading (docs/grammar.md); the strings move to menus/strings.ts by the integrator's
 * merge (b5b.md).
 */
export const Route = createFileRoute('/decks/templates')({
  loader: async () => ({ gallery: await listTemplateGallery() }),
  head: () => ({ meta: [{ title: `${HOME.gallery}, Turboslide` }] }),
  component: GalleryPage,
});

/** The gallery's words (docs/PRODUCT.md 4.3; sentence case, headings without a period). */
export const TEMPLATES = {
  title: HOME.gallery,
  lead: 'Start a presentation from a template. The copy is yours to edit, and the template stays as it is.',
  organisation: 'Your organisation',
  organisationLead:
    'Templates saved on this Turboslide. Open a presentation and choose File > Save as template to add one.',
  turboslide: 'Turboslide',
  turboslideLead: "Turboslide's own templates.",
  empty:
    'No templates are saved on this Turboslide yet. Open a presentation and choose File > Save as template.',
  usedForNew: 'Used for new presentations',
  useForNew: 'Use for new presentations',
  rename: 'Rename',
  delete: 'Delete',
  slides: (n: number) => `${n} slide${n === 1 ? '' : 's'}`,
  opening: 'Opening',
  back: HOME.recent,
  deleteTitle: (name: string) => `Delete the template ${name}?`,
  deleteSentence: 'Presentations made from it are not changed. This cannot be undone.',
  deleteOk: 'Delete',
  cancel: 'Cancel',
  nowUsed: (name: string) => `${name} is used for new presentations`,
  deleted: (name: string) => `Deleted the template ${name}`,
  renamed: (name: string) => `Renamed the template to ${name}`,
} as const;

/**
 * The control ids of the page (docs/PRODUCT.md 7.1, the gallery page row): `templates.page`,
 * `templates.group.organisation`, `templates.group.turboslide`, `templates.card.<id>` with
 * `.open`, `.menu`, `.rename`, `.useForNew`, `.delete` and `.default`. The menu family
 * `templates.card.menu` is the id the matrix's `parks` names for the card menus
 * (core-matrix.json `templates.card.rename-and-delete`).
 */
export const TEMPLATE_CONTROLS = {
  page: 'templates.page',
  organisation: 'templates.group.organisation',
  turboslide: 'templates.group.turboslide',
  card: (id: string) => `templates.card.${id}`,
  menuFamily: 'templates.card.menu',
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type CardMenuState = { id: string; anchor: HTMLElement };

/** The rows of a card's menu: Rename and Delete on an organisation template, Use for new presentations unless it is the default already. */
export function cardMenuItems(card: TemplateCard): MenuItem[] {
  const base = TEMPLATE_CONTROLS.card(card.id);
  const items: MenuItem[] = [];
  if (card.organisation === true)
    items.push({ id: `${base}.rename`, label: TEMPLATES.rename, icon: 'pencil', status: 'now' });
  if (!card.isDefault)
    items.push({
      id: `${base}.useForNew`,
      label: TEMPLATES.useForNew,
      icon: 'star',
      status: 'now',
    });
  if (card.organisation === true)
    items.push({
      id: `${base}.delete`,
      label: TEMPLATES.delete,
      icon: 'trash',
      status: 'now',
      dividerBefore: items.length > 0 ? true : undefined,
    });
  return items;
}

function GalleryPage() {
  const { gallery } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const page = useRef<HTMLElement>(null);
  const snackbar = useSnackbar();
  const [creating, setCreating] = useState<string | null>(null);
  const [menu, setMenu] = useState<CardMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TemplateCard | null>(null);
  /* a write in flight for a card: its menu takes no second click */
  const [busy, setBusy] = useState<string | null>(null);

  useMountEffect(() => {
    page.current?.setAttribute('data-hydrated', '');
  });

  const refresh = async () => {
    await router.invalidate();
  };

  const cards = [...gallery.organisation, ...gallery.turboslide];
  const cardById = (id: string): TemplateCard | undefined => cards.find((card) => card.id === id);

  const open = async (card: TemplateCard) => {
    if (creating !== null) return;
    if (card.id === 'blank' && gallery.default === 'blank') {
      // the draft route: nothing is written until the first edit (SPEC 6.1)
      await navigate({ to: '/new' });
      return;
    }
    setCreating(card.id);
    try {
      const created = await createFromTemplate({
        from: card.id,
        name: card.id === 'blank' ? TITLE_ROW.untitled : card.name,
      });
      recordDeckOpened(created.deckId, {
        title: created.title,
        appearance: card.coverAppearance,
        firstSlide: card.cover ?? null,
        revision: 0,
      });
      await navigate({ to: '/edit/$deckId', params: { deckId: created.deckId } });
    } catch (error) {
      snackbar.show(`${card.name}: ${errorMessage(error)}`);
      setCreating(null);
    }
  };

  const useForNew = async (card: TemplateCard) => {
    setBusy(card.id);
    try {
      const result = await useTemplateForNew({ id: card.id });
      snackbar.show(TEMPLATES.nowUsed(result.name));
      await refresh();
    } catch (error) {
      snackbar.show(`${TEMPLATES.useForNew}: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const rename = async (card: TemplateCard, name: string) => {
    setRenaming(null);
    const next = name.trim();
    if (next === '' || next === card.name) return;
    setBusy(card.id);
    try {
      const result = await renameStoredTemplate({ id: card.id, name: next });
      snackbar.show(TEMPLATES.renamed(result.name));
      await refresh();
    } catch (error) {
      snackbar.show(`${TEMPLATES.rename}: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (card: TemplateCard) => {
    setConfirm(null);
    setBusy(card.id);
    try {
      await deleteStoredTemplate({ id: card.id });
      snackbar.show(TEMPLATES.deleted(card.name));
      await refresh();
    } catch (error) {
      snackbar.show(`${TEMPLATES.delete}: ${errorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const onMenuSelect = (item: MenuItem) => {
    const state = menu;
    setMenu(null);
    if (state === null) return;
    const card = cardById(state.id);
    if (card === undefined) return;
    const base = TEMPLATE_CONTROLS.card(card.id);
    switch (item.id) {
      case `${base}.rename`:
        setRenaming(card.id);
        return;
      case `${base}.useForNew`:
        void useForNew(card);
        return;
      case `${base}.delete`:
        setConfirm(card);
        return;
      default:
        return;
    }
  };

  const onMenuClose = (_reason: MenuCloseReason) => setMenu(null);
  const menuCard = menu === null ? undefined : cardById(menu.id);

  const cardProps = (card: TemplateCard): Omit<CardProps, 'card'> => ({
    busy: creating === card.id || busy === card.id,
    disabled: creating !== null,
    renaming: renaming === card.id,
    menuOpen: menu?.id === card.id,
    onOpen: () => void open(card),
    onMenu: (anchor) => setMenu({ id: card.id, anchor }),
    onRename: (name) => void rename(card, name),
    onCancelRename: () => setRenaming(null),
  });

  return (
    <main
      ref={page}
      className="ts-home ts-home-page ts-gallery-page"
      data-control={TEMPLATE_CONTROLS.page}
      data-default={gallery.default}
    >
      <header className="ts-appbar">
        <AppBarBrand linkComponent={RouterLinkSlot} homeTo="/decks" aboutTo="/home" />
        <span />
      </header>

      {/* the theme's sprite once, so a cover's GT mark (`<use href="#gt-mark">`) draws (SPEC 5.1), the way DeckViewer mounts it */}
      <div
        className="ts-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: gallery.sprite }}
      />

      <section className="ts-gallery" aria-labelledby="ts-gallery-heading">
        <div className="ts-gallery-head">
          <div>
            <h1 id="ts-gallery-heading">{TEMPLATES.title}</h1>
            <p className="ts-gallery-lead">{TEMPLATES.lead}</p>
          </div>
          <Link
            to="/decks"
            className="pt-ib is-text"
            data-control="templates.back"
            {...tipProps({ name: TEMPLATES.back, doc: 'Back to your presentations.' })}
          >
            <span className="pt-lb">{TEMPLATES.back}</span>
          </Link>
        </div>

        <section
          className="ts-gallery-group"
          aria-labelledby="ts-gallery-organisation"
          data-control={TEMPLATE_CONTROLS.organisation}
        >
          <div className="ts-gallery-group-head">
            <div>
              <h2 id="ts-gallery-organisation">{TEMPLATES.organisation}</h2>
              <p className="ts-gallery-group-lead">{TEMPLATES.organisationLead}</p>
            </div>
          </div>
          {gallery.organisation.length === 0 ? (
            <p className="ts-gallery-empty" data-control="templates.group.organisation.empty">
              {TEMPLATES.empty}
            </p>
          ) : (
            <ul className="ts-gallery-cards">
              {gallery.organisation.map((card) => (
                <GalleryCard key={card.id} card={card} {...cardProps(card)} />
              ))}
            </ul>
          )}
        </section>

        <section
          className="ts-gallery-group"
          aria-labelledby="ts-gallery-turboslide"
          data-control={TEMPLATE_CONTROLS.turboslide}
        >
          <div className="ts-gallery-group-head">
            <div>
              <h2 id="ts-gallery-turboslide">{TEMPLATES.turboslide}</h2>
              <p className="ts-gallery-group-lead">{TEMPLATES.turboslideLead}</p>
            </div>
          </div>
          <ul className="ts-gallery-cards">
            {gallery.turboslide.map((card) => (
              <GalleryCard key={card.id} card={card} {...cardProps(card)} />
            ))}
          </ul>
        </section>
      </section>

      {menu !== null && menuCard !== undefined ? (
        <Menu
          id="templates-card-menu"
          items={cardMenuItems(menuCard)}
          context={DEFAULT_MENU_CONTEXT}
          label="Template actions"
          anchor={{ kind: 'element', element: menu.anchor }}
          placement="below"
          onSelect={onMenuSelect}
          onClose={onMenuClose}
          returnFocusTo={menu.anchor}
          autoFocus
        />
      ) : null}

      {confirm !== null ? (
        <Dialog
          title={TEMPLATES.deleteTitle(confirm.name)}
          lead={TEMPLATES.deleteSentence}
          control="templates.delete"
          onClose={() => setConfirm(null)}
          cancel
          cancelLabel={TEMPLATES.cancel}
          actions={[
            {
              label: TEMPLATES.deleteOk,
              primary: true,
              disabled: busy === confirm.id,
              autoFocus: true,
              onClick: () => void remove(confirm),
              control: 'templates.delete.ok',
              doc: 'Deletes the template; nothing brings it back',
            },
          ]}
        >
          <p>{TEMPLATES.slides(confirm.slides)} and the template record leave this Turboslide.</p>
        </Dialog>
      ) : null}

      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </main>
  );
}

type CardProps = {
  card: TemplateCard;
  /** a create or a write is in flight for this card */
  busy: boolean;
  /** a create is in flight for some card: no second card opens */
  disabled: boolean;
  renaming: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
};

/**
 * One card: the cover as a live clone in the template's appearance under one open button, the
 * mark of the default, the name (a second way to open it), the slide count, the sentence and the
 * menu button. The clone sits beside the button and never inside it, so a slide's own markup is
 * never inside a control.
 */
function GalleryCard({
  card,
  busy,
  disabled,
  renaming,
  menuOpen,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
}: CardProps) {
  const base = TEMPLATE_CONTROLS.card(card.id);
  const items = cardMenuItems(card);
  const doc =
    card.description ?? `${TEMPLATES.slides(card.slides)}; opens a presentation made from it.`;
  return (
    <li
      className={busy ? 'ts-gallery-card is-busy' : 'ts-gallery-card'}
      data-template={card.id}
      data-control={base}
      data-default={card.isDefault ? '' : undefined}
    >
      <span className="ts-gallery-cover" data-theme={card.coverAppearance} aria-hidden="true">
        {card.coverHtml === null ? (
          <span className="ts-gallery-plate">{card.name}</span>
        ) : (
          <LiveClone html={card.coverHtml} theme={card.coverAppearance} frame={false} />
        )}
        {card.isDefault ? (
          <span className="ts-gallery-default" data-control={`${base}.default`}>
            {TEMPLATES.usedForNew}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="ts-gallery-open"
        aria-label={card.name}
        data-control={`${base}.open`}
        disabled={disabled}
        onClick={onOpen}
        {...tipProps({ name: card.name, doc })}
      />
      <div className="ts-gallery-body">
        {renaming ? (
          <RenameField card={card} onRename={onRename} onCancel={onCancelRename} />
        ) : (
          <button
            type="button"
            className="ts-gallery-name"
            data-control={`${base}.name`}
            disabled={disabled}
            onClick={onOpen}
            {...tipProps({ name: card.name, doc: 'Opens a presentation made from it.' })}
          >
            {busy ? TEMPLATES.opening : card.name}
          </button>
        )}
        <span className="ts-gallery-meta">{TEMPLATES.slides(card.slides)}</span>
        {items.length > 0 ? (
          <button
            type="button"
            className={
              menuOpen ? 'pt-ib pt-icon ts-gallery-more is-on' : 'pt-ib pt-icon ts-gallery-more'
            }
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? 'templates-card-menu' : undefined}
            data-control={`${base}.menu`}
            data-menu={TEMPLATE_CONTROLS.menuFamily}
            disabled={busy}
            onClick={(event) => onMenu(event.currentTarget)}
            {...tipProps({
              name: 'More actions',
              doc: `${items.map((item) => item.label).join(', ')} for ${card.name}.`,
            })}
          >
            <span aria-hidden="true" className="ts-gallery-dots">
              ⋮
            </span>
          </button>
        ) : null}
        {card.description !== undefined ? (
          <p className="ts-gallery-sentence">{card.description}</p>
        ) : null}
      </div>
    </li>
  );
}

/** The in place rename of a card: Enter or blur saves, Escape keeps the old name. */
function RenameField({
  card,
  onRename,
  onCancel,
}: {
  card: TemplateCard;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(card.name);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useMountEffect(() => {
    field.current?.focus();
    field.current?.select();
  });
  const finish = (name: string) => {
    if (done.current) return;
    done.current = true;
    onRename(name);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    finish(value);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      done.current = true;
      onCancel();
    }
  };
  return (
    <form className="ts-gallery-rename" onSubmit={submit}>
      <input
        ref={field}
        type="text"
        value={value}
        aria-label={TEMPLATES.rename}
        data-control={`${TEMPLATE_CONTROLS.card(card.id)}.rename.field`}
        spellCheck={false}
        autoComplete="off"
        maxLength={120}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(value)}
        onKeyDown={onKeyDown}
      />
    </form>
  );
}
