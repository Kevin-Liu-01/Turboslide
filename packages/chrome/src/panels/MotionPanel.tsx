import type { DragEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import type { Animation, SlideTransition, TransitionKind } from '@turboslide/schema/motion';
import {
  ANIMATION_CHOICES_IN_ORDER,
  ANIMATION_LABELS_IN_ORDER,
  animationLabel,
  blockParagraphCount,
  DURATION_MS,
  MOTION_LABELS,
  motionTargets,
  PARAGRAPH_CARRIER_TYPES,
  TRANSITION_KINDS,
} from '@turboslide/schema/motion';
import {
  advanceMotionPreview,
  motionPreview,
  stopMotionPreview,
  subscribeMotionPreview,
} from '@turboslide/viewer/present/SlideshowLayer';
import type { MotionPreviewState } from '@turboslide/viewer/present/SlideshowLayer';

import type { EditorDispatch } from '../dispatch';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { Panel } from '../Panel';
import { mergeTipProps, tipProps } from '../Tooltip';

import './MotionPanel.css';

/**
 * The Motion panel (gslides-parity SPEC-5 2.1; R01 1 to 3; MILESTONES-5 B1 day 3): Google's one
 * side panel for the slide transition and the object animations, 320 px on the right, an X at the
 * top right, opened by View > Motion, Insert > Animation, Slide > Transition, the toolbar's
 * Transition button, the filmstrip's Transition row and an object's Animate row. It follows the
 * selection: the Slide Transition section reads the current slide, the list reads the slide's
 * animations with the selected objects' rows expanded. Every control writes one of the seven
 * motion actions through the editor's dispatch with the revision it read, so one Undo reverts
 * each change and an agent's `motion.*` call moves the same rows. Play previews the transition
 * then the steps on the canvas over the present layer's CSS (`motion.play`, window only) and
 * reads Stop while it runs; Enter continues a waiting click step; Stop or Esc returns every
 * object to rest. Labels are Google's (`MOTION_LABELS`); the slider's seconds readout, the
 * `Alt+Up` and `Alt+Down` reorder and the block name under a row are Turboslide's.
 */
export type MotionPanelProps = {
  document: DeckDocument;
  slideId: string;
  /** the selected objects of the slide; the Add animation targets and the rows expanded */
  selection: readonly string[];
  revision: number;
  dispatch: EditorDispatch;
  /** the section the opener asked for: Slide > Transition scrolls to the top section */
  section?: 'transition' | 'animations';
  /** a write is in flight: the controls take no input */
  busy?: boolean;
  onNotice?: (message: string) => void;
  /** the panel selects an object when its row header is clicked */
  onSelectBlock?: (blockId: string) => void;
  onClose: () => void;
};

/** The panel's words (SPEC-5 2.1, 15): Google's labels, sentence case, the Turboslide additions marked in the tooltips. */
export const MOTION_PANEL_TEXT = {
  title: 'Motion',
  transition: 'Slide Transition',
  animations: 'Object Animations',
  type: 'Type',
  start: 'Start',
  speed: 'Speed',
  byParagraph: 'By paragraph',
  applyToAll: 'Apply to all slides',
  addAnimation: 'Add animation',
  selectToAnimate: 'Select an object to animate',
  play: 'Play',
  stop: 'Stop',
  remove: 'Remove animation',
  handle: 'Drag to reorder',
  noAnimations: 'No animations on this slide',
  seconds: (ms: number) => `${(ms / 1000).toFixed(1)} s`,
  rowLabel: (animation: Animation, mediaTitle: string | undefined) =>
    `${animation.effect === 'playMedia' ? `${MOTION_LABELS.effects.playMedia} ${mediaTitle ?? ''}`.trim() : animationLabel(animation)} (${MOTION_LABELS.triggers[animation.trigger]})`,
} as const;

/** The slider's stops (SPEC-5 0.11): Slow 2000, Medium 1000, Fast 500, over 100 to 5000 ms. */
const SPEED_STOPS = [
  { value: DURATION_MS.slow, label: MOTION_LABELS.speeds.slow },
  { value: DURATION_MS.medium, label: MOTION_LABELS.speeds.medium },
  { value: DURATION_MS.fast, label: MOTION_LABELS.speeds.fast },
] as const;
const SPEED_STEP = 100;

/** The value the fifteen labels write, keyed by label (Google's order). */
const CHOICE_OF_LABEL = new Map(
  ANIMATION_LABELS_IN_ORDER.map((label, index) => [label, ANIMATION_CHOICES_IN_ORDER[index]!]),
);

/** The Stop square and the six dot handle: Turboslide's own glyphs (SPEC-5 15: never Google's artwork). */
function StopGlyph() {
  return (
    <svg viewBox="0 0 20 20" width={14} height={14} fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" />
    </svg>
  );
}

function HandleGlyph() {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="5" r="1.5" />
      <circle cx="13" cy="5" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="15" r="1.5" />
      <circle cx="13" cy="15" r="1.5" />
    </svg>
  );
}

