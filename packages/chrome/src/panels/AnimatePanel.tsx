import { useEffect, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import { blockTextPaths } from '@turboslide/schema/catalog';
import type { Slide } from '@turboslide/schema/deck';
import {
  BLOCK_PRESETS,
  EFFECT_STARTS,
  EMPHASIS_PRESETS,
  MOTION_LIMITS,
  TEXT_PRESETS,
  scheduleOf,
} from '@turboslide/schema/motion-core';
import type { Effect, EffectPreset, EffectRole, EffectStart } from '@turboslide/schema/motion-core';

import type { EditorDispatch } from '../dispatch';
import { Icon } from '../icons';
import { MOTION, PANELS } from '../menus/strings';
import { Panel } from '../Panel';
import { Select } from '../Select';
import type { SelectGroup } from '../Select';
import { tipProps } from '../Tooltip';

import './AnimatePanel.css';

/**
 * The Animate panel (HTML-SLIDES-DESIGN 2.5, its first part): the selected object's effects, each
 * with its preset, its start (on click, with previous, after previous), its delay and its
 * duration, and Add animation for another. Every change is one motion action through the
 * editor's dispatch (`motion.add`, `motion.set`, `motion.remove`), so a person's edit and an
 * agent's call take the same path, write the slide's whole effect list once and make one history
 * entry. Insert > Animation and the object menus' Animation row open it. The slide's full list
 * by step, reordering, the scrubber, keyframes and paths are the Motion panel's, a later part.
 */
export type AnimatePanelProps = {
  slideId: string;
  slide: Slide | undefined;
  block: Block | undefined;
  revision: number;
  dispatch: EditorDispatch;
  onNotice: (text: string) => void;
  onClose: () => void;
};

const ROLES: ReadonlyArray<EffectRole> = ['enter', 'emphasis', 'exit'];

/** The presets a role takes; the text presets only on a block that holds text. */
function presetGroups(role: EffectRole, textual: boolean): SelectGroup<EffectPreset>[] {
  const options = (presets: ReadonlyArray<EffectPreset>) =>
    presets.map((preset) => ({ value: preset, label: MOTION.presets[preset] }));
  if (role === 'emphasis') return [{ options: options(EMPHASIS_PRESETS) }];
  return [
    { options: options(BLOCK_PRESETS) },
    ...(textual ? [{ heading: 'Text', options: options(TEXT_PRESETS) }] : []),
  ];
}

export function AnimatePanel({
  slideId,
  slide,
  block,
  revision,
  dispatch,
  onNotice,
  onClose,
}: AnimatePanelProps) {
  const words = PANELS.animate;
  const effects = (slide?.effects ?? []).filter((effect) => effect.block === block?.id);
  const steps = new Map(
    (slide === undefined ? [] : scheduleOf(slide).effects).map((row) => [row.id, row.step]),
  );
  const textual = block !== undefined && blockTextPaths(block).length > 0;

  const run = (action: 'motion.add' | 'motion.set' | 'motion.remove', input: object) => {
    dispatch(action, { slideId, baseRevision: revision, ...input }).catch((error: unknown) =>
      onNotice(error instanceof Error ? error.message : String(error)),
    );
  };
  const set = (effect: Effect, path: string, value: unknown) =>
    run('motion.set', { effectId: effect.id, path, value });

  const add = (value: string) => {
    if (block === undefined) return;
    const [role, preset] = value.split('.') as [EffectRole, EffectPreset];
    run('motion.add', {
      effect: { block: block.id, role, motion: { preset }, start: 'click' },
    });
  };

  return (
    <Panel title={words.title} onClose={onClose} control="panel.animate" className="ts-animate">
      {block === undefined ? (
        <p className="ts-panel-empty">{words.empty}</p>
      ) : (
        <div className="ts-animate-body">
          {effects.length === 0 ? <p className="ts-animate-none">{words.none}</p> : null}
          <ol className="ts-animate-list">
            {effects.map((effect) => (
              <li key={effect.id} className="ts-animate-effect" data-effect-id={effect.id}>
                <div className="ts-animate-head">
                  <span className="ts-animate-role">{MOTION.roles[effect.role]}</span>
                  <span className="ts-animate-step">{MOTION.step(steps.get(effect.id) ?? 0)}</span>
                  <button
                    type="button"
                    className="pt-ib ts-animate-remove"
                    aria-label={`${words.remove} ${MOTION.roles[effect.role]}`}
                    data-control="panel.animate.remove"
                    onClick={() => run('motion.remove', { effectId: effect.id })}
                    {...tipProps({ name: words.remove, doc: 'Takes this effect off the object' })}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <label className="ts-animate-field">
                  <span>{words.effect}</span>
                  {'preset' in effect.motion ? (
                    <Select<EffectPreset>
                      value={effect.motion.preset}
                      options={presetGroups(effect.role, textual)}
                      label={words.effect}
                      control="panel.animate.preset"
                      onChange={(preset) => set(effect, '/motion/preset', preset)}
                      tip={{ name: words.effect, doc: 'How the object moves' }}
                    />
                  ) : (
                    <span className="ts-animate-kind">
                      {'path' in effect.motion ? MOTION.path : MOTION.keyframes}
                    </span>
                  )}
                </label>
                <label className="ts-animate-field">
                  <span>{words.start}</span>
                  <Select<EffectStart>
                    value={effect.start}
                    options={EFFECT_STARTS.map((start) => ({
                      value: start,
                      label: MOTION.starts[start].label,
                      description: MOTION.starts[start].doc,
                    }))}
                    label={words.start}
                    control="panel.animate.start"
                    onChange={(start) => set(effect, '/start', start)}
                    tip={{ name: words.start, doc: 'When the effect plays in the show' }}
                  />
                </label>
                <div className="ts-animate-times">
                  <SecondsField
                    label={words.delay}
                    ms={effect.delayMs ?? 0}
                    min={0}
                    control="panel.animate.delay"
                    doc="The wait before the effect starts"
                    onCommit={(ms) => set(effect, '/delayMs', ms)}
                    onRefused={() => onNotice(words.timeRange)}
                  />
                  <SecondsField
                    label={words.duration}
                    ms={effect.durationMs}
                    min={1}
                    control="panel.animate.duration"
                    doc="How long one run of the effect takes"
                    onCommit={(ms) => set(effect, '/durationMs', ms)}
                    onRefused={() => onNotice(words.timeRange)}
                  />
                </div>
              </li>
            ))}
          </ol>
          <Select
            value=""
            placeholder={words.add}
            options={ROLES.map((role) => ({
              heading: MOTION.roles[role],
              options: presetGroups(role, textual)
                .flatMap((group) => group.options)
                .map((option) => ({ value: `${role}.${option.value}`, label: option.label })),
            }))}
            label={words.add}
            control="panel.animate.add"
            onChange={add}
            tip={{ name: words.add, doc: 'Another effect for the object, played on click' }}
          />
        </div>
      )}
    </Panel>
  );
}

/**
 * A time in seconds over a value in ms: it writes once on Enter or when the field loses focus,
 * never per key, so one change is one history entry; a value outside the range is refused with
 * the panel's sentence and the field shows the stored value again.
 */
function SecondsField({
  label,
  ms,
  min,
  control,
  doc,
  onCommit,
  onRefused,
}: {
  label: string;
  ms: number;
  /** the least value in ms */
  min: number;
  control: string;
  doc: string;
  onCommit: (ms: number) => void;
  onRefused: () => void;
}) {
  const [text, setText] = useState(String(ms / 1000));
  useEffect(() => setText(String(ms / 1000)), [ms]);
  const commit = () => {
    const value = Math.round(Number(text) * 1000);
    if (text.trim() === '' || !Number.isFinite(value) || value < min) {
      setText(String(ms / 1000));
      if (Number(text) * 1000 !== ms) onRefused();
      return;
    }
    if (value > MOTION_LIMITS.durationMs) {
      setText(String(ms / 1000));
      onRefused();
      return;
    }
    if (value !== ms) onCommit(value);
  };
  return (
    <label className="ts-animate-field" {...tipProps({ name: label, doc })}>
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min={min / 1000}
        max={MOTION_LIMITS.durationMs / 1000}
        value={text}
        aria-label={label}
        data-control={control}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );
}
