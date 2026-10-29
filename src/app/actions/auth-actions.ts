"use server";

import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  clearSessionCookie,
  setSessionCookie,
  getSession,
  requireSession,
  getRoleDestination,
  type SessionPayload,
} from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getUserCredentials,
  verifyPassword,
  hashPassword,
  storeUserCredentials,
  validatePasswordStrength,
} from "@/lib/credentials";
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
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
  email: string,
  password?: string
): Promise<LoginResult> {
  try {
    if (!email || !email.trim()) {
      return { success: false, error: "Email address is required." };
    }

    if (!password || !password.trim()) {
      return { success: false, error: "Password is required." };
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Sliding window login rate limit check
    const rateCheck = checkLoginRateLimit(trimmedEmail);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many failed login attempts. Please try again in ${rateCheck.retryAfterSeconds || 60} seconds.`,
      };
    }

    // 2. Query authorized account strictly by normalized email
    const user = await prisma.user.findUnique({
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

    // Reject unknown email or deactivated account with generic message
    if (!user || user.isActive === false) {
      recordFailedLoginAttempt(trimmedEmail);
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
      recordFailedLoginAttempt(trimmedEmail);
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    const isPasswordValid = verifyPassword(password, storedHash, storedSalt);
    if (!isPasswordValid) {
      recordFailedLoginAttempt(trimmedEmail);
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    // 4. Authentication succeeded — reset rate limiter
    resetLoginAttempts(trimmedEmail);

    const role = user.role as "ADMIN" | "EVALUATOR" | "PARTICIPANT";

    // 5. Invalidate any existing session (prevent fixation) and issue fresh HMAC token
    await clearSessionCookie();

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role,
      name: user.name,
      candidateId: user.candidateId || undefined,
      institution: user.institution || undefined,
      mustChangePassword,
    });

    await setSessionCookie(token);

    // If first-login password change is required, redirect to /change-password
    const redirectTo = mustChangePassword
      ? "/change-password"
      : getRoleDestination(role);

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
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ChangePasswordResult> {
  try {
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

    if (!newPassword) {
      return { success: false, error: "New password is required." };
    }

    if (newPassword !== confirmPassword) {
      return { success: false, error: "New passwords do not match." };
    }

    if (newPassword === currentPassword) {
      return {
        success: false,
        error: "New password must be different from current password.",
      };
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.isValid) {
      return {
        success: false,
        error: strengthCheck.error || "Password does not meet requirements.",
      };
    }

    // Verify current password against stored credentials
    const creds = await getUserCredentials(session.userId);
    if (!creds || !verifyPassword(currentPassword, creds.hash, creds.salt)) {
      return {
        success: false,
        error: "Current password is incorrect.",
      };
    }

    // Hash new password with fresh cryptographic salt
    const { hash, salt } = hashPassword(newPassword);
    await storeUserCredentials(session.userId, hash, salt, false);

    // Refresh session with mustChangePassword = false
    await clearSessionCookie();
    const refreshedToken = await createSessionToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
      candidateId: session.candidateId,
      institution: session.institution,
      mustChangePassword: false,
    });
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
    await clearSessionCookie();
    try {
      revalidatePath("/", "layout");
    } catch {
      // Runner environment fallback
    }
    return { success: true, redirectTo: "/login" };
  } catch (error) {
    console.error("Logout error:", error);
    return { success: false, redirectTo: "/login" };
  }
}

export async function getCurrentUserSession(): Promise<SessionPayload | null> {
  return await getSession();
}

