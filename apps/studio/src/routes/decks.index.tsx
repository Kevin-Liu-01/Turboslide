import type { FormEvent } from 'react';
import { useState } from 'react';

import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';

import { GtMark } from '@turboslide/chrome/GtMark';
import type { DeckTemplateId } from '@turboslide/schema/actions';

import { createNewDeck, getHostingFacts, listDecks } from '../server/decks';
import type { DeckSummary } from '../server/decks';
import { getServerHealth } from '../server/health';

import './decks.css';

// The deck list at /decks (SPEC 3.4 put it at `/`; Kevin's directive moved `/` to the editor):
// every deck the store holds, newest first, with a New deck form (the name and the template, one
// deck.create through the server function) and a row per deck (name, slides, revision, updated,
// Open, Export). SSR. It also calls the health server function so every build exercises the
// server-only marker scripts/check-client-bundle.mjs looks for (AGENTS.md, contracts between
// builders), and the hosting facts so the footer names the store (file, tmp or blob) and its
// notice. The file is decks.index.tsx, not decks.tsx: a decks.tsx would become the layout
// route of decks.$deckId.assets.$ and run this loader for every asset request.
export const Route = createFileRoute('/decks/')({
  loader: async () => {
    const [decks, health, hosting] = await Promise.all([
      listDecks(),
      getServerHealth(),
      getHostingFacts(),
    ]);
    return { decks, health, hosting };
  },
  head: () => ({ meta: [{ title: 'Decks, Turboslide' }] }),
  component: DecksPage,
});

const TEMPLATES: ReadonlyArray<{ id: DeckTemplateId; label: string; detail: string }> = [
  {
    id: 'gt-brand',
    label: 'GT brand deck',
    detail: '85 slides in 8 sections, the assets and the archetypes, from decks/templates/gt-brand',
  },
  { id: 'blank', label: 'Blank', detail: 'One title slide in the gt-ink-paper theme' },
];

/** `2026-09-10 22:35` from an ISO stamp, in the reader's zone; the raw value when it is not a date. */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function DecksPage() {
  const { decks, health, hosting } = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [from, setFrom] = useState<DeckTemplateId>('gt-brand');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = name.trim();
    if (title === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createNewDeck({ name: title, from });
      await navigate({ to: '/edit/$deckId', params: { deckId: created.deckId } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  return (
    <main className="ts-home ts-decks-page">
      <header className="ts-home-head">
        <GtMark width={38} height={24} />
        <h1>Decks</h1>
        <p>
          Every deck this studio holds, newest first. The root address opens the newest one in the
          editor; a new deck starts from the GT brand template or from one title slide.
        </p>
        {hosting.notice ? (
          <p className="ts-home-notice" role="status" data-store={hosting.store}>
            {hosting.notice}.
          </p>
        ) : null}
      </header>
      <div className="ts-decks-tools">
        <button
          type="button"
          className={creating ? 'pt-ib is-text is-on' : 'pt-ib is-text is-solid'}
          title="Create a deck from a template"
          data-control="decks.new"
          aria-expanded={creating}
          onClick={() => setCreating((open) => !open)}
        >
          <span className="pt-lb">New deck</span>
        </button>
        <span className="ts-decks-count">{`${decks.length} deck${decks.length === 1 ? '' : 's'}`}</span>
      </div>
      {creating ? (
        <form className="ts-decks-form" onSubmit={submit} data-control="decks.form">
          <label className="ts-decks-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              autoFocus
              placeholder="Q4 review"
              aria-label="Deck name"
              data-control="decks.name"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset className="ts-decks-templates">
            <legend>Template</legend>
            {TEMPLATES.map((template) => (
              <label key={template.id} className="ts-decks-template">
                <input
                  type="radio"
                  name="from"
                  value={template.id}
                  checked={from === template.id}
                  aria-label={template.label}
                  data-control={`decks.from.${template.id}`}
                  onChange={() => setFrom(template.id)}
                />
                <span className="ts-decks-radio" aria-hidden="true" />
                <b>{template.label}</b>
                <span className="ts-decks-detail">{template.detail}</span>
              </label>
            ))}
          </fieldset>
          <div className="ts-decks-actions">
            <button
              type="submit"
              className="pt-ib is-text is-solid"
              title="deck.create"
              data-control="decks.create"
              disabled={busy || name.trim() === ''}
            >
              <span className="pt-lb">{busy ? 'Creating' : 'Create and open'}</span>
            </button>
            <button
              type="button"
              className="pt-ib is-text"
              title="Close the form"
              data-control="decks.cancel"
              onClick={() => setCreating(false)}
            >
              <span className="pt-lb">Cancel</span>
            </button>
            {error ? <span className="ts-decks-error">{error}</span> : null}
          </div>
        </form>
      ) : null}
      {decks.length === 0 ? (
        <p className="ts-home-empty">
          No decks yet. Create one above, run <code>turboslide deck create</code>, or add a folder
          under decks/ with a deck.json.
        </p>
      ) : (
        <ul className="ts-decks-list">
          {decks.map((deck) => (
            <DeckRow key={deck.id} deck={deck} />
          ))}
        </ul>
      )}
      <footer className="ts-home-foot">
        Node {health.node}. The sheet is {health.sheet[0]} by {health.sheet[1]}. Store:{' '}
        {hosting.store} ({hosting.reason}){hosting.persistent ? '' : ', not persistent'}.
      </footer>
    </main>
  );
}

function DeckRow({ deck }: { deck: DeckSummary }) {
  return (
    <li className="ts-decks-row" data-deck={deck.id}>
      <div className="ts-decks-name">
        <Link to="/edit/$deckId" params={{ deckId: deck.id }} className="ts-decks-title">
          {deck.title}
        </Link>
        <span className="ts-decks-id">{deck.id}</span>
      </div>
      <span className="ts-decks-cell">{`${deck.slides} slide${deck.slides === 1 ? '' : 's'}`}</span>
      <span className="ts-decks-cell">{`r${deck.revision}`}</span>
      <span className="ts-decks-cell ts-decks-updated" title={deck.updatedAt}>
        {formatStamp(deck.updatedAt)}
      </span>
      <span className="ts-decks-links">
        <Link
          to="/edit/$deckId"
          params={{ deckId: deck.id }}
          className="pt-ib is-text"
          title="Open the deck in the editor"
          data-control={`decks.open.${deck.id}`}
        >
          <span className="pt-lb">Open</span>
        </Link>
        <Link
          to="/edit/$deckId"
          params={{ deckId: deck.id }}
          search={{ export: 1 }}
          className="pt-ib is-text"
          title="Open the deck with the Export menu"
          data-control={`decks.export.${deck.id}`}
        >
          <span className="pt-lb">Export</span>
        </Link>
      </span>
    </li>
  );
}
