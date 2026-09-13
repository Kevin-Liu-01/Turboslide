import { useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { unionBox } from '@turboslide/schema/freeform';

import { FORMAT } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { NumberField, Note, ToggleRow } from './fields';
import type { SectionWrite } from './fields';

/**
 * Size & rotation and Position (gslides-parity SPEC-2 section 5, 6.1 row 24; R05 B7): Width,
 * Height, Lock aspect ratio, Rotate as a field and a dial, Flip horizontally and Flip vertically as
 * toggles; From (Top-left or Center), X and Y in sheet px. On any object of any slide kind: a
 * grammar slide's block shows the box the stage measured when the route passes it, and the first
 * edit converts the slide through the store action (1.6). A group shows its union box; a Width or
 * Height edit scales every member about the union (0.102), the flip toggles every member about the
 * union centre, and the rotation is one write about the selection.
 */
export type GeometryBox = { x: number; y: number; w: number; h: number };

export type GeometrySectionProps = {
  blocks: ReadonlyArray<Block>;
  /** the measured boxes of blocks without `pos`, in sheet px (the route's), by id */
  measured?: Readonly<Record<string, GeometryBox>>;
  /** the selection is a group (one rotation, a union box) */
  group?: string;
  write: SectionWrite;
};

/** The box a block shows: its `pos`, else the stage's measured box. */
export function boxOf(
  block: Block,
  measured?: Readonly<Record<string, GeometryBox>>,
): GeometryBox | undefined {
  if (block.pos !== undefined) return block.pos;
  return measured?.[block.id];
}

/** The union of the selection's boxes, or undefined when one box is unknown. */
export function unionOf(
  blocks: ReadonlyArray<Block>,
  measured?: Readonly<Record<string, GeometryBox>>,
): GeometryBox | undefined {
  const boxes: Position[] = [];
  for (const block of blocks) {
    const box = boxOf(block, measured);
    if (box === undefined) return undefined;
    boxes.push({ x: box.x, y: box.y, w: box.w, h: box.h });
  }
  if (boxes.length === 0) return undefined;
  const [x, y, w, h] = unionBox(boxes);
  return { x, y, w, h };
}

/** The members' boxes after a union resize: every box scaled about the union's top left (0.102). */
export function scaleMembers(
  blocks: ReadonlyArray<Block>,
  measured: Readonly<Record<string, GeometryBox>> | undefined,
  union: GeometryBox,
  next: { w: number; h: number },
): Array<{ id: string; pos: Position }> {
  const sx = union.w === 0 ? 1 : next.w / union.w;
  const sy = union.h === 0 ? 1 : next.h / union.h;
  const out: Array<{ id: string; pos: Position }> = [];
  for (const block of blocks) {
    const box = boxOf(block, measured);
    if (box === undefined) continue;
    out.push({
      id: block.id,
      pos: {
        ...(block.pos ?? {}),
        x: Math.round(union.x + (box.x - union.x) * sx),
        y: Math.round(union.y + (box.y - union.y) * sy),
        w: Math.max(1, Math.round(box.w * sx)),
        h: Math.max(1, Math.round(box.h * sy)),
      },
    });
  }
  return out;
}

export function SizeRotationSection({ blocks, measured, group, write }: GeometrySectionProps) {
  const [lock, setLock] = useState(false);
  const words = FORMAT.size;
  const one = blocks.length === 1 ? blocks[0] : undefined;
  const box = one !== undefined ? boxOf(one, measured) : unionOf(blocks, measured);
  const ids = blocks.map((block) => block.id);
  const rotate = one?.pos?.rotate ?? 0;
  const flip = one?.pos?.flip;
  const disabled = write.busy || box === undefined;
  const about = group !== undefined && blocks.length > 1 ? { about: 'selection' as const } : {};

  const setSize = (key: 'w' | 'h', value: number) => {
    if (box === undefined) return;
    const size = Math.max(1, Math.round(value));
    const next = { w: box.w, h: box.h, [key]: size } as { w: number; h: number };
    if (lock && box.w > 0 && box.h > 0) {
      if (key === 'w') next.h = Math.max(1, Math.round((size * box.h) / box.w));
      else next.w = Math.max(1, Math.round((size * box.w) / box.h));
    }
    if (one !== undefined) {
      const pos: Position = { ...(one.pos ?? {}), x: box.x, y: box.y, w: next.w, h: next.h };
      write.report(
        write.dispatch('block.set', {
          slideId: write.slideId,
          blockId: one.id,
          path: '/pos',
          value: pos,
          baseRevision: write.revision,
        }),
      );
      return;
    }
    const mutations: Mutation[] = scaleMembers(blocks, measured, box, next).map((member) => ({
      op: 'block.set',
      slideId: write.slideId,
      blockId: member.id,
      path: '/pos',
      value: member.pos,
    }));
    write.report(
      write.dispatch('slide.update', {
        slideId: write.slideId,
        mutations,
        baseRevision: write.revision,
      }),
    );
  };

  const setRotate = (degrees: number) => {
    const to = ((Math.round(degrees) % 360) + 360) % 360;
    if (write.editor?.rotate && one === undefined) {
      write.editor.rotate(to - rotate, 'selection');
      return;
    }
    write.report(
      write.dispatch('block.rotate', {
        slideId: write.slideId,
        blockIds: ids,
        ...(one !== undefined ? { to } : { by: to - rotate }),
        ...about,
        baseRevision: write.revision,
      }),
    );
  };

  const doFlip = (axis: 'h' | 'v') => {
    write.report(
      write.dispatch('block.flip', {
        slideId: write.slideId,
        blockIds: ids,
        axis,
        ...about,
        baseRevision: write.revision,
      }),
    );
  };

  const flips = new Set<'h' | 'v'>();
  if (flip === 'h' || flip === 'hv') flips.add('h');
  if (flip === 'v' || flip === 'hv') flips.add('v');
  const dialTip = tipProps({
    name: words.rotate,
    doc: 'Drag the dial or type the degrees; Shift snaps to 15 on the canvas',
  });

  return (
    <>
      <div className="ts-fo-fields is-two">
        <NumberField
          label={words.width}
          value={box?.w}
          control="formatOptions.size.width"
          onCommit={(value) => setSize('w', value)}
          disabled={disabled}
          min={1}
          unit="px"
        />
        <NumberField
          label={words.height}
          value={box?.h}
          control="formatOptions.size.height"
          onCommit={(value) => setSize('h', value)}
          disabled={disabled}
          min={1}
          unit="px"
        />
      </div>
      <div className="ts-fo-buttons">
        <ToggleRow
          label={words.lockAspect}
          options={[
            {
              value: 'lock',
              label: words.lockAspect,
              icon: lock ? 'lock-closed' : 'lock-open',
              doc: 'Keeps the width and height in step',
            },
          ]}
          pressed={lock ? 'lock' : undefined}
          onToggle={() => setLock((on) => !on)}
          control="formatOptions.size.lock"
          mode="multi"
          disabled={disabled}
        />
        <ToggleRow
          label="Flip"
          options={[
            {
              value: 'h',
              label: words.flipH,
              icon: 'arrows-right-left',
              doc: 'Mirrors left to right',
            },
            {
              value: 'v',
              label: words.flipV,
              icon: 'arrows-up-down',
              doc: 'Mirrors top to bottom',
            },
          ]}
          pressed={flips}
          onToggle={doFlip}
          control="formatOptions.size.flip"
          mode="multi"
          disabled={write.busy}
        />
      </div>
      <div className="ts-fo-fields is-two">
        <NumberField
          label={words.rotate}
          value={one !== undefined ? rotate : blocks.length > 0 ? 0 : undefined}
          control="formatOptions.size.rotate"
          onCommit={setRotate}
          disabled={write.busy || blocks.length === 0}
          unit="°"
          doc="Degrees clockwise; 0 up to 360"
        />
        <label className="ts-fo-field ts-fo-dial">
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={Math.round(rotate)}
            aria-label={`${words.rotate} dial`}
            aria-valuetext={`${Math.round(rotate)}°`}
            data-control="formatOptions.size.rotate.dial"
            disabled={write.busy || blocks.length === 0}
            {...dialTip}
            onChange={(event) => setRotate(Number(event.target.value))}
          />
        </label>
      </div>
      {box === undefined && blocks.length > 0 ? <Note>{words.unplaced}</Note> : null}
    </>
  );
}

export function PositionSection({ blocks, measured, write }: GeometrySectionProps) {
  const [from, setFrom] = useState<'topLeft' | 'center'>('topLeft');
  const words = FORMAT.position;
  const one = blocks.length === 1 ? blocks[0] : undefined;
  const box = one !== undefined ? boxOf(one, measured) : unionOf(blocks, measured);
  const disabled = write.busy || box === undefined;
  const shownX =
    box === undefined ? undefined : from === 'center' ? Math.round(box.x + box.w / 2) : box.x;
  const shownY =
    box === undefined ? undefined : from === 'center' ? Math.round(box.y + box.h / 2) : box.y;

  const move = (key: 'x' | 'y', value: number) => {
    if (box === undefined) return;
    const target =
      Math.round(value) - (from === 'center' ? (key === 'x' ? box.w / 2 : box.h / 2) : 0);
    const dx = key === 'x' ? Math.round(target - box.x) : 0;
    const dy = key === 'y' ? Math.round(target - box.y) : 0;
    if (dx === 0 && dy === 0) return;
    const writes: Array<{ blockId: string; value: Position }> = [];
    for (const block of blocks) {
      const own = boxOf(block, measured);
      if (own === undefined) continue;
      writes.push({
        blockId: block.id,
        value: { ...(block.pos ?? {}), x: own.x + dx, y: own.y + dy, w: own.w, h: own.h },
      });
    }
    const first = writes[0];
    if (writes.length === 1 && first !== undefined) {
      write.report(
        write.dispatch('block.set', {
          slideId: write.slideId,
          blockId: first.blockId,
          path: '/pos',
          value: first.value,
          baseRevision: write.revision,
        }),
      );
      return;
    }
    const mutations: Mutation[] = writes.map((each) => ({
      op: 'block.set',
      slideId: write.slideId,
      blockId: each.blockId,
      path: '/pos',
      value: each.value,
    }));
    write.report(
      write.dispatch('slide.update', {
        slideId: write.slideId,
        mutations,
        baseRevision: write.revision,
      }),
    );
  };

  return (
    <>
      <ToggleRow
        label={words.from}
        options={[
          {
            value: 'topLeft',
            label: words.topLeft,
            doc: 'X and Y measure to the object’s top left corner',
          },
          { value: 'center', label: words.center, doc: 'X and Y measure to the object’s centre' },
        ]}
        pressed={from}
        onToggle={setFrom}
        control="formatOptions.position.from"
      />
      <div className="ts-fo-fields is-two">
        <NumberField
          label={words.x}
          value={shownX}
          control="formatOptions.position.x"
          onCommit={(value) => move('x', value)}
          disabled={disabled}
          unit="px"
          doc="From the left edge of the slide"
        />
        <NumberField
          label={words.y}
          value={shownY}
          control="formatOptions.position.y"
          onCommit={(value) => move('y', value)}
          disabled={disabled}
          unit="px"
          doc="From the top edge of the slide"
        />
      </div>
    </>
  );
}
