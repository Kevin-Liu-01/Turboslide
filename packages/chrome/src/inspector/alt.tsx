import { useState } from 'react';

import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';

import { FORMAT } from '../menus/strings';
import { tipProps } from '../Tooltip';
import type { SectionWrite } from './fields';

/**
 * Alt text (gslides-parity SPEC-2 0.51, 2.5.6, section 5; R05 B7, Cmd+Option+Y): the description
 * a screen reader reads, on every block. One `block.setAlt` on blur when the text changed: the
 * action writes the block's own `alt`, or the asset's description on a block that shows an asset
 * (two pictures of one asset share one description), and its output names where it went.
 */
export type AltTextSectionProps = {
  block: Block;
  /** the asset the block shows, whose description it shares */
  asset?: Asset;
  write: SectionWrite;
};

export function AltTextSection({ block, asset, write }: AltTextSectionProps) {
  const words = FORMAT.alt;
  const current = asset?.alt ?? block.alt ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const tip = tipProps({ name: words.description, doc: words.doc });
  const commit = () => {
    if (draft === null) return;
    const alt = draft.trim();
    setDraft(null);
    if (alt === current) return;
    write.report(
      write.dispatch('block.setAlt', {
        slideId: write.slideId,
        blockId: block.id,
        alt,
        baseRevision: write.revision,
      }),
    );
  };
  return (
    <label className="ts-fo-alt">
      <span className="ts-fo-field-label">{words.description}</span>
      <textarea
        value={draft ?? current}
        aria-label={words.description}
        data-control="formatOptions.altText.description"
        rows={3}
        disabled={write.busy}
        {...tip}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
    </label>
  );
}
