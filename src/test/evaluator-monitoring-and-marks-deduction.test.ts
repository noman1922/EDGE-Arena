/**
 * Dedicated Test Suite: Evaluator Participant Monitoring & Safe Marks Deduction
 *
 * Verifies:
 * 1. Participant-specific monitoring telemetry isolation (only events for the selected candidate are returned).
 * 2. Strict authorization enforcement (unassigned evaluator or participant rejected).
 * 3. Safe marks deduction validation (positive amount, precision limit, mandatory reason, cannot exceed eligible score).
 * 4. 5-vs-55 distinction and spelled-out textual formatting (e.g. "FIVE MARKS" vs "FIFTY-FIVE MARKS").
 * 5. Idempotent duplicate prevention (repeated requests with same idempotencyKey do not duplicate deductions).
 * 6. Audit trail & preservation of original MCQ answers, answer keys, and autoGradeScore.
 * 7. Published-result safeguards (evaluators blocked from altering published scores; admin override required).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  getParticipantMonitoringForEvaluatorAction,
  deductMarksAction,
} from "../app/actions/evaluator-actions";
import { formatMarksInWords } from "../lib/marks-formatter";
import { getContestPenalties } from "../lib/monitoring";

describe("Evaluator Participant Monitoring & Safe Marks Deduction", () => {
  const contestId = "99999999-1111-4000-8000-000000000001";
  const contestSlug = "eval-monitoring-deduct-test-contest";

  const adminEmail = "eval.admin.test@aciedge.edu";
  const assignedEvaluatorEmail = "eval.assigned.test@aciedge.edu";
  const unassignedEvaluatorEmail = "eval.unassigned.test@aciedge.edu";
  const candidate1Email = "eval.cand1.test@aciedge.edu";
  const candidate2Email = "eval.cand2.test@aciedge.edu";

  const adminId = "90000000-0000-4000-8000-000000000000";
  const assignedEvalId = "90000000-0000-4000-8000-000000000001";
  const unassignedEvalId = "90000000-0000-4000-8000-000000000002";
  const cand1Id = "90000000-0000-4000-8000-000000000011";
  const cand2Id = "90000000-0000-4000-8000-000000000012";

  const phaseId = "99999999-2222-4000-8000-000000000001";
  const taskId = "99999999-3333-4000-8000-000000000001";
  const questionId = "99999999-4444-4000-8000-000000000001";

  let sub1Id = "";
  let sub2Id = "";

  before(async () => {
    // 1. Create Users
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: UserRole.ADMIN },
      create: {
        id: adminId,
        email: adminEmail,
        name: "Test Admin",
        role: UserRole.ADMIN,
      },
    });

    await prisma.user.upsert({
      where: { email: assignedEvaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: assignedEvalId,
        email: assignedEvaluatorEmail,
        name: "Assigned Evaluator",
        role: UserRole.EVALUATOR,
      },
    });

    await prisma.user.upsert({
      where: { email: unassignedEvaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: unassignedEvalId,
        email: unassignedEvaluatorEmail,
        name: "Unassigned Evaluator",
        role: UserRole.EVALUATOR,
      },
    });

    await prisma.user.upsert({
      where: { email: candidate1Email },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: cand1Id,
        email: candidate1Email,
        name: "Candidate Alpha",
        candidateId: "CAND-ALPHA-01",
        role: UserRole.PARTICIPANT,
      },
    });

    await prisma.user.upsert({
      where: { email: candidate2Email },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: cand2Id,
        email: candidate2Email,
        name: "Candidate Beta",
        candidateId: "CAND-BETA-02",
        role: UserRole.PARTICIPANT,
      },
    });

    // 2. Create Contest, Phase, Task, Question
    const startDate = new Date(Date.now() - 3600 * 1000);
    const endDate = new Date(Date.now() + 3600 * 1000 * 24);

    await prisma.contest.upsert({
      where: { id: contestId },
      update: { status: ContestStatus.LIVE, isPublished: false },
      create: {
        id: contestId,
        title: "Evaluator Monitoring & Deduction Pilot",
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
      update: { status: PhaseStatus.OPEN },
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
      update: { totalPoints: 100 },
      create: {
        id: taskId,
        phaseId,
        title: "Task 1: Comprehensive Sales Review",
        taskNumber: 1,
        totalPoints: 100,
      },
    });

    await prisma.question.upsert({
      where: { id: questionId },
      update: { points: 100 },
      create: {
        id: questionId,
        taskId,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "Identify the primary sales methodology.",
        points: 100,
        options: {
          create: [
            { optionKey: "A", text: "Consultative Value Selling" },
            { optionKey: "B", text: "Cold Telemarketing" },
          ],
        },
        answerKey: {
          create: { correctOptionKey: "A" },
        },
      },
    });

    // 3. Enroll candidates
    await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId, userId: cand1Id } },
      update: {},
      create: { contestId, userId: cand1Id, status: "ENROLLED" },
    });
    await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId, userId: cand2Id } },
      update: {},
      create: { contestId, userId: cand2Id, status: "ENROLLED" },
    });

    // 4. Assign evaluator ONLY to Candidate 1 (not Candidate 2)
    const ce = await prisma.contestEvaluator.upsert({
      where: { contestId_userId: { contestId, userId: assignedEvalId } },
      update: {},
      create: { contestId, userId: assignedEvalId },
    });

    await prisma.evaluatorCandidateAssignment.upsert({
      where: {
        contestId_evaluatorId_participantId: {
          contestId,
          evaluatorId: assignedEvalId,
          participantId: cand1Id,
        },
      },
      update: { contestEvaluatorId: ce.id },
      create: {
        contestId,
        contestEvaluatorId: ce.id,
        evaluatorId: assignedEvalId,
        participantId: cand1Id,
      },
    });

    // 5. Create Submissions
    const sub1 = await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: cand1Id,
        status: "GRADED",
        autoGradeScore: 100,
        finalScore: 100,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId,
            selectedOption: "A",
            score: 100,
            isCorrect: true,
          },
        },
      },
    });
    sub1Id = sub1.id;

    const sub2 = await prisma.submission.create({
      data: {
        contestId,
        phaseId,
        taskId,
        userId: cand2Id,
        status: "GRADED",
        autoGradeScore: 80,
        finalScore: 80,
        submittedAt: new Date(),
        answers: {
          create: {
            questionId,
            selectedOption: "B",
            score: 80,
            isCorrect: false,
          },
        },
      },
    });
    sub2Id = sub2.id;

    // 6. Create Telemetry Events for Candidate 1 only
    await prisma.auditLog.create({
      data: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: `${cand1Id}:evt_cand1_tab_switch`,
        actorId: cand1Id,
        metadata: {
          contestId,
          eventType: "TAB_SWITCH",
          status: "Tab switch detected",
          details: "Candidate lost browser window focus for 12 seconds",
          severity: "HIGH",
          penaltyApplied: 5,
          timestamp: new Date().toISOString(),
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: `${cand1Id}:evt_cand1_fs_exit`,
        actorId: cand1Id,
        metadata: {
          contestId,
          eventType: "FULLSCREEN_EXIT",
          status: "Fullscreen mode exited",
          details: "Candidate pressed ESC and left fullscreen",
          severity: "HIGH",
          penaltyApplied: 5,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Create Telemetry Event for Candidate 2 (isolation check)
    await prisma.auditLog.create({
      data: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: `${cand2Id}:evt_cand2_heartbeat`,
        actorId: cand2Id,
        metadata: {
          contestId,
          eventType: "HEARTBEAT",
          status: "Active window session",
          details: "Candidate 2 secret event",
          severity: "INFO",
          timestamp: new Date().toISOString(),
        },
      },
    });
  });

  after(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { targetId: { contains: contestId } },
            { actorId: { in: [cand1Id, cand2Id, adminId, assignedEvalId, unassignedEvalId] } },
          ],
        },
      });
      await prisma.cohortResult.deleteMany({ where: { contestId } });
      await prisma.submissionAnswer.deleteMany({
        where: { submission: { contestId } },
      });
      await prisma.submission.deleteMany({ where: { contestId } });
      await prisma.evaluatorCandidateAssignment.deleteMany({ where: { contestId } });
      await prisma.contestEvaluator.deleteMany({ where: { contestId } });
      await prisma.contestParticipant.deleteMany({ where: { contestId } });
      await prisma.questionAnswerKey.deleteMany({ where: { question: { taskId } } });
      await prisma.mcqOption.deleteMany({ where: { question: { taskId } } });
      await prisma.question.deleteMany({ where: { taskId } });
      await prisma.task.deleteMany({ where: { phaseId } });
      await prisma.phase.deleteMany({ where: { contestId } });
      await prisma.contest.deleteMany({ where: { id: contestId } });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [
              adminEmail,
              assignedEvaluatorEmail,
              unassignedEvaluatorEmail,
              candidate1Email,
              candidate2Email,
            ],
          },
        },
      });
    } catch (err) {
      console.warn("Cleanup warning:", err);
    }
  });

  test("1. Monitoring isolation: evaluator only sees events for their assigned candidate", async () => {
    setTestSession({
      userId: assignedEvalId,
      name: "Assigned Evaluator",
      email: assignedEvaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    const result = await getParticipantMonitoringForEvaluatorAction(sub1Id);
    assert.equal(result.success, true);
    assert.equal(result.candidateName, "Candidate Alpha");
    assert.notEqual(result.events, undefined);
    assert.equal(result.events?.length, 2);

    // Verify events belong strictly to Candidate 1
    const eventTypes = result.events?.map((e) => e.eventType);
    assert.ok(eventTypes?.includes("TAB_SWITCH"));
    assert.ok(eventTypes?.includes("FULLSCREEN_EXIT"));
    assert.ok(!eventTypes?.includes("HEARTBEAT"), "Must not leak Candidate 2's heartbeat event");
    assert.equal(result.alertCount, 2);
  });

  test("2. Authorization guard: unassigned evaluator cannot view monitoring or deduct marks", async () => {
    setTestSession({
      userId: unassignedEvalId,
      name: "Unassigned Evaluator",
      email: unassignedEvaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    // Cannot view monitoring for Candidate 1
    const monRes = await getParticipantMonitoringForEvaluatorAction(sub1Id);
    assert.equal(monRes.success, false);
    assert.ok(monRes.error?.includes("Unauthorized") || monRes.error?.includes("not assigned"));

    // Cannot deduct marks for Candidate 1
    const deductRes = await deductMarksAction({
      submissionId: sub1Id,
      amount: 10,
      reason: "Unauthorized attempt",
    });
    assert.equal(deductRes.success, false);
    assert.ok(deductRes.error?.includes("Unauthorized") || deductRes.error?.includes("not assigned"));
  });

  test("3. 5-vs-55 textual distinction formatting", () => {
    assert.equal(formatMarksInWords(5), "FIVE MARKS");
    assert.equal(formatMarksInWords(55), "FIFTY-FIVE MARKS");
    assert.equal(formatMarksInWords(10), "TEN MARKS");
    assert.equal(formatMarksInWords(0), "ZERO MARKS");
    assert.equal(formatMarksInWords(1), "ONE MARK");
    assert.equal(formatMarksInWords(15.5), "FIFTEEN POINT FIVE MARKS");

    // Guarantee that 5 and 55 are completely distinct strings
    assert.notEqual(formatMarksInWords(5), formatMarksInWords(55));
    assert.ok(formatMarksInWords(55).includes("FIFTY"));
    assert.ok(!formatMarksInWords(5).includes("FIFTY"));
  });

  test("4. Safe marks deduction validation: rejects negative, zero, excessive precision, or excessive marks", async () => {
    setTestSession({
      userId: assignedEvalId,
      name: "Assigned Evaluator",
      email: assignedEvaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    // Negative amount
    const resNegative = await deductMarksAction({
      submissionId: sub1Id,
      amount: -5,
      reason: "Valid reason text",
    });
    assert.equal(resNegative.success, false);
    assert.ok(resNegative.error?.includes("positive number"));

    // Zero amount
    const resZero = await deductMarksAction({
      submissionId: sub1Id,
      amount: 0,
      reason: "Valid reason text",
    });
    assert.equal(resZero.success, false);
    assert.ok(resZero.error?.includes("positive number"));

    // Precision > 2 decimal places
    const resPrecision = await deductMarksAction({
      submissionId: sub1Id,
      amount: 5.125,
      reason: "Valid reason text",
    });
    assert.equal(resPrecision.success, false);
    assert.ok(resPrecision.error?.includes("decimal places"));

    // Mandatory reason missing or too short
    const resShortReason = await deductMarksAction({
      submissionId: sub1Id,
      amount: 5,
      reason: "bad",
    });
    assert.equal(resShortReason.success, false);
    assert.ok(resShortReason.error?.includes("at least 5 characters"));

    // Amount exceeds eligible score (current score is 100, cannot deduct 150)
    const resExceeds = await deductMarksAction({
      submissionId: sub1Id,
      amount: 150,
      reason: "Valid penalty explanation",
    });
    assert.equal(resExceeds.success, false);
    assert.ok(resExceeds.error?.includes("exceeds the candidate's eligible score"));
  });

  test("5. Valid marks deduction: updates finalScore, records audit trail, preserves MCQ answers", async () => {
    setTestSession({
      userId: assignedEvalId,
      name: "Assigned Evaluator",
      email: assignedEvaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    const idempotencyKey = "deduct-test-key-001";
    const res = await deductMarksAction({
      submissionId: sub1Id,
      amount: 15,
      reason: "Confirmed unauthorized notes violation during examination",
      idempotencyKey,
    });

    assert.equal(res.success, true);
    assert.equal(res.originalScore, 100);
    assert.equal(res.deductionAmount, 15);
    assert.equal(res.adjustedScore, 85);
    assert.equal(res.spelledMarks, "FIFTEEN MARKS");

    // Check Submission finalScore was updated to 85
    const subInDb = await prisma.submission.findUniqueOrThrow({
      where: { id: sub1Id },
      include: { answers: true },
    });
    assert.equal(Number(subInDb.finalScore), 85);
    assert.equal(Number(subInDb.autoGradeScore), 100, "autoGradeScore must remain intact");

    // Check MCQ answers and score were NOT overwritten
    assert.equal(subInDb.answers.length, 1);
    assert.equal(subInDb.answers[0].selectedOption, "A");
    assert.equal(Number(subInDb.answers[0].score), 100);
    assert.equal(subInDb.answers[0].isCorrect, true);

    // Check AuditLog entry
    const auditRecord = await prisma.auditLog.findFirstOrThrow({
      where: {
        targetType: "CONTEST_PENALTY",
        action: "APPLY_SCORE_DEDUCTION",
      },
    });
    const meta = auditRecord.metadata as any;
    assert.equal(meta.points, 15);
    assert.equal(meta.originalScore, 100);
    assert.equal(meta.adjustedScore, 85);
    assert.equal(meta.evaluatorEmail, assignedEvaluatorEmail);
  });

  test("6. Idempotency: repeated deduction clicks with same idempotencyKey do not duplicate deduction", async () => {
    setTestSession({
      userId: assignedEvalId,
      name: "Assigned Evaluator",
      email: assignedEvaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    // Re-send with the EXACT same idempotencyKey as test 5
    const repeatRes = await deductMarksAction({
      submissionId: sub1Id,
      amount: 15,
      reason: "Confirmed unauthorized notes violation during examination",
      idempotencyKey: "deduct-test-key-001",
    });

    assert.equal(repeatRes.success, true);
    assert.equal(repeatRes.duplicate, true, "Must flag request as duplicate");

    // Final score in DB should still be 85, NOT 70!
    const subInDb = await prisma.submission.findUniqueOrThrow({ where: { id: sub1Id } });
    assert.equal(Number(subInDb.finalScore), 85, "Duplicate request must not deduct score twice");
  });

  test("7. Published-result safeguards: evaluator blocked; admin override required", async () => {
    // 1. Simulate published contest result for Candidate 1
    await prisma.contest.update({
      where: { id: contestId },
      data: { isPublished: true },
    });

    await prisma.cohortResult.create({
      data: {
        contestId,
        userId: cand1Id,
        totalScore: 85,
        rank: 1,
        percentile: 100,
        isCertified: true,
      },
    });

    // Evaluator tries to deduct marks on published assessment -> REJECTED
    setTestSession({
      userId: assignedEvalId,
      name: "Assigned Evaluator",
      email: assignedEvaluatorEmail,
      role: UserRole.EVALUATOR,
    });

    const evalRes = await deductMarksAction({
      submissionId: sub1Id,
      amount: 5,
      reason: "Late discovery of proctoring discrepancy",
    });
    assert.equal(evalRes.success, false);
    assert.ok(
      evalRes.error?.includes("already been published") &&
      evalRes.error?.includes("Administrator authorization"),
      `Expected published assessment error, got: ${evalRes.error}`
    );

    // Admin tries without explicit confirmPublishedOverride -> REJECTED
    setTestSession({
      userId: adminId,
      name: "Test Admin",
      email: adminEmail,
      role: UserRole.ADMIN,
    });

    const adminNoConfirmRes = await deductMarksAction({
      submissionId: sub1Id,
      amount: 5,
      reason: "Late discovery of proctoring discrepancy",
      confirmPublishedOverride: false,
    });
    assert.equal(adminNoConfirmRes.success, false);
    assert.ok(adminNoConfirmRes.error?.includes("Explicit confirmation"));

    // Admin with confirmPublishedOverride -> SUCCEEDS & UPDATES COHORT RESULT
    const adminConfirmedRes = await deductMarksAction({
      submissionId: sub1Id,
      amount: 5,
      reason: "Late discovery of proctoring discrepancy with administrator review",
      confirmPublishedOverride: true,
      idempotencyKey: "admin-published-override-001",
    });
    assert.equal(adminConfirmedRes.success, true);
    assert.equal(adminConfirmedRes.adjustedScore, 80);

    // Verify CohortResult was updated to 80
    const cohortInDb = await prisma.cohortResult.findUniqueOrThrow({
      where: { contestId_userId: { contestId, userId: cand1Id } },
    });
    assert.equal(Number(cohortInDb.totalScore), 80);
  });
});

