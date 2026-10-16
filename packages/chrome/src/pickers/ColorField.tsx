import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef, useState } from 'react';

import {
  formatOklch,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  oklchToHex,
  parseOklch,
} from '@turboslide/theme/color-space';
import type { Hsv } from '@turboslide/theme/color-space';
import { parseColor, toHex } from '@turboslide/theme/contrast';

import { cn } from '../lib/cn';
import { useMountEffect } from '../lib/useMountEffect';
import { PICKERS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * The free colour field of the colour plate (the Glyphfield port, wave 2 item 6, from Glyphfield's
 * src/components/ui/ColorControl.tsx and ScreenColorPicker.tsx): a saturation and brightness area,
 * a hue strip, the Hex and OKLCH fields, Pick Screen Color where the browser has the EyeDropper
 * API, and Apply. Every part changes one draft colour and nothing else; Apply, or Enter in any
 * part, hands the draft to `onApply` once, so a pick from the field is one write and one history
 * entry like a swatch's. `onDraft` hears each draft (the brand kit previews it on the sheet). The
 * draft keeps its own hue and saturation, so dragging to a grey or to black and back does not
 * lose the hue a hex cannot hold. Ids: `<control>.custom.area`, `.custom.hue`, `.custom.oklch`,
 * `.custom.screen`, `.custom.apply`, and the Hex field keeps `<control>.hex`. The colour maths is
 * the one copy in @turboslide/theme/color-space.
 */
export type ColorFieldProps = {
  /** the colour the draft starts from, `#rrggbb` */
  value: string;
  /** the plate's accessible name, which names each part */
  label: string;
  control: string;
  onDraft?: (hex: string) => void;
  onApply: (hex: string) => void;
};

type EyeDropperCtor = new () => {
  open: (options?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>;
};

/** The browser's EyeDropper (Chromium on the desktop); undefined where it has none. */
function eyeDropper(): EyeDropperCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const ctor = (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return typeof ctor === 'function' ? ctor : undefined;
}

/** A complete six digit hex, the hash optional: the Hex field moves the draft as it is typed. */
const SIX_DIGITS = /^#?[0-9a-f]{6}$/i;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** The OKLCH field's text: the three numbers of `oklch()` without the function, to fit. */
const oklchOf = (hex: string): string => (formatOklch(hex) ?? '').replace(/^oklch\((.*)\)$/, '$1');

export function ColorField({ value, label, control, onDraft, onApply }: ColorFieldProps) {
  const words = PICKERS.colors;
  const [hsv, setHsvState] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });
  /* the text of the Hex or OKLCH field while it is typed; null shows the draft */
  const [hexText, setHexText] = useState<string | null>(null);
  const [oklchText, setOklchText] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);
  /* the latest draft for the pointer moves between renders */
  const latest = useRef(hsv);
  const dragging = useRef<number | null>(null);
  const sample = useRef<AbortController | null>(null);
  const draft = hsvToHex(hsv);
  const canSample = eyeDropper() !== undefined;

  useMountEffect(() => () => sample.current?.abort());

  const move = (next: Hsv, from?: 'hex' | 'oklch') => {
    const held: Hsv = { h: ((next.h % 360) + 360) % 360, s: clamp01(next.s), v: clamp01(next.v) };
    latest.current = held;
    setHsvState(held);
    if (from !== 'hex') setHexText(null);
    if (from !== 'oklch') setOklchText(null);
    onDraft?.(hsvToHex(held));
  };

  /* a typed or sampled hex keeps the draft's hue on a grey and its saturation on black */
  const moveToHex = (hex: string, from?: 'hex' | 'oklch') => {
    const next = hexToHsv(hex);
    if (next === null) return;
    const now = latest.current;
    move(
      {
        h: next.s === 0 || next.v === 0 ? now.h : next.h,
        s: next.v === 0 ? now.s : next.s,
        v: next.v,
      },
      from,
    );
  };

  /* the text of a field as a hex, or null when it reads no colour */
  const hexOfText = (text: string | null, kind: 'hex' | 'oklch'): string | null => {
    if (text === null) return null;
    const trimmed = text.trim();
    if (kind === 'hex') return normalizeHex(trimmed.startsWith('#') ? trimmed : `#${trimmed}`);
    const parsed = parseOklch(trimmed);
    return parsed === null ? null : oklchToHex(parsed);
  };

  const apply = (hex: string = draft) => onApply(hex);

  /* Enter in any part applies; a typed field applies its own text when it reads a colour */
  const enter = (event: KeyboardEvent<HTMLElement>, kind?: 'hex' | 'oklch') => {
    if (event.key !== 'Enter') return false;
    event.preventDefault();
    event.stopPropagation();
    if (kind === undefined) {
      apply();
      return true;
    }
    const typed = hexOfText(kind === 'hex' ? hexText : oklchText, kind);
    if (typed !== null) apply(typed);
    else if ((kind === 'hex' ? hexText : oklchText) === null) apply();
    return true;
  };

  const areaAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return;
    move({
      h: latest.current.h,
      s: (event.clientX - box.left) / box.width,
      v: 1 - (event.clientY - box.top) / box.height,
    });
  };
  const hueAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!(box.width > 0)) return;
    move({ ...latest.current, h: clamp01((event.clientX - box.left) / box.width) * 359.99 });
  };
  const drag = (at: (event: PointerEvent<HTMLDivElement>) => void) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      dragging.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      at(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (dragging.current === event.pointerId) at(event);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (dragging.current !== event.pointerId) return;
      dragging.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => {
      dragging.current = null;
    },
  });

  const areaTip = tipProps({ name: `${label}: ${words.area.toLowerCase()}`, doc: words.areaDoc });
  const hueTip = tipProps({ name: `${label}: ${words.hue.toLowerCase()}`, doc: words.hueDoc });
  const areaKey = (event: KeyboardEvent<HTMLDivElement>) => {
    areaTip.onKeyDown(event);
    if (enter(event)) return;
    const step = event.shiftKey ? 0.1 : 0.01;
    const now = latest.current;
    const next =
      event.key === 'ArrowLeft'
        ? { ...now, s: now.s - step }
        : event.key === 'ArrowRight'
          ? { ...now, s: now.s + step }
          : event.key === 'ArrowUp'
            ? { ...now, v: now.v + step }
            : event.key === 'ArrowDown'
              ? { ...now, v: now.v - step }
              : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    move(next);
  };
  const hueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    hueTip.onKeyDown(event);
    if (enter(event)) return;
    const step = event.shiftKey ? 10 : 1;
    const now = latest.current;
    const h =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? Math.max(0, now.h - step)
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? Math.min(359, now.h + step)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 359
              : null;
    if (h === null) return;
    event.preventDefault();
    event.stopPropagation();
    move({ ...now, h });
  };

  const pickScreen = async () => {
    const Ctor = eyeDropper();
    if (Ctor === undefined || sample.current !== null) return;
    const controller = new AbortController();
    sample.current = controller;
    setSampling(true);
    try {
      /* opened in the click's own activation, as the API asks */
      const picked = parseColor((await new Ctor().open({ signal: controller.signal })).sRGBHex);
      if (picked !== null && !controller.signal.aborted) moveToHex(toHex(picked));
    } catch {
      /* Escape, or the plate closed: the draft stays */
    } finally {
      sample.current = null;
      if (!controller.signal.aborted) setSampling(false);
    }
  };

  const hexTip = tipProps({ name: words.custom, doc: words.hex, key: 'Enter' });
  const oklchTip = tipProps({ name: words.oklch, doc: words.oklchDoc, key: 'Enter' });
  const textField = (kind: 'hex' | 'oklch') => {
    const tip = kind === 'hex' ? hexTip : oklchTip;
    const text = kind === 'hex' ? hexText : oklchText;
    const setText = kind === 'hex' ? setHexText : setOklchText;
    return (
      <input
        type="text"
        value={text ?? (kind === 'hex' ? draft : oklchOf(draft))}
        aria-label={kind === 'hex' ? words.custom : `${label} ${words.oklch}`}
        data-control={kind === 'hex' ? `${control}.hex` : `${control}.custom.oklch`}
        placeholder={kind === 'hex' ? '#rrggbb' : '63% 0.258 29'}
        spellCheck={false}
        autoComplete="off"
        {...tip}
        onChange={(event) => {
          const typed = event.target.value;
          setText(typed);
          const hex =
            kind === 'hex'
              ? SIX_DIGITS.test(typed.trim())
                ? hexOfText(typed, 'hex')
                : null
              : hexOfText(typed, 'oklch');
          if (hex !== null) moveToHex(hex, kind);
        }}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
          enter(event, kind);
        }}
        onBlur={(event) => {
          tip.onBlur(event);
          const hex = hexOfText(text, kind);
          if (hex !== null) moveToHex(hex);
          else setText(null);
        }}
      />
    );
  };

  const screenTip = tipProps({ name: words.pickScreen, doc: words.pickScreenDoc });
  const applyTip = tipProps({ name: words.apply, doc: words.applyDoc, key: 'Enter' });
  const saturation = Math.round(hsv.s * 100);
  const brightness = Math.round(hsv.v * 100);
  return (
    <div
      className="ts-color-field"
      role="group"
      aria-label={`${label} ${words.custom.toLowerCase()}`}
      style={{ ['--ts-color-hue' as string]: String(Math.round(hsv.h)) }}
    >
      <div
        className="ts-color-area"
        role="slider"
        tabIndex={0}
        aria-label={`${label} ${words.area.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={saturation}
        aria-valuetext={words.areaValue(saturation, brightness)}
        data-control={`${control}.custom.area`}
        {...areaTip}
        {...drag(areaAt)}
        onKeyDown={areaKey}
      >
        <span
          className="ts-color-area-thumb"
          aria-hidden="true"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        className="ts-color-hue"
        role="slider"
        tabIndex={0}
        aria-label={`${label} ${words.hue.toLowerCase()}`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        data-control={`${control}.custom.hue`}
        {...hueTip}
        {...drag(hueAt)}
        onKeyDown={hueKey}
      >
        <span
          className="ts-color-hue-thumb"
          aria-hidden="true"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <div className="ts-color-hex">
        <i className="ts-color-draft" aria-hidden="true" style={{ background: draft }} />
        {textField('hex')}
        <button
          type="button"
          className="ts-color-action"
          data-control={`${control}.custom.apply`}
          {...applyTip}
          onClick={() => apply()}
        >
          {words.apply}
        </button>
      </div>
      <label className="ts-color-hex">
        <span>{words.oklch}</span>
        {textField('oklch')}
      </label>
      {canSample ? (
        <button
          type="button"
          className={cn('ts-color-action', sampling && 'is-on')}
          aria-pressed={sampling}
          data-control={`${control}.custom.screen`}
          {...screenTip}
          onClick={() => void pickScreen()}
        >
          {words.pickScreen}
        </button>
      ) : null}
    </div>
  );
}
