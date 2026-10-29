/**
 * In-memory sliding window rate limiter for login attempts and sensitive endpoints.
 * Protects against brute-force attacks and credential stuffing.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitRecord>();

const MAX_LOGIN_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Checks if a login attempt is allowed under the rate limit policy.
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
 * Records a failed login attempt for the specified key.
 */
export function recordFailedLoginAttempt(key: string): void {
  const normalizedKey = key.trim().toLowerCase();
  const now = Date.now();
  const record = loginAttempts.get(normalizedKey);

  if (!record || now > record.resetAt) {
    loginAttempts.set(normalizedKey, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
  } else {
    record.count += 1;
  }
}

/**
 * Clears failed attempt history upon successful authentication.
 */
export function resetLoginAttempts(key: string): void {
  const normalizedKey = key.trim().toLowerCase();
  loginAttempts.delete(normalizedKey);
}
