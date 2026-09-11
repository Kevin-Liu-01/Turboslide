// Attached studio sessions: attach, poll, command, answer, sweep (MILESTONES M4 item 1).
import { describe, expect, it } from 'vitest';

import { createSessionRegistry, SessionCommandError } from './sessions.ts';

describe('the session registry', () => {
  it('hands a command to a waiting poll and resolves the request with the answer', async () => {
    const registry = createSessionRegistry();
    const session = registry.attach({ deckId: 'fixture', owner: 'viewer', actions: ['view.goto'] });
    expect(registry.attached('fixture', 'view.goto')?.id).toBe(session.id);
    expect(registry.attached('fixture', 'slide.update')).toBeUndefined();
    const poll = registry.poll(session.id, 5000);
    const request = registry.request(session.id, 'view.goto', { slideId: 'thesis' }, 5000);
    const commands = await poll;
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ action: 'view.goto', input: { slideId: 'thesis' } });
    expect(
      registry.answer(session.id, {
        commandId: commands[0]!.id,
        ok: true,
        result: { slideId: 'thesis' },
      }),
    ).toBe(true);
    expect(await request).toEqual({ slideId: 'thesis' });
  });

  it('queues a command issued before the poll and rejects with the page error', async () => {
    const registry = createSessionRegistry();
    const session = registry.attach({ deckId: 'fixture', owner: 'editor', actions: ['view.goto'] });
    const request = registry.request(session.id, 'view.goto', { slideId: 'nope' }, 5000);
    const commands = await registry.poll(session.id, 10);
    expect(commands).toHaveLength(1);
    registry.answer(session.id, {
      commandId: commands[0]!.id,
      ok: false,
      error: { name: 'RangeError', message: 'No slide "nope"', status: 404 },
    });
    await expect(request).rejects.toBeInstanceOf(RangeError);
    await expect(request).rejects.toMatchObject({ message: 'No slide "nope"' });
    expect(await registry.poll(session.id, 5)).toEqual([]);
  });

  it('times out a command nobody answers and sweeps silent sessions', async () => {
    let clock = 1_000_000;
    const registry = createSessionRegistry({ staleMs: 100, now: () => clock });
    const session = registry.attach({ deckId: 'fixture', owner: 'viewer', actions: ['view.goto'] });
    await expect(registry.request(session.id, 'view.goto', {}, 5)).rejects.toBeInstanceOf(
      SessionCommandError,
    );
    await expect(registry.request(session.id, 'view.goto', {}, 5)).rejects.toMatchObject({
      status: 504,
    });
    clock += 1000;
    expect(registry.list()).toEqual([]);
    expect(registry.sweep()).toBe(0);
    await expect(registry.request(session.id, 'view.goto', {}, 5)).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(registry.detach(session.id)).toBe(false);
  });

  it('re-attaches under the same id and reports the state', () => {
    const registry = createSessionRegistry();
    const first = registry.attach(
      { deckId: 'fixture', owner: 'viewer', actions: ['view.goto'] },
      'page-1',
    );
    const second = registry.attach(
      {
        deckId: 'fixture',
        owner: 'editor',
        actions: ['view.goto', 'slide.update'],
        state: { slideId: 'x' },
      },
      'page-1',
    );
    expect(second.attachedAt).toBe(first.attachedAt);
    expect(registry.list('fixture')).toHaveLength(1);
    expect(registry.heartbeat('page-1', { state: { slideId: 'y' } })?.state).toEqual({
      slideId: 'y',
    });
    expect(registry.heartbeat('nope')).toBeUndefined();
  });
});
