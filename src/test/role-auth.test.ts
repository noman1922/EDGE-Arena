import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  createSessionToken,
  verifySessionToken,
  getRoleDestination,
  setTestSession,
  requireRole,
  type SessionPayload,
} from "../lib/auth";
import { loginAction } from "../app/actions/auth-actions";
import {
  createContestAction,
  assignParticipantAction,
} from "../app/actions/contest-actions";
import {
  saveRubricScoreAction,
  publishContestResultsAction,
} from "../app/actions/evaluator-actions";
import {
  saveAnswerDraftAction,
  submitAssessmentAction,
  getParticipantDashboard,
} from "../app/actions/assessment-actions";

describe("Role-Based Authentication, Routing, and Authorization Guard Tests", () => {
  const adminEmail = "admin.demo@example.com";
  const evaluatorEmail = "evaluator.demo@example.com";
  const candidateEmail = "candidate.demo@example.com";

  let createdContestId = "";
  let exclusiveContestId = "";
  let candidateASubmissionId = "";
  let candidateBSubmissionId = "";

  const candidateAEmail = "cand.a.test@example.com";
  const candidateBEmail = "cand.b.test@example.com";

  let candidateAUserId = "";
  let candidateBUserId = "";

  before(async () => {
    // 1. Ensure the 3 demo users exist in the DB
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: adminEmail,
        name: "Demo Admin",
        role: "ADMIN",
      },
    });

    await prisma.user.upsert({
      where: { email: evaluatorEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: evaluatorEmail,
        name: "Demo Evaluator",
        role: "EVALUATOR",
      },
    });

    await prisma.user.upsert({
      where: { email: candidateEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: candidateEmail,
        name: "Demo Candidate",
        role: "PARTICIPANT",
      },
    });

    // 2. Setup candidate A & B for cross-user isolation tests
    const userA = await prisma.user.upsert({
      where: { email: candidateAEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: candidateAEmail,
        name: "Candidate A",
        role: "PARTICIPANT",
      },
    });
    candidateAUserId = userA.id;

    const userB = await prisma.user.upsert({
      where: { email: candidateBEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: candidateBEmail,
        name: "Candidate B",
        role: "PARTICIPANT",
      },
    });
    candidateBUserId = userB.id;

    // 3. Create a test contest using Admin session
    setTestSession({
      userId: "admin-guard-test",
      email: adminEmail,
      role: "ADMIN",
      name: "Admin",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const contest = await createContestAction({
      title: "Guard Verification Contest",
      track: "Track Guard · Security",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });
    createdContestId = contest.contestId!;

    // Assign Candidate A and Candidate B to createdContestId
    await assignParticipantAction(createdContestId, candidateAEmail, "Candidate A");
    await assignParticipantAction(createdContestId, candidateBEmail, "Candidate B");

    // Fetch the task for submission setup
    const phase = await prisma.phase.findFirst({
      where: { contestId: createdContestId },
      include: { tasks: true },
    });
    const task = phase!.tasks[0];

    // Create Candidate A submission
    const subA = await prisma.submission.create({
      data: {
        contestId: createdContestId,
        phaseId: phase!.id,
        taskId: task.id,
        userId: candidateAUserId,
        status: "DRAFT",
      },
    });
    candidateASubmissionId = subA.id;

    // Create Candidate B submission
    const subB = await prisma.submission.create({
      data: {
        contestId: createdContestId,
        phaseId: phase!.id,
        taskId: task.id,
        userId: candidateBUserId,
        status: "DRAFT",
      },
    });
    candidateBSubmissionId = subB.id;

    // Create Exclusive Contest enrolled ONLY by Candidate A
    const excl = await createContestAction({
      title: "Exclusive Candidate A Contest",
      track: "Track Guard · Isolation",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });
    exclusiveContestId = excl.contestId!;
    await assignParticipantAction(exclusiveContestId, candidateAEmail, "Candidate A");
  });

  after(async () => {
    setTestSession(undefined);
    try {
      if (createdContestId) {
        await prisma.contest.deleteMany({ where: { id: createdContestId } });
      }
      if (exclusiveContestId) {
        await prisma.contest.deleteMany({ where: { id: exclusiveContestId } });
      }
      await prisma.user.deleteMany({
        where: { email: { in: [candidateAEmail, candidateBEmail] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe("1. Login Action & Database Role Canonical Redirects", () => {
    it("Redirects ADMIN to /admin based strictly on database role", async () => {
      const res = await loginAction(adminEmail);
      assert.equal(res.success, true);
      assert.equal(res.role, "ADMIN");
      assert.equal(res.redirectTo, "/admin");
      assert.equal(getRoleDestination(res.role!), "/admin");
    });

    it("Redirects EVALUATOR to /evaluator based strictly on database role", async () => {
      const res = await loginAction(evaluatorEmail);
      assert.equal(res.success, true);
      assert.equal(res.role, "EVALUATOR");
      assert.equal(res.redirectTo, "/evaluator");
      assert.equal(getRoleDestination(res.role!), "/evaluator");
    });

    it("Redirects PARTICIPANT to /dashboard based strictly on database role", async () => {
      const res = await loginAction(candidateEmail);
      assert.equal(res.success, true);
      assert.equal(res.role, "PARTICIPANT");
      assert.equal(res.redirectTo, "/dashboard");
      assert.equal(getRoleDestination(res.role!), "/dashboard");
    });

    it("Rejects unknown unenrolled email addresses", async () => {
      const res = await loginAction("unknown.intruder@example.com");
      assert.equal(res.success, false);
      assert.match(res.error!, /No enrolled user found/);
    });

    it("Rejects empty or whitespace login input", async () => {
      const res = await loginAction("   ");
      assert.equal(res.success, false);
      assert.match(res.error!, /Email address is required/);
    });
  });

  describe("2. Cryptographic Session Token Verification & Tamper Resistance", () => {
    it("Valid session token verifies successfully", async () => {
      const token = await createSessionToken({
        userId: "test-user-1",
        email: "test@example.com",
        role: "ADMIN",
        name: "Test User",
      });

      const verified = await verifySessionToken(token);
      assert.ok(verified);
      assert.equal(verified?.email, "test@example.com");
      assert.equal(verified?.role, "ADMIN");
    });

    it("Rejects token with altered payload data (tampered role)", async () => {
      const token = await createSessionToken({
        userId: "test-user-1",
        email: "test@example.com",
        role: "PARTICIPANT",
        name: "Test User",
      });

      const [payloadB64, signature] = token.split(".");
      // Tamper payload to claim ADMIN
      const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      decoded.role = "ADMIN";
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(decoded)).toString("base64url");
      const tamperedToken = `${tamperedPayloadB64}.${signature}`;

      const verified = await verifySessionToken(tamperedToken);
      assert.equal(verified, null, "Tampered session payload must be rejected");
    });

    it("Rejects token with altered HMAC signature", async () => {
      const token = await createSessionToken({
        userId: "test-user-1",
        email: "test@example.com",
        role: "ADMIN",
        name: "Test User",
      });

      const [payloadB64] = token.split(".");
      const forgedToken = `${payloadB64}.fakeSignature12345`;

      const verified = await verifySessionToken(forgedToken);
      assert.equal(verified, null, "Forged signature must be rejected");
    });

    it("Rejects expired session tokens", async () => {
      // Create token that expired 1 second ago (-1 duration)
      const expiredToken = await createSessionToken(
        {
          userId: "test-user-1",
          email: "test@example.com",
          role: "ADMIN",
          name: "Test User",
        },
        -1
      );

      const verified = await verifySessionToken(expiredToken);
      assert.equal(verified, null, "Expired token must be rejected");
    });
  });

  describe("3. Server-Side Role Authorization & Panel Separation", () => {
    it("Rejects unauthenticated call to createContestAction", async () => {
      setTestSession(null);
      const res = await createContestAction({
        title: "Unauthorized Contest",
        track: "Track",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      });
      assert.equal(res.success, false);
      assert.match(res.error!, /Unauthorized/);
    });

    it("Rejects PARTICIPANT call to createContestAction", async () => {
      setTestSession({
        userId: candidateAUserId,
        email: candidateAEmail,
        role: "PARTICIPANT",
        name: "Candidate A",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await createContestAction({
        title: "Participant Contest Attempt",
        track: "Track",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      });
      assert.equal(res.success, false);
      assert.match(res.error!, /Forbidden: Role PARTICIPANT is not authorized/);
    });

    it("Rejects EVALUATOR call to createContestAction", async () => {
      setTestSession({
        userId: "evaluator-id",
        email: evaluatorEmail,
        role: "EVALUATOR",
        name: "Evaluator",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await createContestAction({
        title: "Evaluator Contest Attempt",
        track: "Track",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      });
      assert.equal(res.success, false);
      assert.match(res.error!, /Forbidden: Role EVALUATOR is not authorized/);
    });

    it("Rejects PARTICIPANT call to saveRubricScoreAction", async () => {
      setTestSession({
        userId: candidateAUserId,
        email: candidateAEmail,
        role: "PARTICIPANT",
        name: "Candidate A",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await saveRubricScoreAction({
        submissionId: candidateASubmissionId,
        scores: [],
      });
      assert.equal(res.success, false);
      assert.match(res.error!, /Forbidden|Unauthorized/);
    });

    it("Rejects EVALUATOR call to publishContestResultsAction", async () => {
      setTestSession({
        userId: "evaluator-id",
        email: evaluatorEmail,
        role: "EVALUATOR",
        name: "Evaluator",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await publishContestResultsAction(createdContestId);
      assert.equal(res.success, false);
      assert.match(res.error!, /Forbidden: Role EVALUATOR is not authorized/);
    });
  });

  describe("4. Cross-User Participant Isolation & Submission Protection", () => {
    it("Participant A CANNOT save draft on Participant B's submission", async () => {
      // Act as Candidate A
      setTestSession({
        userId: candidateAUserId,
        email: candidateAEmail,
        role: "PARTICIPANT",
        name: "Candidate A",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Target Candidate B's submission
      const res = await saveAnswerDraftAction(
        candidateBSubmissionId,
        "dummy-q-id",
        { writtenText: "Malicious cross-user modification" }
      );

      assert.equal(res.success, false);
      assert.match(res.error!, /Cross-user submission modification is blocked/);
    });

    it("Participant A CANNOT finalize or submit Participant B's submission", async () => {
      // Act as Candidate A
      setTestSession({
        userId: candidateAUserId,
        email: candidateAEmail,
        role: "PARTICIPANT",
        name: "Candidate A",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Attempt to submit Candidate B's submission
      const res = await submitAssessmentAction(candidateBSubmissionId);
      assert.equal(res.success, false);
      assert.match(res.error!, /Cross-user submission finalization is blocked/);
    });

    it("Participant dashboard returns only the signed-in candidate's records", async () => {
      // Candidate A is enrolled in Exclusive Candidate A Contest
      setTestSession({
        userId: candidateAUserId,
        email: candidateAEmail,
        role: "PARTICIPANT",
        name: "Candidate A",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const dashA = await getParticipantDashboard();
      assert.equal(dashA.candidate.email, candidateAEmail);
      const hasContest = dashA.contests.some((c) => c.contestId === exclusiveContestId);
      assert.equal(hasContest, true);

      // Candidate B is NOT enrolled in Exclusive Candidate A Contest
      setTestSession({
        userId: candidateBUserId,
        email: candidateBEmail,
        role: "PARTICIPANT",
        name: "Candidate B",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const dashB = await getParticipantDashboard();
      assert.equal(dashB.candidate.email, candidateBEmail);
      const hasContestB = dashB.contests.some((c) => c.contestId === exclusiveContestId);
      assert.equal(hasContestB, false, "Candidate B must not see Candidate A's exclusive contest");
    });
  });
});
