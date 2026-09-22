/**
 * The words of the Assist panel and the Tailor dialog (docs/PRODUCT.md 6.1, 6.3, 6.4, section 5):
 * sentence case, plain technical English, no rule ids, no em dashes. The card's sentence is the
 * model's; every other word a seller reads here is the product's. They sit in this lane's folder
 * (build/b6.md R7); the integrator may move them under `menus/strings.ts` at the merge.
 */
export const ASSIST = {
  title: 'Assist',
  /** the first line under the title, in `ts-tt-note` (6.1, 6.3 "Privacy words") */
  firstLine:
    'Your slide text is sent to the assistant’s model provider under General Translation’s account to write these suggestions. Nothing is written to your slides until you accept.',
  firstLineRestricted: ', including this restricted presentation',
  starters: {
    tailor: 'Tailor for a customer',
    tailorDoc:
      'Replace the customer name, swap the logo and skip slides, as one change you can undo',
    shorter: 'Make it shorter',
    shorterDoc:
      'Asks for a shorter reading of this slide’s text; you read the change before it lands',
    notes: 'Write speaker notes',
    notesDoc: 'Asks for a talk track for this slide, under 120 words',
  },
  prompt: 'Ask for a shorter slide or for speaker notes',
  promptDoc: 'Enter sends; Shift Enter starts a new line',
  send: 'Send',
  sendDoc: 'Sends the ask; the answer arrives as a card you accept or dismiss',
  thinking: 'Asking the assistant',
  accept: 'Accept',
  acceptDoc: 'Writes the change as one step; Undo brings the slide back',
  dismiss: 'Dismiss',
  dismissDoc: 'Closes the card and writes nothing',
  change: 'Change the ask',
  changeDoc: 'Puts the ask back in the box so you can say it differently',
  before: 'Before',
  after: 'After',
  accepted: (sentence: string) => sentence,
  undo: 'Undo',
  viewer: 'Commenters and editors can use the assistant',
  off: 'The assistant is off on this Turboslide',
  noSlide: 'Select a slide to ask about it',
  slideLabel: (n: number, title: string) => `Slide ${n}: ${title}`,
  failed: (reason: string) => `The assistant could not answer: ${reason}`,
} as const;

export const TAILOR = {
  title: 'Tailor for a customer',
  lead: 'Rename the customer, swap the pictures named after the old one and skip the slides they should not see, as one change',
  from: 'Replace',
  fromDoc: 'The customer name as the deck spells it',
  to: 'With',
  toDoc: 'The name that takes its place, everywhere in the text and the notes',
  count: (places: number, slides: number) =>
    places === 0
      ? 'Not found in the text'
      : `${places} place${places === 1 ? '' : 's'} on ${slides} slide${slides === 1 ? '' : 's'}`,
  logoHead: 'Logo',
  logoEverySlide: 'Use this logo on every slide',
  logoEverySlideDoc:
    'Arrives with the brand kit; until then the logo lives on the slides that show it',
  logoReplaceAlt: 'Replace the pictures named after the old customer',
  logoReplaceAltDoc:
    'Swaps every picture whose description names the customer for the file you choose',
  logoFile: 'Choose a picture',
  logoFileDoc: 'A PNG, JPEG, WebP or GIF under 20 MB',
  logoChosen: (name: string) => `Picture: ${name}`,
  skipHead: 'Slides to skip',
  skipDoc:
    'A skipped slide stays in the deck and leaves the show, the shared view and the downloads',
  skipRow: (n: number, title: string) => `${n}. ${title}`,
  apply: 'Apply',
  applyDoc: 'Makes every change as one step; Undo brings the deck back',
  cancel: 'Cancel',
  nothing: 'Type a customer name, choose a logo or tick a slide first',
  done: (to: string) => `Tailored for ${to}`,
  doneNoName: 'Tailored',
  label: (to: string) => (to === '' ? 'Tailor for a customer' : `Tailor for ${to}`),
  uploading: 'Adding the picture',
} as const;
