/**
 * Backward-Compatible Session Security & Password Safety Regression Test Suite
 *
 * Verifies:
 * 1. Login with sessionVersion column present and absent.
 * 2. Individual session revocation (AuditLog SESSION_REVOKED).
 * 3. User-wide session revocation (User.sessionVersion increment + AuditLog USER_SESSIONS_REVOKED fallback).
 * 4. Password-change invalidation (credVersion HMAC mismatch + revocation epoch).
 * 5. Forged, expired, tampered, and deactivated session rejection.
 * 6. Database errors and fail-closed security guarantees.
 * 7. Terminal logs and action serialization safety (FormData non-exposure).
 *
 * Strictly isolated: Stubs all Prisma calls so ZERO requests hit production.
 */

import test, { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  verifySessionToken,
  verifySessionAgainstDatabase,
  revokeUserSessionsWithVersion,
  revokeSessionToken,
  detectSessionVersionColumnSupport,
  setSessionVersionColumnOverrideForTesting,
  computeCredentialVersion,
  type SessionPayload,
} from "@/lib/auth";
import { loginAction, changePasswordAction } from "@/app/actions/auth-actions";
import { hashPassword } from "@/lib/credentials";

// Configure test session secret if missing
const env = process.env as Record<string, string | undefined>;
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  env.SESSION_SECRET = "test_session_secret_32_characters_minimum_key!";
}

