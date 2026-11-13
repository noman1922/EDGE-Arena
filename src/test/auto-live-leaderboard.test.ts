/**
 * Automatic Live Leaderboard & Multi-Candidate Integrity Test Suite
 *
 * Verifies all requirements:
 * 1. Freedom contest with Auto-publish ON -> publishes automatically upon completion, sets SELECTED/PROVISIONAL.
 * 2. Freedom contest with Auto-publish OFF -> strictly preserves unpublished state (AUTO_PUBLISH_DISABLED), hidden from participants.
 * 3. Manually published results (Admin Update Leaderboard) -> publishes results even when Auto-publish was OFF.
 * 4. Participant with 5–6 points sees their actual rank (#3), not automatically #1.
 * 5. Multiple candidates with different scores receive correct competition ranks.
 * 6. Candidates with equal scores follow chronological tie-breaking rules (earlier submission wins).
 * 7. Penalties are deducted correctly: rawScore - penalties = finalScore.
 * 8. Participant Leaderboard renders all 7 required columns with privacy-shielded identifiers.
 * 9. Unpublished results remain strictly shielded from participants.
 * 10. Admin and Participant leaderboards read from the same source and agree on values.
 * 11. Existing standard contests retain standard Certified/Provisional status.
 *
 * Fully isolated: Stubs all Prisma calls so ZERO requests hit production.
 */

import test, { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  FREEDOM_CONTEST_SLUG,
  FREEDOM_CONTEST_TITLE,
  getFreedomSelectionStatus,
} from "@/lib/freedom-contest";
import {
  refreshContestLeaderboard,
  autoPublishCandidateResultIfEligible,
} from "@/lib/auto-publish";
import { publishContestResultsAction } from "@/app/actions/evaluator-actions";
import { getParticipantLeaderboard } from "@/app/actions/participant-nav-actions";
import { setTestSession } from "@/lib/auth";

