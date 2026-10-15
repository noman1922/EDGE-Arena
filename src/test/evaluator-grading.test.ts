import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
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
  getSubmissionsForGrading,
  saveRubricScoreAction,
  publishContestResultsAction,
} from "../app/actions/evaluator-actions";

describe("Evaluator Rubric Scoring & Admin Publishing Tests", () => {
  const testCandidateEmail = "candidate.eval.test@example.com";
  const testEvaluatorEmail = "evaluator.panel.test@example.com";
  const testAdminEmail = "admin.super.test@example.com";
  let contestId = "";
  let submissionId = "";

  before(async () => {
    // 1. Setup Admin & Evaluator accounts
    await prisma.user.upsert({
      where: { email: testAdminEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: testAdminEmail,
        name: "Super Administrator",
        role: "ADMIN",
      },
    });

    await prisma.user.upsert({
      where: { email: testEvaluatorEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: testEvaluatorEmail,
        name: "Lead Evaluator",
        role: "EVALUATOR",
      },
    });

    // 2. Create contest and assign candidate
    const contestRes = await createContestAction({
      title: "Evaluator Rubric Verification Contest",
      track: "Track E · Evaluation & Rubrics",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });

    contestId = contestRes.contestId!;

    await assignParticipantAction(contestId, testCandidateEmail, "Rubric Test Candidate");

    // 3. Candidate creates and submits answers
    const assessment = await getTaskAssessmentData(testCandidateEmail);
    submissionId = assessment.submission.id;
    const mcq = assessment.questions.find((q) => q.type === "MCQ")!;
    const written = assessment.questions.find((q) => q.type === "WRITTEN")!;

    await saveAnswerDraftAction(submissionId, mcq.id, { selectedOption: "A" }, testCandidateEmail);
    await saveAnswerDraftAction(
      submissionId,
      written.id,
      { writtenText: "Detailed sustainability proposal with quantitative analysis and risk assessment." },
      testCandidateEmail
    );

    await submitAssessmentAction(submissionId, testCandidateEmail);
  });

  after(async () => {
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

  it("1. Evaluator fetches real submissions: answer key is never exposed", async () => {
    const list = await getSubmissionsForGrading(contestId);
    assert.equal(list.length, 1);
    const sub = list[0];

    assert.equal(sub.candidateEmail, testCandidateEmail);
    assert.equal(sub.status, "SUBMITTED");
    assert.ok(sub.answers.length >= 2);

    // Strict security: ensure no answerKey leaks
    for (const ans of sub.answers) {
      assert.equal("answerKey" in ans, false);
      assert.equal("correctOptionKey" in ans, false);
    }
  });

  it("2. Non-evaluator / participant is forbidden from grading", async () => {
    const participantAttempt = await saveRubricScoreAction({
      submissionId,
      evaluatorEmail: testCandidateEmail, // Participant role
      scores: [],
    });

    assert.equal(participantAttempt.success, false);
    assert.match(participantAttempt.error!, /Unauthorized/);
  });

  it("3. Evaluator scores rubrics: computes weighted manual score and final score", async () => {
    const list = await getSubmissionsForGrading(contestId);
    const sub = list[0];

    // Award rubric scores
    // Create rubrics input
    const scores = sub.rubrics.map((r) => ({
      rubricId: r.id,
      scoreAwarded: Math.round(r.maxPoints * 0.9), // 90% score
      comments: "Exceptional analytical depth and sound methodology.",
    }));

    const result = await saveRubricScoreAction({
      submissionId,
      evaluatorEmail: testEvaluatorEmail,
      scores,
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "GRADED");
    assert.ok(result.manualGradeScore! > 0);
    assert.ok(result.finalScore! > 0);

    // Verify database record
    const dbSub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { evaluations: true },
    });

    assert.equal(dbSub?.status, "GRADED");
    assert.equal(dbSub?.evaluations.length, sub.rubrics.length);
  });

  it("4. Evaluator is forbidden from publishing contest results", async () => {
    // Evaluators cannot publish results
    const publishAttempt = await publishContestResultsAction(contestId, testEvaluatorEmail);
    assert.equal(publishAttempt.success, false);
    assert.match(publishAttempt.error!, /Unauthorized/);
  });

  it("5. Admin publishes contest results: ranks cohort and certifies results", async () => {
    const publishResult = await publishContestResultsAction(contestId, testAdminEmail);
    assert.equal(publishResult.success, true);
    assert.equal(publishResult.isPublished, true);
    assert.equal(publishResult.publishedCount, 1);

    // Verify Contest is published in DB
    const dbContest = await prisma.contest.findUnique({
      where: { id: contestId },
    });
    assert.equal(dbContest?.isPublished, true);
    assert.equal(dbContest?.status, "COMPLETED");

    // Verify CohortResult is created
    const cohortResults = await prisma.cohortResult.findMany({
      where: { contestId },
    });
    assert.equal(cohortResults.length, 1);
    assert.equal(cohortResults[0].rank, 1);
    assert.equal(cohortResults[0].isCertified, true);
  });
});
