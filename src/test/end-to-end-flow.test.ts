import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  createContestAction,
  assignParticipantAction,
  getAdminContests,
} from "../app/actions/contest-actions";
import {
  getParticipantDashboard,
  getTaskAssessmentData,
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";

describe("Stage 3 End-to-End Database Feature Integration", () => {
  const testCandidateEmail = "candidate.e2e.test@example.com";
  let createdContestId = "";
  let createdSlug = "";

  after(async () => {
    // Clean up test data safely
    try {
      if (createdContestId) {
        await prisma.contest.deleteMany({ where: { id: createdContestId } });
      }
      await prisma.user.deleteMany({ where: { email: testCandidateEmail } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("1. Admin creates and saves a new contest in the database", async () => {
    const result = await createContestAction({
      title: "E2E Automated Benchmark Challenge",
      track: "Track E2E · Operations",
      description: "End-to-end automated verification contest.",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });

    assert.equal(result.success, true, `Contest creation failed: ${result.error}`);
    assert.ok(result.contestId);
    createdContestId = result.contestId!;
    createdSlug = result.slug!;

    // Confirm contest exists in database
    const dbContest = await prisma.contest.findUnique({
      where: { id: createdContestId },
      include: { phases: { include: { tasks: { include: { questions: true } } } } },
    });

    assert.ok(dbContest);
    assert.equal(dbContest.status, "LIVE");
    assert.equal(dbContest.phases.length, 1);
    assert.equal(dbContest.phases[0].tasks.length, 1);
    assert.equal(dbContest.phases[0].tasks[0].questions.length, 2);
  });

  it("2. Admin assigns a participant to the contest", async () => {
    const assignResult = await assignParticipantAction(
      createdContestId,
      testCandidateEmail,
      "Test E2E Candidate"
    );

    assert.equal(assignResult.success, true, `Assignment failed: ${assignResult.error}`);
    assert.ok(assignResult.participantId);

    // Verify enrollment in database
    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: createdContestId,
        user: { email: testCandidateEmail },
      },
    });

    assert.ok(enrollment);
    assert.equal(enrollment.status, "ACTIVE");
  });

  it("3. Participant sees only their assigned contest on the dashboard", async () => {
    const dashboard = await getParticipantDashboard(testCandidateEmail);

    assert.equal(dashboard.candidate.email, testCandidateEmail);
    assert.ok(dashboard.contests.length >= 1);

    // Candidate must see the newly created contest
    const assigned = dashboard.contests.find((c) => c.contestId === createdContestId);
    assert.ok(assigned, "Assigned contest should be visible to participant");
    assert.equal(assigned.status, "NOT_STARTED");
    assert.equal(assigned.canContinue, true);

    // Candidate should NOT see unassigned contests
    // Verify an unassigned user gets zero contests
    const otherCandidateEmail = "unassigned.e2e@example.com";
    await prisma.user.upsert({
      where: { email: otherCandidateEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: otherCandidateEmail,
        name: "Unassigned User",
        role: "PARTICIPANT",
      },
    });

    const otherDashboard = await getParticipantDashboard(otherCandidateEmail);
    const unassignedContest = otherDashboard.contests.find((c) => c.contestId === createdContestId);
    assert.equal(unassignedContest, undefined, "Unassigned participant must not see this contest");

    // Clean up other candidate
    await prisma.user.delete({ where: { email: otherCandidateEmail } }).catch(() => {});
  });

  it("4. Participant opens task: private answer key is strictly protected", async () => {
    const assessmentData = await getTaskAssessmentData(testCandidateEmail);

    assert.ok(assessmentData.task.id);
    assert.ok(assessmentData.questions.length >= 2);

    // CRITICAL: Ensure NO question leaks answerKey
    for (const q of assessmentData.questions) {
      assert.equal("answerKey" in q, false, "Answer key must NEVER be exposed to participant");
      assert.equal((q as any).answerKey, undefined);
    }

    // Submission draft is active
    assert.ok(assessmentData.submission.id);
    assert.equal(assessmentData.submission.status, "DRAFT");
  });

  it("5. Participant saves draft answers and then finalizes submission", async () => {
    const assessmentData = await getTaskAssessmentData(testCandidateEmail);
    const submissionId = assessmentData.submission.id;
    const mcqQuestion = assessmentData.questions.find((q) => q.type === "MCQ")!;
    const writtenQuestion = assessmentData.questions.find((q) => q.type === "WRITTEN")!;

    // Save MCQ draft answer
    const mcqSave = await saveAnswerDraftAction(
      submissionId,
      mcqQuestion.id,
      { selectedOption: "A" },
      testCandidateEmail
    );
    assert.equal(mcqSave.success, true);

    // Save Written draft answer
    const writtenSave = await saveAnswerDraftAction(
      submissionId,
      writtenQuestion.id,
      { writtenText: "Our executive transformation strategy deploys energy telemetry across all campuses." },
      testCandidateEmail
    );
    assert.equal(writtenSave.success, true);

    // Finalize submission
    const submitResult = await submitAssessmentAction(submissionId, testCandidateEmail);
    assert.equal(submitResult.success, true);
    assert.equal(submitResult.status, "SUBMITTED");
    assert.ok(submitResult.submittedAt);

    // Verify submission locked in database
    const dbSub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { answers: true },
    });

    assert.equal(dbSub?.status, "SUBMITTED");
    assert.ok(dbSub?.submittedAt);
    // MCQ auto-grade score awarded
    assert.equal(Number(dbSub?.autoGradeScore), 10); // Option A is the correct key defined in creation
  });

  it("6. Admin contests list reflects live database counts", async () => {
    const adminContests = await getAdminContests();
    const found = adminContests.find((c) => c.id === createdContestId);

    assert.ok(found);
    assert.equal(found.total, 1); // 1 participant assigned
    assert.equal(found.submitted, 1); // 1 submission completed
  });
});