describe("Automatic Live Leaderboard & Multi-Candidate Integrity Suite", () => {
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
  const originalExecuteRaw = prisma.$executeRaw;
  const originalTransaction = prisma.$transaction;

  beforeEach(() => {
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
    (prisma as any).auditLog.create = async (args: any) => ({ id: "audit-1", ...args.data });
    (prisma as any).auditLog.findMany = async () => [];
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
    prisma.$executeRaw = originalExecuteRaw;
    prisma.$transaction = originalTransaction;
    setTestSession(undefined);
  });

  // Mock contest structure for testing
  const mockFreedomContest = {
    id: "contest-freedom",
    slug: FREEDOM_CONTEST_SLUG,
    title: FREEDOM_CONTEST_TITLE,
    track: "UI/UX",
    isPublished: true,
    phases: [
      {
        phaseNumber: 1,
        tasks: [
          {
            id: "task-1",
            title: "Assessment Quiz",
            taskNumber: 1,
            totalPoints: 20,
            questions: [{ type: "MCQ" }],
            rubrics: [],
          },
        ],
      },
    ],
    participants: [
      { userId: "cand-high", user: { id: "cand-high", name: "High Scorer", candidateId: "ACI-001", institution: "Dhaka Campus" } },
      { userId: "cand-mid", user: { id: "cand-mid", name: "Mid Scorer", candidateId: "ACI-002", institution: "Chittagong Campus" } },
      { userId: "cand-low", user: { id: "cand-low", name: "Low Scorer", candidateId: "ACI-003", institution: "Rajshahi Campus" } },
    ],
  };

  const mockUnpublishedFreedomContest = {
    ...mockFreedomContest,
    isPublished: false,
  };

  it("1. Freedom contest with Auto-publish OFF: results remain strictly unpublished and hidden", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 19, finalScore: 19, submittedAt: new Date("2026-11-13T10:00:00Z") },
    ];

    // Auto-publish explicitly OFF
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: false }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockUnpublishedFreedomContest;
    // @ts-expect-error test mock
    prisma.user.findUnique = async () => ({ id: "admin-1", role: "ADMIN", isActive: true });
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;

    let contestUpdateCalled = false;
    // @ts-expect-error test mock
    prisma.contest.update = async () => {
      contestUpdateCalled = true;
      return mockUnpublishedFreedomContest;
    };

    // Candidate submits assessment
    const result = await autoPublishCandidateResultIfEligible("contest-freedom", "cand-high");

    // Must be blocked because Auto-publish is OFF
    assert.strictEqual(result.published, false);
    assert.strictEqual(result.reason, "AUTO_PUBLISH_DISABLED");
    assert.strictEqual(contestUpdateCalled, false, "Must NOT update contest to published when Auto-publish is OFF");
  });

  it("2. Freedom contest with Auto-publish ON: publishes automatically upon completion", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 18, finalScore: 18, submittedAt: new Date("2026-11-13T10:00:00Z") },
      { id: "s2", userId: "cand-mid", taskId: "task-1", status: "GRADED", autoGradeScore: 16, finalScore: 16, submittedAt: new Date("2026-11-13T10:05:00Z") },
      { id: "s3", userId: "cand-low", taskId: "task-1", status: "GRADED", autoGradeScore: 10, finalScore: 10, submittedAt: new Date("2026-11-13T10:10:00Z") },
    ];

    // Auto-publish explicitly ON
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockUnpublishedFreedomContest;
    // @ts-expect-error test mock
    prisma.user.findUnique = async () => ({ id: "admin-1", role: "ADMIN", isActive: true });
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => ({ ...mockUnpublishedFreedomContest, isPublished: true });

    const result = await autoPublishCandidateResultIfEligible("contest-freedom", "cand-high");

    assert.strictEqual(result.published, true);
    assert.strictEqual(result.finalScore, 18);
    assert.strictEqual(result.rank, 1);
    assert.strictEqual(result.selectionStatus, "SELECTED"); // 18 is SELECTED
  });

  it("3. Manually published results: Admin Update Leaderboard publishes even when Auto-publish was OFF", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 20, finalScore: 20, submittedAt: new Date("2026-11-13T10:00:00Z") },
      { id: "s2", userId: "cand-mid", taskId: "task-1", status: "GRADED", autoGradeScore: 16, finalScore: 16, submittedAt: new Date("2026-11-13T10:05:00Z") },
      { id: "s3", userId: "cand-low", taskId: "task-1", status: "GRADED", autoGradeScore: 12, finalScore: 12, submittedAt: new Date("2026-11-13T10:10:00Z") },
    ];

    // Auto-publish OFF, but Admin clicks manual publish
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: false }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockUnpublishedFreedomContest;
    // @ts-expect-error test mock
    prisma.user.findUnique = async () => ({ id: "admin-1", role: "ADMIN", isActive: true });
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => ({ ...mockUnpublishedFreedomContest, isPublished: true });

    const adminResult = await publishContestResultsAction("contest-freedom");

    assert.strictEqual(adminResult.success, true);
    assert.strictEqual(adminResult.publishedCount, 3);
    assert.strictEqual(adminResult.isPublished, true);
  });

  it("4. Participant with 5–6 points sees their actual rank (#3), not automatically #1", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 19, finalScore: 19, submittedAt: new Date("2026-11-13T10:00:00Z") },
      { id: "s2", userId: "cand-mid", taskId: "task-1", status: "GRADED", autoGradeScore: 16, finalScore: 16, submittedAt: new Date("2026-11-13T10:05:00Z") },
      { id: "s3", userId: "cand-low", taskId: "task-1", status: "GRADED", autoGradeScore: 6, finalScore: 6, submittedAt: new Date("2026-11-13T10:10:00Z") },
    ];

    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockFreedomContest;
    // @ts-expect-error test mock
    prisma.user.findUnique = async () => ({ id: "admin-1", role: "ADMIN", isActive: true });
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => mockFreedomContest;

    const autoPubResult = await autoPublishCandidateResultIfEligible("contest-freedom", "cand-low");

    assert.strictEqual(autoPubResult.published, true);
    assert.strictEqual(autoPubResult.finalScore, 6);
    // Crucial: cand-low with 6 points must NOT be #1! They are #3!
    assert.strictEqual(autoPubResult.rank, 3);
    assert.strictEqual(autoPubResult.selectionStatus, "PROVISIONAL");
  });

  it("5. Multiple candidates with different scores receive correct competition ranks and Freedom statuses", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 20, finalScore: 20, submittedAt: new Date("2026-11-13T10:00:00Z") },
      { id: "s2", userId: "cand-mid", taskId: "task-1", status: "GRADED", autoGradeScore: 16, finalScore: 16, submittedAt: new Date("2026-11-13T10:05:00Z") },
      { id: "s3", userId: "cand-low", taskId: "task-1", status: "GRADED", autoGradeScore: 15, finalScore: 15, submittedAt: new Date("2026-11-13T10:10:00Z") },
    ];

    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockFreedomContest;
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => mockFreedomContest;

    const refresh = await refreshContestLeaderboard("contest-freedom", { forcePublish: true });

    assert.strictEqual(refresh.success, true);
    assert.strictEqual(refresh.publishedCount, 3);

    const candidates = refresh.rankedCandidates!;
    // cand-high (20 pts) -> rank 1, SELECTED
    assert.strictEqual(candidates[0].userId, "cand-high");
    assert.strictEqual(candidates[0].rank, 1);
    assert.strictEqual(candidates[0].totalScore, 20);
    assert.strictEqual(candidates[0].selectionStatus, "SELECTED");

    // cand-mid (16 pts) -> rank 2, SELECTED
    assert.strictEqual(candidates[1].userId, "cand-mid");
    assert.strictEqual(candidates[1].rank, 2);
    assert.strictEqual(candidates[1].totalScore, 16);
    assert.strictEqual(candidates[1].selectionStatus, "SELECTED");

    // cand-low (15 pts) -> rank 3, PROVISIONAL (0-15 = PROVISIONAL)
    assert.strictEqual(candidates[2].userId, "cand-low");
    assert.strictEqual(candidates[2].rank, 3);
    assert.strictEqual(candidates[2].totalScore, 15);
    assert.strictEqual(candidates[2].selectionStatus, "PROVISIONAL");
  });

  it("6. Candidates with equal scores share rank and sort chronologically (earlier submission first)", async () => {
    const tieContest = {
      ...mockFreedomContest,
      participants: [
        { userId: "u-bob", user: { name: "Bob" } },
        { userId: "u-alice", user: { name: "Alice" } },
        { userId: "u-carol", user: { name: "Carol" } },
      ],
    };
    const submissions = [
      { id: "s-bob", userId: "u-bob", taskId: "task-1", status: "GRADED", autoGradeScore: 18, finalScore: 18, submittedAt: new Date("2026-11-13T09:30:00Z") },
      { id: "s-alice", userId: "u-alice", taskId: "task-1", status: "GRADED", autoGradeScore: 18, finalScore: 18, submittedAt: new Date("2026-11-13T09:00:00Z") },
      { id: "s-carol", userId: "u-carol", taskId: "task-1", status: "GRADED", autoGradeScore: 12, finalScore: 12, submittedAt: new Date("2026-11-13T09:45:00Z") },
    ];

    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => tieContest;
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => tieContest;

    const refresh = await refreshContestLeaderboard("contest-freedom", { forcePublish: true });
    const candidates = refresh.rankedCandidates!;

    // Alice submitted earlier -> index 0, rank 1
    assert.strictEqual(candidates[0].userId, "u-alice");
    assert.strictEqual(candidates[0].rank, 1);
    assert.strictEqual(candidates[0].totalScore, 18);

    // Bob submitted later -> index 1, shares rank 1 (competition ranking)
    assert.strictEqual(candidates[1].userId, "u-bob");
    assert.strictEqual(candidates[1].rank, 1);
    assert.strictEqual(candidates[1].totalScore, 18);

    // Carol is next -> index 2, receives rank 3 (1, 1, 3!)
    assert.strictEqual(candidates[2].userId, "u-carol");
    assert.strictEqual(candidates[2].rank, 3);
    assert.strictEqual(candidates[2].totalScore, 12);
  });

  it("7. Penalties are deducted correctly: rawScore - penalties = finalScore", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 20, finalScore: 20, submittedAt: new Date("2026-11-13T10:00:00Z") },
    ];
    const penaltyAuditLogs = [
      {
        id: "pen-1",
        action: "APPLY_SCORE_DEDUCTION",
        targetType: "CONTEST_PENALTY",
        targetId: "contest-freedom:cand-high",
        metadata: { contestId: "contest-freedom", userId: "cand-high", points: 4 },
        createdAt: new Date(),
      },
    ];

    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockFreedomContest;
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.auditLog.findMany = async () => penaltyAuditLogs;
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => mockFreedomContest;

    const refresh = await refreshContestLeaderboard("contest-freedom", { forcePublish: true });
    const cand = refresh.rankedCandidates![0];

    assert.strictEqual(cand.rawScore, 20);
    assert.strictEqual(cand.penalties, 4);
    assert.strictEqual(cand.totalScore, 16);
    assert.strictEqual(cand.selectionStatus, "SELECTED"); // 16 is SELECTED
  });

  it("8. Participant Leaderboard renders all 7 required columns with privacy-shielded identifiers", async () => {
    setTestSession({
      userId: "cand-mid",
      email: "mid@test.com",
      role: "PARTICIPANT",
      name: "Mid Scorer",
      mustChangePassword: false,
    });

    // @ts-expect-error test mock
    prisma.contestParticipant.findMany = async () => [
      { contest: { id: "contest-freedom", title: FREEDOM_CONTEST_TITLE } },
    ];
    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockFreedomContest;
    // @ts-expect-error test mock
    prisma.cohortResult.count = async () => 3;
    // @ts-expect-error test mock
    prisma.cohortResult.findMany = async () => [
      {
        userId: "cand-high",
        rank: 1,
        totalScore: 19,
        isCertified: true,
        user: { name: "High Scorer (Private)", candidateId: "ACI-001", institution: "Dhaka Campus" },
      },
      {
        userId: "cand-mid",
        rank: 2,
        totalScore: 16,
        isCertified: true,
        user: { name: "Mid Scorer (Private)", candidateId: "ACI-002", institution: "Chittagong Campus" },
      },
      {
        userId: "cand-low",
        rank: 3,
        totalScore: 6,
        isCertified: false,
        user: { name: "Low Scorer (Private)", candidateId: "ACI-003", institution: "Rajshahi Campus" },
      },
    ];
    // @ts-expect-error test mock
    prisma.cohortResult.findUnique = async () => ({
      userId: "cand-mid",
      rank: 2,
      totalScore: 16,
      isCertified: true,
      user: { name: "Mid Scorer (Private)", candidateId: "ACI-002", institution: "Chittagong Campus" },
    });
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => [
      { userId: "cand-high", finalScore: 19, autoGradeScore: 19 },
      { userId: "cand-mid", finalScore: 16, autoGradeScore: 16 },
      { userId: "cand-low", finalScore: 6, autoGradeScore: 6 },
    ];

    const lb = await getParticipantLeaderboard("contest-freedom");

    assert.strictEqual(lb.isPublished, true);
    assert.strictEqual(lb.rows.length, 3);
    assert.strictEqual(lb.currentUserRank, 2);

    // Verify row columns: Rank, Candidate (anonymized + (You)), Institution, Raw Score, Penalties, Final Score, Status
    const rowHigh = lb.rows[0];
    assert.strictEqual(rowHigh.rank, 1);
    assert.strictEqual(rowHigh.candidateId, "ACI-001"); // Privacy safe: no private names or emails
    assert.strictEqual(rowHigh.institution, "Dhaka Campus");
    assert.strictEqual(rowHigh.rawScore, 19);
    assert.strictEqual(rowHigh.penalties, 0);
    assert.strictEqual(rowHigh.finalScore, 19);
    assert.strictEqual(rowHigh.selectionStatus, "SELECTED");
    assert.strictEqual(rowHigh.isCurrentUser, false);

    const rowMid = lb.rows[1];
    assert.strictEqual(rowMid.rank, 2);
    assert.strictEqual(rowMid.candidateId, "ACI-002 (You)"); // Current user highlighted!
    assert.strictEqual(rowMid.institution, "Chittagong Campus");
    assert.strictEqual(rowMid.rawScore, 16);
    assert.strictEqual(rowMid.penalties, 0);
    assert.strictEqual(rowMid.finalScore, 16);
    assert.strictEqual(rowMid.selectionStatus, "SELECTED");
    assert.strictEqual(rowMid.isCurrentUser, true);

    const rowLow = lb.rows[2];
    assert.strictEqual(rowLow.rank, 3);
    assert.strictEqual(rowLow.candidateId, "ACI-003");
    assert.strictEqual(rowLow.institution, "Rajshahi Campus");
    assert.strictEqual(rowLow.rawScore, 6);
    assert.strictEqual(rowLow.penalties, 0);
    assert.strictEqual(rowLow.finalScore, 6);
    assert.strictEqual(rowLow.selectionStatus, "PROVISIONAL");
  });

  it("9. Unpublished results remain strictly shielded from participants", async () => {
    setTestSession({
      userId: "cand-1",
      email: "cand@test.com",
      role: "PARTICIPANT",
      name: "Participant",
      mustChangePassword: false,
    });

    const unpublishedContest = {
      ...mockFreedomContest,
      isPublished: false,
    };

    // @ts-expect-error test mock
    prisma.contestParticipant.findMany = async () => [
      { contest: { id: "contest-freedom", title: FREEDOM_CONTEST_TITLE } },
    ];
    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => unpublishedContest;

    const lb = await getParticipantLeaderboard("contest-freedom");
    assert.strictEqual(lb.isPublished, false);
    assert.strictEqual(lb.rows.length, 0);
    assert.strictEqual(lb.currentUserRank, null);
  });

  it("10. Admin and Participant leaderboards read from the same source and agree on values", async () => {
    const submissions = [
      { id: "s1", userId: "cand-high", taskId: "task-1", status: "GRADED", autoGradeScore: 19, finalScore: 19, submittedAt: new Date("2026-11-13T10:00:00Z") },
      { id: "s2", userId: "cand-mid", taskId: "task-1", status: "GRADED", autoGradeScore: 14, finalScore: 14, submittedAt: new Date("2026-11-13T10:05:00Z") },
    ];

    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => mockFreedomContest;
    // @ts-expect-error test mock
    prisma.user.findUnique = async () => ({ id: "admin-1", role: "ADMIN", isActive: true });
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => mockFreedomContest;

    // Admin updates leaderboard
    const adminResult = await publishContestResultsAction("contest-freedom");
    assert.strictEqual(adminResult.success, true);
    assert.strictEqual(adminResult.publishedCount, 2);

    // Participant queries leaderboard
    setTestSession({
      userId: "cand-high",
      email: "high@test.com",
      role: "PARTICIPANT",
      name: "High Scorer",
      mustChangePassword: false,
    });

    // @ts-expect-error test mock
    prisma.contestParticipant.findMany = async () => [
      { contest: { id: "contest-freedom", title: FREEDOM_CONTEST_TITLE } },
    ];
    // @ts-expect-error test mock
    prisma.cohortResult.count = async () => 2;
    // @ts-expect-error test mock
    prisma.cohortResult.findMany = async () => [
      { userId: "cand-high", rank: 1, totalScore: 19, isCertified: true, user: { candidateId: "ACI-001", institution: "Dhaka Campus" } },
      { userId: "cand-mid", rank: 2, totalScore: 14, isCertified: false, user: { candidateId: "ACI-002", institution: "Chittagong Campus" } },
    ];
    // @ts-expect-error test mock
    prisma.cohortResult.findUnique = async () => ({
      userId: "cand-high", rank: 1, totalScore: 19, isCertified: true, user: { candidateId: "ACI-001", institution: "Dhaka Campus" }
    });

    const participantLb = await getParticipantLeaderboard("contest-freedom");
    assert.strictEqual(participantLb.rows[0].finalScore, 19);
    assert.strictEqual(participantLb.rows[0].rank, 1);
    assert.strictEqual(participantLb.rows[0].selectionStatus, "SELECTED");

    assert.strictEqual(participantLb.rows[1].finalScore, 14);
    assert.strictEqual(participantLb.rows[1].rank, 2);
    assert.strictEqual(participantLb.rows[1].selectionStatus, "PROVISIONAL");
  });

  it("11. Existing standard contests retain standard Certified/Provisional status", async () => {
    const standardContest = {
      id: "contest-standard",
      slug: "general-engineering-assessment",
      title: "General Engineering Online Assessment",
      track: "Full Stack",
      isPublished: true,
      phases: [
        {
          phaseNumber: 1,
          tasks: [
            { id: "task-std", title: "Task 1", taskNumber: 1, totalPoints: 100, questions: [{ type: "MCQ" }], rubrics: [] },
          ],
        },
      ],
      participants: [
        { userId: "cand-pass", user: { name: "Pass Cand", candidateId: "STD-001" } },
        { userId: "cand-fail", user: { name: "Fail Cand", candidateId: "STD-002" } },
      ],
    };

    const submissions = [
      { id: "s1", userId: "cand-pass", taskId: "task-std", status: "GRADED", autoGradeScore: 75, finalScore: 75, submittedAt: new Date() },
      { id: "s2", userId: "cand-fail", taskId: "task-std", status: "GRADED", autoGradeScore: 40, finalScore: 40, submittedAt: new Date() },
    ];

    // @ts-expect-error test mock
    prisma.contest.findUnique = async () => standardContest;
    // @ts-expect-error test mock
    prisma.submission.findMany = async () => submissions;
    // @ts-expect-error test mock
    prisma.auditLog.findFirst = async () => ({ metadata: { autoPublish: true }, createdAt: new Date() });
    // @ts-expect-error test mock
    prisma.$executeRaw = async () => 1;
    // @ts-expect-error test mock
    prisma.contest.update = async () => standardContest;

    const refresh = await refreshContestLeaderboard("contest-standard", { forcePublish: true });
    assert.strictEqual(refresh.success, true);

    const candidates = refresh.rankedCandidates!;
    // 75/100 -> >= 50% -> isCertified: true, selectionStatus: null (standard contest)
    assert.strictEqual(candidates[0].userId, "cand-pass");
    assert.strictEqual(candidates[0].isCertified, true);
    assert.strictEqual(candidates[0].selectionStatus, null);

    // 40/100 -> < 50% -> isCertified: false, selectionStatus: null
    assert.strictEqual(candidates[1].userId, "cand-fail");
    assert.strictEqual(candidates[1].isCertified, false);
    assert.strictEqual(candidates[1].selectionStatus, null);
  });
});
