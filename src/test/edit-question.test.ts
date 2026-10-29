import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, SubmissionStatus } from "@prisma/client";
import {
  updateQuestionAction,
  createQuestionAction,
} from "../app/actions/task-builder-actions";
import { calculateMcqScore } from "../lib/scoring";
import { submitAssessmentAction } from "../app/actions/assessment-actions";

describe("Admin Panel: Edit Question Feature & Scoring Safety", () => {
  const testContestId = "99000000-0000-4000-8000-000000000001";
  const testPhaseId = "99000000-0000-4000-8000-000000000002";
  const testTaskId = "99000000-0000-4000-8000-000000000003";
  const testCandidateEmail = "editq.candidate@aciedge.edu";
  let candidateUserId = "";
  let questionId = "";

  before(async () => {
    // 1. Create candidate user
    const candidate = await prisma.user.upsert({
      where: { email: testCandidateEmail },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: "99000000-0000-4000-8000-000000000099",
        email: testCandidateEmail,
        name: "Edit Question Candidate",
        candidateId: "CAND-EQ-01",
        role: UserRole.PARTICIPANT,
      },
    });
    candidateUserId = candidate.id;

    // 2. Create test contest, phase, task
    await prisma.contest.upsert({
      where: { id: testContestId },
      update: {
        title: "Edit Question Test Contest",
        slug: "edit-question-test-contest",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        isPublished: false,
      },
      create: {
        id: testContestId,
        title: "Edit Question Test Contest",
        slug: "edit-question-test-contest",
        track: "Leadership",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        isPublished: false,
      },
    });

    await prisma.phase.upsert({
      where: { id: testPhaseId },
      update: {
        title: "Phase 1 - MCQ Assessment",
        status: PhaseStatus.OPEN,
        deadline: new Date("2026-12-31T23:59:59Z"),
      },
      create: {
        id: testPhaseId,
        contestId: testContestId,
        phaseNumber: 1,
        title: "Phase 1 - MCQ Assessment",
        status: PhaseStatus.OPEN,
        deadline: new Date("2026-12-31T23:59:59Z"),
        weightPercentage: 100,
      },
    });

    await prisma.task.upsert({
      where: { id: testTaskId },
      update: {
        title: "Unit 1: Market Dynamics",
        totalPoints: 10,
      },
      create: {
        id: testTaskId,
        phaseId: testPhaseId,
        taskNumber: 1,
        title: "Unit 1: Market Dynamics",
        totalPoints: 10,
      },
    });

    // Enroll candidate
    await prisma.contestParticipant.upsert({
      where: {
        contestId_userId: {
          contestId: testContestId,
          userId: candidateUserId,
        },
      },
      update: {},
      create: {
        contestId: testContestId,
        userId: candidateUserId,
      },
    });

    // Set admin test session
    setTestSession({
      userId: "admin-edit-test-user-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "Admin User",
    });

    // 3. Create initial MCQ Question
    const createRes = await createQuestionAction({
      taskId: testTaskId,
      questionNumber: 1,
      type: "MCQ",
      prompt: "Original Question: What is the primary metric for revenue growth?",
      instructions: "Select the most accurate response.",
      points: 5,
      options: [
        { optionKey: "A", text: "Net Profit Margin" },
        { optionKey: "B", text: "Gross Margin" },
        { optionKey: "C", text: "Year-over-Year Revenue Expansion" },
        { optionKey: "D", text: "Accounts Receivable Turnover" },
      ],
      correctOptionKey: "A",
      explanation: "Initial key set to Option A.",
      scoringGuide: "Initial rubric.",
    });

    assert.equal(createRes.success, true);
    questionId = createRes.questionId!;
  });

  after(async () => {
    setTestSession(undefined);
    // Clean up test fixtures safely
    await prisma.contest.delete({ where: { id: testContestId } }).catch(() => {});
    await prisma.user.delete({ where: { id: candidateUserId } }).catch(() => {});
  });

  test("1. An authorized admin can edit a question and save changes", async () => {
    setTestSession({
      userId: "admin-edit-test-user-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "Admin User",
    });

    const updateRes = await updateQuestionAction({
      questionId,
      expectedTaskId: testTaskId,
      expectedContestId: testContestId,
      prompt: "Updated Question: What is the primary metric for top-line expansion?",
      instructions: "Carefully evaluate all options before choosing.",
      points: 10,
      options: [
        { optionKey: "A", text: "Net Operating Margin" },
        { optionKey: "B", text: "Gross Profit Margin" },
        { optionKey: "C", text: "Year-over-Year Revenue Expansion Rate" },
        { optionKey: "D", text: "Working Capital Cycle" },
      ],
      correctOptionKey: "C",
      explanation: "Option C directly represents top-line sales velocity.",
      scoringGuide: "10 points for choosing C.",
    });

    assert.equal(updateRes.success, true);

    // Verify database state
    const updated = await prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      include: { options: { orderBy: { optionKey: "asc" } }, answerKey: true },
    });

    assert.equal(updated.prompt, "Updated Question: What is the primary metric for top-line expansion?");
    assert.equal(updated.points, 10);
    assert.equal(updated.options.length, 4);
    assert.equal(updated.options[0].text, "Net Operating Margin");
    assert.equal(updated.options[2].text, "Year-over-Year Revenue Expansion Rate");
    assert.equal(updated.answerKey?.correctOptionKey, "C");
    assert.equal(updated.answerKey?.explanation, "Option C directly represents top-line sales velocity.");
  });

  test("2. An admin can change ONLY the correct answer key without modifying other fields", async () => {
    setTestSession({
      userId: "admin-edit-test-user-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "Admin User",
    });

    // Fetch existing question to simulate pre-filled form
    const current = await prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      include: { options: true, answerKey: true },
    });

    // Change only correctOptionKey from C to D
    const res = await updateQuestionAction({
      questionId,
      expectedTaskId: testTaskId,
      expectedContestId: testContestId,
      prompt: current.prompt,
      points: current.points,
      options: current.options.map((o) => ({ optionKey: o.optionKey, text: o.text })),
      correctOptionKey: "D",
    });

    assert.equal(res.success, true);

    const reloaded = await prisma.questionAnswerKey.findUniqueOrThrow({
      where: { questionId },
    });
    assert.equal(reloaded.correctOptionKey, "D");
  });

  test("3. The updated answer key persists after re-fetching from database", async () => {
    // Direct fresh query to confirm persistence
    const keyRecord = await prisma.questionAnswerKey.findUniqueOrThrow({
      where: { questionId },
    });
    assert.equal(keyRecord.correctOptionKey, "D");
  });

  test("4. The updated answer key is used by the server scoring logic for new submissions", async () => {
    // Verify using calculateMcqScore
    const privateKeys = [
      {
        questionId,
        correctOptionKey: "D",
        points: 10,
      },
    ];

    // Participant chooses D -> full marks
    const correctResult = calculateMcqScore(
      [{ questionId, selectedOption: "D" }],
      privateKeys
    );
    assert.equal(correctResult.totalPointsAwarded, 10);
    assert.equal(correctResult.itemResults[0].isCorrect, true);

    // Participant chooses C (old key) -> 0 marks
    const incorrectResult = calculateMcqScore(
      [{ questionId, selectedOption: "C" }],
      privateKeys
    );
    assert.equal(incorrectResult.totalPointsAwarded, 0);
    assert.equal(incorrectResult.itemResults[0].isCorrect, false);

    // Now test through actual submitAssessmentAction
    // 1. Create a submission in DRAFT status
    const submission = await prisma.submission.create({
      data: {
        contestId: testContestId,
        phaseId: testPhaseId,
        taskId: testTaskId,
        userId: candidateUserId,
        status: SubmissionStatus.DRAFT,
      },
    });

    // 2. Create the draft answer with candidate choosing D
    await prisma.submissionAnswer.create({
      data: {
        submissionId: submission.id,
        questionId,
        selectedOption: "D",
      },
    });

    // 3. Authenticate as candidate and submit
    setTestSession({
      userId: candidateUserId,
      email: testCandidateEmail,
      role: "PARTICIPANT",
      name: "Edit Question Candidate",
    });

    const submitRes = await submitAssessmentAction(submission.id);

    assert.equal(submitRes.success, true);

    const savedSubmission = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    assert.equal(Number(savedSubmission.autoGradeScore), 10);
    assert.equal(Number(savedSubmission.finalScore), 10);

    // Check database SubmissionAnswer
    const subAnswer = await prisma.submissionAnswer.findFirstOrThrow({
      where: { questionId },
    });
    assert.equal(subAnswer.selectedOption, "D");
    assert.equal(Number(subAnswer.score), 10);
    assert.equal(subAnswer.isCorrect, true);
  });

  test("5. Invalid options and invalid correct-answer selections are rejected", async () => {
    setTestSession({
      userId: "admin-edit-test-user-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "Admin User",
    });

    // 5a. Empty prompt
    const emptyPromptRes = await updateQuestionAction({
      questionId,
      prompt: "   ",
      points: 10,
      confirmSubmissionImpact: true,
    });
    assert.equal(emptyPromptRes.success, false);
    assert.match(emptyPromptRes.error!, /prompt.*required/i);

    // 5b. Invalid points (negative or zero)
    const invalidPointsRes = await updateQuestionAction({
      questionId,
      prompt: "Valid Prompt",
      points: -5,
      confirmSubmissionImpact: true,
    });
    assert.equal(invalidPointsRes.success, false);
    assert.match(invalidPointsRes.error!, /Marks.*positive whole number/i);

    // 5c. Correct option key does not match any option (e.g., "Z")
    const invalidKeyRes = await updateQuestionAction({
      questionId,
      prompt: "Valid Prompt",
      points: 10,
      type: "MCQ",
      options: [
        { optionKey: "A", text: "Option A" },
        { optionKey: "B", text: "Option B" },
      ],
      correctOptionKey: "Z",
      confirmSubmissionImpact: true,
    });
    assert.equal(invalidKeyRes.success, false);
    assert.match(invalidKeyRes.error!, /does not match any available option/i);

    // 5d. Duplicate option keys
    const dupOptionRes = await updateQuestionAction({
      questionId,
      prompt: "Valid Prompt",
      points: 10,
      type: "MCQ",
      options: [
        { optionKey: "A", text: "Option A" },
        { optionKey: "A", text: "Duplicate Option A" },
      ],
      correctOptionKey: "A",
      confirmSubmissionImpact: true,
    });
    assert.equal(dupOptionRes.success, false);
    assert.match(dupOptionRes.error!, /Option identifiers must be unique/i);

    // 5e. Fewer than 2 options for MCQ
    const singleOptionRes = await updateQuestionAction({
      questionId,
      prompt: "Valid Prompt",
      points: 10,
      type: "MCQ",
      options: [{ optionKey: "A", text: "Only Option" }],
      correctOptionKey: "A",
      confirmSubmissionImpact: true,
    });
    assert.equal(singleOptionRes.success, false);
    assert.match(singleOptionRes.error!, /at least 2 answer options/i);
  });

  test("6. Non-admin users cannot edit questions by calling server action directly", async () => {
    // 6a. Participant session
    setTestSession({
      userId: candidateUserId,
      email: testCandidateEmail,
      role: "PARTICIPANT",
      name: "Participant Attacker",
    });

    const participantRes = await updateQuestionAction({
      questionId,
      prompt: "Hacked Question Prompt",
      points: 100,
      confirmSubmissionImpact: true,
    });
    assert.equal(participantRes.success, false);
    assert.match(participantRes.error!, /Forbidden: Role PARTICIPANT is not authorized/);

    // 6b. Evaluator session
    setTestSession({
      userId: "evaluator-id",
      email: "evaluator@test.com",
      role: "EVALUATOR",
      name: "Evaluator User",
    });

    const evaluatorRes = await updateQuestionAction({
      questionId,
      prompt: "Evaluator Modified Prompt",
      points: 10,
      confirmSubmissionImpact: true,
    });
    assert.equal(evaluatorRes.success, false);
    assert.match(evaluatorRes.error!, /Forbidden: Role EVALUATOR is not authorized/);

    // 6c. Unauthenticated session
    setTestSession(undefined);

    const unauthRes = await updateQuestionAction({
      questionId,
      prompt: "Unauthenticated Prompt",
      points: 10,
      confirmSubmissionImpact: true,
    });
    assert.equal(unauthRes.success, false);
    assert.match(unauthRes.error!, /Unauthorized: Active authentication session required/);
  });

  test("7. Task and Contest ownership verification blocks cross-contest modification", async () => {
    setTestSession({
      userId: "admin-edit-test-user-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "Admin User",
    });

    // Mismatched task ID
    const taskMismatchRes = await updateQuestionAction({
      questionId,
      expectedTaskId: "00000000-0000-0000-0000-000000000000",
      prompt: "Valid Prompt",
      points: 10,
      confirmSubmissionImpact: true,
    });
    assert.equal(taskMismatchRes.success, false);
    assert.match(taskMismatchRes.error!, /does not belong to the specified task/i);

    // Mismatched contest ID
    const contestMismatchRes = await updateQuestionAction({
      questionId,
      expectedContestId: "00000000-0000-0000-0000-000000000000",
      prompt: "Valid Prompt",
      points: 10,
      confirmSubmissionImpact: true,
    });
    assert.equal(contestMismatchRes.success, false);
    assert.match(contestMismatchRes.error!, /does not belong to the specified contest/i);
  });

  test("8. Existing submissions and answers are preserved and require explicit confirmation", async () => {
    setTestSession({
      userId: "admin-edit-test-user-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "Admin User",
    });

    // Attempt update without confirmSubmissionImpact flag when submissions exist
    const unconfirmedRes = await updateQuestionAction({
      questionId,
      expectedTaskId: testTaskId,
      expectedContestId: testContestId,
      prompt: "Modifying question with existing submission",
      points: 10,
      confirmSubmissionImpact: false, // Not confirmed
    });

    assert.equal(unconfirmedRes.success, false);
    assert.equal(unconfirmedRes.requiresConfirmation, true);
    assert.ok((unconfirmedRes.submissionCount || 0) > 0);
    assert.match(unconfirmedRes.warning!, /existing participant answer/i);

    // Now confirm update
    const confirmedRes = await updateQuestionAction({
      questionId,
      expectedTaskId: testTaskId,
      expectedContestId: testContestId,
      prompt: "Final Confirmed Question Prompt",
      instructions: "Updated instructions.",
      points: 10,
      type: "MCQ",
      options: [
        { optionKey: "A", text: "Net Operating Margin" },
        { optionKey: "B", text: "Gross Profit Margin" },
        { optionKey: "C", text: "Year-over-Year Revenue Expansion Rate" },
        { optionKey: "D", text: "Working Capital Cycle" },
      ],
      correctOptionKey: "D",
      confirmSubmissionImpact: true,
    });

    assert.equal(confirmedRes.success, true);

    // Verify existing candidate answer was NOT wiped or modified
    const candidateAnswer = await prisma.submissionAnswer.findFirstOrThrow({
      where: { questionId },
    });
    assert.equal(candidateAnswer.selectedOption, "D");
    assert.equal(Number(candidateAnswer.score), 10);
    assert.equal(candidateAnswer.isCorrect, true);

    // Verify AuditLog was recorded
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: "UPDATE_QUESTION",
        targetId: questionId,
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(auditLog !== null);
    assert.equal(auditLog?.targetType, "QUESTION");
  });
});
