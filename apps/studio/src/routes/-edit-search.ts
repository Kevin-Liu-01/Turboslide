import type { ShellMode } from '@turboslide/chrome/shell-data';
import type { Theme } from '@turboslide/viewer/theme';

// Search params of the editor (SPEC 6.1): ?mode, ?edit=0|1, ?theme, ?twin=1, ?lint=1, ?src=1,
// plus ?author= and ?comment=, shared by /edit/$deckId and /new (routes/new.tsx). A file whose
// name starts with a dash is not a route (TanStack Router's file conventions), so the two routes
// read the validator from here without one importing the other's module (gslides-parity SPEC-4
// 0.44: the namespace import new.tsx carried pulled the editor into the entry).

export type EditSearch = {
  mode?: ShellMode;
  theme?: Theme;
  /** 0 turns editing off; absent or 1 is the editor's default */
  edit?: 0 | 1;
  twin?: 1;
  lint?: 1;
  src?: 1;
  /** opens the Export menu on load (the deck list's Export link) */
  export?: 1;
  author?: string;
  /** the thread whose card opens on load (`comment.link`'s target, SPEC-3 5.9) */
  comment?: string;
};

function isMode(value: unknown): value is ShellMode {
  return value === 'slide' || value === 'grid' || value === 'book';
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function flag(value: unknown): value is 1 {
  return value === 1 || value === '1' || value === true;
}

function off(value: unknown): value is 0 {
  return value === 0 || value === '0' || value === false;
}

export function validateEditSearch(search: Record<string, unknown>): EditSearch {
  const out: EditSearch = {};
  if (isMode(search.mode)) out.mode = search.mode;
  if (isTheme(search.theme)) out.theme = search.theme;
  if (off(search.edit)) out.edit = 0;
  else if (flag(search.edit)) out.edit = 1;
  if (flag(search.twin)) out.twin = 1;
  if (flag(search.lint)) out.lint = 1;
  if (flag(search.src)) out.src = 1;
  if (flag(search.export)) out.export = 1;
  if (typeof search.author === 'string' && search.author.trim()) out.author = search.author;
  if (typeof search.comment === 'string' && /^[0-9a-hjkmnp-tv-z]{26}$/.test(search.comment))
    out.comment = search.comment;
  return out;
}
