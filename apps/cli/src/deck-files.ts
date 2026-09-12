// The deck on disk (SPEC 4.1): deck.json plus slides/<slideId>.json, the render records under
// .turboslide/, and known-findings.json. Reads only; the typed write path is M2 (@turboslide/store).
// Deck resolution (SPEC 7.2 --deck): the flag, TURBOSLIDE_DECK, the nearest deck.json upward from
// the working directory, then a single deck under decks/ (or decks/gt-brand) so the acceptance
// lines run from the repo root without a flag.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import type { KnownFinding } from '@turboslide/schema/findings';
import type { RenderRecord } from '@turboslide/schema/render';

import { UsageError } from './exit.ts';

export type LoadedDeck = DeckDocument & {
  dir: string;
  order: string[];
  /** Slide ids listed in deck.json whose file is missing. */
  missing: string[];
  /** Files under slides/ that no section lists. */
  orphans: string[];
};

export function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new UsageError(
      `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function findDeckDir(
  cwd: string,
  flag?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidates: string[] = [];
  if (flag) candidates.push(resolve(cwd, flag));
  else if (env.TURBOSLIDE_DECK) candidates.push(resolve(cwd, env.TURBOSLIDE_DECK));
  else {
    let dir = cwd;
    for (;;) {
      candidates.push(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const decks = join(cwd, 'decks');
    if (existsSync(decks) && statSync(decks).isDirectory()) {
      const entries = readdirSync(decks).filter((d) => existsSync(join(decks, d, 'deck.json')));
      if (entries.includes('gt-brand')) candidates.push(join(decks, 'gt-brand'));
      else if (entries.length === 1) candidates.push(join(decks, entries[0] ?? ''));
    }
  }
  for (const dir of candidates) {
    const manifest = dir.endsWith('deck.json') ? dir : join(dir, 'deck.json');
    if (existsSync(manifest)) return dirname(manifest);
  }
  throw new UsageError(
    flag
      ? `no deck.json under ${resolve(cwd, flag)}`
      : `no deck found: pass --deck <dir>, set TURBOSLIDE_DECK, or run inside a deck directory (or a repo with decks/gt-brand)`,
  );
}

/** Read deck.json and every slide file the sections list; shape checks are the validator's job. */
export function loadDeck(dir: string): LoadedDeck {
  const raw = readJson(join(dir, 'deck.json'));
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { sections?: unknown }).sections))
    throw new UsageError(`${join(dir, 'deck.json')} has no sections array`);
  const deck = raw as Deck;
  const order = slideOrder(deck);
  const slides: Record<string, Slide> = {};
  const missing: string[] = [];
  for (const id of order) {
    const path = join(dir, 'slides', `${id}.json`);
    if (!existsSync(path)) {
      missing.push(id);
      continue;
    }
    slides[id] = readJson(path) as Slide;
  }
  const slidesDir = join(dir, 'slides');
  const listed = new Set(order);
  const orphans = existsSync(slidesDir)
    ? readdirSync(slidesDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => basename(f, '.json'))
        .filter((id) => !listed.has(id))
    : [];
  return { dir, deck, slides, order, missing, orphans };
}

/** `.turboslide/` beside the deck's repo root: derived files land there (SPEC 7.2). */
export function derivedDir(deckDir: string, cwd: string): string {
  const root = repoRootFor(deckDir) ?? cwd;
  return join(root, '.turboslide');
}

/** The nearest ancestor holding pnpm-workspace.yaml or a .git directory. */
export function repoRootFor(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readKnownFindings(deckDir: string): KnownFinding[] {
  const path = join(deckDir, 'known-findings.json');
  if (!existsSync(path)) return [];
  const raw = readJson(path);
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { findings?: unknown }).findings)
      ? (raw as { findings: unknown[] }).findings
      : null;
  if (!rows)
    throw new UsageError(
      `${path} must be an array of { rule, slideId, blockId?, reason } or { findings: [...] }`,
    );
  return rows as KnownFinding[];
}

export function readRenderRecords(path: string): RenderRecord[] {
  if (!existsSync(path)) return [];
  const raw = readJson(path);
  if (!Array.isArray(raw)) throw new UsageError(`${path} must be a RenderRecord[]`);
  return raw as RenderRecord[];
}

export function resolveOut(cwd: string, out: string | undefined, fallback: string): string {
  const path = out ?? fallback;
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/** Slide rows for `info` and `slides`: n, section, title and kind in deck order. */
export function slideRows(
  loaded: LoadedDeck,
): { id: string; n: number; section: string; sectionId: string; title: string; kind: string }[] {
  const rows: {
    id: string;
    n: number;
    section: string;
    sectionId: string;
    title: string;
    kind: string;
  }[] = [];
  let n = 0;
  for (const section of loaded.deck.sections) {
    for (const id of section.slideIds) {
      n += 1;
      const slide = loaded.slides[id];
      rows.push({
        id,
        n,
        section: section.name,
        sectionId: section.id,
        // a slide with an empty heading is "Slide n" (gslides-parity SPEC 5.4), as the studio titles it
        title: slide ? slideTitle(slide, n) : id,
        kind: slide?.kind ?? 'missing',
      });
    }
  }
  return rows;
}
