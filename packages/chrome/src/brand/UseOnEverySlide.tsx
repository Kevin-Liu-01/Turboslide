import type { BrandMutation } from '@turboslide/schema/brand';
import { brandWriteMutation } from '@turboslide/schema/brand';
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import { useContext } from 'react';

import { EditorShellContext } from '../editor-shell-context';
import { PanelButton } from '../inspector/fields';
import { PANELS, SNACKBARS } from '../menus/strings';

/**
 * Use on every slide (docs/PRODUCT.md 4.1, 4.4; audit-brand 2): a selected picture becomes the
 * brand kit's logo, on the title slide's slot and in the footer of every slide, as one commit of
 * the kit writes (`/mark`, `/footer/logo`, `/footer/assetId`), removing nothing from the slide;
 * the snackbar reads "Your logo is on every slide" with Undo, and New slide and the exports carry
 * it. The plan is one function so the picture's right click row (`format.image.useOnEverySlide`,
 * the menu model by request), the Format options button (`formatOptions.picture.useOnEverySlide`,
 * mounted by the picture section) and a test all run the same mutations.
 */
export function useOnEverySlidePlan(
  document: DeckDocument,
  block: Block,
): { mutations: Mutation[]; label: string } | { refused: string } {
  if (block.type !== 'picture' && block.type !== 'shot')
    return { refused: 'Select a picture first' };
  const assetId = block.asset;
  if (typeof assetId !== 'string' || document.deck.assets[assetId] === undefined)
    return { refused: 'The picture has no stored file yet' };
  return useOnEverySlidePlanForAsset(document, assetId);
}

/**
 * The same plan over an asset id (docs/FEATURES.md 4.4; the logo picker's "Use as this
 * presentation's logo on every slide" and the Brand kit's Find a logo reuse it): the kit's
 * `/mark`, `/footer/logo` and `/footer/assetId` as three writes of one commit. The asset need not
 * be in the document yet when the caller commits the record in the same write (the logo insert
 * does), so nothing here reads the assets.
 */
export function useOnEverySlidePlanForAsset(
  document: Pick<DeckDocument, 'deck'>,
  assetId: string,
): { mutations: Mutation[]; label: string } {
  const first: BrandMutation = brandWriteMutation(document.deck, '/mark', {
    kind: 'picture',
    assetId,
  });
  // each write reads the deck as the one before leaves it, so a deck without a record gets one
  // record with both slots and Undo removes it whole
  const afterFirst = {
    brand: { ...(document.deck.brand ?? {}), mark: { kind: 'picture' as const, assetId } },
  };
  const second: BrandMutation = brandWriteMutation(afterFirst, '/footer/logo', 'picture');
  const afterSecond = {
    brand: {
      ...afterFirst.brand,
      footer: { ...(afterFirst.brand.footer ?? {}), logo: 'picture' as const },
    },
  };
  const third: BrandMutation = brandWriteMutation(afterSecond, '/footer/assetId', assetId);
  return { mutations: [first, second, third] as Mutation[], label: 'Brand kit: Logo' };
}

/** The button in a picture's Format options (PRODUCT.md 7.1 `formatOptions.picture.useOnEverySlide`). */
export function UseOnEverySlideButton({ block }: { block: Block }) {
  const shell = useContext(EditorShellContext);
  if (shell === null) return null;
  const { input } = shell;
  const words = PANELS.brand;
  const run = () => {
    const plan = useOnEverySlidePlan(input.document, block);
    if ('refused' in plan) {
      shell.say(plan.refused);
      return;
    }
    if (input.commit === undefined) {
      shell.say(words.noKitYet);
      return;
    }
    const undo = input.history?.undo;
    input
      .commit(plan.mutations, plan.label)
      .then(() =>
        shell.say(
          words.logoEverySlide,
          undo === undefined ? undefined : { label: SNACKBARS.undo, run: () => undo() },
        ),
      )
      .catch((error: unknown) => shell.say(error instanceof Error ? error.message : String(error)));
  };
  return (
    <PanelButton
      label={words.useOnEverySlide}
      doc={words.useOnEverySlideDoc}
      control="formatOptions.picture.useOnEverySlide"
      onClick={run}
    />
  );
}
