/**
 * EDGE-Arena / ACI Career EDGE Assess — Administrative Account Provisioning Script
 *
 * Securely provisions the initial platform administrator:
 * - Email: admin@gmail.com (or via ADMIN_EMAIL env var)
 * - Initial Password: admin123 (or via ADMIN_INITIAL_PASSWORD env var)
 * - Role: ADMIN
 * - Enforces mustChangePassword: true on first login
 * - Idempotent: Does not overwrite or reset an already provisioned administrator
 * - Uses Scrypt cryptographic hashing with unique salt
 */

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return {
    hash: derivedKey.toString("hex"),
    salt,
  };
}

export async function provisionAdminAccount(options?: {
  email?: string;
  password?: string;
  name?: string;
}) {
  const email = (options?.email || process.env.ADMIN_EMAIL || "admin@gmail.com").trim().toLowerCase();
  const password = options?.password || process.env.ADMIN_INITIAL_PASSWORD || "admin123";
  const name = options?.name || "System Administrator";

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.role === "ADMIN" && existing.passwordHash) {
        console.log(`[Provision] Administrator account already provisioned (${existing.email}). No changes made.`);
        return { created: false, user: existing };
      }

      // If user exists without password or not ADMIN, update atomically
      const { hash, salt } = hashPassword(password);
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: "ADMIN",
          passwordHash: hash,
          passwordSalt: salt,
          mustChangePassword: true,
          isActive: true,
        },
      });
      console.log(`[Provision] Existing account upgraded to ADMIN with initial password change required (${updated.email}).`);
      return { created: true, user: updated };
    }

    // Create new admin account
    const { hash, salt } = hashPassword(password);
    const created = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        email,
        role: "ADMIN",
        passwordHash: hash,
        passwordSalt: salt,
        mustChangePassword: true,
        isActive: true,
      },
    });

    console.log(`[Provision] Initial Administrator created successfully (${created.email}). Forced password change on first login enabled.`);
    return { created: true, user: created };
  } catch (error) {
    console.error("[Provision] Error provisioning administrator:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Allow direct execution via CLI
if (require.main === module || process.argv[1]?.includes("provision-admin")) {
  provisionAdminAccount()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
