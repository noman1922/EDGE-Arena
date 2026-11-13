"use server";

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  clearSessionCookie,
  setSessionCookie,
  getSession,
  getRawSessionToken,
  verifySessionToken,
  revokeSessionToken,
  revokeUserSessionsWithVersion,
  computeCredentialVersion,
  detectSessionVersionColumnSupport,
  isTestSessionOverrideAllowed,
  setTestSession,
  getRoleDestination,
  type SessionPayload,
} from "@/lib/auth";
import { resolvePostLoginRedirect } from "@/lib/session-token";
import { revalidatePath } from "next/cache";
import {
  getUserCredentials,
  verifyPasswordAsync,
  hashPassword,
  storeUserCredentials,
  validatePasswordStrength,
} from "@/lib/credentials";
import {
  checkLoginRateLimitAsync,
  recordFailedLoginAttemptAsync,
  resetLoginAttemptsAsync,
} from "@/lib/rate-limiter";
import { logSystemError } from "@/lib/error-logger";

export interface LoginResult {
  success: boolean;
  role?: "ADMIN" | "EVALUATOR" | "PARTICIPANT";
  redirectTo?: string;
  mustChangePassword?: boolean;
  error?: string;
  user?: {
    name: string;
    email: string;
    role: string;
  };
}

export interface ChangePasswordResult {
  success: boolean;
  redirectTo?: string;
  error?: string;
}

