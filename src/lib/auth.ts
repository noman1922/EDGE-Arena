import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  MAX_SESSION_LIFETIME_MS,
  getSessionSecret,
  createSessionToken,
  verifySessionToken,
  getRoleDestination,
  type SessionPayload,
  type SessionRole,
} from "@/lib/session-token";

export {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  MAX_SESSION_LIFETIME_MS,
  getSessionSecret,
  createSessionToken,
  verifySessionToken,
  getRoleDestination,
  type SessionPayload,
  type SessionRole,
};

/**
 * Computes an irreversible credential fingerprint used to invalidate
 * existing sessions automatically whenever password hash/salt changes.
 */
export function computeCredentialVersion(
  passwordHash: string | null | undefined,
  passwordSalt: string | null | undefined
): string {
  return crypto
    .createHash("sha256")
    .update(`${passwordHash ?? ""}:${passwordSalt ?? ""}`)
    .digest("hex")
    .slice(0, 24);
}

function computeTokenRevocationKey(rawToken: string): string {
  return `rev:${crypto.createHash("sha256").update(rawToken).digest("hex").slice(0, 32)}`;
}

/**
 * Strictly determines whether test session overrides / test cookie jars are allowed.
 * Explicitly disabled in production, development, or any Next.js runtime request context.
 */
export function isTestSessionOverrideAllowed(): boolean {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "development"
  ) {
    return false;
  }
  if (process.env.NEXT_RUNTIME) {
    return false;
  }
  return (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.NODE_TEST_CONTEXT)
  );
}

let currentTestSession: SessionPayload | null | undefined = undefined;
const testCookieContext = new AsyncLocalStorage<{ token: string | null }>();

export function setTestSession(
  session:
    | (Omit<SessionPayload, "issuedAt" | "expiresAt"> &
        Partial<Pick<SessionPayload, "issuedAt" | "expiresAt">>)
    | null
    | undefined
) {
  if (!isTestSessionOverrideAllowed()) {
    currentTestSession = undefined;
    throw new Error(
      "Security Error: setTestSession() is strictly disabled outside automated test environments."
    );
  }

  if (session) {
    currentTestSession = {
      issuedAt: session.issuedAt ?? Date.now(),
      expiresAt:
        session.expiresAt ?? Date.now() + SESSION_DURATION_SECONDS * 1000,
      ...session,
    };
  } else {
    currentTestSession = session;
  }
}

/**
 * Executes an async test block with an isolated per-async-context cookie store
 * so cookie-backed login/logout/session flows can be tested without global leaks.
 */
export async function runWithTestCookieJar<T>(
  fn: () => Promise<T>,
  initialToken: string | null = null
): Promise<T> {
  if (!isTestSessionOverrideAllowed()) {
    throw new Error(
      "Security Error: runWithTestCookieJar() is strictly disabled outside automated test environments."
    );
  }
  return await testCookieContext.run({ token: initialToken }, fn);
}

export function getTestCookieJarToken(): string | null {
  if (!isTestSessionOverrideAllowed()) {
    return null;
  }
  return testCookieContext.getStore()?.token ?? null;
}

/**
 * Reads the raw session token string from the current request cookies (or test cookie jar).
 */
