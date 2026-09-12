import type { ReactNode } from 'react';

import { counterText } from './presentModel';
import type { PresentPlatform } from './presentKeys';
import { PRESENT_TEXT } from './strings';
import { defaultTip, PresentIcon } from './ui';
import type { PresentIcons, PresentTip } from './ui';

import './PresentToolbar.css';

/**
 * The present mode toolbar (gslides-parity SPEC 9.2; R04 A3): a compact bar at the bottom left
 * that appears when the pointer moves there and fades two seconds after it leaves, translucent at
 * rest and opaque under the cursor. Google's order: Previous, the slide number as a button that
 * opens the slide list, Next, then the Options menu at the right end; this round also draws the
 * laser pointer, the disabled Captions stub, Enter or exit full screen and Exit as buttons of
 * their own, as the round's plan names them. The bar is always in the tree so Tab reaches it (SPEC
 * 13.5); `shown` only changes its opacity. The parent owns every state and the two popovers; the
 * bar reports the anchors they open from.
 */
export type PresentToolbarProps = {
  index: number;
  total: number;
  /** the pointer is near, a control has focus or a popover is open */
  shown: boolean;
  laser: boolean;
  fullscreen: boolean;
  listOpen: boolean;
  optionsOpen: boolean;
  platform: PresentPlatform;
  onPrevious: () => void;
  onNext: () => void;
  onList: (anchor: HTMLElement) => void;
  onLaser: () => void;
  onFullscreen: () => void;
  onExit: () => void;
  onOptions: (anchor: HTMLElement) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  /** the id of the slide list, for aria-controls */
  listId?: string;
  optionsId?: string;
  icons?: PresentIcons;
  tip?: PresentTip;
};

function Button({
  control,
  name,
  doc,
  keyLabel,
  pressed,
  expanded,
  haspopup,
  controls,
  disabled,
  tip,
  onClick,
  children,
}: {
  control: string;
  name: string;
  doc?: string;
  /** the key as words, for the tooltip chip; `key` itself is React's */
  keyLabel?: string;
  pressed?: boolean;
  expanded?: boolean;
  haspopup?: 'menu' | 'listbox';
  controls?: string;
  disabled?: boolean;
  tip: PresentTip;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const content = {
    name,
    ...(doc !== undefined ? { doc } : {}),
    ...(keyLabel !== undefined ? { key: keyLabel } : {}),
  };
  const classes = ['ts-present-btn'];
  if (pressed) classes.push('is-on');
  if (disabled) classes.push('is-disabled');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-control={control}
      aria-label={name}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={haspopup}
      aria-controls={controls}
      aria-disabled={disabled ? true : undefined}
      onClick={disabled ? undefined : onClick}
      {...tip(content)}
    >
      {children}
    </button>
  );
}

export function PresentToolbar({
  index,
  total,
  shown,
  laser,
  fullscreen,
  listOpen,
  optionsOpen,
  platform,
  onPrevious,
  onNext,
  onList,
  onLaser,
  onFullscreen,
  onExit,
  onOptions,
  onPointerEnter,
  onPointerLeave,
  listId,
  optionsId,
  icons,
  tip = defaultTip,
}: PresentToolbarProps) {
  const mod = platform === 'mac' ? 'Cmd' : 'Ctrl';
  return (
    <div
      className={shown ? 'ts-present-bar is-shown' : 'ts-present-bar'}
      role="toolbar"
      aria-label={PRESENT_TEXT.toolbar}
      data-control="present.toolbar"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <Button
        control="present.previous"
        name={PRESENT_TEXT.previous}
        keyLabel="Left arrow"
        tip={tip}
        onClick={onPrevious}
      >
        <PresentIcon name="previous" icons={icons} />
      </Button>
      <button
        type="button"
        className={listOpen ? 'ts-present-count is-on' : 'ts-present-count'}
        data-control="present.counter"
        aria-haspopup="listbox"
        aria-expanded={listOpen}
        aria-controls={listId}
        onClick={(event) => onList(event.currentTarget)}
        {...tip({
          name: PRESENT_TEXT.slideList,
          doc: 'The slide number; opens the list of slides to jump to one',
        })}
      >
        {counterText(index, total)}
      </button>
      <Button
        control="present.next"
        name={PRESENT_TEXT.next}
        keyLabel="Right arrow"
        tip={tip}
        onClick={onNext}
      >
        <PresentIcon name="next" icons={icons} />
      </Button>
      <span className="ts-present-sep" aria-hidden="true" />
      <Button
        control="present.laser"
        name={laser ? PRESENT_TEXT.laserOff : PRESENT_TEXT.laserOn}
        keyLabel="L"
        pressed={laser}
        tip={tip}
        onClick={onLaser}
      >
        <PresentIcon name="laser" icons={icons} />
      </Button>
      <Button
        control="present.captions"
        name={PRESENT_TEXT.captions}
        doc={PRESENT_TEXT.captionsStub}
        disabled
        tip={tip}
      >
        <PresentIcon name="captions" icons={icons} />
      </Button>
      <Button
        control="present.fullScreen"
        name={fullscreen ? PRESENT_TEXT.exitFullScreen : PRESENT_TEXT.enterFullScreen}
        keyLabel={platform === 'mac' ? `${mod} Shift F` : 'F11'}
        tip={tip}
        onClick={onFullscreen}
      >
        <PresentIcon name={fullscreen ? 'exitFullscreen' : 'fullscreen'} icons={icons} />
      </Button>
      <Button
        control="present.exit"
        name={PRESENT_TEXT.exit}
        keyLabel="Esc"
        tip={tip}
        onClick={onExit}
      >
        <PresentIcon name="exit" icons={icons} />
      </Button>
      <Button
        control="present.options"
        name={PRESENT_TEXT.options}
        expanded={optionsOpen}
        haspopup="menu"
        controls={optionsId}
        tip={tip}
        onClick={(event) => onOptions(event.currentTarget)}
      >
        <PresentIcon name="options" icons={icons} />
      </Button>
    </div>
  );
}
