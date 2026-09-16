// The import lane's handlers (gslides-parity SPEC-5 5.3, 5.5; MILESTONES-5 B3 days 5 and 6):
// `import.pptx` and `theme.import`. Landed empty by the integrator on day 0 as the seam of SPEC-5
// 1.6; B3 fills the registrations here and keeps the module free of `node:` imports (the editor
// page imports this graph through store-actions.ts). The Node needs (the file read, the zip, the
// deck folder write) come through `LaneDeps.imports`, the `ImportLaneDeps` bridge of
// `@turboslide/import/lane` that `importLaneDeps` (`@turboslide/import/lane-node`) composes for the
// CLI and the hosted dispatcher (b3.md request B3-7); without the bridge both handlers refuse with
// the sentence naming the composition.
//
// `import.pptx` reads the file into a new deck folder under decks/ (the report with `deckId`), or
// answers the report alone under `dryRun` with the document beside it when the action's output
// admits it (B3-8). `theme.import` appends one theme record to In this presentation (at most
// five, the sixth refused with its sentence) in one `deck.set /importedThemes` write, so one Undo
// removes it; `theme.applyImported` (B6) writes a record into the edit record.
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type {
  ImportLaneDeps,
  ImportPptxAnswer,
  ImportPptxRequest,
  ThemeImportRequest,
} from '@turboslide/import/lane';
import {
  appendImportedTheme,
  importBridgeSentence,
  pickThemeRecord,
} from '@turboslide/import/lane';
import { ACTIONS } from '@turboslide/schema/actions';
import type { ThemeRecord } from '@turboslide/schema/deck';
import { deckPage } from '@turboslide/schema/render';

import { commit } from '../store-actions.ts';
import type { WriteContext } from '../store-actions.ts';
import type { LaneDeps } from './deps.ts';

/** `LaneDeps` with the bridge the integrator composes (B3-7); read structurally so the seam lands in any order. */
export type ImportActionDeps = LaneDeps & { imports?: ImportLaneDeps };

export type ThemeImportInput = ThemeImportRequest & { baseRevision: number };
export type ThemeImportResult = {
  record: ThemeRecord;
  index: number;
  importedThemes: ThemeRecord[];
  revision: number;
};

function bridgeOf(deps: ImportActionDeps, id: string): ImportLaneDeps {
  if (deps.imports === undefined) throw new TypeError(importBridgeSentence(id));
  return deps.imports;
}

/**
 * The answer of `import.pptx`: the report, plus the deck and the slides under `dryRun` when the
 * action's output schema admits them (b3.md request B3-8); the report alone until it does, so the
 * dispatcher's output check never fails on a field it does not know.
 */
export function fitImportAnswer(answer: ImportPptxAnswer): ImportPptxAnswer {
  if (answer.deck === undefined && answer.slides === undefined) return answer;
  const output = ACTIONS['import.pptx'].output;
  if (output.safeParse(answer).success) return answer;
  const { deck: _deck, slides: _slides, ...report } = answer;
  return report;
}

/** `import.pptx` as a function of its input over the bridge and the current deck (the `fit` target). */
export async function importPptxAction(
  deps: ImportActionDeps,
  input: ImportPptxRequest,
): Promise<ImportPptxAnswer> {
  const bridge = bridgeOf(deps, 'import.pptx');
  const current = (await deps.store.read()).document;
  const answer = await bridge.importPptx(input, {
    currentPage: deckPage(current.deck),
    ...(deps.hosted?.deckId !== undefined ? { deckId: deps.hosted.deckId } : {}),
  });
  return fitImportAnswer(answer);
}

/** `theme.import`: one record appended to `/importedThemes` in one write. */
export async function themeImport(
  deps: ImportActionDeps,
  ctx: WriteContext,
  input: ThemeImportInput,
): Promise<ThemeImportResult> {
  const bridge = bridgeOf(deps, 'theme.import');
  if ((input.file === undefined) === (input.deckId === undefined))
    throw new TypeError('theme.import takes file or deckId, not both and not neither');
  const current = (await deps.store.read()).document;
  const records = await bridge.themeRecords({
    ...(input.file !== undefined ? { file: input.file } : {}),
    ...(input.deckId !== undefined ? { deckId: input.deckId } : {}),
    ...(input.themeIndex !== undefined ? { themeIndex: input.themeIndex } : {}),
  });
  const source = input.file ?? input.deckId ?? 'the source';
  const record = pickThemeRecord(records, input.themeIndex, source);
  const { importedThemes, index } = appendImportedTheme(current.deck.importedThemes, record);
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'deck.set', path: '/importedThemes', value: importedThemes },
  ]);
  return { record, index, importedThemes, revision: committed.revision };
}

/** The handlers this lane registers on a dispatcher. */
export function registerImportActions(dispatcher: Dispatcher, deps: LaneDeps): void {
  const lane = deps as ImportActionDeps;
  dispatcher.register('import.pptx', (input) => importPptxAction(lane, input as ImportPptxRequest));
  dispatcher.register('theme.import', (input, ctx: ActionContext) =>
    themeImport(lane, ctx, input as ThemeImportInput),
  );
}