export async function getRawSessionToken(): Promise<string | null> {
  if (isTestSessionOverrideAllowed()) {
    const store = testCookieContext.getStore();
    if (store) {
      return store.token;
    }
  }

  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Persists a revocation entry for a specific session token (used during logout).
 */
export async function revokeSessionToken(
  rawToken: string,
  verifiedPayload?: SessionPayload | null,
  reason: string = "LOGOUT",
  actorId?: string | null
): Promise<void> {
  const payload = verifiedPayload ?? (await verifySessionToken(rawToken));
  const revocationTargets = [
    payload?.jti,
    rawToken ? computeTokenRevocationKey(rawToken) : undefined,
  ].filter((v): v is string => Boolean(v));

  if (revocationTargets.length === 0) return;

  await prisma.auditLog.create({
    data: {
      actorId: actorId ?? payload?.userId ?? null,
      action: "SESSION_REVOKED",
      targetType: "SESSION",
      targetId: payload?.jti || revocationTargets[0],
      metadata: {
        reason,
        expiresAt: payload?.expiresAt ?? null,
        tokenKey: rawToken ? computeTokenRevocationKey(rawToken) : null,
      },
    },
  });
}

let cachedSessionVersionSupport: boolean | null = null;
let detectionInFlight: Promise<boolean> | null = null;

/**
 * Detects whether the active database schema contains the `User.sessionVersion` column.
 * Gracefully caches the result to eliminate query overhead during live requests.
 * Direct LIMIT 0 probe is safe across direct and pooled PostgreSQL/PgBouncer connections.
 */
export async function detectSessionVersionColumnSupport(): Promise<boolean> {
  if (cachedSessionVersionSupport !== null) {
    return cachedSessionVersionSupport;
  }
  if (detectionInFlight) {
    return detectionInFlight;
  }

  detectionInFlight = (async () => {
    try {
      await prisma.$queryRawUnsafe('SELECT "sessionVersion" FROM "User" LIMIT 0');
      cachedSessionVersionSupport = true;
      return true;
    } catch {
      cachedSessionVersionSupport = false;
      return false;
    } finally {
      detectionInFlight = null;
    }
  })();

  return detectionInFlight;
}

/**
 * Explicit test hook allowing unit tests to simulate both present and absent schema column states
 * in isolation without mutating database catalogs.
 */
export function setSessionVersionColumnOverrideForTesting(val: boolean | null): void {
  cachedSessionVersionSupport = val;
  detectionInFlight = null;
}

/**
 * Invalidates all sessions for a user issued on or before now (except an optional newly minted JTI)
 * and increments the persisted User.sessionVersion if supported, while always maintaining authoritative
 * AuditLog USER_SESSIONS_REVOKED records for backwards-compatible security.
 */
export async function revokeUserSessionsWithVersion(
  userId: string,
  reason: string = "PASSWORD_CHANGED",
  exceptJti?: string,
  actorId?: string | null
): Promise<{ revokedBefore: number; sessionVersion: number }> {
  const revokedBefore = Date.now();
  const hasSessionVersion = await detectSessionVersionColumnSupport();

  const auditLogPromise = prisma.auditLog.create({
    data: {
      actorId: actorId ?? userId,
      action: "USER_SESSIONS_REVOKED",
      targetType: "USER_SESSION_EPOCH",
      targetId: userId,
      metadata: {
        reason,
        revokedBefore,
        ...(exceptJti ? { exceptJti } : {}),
      },
    },
  });

  if (hasSessionVersion) {
    const [updatedUser] = await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      }),
      auditLogPromise,
    ]);
    return { revokedBefore, sessionVersion: updatedUser.sessionVersion };
  } else {
    await auditLogPromise;
    return { revokedBefore, sessionVersion: 1 };
  }
}

export async function revokeUserSessions(
  userId: string,
  reason: string = "PASSWORD_CHANGED",
  exceptJti?: string,
  actorId?: string | null
): Promise<number> {
  const res = await revokeUserSessionsWithVersion(userId, reason, exceptJti, actorId);
  return res.revokedBefore;
}

/**
 * Verifies an HMAC-validated token payload against authoritative database user state
 * and server-side session revocation records.
 */
