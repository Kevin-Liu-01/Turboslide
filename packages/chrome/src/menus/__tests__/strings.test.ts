import { describe, expect, it } from 'vitest';

import { allItems, itemById } from '../model.ts';
import {
  ACCESS_PAGE,
  ACCOUNT,
  AGENT_SENTENCES,
  CANVAS,
  COMMENTS,
  DIALOGS,
  DITHER,
  INBOX,
  PANELS,
  PRESENCE,
  PROMPTS,
  REFUSALS,
  TITLE_ROW,
  forbiddenWordsIn,
} from '../strings.ts';

// The strings of round three (SPEC-3 6.8, 15; 16.6 "strings.test.ts"): every refusal of 6.8 is
// present verbatim, every new default view string of 15 is present, Google's labels are Google's
// words, the Turboslide additions of 15 exist as rows or words, and the five save phrases stack in
// one cell. The wording is data here so the e2e fixtures and the surfaces read one source.

/** The plain strings of a strings block, its functions and nested blocks left out. */
function stringsOf(block: Readonly<Record<string, unknown>>): string[] {
  return Object.values(block).filter((value): value is string => typeof value === 'string');
}

describe('the refusals of SPEC-3 6.8', () => {
  it('are present verbatim, one key each', () => {
    expect(REFUSALS.nameTaken).toBe('That name is already in use in this presentation');
    expect(REFUSALS.nameReserved).toBe('That name is reserved');
    expect(REFUSALS.viewOnly).toBe('You can view this presentation');
    expect(REFUSALS.requestEditAccess).toBe('Request edit access');
    expect(REFUSALS.notAvailable).toBe(
      'This presentation is not available to you, or does not exist.',
    );
    expect(REFUSALS.requested).toBe('If this presentation exists, its owner has been asked.');
    expect(REFUSALS.tooManyChanges).toBe('Too many changes at once. Try again in a minute');
    expect(REFUSALS.exportLimit).toBe("You have reached today's export limit");
    expect(REFUSALS.presenceNeedsRedis).toBe(
      'Presence and live cursors need a Redis store on this deployment',
    );
    expect(REFUSALS.leaveAnyway).toBe('Changes are still saving. Leave anyway?');
    expect(REFUSALS.unsavedChanges(3)).toBe('3 unsaved changes from this browser');
    expect(REFUSALS.unsavedChanges(1)).toBe('1 unsaved change from this browser');
    expect(REFUSALS.apply).toBe('Apply');
    expect(REFUSALS.discard).toBe('Discard');
    expect(REFUSALS.alreadyChanged('Maya')).toBe('That change was already changed by Maya');
    expect(REFUSALS.inviteFromShare).toBe('Invite them from Share');
    expect(REFUSALS.tooManyEditors).toBe('This presentation has too many editors right now');
    expect(REFUSALS.noLongerPublished).toBe('This presentation is no longer published');
    expect(REFUSALS.notSignedInOwner).toBe(
      'Not signed in. Sign in, or copy an edit link, to get back to this presentation from another browser',
    );
    expect(REFUSALS.signInToUpload).toBe('Sign in to upload a picture');
    /* the third name sentence of identity's NAME_REFUSALS (build-3/b3.md request 5) */
    expect(REFUSALS.nameInvalid).toBe('Use 1 to 40 letters or digits in one script');
    /* the sixteen sentences of 6.8 (two of them with a variable), plus the persisted queue's Apply and Discard, the View only button's second sentence and the name shape rule */
    expect(Object.keys(REFUSALS)).toHaveLength(20);
  });

  it('name no role the person lacks, no internal noun and no other account or presentation', () => {
    const sentences = Object.values(REFUSALS).map((value) =>
      typeof value === 'function' ? value('Maya' as never) : value,
    );
    for (const sentence of sentences) {
      expect(forbiddenWordsIn(String(sentence)), String(sentence)).toEqual([]);
      /* a refusal never names the role the person does not hold */
      expect(/\b(as an? |your role|owner only|editors only)\b/i.test(String(sentence))).toBe(false);
      expect(String(sentence).includes('—')).toBe(false);
    }
  });
});

