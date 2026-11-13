/**
 * Hybrid distributed (Upstash Redis REST) + bounded in-memory sliding window rate limiter.
 * Falls back transparently to the local in-memory limiter when Redis is not configured
 * or momentarily unavailable, preventing Redis outages from blocking legitimate exam logins.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitRecord>();
const genericWindows = new Map<string, RateLimitRecord>();

const MAX_LOGIN_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute
const WINDOW_SECONDS = 60;
const MAX_LOCAL_ENTRIES = 20000;
const REDIS_TIMEOUT_MS = 800;

let lastRedisWarnAt = 0;

function warnRedisFallback(context: string, err: unknown): void {
  const now = Date.now();
  if (now - lastRedisWarnAt > 30000) {
    lastRedisWarnAt = now;
    console.warn(`[rate-limiter] Redis unavailable during ${context}; using local fallback:`, err);
  }
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

async function upstashPipeline(commands: Array<Array<string | number>>): Promise<Array<{ result?: unknown; error?: string }> | null> {
  const cfg = getUpstashConfig();
  if (!cfg) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return Array.isArray(json) ? json : null;
  } finally {
    clearTimeout(timeout);
  }
}

function pruneMapIfNeeded(map: Map<string, RateLimitRecord>, now: number): void {
  if (map.size < MAX_LOCAL_ENTRIES) return;
  for (const [k, rec] of map.entries()) {
    if (now > rec.resetAt) {
      map.delete(k);
    }
    if (map.size < MAX_LOCAL_ENTRIES * 0.8) break;
  }
  while (map.size >= MAX_LOCAL_ENTRIES) {
    const firstKey = map.keys().next().value;
    if (firstKey === undefined) break;
    map.delete(firstKey);
  }
}

/**
 * Checks if a login attempt is allowed under the local rate limit policy.
 */
export function checkLoginRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const normalizedKey = key.trim().toLowerCase();
  const now = Date.now();
  const record = loginAttempts.get(normalizedKey);

  if (!record) {
    return { allowed: true };
  }

  if (now > record.resetAt) {
    loginAttempts.delete(normalizedKey);
    return { allowed: true };
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

/**
 * Records a failed login attempt for the specified key locally.
 */
export function recordFailedLoginAttempt(key: string): void {
  const normalizedKey = key.trim().toLowerCase();
  const now = Date.now();
  const record = loginAttempts.get(normalizedKey);

  if (!record || now > record.resetAt) {
    pruneMapIfNeeded(loginAttempts, now);
    loginAttempts.set(normalizedKey, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
  } else {
    record.count += 1;
  }
}

/**
 * Clears failed attempt history locally upon successful authentication.
 */
export function resetLoginAttempts(key: string): void {
  const normalizedKey = key.trim().toLowerCase();
  loginAttempts.delete(normalizedKey);
}

/**
 * Distributed login rate limit check (Redis when configured, bounded local fallback otherwise).
 */
export async function checkLoginRateLimitAsync(key: string): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
}> {
  const redisKey = `rl:login:${key.trim().toLowerCase()}`;
  const cfg = getUpstashConfig();
  if (cfg) {
    try {
      const results = await upstashPipeline([
        ["GET", redisKey],
        ["TTL", redisKey],
      ]);
      const countRaw = results?.[0]?.result;
      const ttlRaw = results?.[1]?.result;
      const count = countRaw !== null && countRaw !== undefined ? Number(countRaw) : 0;
      const ttl = typeof ttlRaw === "number" && ttlRaw > 0 ? ttlRaw : WINDOW_SECONDS;
      if (Number.isFinite(count) && count >= MAX_LOGIN_ATTEMPTS) {
        return { allowed: false, retryAfterSeconds: ttl };
      }
      return { allowed: true };
    } catch (err) {
      warnRedisFallback("checkLoginRateLimitAsync", err);
    }
  }
  return checkLoginRateLimit(key);
}

/**
 * Records a failed login attempt in Redis (or local fallback).
 */
export async function recordFailedLoginAttemptAsync(key: string): Promise<void> {
  const redisKey = `rl:login:${key.trim().toLowerCase()}`;
  const cfg = getUpstashConfig();
  if (cfg) {
    try {
      const res = await upstashPipeline([
        ["INCR", redisKey],
        ["TTL", redisKey],
      ]);
      const count = Number(res?.[0]?.result ?? 1);
      const ttl = Number(res?.[1]?.result ?? -1);
      if (count <= 1 || ttl < 0) {
        await upstashPipeline([["EXPIRE", redisKey, WINDOW_SECONDS]]);
      }
      return;
    } catch (err) {
      warnRedisFallback("recordFailedLoginAttemptAsync", err);
    }
  }
  recordFailedLoginAttempt(key);
}

/**
 * Clears failed login attempt counters in both Redis and local fallback.
 */
export async function resetLoginAttemptsAsync(key: string): Promise<void> {
  resetLoginAttempts(key);
  const redisKey = `rl:login:${key.trim().toLowerCase()}`;
  const cfg = getUpstashConfig();
  if (cfg) {
    try {
      await upstashPipeline([["DEL", redisKey]]);
    } catch (err) {
      warnRedisFallback("resetLoginAttemptsAsync", err);
    }
  }
}

/**
 * Fixed/sliding window limiter for write-heavy server actions (answer batches, monitoring events).
 * Always fails open with bounded local tracking if Redis is unavailable so exam submissions are never blocked.
 */
export async function checkActionRateLimitAsync(
  namespace: string,
  subjectKey: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const redisKey = `rl:${namespace}:${subjectKey}`;
  const cfg = getUpstashConfig();
  if (cfg) {
    try {
      const res = await upstashPipeline([
        ["INCR", redisKey],
        ["TTL", redisKey],
      ]);
      const count = Number(res?.[0]?.result ?? 1);
      const ttl = Number(res?.[1]?.result ?? -1);
      if (count <= 1 || ttl < 0) {
        await upstashPipeline([["EXPIRE", redisKey, windowSeconds]]);
      }
      if (Number.isFinite(count) && count > maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
        };
      }
      return { allowed: true };
    } catch (err) {
      warnRedisFallback(`checkActionRateLimitAsync:${namespace}`, err);
    }
  }

  const now = Date.now();
  const localKey = `${namespace}:${subjectKey}`;
  const rec = genericWindows.get(localKey);
  if (!rec || now > rec.resetAt) {
    pruneMapIfNeeded(genericWindows, now);
    genericWindows.set(localKey, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { allowed: true };
  }

  rec.count += 1;
  if (rec.count > maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)),
    };
  }
  return { allowed: true };
}