export async function verifySessionAgainstDatabase(
  verified: SessionPayload,
  rawToken?: string
): Promise<SessionPayload | null> {
  try {
    const sessionTargetIds = [
      verified.jti,
      rawToken ? computeTokenRevocationKey(rawToken) : undefined,
    ].filter((id): id is string => Boolean(id));

    const hasSessionVersion = await detectSessionVersionColumnSupport();

    // When the database has no sessionVersion column, or when the token carries no sv,
    // we MUST execute the authoritative A4 AuditLog user-wide epoch check.
    const needsLegacyEpochCheck = !hasSessionVersion || verified.sv === undefined;

    const dbUserPromise = (async () => {
      if (hasSessionVersion) {
        try {
          return await prisma.user.findUnique({
            where: { id: verified.userId },
            select: {
              id: true,
              email: true,
              role: true,
              name: true,
              candidateId: true,
              institution: true,
              isActive: true,
              mustChangePassword: true,
              passwordHash: true,
              passwordSalt: true,
              sessionVersion: true,
            },
          });
        } catch (err: unknown) {
          const errStr = String(err).toLowerCase();
          if (errStr.includes("sessionversion") || errStr.includes("42703") || errStr.includes("column")) {
            cachedSessionVersionSupport = false;
            return await prisma.user.findUnique({
              where: { id: verified.userId },
              select: {
                id: true,
                email: true,
                role: true,
                name: true,
                candidateId: true,
                institution: true,
                isActive: true,
                mustChangePassword: true,
                passwordHash: true,
                passwordSalt: true,
              },
            });
          }
          throw err;
        }
      }
      return await prisma.user.findUnique({
        where: { id: verified.userId },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          candidateId: true,
          institution: true,
          isActive: true,
          mustChangePassword: true,
          passwordHash: true,
          passwordSalt: true,
        },
      });
    })();

    const [dbUser, tokenRevocation, userEpochRevocation] = await Promise.all([
      dbUserPromise,
      sessionTargetIds.length > 0
        ? prisma.auditLog.findFirst({
            where: {
              targetType: "SESSION",
              targetId: { in: sessionTargetIds },
              action: "SESSION_REVOKED",
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      needsLegacyEpochCheck
        ? prisma.auditLog.findFirst({
            where: {
              targetType: "USER_SESSION_EPOCH",
              targetId: verified.userId,
              action: "USER_SESSIONS_REVOKED",
            },
            orderBy: { createdAt: "desc" },
            select: {
              metadata: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!dbUser || dbUser.isActive === false) {
      return null;
    }

    // Reject if role changed after session was issued
    if (dbUser.role !== verified.role) {
      return null;
    }

    // Reject if user-wide session epoch was incremented (when sessionVersion column exists)
    if (
      hasSessionVersion &&
      "sessionVersion" in dbUser &&
      typeof dbUser.sessionVersion === "number" &&
      verified.sv !== undefined &&
      verified.sv !== dbUser.sessionVersion
    ) {
      return null;
    }

    // Reject if token is bound to an outdated password hash/salt version
    if (verified.credVersion !== undefined) {
      const currentCredVersion = computeCredentialVersion(
        dbUser.passwordHash,
        dbUser.passwordSalt
      );
      if (verified.credVersion !== currentCredVersion) {
        return null;
      }
    }

    // Reject individually revoked tokens (e.g. post-logout replay)
    if (tokenRevocation) {
      return null;
    }

    // Reject tokens issued before user-wide session revocation (e.g. password reset/change)
    if (userEpochRevocation) {
      const meta =
        userEpochRevocation.metadata &&
        typeof userEpochRevocation.metadata === "object"
          ? (userEpochRevocation.metadata as Record<string, unknown>)
          : null;
      const revokedBefore =
        meta && typeof meta.revokedBefore === "number"
          ? meta.revokedBefore
          : userEpochRevocation.createdAt.getTime();
      const exceptJti =
        meta && typeof meta.exceptJti === "string" ? meta.exceptJti : undefined;

      if (
        verified.issuedAt <= revokedBefore &&
        (!exceptJti || verified.jti !== exceptJti)
      ) {
        return null;
      }
    }

    return {
      ...verified,
      email: dbUser.email,
      role: dbUser.role as SessionRole,
      name: dbUser.name,
      candidateId: dbUser.candidateId || undefined,
      institution: dbUser.institution || undefined,
      mustChangePassword: Boolean(dbUser.mustChangePassword),
    };
  } catch {
    return null;
  }
}

/**
 * Full server-side authentication for a raw session token string:
 * cryptographic verification + expiry + DB user verification + revocation check.
 */
export async function authenticateSessionToken(
  token: string
): Promise<SessionPayload | null> {
  const verified = await verifySessionToken(token);
  if (!verified) return null;
  return await verifySessionAgainstDatabase(verified, token);
}

/**
 * Reads and verifies the current session from incoming HTTP cookies
 * and authoritative database user state.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  if (isTestSessionOverrideAllowed()) {
    if (currentTestSession !== undefined) {
      return currentTestSession;
    }
    const jarStore = testCookieContext.getStore();
    if (jarStore) {
      if (!jarStore.token) return null;
      return await authenticateSessionToken(jarStore.token);
    }
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await authenticateSessionToken(token);
  } catch {
    return null;
  }
});

/**
 * Enforces an authenticated, active user who has completed any mandatory password change.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: Active authentication session required.");
  }
  if (session.mustChangePassword) {
    throw new Error(
      "Password change required: You must change your temporary password before accessing platform functionality."
    );
  }
  return session;
}

/**
 * Enforces an authenticated session with one of the specified roles.
 * Also blocks access if the user has not changed their initial temporary password.
 */
export async function requireRole(
  allowedRoles: SessionRole[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.mustChangePassword) {
    throw new Error(
      "Password change required: You must change your temporary password before accessing platform functionality."
    );
  }
  if (!allowedRoles.includes(session.role)) {
    throw new Error(
      `Forbidden: Role ${session.role} is not authorized for this operation. Requires one of: ${allowedRoles.join(", ")}.`
    );
  }
  return session;
}

/**
 * Sets the signed session cookie in the HTTP response.
 */
export async function setSessionCookie(
  token: string,
  maxAgeSeconds: number = SESSION_DURATION_SECONDS
): Promise<void> {
  if (isTestSessionOverrideAllowed()) {
    const jarStore = testCookieContext.getStore();
    if (jarStore) {
      jarStore.token = token;
    }
  }

  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
      expires: new Date(Date.now() + maxAgeSeconds * 1000),
    });
  } catch {
    // Standalone runner / test context fallback when cookies() is called outside request scope
  }
}

/**
 * Clears the session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  if (isTestSessionOverrideAllowed()) {
    const jarStore = testCookieContext.getStore();
    if (jarStore) {
      jarStore.token = null;
    }
  }

  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Standalone runner / test context fallback
  }
}
