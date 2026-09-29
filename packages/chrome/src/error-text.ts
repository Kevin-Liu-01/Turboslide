// The sentence a refused write shows a seller (the polish round, docs/POLISH.md item 59; B1's
// R11): a validator's refusal names a pointer and a schema word ("slides/split-1.json
// /slots/main/2/size: Invalid option: expected one of 20|18|17|16|15", "…/typography: Unknown
// field"), which stays in the console and the ledger; the snackbar reads one sentence in the
// control's own vocabulary. Every other error keeps its message, which the product's own paths
// already word as sentences.

/** A validator refusal: `<file> <pointer>: <schema words>` or `<pointer>: <schema words>`. */
const VALIDATOR_REFUSAL = /^(?:slides\/\S+ )?\/[^\s:]*: /;

/** The sentence of a validator refusal, by what the schema said. */
export function validatorSentence(message: string): string {
  const words = message.replace(VALIDATOR_REFUSAL, '');
  if (/unknown field|unrecognized key/i.test(words)) return 'This object has no such setting';
  if (/invalid option|expected one of/i.test(words)) return 'That value is not one the field takes';
  if (/too small|too big|at most|at least|greater than|less than/i.test(words))
    return 'That value is outside the range the field takes';
  if (/expected (string|number|boolean|array|object)/i.test(words))
    return 'That value is not the kind the field takes';
  return 'That value is not one the field takes';
}

/** True for a message the validator wrote with its pointer. */
export function isValidatorRefusal(message: string): boolean {
  return VALIDATOR_REFUSAL.test(message);
}

/** The text a refused write's snackbar shows: a sentence for a validator refusal, the message otherwise. */
export function refusalText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return isValidatorRefusal(message) ? validatorSentence(message) : message;
}
