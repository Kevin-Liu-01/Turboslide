# B5's hunks for the integrator's files (the features round, ship two)

Each hunk is the smallest edit that mounts this lane's modules; the modules are on the tree and tested. The file order follows the shared file table of docs/FEATURES.md section 6. Every hunk is named in `b5.md` section 4 by its request number.

## R2 `packages/chrome/src/inspector/format-sections.ts` (the section and the route)

`FormatSectionId` gains `'shader'` after `'dither'`:

```ts
  /** the features round, ship two (docs/FEATURES.md 5.3): a shader block's one home */
  | 'shader'
```

`FORMAT_SECTIONS` gains the meta after the `dither` entry (a P0 section, no `advanced` flag; the parks rule reaches it through `parked-controls.ts` `formatOptions.shader`):

```ts
  {
    id: 'shader',
    title: 'Shader',
    icon: 'cube',
    doc: 'The shader’s preset, your brand kit’s colours and Glyphfield’s controls',
  },
```

`leadingFormatSection` reads a material as it reads a chart, so the section leads the panel:

```ts
if (block?.type === 'material') return 'shader';
```

`formatSectionOfBlockControl`, line 281, `if (block.type === 'material') return 'block';` becomes:

```ts
if (block.type === 'material') {
  if (spec.path === '/caption' || spec.path === '/captionSize') return 'text';
  if (spec.path === '/height') return 'size';
  if (spec.path === '/asset') return null;
  return 'shader';
}
```

`OWN_SECTION_PATHS` gains `'/materialId'`, `'/uniforms'`, `'/anchor'`, `'/twoTone'`, `'/plate'`, `'/motion'`, `'/controls'`, `'/palette'` (the section draws them), so no generated row repeats them in the default view; the generated rows of a material stay behind Advanced tools as the chart's do (`renderGeneratedAdvanced('shader')` below).

## R3 `packages/chrome/src/FormatOptions.tsx` (the mount)

The import:

```ts
import { ShaderSection } from './inspector/shader';
```

The filter, beside `case 'chart':`:

```ts
        case 'shader':
          return selected?.type === 'material' && !many;
```

The render, beside `case 'chart':` (the shell's `openDialog` reaches the panel through the `onChangeShader` prop below; `settings` is the `ParkedSettings` shape `editor-shell.ts`'s `ShellSettings` satisfies):

```tsx
            case 'shader':
              return selected?.type !== 'material' ? null : (
                <Section key={section.id} {...common}>
                  <ShaderSection
                    block={selected}
                    deck={deck}
                    write={write}
                    settings={{ advancedTools }}
                    onChange={onChangeShader}
                  />
                  {renderGeneratedAdvanced('shader')}
                </Section>
              );
```

`FormatOptionsProps` gains `onChangeShader?: (anchor: HTMLElement) => void;` ("the Shader section's Change: opens the gallery for the selected block"), and `EditorShell.tsx`'s `<FormatOptions ...>` (1855) passes `onChangeShader={() => openDialog('shaderGallery')}` once B1's R2 names the dialog id (`shaderGallery`); until then the prop is left out and the section hides its Change button.

The remembered collapsed set: nothing to add, `loadCollapsed` reads any `FormatSectionId`.

## R4 `packages/chrome/src/editor-shell.ts` (the shader branch of `insertBlockPlan`)

Under B1's R2 (`case 'insert.shader':` where `case 'insert.material':` was, line 2627):

```ts
    case 'insert.shader':
      return insertBlockPlan(
        facts,
        'material',
        (id) => shaderBlockOf(id, requireMaterial(FEATURED_MATERIAL_IDS[0] ?? 'paper:liquid-metal')),
        'Shader',
      );
```

with `import { shaderBlockOf } from '@turboslide/materials/shader-writes';` and `import { FEATURED_MATERIAL_IDS, requireMaterial } from '@turboslide/materials/catalog';` (the chrome depends on the materials package already). The gallery (B1) hands its own `make` to `insertBlockPlan(facts, 'material', make, 'Shader')`, so this branch serves the menu row's direct insert alone (the row opens the picker in `PICKER_OF`, so the branch is the fallback the palette and the window API reach). `INSERT_SIZES.material` stays `[480, 272]`. The alt is `shaderBlockOf`'s ("The liquid metal shader", 5.4).

## R5 `apps/studio/src/editor/place-insert.ts` (the free rectangle for a shader)

The controller places a chrome `block.insert` of a table or a chart in the largest free rectangle (`wantsPlacement`, `placeInsert`); a shader follows the same rule (docs/FEATURES.md section 1, the placement decision: "neither lane builds a placement of its own"):

```ts
export type PlacedKind = 'table' | 'chart' | 'material';
...
export const INSERT_MIN_SIZE: Readonly<Record<PlacedKind, Size>> = {
  table: [480, 120],
  chart: [320, 160],
  /* the features round, ship two (docs/FEATURES.md 5.4): a shader under 240 by 135 is a swatch */
  material: [240, 135],
};
...
  return block.type === 'table' || block.type === 'chart' || block.type === 'material';
```

`place-insert.test.ts` gains one case: a material insert on a slide with a title lands under the head band, free of the title's box, at 480 by 272 or shrunk to the rectangle.