describe('the default view strings of SPEC-3 15', () => {
  it('are present with the spec’s wording', () => {
    expect(ACCOUNT.namePrompt.title).toBe('How should others see you?');
    expect(COMMENTS.placeholder).toBe('Comment or add others with @');
    expect(COMMENTS.replyPlaceholder).toBe('Reply or add others with @');
    expect(PRESENCE.followingPlate('Maya')).toBe('Following Maya · Stop');
    expect(PRESENCE.goToSlide(12)).toBe('Go to slide 12');
    expect(PRESENCE.chipTip('Maya', 'guest', 12)).toBe('Maya · guest · slide 12');
    expect(PRESENCE.chipTip('Titanium 471', null, 3)).toBe('Titanium 471 · slide 3');
    expect(TITLE_ROW.lastEditBy('2 minutes ago', 'Maya Chen')).toBe(
      'Last edit 2 minutes ago by Maya Chen',
    );
    expect(DIALOGS.share.noPendingRequests).toBe('No pending requests');
    expect(DIALOGS.share.footer).toBe(
      'Speaker notes and skipped slides never travel with a view or comment link',
    );
    expect(DIALOGS.share.legacy).toBe('Anyone with the address can view (legacy)');
    expect(DIALOGS.share.switchToLink).toBe('Switch to a link');
    expect(DIALOGS.share.claim).toBe(
      'This presentation has no owner yet. Claim it to decide who can open and edit it.',
    );
    expect(DIALOGS.publish.published).toBe(
      'Anyone with the published link can view the current version; every edit is published',
    );
    expect(ACCOUNT.signInDialog.passkeysLater).toBe('Passkeys arrive once the address is final');
    expect(TITLE_ROW.offline).toBe('Offline. Changes will save when you reconnect');
    expect(TITLE_ROW.retrying).toBe("Couldn't save, retrying");
    expect(DITHER.uploading('6.2')).toBe('Uploading 6.2 MB');
    expect(DITHER.help).toBe(
      'The deck’s two tone screen over the picture; change it under Format options',
    );
    expect(DITHER.lit('8.9')).toBe('Lit 8.9 percent');
    expect(DITHER.notMeasured).toBe('Not measured');
    expect(AGENT_SENTENCES.materializeFirst).toBe('materialize first');
    expect(AGENT_SENTENCES.noContinuousSource).toBe(
      'the asset has no continuous source (sourceFile); the committed twins are already dithered',
    );
    expect(ACCESS_PAGE.invited).toBe(
      'Invited by email? Sign in with the address the invitation went to.',
    );
  });

  it('stack the five save phrases in one cell and count the inbox to two digits', () => {
    const phrases = [
      TITLE_ROW.saving,
      TITLE_ROW.saved,
      TITLE_ROW.retrying,
      TITLE_ROW.offline,
      TITLE_ROW.notSaved,
    ];
    expect(new Set(phrases).size).toBe(5);
    expect(TITLE_ROW.unread(7)).toBe('7');
    expect(TITLE_ROW.unread(99)).toBe('99');
    expect(TITLE_ROW.unread(100)).toBe('99+');
    expect(COMMENTS.count(1)).toBe('1 comment');
    expect(COMMENTS.count(12)).toBe('12 comments');
  });

  it('carry Google’s labels in Google’s words, on the rows or in the strings', () => {
    const labels = new Set(allItems().map((item) => item.label));
    const words = new Set<string>([
      ...stringsOf(COMMENTS),
      ...stringsOf(PRESENCE),
      ...stringsOf(DIALOGS.share),
      ...stringsOf(DIALOGS.share.roles),
      ...stringsOf(DIALOGS.share.settings),
      ...stringsOf(DIALOGS.publish),
      ...stringsOf(INBOX.levels),
      ...stringsOf(PANELS.versionHistory),
      DIALOGS.background.title,
      TITLE_ROW.viewOnly,
      REFUSALS.requestEditAccess,
    ]);
    for (const label of [
      'Show all comments',
      'Comment',
      'Reply',
      'Resolve',
      'Re-open',
      'Reassign',
      'Done',
      'Edit',
      'Delete',
      'Get link to this comment',
      'Add emoji reaction',
      'Expand comments',
      'Minimize comments',
      'Hide comments',
      'For you',
      'Search all comments',
      'Editing',
      'Commenting',
      'Viewing',
      'Show my pointer',
      'Show collaborator pointers',
      'Add people by email',
      'Notify people',
      'Viewer',
      'Commenter',
      'Editor',
      'Owner',
      'Transfer ownership',
      'Add expiration',
      'Remove access',
      'General access',
      'Restricted',
      'Anyone with the link',
      'Copy link',
      'Done',
      'Editors can change permissions and share',
      'Viewers and commenters can download, print and copy',
      'Publish to web',
      'Stop publishing',
      'Notification settings',
      'All comments',
      'Comments for you',
      'None',
      'Activity dashboard',
      'Accessibility settings',
      'Turn on collaborator announcements',
      'Join chat',
      'View only',
      'Request edit access',
      'Change background',
      'Version history',
      'Show changes',
      'Name current version',
      'Restore this version',
      'Make a copy',
    ])
      expect(labels.has(label) || words.has(label), label).toBe(true);
    expect(COMMENTS.assignTo('Maya')).toBe('Assign to Maya');
    expect(PRESENCE.following('Maya')).toBe('Following Maya');
    expect(TITLE_ROW.lastEdit('now')).toBe('Last edit now');
  });

  it('hold every Turboslide addition of SPEC-3 15 as a row marked ours or as a word', () => {
    const ours = new Set(
      allItems()
        .filter((item) => item.turboslide === true)
        .map((item) => item.label),
    );
    for (const label of [
      'Notifications',
      'Go to slide',
      'Copy link',
      'Sign in',
      'Sign out',
      'Change name',
      'Change avatar',
      'Forget this browser',
      'Sessions',
      'Dither',
    ])
      expect(ours.has(label), label).toBe(true);
    const words = new Set<string>([
      ...stringsOf(DIALOGS.share.settings),
      ...stringsOf(DITHER),
      ...stringsOf(COMMENTS),
      ...stringsOf(INBOX),
      PANELS.editHtml.title,
      PRESENCE.collaborators,
    ]);
    for (const word of [
      'Viewers can see comments',
      'Show names to people with the link',
      'Allow embedded HTML blocks in this shared presentation',
      'Preset',
      'Neutral',
      'Photograph',
      'Pattern',
      'Tone',
      'Cell',
      'Strength',
      'Ink point',
      'Paper point',
      'Midtones',
      'Light theme',
      'Thicken',
      'Material',
      'Place',
      'Format options',
      'Edit HTML',
      'Slide order',
      'Mark all read',
    ])
      expect(words.has(word), word).toBe(true);
    /* the trust word beside a typed name, and the role words the roster prints */
    expect(PRESENCE.guest).toBe('guest');
    expect(PRESENCE.byLink).toBe('by link');
    expect(PRESENCE.anEditor).toBe('An editor');
    /* the account rows are the one place accounts appear (0.21): six rows and the sentence */
    expect(itemById('title.account').items).toHaveLength(6);
    expect(ACCOUNT.notSignedIn).toBe('Not signed in');
    expect(ACCOUNT.signedInAs('kevin@example.com')).toBe('Signed in as kevin@example.com');
  });
});

describe('the click model of the focus round (AMENDMENTS.md A1)', () => {
  it('gives the selected text object a chip sentence naming the two ways into the text, and keeps the placeholder prompts', () => {
    expect(CANVAS.editText).toBe('Double click to edit the text, or start typing');
    expect(forbiddenWordsIn(CANVAS.editText)).toEqual([]);
    /* A1 item 5: the prompt text stays Google's; the matrix row records the two step entry */
    expect(PROMPTS.title).toBe('Click to add title');
    expect(PROMPTS.subtitle).toBe('Click to add subtitle');
    expect(PROMPTS.text).toBe('Click to add text');
  });
});
