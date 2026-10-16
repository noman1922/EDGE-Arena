import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import {
  createContestAction,
} from "../app/actions/contest-actions";
import {
  createPhaseAction,
  createTaskAction,
  createQuestionAction,
  updatePhaseDeadlineAction,
} from "../app/actions/task-builder-actions";
import {
  getContestDeadlineAction,
  getTaskAssessmentData,
  saveAnswerDraftAction,
} from "../app/actions/assessment-actions";
import { parseDhakaDateTime } from "../lib/contest-lifecycle";

describe("Document Reader Suite, Admin Deadline Actions & Asia/Dhaka Timer Sync", () => {
  const adminEmail = `admin.reader.${Date.now()}@edge.internal`;
  const participantEmail = `alice.reader.${Date.now()}@edge.internal`;
  const attackerEmail = `attacker.reader.${Date.now()}@edge.internal`;

  let adminUserId = "";
  let participantUserId = "";
  let attackerUserId = "";

  let contestId = "";
  let phaseId = "";
  let taskId = "";
  let mcqQuestionId = "";
  let writtenQuestionId = "";

  before(async () => {
    // Clean up any test users with same prefix if left over
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "admin.reader." } },
          { email: { startsWith: "alice.reader." } },
          { email: { startsWith: "attacker.reader." } },
          { candidateId: "CAND-READER-001" },
          { candidateId: "CAND-ATTACK-002" },
        ],
      },
    });

    // 1. Create Admin User
    const admin = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: adminEmail,
        name: "Reader Admin",
        role: "ADMIN",
      },
    });
    adminUserId = admin.id;

    // 2. Create Participant User
    const part = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: participantEmail,
        name: "Alice Reader",
        role: "PARTICIPANT",
        candidateId: `CAND-R-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    });
    participantUserId = part.id;

    // 3. Create Attacker Participant User
    const attacker = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: attackerEmail,
        name: "Attacker Participant",
        role: "PARTICIPANT",
        candidateId: `CAND-A-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    });
    attackerUserId = attacker.id;

    // 4. Create Contest
    setTestSession({
      userId: adminUserId,
      email: adminEmail,
      role: "ADMIN",
      name: "Reader Admin",
    });

    const now = new Date();
    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);

    const cRes = await createContestAction({
      title: "Document Reader Test Benchmark",
      track: "Strategy & Technology",
      description: "Automated test fixture for modular curriculum reader and deadline sync.",
      startDate: new Date(Date.now() - 3600 * 1000).toISOString(),
      endDate: future.toISOString(),
      status: "LIVE",
    });
    assert.equal(cRes.success, true, `Contest creation failed: ${cRes.error}`);
    contestId = cRes.contestId!;

    // 5. Create Phase
    const pRes = await createPhaseAction({
      contestId,
      phaseNumber: 1,
      title: "Module 1: Strategy Execution",
      description: "Core diagnostic phase.",
      deadline: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    });
    assert.equal(pRes.success, true, `Phase creation failed: ${pRes.error}`);
    phaseId = pRes.phaseId!;

    // 6. Create Task
    const tRes = await createTaskAction({
      phaseId,
      taskNumber: 1,
      title: "Unit 1.1: Leadership Case Study",
      instructions: "Review the materials and complete the multiple choice questions and essay response.",
      totalPoints: 50,
    });
    assert.equal(tRes.success, true, `Task creation failed: ${tRes.error}`);
    taskId = tRes.taskId!;

    // 7. Create MCQ Question
    const mcqRes = await createQuestionAction({
      taskId,
      type: "MCQ",
      questionNumber: 1,
      prompt: "What is the primary objective of the corporate transformation initiative?",
      points: 20,
      options: [
        { optionKey: "A", text: "Cost consolidation across supply chain" },
        { optionKey: "B", text: "Rapid digital enablement and customer value alignment" },
        { optionKey: "C", text: "Workforce retrenchment and asset divestment" },
      ],
      correctOptionKey: "B",
      scoringGuide: "Confidential rubric: B is correct.",
    });
    assert.equal(mcqRes.success, true, `MCQ creation failed: ${mcqRes.error}`);
    mcqQuestionId = mcqRes.questionId!;

    // 8. Create Written Essay Question
    const essayRes = await createQuestionAction({
      taskId,
      type: "WRITTEN",
      questionNumber: 2,
      prompt: "Formulate a concise operational risk mitigation strategy for Q3.",
      points: 30,
      minWords: 20,
      maxWords: 200,
      scoringGuide: "Confidential rubric: requires actionable risk mitigation pillars.",
    });
    assert.equal(essayRes.success, true, `Essay creation failed: ${essayRes.error}`);
    writtenQuestionId = essayRes.questionId!;

    // 8b. Create FILE_UPLOAD Deliverable Question
    const fileRes = await createQuestionAction({
      taskId,
      type: "FILE_UPLOAD",
      questionNumber: 3,
      prompt: "Upload your Campus Initiative Strategy Brief in PDF format (maximum file size: 15 MB).",
      points: 30,
      scoringGuide: "Confidential rubric: PDF deliverable evaluation.",
    });
    assert.equal(fileRes.success, true, `File question creation failed: ${fileRes.error}`);

    // 9. Enroll Participant
    await prisma.contestParticipant.create({
      data: {
        contestId,
        userId: participantUserId,
        status: "ACTIVE",
      },
    });
  });

  after(async () => {
    setTestSession(undefined);
    try {
      if (contestId) {
        await prisma.contest.deleteMany({ where: { id: contestId } });
      }
      await prisma.user.deleteMany({
        where: { id: { in: [adminUserId, participantUserId, attackerUserId].filter(Boolean) } },
      });
    } catch (e) {
      console.warn("Cleanup error in document-reader-and-deadline.test.ts:", e);
    }
  });

  test("1. Admin updates phase deadline with Asia/Dhaka datetime format", async () => {
    setTestSession({
      userId: adminUserId,
      email: adminEmail,
      role: "ADMIN",
      name: "Reader Admin",
    });

    // Set new deadline 6 days into future
    const futureDhakaString = "2026-10-26T20:00";

    const updateRes = await updatePhaseDeadlineAction(phaseId, futureDhakaString);
    assert.equal(updateRes.success, true, `Admin deadline update failed: ${updateRes.error}`);
    assert.ok(updateRes.deadline, "Returned deadline must be present");

    // Verify database record updated
    const updatedPhase = await prisma.phase.findUnique({
      where: { id: phaseId },
    });
    assert.ok(updatedPhase);
    const parsedExpected = parseDhakaDateTime(futureDhakaString);
    assert.equal(
      updatedPhase.deadline.getTime(),
      parsedExpected.getTime(),
      "Phase deadline in database must match parsed Asia/Dhaka datetime"
    );

    // Verify contest endDate was also extended to cover phase deadline
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    });
    assert.ok(contest);
    assert.ok(
      contest.endDate.getTime() >= updatedPhase.deadline.getTime(),
      "Contest endDate must be >= phase deadline"
    );
  });

  test("2. useContestTimer heartbeat action returns authoritative Asia/Dhaka deadline", async () => {
    setTestSession({
      userId: participantUserId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "Alice Reader",
    });

    const deadlineRes = await getContestDeadlineAction(contestId, phaseId);
    assert.equal(deadlineRes.success, true, "Heartbeat action must succeed");
    assert.ok(deadlineRes.deadline, "Authoritative deadline ISO must be returned");
    assert.ok(deadlineRes.secondsLeft !== undefined, "secondsLeft must be returned");
    assert.ok(deadlineRes.secondsLeft > 0, "secondsLeft must be positive for active deadline");
    assert.equal(deadlineRes.isConcluded, false, "Active contest must not be marked concluded");
    assert.ok(deadlineRes.formattedDhaka, "Asia/Dhaka formatted string must be returned");
  });

  test("3. getTaskAssessmentData loads modular curriculum path without leaking answer keys", async () => {
    setTestSession({
      userId: participantUserId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "Alice Reader",
    });

    const taskData = await getTaskAssessmentData(contestId);
    assert.equal(taskData.state, "READY");
    assert.ok(taskData.contest, "Contest metadata must be present");
    assert.ok(taskData.phase, "Active phase must be present");
    assert.ok(taskData.allTasks, "allTasks sequence list must be present");
    assert.ok(taskData.phases, "phases modular roadmap must be present");
    assert.equal(taskData.questions.length, 3, "Must return all questions (MCQ + Essay + File Upload)");

    // CRITICAL SECURITY ASSERTION: No answerKey or correctOptionKey leaked in participant bundle
    for (const q of taskData.questions) {
      assert.equal((q as any).answerKey, undefined, "answerKey must be stripped from participant questions");
      for (const opt of q.options) {
        assert.equal(
          (opt as any).isCorrect,
          undefined,
          "isCorrect flag must never be leaked on question options"
        );
      }
    }
  });

  test("4. Participant answer draft persists non-destructively", async () => {
    setTestSession({
      userId: participantUserId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "Alice Reader",
    });

    const taskData = await getTaskAssessmentData(contestId);
    const submissionId = taskData.submission.id;
    assert.ok(submissionId, "Participant must have a submission session");

    // Save MCQ choice "B"
    const saveMcqRes = await saveAnswerDraftAction(submissionId, mcqQuestionId, {
      selectedOption: "B",
    });
    assert.equal(saveMcqRes.success, true, "saveAnswerDraftAction for MCQ must succeed");
    assert.ok(saveMcqRes.savedAt, "Saved timestamp must be returned");

    // Save Written text
    const saveWrittenRes = await saveAnswerDraftAction(submissionId, writtenQuestionId, {
      writtenText: "Detailed risk mitigation plan with redundant multi-channel escalation procedures.",
    });
    assert.equal(saveWrittenRes.success, true, "saveAnswerDraftAction for Essay must succeed");

    // Re-query assessment data to verify persistence
    const reloaded = await getTaskAssessmentData(contestId, taskId);
    const savedMcq = reloaded.submission.answers.find((a) => a.questionId === mcqQuestionId);
    const savedEssay = reloaded.submission.answers.find((a) => a.questionId === writtenQuestionId);

    assert.ok(savedMcq, "Saved MCQ answer must exist in submission");
    assert.equal(savedMcq.selectedOption, "B");

    assert.ok(savedEssay, "Saved Essay answer must exist in submission");
    assert.equal(
      savedEssay.writtenText,
      "Detailed risk mitigation plan with redundant multi-channel escalation procedures."
    );
  });

  test("5. Cross-user draft modification is strictly forbidden", async () => {
    // Attempt to modify Alice's submission while logged in as Attacker
    setTestSession({
      userId: attackerUserId,
      email: attackerEmail,
      role: "PARTICIPANT",
      name: "Attacker Participant",
    });

    // Fetch Alice's submission
    const aliceSub = await prisma.submission.findFirst({
      where: { userId: participantUserId, contestId },
    });
    assert.ok(aliceSub, "Alice's submission must exist");

    const hijackRes = await saveAnswerDraftAction(aliceSub.id, mcqQuestionId, {
      selectedOption: "A",
    });
    assert.equal(hijackRes.success, false, "Cross-user draft modification must be blocked");
    assert.match(
      hijackRes.error || "",
      /Unauthorized/i,
      "Error message must specify unauthorized cross-user access"
    );

    // Verify Alice's answer was NOT altered
    const uncompromised = await prisma.submissionAnswer.findUnique({
      where: {
        submissionId_questionId: {
          submissionId: aliceSub.id,
          questionId: mcqQuestionId,
        },
      },
    });
    assert.equal(uncompromised?.selectedOption, "B", "Alice's answer must remain intact");
  });

  test("6. FILE_UPLOAD questions are returned with type FILE_UPLOAD and properly categorized", async () => {
    setTestSession({
      userId: participantUserId,
      email: participantEmail,
      role: "PARTICIPANT",
      name: "Alice Participant",
    });

    const res = await getTaskAssessmentData(contestId, taskId);
    assert.equal(res.state, "READY");
    const fileQ = res.questions.find((q) => q.type === "FILE_UPLOAD");
    assert.ok(fileQ, "FILE_UPLOAD question must be present in assessment questions list");
    assert.match(fileQ.prompt, /Campus Initiative Strategy Brief/i);
    assert.equal(fileQ.points, 30);
  });
});
