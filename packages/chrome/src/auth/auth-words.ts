import type { AddressProblem, AuthReason, CodeProblem, DeviceProblem } from './auth-model';

/**
 * Every sentence of the auth plate (docs/POLISH-2.md 4.5): sentence case headings and labels,
 * Title Case buttons, a period after every sentence, plain technical English. "Continue with
 * Google" is the provider's own label and stays. One module, so the page, the window, /device,
 * the gallery and the tests read the same words.
 */
export const AUTH_WORDS = {
  /** the page's heading and the window's title on the methods step */
  heading: 'Sign in to Turboslide',
  windowTitle: 'Sign in',
  lede: 'The presentations you made in this browser move to your account.',
  /** drawn where Google is a method (docs/NEXT.md 4.3.2 item 7) */
  foot: 'Turboslide uses the name and the address of your Google account. It reads nothing else from Google after you sign in.',
  google: 'Continue with Google',
  github: 'Continue with GitHub',
  email: 'Email',
  emailPlaceholder: 'name@example.com',
  continue: 'Continue',
  or: 'or',
  none: 'Sign in is not available on this deployment.',
  leaving: 'Opening Google.',

  sent: {
    heading: 'Check your email',
    lede: (address: string) =>
      `A message with a link and a six digit code is on its way to ${address}. Both work once and expire in 5 minutes.`,
    code: 'Six digit code',
    verify: 'Verify',
    another: 'Use Another Address',
    resend: 'Send Another',
    resendIn: (clock: string) => `Send another in ${clock}`,
  },

  code: {
    'code-wrong': 'That code does not match. Check the newest message and try again.',
    'code-expired': 'That code expired. Send another to get a new one.',
    'code-spent': 'That code had three wrong tries. Send another to get a new one.',
  } satisfies Record<CodeProblem, string>,

  address: {
    'address-invalid': 'That is not an email address. Check it and try again.',
    'address-quota':
      'That address had three messages in the last 10 minutes. Wait, then send another.',
    'request-failed': 'The message could not be sent. Try again.',
  } satisfies Record<AddressProblem, string>,

  error: {
    heading: 'Sign in did not complete',
    tryAgain: 'Try Again',
    reasons: {
      cancelled: 'The sign in was cancelled at Google.',
      expired: 'The sign in started in another tab or took too long. Start again from this page.',
      link: 'That link was used or has expired. Ask for a new one.',
      account: 'That Google account cannot be joined to the account signed in here.',
      other: 'The sign in did not complete.',
    } satisfies Record<AuthReason, string>,
    /** the code under the sentence of `other` */
    code: (code: string) => `Code: ${code}`,
  },

  device: {
    heading: 'Connect the command line',
    first: 'Sign in first. This page then asks for the code your terminal shows.',
    lede: 'Type the code your terminal shows.',
    code: 'Code',
    first4: 'First four characters',
    last4: 'Last four characters',
    approve: 'Approve',
    deny: 'Deny',
    foot: 'Approve only a code you started from your own terminal.',
    problems: {
      'code-wrong': 'That code does not match. Check the terminal and try again.',
      spent: 'That code had five wrong tries. Run turboslide login again for a new one.',
      expired: 'That code expired. Run turboslide login again for a new one.',
    } satisfies Record<DeviceProblem, string>,
    approvedHeading: 'The terminal is signed in',
    approved: (address: string) => `It acts as ${address}. You can close this tab.`,
    deniedHeading: 'The terminal was not signed in',
    denied: 'You can close this tab.',
  },

  /** the Sign In link of /home, /decks and You need access */
  link: {
    label: 'Sign In',
    doc: 'Sign in to keep your presentations across browsers and devices.',
  },

  /** the theme button's place on the page's foot row */
  theme: 'Theme',
} as const;
