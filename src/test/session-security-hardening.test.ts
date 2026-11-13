import assert from "node:assert/strict";
import crypto from "node:crypto";
import { webcrypto } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/credentials";
import {
  authenticateSessionToken,
  createSessionToken,
  getSession,
  getSessionSecret,
  getTestCookieJarToken,
  MAX_SESSION_LIFETIME_MS,
  requireRole,
  requireSession,
  runWithTestCookieJar,
  SESSION_DURATION_SECONDS,
  setTestSession,
  verifySessionToken,
} from "@/lib/auth";
import {
  changePasswordAction,
  getCurrentUserSession,
  loginAction,
  logoutAction,
} from "@/app/actions/auth-actions";
import { updateParticipantAction } from "@/app/actions/participant-actions";

const env = process.env as Record<string, string | undefined>;
const TEST_SESSION_SECRET =
  env.SESSION_SECRET && env.SESSION_SECRET.length >= 32
    ? env.SESSION_SECRET
    : "a4_test_session_secret_minimum_32_characters_long_key";

async function signRawToken(secret: string, payload: Record<string, unknown>): Promise<string> {
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadBase64)
  );
  return `${payloadBase64}.${Buffer.from(sig).toString("base64url")}`;
}

describe("A4: Session Security Hardening", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const adminId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const tempPasswordUserId = crypto.randomUUID();

  const adminEmail = `a4.admin.${suffix}@edge-test.internal`;
  const participantEmail = `a4.part.${suffix}@edge-test.internal`;
  const tempUserEmail = `a4.temp.${suffix}@edge-test.internal`;

  const adminPass = "AdminPass#A4!2026";
  const partPass = "PartPass#A4!2026";
  const tempInitialPass = "TempInit#A4!2026";
  const tempNewPass = "PermPass#A4!2026";

  const createdUserIds = [adminId, participantId, tempPasswordUserId];
  let previousSessionSecret: string | undefined;

  before(async () => {
    previousSessionSecret = env.SESSION_SECRET;
    env.SESSION_SECRET = TEST_SESSION_SECRET;

    const adminCreds = hashPassword(adminPass);
    const partCreds = hashPassword(partPass);
    const tempCreds = hashPassword(tempInitialPass);

    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          email: adminEmail,
          name: "A4 Test Admin",
          role: UserRole.ADMIN,
          passwordHash: adminCreds.hash,
          passwordSalt: adminCreds.salt,
          mustChangePassword: false,
          isActive: true,
        },
        {
          id: participantId,
          email: participantEmail,
          name: "A4 Test Participant",
          role: UserRole.PARTICIPANT,
          candidateId: `A4-CAND-${suffix}`,
          passwordHash: partCreds.hash,
          passwordSalt: partCreds.salt,
          mustChangePassword: false,
          isActive: true,
        },
        {
          id: tempPasswordUserId,
          email: tempUserEmail,
          name: "A4 Temp Password User",
          role: UserRole.EVALUATOR,
          passwordHash: tempCreds.hash,
          passwordSalt: tempCreds.salt,
          mustChangePassword: true,
          isActive: true,
        },
      ],
    });
  });

  after(async () => {
    setTestSession(undefined);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { targetId: { in: createdUserIds } },
        ],
      },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    }).catch(() => {});

    if (previousSessionSecret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = previousSessionSecret;
  });

  it("1. Guards setTestSession against production, development, and Next.js runtime abuse", async () => {
    const prevNodeEnv = env.NODE_ENV;
    const prevTestCtx = env.NODE_TEST_CONTEXT;
    const prevNextRuntime = env.NEXT_RUNTIME;

    try {
      // Populate in allowed test mode first, then flip env to verify getSession ignores it
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "A4 Test Admin",
        mustChangePassword: false,
      });

      // Production mode must throw on setTestSession and ignore any existing currentTestSession
      env.NODE_ENV = "production";
      assert.equal(await getSession(), null);
      assert.throws(
        () =>
          setTestSession({
            userId: adminId,
            email: adminEmail,
            role: "ADMIN",
            name: "Attacker",
          }),
        /strictly disabled/i
      );

      // Development mode must throw on setTestSession and ignore currentTestSession
      env.NODE_ENV = "development";
      assert.equal(await getSession(), null);
      assert.throws(
        () =>
          setTestSession({
            userId: adminId,
            email: adminEmail,
            role: "ADMIN",
            name: "Attacker",
          }),
        /strictly disabled/i
      );

      // Next.js server/edge runtime must reject test override even if NODE_ENV === "test"
      env.NODE_ENV = "test";
      env.NEXT_RUNTIME = "nodejs";
      assert.equal(await getSession(), null);
      assert.throws(
        () =>
          setTestSession({
            userId: adminId,
            email: adminEmail,
            role: "ADMIN",
            name: "Attacker",
          }),
        /strictly disabled/i
      );

      // Unset NODE_ENV + unset NODE_TEST_CONTEXT must fail closed
      delete env.NEXT_RUNTIME;
      delete env.NODE_ENV;
      delete env.NODE_TEST_CONTEXT;
      assert.throws(
        () =>
          setTestSession({
            userId: adminId,
            email: adminEmail,
            role: "ADMIN",
            name: "Attacker",
          }),
        /strictly disabled/i
      );
    } finally {
      if (prevNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = prevNodeEnv;
      if (prevTestCtx === undefined) delete env.NODE_TEST_CONTEXT;
      else env.NODE_TEST_CONTEXT = prevTestCtx;
      if (prevNextRuntime === undefined) delete env.NEXT_RUNTIME;
      else env.NEXT_RUNTIME = prevNextRuntime;
      setTestSession(undefined);
    }
  });

  it("2. Rejects forged, tampered, malformed, expired, and over-long HMAC session tokens", async () => {
    const secret = getSessionSecret();

    // Default session duration is tightened (< 7 days, capped at 12 hours)
    assert.ok(SESSION_DURATION_SECONDS <= 12 * 3600);
    assert.ok(MAX_SESSION_LIFETIME_MS <= 24 * 3600 * 1000);

    const validToken = await createSessionToken({
      userId: participantId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "A4 Test Participant",
      mustChangePassword: false,
    });
    assert.ok(await verifySessionToken(validToken));
    assert.ok(await authenticateSessionToken(validToken));

    // Wrong signing secret (forged token)
    const forgedWrongSecret = await signRawToken(
      "completely_different_attacker_secret_32chars_min",
      {
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Forged Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600_000,
      }
    );
    assert.equal(await verifySessionToken(forgedWrongSecret), null);
    assert.equal(await authenticateSessionToken(forgedWrongSecret), null);

    // Payload role tampering
    const [payloadB64, sigB64] = validToken.split(".");
    const tampered = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    tampered.role = "ADMIN";
    const tamperedToken = `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sigB64}`;
    assert.equal(await verifySessionToken(tamperedToken), null);

    // Missing numeric expiresAt (previously slipped past `Date.now() > undefined`)
    const missingExpiry = await signRawToken(secret, {
      userId: participantId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "No Expiry",
      issuedAt: Date.now(),
    });
    assert.equal(await verifySessionToken(missingExpiry), null);

    // Expired token
    const expiredToken = await createSessionToken(
      {
        userId: participantId,
        email: participantEmail,
        role: "PARTICIPANT",
        name: "A4 Test Participant",
        mustChangePassword: false,
      },
      -5
    );
    assert.equal(await verifySessionToken(expiredToken), null);
    assert.equal(await authenticateSessionToken(expiredToken), null);

    // Exceeds maximum allowed session lifetime (e.g. old 7-day token rejected on verification)
    const sevenDayToken = await createSessionToken(
      {
        userId: participantId,
        email: participantEmail,
        role: "PARTICIPANT",
        name: "A4 Test Participant",
        mustChangePassword: false,
      },
      7 * 24 * 3600
    );
    assert.equal(await verifySessionToken(sevenDayToken), null);

    // Future-dated issuedAt beyond clock skew
    const futureIssued = await signRawToken(secret, {
      userId: participantId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "Future",
      issuedAt: Date.now() + 10 * 60 * 1000,
      expiresAt: Date.now() + 20 * 60 * 1000,
    });
    assert.equal(await verifySessionToken(futureIssued), null);
  });

  it("3. Rejects deactivated/inactive users even with a valid signed session cookie", async () => {
    await runWithTestCookieJar(async () => {
      const loginRes = await loginAction(participantEmail, partPass);
      assert.equal(loginRes.success, true);

      const activeToken = getTestCookieJarToken();
      assert.ok(activeToken);
      assert.equal((await requireRole(["PARTICIPANT"])).userId, participantId);

      // Deactivate user in DB while cookie remains unchanged
      await prisma.user.update({
        where: { id: participantId },
        data: { isActive: false },
      });

      assert.equal(await getSession(), null);
      assert.equal(await authenticateSessionToken(activeToken), null);
      await assert.rejects(() => requireSession(), /Unauthorized/);
      await assert.rejects(() => requireRole(["PARTICIPANT"]), /Unauthorized/);
    });

    // Restore active state
    await prisma.user.update({
      where: { id: participantId },
      data: { isActive: true },
    });
  });

  it("4. Rejects existing sessions immediately if user role changes in the database", async () => {
    await runWithTestCookieJar(async () => {
      const loginRes = await loginAction(participantEmail, partPass);
      assert.equal(loginRes.success, true);

      const tokenBeforeRoleChange = getTestCookieJarToken();
      assert.ok(tokenBeforeRoleChange);
      assert.equal((await requireRole(["PARTICIPANT"])).role, "PARTICIPANT");

      // Change DB role from PARTICIPANT -> EVALUATOR
      await prisma.user.update({
        where: { id: participantId },
        data: { role: UserRole.EVALUATOR },
      });

      // Stale role cookie must be rejected completely
      assert.equal(await getSession(), null);
      assert.equal(await authenticateSessionToken(tokenBeforeRoleChange), null);
      await assert.rejects(() => requireSession(), /Unauthorized/);
      await assert.rejects(() => requireRole(["EVALUATOR"]), /Unauthorized/);
    });

    // Restore PARTICIPANT role
    await prisma.user.update({
      where: { id: participantId },
      data: { role: UserRole.PARTICIPANT },
    });
  });

  it("5. Enforces mustChangePassword from DB and revokes old sessions on password change and admin reset", async () => {
    let oldTempToken: string | null = null;
    let refreshedTokenAfterChange: string | null = null;

    await runWithTestCookieJar(async () => {
      const loginRes = await loginAction(tempUserEmail, tempInitialPass);
      assert.equal(loginRes.success, true);
      assert.equal(loginRes.mustChangePassword, true);
      assert.equal(loginRes.redirectTo, "/change-password");

      oldTempToken = getTestCookieJarToken();
      assert.ok(oldTempToken);

      // getSession allows /change-password flow identification,
      // while requireSession & requireRole must block platform access
      const session = await getCurrentUserSession();
      assert.equal(session?.userId, tempPasswordUserId);
      assert.equal(session?.mustChangePassword, true);

      await assert.rejects(() => requireSession(), /Password change required/i);
      await assert.rejects(() => requireRole(["EVALUATOR"]), /Password change required/i);

      // Changing password rotates session and revokes old session
      const changeRes = await changePasswordAction(
        tempInitialPass,
        tempNewPass,
        tempNewPass
      );
      assert.equal(changeRes.success, true);
      assert.equal(changeRes.redirectTo, "/evaluator");

      refreshedTokenAfterChange = getTestCookieJarToken();
      assert.ok(refreshedTokenAfterChange);
      assert.notEqual(refreshedTokenAfterChange, oldTempToken);

      const postChangeRole = await requireRole(["EVALUATOR"]);
      assert.equal(postChangeRole.mustChangePassword, false);
    });

    // Old token from before password change must be rejected forever
    assert.ok(oldTempToken);
    assert.equal(await authenticateSessionToken(oldTempToken), null);

    // Refreshed token works UNTIL admin resets password / flags mustChangePassword
    assert.ok(refreshedTokenAfterChange);
    assert.ok(await authenticateSessionToken(refreshedTokenAfterChange));

    // Even if DB mustChangePassword is set true AFTER session issued (e.g. direct flag),
    // live DB verification must reject protected actions immediately
    await prisma.user.update({
      where: { id: participantId },
      data: { mustChangePassword: true },
    });

    await runWithTestCookieJar(async () => {
      const pToken = await createSessionToken({
        userId: participantId,
        email: participantEmail,
        role: "PARTICIPANT",
        name: "A4 Test Participant",
        mustChangePassword: false, // Stale claim in cookie
      });
      await runWithTestCookieJar(async () => {
        const synced = await getSession();
        assert.equal(synced?.mustChangePassword, true);
        await assert.rejects(() => requireSession(), /Password change required/i);
        await assert.rejects(() => requireRole(["PARTICIPANT"]), /Password change required/i);
      }, pToken);
    });

    // Admin password reset via updateParticipantAction must also revoke all prior participant sessions
    let participantTokenBeforeAdminReset: string | null = null;
    await prisma.user.update({
      where: { id: participantId },
      data: { mustChangePassword: false },
    });

    await runWithTestCookieJar(async () => {
      const loginRes = await loginAction(participantEmail, partPass);
      assert.equal(loginRes.success, true);
      participantTokenBeforeAdminReset = getTestCookieJarToken();
      assert.ok(participantTokenBeforeAdminReset);
    });

    // Sign in as active Admin to trigger admin password reset
    await runWithTestCookieJar(async () => {
      const adminLogin = await loginAction(adminEmail, adminPass);
      assert.equal(adminLogin.success, true);

      const updateRes = await updateParticipantAction({
        userId: participantId,
        name: "A4 Test Participant",
        email: participantEmail,
        password: "ResetByAdmin#A4!2026",
      });
      assert.equal(updateRes.success, true);
    });

    assert.ok(participantTokenBeforeAdminReset);
    assert.equal(
      await authenticateSessionToken(participantTokenBeforeAdminReset),
      null,
      "Admin password reset must immediately revoke prior participant sessions"
    );

    // Restore participant password/flags for cleanup cleanly
    const restoredCreds = hashPassword(partPass);
    await prisma.user.update({
      where: { id: participantId },
      data: {
        passwordHash: restoredCreds.hash,
        passwordSalt: restoredCreds.salt,
        mustChangePassword: false,
      },
    });
  });

  it("6. logoutAction clears cookie AND permanently revokes the session token against replay", async () => {
    let stolenToken: string | null = null;

    await runWithTestCookieJar(async () => {
      const loginRes = await loginAction(adminEmail, adminPass);
      assert.equal(loginRes.success, true);

      stolenToken = getTestCookieJarToken();
      assert.ok(stolenToken);
      assert.equal((await requireRole(["ADMIN"])).userId, adminId);

      const logoutRes = await logoutAction();
      assert.equal(logoutRes.success, true);
      assert.equal(logoutRes.redirectTo, "/login");

      // Cookie jar is cleared and current context is unauthenticated
      assert.equal(getTestCookieJarToken(), null);
      assert.equal(await getSession(), null);
      await assert.rejects(() => requireSession(), /Unauthorized/);
    });

    // Replaying the captured cookie token after logout must be rejected by DB revocation check
    assert.ok(stolenToken);
    assert.equal(await authenticateSessionToken(stolenToken), null);

    await runWithTestCookieJar(async () => {
      assert.equal(await getSession(), null);
      await assert.rejects(() => requireSession(), /Unauthorized/);
      await assert.rejects(() => requireRole(["ADMIN"]), /Unauthorized/);
    }, stolenToken);

    const parsedStolen = await verifySessionToken(stolenToken);
    assert.ok(parsedStolen?.jti);
    const revocationLog = await prisma.auditLog.findFirst({
      where: {
        action: "SESSION_REVOKED",
        targetType: "SESSION",
        targetId: parsedStolen.jti,
      },
    });
    assert.ok(revocationLog, "Logout must record server-side SESSION_REVOKED audit entry");
  });
});
