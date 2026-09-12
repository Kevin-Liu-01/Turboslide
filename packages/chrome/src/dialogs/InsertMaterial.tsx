import { useState } from 'react';

import { MATERIAL_IDS, materialEntry } from '@turboslide/materials/catalog';
import type { MaterialEntry } from '@turboslide/materials/catalog';
import { CATALOG } from '@turboslide/schema/catalog';
import type { MaterialBlock } from '@turboslide/schema/blocks/material';

import { Dialog } from '../Dialog';
import { factsOf, insertBlockPlan } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/** The catalog's available entries, in catalog order. */
export function insertableMaterials(): MaterialEntry[] {
  return MATERIAL_IDS.map((id) => materialEntry(id)).filter(
    (entry): entry is MaterialEntry => entry !== undefined && entry.available,
  );
}

/** The material block a catalog entry inserts under `id`: its recipe, its first preset, the catalog's frame anchor. */
export function materialBlockOf(id: string, entry: MaterialEntry): MaterialBlock {
  const made = CATALOG.material.make(id) as MaterialBlock;
  const preset = entry.presets[0]?.name;
  const block: MaterialBlock = {
    ...made,
    materialId: entry.id,
    alt: `The ${entry.label} material`,
  };
  if (preset === undefined) delete block.preset;
  else block.preset = preset;
  return block;
}

/**
 * Insert > Material (gslides-parity SPEC 2.4, a Turboslide row): the theme's material catalog as
 * a list of rows; a row inserts a `material` block with that recipe and its first preset through
 * one `block.insert` into the current slot. The rows carry `dialog.insertMaterial.pick.<id>` for
 * the window API; the recipe is edited afterwards in Pictures and materials.
 */
export function InsertMaterialDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const words = DIALOGS.insertMaterial;
  const entries = insertableMaterials();

  const pick = (entry: MaterialEntry) => {
    if (busy) return;
    const plan = insertBlockPlan(
      factsOf(input, shell.lastLayout),
      'material',
      (id) => materialBlockOf(id, entry),
      words.title,
    );
    if ('refused' in plan) {
      setError(plan.refused);
      return;
    }
    setBusy(true);
    input
      .dispatch(plan.action, plan.input)
      .then(() => shell.closeDialog())
      .catch((err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Dialog
      title={words.title}
      lead={words.lead}
      onClose={shell.closeDialog}
      width={480}
      control="dialog.insertMaterial"
    >
      {entries.length === 0 ? <p className="ts-dialog-empty">{words.empty}</p> : null}
      <div className="ts-dialog-list" role="listbox" aria-label={words.title}>
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="option"
            aria-selected={false}
            className="ts-dialog-row is-button"
            data-control={`dialog.insertMaterial.pick.${entry.id}`}
            onClick={() => pick(entry)}
            {...tipProps({ name: entry.label, doc: entry.doc })}
          >
            <span className="ts-dialog-row-title">{entry.label}</span>
            <span className="ts-dialog-row-meta">
              {entry.presets.length} preset{entry.presets.length === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
