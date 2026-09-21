/**
 * The words of present mode and Presenter view (gslides-parity SPEC 12 "Present mode"; 9.2 and
 * 9.3 for the controls the SPEC's list does not spell out). Google's labels in sentence case;
 * the stub sentence is the shared formula "Not available in Turboslide yet" followed by one
 * clause. The chrome's `menus/strings.ts` holds the same present words for the menu model; the
 * viewer cannot import the chrome (SPEC 3.3), so the sentences the components draw live here and
 * the two lists are kept identical by hand.
 */

export const STUB_PREFIX = 'Not available in Turboslide yet';

export const PRESENT_TEXT = {
  /** the toolbar */
  toolbar: 'Slideshow controls',
  /* sentence case, the whole phrase (docs/PRODUCT.md 3.6; audit-interface 26) */
  previous: 'Previous slide',
  next: 'Next slide',
  counter: (index: number, total: number) => `${index} of ${total}`,
  slideList: 'Slides',
  laserOn: 'Turn on the laser pointer',
  laserOff: 'Turn off the laser pointer',
  captions: 'Captions',
  captionsStub: `${STUB_PREFIX}. Captions are a browser speech service in English only`,
  enterFullScreen: 'Enter full screen',
  exitFullScreen: 'Exit full screen',
  exit: 'Exit',
  options: 'Options',
  /** the options menu */
  openNotes: 'Open speaker notes',
  autoPlay: 'Auto-play',
  autoPlayStub: 'Auto-play comes in a later round',
  pen: 'Turn on the pen',
  penStub: 'The pen comes in a later round',
  more: 'More',
  downloadPdf: 'Download as PDF',
  downloadPptx: 'Download as PPTX',
  downloadStub: 'Downloads open from the Download dialog after the show',
  print: 'Print',
  keyboardShortcuts: 'Keyboard shortcuts',
  /** the shortcuts card */
  presenting: 'Presenting',
  close: 'Close',
  /** the digit jump and the blank slides */
  slideNumber: (digits: string) => `Slide ${digits}, press Enter`,
  noSlide: (n: number) => `No slide ${n}`,
  blankSlide: (blank: 'black' | 'white') => `Blank ${blank} slide. Press any key to return`,
  /** the presenter console */
  presenterView: 'Presenter view',
  timer: 'Timer',
  pause: 'Pause',
  resume: 'Resume',
  reset: 'Reset',
  clock: 'Time',
  connected: 'Slideshow connected',
  disconnected: 'No slideshow window is open',
  currentSlide: 'Current slide',
  previousSlide: 'Previous slide',
  nextSlide: 'Next slide',
  endOfShow: 'End of the slideshow',
  startOfShow: 'Start of the slideshow',
  notes: 'Speaker notes',
  noNotes: 'No speaker notes for this slide',
  notesSmaller: 'Smaller notes text',
  notesLarger: 'Larger notes text',
  audienceTools: 'Audience tools',
  audienceToolsStub: `${STUB_PREFIX}. Audience tools need a question service`,
} as const;
