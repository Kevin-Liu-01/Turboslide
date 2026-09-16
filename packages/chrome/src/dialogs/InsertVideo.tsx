import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { parseYoutubeUrl, youtubeThumbnailUrl } from '@turboslide/schema/blocks/media';

import { Dialog, DialogField, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { tipProps } from '../Tooltip';
import { MEDIA_DIALOGS } from './media-strings';
import {
  VIDEO_ACCEPT,
  VIDEO_ACCEPTED_SENTENCE,
  insertMediaFile,
  insertMediaUrl,
  isMediaFile,
} from './media-upload';

import './media-dialogs.css';

/**
 * Insert > Video (gslides-parity SPEC-5 3.2; R02 a.2; R11 4): "Insert video" with Google's three
 * tab names in Google's order: Search YouTube (drawn and disabled with the clause "Search needs a
 * YouTube Data API key" until Kevin decides, SPEC-5 14.3), By URL (a YouTube link in the eight
 * forms plus `embed/`, or an https address of an mp4 or webm on an allow listed host) and Upload
 * (a drop zone and a file button for mp4 and webm). Select confirms: one `media.insert` places a
 * 960 by 540 box at the centre of the slide with Google's Play (on click) default; a YouTube link
 * shows the live thumbnail here only (`i.ytimg.com`, never stored) and gets Turboslide's own frame
 * with the oEmbed title as its poster. Every control carries `dialog.insertVideo.*`.
 */
type Tab = 'search' | 'byUrl' | 'upload';

export function InsertVideoDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const words = MEDIA_DIALOGS.video;
  const [tab, setTab] = useState<Tab>('byUrl');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const youtube = parseYoutubeUrl(url);
  const validUrl = youtube.ok || /^https:\/\/\S+\.(mp4|m4v|webm)(\?\S*)?$/i.test(url.trim());
  const urlProblem =
    url.trim() !== '' && !validUrl
      ? youtube.ok
        ? null
        : /^https?:\/\//i.test(url.trim()) || url.includes('youtu')
          ? youtube.reason
          : null
      : null;

  const take = (candidate: File | undefined) => {
    if (candidate === undefined) return;
    if (!isMediaFile(candidate)) {
      setError(
        `${candidate.name} is not a video file Turboslide reads. ${VIDEO_ACCEPTED_SENTENCE}`,
      );
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files[0]);
  };

  const insert = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const common = {
      deckId: input.deckId,
      slideId: input.slideId,
      revision: input.revision,
      dispatch: (id: string, value: unknown) => input.dispatch(id as never, value),
      kind: 'video' as const,
      onProgress: setProgress,
    };
    const run =
      tab === 'upload' && file !== null
        ? insertMediaFile(file, common)
        : insertMediaUrl(url, { ...common, youtube: youtube.ok });
    run
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setBusy(false);
        setProgress(null);
      });
  };

  const ready = tab === 'upload' ? file !== null : tab === 'byUrl' ? validUrl : false;
  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.insertVideo"
      cancel
      actions={[
        {
          label: words.select,
          primary: true,
          disabled: !ready || busy,
          onClick: insert,
          control: 'dialog.insertVideo.ok',
          doc: 'Places the video on the slide',
        },
      ]}
    >
      <DialogTabs<Tab>
        tabs={[
          { value: 'search', label: words.search },
          { value: 'byUrl', label: words.byUrl },
          { value: 'upload', label: words.upload },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setError(null);
        }}
        control="dialog.insertVideo.tab"
      />
      {tab === 'search' ? (
        <div className="ts-media-search is-disabled" data-control="dialog.insertVideo.search">
          <input
            type="search"
            disabled
            placeholder={words.search}
            aria-label={words.search}
            data-control="dialog.insertVideo.search.query"
            {...tipProps({ name: words.search, doc: words.searchNeedsKey })}
          />
          <p className="ts-dialog-hint" data-control="dialog.insertVideo.search.clause">
            {words.searchNeedsKey}
          </p>
        </div>
      ) : null}
      {tab === 'byUrl' ? (
        <>
          <DialogField label={words.address} hint={words.addressHint}>
            <input
              type="url"
              value={url}
              autoFocus
              placeholder="https://"
              aria-label={words.address}
              data-control="dialog.insertVideo.url"
              autoComplete="off"
              {...tipProps({ name: words.address, doc: words.addressHint })}
              onChange={(event) => setUrl(event.target.value)}
            />
          </DialogField>
          {youtube.ok ? (
            <div className="ts-dialog-slide-frame ts-media-preview" style={{ maxHeight: 220 }}>
              <img
                src={youtubeThumbnailUrl(youtube.link.id)}
                alt=""
                data-control="dialog.insertVideo.preview"
                {...tipProps({ name: words.byUrl, doc: words.preview })}
              />
            </div>
          ) : null}
          {urlProblem !== null ? <p className="ts-dialog-hint">{urlProblem}</p> : null}
        </>
      ) : null}
      {tab === 'upload' ? (
        <>
          <div
            className={`ts-media-drop${over ? ' is-over' : ''}${file !== null ? ' has-file' : ''}`}
            data-control="dialog.insertVideo.drop"
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <p className="ts-media-drop-words">{file === null ? words.dropHere : file.name}</p>
            <button
              type="button"
              className="ts-media-drop-button"
              data-control="dialog.insertVideo.choose"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              {...tipProps({ name: words.choose, doc: VIDEO_ACCEPTED_SENTENCE })}
            >
              {words.choose}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={VIDEO_ACCEPT}
              aria-label={words.upload}
              data-control="dialog.insertVideo.file"
              hidden
              onChange={(event) => take(event.target.files?.[0])}
            />
          </div>
          <p className="ts-dialog-hint">{VIDEO_ACCEPTED_SENTENCE}</p>
        </>
      ) : null}
      {progress !== null ? <p className="ts-dialog-hint">{progress}</p> : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