function blockName(document: DeckDocument, slideId: string, blockId: string): string {
  const slide = document.slides[slideId];
  const block =
    slide === undefined ? undefined : motionTargets(slide).find((b) => b.id === blockId);
  if (block === undefined) return blockId;
  const text = (block as { text?: string; alt?: string }).text ?? (block as { alt?: string }).alt;
  const head =
    typeof text === 'string' && text.trim() !== '' ? text.trim().split('\n')[0] : undefined;
  const short = head === undefined ? '' : head.length > 36 ? `${head.slice(0, 33)}...` : head;
  return short === '' ? `${block.type} ${blockId}` : short;
}

function mediaTitle(document: DeckDocument, slideId: string, blockId: string): string | undefined {
  const slide = document.slides[slideId];
  const block =
    slide === undefined ? undefined : motionTargets(slide).find((b) => b.id === blockId);
  if (block === undefined || block.type !== 'media') return undefined;
  if ('asset' in block.source) {
    const record = document.deck.media?.[block.source.asset];
    return record?.title ?? block.alt ?? record?.id ?? block.source.asset;
  }
  return block.alt ?? 'video';
}

/**
 * The slider of a transition or an animation (SPEC-5 0.11): 100 to 5000 ms in steps of 100 with
 * the three labelled stops under it and the value in seconds with one decimal at the right; the
 * write leaves on release (pointer up, key up, blur), never on every tick.
 */
