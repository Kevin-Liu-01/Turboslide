import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { Dialog, DialogField, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { tipProps } from '../Tooltip';
import { MEDIA_DIALOGS } from './media-strings';
import {
  AUDIO_ACCEPT,
  AUDIO_ACCEPTED_SENTENCE,
  insertMediaFile,
  insertMediaUrl,
  isMediaFile,
} from './media-upload';

import './media-dialogs.css';

/**
 * Insert > Audio (gslides-parity SPEC-5 3.2; R02 a.1): "Insert audio" with two tabs, Upload (a
 * drop zone and a file button for mp3, m4a and wav; the accepted list in one sentence) and By URL
 * (an https address of an audio file on an allow listed host). Google's dialog is the Drive
 * picker, which has no standalone form, so the tabs are Turboslide's and the row keeps Google's
 * label. Select confirms: one `media.insert` places the 96 by 96 speaker glyph at the centre of
 * the slide with Google's Play (on click) default; a file over 3 MB takes the presigned path
 * (media-upload.ts). Every control carries `dialog.insertAudio.*` for the window API.
 */
type Tab = 'upload' | 'byUrl';

export function InsertAudioDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const words = MEDIA_DIALOGS.audio;
  const [tab, setTab] = useState<Tab>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const validUrl = /^https:\/\/\S+$/i.test(url.trim());

  const take = (candidate: File | undefined) => {
    if (candidate === undefined) return;
    if (!isMediaFile(candidate)) {
      setError(
        `${candidate.name} is not an audio file Turboslide reads. ${AUDIO_ACCEPTED_SENTENCE}`,
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
      kind: 'audio' as const,
      onProgress: setProgress,
    };
    const run =
      tab === 'upload' && file !== null
        ? insertMediaFile(file, common)
        : insertMediaUrl(url, { ...common, youtube: false });
    run
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setBusy(false);
        setProgress(null);
      });
  };

  const ready = tab === 'upload' ? file !== null : validUrl;
  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.insertAudio"
      cancel
      actions={[
        {
          label: words.select,
          primary: true,
          disabled: !ready || busy,
          onClick: insert,
          control: 'dialog.insertAudio.ok',
          doc: 'Stores the audio and places it on the slide',
        },
      ]}
    >
      <DialogTabs<Tab>
        tabs={[
          { value: 'upload', label: words.upload },
          { value: 'byUrl', label: words.byUrl },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setError(null);
        }}
        control="dialog.insertAudio.tab"
      />
      {tab === 'upload' ? (
        <>
          <div
            className={`ts-media-drop${over ? ' is-over' : ''}${file !== null ? ' has-file' : ''}`}
            data-control="dialog.insertAudio.drop"
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
              data-control="dialog.insertAudio.choose"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              {...tipProps({ name: words.choose, doc: AUDIO_ACCEPTED_SENTENCE })}
            >
              {words.choose}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={AUDIO_ACCEPT}
              aria-label={words.upload}
              data-control="dialog.insertAudio.file"
              hidden
              onChange={(event) => take(event.target.files?.[0])}
            />
          </div>
          <p className="ts-dialog-hint">{AUDIO_ACCEPTED_SENTENCE}</p>
        </>
      ) : (
        <DialogField label={words.address} hint={words.addressHint}>
          <input
            type="url"
            value={url}
            autoFocus
            placeholder="https://"
            aria-label={words.address}
            data-control="dialog.insertAudio.url"
            autoComplete="off"
            {...tipProps({ name: words.address, doc: words.addressHint })}
            onChange={(event) => setUrl(event.target.value)}
          />
        </DialogField>
      )}
      {progress !== null ? <p className="ts-dialog-hint">{progress}</p> : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
