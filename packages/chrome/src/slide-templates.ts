// The slide templates, kept as a thin view over the layout list (gslides-parity SPEC 5.1: the
// fifteen templates became the 21 entries of packages/schema/src/layouts.ts, with their placeholder
// copy replaced by empty Texts and live prompts). Sidebar.tsx still reads SLIDE_TEMPLATES and
// templateTitle for its row menu; once its rewrite (B4) reads the layouts directly this file is
// deleted, so nothing new imports it. Pure: no React, no DOM.
import type { Deck, LayoutType, Slide, SlideKind } from '@turboslide/schema/deck';
import type { SlideId } from '@turboslide/schema/ids';
import type { LayoutEntry, LayoutId } from '@turboslide/schema/layouts';
import { LAYOUTS } from '@turboslide/schema/layouts';

import type { IconName } from './icons';
import { KIND_ICONS } from './inspector/sections';

export { pickAsset } from '@turboslide/schema/layouts';

export type SlideTemplateId = LayoutId;

export type SlideTemplate = {
  id: SlideTemplateId;
  /** Google's name for the first eleven, the GT name after the rule (layouts.ts) */
  label: string;
  kind: SlideKind;
  layout?: LayoutType;
  doc: string;
  /** the module the entry comes from */
  source: string;
  icon: IconName;
  make: (id: SlideId, deck: Deck, sectionId: string) => Slide | null;
};

function fromLayout(entry: LayoutEntry): SlideTemplate {
  return {
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    ...(entry.layout === undefined ? {} : { layout: entry.layout }),
    doc: entry.doc,
    source: 'layouts.ts',
    icon: KIND_ICONS[entry.kind],
    make: entry.make,
  };
}

/** The 21 layouts in the one order (SPEC 5.2), as templates. */
export const SLIDE_TEMPLATES: ReadonlyArray<SlideTemplate> = LAYOUTS.map(fromLayout);

/** The row label of a template: the layout's name. */
export function templateTitle(template: SlideTemplate): string {
  return template.label;
}
