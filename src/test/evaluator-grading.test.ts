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
  getTaskAssessmentData,
} from "../app/actions/assessment-actions";
import {
  getEvaluatorDashboardDataAction,
  getSubmissionsForGrading,
  gradeSubmissionAction,
  saveRubricScoreAction,
  publishContestResultsAction,
} from "../app/actions/evaluator-actions";
import {
  getParticipantScorecard,
  getParticipantLeaderboard,
} from "../app/actions/participant-nav-actions";
import { getFileDownloadUrlAction } from "../app/actions/file-actions";
import {
  createPhaseAction,
  createTaskAction,
  createQuestionAction,
} from "../app/actions/task-builder-actions";

describe("Evaluator Manual & Rubric Grading Workflow Tests", () => {
  const testCandidateEmail = "candidate.eval.test@example.com";
  const testEvaluatorEmail = "evaluator.panel.test@example.com";
  const testAdminEmail = "admin.super.test@example.com";
  let contestId = "";
  let taskId = "";
  let submissionId = "";
  let mcqQuestionId = "";
  let writtenQuestionId = "";
  let fileQuestionId = "";
  const testFileKey = "submissions/eval_test_deck.pdf";

  let adminSession: SessionPayload;
  let evaluatorSession: SessionPayload;
  let candidateSession: SessionPayload;

  before(async () => {
    // 1. Setup Admin, Evaluator, and Candidate accounts in DB
    const adminUser = await prisma.user.upsert({
      where: { email: testAdminEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: testAdminEmail,
        name: "Super Administrator",
        role: "ADMIN",
      },
    });

    const evaluatorUser = await prisma.user.upsert({
      where: { email: testEvaluatorEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: testEvaluatorEmail,
        name: "Lead Evaluator",
        role: "EVALUATOR",
      },
    });

    const candidateUser = await prisma.user.upsert({
      where: { email: testCandidateEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: testCandidateEmail,
        name: "Rubric Test Candidate",
        role: "PARTICIPANT",
        candidateId: "CAND-EVAL-001",
      },
    });

    adminSession = {
      userId: adminUser.id,
      email: adminUser.email,
      role: "ADMIN",
      name: adminUser.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    evaluatorSession = {
      userId: evaluatorUser.id,
      email: evaluatorUser.email,
      role: "EVALUATOR",
      name: evaluatorUser.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    candidateSession = {
      userId: candidateUser.id,
      email: testCandidateEmail,
      role: "PARTICIPANT",
      name: "Rubric Test Candidate",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    // 2. Admin creates contest
    setTestSession(adminSession);
    const contestRes = await createContestAction({
      title: "Evaluator Comprehensive Workflow Contest",
      track: "Track E · Evaluation & Rubrics",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });

    contestId = contestRes.contestId!;

    // Create Phase & Task
    const phaseRes = await createPhaseAction({
      contestId,
      phaseNumber: 1,
      title: "Phase 1: Operational Diagnostic",
      deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    });
    const taskRes = await createTaskAction({
      phaseId: phaseRes.phaseId!,
      taskNumber: 1,
      title: "Comprehensive Strategic Assessment",
      totalPoints: 100,
    });
    taskId = taskRes.taskId!;

    // Q1: MCQ (20 pts)
    const mcqRes = await createQuestionAction({
      taskId,
      type: "MCQ",
      questionNumber: 1,
      prompt: "What is the primary optimization goal?",
      points: 20,
      options: [
        { optionKey: "A", text: "Cost Reduction" },
        { optionKey: "B", text: "Latency Improvement" },
      ],
      correctOptionKey: "A",
      explanation: "Cost reduction is primary goal.",
    });
    mcqQuestionId = mcqRes.questionId!;

    // Q2: Written (40 pts)
    const writtenRes = await createQuestionAction({
      taskId,
      type: "WRITTEN",
      questionNumber: 2,
      prompt: "Detail your sustainability proposal and operational roadmap.",
      points: 40,
      minWords: 20,
      maxWords: 500,
    });
    writtenQuestionId = writtenRes.questionId!;

    // Q3: File Upload (40 pts)
    const fileRes = await createQuestionAction({
      taskId,
      type: "FILE_UPLOAD",
      questionNumber: 3,
      prompt: "Upload your executive slide deck (PDF format).",
      points: 40,
    });
    fileQuestionId = fileRes.questionId!;

    // Rubric criteria for evaluator evaluation
    await prisma.rubricCriterion.create({
      data: {
        taskId,
        name: "Strategic Depth & Analysis",
        description: "Analytical Rigour",
        maxPoints: 50,
        weightPercentage: 50,
      },
    });
    await prisma.rubricCriterion.create({
      data: {
        taskId,
        name: "Implementation Feasibility",
        description: "Operational Execution",
        maxPoints: 50,
        weightPercentage: 50,
      },
    });

    // Assign candidate
    await assignParticipantAction(contestId, testCandidateEmail, "Rubric Test Candidate");

    // Assign evaluator to contest and candidate
    const contestEval = await prisma.contestEvaluator.create({
      data: {
        contestId,
        userId: evaluatorUser.id,
      },
    });

    await prisma.evaluatorCandidateAssignment.create({
      data: {
        contestId,
        contestEvaluatorId: contestEval.id,
        evaluatorId: evaluatorUser.id,
        participantId: candidateUser.id,
      },
    });

    // 3. Candidate creates answers and submits task
    setTestSession(candidateSession);
    const assessment = await getTaskAssessmentData(contestId, taskId);
    submissionId = assessment.submission.id;

    // Save candidate answers:
    // MCQ: Select correct option "A"
    await saveAnswerDraftAction(submissionId, mcqQuestionId, { selectedOption: "A" });

    // Written answer
    await saveAnswerDraftAction(submissionId, writtenQuestionId, {
      writtenText: "Detailed sustainability proposal with quantitative analysis and risk assessment.",
    });

    // File upload deliverable
    await saveAnswerDraftAction(submissionId, fileQuestionId, {
      fileName: "Candidate_Executive_Deck.pdf",
      fileKey: testFileKey,
    });

    // Submit assessment
    await submitAssessmentAction(submissionId);
  });

  after(async () => {
    setTestSession(undefined);
    try {
      if (contestId) {
        await prisma.contest.deleteMany({ where: { id: contestId } });
      }
      await prisma.user.deleteMany({
        where: {
          email: { in: [testCandidateEmail, testEvaluatorEmail, testAdminEmail] },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("1. MCQ auto-grading: calculated on submission and answer key never exposed to participants", async () => {
    // Check evaluator view
    setTestSession(evaluatorSession);
    const list = await getSubmissionsForGrading(contestId);
    assert.equal(list.length, 1);
    const sub = list[0];

    assert.equal(sub.candidateEmail, testCandidateEmail);
    assert.equal(sub.status, "SUBMITTED");
    assert.equal(sub.autoGradeScore, 20); // Correct option "A" awarded full 20 points
    assert.equal(sub.answers.length, 3);

    // Strict security: ensure QuestionAnswerKey is never exposed
    for (const ans of sub.answers) {
      assert.equal("answerKey" in ans, false);
      assert.equal("correctOptionKey" in ans, false);
    }

    // Verify candidate perspective: answer key must not be visible
    setTestSession(candidateSession);
    const participantData = await getTaskAssessmentData(contestId, taskId);
    for (const q of participantData.questions) {
      assert.equal("answerKey" in q, false);
      assert.equal("correctOptionKey" in q, false);
    }
  });

  it("2. File deliverable inspection: evaluator can securely resolve file download URL", async () => {
    setTestSession(evaluatorSession);
    const fileRes = await getFileDownloadUrlAction(testFileKey);
    assert.equal(fileRes.success, true);
    assert.ok(fileRes.downloadUrl);
    assert.equal(fileRes.fileName, "Candidate_Executive_Deck.pdf");
  });

  it("3. Validation & Security: rejects marks exceeding question max points or unauthorized roles", async () => {
    // A: Non-evaluator / participant session is rejected
    setTestSession(candidateSession);
    const participantAttempt = await gradeSubmissionAction({
      submissionId,
      questionGrades: [{ questionId: writtenQuestionId, score: 30 }],
    });
    assert.equal(participantAttempt.success, false);
    assert.match(participantAttempt.error!, /Forbidden|Unauthorized/);

    // B: Evaluator enters score exceeding question max points (40 max, attempt 85)
    setTestSession(evaluatorSession);
    const invalidMaxAttempt = await gradeSubmissionAction({
      submissionId,
      questionGrades: [{ questionId: writtenQuestionId, score: 85 }],
    });
    assert.equal(invalidMaxAttempt.success, false);
    assert.match(invalidMaxAttempt.error!, /cannot be negative or exceed/i);

    // C: Evaluator enters negative score (-10)
    const negativeAttempt = await gradeSubmissionAction({
      submissionId,
      questionGrades: [{ questionId: writtenQuestionId, score: -10 }],
    });
    assert.equal(negativeAttempt.success, false);
    assert.match(negativeAttempt.error!, /cannot be negative or exceed/i);
  });

  it("4. Evaluator saves draft: marks, feedback, and GRADING_IN_PROGRESS persist across refresh", async () => {
    setTestSession(evaluatorSession);

    // Save draft evaluation with marks and qualitative feedback
    const draftRes = await gradeSubmissionAction({
      submissionId,
      isDraft: true,
      overallFeedback: "Strong analytical methodology; executive deck needs clearer timeline.",
      questionGrades: [
        {
          questionId: writtenQuestionId,
          score: 35, // 35 / 40 pts
          feedback: "Good structural depth and clear roadmap.",
        },
        {
          questionId: fileQuestionId,
          score: 36, // 36 / 40 pts
          feedback: "Visual layout is clean; add risk mitigation slide.",
        },
      ],
      rubricScores: [
        {
          rubricId: (await prisma.rubricCriterion.findFirst({ where: { taskId, name: "Strategic Depth & Analysis" } }))!.id,
          scoreAwarded: 45, // 45/50
          comments: "High analytical rigor.",
        },
        {
          rubricId: (await prisma.rubricCriterion.findFirst({ where: { taskId, name: "Implementation Feasibility" } }))!.id,
          scoreAwarded: 40, // 40/50
          comments: "Solid implementation strategy.",
        },
      ],
    });

    assert.equal(draftRes.success, true);
    assert.equal(draftRes.status, "GRADING_IN_PROGRESS");
    assert.ok(draftRes.manualGradeScore! > 0);
    assert.ok(draftRes.finalScore! > 0);

    // Verify dashboard counts reflect draft as pending
    const dashData = await getEvaluatorDashboardDataAction(contestId);
    assert.equal(dashData.pendingCount, 1);
    assert.equal(dashData.gradedCount, 0);

    // Simulated refresh: re-fetch submissions and verify all marks and feedback persist
    const refreshed = await getSubmissionsForGrading(contestId);
    assert.equal(refreshed.length, 1);
    const refreshedSub = refreshed[0];

    assert.equal(refreshedSub.status, "GRADING_IN_PROGRESS");
    assert.equal(refreshedSub.overallFeedback, "Strong analytical methodology; executive deck needs clearer timeline.");

    const writtenAns = refreshedSub.answers.find((a) => a.questionId === writtenQuestionId);
    assert.equal(writtenAns?.score, 35);
    assert.equal(writtenAns?.feedback, "Good structural depth and clear roadmap.");

    const fileAns = refreshedSub.answers.find((a) => a.questionId === fileQuestionId);
    assert.equal(fileAns?.score, 36);
    assert.equal(fileAns?.feedback, "Visual layout is clean; add risk mitigation slide.");
  });

  it("5. Evaluator finalizes grade: updates status to GRADED and updates pending/graded counts", async () => {
    setTestSession(evaluatorSession);

    // Finalize grade
    const finalizeRes = await gradeSubmissionAction({
      submissionId,
      isDraft: false, // Finalize!
      overallFeedback: "Certified academic evaluation complete. Candidate demonstrated exceptional capability.",
      questionGrades: [
        { questionId: writtenQuestionId, score: 36, feedback: "Excellent written roadmap." },
        { questionId: fileQuestionId, score: 38, feedback: "Professional grade slide deck." },
      ],
      rubricScores: [
        {
          rubricId: (await prisma.rubricCriterion.findFirst({ where: { taskId, name: "Strategic Depth & Analysis" } }))!.id,
          scoreAwarded: 46,
          comments: "Outstanding depth.",
        },
        {
          rubricId: (await prisma.rubricCriterion.findFirst({ where: { taskId, name: "Implementation Feasibility" } }))!.id,
          scoreAwarded: 44,
          comments: "Realistic timelines.",
        },
      ],
    });

    assert.equal(finalizeRes.success, true);
    assert.equal(finalizeRes.status, "GRADED");

    // Final score = autoGradeScore (20 pts MCQ) + manualGradeScore (clamped to task.totalPoints = 100)
    assert.equal(finalizeRes.autoGradeScore, 20);
    assert.ok(finalizeRes.manualGradeScore! > 0);
    assert.equal(finalizeRes.finalScore, Math.min(100, 20 + finalizeRes.manualGradeScore!));

    // Dashboard metrics: pendingCount becomes 0, gradedCount becomes 1
    const dashData = await getEvaluatorDashboardDataAction(contestId);
    assert.equal(dashData.pendingCount, 0);
    assert.equal(dashData.gradedCount, 1);

    // Database record check
    const dbSub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { answers: true, evaluations: true },
    });
    assert.equal(dbSub?.status, "GRADED");
    assert.equal(dbSub?.evaluations.length, 2);
  });

  it("6. Participant protection: unpublished scores are shielded from candidate", async () => {
    setTestSession(candidateSession);

    // A: Scorecard must not reveal unpublished scores
    const scorecard = await getParticipantScorecard(contestId);
    assert.ok(scorecard);
    assert.equal(scorecard.isPublished, false);
    assert.equal(scorecard.totalScore, 0);
    assert.equal(scorecard.rubrics.length, 0);

    // B: Leaderboard must mask unpublished scores to 0
    const leaderboard = await getParticipantLeaderboard(contestId);
    assert.ok(leaderboard);
    assert.equal(leaderboard.isPublished, false);
    if (leaderboard.rows.length > 0) {
      for (const row of leaderboard.rows) {
        assert.equal(row.finalScore, 0);
        assert.equal(row.isCertified, false);
      }
    }

    // C: Assessment data must sanitize scores when contest is unpublished
    const taskAssessment = await getTaskAssessmentData(contestId, taskId);
    assert.equal(taskAssessment.submission.status, "GRADED"); // Status can be known
    // Ensure individual question scores are sanitized/masked
    for (const a of taskAssessment.submission.answers) {
      assert.equal("score" in a, false);
      assert.equal("isCorrect" in a, false);
    }
  });

  it("7. Admin publishes contest results: certifies results and reveals published scores", async () => {
    // Evaluator cannot publish
    setTestSession(evaluatorSession);
    const unauthorizedPublish = await publishContestResultsAction(contestId);
    assert.equal(unauthorizedPublish.success, false);

    // Admin publishes
    setTestSession(adminSession);
    const publishResult = await publishContestResultsAction(contestId);
    assert.equal(publishResult.success, true);
    assert.equal(publishResult.isPublished, true);
    assert.equal(publishResult.publishedCount, 1);

    // Verify Contest status in DB
    const dbContest = await prisma.contest.findUnique({ where: { id: contestId } });
    assert.equal(dbContest?.isPublished, true);
    assert.equal(dbContest?.status, "COMPLETED");

    // Verify CohortResult in DB
    const cohortResults = await prisma.cohortResult.findMany({ where: { contestId } });
    assert.equal(cohortResults.length, 1);
    assert.equal(cohortResults[0].rank, 1);
    assert.equal(cohortResults[0].isCertified, true);

    // Candidate can now view official certified results
    setTestSession(candidateSession);
    const certifiedScorecard = await getParticipantScorecard(contestId);
    assert.ok(certifiedScorecard);
    assert.equal(certifiedScorecard.isPublished, true);
    assert.ok(certifiedScorecard.totalScore > 0);
    assert.equal(certifiedScorecard.rank, 1);
    assert.equal(certifiedScorecard.isCertified, true);
    assert.equal(certifiedScorecard.rubrics.length, 2);
  });
});
