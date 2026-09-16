// Import theme (gslides-parity SPEC-5 0.28, 5.3; MILESTONES-5 B3 day 5): the theme records a
// `.pptx` holds, one per `ppt/theme/themeN.xml` part in number order, each the scheme's eleven
// colours under the theme record keys (`SCHEME_RECORD_KEYS`, the keys `THEME_COLOR_SLOTS` admits),
// the major and minor latin faces as `display` and `text`, and the source file with the part's
// index; and the records another Turboslide deck offers, its edited theme under its name and its
// own imported records. The Themes panel lists them under In this presentation (at most five,
// `appendImportedTheme`); `theme.applyImported` (B6) writes one into the edit record. Node free:
// the entries arrive inflated (`pptxEntries` in pptx/read.ts).
import type { DeckDocument, ThemeRecord } from '@turboslide/schema/deck';
import type { HexColor } from '@turboslide/schema/color';
import { THEME_COLOR_KEYS } from '@turboslide/schema/validate/theme';

import type { PackageEntry } from './pptx/package.ts';
import { openPackage, readPresentation } from './pptx/package.ts';
import { readScheme, themeRecordColors } from './pptx/theme.ts';
import type { Scheme } from './pptx/theme.ts';

/** A scheme as a theme record (SPEC-5 5.3): the eleven colours, the two faces, the source. */
export function themeRecordOf(
  scheme: Scheme,
  source: ThemeRecord['source'],
  fallbackName: string,
): ThemeRecord {
  const name = (scheme.name.trim() || scheme.schemeName.trim() || fallbackName).slice(0, 120);
  const fonts: ThemeRecord['fonts'] = {};
  if (scheme.fonts.major !== undefined) fonts.display = scheme.fonts.major.slice(0, 120);
  if (scheme.fonts.minor !== undefined) fonts.text = scheme.fonts.minor.slice(0, 120);
  return { name, colors: themeRecordColors(scheme), fonts, source };
}

/**
 * Every theme part of a `.pptx` as a record, in `themeN` order (the master's theme first in the
 * files PowerPoint writes). `fileName` is the record's `source.file`.
 */
export function themeRecordsOf(
  entries: readonly PackageEntry[],
  fileName = 'presentation.pptx',
): ThemeRecord[] {
  const pkg = openPackage(entries, { fileName });
  const presentation = readPresentation(pkg);
  return presentation.themes.map((part, index) =>
    themeRecordOf(
      readScheme(pkg.xml(part)),
      { file: fileName, themeIndex: index },
      `Theme ${index + 1}`,
    ),
  );
}

/** The colours of a deck's edit record the theme validator admits, light appearance first. */
function editedColors(document: DeckDocument): Record<string, HexColor> {
  const colors = document.deck.themeEdits?.colors;
  const out: Record<string, HexColor> = {};
  for (const source of [colors?.light, colors?.dark]) {
    if (source === undefined) continue;
    for (const [key, value] of Object.entries(source)) {
      if ((THEME_COLOR_KEYS as ReadonlyArray<string>).includes(key) && out[key] === undefined)
        out[key] = value;
    }
  }
  return out;
}

/**
 * The records another deck offers (`theme.import { deckId }`): its edited theme under the name
 * Rename gave it (the deck title when none) with the colours and faces of the edit record, then
 * its own imported records, every one sourced to that deck. A deck with neither is a RangeError.
 */
export function themeRecordsFromDeck(document: DeckDocument, deckId: string): ThemeRecord[] {
  const records: ThemeRecord[] = [];
  const edits = document.deck.themeEdits;
  if (
    edits !== undefined &&
    (edits.name !== undefined || edits.colors !== undefined || edits.fonts !== undefined)
  ) {
    const fonts: ThemeRecord['fonts'] = {};
    if (edits.fonts?.display !== undefined) fonts.display = edits.fonts.display;
    if (edits.fonts?.text !== undefined) fonts.text = edits.fonts.text;
    records.push({
      name: (edits.name ?? document.deck.title).slice(0, 120) || deckId,
      colors: editedColors(document),
      fonts,
      source: { deckId },
    });
  }
  for (const record of document.deck.importedThemes ?? [])
    records.push({ ...record, source: { deckId } });
  if (records.length === 0)
    throw new RangeError(`${deckId} has no edited theme and no imported themes to copy`);
  return records;
}
