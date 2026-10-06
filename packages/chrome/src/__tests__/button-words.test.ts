import { describe, expect, it } from 'vitest';

import { ACCOUNT, DIALOGS, HOME } from '../menus/strings';

// Design round pass 2 finding 6 and request 7 (docs/gslides-parity/design-round/requests.md):
// every button reads in Title Case (DECK-GRAMMAR 22), while a heading, a page title and a
// snackbar keep the case of a sentence. These are the button words the verifier found in sentence
// case: the Background dialog's two buttons, the trash's and the gallery's way back to the list,
// Empty Trash and Delete Forever, the name prompt's Sign In and the Sign in dialog's passkey method.

/** The short words Title Case leaves in lower case between the first and the last word. */
const MINOR = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** True when every word starts with a capital, except a minor word inside the label. */
function isTitleCase(label: string): boolean {
  const words = label.split(' ');
  return words.every((word, n) => {
    const inside = n > 0 && n < words.length - 1;
    if (inside && MINOR.has(word)) return true;
    return /^[A-Z0-9]/.test(word);
  });
}

describe('the button words are Title Case (pass 2 finding 6, request 7)', () => {
  it('the predicate reads Title Case and refuses sentence case', () => {
    expect(isTitleCase('Reset to Theme')).toBe(true);
    expect(isTitleCase('Use a Passkey')).toBe(true);
    expect(isTitleCase('Reset to theme')).toBe(false);
    expect(isTitleCase('Empty trash')).toBe(false);
  });

  it('holds for every button the verifier named', () => {
    const buttons: ReadonlyArray<readonly [string, string]> = [
      [DIALOGS.background.resetToTheme, 'Reset to Theme'],
      [DIALOGS.background.addToTheme, 'Add to Theme'],
      [HOME.back, 'Recent Presentations'],
      [HOME.emptyTrash, 'Empty Trash'],
      [HOME.deleteForever, 'Delete Forever'],
      [DIALOGS.deleteForever.ok, 'Delete Forever'],
      [ACCOUNT.namePrompt.signIn, 'Sign In'],
      [ACCOUNT.signInDialog.passkey, 'Use a Passkey'],
    ];
    for (const [word, expected] of buttons) {
      expect(word).toBe(expected);
      expect(isTitleCase(word), word).toBe(true);
    }
  });

  it('keeps the heading, the page title and the snackbar in the case of a sentence', () => {
    expect(HOME.recent).toBe('Recent presentations');
    expect(HOME.trash).toBe('Trash');
    expect(HOME.deleteForeverRefused('The store refused it')).toBe(
      'Delete forever: The store refused it',
    );
  });
});
