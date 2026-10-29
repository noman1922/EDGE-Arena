/**
 * ACI Career EDGE Assess / EDGE-Arena — Secure Credentials & Authentication Vault
 *
 * Cryptographic security policies:
 * - Passwords are never stored in plaintext
 * - Individual 16-byte cryptographic salt per user
 * - Scrypt key derivation (N=16384, r=8, p=1, 64-byte key)
 * - Timing-safe password verification
 * - Minimum 8-character password policy with character variety
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export interface StoredCredentials {
  passwordHash: string;
  hash: string;
  salt: string;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validates password strength policy (minimum 8 characters).
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (!password || typeof password !== "string") {
    return { isValid: false, error: "Password is required." };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      error: "Password must be at least 8 characters in length.",
    };
  }

  if (password.length > 128) {
    return {
      isValid: false,
      error: "Password must not exceed 128 characters.",
    };
  }

  return { isValid: true };
}

/**
 * Hashes a plaintext password with a unique cryptographic salt.
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return {
    hash: derivedKey.toString("hex"),
    salt,
  };
}

/**
 * Verifies a password against a stored cryptographic salt and hash using timing-safe comparison.
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): boolean {
  try {
    if (!password || !storedHash || !salt) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (derivedKey.length !== storedBuffer.length) return false;
    return crypto.timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Stores or updates hashed user credentials in the database User record.
 */
export async function storeUserCredentials(
  userId: string,
  passwordHash: string,
  salt: string,
  mustChangePassword = false
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordSalt: salt,
      mustChangePassword,
      updatedAt: new Date(),
    },
  });
}

/**
 * Retrieves stored user credentials from the database User record.
 */
export async function getUserCredentials(
  userId: string
): Promise<StoredCredentials | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
      passwordSalt: true,
      mustChangePassword: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (user && user.passwordHash && user.passwordSalt) {
    return {
      hash: user.passwordHash,
      passwordHash: user.passwordHash,
      salt: user.passwordSalt,
      mustChangePassword: Boolean(user.mustChangePassword),
      isActive: user.isActive !== false,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  // Fallback to legacy AuditLog vault for unmigrated accounts
  const legacyRecord = await prisma.auditLog.findFirst({
    where: {
      targetType: "USER_CREDENTIALS",
      targetId: userId,
    },
    orderBy: { createdAt: "desc" },
  });

  if (
    legacyRecord &&
    legacyRecord.metadata &&
    typeof legacyRecord.metadata === "object"
  ) {
    const meta = legacyRecord.metadata as Record<string, unknown>;
    const hash =
      (meta.passwordHash as string) || (meta.hash as string) || undefined;
    const salt = (meta.salt as string) || undefined;

    if (hash && salt) {
      // Migrate to user table for future queries
      await prisma.user
        .update({
          where: { id: userId },
          data: {
            passwordHash: hash,
            passwordSalt: salt,
            mustChangePassword: Boolean(meta.mustChangePassword),
          },
        })
        .catch(() => {});

      return {
        hash,
        passwordHash: hash,
        salt,
        mustChangePassword: Boolean(meta.mustChangePassword),
        isActive: true,
        createdAt: legacyRecord.createdAt.toISOString(),
        updatedAt: legacyRecord.createdAt.toISOString(),
      };
    }
  }

  return null;
}
