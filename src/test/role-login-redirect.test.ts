import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/credentials";
import { runWithTestCookieJar, setTestSession } from "@/lib/auth";
import {
  createSessionToken,
  getRoleDestination,
  isRouteAllowedForRole,
  resolvePostLoginRedirect,
  SESSION_COOKIE_NAME,
} from "@/lib/session-token";
import { loginAction } from "@/app/actions/auth-actions";
import { middleware } from "@/middleware";

const env = process.env as Record<string, string | undefined>;
const TEST_SESSION_SECRET =
  env.SESSION_SECRET && env.SESSION_SECRET.length >= 32
    ? env.SESSION_SECRET
    : "role_redirect_test_secret_min_32_characters_long";

function buildRequest(urlPath: string, sessionToken?: string): NextRequest {
  const headers = new Headers();
  if (sessionToken) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${sessionToken}`);
  }
  return new NextRequest(new URL(urlPath, "http://localhost:3000"), { headers });
}

describe("Role-Based Login Redirects & Protected Routes", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const adminId = crypto.randomUUID();
  const evaluatorId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const tempAdminId = crypto.randomUUID();

  const adminEmail = `redir.admin.${suffix}@edge-test.internal`;
  const evaluatorEmail = `redir.eval.${suffix}@edge-test.internal`;
  const participantEmail = `redir.part.${suffix}@edge-test.internal`;
  const tempAdminEmail = `redir.tempadmin.${suffix}@edge-test.internal`;

  const password = "RoleRedirect#Pass!2026";
  const createdUserIds = [adminId, evaluatorId, participantId, tempAdminId];
  let previousSessionSecret: string | undefined;

  before(async () => {
    previousSessionSecret = env.SESSION_SECRET;
    env.SESSION_SECRET = TEST_SESSION_SECRET;

    const creds = hashPassword(password);
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          email: adminEmail,
          name: "Redirect Test Admin",
          role: UserRole.ADMIN,
          passwordHash: creds.hash,
          passwordSalt: creds.salt,
          mustChangePassword: false,
          isActive: true,
        },
        {
          id: evaluatorId,
          email: evaluatorEmail,
          name: "Redirect Test Evaluator",
          role: UserRole.EVALUATOR,
          passwordHash: creds.hash,
          passwordSalt: creds.salt,
          mustChangePassword: false,
          isActive: true,
        },
        {
          id: participantId,
          email: participantEmail,
          name: "Redirect Test Participant",
          role: UserRole.PARTICIPANT,
          candidateId: `REDIR-CAND-${suffix}`,
          passwordHash: creds.hash,
          passwordSalt: creds.salt,
          mustChangePassword: false,
          isActive: true,
        },
        {
          id: tempAdminId,
          email: tempAdminEmail,
          name: "Redirect Temp Admin",
          role: UserRole.ADMIN,
          passwordHash: creds.hash,
          passwordSalt: creds.salt,
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
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    env.SESSION_SECRET = previousSessionSecret;
  });

  describe("1. Post-Login Redirect Sanitization & Role Portal Boundaries", () => {
    it("Rejects cross-role, auth-loop, and open-redirect targets and falls back to role home", () => {
      assert.equal(getRoleDestination("ADMIN"), "/admin");
      assert.equal(getRoleDestination("EVALUATOR"), "/evaluator");
      assert.equal(getRoleDestination("PARTICIPANT"), "/dashboard");

      // ADMIN must never be redirected to PARTICIPANT routes or unapproved /evaluator
      assert.equal(resolvePostLoginRedirect("ADMIN", "/dashboard"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/dashboard/contests"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/assessment/c1/p1/t1"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/evaluator"), "/admin");

      // Same-role deep links are preserved when authorized
      assert.equal(resolvePostLoginRedirect("ADMIN", "/admin/contests"), "/admin/contests");
      assert.equal(
        resolvePostLoginRedirect("ADMIN", "/evaluator/monitoring?adminAudit=true"),
        "/evaluator/monitoring?adminAudit=true"
      );

      // EVALUATOR and PARTICIPANT cannot be bounced into other portals
      assert.equal(resolvePostLoginRedirect("EVALUATOR", "/dashboard"), "/evaluator");
      assert.equal(resolvePostLoginRedirect("EVALUATOR", "/admin"), "/evaluator");
      assert.equal(
        resolvePostLoginRedirect("EVALUATOR", "/evaluator/monitoring"),
        "/evaluator/monitoring"
      );
      assert.equal(resolvePostLoginRedirect("PARTICIPANT", "/admin"), "/dashboard");
      assert.equal(resolvePostLoginRedirect("PARTICIPANT", "/evaluator"), "/dashboard");
      assert.equal(
        resolvePostLoginRedirect("PARTICIPANT", "/dashboard/contests/123"),
        "/dashboard/contests/123"
      );

      // Open redirect & loop protections
      assert.equal(resolvePostLoginRedirect("ADMIN", "https://evil.example/admin"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "//evil.example/admin"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/\\evil.example"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/unauthorized"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/login"), "/admin");
      assert.equal(resolvePostLoginRedirect("ADMIN", "/admin/contests", true), "/change-password");

      assert.equal(isRouteAllowedForRole("ADMIN", "/admin"), true);
      assert.equal(isRouteAllowedForRole("ADMIN", "/dashboard"), false);
    });
  });

  describe("2. loginAction Database Role Destination & Repro Flow", () => {
    it("Routes ADMIN, EVALUATOR, and PARTICIPANT to their own dashboards cleanly", async () => {
      await runWithTestCookieJar(async () => {
        const adminRes = await loginAction(adminEmail, password);
        assert.equal(adminRes.success, true);
        assert.equal(adminRes.role, "ADMIN");
        assert.equal(adminRes.redirectTo, "/admin");
      });

      await runWithTestCookieJar(async () => {
        const evalRes = await loginAction(evaluatorEmail, password);
        assert.equal(evalRes.success, true);
        assert.equal(evalRes.role, "EVALUATOR");
        assert.equal(evalRes.redirectTo, "/evaluator");
      });

      await runWithTestCookieJar(async () => {
        const partRes = await loginAction(participantEmail, password);
        assert.equal(partRes.success, true);
        assert.equal(partRes.role, "PARTICIPANT");
        assert.equal(partRes.redirectTo, "/dashboard");
      });
    });

    it("Fixes stale /login?redirect=/dashboard redirect when logging in as ADMIN", async () => {
      // Step 1: Unauthenticated visit to /dashboard produces /login?redirect=%2Fdashboard
      const anonDashboardRes = await middleware(buildRequest("/dashboard"));
      assert.equal(anonDashboardRes.status, 307);
      const loginLocation = anonDashboardRes.headers.get("location");
      assert.ok(loginLocation);
      const loginUrl = new URL(loginLocation);
      assert.equal(loginUrl.pathname, "/login");
      const capturedRedirect = loginUrl.searchParams.get("redirect");
      assert.equal(capturedRedirect, "/dashboard");

      // Step 2: ADMIN signs in while carrying redirect=/dashboard -> must go to /admin, NOT /dashboard
      await runWithTestCookieJar(async () => {
        const adminLogin = await loginAction(adminEmail, password, capturedRedirect || undefined);
        assert.equal(adminLogin.success, true);
        assert.equal(adminLogin.role, "ADMIN");
        assert.equal(adminLogin.redirectTo, "/admin");
        assert.equal(
          resolvePostLoginRedirect(adminLogin.role!, capturedRedirect, adminLogin.mustChangePassword),
          "/admin"
        );
      });
    });

    it("Routes ADMIN with mustChangePassword=true to /change-password even with redirect param", async () => {
      await runWithTestCookieJar(async () => {
        const res = await loginAction(tempAdminEmail, password, "/admin/contests");
        assert.equal(res.success, true);
        assert.equal(res.mustChangePassword, true);
        assert.equal(res.redirectTo, "/change-password");
      });
    });
  });

  describe("3. Middleware Role-Based Protected Route Enforcement", () => {
    it("Enforces portal isolation without blocking authorized role dashboards", async () => {
      const adminToken = await createSessionToken({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Admin",
      });
      const evaluatorToken = await createSessionToken({
        userId: evaluatorId,
        email: evaluatorEmail,
        role: "EVALUATOR",
        name: "Evaluator",
      });
      const participantToken = await createSessionToken({
        userId: participantId,
        email: participantEmail,
        role: "PARTICIPANT",
        name: "Participant",
      });

      // Authenticated /login with stale ?redirect=/dashboard resolves safely for ADMIN -> /admin
      const adminAtLogin = await middleware(buildRequest("/login?redirect=%2Fdashboard", adminToken));
      assert.equal(adminAtLogin.status, 307);
      assert.equal(new URL(adminAtLogin.headers.get("location")!).pathname, "/admin");

      // Root '/' redirects each role to its canonical portal
      const adminRoot = await middleware(buildRequest("/", adminToken));
      assert.equal(new URL(adminRoot.headers.get("location")!).pathname, "/admin");

      const evalRoot = await middleware(buildRequest("/", evaluatorToken));
      assert.equal(new URL(evalRoot.headers.get("location")!).pathname, "/evaluator");

      const partRoot = await middleware(buildRequest("/", participantToken));
      assert.equal(new URL(partRoot.headers.get("location")!).pathname, "/dashboard");

      // Each role can access its own protected portal
      assert.equal((await middleware(buildRequest("/admin", adminToken))).status, 200);
      assert.equal((await middleware(buildRequest("/evaluator", evaluatorToken))).status, 200);
      assert.equal((await middleware(buildRequest("/dashboard", participantToken))).status, 200);

      // Direct cross-role access still redirects strictly to /unauthorized
      const adminAtDashboard = await middleware(buildRequest("/dashboard", adminToken));
      assert.equal(adminAtDashboard.status, 307);
      const unauthAdmin = new URL(adminAtDashboard.headers.get("location")!);
      assert.equal(unauthAdmin.pathname, "/unauthorized");
      assert.equal(unauthAdmin.searchParams.get("required"), "PARTICIPANT");
      assert.equal(unauthAdmin.searchParams.get("current"), "ADMIN");

      const partAtAdmin = await middleware(buildRequest("/admin", participantToken));
      assert.equal(partAtAdmin.status, 307);
      const unauthPart = new URL(partAtAdmin.headers.get("location")!);
      assert.equal(unauthPart.pathname, "/unauthorized");
      assert.equal(unauthPart.searchParams.get("required"), "ADMIN");
      assert.equal(unauthPart.searchParams.get("current"), "PARTICIPANT");

      const evalAtAdmin = await middleware(buildRequest("/admin", evaluatorToken));
      assert.equal(evalAtAdmin.status, 307);
      const unauthEval = new URL(evalAtAdmin.headers.get("location")!);
      assert.equal(unauthEval.pathname, "/unauthorized");
      assert.equal(unauthEval.searchParams.get("required"), "ADMIN");
      assert.equal(unauthEval.searchParams.get("current"), "EVALUATOR");
    });
  });
});

