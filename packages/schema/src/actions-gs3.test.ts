// The 64 actions of round three (gslides-parity SPEC-3 12, 0.40; MILESTONES-3 B1 day 1): the ids,
// the groups, the transports the rows name, the MCP names, the CLI usages and the baseRevision
// rule, so every builder types against the same table and the coverage test finds each id named.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACTIONS,
  ACTION_GROUPS,
  ACTION_IDS,
  GS3_ACTION_IDS,
  MILESTONES,
  NO_REVISION_WRITES,
  actionsInOrder,
} from './actions.ts';
import type { ActionGroup, ActionId } from './actions.ts';

const IDS: ActionId[] = [
  'presence.list',
  'presence.follow',
  'presence.unfollow',
  'presence.pointer',
  'sync.status',
  'deck.watch',
  'deck.follow',
  'comment.add',
  'comment.reply',
  'comment.edit',
  'comment.delete',
  'comment.resolve',
  'comment.reopen',
  'comment.assign',
  'comment.done',
  'comment.react',
  'comment.list',
  'comment.get',
  'comment.link',
  'notification.list',
  'notification.markRead',
  'notification.settings',
  'activity.list',
  'version.diff',
  'share.get',
  'share.setGeneralAccess',
  'share.createLink',
  'share.revokeLink',
  'share.rotateLink',
  'share.stop',
  'share.invite',
  'share.setRole',
  'share.remove',
  'share.setExpiry',
  'share.settings',
  'share.requestAccess',
  'share.listRequests',
  'share.respond',
  'share.transferOwnership',
  'share.acceptOwnership',
  'share.declineOwnership',
  'share.claim',
  'share.emailCollaborators',
  'deck.publish',
  'deck.unpublish',
  'account.decks',
  'account.tokens.create',
  'account.tokens.list',
  'account.tokens.revoke',
  'account.me',
  'account.setName',
  'account.setAvatar',
  'account.sessions',
  'account.signOut',
  'account.forget',
  'admin.bootstrap',
  'admin.assignOwner',
  'admin.flag',
  'admin.migrateStorage',
  'admin.mail.list',
  'picture.dither',
  'picture.materialize',
  'slide.setBackgroundPicture',
  'slide.setBackgroundMaterial',
];

/** The MCP names SPEC-3 12 fixes; `none` is a row without the transport. */
const MCP: Record<ActionId, string | 'none'> = Object.fromEntries(
  Object.entries({
    'presence.list': 'deck_list_presence',
    'presence.follow': 'deck_follow_client',
    'presence.unfollow': 'deck_unfollow',
    'presence.pointer': 'deck_set_pointer',
    'sync.status': 'deck_sync_status',
    'deck.watch': 'deck_watch',
    'deck.follow': 'none',
    'comment.add': 'deck_add_comment',
    'comment.reply': 'deck_reply_comment',
    'comment.edit': 'deck_edit_comment',
    'comment.delete': 'deck_delete_comment',
    'comment.resolve': 'deck_resolve_comment',
    'comment.reopen': 'deck_reopen_comment',
    'comment.assign': 'deck_assign_comment',
    'comment.done': 'deck_done_comment',
    'comment.react': 'deck_react_comment',
    'comment.list': 'deck_list_comments',
    'comment.get': 'deck_get_comment',
    'comment.link': 'deck_comment_link',
    'notification.list': 'deck_list_notifications',
    'notification.markRead': 'deck_mark_notifications_read',
    'notification.settings': 'deck_notification_settings',
    'activity.list': 'deck_list_activity',
    'version.diff': 'deck_version_diff',
    'share.get': 'deck_get_share',
    'share.setGeneralAccess': 'deck_set_general_access',
    'share.createLink': 'deck_create_share_link',
    'share.revokeLink': 'deck_revoke_share_link',
    'share.rotateLink': 'deck_rotate_share_link',
    'share.stop': 'deck_stop_sharing',
    'share.invite': 'deck_invite',
    'share.setRole': 'deck_set_role',
    'share.remove': 'deck_remove_access',
    'share.setExpiry': 'deck_set_access_expiry',
    'share.settings': 'deck_share_settings',
    'share.requestAccess': 'deck_request_access',
    'share.listRequests': 'deck_list_access_requests',
    'share.respond': 'deck_respond_access_request',
    'share.transferOwnership': 'deck_transfer_ownership',
    'share.acceptOwnership': 'deck_accept_ownership',
    'share.declineOwnership': 'deck_decline_ownership',
    'share.claim': 'deck_claim',
    'share.emailCollaborators': 'deck_email_collaborators',
    'deck.publish': 'deck_publish',
    'deck.unpublish': 'deck_unpublish',
    'account.decks': 'deck_list_my_decks',
    'account.tokens.create': 'none',
    'account.tokens.list': 'deck_list_tokens',
    'account.tokens.revoke': 'deck_revoke_token',
    'account.me': 'deck_get_me',
    'account.setName': 'deck_set_my_name',
    'account.setAvatar': 'deck_set_my_avatar',
    'account.sessions': 'deck_list_sessions',
    'account.signOut': 'deck_sign_out',
    'account.forget': 'none',
    'admin.bootstrap': 'none',
    'admin.assignOwner': 'deck_assign_owner',
    'admin.flag': 'deck_admin_flag',
    'admin.migrateStorage': 'none',
    'admin.mail.list': 'none',
    'picture.dither': 'deck_dither_picture',
    'picture.materialize': 'deck_materialize_pictures',
    'slide.setBackgroundPicture': 'deck_set_slide_background_picture',
    'slide.setBackgroundMaterial': 'deck_set_slide_background_material',
  }),
) as Record<ActionId, string | 'none'>;

