/**
 * ACI Career EDGE Assess / EDGE-Arena — Secure Credentials & Authentication Vault
 * 
 * Cryptographic security policies:
 * - Passwords are never stored in plaintext
 * - Individual 16-byte cryptographic salt per user
 * - Scrypt key derivation (N=16384, r=8, p=1, 64-byte key)
 * - Timing-safe password verification
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export interface StoredCredentials {
  passwordHash: string;
  hash?: string;
  salt: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
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
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(storedHash, "hex");
    return crypto.timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Stores or updates hashed user credentials in the database vault (via AuditLog targetType USER_CREDENTIALS).
 */
export async function storeUserCredentials(
  userId: string,
  passwordHash: string,
  salt: string,
  mustChangePassword = false
): Promise<void> {
  const now = new Date().toISOString();
  
  // Find existing credential log
  const existing = await prisma.auditLog.findFirst({
    where: {
      targetType: "USER_CREDENTIALS",
      targetId: userId,
    },
  });

  const metadata = {
    passwordHash,
    salt,
    mustChangePassword,
    updatedAt: now,
  };

  if (existing) {
    await prisma.auditLog.update({
      where: { id: existing.id },
      data: {
        metadata,
      },
    });
  } else {
    await prisma.auditLog.create({
      data: {
        action: "PROVISION_CREDENTIALS",
        targetType: "USER_CREDENTIALS",
        targetId: userId,
        metadata: {
          ...metadata,
          createdAt: now,
        },
      },
    });
  }
}

/**
 * Retrieves stored user credentials from the database vault.
 */
export async function getUserCredentials(userId: string): Promise<StoredCredentials | null> {
  const record = await prisma.auditLog.findFirst({
    where: {
      targetType: "USER_CREDENTIALS",
      targetId: userId,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record || !record.metadata || typeof record.metadata !== "object") {
    return null;
  }

  const meta = record.metadata as any;
  if (!meta.passwordHash || !meta.salt) {
    return null;
  }

  return {
    hash: meta.passwordHash,
    passwordHash: meta.passwordHash,
    salt: meta.salt,
    mustChangePassword: Boolean(meta.mustChangePassword),
    createdAt: meta.createdAt || record.createdAt.toISOString(),
    updatedAt: meta.updatedAt || record.createdAt.toISOString(),
  };
}
