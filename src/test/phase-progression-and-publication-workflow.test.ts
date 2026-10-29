/**
 * Regression Test Suite: Phase Progression & Admin Publication Workflows
 *
 * Verifies:
 * 1. Automatic progression across tasks and phases:
 *    - Intermediate task submission automatically advances to the next task.
 *    - Final task of Phase 1 advances to the first task of Phase 2.
 *    - Final task of Phase 2 concludes the assessment and redirects to leaderboard.
 *    - Unpublished leaderboard shields scores and rankings.
 * 2. Admin result publication validation:
 *    - Genuinely incomplete (unsubmitted) assessments blocked with exact task identification.
 *    - Written / file-upload answers awaiting manual grading blocked with exact task identification.
 *    - Submitted MCQ-only assessments succeed without requiring manual grading.
 *    - Fully finalized submissions publish cleanly and reveal certified rankings.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  getTaskAssessmentData,
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";
import {
  uploadSubmissionAttachmentAction,
  getFileDownloadUrlAction,
} from "../app/actions/file-actions";
import {
  gradeSubmissionAction,
  publishContestResultsAction,
} from "../app/actions/evaluator-actions";
import {
  getParticipantLeaderboard,
  getParticipantScorecard,
} from "../app/actions/participant-nav-actions";

describe("Phase Progression & Admin Result Publication Workflows", () => {
  const contestId = "77777777-1111-4000-8000-000000000001";
  const mcqContestId = "77777777-2222-4000-8000-000000000002";

  const adminEmail = "progression.admin@test.aciedge.edu";
  const evaluatorEmail = "progression.evaluator@test.aciedge.edu";
  const candidateEmail = "progression.candidate@test.aciedge.edu";

  let adminId = "";
  let evaluatorId = "";
  let candidateId = "";

  let phase1Id = "";
  let phase2Id = "";
  let task11Id = "";
  let task12Id = "";
  let task21Id = "";
  let task22Id = "";

  let q11Id = "";
  let q12Id = "";
  let q21Id = "";
  let q22Id = "";

  // MCQ-only contest IDs
  let mcqPhaseId = "";
  let mcqTaskId = "";
  let mcqQId = "";

  const FAKE_PDF =
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 20 >>\nstream\nBT /F1 12 Tf ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n180\n%%EOF";

  before(async () => {
    // 1. Setup users
    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: UserRole.ADMIN },
      create: {
        id: "70000000-0000-4000-8000-000000000001",
        email: adminEmail,
        name: "Progression Admin",
        role: UserRole.ADMIN,
      },
    });
    adminId = adminUser.id;

    const evalUser = await prisma.user.upsert({
      where: { email: evaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: "70000000-0000-4000-8000-000000000002",
        email: evaluatorEmail,
        name: "Progression Evaluator",
        role: UserRole.EVALUATOR,
      },
    });
    evaluatorId = evalUser.id;

    const candUser = await prisma.user.upsert({
      where: { email: candidateEmail },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: "70000000-0000-4000-8000-000000000003",
        email: candidateEmail,
        name: "Progression Candidate",
        candidateId: "CAND-PROG-01",
        role: UserRole.PARTICIPANT,
      },
    });
    candidateId = candUser.id;

    // 2. Setup Multi-Phase Contest
    await prisma.contest.upsert({
      where: { id: contestId },
      update: {
        title: "Progression Multi-Phase Verification Contest",
        slug: "progression-multiphase-verification",
        track: "General",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T23:59:59Z"),
        enforceSequentialProgress: true,
        isPublished: false,
      },
      create: {
        id: contestId,
        title: "Progression Multi-Phase Verification Contest",
        slug: "progression-multiphase-verification",
        track: "General",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T23:59:59Z"),
        enforceSequentialProgress: true,
        isPublished: false,
      },
    });

    // Cleanup past phases/participants
    await prisma.phase.deleteMany({ where: { contestId } });
    await prisma.contestParticipant.deleteMany({ where: { contestId } });

    // Enroll candidate
    await prisma.contestParticipant.create({
      data: { contestId, userId: candidateId, status: "ACTIVE" },
    });

    // Allocate evaluator
    const ce = await prisma.contestEvaluator.upsert({
      where: { contestId_userId: { contestId, userId: evaluatorId } },
      update: {},
      create: { contestId, userId: evaluatorId },
    });
    await prisma.evaluatorCandidateAssignment.upsert({
      where: {
        contestId_evaluatorId_participantId: {
          contestId,
          evaluatorId,
          participantId: candidateId,
        },
      },
      update: { contestEvaluatorId: ce.id },
      create: {
        contestId,
        contestEvaluatorId: ce.id,
        evaluatorId,
        participantId: candidateId,
      },
    });

    // Phase 1: Foundation (Tasks 1.1 and 1.2)
    const p1 = await prisma.phase.create({
      data: {
        contestId,
        phaseNumber: 1,
        title: "Phase 1: Foundation",
        deadline: new Date("2027-12-31T23:59:59Z"),
        weightPercentage: 50,
        status: PhaseStatus.OPEN,
      },
    });
    phase1Id = p1.id;

    const t11 = await prisma.task.create({
      data: {
        phaseId: phase1Id,
        taskNumber: 1,
        title: "Task 1.1 Strategy MCQs",
        totalPoints: 20,
      },
    });
    task11Id = t11.id;

    const q11 = await prisma.question.create({
      data: {
        taskId: task11Id,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "Choose the correct growth vector",
        points: 20,
        options: {
          create: [
            { optionKey: "A", text: "Market Penetration" },
            { optionKey: "B", text: "Random Speculation" },
          ],
        },
        answerKey: {
          create: { correctOptionKey: "A" },
        },
      },
    });
    q11Id = q11.id;

    const t12 = await prisma.task.create({
      data: {
        phaseId: phase1Id,
        taskNumber: 2,
        title: "Task 1.2 Strategy PDF Deliverable",
        totalPoints: 30,
      },
    });
    task12Id = t12.id;

    const q12 = await prisma.question.create({
      data: {
        taskId: task12Id,
        questionNumber: 1,
        type: QuestionType.FILE_UPLOAD,
        prompt: "Upload Strategy Deck (PDF)",
        points: 30,
      },
    });
    q12Id = q12.id;

    // Phase 2: Execution (Tasks 2.1 and 2.2)
    const p2 = await prisma.phase.create({
      data: {
        contestId,
        phaseNumber: 2,
        title: "Phase 2: Execution",
        deadline: new Date("2027-12-31T23:59:59Z"),
        weightPercentage: 50,
        status: PhaseStatus.OPEN,
      },
    });
    phase2Id = p2.id;

    const t21 = await prisma.task.create({
      data: {
        phaseId: phase2Id,
        taskNumber: 1,
        title: "Task 2.1 Operations Essay",
        totalPoints: 25,
      },
    });
    task21Id = t21.id;

    const q21 = await prisma.question.create({
      data: {
        taskId: task21Id,
        questionNumber: 1,
        type: QuestionType.WRITTEN,
        prompt: "Describe resource allocation framework",
        points: 25,
      },
    });
    q21Id = q21.id;

    const t22 = await prisma.task.create({
      data: {
        phaseId: phase2Id,
        taskNumber: 2,
        title: "Task 2.2 Final Executive Summary PDF",
        totalPoints: 25,
      },
    });
    task22Id = t22.id;

    const q22 = await prisma.question.create({
      data: {
        taskId: task22Id,
        questionNumber: 1,
        type: QuestionType.FILE_UPLOAD,
        prompt: "Upload Executive Summary PDF",
        points: 25,
      },
    });
    q22Id = q22.id;

    // 3. Setup MCQ-Only Contest
    await prisma.contest.upsert({
      where: { id: mcqContestId },
      update: {
        title: "MCQ-Only Benchmark Contest",
        slug: "mcq-only-benchmark-contest",
        track: "Analytics",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T23:59:59Z"),
        enforceSequentialProgress: false,
        isPublished: false,
      },
      create: {
        id: mcqContestId,
        title: "MCQ-Only Benchmark Contest",
        slug: "mcq-only-benchmark-contest",
        track: "Analytics",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T23:59:59Z"),
        enforceSequentialProgress: false,
        isPublished: false,
      },
    });
    await prisma.phase.deleteMany({ where: { contestId: mcqContestId } });
    await prisma.contestParticipant.deleteMany({ where: { contestId: mcqContestId } });

    await prisma.contestParticipant.create({
      data: { contestId: mcqContestId, userId: candidateId, status: "ACTIVE" },
    });

    const mcqP = await prisma.phase.create({
      data: {
        contestId: mcqContestId,
        phaseNumber: 1,
        title: "MCQ Phase",
        deadline: new Date("2027-12-31T23:59:59Z"),
        weightPercentage: 100,
        status: PhaseStatus.OPEN,
      },
    });
    mcqPhaseId = mcqP.id;

    const mcqT = await prisma.task.create({
      data: {
        phaseId: mcqPhaseId,
        taskNumber: 1,
        title: "MCQ Knowledge Test",
        totalPoints: 50,
      },
    });
    mcqTaskId = mcqT.id;

    const mcqQ = await prisma.question.create({
      data: {
        taskId: mcqTaskId,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "Identify the leading indicator",
        points: 50,
        options: {
          create: [
            { optionKey: "A", text: "Customer Inquiries" },
            { optionKey: "B", text: "Historical Depreciation" },
          ],
        },
        answerKey: {
          create: { correctOptionKey: "A" },
        },
      },
    });
    mcqQId = mcqQ.id;
  });

  after(async () => {
    setTestSession(null);
    try {
      await prisma.cohortResult.deleteMany({ where: { contestId: { in: [contestId, mcqContestId] } } });
      await prisma.submission.deleteMany({ where: { contestId: { in: [contestId, mcqContestId] } } });
      await prisma.evaluatorCandidateAssignment.deleteMany({ where: { contestId } });
      await prisma.contestEvaluator.deleteMany({ where: { contestId } });
      await prisma.phase.deleteMany({ where: { contestId: { in: [contestId, mcqContestId] } } });
      await prisma.contestParticipant.deleteMany({ where: { contestId: { in: [contestId, mcqContestId] } } });
      await prisma.contest.deleteMany({ where: { id: { in: [contestId, mcqContestId] } } });
    } catch {
      // Safe cleanup
    }
  });

  describe("Automatic Progression Between Tasks and Across Phases", () => {
    test("Candidate completes Task 1.1 -> automatically resolves progression to Task 1.2", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      // Load Task 1.1
      const t11Data = await getTaskAssessmentData(contestId, task11Id);
      assert.ok(t11Data.submission);
      assert.equal(t11Data.task.id, task11Id);

      // Save answer
      await saveAnswerDraftAction(t11Data.submission.id, q11Id, { selectedOption: "A" });

      // Submit Task 1.1
      const res11 = await submitAssessmentAction(t11Data.submission.id);
      assert.equal(res11.success, true);
      assert.equal(res11.isFinalSubmission, false);
      assert.equal(res11.nextTaskId, task12Id);
      assert.equal(res11.nextPhaseId, phase1Id);
    });

    test("Candidate completes Task 1.2 (final task of Phase 1) -> automatically advances to Task 2.1 (Phase 2)", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      // Load Task 1.2
      const t12Data = await getTaskAssessmentData(contestId, task12Id);
      assert.ok(t12Data.submission);
      assert.equal(t12Data.task.id, task12Id);

      // Upload deliverable
      const formData = new FormData();
      formData.append("submissionId", t12Data.submission.id);
      formData.append("questionId", q12Id);
      formData.append("file", new Blob([FAKE_PDF], { type: "application/pdf" }), "Strategy_Proposal.pdf");
      const uploadRes = await uploadSubmissionAttachmentAction(formData);
      assert.equal(uploadRes.success, true);

      // Submit Task 1.2 (Final task of Phase 1)
      const res12 = await submitAssessmentAction(t12Data.submission.id);
      assert.equal(res12.success, true);
      assert.equal(res12.isFinalSubmission, false);
      assert.equal(res12.nextTaskId, task21Id);
      assert.equal(res12.nextPhaseId, phase2Id);
    });

    test("Candidate completes Task 2.1 -> automatically resolves progression to Task 2.2", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      // Load Task 2.1 (Now unlocked in Phase 2)
      const t21Data = await getTaskAssessmentData(contestId, task21Id);
      assert.equal(t21Data.isRedirectedFromLocked, false);
      assert.equal(t21Data.task.id, task21Id);
      assert.ok(t21Data.submission);

      // Save written essay draft
      await saveAnswerDraftAction(t21Data.submission.id, q21Id, {
        writtenText: "Comprehensive operational resource management framework aligned with targets.",
      });

      // Submit Task 2.1
      const res21 = await submitAssessmentAction(t21Data.submission.id);
      assert.equal(res21.success, true);
      assert.equal(res21.isFinalSubmission, false);
      assert.equal(res21.nextTaskId, task22Id);
      assert.equal(res21.nextPhaseId, phase2Id);
    });

    test("Candidate completes Task 2.2 (final task of final phase) -> sets isFinalSubmission: true and routes to Leaderboard", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      // Load Task 2.2
      const t22Data = await getTaskAssessmentData(contestId, task22Id);
      assert.equal(t22Data.task.id, task22Id);
      assert.ok(t22Data.submission);

      // Upload deliverable
      const formData = new FormData();
      formData.append("submissionId", t22Data.submission.id);
      formData.append("questionId", q22Id);
      formData.append("file", new Blob([FAKE_PDF], { type: "application/pdf" }), "Executive_Summary.pdf");
      const uploadRes = await uploadSubmissionAttachmentAction(formData);
      assert.equal(uploadRes.success, true);

      // Final contest submit
      const res22 = await submitAssessmentAction(t22Data.submission.id);
      assert.equal(res22.success, true);
      assert.equal(res22.isFinalSubmission, true);
      assert.equal(res22.nextTaskId, undefined);
      assert.equal(res22.nextPhaseId, undefined);
    });

    test("Participant visits leaderboard while contest is unpublished: scores and rankings remain shielded", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      const lb = await getParticipantLeaderboard(contestId);
      assert.equal(lb.isPublished, false);
      assert.equal(lb.currentUserRank, null);
      assert.equal(lb.rows.length, 0);

      const scorecard = await getParticipantScorecard(contestId);
      assert.ok(scorecard);
      assert.equal(scorecard.isPublished, false);
      assert.equal(scorecard.totalScore, 0);
      assert.equal(scorecard.rank, null);
      assert.equal(scorecard.isCertified, false);
    });

    test("Submitting an already-finalized task is idempotent and preserves submission state", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      const t11 = await prisma.submission.findFirst({
        where: { contestId, taskId: task11Id, userId: candidateId },
      });
      assert.ok(t11);

      const repeatRes = await submitAssessmentAction(t11.id);
      assert.equal(repeatRes.success, true);
      assert.equal(repeatRes.message, "Already submitted.");
      assert.equal(repeatRes.isFinalSubmission, true); // All contest tasks are submitted
    });
  });

  describe("Admin Result Publication Validation & Error Pinpointing", () => {
    test("Publication blocked when candidate has unfinalized manual grading (identifies exact task)", async () => {
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Progression Admin",
      });

      // Tasks 1.2, 2.1, 2.2 have not been graded yet
      const pubRes = await publishContestResultsAction(contestId);
      assert.equal(pubRes.success, false);
      // Must NOT blame Task 1.1 MCQ Diagnostics! Must identify Task 1.2
      assert.match(pubRes.error!, /Task 1\.2 Strategy PDF Deliverable/);
      assert.match(pubRes.error!, /Progression Candidate/);
    });

    test("Publication blocked when an assessment is genuinely unsubmitted", async () => {
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Progression Admin",
      });

      // Delete candidate's Task 2.2 submission to simulate genuinely incomplete
      await prisma.submissionAnswer.deleteMany({
        where: { submission: { contestId, taskId: task22Id, userId: candidateId } },
      });
      await prisma.submission.deleteMany({
        where: { contestId, taskId: task22Id, userId: candidateId },
      });

      const pubRes = await publishContestResultsAction(contestId);
      assert.equal(pubRes.success, false);
      assert.match(pubRes.error!, /unsubmitted assessments \(Task 2\.2/);
      assert.match(pubRes.error!, /Progression Candidate/);

      // Restore Task 2.2 submission for subsequent tests
      await prisma.submission.create({
        data: {
          contestId,
          phaseId: phase2Id,
          taskId: task22Id,
          userId: candidateId,
          status: "SUBMITTED",
          submittedAt: new Date(),
          autoGradeScore: 0,
        },
      });
    });

    test("Submitted MCQ-only assessments publish cleanly without requiring manual grading", async () => {
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      // Candidate takes MCQ test
      const mcqData = await getTaskAssessmentData(mcqContestId, mcqTaskId);
      assert.ok(mcqData.submission);
      await saveAnswerDraftAction(mcqData.submission.id, mcqQId, { selectedOption: "A" });
      const subRes = await submitAssessmentAction(mcqData.submission.id);
      assert.equal(subRes.success, true);
      assert.equal(subRes.isFinalSubmission, true);

      // Admin publishes MCQ-only contest
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Progression Admin",
      });

      const pubRes = await publishContestResultsAction(mcqContestId);
      assert.equal(pubRes.success, true);
      assert.equal(pubRes.isPublished, true);
      assert.equal(pubRes.publishedCount, 1);

      // Check contest in DB
      const dbContest = await prisma.contest.findUnique({ where: { id: mcqContestId } });
      assert.equal(dbContest?.isPublished, true);
      assert.equal(dbContest?.status, "COMPLETED");
    });

    test("Fully finalized submissions publish cleanly and reveal certified leaderboard", async () => {
      // Evaluator grades all manual tasks
      setTestSession({
        userId: evaluatorId,
        email: evaluatorEmail,
        role: "EVALUATOR",
        name: "Progression Evaluator",
      });

      const t12Sub = await prisma.submission.findFirst({
        where: { contestId, taskId: task12Id, userId: candidateId },
      });
      assert.ok(t12Sub);

      const gradeRes = await gradeSubmissionAction({
        submissionId: t12Sub.id,
        isDraft: false,
        questionGrades: [
          { questionId: q12Id, score: 25, feedback: "Excellent strategy PDF presentation." },
          { questionId: q21Id, score: 20, feedback: "Sound operational plan." },
          { questionId: q22Id, score: 25, feedback: "Clear summary." },
        ],
        overallFeedback: "Strong executive performance across all phases.",
      });
      assert.equal(gradeRes.success, true);

      // Admin publishes contest
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Progression Admin",
      });

      const pubRes = await publishContestResultsAction(contestId);
      assert.equal(pubRes.success, true);
      assert.equal(pubRes.isPublished, true);
      assert.equal(pubRes.publishedCount, 1);

      // Candidate verifies published leaderboard and scorecard
      setTestSession({
        userId: candidateId,
        email: candidateEmail,
        role: "PARTICIPANT",
        name: "Progression Candidate",
      });

      const lb = await getParticipantLeaderboard(contestId);
      assert.equal(lb.isPublished, true);
      assert.equal(lb.currentUserRank, 1);
      assert.equal(lb.rows.length, 1);
      assert.equal(lb.rows[0].finalScore, 90); // 20 (MCQ) + 25 + 20 + 25 = 90 pts

      const scorecard = await getParticipantScorecard(contestId);
      assert.ok(scorecard);
      assert.equal(scorecard.isPublished, true);
      assert.equal(scorecard.totalScore, 90);
    });
  });
});
