import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';

import { ConnectCard } from '@turboslide/chrome/ConnectCard';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { GtMark } from '@turboslide/chrome/GtMark';
import type { DeckTemplateId } from '@turboslide/schema/actions';
import type { UnpackResult } from '@turboslide/store/unpack';

import { bundleDownloadTicket, bundleUploadTicket, connectFacts } from '../server/bundle';
import { createNewDeck, getHostingFacts, listDecks } from '../server/decks';
import type { DeckSummary } from '../server/decks';
import { getServerHealth } from '../server/health';

import './decks.css';

// The deck list at /decks (SPEC 3.4 put it at `/`; Kevin's directive moved `/` to the editor):
// every deck the store holds, newest first, with a New deck form (the name and the template, one
// deck.create through the server function), an Upload deck bundle form (docs/deck-transfer.md:
// the zip goes to POST /api/decks/bundle with a ticket from the bundleUploadTicket server
// function, so the page never holds the bearer token), a row per deck (name, slides, revision,
// updated, Open, Present, Export, Download bundle through GET /api/decks/<id>/bundle with a ticket
// from bundleDownloadTicket) and the Connect card naming the CLI's push and pull commands with
// this deployment's URL. SSR. It also calls the health server function so every build exercises
// the server-only marker scripts/check-client-bundle.mjs looks for (AGENTS.md, contracts between
// builders), and the hosting facts so the footer names the store (file, tmp or blob) and its
// notice. The file is decks.index.tsx, not decks.tsx: a decks.tsx would become the layout
// route of decks.$deckId.assets.$ and run this loader for every asset request.
export const Route = createFileRoute('/decks/')({
  loader: async () => {
    const [decks, health, hosting, connect] = await Promise.all([
      listDecks(),
      getServerHealth(),
      getHostingFacts(),
      connectFacts(),
    ]);
    return { decks, health, hosting, connect };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type BundleAnswer = UnpackResult & { editUrl: string };
type BundleRefusal = { error?: { message?: string; status?: number } };

/** The upload route's answer as the message the form shows, or the created deck. */
async function readUploadAnswer(response: Response): Promise<BundleAnswer> {
  const body = (await response.json()) as BundleAnswer | BundleRefusal;
  if (!response.ok) {
    const refusal = body as BundleRefusal;
    throw new Error(refusal.error?.message ?? `the upload answered ${response.status}`);
  }
  return body as BundleAnswer;
}

/** Downloads through a one-time anchor; a same-origin URL of ours is already an attachment. */
function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

type Panel = 'new' | 'upload' | null;

function DecksPage() {
  const { decks, health, hosting, connect } = Route.useLoaderData();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState('');
  const [from, setFrom] = useState<DeckTemplateId>('gt-brand');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const page = useRef<HTMLElement>(null);

  /* the page announces hydration: a click on the server's HTML before the handlers are attached
     is lost (measured on the dev server: Upload at +0 ms opened nothing, at +1.5 s the panel
     appeared), so the e2e specs and the drive wait for `.ts-decks-page[data-hydrated]` */
  useEffect(() => {
    page.current?.setAttribute('data-hydrated', '');
  }, []);

  const toggle = (which: Exclude<Panel, null>) =>
    setPanel((open) => (open === which ? null : which));

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
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setUploadError(null);
  };

  /* the zip goes to the route with a ticket from the server function; the page never holds the token */
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file === null || uploading !== null) return;
    setUploadError(null);
    setUploading(`Uploading ${file.name}`);
    try {
      const ticket = await bundleUploadTicket();
      if (file.size > ticket.maxBytes) {
        throw new Error(
          `${file.name} is ${file.size} bytes; a bundle is at most ${ticket.maxBytes} bytes`,
        );
      }
      const url = new URL(ticket.url, window.location.origin);
      if (replace) url.searchParams.set('replace', '1');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/zip', accept: 'application/json' },
        body: file,
      });
      const answer = await readUploadAnswer(response);
      setUploading(`${answer.replaced ? 'Replaced' : 'Created'} ${answer.deckId}, opening`);
      await navigate({ to: '/edit/$deckId', params: { deckId: answer.deckId } });
    } catch (caught) {
      setUploadError(errorMessage(caught));
      setUploading(null);
    }
  };

  return (
    <main ref={page} className="ts-home ts-decks-page">
      <header className="ts-home-head">
        <GtMark width={38} height={24} />
        <h1>Decks</h1>
        <p>
          Every deck this studio holds, newest first. The root address opens the newest one in the
          editor; a new deck starts from the GT brand template or from one title slide, or arrives
          as a bundle from another studio or a checkout.
        </p>
        {hosting.notice ? (
          <p className="ts-home-notice" role="status" data-store={hosting.store}>
            {hosting.notice}.
          </p>
        ) : null}
      </header>
      <div className="ts-decks-tools">
        <span className="ts-decks-links">
          <button
            type="button"
            className={panel === 'new' ? 'pt-ib is-text is-on' : 'pt-ib is-text is-solid'}
            title="deck.create: a deck from the GT brand template or one title slide"
            data-control="decks.new"
            aria-expanded={panel === 'new'}
            onClick={() => toggle('new')}
          >
            <span className="pt-lb">New deck</span>
          </button>
          <button
            type="button"
            className={panel === 'upload' ? 'pt-ib is-text is-on' : 'pt-ib is-text'}
            title="deck.unpack: a deck from a bundle zip made by Download bundle or turboslide deck pack"
            data-control="decks.upload"
            aria-expanded={panel === 'upload'}
            onClick={() => toggle('upload')}
          >
            <span className="pt-lb">Upload deck bundle</span>
          </button>
        </span>
        <span className="ts-decks-count">{`${decks.length} deck${decks.length === 1 ? '' : 's'}`}</span>
      </div>
      {panel === 'new' ? (
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
              title="deck.create: make the deck and open it in the editor"
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
              onClick={() => setPanel(null)}
            >
              <span className="pt-lb">Cancel</span>
            </button>
            {error ? <span className="ts-decks-error">{error}</span> : null}
          </div>
        </form>
      ) : null}
      {panel === 'upload' ? (
        <form className="ts-decks-upload" onSubmit={upload} data-control="decks.upload-form">
          <p className="ts-decks-upload-lead">
            A bundle is the zip Download bundle or <code>turboslide deck pack</code> writes:
            deck.json, the slides, the assets and the versions with a manifest. It is validated
            before anything is written; a deck of the same id gets a free sibling id unless you
            replace it.
          </p>
          <label className="ts-decks-file">
            <span>Bundle zip</span>
            <input
              type="file"
              accept=".zip,application/zip"
              aria-label="Bundle zip"
              data-control="decks.bundle-file"
              onChange={onFile}
            />
          </label>
          <label
            className="ts-decks-check"
            title="Remove the deck that holds the bundle's id first, instead of writing a sibling"
          >
            <span>Replace a deck with the same id</span>
            <input
              type="checkbox"
              checked={replace}
              aria-label="Replace a deck with the same id"
              data-control="decks.bundle-replace"
              onChange={(event) => setReplace(event.target.checked)}
            />
            <span className="ts-decks-box" aria-hidden="true" />
          </label>
          <div className="ts-decks-actions">
            <button
              type="submit"
              className="pt-ib is-text is-solid"
              title="deck.unpack: upload the bundle, create the deck and open it in the editor"
              data-control="decks.bundle-submit"
              disabled={file === null || uploading !== null}
            >
              <span className="pt-lb">{uploading !== null ? 'Uploading' : 'Upload and open'}</span>
            </button>
            <button
              type="button"
              className="pt-ib is-text"
              title="Close the form"
              data-control="decks.upload-cancel"
              onClick={() => setPanel(null)}
            >
              <span className="pt-lb">Cancel</span>
            </button>
            {uploading !== null ? (
              <span
                className="ts-decks-progress"
                role="status"
                data-control="decks.upload-progress"
              >
                {uploading}
              </span>
            ) : null}
            {uploadError ? (
              <span className="ts-decks-error" data-control="decks.upload-error">
                {uploadError}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
      {decks.length === 0 ? (
        <p className="ts-home-empty">
          No decks yet. Create one above, upload a bundle, run <code>turboslide deck create</code>,
          or add a folder under decks/ with a deck.json.
        </p>
      ) : (
        <ul className="ts-decks-list">
          {decks.map((deck) => (
            <DeckRow key={deck.id} deck={deck} />
          ))}
        </ul>
      )}
      <ConnectCard url={connect.url} tokenRequired={connect.tokenRequired} deckId={decks[0]?.id} />
      <footer className="ts-home-foot">
        Node {health.node}. The sheet is {health.sheet[0]} by {health.sheet[1]}. Store:{' '}
        {hosting.store} ({hosting.reason}){hosting.persistent ? '' : ', not persistent'}.
      </footer>
    </main>
  );
}

function DeckRow({ deck }: { deck: DeckSummary }) {
  const [downloading, setDownloading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /* the ticket comes from the server function; the route then answers the zip (or a 302 to a stored copy) */
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setNote(null);
    try {
      const { url } = await bundleDownloadTicket({ deckId: deck.id });
      triggerDownload(url);
    } catch (caught) {
      setNote(errorMessage(caught));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="ts-decks-row" data-deck={deck.id}>
      <div className="ts-decks-name">
        <Link
          to="/edit/$deckId"
          params={{ deckId: deck.id }}
          className="ts-decks-title"
          {...tipProps({ name: deck.title, doc: `Opens ${deck.id} in the editor.` })}
        >
          {deck.title}
        </Link>
        <span className="ts-decks-id">{deck.id}</span>
        {note ? <span className="ts-decks-error">{note}</span> : null}
      </div>
      <span className="ts-decks-cell">{`${deck.slides} slide${deck.slides === 1 ? '' : 's'}`}</span>
      <span className="ts-decks-cell">{`r${deck.revision}`}</span>
      {/* the reader's zone differs from the function's (UTC), so this text is the one hydration
          mismatch on /decks (React 418, measured on the preview 2026-09-11); the client's value wins */}
      <span
        className="ts-decks-cell ts-decks-updated"
        title={deck.updatedAt}
        suppressHydrationWarning
      >
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
          to="/deck/$deckId"
          params={{ deckId: deck.id }}
          search={{ present: 1 }}
          className="pt-ib is-text"
          title="Open the presentation: the viewer in present mode, chrome hidden"
          data-control={`decks.present.${deck.id}`}
        >
          <span className="pt-lb">Present</span>
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
        <button
          type="button"
          className="pt-ib is-text"
          title="deck.pack: download the deck as one bundle zip (deck.json, slides, assets, versions)"
          data-control={`decks.bundle.${deck.id}`}
          disabled={downloading}
          onClick={() => void download()}
        >
          <span className="pt-lb">{downloading ? 'Preparing' : 'Download bundle'}</span>
        </button>
      </span>
    </li>
  );
}
