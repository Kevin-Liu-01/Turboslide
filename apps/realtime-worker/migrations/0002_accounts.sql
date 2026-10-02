-- The identity schema as a D1 migration (docs/CLOUDFLARE.md 4.2; build/r4.md "Cloudflare phase",
-- request R4-R1b): better-auth 1.7.4's tables (user, session, account, verification, deviceCode) as
-- its getMigrations writes them on SQLite, and Turboslide's own (ts_alias, ts_api_key, ts_profile,
-- ts_mail, ts_quota, ts_principal, ts_schema) as auth/schema.ts writes them, every statement
-- idempotent, so `wrangler d1 migrations apply <database> --remote` may run before the first
-- function boots and a cold instance finds the tables; the boot path still runs the two sets and
-- writes the ts_schema version row the first time it finds the row absent (identity.ts), so this
-- file and the boot agree. Dumped on 2026-10-01 from a SQLite database both sets migrated
-- (sqlite_master's sql column); regenerate it when auth/schema.ts or the library's tables change
-- and bump AUTH_SCHEMA_VERSION in schema.ts. The file lives under R4's folder until R1 or R6 copies
-- it to apps/realtime-worker/migrations/0002_accounts.sql (the design assigns the migrations folder
-- to R1, the control migration being R1's).
CREATE TABLE IF NOT EXISTS "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE IF NOT EXISTS "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
CREATE TABLE IF NOT EXISTS "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE IF NOT EXISTS "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE IF NOT EXISTS "deviceCode" ("id" text not null primary key, "deviceCode" text not null, "userCode" text not null, "userId" text, "expiresAt" date not null, "status" text not null, "lastPolledAt" date, "pollingInterval" integer, "clientId" text, "scope" text);
CREATE TABLE IF NOT EXISTS "ts_alias" ("anonymousId" text primary key, "userId" text not null, "linkedAt" text not null);
CREATE TABLE IF NOT EXISTS "ts_api_key" ("id" text primary key, "name" text not null, "prefix" text not null, "start" text not null, "hash" text not null unique, "userId" text not null, "scopes" text not null, "enabled" integer default 1 not null, "expiresAt" text, "lastUsedAt" text, "createdAt" text not null, "updatedAt" text not null, "revokedAt" text);
CREATE TABLE IF NOT EXISTS "ts_profile" ("userId" text primary key, "admin" integer default 0 not null, "avatar" text, "avatarKey" text, "deletedAt" text, "createdAt" text not null, "updatedAt" text not null);
CREATE TABLE IF NOT EXISTS "ts_mail" ("id" text primary key, "kind" text not null, "toAddress" text not null, "subject" text not null, "text" text not null, "html" text, "headers" text default '{}' not null, "createdAt" text not null);
CREATE TABLE IF NOT EXISTS "ts_quota" ("key" text primary key, "count" integer default 0 not null, "resetAt" text not null);
CREATE TABLE IF NOT EXISTS "ts_principal" ("principal_id" text primary key, "record" text not null, "last_seen_at" integer not null, "expires_at" integer not null);
CREATE TABLE IF NOT EXISTS "ts_schema" ("k" text primary key, "v" text not null);
CREATE INDEX IF NOT EXISTS "account_userId_idx" on "account" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "deviceCode_deviceCode_uidx" on "deviceCode" ("deviceCode");
CREATE UNIQUE INDEX IF NOT EXISTS "deviceCode_userCode_uidx" on "deviceCode" ("userCode");
CREATE INDEX IF NOT EXISTS "session_userId_idx" on "session" ("userId");
CREATE INDEX IF NOT EXISTS "ts_alias_user" on "ts_alias" ("userId");
CREATE INDEX IF NOT EXISTS "ts_api_key_user" on "ts_api_key" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" on "verification" ("identifier");
