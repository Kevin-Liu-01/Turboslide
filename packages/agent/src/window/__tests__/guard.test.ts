// The window transport's nonce guard (gslides-parity SPEC-3 0.32, 6.6; report 10 F47): a guarded
// action through `invokeAction` is refused with the fixed sentence unless the input carries the
// page's nonce, the nonce is stripped before the handler sees the input, an unguarded action
// passes as before, and an adapter without a guard passes everything.
import { describe, expect, it } from 'vitest';

import type { StudioAdapter, StudioAutomation } from '../adapter.ts';
import { createLiveAdapter } from '../adapter.ts';
import {
  NONCE_FIELD,
  NONCE_GUARDED_PREFIXES,
  NONCE_REFUSAL,
  createPageNonce,
  guardInvocation,
  isNonceGuarded,
  mintPageNonce,
} from '../guard.ts';
import { invokeAction } from '../invoke.ts';

const studio = {} as StudioAutomation;

function adapterWith(
  guard: StudioAdapter['guard'],
  calls: { action: string; input: unknown }[],
): StudioAdapter {
  return {
    owner: 'editor',
    invoke: (action, input) => {
      calls.push({ action, input });
      return { ok: true };
    },
    ...(guard !== undefined ? { guard } : {}),
  };
}

describe('the nonce guard', () => {
  it('names the share, comment, notification, account, admin and publish ids', () => {
    for (const id of [
      'share.setGeneralAccess',
      'share.invite',
      'comment.add',
      'notification.markRead',
      'account.forget',
      'admin.flag',
      'deck.publish',
      'deck.unpublish',
    ])
      expect(isNonceGuarded(id), id).toBe(true);
    for (const id of [
      'slide.update',
      'deck.publishing',
      'render.slide',
      'view.goto',
      'comment',
      'presence.list',
    ])
      expect(isNonceGuarded(id), id).toBe(false);
    expect(NONCE_GUARDED_PREFIXES).toContain('share.');
    expect(NONCE_REFUSAL).not.toMatch(/nonce|token|agent/i);
  });

  it('mints a 22 character base64url nonce that differs per call', () => {
    const a = mintPageNonce();
    const b = mintPageNonce();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });

  it('passes a guarded call with the nonce, strips it, and refuses one without it', () => {
    const page = createPageNonce('n0nce-n0nce-n0nce-n0nce');
    expect(guardInvocation('x', 'slide.update', { a: 1 })).toEqual({ ok: true, input: { a: 1 } });
    const stamped = page.withNonce({ mode: 'link', role: 'viewer' });
    const passed = page.guard('share.setGeneralAccess', stamped);
    expect(passed).toEqual({ ok: true, input: { mode: 'link', role: 'viewer' } });
    const refused = page.guard('share.setGeneralAccess', { mode: 'link', role: 'viewer' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.message).toBe(NONCE_REFUSAL);
      expect(refused.error).not.toBeInstanceOf(RangeError);
    }
    const wrong = page.guard('comment.add', {
      [NONCE_FIELD]: 'n0nce-n0nce-n0nce-n0ncf',
      body: 'x',
    });
    expect(wrong.ok).toBe(false);
    expect(page.guard('comment.add', 'a string').ok).toBe(false);
    expect(page.withNonce(undefined)).toEqual({ [NONCE_FIELD]: 'n0nce-n0nce-n0nce-n0nce' });
  });

  it('is applied by invokeAction through the adapter, and a live adapter forwards it', async () => {
    const calls: { action: string; input: unknown }[] = [];
    const page = createPageNonce('secret-page-nonce-value');
    const live = createLiveAdapter(adapterWith(page.guard, calls));
    await expect(
      invokeAction(studio, live.adapter, 'share.createLink', { role: 'viewer' }),
    ).rejects.toThrow(NONCE_REFUSAL);
    expect(calls).toHaveLength(0);
    await invokeAction(
      studio,
      live.adapter,
      'share.createLink',
      page.withNonce({ role: 'viewer' }),
    );
    expect(calls).toEqual([{ action: 'share.createLink', input: { role: 'viewer' } }]);
    await invokeAction(studio, live.adapter, 'slide.update', { x: 1 });
    expect(calls).toHaveLength(2);
    // an adapter without a guard (the viewer, the presenter) passes everything
    const open: { action: string; input: unknown }[] = [];
    await invokeAction(studio, adapterWith(undefined, open), 'share.get', {});
    expect(open).toHaveLength(1);
    // describe() never carries the nonce
    expect(JSON.stringify(live.adapter.state?.() ?? {})).not.toContain('secret-page-nonce-value');
  });
});