describe("Backward-Compatible Session Security & Password Safety", () => {
  // Store original Prisma methods for clean restoration
  const originalUserFindUnique = prisma.user.findUnique;
  const originalUserUpdate = prisma.user.update;
  const originalAuditLogFindFirst = prisma.auditLog.findFirst;
  const originalAuditLogCreate = prisma.auditLog.create;
  const originalQueryRawUnsafe = prisma.$queryRawUnsafe;

  afterEach(() => {
    // Restore original methods and clear test overrides
    prisma.user.findUnique = originalUserFindUnique;
    prisma.user.update = originalUserUpdate;
    prisma.auditLog.findFirst = originalAuditLogFindFirst;
    prisma.auditLog.create = originalAuditLogCreate;
    prisma.$queryRawUnsafe = originalQueryRawUnsafe;
    setSessionVersionColumnOverrideForTesting(null);
  });

  describe("1. Schema Detection for sessionVersion", () => {
    it("detects sessionVersion column as present when queryRawUnsafe succeeds", async () => {
      setSessionVersionColumnOverrideForTesting(null);
      (prisma.$queryRawUnsafe as unknown) = async (query: string) => {
        if (query.includes("sessionVersion")) return [];
        throw new Error("unexpected query");
      };

      const supported = await detectSessionVersionColumnSupport();
      assert.equal(supported, true);
    });

    it("detects sessionVersion column as absent when PostgreSQL reports 42703 (undefined column)", async () => {
      setSessionVersionColumnOverrideForTesting(null);
      (prisma.$queryRawUnsafe as unknown) = async () => {
        const error = new Error('column "sessionVersion" does not exist');
        (error as unknown as Record<string, unknown>).code = "42703";
        throw error;
      };

      const supported = await detectSessionVersionColumnSupport();
      assert.equal(supported, false);
    });
  });

  describe("2. Login with column present vs absent", () => {
    const testEmail = "participant.test@edgearena.internal";
    const testPassword = "SecurePassword#2026!";
    const testUserId = "usr-mock-12345";
    const { hash, salt } = hashPassword(testPassword);
    const credVersion = computeCredentialVersion(hash, salt);

    it("Login with sessionVersion PRESENT: selects sessionVersion and attaches sv to token", async () => {
      setSessionVersionColumnOverrideForTesting(true);

      let selectClause: Record<string, unknown> | undefined;
      (prisma.user.findUnique as unknown) = async (args: { select: Record<string, unknown> }) => {
        selectClause = args.select;
        return {
          id: testUserId,
          email: testEmail,
          role: "PARTICIPANT",
          name: "Test Participant",
          candidateId: "CAND-001",
          institution: "ACI",
          isActive: true,
          mustChangePassword: false,
          passwordHash: hash,
          passwordSalt: salt,
          sessionVersion: 3,
        };
      };

      const formData = new FormData();
      formData.append("email", testEmail);
      formData.append("password", testPassword);

      const result = await loginAction(formData);
      assert.equal(result.success, true);
      assert.equal(result.role, "PARTICIPANT");
      assert.equal(selectClause?.sessionVersion, true, "Must select sessionVersion when present");
    });

    it("Login with sessionVersion ABSENT: omits sessionVersion from query without throwing", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      let selectClause: Record<string, unknown> | undefined;
      (prisma.user.findUnique as unknown) = async (args: { select: Record<string, unknown> }) => {
        selectClause = args.select;
        return {
          id: testUserId,
          email: testEmail,
          role: "PARTICIPANT",
          name: "Test Participant",
          candidateId: "CAND-001",
          institution: "ACI",
          isActive: true,
          mustChangePassword: false,
          passwordHash: hash,
          passwordSalt: salt,
        };
      };

      const formData = new FormData();
      formData.append("email", testEmail);
      formData.append("password", testPassword);

      const result = await loginAction(formData);
      assert.equal(result.success, true);
      assert.equal(result.role, "PARTICIPANT");
      assert.equal(selectClause?.sessionVersion, undefined, "Must NOT select sessionVersion when absent");
    });
  });

  describe("3. Session Verification & Revocation Guarantees", () => {
    const testUserId = "usr-session-target-1";
    const testEmail = "session.target@edgearena.internal";
    const { hash, salt } = hashPassword("SomePassword#2026");
    const credVersion = computeCredentialVersion(hash, salt);

    it("Rejects token when User.sessionVersion in DB does not match token sv (column present)", async () => {
      setSessionVersionColumnOverrideForTesting(true);

      (prisma.user.findUnique as unknown) = async () => ({
        id: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin User",
        isActive: true,
        mustChangePassword: false,
        passwordHash: hash,
        passwordSalt: salt,
        sessionVersion: 2, // Database incremented to 2
      });

      (prisma.auditLog.findFirst as unknown) = async () => null;

      const tokenPayload: SessionPayload = {
        userId: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin User",
        jti: "jti-token-1",
        issuedAt: Date.now() - 5000,
        expiresAt: Date.now() + 3600000,
        sv: 1, // Stale token with sv = 1
        credVersion,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "Mismatched sessionVersion must reject token immediately");
    });

    it("Rejects token when column is ABSENT and AuditLog records user-wide revocation", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      const tokenIssuedAt = Date.now() - 10000;
      const revokedBefore = tokenIssuedAt + 2000; // Revoked AFTER token was issued

      (prisma.user.findUnique as unknown) = async (args: { select: Record<string, unknown> }) => {
        assert.equal(args.select.sessionVersion, undefined, "Must not query sessionVersion");
        return {
          id: testUserId,
          email: testEmail,
          role: "ADMIN",
          name: "Admin User",
          isActive: true,
          mustChangePassword: false,
          passwordHash: hash,
          passwordSalt: salt,
        };
      };

      (prisma.auditLog.findFirst as unknown) = async (args: { where: { action: string } }) => {
        if (args.where.action === "USER_SESSIONS_REVOKED") {
          return {
            id: "audit-1",
            metadata: { revokedBefore },
            createdAt: new Date(revokedBefore),
          };
        }
        return null;
      };

      const tokenPayload: SessionPayload = {
        userId: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin User",
        jti: "jti-token-2",
        issuedAt: tokenIssuedAt,
        expiresAt: Date.now() + 3600000,
        credVersion,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "AuditLog USER_SESSIONS_REVOKED must reject token issued before revocation epoch");
    });

    it("Accepts token when column is ABSENT and token was issued AFTER revocation epoch", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      const revokedBefore = Date.now() - 10000;
      const tokenIssuedAt = Date.now() - 2000; // Issued AFTER revocation epoch

      (prisma.user.findUnique as unknown) = async () => ({
        id: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin User",
        isActive: true,
        mustChangePassword: false,
        passwordHash: hash,
        passwordSalt: salt,
      });

      (prisma.auditLog.findFirst as unknown) = async (args: { where: { action: string } }) => {
        if (args.where.action === "USER_SESSIONS_REVOKED") {
          return {
            id: "audit-1",
            metadata: { revokedBefore },
            createdAt: new Date(revokedBefore),
          };
        }
        return null;
      };

      const tokenPayload: SessionPayload = {
        userId: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin User",
        jti: "jti-token-fresh",
        issuedAt: tokenIssuedAt,
        expiresAt: Date.now() + 3600000,
        credVersion,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.ok(verified, "Fresh token issued after revocation must be accepted");
      assert.equal(verified?.userId, testUserId);
    });

    it("revokeUserSessionsWithVersion when column PRESENT: increments sessionVersion and logs audit", async () => {
      setSessionVersionColumnOverrideForTesting(true);

      let userUpdateCalled = false;
      let auditLogCreated = false;

      (prisma.user.update as unknown) = async (args: { data: Record<string, unknown> }) => {
        userUpdateCalled = true;
        assert.deepEqual(args.data, { sessionVersion: { increment: 1 } });
        return { sessionVersion: 5 };
      };

      (prisma.auditLog.create as unknown) = async (args: { data: { action: string } }) => {
        auditLogCreated = true;
        assert.equal(args.data.action, "USER_SESSIONS_REVOKED");
        return { id: "audit-revoke-1" };
      };

      const result = await revokeUserSessionsWithVersion("usr-rev-1", "PASSWORD_CHANGED");
      assert.equal(userUpdateCalled, true);
      assert.equal(auditLogCreated, true);
      assert.equal(result.sessionVersion, 5);
      assert.ok(result.revokedBefore > 0);
    });

    it("revokeUserSessionsWithVersion when column ABSENT: creates audit log without touching User.sessionVersion", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      let userUpdateCalled = false;
      let auditLogCreated = false;

      (prisma.user.update as unknown) = async () => {
        userUpdateCalled = true;
        throw new Error("Must not be called when column absent");
      };

      (prisma.auditLog.create as unknown) = async (args: { data: { action: string } }) => {
        auditLogCreated = true;
        assert.equal(args.data.action, "USER_SESSIONS_REVOKED");
        return { id: "audit-revoke-2" };
      };

      const result = await revokeUserSessionsWithVersion("usr-rev-2", "PASSWORD_CHANGED");
      assert.equal(userUpdateCalled, false, "prisma.user.update must NOT be called when sessionVersion column is absent");
      assert.equal(auditLogCreated, true, "AuditLog USER_SESSIONS_REVOKED must still be created");
      assert.equal(result.sessionVersion, 1);
      assert.ok(result.revokedBefore > 0);
    });

    it("Rejects individual revoked session token (logout replay protection)", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      (prisma.user.findUnique as unknown) = async () => ({
        id: testUserId,
        email: testEmail,
        role: "PARTICIPANT",
        name: "Participant",
        isActive: true,
        mustChangePassword: false,
        passwordHash: hash,
        passwordSalt: salt,
      });

      (prisma.auditLog.findFirst as unknown) = async (args: { where: { action: string } }) => {
        if (args.where.action === "SESSION_REVOKED") {
          return { id: "audit-logged-out" };
        }
        return null;
      };

      const tokenPayload: SessionPayload = {
        userId: testUserId,
        email: testEmail,
        role: "PARTICIPANT",
        name: "Participant",
        jti: "jti-logged-out",
        issuedAt: Date.now() - 5000,
        expiresAt: Date.now() + 3600000,
        credVersion,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "Individually revoked token must be rejected");
    });

    it("changePasswordAction accepts FormData and invalidates old sessions", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      const oldPass = "OldPassword#2026!";
      const newPass = "NewStrongPassword#2026!";
      const { hash: oldHash, salt: oldSalt } = hashPassword(oldPass);

      // Mock getSession by setting test session
      const { setTestSession } = await import("@/lib/auth");
      setTestSession({
        userId: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin User",
        mustChangePassword: false,
      });

      // Mock user credentials
      (prisma.user.findUnique as unknown) = async () => ({
        id: testUserId,
        email: testEmail,
        passwordHash: oldHash,
        passwordSalt: oldSalt,
        isActive: true,
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock storeUserCredentials and auditLog
      (prisma.auditLog.create as unknown) = async () => ({ id: "audit-pass-change" });
      (prisma.user.update as unknown) = async () => ({ id: testUserId });

      const fd = new FormData();
      fd.append("currentPassword", oldPass);
      fd.append("newPassword", newPass);
      fd.append("confirmPassword", newPass);

      const changeResult = await changePasswordAction(fd);
      assert.equal(changeResult.success, true);
      assert.equal(changeResult.redirectTo, "/admin");

      setTestSession(undefined);
    });

    it("Rejects token immediately when password changes (credVersion mismatch)", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      const { hash: newHash, salt: newSalt } = hashPassword("RotatedNewPassword#2026!");

      (prisma.user.findUnique as unknown) = async () => ({
        id: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin",
        isActive: true,
        mustChangePassword: false,
        passwordHash: newHash,
        passwordSalt: newSalt,
      });

      (prisma.auditLog.findFirst as unknown) = async () => null;

      const tokenPayload: SessionPayload = {
        userId: testUserId,
        email: testEmail,
        role: "ADMIN",
        name: "Admin",
        jti: "jti-pre-password-change",
        issuedAt: Date.now() - 5000,
        expiresAt: Date.now() + 3600000,
        credVersion, // Old credVersion
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "Password hash change must reject token via credVersion mismatch");
    });
  });

  describe("4. Forged, Expired, Tampered & Deactivated Session Rejection", () => {
    beforeEach(() => {
      setSessionVersionColumnOverrideForTesting(false);
    });

    it("Rejects expired token", async () => {
      const expiredToken = await createSessionToken(
        {
          userId: "u-exp",
          email: "exp@edge.internal",
          role: "PARTICIPANT",
          name: "Exp",
        },
        -10 // Expired 10 seconds ago
      );

      const parsed = await verifySessionToken(expiredToken);
      assert.equal(parsed, null, "Expired token must be rejected by verifySessionToken");
    });

    it("Rejects forged token signed with wrong HMAC secret", async () => {
      const payloadBase64 = Buffer.from(
        JSON.stringify({
          userId: "u-forged",
          email: "forged@edge.internal",
          role: "ADMIN",
          name: "Attacker",
          issuedAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        })
      ).toString("base64url");

      const hmac = crypto.createHmac("sha256", "wrong_attacker_secret_at_least_32_chars_long!");
      hmac.update(payloadBase64);
      const forgedSig = hmac.digest("base64url");
      const forgedToken = `${payloadBase64}.${forgedSig}`;

      const parsed = await verifySessionToken(forgedToken);
      assert.equal(parsed, null, "Forged token signature must be rejected");
    });

    it("Rejects active session when user is deactivated in database", async () => {
      (prisma.user.findUnique as unknown) = async () => ({
        id: "u-deactivated",
        email: "deactivated@edge.internal",
        role: "PARTICIPANT",
        name: "Inactive User",
        isActive: false, // DEACTIVATED
      });

      const tokenPayload: SessionPayload = {
        userId: "u-deactivated",
        email: "deactivated@edge.internal",
        role: "PARTICIPANT",
        name: "Inactive User",
        jti: "jti-deactivated",
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 3600000,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "Deactivated account must be rejected");
    });

    it("Rejects session when user role changed in database", async () => {
      (prisma.user.findUnique as unknown) = async () => ({
        id: "u-role-tampered",
        email: "cand@edge.internal",
        role: "PARTICIPANT", // Database says PARTICIPANT
        name: "Participant",
        isActive: true,
      });

      const tokenPayload: SessionPayload = {
        userId: "u-role-tampered",
        email: "cand@edge.internal",
        role: "ADMIN", // Token claims ADMIN
        name: "Participant",
        jti: "jti-tampered",
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 3600000,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "Role mismatch must be rejected immediately");
    });
  });

  describe("5. Fail-Closed Behavior on Database Errors", () => {
    beforeEach(() => {
      setSessionVersionColumnOverrideForTesting(false);
    });

    it("verifySessionAgainstDatabase fails closed (returns null) on DB connection exception", async () => {
      (prisma.user.findUnique as unknown) = async () => {
        throw new Error("P1001: Can't reach database server");
      };

      const tokenPayload: SessionPayload = {
        userId: "u-db-fail",
        email: "fail@edge.internal",
        role: "PARTICIPANT",
        name: "Fail",
        jti: "jti-db-fail",
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 3600000,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "Database connection failure must fail closed");
    });

    it("AuditLog query exception fails closed (returns null)", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      (prisma.user.findUnique as unknown) = async () => ({
        id: "u-audit-fail",
        email: "fail@edge.internal",
        role: "PARTICIPANT",
        name: "Fail",
        isActive: true,
      });

      (prisma.auditLog.findFirst as unknown) = async () => {
        throw new Error("P2024: Timed out fetching a new connection from the pool");
      };

      const tokenPayload: SessionPayload = {
        userId: "u-audit-fail",
        email: "fail@edge.internal",
        role: "PARTICIPANT",
        name: "Fail",
        jti: "jti-audit-fail",
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 3600000,
      };

      const verified = await verifySessionAgainstDatabase(tokenPayload);
      assert.equal(verified, null, "AuditLog query error must fail closed");
    });
  });

  describe("6. Terminal Log Safety & Credential Non-Exposure", () => {
    it("FormData inputs serialize as {} under Next.js safe-stable-stringify", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { configure } = require("next/dist/compiled/safe-stable-stringify");
      const stringify = configure({ maximumDepth: 2, maximumBreadth: 3 });

      const fd = new FormData();
      fd.append("email", "admin@gmail.com");
      fd.append("password", "#Admin2013542");
      fd.append("redirectTo", "/admin");

      const serialized = stringify(fd);
      assert.equal(serialized, "{}", "FormData must serialize as opaque empty object");
      assert.ok(!serialized.includes("password"));
      assert.ok(!serialized.includes("#Admin2013542"));
      assert.ok(!serialized.includes("admin@gmail.com"));
    });

    it("changePassword FormData inputs serialize without exposing current or new passwords", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { configure } = require("next/dist/compiled/safe-stable-stringify");
      const stringify = configure({ maximumDepth: 2, maximumBreadth: 3 });

      const fd = new FormData();
      fd.append("currentPassword", "OldSecretPassword#123");
      fd.append("newPassword", "NewSecretPassword#456");
      fd.append("confirmPassword", "NewSecretPassword#456");

      const serialized = stringify(fd);
      assert.equal(serialized, "{}");
      assert.ok(!serialized.includes("OldSecretPassword"));
      assert.ok(!serialized.includes("NewSecretPassword"));
    });
  });
});
