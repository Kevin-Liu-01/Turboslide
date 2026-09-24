import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { entryWithPalette, materialEntry } from '@turboslide/materials/catalog';
import type { MaterialEntry } from '@turboslide/materials/catalog';
import {
  SHADER_CONTROLS,
  clampControl,
  controlApplies,
  controlsWithDefaults,
  uniformsWithControls,
} from '@turboslide/materials/controls';
import type { ShaderControlSpec } from '@turboslide/materials/controls';
import {
  groundRoleOfPreset,
  palettePresetOfRole,
  shaderPaletteOfDeck,
} from '@turboslide/materials/presets';
import { shaderPreviewUrl } from '@turboslide/materials/previews';
import { resolveRecipe } from '@turboslide/materials/recipe';
import { frameIsStale } from '@turboslide/materials/recipe-key';
import { shaderSetMutations } from '@turboslide/materials/shader-writes';
import type { Deck } from '@turboslide/schema/deck';
import { KIT_COLORS, KIT_COLOR_WORDS } from '@turboslide/schema/brand';
import type { KitColor } from '@turboslide/schema/brand';
import type {
  MaterialBlock,
  MaterialControlName,
  MaterialControls,
  MaterialPlateSide,
  MaterialUniformSpec,
  MaterialUniformValue,
  MaterialUniforms,
} from '@turboslide/schema/blocks/material';
import { MATERIAL_ANCHORS, MATERIAL_PLATE_SIDES } from '@turboslide/schema/blocks/material';
import type { Mutation } from '@turboslide/schema/mutations';
import { previewShaderSpeed, previewShaderUniforms } from '@turboslide/viewer/MaterialMount';

import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { DITHER } from '../menus/strings';
import { isParked } from '../parked-controls';
import type { ParkedSettings } from '../parked-controls';
import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';
import { CheckField, NumberField, PanelButton, SelectField } from './fields';
import type { SectionWrite } from './fields';

import './shader.css';

/**
 * The Shader section of Format options (docs/FEATURES.md 5.3; audit-shaders 4, 5, 7, 8, 19): one
 * home for a shader block's recipe, in the panel's grammar (a label, a slider with a number field,
 * groups in Glyphfield's order). The groups: Shader (the thumbnail, the name, Change, which opens
 * the gallery); Preset (the entry's presets as tiles in sentence case, the current one pressed;
 * a change writes `/preset` and clears the control overrides); Colors (the kit's six swatches
 * with the role's sentence in the tooltip, one pressed as the ground the preset takes, then
 * Custom); Form (Strength, Detail, Frequency, Amplitude, Density); Light and texture (Brightness,
 * Grain); Orientation (Rotation, Center X, Center Y); Motion (Speed); Dither (Two-tone and Plate
 * in the Dither section's words); Advanced, collapsed, the raw uniforms with Reset per row and the
 * anchor. Every slider previews through the stage's live mount while it is held and commits on
 * release as one `slide.update` (the controls and the resolved uniforms in one write), one undo
 * entry; nothing captures while a slider is held (the capture waits 800 ms after the last commit,
 * packages/viewer shader-frame.ts). Every slider carries one sentence in the seller's words
 * (SHADER_CONTROLS). The ids are `formatOptions.shader.<control>` (the number field) and
 * `formatOptions.shader.<control>.slider` (the range); a control `parked-controls.ts` names is
 * not drawn while the switch is off (7.2). No id and no `paper:` name is drawn anywhere.
 */
export type ShaderSectionProps = {
  block: MaterialBlock;
  deck: Deck;
  write: SectionWrite;
  /** The shell's settings, for the parked controls read (Tools > Advanced tools shows a parked one). */
  settings?: ParkedSettings;
  /** Change: opens the Shader gallery (B1's dialog) for this block; the button is hidden without it. */
  onChange?: (anchor: HTMLElement) => void;
};