function SpeedSlider({
  value,
  control,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  control: string;
  label: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const listId = `${control}-stops`;
  const commit = () => {
    if (live !== null && live !== value) onCommit(live);
    setLive(null);
  };
  const tip = tipProps({
    name: label,
    doc: 'Slow is 2 s, Medium 1 s, Fast 0.5 s; 0.1 to 5 s in all',
  });
  return (
    <div className={cn('ts-motion-speed', disabled && 'is-disabled')}>
      <div className="ts-motion-speed-row">
        <span className="ts-motion-label">{label}</span>
        <output className="ts-motion-seconds" data-control={`${control}.value`}>
          {MOTION_PANEL_TEXT.seconds(shown)}
        </output>
      </div>
      <input
        type="range"
        min={DURATION_MS.min}
        max={DURATION_MS.max}
        step={SPEED_STEP}
        value={shown}
        list={listId}
        aria-label={label}
        aria-valuetext={MOTION_PANEL_TEXT.seconds(shown)}
        data-control={control}
        disabled={disabled}
        {...tip}
        onChange={(event) => setLive(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
      <datalist id={listId}>
        {SPEED_STOPS.map((stop) => (
          <option key={stop.value} value={stop.value} label={stop.label} />
        ))}
      </datalist>
      <div className="ts-motion-stops" aria-hidden="true">
        {SPEED_STOPS.map((stop) => (
          <span
            key={stop.value}
            style={{
              left: `${((stop.value - DURATION_MS.min) / (DURATION_MS.max - DURATION_MS.min)) * 100}%`,
            }}
          >
            {stop.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MotionPanel({
  document,
  slideId,
  selection,
  revision,
  dispatch,
  section,
  busy = false,
  onNotice,
  onSelectBlock,
  onClose,
}: MotionPanelProps) {
  const slide = document.slides[slideId];
  const transition: SlideTransition = slide?.transition ?? {
    kind: 'none',
    durationMs: DURATION_MS.defaultTransition,
  };
  const animations = slide?.animations ?? [];
  const targets = useMemo(() => (slide === undefined ? [] : motionTargets(slide)), [slide]);
  const targetIds = useMemo(() => new Set(targets.map((block) => block.id)), [targets]);
  const selected = useMemo(
    () => selection.filter((id) => targetIds.has(id)),
    [selection, targetIds],
  );

  /* the rows open: the selected objects' rows, plus what a click toggled; a new row opens */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<string[]>([]);
  const isOpen = (row: Animation) =>
    toggled[row.id] ?? (selected.includes(row.blockId) || added.includes(row.id));

  /* the preview's state, read from the layer's registry */
  const [preview, setPreview] = useState<MotionPreviewState | null>(motionPreview);
  useEffect(() => subscribeMotionPreview(setPreview), []);
  const playing = preview !== null && preview.slideId === slideId;

  /* Slide > Transition opens scrolled to the top section; Insert > Animation to the list */
  const transitionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = section === 'animations' ? listRef.current : transitionRef.current;
    if (section !== undefined) target?.scrollIntoView({ block: 'start' });
  }, [section]);

  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; half: 'before' | 'after' } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const failed = (error: unknown) => {
    onNotice?.(error instanceof Error ? error.message : String(error));
  };
  const write = (action: string, input: Record<string, unknown>) =>
    dispatch(action as never, { ...input, baseRevision: revision }).catch(failed);

  const setTransition = (fields: {
    kind?: TransitionKind;
    durationMs?: number;
    applyToAll?: true;
  }) => write('motion.setTransition', { slideId, ...fields });

  const addAnimation = () => {
    if (selected.length === 0 || busy) return;
    dispatch('motion.add', { slideId, blockIds: selected, baseRevision: revision })
      .then((out) => {
        const ids = (out as { ids?: string[] }).ids ?? [];
        setAdded((rows) => [...rows, ...ids]);
      })
      .catch(failed);
  };

  const update = (animationId: string, fields: Record<string, unknown>) =>
    write('motion.update', { slideId, animationId, ...fields });

  const remove = (animationId: string) => write('motion.remove', { slideId, animationId });

  const reorder = (order: string[]) => write('motion.reorder', { slideId, order });

  /** Moves a row by `delta` places (`Alt+Up`, `Alt+Down`, a drop), keeping focus on it. */
  const move = (animationId: string, delta: number) => {
    const ids = animations.map((row) => row.id);
    const from = ids.indexOf(animationId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, animationId);
    void reorder(ids).then(() => rowRefs.current.get(animationId)?.focus());
  };

  const onRowKey = (event: KeyboardEvent<HTMLElement>, animationId: string) => {
    if (!event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(animationId, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(animationId, 1);
    }
  };

  const onDragStart = (event: DragEvent<HTMLElement>, animationId: string) => {
    event.dataTransfer.setData('text/plain', animationId);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(animationId);
  };
  const onDragOver = (event: DragEvent<HTMLElement>, animationId: string) => {
    if (dragging === null || dragging === animationId) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const half = event.clientY < box.top + box.height / 2 ? 'before' : 'after';
    if (dropAt?.id !== animationId || dropAt.half !== half) setDropAt({ id: animationId, half });
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const moving = dragging ?? event.dataTransfer.getData('text/plain');
    const at = dropAt;
    setDragging(null);
    setDropAt(null);
    if (!moving || at === null || at.id === moving) return;
    const ids = animations.map((row) => row.id).filter((id) => id !== moving);
    const index = ids.indexOf(at.id) + (at.half === 'after' ? 1 : 0);
    ids.splice(index, 0, moving);
    void reorder(ids);
  };
  const onDragEnd = () => {
    setDragging(null);
    setDropAt(null);
  };

  const togglePlay = () => {
    if (playing) {
      stopMotionPreview();
      return;
    }
    dispatch('motion.play', { slideId }).catch(failed);
  };

  /* Enter continues a waiting click step while the panel has focus (R01 2: "Continue in animation preview") */
  const onPanelKey = (event: KeyboardEvent<HTMLElement>) => {
    if (!playing) return;
    if (event.key === 'Enter' && preview?.waiting === true) {
      const target = event.target as HTMLElement;
      if (target.closest('select, input, textarea') !== null) return;
      event.preventDefault();
      advanceMotionPreview();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      stopMotionPreview();
    }
  };

  const showSpeed = transition.kind !== 'none';

  return (
    <Panel
      title={MOTION_PANEL_TEXT.title}
      onClose={onClose}
      control="panel.motion"
      className="ts-motion"
      aside={
        <button
          type="button"
          className={cn('ts-motion-play', playing && 'is-on')}
          data-control="motion.play"
          aria-pressed={playing}
          disabled={slide === undefined}
          onClick={togglePlay}
          {...tipProps({
            name: playing ? MOTION_PANEL_TEXT.stop : MOTION_PANEL_TEXT.play,
            doc: playing
              ? 'Returns every object to rest'
              : 'Previews the transition, then the steps; a click or Enter continues a waiting step',
            key: playing ? 'Esc' : undefined,
          })}
        >
          {playing ? <StopGlyph /> : <Icon name="play" />}
          <span>{playing ? MOTION_PANEL_TEXT.stop : MOTION_PANEL_TEXT.play}</span>
        </button>
      }
    >
      <div className="ts-motion-body" onKeyDown={onPanelKey}>
        <section
          ref={transitionRef}
          className="ts-panel-section ts-motion-section"
          aria-labelledby="ts-motion-transition"
          data-control="motion.transition"
        >
          <h3 id="ts-motion-transition" className="ts-motion-head">
            {MOTION_PANEL_TEXT.transition}
          </h3>
          <div className="ts-panel-section-body">
            <label className="ts-motion-field">
              <span className="ts-motion-label">{MOTION_PANEL_TEXT.type}</span>
              <select
                className="ts-motion-select"
                value={transition.kind}
                aria-label={`${MOTION_PANEL_TEXT.transition} ${MOTION_PANEL_TEXT.type.toLowerCase()}`}
                data-control="motion.transition.kind"
                disabled={busy || slide === undefined}
                onChange={(event) => setTransition({ kind: event.target.value as TransitionKind })}
                {...tipProps({
                  name: 'Transition type',
                  doc: 'How this slide comes in; None removes the transition',
                })}
              >
                {TRANSITION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {MOTION_LABELS.transitions[kind]}
                  </option>
                ))}
              </select>
            </label>
            {showSpeed ? (
              <SpeedSlider
                value={transition.durationMs}
                control="motion.transition.duration"
                label={MOTION_PANEL_TEXT.speed}
                disabled={busy}
                onCommit={(durationMs) => setTransition({ durationMs })}
              />
            ) : null}
            <button
              type="button"
              className="ts-motion-text-btn"
              data-control="motion.transition.applyAll"
              disabled={busy || slide === undefined}
              onClick={() => setTransition({ applyToAll: true })}
              {...tipProps({
                name: MOTION_PANEL_TEXT.applyToAll,
                doc: 'Copies this transition and its speed to every slide, None included',
              })}
            >
              {MOTION_PANEL_TEXT.applyToAll}
            </button>
          </div>
        </section>

        <section
          ref={listRef}
          className="ts-panel-section ts-motion-section"
          aria-labelledby="ts-motion-animations"
          data-control="motion.animations"
        >
          <h3 id="ts-motion-animations" className="ts-motion-head">
            {MOTION_PANEL_TEXT.animations}
          </h3>
          <ol
            className="ts-motion-list"
            data-control="motion.list"
            onDrop={onDrop}
            onDragOver={(e) => dragging !== null && e.preventDefault()}
          >
            {animations.length === 0 ? (
              <li className="ts-motion-empty">{MOTION_PANEL_TEXT.noAnimations}</li>
            ) : null}
            {animations.map((row, index) => {
              const open = isOpen(row);
              const block = targets.find((b) => b.id === row.blockId);
              const carrier =
                block !== undefined &&
                PARAGRAPH_CARRIER_TYPES.has(block.type) &&
                blockParagraphCount(block) >= 2;
              const media = block?.type === 'media';
              const title = mediaTitle(document, slideId, row.blockId);
              const label = MOTION_PANEL_TEXT.rowLabel(row, title);
              const choice =
                row.effect === 'playMedia' ? MOTION_LABELS.effects.playMedia : animationLabel(row);
              return (
                <li
                  key={row.id}
                  className={cn(
                    'ts-motion-row',
                    open && 'is-open',
                    dragging === row.id && 'is-dragging',
                    dropAt?.id === row.id && `is-drop-${dropAt.half}`,
                  )}
                  data-control={`motion.row.${row.id}`}
                  data-animation={row.id}
                  data-block={row.blockId}
                  data-index={index}
                  draggable
                  onDragStart={(event) => onDragStart(event, row.id)}
                  onDragOver={(event) => onDragOver(event, row.id)}
                  onDragEnd={onDragEnd}
                >
                  <div className="ts-motion-row-head">
                    <button
                      ref={(el) => {
                        if (el) rowRefs.current.set(row.id, el);
                        else rowRefs.current.delete(row.id);
                      }}
                      type="button"
                      className="ts-motion-row-title"
                      data-control={`motion.row.${row.id}.toggle`}
                      aria-expanded={open}
                      onClick={() => {
                        setToggled((rows) => ({ ...rows, [row.id]: !open }));
                        onSelectBlock?.(row.blockId);
                      }}
                      {...mergeTipProps(
                        {
                          onKeyDown: (event: KeyboardEvent<HTMLElement>) => onRowKey(event, row.id),
                        },
                        tipProps({
                          name: label,
                          doc: `On ${blockName(document, slideId, row.blockId)}; Alt+Up and Alt+Down move it`,
                        }),
                      )}
                    >
                      <span className="ts-motion-row-label">{label}</span>
                      <span className="ts-motion-row-block">
                        {blockName(document, slideId, row.blockId)}
                      </span>
                    </button>
                    <span
                      className="ts-motion-handle"
                      data-control={`motion.row.${row.id}.handle`}
                      aria-hidden="true"
                      {...tipProps({
                        name: MOTION_PANEL_TEXT.handle,
                        doc: 'Drag up or down; an On click row that moves opens a new step',
                      })}
                    >
                      <HandleGlyph />
                    </span>
                  </div>
                  {open ? (
                    <div className="ts-motion-row-body">
                      {media ? (
                        <p className="ts-motion-note">
                          {`${MOTION_LABELS.effects.playMedia} ${title ?? ''}`.trim()}
                        </p>
                      ) : (
                        <label className="ts-motion-field">
                          <span className="ts-motion-label">{MOTION_PANEL_TEXT.type}</span>
                          <select
                            className="ts-motion-select"
                            value={choice}
                            aria-label={`${MOTION_PANEL_TEXT.type} of ${label}`}
                            data-control={`motion.row.${row.id}.effect`}
                            disabled={busy}
                            onChange={(event) => {
                              const picked = event.target.value;
                              if (picked === MOTION_LABELS.effects.playMedia) {
                                void update(row.id, { effect: 'playMedia', direction: null });
                                return;
                              }
                              const value = CHOICE_OF_LABEL.get(picked);
                              if (value === undefined) return;
                              void update(row.id, {
                                effect: value.effect,
                                direction: value.direction ?? null,
                              });
                            }}
                            {...tipProps({
                              name: 'Animation type',
                              doc: "Google's fifteen animations",
                            })}
                          >
                            {ANIMATION_LABELS_IN_ORDER.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="ts-motion-field">
                        <span className="ts-motion-label">{MOTION_PANEL_TEXT.start}</span>
                        <select
                          className="ts-motion-select"
                          value={row.trigger}
                          aria-label={`${MOTION_PANEL_TEXT.start} of ${label}`}
                          data-control={`motion.row.${row.id}.trigger`}
                          disabled={busy}
                          onChange={(event) => void update(row.id, { trigger: event.target.value })}
                          {...tipProps({
                            name: 'Start condition',
                            doc: 'On click waits for a click; After previous follows the row before; With previous plays with it',
                          })}
                        >
                          {(['click', 'afterPrevious', 'withPrevious'] as const).map((trigger) => (
                            <option key={trigger} value={trigger}>
                              {MOTION_LABELS.triggers[trigger]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {carrier && !media ? (
                        <label
                          className="ts-motion-check"
                          {...tipProps({
                            name: MOTION_PANEL_TEXT.byParagraph,
                            doc: 'One paragraph or list item at a time, each waiting for the start condition',
                          })}
                        >
                          <input
                            type="checkbox"
                            checked={row.byParagraph === true}
                            disabled={busy}
                            data-control={`motion.row.${row.id}.byParagraph`}
                            onChange={(event) =>
                              void update(row.id, { byParagraph: event.target.checked })
                            }
                          />
                          <span>{MOTION_PANEL_TEXT.byParagraph}</span>
                        </label>
                      ) : null}
                      {media ? null : (
                        <SpeedSlider
                          value={row.durationMs}
                          control={`motion.row.${row.id}.duration`}
                          label={MOTION_PANEL_TEXT.speed}
                          disabled={busy}
                          onCommit={(durationMs) => void update(row.id, { durationMs })}
                        />
                      )}
                      <div className="ts-motion-row-tools">
                        <button
                          type="button"
                          className="ts-motion-icon-btn"
                          data-control={`motion.row.${row.id}.remove`}
                          aria-label={MOTION_PANEL_TEXT.remove}
                          disabled={busy}
                          onClick={() => void remove(row.id)}
                          {...tipProps({
                            name: MOTION_PANEL_TEXT.remove,
                            doc: 'Removes this row from the slide',
                          })}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="ts-panel-section-body">
            <button
              type="button"
              className={cn('ts-motion-text-btn', selected.length === 0 && 'is-disabled')}
              data-control="motion.add"
              aria-disabled={selected.length === 0 ? true : undefined}
              disabled={busy}
              onClick={addAnimation}
              {...tipProps({
                name:
                  selected.length === 0
                    ? MOTION_PANEL_TEXT.selectToAnimate
                    : MOTION_PANEL_TEXT.addAnimation,
                doc:
                  selected.length === 0
                    ? 'Click an object on the slide first'
                    : `Adds Appear, On click to ${selected.length === 1 ? 'the selected object' : `${selected.length} selected objects`}`,
              })}
            >
              {selected.length === 0
                ? MOTION_PANEL_TEXT.selectToAnimate
                : MOTION_PANEL_TEXT.addAnimation}
            </button>
          </div>
        </section>
      </div>
    </Panel>
  );
}