And in `apps/studio/src/server/actions.ts` `assetDispatcherLoader` (B7's file; the deps of `registerAssetActions`): `placeInsert: (slide, size) => placeInsert(slide, 'material', size).pos` with `import { placeInsert } from '../editor/place-insert';`, so `shader.insert` from an agent lands in the same rectangle the gallery's insert does (materials `shaderInsertPosition` reads it and falls back to the sheet's centre).

## R6 `packages/viewer/src/Editor.tsx` (the one live mount, the kit palette, the scale)

The `MaterialMount` call at 6511 passes the selection, the deck's palette and the sheet's scale (the props are on `MaterialMount.tsx` with today's behaviour when absent):

```tsx
<MaterialMount
  body={body}
  html={shownHtml}
  onError={onError}
  selected={selectedIds(selectionRef.current, extraRef.current)}
  palette={shaderPaletteOfDeck(document.deck)}
  scale={sheetScale}
/>
```

with `import { shaderPaletteOfDeck } from '@turboslide/materials/presets';` (the viewer depends on the materials package). `selectedIds(selectionRef.current, extraRef.current)` is the array the stage already computes for the menus (Editor.tsx 6191 `const ids = selectedIds(selection, extra)` is the same read in render scope: pass `ids`). `sheetScale` is the live scale of the sheet the `scale()` handle answers (the fit scale under Fit); pass that number, or leave the prop out and the mount keeps 2x at every zoom. The palette is stable for a deck (the function returns the module constant for a deck without a kit), so the mount does not remount per render.

## R7 `packages/viewer/src/Selection.tsx` (the chip word)

Line 394, the chip table: `material: 'Picture'` becomes `material: 'Shader'` (docs/FEATURES.md 5.1; audit-shaders 13).

## R8 `apps/studio/src/editor/controller.tsx` (the capturer)

One capturer per editor (`packages/viewer/src/shader-frame.ts` `createShaderFrameCapturer`, docs/FEATURES.md 5.5, judge-design addition 3), created where the controller is built and disposed with it:

```ts
import { createShaderFrameCapturer } from '@turboslide/viewer/shader-frame';
import { ConflictError } from '@turboslide/schema/errors';

const capturer = createShaderFrameCapturer({
  document: () => latest().document,
  /* the frame write is a system write: behind the seller's pending commits, the latest server
       revision as its base, no history entry (5.5) */
  write: async (input) => {
    await idle();
    try {
      const answer = (await runDeckAction({
        deckId,
        action: 'shader.frame',
        input: { ...input, baseRevision: latest().serverRevision },
        author,
      })) as { revision?: number };
      return { ok: true, revision: answer.revision ?? latest().serverRevision };
    } catch (error) {
      if (error instanceof ConflictError) return { ok: false, conflict: true };
      return { ok: false, conflict: false, error };
    }
  },
  /* a browser without WebGL asks the hosted job (5.5) */
  captureHosted: async (slideId, blockId) => {
    await idle();
    await runDeckAction({
      deckId,
      action: 'shader.capture',
      input: { slideId, blockId, baseRevision: latest().serverRevision },
      author,
    });
  },
  onError: (error) => console.warn('shader frame', error),
});
```

Then three call sites: in `commitAs` (or `commit`, whichever sees the applied mutations of this tab's own edit), after the local apply, `capturer.afterCommit(mutations)`; in the undo and redo paths, `capturer.afterCommit(inverse)` with the mutations they apply; once the deck is open (after the first document is published), `capturer.scheduleStale()` so a deck opened with stale frames catches up one block at a time; and `capturer.dispose()` where the controller is torn down. Never from `adoptExternal` (the follower draws the frame the room brings). A draft on `/new` has no room: the write goes through `runDeckAction` the same way once the draft has its id (the draft creating list of B7's `SHADER_DRAFT_CREATING_IDS` carries `shader.frame`).

The `shader.frame` action is on the window transport through B7's `SERVER_SIDE_WINDOW_ACTIONS_F2` once R1 lands, so `runDeckAction` is the one path.

## R9 `packages/chrome/src/Inspector.tsx` and `inspector/material.tsx`

Round one's Inspector draws `MaterialSection` (Inspector.tsx 28, 409 to 460, 712 to 735). The section's one home is the Shader section (docs/FEATURES.md 5.3; audit-shaders 19): drop the import, the material target and the section from `Inspector.tsx`, drop the `MaterialSection` block of `__tests__/materials-sections.test.tsx` (the four cases of "the Material section" and "the Material section’s object target"), delete `packages/chrome/src/inspector/material.tsx` and `material.css`, and drop `"./inspector/material"` from `packages/chrome/package.json`. This lane left the file in place so the shared tree compiles.

## R10 `packages/render/src/block-css.ts`

Line 84, `.ts-sheet .material-label { ... }`: the rule has no element since `render/blocks/material.ts` draws no label (5.5); drop it, and the comment above it reads "before a capture the box is the plate ground and nothing else".

## R11 `apps/studio/vite.deploy.config.ts` (B7)

`PACKAGES_PATTERN` gains `materials/previews/*` so the function reads the stills `shader.list` names (the client reads them as Vite assets either way). 125 files, 136,512 bytes.

## R12 `packages/chrome/src/menus/strings.ts` (optional)

The section's words live in `inspector/shader.tsx` `SHADER_WORDS` and the ten slider sentences in `packages/materials/src/controls.ts` `SHADER_CONTROLS`; if strings.ts takes them, one constant `SHADER_SECTION` and one import to move.