/** The words of the section (docs/FEATURES.md 5.3; the group names are Glyphfield's). */
export const SHADER_WORDS = {
  section: 'Shader',
  change: 'Change',
  changeDoc: 'Opens the gallery; the shader takes your brand kit’s colours on the slide',
  preset: 'Preset',
  presetDoc: 'The shader’s recorded looks; a pick keeps its geometry and drops the slider changes',
  colors: 'Colors',
  colorsDoc: 'The ground the shader takes from your brand kit; the figures follow it',
  custom: 'Custom',
  customDoc: 'Six hex digits for the ground; Enter applies and the shader leaves the kit',
  form: 'Form',
  light: 'Light and texture',
  orientation: 'Orientation',
  motion: 'Motion',
  dither: 'Dither',
  advanced: 'Advanced',
  advancedDoc: 'Every value of the shader by its own name, for a fine adjustment',
  anchor: 'Frame time',
  anchorDoc: 'The moment of the loop the still freezes, in milliseconds',
  reset: 'Reset',
  stillFresh: 'Still: up to date',
  stillPending: 'Still: updating after the last change',
  notUsed: 'Not used by this shader',
  twoTone: 'Two-tone',
  twoToneDoc: 'Screens the still into a light and a dark twin through the deck’s pattern',
  plate: 'Plate',
  plateDoc: 'The corner the two-tone still keeps clear for a title plate',
  none: 'none',
} as const;

const PLATE_WORDS: Readonly<Record<MaterialPlateSide, string>> = {
  'lower-left': 'lower left',
  'lower-right': 'lower right',
  'upper-left': 'upper left',
};

const ID = 'formatOptions.shader';

function swatch(value: MaterialUniformValue): string | undefined {
  if (typeof value !== 'string') return undefined;
  const first = value.split(',')[0]?.trim() ?? '';
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(first) ? first.slice(0, 7) : undefined;
}

function enumName(spec: MaterialUniformSpec, value: MaterialUniformValue): string {
  const option = spec.options?.find((o) => o.value === value || o.name === value);
  return option?.name ?? String(value);
}

/** A still with a fallback plate when the previews are not built on this tree. */
function Still({ src, className, alt }: { src: string; className: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [src]);
  if (missing) return <span className={cn(className, 'is-missing')} aria-hidden="true" />;
  return <img className={className} src={src} alt={alt} onError={() => setMissing(true)} />;
}

function Group({ title, children, doc }: { title: string; children: ReactNode; doc?: string }) {
  return (
    <div className="ts-shader-group">
      <p
        className="ts-shader-group-title"
        {...(doc === undefined ? {} : tipProps({ name: title, doc }))}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * One common control: a range that previews on the live mount while held and commits on release,
 * beside a number field that commits on Enter; the arrow keys step and Shift steps ten (5.3).
 */
function ControlSlider({
  spec,
  value,
  applies,
  disabled,
  onPreview,
  onCommit,
}: {
  spec: ShaderControlSpec;
  value: number;
  applies: boolean;
  disabled: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef<number | null>(null);
  const update = (next: number | null) => {
    liveRef.current = next;
    setLive(next);
  };
  const commit = () => {
    const next = liveRef.current;
    if (next !== null && next !== value) onCommit(clampControl(spec.name, next));
    update(null);
  };
  const shown = live ?? value;
  const off = disabled || !applies;
  const doc = applies ? spec.sentence : `${spec.sentence}; ${SHADER_WORDS.notUsed.toLowerCase()}`;
  const tip = tipProps({ name: spec.label, doc });
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    tip.onKeyDown(event);
    if (off) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const step = spec.step * (event.shiftKey ? 10 : 1);
      const next = clampControl(spec.name, (liveRef.current ?? value) + direction * step);
      update(next);
      onPreview(next);
    }
  };
  return (
    <div className={cn('ts-fo-slider ts-shader-slider', off && 'is-off')}>
      <span className="ts-fo-field-label" {...tipProps({ name: spec.label, doc })}>
        {spec.label}
      </span>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={shown}
        aria-label={spec.label}
        aria-valuetext={String(shown)}
        data-control={`${ID}.${spec.name}.slider`}
        disabled={off}
        {...tip}
        onKeyDown={onKey}
        onChange={(event) => {
          const next = Number(event.target.value);
          update(next);
          onPreview(next);
        }}
        onPointerDown={() => {
          document.addEventListener('pointerup', commit, { once: true });
        }}
        onPointerUp={commit}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') commit();
        }}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
      <NumberField
        label={`${spec.label} value`}
        value={shown}
        onCommit={(next) => onCommit(clampControl(spec.name, next))}
        control={`${ID}.${spec.name}`}
        disabled={off}
        step={spec.step}
        min={spec.min}
        max={spec.max}
      />
    </div>
  );
}

