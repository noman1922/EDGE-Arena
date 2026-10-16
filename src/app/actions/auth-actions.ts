"use server";

import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  clearSessionCookie,
  setSessionCookie,
  getSession,
  getRoleDestination,
  type SessionPayload,
} from "@/lib/auth";
import { revalidatePath } from "next/cache";

import { getUserCredentials, verifyPassword } from "@/lib/credentials";

export interface LoginResult {
  success: boolean;
  role?: "ADMIN" | "EVALUATOR" | "PARTICIPANT";
  redirectTo?: string;
  error?: string;
  user?: {
    name: string;
    email: string;
    role: string;
  };
}

export async function loginAction(
  email: string,
  password?: string
): Promise<LoginResult> {
  try {
    if (!email || !email.trim()) {
      return { success: false, error: "Email address is required." };
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Authenticate against verified database record
    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return {
        success: false,
        error: `No enrolled user found for "${trimmedEmail}". Please check the email or contact your administrator.`,
      };
    }

    // 2. Check credentials vault if provisioned
    const storedCreds = await getUserCredentials(user.id);
    if (storedCreds) {
      if (!password || !verifyPassword(password, storedCreds.passwordHash, storedCreds.salt)) {
        return {
          success: false,
          error: "Invalid password. Please check your credentials or contact administrator.",
        };
      }
    }

    // 3. Read canonical database role
    const role = user.role as "ADMIN" | "EVALUATOR" | "PARTICIPANT";

    // 3. Issue cryptographically signed session token
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role,
      name: user.name,
      candidateId: user.candidateId || undefined,
      institution: user.institution || undefined,
    });

    // 4. Set secure HTTP-only cookie
    await setSessionCookie(token);

    // 5. Determine canonical panel destination strictly by server database role
    const redirectTo = getRoleDestination(role);

    try {
      revalidatePath("/", "layout");
    } catch {
      // Runner environment fallback
    }

    return {
      success: true,
      role,
      redirectTo,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    console.error("Login authentication error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed.",
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
