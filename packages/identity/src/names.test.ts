import { describe, expect, test } from 'vitest';

import {
  NAME_REFUSALS,
  RESERVED_NAMES,
  comparisonKey,
  hasMixedNumbers,
  isBlockedName,
  isIdentifierAllowed,
  isModeratelyRestrictive,
  isReservedName,
  normalizeName,
  skeleton,
} from './names.ts';

// The eight cases of research 10 F44 (the normalizer's unit test), then each rule alone.
describe('the eight cases', () => {
  test('1. a Cyrillic i inside a Latin name is refused', () => {
    // U+0456 CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I
    const result = normalizeName('Kevіn Liu');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('mixed_script');
      expect(result.message).toBe(NAME_REFUSALS.invalid);
    }
  });

  test('2. a right to left override is refused', () => {
    const result = normalizeName('Kevin Liu‮');
    expect(result).toEqual({ ok: false, code: 'bidi', message: NAME_REFUSALS.invalid });
    // A terminated override is stripped and the name stands.
    expect(normalizeName('Kevin ‮Liu‬')).toEqual({
      ok: true,
      name: 'Kevin Liu',
      skeleton: comparisonKey('Kevin Liu'),
    });
  });

  test('3. a zero width space is stripped, so the name is compared as typed', () => {
    const result = normalizeName('Kev​in');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe('Kevin');
    // The stripped form collides with the plain one.
    expect(normalizeName('Kev​in', { taken: ['Kevin'] })).toEqual({
      ok: false,
      code: 'in_use',
      message: NAME_REFUSALS.inUse,
    });
  });

  test('4. "Owner" is reserved', () => {
    expect(normalizeName('Owner')).toEqual({
      ok: false,
      code: 'reserved',
      message: NAME_REFUSALS.reserved,
    });
  });

  test('5. "OWNER" is reserved by case folding, and so is "0wner" by skeleton', () => {
    expect(normalizeName('OWNER')).toMatchObject({ ok: false, code: 'reserved' });
    expect(normalizeName('0wner')).toMatchObject({ ok: false, code: 'reserved' });
    expect(normalizeName(' owner ')).toMatchObject({ ok: false, code: 'reserved' });
  });

  test('6. "Kevin Liu" against a named Kevin Liu is refused, by skeleton', () => {
    const taken = ['Kevin Liu', 'Maya Chen'];
    expect(normalizeName('Kevin Liu', { taken })).toEqual({
      ok: false,
      code: 'in_use',
      message: NAME_REFUSALS.inUse,
    });
    expect(normalizeName('kevin liu', { taken })).toMatchObject({ code: 'in_use' });
    expect(normalizeName('KEVIN LIU', { taken })).toMatchObject({ code: 'in_use' });
    expect(normalizeName('Kevin  Liu', { taken })).toMatchObject({ code: 'in_use' });
    // A wholly Cyrillic spelling with the same skeleton meets the same refusal.
    // U+041A U+0435 U+0432 U+0456 U+043F is not confusable with Kevin; use the letters that are:
    // К (U+041A) is not mapped, so build "Мауа Сhen" style: M a y a with Cyrillic а (U+0430) and у.
    expect(normalizeName('Maya Chen', { taken })).toMatchObject({ code: 'in_use' });
    expect(normalizeName('Kevin Liu 2', { taken }).ok).toBe(true);
  });

  test('7. a Japanese plus Latin name is accepted', () => {
    const result = normalizeName('田中 Maya');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe('田中 Maya');
    expect(normalizeName('さくら Kobayashi').ok).toBe(true);
    expect(normalizeName('김 민수 Kim').ok).toBe(true);
  });

  test('8. an all emoji name is refused', () => {
    const result = normalizeName('🙂🙂🙂');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(NAME_REFUSALS.invalid);
    expect(normalizeName('Maya 🙂')).toMatchObject({ ok: false, code: 'character' });
  });
});

