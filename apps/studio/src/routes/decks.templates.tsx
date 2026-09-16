import { useState } from 'react';

import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';

import { AppBarBrand } from '@turboslide/chrome/AppBarBrand';
import { HOME } from '@turboslide/chrome/menus/strings';
import { Snackbar, useSnackbar } from '@turboslide/chrome/Snackbar';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { TEMPLATE_CATEGORY_LABELS } from '@turboslide/schema/building-blocks';
import { LiveClone } from '@turboslide/viewer/LiveClone';
import { useTheme } from '@turboslide/viewer/theme';

import { useMountEffect } from '../components/useMountEffect';
import { createFromTemplate, listTemplateGallery } from '../server/templates';
import type { TemplateCard } from '../server/templates';
import { RouterLinkSlot } from './-link-slot';
import { recordDeckOpened } from './-recent';

import './decks.css';
import './decks.templates.css';

/**
 * The template gallery, /decks/templates (gslides-parity SPEC-5 0.22, 0.23, 4.3; MILESTONES-5 B3
 * day 7): Google's three headings in its order, Personal, Work and Education, each a grid of
 * cards drawn from `decks/templates/templates.json` with a live cover of the template's cover
 * slide, its name, its slide count and its use cases. A click on a card creates a presentation
 * from the template through `createFromTemplate` (the store's `deck.create` over any id of the
 * index, SPEC-5 4.6) and opens the editor. The home page's strip links here (its `#templates`
 * anchor still lands on the strip) and File > New > From template gallery opens it in a new tab
 * (b3.md request B3-12). The page announces hydration like the home page, so the specs wait for
 * it; the loader awaits the gallery (the covers render on the server, a few kilobytes each).
 */
export const Route = createFileRoute('/decks/templates')({
  loader: async () => ({ gallery: await listTemplateGallery() }),
  head: () => ({ meta: [{ title: `${HOME.gallery}, Turboslide` }] }),
  component: GalleryPage,
});

function GalleryPage() {
  const { gallery } = Route.useLoaderData();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [creating, setCreating] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const theme = useTheme();
  useMountEffect(() => setMounted(true));

  const create = async (card: TemplateCard) => {
    if (creating !== null) return;
    setCreating(card.id);
    try {
      const created = await createFromTemplate({ from: card.id, name: card.name });
      recordDeckOpened(created.deckId);
      await navigate({ to: '/edit/$deckId', params: { deckId: created.deckId } });
    } catch (error) {
      snackbar.show(`${card.name}: ${error instanceof Error ? error.message : String(error)}`);
      setCreating(null);
    }
  };

  return (
    <main className="ts-home ts-home-page ts-gallery-page" data-hydrated={mounted ? '' : undefined}>
      <header className="ts-appbar">
        <AppBarBrand linkComponent={RouterLinkSlot} homeTo="/decks" aboutTo="/home" />
      </header>
      <section className="ts-gallery" aria-labelledby="ts-gallery-heading">
        <div className="ts-gallery-head">
          <h1 id="ts-gallery-heading">{HOME.gallery}</h1>
          <Link
            to="/decks"
            className="ts-strip-gallery"
            data-control="gallery.back"
            {...tipProps({ name: HOME.recent, doc: 'Back to your presentations' })}
          >
            {HOME.recent}
          </Link>
        </div>
        <p className="ts-gallery-lead">
          Start a presentation from a template. Every slide is a Turboslide slide you can edit, move
          and export; the copy is yours and the template stays as it is.
        </p>
        {gallery.groups.map((group) => (
          <section
            key={group.category}
            className="ts-gallery-group"
            aria-labelledby={`ts-gallery-${group.category}`}
            data-control={`gallery.group.${group.category}`}
          >
            <h2 id={`ts-gallery-${group.category}`}>{TEMPLATE_CATEGORY_LABELS[group.category]}</h2>
            <ul className="ts-gallery-cards">
              {group.cards.map((card) => {
                const html = theme === 'dark' ? card.coverDark : card.cover;
                const busy = creating === card.id;
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      className="ts-gallery-card"
                      data-control={`gallery.template.${card.id}`}
                      disabled={creating !== null}
                      onClick={() => void create(card)}
                      {...tipProps({
                        name: card.name,
                        doc:
                          card.description ??
                          `${card.slides} slides; click to start a presentation from it`,
                      })}
                    >
                      <span className="ts-gallery-cover" aria-hidden="true" data-theme={theme}>
                        {html === null ? (
                          <span className="ts-gallery-plate">{card.name}</span>
                        ) : (
                          <LiveClone html={html} theme={theme} frame={false} />
                        )}
                      </span>
                      <span className="ts-gallery-name">{busy ? 'Opening' : card.name}</span>
                      <span className="ts-gallery-meta">
                        {card.slides} slide{card.slides === 1 ? '' : 's'}
                        {card.useCases !== undefined && card.useCases.length > 0
                          ? ` · ${card.useCases.join(', ')}`
                          : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
      <Snackbar message={snackbar.message} onDismiss={snackbar.dismiss} />
    </main>
  );
}
