// Import boundary (SPEC 9; MILESTONES M1 item 7): importDeck from @turboslide/import writes
// decks/<into>/ with import-ids.json and import-report.json and returns the report the acceptance
// reads ({ slides, sections, htmlBlocks, ... }, AGENTS.md).
import { importDeck as runImport } from '@turboslide/import/import-deck';
import type { ImportReport } from '@turboslide/import/import-deck';

export type { ImportReport };

export function importDeck(from: string, into: string, decksDir: string): ImportReport {
  return runImport({ from, into, decksDir });
}
