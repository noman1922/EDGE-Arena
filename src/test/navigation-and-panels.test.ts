import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession, SessionPayload } from "../lib/auth";
import {
  createContestAction,
  updateContestAction,
  updateContestStatusAction,
  getAdminContests,
} from "../app/actions/contest-actions";
import {
  createPhaseAction,
  createTaskAction,
  createQuestionAction,
  deleteQuestionAction,
  getContestPhasesAndTasks,
} from "../app/actions/task-builder-actions";
import {
  getAdminLeaderboardAndResults,
  getAdminSubmissionsList,
  getAdminAuditLogs,
} from "../app/actions/results-actions";
import {
  getParticipantContests,
  getParticipantLeaderboard,
  getParticipantScorecard,
  getParticipantProfile,
} from "../app/actions/participant-nav-actions";
import { getAdminParticipants } from "../app/actions/participant-actions";

describe("Panel Navigation, Task Architect & Results Protection Integration Tests", () => {
  let contestId = "";
  let phaseId = "";
  let taskId = "";
  let createdQuestionId = "";

  const adminSession: SessionPayload = {
    userId: "admin-nav-test-id",
    email: "admin.demo@example.com",
    role: "ADMIN",
    name: "Admin Tester",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  const participantSession: SessionPayload = {
    userId: "candidate-nav-test-id",
    email: "candidate.demo@example.com",
    role: "PARTICIPANT",
    name: "Demo Candidate",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  const evaluatorSession: SessionPayload = {
    userId: "evaluator-nav-test-id",
    email: "evaluator.demo@example.com",
    role: "EVALUATOR",
    name: "Demo Evaluator",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  before(async () => {
    setTestSession(adminSession);
    const contestRes = await createContestAction({
      title: "Navigation & Panel Verification Contest",
      track: "Track Nav · Quality Assurance",
      description: "Automated test contest for panels and lifecycle.",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000 * 7).toISOString(),
      status: "LIVE",
    });
    assert.strictEqual(contestRes.success, true);
    contestId = contestRes.contestId!;
  });

  after(async () => {
    setTestSession(adminSession);
    try {
      if (contestId) {
        await prisma.contest.deleteMany({ where: { id: contestId } });
      }
    } finally {
      setTestSession(undefined);
      await prisma.$disconnect();
    }
  });

  describe("1. Admin Contest Lifecycle & Management Actions", () => {
    it("Admin can update contest details and lifecycle status", async () => {
      setTestSession(adminSession);

      const updateRes = await updateContestAction(contestId, {
        title: "Updated Nav Contest Title",
        track: "Track Nav · Updated",
      });
      assert.strictEqual(updateRes.success, true);
      assert.strictEqual(updateRes.contest?.title, "Updated Nav Contest Title");

      const statusRes = await updateContestStatusAction(contestId, "COMPLETED");
      assert.strictEqual(statusRes.success, true);
      assert.strictEqual(statusRes.contest?.status, "COMPLETED");
    });

    it("Rejects non-admin attempting contest status updates", async () => {
      setTestSession(participantSession);
      const res = await updateContestStatusAction(contestId, "LIVE");
      assert.strictEqual(res.success, false);
      assert.match(res.error || "", /Forbidden/);
    });
  });

  describe("2. Admin Phase and Task Builder Architect Actions", () => {
    it("Admin can create a new phase and task within contest", async () => {
      setTestSession(adminSession);

      const phaseRes = await createPhaseAction({
        contestId,
        phaseNumber: 2,
        title: "Phase 2: Advanced Case Analysis",
        deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
      });
      assert.strictEqual(phaseRes.success, true);
      phaseId = phaseRes.phaseId!;

      const taskRes = await createTaskAction({
        phaseId,
        taskNumber: 1,
        title: "Task 2.1: Strategic ROI Assessment",
        totalPoints: 100,
      });
      assert.strictEqual(taskRes.success, true);
      taskId = taskRes.taskId!;
    });

    it("Admin can create an MCQ question with private answer key and delete it", async () => {
      setTestSession(adminSession);

      const qRes = await createQuestionAction({
        taskId,
        questionNumber: 1,
        type: "MCQ",
        prompt: "What is the primary capital efficiency metric?",
        points: 10,
        options: [
          { optionKey: "A", text: "ROIC (Return on Invested Capital)" },
          { optionKey: "B", text: "Gross Revenue volume only" },
        ],
        correctOptionKey: "A",
        explanation: "ROIC directly gauges capital allocation efficiency.",
      });
      assert.strictEqual(qRes.success, true);
      createdQuestionId = qRes.questionId!;

      // Verify question exists in task architect
      const curriculum = await getContestPhasesAndTasks(contestId);
      const targetPhase = curriculum.phases.find((p) => p.id === phaseId);
      assert.ok(targetPhase);
      const targetTask = targetPhase.tasks.find((t) => t.id === taskId);
      assert.ok(targetTask);
      const targetQ = targetTask.questions.find((q) => q.id === createdQuestionId);
      assert.ok(targetQ);
      assert.strictEqual(targetQ.answerKey?.correctOptionKey, "A");

      // Delete the question
      const delRes = await deleteQuestionAction(createdQuestionId);
      assert.strictEqual(delRes.success, true);
    });

    it("Rejects participant attempting to create questions", async () => {
      setTestSession(participantSession);
      const res = await createQuestionAction({
        taskId,
        questionNumber: 2,
        type: "WRITTEN",
        prompt: "Unauthorized question prompt",
        points: 20,
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error || "", /Forbidden/);
    });
  });

  describe("3. Admin Submissions & Audit Log Ledger", () => {
    it("Admin can fetch submissions list with metrics", async () => {
      setTestSession(adminSession);

      const overview = await getAdminSubmissionsList();
      assert.ok(Array.isArray(overview.contests));
      assert.ok(typeof overview.metrics.totalSubmissions === "number");
      assert.ok(Array.isArray(overview.submissions));
    });

    it("Admin can query system audit logs", async () => {
      setTestSession(adminSession);

      const logs = await getAdminAuditLogs(10);
      assert.ok(Array.isArray(logs));
      assert.ok(logs.length > 0);
      assert.ok(logs[0].action);
      assert.ok(logs[0].createdAt);
    });

    it("Admin can inspect participants directory", async () => {
      setTestSession(adminSession);

      const participants = await getAdminParticipants();
      assert.ok(Array.isArray(participants));
      assert.ok(participants.length > 0);
    });
  });

  describe("4. Participant Navigation, Standings & Scorecard Privacy", () => {
    it("Participant receives categorized assigned contests (live/upcoming/completed)", async () => {
      // Find candidate demo user id from db
      const candidateUser = await prisma.user.findUnique({
        where: { email: "candidate.demo@example.com" },
      });
      assert.ok(candidateUser);

      setTestSession({
        ...participantSession,
        userId: candidateUser.id,
      });

      const contestData = await getParticipantContests();
      assert.ok(Array.isArray(contestData.live));
      assert.ok(Array.isArray(contestData.upcoming));
      assert.ok(Array.isArray(contestData.completed));
    });

    it("Participant leaderboard anonymizes other candidates with candidate IDs", async () => {
      const candidateUser = await prisma.user.findUnique({
        where: { email: "candidate.demo@example.com" },
      });
      assert.ok(candidateUser);

      setTestSession({
        ...participantSession,
        userId: candidateUser.id,
      });

      const leaderboard = await getParticipantLeaderboard();
      assert.ok(leaderboard);
      assert.ok(Array.isArray(leaderboard.rows));

      // Assert competitor emails are NOT exposed in candidateId
      for (const row of leaderboard.rows) {
        if (!row.isCurrentUser) {
          assert.strictEqual(row.candidateId.includes("@"), false, "Competitor email leaked in leaderboard row!");
        }
      }
    });

    it("Participant scorecard strictly hides uncertified scores when isPublished is false", async () => {
      const candidateUser = await prisma.user.findUnique({
        where: { email: "candidate.demo@example.com" },
      });
      assert.ok(candidateUser);

      setTestSession({
        ...participantSession,
        userId: candidateUser.id,
      });

      const scorecard = await getParticipantScorecard(contestId);
      // Because contestId has isPublished = false, scorecard must not expose scores
      if (scorecard) {
        assert.strictEqual(scorecard.isPublished, false);
        assert.strictEqual(scorecard.totalScore, 0);
        assert.strictEqual(scorecard.rubrics.length, 0);
      }
    });

    it("Participant can fetch account profile without administrative controls", async () => {
      const candidateUser = await prisma.user.findUnique({
        where: { email: "candidate.demo@example.com" },
      });
      assert.ok(candidateUser);

      setTestSession({
        ...participantSession,
        userId: candidateUser.id,
      });

      const profile = await getParticipantProfile();
      assert.ok(profile);
      assert.strictEqual(profile.email, "candidate.demo@example.com");
      assert.ok(profile.candidateId);
      assert.ok(typeof profile.enrolledContestsCount === "number");
    });
  });
});
