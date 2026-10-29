/**
 * EDGE-Arena / ACI Career EDGE Assess
 * Evaluator-to-Contest Allocation & Strict Authorization Test Suite
 *
 * Verifies:
 * 1. Admin-only evaluator allocation to contests
 * 2. Individual candidate assignment with configurable workloads
 * 3. Strict access control: evaluators only see explicitly assigned contests
 * 4. Strict candidate isolation: Evaluator A cannot see or grade Candidate B's submissions
 * 5. Direct file/PDF access authorization: Evaluator A cannot access Candidate B's PDF
 * 6. Unassigned evaluators cannot see contests, submissions, or files
 * 7. Admin reassignment updates permissions immediately
 * 8. Evaluator removal from contest cascades and revokes access
 * 9. Admin access remains unrestricted across all contests, candidates, and files
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import { setTestSession } from "@/lib/auth";
import {
  assignEvaluatorToContestAction,
  batchAssignEvaluatorsToContestAction,
  removeEvaluatorFromContestAction,
  allocateCandidatesToEvaluatorAction,
  unassignCandidateFromEvaluatorAction,
  getContestCandidateAllocationsAction,
  getContestEvaluatorsAction,
} from "@/app/actions/evaluator-allocation-actions";
import {
  getEvaluatorDashboardDataAction,
  getSubmissionsForGrading,
  gradeSubmissionAction,
} from "@/app/actions/evaluator-actions";
import { getFileDownloadUrlAction } from "@/app/actions/file-actions";
import { getAdminContestOptions } from "@/app/actions/contest-actions";

// Unique deterministic test IDs to avoid conflicts
const TEST_ADMIN_ID = "11111111-0000-4000-8000-000000000001";
const TEST_EVAL_A_ID = "11111111-0000-4000-8000-000000000002";
const TEST_EVAL_B_ID = "11111111-0000-4000-8000-000000000003";
const TEST_EVAL_C_ID = "11111111-0000-4000-8000-000000000004"; // Unassigned evaluator
const TEST_CAND_1_ID = "11111111-0000-4000-8000-000000000005";
const TEST_CAND_2_ID = "11111111-0000-4000-8000-000000000006";

const TEST_CONTEST_1_ID = "22222222-0000-4000-8000-000000000001";
const TEST_CONTEST_2_ID = "22222222-0000-4000-8000-000000000002"; // Unassigned contest

let cand1SubId = "";
let cand2SubId = "";
let cand1FileKey = "submissions/test-cand1-doc.pdf";
let cand2FileKey = "submissions/test-cand2-doc.pdf";

test.before(async () => {
  // 1. Ensure test users
  await prisma.user.upsert({
    where: { id: TEST_ADMIN_ID },
    update: { email: "admin.alloc.test@example.com", role: UserRole.ADMIN, isActive: true },
    create: {
      id: TEST_ADMIN_ID,
      email: "admin.alloc.test@example.com",
      name: "Admin Alloc Tester",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { id: TEST_EVAL_A_ID },
    update: { email: "eval.a.test@example.com", role: UserRole.EVALUATOR, isActive: true },
    create: {
      id: TEST_EVAL_A_ID,
      email: "eval.a.test@example.com",
      name: "Evaluator Alpha",
      role: UserRole.EVALUATOR,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { id: TEST_EVAL_B_ID },
    update: { email: "eval.b.test@example.com", role: UserRole.EVALUATOR, isActive: true },
    create: {
      id: TEST_EVAL_B_ID,
      email: "eval.b.test@example.com",
      name: "Evaluator Beta",
      role: UserRole.EVALUATOR,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { id: TEST_EVAL_C_ID },
    update: { email: "eval.c.test@example.com", role: UserRole.EVALUATOR, isActive: true },
    create: {
      id: TEST_EVAL_C_ID,
      email: "eval.c.test@example.com",
      name: "Evaluator Gamma (Unassigned)",
      role: UserRole.EVALUATOR,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { id: TEST_CAND_1_ID },
    update: { email: "cand.one.test@example.com", role: UserRole.PARTICIPANT, isActive: true },
    create: {
      id: TEST_CAND_1_ID,
      email: "cand.one.test@example.com",
      name: "Candidate One",
      candidateId: "CAND-001-ALLOC",
      role: UserRole.PARTICIPANT,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { id: TEST_CAND_2_ID },
    update: { email: "cand.two.test@example.com", role: UserRole.PARTICIPANT, isActive: true },
    create: {
      id: TEST_CAND_2_ID,
      email: "cand.two.test@example.com",
      name: "Candidate Two",
      candidateId: "CAND-002-ALLOC",
      role: UserRole.PARTICIPANT,
      isActive: true,
    },
  });

  // 2. Ensure test contests
  await prisma.contest.upsert({
    where: { id: TEST_CONTEST_1_ID },
    update: { status: ContestStatus.LIVE, isPublished: false },
    create: {
      id: TEST_CONTEST_1_ID,
      title: "Allocation Test Challenge Alpha",
      slug: "allocation-test-challenge-alpha",
      track: "Operations Track",
      status: ContestStatus.LIVE,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    },
  });

  await prisma.contest.upsert({
    where: { id: TEST_CONTEST_2_ID },
    update: { status: ContestStatus.LIVE, isPublished: false },
    create: {
      id: TEST_CONTEST_2_ID,
      title: "Allocation Test Challenge Beta (Unassigned)",
      slug: "allocation-test-challenge-beta",
      track: "Strategy Track",
      status: ContestStatus.LIVE,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
    },
  });

  // Enroll Candidate 1 and Candidate 2 into Contest 1
  await prisma.contestParticipant.upsert({
    where: { contestId_userId: { contestId: TEST_CONTEST_1_ID, userId: TEST_CAND_1_ID } },
    update: { status: "ACTIVE" },
    create: { contestId: TEST_CONTEST_1_ID, userId: TEST_CAND_1_ID, status: "ACTIVE" },
  });

  await prisma.contestParticipant.upsert({
    where: { contestId_userId: { contestId: TEST_CONTEST_1_ID, userId: TEST_CAND_2_ID } },
    update: { status: "ACTIVE" },
    create: { contestId: TEST_CONTEST_1_ID, userId: TEST_CAND_2_ID, status: "ACTIVE" },
  });

  // Ensure Phase, Task, and Question in Contest 1
  const phase1 = await prisma.phase.upsert({
    where: { contestId_phaseNumber: { contestId: TEST_CONTEST_1_ID, phaseNumber: 1 } },
    update: {},
    create: {
      id: "33333333-0000-4000-8000-000000000001",
      contestId: TEST_CONTEST_1_ID,
      phaseNumber: 1,
      title: "Evaluation Phase 1",
      weightPercentage: 100,
      deadline: new Date("2026-12-31T23:59:59Z"),
      status: PhaseStatus.OPEN,
    },
  });

  const task1 = await prisma.task.upsert({
    where: { phaseId_taskNumber: { phaseId: phase1.id, taskNumber: 1 } },
    update: {},
    create: {
      id: "44444444-0000-4000-8000-000000000001",
      phaseId: phase1.id,
      taskNumber: 1,
      title: "Strategic Case Analysis",
      totalPoints: 50,
    },
  });

  const q1 = await prisma.question.upsert({
    where: { id: "55555555-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "55555555-0000-4000-8000-000000000001",
      taskId: task1.id,
      questionNumber: 1,
      type: QuestionType.FILE_UPLOAD,
      prompt: "Upload Analysis Deliverable PDF",
      points: 50,
    },
  });

  // Create Submissions & Answers for Candidate 1 and Candidate 2
  const sub1 = await prisma.submission.upsert({
    where: { id: "66666666-0000-4000-8000-000000000001" },
    update: { status: "SUBMITTED" },
    create: {
      id: "66666666-0000-4000-8000-000000000001",
      contestId: TEST_CONTEST_1_ID,
      phaseId: phase1.id,
      taskId: task1.id,
      userId: TEST_CAND_1_ID,
      status: "SUBMITTED",
      submittedAt: new Date("2026-03-01T10:00:00Z"),
    },
  });
  cand1SubId = sub1.id;

  await prisma.submissionAnswer.upsert({
    where: { submissionId_questionId: { submissionId: sub1.id, questionId: q1.id } },
    update: { fileKey: cand1FileKey, fileName: "cand1-deck.pdf" },
    create: {
      submissionId: sub1.id,
      questionId: q1.id,
      fileKey: cand1FileKey,
      fileName: "cand1-deck.pdf",
    },
  });

  const sub2 = await prisma.submission.upsert({
    where: { id: "66666666-0000-4000-8000-000000000002" },
    update: { status: "SUBMITTED" },
    create: {
      id: "66666666-0000-4000-8000-000000000002",
      contestId: TEST_CONTEST_1_ID,
      phaseId: phase1.id,
      taskId: task1.id,
      userId: TEST_CAND_2_ID,
      status: "SUBMITTED",
      submittedAt: new Date("2026-03-01T11:00:00Z"),
    },
  });
  cand2SubId = sub2.id;

  await prisma.submissionAnswer.upsert({
    where: { submissionId_questionId: { submissionId: sub2.id, questionId: q1.id } },
    update: { fileKey: cand2FileKey, fileName: "cand2-deck.pdf" },
    create: {
      submissionId: sub2.id,
      questionId: q1.id,
      fileKey: cand2FileKey,
      fileName: "cand2-deck.pdf",
    },
  });

  // Clean any old assignments for test contests
  await prisma.evaluatorCandidateAssignment.deleteMany({
    where: { contestId: { in: [TEST_CONTEST_1_ID, TEST_CONTEST_2_ID] } },
  });
  await prisma.contestEvaluator.deleteMany({
    where: { contestId: { in: [TEST_CONTEST_1_ID, TEST_CONTEST_2_ID] } },
  });
});

test.after(async () => {
  setTestSession(null);
  await prisma.evaluatorCandidateAssignment.deleteMany({
    where: { contestId: { in: [TEST_CONTEST_1_ID, TEST_CONTEST_2_ID] } },
  });
  await prisma.contestEvaluator.deleteMany({
    where: { contestId: { in: [TEST_CONTEST_1_ID, TEST_CONTEST_2_ID] } },
  });
});

test("1. Admin-only evaluator allocation to contests", async () => {
  // Evaluator session attempts to assign themselves or another evaluator -> rejected
  setTestSession({
    userId: TEST_EVAL_A_ID,
    email: "eval.a.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Alpha",
  });

  const rejectedRes = await assignEvaluatorToContestAction(TEST_CONTEST_1_ID, TEST_EVAL_A_ID);
  assert.equal(rejectedRes.success, false, "Non-admin role must be rejected from assigning evaluators");
  assert.match(rejectedRes.error || "", /Forbidden|not authorized/i);

  // Admin session assigns Evaluator Alpha and Evaluator Beta to Contest 1
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  const resA = await assignEvaluatorToContestAction(TEST_CONTEST_1_ID, TEST_EVAL_A_ID);
  assert.equal(resA.success, true, "Admin should assign Evaluator Alpha to Contest 1");

  const resB = await assignEvaluatorToContestAction(TEST_CONTEST_1_ID, TEST_EVAL_B_ID);
  assert.equal(resB.success, true, "Admin should assign Evaluator Beta to Contest 1");

  // Verify persistence in ContestEvaluator
  const contestEvaluators = await prisma.contestEvaluator.findMany({
    where: { contestId: TEST_CONTEST_1_ID },
  });
  assert.equal(contestEvaluators.length, 2, "Contest 1 must have exactly 2 assigned evaluators");
});

test("2. Admin allocates specific candidates with configurable workloads", async () => {
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  // Admin allocates Candidate 1 to Evaluator Alpha
  const allocA = await allocateCandidatesToEvaluatorAction({
    contestId: TEST_CONTEST_1_ID,
    evaluatorId: TEST_EVAL_A_ID,
    participantIds: [TEST_CAND_1_ID],
    reassign: true,
  });
  assert.equal(allocA.success, true);
  assert.equal(allocA.allocatedCount, 1);

  // Admin allocates Candidate 2 to Evaluator Beta
  const allocB = await allocateCandidatesToEvaluatorAction({
    contestId: TEST_CONTEST_1_ID,
    evaluatorId: TEST_EVAL_B_ID,
    participantIds: [TEST_CAND_2_ID],
    reassign: true,
  });
  assert.equal(allocB.success, true);
  assert.equal(allocB.allocatedCount, 1);

  // Verify overview reports both allocations accurately
  const overview = await getContestCandidateAllocationsAction(TEST_CONTEST_1_ID);
  assert.ok(overview);
  assert.equal(overview.totalEnrolledCandidates, 2);
  assert.equal(overview.allocatedCandidatesCount, 2);
  assert.equal(overview.unallocatedCandidatesCount, 0);

  const cand1Item = overview.candidates.find((c) => c.participantId === TEST_CAND_1_ID);
  assert.equal(cand1Item?.assignedEvaluatorId, TEST_EVAL_A_ID);

  const cand2Item = overview.candidates.find((c) => c.participantId === TEST_CAND_2_ID);
  assert.equal(cand2Item?.assignedEvaluatorId, TEST_EVAL_B_ID);
});

test("3. Strict access control: Evaluator Alpha only sees Contest 1 and Candidate 1's submission", async () => {
  setTestSession({
    userId: TEST_EVAL_A_ID,
    email: "eval.a.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Alpha",
  });

  const dashboardData = await getEvaluatorDashboardDataAction();

  // Evaluator Alpha must NOT see Contest 2 (since they are only assigned to Contest 1)
  const contestIds = dashboardData.assignedContests.map((c) => c.id);
  assert.ok(contestIds.includes(TEST_CONTEST_1_ID), "Evaluator Alpha must see Contest 1");
  assert.ok(!contestIds.includes(TEST_CONTEST_2_ID), "Evaluator Alpha must NOT see unassigned Contest 2");

  // Evaluator Alpha must ONLY see Candidate 1's submission
  const subCandidateIds = dashboardData.submissions.map((s) => s.userId);
  assert.ok(subCandidateIds.includes(TEST_CAND_1_ID), "Evaluator Alpha must see assigned Candidate 1");
  assert.ok(!subCandidateIds.includes(TEST_CAND_2_ID), "Evaluator Alpha must NOT see unassigned Candidate 2");
  assert.equal(dashboardData.submissions.length, 1);
});

test("4. Strict access control: Evaluator Beta only sees Contest 1 and Candidate 2's submission", async () => {
  setTestSession({
    userId: TEST_EVAL_B_ID,
    email: "eval.b.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Beta",
  });

  const dashboardData = await getEvaluatorDashboardDataAction();

  // Evaluator Beta must see Contest 1 and NOT Contest 2
  const contestIds = dashboardData.assignedContests.map((c) => c.id);
  assert.ok(contestIds.includes(TEST_CONTEST_1_ID));
  assert.ok(!contestIds.includes(TEST_CONTEST_2_ID));

  // Evaluator Beta must ONLY see Candidate 2's submission
  const subCandidateIds = dashboardData.submissions.map((s) => s.userId);
  assert.ok(subCandidateIds.includes(TEST_CAND_2_ID), "Evaluator Beta must see assigned Candidate 2");
  assert.ok(!subCandidateIds.includes(TEST_CAND_1_ID), "Evaluator Beta must NOT see unassigned Candidate 1");
  assert.equal(dashboardData.submissions.length, 1);
});

test("5. Evaluator Gamma (unassigned) sees 0 contests and 0 submissions", async () => {
  setTestSession({
    userId: TEST_EVAL_C_ID,
    email: "eval.c.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Gamma (Unassigned)",
  });

  const dashboardData = await getEvaluatorDashboardDataAction();
  assert.equal(dashboardData.activeContestsCount, 0);
  assert.equal(dashboardData.assignedContests.length, 0);
  assert.equal(dashboardData.submissions.length, 0);

  // Calling getSubmissionsForGrading directly also returns empty
  const directSubs = await getSubmissionsForGrading();
  assert.equal(directSubs.length, 0);
});

test("6. Cross-evaluator grading authorization enforcement", async () => {
  // Evaluator Alpha attempts to grade Candidate 2 -> MUST BE REJECTED
  setTestSession({
    userId: TEST_EVAL_A_ID,
    email: "eval.a.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Alpha",
  });

  const gradeAttemptWrong = await gradeSubmissionAction({
    submissionId: cand2SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 40 }],
  });
  assert.equal(gradeAttemptWrong.success, false);
  assert.match(gradeAttemptWrong.error || "", /Unauthorized|not assigned/i);

  // Evaluator Alpha grades Candidate 1 -> MUST SUCCEED
  const gradeAttemptRight = await gradeSubmissionAction({
    submissionId: cand1SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 45 }],
  });
  assert.equal(gradeAttemptRight.success, true);
  assert.equal(gradeAttemptRight.finalScore, 45);

  // Evaluator Beta attempts to grade Candidate 1 -> MUST BE REJECTED
  setTestSession({
    userId: TEST_EVAL_B_ID,
    email: "eval.b.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Beta",
  });

  const gradeAttemptBetaWrong = await gradeSubmissionAction({
    submissionId: cand1SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 42 }],
  });
  assert.equal(gradeAttemptBetaWrong.success, false);
  assert.match(gradeAttemptBetaWrong.error || "", /Unauthorized|not assigned/i);

  // Evaluator Beta grades Candidate 2 -> MUST SUCCEED
  const gradeAttemptBetaRight = await gradeSubmissionAction({
    submissionId: cand2SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 48 }],
  });
  assert.equal(gradeAttemptBetaRight.success, true);
  assert.equal(gradeAttemptBetaRight.finalScore, 48);
});

test("7. Direct PDF / File download authorization enforcement", async () => {
  // Evaluator Alpha attempts to access Candidate 2's PDF file -> MUST BE FORBIDDEN
  setTestSession({
    userId: TEST_EVAL_A_ID,
    email: "eval.a.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Alpha",
  });

  const fileResForbiddenA = await getFileDownloadUrlAction(cand2FileKey);
  assert.equal(fileResForbiddenA.success, false);
  assert.match(fileResForbiddenA.error || "", /Forbidden|not assigned/i);

  // Evaluator Alpha accesses Candidate 1's PDF file -> MUST SUCCEED
  const fileResAllowedA = await getFileDownloadUrlAction(cand1FileKey);
  assert.equal(fileResAllowedA.success, true);
  assert.ok(fileResAllowedA.downloadUrl);

  // Evaluator Beta attempts to access Candidate 1's PDF file -> MUST BE FORBIDDEN
  setTestSession({
    userId: TEST_EVAL_B_ID,
    email: "eval.b.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Beta",
  });

  const fileResForbiddenB = await getFileDownloadUrlAction(cand1FileKey);
  assert.equal(fileResForbiddenB.success, false);
  assert.match(fileResForbiddenB.error || "", /Forbidden|not assigned/i);

  // Evaluator Beta accesses Candidate 2's PDF file -> MUST SUCCEED
  const fileResAllowedB = await getFileDownloadUrlAction(cand2FileKey);
  assert.equal(fileResAllowedB.success, true);
  assert.ok(fileResAllowedB.downloadUrl);

  // Evaluator Gamma (unassigned) attempts to access either file -> MUST BE FORBIDDEN
  setTestSession({
    userId: TEST_EVAL_C_ID,
    email: "eval.c.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Gamma (Unassigned)",
  });

  const fileResGamma = await getFileDownloadUrlAction(cand1FileKey);
  assert.equal(fileResGamma.success, false);

  // Admin accesses any file -> MUST SUCCEED
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  const fileResAdmin1 = await getFileDownloadUrlAction(cand1FileKey);
  assert.equal(fileResAdmin1.success, true);
  const fileResAdmin2 = await getFileDownloadUrlAction(cand2FileKey);
  assert.equal(fileResAdmin2.success, true);
});

test("8. Admin reassignment of candidate between evaluators", async () => {
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  // Reassign Candidate 1 from Evaluator Alpha to Evaluator Beta
  const reassignRes = await allocateCandidatesToEvaluatorAction({
    contestId: TEST_CONTEST_1_ID,
    evaluatorId: TEST_EVAL_B_ID,
    participantIds: [TEST_CAND_1_ID],
    reassign: true,
  });
  assert.equal(reassignRes.success, true);

  // Verify Evaluator Alpha can NO LONGER see or grade Candidate 1
  setTestSession({
    userId: TEST_EVAL_A_ID,
    email: "eval.a.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Alpha",
  });

  const evalASubs = await getSubmissionsForGrading();
  assert.equal(evalASubs.length, 0, "Evaluator Alpha should have 0 submissions after Candidate 1 reassignment");

  const evalAGradeAttempt = await gradeSubmissionAction({
    submissionId: cand1SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 44 }],
  });
  assert.equal(evalAGradeAttempt.success, false);

  // Verify Evaluator Beta CAN now see both Candidate 1 and Candidate 2
  setTestSession({
    userId: TEST_EVAL_B_ID,
    email: "eval.b.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Beta",
  });

  const evalBSubs = await getSubmissionsForGrading();
  assert.equal(evalBSubs.length, 2, "Evaluator Beta should now have 2 assigned submissions");

  // Evaluator Beta can now grade Candidate 1
  const evalBGradeAttempt = await gradeSubmissionAction({
    submissionId: cand1SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 49 }],
  });
  assert.equal(evalBGradeAttempt.success, true);
});

test("9. Evaluator removal from contest cascades and revokes access", async () => {
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  // Remove Evaluator Beta from Contest 1
  const removeRes = await removeEvaluatorFromContestAction(TEST_CONTEST_1_ID, TEST_EVAL_B_ID);
  assert.equal(removeRes.success, true);

  // Evaluator Beta now has 0 assigned contests and 0 submissions
  setTestSession({
    userId: TEST_EVAL_B_ID,
    email: "eval.b.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Beta",
  });

  const evalBDash = await getEvaluatorDashboardDataAction();
  assert.equal(evalBDash.activeContestsCount, 0);
  assert.equal(evalBDash.submissions.length, 0);
});

test("10. Admin access remains unrestricted across all contests and candidates", async () => {
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  // Admin options returns all contests
  const options = await getAdminContestOptions();
  assert.ok(options.length >= 2);

  // Admin can view all candidate allocations
  const overview = await getContestCandidateAllocationsAction(TEST_CONTEST_1_ID);
  assert.ok(overview);
  assert.equal(overview.totalEnrolledCandidates, 2);

  // Admin can grade any submission
  const adminGrade = await gradeSubmissionAction({
    submissionId: cand1SubId,
    questionGrades: [{ questionId: "55555555-0000-4000-8000-000000000001", score: 50 }],
  });
  assert.equal(adminGrade.success, true);
  assert.equal(adminGrade.finalScore, 50);
});

test("11. Bulk evaluator assignment (batchAssignEvaluatorsToContestAction) multi-select and uniqueness", async () => {
  // A. Non-admin is rejected
  setTestSession({
    userId: TEST_EVAL_A_ID,
    email: "eval.a.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Alpha",
  });

  const nonAdminRes = await batchAssignEvaluatorsToContestAction(TEST_CONTEST_1_ID, [TEST_EVAL_B_ID, TEST_EVAL_C_ID]);
  assert.equal(nonAdminRes.success, false);
  assert.match(nonAdminRes.error || "", /Forbidden/);

  // B. Admin session
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });

  // Empty selection fails safely
  const emptyRes = await batchAssignEvaluatorsToContestAction(TEST_CONTEST_1_ID, []);
  assert.equal(emptyRes.success, false);
  assert.match(emptyRes.error || "", /No evaluators/);

  // Batch assign Evaluator B and Evaluator C to Contest 1
  const batchRes = await batchAssignEvaluatorsToContestAction(TEST_CONTEST_1_ID, [TEST_EVAL_B_ID, TEST_EVAL_C_ID]);
  assert.equal(batchRes.success, true);
  assert.equal(batchRes.count, 2);

  // Verify in database: Evaluator B and Evaluator C are assigned
  const contestEvaluators = await prisma.contestEvaluator.findMany({
    where: { contestId: TEST_CONTEST_1_ID },
  });
  const assignedIds = contestEvaluators.map((ce) => ce.userId);
  assert.ok(assignedIds.includes(TEST_EVAL_B_ID));
  assert.ok(assignedIds.includes(TEST_EVAL_C_ID));

  // C. Uniqueness check: repeating the batch assignment does not duplicate ContestEvaluator records
  const repeatBatchRes = await batchAssignEvaluatorsToContestAction(TEST_CONTEST_1_ID, [TEST_EVAL_B_ID, TEST_EVAL_C_ID]);
  assert.equal(repeatBatchRes.success, true);
  assert.equal(repeatBatchRes.count, 2);

  const contestEvaluatorsAfter = await prisma.contestEvaluator.findMany({
    where: { contestId: TEST_CONTEST_1_ID },
  });
  // Must still have exactly the unique count of evaluators (no duplicate rows)
  assert.equal(contestEvaluatorsAfter.length, contestEvaluators.length);

  // D. Evaluator C now has access to the contest in their dashboard
  setTestSession({
    userId: TEST_EVAL_C_ID,
    email: "eval.c.test@example.com",
    role: "EVALUATOR",
    name: "Evaluator Charlie",
  });
  const evalCDash = await getEvaluatorDashboardDataAction();
  assert.equal(evalCDash.activeContestsCount, 1);
  const evalCContestIds = evalCDash.assignedContests.map((c) => c.id);
  assert.ok(evalCContestIds.includes(TEST_CONTEST_1_ID));

  // Reset to Admin session
  setTestSession({
    userId: TEST_ADMIN_ID,
    email: "admin.alloc.test@example.com",
    role: "ADMIN",
    name: "Admin Alloc Tester",
  });
});