/** The group sizes of SPEC-3 0.40: presence and sync 7, comments 17 with version.diff, share 21, account 10, admin 5, dither and backgrounds 4. */
const GROUP_COUNTS: Partial<Record<ActionGroup, number>> = {
  presence: 4,
  sync: 3,
  comment: 16,
  version: 1,
  share: 21,
  account: 10,
  admin: 5,
  block: 2,
  slide: 2,
};

describe('the round three action table (SPEC-3 12)', () => {
  it('grows the table from 105 to 169, then to 183 in the product round (four brand, seven template and three assist rows), three logo rows in the features round and six shader rows in its ship two, counted once from ACTION_IDS', () => {
    expect(ACTION_IDS).toHaveLength(192);
    expect(new Set(ACTION_IDS).size).toBe(192);
    expect([...GS3_ACTION_IDS]).toEqual(IDS);
    expect(GS3_ACTION_IDS).toHaveLength(64);
    expect(MILESTONES).toContain('GS3');
    for (const group of ['presence', 'sync', 'comment', 'share', 'account', 'admin'] as const)
      expect(ACTION_GROUPS).toContain(group);
  });

  it('tags every new row GS3 and puts each in its group', () => {
    const counts: Partial<Record<ActionGroup, number>> = {};
    for (const id of IDS) {
      const spec = ACTIONS[id];
      expect(spec.id).toBe(id);
      expect(spec.milestone, id).toBe('GS3');
      counts[spec.group] = (counts[spec.group] ?? 0) + 1;
    }
    expect(counts).toEqual(GROUP_COUNTS);
    expect(actionsInOrder().filter((spec) => spec.milestone === 'GS3')).toHaveLength(64);
  });

  it('names the MCP tools SPEC-3 12 fixes and leaves the none rows off the transport', () => {
    for (const id of IDS) {
      const spec = ACTIONS[id];
      const expected = MCP[id];
      if (expected === 'none') {
        expect(spec.transports, id).not.toContain('mcp');
        expect(spec.mcp, id).toBeUndefined();
      } else {
        expect(spec.transports, id).toContain('mcp');
        expect(spec.mcp, id).toBe(expected);
      }
    }
    const names = IDS.map((id) => ACTIONS[id].mcp).filter((name) => name !== undefined);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every row a CLI usage except the two the table marks none, and the usages parse', () => {
    for (const id of IDS) {
      const spec = ACTIONS[id];
      if (id === 'share.requestAccess' || id === 'account.forget') {
        expect(spec.transports, id).not.toContain('cli');
        expect(spec.cli, id).toBeUndefined();
        continue;
      }
      expect(spec.transports, id).toContain('cli');
      expect(spec.cli?.usage, id).toMatch(/^turboslide [a-z]/);
      // the usage grammar the generator reads: placeholders are <camelCase> names
      for (const token of spec.cli?.usage.split(/\s+/).slice(1) ?? []) {
        if (token.startsWith('<'))
          expect(token, `${id}: ${token}`).toMatch(/^<[A-Za-z]+>(#<[A-Za-z]+>)?$/);
      }
    }
  });

  it('fixes the transports the rows narrow', () => {
    expect(ACTIONS['deck.follow'].transports).toEqual(['cli']);
    // the row reads "window and http only" beside its MCP name: the CLI is the transport it
    // lacks (a CLI user holds a key and a role), and an agent without access asks over MCP
    expect(ACTIONS['share.requestAccess'].transports).toEqual(['mcp', 'http', 'window']);
    expect(ACTIONS['account.tokens.create'].transports).toEqual(['window', 'cli', 'http']);
    expect(ACTIONS['account.forget'].transports).toEqual(['window']);
    expect(ACTIONS['admin.bootstrap'].transports).toEqual(['cli', 'http']);
    expect(ACTIONS['admin.migrateStorage'].transports).toEqual(['cli', 'http']);
    expect(ACTIONS['admin.mail.list'].transports).toEqual(['cli', 'http']);
    for (const id of IDS) {
      const spec = ACTIONS[id];
      if (
        ![
          'deck.follow',
          'share.requestAccess',
          'account.tokens.create',
          'account.forget',
          'admin.bootstrap',
          'admin.migrateStorage',
          'admin.mail.list',
        ].includes(id)
      ) {
        expect(spec.transports, id).toEqual(['cli', 'mcp', 'http', 'window']);
      }
    }
  });

  it('takes baseRevision on every mutating row that writes a revisioned record, and each example parses', () => {
    for (const id of IDS) {
      const spec = ACTIONS[id];
      const parsed = spec.input.safeParse(spec.example);
      expect(parsed.success, `${id}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
      expect(spec.doc.endsWith('.'), id).toBe(true);
      expect(spec.doc, `${id} agent words in a label`).not.toMatch(/\bagentic\b/i);
      const json = z.toJSONSchema(spec.input, { target: 'draft-2020-12' }) as {
        properties?: Record<string, unknown>;
      };
      if (spec.mutates && !NO_REVISION_WRITES.has(id)) {
        expect(json.properties?.baseRevision, `${id} takes baseRevision`).toBeDefined();
      }
    }
    // the comment writes take the comments revision and never refuse a stale one, so it is optional
    expect(
      ACTIONS['comment.reply'].input.safeParse({
        threadId: '01j8z2kmayaq4e0s7r9x2v8b3c',
        body: { text: 'ok', mentions: [] },
      }).success,
    ).toBe(true);
    // the share writes take the record's revision and it is required
    expect(ACTIONS['share.stop'].input.safeParse({ id: 'q4-review' }).success).toBe(false);
  });

  it('refuses a body author on every row: the author is the session or the token', () => {
    for (const id of IDS) {
      const spec = ACTIONS[id];
      const withAuthor =
        typeof spec.example === 'object' && spec.example !== null
          ? { ...(spec.example as Record<string, unknown>), author: { kind: 'human', name: 'x' } }
          : spec.example;
      expect(spec.input.safeParse(withAuthor).success, id).toBe(false);
    }
  });

  it('answers the request access sentence and nothing else (SPEC-3 6.8)', () => {
    const output = ACTIONS['share.requestAccess'].output;
    expect(
      output.safeParse({
        ok: true,
        message: 'If this presentation exists, its owner has been asked.',
      }).success,
    ).toBe(true);
    expect(output.safeParse({ ok: true, message: 'No such deck' }).success).toBe(false);
  });

  it('extends the existing rows with the optional fields of SPEC-3 11.1', () => {
    for (const [id, field] of [
      ['export.run', 'includeComments'],
      ['export.text', 'includeComments'],
      ['asset.add', 'upload'],
      ['asset.add', 'replaceSource'],
      ['asset.dither', 'pattern'],
      ['asset.dither', 'cell'],
      ['asset.dither', 'tone'],
      ['deck.copy', 'copyComments'],
    ] as const) {
      const json = z.toJSONSchema(ACTIONS[id].input, { target: 'draft-2020-12' }) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(json.properties?.[field], `${id}.${field}`).toBeDefined();
      expect(json.required ?? [], `${id}.${field} optional`).not.toContain(field);
    }
    const head = z.toJSONSchema(ACTIONS['deck.list'].output, { target: 'draft-2020-12' });
    expect(JSON.stringify(head)).toContain('"owner"');
    expect(JSON.stringify(head)).toContain('"role"');
  });
});
