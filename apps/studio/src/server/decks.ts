import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import { slideTitle } from '@turboslide/schema/deck';
import { validateDeck } from '@turboslide/schema/validate';
import type { ViewerDeck, ViewerSlide } from '@turboslide/viewer/model';
import { isPictureKind } from '@turboslide/viewer/model';

import { renderSlide } from './render';
import type { Deck, Slide } from './render';
import { deckDir, repoRoot } from './root';

/**
 * The studio's read side of the document (SPEC 4.1, 5.3): decks/<id>/deck.json
 * plus slides/<slideId>.json through validateDeck (SPEC 4.4), rendered once per
 * slide through renderSlide so the client sets innerHTML and never sees the
 * block model. createServerFn lives only under apps/studio/src/server
 * (SPEC 3.3 item 4).
 *
 * Fallback: while the import of the GT deck has not landed, a request for a
 * missing deck id is served from decks/fixture with `fallback` set, so
 * /deck/gt-brand and the Playwright spec run against the two-slide fixture.
 * A deck that is missing while no fixture exists is a 404.
 */

/** The fixture deck served for a missing id. */
const FALLBACK_DECK = 'fixture';

export type DeckSummary = {
  id: string;
  title: string;
  slides: number;
  sections: number;
  revision: number;
  updatedAt: string;
};

export type DeckPayload = {
  deck: ViewerDeck;
  /** the theme's icon sprite (63 Heroicons plus gt-mark), inlined once per page */
  sprite: string;
  /** validation issues at severity 3, for the console and the sidebar later */
  issues: string[];
};

type Loaded = { deck: Deck; slides: Record<string, Slide>; issues: string[] };

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Reads and validates one deck folder; null when it has no manifest or the manifest fails. */
function loadDeckFolder(dir: string): Loaded | null {
  const manifestPath = join(dir, 'deck.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = readJson(manifestPath);
  const slidesDir = join(dir, 'slides');
  const slides: Record<string, unknown> = {};
  if (existsSync(slidesDir)) {
    for (const file of readdirSync(slidesDir)) {
      if (!file.endsWith('.json')) continue;
      slides[file.slice(0, -5)] = readJson(join(slidesDir, file));
    }
  }
  const result = validateDeck({ deck: manifest, slides });
  if (!result.deck) return null;
  return {
    deck: result.deck,
    slides: result.slides,
    issues: result.issues
      .filter((issue) => issue.severity === 3)
      .map((issue) => `${issue.file}${issue.pointer}: ${issue.message}`),
  };
}

/** The sprite from @turboslide/theme's assets, without its leading comment. */
function readSprite(): string {
  const path = join(repoRoot(), 'packages', 'theme', 'assets', 'sprite.svg');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
}

function buildViewerDeck(
  requestedId: string,
  servedId: string,
  loaded: Loaded,
  theme: 'light' | 'dark',
): ViewerDeck {
  const { deck, slides } = loaded;
  // Twin paths are relative to the deck directory and already start with `assets/` (SPEC 4.1,
  // 4.3), so the base is the deck's URL prefix; the /decks/$deckId/assets/$ route serves the rest.
  const assetBase = `/decks/${servedId}/`;
  const out: ViewerSlide[] = [];
  let n = 0;
  for (const section of deck.sections) {
    for (const slideId of section.slideIds) {
      const slide = slides[slideId];
      if (!slide) continue;
      n += 1;
      const rendered = renderSlide(deck, slide, {
        theme,
        chrome: true,
        assetBase,
        blockAttrs: true,
        gtWord: true,
      });
      const asset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
      const picture =
        isPictureKind(slide.kind) && asset
          ? 'neutral' in asset.twins
            ? { light: assetBase + asset.twins.neutral, dark: assetBase + asset.twins.neutral }
            : { light: assetBase + asset.twins.light, dark: assetBase + asset.twins.dark }
          : undefined;
      out.push({
        id: slideId,
        n,
        title: slideTitle(slide, n),
        kind: slide.kind,
        sectionId: section.id,
        html: rendered.html,
        picture,
        notes: slide.notes,
      });
    }
  }
  return {
    id: requestedId,
    title: deck.title,
    revision: deck.revision,
    sections: deck.sections.map((section) => ({
      id: section.id,
      name: section.name,
      slideIds: section.slideIds.filter((id) => slides[id]),
    })),
    slides: out,
    fallback: servedId === requestedId ? undefined : servedId,
  };
}

/** Every deck under decks/*, for the deck list (SPEC 3.4: `/` is the deck list). */
export const listDecks = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DeckSummary[]> => {
    const root = join(repoRoot(), 'decks');
    if (!existsSync(root)) return [];
    const out: DeckSummary[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(root, entry.name, 'deck.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath) as {
        title?: string;
        sections?: { slideIds: string[] }[];
        revision?: number;
        updatedAt?: string;
      };
      out.push({
        id: entry.name,
        title: manifest.title ?? entry.name,
        slides: (manifest.sections ?? []).reduce(
          (sum, section) => sum + section.slideIds.length,
          0,
        ),
        sections: (manifest.sections ?? []).length,
        revision: manifest.revision ?? 0,
        updatedAt: manifest.updatedAt ?? '',
      });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  },
);

export type GetDeckInput = { deckId: string; theme?: 'light' | 'dark' };

/** The rendered deck for the viewer routes, or null when neither the deck nor the fixture exists. */
export const getDeck = createServerFn({ method: 'GET' })
  .validator((input: GetDeckInput) => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(input.deckId)) throw new Error('deckId must be a slug');
    return input;
  })
  .handler(async ({ data }): Promise<DeckPayload | null> => {
    const theme = data.theme ?? 'dark';
    let servedId = data.deckId;
    let loaded = loadDeckFolder(deckDir(servedId));
    if (!loaded && servedId !== FALLBACK_DECK) {
      servedId = FALLBACK_DECK;
      loaded = loadDeckFolder(deckDir(servedId));
    }
    if (!loaded) return null;
    return {
      deck: buildViewerDeck(data.deckId, servedId, loaded, theme),
      sprite: readSprite(),
      issues: loaded.issues,
    };
  });