describe('the rules alone', () => {
  test('length and content', () => {
    expect(normalizeName('')).toMatchObject({ code: 'empty' });
    expect(normalizeName('   ')).toMatchObject({ code: 'empty' });
    expect(normalizeName('a'.repeat(41))).toMatchObject({ code: 'too_long' });
    expect(normalizeName('a'.repeat(40)).ok).toBe(true);
    expect(normalizeName('---')).toMatchObject({ code: 'no_letter' });
    expect(normalizeName('-Maya')).toMatchObject({ code: 'punctuation' });
    expect(normalizeName('Maya.')).toMatchObject({ code: 'punctuation' });
    expect(normalizeName("O'Neil-Jones Jr. Kim").ok).toBe(true);
    expect(normalizeName('Maya\tChen\n')).toMatchObject({ ok: true, name: 'Maya Chen' });
    expect(normalizeName('Maya<b>Chen</b>')).toMatchObject({ code: 'character' });
    expect(normalizeName('Maya_Chen')).toMatchObject({ ok: true, name: 'Maya_Chen' });
    expect(normalizeName('7')).toMatchObject({ ok: true, name: '7' });
  });

  test('Identifier_Status', () => {
    expect(isIdentifierAllowed(0x41)).toBe(true);
    expect(isIdentifierAllowed(0x7a)).toBe(true);
    expect(isIdentifierAllowed(0x30)).toBe(true);
    expect(isIdentifierAllowed(0x27)).toBe(true);
    expect(isIdentifierAllowed(0x20)).toBe(false);
    expect(isIdentifierAllowed(0x3c)).toBe(false);
    expect(isIdentifierAllowed(0x1f642)).toBe(false);
    expect(isIdentifierAllowed(0x7530)).toBe(true);
    expect(isIdentifierAllowed(0x0456)).toBe(true);
  });

  test('scripts at Moderately Restrictive', () => {
    expect(isModeratelyRestrictive('Maya')).toBe(true);
    expect(isModeratelyRestrictive('Мария')).toBe(true);
    expect(isModeratelyRestrictive('Мария Ivanova')).toBe(false);
    expect(isModeratelyRestrictive('Νίκος Papas')).toBe(false);
    expect(isModeratelyRestrictive('田中 Maya')).toBe(true);
    expect(isModeratelyRestrictive('田中さくら Maya')).toBe(true);
    expect(isModeratelyRestrictive('김민수 Kim')).toBe(true);
    expect(isModeratelyRestrictive('राम Sharma')).toBe(true);
    expect(isModeratelyRestrictive('Maya 123')).toBe(true);
    expect(isModeratelyRestrictive('田中 Мария')).toBe(false);
    // Cherokee is not a Recommended script and is refused outright.
    expect(isModeratelyRestrictive('ᏣᎳᎩ')).toBe(false);
  });

  test('the mixed number check', () => {
    expect(hasMixedNumbers('Maya 123')).toBe(false);
    expect(hasMixedNumbers('Maya ١٢٣')).toBe(false);
    expect(hasMixedNumbers('Maya 1٢3')).toBe(true);
    expect(normalizeName('Maya 1٢3')).toMatchObject({ code: 'mixed_number' });
  });

  test('the skeleton maps confusables', () => {
    expect(skeleton('0')).toBe('O');
    expect(skeleton('1')).toBe('l');
    expect(skeleton('і')).toBe('i');
    expect(comparisonKey('0wner')).toBe(comparisonKey('owner'));
    expect(comparisonKey('Kevin Llu')).toBe(comparisonKey('Kevin L1u'));
    expect(comparisonKey('I')).toBe(comparisonKey('l'));
    expect(comparisonKey('rn')).toBe(comparisonKey('m'));
  });

  test('reserved names, label words and the label grammar', () => {
    for (const word of RESERVED_NAMES) expect(isReservedName(word), word).toBe(true);
    expect(isReservedName('Agent: run 1')).toBe(true);
    expect(isReservedName('Titanium')).toBe(true);
    expect(isReservedName('titanium')).toBe(true);
    expect(isReservedName('Maya')).toBe(false);
    expect(normalizeName('Titanium 471')).toMatchObject({
      code: 'label',
      message: NAME_REFUSALS.reserved,
    });
    expect(normalizeName('Cobalt')).toMatchObject({ code: 'reserved' });
    expect(normalizeName('Cobalt Blue').ok).toBe(true);
    expect(normalizeName('Turboslide')).toMatchObject({ code: 'reserved' });
    expect(normalizeName('General Translation')).toMatchObject({ code: 'reserved' });
    expect(normalizeName('Editor')).toMatchObject({ code: 'reserved' });
  });

  test('the LDNOOBW list by whole word', () => {
    expect(isBlockedName('anal')).toBe(true);
    expect(isBlockedName('Analyst')).toBe(false);
    expect(isBlockedName('Bismuth')).toBe(false);
    expect(normalizeName('anal')).toMatchObject({
      code: 'blocked',
      message: NAME_REFUSALS.reserved,
    });
    expect(normalizeName('Maya Analyst').ok).toBe(true);
    // An unknown language falls back to English only.
    expect(isBlockedName('Maya', ['fr-CA'])).toBe(false);
  });

  test('the success shape carries the comparison key', () => {
    const result = normalizeName('Maya Chen');
    expect(result).toEqual({ ok: true, name: 'Maya Chen', skeleton: comparisonKey('Maya Chen') });
  });
});
