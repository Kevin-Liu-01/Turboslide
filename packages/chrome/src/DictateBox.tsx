import { useEffect, useRef, useState } from 'react';

import { ROUND_FIVE } from './menus/strings';
import { OFFERED_LANGUAGES } from './text-tools';
import { tipProps } from './Tooltip';

import './dialogs/text-tools-dialogs.css';

/**
 * Dictate speaker notes (gslides-parity SPEC-5 7.3, 0.36; R10 6.2; P1 5.8): the microphone box
 * floating over the notes pane's left edge, 200 by 128 px, a language dropdown above the round
 * button. The button starts `SpeechRecognition` (the prefixed form where that is all the browser
 * has) with `continuous` and `interimResults`, `lang` set and `maxAlternatives` 1; interim text
 * shows grey under the button and final results reach the pane through `onFinal` (the pane
 * appends them at the caret and writes `slide.set /notes` as it does for typing). Before starting
 * the box asks `SpeechRecognition.available({ langs, processLocally: true })` where the static
 * exists: `available` sets `processLocally`, `downloadable` offers the language pack, otherwise
 * the audio goes to the browser's service; the one privacy sentence under the button says which
 * ("Speech stays on this device" or "Your browser sends audio to its speech service for
 * recognition"). Where neither constructor exists the button is the unsupported sentence. A
 * refused microphone shows "Allow the microphone to dictate". `end` restarts while the box is on,
 * since Chrome ends sessions on silence; Esc, the button and leaving the slide stop it. No voice
 * commands, as Google's Slides notes have none; punctuation is what the recogniser returns.
 */
export const DICTATE_STRINGS = {
  title: 'Dictate speaker notes',
  language: 'Language',
  start: 'Start',
  stop: 'Stop',
  microphone: 'Allow the microphone to dictate',
  download: 'Download the language pack for on device recognition',
  downloading: 'Downloading the language pack',
  close: 'Close',
} as const;

/** The subset of the Web Speech API the box drives (MDN SpeechRecognition; injected in the tests). */
export type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart?: (() => void) | null;
};

