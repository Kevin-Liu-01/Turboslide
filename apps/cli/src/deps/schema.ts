// Validation boundary (SPEC 4.4): validateDeck from @turboslide/schema parses, migrates and
// normalizes { deck, slides }; the file-level checks here (a listed slide whose file is missing,
// a file no section lists) are the CLI's own, because the validator takes documents, not a
// directory. Issues are reported in one shape with the file and the JSON pointer.
import { validateDeck } from '@turboslide/schema/validate';
import type { Issue } from '@turboslide/schema/validate';

import type { LoadedDeck } from '../deck-files.ts';

export type ValidationIssue = {
  severity: 'error' | 'warning';
  file: string;
  pointer: string;
  code: string;
  message: string;
};

export type DeckValidation = { ok: boolean; issues: ValidationIssue[] };

function fromSchema(issue: Issue): ValidationIssue {
  return {
    severity: issue.severity === 3 ? 'error' : 'warning',
    file: issue.file,
    pointer: issue.pointer,
    code: issue.code,
    message: issue.message,
  };
}

export function validateLoadedDeck(loaded: LoadedDeck): DeckValidation {
  const issues: ValidationIssue[] = [];
  for (const id of loaded.missing) {
    issues.push({
      severity: 'error',
      file: `slides/${id}.json`,
      pointer: '',
      code: 'missing_file',
      message: `slides/${id}.json is listed in deck.json but missing`,
    });
  }
  for (const id of loaded.orphans) {
    issues.push({
      severity: 'warning',
      file: `slides/${id}.json`,
      pointer: '',
      code: 'unlisted',
      message: `slides/${id}.json is not listed in any section`,
    });
  }
  const result = validateDeck({ deck: loaded.deck, slides: loaded.slides });
  issues.push(...result.issues.map(fromSchema));
  return { ok: result.ok && loaded.missing.length === 0, issues };
}