export function ShaderSection({ block, deck, write, settings, onChange }: ShaderSectionProps) {
  const parked = (id: string) => isParked(id, settings ?? null);
  const palette = useMemo(() => shaderPaletteOfDeck(deck), [deck]);
  const base = materialEntry(block.materialId);
  const entry: MaterialEntry | undefined =
    base === undefined ? undefined : entryWithPalette(base, palette);
  const controls = useMemo(() => controlsWithDefaults(block.controls), [block.controls]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hex, setHex] = useState('');

  /* the preset's uniforms with the raw overrides, the base a held slider previews over */
  const previewBase = useMemo<MaterialUniforms | null>(() => {
    if (entry === undefined) return null;
    try {
      return resolveRecipe(entry, {
        ...(block.preset !== undefined ? { preset: block.preset } : {}),
      }).uniforms;
    } catch {
      return null;
    }
  }, [entry, block.preset]);

  if (entry === undefined || previewBase === null) {
    return (
      <div className="ts-shader" data-control={ID}>
        <p className="ts-fo-note" role="alert">
          This shader is not in the library on this deployment
        </p>
      </div>
    );
  }
  if (parked(ID)) return null;

  const busy = write.busy;
  const commitMutations = (mutations: Mutation[]) => {
    if (mutations.length === 0) return;
    write.report(
      write.dispatch('slide.update', {
        slideId: write.slideId,
        baseRevision: write.revision,
        mutations,
      }),
    );
  };
  const set = (path: string, value: unknown) =>
    commitMutations(shaderSetMutations(deck, write.slideId, block, path, value));

  /* a held slider: the stage's live mount takes the draft, nothing is written (5.3) */
  const preview = (name: MaterialControlName, value: number) => {
    if (name === 'speed') {
      previewShaderSpeed(block.id, value);
      return;
    }
    const draft: MaterialControls = { ...controls, [name]: value };
    previewShaderUniforms(block.id, uniformsWithControls(entry, previewBase, draft));
  };
  const commitControl = (name: MaterialControlName, value: number) => {
    const isDefault = value === SHADER_CONTROLS.find((spec) => spec.name === name)?.default;
    set(`/controls/${name}`, isDefault ? undefined : value);
  };

  const ground: KitColor | undefined =
    block.palette === 'custom' ? undefined : groundRoleOfPreset(block.preset);
  const applyCustom = () => {
    const value = hex.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(value)) return;
    const roleUniform =
      entry.palette.back ??
      entry.palette.colors ??
      entry.uniforms.find((spec) => spec.kind === 'color')?.name;
    if (roleUniform === undefined) return;
    const uniforms: MaterialUniforms = { ...(block.uniforms ?? {}), [roleUniform]: value };
    commitMutations([
      {
        op: 'block.set',
        slideId: write.slideId,
        blockId: block.id,
        path: '/uniforms',
        value: uniforms,
      },
      {
        op: 'block.set',
        slideId: write.slideId,
        blockId: block.id,
        path: '/palette',
        value: 'custom',
      },
    ]);
    setHex('');
  };

  const setUniform = (name: string, value: MaterialUniformValue | undefined) => {
    const next: MaterialUniforms = { ...(block.uniforms ?? {}) };
    if (value === undefined) delete next[name];
    else next[name] = value;
    set('/uniforms', Object.keys(next).length > 0 ? next : undefined);
  };
  const shownUniform = (spec: MaterialUniformSpec): MaterialUniformValue =>
    block.uniforms?.[spec.name] ?? previewBase[spec.name] ?? spec.default;

  const groups = (group: ShaderControlSpec['group']) =>
    SHADER_CONTROLS.filter((spec) => spec.group === group && !parked(`${ID}.${spec.name}`)).map(
      (spec) => (
        <ControlSlider
          key={spec.name}
          spec={spec}
          value={controls[spec.name]}
          applies={controlApplies(entry, spec.name)}
          disabled={busy}
          onPreview={(value) => preview(spec.name, value)}
          onCommit={(value) => commitControl(spec.name, value)}
        />
      ),
    );

  const stale = frameIsStale(block, deck.assets, palette);

  return (
    <div className="ts-shader" data-control={ID} data-material={block.materialId}>
      <div className="ts-shader-head">
        <Still
          src={shaderPreviewUrl(entry.id)}
          className="ts-shader-thumb"
          alt={`${entry.label} shader`}
        />
        <div className="ts-shader-name">
          <span className="ts-shader-title" {...tipProps({ name: entry.label, doc: entry.doc })}>
            {entry.label}
          </span>
          {onChange !== undefined && !parked(`${ID}.change`) ? (
            <PanelButton
              label={SHADER_WORDS.change}
              control={`${ID}.change`}
              onClick={onChange}
              disabled={busy}
              doc={SHADER_WORDS.changeDoc}
            />
          ) : null}
          <span
            className="ts-shader-frame"
            data-control={`${ID}.still`}
            data-stale={stale ? '1' : '0'}
          >
            {stale ? SHADER_WORDS.stillPending : SHADER_WORDS.stillFresh}
          </span>
        </div>
      </div>

      {parked(`${ID}.preset`) ? null : (
        <Group title={SHADER_WORDS.preset} doc={SHADER_WORDS.presetDoc}>
          <div className="ts-shader-tiles" role="radiogroup" aria-label={SHADER_WORDS.preset}>
            {entry.presets.map((preset) => {
              const on = block.preset === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={cn('ts-shader-tile', on && 'is-on')}
                  data-control={`${ID}.preset.${preset.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (!on) set('/preset', preset.name);
                  }}
                  {...tipProps({ name: preset.label, doc: preset.doc })}
                >
                  <Still
                    src={shaderPreviewUrl(entry.id, preset.name)}
                    className="ts-shader-tile-still"
                    alt=""
                  />
                  <span className="ts-shader-tile-word">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </Group>
      )}

      {parked(`${ID}.color`) ? null : (
        <Group title={SHADER_WORDS.colors} doc={SHADER_WORDS.colorsDoc}>
          <div className="ts-fo-colors" data-control={`${ID}.color`}>
            <div className="ts-fo-swatches" role="radiogroup" aria-label={SHADER_WORDS.colors}>
              {KIT_COLORS.map((role) => {
                const words = KIT_COLOR_WORDS[role];
                const value = palette[role];
                const on = ground === role;
                return (
                  <button
                    key={role}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={words.name}
                    className={cn('ts-fo-swatch', on && 'is-on')}
                    style={{ background: value }}
                    data-control={`${ID}.color.${role}`}
                    disabled={busy}
                    onClick={() => {
                      if (!on) set('/preset', palettePresetOfRole(role));
                    }}
                    {...tipProps({ name: `${words.name} ${value}`, doc: words.line })}
                  />
                );
              })}
            </div>
            <div className="ts-shader-custom">
              <span className="ts-fo-field-label">{SHADER_WORDS.custom}</span>
              <input
                type="text"
                className="ts-fo-hex"
                value={hex}
                placeholder="#rrggbb"
                aria-label={`${SHADER_WORDS.colors} ${SHADER_WORDS.custom.toLowerCase()}`}
                data-control={`${ID}.color.custom`}
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
                {...tipProps({
                  name: SHADER_WORDS.custom,
                  doc: SHADER_WORDS.customDoc,
                  key: 'Enter',
                })}
                onChange={(event) => setHex(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyCustom();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setHex('');
                    event.currentTarget.blur();
                  }
                }}
                onBlur={applyCustom}
              />
            </div>
          </div>
        </Group>
      )}

      <Group title={SHADER_WORDS.form}>{groups('Form')}</Group>
      <Group title={SHADER_WORDS.light}>{groups('Light and texture')}</Group>
      <Group title={SHADER_WORDS.orientation}>{groups('Orientation')}</Group>
      <Group title={SHADER_WORDS.motion}>{groups('Motion')}</Group>

      <Group title={SHADER_WORDS.dither} doc={DITHER.help}>
        {parked(`${ID}.twoTone`) ? null : (
          <CheckField
            label={SHADER_WORDS.twoTone}
            checked={block.twoTone === true}
            control={`${ID}.twoTone`}
            onChange={(checked) => set('/twoTone', checked ? true : undefined)}
            disabled={busy}
            doc={SHADER_WORDS.twoToneDoc}
          />
        )}
        {parked(`${ID}.plate`) ? null : (
          <SelectField<MaterialPlateSide | 'none'>
            label={SHADER_WORDS.plate}
            value={block.plate ?? 'none'}
            options={[
              { value: 'none', label: SHADER_WORDS.none },
              ...MATERIAL_PLATE_SIDES.map((side) => ({ value: side, label: PLATE_WORDS[side] })),
            ]}
            onChange={(value) => set('/plate', value === 'none' ? undefined : value)}
            control={`${ID}.plate`}
            disabled={busy}
            doc={SHADER_WORDS.plateDoc}
          />
        )}
      </Group>

      {parked(`${ID}.advanced`) ? null : (
        <div className="ts-shader-group">
          <button
            type="button"
            className="ts-shader-group-toggle"
            aria-expanded={advancedOpen}
            data-control={`${ID}.advanced`}
            onClick={() => setAdvancedOpen((open) => !open)}
            {...tipProps({ name: SHADER_WORDS.advanced, doc: SHADER_WORDS.advancedDoc })}
          >
            <span className="ts-shader-group-title">{SHADER_WORDS.advanced}</span>
            <span className={cn('ts-shader-chev', advancedOpen && 'is-open')} aria-hidden="true">
              <Icon name="chevron-down" />
            </span>
          </button>
          {advancedOpen ? (
            <div>
              <NumberField
                label={SHADER_WORDS.anchor}
                value={block.anchor ?? MATERIAL_ANCHORS[1]}
                onCommit={(value) => set('/anchor', value)}
                control={`${ID}.anchor`}
                disabled={busy}
                doc={SHADER_WORDS.anchorDoc}
                step={100}
                min={0}
                unit="ms"
              />
              {entry.uniforms.map((spec) => {
                const value = shownUniform(spec);
                const overridden = block.uniforms?.[spec.name] !== undefined;
                const control = `${ID}.uniform.${spec.name}`;
                const label = spec.label;
                return (
                  <div
                    key={spec.name}
                    className={cn('ts-shader-uniform', overridden && 'is-overridden')}
                  >
                    <span
                      className="ts-fo-field-label"
                      {...tipProps({ name: label, doc: spec.help ?? `${label} of the shader` })}
                    >
                      {label}
                    </span>
                    {spec.kind === 'enum' ? (
                      <select
                        className="ts-shader-select"
                        aria-label={label}
                        data-control={control}
                        value={enumName(spec, value)}
                        disabled={busy}
                        onChange={(event) => setUniform(spec.name, event.target.value)}
                      >
                        {(spec.options ?? []).map((option) => (
                          <option key={option.name} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : spec.kind === 'float' || spec.kind === 'int' ? (
                      <input
                        className="ts-shader-number"
                        type="number"
                        aria-label={label}
                        data-control={control}
                        value={typeof value === 'number' ? value : Number(value)}
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        disabled={busy}
                        onChange={(event) => {
                          const n = Number(event.target.value);
                          if (Number.isFinite(n))
                            setUniform(spec.name, spec.kind === 'int' ? Math.round(n) : n);
                        }}
                      />
                    ) : (
                      <span>
                        {swatch(value) !== undefined ? (
                          <span
                            className="ts-shader-swatch"
                            style={{ background: swatch(value) }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <input
                          className="ts-shader-text"
                          type="text"
                          aria-label={label}
                          data-control={control}
                          value={String(value)}
                          disabled={busy}
                          onChange={(event) => setUniform(spec.name, event.target.value)}
                        />
                      </span>
                    )}
                    {overridden ? (
                      <ToolButton
                        title={SHADER_WORDS.reset}
                        doc={`Back to the preset’s ${label.toLowerCase()}`}
                        ariaLabel={`${label} reset`}
                        icon="close"
                        control={`${control}.reset`}
                        onClick={() => setUniform(spec.name, undefined)}
                      />
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