export type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export type RecognitionCtor = (new () => RecognitionLike) & {
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

/** The constructor the page offers: `SpeechRecognition`, the `webkit` form, or null. */
export function recognitionCtor(scope: typeof globalThis = globalThis): RecognitionCtor | null {
  const w = scope as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type DictateBoxProps = {
  /** the deck's language, the dropdown's default when the preference has none */
  language: string;
  /** the remembered choice, `preferences.dictation.lang` */
  preferred?: string;
  /** the dropdown's write: `prefs.set /dictation/lang` */
  onLanguage?: (lang: string) => void;
  /** a final result to append to the notes at the caret */
  onFinal: (text: string) => void;
  /** the interim text to show grey after the caret; '' clears it */
  onInterim?: (text: string) => void;
  onClose: () => void;
  /** the constructor; the page's when absent (the tests inject a fake) */
  ctor?: RecognitionCtor | null;
};

type Privacy = 'local' | 'remote' | 'downloadable' | 'unknown';

export function DictateBox({
  language,
  preferred,
  onLanguage,
  onFinal,
  onInterim,
  onClose,
  ctor,
}: DictateBoxProps) {
  const Ctor = ctor === undefined ? recognitionCtor() : ctor;
  const [lang, setLang] = useState(preferred ?? language);
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('unknown');
  const [notice, setNotice] = useState<string | null>(null);
  const recognition = useRef<RecognitionLike | null>(null);
  const wanted = useRef(false);

  useEffect(() => {
    if (Ctor === null || Ctor.available === undefined) {
      setPrivacy(Ctor === null ? 'unknown' : 'remote');
      return;
    }
    let alive = true;
    Ctor.available({ langs: [lang], processLocally: true })
      .then((state) => {
        if (!alive) return;
        setPrivacy(
          state === 'available'
            ? 'local'
            : state === 'downloadable' || state === 'downloading'
              ? 'downloadable'
              : 'remote',
        );
      })
      .catch(() => {
        if (alive) setPrivacy('remote');
      });
    return () => {
      alive = false;
    };
  }, [Ctor, lang]);

  const stop = () => {
    wanted.current = false;
    recognition.current?.stop();
    recognition.current = null;
    setOn(false);
    setInterim('');
    onInterim?.('');
  };

  const start = () => {
    if (Ctor === null) return;
    let instance: RecognitionLike;
    try {
      instance = new Ctor();
    } catch {
      setNotice(ROUND_FIVE.speechUnsupported);
      return;
    }
    instance.lang = lang;
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    if (privacy === 'local') instance.processLocally = true;
    instance.onresult = (event) => {
      let finals = '';
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result === undefined) continue;
        if (result.isFinal) finals += result[0].transcript;
        else partial += result[0].transcript;
      }
      if (finals !== '') onFinal(finals);
      setInterim(partial);
      onInterim?.(partial);
    };
    instance.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setNotice(DICTATE_STRINGS.microphone);
        stop();
      }
    };
    instance.onend = () => {
      // Chrome ends a session on silence: while the box is on, start again
      if (wanted.current && recognition.current === instance) {
        try {
          instance.start();
        } catch {
          stop();
        }
      }
    };
    recognition.current = instance;
    wanted.current = true;
    setNotice(null);
    try {
      instance.start();
      setOn(true);
    } catch {
      setNotice(ROUND_FIVE.speechUnsupported);
      wanted.current = false;
      recognition.current = null;
    }
  };

  useEffect(() => () => stop(), []); // leaving the slide or closing the box stops the session

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && on) {
        event.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `stop` closes over refs alone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const install = () => {
    if (Ctor?.install === undefined) return;
    setNotice(DICTATE_STRINGS.downloading);
    Ctor.install({ langs: [lang], processLocally: true })
      .then((ok) => {
        setPrivacy(ok ? 'local' : 'remote');
        setNotice(null);
      })
      .catch(() => setNotice(null));
  };

  const sentence =
    Ctor === null
      ? ROUND_FIVE.speechUnsupported
      : privacy === 'local'
        ? ROUND_FIVE.speechOnDevice
        : ROUND_FIVE.speechRemote;
  const languages = OFFERED_LANGUAGES.some((entry) => entry.tag === lang)
    ? OFFERED_LANGUAGES
    : [...OFFERED_LANGUAGES, { tag: lang, label: lang }];
  return (
    <div
      className="ts-dictate"
      role="group"
      aria-label={DICTATE_STRINGS.title}
      data-control="dictate"
      data-on={on ? '' : undefined}
    >
      <div className="ts-tt-row">
        <select
          className="ts-tt-field ts-tt-grow"
          value={lang}
          aria-label={DICTATE_STRINGS.language}
          data-control="dictate.language"
          disabled={on}
          {...tipProps({
            name: DICTATE_STRINGS.language,
            doc: 'The language the recogniser listens for',
          })}
          onChange={(event) => {
            setLang(event.target.value);
            onLanguage?.(event.target.value);
          }}
        >
          {languages.map((entry) => (
            <option key={entry.tag} value={entry.tag}>
              {entry.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ts-tt-small"
          aria-label={DICTATE_STRINGS.close}
          data-control="dictate.close"
          {...tipProps({
            name: DICTATE_STRINGS.close,
            doc: 'Stops dictating and closes the box',
            key: 'Esc',
          })}
          onClick={() => {
            stop();
            onClose();
          }}
        >
          X
        </button>
      </div>
      {Ctor === null ? (
        <p className="ts-tt-note" role="status" data-control="dictate.unsupported">
          Dictation needs a browser with speech recognition, such as Chrome, Edge or Safari
        </p>
      ) : (
        <button
          type="button"
          className="ts-dictate-button"
          aria-pressed={on}
          aria-label={on ? DICTATE_STRINGS.stop : DICTATE_STRINGS.start}
          data-control="dictate.toggle"
          {...tipProps({
            name: on ? DICTATE_STRINGS.stop : DICTATE_STRINGS.start,
            doc: on ? 'Stops listening' : 'Starts listening; the words land in the notes',
          })}
          onClick={() => (on ? stop() : start())}
        >
          {on ? DICTATE_STRINGS.stop : DICTATE_STRINGS.start}
        </button>
      )}
      <p className="ts-dictate-interim" aria-live="polite" data-control="dictate.interim">
        {interim}
      </p>
      <p className="ts-tt-note" data-control="dictate.privacy">
        {sentence}
      </p>
      {privacy === 'downloadable' && Ctor?.install !== undefined ? (
        <button
          type="button"
          className="ts-tt-small"
          data-control="dictate.install"
          {...tipProps({
            name: DICTATE_STRINGS.download,
            doc: 'Keeps the audio on this device afterwards',
          })}
          onClick={install}
        >
          {DICTATE_STRINGS.download}
        </button>
      ) : null}
      {notice !== null ? (
        <p className="ts-tt-error" role="alert" data-control="dictate.notice">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
