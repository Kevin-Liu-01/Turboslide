import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  captureMailer,
  fileCaptureStore,
  isMailAddress,
  memoryCaptureStore,
  offMailer,
  resendMailer,
  selectMail,
  selectMailer,
} from './mailer.ts';
import type { OutgoingMail, ResendLike } from './mailer.ts';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

const mail: OutgoingMail = {
  to: 'maya@example.test',
  subject: 'Your code',
  text: 'Code: 123456',
  kind: 'sign-in',
};

describe('selectMail', () => {
  test('capture wins, then Resend with a from address, else off with the reason', () => {
    expect(selectMail({ TURBOSLIDE_MAIL: 'capture', RESEND_API_KEY: 'fake' })).toEqual({
      mode: 'capture',
      reason: 'TURBOSLIDE_MAIL=capture',
    });
    expect(
      selectMail({
        RESEND_API_KEY: 're_fake',
        TURBOSLIDE_MAIL_FROM: 'Turboslide <no-reply@example.test>',
      }),
    ).toMatchObject({ mode: 'resend' });
    expect(selectMail({ RESEND_API_KEY: 're_fake' })).toMatchObject({ mode: 'off' });
    expect(selectMail({})).toMatchObject({ mode: 'off' });
    expect(
      selectMail({ TURBOSLIDE_MAIL: 'off', RESEND_API_KEY: 'x', TURBOSLIDE_MAIL_FROM: 'y' }),
    ).toMatchObject({ mode: 'off' });
    // the reason never carries the key
    expect(selectMail({ RESEND_API_KEY: 're_secret_value' }).reason).not.toContain(
      're_secret_value',
    );
  });
});

describe('the capture mailer', () => {
  test('writes every mail to the store with an id, a stamp and its headers, newest first', async () => {
    const store = memoryCaptureStore();
    let t = 0;
    const mailer = captureMailer(store, () => new Date(1_757_800_000_000 + (t += 1000)));
    const first = await mailer.send(mail);
    expect(first.status).toBe('captured');
    await mailer.send({ ...mail, subject: 'Second', headers: { 'List-Unsubscribe': '<x>' } });
    const listed = await mailer.list();
    expect(listed.map((m) => m.subject)).toEqual(['Second', 'Your code']);
    expect(listed[0]?.headers).toEqual({ 'List-Unsubscribe': '<x>' });
    expect(listed[1]?.id).toBe(first.id);
    expect(await mailer.list({ limit: 1 })).toHaveLength(1);
  });

  test('the file store appends JSON lines under the state folder and survives a reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-mail-'));
    dirs.push(dir);
    const mailer = captureMailer(fileCaptureStore(dir));
    await mailer.send(mail);
    await mailer.send({ ...mail, to: 'kai@example.test' });
    const raw = readFileSync(join(dir, 'mail', 'outbox.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(raw).toHaveLength(2);
    const reopened = captureMailer(fileCaptureStore(dir));
    expect((await reopened.list()).map((m) => m.to)).toEqual([
      'kai@example.test',
      'maya@example.test',
    ]);
  });

  test('refuses a malformed address, an empty subject or body, an unknown kind', async () => {
    const mailer = captureMailer(memoryCaptureStore());
    await expect(mailer.send({ ...mail, to: 'not an address' })).rejects.toThrow(TypeError);
    await expect(mailer.send({ ...mail, subject: ' ' })).rejects.toThrow(TypeError);
    await expect(mailer.send({ ...mail, text: '' })).rejects.toThrow(TypeError);
    await expect(mailer.send({ ...mail, kind: 'spam' as never })).rejects.toThrow(TypeError);
    expect(isMailAddress('a@b.co')).toBe(true);
    expect(isMailAddress('a@b')).toBe(false);
  });
});

describe('the Resend mailer against a fake client', () => {
  test('sends from the configured address and answers the provider id; a provider error throws', async () => {
    const calls: unknown[] = [];
    const fake: ResendLike = {
      emails: {
        send: (input) => {
          calls.push(input);
          return Promise.resolve({ data: { id: 'msg_1' }, error: null });
        },
      },
    };
    const mailer = resendMailer(fake, 'Turboslide <no-reply@example.test>');
    const sent = await mailer.send({ ...mail, headers: { 'List-Unsubscribe': '<u>' } });
    expect(sent).toEqual({ id: 'msg_1', status: 'sent' });
    expect(calls[0]).toMatchObject({
      from: 'Turboslide <no-reply@example.test>',
      to: 'maya@example.test',
      headers: { 'List-Unsubscribe': '<u>' },
    });
    expect(await mailer.list()).toEqual([]);
    const failing: ResendLike = {
      emails: {
        send: () => Promise.resolve({ data: null, error: { message: 'domain not verified' } }),
      },
    };
    await expect(resendMailer(failing, 'x@example.test').send(mail)).rejects.toThrow(
      'domain not verified',
    );
  });
});

describe('the off mailer and the selection', () => {
  test('drops with one warning naming the variables, never the key', async () => {
    const lines: string[] = [];
    const mailer = offMailer((line) => lines.push(line));
    expect((await mailer.send(mail)).status).toBe('dropped');
    expect((await mailer.send(mail)).status).toBe('dropped');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('TURBOSLIDE_MAIL=capture');
    expect(lines[0]).toContain('RESEND_API_KEY');
  });

  test('selectMailer builds the mode the environment names', async () => {
    const store = memoryCaptureStore();
    expect(selectMailer({ TURBOSLIDE_MAIL: 'capture' }, { store }).mode).toBe('capture');
    expect(selectMailer({}, { store, warn: () => undefined }).mode).toBe('off');
    const seen: string[] = [];
    const resend = selectMailer(
      { RESEND_API_KEY: 're_fake_key', TURBOSLIDE_MAIL_FROM: 'a@example.test' },
      {
        store,
        resend: (key) => {
          seen.push(key);
          return { emails: { send: () => Promise.resolve({ data: { id: 'x' }, error: null }) } };
        },
      },
    );
    expect(resend.mode).toBe('resend');
    expect(seen).toEqual(['re_fake_key']);
  });
});
