import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType, SubmissionStatus } from "@prisma/client";
import {
  getTaskAssessmentData,
  startAssessmentAttemptAction,
  saveAnswerDraftAction,
  submitAssessmentAction,
  autoFinalizeExpiredAttemptAction,
  autoFinalizeExpiredSubmissionInternal,
  getContestDeadlineAction,
} from "../app/actions/assessment-actions";
import {
  createContestAction,
  updateContestAction,
} from "../app/actions/contest-actions";
import {
  updateTaskAction,
} from "../app/actions/task-builder-actions";
import { getAuthoritativeAttemptDeadline } from "../lib/contest-lifecycle";

describe("EDGE-Arena: Individual Assessment Timer & Expiry Enforcement Test Suite", () => {
  const testAdminId = "66000000-0000-4000-8000-000000000001";
  const testParticipantAId = "66000000-0000-4000-8000-000000000002";
  const testParticipantBId = "66000000-0000-4000-8000-000000000003";

  const testContestId = "66000000-0000-4000-8000-000000000010";
  const testUntimedContestId = "66000000-0000-4000-8000-000000000020";
  const testPhaseId = "66000000-0000-4000-8000-000000000011";
  const testUntimedPhaseId = "66000000-0000-4000-8000-000000000021";
  const testTaskId = "66000000-0000-4000-8000-000000000012";
  const testUntimedTaskId = "66000000-0000-4000-8000-000000000022";
  const testMcqQ1Id = "66000000-0000-4000-8000-000000000013";
  const testMcqQ2Id = "66000000-0000-4000-8000-000000000014";
  const testWrittenQ3Id = "66000000-0000-4000-8000-000000000015";

  let createdContestIdByAdmin = "";

  before(async () => {
    // 1. Seed test users
    await prisma.user.upsert({
      where: { id: testAdminId },
      update: { role: UserRole.ADMIN },
      create: {
        id: testAdminId,
        email: "timer.admin@aciedge.edu",
        name: "Timer Admin",
        role: UserRole.ADMIN,
      },
    });

    await prisma.user.upsert({
      where: { id: testParticipantAId },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: testParticipantAId,
        email: "partA.timer@aciedge.edu",
        name: "Participant Alpha",
        candidateId: "TIMER-CAND-A",
        role: UserRole.PARTICIPANT,
      },
    });

    await prisma.user.upsert({
      where: { id: testParticipantBId },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: testParticipantBId,
        email: "partB.timer@aciedge.edu",
        name: "Participant Beta",
        candidateId: "TIMER-CAND-B",
        role: UserRole.PARTICIPANT,
      },
    });

    // 2. Seed Timed Contest (durationMinutes = 30)
    await prisma.contest.upsert({
      where: { id: testContestId },
      update: {
        status: ContestStatus.LIVE,
        durationMinutes: 30,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
      create: {
        id: testContestId,
        title: "Individual Timer Assessment Contest",
        slug: "individual-timer-assessment-contest",
        track: "Technology",
        status: ContestStatus.LIVE,
        durationMinutes: 30,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
    });

    // Enroll participants into timed contest
    await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId: testContestId, userId: testParticipantAId } },
      update: { status: "ENROLLED" },
      create: { contestId: testContestId, userId: testParticipantAId, status: "ENROLLED" },
    });
    await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId: testContestId, userId: testParticipantBId } },
      update: { status: "ENROLLED" },
      create: { contestId: testContestId, userId: testParticipantBId, status: "ENROLLED" },
    });

    // 3. Seed Timed Phase & Task
    await prisma.phase.upsert({
      where: { id: testPhaseId },
      update: { status: PhaseStatus.OPEN, deadline: new Date("2026-12-31T23:59:59Z") },
      create: {
        id: testPhaseId,
        contestId: testContestId,
        phaseNumber: 1,
        title: "Timed Phase 1",
        weightPercentage: 100,
        deadline: new Date("2026-12-31T23:59:59Z"),
        status: PhaseStatus.OPEN,
      },
    });

    await prisma.task.upsert({
      where: { id: testTaskId },
      update: { durationMinutes: 30, totalPoints: 50 },
      create: {
        id: testTaskId,
        phaseId: testPhaseId,
        taskNumber: 1,
        title: "Timed Comprehensive Benchmark",
        totalPoints: 50,
        durationMinutes: 30,
      },
    });

    // Q1: Answered MCQ (20 pts) - correct is B
    await prisma.question.upsert({
      where: { id: testMcqQ1Id },
      update: { points: 20 },
      create: {
        id: testMcqQ1Id,
        taskId: testTaskId,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "What is the time complexity of binary search?",
        points: 20,
        isMandatory: true,
        options: {
          create: [
            { optionKey: "A", text: "O(1)" },
            { optionKey: "B", text: "O(log n)" },
            { optionKey: "C", text: "O(n)" },
          ],
        },
        answerKey: {
          create: {
            correctOptionKey: "B",
            explanation: "O(log n) halves the search space.",
          },
        },
      },
    });

    // Q2: Unanswered MCQ (15 pts) - correct is A
    await prisma.question.upsert({
      where: { id: testMcqQ2Id },
      update: { points: 15 },
      create: {
        id: testMcqQ2Id,
        taskId: testTaskId,
        questionNumber: 2,
        type: QuestionType.MCQ,
        prompt: "What is the worst-case lookup in a hash table with good hashing?",
        points: 15,
        isMandatory: false,
        options: {
          create: [
            { optionKey: "A", text: "O(1)" },
            { optionKey: "B", text: "O(n)" },
          ],
        },
        answerKey: {
          create: {
            correctOptionKey: "A",
            explanation: "Average/expected is O(1).",
          },
        },
      },
    });

    // Q3: Written Essay Question (15 pts)
    await prisma.question.upsert({
      where: { id: testWrittenQ3Id },
      update: { points: 15 },
      create: {
        id: testWrittenQ3Id,
        taskId: testTaskId,
        questionNumber: 3,
        type: QuestionType.WRITTEN,
        prompt: "Explain how ACID properties guarantee transactional integrity in financial databases.",
        points: 15,
        isMandatory: true,
      },
    });

    // 4. Seed Untimed Contest & Task
    await prisma.contest.upsert({
      where: { id: testUntimedContestId },
      update: {
        status: ContestStatus.LIVE,
        durationMinutes: null,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
      create: {
        id: testUntimedContestId,
        title: "Untimed Open Benchmark",
        slug: "untimed-open-benchmark",
        track: "Operations",
        status: ContestStatus.LIVE,
        durationMinutes: null,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
    });

    await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId: testUntimedContestId, userId: testParticipantAId } },
      update: { status: "ENROLLED" },
      create: { contestId: testUntimedContestId, userId: testParticipantAId, status: "ENROLLED" },
    });

    await prisma.phase.upsert({
      where: { id: testUntimedPhaseId },
      update: { status: PhaseStatus.OPEN, deadline: new Date("2026-12-31T23:59:59Z") },
      create: {
        id: testUntimedPhaseId,
        contestId: testUntimedContestId,
        phaseNumber: 1,
        title: "Untimed Phase",
        weightPercentage: 100,
        deadline: new Date("2026-12-31T23:59:59Z"),
        status: PhaseStatus.OPEN,
      },
    });

    await prisma.task.upsert({
      where: { id: testUntimedTaskId },
      update: { durationMinutes: null, totalPoints: 10 },
      create: {
        id: testUntimedTaskId,
        phaseId: testUntimedPhaseId,
        taskNumber: 1,
        title: "Untimed Assignment Task",
        totalPoints: 10,
        durationMinutes: null,
      },
    });
  });

  after(async () => {
    setTestSession(null);
    // Clean up test data safely without affecting other tables
    const contestIds = [testContestId, testUntimedContestId];
    if (createdContestIdByAdmin) contestIds.push(createdContestIdByAdmin);

    await prisma.submissionAnswer.deleteMany({
      where: { submission: { contestId: { in: contestIds } } },
    });
    await prisma.submission.deleteMany({ where: { contestId: { in: contestIds } } });
    await prisma.contestParticipant.deleteMany({ where: { contestId: { in: contestIds } } });
    await prisma.questionAnswerKey.deleteMany({
      where: { question: { taskId: { in: [testTaskId, testUntimedTaskId] } } },
    });
    await prisma.mcqOption.deleteMany({
      where: { question: { taskId: { in: [testTaskId, testUntimedTaskId] } } },
    });
    await prisma.question.deleteMany({ where: { taskId: { in: [testTaskId, testUntimedTaskId] } } });
    await prisma.task.deleteMany({ where: { id: { in: [testTaskId, testUntimedTaskId] } } });
    await prisma.phase.deleteMany({ where: { id: { in: [testPhaseId, testUntimedPhaseId] } } });
    await prisma.contest.deleteMany({ where: { id: { in: contestIds } } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [testAdminId, testParticipantAId, testParticipantBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testAdminId, testParticipantAId, testParticipantBId] } },
    });
  });

  // ==========================================
  // Test 1: Admin creates contest with 30-min duration
  // ==========================================
  test("1. Admin creates contest with 30-minute duration; verify saved in database", async () => {
    setTestSession({
      userId: testAdminId,
      email: "timer.admin@aciedge.edu",
      role: "ADMIN",
      name: "Timer Admin",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const res = await createContestAction({
      title: "Admin 30m Timed Contest",
      track: "Strategy",
      description: "Contest created with 30m assessment timer",
      startDate: new Date("2026-02-01T00:00:00Z").toISOString(),
      endDate: new Date("2026-02-28T23:59:59Z").toISOString(),
      status: "LIVE",
      durationMinutes: 30,
    });

    assert.equal(res.success, true);
    assert.ok(res.contestId);
    createdContestIdByAdmin = res.contestId;

    const dbContest = await prisma.contest.findUnique({ where: { id: res.contestId } });
    assert.equal(dbContest?.durationMinutes, 30);
  });

  // ==========================================
  // Test 2: Admin edits duration to 45 minutes
  // ==========================================
  test("2. Admin edits duration to 45 minutes; verify updated in database", async () => {
    setTestSession({
      userId: testAdminId,
      email: "timer.admin@aciedge.edu",
      role: "ADMIN",
      name: "Timer Admin",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    assert.ok(createdContestIdByAdmin);
    const updateRes = await updateContestAction(createdContestIdByAdmin, {
      durationMinutes: 45,
    });

    assert.equal(updateRes.success, true);
    const updatedContest = await prisma.contest.findUnique({ where: { id: createdContestIdByAdmin } });
    assert.equal(updatedContest?.durationMinutes, 45);
  });

  // ==========================================
  // Test 3: Participant views contest page before starting; verify timer has NOT started
  // ==========================================
  test("3. Participant views contest page before starting; verify timer has NOT started", async () => {
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    // Participant merely views the contest page (/dashboard/contests/[id]) - no taskId provided
    const overviewData = await getTaskAssessmentData(testContestId);

    assert.equal(overviewData.state, "READY");
    // Verify no submission was prematurely created in database
    const subInDb = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
    });
    assert.equal(subInDb, null, "Submission must not exist before participant starts assessment");

    // Also verify task in overview reports hasAttemptStarted: false
    assert.equal(overviewData.task.hasAttemptStarted, false);
    assert.equal(overviewData.task.startedAt, null);
    assert.equal(overviewData.task.expiresAt, null);
  });

  // ==========================================
  // Test 4: Participant clicks Start Assessment; verify server sets startedAt and expiresAt
  // ==========================================
  test("4. Participant clicks Start Assessment; verify server sets startedAt and expiresAt", async () => {
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const beforeCall = Date.now();
    const startRes = await startAssessmentAttemptAction(testContestId, testTaskId);
    const afterCall = Date.now();

    assert.equal(startRes.success, true);
    assert.ok(startRes.submissionId);
    assert.ok(startRes.startedAt);
    assert.ok(startRes.expiresAt);
    assert.equal(startRes.durationMinutes, 30);

    const startedTime = new Date(startRes.startedAt).getTime();
    const expiresTime = new Date(startRes.expiresAt).getTime();

    // Verify exactly 30 minutes duration
    assert.equal(expiresTime - startedTime, 30 * 60 * 1000);
    assert.ok(startedTime >= beforeCall - 2000 && startedTime <= afterCall + 2000);

    // Verify stored in DB
    const subInDb = await prisma.submission.findUnique({
      where: { id: startRes.submissionId },
    });
    assert.ok(subInDb);
    assert.equal(subInDb.status, SubmissionStatus.DRAFT);
    assert.equal(subInDb.startedAt?.toISOString(), startRes.startedAt);
    assert.equal(subInDb.expiresAt?.toISOString(), startRes.expiresAt);
  });

  // ==========================================
  // Test 5: Participant refreshes page; verify timer resumes from correct remaining time
  // ==========================================
  test("5. Participant refreshes page; verify timer resumes from correct remaining time", async () => {
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const subBefore = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
    });
    assert.ok(subBefore && subBefore.startedAt && subBefore.expiresAt);

    // Simulate page refresh: call getTaskAssessmentData with specific unit
    const refreshedData = await getTaskAssessmentData(testContestId, testTaskId);

    assert.equal(refreshedData.task.hasAttemptStarted, true);
    assert.equal(refreshedData.task.startedAt, subBefore.startedAt.toISOString());
    assert.equal(refreshedData.task.expiresAt, subBefore.expiresAt.toISOString());
    // Seconds left is within 0 to 1800 (30 mins)
    assert.ok(refreshedData.task.secondsLeft > 0 && refreshedData.task.secondsLeft <= 1800);

    // Also verify calling startAssessmentAttemptAction again is strictly idempotent and does not reset timer
    const repeatStart = await startAssessmentAttemptAction(testContestId, testTaskId);
    assert.equal(repeatStart.success, true);
    assert.equal(repeatStart.startedAt, subBefore.startedAt.toISOString());
    assert.equal(repeatStart.expiresAt, subBefore.expiresAt.toISOString());
  });

  // ==========================================
  // Test 6: Participant logs out and logs back in; verify timer is preserved and still ticking down
  // ==========================================
  test("6. Participant logs out and logs back in; verify timer is preserved and still ticking down", async () => {
    const subBefore = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
    });
    assert.ok(subBefore?.startedAt && subBefore?.expiresAt);

    // 1. Simulate Logout
    setTestSession(null);

    // 2. Simulate Login with new session token
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const postLoginData = await getTaskAssessmentData(testContestId, testTaskId);
    assert.equal(postLoginData.task.startedAt, subBefore.startedAt.toISOString());
    assert.equal(postLoginData.task.expiresAt, subBefore.expiresAt.toISOString());
    assert.equal(postLoginData.task.hasAttemptStarted, true);
  });

  // ==========================================
  // Test 7: Two participants start at different times; verify each has their own independent countdown
  // ==========================================
  test("7. Two participants start at different times; verify each has their own independent countdown", async () => {
    // Participant B starts later
    setTestSession({
      userId: testParticipantBId,
      email: "partB.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Beta",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    // Start assessment for Participant B
    const startB = await startAssessmentAttemptAction(testContestId, testTaskId);
    assert.equal(startB.success, true);

    const subA = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
    });
    const subB = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantBId } },
    });

    assert.ok(subA && subB);
    assert.notEqual(subA.id, subB.id);
    assert.ok(subA.startedAt && subB.startedAt);
    assert.ok(subA.expiresAt && subB.expiresAt);

    // Each submission is an independent database row
    assert.notEqual(subA.userId, subB.userId);
  });

  // ==========================================
  // Test 8: Timer hits zero; verify submission is automatically finalized
  // ==========================================
  test("8. Timer hits zero; verify submission is automatically finalized", async () => {
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const subA = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
    });
    assert.ok(subA);

    // Save Q1 answer (Option B, correct)
    await prisma.submissionAnswer.upsert({
      where: { submissionId_questionId: { submissionId: subA.id, questionId: testMcqQ1Id } },
      update: { selectedOption: "B" },
      create: { submissionId: subA.id, questionId: testMcqQ1Id, selectedOption: "B" },
    });

    // Save Q3 written answer
    await prisma.submissionAnswer.upsert({
      where: { submissionId_questionId: { submissionId: subA.id, questionId: testWrittenQ3Id } },
      update: { writtenText: "Atomicity ensures all-or-nothing completion." },
      create: {
        submissionId: subA.id,
        questionId: testWrittenQ3Id,
        writtenText: "Atomicity ensures all-or-nothing completion.",
      },
    });

    // Simulate timer expiring: set expiresAt to 2 minutes in the past
    const pastExpiry = new Date(Date.now() - 2 * 60 * 1000);
    await prisma.submission.update({
      where: { id: subA.id },
      data: { expiresAt: pastExpiry, status: SubmissionStatus.DRAFT },
    });

    // Timer expires in client/heartbeat -> calls autoFinalizeExpiredAttemptAction
    const finalizeRes = await autoFinalizeExpiredAttemptAction(subA.id);
    assert.equal(finalizeRes.success, true);
    assert.equal(finalizeRes.status, SubmissionStatus.SUBMITTED);

    const finalizedSub = await prisma.submission.findUnique({ where: { id: subA.id } });
    assert.equal(finalizedSub?.status, SubmissionStatus.SUBMITTED);
    assert.ok(finalizedSub?.submittedAt);
  });

  // ==========================================
  // Test 9: Verify saved answers are preserved in auto-finalized submission
  // ==========================================
  test("9. Verify saved answers are preserved in auto-finalized submission", async () => {
    const subA = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
      include: { answers: true },
    });

    assert.ok(subA);
    const q1Answer = subA.answers.find((a) => a.questionId === testMcqQ1Id);
    assert.ok(q1Answer);
    assert.equal(q1Answer.selectedOption, "B");
  });

  // ==========================================
  // Test 10: Verify unanswered questions score 0
  // ==========================================
  test("10. Verify unanswered questions score 0", async () => {
    const subA = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
      include: { answers: true },
    });

    assert.ok(subA);
    // Q2 was unanswered (no record in answers)
    const q2Answer = subA.answers.find((a) => a.questionId === testMcqQ2Id);
    assert.equal(q2Answer, undefined);

    // Q1 was correct (20 points). Q2 was unanswered (0 points).
    // Auto-grade score must be exactly 20.
    assert.equal(Number(subA.autoGradeScore), 20);
  });

  // ==========================================
  // Test 11: Verify written answers are preserved for evaluator grading
  // ==========================================
  test("11. Verify written answers are preserved for evaluator grading", async () => {
    const subA = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
      include: { answers: true },
    });

    assert.ok(subA);
    const q3Answer = subA.answers.find((a) => a.questionId === testWrittenQ3Id);
    assert.ok(q3Answer);
    assert.equal(q3Answer.writtenText, "Atomicity ensures all-or-nothing completion.");
    // Needs evaluator review: manualScore is null
    assert.equal(q3Answer.score, null);
  });

  // ==========================================
  // Test 12: Attempt to save answer after expiry; verify rejected with clear error
  // ==========================================
  test("12. Attempt to save answer after expiry; verify rejected with clear error", async () => {
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const subA = await prisma.submission.findUnique({
      where: { taskId_userId: { taskId: testTaskId, userId: testParticipantAId } },
    });
    assert.ok(subA);

    // Late draft save attempt after expiry
    const saveRes = await saveAnswerDraftAction(subA.id, testMcqQ2Id, {
      selectedOption: "A",
    });

    assert.equal(saveRes.success, false);
    assert.match(saveRes.error || "", /locked|elapsed|expired|already submitted/i);
  });

  // ==========================================
  // Test 13: Contest with no timer configured; verify normal assessment behavior is preserved
  // ==========================================
  test("13. Contest with no timer configured; verify normal assessment behavior is preserved", async () => {
    setTestSession({
      userId: testParticipantAId,
      email: "partA.timer@aciedge.edu",
      role: "PARTICIPANT",
      name: "Participant Alpha",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const untimedData = await getTaskAssessmentData(testUntimedContestId, testUntimedTaskId);
    assert.equal(untimedData.state, "READY");
    assert.equal(untimedData.task.isTimed, false);
    assert.equal(untimedData.task.durationMinutes, null);
    assert.equal(untimedData.task.hasAttemptStarted, true);

    // Normal draft creation and save works without individual countdown
    assert.ok(untimedData.submission.id);
  });
});
