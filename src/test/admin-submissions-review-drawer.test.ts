import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession, SessionPayload } from "../lib/auth";
import {
  createContestAction,
  assignParticipantAction,
} from "../app/actions/contest-actions";
import {
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";
import {
  getAdminSubmissionsList,
} from "../app/actions/results-actions";
import {
  gradeSubmissionAction,
} from "../app/actions/evaluator-actions";
import {
  createPhaseAction,
  createTaskAction,
  createQuestionAction,
} from "../app/actions/task-builder-actions";

describe("Admin Panel Submissions Review Drawer & Multi-Candidate Inspection Tests", () => {
  const adminEmail = "admin.drawer.test@example.com";
  const candidate1Email = "candidate1.drawer.test@example.com";
  const candidate2Email = "candidate2.drawer.test@example.com";

  let contestId = "";
  let phaseId = "";
  let taskId = "";
  let submission1Id = "";
  let submission2Id = "";
  let mcqQuestionId = "";
  let writtenQuestionId = "";

  let adminSession: SessionPayload;
  let candidate1Session: SessionPayload;
  let candidate2Session: SessionPayload;

  before(async () => {
    // 1. Setup Admin and two Candidates in DB
    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: adminEmail,
        name: "Admin Drawer Auditor",
        role: "ADMIN",
      },
    });

    const candidate1 = await prisma.user.upsert({
      where: { email: candidate1Email },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: candidate1Email,
        name: "Candidate Alpha",
        role: "PARTICIPANT",
        institution: "Engineering Dept",
      },
    });

    const candidate2 = await prisma.user.upsert({
      where: { email: candidate2Email },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: candidate2Email,
        name: "Candidate Beta",
        role: "PARTICIPANT",
        institution: "Marketing Dept",
      },
    });

    adminSession = {
      userId: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: "ADMIN",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };

    candidate1Session = {
      userId: candidate1.id,
      email: candidate1.email,
      name: candidate1.name,
      role: "PARTICIPANT",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };

    candidate2Session = {
      userId: candidate2.id,
      email: candidate2.email,
      name: candidate2.name,
      role: "PARTICIPANT",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };

    // 2. Admin creates contest, phase, task, and questions
    setTestSession(adminSession);
    const contestRes = await createContestAction({
      title: "Drawer Audit Verification Contest",
      track: "Software Engineering",
      status: "LIVE",
      description: "Testing Review Drawer opening, closing, and multiple candidate switches",
      startDate: new Date(Date.now() - 3600000).toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
      durationMinutes: 60,
    });
    assert.ok(contestRes.success && contestRes.contestId);
    contestId = contestRes.contestId;

    await assignParticipantAction(contestId, candidate1.email, candidate1.name);
    await assignParticipantAction(contestId, candidate2.email, candidate2.name);

    const phaseRes = await createPhaseAction({
      contestId,
      title: "Auditing Phase",
      phaseNumber: 1,
      deadline: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.ok(phaseRes.success && phaseRes.phaseId);
    phaseId = phaseRes.phaseId;

    const taskRes = await createTaskAction({
      phaseId,
      title: "System Architecture Audit",
      instructions: "Answer MCQ and Written prompt",
      taskNumber: 1,
      totalPoints: 50,
      durationMinutes: 60,
    });
    assert.ok(taskRes.success && taskRes.taskId);
    taskId = taskRes.taskId;

    const mcqRes = await createQuestionAction({
      taskId,
      prompt: "What is the primary role of an idempotent review drawer close handler?",
      type: "MCQ",
      points: 20,
      questionNumber: 1,
      correctOptionKey: "A",
      options: [
        { optionKey: "A", text: "Prevent UI loops and state conflicts" },
        { optionKey: "B", text: "Trigger endless network calls" },
      ],
    });
    assert.ok(mcqRes.success && mcqRes.questionId);
    mcqQuestionId = mcqRes.questionId;

    const writtenRes = await createQuestionAction({
      taskId,
      prompt: "Explain how preventing background scrolling avoids layout jumping.",
      type: "WRITTEN",
      points: 30,
      questionNumber: 2,
    });
    assert.ok(writtenRes.success && writtenRes.questionId);
    writtenQuestionId = writtenRes.questionId;

    // 3. Candidate 1 submits assessment
    setTestSession(candidate1Session);
    const sub1 = await prisma.submission.create({
      data: {
        userId: candidate1.id,
        contestId,
        phaseId,
        taskId,
        status: "DRAFT",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    submission1Id = sub1.id;
    await saveAnswerDraftAction(submission1Id, mcqQuestionId, { selectedOption: "A" });
    await saveAnswerDraftAction(submission1Id, writtenQuestionId, {
      writtenText: "Body scroll lock preserves page offset while allowing drawer content to scroll freely.",
    });
    const sub1Res = await submitAssessmentAction(submission1Id);
    assert.ok(sub1Res.success);

    // 4. Candidate 2 submits assessment
    setTestSession(candidate2Session);
    const sub2 = await prisma.submission.create({
      data: {
        userId: candidate2.id,
        contestId,
        phaseId,
        taskId,
        status: "DRAFT",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    submission2Id = sub2.id;
    await saveAnswerDraftAction(submission2Id, mcqQuestionId, { selectedOption: "B" });
    await saveAnswerDraftAction(submission2Id, writtenQuestionId, {
      writtenText: "Candidate Beta submission response for architecture evaluation.",
    });
    const sub2Res = await submitAssessmentAction(submission2Id);
    assert.ok(sub2Res.success);
  });

  after(async () => {
    // Cleanup created test records
    setTestSession(adminSession);
    if (contestId) {
      await prisma.contest.delete({
        where: { id: contestId },
      }).catch((e) => console.warn("Contest cleanup note:", e));
    }

    await prisma.user.deleteMany({
      where: {
        email: { in: [adminEmail, candidate1Email, candidate2Email] },
      },
    }).catch(() => {});
  });

  it("1. getAdminSubmissionsList retrieves both candidates with correct metrics and status", async () => {
    setTestSession(adminSession);
    const listRes = await getAdminSubmissionsList(contestId);

    assert.ok(listRes.submissions.length >= 2, "Expected at least 2 submissions");
    const sub1 = listRes.submissions.find((s) => s.id === submission1Id);
    const sub2 = listRes.submissions.find((s) => s.id === submission2Id);

    assert.ok(sub1, "Candidate 1 submission must be listed");
    assert.ok(sub2, "Candidate 2 submission must be listed");
    assert.equal(sub1.candidateName, "Candidate Alpha");
    assert.equal(sub2.candidateName, "Candidate Beta");
    assert.equal(sub1.autoGradeScore, 20, "Candidate 1 MCQ should be auto-graded to 20 pts");
    assert.equal(sub2.autoGradeScore, 0, "Candidate 2 MCQ should be auto-graded to 0 pts");
  });

  it("2. Inspecting Candidate 1 extracts accurate answers and prepares grading payload", async () => {
    setTestSession(adminSession);
    const listRes = await getAdminSubmissionsList(contestId);
    const sub1 = listRes.submissions.find((s) => s.id === submission1Id)!;

    assert.equal(sub1.answers.length, 2, "Expected 2 questions answered");
    const mcqAns = sub1.answers.find((a) => a.questionType === "MCQ")!;
    const writtenAns = sub1.answers.find((a) => a.questionType === "WRITTEN")!;

    assert.equal(mcqAns.selectedOption, "A");
    assert.equal(mcqAns.isCorrect, true);
    assert.ok(writtenAns.writtenText?.includes("Body scroll lock"));
  });

  it("3. Grading Candidate 1 saves draft without corrupting data", async () => {
    setTestSession(adminSession);
    const gradeRes = await gradeSubmissionAction({
      submissionId: submission1Id,
      isDraft: true,
      overallFeedback: "Strong grasp of layout stability.",
      questionGrades: [
        {
          questionId: writtenQuestionId,
          score: 28,
          feedback: "Very thorough explanation.",
        },
      ],
      rubricScores: [],
    });

    assert.ok(gradeRes.success);
    assert.equal(gradeRes.manualGradeScore, 28);
    assert.equal(gradeRes.finalScore, 48); // 20 auto + 28 manual

    // Verify submission record updated
    const updatedSub1 = await prisma.submission.findUnique({
      where: { id: submission1Id },
      include: { answers: true },
    });
    assert.equal(updatedSub1?.status, "GRADING_IN_PROGRESS");
    assert.equal(Number(updatedSub1?.manualGradeScore), 28);
    assert.equal(Number(updatedSub1?.finalScore), 48);
  });

  it("4. Inspecting Candidate 2 cleanly isolates Candidate 2's data without state leakage", async () => {
    setTestSession(adminSession);
    const listRes = await getAdminSubmissionsList(contestId);
    const sub2 = listRes.submissions.find((s) => s.id === submission2Id)!;

    assert.equal(sub2.candidateName, "Candidate Beta");
    assert.equal(sub2.autoGradeScore, 0);

    const writtenAns = sub2.answers.find((a) => a.questionType === "WRITTEN")!;
    assert.ok(writtenAns.writtenText?.includes("Candidate Beta submission"));
    // Candidate 2's written score should not have Candidate 1's marks
    assert.equal(writtenAns.score, null, "Candidate 2 written score should still be pending");
  });

  it("5. Finalizing Candidate 2 locks grade and updates list metrics", async () => {
    setTestSession(adminSession);
    const gradeRes = await gradeSubmissionAction({
      submissionId: submission2Id,
      isDraft: false,
      overallFeedback: "Evaluation completed.",
      questionGrades: [
        {
          questionId: writtenQuestionId,
          score: 25,
          feedback: "Solid response.",
        },
      ],
      rubricScores: [],
    });

    assert.ok(gradeRes.success);
    assert.equal(gradeRes.manualGradeScore, 25);
    assert.equal(gradeRes.finalScore, 25); // 0 auto + 25 manual

    const updatedList = await getAdminSubmissionsList(contestId);
    const sub2InList = updatedList.submissions.find((s) => s.id === submission2Id)!;
    assert.equal(sub2InList.status, "GRADED");
    assert.equal(sub2InList.finalScore, 25);
  });

  it("6. Submissions list remains completely intact and usable after drawer closure", async () => {
    setTestSession(adminSession);
    const listRes = await getAdminSubmissionsList(contestId);

    // Both candidates remain present and correctly represented
    assert.equal(listRes.submissions.length, 2);
    const s1 = listRes.submissions.find((s) => s.id === submission1Id)!;
    const s2 = listRes.submissions.find((s) => s.id === submission2Id)!;

    assert.equal(s1.status, "GRADING_IN_PROGRESS");
    assert.equal(s2.status, "GRADED");
    assert.equal(s1.finalScore, 48);
    assert.equal(s2.finalScore, 25);
  });
});