export async function loginAction(
  emailOrFormData?: FormData | string,
  password?: string,
  requestedRedirect?: string
): Promise<LoginResult> {
  try {
    let email = "";
    let plainPassword = "";
    let redirectTarget = "";

    if (
      typeof emailOrFormData === "object" &&
      emailOrFormData !== null &&
      "get" in emailOrFormData
    ) {
      email = (emailOrFormData.get("email") as string) || "";
      plainPassword = (emailOrFormData.get("password") as string) || "";
      redirectTarget = (emailOrFormData.get("redirectTo") as string) || "";
    } else {
      email = typeof emailOrFormData === "string" ? emailOrFormData : "";
      plainPassword = password || "";
      redirectTarget = requestedRedirect || "";
    }

    if (!email || !email.trim()) {
      return { success: false, error: "Email address is required." };
    }

    if (!plainPassword || !plainPassword.trim()) {
      return { success: false, error: "Password is required." };
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Sliding window login rate limit check (Redis-backed when configured, local fallback)
    const rateCheck = await checkLoginRateLimitAsync(trimmedEmail);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many failed login attempts. Please try again in ${rateCheck.retryAfterSeconds || 60} seconds.`,
      };
    }

    // 2. Query authorized account strictly by normalized email with schema backward compatibility
    const hasSessionVersion = await detectSessionVersionColumnSupport();

    let user = null;
    if (hasSessionVersion) {
      try {
        user = await prisma.user.findUnique({
          where: { email: trimmedEmail },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            candidateId: true,
            institution: true,
            passwordHash: true,
            passwordSalt: true,
            mustChangePassword: true,
            isActive: true,
            sessionVersion: true,
          },
        });
      } catch (err: unknown) {
        const errStr = String(err).toLowerCase();
        if (errStr.includes("sessionversion") || errStr.includes("42703") || errStr.includes("column")) {
          user = await prisma.user.findUnique({
            where: { email: trimmedEmail },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              candidateId: true,
              institution: true,
              passwordHash: true,
              passwordSalt: true,
              mustChangePassword: true,
              isActive: true,
            },
          });
        } else {
          throw err;
        }
      }
    } else {
      user = await prisma.user.findUnique({
        where: { email: trimmedEmail },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          candidateId: true,
          institution: true,
          passwordHash: true,
          passwordSalt: true,
          mustChangePassword: true,
          isActive: true,
        },
      });
    }

    // Reject unknown email or deactivated account with generic message
    if (!user || user.isActive === false) {
      await recordFailedLoginAttemptAsync(trimmedEmail);
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    // 3. Verify cryptographic password hash
    let storedHash = user.passwordHash;
    let storedSalt = user.passwordSalt;
    let mustChangePassword = Boolean(user.mustChangePassword);

    if (!storedHash || !storedSalt) {
      // Fallback check to legacy credentials vault if unmigrated
      const legacyCreds = await getUserCredentials(user.id);
      if (legacyCreds) {
        storedHash = legacyCreds.hash;
        storedSalt = legacyCreds.salt;
        mustChangePassword = legacyCreds.mustChangePassword;
      }
    }

    if (!storedHash || !storedSalt) {
      await recordFailedLoginAttemptAsync(trimmedEmail);
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    const isPasswordValid = await verifyPasswordAsync(plainPassword, storedHash, storedSalt);
    if (!isPasswordValid) {
      await recordFailedLoginAttemptAsync(trimmedEmail);
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    // 4. Authentication succeeded — reset rate limiter
    await resetLoginAttemptsAsync(trimmedEmail);

    const role = user.role as "ADMIN" | "EVALUATOR" | "PARTICIPANT";

    // 5. Invalidate any existing session (prevent fixation) and issue fresh HMAC token
    const existingRawToken = await getRawSessionToken();
    if (existingRawToken) {
      const existingVerified = await verifySessionToken(existingRawToken);
      if (existingVerified) {
        await revokeSessionToken(
          existingRawToken,
          existingVerified,
          "SESSION_ROTATED_ON_LOGIN",
          existingVerified.userId
        ).catch(() => {});
      }
    }
    await clearSessionCookie();

    const credVersion =
      user.passwordHash && user.passwordSalt
        ? computeCredentialVersion(user.passwordHash, user.passwordSalt)
        : undefined;

    const sessionVersion =
      hasSessionVersion && "sessionVersion" in user && typeof user.sessionVersion === "number"
        ? user.sessionVersion
        : undefined;

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role,
      name: user.name,
      candidateId: user.candidateId || undefined,
      institution: user.institution || undefined,
      mustChangePassword,
      ...(sessionVersion !== undefined ? { sv: sessionVersion } : {}),
      ...(credVersion ? { credVersion } : {}),
    });

    await setSessionCookie(token);

    // Resolve post-login destination strictly within the authenticated user's authorized portal
    const redirectTo = resolvePostLoginRedirect(
      role,
      redirectTarget,
      mustChangePassword
    );

    try {
      revalidatePath("/", "layout");
    } catch {
      // Runner environment fallback
    }

    return {
      success: true,
      role,
      redirectTo,
      mustChangePassword,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    const sanitized = await logSystemError({
      route: "/login",
      operation: "loginAction",
      category: "AUTH",
      error,
      httpStatus: 500,
    });
    return {
      success: false,
      error: sanitized.error,
    };
  }
}

export async function changePasswordAction(
  currentPasswordOrFormData: FormData | string,
  newPassword?: string,
  confirmPassword?: string
): Promise<ChangePasswordResult> {
  try {
    let currentPassword = "";
    let targetNewPassword = "";
    let targetConfirmPassword = "";

    if (
      typeof currentPasswordOrFormData === "object" &&
      currentPasswordOrFormData !== null &&
      "get" in currentPasswordOrFormData
    ) {
      currentPassword = (currentPasswordOrFormData.get("currentPassword") as string) || "";
      targetNewPassword = (currentPasswordOrFormData.get("newPassword") as string) || "";
      targetConfirmPassword = (currentPasswordOrFormData.get("confirmPassword") as string) || "";
    } else {
      currentPassword = typeof currentPasswordOrFormData === "string" ? currentPasswordOrFormData : "";
      targetNewPassword = newPassword || "";
      targetConfirmPassword = confirmPassword || "";
    }

    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: "Active session required. Please log in first.",
      };
    }

    if (!currentPassword) {
      return { success: false, error: "Current password is required." };
    }

    if (!targetNewPassword) {
      return { success: false, error: "New password is required." };
    }

    if (targetNewPassword !== targetConfirmPassword) {
      return { success: false, error: "New passwords do not match." };
    }

    if (targetNewPassword === currentPassword) {
      return {
        success: false,
        error: "New password must be different from current password.",
      };
    }

    const strengthCheck = validatePasswordStrength(targetNewPassword);
    if (!strengthCheck.isValid) {
      return {
        success: false,
        error: strengthCheck.error || "Password does not meet requirements.",
      };
    }

    // Verify current password against stored credentials
    const creds = await getUserCredentials(session.userId);
    if (!creds || !creds.isActive || !(await verifyPasswordAsync(currentPassword, creds.hash, creds.salt))) {
      return {
        success: false,
        error: "Current password is incorrect.",
      };
    }

    // Hash new password with fresh cryptographic salt
    const { hash, salt } = hashPassword(targetNewPassword);
    await storeUserCredentials(session.userId, hash, salt, false);

    // Revoke all prior sessions by advancing sessionVersion BEFORE minting the fresh session token
    const newJti = crypto.randomUUID();
    const { sessionVersion: nextSessionVersion } = await revokeUserSessionsWithVersion(
      session.userId,
      "PASSWORD_CHANGED",
      newJti,
      session.userId
    );

    const refreshedToken = await createSessionToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
      candidateId: session.candidateId,
      institution: session.institution,
      mustChangePassword: false,
      jti: newJti,
      sv: nextSessionVersion,
      credVersion: computeCredentialVersion(hash, salt),
    });

    await clearSessionCookie();
    await setSessionCookie(refreshedToken);

    try {
      revalidatePath("/", "layout");
    } catch {
      // Runner fallback
    }

    return {
      success: true,
      redirectTo: getRoleDestination(session.role),
    };
  } catch (error) {
    const sanitized = await logSystemError({
      route: "/change-password",
      operation: "changePasswordAction",
      category: "AUTH",
      error,
      httpStatus: 500,
    });
    return {
      success: false,
      error: sanitized.error,
    };
  }
}

export async function logoutAction(): Promise<{ success: boolean; redirectTo: string }> {
  try {
    const rawToken = await getRawSessionToken();
    if (rawToken) {
      const verified = await verifySessionToken(rawToken);
      await revokeSessionToken(
        rawToken,
        verified,
        "LOGOUT",
        verified?.userId ?? null
      );
    } else if (isTestSessionOverrideAllowed()) {
      const testSession = await getSession();
      if (testSession) {
        if (testSession.jti) {
          await revokeSessionToken("", testSession, "LOGOUT", testSession.userId);
        }
        setTestSession(null);
      }
    }

    await clearSessionCookie();
    try {
      revalidatePath("/", "layout");
    } catch {
      // Runner environment fallback
    }
    return { success: true, redirectTo: "/login" };
  } catch (error) {
    console.error("Logout error:", error);
    try {
      await clearSessionCookie();
    } catch {
      // Ignore cookie cleanup errors
    }
    return { success: false, redirectTo: "/login" };
  }
}

export async function getCurrentUserSession(): Promise<SessionPayload | null> {
  return await getSession();
}

