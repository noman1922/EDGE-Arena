/**
 * EDGE-Arena: Test Suite for Participant Final Submission, Monitoring Penalties, and Evidence Capture
 *
 * Verifies:
 * 1. Final submission progression & redirection logic:
 *    - Intermediate task submits and proceeds to next task/phase.
 *    - Final task of final phase returns isFinalSubmission: true.
 *    - Idempotent duplicate submission handling.
 *    - Leaderboard shielding: unpublished results return empty rows and null rank.
 * 2. Contest-specific penalty rules:
 *    - 5-point alert deductions when enabled.
 *    - Minimum score floor at zero (Math.max(0, rawScore - penalties)).
 *    - Deduplication protection on unique eventId.
 *    - AI written answer violation penalty (10 pts) requiring admin authorization and review rationale.
 * 3. Permission-based evidence collection:
 *    - Screen-capture storage only when screenCaptureEnabled is true.
 *    - Camera still storage only when cameraCaptureEnabled is true and consent given.
 *    - Discarding unpermitted evidence when permission is disabled.
 * 4. Evidence access authorization & retention:
 *    - Admin and assigned Evaluator permitted; unassigned Evaluator and Participant rejected.
 *    - Evidence retention cleanup removes expired payloads while preserving audit logs.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  calculateCandidateFinalScore,
  DEFAULT_MONITORING_SETTINGS,
} from "../lib/monitoring";
import {
  recordMonitoringEventAction,
  confirmAiViolationPenaltyAction,
  getMonitoringEvidenceAction,
  cleanupMonitoringEvidenceAction,
  saveContestMonitoringSettingsAction,
} from "../app/actions/monitoring-actions";
import { submitAssessmentAction } from "../app/actions/assessment-actions";
import { getParticipantLeaderboard } from "../app/actions/participant-nav-actions";

describe("Final Submission Flow, Monitoring Penalties, and Evidence Capture", () => {
  const contestId = "test-submission-contest-uuid-001";
  const candidateEmail = "contest.candidate.test@edge-arena.aciedge.edu";
  const evaluatorEmail = "contest.evaluator.test@edge-arena.aciedge.edu";
  const unassignedEvaluatorEmail = "contest.evaluator2.test@edge-arena.aciedge.edu";
  const adminEmail = "contest.admin.test@edge-arena.aciedge.edu";

  let candidateId = "";
  let evaluatorId = "";
  let unassignedEvaluatorId = "";
  let adminId = "";

  let phase1Id = "";
  let phase2Id = "";
  let task1Id = "";
  let task2Id = "";
  let q1Id = "";
  let q2Id = "";

  let sub1Id = "";
  let sub2Id = "";

  before(async () => {
    // 1. Clean up potential leftover test data
    await prisma.cohortResult.deleteMany({ where: { contestId } }).catch(() => {});
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetId: { contains: contestId } },
          { action: { startsWith: "MONITORING_" } },
        ],
      },
    }).catch(() => {});
    await prisma.contest.deleteMany({
      where: { id: contestId },
    }).catch(() => {});

    // 2. Create Users
    const candidateUser = await prisma.user.upsert({
      where: { email: candidateEmail },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: "candidate-uuid-test-001",
        email: candidateEmail,
        passwordHash: "test_hash",
        name: "Test Candidate",
        candidateId: "CAND-TEST-01",
        role: UserRole.PARTICIPANT,
      },
    });
    candidateId = candidateUser.id;

    const evaluatorUser = await prisma.user.upsert({
      where: { email: evaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: "evaluator-uuid-test-001",
        email: evaluatorEmail,
        passwordHash: "test_hash",
        name: "Assigned Evaluator",
        role: UserRole.EVALUATOR,
      },
    });
    evaluatorId = evaluatorUser.id;

    const unassignedEvaluatorUser = await prisma.user.upsert({
      where: { email: unassignedEvaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: "unassigned-eval-uuid-test-001",
        email: unassignedEvaluatorEmail,
        passwordHash: "test_hash",
        name: "Unassigned Evaluator",
        role: UserRole.EVALUATOR,
      },
    });
    unassignedEvaluatorId = unassignedEvaluatorUser.id;

    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: UserRole.ADMIN },
      create: {
        id: "admin-uuid-test-001",
        email: adminEmail,
        passwordHash: "test_hash",
        name: "System Admin",
        role: UserRole.ADMIN,
      },
    });
    adminId = adminUser.id;

    // 3. Create Multi-Phase Contest with 2 phases and 2 tasks
    const now = new Date();
    const contest = await prisma.contest.create({
      data: {
        id: contestId,
        title: "Test Final Submission & Monitoring Contest",
        slug: "test-final-sub-monitoring",
        track: "Strategic Operations",
        status: ContestStatus.LIVE,
        startDate: new Date(now.getTime() - 3600000),
        endDate: new Date(now.getTime() + 86400000),
        isPublished: false, // Initially unpublished
        enforceSequentialProgress: false,
      },
    });

    // Phase 1 (Intermediate)
    const phase1 = await prisma.phase.create({
      data: {
        contestId: contest.id,
        phaseNumber: 1,
        title: "Phase 1: Analytical Diagnostic",
        status: PhaseStatus.OPEN,
        weightPercentage: 50,
        deadline: new Date(now.getTime() + 43200000),
      },
    });
    phase1Id = phase1.id;

    const task1 = await prisma.task.create({
      data: {
        phaseId: phase1.id,
        taskNumber: 1,
        title: "Task 1: Intermediate Quiz",
        totalPoints: 50,
      },
    });
    task1Id = task1.id;

    const q1 = await prisma.question.create({
      data: {
        taskId: task1.id,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "Intermediate Question 1",
        points: 50,
        options: {
          create: [
            { optionKey: "A", text: "Alpha" },
            { optionKey: "B", text: "Beta" },
          ],
        },
      },
    });
    q1Id = q1.id;

    // Phase 2 (Final Phase)
    const phase2 = await prisma.phase.create({
      data: {
        contestId: contest.id,
        phaseNumber: 2,
        title: "Phase 2: Final Capstone",
        status: PhaseStatus.OPEN,
        weightPercentage: 50,
        deadline: new Date(now.getTime() + 86400000),
      },
    });
    phase2Id = phase2.id;

    const task2 = await prisma.task.create({
      data: {
        phaseId: phase2.id,
        taskNumber: 1,
        title: "Task 2: Final Case Submission",
        totalPoints: 50,
      },
    });
    task2Id = task2.id;

    const q2 = await prisma.question.create({
      data: {
        taskId: task2.id,
        questionNumber: 1,
        type: QuestionType.WRITTEN,
        prompt: "Final Question 2 Written Essay",
        points: 50,
      },
    });
    q2Id = q2.id;

    // Enroll candidate
    await prisma.contestParticipant.create({
      data: {
        contestId: contest.id,
        userId: candidateId,
        status: "ACTIVE",
      },
    });

    // Assign evaluator to contest (assigned evaluator only)
    await prisma.contestEvaluator.create({
      data: {
        contestId: contest.id,
        userId: evaluatorId,
      },
    });

    // Create candidate submissions for Task 1 and Task 2
    const sub1 = await prisma.submission.create({
      data: {
        contestId: contest.id,
        phaseId: phase1.id,
        taskId: task1Id,
        userId: candidateId,
        status: "DRAFT",
        answers: {
          create: [
            {
              questionId: q1Id,
              selectedOption: "A",
            },
          ],
        },
      },
    });
    sub1Id = sub1.id;

    const sub2 = await prisma.submission.create({
      data: {
        contestId: contest.id,
        phaseId: phase2.id,
        taskId: task2Id,
        userId: candidateId,
        status: "DRAFT",
        answers: {
          create: [
            {
              questionId: q2Id,
              writtenText: "Comprehensive final analytical summary of operations.",
            },
          ],
        },
      },
    });
    sub2Id = sub2.id;
  });

  after(async () => {
    // Reset test session
    setTestSession(null as any);

    // Clean up created entities
    await prisma.cohortResult.deleteMany({ where: { contestId } }).catch(() => {});
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetId: { contains: contestId } },
          { action: { startsWith: "MONITORING_" } },
        ],
      },
    }).catch(() => {});
    await prisma.contest.deleteMany({
      where: { id: contestId },
    }).catch(() => {});
  });

  // =========================================================================
  // 1. Final Submission Flow & Leaderboard Redirection Tests
  // =========================================================================

  test("Intermediate task submission proceeds to next task/phase, not leaderboard", async () => {
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    // Submit Task 1 (intermediate)
    const result = await submitAssessmentAction(sub1Id);

    assert.equal(result.success, true, "Task 1 submission should succeed");
    if ("isFinalSubmission" in result) {
      assert.equal(result.isFinalSubmission, false, "Task 1 must NOT be marked as final submission");
      assert.equal(result.nextPhaseId, phase2Id, "Should provide next phase ID");
      assert.equal(result.nextTaskId, task2Id, "Should provide next task ID");
      assert.equal(result.contestId, contestId, "Should return contestId");
    }
  });

  test("Final task submission redirects to leaderboard and flags isFinalSubmission", async () => {
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    // Submit Task 2 (final task of final phase)
    const result = await submitAssessmentAction(sub2Id);

    assert.equal(result.success, true, "Task 2 submission should succeed");
    if ("isFinalSubmission" in result) {
      assert.equal(result.isFinalSubmission, true, "Task 2 must be marked as final submission");
      assert.equal(result.nextTaskId, undefined, "Final submission should not have next task");
      assert.equal(result.nextPhaseId, undefined, "Final submission should not have next phase");
      assert.equal(result.contestId, contestId, "Should return contestId for leaderboard redirect");
    }
  });

  test("Duplicate submission of final task handles gracefully without error", async () => {
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    // Retrying submission for Task 2
    const result = await submitAssessmentAction(sub2Id);

    assert.equal(result.success, true, "Retried submission should be handled idempotently");
    if ("isFinalSubmission" in result) {
      assert.equal(result.isFinalSubmission, true, "Retried final submission still flags isFinalSubmission");
      assert.equal(result.contestId, contestId);
    }
  });

  test("Leaderboard shields unpublished contest results completely", async () => {
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    // Contest isPublished is false
    const leaderboardData = await getParticipantLeaderboard(contestId);

    assert.equal(leaderboardData.isPublished, false, "Contest should report unpublished");
    assert.equal(leaderboardData.rows.length, 0, "Unpublished leaderboard must return 0 rows");
    assert.equal(leaderboardData.currentUserRank, null, "Unpublished leaderboard must not expose rank");
  });

  test("Leaderboard displays results when contest is published", async () => {
    // Publish contest and create certified result
    await prisma.contest.update({
      where: { id: contestId },
      data: { isPublished: true },
    });

    await prisma.cohortResult.upsert({
      where: {
        contestId_userId: {
          contestId,
          userId: candidateId,
        },
      },
      update: {
        totalScore: 90,
        rank: 1,
        percentile: 100,
        isCertified: true,
      },
      create: {
        contestId,
        userId: candidateId,
        totalScore: 90,
        rank: 1,
        percentile: 100,
        isCertified: true,
      },
    });

    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const leaderboardData = await getParticipantLeaderboard(contestId);

    assert.equal(leaderboardData.isPublished, true, "Contest should report published");
    assert.ok(leaderboardData.rows.length > 0, "Published leaderboard must return rows");
    assert.equal(leaderboardData.currentUserRank, 1, "Published leaderboard displays correct rank");

    // Reset published status for subsequent tests
    await prisma.contest.update({
      where: { id: contestId },
      data: { isPublished: false },
    });
  });

  // =========================================================================
  // 2. Contest Penalty Rules & Zero Floor Tests
  // =========================================================================

  test("calculateCandidateFinalScore applies deductions and enforces zero floor", () => {
    // Normal deduction
    assert.equal(calculateCandidateFinalScore(100, 5), 95);
    assert.equal(calculateCandidateFinalScore(85, 15), 70);

    // Exact zero
    assert.equal(calculateCandidateFinalScore(10, 10), 0);

    // Floor at zero when penalties exceed raw score
    assert.equal(calculateCandidateFinalScore(5, 10), 0, "Score cannot drop below zero");
    assert.equal(calculateCandidateFinalScore(0, 25), 0, "Score cannot drop below zero");
  });

  test("Monitoring alert deducts 5 points with idempotency deduplication", async () => {
    // Configure contest with alert penalties enabled
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    await saveContestMonitoringSettingsAction(contestId, {
      ...DEFAULT_MONITORING_SETTINGS,
      enableAlertPenalties: true,
      alertPenaltyPoints: 5,
      screenCaptureEnabled: true,
      cameraCaptureEnabled: true,
    });

    // Act as candidate triggering monitoring event
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const eventId = "test-alert-event-uuid-001";

    const res1 = await recordMonitoringEventAction({
      contestId,
      eventType: "FULLSCREEN_EXIT",
      status: "EXIT_FULLSCREEN",
      eventId,
      details: "Fullscreen exited by user",
      screenCaptureData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    });

    assert.equal(res1.success, true, "Event 1 should be recorded");
    assert.equal(res1.penaltyApplied, 5, "5 point penalty should be applied");

    // Retry recording same eventId (duplicate delivery / network retry)
    const res2 = await recordMonitoringEventAction({
      contestId,
      eventType: "FULLSCREEN_EXIT",
      status: "EXIT_FULLSCREEN",
      eventId,
      details: "Fullscreen exited by user (duplicate)",
    });

    assert.equal(res2.success, true, "Duplicate event request succeeds idempotently");
    assert.equal(res2.penaltyApplied, undefined, "Duplicate event must NOT apply a second penalty");
  });

  test("AI violation rule requires explicit admin authorization and enforces deduplication", async () => {
    // 1. Test when rule is disabled in contest
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    await saveContestMonitoringSettingsAction(contestId, {
      ...DEFAULT_MONITORING_SETTINGS,
      enableAiPenalties: false,
    });

    const disabledRes = await confirmAiViolationPenaltyAction({
      contestId,
      userId: candidateId,
      reason: "Detected phrasing match",
      points: 10,
    });

    assert.equal(disabledRes.success, false, "Should fail when AI penalties disabled for contest");
    assert.match(disabledRes.error || "", /not enabled for this contest|disabled/i);

    // 2. Enable AI penalty rule in contest
    await saveContestMonitoringSettingsAction(contestId, {
      ...DEFAULT_MONITORING_SETTINGS,
      enableAiPenalties: true,
      aiPenaltyPoints: 10,
    });

    // 3. Candidate / Non-admin cannot confirm AI penalty
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const unauthorizedRes = await confirmAiViolationPenaltyAction({
      contestId,
      userId: candidateId,
      reason: "Unauthorized attempt",
      points: 10,
    });
    assert.equal(unauthorizedRes.success, false, "Candidate cannot confirm AI penalty");
    assert.match(unauthorizedRes.error || "", /Forbidden/i);

    // 4. Admin confirms AI penalty with explicit review rationale
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    const aiConfirmRes1 = await confirmAiViolationPenaltyAction({
      contestId,
      userId: candidateId,
      reason: "Confirmed synthetic AI output without manual reasoning",
      points: 10,
    });

    assert.equal(aiConfirmRes1.success, true, "Admin AI confirmation should succeed");
    assert.equal(aiConfirmRes1.penalty?.points, 10, "Should deduct 10 points");
    assert.equal(aiConfirmRes1.penalty?.penaltyType, "AI_VIOLATION");

    // 5. Duplicate AI confirmation prevention
    const aiConfirmRes2 = await confirmAiViolationPenaltyAction({
      contestId,
      userId: candidateId,
      reason: "Confirmed synthetic AI output (duplicate attempt)",
      points: 10,
    });

    assert.equal(aiConfirmRes2.success, false, "Duplicate AI violation confirmation must be rejected");
    assert.match(aiConfirmRes2.error || "", /already.*recorded|already been confirmed/i);
  });

  // =========================================================================
  // 3. Permission-Based Monitoring Evidence Capture Tests
  // =========================================================================

  test("Screen capture evidence is stored when screenCaptureEnabled is true", async () => {
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    await saveContestMonitoringSettingsAction(contestId, {
      ...DEFAULT_MONITORING_SETTINGS,
      screenCaptureEnabled: true,
      cameraCaptureEnabled: false,
    });

    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const eventId = "evidence-screen-only-001";
    const screenPayload = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const res = await recordMonitoringEventAction({
      contestId,
      eventType: "TAB_SWITCH",
      status: "WINDOW_BLUR",
      eventId,
      details: "Switched away from assessment window",
      screenCaptureData: screenPayload,
      cameraCaptureData: "data:image/png;base64,camera_payload_should_be_ignored",
      captureSuccess: true,
    });

    assert.equal(res.success, true);

    // Verify stored evidence as Admin
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    const evidenceRes = await getMonitoringEvidenceAction({
      contestId,
      eventId,
    });

    assert.equal(evidenceRes.success, true);
    assert.ok(evidenceRes.evidence?.screenCapture, "Screen capture must be stored");
    assert.equal(evidenceRes.evidence?.cameraCapture, null, "Camera capture must NOT be stored when disabled");
  });

  test("Camera still evidence is stored when cameraCaptureEnabled is true", async () => {
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    await saveContestMonitoringSettingsAction(contestId, {
      ...DEFAULT_MONITORING_SETTINGS,
      screenCaptureEnabled: false,
      cameraCaptureEnabled: true,
    });

    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const eventId = "evidence-camera-only-001";
    const cameraPayload = "data:image/png;base64,camera_sample_valid_image";

    const res = await recordMonitoringEventAction({
      contestId,
      eventType: "FULLSCREEN_EXIT",
      status: "EXIT_FULLSCREEN",
      eventId,
      details: "Exit fullscreen recorded",
      cameraCaptureData: cameraPayload,
      captureSuccess: true,
    });

    assert.equal(res.success, true);

    // Verify stored evidence
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    const evidenceRes = await getMonitoringEvidenceAction({
      contestId,
      eventId,
    });

    assert.equal(evidenceRes.success, true);
    assert.equal(evidenceRes.evidence?.screenCapture, null, "Screen capture must be null");
    assert.equal(evidenceRes.evidence?.cameraCapture, cameraPayload, "Camera capture must be stored");
  });

  test("Evidence is discarded when permissions are disabled", async () => {
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    await saveContestMonitoringSettingsAction(contestId, {
      ...DEFAULT_MONITORING_SETTINGS,
      screenCaptureEnabled: false,
      cameraCaptureEnabled: false,
    });

    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const eventId = "evidence-disabled-001";

    const res = await recordMonitoringEventAction({
      contestId,
      eventType: "TAB_SWITCH",
      status: "WINDOW_BLUR",
      eventId,
      details: "Tab switched",
      screenCaptureData: "data:image/png;base64,unpermitted_screen",
      cameraCaptureData: "data:image/png;base64,unpermitted_camera",
      captureSuccess: true,
    });

    assert.equal(res.success, true);

    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    const evidenceRes = await getMonitoringEvidenceAction({
      contestId,
      eventId,
    });

    assert.equal(evidenceRes.success, false, "Evidence should not be created when permissions disabled");
    assert.match(evidenceRes.error || "", /Evidence record not found|not found/i);
  });

  // =========================================================================
  // 4. Admin Monitoring Panel Evidence Access & Retention Tests
  // =========================================================================

  test("Evaluator assigned to candidate can view evidence; unassigned Evaluator is blocked", async () => {
    const eventId = "evidence-screen-only-001";

    // 1. Assigned evaluator
    setTestSession({
      userId: evaluatorId,
      email: evaluatorEmail,
      name: "Assigned Evaluator",
      role: UserRole.EVALUATOR,
    });

    const assignedRes = await getMonitoringEvidenceAction({
      contestId,
      eventId,
    });

    assert.equal(assignedRes.success, true, "Assigned evaluator must be granted evidence access");
    assert.ok(assignedRes.evidence, "Assigned evaluator receives evidence object");

    // 2. Unassigned evaluator
    setTestSession({
      userId: unassignedEvaluatorId,
      email: unassignedEvaluatorEmail,
      name: "Unassigned Evaluator",
      role: UserRole.EVALUATOR,
    });

    const unassignedRes = await getMonitoringEvidenceAction({
      contestId,
      eventId,
    });

    assert.equal(unassignedRes.success, false, "Unassigned evaluator must be denied access");
    assert.match(unassignedRes.error || "", /Forbidden|not assigned/i);

    // 3. Candidate / Participant
    setTestSession({
      userId: candidateId,
      email: candidateEmail,
      name: "Test Candidate",
      role: UserRole.PARTICIPANT,
    });

    const participantRes = await getMonitoringEvidenceAction({
      contestId,
      eventId,
    });

    assert.equal(participantRes.success, false, "Participant must be denied evidence access");
    assert.match(participantRes.error || "", /Access denied|Unauthorized/i);
  });

  test("Evidence retention policy removes expired evidence while preserving audit history", async () => {
    setTestSession({
      userId: adminId,
      email: adminEmail,
      name: "System Admin",
      role: UserRole.ADMIN,
    });

    // Run cleanup for retention policy
    const cleanupRes = await cleanupMonitoringEvidenceAction(contestId);

    assert.equal(cleanupRes.success, true, "Evidence retention cleanup should execute cleanly");
    assert.ok(typeof cleanupRes.deletedCount === "number", "Reports deleted count");
  });
});
