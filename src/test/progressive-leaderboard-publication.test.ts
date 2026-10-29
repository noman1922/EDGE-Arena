/**
 * Dedicated Test Suite: Progressive Leaderboard Publication
 *
 * Verifies:
 * 1. Admin can publish progressive leaderboard update with 1 finalized participant out of 77 enrolled.
 * 2. Unsubmitted candidates (e.g. remaining 76) remain unsubmitted and do not get a CohortResult or score 0.
 * 3. Contest status remains LIVE during progressive publication; only locks to COMPLETED on final certification.
 * 4. Incomplete/ungraded participants remain pending evaluation and are excluded from published ranks.
 * 5. Subsequent additional finalized results can be published repeatedly without hardcoded thresholds.
 * 6. Competition ranking (1224 rule) handles ties correctly across all currently finalized results.
 * 7. Repeated publication is idempotent without duplicate CohortResult records.
 * 8. Publication history is preserved via distinct AuditLog entries with counts and actor metadata.
 * 9. Final certification guard strictly prevents premature locking while unsubmitted/ungraded candidates remain.
 * 10. Non-admin users are rejected with 403 Forbidden.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  publishContestResultsAction,
  publishLeaderboardUpdateAction,
  certifyAndLockContestAction,
} from "../app/actions/evaluator-actions";
import {
  getParticipantLeaderboard,
  getParticipantScorecard,
} from "../app/actions/participant-nav-actions";
import { getAdminLeaderboardAndResults } from "../app/actions/results-actions";
import { getAdminOverviewSummaryAction } from "../app/actions/contest-actions";

describe("Progressive Leaderboard Publication Workflow", () => {
  const contestId = "88888888-1111-4000-8000-000000000001";
  const contestSlug = "prog-leaderboard-pilot-test-contest";

  const adminEmail = "prog.admin@test.aciedge.edu";
  const evaluatorEmail = "prog.evaluator@test.aciedge.edu";

  let adminId = "80000000-0000-4000-8000-000000000000";
  let evaluatorId = "80000000-0000-4000-8000-000000000099";

  let phaseId = "88888888-2222-4000-8000-000000000001";
  let taskId = "88888888-3333-4000-8000-000000000001";
  let questionId = "88888888-4444-4000-8000-000000000001";

  const TOTAL_ENROLLED = 77;
  const participantIds: string[] = [];
  const participantEmails: string[] = [];

  for (let i = 1; i <= TOTAL_ENROLLED; i++) {
    const pad = String(i).padStart(4, "0");
    participantIds.push(`80000000-0000-4000-8000-${pad}`);
    participantEmails.push(`prog.cand.${pad}@test.aciedge.edu`);
  }

  before(async () => {
    // 1. Setup Admin & Evaluator
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: UserRole.ADMIN },
      create: {
        id: adminId,
        email: adminEmail,
        name: "Progressive Admin",
        role: UserRole.ADMIN,
      },
    });

    await prisma.user.upsert({
      where: { email: evaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: evaluatorId,
        email: evaluatorEmail,
        name: "Progressive Evaluator",
        role: UserRole.EVALUATOR,
      },
    });

    // 2. Setup 77 Participants
    for (let i = 0; i < TOTAL_ENROLLED; i++) {
      await prisma.user.upsert({
        where: { email: participantEmails[i] },
        update: { role: UserRole.PARTICIPANT },
        create: {
          id: participantIds[i],
          email: participantEmails[i],
          name: `Candidate ${i + 1}`,
          candidateId: `CL-PILOT-${String(i + 1).padStart(3, "0")}`,
          role: UserRole.PARTICIPANT,
        },
      });
    }

    // 3. Setup Contest with 1 Phase, 1 Task, 1 MCQ Question (10 marks)
    const startDate = new Date(Date.now() - 3600 * 1000);
    const endDate = new Date(Date.now() + 3600 * 1000 * 24);

    await prisma.contest.upsert({
      where: { id: contestId },
      update: {
        title: "CL Sales Assessment Pilot Test",
        slug: contestSlug,
        status: ContestStatus.LIVE,
        isPublished: false,
        startDate,
        endDate,
      },
      create: {
        id: contestId,
        title: "CL Sales Assessment Pilot Test",
        slug: contestSlug,
        track: "SALES",
        status: ContestStatus.LIVE,
        isPublished: false,
        startDate,
        endDate,
      },
    });

    await prisma.phase.upsert({
      where: { id: phaseId },
      update: { status: PhaseStatus.OPEN, weightPercentage: 100 },
      create: {
        id: phaseId,
        contestId,
        title: "Phase 1: Knowledge Assessment",
        phaseNumber: 1,
        status: PhaseStatus.OPEN,
        weightPercentage: 100,
        deadline: endDate,
      },
    });

    await prisma.task.upsert({
      where: { id: taskId },
      update: { totalPoints: 10 },
      create: {
        id: taskId,
        phaseId,
        title: "Task 1: MCQ Evaluation",
        taskNumber: 1,
        totalPoints: 10,
      },
    });

    await prisma.question.upsert({
      where: { id: questionId },
      update: { points: 10 },
      create: {
        id: questionId,
        taskId,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "What is the primary objective of ACI Career EDGE?",
        points: 10,
        options: {
          create: [
            { optionKey: "A", text: "Sales excellence" },
            { optionKey: "B", text: "Software dev" },
            { optionKey: "C", text: "Logistics" },
            { optionKey: "D", text: "Operations" },
          ],
        },
        answerKey: {
          create: { correctOptionKey: "A" },
        },
      },
    });

    // 4. Enroll all 77 participants
    for (let i = 0; i < TOTAL_ENROLLED; i++) {
      await prisma.contestParticipant.upsert({
        where: {
          contestId_userId: {
            contestId,
            userId: participantIds[i],
          },
        },
        update: {},
        create: {
          contestId,
          userId: participantIds[i],
          status: "ENROLLED",
        },
      });
    }
  });

  after(async () => {
    // Clean up test data
    try {
      await prisma.auditLog.deleteMany({
        where: { targetId: contestId },
      });
      await prisma.cohortResult.deleteMany({
        where: { contestId },
      });
      await prisma.submissionAnswer.deleteMany({
        where: {
          submission: { contestId },
        },
      });
      await prisma.submission.deleteMany({
        where: { contestId },
      });
      await prisma.contestParticipant.deleteMany({
        where: { contestId },
      });
      await prisma.questionAnswerKey.deleteMany({
        where: { question: { taskId } },
      });
      await prisma.mcqOption.deleteMany({
        where: { question: { taskId } },
      });
      await prisma.question.deleteMany({
        where: { taskId },
      });
      await prisma.task.deleteMany({
        where: { phaseId },
      });
      await prisma.phase.deleteMany({
        where: { contestId },
      });
      await prisma.contest.deleteMany({
        where: { id: contestId },
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [adminEmail, evaluatorEmail, ...participantEmails],
          },
        },
      });
    } catch (err) {
      console.warn("Cleanup warning:", err);
    }
  });

  test("1. Progressive publish: 1 finalized participant out of 77 enrolled", async () => {
    // Participant 0 submits task 1 and is graded (10 marks)
    const sub0 = await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: participantIds[0],
        status: "GRADED",
        autoGradeScore: 10,
        finalScore: 10,
        submittedAt: new Date(Date.now() - 60000),
      },
    });

    // Admin executes progressive leaderboard publication
    setTestSession({
      userId: adminId,
      name: "Progressive Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    const pubResult = await publishLeaderboardUpdateAction(contestId);

    assert.equal(pubResult.success, true, "Progressive publication should succeed");
    assert.equal(pubResult.publishedCount, 1, "Only 1 participant should be published");
    assert.equal(pubResult.totalEnrolled, 77, "Total enrolled should accurately report 77");
    assert.equal(pubResult.unsubmittedCount, 76, "76 participants remain unsubmitted");
    assert.equal(pubResult.pendingEvaluationCount, 0, "0 pending evaluation");
    assert.equal(pubResult.isPublished, true, "Contest leaderboard is now published");
    assert.equal(pubResult.isFinalCertification, false, "Must not be final certification");

    // Verify contest in DB remains LIVE
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
    assert.equal(contest.isPublished, true);
    assert.equal(contest.status, ContestStatus.LIVE, "Contest must remain LIVE so others can submit");

    // Verify CohortResult rows in DB: exactly 1 record
    const results = await prisma.cohortResult.findMany({ where: { contestId } });
    assert.equal(results.length, 1);
    assert.equal(results[0].userId, participantIds[0]);
    assert.equal(Number(results[0].totalScore), 10);
    assert.equal(results[0].rank, 1);

    // Verify participant 0 sees their scorecard & rank
    setTestSession({
      userId: participantIds[0],
      name: "Candidate 1",
      email: participantEmails[0],
      role: UserRole.PARTICIPANT,
    });
    const scorecard0 = await getParticipantScorecard(contestId);
    assert.notEqual(scorecard0, null);
    assert.equal(scorecard0?.isPublished, true);
    assert.equal(scorecard0?.rank, 1);
    assert.equal(scorecard0?.totalScore, 10);

    // Verify participant 1 (unsubmitted) sees published leaderboard with 1 row, but currentUserRank: null
    setTestSession({
      userId: participantIds[1],
      name: "Candidate 2",
      email: participantEmails[1],
      role: UserRole.PARTICIPANT,
    });
    const pLeaderboard = await getParticipantLeaderboard(contestId);
    assert.equal(pLeaderboard.isPublished, true);
    assert.equal(pLeaderboard.rows.length, 1);
    assert.equal(pLeaderboard.rows[0].userId, participantIds[0]);
    assert.equal(pLeaderboard.currentUserRank, null, "Unsubmitted participant must not have a rank or 0 score");

    // Unsubmitted participant scorecard should not show scores
    const scorecard1 = await getParticipantScorecard(contestId);
    assert.equal(scorecard1, null, "Unsubmitted participant has no submission, so scorecard is null");
  });

  test("2. Admin metrics: enrolled, submitted, unsubmitted, pending, and finalized are distinct", async () => {
    setTestSession({
      userId: adminId,
      name: "Progressive Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    const overview = await getAdminLeaderboardAndResults(contestId);
    assert.ok(overview.current);
    assert.equal(overview.current.totalEnrolled, 77);
    assert.equal(overview.current.totalSubmissions, 1);
    assert.equal(overview.current.unsubmittedCount, 76);
    assert.equal(overview.current.pendingEvaluationCount, 0);
    assert.equal(overview.current.finalizedCount, 1);
    assert.equal(overview.current.isPublished, true);

    const summary = await getAdminOverviewSummaryAction(contestId);
    assert.equal(summary.totalEnrolled, 77);
    assert.equal(summary.submittedCount, 1);
    assert.equal(summary.unsubmittedCount, 76);
    assert.equal(summary.pendingEvaluationCount, 0);
    assert.equal(summary.finalizedCount, 1);
  });

  test("3. Ungraded participant remains pending evaluation and is excluded from leaderboard", async () => {
    // Participant 1 submits but evaluation is pending (status SUBMITTED)
    // Wait: for a task with requiresManualGrading false, SUBMITTED with autoGradeScore would be auto-promoted.
    // So let's test a submission with status GRADING_IN_PROGRESS to simulate in-flight evaluation
    await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: participantIds[1],
        status: "GRADING_IN_PROGRESS",
        autoGradeScore: null,
        finalScore: null,
        submittedAt: new Date(),
      },
    });

    setTestSession({
      userId: adminId,
      name: "Progressive Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    // Overview should reflect 1 pending evaluation, 75 unsubmitted, 1 finalized
    const overview = await getAdminLeaderboardAndResults(contestId);
    assert.ok(overview.current);
    assert.equal(overview.current.totalEnrolled, 77);
    assert.equal(overview.current.totalSubmissions, 2);
    assert.equal(overview.current.unsubmittedCount, 75);
    assert.equal(overview.current.pendingEvaluationCount, 1);
    assert.equal(overview.current.finalizedCount, 1);

    // Publishing again should still only include the 1 finalized candidate
    const pubResult = await publishLeaderboardUpdateAction(contestId);
    assert.equal(pubResult.success, true);
    assert.equal(pubResult.publishedCount, 1);
    assert.equal(pubResult.pendingEvaluationCount, 1);
    assert.equal(pubResult.unsubmittedCount, 75);

    // Participant 1 does not have a CohortResult
    const p1Result = await prisma.cohortResult.findUnique({
      where: { contestId_userId: { contestId, userId: participantIds[1] } },
    });
    assert.equal(p1Result, null, "Pending candidate must not be published to CohortResult");
  });

  test("4. Additional finalized results: publish update re-ranks all eligible candidates", async () => {
    // Finalize participant 1 with score 8
    await prisma.submission.updateMany({
      where: { contestId, userId: participantIds[1] },
      data: {
        status: "GRADED",
        autoGradeScore: 8,
        finalScore: 8,
      },
    });

    // Add candidates 2, 3, 4, 5
    // Scores:
    // Cand 0: 10
    // Cand 1: 8
    // Cand 2: 10 (tied with Cand 0)
    // Cand 3: 8  (tied with Cand 1)
    // Cand 4: 6
    // Cand 5: 4
    await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: participantIds[2],
        status: "GRADED",
        autoGradeScore: 10,
        finalScore: 10,
        submittedAt: new Date(Date.now() - 50000),
      },
    });

    await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: participantIds[3],
        status: "GRADED",
        autoGradeScore: 8,
        finalScore: 8,
        submittedAt: new Date(Date.now() - 40000),
      },
    });

    await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: participantIds[4],
        status: "GRADED",
        autoGradeScore: 6,
        finalScore: 6,
        submittedAt: new Date(Date.now() - 30000),
      },
    });

    await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: participantIds[5],
        status: "GRADED",
        autoGradeScore: 4,
        finalScore: 4,
        submittedAt: new Date(Date.now() - 20000),
      },
    });

    setTestSession({
      userId: adminId,
      name: "Progressive Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    // Admin updates leaderboard
    const pubResult = await publishLeaderboardUpdateAction(contestId);
    assert.equal(pubResult.success, true);
    assert.equal(pubResult.publishedCount, 6, "All 6 finalized candidates should be published");
    assert.equal(pubResult.unsubmittedCount, 71, "71 candidates remain unsubmitted");
    assert.equal(pubResult.pendingEvaluationCount, 0);

    // Contest must still remain LIVE!
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
    assert.equal(contest.status, ContestStatus.LIVE);
  });

  test("5. Standard competition ranking (1224 rule) handles ties correctly", async () => {
    // We have 6 candidates:
    // Cand 0 (score 10) & Cand 2 (score 10) -> Tied for Rank 1
    // Cand 1 (score 8)  & Cand 3 (score 8)  -> Tied for Rank 3 (not Rank 2!)
    // Cand 4 (score 6)                      -> Rank 5 (not Rank 3 or 4!)
    // Cand 5 (score 4)                      -> Rank 6
    const results = await prisma.cohortResult.findMany({
      where: { contestId },
      orderBy: { rank: "asc" },
    });

    assert.equal(results.length, 6);

    const cand0Res = results.find((r) => r.userId === participantIds[0]);
    const cand2Res = results.find((r) => r.userId === participantIds[2]);
    const cand1Res = results.find((r) => r.userId === participantIds[1]);
    const cand3Res = results.find((r) => r.userId === participantIds[3]);
    const cand4Res = results.find((r) => r.userId === participantIds[4]);
    const cand5Res = results.find((r) => r.userId === participantIds[5]);

    assert.equal(cand0Res?.rank, 1, "Cand 0 should have Rank 1");
    assert.equal(cand2Res?.rank, 1, "Cand 2 should have Rank 1");
    assert.equal(cand1Res?.rank, 3, "Cand 1 should have Rank 3 (1224 rule)");
    assert.equal(cand3Res?.rank, 3, "Cand 3 should have Rank 3 (1224 rule)");
    assert.equal(cand4Res?.rank, 5, "Cand 4 should have Rank 5 (1224 rule)");
    assert.equal(cand5Res?.rank, 6, "Cand 5 should have Rank 6");
  });

  test("6. Idempotency: repeated publication does not duplicate records", async () => {
    setTestSession({
      userId: adminId,
      name: "Progressive Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    const secondPub = await publishLeaderboardUpdateAction(contestId);
    assert.equal(secondPub.success, true);
    assert.equal(secondPub.publishedCount, 6);

    const results = await prisma.cohortResult.findMany({
      where: { contestId },
    });
    assert.equal(results.length, 6, "Total CohortResult records must remain exactly 6");
  });

  test("7. Audit log preserves publication history across multiple updates", async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        targetId: contestId,
        action: "PUBLISH_LEADERBOARD_UPDATE",
      },
      orderBy: { createdAt: "asc" },
    });

    // We published multiple updates in tests 1, 3, 4, 6
    assert.ok(logs.length >= 3, `Expected at least 3 audit log entries, found ${logs.length}`);

    // Verify metadata of logs
    const firstLog = logs[0];
    const firstMeta = firstLog.metadata as any;
    assert.equal(firstMeta.publishedCount, 1);
    assert.equal(firstMeta.totalEnrolled, 77);
    assert.equal(firstMeta.adminEmail, adminEmail);

    const latestLog = logs[logs.length - 1];
    const latestMeta = latestLog.metadata as any;
    assert.equal(latestMeta.publishedCount, 6);
    assert.equal(latestMeta.unsubmittedCount, 71);
  });

  test("8. Strict final certification: rejected while unsubmitted candidates remain", async () => {
    setTestSession({
      userId: adminId,
      name: "Progressive Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    // Calling certifyAndLockContestAction when 71 candidates have not submitted must fail
    const certResult = await certifyAndLockContestAction(contestId);
    assert.equal(certResult.success, false, "Final certification must fail when unsubmitted candidates remain");
    assert.ok(
      certResult.error?.includes("has unsubmitted assessments"),
      `Expected error about unsubmitted assessments, got: ${certResult.error}`
    );

    // Contest remains LIVE
    const contest = await prisma.contest.findUniqueOrThrow({ where: { id: contestId } });
    assert.equal(contest.status, ContestStatus.LIVE, "Contest must remain LIVE");
  });

  test("9. Authorization guard: non-admin roles cannot publish updates", async () => {
    // Evaluator role
    setTestSession({
      userId: evaluatorId,
      name: "Progressive Evaluator",
      email: evaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    const evalResult = await publishLeaderboardUpdateAction(contestId);
    assert.equal(evalResult.success, false);
    assert.ok(
      evalResult.error?.includes("Forbidden") || evalResult.error?.includes("not authorized"),
      `Expected Forbidden error, got: ${evalResult.error}`
    );

    // Participant role
    setTestSession({
      userId: participantIds[0],
      name: "Candidate 1",
      email: participantEmails[0],
      role: UserRole.PARTICIPANT,
    });

    const candResult = await publishLeaderboardUpdateAction(contestId);
    assert.equal(candResult.success, false);
    assert.ok(
      candResult.error?.includes("Forbidden") || candResult.error?.includes("not authorized"),
      `Expected Forbidden error, got: ${candResult.error}`
    );
  });
});
