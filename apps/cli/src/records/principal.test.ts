import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultPreferences, setPreference } from '@turboslide/schema/preferences';
import { afterEach, describe, expect, test } from 'vitest';

import {
  localPreferencesStore,
  principalFileName,
  readLocalPrincipal,
  writeLocalPrincipal,
} from './principal.ts';

// The preferences on a checkout principal's file (gslides-parity SPEC-5 7.1; R10 3.2; b5.md
// request 1, landed by the integrator at merge 1): the stored member travels through
// readLocalPrincipal so an account name or pointer write after `prefs.set` keeps it, an older
// record without the member reads as before, a malformed member drops the preferences alone, and
// `localPreferencesStore` is the PreferencesStore the CLI's dispatcher composes for prefs.get and
// prefs.set over that file.

const dirs: string[] = [];
function stateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'turboslide-principal-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = '2026-09-15T12:00:00.000Z';

describe('readLocalPrincipal and the preferences member', () => {
  test('a record without preferences reads as before, with none', () => {
    const dir = stateDir();
    writeLocalPrincipal(dir, {
      ...readLocalPrincipal(dir, 'local:maya', NOW),
      name: 'Maya',
    });
    const record = readLocalPrincipal(dir, 'local:maya', NOW);
    expect(record.name).toBe('Maya');
    expect(record.preferences).toBeUndefined();
  });

  test('stored preferences travel through a read and a whole record write', () => {
    const dir = stateDir();
    const preferences = setPreference(defaultPreferences(), '/units', 'cm');
    writeLocalPrincipal(dir, { ...readLocalPrincipal(dir, 'local:maya', NOW), preferences });
    // the account name write path: read, change one field, write the whole record
    const record = readLocalPrincipal(dir, 'local:maya', NOW);
    record.name = 'Maya';
    writeLocalPrincipal(dir, record);
    const again = readLocalPrincipal(dir, 'local:maya', NOW);
    expect(again.name).toBe('Maya');
    expect(again.preferences?.units).toBe('cm');
  });

  test('an older record fills its absent members and a malformed member drops the preferences alone', () => {
    const dir = stateDir();
    const base = readLocalPrincipal(dir, 'local:maya', NOW);
    writeLocalPrincipal(dir, {
      ...base,
      preferences: { units: 'px' } as never,
    });
    const filled = readLocalPrincipal(dir, 'local:maya', NOW);
    expect(filled.preferences?.units).toBe('px');
    expect(filled.preferences?.autofit).toEqual(defaultPreferences().autofit);
    writeLocalPrincipal(dir, { ...base, name: 'Maya', preferences: { units: 12 } as never });
    const dropped = readLocalPrincipal(dir, 'local:maya', NOW);
    expect(dropped.name).toBe('Maya');
    expect(dropped.preferences).toBeUndefined();
  });
});

describe('localPreferencesStore', () => {
  test('load answers the defaults for a principal without a record and never writes', async () => {
    const dir = stateDir();
    const store = localPreferencesStore(dir, 'local:maya', () => NOW);
    expect(await store.load()).toEqual(defaultPreferences());
    expect(() =>
      readFileSync(join(dir, 'principals', principalFileName('local:maya')), 'utf8'),
    ).toThrow();
  });

  test('save writes the whole record with lastSeenAt stamped and load reads it back', async () => {
    const dir = stateDir();
    let clock = NOW;
    const store = localPreferencesStore(dir, 'agent:run-7', () => clock);
    const next = setPreference(await store.load(), '/units', 'cm');
    expect(await store.save(next)).toEqual(next);
    clock = '2026-09-15T12:05:00.000Z';
    expect((await store.load()).units).toBe('cm');
    const record = readLocalPrincipal(dir, 'agent:run-7', clock);
    expect(record.label).toBe('Agent');
    expect(record.lastSeenAt).toBe(NOW);
    expect(record.preferences?.units).toBe('cm');
  });
});
