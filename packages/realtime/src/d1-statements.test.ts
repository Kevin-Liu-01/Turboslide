import { describe, expect, test } from 'vitest';

import { statementAllowed, statementSkeleton } from './d1-statements.ts';

// The skeleton folds an insert's lists and an update's set list only when they hold quoted
// columns bound to `?`; every other text is kept whole and matches only itself (AUTH-3).

describe('statementSkeleton', () => {
  test('folds the column and value lists of an insert and keeps the tail', () => {
    expect(
      statementSkeleton(
        'insert into "user" ("name", "email", "image", "id") values (?, ?, ?, ?) returning *',
      ),
    ).toBe('insert into "user" ({columns}) values ({values}) returning *');
    expect(statementSkeleton('insert into "user" ("name", "id") values (?, ?) returning *')).toBe(
      'insert into "user" ({columns}) values ({values}) returning *',
    );
  });

  test('folds the set list of an update and keeps the where clause', () => {
    expect(
      statementSkeleton(
        'update "account" set "accessToken" = ?, "updatedAt" = ? where "account"."id" = ?',
      ),
    ).toBe('update "account" set {assignments} where "account"."id" = ?');
  });

  test('keeps a list that writes anything but a parameter', () => {
    const subquery =
      'update "user" set "name" = (select group_concat("token") from "session") where "user"."id" = ?';
    expect(statementSkeleton(subquery)).toBe(subquery);
    const literal = 'insert into "ts_quota" ("key", "count") values (?, 1)';
    expect(statementSkeleton(literal)).toBe(literal);
    const uneven = 'insert into "ts_quota" ("key", "count") values (?)';
    expect(statementSkeleton(uneven)).toBeNull();
  });

  test('a raw text that carries a marker never stands for a skeleton', () => {
    expect(statementSkeleton('insert into "user" ({columns}) values ({values})')).toBeNull();
    expect(statementSkeleton('select * from "user" where "x" = {values}')).toBeNull();
    expect(
      statementSkeleton('update "user" set "name" = ? where "user"."id" = ? {assignments}'),
    ).toBeNull();
  });
});

describe('statementAllowed', () => {
  const allowed = new Set([
    'select "primary".* from (select * from "session" where "session"."token" = ?) as "primary"',
    'update "session" set {assignments} where "session"."token" = ?',
  ]);

  test('a recorded shape passes with any column list, an unrecorded one does not', () => {
    expect(
      statementAllowed(
        'select "primary".* from (select * from "session" where "session"."token" = ?) as "primary"',
        allowed,
      ),
    ).toBe(true);
    expect(
      statementAllowed(
        'update "session" set "expiresAt" = ?, "updatedAt" = ? where "session"."token" = ?',
        allowed,
      ),
    ).toBe(true);
    expect(statementAllowed('select * from session', allowed)).toBe(false);
    expect(statementAllowed('select * from "session"', allowed)).toBe(false);
    expect(
      statementAllowed(
        'select "primary".* from (select * from "session" where "session"."token" = ? or 1 = 1) as "primary"',
        allowed,
      ),
    ).toBe(false);
    expect(
      statementAllowed(
        'update "session" set "expiresAt" = ? where "session"."token" = ? or 1 = 1',
        allowed,
      ),
    ).toBe(false);
  });
});
