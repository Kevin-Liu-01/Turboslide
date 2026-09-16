// The words of the two media dialogs and the Format options media sections (gslides-parity
// SPEC-5 3.1, 3.2; R02 a.1, a.2; MILESTONES-5 B2): Google's labels where Google has the control
// (the tab names of Insert video in Google's order, Start playing, On click, Automatically, Volume
// when presenting, Loop audio, Stop on slide change, Hide icon when presenting, Play (on click),
// Play (automatically), Play (manual), Mute audio; Start at and End at are unverified labels the
// research recorded from third parties), Turboslide's own where Google's dialog has none (the
// Upload and By URL tabs of Insert audio, the accepted list sentences). Sentence case, no trailing
// periods on headings, buttons Title Case. Kept beside the dialogs so the shell's strings table
// gains one import when the integrator wires the dialogs (strings.ts is the integrator's).
export const MEDIA_DIALOGS = {
  audio: {
    title: 'Insert audio',
    upload: 'Upload',
    byUrl: 'By URL',
    dropHere: 'Drop an audio file here, or choose one',
    choose: 'Choose File',
    address: 'Audio address',
    addressHint: 'An https address of an mp3, m4a or wav file on a site Turboslide may read',
    select: 'Select',
  },
  video: {
    title: 'Insert video',
    search: 'Search YouTube',
    byUrl: 'By URL',
    upload: 'Upload',
    dropHere: 'Drop a video file here, or choose one',
    choose: 'Choose File',
    address: 'Video address',
    addressHint:
      'A YouTube link, or an https address of an mp4 or webm file on a site Turboslide may read',
    select: 'Select',
    /** the Search tab's clause (SPEC-5 14.3; strings.ts ROUND_FIVE.youtubeSearchKey) */
    searchNeedsKey: 'Search needs a YouTube Data API key',
    preview: 'The video as YouTube shows it; Turboslide stores its own frame as the poster',
  },
  /** the Format options sections (SPEC-5 3.1; R02 a.1, a.2) */
  format: {
    audioSection: 'Audio playback',
    videoSection: 'Video playback',
    startPlaying: 'Start playing',
    onClick: 'On click',
    automatically: 'Automatically',
    volume: 'Volume when presenting',
    loop: 'Loop audio',
    stopOnSlideChange: 'Stop on slide change',
    hideIcon: 'Hide icon when presenting',
    play: 'Play',
    playOnClick: 'Play (on click)',
    playAutomatically: 'Play (automatically)',
    playManual: 'Play (manual)',
    startAt: 'Start at',
    endAt: 'End at',
    muteAudio: 'Mute audio',
    poster: 'Poster',
    capturePoster: 'Capture Frame',
    posterNote:
      'The still every export shows; captured at Start at when the video is decodable here',
    youtubeNote:
      'A YouTube video plays through its own player; Loop and the poster capture are not offered',
    manualNote: 'Play (manual) plays when the object itself is clicked in the show',
    timeDoc: 'Minutes and seconds, as 1:05',
  },
  /** Insert > Image > Camera (SPEC-5 3.7): the line under the preview */
  cameraHint:
    'The photo is stored with this presentation as a picture; nothing is sent anywhere else.',
  /** Present on another screen and Presentation display options (SPEC-5 3.7; R11 7) */
  display: {
    title: 'Presentation display options',
    show: 'Show',
    presenter: 'Presenter view',
    remember: 'Remember these screens in this browser',
    oneScreen: 'One screen is connected',
    unsupported: 'Presenter view opens a second window you can drag to another screen',
    apply: 'Present',
    screen: 'Screen',
  },
} as const;
