// The mail templates (gslides-parity SPEC-3 5.5, 6.5, 7.3; research 09 4.1, 4.3, 4.4): plain
// text first, one HTML twin built from the same lines. Every name a template prints passed the
// display name rules before it got here and is escaped again for the HTML; a deck link is
// `/deck/<id>`, never a share token (SPEC-3 5.5); no template says whether an address has an
// account (09 4.1). Copy follows the product's rules: plain sentences, sentence case, no
// metaphors.
import type { GrantRole } from '@turboslide/schema/access';

export type MailContent = { subject: string; text: string; html: string };

export const MAIL_PRODUCT = 'Turboslide';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphs(lines: readonly string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
}

function link(url: string, label: string): string {
  return `<p><a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(label)}</a></p>`;
}

function document(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family: Inter, system-ui, sans-serif; color: #070707; background: #ffffff; padding: 24px;">\n${body}\n</body></html>`;
}

/** The sentence a role gives a person (09 4.1). */
export function roleSentence(role: GrantRole): string {
  switch (role) {
    case 'editor':
      return 'You can edit.';
    case 'commenter':
      return 'You can comment.';
    case 'viewer':
      return 'You can view.';
  }
}

/**
 * One mail with the magic link and the six digit code (SPEC-3 7.3 item 1); without a link when
 * only a code was asked for (the email OTP route called on its own).
 */
export function signInMail(input: { url?: string; code: string; minutes: number }): MailContent {
  const withLink = input.url !== undefined;
  const lines = [
    withLink
      ? `Sign in to ${MAIL_PRODUCT} with this link, or type the code into the tab that asked.`
      : `Type this code into the ${MAIL_PRODUCT} tab that asked for it.`,
    `Code: ${input.code}`,
    withLink
      ? `The link and the code work once and expire in ${input.minutes} minutes.`
      : `The code works once and expires in ${input.minutes} minutes.`,
    'If you did not ask to sign in, ignore this message.',
  ];
  return {
    subject: `Your ${MAIL_PRODUCT} sign in code is ${input.code}`,
    text: [lines[0], ...(withLink ? [input.url] : []), ...lines.slice(1)].join('\n\n'),
    html: document(
      `Sign in to ${MAIL_PRODUCT}`,
      [
        paragraphs([lines[0] ?? '']),
        ...(input.url !== undefined ? [link(input.url, 'Sign in')] : []),
        paragraphs(lines.slice(1)),
      ].join('\n'),
    ),
  };
}

/** The invitation (09 4.1): the inviter, the title, the role in a sentence, the message, Open. */
export function invitationMail(input: {
  inviterName: string;
  title: string;
  role: GrantRole;
  message?: string;
  url: string;
}): MailContent {
  const lines = [
    `${input.inviterName} shared "${input.title}" with you on ${MAIL_PRODUCT}.`,
    roleSentence(input.role),
    ...(input.message !== undefined && input.message.trim() !== ''
      ? [`Message: ${input.message.trim()}`]
      : []),
    'Sign in with this address to open it.',
  ];
  return {
    subject: `${input.inviterName} shared "${input.title}" with you`,
    text: [...lines, input.url].join('\n\n'),
    html: document(input.title, [paragraphs(lines), link(input.url, 'Open')].join('\n')),
  };
}

export type AccessRequestLine = { who: string; role: GrantRole; message?: string };

/** The batched request access mail (09 4.4; 10 F41): one per deck per hour, every request listed. */
export function requestAccessMail(input: {
  title: string;
  url: string;
  requests: readonly AccessRequestLine[];
}): MailContent {
  const count = input.requests.length;
  const lines = [
    count === 1
      ? `One person asked for access to "${input.title}".`
      : `${count} people asked for access to "${input.title}".`,
    ...input.requests.map((request) => {
      const role =
        request.role === 'editor' ? 'edit' : request.role === 'commenter' ? 'comment' : 'view';
      const message =
        request.message !== undefined && request.message.trim() !== ''
          ? ` Message: ${request.message.trim()}`
          : '';
      return `${request.who} asked to ${role}.${message}`;
    }),
    'Review the requests from Share.',
  ];
  return {
    subject:
      count === 1
        ? `${input.requests[0]?.who ?? 'Someone'} asked for access to "${input.title}"`
        : `${count} people asked for access to "${input.title}"`,
    text: [...lines, input.url].join('\n\n'),
    html: document(input.title, [paragraphs(lines), link(input.url, 'Open Share')].join('\n')),
  };
}

/** The ownership transfer mail (09 4.3). */
export function transferMail(input: { fromName: string; title: string; url: string }): MailContent {
  const lines = [
    `${input.fromName} asked you to become the owner of "${input.title}".`,
    'You can edit it now. Accept or decline from Share; until you decide, the current owner keeps the presentation.',
  ];
  return {
    subject: `${input.fromName} wants to make you the owner of "${input.title}"`,
    text: [...lines, input.url].join('\n\n'),
    html: document(input.title, [paragraphs(lines), link(input.url, 'Open')].join('\n')),
  };
}

/** The transfer outcome, to the previous owner (09 4.3). */
export function transferOutcomeMail(input: {
  toName: string;
  title: string;
  accepted: boolean;
  url: string;
}): MailContent {
  const line = input.accepted
    ? `${input.toName} is now the owner of "${input.title}". You can still edit it.`
    : `${input.toName} declined to become the owner of "${input.title}". You remain the owner.`;
  return {
    subject: input.accepted
      ? `"${input.title}" has a new owner`
      : `The transfer of "${input.title}" was declined`,
    text: [line, input.url].join('\n\n'),
    html: document(input.title, [paragraphs([line]), link(input.url, 'Open')].join('\n')),
  };
}

/** The request access answer to the requester (09 4.4). */
export function requestOutcomeMail(input: {
  title: string;
  granted: GrantRole | null;
  url: string;
}): MailContent {
  const line =
    input.granted === null
      ? `The owner declined your request for "${input.title}".`
      : `${roleSentence(input.granted).replace(/\.$/, '')} "${input.title}" now.`;
  return {
    subject:
      input.granted === null
        ? `Your request for "${input.title}" was declined`
        : `You have access to "${input.title}"`,
    text: input.granted === null ? line : [line, input.url].join('\n\n'),
    html: document(
      input.title,
      input.granted === null
        ? paragraphs([line])
        : [paragraphs([line]), link(input.url, 'Open')].join('\n'),
    ),
  };
}

/** The comment digest (SPEC-3 5.5): one sentence per event, Notification settings, unsubscribe. */
export function digestMail(input: {
  title: string;
  url: string;
  lines: readonly string[];
  settingsUrl: string;
  unsubscribeUrl: string;
}): MailContent {
  const count = input.lines.length;
  const head =
    count === 1
      ? `One new comment on "${input.title}".`
      : `${count} new comments on "${input.title}".`;
  const foot = [
    'Notification settings choose which comments reach you by mail.',
    'To stop these mails, open the unsubscribe link.',
  ];
  return {
    subject: head.replace(/\.$/, ''),
    text: [head, ...input.lines, input.url, ...foot, input.settingsUrl, input.unsubscribeUrl].join(
      '\n\n',
    ),
    html: document(
      input.title,
      [
        paragraphs([head]),
        `<ul>${input.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
        link(input.url, 'Open the presentation'),
        paragraphs(foot),
        link(input.settingsUrl, 'Notification settings'),
        link(input.unsubscribeUrl, 'Unsubscribe'),
      ].join('\n'),
    ),
  };
}

/** The headers a digest carries (SPEC-3 5.5): one click unsubscribe per RFC 8058. */
export function digestHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
