import type { Block, MediaBlock } from '@turboslide/schema/blocks';
import type { MediaAsset } from '@turboslide/schema/assets';
import {
  effectivePlayback,
  formatDuration,
  isYoutubeSource,
  parseDuration,
} from '@turboslide/schema/blocks/media';
import type { PlaybackStart } from '@turboslide/schema/blocks/media';

import { MEDIA_DIALOGS } from '../dialogs/media-strings';
import { CheckField, Note, PanelButton, RadioList, SelectField, SliderField } from './fields';
import type { SectionWrite } from './fields';

/**
 * Format options for a media block (gslides-parity SPEC-5 3.1; R02 a.1, a.2): the Audio playback
 * section (Start playing as On click or Automatically, Volume when presenting 0 to 100, Loop
 * audio, Stop on slide change on by default, Hide icon when presenting offered under
 * Automatically) and the Video playback section (Play as the three Google values, Start at and
 * End at as m:ss fields, Mute audio), each control one `media.setPlayback` call with the field it
 * writes; the Play row of the Motion panel follows the start (the handler's rule). Text fitting
 * is replaced by these sections for a media block (FormatOptions.tsx, the integrator's switch,
 * by request); Size & rotation and Position apply as to every object.
 */
export type MediaSectionProps = {
  block: MediaBlock;
  write: SectionWrite;
  /** the deck's media records, for the duration the time fields are bounded by */
  media?: Readonly<Record<string, MediaAsset>>;
  /** the editor's poster capture (the page decodes the file); absent on a surface without one */
  capturePoster?: (block: MediaBlock) => void;
};

/** True for a block the media sections serve (the switch in FormatOptions reads it). */
export function hasMediaPlayback(block: Block): block is MediaBlock {
  return block.type === 'media';
}

/** The section title per kind (Google's two section names). */
export function mediaSectionTitle(block: MediaBlock): string {
  return block.kind === 'audio'
    ? MEDIA_DIALOGS.format.audioSection
    : MEDIA_DIALOGS.format.videoSection;
}

export function MediaPlaybackSection({ block, write, media, capturePoster }: MediaSectionProps) {
  const words = MEDIA_DIALOGS.format;
  const playback = effectivePlayback(block.playback);
  const youtube = isYoutubeSource(block.source);
  const asset = isYoutubeSource(block.source) ? undefined : media?.[block.source.asset];
  const durationMs = asset?.durationMs ?? null;
  const set = (patch: Record<string, unknown>) =>
    write.report(
      write.dispatch('media.setPlayback', {
        slideId: write.slideId,
        blockId: block.id,
        ...patch,
        baseRevision: write.revision,
      }),
    );
  const control = `formatOptions.media.${block.kind}`;

  if (block.kind === 'audio') {
    return (
      <>
        <RadioList<PlaybackStart>
          label={words.startPlaying}
          value={playback.start === 'auto' ? 'auto' : 'click'}
          control={`${control}.start`}
          options={[
            {
              value: 'click',
              label: words.onClick,
              doc: 'The audio plays on the first click after the slide’s own steps',
            },
            {
              value: 'auto',
              label: words.automatically,
              doc: 'The audio plays when the slide shows, as a Play step of the Motion panel',
            },
          ]}
          onChange={(start) => set({ start })}
          disabled={write.busy}
        />
        <SliderField
          label={words.volume}
          value={playback.volume}
          min={0}
          max={100}
          control={`${control}.volume`}
          onCommit={(value) => set({ volume: value === 100 ? null : value })}
          disabled={write.busy}
          unit="%"
        />
        <CheckField
          label={words.loop}
          checked={playback.loop}
          control={`${control}.loop`}
          onChange={(loop) => set({ loop })}
          disabled={write.busy}
          doc="Restarts the audio until the slide changes or the show ends"
        />
        <CheckField
          label={words.stopOnSlideChange}
          checked={playback.stopOnSlideChange}
          control={`${control}.stopOnSlideChange`}
          onChange={(stopOnSlideChange) => set({ stopOnSlideChange })}
          disabled={write.busy}
          doc="Off keeps the audio playing across slides"
        />
        {playback.start === 'auto' ? (
          <CheckField
            label={words.hideIcon}
            checked={playback.hideIcon}
            control={`${control}.hideIcon`}
            onChange={(hideIcon) => set({ hideIcon })}
            disabled={write.busy}
            doc="The speaker icon leaves the slide in the show; the stills keep it"
          />
        ) : null}
        {durationMs !== null ? <Note>{`Length ${formatDuration(durationMs)}`}</Note> : null}
      </>
    );
  }

  const timeField = (
    label: string,
    key: 'startMs' | 'endMs',
    value: number | null,
    controlId: string,
  ) => (
    <label className="ts-fo-field">
      <span className="ts-fo-field-label">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        defaultValue={value === null ? '' : formatDuration(value)}
        key={`${key}:${value ?? 'none'}`}
        placeholder={
          key === 'startMs' ? '0:00' : durationMs === null ? '' : formatDuration(durationMs)
        }
        aria-label={label}
        data-control={controlId}
        disabled={write.busy}
        title={words.timeDoc}
        onBlur={(event) => {
          const text = event.target.value.trim();
          if (text === '') {
            if (value !== null) set({ [key]: null });
            return;
          }
          const ms = parseDuration(text);
          if (ms === null) {
            event.target.value = value === null ? '' : formatDuration(value);
            return;
          }
          if (ms !== value) set({ [key]: key === 'startMs' && ms === 0 ? null : ms });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );

  return (
    <>
      <SelectField<PlaybackStart>
        label={words.play}
        value={playback.start}
        control={`${control}.start`}
        options={[
          { value: 'click', label: words.playOnClick },
          { value: 'auto', label: words.playAutomatically },
          { value: 'manual', label: words.playManual },
        ]}
        onChange={(start) => set({ start })}
        disabled={write.busy}
        doc="Play (on click) is Google’s default; Play (automatically) becomes a Play step; Play (manual) plays only when the video is clicked"
      />
      {playback.start === 'manual' ? <Note>{words.manualNote}</Note> : null}
      <div className="ts-fo-fields is-two">
        {timeField(
          words.startAt,
          'startMs',
          playback.startMs === 0 ? null : playback.startMs,
          `${control}.startAt`,
        )}
        {timeField(words.endAt, 'endMs', playback.endMs, `${control}.endAt`)}
      </div>
      <CheckField
        label={words.muteAudio}
        checked={playback.mute}
        control={`${control}.mute`}
        onChange={(mute) => set({ mute })}
        disabled={write.busy}
        doc="Silences the video in the show"
      />
      {youtube ? (
        <Note>{words.youtubeNote}</Note>
      ) : (
        <div className="ts-fo-row">
          <span className="ts-fo-field-label">{words.poster}</span>
          <div className="ts-fo-buttons">
            <PanelButton
              label={words.capturePoster}
              icon="photo"
              control={`${control}.capturePoster`}
              onClick={() => capturePoster?.(block)}
              disabled={write.busy || capturePoster === undefined}
              doc={words.posterNote}
            />
          </div>
          {durationMs !== null ? <Note>{`Length ${formatDuration(durationMs)}`}</Note> : null}
        </div>
      )}
    </>
  );
}
