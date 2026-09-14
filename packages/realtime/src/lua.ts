// The Lua scripts of the redis channel (gslides-parity SPEC-3 3.4 step 5, 0.8; report 10 F34),
// as strings, so redis.ts loads them with SCRIPT LOAD and redis-fake.ts runs the same steps in
// process. Redis runs a script on its one thread, so each is one atomic step: the compare and
// append never interleaves between two instances, a lock is taken or refused in one read and one
// write, a budget increments and expires together. Every script stays a few statements long and
// returns counts and heads, never the entries (F34: a miss copies nothing through the thread).

/**
 * Compare and append. KEYS[1] the ops stream, KEYS[2] the head counter, KEYS[3] the append lock;
 * ARGV[1] the base the writer transformed against, ARGV[2] the pub/sub channel, ARGV[3] the
 * writer's append lock token ('' when it holds none), ARGV[4..] the entry bodies (JSON without
 * `seq`). Answers `{2, head, 0}` while another writer holds the append lock (SPEC-3 3.4 step 5:
 * after two misses an instance takes the lock and retries under it, so the others yield to it),
 * `{0, head, count}` when the head moved, so the writer reads `count` entries with XRANGE,
 * transforms once more and retries, or `{1, head}` after appending every body with the id
 * `<seq>-0` and publishing one message that carries the first seq and the bodies in order.
 */
export const APPEND_SCRIPT = `
local lockValue = redis.call('GET', KEYS[3])
if lockValue then
  local sep = string.find(lockValue, ':', 1, true)
  if string.sub(lockValue, 1, sep - 1) ~= ARGV[3] then
    return {2, tonumber(redis.call('GET', KEYS[2]) or '0'), 0}
  end
end
local head = tonumber(redis.call('GET', KEYS[2]) or '0')
local base = tonumber(ARGV[1])
if head ~= base then
  return {0, head, head - base}
end
local first = head + 1
local parts = {}
for i = 4, #ARGV do
  head = head + 1
  redis.call('XADD', KEYS[1], head .. '-0', 'seq', head, 'body', ARGV[i])
  parts[#parts + 1] = ARGV[i]
end
redis.call('SET', KEYS[2], head)
redis.call('PUBLISH', ARGV[2], '{"t":"ops","from":' .. first .. ',"entries":[' .. table.concat(parts, ',') .. ']}')
return {1, head}
`.trim();

/**
 * Take a lock. KEYS[1] the lock; ARGV[1] the acquirer's token, ARGV[2] the TTL in ms, ARGV[3]
 * the acquirer's clock in ms, ARGV[4] the stale heartbeat age in ms (0 never breaks a held
 * lock). The value is `<token>:<heartbeatMs>:<ttlMs>`. Answers 1 when taken.
 */
export const LOCK_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then
  local first = string.find(value, ':', 1, true)
  local second = string.find(value, ':', first + 1, true)
  local beat = tonumber(string.sub(value, first + 1, second - 1))
  local stale = tonumber(ARGV[4])
  if stale == 0 or tonumber(ARGV[3]) - beat <= stale then
    return 0
  end
end
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. ARGV[3] .. ':' .. ARGV[2], 'PX', ARGV[2])
return 1
`.trim();

/**
 * Heartbeat. KEYS[1] the lock; ARGV[1] the token, ARGV[2] the clock in ms. Rewrites the value
 * with the new heartbeat and the TTL the lock was taken with; 0 when the token no longer holds it.
 */
export const HEARTBEAT_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then
  return 0
end
local first = string.find(value, ':', 1, true)
if string.sub(value, 1, first - 1) ~= ARGV[1] then
  return 0
end
local second = string.find(value, ':', first + 1, true)
local ttl = string.sub(value, second + 1)
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. ARGV[2] .. ':' .. ttl, 'PX', ttl)
return 1
`.trim();

/** Unlock. KEYS[1] the lock; ARGV[1] the token. Deletes only the acquirer's own lock. */
export const UNLOCK_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then
  return 0
end
local first = string.find(value, ':', 1, true)
if string.sub(value, 1, first - 1) ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
return 1
`.trim();

/**
 * A fixed window budget. KEYS[1] the counter; ARGV[1] the cost, ARGV[2] the window in ms.
 * Answers `{count, pttl}`; the first increment of a window sets its expiry.
 */
export const BUDGET_SCRIPT = `
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  ttl = tonumber(ARGV[2])
end
return {count, ttl}
`.trim();

export const SCRIPTS = {
  append: APPEND_SCRIPT,
  lock: LOCK_SCRIPT,
  heartbeat: HEARTBEAT_SCRIPT,
  unlock: UNLOCK_SCRIPT,
  budget: BUDGET_SCRIPT,
} as const;

export type ScriptName = keyof typeof SCRIPTS;
