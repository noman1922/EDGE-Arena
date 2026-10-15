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

  let adminSession: SessionPayload;
  let evaluatorSession: SessionPayload;
  let candidateSession: SessionPayload;

  before(async () => {
    // 1. Setup Admin & Evaluator accounts in DB
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

    // 2. Admin creates contest and assigns candidate
    setTestSession(adminSession);
    const contestRes = await createContestAction({
      title: "Evaluator Rubric Verification Contest",
      track: "Track E · Evaluation & Rubrics",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });

    contestId = contestRes.contestId!;

    const assignRes = await assignParticipantAction(contestId, testCandidateEmail, "Rubric Test Candidate");

    candidateSession = {
      userId: assignRes.user!.id,
      email: testCandidateEmail,
      role: "PARTICIPANT",
      name: "Rubric Test Candidate",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    // 3. Candidate creates and submits answers
    setTestSession(candidateSession);
    const assessment = await getTaskAssessmentData();
    submissionId = assessment.submission.id;
    const mcq = assessment.questions.find((q) => q.type === "MCQ")!;
    const written = assessment.questions.find((q) => q.type === "WRITTEN")!;

    await saveAnswerDraftAction(submissionId, mcq.id, { selectedOption: "A" });
    await saveAnswerDraftAction(
      submissionId,
      written.id,
      { writtenText: "Detailed sustainability proposal with quantitative analysis and risk assessment." }
    );

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

  it("1. Evaluator fetches real submissions: answer key is never exposed", async () => {
    setTestSession(evaluatorSession);
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
    // Attempt with PARTICIPANT session
    setTestSession(candidateSession);
    const participantAttempt = await saveRubricScoreAction({
      submissionId,
      scores: [],
    });

    assert.equal(participantAttempt.success, false);
    assert.match(participantAttempt.error!, /Forbidden|Unauthorized/);
  });

  it("3. Evaluator scores rubrics: computes weighted manual score and final score", async () => {
    setTestSession(evaluatorSession);
    const list = await getSubmissionsForGrading(contestId);
    const sub = list[0];

    // Award rubric scores
    const scores = sub.rubrics.map((r) => ({
      rubricId: r.id,
      scoreAwarded: Math.round(r.maxPoints * 0.9), // 90% score
      comments: "Exceptional analytical depth and sound methodology.",
    }));

    const result = await saveRubricScoreAction({
      submissionId,
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
    setTestSession(evaluatorSession);
    const publishAttempt = await publishContestResultsAction(contestId);
    assert.equal(publishAttempt.success, false);
    assert.match(publishAttempt.error!, /Forbidden|Unauthorized/);
  });

  it("5. Admin publishes contest results: ranks cohort and certifies results", async () => {
    setTestSession(adminSession);
    const publishResult = await publishContestResultsAction(contestId);
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
