// What every generated control receives (SPEC 6.5). A control draws one field for one ControlSpec,
// names it with the spec's accessible label and data-control id, and reports the new value
// through onChange; InspectorControl validates the value against the field's schema and the
// Inspector turns it into the one block.set or slide.set write. Controls never touch a document.
import type { Asset } from '@turboslide/schema/assets';
import type { AssetId } from '@turboslide/schema/ids';

import type { ControlSpec } from './generate';

export type ControlContext = {
  /** the deck's assets, for the asset picker */
  assets?: Readonly<Record<AssetId, Asset>>;
  /** resolves a twin path under assets/ to a URL the page can load */
  assetUrl?: (path: string) => string;
  /** the live copy lint for a Text field: the messages for a draft value */
  lintText?: (text: string, spec: ControlSpec) => ReadonlyArray<string>;
};

export type ControlProps = {
  spec: ControlSpec;
  /** the new value at spec.path; undefined removes the field */
  onChange: (value: unknown) => void;
  context?: ControlContext;
  disabled?: boolean;
};

/** The class every visually hidden native mirror of a composite control carries (Seg, icon). */
export const HIDDEN_NATIVE_CLASS = 'ts-native-mirror';

/**
 * The word a person reads for an option value (SPEC 12, the default view words): the values are
 * the schema's tags and stay the control's values, and one of them, the `freeform` layout tag, is
 * an engineering word the chrome never shows (menus/strings.ts FORBIDDEN_DEFAULT_VIEW_WORDS), so
 * the option reads "Blank", the layout's name everywhere else in the chrome (the Layout grid, the
 * layout catalog's `blank`). Every other value reads as written.
 */
const OPTION_WORDS: Readonly<Record<string, string>> = { freeform: 'Blank' };

export function optionLabel(option: string | number): string {
  const raw = String(option);
  return OPTION_WORDS[raw] ?? raw;
}

/** `22` from `'22'` when the options are numbers, else the string itself. */
export function optionValue(
  raw: string,
  options: ReadonlyArray<string | number> | undefined,
): string | number {
  const match = options?.find((option) => String(option) === raw);
  return match ?? raw;
}
