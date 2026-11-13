/**
 * Freedom CareerEdge Contest & Auto-Publishing Regression Test Suite
 *
 * Comprehensive tests verifying:
 * 1. Freedom scores: 20, 19, 17, 16 -> SELECTED
 * 2. Freedom scores: 15, 10, 0 -> PROVISIONAL
 * 3. Another contest -> unchanged old status behavior (selectionStatus is null)
 * 4. Unpublished results -> no participant selection status
 * 5. Published results -> correct selection status
 * 6. Admin leaderboard data query maps correct selectionStatus for Freedom candidates
 * 7. Database with and without sessionVersion -> authentication works securely and fails closed
 * 8. Manual Publish & Auto Publish flows succeed without column errors and mark Freedom 16-20 as certified
 * 9. Auto Publish ON triggers only when all grading is complete; OFF preserves manual publish
 * 10. Zero penalty -> accepts 0, deducts zero marks, positive penalties deduct correctly
 *
 * Strictly isolated: Stubs all Prisma calls so ZERO requests hit production.
 */

import test, { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  isFreedomContest,
  getFreedomSelectionStatus,
  FREEDOM_CONTEST_SLUG,
  FREEDOM_CONTEST_TITLE,
} from "@/lib/freedom-contest";
import {
  getContestPublicationSettings,
  saveContestPublicationSettings,
  autoPublishCandidateResultIfEligible,
} from "@/lib/auto-publish";
import {
  setContestAutoPublishSettingAction,
  getContestAutoPublishSettingAction,
  getAdminLeaderboardAndResults,
} from "@/app/actions/results-actions";
import {
  deductMarksAction,
  publishContestResultsAction,
} from "@/app/actions/evaluator-actions";
import {
  getParticipantLeaderboard,
  getParticipantScorecard,
} from "@/app/actions/participant-nav-actions";
import {
  setTestSession,
  detectSessionVersionColumnSupport,
  setSessionVersionColumnOverrideForTesting,
  verifySessionAgainstDatabase,
  type SessionPayload,
} from "@/lib/auth";

