/**
 * The menu bar's titles in the default view (the advanced tools off), as
 * `visibleMenus(DEFAULT_MENU_CONTEXT)` in ./model.ts lists them; __tests__/default-titles.test.ts
 * pins the two equal. The editor's skeleton (apps/studio/src/components/EditorSkeleton.tsx) draws
 * these words where the menu bar will stand. The skeleton is the pending component of /new and
 * /edit, so it is in the chunk every route loads, and it reads this list and not the menu model,
 * which is 67 KB (polish two, P2-V1.4 finding 6; SPEC-4 3.12).
 */
export const DEFAULT_MENU_TITLES: ReadonlyArray<string> = [
  'File',
  'Edit',
  'View',
  'Insert',
  'Format',
  'Slide',
  'Arrange',
  'Tools',
  'Help',
];