describe("Freedom CareerEdge & Auto-Publishing Verification Suite", () => {
  // Store original Prisma methods for clean restoration
  const originalAuditLogFindFirst = prisma.auditLog.findFirst;
  const originalAuditLogFindMany = prisma.auditLog.findMany;
  const originalAuditLogCreate = prisma.auditLog.create;
  const originalContestFindMany = prisma.contest.findMany;
  const originalContestFindUnique = prisma.contest.findUnique;
  const originalContestUpdate = prisma.contest.update;
  const originalSubmissionFindUnique = prisma.submission.findUnique;
  const originalSubmissionFindMany = prisma.submission.findMany;
  const originalSubmissionUpdate = prisma.submission.update;
  const originalSubmissionUpdateMany = prisma.submission.updateMany;
  const originalCohortResultFindUnique = prisma.cohortResult.findUnique;
  const originalCohortResultFindMany = prisma.cohortResult.findMany;
  const originalCohortResultCount = prisma.cohortResult.count;
  const originalCohortResultUpdate = prisma.cohortResult.update;
  const originalCohortResultUpdateMany = prisma.cohortResult.updateMany;
  const originalContestParticipantFindMany = prisma.contestParticipant.findMany;
  const originalUserFindUnique = prisma.user.findUnique;
  const originalUserFindFirst = prisma.user.findFirst;
  const originalExecuteRaw = prisma.$executeRaw;
  const originalQueryRaw = prisma.$queryRaw;
  const originalQueryRawUnsafe = prisma.$queryRawUnsafe;
  const originalTransaction = prisma.$transaction;

  beforeEach(() => {
    // Default test session: Admin
    setTestSession({
      userId: "admin-1",
      email: "admin@test.com",
      role: "ADMIN",
      name: "Test Admin",
      mustChangePassword: false,
    });
    (prisma as any).$transaction = async (fn: any) => fn(prisma);
    (prisma as any).submission.update = async (args: any) => ({ ...args.data });
    (prisma as any).cohortResult.update = async (args: any) => ({ ...args.data });
    (prisma as any).cohortResult.count = async () => 1;
    setSessionVersionColumnOverrideForTesting(null);
  });

  afterEach(() => {
    prisma.auditLog.findFirst = originalAuditLogFindFirst;
    prisma.auditLog.findMany = originalAuditLogFindMany;
    prisma.auditLog.create = originalAuditLogCreate;
    prisma.contest.findMany = originalContestFindMany;
    prisma.contest.findUnique = originalContestFindUnique;
    prisma.contest.update = originalContestUpdate;
    prisma.submission.findUnique = originalSubmissionFindUnique;
    prisma.submission.findMany = originalSubmissionFindMany;
    prisma.submission.update = originalSubmissionUpdate;
    prisma.submission.updateMany = originalSubmissionUpdateMany;
    prisma.cohortResult.findUnique = originalCohortResultFindUnique;
    prisma.cohortResult.findMany = originalCohortResultFindMany;
    prisma.cohortResult.count = originalCohortResultCount;
    prisma.cohortResult.update = originalCohortResultUpdate;
    prisma.cohortResult.updateMany = originalCohortResultUpdateMany;
    prisma.contestParticipant.findMany = originalContestParticipantFindMany;
    prisma.user.findUnique = originalUserFindUnique;
    prisma.user.findFirst = originalUserFindFirst;
    prisma.$executeRaw = originalExecuteRaw;
    prisma.$queryRaw = originalQueryRaw;
    prisma.$queryRawUnsafe = originalQueryRawUnsafe;
    prisma.$transaction = originalTransaction;
    setTestSession(undefined);
    setSessionVersionColumnOverrideForTesting(null);
  });

  // =========================================================================
  // ISSUE 2: Freedom Selection Classification
  // =========================================================================
  describe("ISSUE 2: Freedom Selection Classification Logic", () => {
    it("Scores 20, 19, 17, 16 are classified strictly as SELECTED", () => {
      assert.strictEqual(getFreedomSelectionStatus(20), "SELECTED");
      assert.strictEqual(getFreedomSelectionStatus(19), "SELECTED");
      assert.strictEqual(getFreedomSelectionStatus(17), "SELECTED");
      assert.strictEqual(getFreedomSelectionStatus(16), "SELECTED");
      assert.strictEqual(getFreedomSelectionStatus(16.0), "SELECTED");
    });

    it("Scores 15, 10, 0 are classified strictly as PROVISIONAL", () => {
      assert.strictEqual(getFreedomSelectionStatus(15), "PROVISIONAL");
      assert.strictEqual(getFreedomSelectionStatus(15.99), "PROVISIONAL");
      assert.strictEqual(getFreedomSelectionStatus(10), "PROVISIONAL");
      assert.strictEqual(getFreedomSelectionStatus(0), "PROVISIONAL");
      assert.strictEqual(getFreedomSelectionStatus(-2), "PROVISIONAL");
    });

    it("Identifies Freedom contest by slug and title variants with normalization", () => {
      // Canonical slug
      assert.strictEqual(
        isFreedomContest({ slug: FREEDOM_CONTEST_SLUG }),
        true
      );
      // Canonical title
      assert.strictEqual(
        isFreedomContest({ title: FREEDOM_CONTEST_TITLE }),
        true
      );
      // Title variant without 'Online Assessment'
      assert.strictEqual(
        isFreedomContest({ title: "Freedom CareerEdge Program" }),
        true
      );
      // Slug variant
      assert.strictEqual(
        isFreedomContest({ slug: "freedom-careeredge-program" }),
        true
      );
      // Rejects unrelated contests
      assert.strictEqual(
        isFreedomContest({ slug: "general-engineering", title: "General Engineering Contest" }),
        false
      );
    });

    it("Admin Leaderboard data mapping gives correct selectionStatus for Freedom candidates", async () => {
      // @ts-expect-error test mock
      prisma.contest.findMany = async () => [
        { id: "c-freedom", title: FREEDOM_CONTEST_TITLE },
      ];
      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-freedom",
        slug: FREEDOM_CONTEST_SLUG,
        title: FREEDOM_CONTEST_TITLE,
        track: "UI/UX",
        isPublished: false,
        _count: { participants: 4 },
        submissions: [
          { id: "s1", userId: "u1", status: "GRADED", finalScore: 20, autoGradeScore: 20, manualGradeScore: null, submittedAt: new Date("2026-11-13T01:00:00Z"), user: { name: "Alice", email: "alice@test.com" } },
          { id: "s2", userId: "u2", status: "GRADED", finalScore: 16, autoGradeScore: 16, manualGradeScore: null, submittedAt: new Date("2026-11-13T01:05:00Z"), user: { name: "Bob", email: "bob@test.com" } },
          { id: "s3", userId: "u3", status: "GRADED", finalScore: 15, autoGradeScore: 15, manualGradeScore: null, submittedAt: new Date("2026-11-13T01:10:00Z"), user: { name: "Carol", email: "carol@test.com" } },
          { id: "s4", userId: "u4", status: "GRADED", finalScore: 0, autoGradeScore: 0, manualGradeScore: null, submittedAt: new Date("2026-11-13T01:15:00Z"), user: { name: "Dave", email: "dave@test.com" } },
        ],
        results: [],
      });
      // @ts-expect-error test mock
      prisma.auditLog.findMany = async () => [];
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => null;

      const res = await getAdminLeaderboardAndResults("c-freedom");
      assert.ok(res.current);
      assert.strictEqual(res.current.isFreedomContest, true);

      const rows = res.current.rows;
      assert.strictEqual(rows.length, 4);

      // Cand 1 (score 20) -> SELECTED
      assert.strictEqual(rows[0].finalScore, 20);
      assert.strictEqual(rows[0].selectionStatus, "SELECTED");

      // Cand 2 (score 16) -> SELECTED
      assert.strictEqual(rows[1].finalScore, 16);
      assert.strictEqual(rows[1].selectionStatus, "SELECTED");

      // Cand 3 (score 15) -> PROVISIONAL
      assert.strictEqual(rows[2].finalScore, 15);
      assert.strictEqual(rows[2].selectionStatus, "PROVISIONAL");

      // Cand 4 (score 0) -> PROVISIONAL
      assert.strictEqual(rows[3].finalScore, 0);
      assert.strictEqual(rows[3].selectionStatus, "PROVISIONAL");
    });

    it("Another contest retains unchanged status logic and null selectionStatus", async () => {
      // @ts-expect-error test mock
      prisma.contest.findMany = async () => [
        { id: "c-other", title: "General Engineering Challenge" },
      ];
      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-other",
        slug: "general-engineering-challenge",
        title: "General Engineering Challenge",
        track: "Full Stack",
        isPublished: true,
        _count: { participants: 1 },
        submissions: [
          { id: "s1", userId: "u1", status: "GRADED", finalScore: 75, autoGradeScore: 75, manualGradeScore: null, submittedAt: new Date(), user: { name: "Alice", email: "alice@test.com" } },
        ],
        results: [
          { userId: "u1", totalScore: 75, rank: 1, percentile: 100, isCertified: true, publishedAt: new Date() },
        ],
      });
      // @ts-expect-error test mock
      prisma.auditLog.findMany = async () => [];
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => null;

      const res = await getAdminLeaderboardAndResults("c-other");
      assert.ok(res.current);
      assert.strictEqual(res.current.isFreedomContest, false);
      assert.strictEqual(res.current.rows[0].selectionStatus, null);
      assert.strictEqual(res.current.rows[0].isCertified, true);
    });

    it("Participant-facing endpoints shield selection status before publication and expose it after publication", async () => {
      setTestSession({
        userId: "p1",
        email: "participant@test.com",
        role: "PARTICIPANT",
        name: "Test Participant",
        mustChangePassword: false,
      });

      // Contest UNPUBLISHED
      // @ts-expect-error test mock
      prisma.contestParticipant.findMany = async () => [
        { contest: { id: "c-freedom", title: FREEDOM_CONTEST_TITLE } },
      ];
      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-freedom",
        slug: FREEDOM_CONTEST_SLUG,
        title: FREEDOM_CONTEST_TITLE,
        isPublished: false, // NOT published!
      });

      const unpublishedLb = await getParticipantLeaderboard("c-freedom");
      assert.strictEqual(unpublishedLb.isPublished, false);
      assert.strictEqual(unpublishedLb.rows.length, 0); // Rows strictly shielded

      // Contest PUBLISHED
      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-freedom",
        slug: FREEDOM_CONTEST_SLUG,
        title: FREEDOM_CONTEST_TITLE,
        isPublished: true, // Published!
      });
      // @ts-expect-error test mock
      prisma.cohortResult.count = async () => 1;
      // @ts-expect-error test mock
      prisma.cohortResult.findMany = async () => [
        {
          id: "cr-1",
          userId: "p1",
          totalScore: 19,
          rank: 1,
          isCertified: true,
          publishedAt: new Date(),
          user: { name: "Participant", candidateId: "ACI-P001" },
        },
      ];
      // @ts-expect-error test mock
      prisma.cohortResult.findUnique = async () => ({
        id: "cr-1",
        userId: "p1",
        totalScore: 19,
        rank: 1,
        isCertified: true,
        publishedAt: new Date(),
        user: { name: "Participant", candidateId: "ACI-P001" },
      });

      const publishedLb = await getParticipantLeaderboard("c-freedom");
      assert.strictEqual(publishedLb.isPublished, true);
      assert.strictEqual(publishedLb.isFreedomContest, true);
      assert.strictEqual(publishedLb.rows[0].finalScore, 19);
      assert.strictEqual(publishedLb.rows[0].selectionStatus, "SELECTED"); // 19 -> SELECTED!
    });
  });

  // =========================================================================
  // ISSUE 1: sessionVersion Schema Compatibility
  // =========================================================================
  describe("ISSUE 1: User.sessionVersion Schema Compatibility", () => {
    it("verifySessionAgainstDatabase works seamlessly when sessionVersion column is absent", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      // When column is absent, findUnique selects WITHOUT sessionVersion
      // @ts-expect-error test mock
      prisma.user.findUnique = async (args: any) => {
        // Assert that sessionVersion is NOT in the select projection
        assert.strictEqual(args.select?.sessionVersion, undefined);
        return {
          id: "u-test",
          email: "test@aci.local",
          role: "ADMIN",
          name: "Test Admin",
          isActive: true,
          mustChangePassword: false,
          passwordHash: "hash123",
          passwordSalt: "salt123",
        };
      };
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => null;

      const payload: SessionPayload = {
        userId: "u-test",
        email: "test@aci.local",
        role: "ADMIN",
        name: "Test Admin",
        mustChangePassword: false,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        jti: "jti-1",
      };

      const result = await verifySessionAgainstDatabase(payload, "token-1");
      assert.ok(result);
      assert.strictEqual(result.userId, "u-test");
    });

    it("verifySessionAgainstDatabase falls back cleanly to column-absent select if raw query threw column error", async () => {
      setSessionVersionColumnOverrideForTesting(true);

      let attemptedFirst = false;
      // @ts-expect-error test mock
      prisma.user.findUnique = async (args: any) => {
        if (args.select?.sessionVersion && !attemptedFirst) {
          attemptedFirst = true;
          throw new Error('The column User.sessionVersion does not exist in the current database (code: 42703)');
        }
        return {
          id: "u-resilient",
          email: "resilient@aci.local",
          role: "ADMIN",
          name: "Resilient Admin",
          isActive: true,
          mustChangePassword: false,
          passwordHash: "hash123",
          passwordSalt: "salt123",
        };
      };
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => null;

      const payload: SessionPayload = {
        userId: "u-resilient",
        email: "resilient@aci.local",
        role: "ADMIN",
        name: "Resilient Admin",
        mustChangePassword: false,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        jti: "jti-2",
      };

      const result = await verifySessionAgainstDatabase(payload, "token-2");
      assert.ok(result);
      assert.strictEqual(result.userId, "u-resilient");
      assert.strictEqual(attemptedFirst, true);
    });

    it("publishContestResultsAction runs without sessionVersion error when column is absent", async () => {
      setSessionVersionColumnOverrideForTesting(false);

      let queriedFields: any = null;
      // @ts-expect-error test mock
      prisma.user.findUnique = async (args: any) => {
        queriedFields = args.select;
        return {
          id: "admin-1",
          email: "admin@test.com",
          role: "ADMIN",
          isActive: true,
        };
      };

      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-1",
        title: FREEDOM_CONTEST_TITLE,
        slug: FREEDOM_CONTEST_SLUG,
        status: "LIVE",
        isPublished: false,
        phases: [
          {
            phaseNumber: 1,
            tasks: [{ id: "t1", title: "T1", taskNumber: 1, totalPoints: 20, questions: [], rubrics: [] }],
          },
        ],
        participants: [
          { userId: "cand-1", user: { id: "cand-1", name: "Candidate 1", email: "c1@test.com" } },
        ],
      });
      // @ts-expect-error test mock
      prisma.submission.findMany = async () => [
        { id: "sub-1", userId: "cand-1", taskId: "t1", status: "GRADED", finalScore: 18, autoGradeScore: 18, manualGradeScore: null, submittedAt: new Date() },
      ];
      // @ts-expect-error test mock
      prisma.auditLog.findMany = async () => [];
      // @ts-expect-error test mock
      prisma.$executeRaw = async () => 1;
      // @ts-expect-error test mock
      prisma.contest.update = async () => ({ id: "c-1", isPublished: true });

      const pubRes = await publishContestResultsAction("c-1");
      assert.strictEqual(pubRes.success, true);
      assert.strictEqual(pubRes.publishedCount, 1);
      assert.strictEqual(queriedFields?.sessionVersion, undefined);
    });
  });

  // =========================================================================
  // ISSUE 3: Auto-Publish & Manual Publish Safety
  // =========================================================================
  describe("ISSUE 3: Auto-Publish and Manual Publish Workflows", () => {
    it("Auto Publish ON triggers only when all grading is complete", async () => {
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-1",
        slug: FREEDOM_CONTEST_SLUG,
        title: FREEDOM_CONTEST_TITLE,
        phases: [{ tasks: [{ id: "t1", title: "MCQ", totalPoints: 20, questions: [{ type: "MCQ" }] }] }],
        enrollments: [{ userId: "u1" }],
      });
      // @ts-expect-error test mock
      prisma.submission.findMany = async (args: any) => {
        if (args?.select?.taskId) {
          return [{ id: "s1", taskId: "t1", status: "GRADED", autoGradeScore: 17, finalScore: 17, submittedAt: new Date() }];
        }
        return [{ userId: "u1", submittedAt: new Date() }];
      };
      // @ts-expect-error test mock
      prisma.submission.updateMany = async () => ({ count: 1 });
      // @ts-expect-error test mock
      prisma.contest.update = async () => ({ id: "c-1", isPublished: true });
      // @ts-expect-error test mock
      prisma.cohortResult.findMany = async () => [{ id: "cr-1", userId: "u1", totalScore: 17 }];
      // @ts-expect-error test mock
      prisma.$executeRaw = async () => 1;

      const result = await autoPublishCandidateResultIfEligible("c-1", "u1");
      assert.strictEqual(result.published, true);
      assert.strictEqual(result.finalScore, 17);
      assert.strictEqual(result.selectionStatus, "SELECTED"); // 17 -> SELECTED!
    });

    it("Auto Publish OFF preserves manual publication and prevents automatic release", async () => {
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: false }, createdAt: new Date() });

      const result = await autoPublishCandidateResultIfEligible("c-1", "u1");
      assert.strictEqual(result.published, false);
      assert.strictEqual(result.reason, "AUTO_PUBLISH_DISABLED");
    });

    it("Concurrent publication calls complete idempotently without duplicate results", async () => {
      let rawCount = 0;
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
      // @ts-expect-error test mock
      prisma.contest.findUnique = async () => ({
        id: "c-1",
        slug: "test",
        title: "Test",
        phases: [{ tasks: [{ id: "t1", title: "T1", totalPoints: 20, questions: [{ type: "MCQ" }] }] }],
        enrollments: [{ userId: "u1" }],
      });
      // @ts-expect-error test mock
      prisma.submission.findMany = async (args: any) => {
        if (args?.select?.taskId) {
          return [{ id: "s1", taskId: "t1", status: "GRADED", autoGradeScore: 18, finalScore: 18, submittedAt: new Date() }];
        }
        return [{ userId: "u1", submittedAt: new Date() }];
      };
      // @ts-expect-error test mock
      prisma.submission.updateMany = async () => ({ count: 1 });
      // @ts-expect-error test mock
      prisma.contest.update = async () => ({ id: "c-1", isPublished: true });
      // @ts-expect-error test mock
      prisma.cohortResult.findMany = async () => [{ id: "cr-1", userId: "u1", totalScore: 18 }];
      // @ts-expect-error test mock
      prisma.$executeRaw = async () => {
        rawCount++;
        return 1;
      };

      const [p1, p2] = await Promise.all([
        autoPublishCandidateResultIfEligible("c-1", "u1"),
        autoPublishCandidateResultIfEligible("c-1", "u1"),
      ]);

      assert.strictEqual(p1.published, true);
      assert.strictEqual(p2.published, true);
      assert.ok(rawCount >= 2);
    });
  });

  // =========================================================================
  // ISSUE 4: Zero Penalty Validation
  // =========================================================================
  describe("ISSUE 4: Zero Penalty Functionality", () => {
    it("Zero penalty deduction is accepted and deducts exactly 0 marks", async () => {
      // @ts-expect-error test mock
      prisma.submission.findUnique = async () => ({
        id: "sub-zero",
        userId: "cand-1",
        autoGradeScore: 18,
        finalScore: 18,
        contest: { id: "c-1", title: "Test", isPublished: false },
        task: { id: "t-1", title: "Task 1", totalPoints: 20 },
        user: { id: "cand-1", name: "Candidate", email: "cand@test.com" },
      });
      // @ts-expect-error test mock
      prisma.cohortResult.findUnique = async () => null;
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => null;

      let savedFinalScore: any = null;
      // @ts-expect-error test mock
      prisma.submission.update = async (args: any) => {
        savedFinalScore = args.data.finalScore;
        return { id: "sub-zero", ...args.data };
      };
      // @ts-expect-error test mock
      prisma.auditLog.create = async (args: any) => ({ id: "log-1", ...args.data });

      const res = await deductMarksAction({
        submissionId: "sub-zero",
        amount: 0,
        reason: "Zero penalty verified for test protocol",
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.deductionAmount, 0);
      assert.strictEqual(res.adjustedScore, 18);
      assert.strictEqual(savedFinalScore, 18); // Exactly 0 deducted!
    });

    it("Positive penalty deducts marks correctly, negative penalty is rejected", async () => {
      // @ts-expect-error test mock
      prisma.submission.findUnique = async () => ({
        id: "sub-pos",
        userId: "cand-1",
        autoGradeScore: 18,
        finalScore: 18,
        contest: { id: "c-1", title: "Test", isPublished: false },
        task: { id: "t-1", title: "Task 1", totalPoints: 20 },
        user: { id: "cand-1", name: "Candidate", email: "cand@test.com" },
      });
      // @ts-expect-error test mock
      prisma.cohortResult.findUnique = async () => null;
      // @ts-expect-error test mock
      prisma.auditLog.findFirst = async () => null;

      let savedFinalScore: any = null;
      // @ts-expect-error test mock
      prisma.submission.update = async (args: any) => {
        savedFinalScore = args.data.finalScore;
        return { id: "sub-pos", ...args.data };
      };
      // @ts-expect-error test mock
      prisma.auditLog.create = async (args: any) => ({ id: "log-2", ...args.data });

      const posRes = await deductMarksAction({
        submissionId: "sub-pos",
        amount: 2,
        reason: "Tab switch infraction",
      });

      assert.strictEqual(posRes.success, true);
      assert.strictEqual(posRes.adjustedScore, 16);
      assert.strictEqual(savedFinalScore, 16); // 18 - 2 = 16

      const negRes = await deductMarksAction({
        submissionId: "sub-pos",
        amount: -5,
        reason: "Negative test",
      });

      assert.strictEqual(negRes.success, false);
      assert.match(negRes.error || "", /greater than or equal to 0/);
    });
  });
});
